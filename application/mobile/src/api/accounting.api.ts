import { apiClient } from "./client";

// Espace comptable (voir backend modules/accounting).
export interface AccountingOverview {
  month: string;
  staffCount: number;
  validatedHours: number;
  pendingHours: number;
  pendingEntries: number;
  absenceCount: number;
  absenceDaysByType: { type: string; label: string; days: number }[];
  documentsThisMonth: number;
}

export async function getAccountingOverview(month: string): Promise<AccountingOverview> {
  const { data } = await apiClient.get<{ overview: AccountingOverview }>("/accounting/overview", { params: { month } });
  return data.overview;
}

/** Dossier de paie du mois (Excel) : synthèse par salarié, congés, absences. */
export async function downloadPayrollPack(month: string): Promise<Uint8Array> {
  const { data } = await apiClient.get<ArrayBuffer>("/accounting/payroll-pack.xlsx", { params: { month }, responseType: "arraybuffer" });
  return new Uint8Array(data);
}
