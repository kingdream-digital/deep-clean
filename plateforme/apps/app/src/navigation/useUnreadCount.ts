import { useQuery } from "@tanstack/react-query";
import { endpoints } from "@/api/endpoints";

/** Nombre de notifications non lues (mis à jour en temps réel par le flux d'événements). */
export function useUnreadCount(): number {
  const { data } = useQuery({ queryKey: ["notifications", "unread-count"], queryFn: endpoints.notifications.unreadCount, staleTime: 15_000 });
  return data?.count ?? 0;
}
