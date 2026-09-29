import { Platform } from "react-native";
import { apiClient, API_URL } from "./client";
import type { Role } from "./auth.api";

export interface Announcement {
  id: string;
  title: string;
  body: string;
  // Photo de couverture facultative (retour explicite du client : "un vrai
  // blog/journal d'entreprise") — jamais dans cette réponse elle-même, voir
  // announcementCoverPhotoUrl. Même principe que TimeEntry.hasClockInPhoto.
  hasCoverPhoto: boolean;
  createdAt: string;
  author: {
    id: string;
    firstName: string;
    lastName: string;
    role: Role;
  };
}

export function announcementCoverPhotoUrl(announcementId: string): string {
  return `${API_URL}/announcements/${announcementId}/cover-photo`;
}

// Même forme que ClockPhotoAsset (api/timesheets.api.ts) : capturée soit via
// la caméra/galerie native, soit via pickWebImages sur web.
export interface AnnouncementPhotoAsset {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  file?: File;
}

interface ListAnnouncementsResponse {
  items: Announcement[];
  total: number;
  page: number;
  pageSize: number;
}

// Lecture ouverte à tout compte authentifié — seule la publication est
// réservée à RH/Superviseur/Direction/Admin (voir
// backend/src/modules/announcements/announcements.service.ts).
export async function listAnnouncements(page = 1, pageSize = 20): Promise<ListAnnouncementsResponse> {
  const { data } = await apiClient.get<ListAnnouncementsResponse>("/announcements", { params: { page, pageSize } });
  return data;
}

export async function getAnnouncement(id: string): Promise<Announcement> {
  const { data } = await apiClient.get<{ announcement: Announcement }>(`/announcements/${id}`);
  return data.announcement;
}

export async function createAnnouncement(
  input: { title: string; body: string },
  photo?: AnnouncementPhotoAsset
): Promise<Announcement> {
  const formData = new FormData();
  formData.append("title", input.title);
  formData.append("body", input.body);
  if (photo) {
    if (Platform.OS === "web" && photo.file) {
      formData.append("photo", photo.file, photo.fileName ?? photo.file.name);
    } else {
      formData.append("photo", {
        uri: photo.uri,
        name: photo.fileName ?? `actualite-${Date.now()}.jpg`,
        type: photo.mimeType ?? "image/jpeg",
      } as unknown as Blob);
    }
  }

  const { data } = await apiClient.post<{ announcement: Announcement }>("/announcements", formData);
  return data.announcement;
}
