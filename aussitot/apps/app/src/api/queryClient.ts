import { QueryClient } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ApiError } from "./client";

/**
 * Cache des données : affichage immédiat de la dernière version connue, mise
 * à jour en arrière-plan. Seules les données utiles sur le terrain (accueil,
 * planning, missions, notifications) sont gardées sur l'appareil pour la
 * consultation hors connexion — jamais les factures ni les fiches clients.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 24 * 3_600_000,
      retry: (count, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return count < 2;
      },
      refetchOnWindowFocus: true,
    },
    mutations: { retry: false },
  },
});

export const OFFLINE_QUERY_KEYS = new Set(["dashboard", "planning", "mission", "notifications"]);

export const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: "aussitot.cache.v1", throttleTime: 2000 });
