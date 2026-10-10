import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import type { AssistantCard, AssistantStreamEvent, AssistantTranscriptItem, PendingActionDto } from "@aussitot/shared";
import { endpoints } from "@/api/endpoints";
import { streamSse } from "@/api/stream";
import { ApiError } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { speak } from "./voice";

/**
 * État d'une conversation avec l'assistant : envoi d'un message, lecture du
 * flux de réponse (texte, outils, cartes, confirmations), confirmation ou
 * refus d'une action, lecture vocale de la réponse quand la demande était orale.
 */
export type ChatItem =
  | { kind: "user"; id: string; text: string; mode: "text" | "voice" }
  | { kind: "assistant"; id: string; text: string; streaming: boolean }
  | { kind: "tool"; id: string; name: string; label: string; status: "running" | "done" | "failed"; summary?: string; card?: AssistantCard }
  | { kind: "action"; id: string; action: PendingActionDto; resultSummary?: string; card?: AssistantCard; busy?: boolean }
  | { kind: "error"; id: string; text: string };

let localId = 0;
const nextId = () => `local-${Date.now()}-${(localId += 1)}`;

function fromTranscript(items: AssistantTranscriptItem[]): ChatItem[] {
  return items.map((item): ChatItem => {
    switch (item.kind) {
      case "user":
        return { kind: "user", id: item.id, text: item.text, mode: item.mode };
      case "assistant":
        return { kind: "assistant", id: item.id, text: item.text, streaming: false };
      case "tool":
        return {
          kind: "tool",
          id: item.id,
          name: item.name,
          label: item.label,
          status: item.ok ? "done" : "failed",
          summary: item.summary,
          card: item.card,
        };
      case "action":
        return { kind: "action", id: item.id, action: item.action, resultSummary: item.resultSummary, card: item.card };
    }
  });
}

/** Ressources à rafraîchir après l'exécution d'un outil (les écrans ouverts se mettent à jour). */
const TOOL_INVALIDATIONS: Record<string, string[]> = {
  create_client: ["clients"],
  update_client: ["clients", "client"],
  create_quote: ["quotes", "dashboard"],
  update_quote: ["quotes", "quote"],
  duplicate_quote: ["quotes"],
  send_quote: ["quotes", "quote", "dashboard"],
  set_quote_status: ["quotes", "quote", "dashboard"],
  create_invoice: ["invoices", "dashboard"],
  create_invoice_from_quote: ["invoices", "quote", "dashboard"],
  send_invoice: ["invoices", "invoice", "dashboard"],
  record_payment: ["invoices", "invoice", "dashboard"],
  send_payment_reminder: ["invoice"],
  cancel_invoice: ["invoices", "invoice", "dashboard"],
  create_mission: ["planning", "dashboard"],
  update_mission: ["planning", "mission", "dashboard"],
  cancel_mission: ["planning", "mission", "dashboard"],
};

