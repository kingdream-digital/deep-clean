import { apiClient } from "./client";
import type { Role } from "./auth.api";

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
  body: string;
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

export async function sendMessage(recipientId: string, body: string): Promise<ChatMessage> {
  const { data } = await apiClient.post<{ message: ChatMessage }>("/messages", { recipientId, body });
  return data.message;
}

export async function markThreadRead(userId: string): Promise<void> {
  await apiClient.post(`/messages/with/${userId}/read`);
}
