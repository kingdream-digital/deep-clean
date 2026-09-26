import { useEffect, useState } from "react";
import { listNotifications } from "../api/notifications.api";
import { getUnreadMessagesCount } from "../api/messages.api";

const POLL_INTERVAL_MS = 60_000;

// Badge combiné de l'onglet Messagerie (Notifications + Messages sous un
// même onglet, voir InboxHomeScreen) — même stratégie de sondage léger que
// l'ancien compteur de notifications, en attendant une éventuelle
// infrastructure de notifications push.
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
        if (!cancelled) setCount(notifRes.unreadCount + unreadMessages);
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
