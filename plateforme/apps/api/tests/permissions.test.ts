import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { api, createClient, createMember, createTestOrg, sampleLines, testApp, type Session, type TestOrg } from "./helpers.ts";

let app: FastifyInstance;
let org: TestOrg;
let employee: Session;
let otherEmployee: Session;
let hr: Session;
let director: Session;
let supervisor: Session;

beforeAll(async () => {
  app = await testApp();
  org = await createTestOrg(app, "perm");
  employee = await createMember(app, org, "EMPLOYEE", "Emma");
  otherEmployee = await createMember(app, org, "EMPLOYEE", "Omar");
  hr = await createMember(app, org, "HR", "Hélène");
  director = await createMember(app, org, "DIRECTOR", "Didier");
  supervisor = await createMember(app, org, "SUPERVISOR", "Sofia");
});
afterAll(async () => app.close());

describe("un employé ne peut pas", () => {
  it("créer un compte", async () => {
    const res = await api(app, employee.token).post("/v1/users", { firstName: "X", lastName: "Y", role: "EMPLOYEE" });
    expect(res.statusCode).toBe(403);
  });

  it("modifier le compte d'un autre utilisateur", async () => {
    expect((await api(app, employee.token).patch(`/v1/users/${otherEmployee.userId}`, { firstName: "Piraté" })).statusCode).toBe(403);
    expect((await api(app, employee.token).post(`/v1/users/${otherEmployee.userId}/deactivate`)).statusCode).toBe(403);
  });

  it("accéder aux données RH ou aux comptes", async () => {
    expect((await api(app, employee.token).get("/v1/users")).statusCode).toBe(403);
    expect((await api(app, employee.token).get(`/v1/users/${otherEmployee.userId}`)).statusCode).toBe(403);
    expect((await api(app, employee.token).get("/v1/activity")).statusCode).toBe(403);
  });

  it("accéder aux clients, devis, factures et réglages de l'entreprise", async () => {
    for (const url of ["/v1/clients", "/v1/quotes", "/v1/invoices", "/v1/catalog", "/v1/organization"]) {
      expect((await api(app, employee.token).get(url)).statusCode, url).toBe(403);
    }
  });

  it("modifier un planning ou voir les missions des autres", async () => {
    const res = await api(app, employee.token).post("/v1/missions", {
      title: "Mission pirate",
      date: "2026-11-02",
      startTime: "08:00",
      endTime: "10:00",
      assigneeIds: [employee.userId],
    });
    expect(res.statusCode).toBe(403);

    const mission = (
      await api(app, supervisor.token).post("/v1/missions", {
        title: "Bureaux Opéra",
        date: "2026-11-02",
        startTime: "08:00",
        endTime: "10:00",
        assigneeIds: [otherEmployee.userId],
      })
    ).json();
    expect((await api(app, employee.token).get(`/v1/missions/${mission.id}`)).statusCode).toBe(404);
    const planning = await api(app, employee.token).get(`/v1/missions?from=2026-11-01&to=2026-11-07&userId=${otherEmployee.userId}`);
    expect(planning.statusCode).toBe(200);
    expect(planning.json()).toHaveLength(0);
    // Le suivi terrain (démarrer / terminer) n'est pas ouvert à l'employé.
    expect((await api(app, otherEmployee.token).post(`/v1/missions/${mission.id}/start`)).statusCode).toBe(403);
  });
});

describe("hiérarchie des rôles", () => {
  it("la RH crée des comptes mais n'attribue ni Direction ni Administrateur", async () => {
    expect((await api(app, hr.token).post("/v1/users", { firstName: "Léa", lastName: "Neuve", role: "EMPLOYEE" })).statusCode).toBe(201);
    expect((await api(app, hr.token).post("/v1/users", { firstName: "Max", lastName: "Chef", role: "DIRECTOR" })).statusCode).toBe(403);
    expect((await api(app, hr.token).post("/v1/users", { firstName: "Max", lastName: "Admin", role: "ADMIN" })).statusCode).toBe(403);
  });

  it("la direction gère les comptes existants mais n'en crée pas", async () => {
    expect((await api(app, director.token).post("/v1/users", { firstName: "X", lastName: "Y", role: "EMPLOYEE" })).statusCode).toBe(403);
    expect((await api(app, director.token).patch(`/v1/users/${employee.userId}`, { jobTitle: "Agent d'entretien" })).statusCode).toBe(200);
  });

  it("personne ne peut agir sur un compte de rang supérieur ni changer son propre rôle", async () => {
    expect((await api(app, hr.token).post(`/v1/users/${director.userId}/reset-access`)).statusCode).toBe(403);
    expect((await api(app, director.token).patch(`/v1/users/${director.userId}`, { role: "ADMIN" })).statusCode).toBe(403);
  });

  it("le superviseur fait des devis mais n'accède pas à la facturation", async () => {
    const client = await createClient(app, supervisor.token, "Cabinet Martin");
    expect((await api(app, supervisor.token).post("/v1/quotes", { clientId: client.id, lines: sampleLines })).statusCode).toBe(201);
    expect((await api(app, supervisor.token).get("/v1/invoices")).statusCode).toBe(403);
  });

  it("un changement de rôle s'applique sans attendre l'expiration du jeton", async () => {
    const promoted = await createMember(app, org, "EMPLOYEE", "Pierre");
    expect((await api(app, promoted.token).get("/v1/clients")).statusCode).toBe(403);
    expect((await api(app, org.admin.token).patch(`/v1/users/${promoted.userId}`, { role: "SUPERVISOR" })).statusCode).toBe(200);
    const stale = await api(app, promoted.token).get("/v1/clients");
    expect(stale.statusCode).toBe(401);
    expect(stale.json().error.code).toBe("TOKEN_STALE");
    const refreshed = await app.inject({ method: "POST", url: "/v1/auth/refresh", payload: { refreshToken: promoted.refreshToken } });
    expect((await api(app, refreshed.json().accessToken).get("/v1/clients")).statusCode).toBe(200);
  });
});
