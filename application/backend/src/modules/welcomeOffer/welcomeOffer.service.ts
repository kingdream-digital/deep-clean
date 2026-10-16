import { prisma } from "../../db/prisma";
import { logActivity } from "../../utils/activityLog";
import type { UpdateWelcomeOfferInput } from "./welcomeOffer.validation";

const publicSelect = { id: true, rate: true, title: true, summary: true, conditions: true, startsAt: true, endsAt: true } as const;

/**
 * Offre visible du public : seulement si elle est active ET dans ses dates —
 * le bandeau disparaît seul à la date de fin, sans nouvelle version de l'app.
 */
export async function getCurrentWelcomeOffer(now = new Date()) {
  return prisma.welcomeOffer.findFirst({
    where: { isActive: true, startsAt: { lte: now }, endsAt: { gte: now } },
    select: publicSelect,
    orderBy: { updatedAt: "desc" },
  });
}

/** Réglage complet (même inactif) pour l'écran de gestion. */
export async function getWelcomeOfferSettings() {
  return prisma.welcomeOffer.findFirst({
    select: { ...publicSelect, isActive: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
}

/** Une seule offre : créée au premier enregistrement, mise à jour ensuite. */
export async function saveWelcomeOffer(input: UpdateWelcomeOfferInput, actor: { userId: string; ipAddress?: string }) {
  const existing = await prisma.welcomeOffer.findFirst({ select: { id: true }, orderBy: { updatedAt: "desc" } });
  const data = { ...input, updatedById: actor.userId };
  const offer = existing
    ? await prisma.welcomeOffer.update({ where: { id: existing.id }, data, select: { ...publicSelect, isActive: true, updatedAt: true } })
    : await prisma.welcomeOffer.create({ data, select: { ...publicSelect, isActive: true, updatedAt: true } });
  await logActivity({
    userId: actor.userId,
    action: "WELCOME_OFFER_UPDATED",
    entityType: "WelcomeOffer",
    entityId: offer.id,
    ipAddress: actor.ipAddress,
    metadata: { isActive: offer.isActive, rate: offer.rate, startsAt: offer.startsAt, endsAt: offer.endsAt },
  });
  return offer;
}
