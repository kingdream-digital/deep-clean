// Exécution une par une des opérations qui partagent une même clé, dans ce
// processus. Sert là où une vérification (« cet employé est-il libre sur ce
// créneau ? ») et l'écriture qui suit ne doivent jamais s'entrecroiser.
// Valable tant que l'API tourne en une seule instance (cas du déploiement
// actuel, une application Coolify) ; à remplacer par un verrou PostgreSQL si
// l'API est un jour répartie sur plusieurs instances.
const tails = new Map<string, Promise<void>>();

export async function withMutex<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = tails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => (release = resolve));
  const tail = previous.then(() => current);
  tails.set(key, tail);
  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (tails.get(key) === tail) tails.delete(key);
  }
}
