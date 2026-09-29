import { apiClient } from "./client";

// Détail du calcul d'acquisition — purement informatif (transparence du
// solde), voir leave.service.ts côté serveur pour la formule exacte.
export interface LeaveAccrualBreakdown {
  monthlyRate: number;
  cap: number | null;
  daysElapsed: number;
  monthsAccrued: number;
  rawAccrued: number;
  accrued: number;
}

export interface LeaveBalance {
  userId: string;
  year: number;
  acquired: number;
  taken: number;
  pending: number;
  remaining: number;
  breakdown: LeaveAccrualBreakdown;
}

export async function getLeaveBalance(userId: string, year?: number): Promise<LeaveBalance> {
  const { data } = await apiClient.get<{ balance: LeaveBalance }>(`/leave/${userId}/balance`, { params: { year } });
  return data.balance;
}

export type LeaveTransactionType = "LEAVE_TAKEN" | "LEAVE_CANCELLED" | "ADJUSTMENT";

export interface LeaveTransaction {
  id: string;
  type: LeaveTransactionType;
  days: number;
  occurredAt: string;
  note: string | null;
  absenceId: string | null;
  createdBy: { id: string; firstName: string; lastName: string };
}

export async function listLeaveTransactions(userId: string, year?: number): Promise<LeaveTransaction[]> {
  const { data } = await apiClient.get<{ items: LeaveTransaction[] }>(`/leave/${userId}/transactions`, { params: { year } });
  return data.items;
}

// Réservé RH/direction/superviseur/admin (voir leave.service.ts::createLeaveAdjustment).
export async function createLeaveAdjustment(userId: string, days: number, note?: string): Promise<LeaveTransaction> {
  const { data } = await apiClient.post<{ transaction: LeaveTransaction }>(`/leave/${userId}/adjustments`, { days, note });
  return data.transaction;
}

// Même calcul que countBusinessDays côté serveur (leave.service.ts) — utilisé
// uniquement pour un aperçu instantané dans le formulaire de demande, avant
// tout appel réseau ; la valeur qui compte réellement (affichée après
// création, déduite à la validation) reste toujours celle calculée par le
// serveur (voir Absence.daysCount).
export function countBusinessDaysPreview(startDate: Date, endDate: Date): number {
  let count = 0;
  const cursor = new Date(startDate);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  while (cursor <= end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}
