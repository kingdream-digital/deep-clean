import type Anthropic from "@anthropic-ai/sdk";
import type { AssistantStreamEvent, PendingActionDto, PendingActionStatus } from "@aussitot/shared";
import { withTenant } from "../../lib/db.ts";
import { AppError } from "../../lib/errors.ts";
import { logger } from "../../lib/logger.ts";
import { logActivity } from "../../lib/audit.ts";
import { assistantToolCalls, assistantTurns } from "../../lib/metrics.ts";
import type { Ctx } from "../../lib/context.ts";
import type { Prisma } from "../../generated/prisma/client.ts";
import { env } from "../../config/env.ts";
import { getLlm } from "./llm.ts";
import { SYSTEM_PROMPT } from "./prompt.ts";
import { findTool, toolDefinitionsForRole } from "./tools/index.ts";
import { toolAllowed } from "./tools/types.ts";
import { recordUsage } from "./usage.ts";

/**
 * Boucle de l'assistant : appel du modèle (en flux), exécution des outils,
 * mise en attente des actions à confirmer, reprise après confirmation.
 *
 * L'historique est en AJOUT SEUL : chaque message envoyé au modèle ou reçu de
 * lui est conservé tel quel (blocs de réflexion compris) et rejoué à
 * l'identique ; aucune réécriture des tours précédents.
 */
export type Emit = (event: AssistantStreamEvent) => void;

const ACTION_TTL_MS = 30 * 60_000;

interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

interface PendingResults {
  assistantSeq: number;
  results: ToolResultBlock[];
}

type UiEvent =
  | { kind: "tool"; id: string; name: string; label: string; ok: boolean; summary?: string; card?: unknown }
  | { kind: "action"; id: string; actionId: string };

function ok(toolUseId: string, content: unknown): ToolResultBlock {
  return { type: "tool_result", tool_use_id: toolUseId, content: JSON.stringify(content) };
}

function fail(toolUseId: string, message: string): ToolResultBlock {
  return { type: "tool_result", tool_use_id: toolUseId, content: message, is_error: true };
}

export function toActionDto(a: {
  id: string;
  toolName: string;
  title: string;
  details: unknown;
  confirmLabel: string;
  status: PendingActionStatus;
  createdAt: Date;
}): PendingActionDto {
  return {
    id: a.id,
    toolName: a.toolName,
    title: a.title,
    details: a.details as string[],
    confirmLabel: a.confirmLabel,
    status: a.status,
    createdAt: a.createdAt.toISOString(),
  };
}

function errorMessage(err: unknown): string {
  if (err instanceof AppError) {
    const details = err.details ? Object.values(err.details).flat().join(" ") : "";
    return [err.message, details].filter(Boolean).join(" ");
  }
  logger.error({ err }, "Erreur inattendue dans un outil de l'assistant");
  return "Erreur technique pendant l'action : elle n'a pas été effectuée.";
}

async function appendMessage(
  ctx: Ctx,
  conversationId: string,
  data: {
    role: "USER" | "ASSISTANT";
    content: unknown;
    displayText?: string;
    inputMode?: string;
    model?: string;
    stopReason?: string | null;
    usage?: unknown;
  },
): Promise<number> {
  return withTenant(ctx.orgId, async (tx) => {
    const last = await tx.assistantMessage.aggregate({ where: { conversationId }, _max: { seq: true } });
    const seq = (last._max.seq ?? 0) + 1;
    await tx.assistantMessage.create({
      data: {
        conversationId,
        seq,
        role: data.role,
        content: data.content as Prisma.InputJsonValue,
        displayText: data.displayText,
        inputMode: data.inputMode,
        model: data.model,
        stopReason: data.stopReason ?? undefined,
        usage: (data.usage as Prisma.InputJsonValue) ?? undefined,
      },
    });
    await tx.assistantConversation.update({ where: { id: conversationId }, data: { lastActivityAt: new Date() } });
    return seq;
  });
}

async function loadHistory(ctx: Ctx, conversationId: string): Promise<Anthropic.Beta.BetaMessageParam[]> {
  const rows = await withTenant(ctx.orgId, (tx) =>
    tx.assistantMessage.findMany({ where: { conversationId }, orderBy: { seq: "asc" }, select: { role: true, content: true } }),
  );
  return rows.map((r) => ({ role: r.role === "USER" ? "user" : "assistant", content: r.content as never }));
}

