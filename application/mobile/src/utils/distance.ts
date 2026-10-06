// Au-delà de cette distance du chantier prévu, un pointage est signalé comme
// potentiellement suspect (imprécision GPS normale en zone urbaine/dense
// comprise) — purement indicatif pour le validateur, jamais bloquant.
export const DISTANCE_ALERT_METERS = 300;

export function formatDistance(meters: number): string {
  return meters < 1000 ? `${meters} m` : `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
}
