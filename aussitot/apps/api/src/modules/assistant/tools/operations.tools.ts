import { z } from "zod";
import { can, formatDayLong, formatTimeSpoken, ROLE_LABELS } from "@aussitot/shared";
import { AppError } from "../../../lib/errors.ts";
import type { Ctx } from "../../../lib/context.ts";
import { todayIn } from "../../../lib/time.ts";
import * as missions from "../../missions/missions.service.ts";
import * as users from "../../users/users.service.ts";
import { salesMetrics } from "../../dashboard/dashboard.service.ts";
import { defineTool } from "./types.ts";
import { euros, missionForModel, missionListItem } from "./common.ts";

const timeSchema = z.iso.time({ precision: -1 }).describe("Heure HH:MM (24 h).");

export const getPlanning = defineTool({
  name: "get_planning",
  description:
    "Planning des missions sur une période (par défaut : aujourd'hui). Un employé ne voit que ses propres missions. Pour une personne précise, passer user_id (obtenu via list_team).",
  input: z.object({
    from: z.iso.date().optional().describe("Début AAAA-MM-JJ (défaut : aujourd'hui)."),
    to: z.iso.date().optional().describe("Fin AAAA-MM-JJ incluse (défaut : = from). 62 jours au plus."),
    user_id: z.uuid().optional(),
    only_mine: z.boolean().optional().describe("Vrai pour « mes missions »."),
  }),
  label: () => "Consultation du planning",
  run: async (ctx, i) => {
    const from = i.from ?? todayIn(ctx.timezone);
    const to = i.to ?? from;
    const list = await missions.listPlanning(ctx, { from, to, userId: i.only_mine ? ctx.userId : i.user_id });
    const active = list.filter((m) => m.status !== "CANCELLED");
    return {
      content: active.length ? active.map(missionForModel) : { resultat: "Aucune mission sur cette période." },
      card: active.length
        ? {
            kind: "list",
            title: from === to ? `Planning — ${formatDayLong(from, { year: false })}` : "Planning",
            items: active.map(missionListItem),
          }
        : undefined,
    };
  },
});

export const getMission = defineTool({
  name: "get_mission",
  description: "Détail d'une mission : horaire, lieu, équipe, consigne, statut.",
  input: z.object({ mission_id: z.uuid() }),
  label: () => "Ouverture de la mission",
  run: async (ctx, i) => {
    const m = await missions.getMission(ctx, i.mission_id);
    return { content: missionForModel(m), card: { kind: "mission", mission: m } };
  },
});

export const listTeam = defineTool({
  name: "list_team",
  description:
    "Liste des personnes de l'entreprise (prénom, nom, rôle, identifiant) — pour affecter une mission ou consulter le planning de quelqu'un.",
  input: z.object({ query: z.string().max(100).optional().describe("Prénom ou nom recherché.") }),
  permissions: ["planning.manage", "users.read"],
  label: () => "Consultation de l'équipe",
  run: async (ctx, i) => {
    const staff = can(ctx.role, "planning.manage") ? await users.listAssignableStaff(ctx) : await users.listUsers(ctx, {});
    const q = i.query?.trim().toLowerCase();
    const filtered = q ? staff.filter((p) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(q)) : staff;
    return { content: filtered.slice(0, 50).map((p) => ({ id: p.id, nom: `${p.firstName} ${p.lastName}`, role: ROLE_LABELS[p.role] })) };
  },
});

async function describeSlot(ctx: Ctx, date: string, start: string, end: string, assigneeIds: string[]): Promise<string[]> {
  const staff = await users.listAssignableStaff(ctx);
  const names = assigneeIds
    .map((id) => staff.find((s) => s.id === id))
    .map((p) => (p ? `${p.firstName} ${p.lastName}` : "personne inconnue"));
  return [`${formatDayLong(date)}, de ${formatTimeSpoken(start)} à ${formatTimeSpoken(end)}`, `Équipe : ${names.join(", ") || "—"}`];
}

export const createMission = defineTool({
  name: "create_mission",
  description:
    "Planifie une mission et prévient les personnes affectées (notification). Identifiants des personnes via list_team, du lieu via search_sites, du client via search_clients. Nécessite confirmation.",
  input: z.object({
    title: z.string().min(1).max(160),
    date: z.iso.date().describe("Jour AAAA-MM-JJ."),
    start_time: timeSchema,
    end_time: timeSchema,
    assignee_ids: z.array(z.uuid()).min(1).max(50),
    team_lead_id: z.uuid().optional(),
    site_id: z.uuid().optional(),
    client_id: z.uuid().optional(),
    instructions: z.string().max(4000).optional().describe("Consigne pour l'équipe."),
  }),
  permissions: ["planning.manage"],
  confirm: true,
  label: () => "Préparation de la mission",
  describe: async (ctx, i) => {
    if (i.end_time <= i.start_time) throw AppError.badRequest("L'heure de fin doit suivre l'heure de début.");
    return {
      title: `Planifier « ${i.title} »`,
      details: [
        ...(await describeSlot(ctx, i.date, i.start_time, i.end_time, i.assignee_ids)),
        ...(i.instructions ? [`Consigne : ${i.instructions}`] : []),
        "Les personnes affectées seront prévenues.",
      ],
      confirmLabel: "Planifier",
    };
  },
  run: async (ctx, i) => {
    const m = await missions.createMission(ctx, {
      title: i.title,
      date: i.date,
      startTime: i.start_time,
      endTime: i.end_time,
      assigneeIds: i.assignee_ids,
      teamLeadId: i.team_lead_id,
      siteId: i.site_id,
      clientId: i.client_id,
      instructions: i.instructions,
    });
    return { content: missionForModel(m), summary: `Mission « ${m.title} » planifiée`, card: { kind: "mission", mission: m } };
  },
});