/** Blocs tool_use du dernier message de l'assistant restés sans résultat (tour interrompu). */
async function danglingToolUses(ctx: Ctx, conversationId: string): Promise<{ id: string }[]> {
  const last = await withTenant(ctx.orgId, (tx) =>
    tx.assistantMessage.findFirst({ where: { conversationId }, orderBy: { seq: "desc" }, select: { role: true, content: true } }),
  );
  if (!last || last.role !== "ASSISTANT") return [];
  const blocks = last.content as { type: string; id?: string }[];
  return blocks.filter((b) => b.type === "tool_use" && b.id).map((b) => ({ id: b.id! }));
}

/**
 * Exécute les outils demandés par le modèle. Les outils « à confirmer »
 * produisent une demande de confirmation au lieu d'agir.
 */
async function executeTools(
  ctx: Ctx,
  conversationId: string,
  assistantSeq: number,
  toolUses: Anthropic.Beta.BetaToolUseBlock[],
  emit: Emit,
): Promise<{ results: ToolResultBlock[]; pending: number }> {
  const toolCtx: Ctx = { ...ctx, viaAssistant: true };
  const results: ToolResultBlock[] = [];
  const uiEvents: UiEvent[] = [];
  let pending = 0;

  for (const use of toolUses) {
    const tool = findTool(use.name);
    if (!tool || !toolAllowed(ctx, tool)) {
      results.push(fail(use.id, "Cet outil n'est pas disponible pour ce compte."));
      assistantToolCalls.inc({ tool: use.name, outcome: "denied" });
      continue;
    }
    // Entrée revalidée systématiquement (le flux « eager » ne la valide pas côté serveur).
    const parsed = tool.input.safeParse(use.input);
    if (!parsed.success) {
      results.push(fail(use.id, JSON.stringify({ INVALID_INPUT: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) })));
      assistantToolCalls.inc({ tool: use.name, outcome: "invalid" });
      continue;
    }
    const label = tool.label(parsed.data);
    emit({ type: "tool_start", toolUseId: use.id, name: tool.name, label });

    if (tool.confirm && tool.describe) {
      try {
        const preview = await tool.describe(toolCtx, parsed.data);
        const action = await withTenant(ctx.orgId, (tx) =>
          tx.assistantAction.create({
            data: {
              conversationId,
              userId: ctx.userId,
              toolUseId: use.id,
              toolName: tool.name,
              input: parsed.data as Prisma.InputJsonValue,
              title: preview.title,
              details: preview.details,
              confirmLabel: preview.confirmLabel,
            },
          }),
        );
        pending += 1;
        emit({ type: "action_required", action: toActionDto(action) });
        uiEvents.push({ kind: "action", id: use.id, actionId: action.id });
        assistantToolCalls.inc({ tool: tool.name, outcome: "awaiting_confirmation" });
      } catch (err) {
        const message = errorMessage(err);
        results.push(fail(use.id, message));
        emit({ type: "tool_end", toolUseId: use.id, name: tool.name, ok: false, summary: message });
        uiEvents.push({ kind: "tool", id: use.id, name: tool.name, label, ok: false, summary: message });
        assistantToolCalls.inc({ tool: tool.name, outcome: "error" });
      }
      continue;
    }

    try {
      const result = await tool.run(toolCtx, parsed.data);
      results.push(ok(use.id, result.content));
      emit({ type: "tool_end", toolUseId: use.id, name: tool.name, ok: true, summary: result.summary, card: result.card });
      if (result.navigate) emit({ type: "navigate", route: result.navigate });
      uiEvents.push({ kind: "tool", id: use.id, name: tool.name, label, ok: true, summary: result.summary, card: result.card });
      assistantToolCalls.inc({ tool: tool.name, outcome: "ok" });
    } catch (err) {
      const message = errorMessage(err);
      results.push(fail(use.id, message));
      emit({ type: "tool_end", toolUseId: use.id, name: tool.name, ok: false, summary: message });
      uiEvents.push({ kind: "tool", id: use.id, name: tool.name, label, ok: false, summary: message });
      assistantToolCalls.inc({ tool: tool.name, outcome: "error" });
    }
  }

  if (uiEvents.length) {
    await withTenant(ctx.orgId, (tx) =>
      tx.assistantMessage.update({
        where: { conversationId_seq: { conversationId, seq: assistantSeq } },
        data: { uiEvents: uiEvents as Prisma.InputJsonValue },
      }),
    );
  }
  return { results, pending };
}

