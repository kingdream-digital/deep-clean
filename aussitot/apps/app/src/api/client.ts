import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import type { AuthResponseDto } from "@aussitot/shared";

/**
 * Client HTTP de l'app.
 *
 * - Jeton d'accès court gardé en mémoire uniquement.
 * - Jeton de renouvellement : trousseau sécurisé du téléphone (Keychain /
 *   Keystore) si « Rester connecté », sinon mémoire seule ; sur le web, cookie
 *   httpOnly posé par l'API (inaccessible au JavaScript).
 * - Renouvellement automatique et unique (plusieurs requêtes qui expirent en
 *   même temps ne déclenchent qu'un seul renouvellement).
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");
const REFRESH_KEY = "aussitot.refreshToken";
const isWeb = Platform.OS === "web";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** Premier message d'erreur d'un champ (formulaires). */
  field(name: string): string | undefined {
    return this.details?.[name]?.[0];
  }
}

let accessToken: string | null = null;
let memoryRefreshToken: string | null = null;
let refreshInFlight: Promise<AuthResponseDto | null> | null = null;
const sessionListeners = new Set<(session: AuthResponseDto | null) => void>();

/** Prévenu à chaque nouvelle session (renouvellement) ou perte de session. */
export function onSessionChange(listener: (session: AuthResponseDto | null) => void): () => void {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

function notify(session: AuthResponseDto | null) {
  for (const listener of sessionListeners) listener(session);
}

export function getAccessToken(): string | null {
  return accessToken;
}

async function readRefreshToken(): Promise<string | null> {
  if (isWeb) return null;
  if (memoryRefreshToken) return memoryRefreshToken;
  try {
    return await SecureStore.getItemAsync(REFRESH_KEY);
  } catch {
    return null;
  }
}

export async function storeSession(session: AuthResponseDto, rememberMe: boolean): Promise<void> {
  accessToken = session.accessToken;
  if (!isWeb && session.refreshToken) {
    memoryRefreshToken = session.refreshToken;
    try {
      if (rememberMe) await SecureStore.setItemAsync(REFRESH_KEY, session.refreshToken);
      else await SecureStore.deleteItemAsync(REFRESH_KEY);
    } catch {
      /* trousseau indisponible : session en mémoire seulement */
    }
  }
}

export async function clearSession(): Promise<void> {
  accessToken = null;
  memoryRefreshToken = null;
  if (!isWeb) await SecureStore.deleteItemAsync(REFRESH_KEY).catch(() => undefined);
}

function baseHeaders(json: boolean): Record<string, string> {
  return {
    ...(json ? { "content-type": "application/json" } : {}),
    accept: "application/json",
    "x-client-platform": isWeb ? "web" : "native",
    ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
  };
}

export async function parseError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string; details?: Record<string, string[]> } };
    return new ApiError(res.status, body.error?.code ?? "ERROR", body.error?.message ?? "Une erreur est survenue.", body.error?.details);
  } catch {
    return new ApiError(res.status, "ERROR", res.status >= 500 ? "Le serveur est momentanément indisponible." : "Une erreur est survenue.");
  }
}

/** Renouvelle la session (une seule fois même si appelé en parallèle). */
export function refreshSession(): Promise<AuthResponseDto | null> {
  refreshInFlight ??= (async () => {
    try {
      const stored = await readRefreshToken();
      if (!isWeb && !stored) return null;
      const res = await fetch(`${API_URL}/v1/auth/refresh`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-client-platform": isWeb ? "web" : "native" },
        body: JSON.stringify(stored ? { refreshToken: stored } : {}),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await parseError(res);
        // Deux renouvellements simultanés : l'autre a gagné, on garde la session.
        if (err.code === "REFRESH_RACE" && accessToken) return null;
        await clearSession();
        notify(null);
        return null;
      }
      const session = (await res.json()) as AuthResponseDto;
      const remember = isWeb ? true : Boolean(await SecureStore.getItemAsync(REFRESH_KEY).catch(() => null));
      await storeSession(session, remember);
      notify(session);
      return session;
    } catch {
      return null;
    } finally {
      setTimeout(() => {
        refreshInFlight = null;
      }, 0);
    }
  })();
  return refreshInFlight;
}

const RETRYABLE_AUTH_CODES = new Set(["TOKEN_EXPIRED", "TOKEN_STALE", "UNAUTHORIZED", "SESSION_INVALID"]);

export interface RequestOptions {
  body?: unknown;
  signal?: AbortSignal;
  /** Réponse brute (PDF, image). */
  raw?: boolean;
  auth?: boolean;
}

export async function request<T>(method: string, path: string, options: RequestOptions = {}, retried = false): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: baseHeaders(options.body !== undefined),
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      credentials: "include",
      signal: options.signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiError(0, "NETWORK", "Pas de connexion internet.");
  }
  if (res.status === 401 && options.auth !== false && !retried) {
    const err = await parseError(res.clone());
    if (RETRYABLE_AUTH_CODES.has(err.code)) {
      const session = await refreshSession();
      if (session || accessToken) return request<T>(method, path, options, true);
    }
  }
  if (!res.ok) {
    const err = await parseError(res);
    if (res.status === 401 && options.auth !== false) {
      await clearSession();
      notify(null);
    }
    throw err;
  }
  if (options.raw) return (await res.blob()) as unknown as T;
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>("GET", path, { signal }),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, { body: body ?? {} }),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, { body }),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, { body }),
  delete: <T>(path: string, body?: unknown) => request<T>("DELETE", path, { body }),
};

/** Construit une chaîne de requête en ignorant les valeurs vides. */
export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "");
  return entries.length ? `?${entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&")}` : "";
}
