import type { FastifyInstance, InjectOptions } from "fastify";
import type { CreatedUserDto, Role } from "@aussitot/shared";
import { buildApp } from "../src/app.ts";
import { createOrganization } from "../src/modules/platform/platform.service.ts";

let counter = 0;

export async function testApp(): Promise<FastifyInstance> {
  const app = await buildApp();
  await app.ready();
  return app;
}

export const STRONG_PASSWORD = "Soleil-Vert-2026!";

export interface Session {
  token: string;
  refreshToken: string;
  userId: string;
  orgSlug: string;
}

/** Appel authentifié simplifié. */
export function api(app: FastifyInstance, token?: string) {
  const call = (method: InjectOptions["method"], url: string, payload?: unknown) =>
    app.inject({ method, url, payload: payload as InjectOptions["payload"], headers: token ? { authorization: `Bearer ${token}` } : {} });
  return {
    get: (url: string) => call("GET", url),
    post: (url: string, body?: unknown) => call("POST", url, body ?? {}),
    patch: (url: string, body?: unknown) => call("PATCH", url, body ?? {}),
    put: (url: string, body?: unknown) => call("PUT", url, body ?? {}),
    delete: (url: string, body?: unknown) => call("DELETE", url, body),
  };
}

export async function login(app: FastifyInstance, organization: string, identifier: string, password: string): Promise<Session> {
  const res = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { organization, identifier, password } });
  if (res.statusCode !== 200) throw new Error(`Connexion impossible (${res.statusCode}) : ${res.body}`);
  const body = res.json();
  return { token: body.accessToken, refreshToken: body.refreshToken, userId: body.user.id, orgSlug: organization };
}

/** Connexion + remplacement du mot de passe temporaire (premier accès). */
export async function activate(
  app: FastifyInstance,
  organization: string,
  identifier: string,
  temporaryPassword: string,
): Promise<Session> {
  const first = await login(app, organization, identifier, temporaryPassword);
  const res = await api(app, first.token).post("/v1/auth/change-password", {
    currentPassword: temporaryPassword,
    newPassword: STRONG_PASSWORD,
  });
  if (res.statusCode !== 200) throw new Error(`Changement de mot de passe impossible : ${res.body}`);
  return first;
}

export interface TestOrg {
  slug: string;
  orgId: string;
  admin: Session;
}

/** Entreprise de test complète, avec réglages légaux renseignés (factures émissibles). */
export async function createTestOrg(app: FastifyInstance, prefix = "org"): Promise<TestOrg> {
  counter += 1;
  const slug = `${prefix}-${Date.now().toString(36)}-${counter}`;
  const created = await createOrganization({
    slug,
    name: `Entreprise ${counter}`,
    admin: { firstName: "Alice", lastName: `Admin${counter}` },
  });
  const admin = await activate(app, slug, created.admin.user.username, created.admin.temporaryPassword);
  const settings = {
    name: `Entreprise ${counter}`,
    legalName: `Entreprise ${counter} SAS`,
    legalForm: "SAS",
    shareCapital: "10 000 €",
    siren: "732829320",
    siret: "73282932000074",
    vatNumber: "FR44732829320",
    rcs: "RCS Paris 732 829 320",
    addressLine1: "12 rue de la Paix",
    postalCode: "75002",
    city: "Paris",
    country: "FR",
    email: "contact@entreprise.test",
    phone: "01 23 45 67 89",
    iban: "FR7630006000011234567890189",
    bic: "AGRIFRPP",
    vatRegime: "NORMAL",
    defaultVatRateBps: 2000,
    paymentTermsDays: 30,
    quoteValidityDays: 30,
    timezone: "Europe/Paris",
    quotePrefix: "D",
    invoicePrefix: "F",
    creditNotePrefix: "AV",
  };
  const res = await api(app, admin.token).put("/v1/organization", settings);
  if (res.statusCode !== 200) throw new Error(`Réglages impossibles : ${res.body}`);
  return { slug, orgId: created.organization.id, admin };
}

/** Crée un compte d'un rôle donné (par l'administrateur) et l'active. */
export async function createMember(
  app: FastifyInstance,
  org: TestOrg,
  role: Role,
  firstName = "Membre",
): Promise<Session & { username: string }> {
  counter += 1;
  const res = await api(app, org.admin.token).post("/v1/users", { firstName, lastName: `${role}${counter}`, role });
  if (res.statusCode !== 201) throw new Error(`Création de compte impossible : ${res.body}`);
  const created = res.json() as CreatedUserDto;
  const session = await activate(app, org.slug, created.user.username, created.temporaryPassword);
  return { ...session, username: created.user.username };
}

export async function createClient(app: FastifyInstance, token: string, name = "Boulangerie Dupont", extra: Record<string, unknown> = {}) {
  const res = await api(app, token).post("/v1/clients", {
    name,
    email: "contact@dupont.test",
    addressLine1: "3 place du Marché",
    postalCode: "69001",
    city: "Lyon",
    ...extra,
  });
  if (res.statusCode !== 201) throw new Error(`Création de client impossible : ${res.body}`);
  return res.json() as { id: string; name: string };
}

export const sampleLines = [
  { description: "Nettoyage des vitres", quantity: 3, unit: "HOUR", unitPriceCents: 3500, vatRateBps: 2000 },
  { description: "Désinfection cuisine", quantity: 1, unit: "FLAT", unitPriceCents: 12000, vatRateBps: 2000 },
];