/** Fait tourner le modèle jusqu'à une réponse finale ou une attente de confirmation. */
export async function runLoop(ctx: Ctx, conversationId: string, emit: Emit): Promise<void> {
  const llm = getLlm();
  if (!llm) throw AppError.unavailable("L'assistant n'est pas activé sur ce serveur.", "ASSISTANT_DISABLED");
  const tools = toolDefinitionsForRole(ctx.role);

  for (let round = 0; round < env.ASSISTANT_MAX_TOOL_ROUNDS; round += 1) {
    const messages = await loadHistory(ctx, conversationId);
    const message = await llm.createMessage(
      { system: SYSTEM_PROMPT, tools, messages },
      { onTextDelta: (text) => emit({ type: "text_delta", text }) },
    );
    await recordUsage(ctx.orgId, message.usage);
    const seq = await appendMessage(ctx, conversationId, {
      role: "ASSISTANT",
      content: message.content,
      model: message.model,
      stopReason: message.stop_reason,
      usage: message.usage,
    });

    if (message.stop_reason === "refusal") {
      emit({ type: "text_delta", text: "Je ne peux pas traiter cette demande. Reformulez-la ou faites-la depuis l'écran concerné." });
      emit({ type: "turn_end", stopReason: "refusal" });
      assistantTurns.inc({ outcome: "refusal" });
      return;
    }

    const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (toolUses.length === 0) {
      emit({ type: "turn_end", stopReason: message.stop_reason ?? "end_turn" });
      assistantTurns.inc({ outcome: "answered" });
      return;
    }

    let results: ToolResultBlock[];
    if (message.stop_reason === "max_tokens") {
      // Entrée d'outil potentiellement tronquée : on n'exécute rien.
      results = toolUses.map((u) => fail(u.id, "Demande tronquée : rien n'a été exécuté. Recommence en plus court."));
    } else {
      const executed = await executeTools(ctx, conversationId, seq, toolUses, emit);
      if (executed.pending > 0) {
        await withTenant(ctx.orgId, (tx) =>
          tx.assistantConversation.update({
            where: { id: conversationId },
            data: { pendingToolResults: { assistantSeq: seq, results: executed.results } as unknown as Prisma.InputJsonValue },
          }),
        );
        emit({ type: "turn_end", stopReason: "awaiting_confirmation" });
        assistantTurns.inc({ outcome: "awaiting_confirmation" });
        return;
      }
      results = executed.results;
    }
    await appendMessage(ctx, conversationId, { role: "USER", content: orderResults(toolUses, results) });
  }

  emit({ type: "text_delta", text: "Cette demande comporte trop d'étapes pour moi d'un seul coup. Pouvez-vous la découper ?" });
  emit({ type: "turn_end", stopReason: "max_rounds" });
  assistantTurns.inc({ outcome: "max_rounds" });
}

function orderResults(toolUses: { id: string }[], results: ToolResultBlock[]): ToolResultBlock[] {
  const byId = new Map(results.map((r) => [r.tool_use_id, r]));
  return toolUses.map((u) => byId.get(u.id) ?? fail(u.id, "Action non effectuée."));
}

/**
 * Résultats à renvoyer au modèle pour clore un tour mis en attente : ceux des
 * outils déjà exécutés, plus le sort de chaque action (confirmée, refusée,
 * expirée, en échec).
 */
