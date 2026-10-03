import { Ionicons } from "@expo/vector-icons";
import type { NotificationType } from "../api/notifications.api";

// Une icône par type — pour que la nature de la notification (nouvelle
// mission, consigne, horaire...) se distingue au premier coup d'œil, que ce
// soit dans le centre de notifications ou l'aperçu "Activité récente" du
// tableau de bord.
export const NOTIFICATION_TYPE_ICON: Record<NotificationType, keyof typeof Ionicons.glyphMap> = {
  MISSION_ASSIGNED: "briefcase-outline",
  MISSION_UNASSIGNED: "remove-circle-outline",
  MISSION_TIME_CHANGED: "time-outline",
  MISSION_SITE_CHANGED: "location-outline",
  MISSION_CANCELLED: "close-circle-outline",
  MISSION_INSTRUCTION_ADDED: "document-text-outline",
  PROBLEM_UPDATE: "warning-outline",
  PHOTO_EXPIRING_SOON: "image-outline",
  VALIDATION_REQUESTED: "checkmark-done-outline",
  TIMESHEET_VALIDATED: "time-outline",
  TIMESHEET_REJECTED: "alert-circle-outline",
  ACCOUNT_UPDATE: "person-outline",
  ABSENCE_REQUESTED: "calendar-outline",
  ABSENCE_DECIDED: "calendar-outline",
  ABSENCE_CONFLICT: "alert-circle-outline",
  ANNOUNCEMENT_POSTED: "megaphone-outline",
  MESSAGE_RECEIVED: "chatbubble-ellipses-outline",
  COMMERCIAL_UPDATE: "document-text-outline",
  REMINDER: "alarm-outline",
  GENERAL: "notifications-outline",
};