export const updateMission = defineTool({
  name: "update_mission",
  description:
    "Modifie une mission (date, horaire, équipe, titre, consigne). Chaque personne concernée est prévenue de ce qui change pour elle. Nécessite confirmation.",
  input: z.object({
    mission_id: z.uuid(),
    title: z.string().min(1).max(160).optional(),
    date: z.iso.date().optional(),
    start_time: timeSchema.optional(),
    end_time: timeSchema.optional(),
    assignee_ids: z.array(z.uuid()).min(1).max(50).optional().describe("Liste COMPLÈTE de l'équipe après modification."),
    instructions: z.string().max(4000).optional(),
  }),
  permissions: ["planning.manage"],
  confirm: true,
  label: () => "Préparation de la modification",
  describe: async (ctx, i) => {
    const m = await missions.getMission(ctx, i.mission_id);
    const date = i.date ?? m.date;
    const start = i.start_time ?? m.startTime;
    const end = i.end_time ?? m.endTime;
    const assignees = i.assignee_ids ?? m.assignees.map((a) => a.id);
    return {
      title: `Modifier « ${i.title ?? m.title} »`,
      details: [
        ...(await describeSlot(ctx, date, start, end, assignees)),
        ...(i.instructions ? [`Consigne : ${i.instructions}`] : []),
        "Les personnes concernées seront prévenues.",
      ],
      confirmLabel: "Enregistrer",
    };
  },
  run: async (ctx, i) => {
    const m = await missions.updateMission(ctx, i.mission_id, {
      title: i.title,
      date: i.date,
      startTime: i.start_time,
      endTime: i.end_time,
      assigneeIds: i.assignee_ids,
      instructions: i.instructions,
    });
    return { content: missionForModel(m), summary: `Mission « ${m.title} » modifiée`, card: { kind: "mission", mission: m } };
  },
});

export const cancelMission = defineTool({
  name: "cancel_mission",
  description: "Annule une mission et prévient l'équipe. Nécessite confirmation.",
  input: z.object({ mission_id: z.uuid(), reason: z.string().max(300).optional() }),
  permissions: ["planning.manage"],
  confirm: true,
  label: () => "Préparation de l'annulation",
  describe: async (ctx, i) => {
    const m = await missions.getMission(ctx, i.mission_id);
    return {
      title: `Annuler « ${m.title} »`,
      details: [
        `${formatDayLong(m.date)}, ${m.startTime}–${m.endTime}`,
        `Équipe prévenue : ${m.assignees.map((a) => a.firstName).join(", ")}`,
        ...(i.reason ? [`Motif : ${i.reason}`] : []),
      ],
      confirmLabel: "Annuler la mission",
    };
  },
  run: async (ctx, i) => {
    const m = await missions.cancelMission(ctx, i.mission_id, i.reason);
    return { content: missionForModel(m), summary: `Mission « ${m.title} » annulée` };
  },
});

export const businessSummary = defineTool({
  name: "business_summary",
  description: "Chiffres clés : devis en attente de réponse, factures en retard, facturé et encaissé ce mois-ci, brouillons à finaliser.",
  input: z.object({}),
  permissions: ["quotes.read"],
  label: () => "Calcul des chiffres clés",
  run: async (ctx) => {
    const m = await salesMetrics(ctx);
    const content = {
      devis_en_attente: m.quotesToFollowUp,
      montant_devis_en_attente: euros(m.quotesPendingCents),
      factures_en_retard: m.invoicesOverdueCount,
      montant_en_retard: euros(m.invoicesOverdueCents),
      facture_ce_mois: euros(m.invoicedThisMonthCents),
      encaisse_ce_mois: euros(m.collectedThisMonthCents),
      brouillons_de_facture: m.draftsCount,
    };
    return {
      content,
      card: {
        kind: "metrics",
        title: "Activité du mois",
        metrics: [
          { label: "Facturé", value: content.facture_ce_mois },
          { label: "Encaissé", value: content.encaisse_ce_mois, tone: "success" },
          { label: "En retard", value: content.montant_en_retard, tone: m.invoicesOverdueCount ? "danger" : "neutral" },
          { label: "Devis en attente", value: `${m.quotesToFollowUp} · ${content.montant_devis_en_attente}`, tone: "neutral" },
        ],
      },
    };
  },
});

const SCREENS = {
  accueil: "/",
  planning: "/planning",
  devis: "/devis",
  factures: "/factures",
  clients: "/clients",
  equipe: "/equipe",
  notifications: "/notifications",
  profil: "/profil",
  reglages: "/reglages",
  devis_detail: "/devis/{id}",
  facture_detail: "/factures/{id}",
  client_detail: "/clients/{id}",
  mission_detail: "/planning/{id}",
} as const;

export const openScreen = defineTool({
  name: "open_screen",
  description:
    "Ouvre un écran de l'application pour l'utilisateur (« montre-moi les factures », « ouvre le devis »). Les écrans *_detail exigent l'identifiant de l'élément.",
  input: z.object({ screen: z.enum(Object.keys(SCREENS) as [keyof typeof SCREENS, ...(keyof typeof SCREENS)[]]), id: z.uuid().optional() }),
  label: () => "Ouverture de l'écran",
  run: async (_ctx, i) => {
    const pattern: string = SCREENS[i.screen];
    if (pattern.includes("{id}") && !i.id) throw AppError.badRequest("Identifiant requis pour cet écran.");
    const route = pattern.replace("{id}", i.id ?? "");
    return { content: { ecran_ouvert: i.screen }, navigate: route };
  },
});
