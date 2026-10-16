import { apiClient } from "./client";
import type { WelcomeOffer } from "./public.api";

// Réglage de l'offre de bienvenue (Direction / admin technique) — voir
// backend/src/modules/welcomeOffer.

export interface WelcomeOfferSettings extends WelcomeOffer {
  isActive: boolean;
  updatedAt: string;
}

export interface WelcomeOfferInput {
  isActive: boolean;
  rate: number;
  title: string;
  summary: string;
  conditions: string;
  startsAt: string;
  endsAt: string;
}

export async function getWelcomeOfferSettings(): Promise<WelcomeOfferSettings | null> {
  const { data } = await apiClient.get<{ offer: WelcomeOfferSettings | null }>("/welcome-offer");
  return data.offer;
}

export async function saveWelcomeOffer(input: WelcomeOfferInput): Promise<WelcomeOfferSettings> {
  const { data } = await apiClient.put<{ offer: WelcomeOfferSettings }>("/welcome-offer", input);
  return data.offer;
}