export async function closePendingTurn(
  ctx: Ctx,
  conversationId: string,
  reason: "new_message" | "resolved",
): Promise<ToolResultBlock[] | null> {
  return withTenant(ctx.orgId, async (tx) => {
    const conversation = await tx.assistantConversation.findUnique({ where: { id: conversationId }, select: { pendingToolResults: true } });
    const pending = conversation?.pendingToolResults as unknown as PendingResults | null;
    if (!pending) return null;
    if (reason === "new_message") {
      // Un nouveau message vaut abandon des actions encore en attente.
      await tx.assistantAction.updateMany({
        where: { conversationId, status: "PENDING" },
        data: { status: "CANCELLED", resolvedAt: new Date() },
      });
    }
    const last = await tx.assistantMessage.findUnique({
      where: { conversationId_seq: { conversationId, seq: pending.assistantSeq } },
      select: { content: true },
    });
    const toolUses = ((last?.content ?? []) as { type: string; id?: string }[])
      .filter((b) => b.type === "tool_use")
      .map((b) => ({ id: b.id! }));
    const actions = await tx.assistantAction.findMany({ where: { conversationId, toolUseId: { in: toolUses.map((u) => u.id) } } });
    const results = [...pending.results];
    for (const action of actions) {
      if (action.status === "CONFIRMED")
        results.push(ok(action.toolUseId, (action.result as { content?: unknown } | null)?.content ?? null));
      else if (action.status === "FAILED") results.push(fail(action.toolUseId, action.error ?? "L'action a échoué."));
      else if (action.status === "EXPIRED")
        results.push(fail(action.toolUseId, "La demande de confirmation a expiré : action non effectuée."));
      else
        results.push(
          fail(
            action.toolUseId,
            "L'utilisateur n'a pas confirmé cette action : elle n'a pas été effectuée. Ne la relance pas sans nouvelle demande.",
          ),
        );
    }
    await tx.assistantConversation.update({
      where: { id: conversationId },
      data: { pendingToolResults: null as unknown as Prisma.InputJsonValue },
    });
    return orderResults(toolUses, results);
  });
}

/** Confirmation ou refus d'une action proposée par l'assistant. */
export async function resolvePendingAction(
  ctx: Ctx,
  actionId: string,
  decision: "confirm" | "cancel",
  emit: Emit,
): Promise<{ conversationId: string; continueLoop: boolean }> {
  const action = await withTenant(ctx.orgId, (tx) => tx.assistantAction.findUnique({ where: { id: actionId } }));
  if (!action || action.userId !== ctx.userId) throw AppError.notFound("Demande introuvable.");
  if (action.status !== "PENDING") throw AppError.conflict("Cette demande a déjà été traitée.");

  const toolCtx: Ctx = { ...ctx, viaAssistant: true };
  const expired = Date.now() - action.createdAt.getTime() > ACTION_TTL_MS;
  let status: PendingActionStatus;
  let summary: string | undefined;
  let card: unknown;
  let navigate: string | undefined;
  let result: unknown = null;
  let error: string | null = null;

  if (expired) {
    status = "EXPIRED";
    summary = "Demande expirée : rien n'a été fait.";
  } else if (decision === "cancel") {
    status = "CANCELLED";
    summary = "Annulé : rien n'a été fait.";
  } else {
    const tool = findTool(action.toolName);
    if (!tool || !toolAllowed(ctx, tool)) {
      status = "FAILED";
      error = "Vous n'avez plus les droits nécessaires pour cette action.";
      summary = error;
    } else {
      try {
        const parsed = tool.input.parse(action.input);
        const out = await tool.run(toolCtx, parsed);
        status = "CONFIRMED";
        result = out.content;
        summary = out.summary;
        card = out.card;
        navigate = out.navigate;
      } catch (err) {
        status = "FAILED";
        error = errorMessage(err);
        summary = error;
      }
    }
  }

  await withTenant(ctx.orgId, async (tx) => {
    await tx.assistantAction.update({
      where: { id: actionId },
      // `result` garde ce que le modèle recevra (content) et ce que l'app réaffiche (résumé, carte).
      data: {
        status,
        result:
          status === "CONFIRMED" ? ({ content: result, summary: summary ?? null, card: card ?? null } as Prisma.InputJsonValue) : undefined,
        error,
        resolvedAt: new Date(),
      },
    });
    await logActivity(tx, toolCtx, status === "CONFIRMED" ? "ASSISTANT_ACTION_CONFIRMED" : "ASSISTANT_ACTION_CANCELLED", undefined, {
      tool: action.toolName,
      status,
    });
  });
  assistantToolCalls.inc({ tool: action.toolName, outcome: status.toLowerCase() });
  emit({ type: "action_resolved", actionId, status, summary, card: card as never });
  if (navigate) emit({ type: "navigate", route: navigate });

  const stillPending = await withTenant(ctx.orgId, (tx) =>
    tx.assistantAction.count({ where: { conversationId: action.conversationId, status: "PENDING" } }),
  );
  return { conversationId: action.conversationId, continueLoop: stillPending === 0 };
}

export async function appendUserTurn(
  ctx: Ctx,
  conversationId: string,
  blocks: unknown[],
  displayText?: string,
  inputMode?: string,
): Promise<void> {
  await appendMessage(ctx, conversationId, { role: "USER", content: blocks, displayText, inputMode });
}

export { danglingToolUses, fail as failResult };
