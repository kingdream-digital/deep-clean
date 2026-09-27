import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 15000,
});

// État d'authentification injecté par AuthContext au démarrage de l'app —
// évite une dépendance circulaire entre le client HTTP et le contexte React.
let getAccessToken: () => string | null = () => null;
let onUnauthorized: () => void = () => {};
let refreshInFlight: Promise<string | null> | null = null;
let performRefresh: () => Promise<string | null> = async () => null;

export function configureApiClient(handlers: {
  getAccessToken: () => string | null;
  refreshAccessToken: () => Promise<string | null>;
  onUnauthorized: () => void;
}) {
  getAccessToken = handlers.getAccessToken;
  performRefresh = handlers.refreshAccessToken;
  onUnauthorized = handlers.onUnauthorized;
}

// Exposé pour les cas où un composant a besoin du token brut plutôt que de
// passer par apiClient — ex: en-tête Authorization d'une <Image> chargeant une
// photo protégée (les photos ne sont jamais servies via une URL publique).
export function getCurrentAccessToken(): string | null {
  return getAccessToken();
}

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  if (token) {
    config.headers.set("Authorization", `Bearer ${token}`);
  }
  return config;
});

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

// Sur un 401 (token expiré), tente une unique fois de rafraîchir la session
// puis rejoue la requête. Si le rafraîchissement échoue, l'utilisateur est déconnecté.
apiClient.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined;
    const isAuthRoute = original?.url?.includes("/auth/login") || original?.url?.includes("/auth/refresh");

    if (error.response?.status === 401 && original && !original._retried && !isAuthRoute) {
      original._retried = true;

      if (!refreshInFlight) {
        refreshInFlight = performRefresh().finally(() => {
          refreshInFlight = null;
        });
      }

      const newToken = await refreshInFlight;
      if (newToken) {
        original.headers.set("Authorization", `Bearer ${newToken}`);
        return apiClient(original);
      }

      onUnauthorized();
    }

    return Promise.reject(error);
  }
);

// Message d'erreur exploitable côté UI, sans jamais exposer de détails techniques.
export function extractErrorMessage(error: unknown, fallback = "Une erreur est survenue."): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return "Impossible de contacter le serveur. Vérifiez votre connexion.";
    }
    const data = error.response.data as { error?: { message?: string } } | undefined;
    return data?.error?.message ?? fallback;
  }
  // Bug corrigé : une erreur "locale" (jamais envoyée au serveur — permission
  // caméra/position refusée, hors ligne, GPS indisponible...) retombait
  // toujours sur le message générique `fallback`, quel que soit le message
  // explicite déjà rédigé pour l'utilisateur au moment où l'erreur est levée
  // (voir hooks/useClockStatus.ts) — masquant la vraie raison de l'échec
  // (constaté en conditions réelles : "Action impossible." au lieu de
  // "Localisation refusée : autorisez l'accès...").
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}
