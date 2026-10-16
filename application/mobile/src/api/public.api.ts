import { apiClient, API_URL } from "./client";

// Espace public (sans compte) : demande de devis envoyée par un particulier
// ou une entreprise — voir backend/src/modules/public.

export const PUBLIC_SERVICES = [
  "Nettoyage en profondeur",
  "Entretien régulier",
  "Bureaux & espaces pro",
  "Conciergerie",
  "Canapés & fauteuils",
  "Matelas",
  "Textiles, sols & vitres",
  "Remise en état",
  "Autre demande",
] as const;

export type PublicService = (typeof PUBLIC_SERVICES)[number];

export interface QuoteRequestInput {
  customerType: "INDIVIDUAL" | "BUSINESS" | "OWNER";
  companyName?: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  postalCode?: string;
  city?: string;
  service: PublicService;
  message: string;
  consent: true;
}

export async function submitQuoteRequest(input: QuoteRequestInput): Promise<string> {
  const { data } = await apiClient.post<{ message: string }>("/public/quote-requests", input);
  return data.message;
}

// Actualités de l'accueil public : celles que la RH ou la direction a choisi
// d'afficher pour tout le monde (signées « DEEP CLEAN », sans auteur).
export interface PublicNews {
  id: string;
  title: string;
  body: string;
  publishedAt: string;
  hasCoverPhoto: boolean;
}

export async function listPublicNews(page = 1, pageSize = 20): Promise<{ items: PublicNews[]; total: number }> {
  const { data } = await apiClient.get<{ items: PublicNews[]; total: number }>("/public/news", { params: { page, pageSize } });
  return data;
}

export async function getPublicNews(id: string): Promise<PublicNews> {
  const { data } = await apiClient.get<{ news: PublicNews }>(`/public/news/${id}`);
  return data.news;
}

export function publicNewsCoverUrl(id: string): string {
  return `${API_URL}/public/news/${id}/cover-photo`;
}

