import { useEffect, useState } from "react";
import { listNotifications } from "../api/notifications.api";
import { getUnreadMessagesCount } from "../api/messages.api";

const POLL_INTERVAL_MS = 60_000;

// Badge combiné de l'onglet Messagerie (Notifications + Messages sous un
// même onglet, voir InboxHomeScreen) — même stratégie de sondage léger que
// l'ancien compteur de notifications.
//
// BUG CORRIGÉ : un message reçu crée à la fois une notification « nouveau
// message » (la cloche, demandée explicitement par le client) et un message
// non lu dans son fil. Additionner les deux compteurs bruts faisait compter
// chaque message deux fois — le badge affichait 10 pour 5 messages réellement
// reçus. On additionne donc les notifications HORS « nouveau message » et les
// messages non lus.
export function useUnreadInboxCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const [notifRes, unreadMessages] = await Promise.all([
          listNotifications(1, 1),
          getUnreadMessagesCount(),
        ]);
        if (!cancelled) setCount(notifRes.unreadCountExcludingMessages + unreadMessages);
      } catch {
        // Échec silencieux : le compteur garde sa dernière valeur connue.
      }
    }

    void poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return count;
}
