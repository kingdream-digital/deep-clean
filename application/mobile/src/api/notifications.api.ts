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
}

export async function listNotifications(page = 1, pageSize = 20): Promise<ListNotificationsResponse> {
  const { data } = await apiClient.get<ListNotificationsResponse>("/notifications", {
    params: { page, pageSize },
  });
  return data;
}

export async function markNotificationAsRead(id: string): Promise<void> {
  await apiClient.post(`/notifications/${id}/read`);
}

export async function markAllNotificationsAsRead(): Promise<void> {
  await apiClient.post("/notifications/read-all");
}

export async function registerPushToken(token: string, platform: "ios" | "android"): Promise<void> {
  await apiClient.post("/notifications/push-tokens", { token, platform });
}

export async function unregisterPushToken(token: string): Promise<void> {
  await apiClient.delete("/notifications/push-tokens", { data: { token } });
}
