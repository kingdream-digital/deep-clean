import { apiClient } from "./client";

export interface ActivityLogEntry {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  /** Nom de l'élément concerné (compte, chantier, devis…) quand il existe encore. */
  entityLabel: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  user: { id: string; firstName: string; lastName: string; email: string | null; role: string } | null;
}

interface ListActivityLogsResponse {
  items: ActivityLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListActivityLogsParams {
  userId?: string;
  action?: string;
  entityType?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

// Réservé à l'admin technique — voir backend/src/modules/activity/activity.routes.ts.
export async function listActivityLogs(params: ListActivityLogsParams = {}): Promise<ListActivityLogsResponse> {
  const { data } = await apiClient.get<ListActivityLogsResponse>("/activity-logs", { params: { pageSize: 50, ...params } });
  return data;
}

export async function listActivityActions(): Promise<string[]> {
  const { data } = await apiClient.get<{ actions: string[] }>("/activity-logs/actions");
  return data.actions;
}
