import type { ServerResponse } from "node:http";
import type { Redis } from "ioredis";
import { createRedis, redis } from "./redis.ts";
import { logger } from "./logger.ts";
import { realtimeConnections } from "./metrics.ts";

/**
 * Temps réel (Server-Sent Events) à l'échelle : chaque instance de l'API garde
 * ses propres connexions ouvertes et s'abonne, via UNE connexion Redis, aux
 * canaux des seuls utilisateurs connectés chez elle. Un événement publié par
 * n'importe quelle instance (ou par le worker) atteint donc l'utilisateur,
 * où qu'il soit connecté.
 */
export type RealtimeEvent =
  | { type: "notification"; payload: { title: string; body: string; link: string | null; notificationType: string } }
  | { type: "refresh"; payload: { resources: string[] } };

type Listener = (event: RealtimeEvent) => void;

const channelFor = (userId: string) => `rt:u:${userId}`;

class RealtimeHub {
  private subscriber: Redis | null = null;
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly streams = new Set<ServerResponse>();

  private ensureSubscriber(): Redis {
    if (!this.subscriber) {
      this.subscriber = createRedis("realtime-sub");
      this.subscriber.on("message", (channel: string, message: string) => {
        const set = this.listeners.get(channel);
        if (!set) return;
        let event: RealtimeEvent;
        try {
          event = JSON.parse(message) as RealtimeEvent;
        } catch {
          return;
        }
        for (const listener of set) listener(event);
      });
    }
    return this.subscriber;
  }

  async subscribe(userId: string, listener: Listener): Promise<() => Promise<void>> {
    const channel = channelFor(userId);
    let set = this.listeners.get(channel);
    if (!set) {
      set = new Set();
      this.listeners.set(channel, set);
      await this.ensureSubscriber().subscribe(channel);
    }
    set.add(listener);
    realtimeConnections.inc();
    let done = false;
    return async () => {
      if (done) return;
      done = true;
      realtimeConnections.dec();
      set!.delete(listener);
      if (set!.size === 0) {
        this.listeners.delete(channel);
        await this.subscriber?.unsubscribe(channel).catch(() => undefined);
      }
    };
  }

  track(stream: ServerResponse): void {
    this.streams.add(stream);
    stream.on("close", () => this.streams.delete(stream));
  }

  /** Arrêt de l'instance : on ferme proprement les flux, les apps se reconnectent ailleurs. */
  async close(): Promise<void> {
    for (const stream of this.streams) stream.end();
    this.streams.clear();
    await this.subscriber?.quit().catch(() => undefined);
    this.subscriber = null;
    this.listeners.clear();
  }

  connectionCount(): number {
    return this.streams.size;
  }
}

export const realtimeHub = new RealtimeHub();

export async function publishToUsers(userIds: string[], event: RealtimeEvent): Promise<void> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return;
  try {
    const pipeline = redis.pipeline();
    const message = JSON.stringify(event);
    for (const id of unique) pipeline.publish(channelFor(id), message);
    await pipeline.exec();
  } catch (err) {
    logger.warn({ err }, "Diffusion temps réel impossible (les apps se mettront à jour au prochain rafraîchissement)");
  }
}
