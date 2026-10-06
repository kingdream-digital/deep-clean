import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { ApiError } from "../../utils/ApiError";

// Client de l'API Super PDP (plateforme agréée de facturation électronique,
// https://www.superpdp.tech/openapi/). Authentification OAuth2
// « client credentials » ; le jeton est gardé en mémoire jusqu'à expiration.

export function superPdpConfigured(): boolean {
  return !!env.SUPERPDP_CLIENT_ID?.trim() && !!env.SUPERPDP_CLIENT_SECRET?.trim();
}

let cachedToken: { value: string; expiresAt: number } | null = null;

/** Pour les tests : oublie le jeton en mémoire. */
export function resetSuperPdpToken(): void {
  cachedToken = null;
}

function apiUrl(path: string): string {
  return `${env.SUPERPDP_API_URL.replace(/\/$/, "")}${path}`;
}

async function getToken(): Promise<string> {
  if (!superPdpConfigured()) throw ApiError.badRequest("La facture électronique n'est pas configurée (identifiants Super PDP manquants).");
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.value;
  const res = await fetch(apiUrl("/oauth2/token"), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: env.SUPERPDP_CLIENT_ID!.trim(),
      client_secret: env.SUPERPDP_CLIENT_SECRET!.trim(),
    }),
  });
  if (!res.ok) {
    logger.warn({ status: res.status }, "Super PDP : authentification refusée");
    throw ApiError.badRequest("Connexion à Super PDP refusée : vérifiez les identifiants SUPERPDP_CLIENT_ID / SUPERPDP_CLIENT_SECRET.");
  }
  const data = (await res.json()) as { access_token: string; expires_in?: number };
  cachedToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return cachedToken.value;
}

/** Message d'erreur lisible renvoyé par Super PDP (jamais de détail technique brut à l'écran). */
async function failure(res: Response, action: string): Promise<ApiError> {
  let detail = "";
  try {
    const body = (await res.json()) as { error?: string; message?: string; errors?: unknown };
    detail = body.message ?? body.error ?? "";
  } catch {
    // corps non JSON
  }
  logger.warn({ status: res.status, detail: detail.slice(0, 500) }, `Super PDP : échec — ${action}`);
  if (res.status >= 500) return ApiError.badRequest("Super PDP est momentanément indisponible. Réessayez dans quelques minutes.");
  return ApiError.badRequest(`Super PDP a refusé la facture${detail ? ` : ${detail.slice(0, 300)}` : "."}`);
}

async function authorized(path: string, init: RequestInit, action: string, retry = true): Promise<Response> {
  const token = await getToken();
  const res = await fetch(apiUrl(path), { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}` } });
  if (res.status === 401 && retry) {
    cachedToken = null;
    return authorized(path, init, action, false);
  }
  if (!res.ok) throw await failure(res, action);
  return res;
}

/**
 * Factur-X : notre PDF (lisible) + la facture structurée (EN 16931) réunis
 * en un seul PDF conforme, par l'outil de conversion de Super PDP.
 */
export async function convertToFacturX(enInvoice: unknown, pdf: Buffer): Promise<Buffer> {
  const form = new FormData();
  form.append("invoice", new Blob([JSON.stringify(enInvoice)], { type: "application/json" }), "invoice.json");
  form.append("pdf", new Blob([pdf], { type: "application/pdf" }), "facture.pdf");
  const res = await authorized("/v1.beta/invoices/convert?from=en16931&to=factur-x", { method: "POST", body: form }, "conversion Factur-X");
  return Buffer.from(await res.arrayBuffer());
}

export interface SuperPdpEvent {
  id: number;
  invoice_id: number;
  status_code: string;
  status_text: string;
  created_at: string;
}

export interface SuperPdpInvoice {
  id: number;
  external_id?: string;
  events?: SuperPdpEvent[];
}

/** Dépose la facture Factur-X : Super PDP l'achemine vers la plateforme du client. */
export async function sendFacturX(facturX: Buffer, externalId: string): Promise<SuperPdpInvoice> {
  const res = await authorized(
    `/v1.beta/invoices?external_id=${encodeURIComponent(externalId.slice(0, 36))}`,
    { method: "POST", headers: { "content-type": "application/pdf" }, body: new Uint8Array(facturX) },
    "envoi de la facture"
  );
  return (await res.json()) as SuperPdpInvoice;
}

export async function listInvoiceEvents(pdpInvoiceId: string): Promise<SuperPdpEvent[]> {
  const res = await authorized(`/v1.beta/invoice_events?invoice_id=${encodeURIComponent(pdpInvoiceId)}&limit=1000`, { method: "GET" }, "suivi des statuts");
  const body = (await res.json()) as { data: SuperPdpEvent[] };
  return body.data ?? [];
}
