import { apiClient } from "./client";

// Tableau de bord commercial (cahier des charges §35-37) — purement
// informatif : n'affiche que des indicateurs, ne déclenche jamais aucune
// action (aucune mission, aucun chantier, aucune facture créée en le
// consultant).
export interface SiteAttention {
  siteId: string;
  siteName: string;
  remainingVisits: number;
}

export interface CommercialDashboard {
  commercial: {
    activeProspects: number;
    quotesInProgress: number;
    quotesToFollowUp: number;
    quotesAccepted: number;
    quotesRejected: number;
  };
  sites: {
    activeSites: number;
    period: string;
    plannedVisits: number;
    completedVisits: number;
    remainingVisits: number;
    sitesNeedingAttention: SiteAttention[];
  };
  // Absent (jamais un objet vide) pour un Superviseur — la facturation ne
  // figure pas dans sa liste de permissions.
  invoicing: {
    toPrepare: number;
    validated: number;
    sent: number;
    paid: number;
    projectedMonthlyRevenueHt: number;
  } | null;
}

export async function getCommercialDashboard(): Promise<CommercialDashboard> {
  const { data } = await apiClient.get<{ dashboard: CommercialDashboard }>("/commercial-dashboard");
  return data.dashboard;
}