export function useAssistant(options: { voiceReplies: boolean }) {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const storageKey = user ? `aussitot.assistant.conversation.${user.id}` : null;
  const voiceRepliesRef = useRef(options.voiceReplies);
  voiceRepliesRef.current = options.voiceReplies;

  // Reprise de la dernière conversation de cette personne.
  useEffect(() => {
    if (!storageKey) return;
    let active = true;
    (async () => {
      const stored = await AsyncStorage.getItem(storageKey).catch(() => null);
      if (stored) {
        try {
          const conversation = await endpoints.assistant.conversation(stored);
          if (!active) return;
          setConversationId(conversation.id);
          setItems(fromTranscript(conversation.items));
        } catch {
          await AsyncStorage.removeItem(storageKey).catch(() => undefined);
        }
      }
      if (active) setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, [storageKey]);

  const ensureConversation = useCallback(async (): Promise<string> => {
    if (conversationId) return conversationId;
    const { id } = await endpoints.assistant.createConversation();
    setConversationId(id);
    if (storageKey) await AsyncStorage.setItem(storageKey, id).catch(() => undefined);
    return id;
  }, [conversationId, storageKey]);

  /** Applique un événement du flux à l'affichage. */
  const consume = useCallback(
    (spoken: { text: string; actions: PendingActionDto[] }) => (event: AssistantStreamEvent) => {
      switch (event.type) {
        case "text_delta":
          spoken.text += event.text;
          setItems((current) => {
            const last = current.at(-1);
            if (last?.kind === "assistant" && last.streaming) {
              return [...current.slice(0, -1), { ...last, text: last.text + event.text }];
            }
            return [...current, { kind: "assistant", id: nextId(), text: event.text, streaming: true }];
          });
          break;
        case "tool_start":
          setItems((current) => [
            ...current.map((i) => (i.kind === "assistant" && i.streaming ? { ...i, streaming: false } : i)),
            { kind: "tool", id: event.toolUseId, name: event.name, label: event.label, status: "running" },
          ]);
          break;
        case "tool_end":
          setItems((current) =>
            current.map((i) =>
              i.kind === "tool" && i.id === event.toolUseId
                ? { ...i, status: event.ok ? "done" : "failed", summary: event.summary, card: event.card }
                : i,
            ),
          );
          for (const key of TOOL_INVALIDATIONS[event.name] ?? []) void queryClient.invalidateQueries({ queryKey: [key] });
          break;
        case "action_required":
          spoken.actions.push(event.action);
          setItems((current) => [
            ...current.filter((i) => !(i.kind === "tool" && i.status === "running" && i.name === event.action.toolName)),
            { kind: "action", id: event.action.id, action: event.action },
          ]);
          break;
        case "action_resolved":
          setItems((current) =>
            current.map((i) =>
              i.kind === "action" && i.action.id === event.actionId
                ? { ...i, busy: false, action: { ...i.action, status: event.status }, resultSummary: event.summary, card: event.card }
                : i,
            ),
          );
          for (const key of ["quotes", "quote", "invoices", "invoice", "planning", "mission", "dashboard"])
            void queryClient.invalidateQueries({ queryKey: [key] });
          break;
        case "navigate":
          router.push(event.route as never);
          break;
        case "error":
          setItems((current) => [...current, { kind: "error", id: nextId(), text: event.message }]);
          break;
        case "turn_end":
          setItems((current) => current.map((i) => (i.kind === "assistant" && i.streaming ? { ...i, streaming: false } : i)));
          break;
        default:
          break;
      }
    },
    [queryClient, router],
  );

  const runStream = useCallback(
    async (path: string, body: unknown, mode: "text" | "voice") => {
      const spoken = { text: "", actions: [] as PendingActionDto[] };
      setBusy(true);
      try {
        await streamSse(path, { method: "POST", body, onEvent: (_event, data) => consume(spoken)(data as AssistantStreamEvent) });
      } catch (err) {
        const message = err instanceof ApiError ? err.message : "L'assistant n'a pas pu répondre. Réessayez.";
        setItems((current) => [...current, { kind: "error", id: nextId(), text: message }]);
      } finally {
        setBusy(false);
        setItems((current) => current.map((i) => (i.kind === "assistant" && i.streaming ? { ...i, streaming: false } : i)));
      }
      if (mode === "voice" && voiceRepliesRef.current) {
        const question = spoken.actions.length ? ` ${spoken.actions.map((a) => a.title).join(". ")}. Je confirme ?` : "";
        speak(`${spoken.text}${question}`);
      }
    },
    [consume],
  );

  const send = useCallback(
    async (text: string, mode: "text" | "voice", screen?: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      setItems((current) => [
        ...current.map((i) =>
          i.kind === "action" && i.action.status === "PENDING" ? { ...i, action: { ...i.action, status: "CANCELLED" as const } } : i,
        ),
        { kind: "user", id: nextId(), text: trimmed, mode },
      ]);
      try {
        const id = await ensureConversation();
        await runStream(`/v1/assistant/conversations/${id}/messages`, { text: trimmed, mode, screen }, mode);
      } catch (err) {
        setItems((current) => [
          ...current,
          { kind: "error", id: nextId(), text: err instanceof ApiError ? err.message : "Impossible de joindre l'assistant." },
        ]);
      }
    },
    [busy, ensureConversation, runStream],
  );

  const resolve = useCallback(
    async (actionId: string, decision: "confirm" | "cancel", mode: "text" | "voice" = "text") => {
      setItems((current) => current.map((i) => (i.kind === "action" && i.action.id === actionId ? { ...i, busy: true } : i)));
      await runStream(`/v1/assistant/actions/${actionId}/${decision}`, {}, mode);
    },
    [runStream],
  );

  const reset = useCallback(async () => {
    setItems([]);
    setConversationId(null);
    if (storageKey) await AsyncStorage.removeItem(storageKey).catch(() => undefined);
  }, [storageKey]);

  const pendingAction = [...items]
    .reverse()
    .find((i): i is Extract<ChatItem, { kind: "action" }> => i.kind === "action" && i.action.status === "PENDING");

  return { items, busy, loaded, send, resolve, reset, pendingAction: pendingAction?.action ?? null };
}
