import { useEffect } from "react";
import { AppState } from "react-native";
import { useRouter } from "expo-router";
import { streamSse } from "@/api/stream";
import { queryClient } from "@/api/queryClient";
import { useToast } from "@/ui";
import { useAuth } from "@/auth/AuthProvider";

/**
 * Connexion temps réel : une notification reçue met à jour les écrans
 * concernés sans action de l'utilisateur. Le serveur ferme le flux avant
 * l'expiration du jeton ; on se reconnecte aussitôt (avec un jeton renouvelé),
 * et en cas de coupure réseau, après un délai croissant.
 */
export function useRealtime(): void {
  const { status } = useAuth();
  const toast = useToast();
  const router = useRouter();

  useEffect(() => {
    if (status !== "signedIn") return;
    let stopped = false;
    let controller: AbortController | null = null;
    let failures = 0;

    const connect = async () => {
      while (!stopped) {
        controller = new AbortController();
        try {
          await streamSse("/v1/events", {
            signal: controller.signal,
            onEvent: (event, data) => {
              if (event === "ready") failures = 0;
              if (event === "notification") {
                const payload = data as { title: string; body: string; link: string | null };
                void queryClient.invalidateQueries({ queryKey: ["notifications"] });
                void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
                void queryClient.invalidateQueries({ queryKey: ["planning"] });
                toast(payload.title, "info", payload.link ? () => router.push(payload.link as never) : undefined);
              }
              if (event === "refresh") {
                for (const resource of (data as { resources: string[] }).resources)
                  void queryClient.invalidateQueries({ queryKey: [resource] });
              }
            },
          });
          failures = 0;
        } catch (err) {
          if ((err as Error).name === "AbortError" || stopped) return;
          failures += 1;
        }
        if (stopped) return;
        await new Promise((resolve) => setTimeout(resolve, failures ? Math.min(30_000, 1000 * 2 ** failures) : 300));
      }
    };
    void connect();

    // Application remise au premier plan : données rafraîchies.
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    });
    return () => {
      stopped = true;
      controller?.abort();
      sub.remove();
    };
  }, [status, toast, router]);
}
