import { apiClient } from "./client";
import { countWorkableDays } from "../utils/frenchCalendar";

// Solde de congés payés, en jours OUVRABLES (lundi → samedi, hors fériés) —
// voir leave.service.ts côté serveur pour les règles d'acquisition.
export interface LeaveBalance {
  userId: string;
  year: number;
  // Acquis VALIDÉ par la RH (+ corrections).
  acquired: number;
  taken: number;
  pending: number;
  remaining: number;
  // Acquis calculé, pas encore validé par la RH.
  toValidate: number;
  // Période de référence en cours (1er juin → 31 mai).
  period: { start: string; end: string; acquired: number; cap: number };
  // Mois en cours, estimation jusqu'à aujourd'hui.
  currentMonth: { month: string; estimatedDays: number };
  // Congés de l'an dernier, à prendre avant le 31 mai (`deadline`).
  previousYear: { periodYear: number; acquired: number; used: number; remaining: number; deadline: string };
  // Congés de l'année en cours d'acquisition.
  currentYear: { periodYear: number; acquired: number; used: number; remaining: number; usableFrom: string };
  // Reliquat non pris au 31 mai (`on`) : perdu, sauf report accordé par la RH.
  expired: { days: number; on: string };
  monthlyRate: number;
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

// Même calcul que le serveur (jours ouvrables, hors fériés) — aperçu
// instantané dans le formulaire de demande ; la valeur qui compte reste celle
// calculée par le serveur (Absence.daysCount).
export function countBusinessDaysPreview(startDate: Date, endDate: Date): number {
  const asUtcDay = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  return countWorkableDays(asUtcDay(startDate), asUtcDay(endDate));
}

// ---------------------------------------------------------------------------
// Relevés mensuels de congés acquis (RH)
// ---------------------------------------------------------------------------

export interface LeaveAccrualDetails {
  month: string;
  monthDays: number;
  consideredDays: number;
  workedDays: number;
  assimilatedDays: number;
  sickDays: number;
  unpaidDays: number;
  rate: number;
  sickRate: number;
  rawDays: number;
  capped: boolean;
}

export interface LeaveAccrual {
  id: string;
  userId: string;
  user: { id: string; firstName: string; lastName: string; role: string; weeklyHours: number | null };
  month: string;
  computedDays: number;
  days: number;
  details: LeaveAccrualDetails;
  status: "PROPOSED" | "VALIDATED";
  note: string | null;
  validatedAt: string | null;
  validatedBy: { id: string; firstName: string; lastName: string } | null;
}

export async function listLeaveAccruals(params: { month?: string; status?: "PROPOSED" | "VALIDATED" } = {}): Promise<LeaveAccrual[]> {
  const { data } = await apiClient.get<{ items: LeaveAccrual[] }>("/leave/accruals", { params });
  return data.items;
}

export async function validateLeaveAccrual(id: string, input: { days?: number; note?: string } = {}): Promise<LeaveAccrual> {
  const { data } = await apiClient.post<{ accrual: LeaveAccrual }>(`/leave/accruals/${id}/validate`, input);
  return data.accrual;
}

export async function validateLeaveMonth(month: string): Promise<number> {
  const { data } = await apiClient.post<{ validated: number }>("/leave/accruals/validate-month", { month });
  return data.validated;
}
