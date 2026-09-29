import request from "supertest";
import { Role } from "@prisma/client";
import { createApp } from "../src/app";
import { prisma } from "../src/db/prisma";
import { createTestUser, resetDatabase, TEST_PASSWORD } from "./helpers";

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

// Seule la signature (%PDF-) est vérifiée par storePdfDocument, jamais la
// structure complète du fichier — un buffer minimal suffit pour les tests.
const TINY_PDF = Buffer.from("%PDF-1.4\n%%EOF");

describe("Espace documents employé", () => {
  it("permet à la RH de déposer un document dans l'espace d'un employé", async () => {
    const { accessToken: hrToken } = await loginAs(Role.HR, "hr-doc1@deepclean.test");
    const { user: employee } = await loginAs(Role.EMPLOYEE, "emp-doc1@deepclean.test");

    const res = await request(app)
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${hrToken}`)
      .field("targetUserId", employee.id)
      .field("title", "Contrat de travail")
      .attach("document", TINY_PDF, { filename: "contrat.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(201);
    expect(res.body.document.title).toBe("Contrat de travail");
    expect(res.body.document.fileName).toBe("contrat.pdf");
  });

  it("refuse à un employé de déposer un document", async () => {
    const { accessToken: empToken, user: employee } = await loginAs(Role.EMPLOYEE, "emp-doc2@deepclean.test");

    const res = await request(app)
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${empToken}`)
      .field("targetUserId", employee.id)
      .field("title", "Contrat de travail")
      .attach("document", TINY_PDF, { filename: "contrat.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(403);
  });

  it("permet à l'employé de consulter et télécharger ses propres documents", async () => {
    const { accessToken: hrToken } = await loginAs(Role.HR, "hr-doc3@deepclean.test");
    const { accessToken: empToken, user: employee } = await loginAs(Role.EMPLOYEE, "emp-doc3@deepclean.test");

    const created = await request(app)
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${hrToken}`)
      .field("targetUserId", employee.id)
      .field("title", "Contrat de travail")
      .attach("document", TINY_PDF, { filename: "contrat.pdf", contentType: "application/pdf" });

    const list = await request(app).get("/api/v1/documents/me").set("Authorization", `Bearer ${empToken}`);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].title).toBe("Contrat de travail");

    const file = await request(app)
      .get(`/api/v1/documents/${created.body.document.id}/file`)
      .set("Authorization", `Bearer ${empToken}`);
    expect(file.status).toBe(200);
    expect(file.headers["content-type"]).toContain("application/pdf");
  });

  it("empêche un employé de consulter les documents d'un autre employé", async () => {
    const { accessToken: hrToken } = await loginAs(Role.HR, "hr-doc4@deepclean.test");
    const { user: employeeA } = await loginAs(Role.EMPLOYEE, "emp-doc4a@deepclean.test");
    const { accessToken: employeeBToken } = await loginAs(Role.EMPLOYEE, "emp-doc4b@deepclean.test");

    const created = await request(app)
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${hrToken}`)
      .field("targetUserId", employeeA.id)
      .field("title", "Contrat de travail")
      .attach("document", TINY_PDF, { filename: "contrat.pdf", contentType: "application/pdf" });

    const list = await request(app)
      .get(`/api/v1/documents/user/${employeeA.id}`)
      .set("Authorization", `Bearer ${employeeBToken}`);
    expect(list.status).toBe(403);

    const file = await request(app)
      .get(`/api/v1/documents/${created.body.document.id}/file`)
      .set("Authorization", `Bearer ${employeeBToken}`);
    expect(file.status).toBe(403);
  });

  it("permet à la RH de consulter et supprimer le document d'un employé", async () => {
    const { accessToken: hrToken } = await loginAs(Role.HR, "hr-doc5@deepclean.test");
    const { user: employee } = await loginAs(Role.EMPLOYEE, "emp-doc5@deepclean.test");

    const created = await request(app)
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${hrToken}`)
      .field("targetUserId", employee.id)
      .field("title", "Contrat de travail")
      .attach("document", TINY_PDF, { filename: "contrat.pdf", contentType: "application/pdf" });

    const list = await request(app)
      .get(`/api/v1/documents/user/${employee.id}`)
      .set("Authorization", `Bearer ${hrToken}`);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);

    const del = await request(app)
      .delete(`/api/v1/documents/${created.body.document.id}`)
      .set("Authorization", `Bearer ${hrToken}`);
    expect(del.status).toBe(204);

    const listAfter = await request(app)
      .get(`/api/v1/documents/user/${employee.id}`)
      .set("Authorization", `Bearer ${hrToken}`);
    expect(listAfter.body.items).toHaveLength(0);
  });
});
