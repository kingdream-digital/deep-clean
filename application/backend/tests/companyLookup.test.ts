import request from "supertest";
import { Role } from "@prisma/client";
import { createApp } from "../src/app";
import { prisma } from "../src/db/prisma";
import { createTestUser, resetDatabase, TEST_PASSWORD } from "./helpers";
import { clearCompanyLookupCache } from "../src/modules/clients/companyLookup.service";

const app = createApp();

// Réponse type de l'annuaire (recherche-entreprises.api.gouv.fr).
const DANONE = {
  siren: "552032534",
  nom_complet: "DANONE",
  nom_raison_sociale: "DANONE",
  etat_administratif: "A",
  siege: {
    siret: "55203253400703",
    adresse: "59-61 RUE LA FAYETTE 75009 PARIS",
    code_postal: "75009",
    libelle_commune: "PARIS",
    etat_administratif: "A",
    est_siege: true,
  },
  matching_etablissements: [
    { siret: "55203253400646", adresse: "17 BOULEVARD HAUSSMANN 75009 PARIS", code_postal: "75009", libelle_commune: "PARIS", est_siege: false, etat_administratif: "A" },
  ],
};

let fetchMock: jest.SpyInstance;

function annuaire(results: unknown[], status = 200) {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ results }), { status, headers: { "content-type": "application/json" } }));
}

beforeEach(async () => {
  await resetDatabase();
  clearCompanyLookupCache();
  fetchMock = jest.spyOn(global, "fetch");
});

afterEach(() => {
  fetchMock.mockRestore();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function tokenFor(role: Role, email: string) {
  const user = await createTestUser({ role, email });
  const res = await request(app).post("/api/v1/auth/login").send({ username: user.username, password: TEST_PASSWORD });
  return res.body.accessToken as string;
}

describe("Recherche d'une entreprise par SIRET / SIREN", () => {
  it("SIRET : renvoie l'établissement exact, adresse découpée en rue / code postal / ville", async () => {
    const token = await tokenFor(Role.SUPERVISOR, "sup-lookup@deepclean.test");
    annuaire([DANONE]);

    const res = await request(app).get("/api/v1/clients/lookup/552 032 534 00646").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.company).toEqual({
      companyName: "DANONE",
      siren: "552032534",
      siret: "55203253400646",
      address: "17 BOULEVARD HAUSSMANN",
      postalCode: "75009",
      city: "PARIS",
      active: true,
      isHeadOffice: false,
    });
    expect(String(fetchMock.mock.calls[0]![0])).toContain("q=55203253400646");
  });

  it("une entreprise déjà recherchée ressort sans rappeler l'annuaire", async () => {
    const token = await tokenFor(Role.HR, "rh-lookup-cache@deepclean.test");
    annuaire([DANONE]);
    const first = await request(app).get("/api/v1/clients/lookup/552032534").set("Authorization", `Bearer ${token}`);
    const second = await request(app).get("/api/v1/clients/lookup/552 032 534").set("Authorization", `Bearer ${token}`);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retire le sigle répété entre parenthèses, mais garde un vrai nom commercial", async () => {
    const token = await tokenFor(Role.HR, "rh-lookup-nom@deepclean.test");
    annuaire([{ ...DANONE, nom_complet: "DANONE (DANONE)" }]);
    expect((await request(app).get("/api/v1/clients/lookup/552032534").set("Authorization", `Bearer ${token}`)).body.company.companyName).toBe("DANONE");
    clearCompanyLookupCache();
    annuaire([{ ...DANONE, nom_complet: "JEAN DUPONT (NETTOYAGE PRO)" }]);
    expect((await request(app).get("/api/v1/clients/lookup/552032534").set("Authorization", `Bearer ${token}`)).body.company.companyName).toBe("JEAN DUPONT (NETTOYAGE PRO)");
  });

  it("SIREN : renvoie le siège social", async () => {
    const token = await tokenFor(Role.HR, "rh-lookup@deepclean.test");
    annuaire([DANONE]);

    const res = await request(app).get("/api/v1/clients/lookup/552032534").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.company.siret).toBe("55203253400703");
    expect(res.body.company.address).toBe("59-61 RUE LA FAYETTE");
    expect(res.body.company.isHeadOffice).toBe(true);
  });

  it("signale une entreprise cessée, et masque les données non diffusibles", async () => {
    const token = await tokenFor(Role.DIRECTOR, "dir-lookup@deepclean.test");
    annuaire([
      {
        siren: "123456789",
        nom_complet: "JEAN DUPONT",
        etat_administratif: "C",
        siege: { siret: "12345678900011", adresse: "[NON-DIFFUSIBLE]", code_postal: "[NON-DIFFUSIBLE]", libelle_commune: "LYON", est_siege: true, etat_administratif: "F" },
        matching_etablissements: [],
      },
    ]);

    const res = await request(app).get("/api/v1/clients/lookup/123456789").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.company.active).toBe(false);
    expect(res.body.company.address).toBeNull();
    expect(res.body.company.postalCode).toBeNull();
    expect(res.body.company.city).toBe("LYON");
  });

  it("refuse un numéro mal formé sans interroger l'annuaire", async () => {
    const token = await tokenFor(Role.HR, "rh-lookup2@deepclean.test");
    for (const bad of ["12345", "1234567890", "ABCDEFGHI"]) {
      const res = await request(app).get(`/api/v1/clients/lookup/${bad}`).set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("404 si l'annuaire ne renvoie que des entreprises proches mais pas celle-ci, ou un SIRET inconnu", async () => {
    const token = await tokenFor(Role.HR, "rh-lookup3@deepclean.test");
    annuaire([{ ...DANONE, siren: "552032999" }]);
    expect((await request(app).get("/api/v1/clients/lookup/552032534").set("Authorization", `Bearer ${token}`)).status).toBe(404);

    annuaire([DANONE]);
    expect((await request(app).get("/api/v1/clients/lookup/55203253499999").set("Authorization", `Bearer ${token}`)).status).toBe(404);
  });

  it("503 avec un message simple si l'annuaire est en panne", async () => {
    const token = await tokenFor(Role.HR, "rh-lookup4@deepclean.test");
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));
    const res = await request(app).get("/api/v1/clients/lookup/552032534").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(503);
    expect(res.body.error?.message ?? res.body.message).toContain("remplissez la fiche à la main");
  });

  it("interdit la recherche à un employé et à un chef d'équipe (pas d'accès au module commercial)", async () => {
    for (const [role, email] of [
      [Role.EMPLOYEE, "emp-lookup@deepclean.test"],
      [Role.SITE_MANAGER, "chef-lookup@deepclean.test"],
    ] as const) {
      const token = await tokenFor(role, email);
      const res = await request(app).get("/api/v1/clients/lookup/552032534").set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(403);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
