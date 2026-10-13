// Signal local « la messagerie ou les notifications ont changé sur CET
// appareil » (lecture, suppression, envoi). Le serveur ne fait volontairement
// pas avancer sa version de synchronisation pour une simple lecture (voir
// backend utils/changeVersion.ts), donc sans ce signal le compteur de
// l'onglet Messagerie restait figé jusqu'au sondage suivant (une minute).
type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeToInboxChanges(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyInboxChanged(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // Un abonné en erreur n'empêche jamais les autres d'être prévenus.
    }
  }
}

/** Vrai pour une requête qui modifie la messagerie ou les notifications. */
export function isInboxMutation(method: string | undefined, url: string | undefined): boolean {
  if (!method || !url || method.toLowerCase() === "get") return false;
  return /^\/?(notifications|messages)(\/|$|\?)/.test(url.replace(/^https?:\/\/[^/]+(\/api\/v1)?/, ""));
}
