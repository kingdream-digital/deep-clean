import request from "supertest";
import ExcelJS from "exceljs";
import { AbsenceStatus, AbsenceType, Role, TimeEntryStatus } from "@prisma/client";
import { createApp } from "../src/app";
import { prisma } from "../src/db/prisma";
import { isAllowedForAccountant } from "../src/middleware/accountantScope";
import { createTestUser, resetDatabase, TEST_PASSWORD } from "./helpers";

const app = createApp();
const TINY_PDF = Buffer.from("%PDF-1.4\n%%EOF");

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function login(username: string) {
  return (await request(app).post("/api/v1/auth/login").send({ username, password: TEST_PASSWORD })).body.accessToken as string;
}

// Un salarié avec un pointage validé (lundi 2 mars 2026, 6 h–10 h) et un
// arrêt maladie validé du 9 au 11 mars.
async function setup() {
  const accountant = await createTestUser({ role: Role.ACCOUNTANT, email: "compta@cabinet.test" });
  const hr = await createTestUser({ role: Role.HR, email: "rh-compta@deepclean.test" });
  const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-compta@deepclean.test" });
  const entry = await prisma.timeEntry.create({
    data: { userId: employee.id, clockIn: new Date("2026-03-02T05:00:00Z"), clockOut: new Date("2026-03-02T09:00:00Z"), status: TimeEntryStatus.VALIDATED },
  });
  const absence = await prisma.absence.create({
    data: { userId: employee.id, type: AbsenceType.SICK_LEAVE, startDate: new Date("2026-03-09T00:00:00Z"), endDate: new Date("2026-03-11T00:00:00Z"), status: AbsenceStatus.APPROVED },
  });
  const token = await login(accountant.username);
  return { accountant, hr, employee, entry, absence, auth: { Authorization: `Bearer ${token}` } };
}

