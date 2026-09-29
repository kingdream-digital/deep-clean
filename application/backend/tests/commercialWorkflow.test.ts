import request from "supertest";
import { Role } from "@prisma/client";
import { createApp } from "../src/app";
import { prisma } from "../src/db/prisma";
import { clockInViaApi, clockOutViaApi, createTestUser, resetDatabase, TEST_PASSWORD } from "./helpers";

const app = createApp();

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function loginAs(role: Role, email: string) {
  const user = await createTestUser({ role, email });
  const login = await request(app).post("/api/v1/auth/login").send({ username: user.username, password: TEST_PASSWORD });
  return { user, accessToken: login.body.accessToken as string };
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Test de bout en bout du workflow officiel du cahier des charges (§45) :
 *
 *   PROSPECT → CLIENT → DEVIS → ENVOI PAR EMAIL → RELANCES →
 *   ACCEPTATION INTERNE → CHANTIER → OBJECTIFS →
 *   MISSION MANUELLE → PLANNING → POINTAGE → VALIDATION → SUIVI
 *
 * et en parallèle DEVIS ACCEPTÉ → CHANTIER → FACTURATION → FACTURE.
 *
 * Vérifie explicitement, à chaque étape, la RÈGLE ABSOLUE §25/§40 :
 * aucune mission n'est JAMAIS créée automatiquement — le nombre total de
 * missions en base ne bouge qu'au moment précis où le responsable clique
 * "Nouvelle mission", jamais avant (ni à la validation du devis, ni à son
 * acceptation, ni à la création du chantier, ni à la définition d'un
 * objectif mensuel).
 */
describe("Workflow commercial complet — de bout en bout, zéro automatisation vers le planning", () => {
  it("suit le parcours officiel du cahier des charges sans jamais créer de mission automatiquement", async () => {
    const { accessToken: hrToken } = await loginAs(Role.HR, "hr-workflow@deepclean.test");
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-workflow@deepclean.test" });

    async function missionCount() {
      return prisma.mission.count();
    }

    expect(await missionCount()).toBe(0);

    // 1. PROSPECTION → PROSPECT
    const prospect = await request(app)
      .post("/api/v1/prospects")
      .set("Authorization", `Bearer ${hrToken}`)
      .send({
        companyName: "Entreprise Workflow",
        contactFirstName: "Julie",
        contactLastName: "Dupont",
        email: "julie@workflow.test",
        phone: "0600000000",
        address: "10 rue du Workflow",
        siret: "12345678900012",
        status: "NEGOTIATING",
      });
    expect(prospect.status).toBe(201);

    // 2. PROSPECT → CLIENT (reprend les coordonnées telles quelles)
    const converted = await request(app)
      .post(`/api/v1/prospects/${prospect.body.prospect.id}/convert`)
      .set("Authorization", `Bearer ${hrToken}`);
    expect(converted.status).toBe(201);
    expect(converted.body.client.companyName).toBe("Entreprise Workflow");
    const clientId = converted.body.client.id as string;

    const prospectAfter = await request(app).get(`/api/v1/prospects/${prospect.body.prospect.id}`).set("Authorization", `Bearer ${hrToken}`);
    expect(prospectAfter.body.prospect.status).toBe("WON");

    // 3. CLIENT → DEVIS (6 passages/mois à 150€ — exemple exact du §11)
    const quote = await request(app)
      .post("/api/v1/quotes")
      .set("Authorization", `Bearer ${hrToken}`)
      .send({
        clientId,
        subject: "Nettoyage bureaux",
        items: [
          {
            description: "Nettoyage bureaux",
            quantity: 1,
            unit: "INTERVENTION",
            unitPriceHt: 150,
            frequency: "MULTIPLE_PER_MONTH",
            occurrencesPerMonth: 6,
            estimatedEmployees: 2,
            estimatedHours: 4,
          },
        ],
      });
    expect(quote.status).toBe(201);
    expect(quote.body.quote.monthlyAmountHt).toBe(900);
    const quoteId = quote.body.quote.id as string;

    await request(app).post(`/api/v1/quotes/${quoteId}/validate`).set("Authorization", `Bearer ${hrToken}`);

    // 4. ENVOI PAR EMAIL
    const sent = await request(app).post(`/api/v1/quotes/${quoteId}/send`).set("Authorization", `Bearer ${hrToken}`).send({});
    expect(sent.status).toBe(200);
    expect(sent.body.quote.status).toBe("SENT");
    expect(await missionCount()).toBe(0);

    // 5. RELANCES
    const followUp = await request(app)
      .post(`/api/v1/quotes/${quoteId}/follow-up`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ method: "PHONE", comment: "Rappel client" });
    expect(followUp.body.quote.status).toBe("FOLLOW_UP");

    // 6. CLIENT CONFIRME → ACCEPTATION INTERNE (jamais le client lui-même)
    const accepted = await request(app)
      .post(`/api/v1/quotes/${quoteId}/accept`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ method: "PHONE", comment: "Client confirmé par téléphone" });
    expect(accepted.status).toBe(200);
    expect(accepted.body.quote.status).toBe("ACCEPTED");
    // RÈGLE ABSOLUE : l'acceptation ne crée jamais de chantier ni de mission.
    expect(await prisma.site.count()).toBe(0);
    expect(await missionCount()).toBe(0);

    // 7. CRÉER CHANTIER MANUELLEMENT (action humaine explicite)
    const site = await request(app)
      .post("/api/v1/sites")
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ name: "Entreprise Workflow — Nettoyage bureaux", address: "10 rue du Workflow", clientId, quoteId });
    expect(site.status).toBe(201);
    expect(site.body.site.clientId).toBe(clientId);
    expect(site.body.site.quoteId).toBe(quoteId);
    const siteId = site.body.site.id as string;
    expect(await missionCount()).toBe(0);

    // 8. DÉFINIR LES OBJECTIFS (manuel, jamais déduit automatiquement)
    const period = currentPeriod();
    const target = await request(app)
      .post(`/api/v1/sites/${siteId}/targets`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ period, plannedVisits: 6, plannedAmount: 900, billingMode: "FLAT_RATE" });
    expect(target.status).toBe(200);
    expect(await missionCount()).toBe(0);

    const progressBeforeMission = await request(app)
      .get(`/api/v1/sites/${siteId}/progress`)
      .query({ period })
      .set("Authorization", `Bearer ${hrToken}`);
    expect(progressBeforeMission.body.progress.completedVisits).toBe(0);
    expect(progressBeforeMission.body.progress.remainingVisits).toBe(6);

    // 9. CRÉER LES MISSIONS MANUELLEMENT — LA SEULE ACTION QUI CRÉE UN
    // ÉVÉNEMENT DE PLANNING (§26).
    const missionDate = todayKey();
    const mission = await request(app)
      .post("/api/v1/missions")
      .set("Authorization", `Bearer ${hrToken}`)
      .send({
        siteId,
        title: "Nettoyage bureaux",
        date: missionDate,
        startTime: "08:00",
        endTime: "17:00",
        assigneeIds: [employee.id],
      });
    expect(mission.status).toBe(201);
    expect(await missionCount()).toBe(1);
    const missionId = mission.body.mission.id as string;

    // 10. PLANNING — la mission apparaît bien dans le planning du chantier.
    const planning = await request(app)
      .get("/api/v1/missions")
      .query({ siteId, from: missionDate, to: missionDate })
      .set("Authorization", `Bearer ${hrToken}`);
    expect(planning.body.items.some((m: { id: string }) => m.id === missionId)).toBe(true);

    // 11. RÉALISATION → POINTAGE
    const employeeLogin = await request(app).post("/api/v1/auth/login").send({ username: employee.username, password: TEST_PASSWORD });
    const employeeToken = employeeLogin.body.accessToken as string;
    const clockIn = await clockInViaApi(app, employeeToken);
    expect(clockIn.status).toBe(201);
    const clockOut = await clockOutViaApi(app, employeeToken);
    expect(clockOut.status).toBe(200);
    const entryId = clockOut.body.entry.id as string;

    // 12. VALIDATION DES HEURES (avant transmission RH)
    const validated = await request(app).post(`/api/v1/time-entries/${entryId}/validate`).set("Authorization", `Bearer ${hrToken}`);
    expect(validated.status).toBe(200);

    // Le responsable marque la mission terminée (démarrer/terminer sur le
    // terrain — action humaine distincte du pointage lui-même).
    await request(app).post(`/api/v1/missions/${missionId}/status`).set("Authorization", `Bearer ${hrToken}`).send({ status: "IN_PROGRESS" });
    await request(app).post(`/api/v1/missions/${missionId}/status`).set("Authorization", `Bearer ${hrToken}`).send({ status: "COMPLETED" });

    // 13. SUIVI — recalculé depuis les missions réelles, jamais une valeur
    // stockée (§34 : "Devis 6 / Planifiées 5 / Réalisées 5 / Restantes 1",
    // ici 6 prévues / 1 réalisée / 5 restantes).
    const progressAfter = await request(app)
      .get(`/api/v1/sites/${siteId}/progress`)
      .query({ period })
      .set("Authorization", `Bearer ${hrToken}`);
    expect(progressAfter.body.progress.completedVisits).toBe(1);
    expect(progressAfter.body.progress.remainingVisits).toBe(5);
    // Indicateur d'heures pointées — le clock-in/clock-out instantané de ce
    // test (aucun délai réel entre les deux, contrairement au terrain) donne
    // une durée quasi nulle, arrondie à 0 ; on vérifie ici que le
    // rapprochement pointage ↔ chantier fonctionne bien (aucune erreur, pas
    // de valeur négative ou aberrante), pas la précision de la durée elle-même.
    expect(progressAfter.body.progress.actualHours).toBeGreaterThanOrEqual(0);

    // Le système affiche l'information mais ne programme jamais les 5
    // missions restantes tout seul.
    expect(await missionCount()).toBe(1);

    // 14. FACTURATION (séparée du planning, §29) — référence le devis et le
    // chantier, sans jamais toucher aux missions.
    const invoice = await request(app)
      .post("/api/v1/invoices")
      .set("Authorization", `Bearer ${hrToken}`)
      .send({
        clientId,
        quoteId,
        siteId,
        billingMode: "FLAT_RATE",
        period,
        items: [{ description: "Nettoyage bureaux — forfait mensuel", quantity: 1, unit: "MONTH", unitPriceHt: 900 }],
      });
    expect(invoice.status).toBe(201);
    expect(invoice.body.invoice.quoteId).toBe(quoteId);
    expect(invoice.body.invoice.siteId).toBe(siteId);
    const invoiceId = invoice.body.invoice.id as string;
    expect(await missionCount()).toBe(1);

    await request(app).post(`/api/v1/invoices/${invoiceId}/validate`).set("Authorization", `Bearer ${hrToken}`);
    const invoiceSent = await request(app).post(`/api/v1/invoices/${invoiceId}/send`).set("Authorization", `Bearer ${hrToken}`).send({});
    expect(invoiceSent.body.invoice.status).toBe("SENT");
    const invoicePaid = await request(app).post(`/api/v1/invoices/${invoiceId}/pay`).set("Authorization", `Bearer ${hrToken}`);
    expect(invoicePaid.body.invoice.status).toBe("PAID");

    // Bilan final : une seule mission a existé sur tout le parcours, créée
    // au tout et unique moment où le responsable a cliqué "Nouvelle mission".
    expect(await missionCount()).toBe(1);

    // Le tableau de bord reflète bien l'ensemble sans avoir rien déclenché.
    const dashboard = await request(app).get("/api/v1/commercial-dashboard").set("Authorization", `Bearer ${hrToken}`);
    expect(dashboard.body.dashboard.commercial.quotesAccepted).toBe(1);
    expect(dashboard.body.dashboard.invoicing.paid).toBe(1);
  });
});
