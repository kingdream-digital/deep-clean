import { Platform } from "react-native";
import { apiClient, API_URL } from "./client";
import type { Role } from "./auth.api";
import type { LocalPhotoAsset } from "./problems.api";

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: Role;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  recipientId: string;
  // Optionnel depuis l'ajout de la photo jointe (retour explicite du client)
  // : un message peut être une photo seule, sans texte.
  body: string | null;
  // Jamais la clé de stockage elle-même — voir messagePhotoUrl() ci-dessous
  // et le même principe que Announcement.hasCoverPhoto.
  hasPhoto: boolean;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface Conversation {
  user: Contact;
  lastMessage: ChatMessage;
  unreadCount: number;
}

export async function listContacts(): Promise<Contact[]> {
  const { data } = await apiClient.get<{ items: Contact[] }>("/messages/contacts");
  return data.items;
}

export async function getContact(id: string): Promise<Contact> {
  const { data } = await apiClient.get<{ contact: Contact }>(`/messages/contacts/${id}`);
  return data.contact;
}

export async function listConversations(): Promise<Conversation[]> {
  const { data } = await apiClient.get<{ items: Conversation[] }>("/messages/conversations");
  return data.items;
}

export async function getUnreadMessagesCount(): Promise<number> {
  const { data } = await apiClient.get<{ unreadCount: number }>("/messages/unread-count");
  return data.unreadCount;
}

interface ThreadResponse {
  items: ChatMessage[];
  total: number;
  page: number;
  pageSize: number;
}

export async function getThread(userId: string, page = 1, pageSize = 50): Promise<ThreadResponse> {
  const { data } = await apiClient.get<ThreadResponse>(`/messages/with/${userId}`, { params: { page, pageSize } });
  return data;
}

// Jamais d'URL publique permanente (voir CLAUDE.md section 11) : chaque
// affichage repasse par une requête authentifiée, voir components/AuthenticatedImage.tsx.
export function messagePhotoUrl(messageId: string): string {
  return `${API_URL}/messages/${messageId}/photo`;
}

export async function sendMessage(recipientId: string, body?: string, photo?: LocalPhotoAsset): Promise<ChatMessage> {
  const formData = new FormData();
  formData.append("recipientId", recipientId);
  if (body) formData.append("body", body);
  if (photo) {
    if (Platform.OS === "web" && photo.file) {
      formData.append("photo", photo.file, photo.fileName ?? photo.file.name);
    } else {
      formData.append("photo", {
        uri: photo.uri,
        name: photo.fileName ?? `message-${Date.now()}.jpg`,
        type: photo.mimeType ?? "image/jpeg",
      } as unknown as Blob);
    }
  }

  const { data } = await apiClient.post<{ message: ChatMessage }>("/messages", formData);
  return data.message;
}

export async function markThreadRead(userId: string): Promise<void> {
  await apiClient.post(`/messages/with/${userId}/read`);
}
