import {
  assistantMessageSchema,
  type AssistantConversationDto,
  type AssistantMessageInput,
  type AssistantStatusDto,
  type AssistantTranscriptItem,
} from "@aussitot/shared";
import { withTenant } from "../../lib/db.ts";
import { AppError, assertFound } from "../../lib/errors.ts";
import { requirePermission, type Ctx } from "../../lib/context.ts";
import { acquireLock } from "../../lib/redis.ts";
import { getOrgBasics } from "../../lib/orgCache.ts";
import { assistantInFlight } from "../../lib/metrics.ts";
import { env } from "../../config/env.ts";
import { parse } from "../../lib/validate.ts";
import { getLlm } from "./llm.ts";
import { contextBlock } from "./prompt.ts";
import {
  appendUserTurn,
  closePendingTurn,
  danglingToolUses,
  failResult,
  resolvePendingAction,
  runLoop,
  toActionDto,
  type Emit,
} from "./loop.ts";
import { reserveRequest, usageThisMonth } from "./usage.ts";

const LOCK_TTL_MS = 180_000;
let inFlight = 0;

/** Limite le nombre de réponses générées en parallèle sur cette instance (protection de la charge). */
async function withCapacity<T>(fn: () => Promise<T>): Promise<T> {
  if (inFlight >= env.ASSISTANT_MAX_CONCURRENCY) {
    throw AppError.unavailable("L'assistant est très sollicité. Réessayez dans quelques secondes.", "ASSISTANT_BUSY");
  }
  inFlight += 1;
  assistantInFlight.inc();
  try {
    return await fn();
  } finally {
    inFlight -= 1;
    assistantInFlight.dec();
  }
}

async function withConversationLock<T>(conversationId: string, fn: () => Promise<T>): Promise<T> {
  const release = await acquireLock(`assistant:${conversationId}`, LOCK_TTL_MS);
  if (!release) throw AppError.conflict("Une réponse est déjà en cours dans cette conversation.", "ASSISTANT_BUSY_CONVERSATION");
  try {
    return await fn();
  } finally {
    await release();
  }
}

export async function assistantStatus(ctx: Ctx): Promise<AssistantStatusDto> {
  requirePermission(ctx, "assistant.use");
  const org = await getOrgBasics(ctx.orgId);
  const used = await usageThisMonth(ctx.orgId);
  let reason: string | null = null;
  if (!getLlm()) reason = "L'assistant n'est pas encore activé sur ce serveur (clé du modèle à configurer).";
  else if (org.assistantMonthlyQuota <= 0) reason = "L'assistant n'est pas inclus dans votre abonnement.";
  else if (used >= org.assistantMonthlyQuota) reason = "Le quota mensuel de l'assistant est atteint.";
  return { enabled: reason === null, reason, monthlyQuota: org.assistantMonthlyQuota, usedThisMonth: used };
}

export async function createConversation(ctx: Ctx): Promise<{ id: string }> {
  requirePermission(ctx, "assistant.use");
  const conversation = await withTenant(ctx.orgId, (tx) =>
    tx.assistantConversation.create({ data: { userId: ctx.userId, roleAtStart: ctx.role } }),
  );
  return { id: conversation.id };
}

export async function listConversations(ctx: Ctx): Promise<{ id: string; title: string | null; updatedAt: string }[]> {
  requirePermission(ctx, "assistant.use");
  const rows = await withTenant(ctx.orgId, (tx) =>
    tx.assistantConversation.findMany({
      where: { userId: ctx.userId },
      orderBy: { lastActivityAt: "desc" },
      take: 30,
      select: { id: true, title: true, lastActivityAt: true },
    }),
  );
  return rows.map((r) => ({ id: r.id, title: r.title, updatedAt: r.lastActivityAt.toISOString() }));
}

/** Une conversation n'est visible que par la personne qui l'a ouverte. */
async function loadOwnConversation(ctx: Ctx, conversationId: string) {
  const conversation = await withTenant(ctx.orgId, (tx) => tx.assistantConversation.findUnique({ where: { id: conversationId } }));
  if (!conversation || conversation.userId !== ctx.userId) throw AppError.notFound("Conversation introuvable.");
  return conversation;
}

