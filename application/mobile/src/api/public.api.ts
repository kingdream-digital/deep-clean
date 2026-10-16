import { apiClient } from "./client";

// Espace public (sans compte) : demande de devis envoyée par un particulier
// ou une entreprise — voir backend/src/modules/public.

export const PUBLIC_SERVICES = [
  "Nettoyage approfondi",
  "Nettoyage standard",
  "Bureaux & espaces professionnels",
  "Nettoyage d'ameublement",
  "Nettoyage de matelas",
  "Textiles, sols & vitres",
  "Conciergerie",
  "Autre demande",
] as const;

export type PublicService = (typeof PUBLIC_SERVICES)[number];

export interface QuoteRequestInput {
  customerType: "INDIVIDUAL" | "BUSINESS";
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