describe("Compte comptable : consultation pour la paie", () => {
  it("la RH crée un compte comptable", async () => {
    const hr = await createTestUser({ role: Role.HR, email: "rh-cree-compta@deepclean.test" });
    const res = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${await login(hr.username)}`)
      .send({ firstName: "Cabinet", lastName: "Martin", email: "paie@cabinet-martin.test", role: "ACCOUNTANT" });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe("ACCOUNTANT");
  });

  it("consulte heures, récapitulatif de paie, exports, absences, congés et dossier de chaque salarié", async () => {
    const { employee, entry, absence, auth } = await setup();

    const entries = await request(app).get("/api/v1/time-entries").set(auth);
    expect(entries.status).toBe(200);
    expect(entries.body.items.map((e: { id: string }) => e.id)).toContain(entry.id);
    expect((await request(app).get(`/api/v1/time-entries/${entry.id}`).set(auth)).status).toBe(200);

    const pay = await request(app).get(`/api/v1/time-entries/pay-summary?userId=${employee.id}&month=2026-03`).set(auth);
    expect(pay.status).toBe(200);
    expect(pay.body.summary.totals.countedMinutes).toBe(240);

    const xlsx = await request(app).get("/api/v1/time-entries/export.xlsx?from=2026-03-01&to=2026-03-31").set(auth);
    expect(xlsx.status).toBe(200);

    const absences = await request(app).get("/api/v1/absences").set(auth);
    expect(absences.body.items.map((a: { id: string }) => a.id)).toContain(absence.id);
    expect((await request(app).get(`/api/v1/absences/${absence.id}`).set(auth)).status).toBe(200);

    expect((await request(app).get(`/api/v1/leave/${employee.id}/balance`).set(auth)).status).toBe(200);
    expect((await request(app).get(`/api/v1/users/${employee.id}/dossier`).set(auth)).status).toBe(200);
  });

  it("consulte et dépose les documents d'un salarié (bulletin de paie), sans pouvoir les supprimer", async () => {
    const { employee, auth } = await setup();
    const up = await request(app)
      .post("/api/v1/documents")
      .set(auth)
      .field("targetUserId", employee.id)
      .field("title", "Bulletin de paie mars 2026")
      .attach("document", TINY_PDF, { filename: "bulletin.pdf", contentType: "application/pdf" });
    expect(up.status).toBe(201);
    const docId = up.body.document.id as string;

    const list = await request(app).get(`/api/v1/documents/user/${employee.id}`).set(auth);
    expect(list.body.items.map((d: { id: string }) => d.id)).toContain(docId);
    expect((await request(app).get(`/api/v1/documents/${docId}/file`).set(auth)).status).toBe(200);
    expect((await request(app).delete(`/api/v1/documents/${docId}`).set(auth)).status).toBe(403);
  });

  it("vue d'ensemble du mois et dossier de paie Excel", async () => {
    const { employee, auth } = await setup();
    const overview = await request(app).get("/api/v1/accounting/overview?month=2026-03").set(auth);
    expect(overview.status).toBe(200);
    expect(overview.body.overview).toMatchObject({ staffCount: 2, validatedHours: 4, pendingEntries: 0, absenceCount: 1 });
    expect(overview.body.overview.absenceDaysByType).toEqual([{ type: "SICK_LEAVE", label: "Arrêt maladie", days: 3 }]);

    const pack = await request(app).get("/api/v1/accounting/payroll-pack.xlsx?month=2026-03").set(auth).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(pack.status).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(pack.body as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Synthèse paie", "Congés", "Absences", "À lire"]);
    const synth = wb.getWorksheet("Synthèse paie")!;
    const row = synth.getRows(2, synth.rowCount - 1)!.find((r) => r.getCell("A").value === "User" && r.getCell("C").value === "Employé")!;
    expect(row.getCell("F").value).toBe(4);
    expect(row.getCell("Q").value).toBe(3);
    expect(employee.id).toBeTruthy();
  });

  it("refuse tout le reste : planning, chantiers, messagerie, validation, décisions, factures en écriture, comptes, photos", async () => {
    const { employee, entry, absence, auth } = await setup();
    const forbidden: [string, string, object?][] = [
      ["get", "/api/v1/missions"],
      ["post", "/api/v1/missions", { siteId: "00000000-0000-0000-0000-000000000000" }],
      ["get", "/api/v1/sites"],
      ["get", "/api/v1/messages/contacts"],
      ["get", "/api/v1/announcements"],
      ["get", "/api/v1/stats/overview"],
      ["get", "/api/v1/quotes"],
      ["get", "/api/v1/activity-logs"],
      ["post", `/api/v1/time-entries/${entry.id}/validate`, {}],
      ["get", `/api/v1/time-entries/${entry.id}/clock-in-photo`],
      ["post", "/api/v1/time-entries/clock-in", {}],
      ["post", `/api/v1/absences/${absence.id}/decide`, { decision: "REJECTED" }],
      ["post", "/api/v1/absences", { type: "PAID_LEAVE", startDate: "2026-05-04", endDate: "2026-05-05" }],
      ["post", "/api/v1/invoices", {}],
      ["post", "/api/v1/users", { firstName: "A", lastName: "B", role: "EMPLOYEE" }],
      ["patch", `/api/v1/users/${employee.id}`, { firstName: "Pirate" }],
      ["post", `/api/v1/leave/${employee.id}/adjustments`, { days: 10, reason: "x" }],
    ];
    for (const [method, url, body] of forbidden) {
      const req = (request(app) as unknown as Record<string, (u: string) => request.Test>)[method]!(url).set(auth);
      const res = body ? await req.send(body) : await req;
      expect([url, res.status]).toEqual([url, 403]);
    }
  });

  it("n'apparaît pas dans les contacts de la messagerie et ne peut pas être affecté à une mission", async () => {
    const { accountant } = await setup();
    const emp = await createTestUser({ role: Role.EMPLOYEE, email: "emp-contacts@deepclean.test" });
    const contacts = await request(app).get("/api/v1/messages/contacts").set("Authorization", `Bearer ${await login(emp.username)}`);
    expect(contacts.status).toBe(200);
    expect(JSON.stringify(contacts.body)).not.toContain(accountant.id);

    const sup = await createTestUser({ role: Role.SUPERVISOR, email: "sup-compta@deepclean.test" });
    const supAuth = { Authorization: `Bearer ${await login(sup.username)}` };
    const site = await request(app).post("/api/v1/sites").set(supAuth).send({ name: "Bureaux", address: "1 rue A" });
    const mission = await request(app)
      .post("/api/v1/missions")
      .set(supAuth)
      .send({ siteId: site.body.site.id, title: "Ménage", date: "2027-02-02", startTime: "07:00", endTime: "09:00", assigneeIds: [accountant.id] });
    expect(mission.status).toBe(400);
    expect(mission.body.error.message).toContain("Seuls les membres des équipes");
  });

  it("un employé n'a pas accès à l'espace comptable", async () => {
    const emp = await createTestUser({ role: Role.EMPLOYEE, email: "emp-pas-compta@deepclean.test" });
    const res = await request(app).get("/api/v1/accounting/overview?month=2026-03").set("Authorization", `Bearer ${await login(emp.username)}`);
    expect(res.status).toBe(403);
  });

  it("liste blanche : chemins piégés refusés", () => {
    expect(isAllowedForAccountant("GET", "/api/v1/users/../missions")).toBe(false);
    expect(isAllowedForAccountant("GET", "/api/v1/invoices/abc/pdf")).toBe(false);
    expect(isAllowedForAccountant("DELETE", "/api/v1/documents/0b1c2d3e-0000-4000-8000-000000000000")).toBe(false);
    expect(isAllowedForAccountant("GET", "/api/v1/time-entries/pay-summary?month=2026-03")).toBe(true);
  });
});
