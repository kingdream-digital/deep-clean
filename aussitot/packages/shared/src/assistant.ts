import type { ClientDto, InvoiceSummaryDto, MissionDto, QuoteSummaryDto } from "./dto";

/**
 * Protocole de l'assistant (chat + voix) entre l'API et l'app.
 *
 * L'app envoie un message (texte tapé ou dicté) ; l'API répond par un flux
 * d'événements (Server-Sent Events) : texte qui s'écrit au fil de l'eau,
 * outils métier exécutés, cartes de résultat, actions à confirmer.
 *
 * Règle de sûreté : toute action qui sort de l'entreprise (email à un client)
 * ou qui a une portée légale (émission d'une facture, encaissement,
 * annulation, planning d'autres personnes) n'est JAMAIS exécutée par
 * l'assistant seul — elle produit un événement `action_required` et attend
 * une confirmation explicite de l'utilisateur (bouton ou « oui » à la voix).
 */

export type AssistantCard =
  | { kind: "quote"; quote: QuoteSummaryDto }
  | { kind: "invoice"; invoice: InvoiceSummaryDto }
  | { kind: "client"; client: Pick<ClientDto, "id" | "name" | "email" | "phone" | "city"> }
  | { kind: "mission"; mission: MissionDto }
  | { kind: "list"; title: string; items: AssistantListItem[]; total?: number }
  | { kind: "metrics"; title: string; metrics: { label: string; value: string; tone?: "success" | "warning" | "danger" | "neutral" }[] };

export interface AssistantListItem {
  id: string;
  title: string;
  subtitle?: string;
  trailing?: string;
  /** Écran à ouvrir au toucher. */
  link?: string;
}

export type PendingActionStatus = "PENDING" | "CONFIRMED" | "CANCELLED" | "EXPIRED" | "FAILED";

export interface PendingActionDto {
  id: string;
  toolName: string;
  /** Titre court : « Envoyer le devis D-2026-0012 ». */
  title: string;
  /** Détails lisibles (destinataire, montant…), une ligne par élément. */
  details: string[];
  confirmLabel: string;
  status: PendingActionStatus;
  createdAt: string;
}

export type AssistantStreamEvent =
  | { type: "turn_start"; conversationId: string }
  | { type: "text_delta"; text: string }
  | { type: "tool_start"; toolUseId: string; name: string; label: string }
  | { type: "tool_end"; toolUseId: string; name: string; ok: boolean; summary?: string; card?: AssistantCard }
  | { type: "action_required"; action: PendingActionDto }
  | { type: "action_resolved"; actionId: string; status: PendingActionStatus; summary?: string; card?: AssistantCard }
  | { type: "navigate"; route: string }
  | { type: "turn_end"; stopReason: string }
  | { type: "error"; message: string; code?: string };

/** Élément de l'historique tel que l'app l'affiche. */
export type AssistantTranscriptItem =
  | { kind: "user"; id: string; text: string; mode: "text" | "voice"; createdAt: string }
  | { kind: "assistant"; id: string; text: string; createdAt: string }
  | { kind: "tool"; id: string; name: string; label: string; ok: boolean; summary?: string; card?: AssistantCard }
  | { kind: "action"; id: string; action: PendingActionDto; resultSummary?: string; card?: AssistantCard };

export interface AssistantConversationDto {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  items: AssistantTranscriptItem[];
  pendingActions: PendingActionDto[];
}

export interface AssistantStatusDto {
  enabled: boolean;
  /** Raison lisible quand l'assistant n'est pas disponible. */
  reason: string | null;
  monthlyQuota: number;
  usedThisMonth: number;
}

/** Mots qui valent confirmation / refus à la voix quand une action attend. */
export const VOICE_CONFIRM_WORDS = ["oui", "ok", "d'accord", "vas-y", "vas y", "confirme", "je confirme", "valide", "c'est bon", "envoie", "go"];
export const VOICE_CANCEL_WORDS = ["non", "annule", "stop", "laisse tomber", "pas maintenant", "attends"];

function normalizeUtterance(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[.!?,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** « Oui, vas-y » → "confirm" ; « non merci » → "cancel" ; sinon null (message normal). */
export function classifyConfirmation(text: string): "confirm" | "cancel" | null {
  const t = normalizeUtterance(text);
  if (t.split(" ").length > 6) return null;
  const has = (words: string[]) => words.some((w) => {
    const n = normalizeUtterance(w);
    return t === n || t.startsWith(`${n} `) || t.endsWith(` ${n}`) || t.includes(` ${n} `);
  });
  if (has(VOICE_CANCEL_WORDS)) return "cancel";
  if (has(VOICE_CONFIRM_WORDS)) return "confirm";
  return null;
}
