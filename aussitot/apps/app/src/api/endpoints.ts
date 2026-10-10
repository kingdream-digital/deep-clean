import type {
  ActivityDto,
  AssistantConversationDto,
  AssistantStatusDto,
  AuthResponseDto,
  CatalogItemDto,
  CatalogItemInput,
  ClientDto,
  ClientInput,
  CreatedUserDto,
  CreateInvoiceInput,
  CreateMissionInput,
  CreateQuoteInput,
  CreateUserInput,
  DashboardDto,
  InvoiceDto,
  InvoiceSummaryDto,
  LoginInput,
  MissionDto,
  NotificationDto,
  OrganizationDto,
  OrganizationSettingsInput,
  Page,
  QuoteDto,
  QuoteSummaryDto,
  RecordPaymentInput,
  SendDocumentInput,
  SessionUserDto,
  SiteDto,
  UpdateInvoiceInput,
  UpdateMissionInput,
  UpdateQuoteInput,
  UpdateUserInput,
  UserDto,
  Role,
} from "@aussitot/shared";
import { Platform } from "react-native";
import { api, API_URL, ApiError, getAccessToken, parseError, qs, request } from "./client";

/** Appels à l'API, typés avec les formats partagés (packages/shared). */
export const endpoints = {
  auth: {
    login: (input: LoginInput) => request<AuthResponseDto>("POST", "/v1/auth/login", { body: input, auth: false }),
    me: () => api.get<SessionUserDto>("/v1/auth/me"),
    logout: () => api.post<{ ok: true }>("/v1/auth/logout"),
    changePassword: (currentPassword: string, newPassword: string) =>
      api.post<{ ok: true }>("/v1/auth/change-password", { currentPassword, newPassword }),
  },
  dashboard: () => api.get<DashboardDto>("/v1/dashboard"),
  activity: () => api.get<Page<ActivityDto>>("/v1/activity?limit=50"),
  organization: {
    get: () => api.get<OrganizationDto>("/v1/organization"),
    update: (input: OrganizationSettingsInput) => api.put<OrganizationDto>("/v1/organization", input),
    logoUrl: () => `${API_URL}/v1/organization/logo`,
  },
  users: {
    list: (q?: string, includeInactive?: boolean) => api.get<UserDto[]>(`/v1/users${qs({ q, includeInactive })}`),
    staff: () => api.get<{ id: string; firstName: string; lastName: string; role: Role }[]>("/v1/users/staff"),
    get: (id: string) => api.get<UserDto>(`/v1/users/${id}`),
    create: (input: CreateUserInput) => api.post<CreatedUserDto>("/v1/users", input),
    update: (id: string, input: UpdateUserInput) => api.patch<UserDto>(`/v1/users/${id}`, input),
    deactivate: (id: string) => api.post<UserDto>(`/v1/users/${id}/deactivate`),
    reactivate: (id: string) => api.post<UserDto>(`/v1/users/${id}/reactivate`),
    resetAccess: (id: string) => api.post<CreatedUserDto>(`/v1/users/${id}/reset-access`),
  },
  clients: {
    list: (q?: string, cursor?: string) => api.get<Page<ClientDto>>(`/v1/clients${qs({ q, cursor, limit: 50 })}`),
    get: (id: string) => api.get<ClientDto>(`/v1/clients/${id}`),
    create: (input: ClientInput) => api.post<ClientDto>("/v1/clients", input),
    update: (id: string, input: Partial<ClientInput>) => api.patch<ClientDto>(`/v1/clients/${id}`, input),
  },
  catalog: {
    list: (q?: string) => api.get<CatalogItemDto[]>(`/v1/catalog${qs({ q })}`),
    create: (input: CatalogItemInput) => api.post<CatalogItemDto>("/v1/catalog", input),
    update: (id: string, input: Partial<CatalogItemInput>) => api.patch<CatalogItemDto>(`/v1/catalog/${id}`, input),
  },
  sites: {
    list: (params: { q?: string; clientId?: string } = {}) => api.get<SiteDto[]>(`/v1/sites${qs(params)}`),
  },
  quotes: {
    list: (params: { status?: string; clientId?: string; q?: string; cursor?: string } = {}) =>
      api.get<Page<QuoteSummaryDto>>(`/v1/quotes${qs({ ...params, limit: 50 })}`),
    get: (id: string) => api.get<QuoteDto>(`/v1/quotes/${id}`),
    create: (input: CreateQuoteInput) => api.post<QuoteDto>("/v1/quotes", input),
    update: (id: string, input: UpdateQuoteInput) => api.patch<QuoteDto>(`/v1/quotes/${id}`, input),
    remove: (id: string) => api.delete<void>(`/v1/quotes/${id}`),
    send: (id: string, input: SendDocumentInput) => api.post<QuoteDto>(`/v1/quotes/${id}/send`, input),
    accept: (id: string) => api.post<QuoteDto>(`/v1/quotes/${id}/accept`),
    decline: (id: string) => api.post<QuoteDto>(`/v1/quotes/${id}/decline`),
    cancel: (id: string) => api.post<QuoteDto>(`/v1/quotes/${id}/cancel`),
    duplicate: (id: string) => api.post<QuoteDto>(`/v1/quotes/${id}/duplicate`),
    pdfPath: (id: string) => `/v1/quotes/${id}/pdf`,
  },
  invoices: {
    list: (params: { status?: string; overdue?: boolean; unpaid?: boolean; clientId?: string; q?: string; cursor?: string } = {}) =>
      api.get<Page<InvoiceSummaryDto>>(`/v1/invoices${qs({ ...params, limit: 50 })}`),
    get: (id: string) => api.get<InvoiceDto>(`/v1/invoices/${id}`),
    create: (input: CreateInvoiceInput) => api.post<InvoiceDto>("/v1/invoices", input),
    fromQuote: (quoteId: string) => api.post<InvoiceDto>(`/v1/invoices/from-quote/${quoteId}`),
    update: (id: string, input: UpdateInvoiceInput) => api.patch<InvoiceDto>(`/v1/invoices/${id}`, input),
    remove: (id: string) => api.delete<void>(`/v1/invoices/${id}`),
    issue: (id: string) => api.post<InvoiceDto>(`/v1/invoices/${id}/issue`),
    send: (id: string, input: SendDocumentInput) => api.post<InvoiceDto>(`/v1/invoices/${id}/send`, input),
    remind: (id: string, input: SendDocumentInput) => api.post<InvoiceDto>(`/v1/invoices/${id}/remind`, input),
    pay: (id: string, input: RecordPaymentInput) => api.post<InvoiceDto>(`/v1/invoices/${id}/payments`, input),
    cancel: (id: string, reason?: string) => api.post<InvoiceDto>(`/v1/invoices/${id}/cancel`, { reason }),
    pdfPath: (id: string) => `/v1/invoices/${id}/pdf`,
  },
  missions: {
    planning: (from: string, to: string, userId?: string) => api.get<MissionDto[]>(`/v1/missions${qs({ from, to, userId })}`),
    get: (id: string) => api.get<MissionDto>(`/v1/missions/${id}`),
    create: (input: CreateMissionInput) => api.post<MissionDto>("/v1/missions", input),
    update: (id: string, input: UpdateMissionInput) => api.patch<MissionDto>(`/v1/missions/${id}`, input),
    cancel: (id: string, reason?: string) => api.post<MissionDto>(`/v1/missions/${id}/cancel`, { reason }),
    start: (id: string) => api.post<MissionDto>(`/v1/missions/${id}/start`),
    finish: (id: string) => api.post<MissionDto>(`/v1/missions/${id}/finish`),
    validate: (id: string) => api.post<MissionDto>(`/v1/missions/${id}/validate`),
    setInstructions: (id: string, instructions: string | null) => api.put<MissionDto>(`/v1/missions/${id}/instructions`, { instructions }),
  },
  notifications: {
    list: (cursor?: string) => api.get<Page<NotificationDto>>(`/v1/notifications${qs({ cursor, limit: 40 })}`),
    unreadCount: () => api.get<{ count: number }>("/v1/notifications/unread-count"),
    markRead: (ids: string[] | "all") => api.post<{ updated: number }>("/v1/notifications/read", ids === "all" ? { all: true } : { ids }),
    registerPushToken: (token: string, platform: "ios" | "android" | "web") =>
      api.post<{ ok: true }>("/v1/notifications/push-token", { token, platform }),
    unregisterPushToken: (token: string) => api.delete<{ ok: true }>("/v1/notifications/push-token", { token }),
  },
  assistant: {
    status: () => api.get<AssistantStatusDto>("/v1/assistant/status"),
    conversations: () => api.get<{ id: string; title: string | null; updatedAt: string }[]>("/v1/assistant/conversations"),
    createConversation: () => api.post<{ id: string }>("/v1/assistant/conversations"),
    conversation: (id: string) => api.get<AssistantConversationDto>(`/v1/assistant/conversations/${id}`),
  },
};

/** Téléchargement authentifié d'un fichier privé (PDF, logo) : aucun fichier n'a d'adresse publique. */
export async function fetchPrivateFile(path: string): Promise<Blob> {
  const res = await fetch(`${API_URL}${path}`, { headers: { authorization: `Bearer ${getAccessToken() ?? ""}` }, credentials: "include" });
  if (!res.ok) throw new Error("Fichier indisponible");
  return res.blob();
}

/** Envoi du logo de l'entreprise (PNG, JPEG ou WebP, 2 Mo au plus ; nettoyé et converti par le serveur). */
export async function uploadLogo(file: { uri: string; name: string; type: string; webFile?: Blob }): Promise<OrganizationDto> {
  await endpoints.auth.me(); // jeton d'accès frais
  const form = new FormData();
  if (file.webFile) form.append("file", file.webFile, file.name);
  else form.append("file", { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
  let res: Response;
  try {
    res = await fetch(`${API_URL}/v1/organization/logo`, {
      method: "PUT",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${getAccessToken() ?? ""}`,
        "x-client-platform": Platform.OS === "web" ? "web" : "native",
      },
      body: form,
      credentials: "include",
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Pas de connexion internet.");
  }
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as OrganizationDto;
}
