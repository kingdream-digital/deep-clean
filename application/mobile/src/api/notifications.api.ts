import { apiClient } from "./client";

export type NotificationType =
  | "MISSION_ASSIGNED"
  | "MISSION_UNASSIGNED"
  | "MISSION_TIME_CHANGED"
  | "MISSION_SITE_CHANGED"
  | "MISSION_CANCELLED"
  | "MISSION_INSTRUCTION_ADDED"
  | "PROBLEM_UPDATE"
  | "PHOTO_EXPIRING_SOON"
  | "VALIDATION_REQUESTED"
  | "TIMESHEET_VALIDATED"
  | "TIMESHEET_REJECTED"
  | "ACCOUNT_UPDATE"
  // ABSENCE_DECIDED / ABSENCE_CONFLICT existent côté backend (schema.prisma)
  // depuis l'ajout des congés/absences mais manquaient ici — bug confirmé en
  // audit (NOTIFICATION_TYPE_ICON[type] renvoyait `undefined` pour ces deux
  // types, passé tel quel à <Ionicons name=.../>).
  // Envoyée à la RH/direction/admin pour une demande d'absence à valider —
  // distincte d'ABSENCE_DECIDED (envoyée à l'employé une fois décidée), pour
  // router l'appui sur la notification vers le bon écran (voir
  // NotificationsList.tsx::handleOpenRelatedEntity).
  | "ABSENCE_REQUESTED"
  | "ABSENCE_DECIDED"
  | "ABSENCE_CONFLICT"
  | "ANNOUNCEMENT_POSTED"
  // Retour explicite du client : une cloche de notification lors de la
  // réception d'un message (voir messages.service.ts::sendMessage) —
  // relatedEntityType vaut "Conversation" et relatedEntityId porte
  // l'identifiant de l'EXPÉDITEUR (pas du message), pour ouvrir directement
  // le bon fil au clic.
  | "MESSAGE_RECEIVED"
  | "GENERAL";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

interface ListNotificationsResponse {
  items: AppNotification[];
  total: number;
  page: number;
  pageSize: number;
  unreadCount: number;
  /**
   * Non-lues hors « nouveau message » : un message reçu crée à la fois une
   * notification et un message non lu dans son fil, qu'il ne faut pas compter
   * deux fois dans le badge de l'onglet (voir hooks/useUnreadInboxCount.ts).
   */
  unreadCountExcludingMessages: number;
}

export async function listNotifications(
  page = 1,
  pageSize = 20,
  options: { excludeMessages?: boolean } = {}
): Promise<ListNotificationsResponse> {
  const { data } = await apiClient.get<ListNotificationsResponse>("/notifications", {
    params: {
      page,
      pageSize,
      ...(options.excludeMessages ? { excludeMessages: "true" } : {}),
    },
  });
  return data;
}

export async function markNotificationAsRead(id: string): Promise<void> {
  await apiClient.post(`/notifications/${id}/read`);
}

export async function markAllNotificationsAsRead(): Promise<void> {
  await apiClient.post("/notifications/read-all");
}

export async function deleteNotification(id: string): Promise<void> {
  await apiClient.delete(`/notifications/${id}`);
}

export async function registerPushToken(token: string, platform: "ios" | "android"): Promise<void> {
  await apiClient.post("/notifications/push-tokens", { token, platform });
}

export async function unregisterPushToken(token: string): Promise<void> {
  await apiClient.delete("/notifications/push-tokens", { data: { token } });
}
