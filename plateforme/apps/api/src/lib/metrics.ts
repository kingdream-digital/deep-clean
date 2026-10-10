import client from "prom-client";

/**
 * Métriques Prometheus (/metrics) : ce qu'il faut surveiller pour tenir la
 * charge — latence par route, erreurs, connexions temps réel ouvertes,
 * réponses de l'assistant en cours.
 */
export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry, prefix: "aussitot_" });

export const httpDuration = new client.Histogram({
  name: "aussitot_http_request_duration_seconds",
  help: "Durée des requêtes HTTP",
  labelNames: ["method", "route", "status"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

export const realtimeConnections = new client.Gauge({
  name: "aussitot_realtime_connections",
  help: "Connexions temps réel (SSE) ouvertes sur cette instance",
  registers: [registry],
});

export const assistantInFlight = new client.Gauge({
  name: "aussitot_assistant_in_flight",
  help: "Réponses de l'assistant en cours de génération sur cette instance",
  registers: [registry],
});

export const assistantTurns = new client.Counter({
  name: "aussitot_assistant_turns_total",
  help: "Tours de l'assistant, par issue",
  labelNames: ["outcome"],
  registers: [registry],
});

export const assistantToolCalls = new client.Counter({
  name: "aussitot_assistant_tool_calls_total",
  help: "Outils métier appelés par l'assistant",
  labelNames: ["tool", "outcome"],
  registers: [registry],
});
