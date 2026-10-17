import { NotificationType } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { logActivity } from "../../utils/activityLog";
import { createNotification } from "../notifications/notifications.service";
import { COMMERCIAL_FULL_ROLES } from "../commercial/roles";

export interface QuoteRequestInput {
  customerType: "INDIVIDUAL" | "BUSINESS" | "OWNER";
  companyName?: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  postalCode?: string;
  city?: string;
  service: string;
  message?: string;
  website?: string;
}

/**
 * Demande de devis envoyée par un particulier ou une entreprise depuis
 * l'espace public de l'application (sans compte). Elle entre dans le module
 * commercial existant comme un prospect « Nouveau », non assigné, source
 * « Application », et la direction / la RH / l'admin (qui peuvent l'assigner)
 * en sont notifiés. Aucune donnée n'est jamais renvoyée au demandeur.
 */
export async function submitQuoteRequest(input: QuoteRequestInput, ctx: { ipAddress?: string }): Promise<void> {
  // Champ piège rempli : un robot. On répond comme si tout allait bien, sans
  // rien enregistrer ni notifier, pour ne pas lui apprendre à le contourner.
  if (input.website && input.website.trim() !== "") return;

  const contactName = `${input.firstName} ${input.lastName}`;
  const profile = { INDIVIDUAL: "particulier", BUSINESS: "professionnel", OWNER: "propriétaire, conciergerie" }[input.customerType];
  const companyName = input.customerType === "BUSINESS" && input.companyName ? input.companyName : `${contactName} (${profile})`;

  const prospect = await prisma.prospect.create({
    data: {
      companyName,
      contactFirstName: input.firstName,
      contactLastName: input.lastName,
      email: input.email,
      phone: input.phone,
      postalCode: input.postalCode,
      city: input.city,
      source: "Application (demande en ligne)",
      serviceType: input.service,
      need: input.message,
      notes: `Demande envoyée depuis l'espace public de l'application le ${new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}. Le demandeur a accepté d'être recontacté au sujet de sa demande.`,
    },
    select: { id: true },
  });

  await logActivity({
    action: "PUBLIC_QUOTE_REQUESTED",
    entityType: "Prospect",
    entityId: prospect.id,
    ipAddress: ctx.ipAddress,
    metadata: { service: input.service, customerType: input.customerType },
  });

  const recipients = await prisma.user.findMany({
    where: { isActive: true, role: { in: COMMERCIAL_FULL_ROLES } },
    select: { id: true },
  });
  const where = [input.postalCode, input.city].filter(Boolean).join(" ");
  for (const recipient of recipients) {
    await createNotification({
      userId: recipient.id,
      type: NotificationType.COMMERCIAL_UPDATE,
      title: "Nouvelle demande de devis",
      body: `${companyName} — ${input.service}${where ? ` à ${where}` : ""}. À recontacter (${input.phone ?? input.email}).`,
      relatedEntityType: "Prospect",
      relatedEntityId: prospect.id,
    });
  }
}
