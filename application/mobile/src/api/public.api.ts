import { apiClient } from "./client";

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
  message?: string;
  consent: true;
}

export async function submitQuoteRequest(input: QuoteRequestInput): Promise<string> {
  const { data } = await apiClient.post<{ message: string }>("/public/quote-requests", input);
  return data.message;
}
