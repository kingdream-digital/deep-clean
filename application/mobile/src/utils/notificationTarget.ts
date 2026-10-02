import type { AppNotification } from "../api/notifications.api";
import { getAbsence } from "../api/absences.api";
import type { InboxStackParamList } from "../navigation/InboxStack";

// Écran ouvert par l'appui sur une notification — une seule table pour le
// centre de notifications ET l'activité récente de l'accueil (retour explicite
// du client : chaque notification doit mener à ce qu'elle annonce). Toutes les
// cibles existent sur la pile Messagerie (InboxStack).
export type NotificationTarget = {
  [K in keyof InboxStackParamList]: { screen: K; params: InboxStackParamList[K] };
}[keyof InboxStackParamList];

// Notifications créées avant que chaque notification ait une cible côté
// serveur : retrouvées par leur titre.
const LEGACY_TITLES: Record<string, NotificationTarget> = {
  "Congés acquis à valider": { screen: "LeaveAccruals", params: undefined },
  "Congés acquis": { screen: "MyAbsences", params: undefined },
  "Correction de votre solde de congés": { screen: "MyAbsences", params: undefined },
};

/** Cible connue sans appel réseau (sert aussi à afficher le chevron). */
export function hasNotificationTarget(n: Pick<AppNotification, "relatedEntityType" | "relatedEntityId" | "title">): boolean {
  return n.relatedEntityType ? !!n.relatedEntityId : n.title in LEGACY_TITLES;
}

export async function resolveNotificationTarget(n: AppNotification): Promise<NotificationTarget | null> {
  const id = n.relatedEntityId;
  if (!n.relatedEntityType) return LEGACY_TITLES[n.title] ?? null;
  if (!id) return null;
  switch (n.relatedEntityType) {
    case "Mission":
      return { screen: "MissionDetail", params: { missionId: id } };
    case "TimeEntry":
      return { screen: "TimeEntryDetail", params: { entryId: id } };
    case "Problem":
      return { screen: "ProblemDetail", params: { problemId: id } };
    case "Absence":
      if (n.type === "ABSENCE_REQUESTED") {
        // Demande à valider : fiche de l'employé concerné, pour décider.
        const absence = await getAbsence(id);
        return { screen: "UserDetail", params: { userId: absence.userId } };
      }
      return { screen: "MyAbsences", params: undefined };
    case "MissionsToReassign":
      return { screen: "ReassignMissions", params: undefined };
    case "Announcement":
      return { screen: "AnnouncementDetail", params: { announcementId: id } };
    case "Conversation":
      return { screen: "ConversationThread", params: { conversationId: id } };
    case "LeaveBalance":
      return { screen: "MyAbsences", params: undefined };
    case "LeaveAccruals":
      return { screen: "LeaveAccruals", params: /^\d{4}-\d{2}$/.test(id) ? { month: id } : undefined };
    default:
      return null;
  }
}
