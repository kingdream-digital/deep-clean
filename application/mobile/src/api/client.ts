import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { isInboxMutation, notifyInboxChanged } from "../sync/inboxEvents";
import { reportMaintenance } from "../sync/maintenance";

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 15000,
});

// État d'authentification injecté par AuthContext au démarrage de l'app —
// évite une dépendance circulaire entre le client HTTP et le contexte React.
let getAccessToken: () => string | null = () => null;
let refreshInFlight: Promise<string | null> | null = null;
let performRefresh: () => Promise<string | null> = async () => null;

export function configureApiClient(handlers: {
  getAccessToken: () => string | null;
  // Renvoie le nouveau jeton d'accès, ou null. C'est AuthContext qui décide
  // de fermer la session (refus réel du serveur) ou de la garder (pas de
  // réseau, serveur indisponible) : l'intercepteur ne déconnecte jamais seul.
  refreshAccessToken: () => Promise<string | null>;
}) {
  getAccessToken = handlers.getAccessToken;
  performRefresh = handlers.refreshAccessToken;
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
// puis rejoue la requête. Si le serveur refuse réellement la session,
// AuthContext déconnecte l'utilisateur ; sans réseau, la session est gardée.
apiClient.interceptors.response.use(
  (res) => {
    // Lecture, suppression ou envoi dans la messagerie / les notifications :
    // le compteur de l'onglet se met à jour tout de suite.
    if (isInboxMutation(res.config.method, res.config.url)) notifyInboxChanged();
    return res;
  },
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined;
    // Mise à jour en cours côté serveur : l'écran de maintenance prend le
    // relais par-dessus toute l'application (session conservée).
    const body = error.response?.data as { error?: { code?: string; message?: string; details?: { until?: string | null } } } | undefined;
    if (error.response?.status === 503 && body?.error?.code === "MAINTENANCE") {
      reportMaintenance({ message: body.error.message ?? null, until: body.error.details?.until ?? null });
    }

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
