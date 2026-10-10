/**
 * Essai de charge « journée type » (k6) : chaque utilisateur virtuel se
 * connecte une fois, puis consulte un écran toutes les 15 à 45 secondes
 * (temps de lecture), comme dans l'application : accueil, planning,
 * notifications, ventes pour l'encadrement. Le jeton d'accès (10 min) est
 * renouvelé comme le fait l'app.
 *
 *   docker run --rm -i --network host -v "$PWD:/scripts" grafana/k6 run \
 *     -e API_URL=https://api.recette.exemple.fr -e COMPTES=/scripts/comptes.json -e VUS=2000 \
 *     /scripts/infra/load/k6-journee.js
 *
 * Paramètres : VUS (utilisateurs simultanés), MONTEE, PALIER (durées),
 * PENSEE_MIN / PENSEE_MAX (secondes entre deux écrans).
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { SharedArray } from "k6/data";

const data = JSON.parse(open(__ENV.COMPTES || "./comptes.json"));
const accounts = new SharedArray("comptes", () => data.accounts);
const API = (__ENV.API_URL || data.api || "http://localhost:4000").replace(/\/$/, "");
const VUS = Number(__ENV.VUS || 100);
const THINK_MIN = Number(__ENV.PENSEE_MIN || 15);
const THINK_MAX = Number(__ENV.PENSEE_MAX || 45);
const MANAGERS = ["ADMIN", "DIRECTOR", "HR", "SUPERVISOR"];

export const options = {
  scenarios: {
    journee: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: __ENV.MONTEE || "1m", target: VUS },
        { duration: __ENV.PALIER || "3m", target: VUS },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "30s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{ecran:accueil}": ["p(95)<800"],
    "http_req_duration{ecran:planning}": ["p(95)<800"],
    "http_req_duration{ecran:notifications}": ["p(95)<400"],
    checks: ["rate>0.99"],
  },
};

const json = { "content-type": "application/json", "x-client-platform": "native" };
let session = null; // propre à chaque utilisateur virtuel

function login(account) {
  const res = http.post(
    `${API}/v1/auth/login`,
    JSON.stringify({ organization: account.organization, identifier: account.identifier, password: data.password }),
    { headers: json, tags: { ecran: "connexion" } },
  );
  check(res, { "connexion réussie": (r) => r.status === 200 });
  if (res.status !== 200) return null;
  const body = res.json();
  return { access: body.accessToken, refresh: body.refreshToken, manager: MANAGERS.includes(account.role) };
}

function renew() {
  const res = http.post(`${API}/v1/auth/refresh`, JSON.stringify({ refreshToken: session.refresh }), {
    headers: json,
    tags: { ecran: "renouvellement" },
  });
  if (res.status !== 200) return false;
  const body = res.json();
  session.access = body.accessToken;
  session.refresh = body.refreshToken;
  return true;
}

function get(path, ecran) {
  const params = () => ({ headers: { ...json, authorization: `Bearer ${session.access}` }, tags: { ecran } });
  let res = http.get(`${API}${path}`, params());
  if (res.status === 401 && renew()) res = http.get(`${API}${path}`, params());
  check(res, { [`${ecran} : 200`]: (r) => r.status === 200 });
}

function week() {
  const now = new Date();
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ((now.getUTCDay() + 6) % 7)));
  const iso = (d) => d.toISOString().slice(0, 10);
  return { from: iso(monday), to: iso(new Date(monday.getTime() + 6 * 86_400_000)) };
}

export default function () {
  if (!session) {
    session = login(accounts[(__VU - 1) % accounts.length]);
    if (!session) return sleep(5);
  }
  const r = Math.random();
  if (r < 0.35) {
    get("/v1/dashboard", "accueil");
    get("/v1/notifications/unread-count", "notifications");
  } else if (r < 0.65) {
    const w = week();
    get(`/v1/missions?from=${w.from}&to=${w.to}`, "planning");
  } else if (r < 0.8) {
    get("/v1/notifications?limit=40", "notifications");
  } else if (session.manager) {
    get("/v1/quotes?limit=50", "ventes");
    get("/v1/clients?limit=50", "ventes");
  } else {
    get("/v1/dashboard", "accueil");
  }
  sleep(THINK_MIN + Math.random() * (THINK_MAX - THINK_MIN));
}
