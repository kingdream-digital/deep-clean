import { apiClient } from "./client";

export interface StatsOverview {
  generatedAt: string;
  sites: { total: number; active: number };
  employees: { total: number; active: number };
  missions: {
    scheduled: number;
    inProgress: number;
    completed: number;
    cancelled: number;
    upcoming7Days: number;
  };
  problems: {
    open: number;
    resolved: number;
    validated: number;
    missingMaterial: number;
  };
  validations: {
    validatedMissions: number;
    completedMissions: number;
    validationRatePercent: number;
  };
}

// Réservé Direction / Admin — voir backend/src/modules/stats/stats.routes.ts.
export async function getStatsOverview(): Promise<StatsOverview> {
  const { data } = await apiClient.get<StatsOverview>("/stats/overview");
  return data;
}

export interface StatsTrends {
  generatedAt: string;
  weeklyMissionTrends: {
    weekStart: string;
    completed: number;
    cancelled: number;
    validated: number;
    validationRatePercent: number;
  }[];
  topProblemSites: { siteId: string; siteName: string; problemCount: number }[];
  employeeLoad: {
    windowDays: number;
    items: { userId: string; name: string; firstName: string; lastName: string; hasAvatar: boolean; completedMissions: number }[];
  };
}

// Réservé Direction / Admin — voir backend/src/modules/stats/stats.routes.ts.
export async function getStatsTrends(): Promise<StatsTrends> {
  const { data } = await apiClient.get<StatsTrends>("/stats/trends");
  return data;
}
