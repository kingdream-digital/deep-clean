import { apiClient } from "./client";
import type { Role } from "./auth.api";

export interface Announcement {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  author: {
    id: string;
    firstName: string;
    lastName: string;
    role: Role;
  };
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

export async function createAnnouncement(input: { title: string; body: string }): Promise<Announcement> {
  const { data } = await apiClient.post<{ announcement: Announcement }>("/announcements", input);
  return data.announcement;
}
