#!/usr/bin/env node
/**
 * Prépare des entreprises et des comptes de test pour un essai de charge,
 * uniquement par l'API publique (exactement comme de vrais clients) :
 * entreprise créée par l'opérateur, administrateur, équipe créée par
 * l'administrateur, mots de passe temporaires remplacés, clients, devis et
 * missions de la semaine.
 *
 *   API_URL=https://api.recette.exemple.fr PLATFORM_ADMIN_TOKEN=… ORGS=10 USERS_PER_ORG=50 \
 *     node infra/load/preparer-comptes.mjs > comptes.json
 *
 * À lancer UNIQUEMENT sur un environnement de recette dédié. Sur cet
 * environnement, relevez LOGIN_IP_LIMIT_PER_15_MIN et RATE_LIMIT_PER_MINUTE
 * (tous les comptes sont activés depuis une seule adresse IP).
 */
import { randomBytes } from "node:crypto";

const API = (process.env.API_URL ?? "http://localhost:4000").replace(/\/$/, "");
const PLATFORM_TOKEN = process.env.PLATFORM_ADMIN_TOKEN;
const ORGS = Number(process.env.ORGS ?? 3);
const USERS_PER_ORG = Number(process.env.USERS_PER_ORG ?? 10);
const RUN = process.env.RUN_ID ?? Date.now().toString(36);
const PASSWORD = process.env.LOAD_PASSWORD ?? `Charge-${randomBytes(9).toString("base64url")}-26`;
if (!PLATFORM_TOKEN) {
  console.error("PLATFORM_ADMIN_TOKEN est requis (jeton opérateur de l'environnement de recette).");
  process.exit(1);
}

const FIRST = [
  "Camille",
  "Léa",
  "Hugo",
  "Nina",
  "Yanis",
  "Inès",
  "Lucas",
  "Sarah",
  "Malik",
  "Chloé",
  "Théo",
  "Aya",
  "Noah",
  "Jade",
  "Omar",
];
const LAST = [
  "Bernard",
  "Petit",
  "Durand",
  "Leroy",
  "Moreau",
  "Simon",
  "Laurent",
  "Michel",
  "Garcia",
  "Faure",
  "Roux",
  "Blanc",
  "Guerin",
  "Muller",
];
const ROLES = ["EMPLOYEE", "EMPLOYEE", "EMPLOYEE", "EMPLOYEE", "EMPLOYEE", "EMPLOYEE", "TEAM_LEAD", "TEAM_LEAD", "SUPERVISOR", "HR"];
const pick = (list, i) => list[i % list.length];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, path, { token, body, headers = {} } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        "x-client-platform": "native",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 429 && attempt < 8) {
      await sleep(Number(res.headers.get("retry-after") ?? 2) * 1000 + 250);
      continue;
    }
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${data?.error?.message ?? ""}`);
    return data;
  }
}

/** Première connexion : mot de passe temporaire remplacé (politique de mot de passe respectée). */
async function activate(organization, username, temporaryPassword) {
  const session = await call("POST", "/v1/auth/login", { body: { organization, identifier: username, password: temporaryPassword } });
  await call("POST", "/v1/auth/change-password", {
    token: session.accessToken,
    body: { currentPassword: temporaryPassword, newPassword: PASSWORD },
  });
  return session.accessToken;
}

async function pool(items, size, fn) {
  const results = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index], index);
      }
    }),
  );
  return results;
}

function weekDays() {
  const now = new Date();
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ((now.getUTCDay() + 6) % 7)));
  return Array.from({ length: 5 }, (_, i) => new Date(monday.getTime() + i * 86_400_000).toISOString().slice(0, 10));
}

const accounts = [];
const days = weekDays();
for (let o = 0; o < ORGS; o += 1) {
  const slug = `charge-${RUN}-${o}`;
  const created = await call("POST", "/v1/platform/organizations", {
    headers: { "x-platform-token": PLATFORM_TOKEN },
    body: {
      slug,
      name: `Essai de charge ${o + 1}`,
      plan: "BUSINESS",
      seatLimit: USERS_PER_ORG + 5,
      assistantMonthlyQuota: 0,
      admin: { firstName: "Admin", lastName: `Charge${o}` },
    },
  });
  const admin = await activate(slug, created.admin.user.username, created.admin.temporaryPassword);
  accounts.push({ organization: slug, identifier: created.admin.user.username, role: "ADMIN" });

  const clients = await pool(
    Array.from({ length: 12 }, (_, i) => i),
    4,
    (i) =>
      call("POST", "/v1/clients", {
        token: admin,
        body: { name: `Client ${i + 1} — ${slug}`, email: `client${i + 1}@${slug}.example`, city: "Lyon" },
      }),
  );
  await pool(
    Array.from({ length: 10 }, (_, i) => i),
    4,
    (i) =>
      call("POST", "/v1/quotes", {
        token: admin,
        body: {
          clientId: clients[i % clients.length].id,
          title: `Entretien ${i + 1}`,
          lines: [{ description: "Entretien des locaux", quantity: 8 + i, unit: "HOUR", unitPriceCents: 3200, vatRateBps: 2000 }],
        },
      }),
  );

  const members = await pool(
    Array.from({ length: USERS_PER_ORG }, (_, i) => i),
    6,
    async (i) => {
      const role = pick(ROLES, i);
      const made = await call("POST", "/v1/users", {
        token: admin,
        body: { firstName: pick(FIRST, i + o), lastName: `${pick(LAST, i)} ${o}-${i}`, role },
      });
      await activate(slug, made.user.username, made.temporaryPassword);
      accounts.push({ organization: slug, identifier: made.user.username, role });
      return made.user;
    },
  );

  // Planning de la semaine : 3 missions par personne de terrain.
  const field = members.filter((m) => m.role === "EMPLOYEE" || m.role === "TEAM_LEAD");
  await pool(
    field.flatMap((m, i) => [0, 1, 2].map((k) => ({ m, i, k }))),
    6,
    ({ m, i, k }) =>
      call("POST", "/v1/missions", {
        token: admin,
        body: {
          title: `Intervention ${k + 1}`,
          date: days[(i + k) % days.length],
          startTime: k === 2 ? "14:00" : "08:00",
          endTime: k === 2 ? "17:00" : "11:00",
          assigneeIds: [m.id],
          clientId: clients[(i + k) % clients.length].id,
        },
      }),
  );
  console.error(`Entreprise ${o + 1}/${ORGS} prête : ${slug} (${USERS_PER_ORG + 1} comptes)`);
}

process.stdout.write(JSON.stringify({ api: API, password: PASSWORD, accounts }, null, 2) + "\n");