export async function getConversation(ctx: Ctx, conversationId: string): Promise<AssistantConversationDto> {
  requirePermission(ctx, "assistant.use");
  const conversation = await loadOwnConversation(ctx, conversationId);
  const [messages, actions] = await withTenant(ctx.orgId, async (tx) => [
    await tx.assistantMessage.findMany({ where: { conversationId }, orderBy: { seq: "asc" } }),
    await tx.assistantAction.findMany({ where: { conversationId }, orderBy: { createdAt: "asc" } }),
  ]);
  const actionById = new Map(actions.map((a) => [a.id, a]));
  const items: AssistantTranscriptItem[] = [];
  for (const m of messages) {
    if (m.role === "USER") {
      if (m.displayText)
        items.push({
          kind: "user",
          id: m.id,
          text: m.displayText,
          mode: m.inputMode === "voice" ? "voice" : "text",
          createdAt: m.createdAt.toISOString(),
        });
      continue;
    }
    const text = (m.content as { type: string; text?: string }[])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("")
      .trim();
    if (text) items.push({ kind: "assistant", id: m.id, text, createdAt: m.createdAt.toISOString() });
    for (const event of (m.uiEvents ?? []) as {
      kind: string;
      id: string;
      name?: string;
      label?: string;
      ok?: boolean;
      summary?: string;
      card?: never;
      actionId?: string;
    }[]) {
      if (event.kind === "tool")
        items.push({
          kind: "tool",
          id: event.id,
          name: event.name!,
          label: event.label!,
          ok: Boolean(event.ok),
          summary: event.summary,
          card: event.card,
        });
      if (event.kind === "action" && event.actionId) {
        const action = actionById.get(event.actionId);
        if (action) {
          const result = action.result as { summary?: string | null; card?: never } | null;
          items.push({
            kind: "action",
            id: event.id,
            action: toActionDto(action),
            resultSummary: action.error ?? result?.summary ?? undefined,
            card: result?.card ?? undefined,
          });
        }
      }
    }
  }
  return {
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.lastActivityAt.toISOString(),
    items,
    pendingActions: actions.filter((a) => a.status === "PENDING").map(toActionDto),
  };
}

/** Message de l'utilisateur (tapé ou dicté) → réponse de l'assistant en flux. */
export async function sendMessage(ctx: Ctx, conversationId: string, raw: AssistantMessageInput, emit: Emit): Promise<void> {
  requirePermission(ctx, "assistant.use");
  const input = parse(assistantMessageSchema, raw);
  if (!getLlm()) throw AppError.unavailable("L'assistant n'est pas encore activé sur ce serveur.", "ASSISTANT_DISABLED");
  const conversation = await loadOwnConversation(ctx, conversationId);
  if (conversation.roleAtStart !== ctx.role) {
    throw AppError.conflict("Vos droits ont changé : ouvrez une nouvelle conversation.", "CONVERSATION_ROLE_CHANGED");
  }

  await withCapacity(() =>
    withConversationLock(conversationId, async () => {
      await reserveRequest(ctx.orgId);
      const [org, user] = await Promise.all([
        getOrgBasics(ctx.orgId),
        withTenant(ctx.orgId, (tx) =>
          tx.user.findUniqueOrThrow({ where: { id: ctx.userId }, select: { firstName: true, lastName: true } }),
        ),
      ]);

      // Résultats en attente du tour précédent (actions non confirmées = abandonnées),
      // ou outils d'un tour interrompu : le modèle doit recevoir un résultat pour chacun.
      const blocks: unknown[] = [];
      const closed = await closePendingTurn(ctx, conversationId, "new_message");
      if (closed) blocks.push(...closed);
      else
        for (const use of await danglingToolUses(ctx, conversationId))
          blocks.push(failResult(use.id, "Action interrompue : elle n'a pas été effectuée."));

      const context = contextBlock({
        now: new Date(),
        timezone: org.timezone,
        companyName: org.name,
        userName: `${user.firstName} ${user.lastName}`,
        role: ctx.role,
        screen: input.screen,
        mode: input.mode,
      });
      blocks.push({ type: "text", text: `${context}\n\n${input.text}` });
      await appendUserTurn(ctx, conversationId, blocks, input.text, input.mode);
      if (!conversation.title) {
        await withTenant(ctx.orgId, (tx) =>
          tx.assistantConversation.update({ where: { id: conversationId }, data: { title: input.text.slice(0, 80) } }),
        );
      }
      emit({ type: "turn_start", conversationId });
      await runLoop(ctx, conversationId, emit);
    }),
  );
}

/** Confirmation (bouton ou « oui » à la voix) ou refus d'une action proposée. */
export async function resolveAction(ctx: Ctx, actionId: string, decision: "confirm" | "cancel", emit: Emit): Promise<void> {
  requirePermission(ctx, "assistant.use");
  const action = assertFound(
    await withTenant(ctx.orgId, (tx) =>
      tx.assistantAction.findUnique({ where: { id: actionId }, select: { conversationId: true, userId: true } }),
    ),
    "Demande introuvable.",
  );
  if (action.userId !== ctx.userId) throw AppError.notFound("Demande introuvable.");

  await withCapacity(() =>
    withConversationLock(action.conversationId, async () => {
      const { conversationId, continueLoop } = await resolvePendingAction(ctx, actionId, decision, emit);
      if (!continueLoop) {
        emit({ type: "turn_end", stopReason: "awaiting_confirmation" });
        return;
      }
      const results = await closePendingTurn(ctx, conversationId, "resolved");
      if (results) await appendUserTurn(ctx, conversationId, results);
      if (!getLlm()) {
        emit({ type: "turn_end", stopReason: "end_turn" });
        return;
      }
      await runLoop(ctx, conversationId, emit);
    }),
  );
}
