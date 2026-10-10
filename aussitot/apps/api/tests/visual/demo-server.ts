/**
 * BANC D'ESSAI VISUEL DE L'ASSISTANT — outil de test, jamais déployé (hors
 * du build, refusé en production).
 *
 * Lance la VRAIE API (base, permissions, outils, confirmations, emails) en
 * remplaçant seulement Claude par un modèle scénarisé, pour vérifier
 * l'interface de l'assistant de bout en bout sans clé d'API ni appel réseau :
 *
 *   npx tsx --env-file=.env tests/visual/demo-server.ts
 *
 * Phrases comprises (exemples) :
 *   « Fais un devis pour la boulangerie Dupont : 4 passages de vitrerie à 45 € »
 *   « Oui, envoie-le »
 *   « Quelles factures sont en retard ? »
 */
import type Anthropic from "@anthropic-ai/sdk";
import { env } from "../../src/config/env.ts";
import { buildApp } from "../../src/app.ts";
import { startOrgCacheSync } from "../../src/lib/orgCache.ts";
import { setLlmForTests, type LlmClient, type LlmHandlers, type LlmRequest } from "../../src/modules/assistant/llm.ts";

if (env.NODE_ENV === "production") throw new Error("Banc d'essai refusé en production.");

type Block = { type: string; [key: string]: unknown };
type Reply = { content: Block[]; stop_reason: "end_turn" | "tool_use" };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function lastUserText(messages: Anthropic.Beta.BetaMessageParam[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i]!;
    if (m.role !== "user") continue;
    const blocks = typeof m.content === "string" ? [{ type: "text", text: m.content }] : (m.content as Block[]);
    const text = blocks
      .filter((b) => b.type === "text")
      .map((b) => String(b.text))
      .join(" ");
    // Le bloc <contexte> ajouté par l'API est retiré.
    const cleaned = text.replace(/<contexte>[\s\S]*?<\/contexte>/g, "").trim();
    if (cleaned) return cleaned;
  }
  return "";
}

function lastToolResults(messages: Anthropic.Beta.BetaMessageParam[]): { name: string; content: unknown }[] {
  const last = messages.at(-1);
  if (!last || last.role !== "user" || typeof last.content === "string") return [];
  const results = (last.content as Block[]).filter((b) => b.type === "tool_result");
  if (!results.length) return [];
  // Retrouve le nom de l'outil dans le message précédent de l'assistant.
  const previous = messages.at(-2);
  const uses = previous && typeof previous.content !== "string" ? (previous.content as Block[]).filter((b) => b.type === "tool_use") : [];
  return results.map((r) => {
    const use = uses.find((u) => u.id === r.tool_use_id);
    const raw =
      typeof r.content === "string" ? r.content : Array.isArray(r.content) ? (r.content as Block[]).map((c) => c.text).join("") : "";
    let content: unknown = raw;
    try {
      content = JSON.parse(raw);
    } catch {
      /* texte brut */
    }
    return { name: String(use?.name ?? ""), content };
  });
}

/** Dernier devis créé dans la conversation (pour « envoie-le »). */
function lastQuoteId(messages: Anthropic.Beta.BetaMessageParam[]): string | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i]!;
    if (m.role !== "user" || typeof m.content === "string") continue;
    for (const block of m.content as Block[]) {
      if (block.type !== "tool_result" || typeof block.content !== "string") continue;
      const match = block.content.match(/"id":"([0-9a-f-]{36})","numero":"D-/);
      if (match) return match[1]!;
    }
  }
  return null;
}

let counter = 0;
const toolUse = (name: string, input: unknown, preamble?: string): Reply => ({
  content: [...(preamble ? [{ type: "text", text: preamble }] : []), { type: "tool_use", id: `toolu_demo_${(counter += 1)}`, name, input }],
  stop_reason: "tool_use",
});
const say = (text: string): Reply => ({ content: [{ type: "text", text }], stop_reason: "end_turn" });

function decide(request: LlmRequest): Reply {
  const results = lastToolResults(request.messages);
  const text = lastUserText(request.messages).toLowerCase();

  if (results.length) {
    const { name, content } = results[0]!;
    if (name === "search_clients") {
      const found = Array.isArray(content) ? (content as { id: string; nom: string }[]) : [];
      if (found.length !== 1)
        return say(found.length ? "J'ai trouvé plusieurs clients : lequel ?" : "Je ne trouve pas ce client. Voulez-vous que je le crée ?");
      const lines = [
        ...text.matchAll(/(\d+(?:[.,]\d+)?)\s*(passages?|heures?|h)\s+de\s+([a-zéèêàç' -]+?)\s+à\s+(\d+(?:[.,]\d+)?)\s*(?:€|euros?)/g),
      ].map((m) => ({
        description: m[3]!.trim().replace(/^./, (c) => c.toUpperCase()),
        quantity: Number(m[1]!.replace(",", ".")),
        unit: m[2]!.startsWith("passage") ? "VISIT" : "HOUR",
        unit_price_eur: Number(m[4]!.replace(",", ".")),
      }));
      return toolUse("create_quote", {
        client_id: found[0]!.id,
        title: lines[0] ? `${lines[0].description}` : "Prestation de nettoyage",
        lines: lines.length ? lines : [{ description: "Prestation de nettoyage", quantity: 1, unit: "FLAT", unit_price_eur: 100 }],
      });
    }
    if (name === "create_quote") {
      const q = content as { numero: string; client: string; total_ttc: string };
      return say(`C'est prêt : devis ${q.numero} pour ${q.client}, ${q.total_ttc} TTC. Je l'envoie au client ?`);
    }
    if (name === "send_quote") return say("C'est envoyé, avec le PDF en pièce jointe.");
    if (name === "list_invoices") {
      const list = Array.isArray(content) ? content : [];
      return say(
        list.length
          ? `${list.length} facture${list.length > 1 ? "s sont" : " est"} en retard. Voulez-vous que je relance les clients concernés ?`
          : "Aucune facture en retard : tout le monde est à jour.",
      );
    }
    return say("C'est fait.");
  }

  if (/\bdevis\b/.test(text) && /\bpour\b/.test(text)) {
    const client = text.match(/pour\s+(?:la |le |les |l')?(.+?)(?:\s*[:,]|\s+avec|\s+de\s+\d|$)/)?.[1]?.trim() ?? text;
    return toolUse("search_clients", { query: client });
  }
  if (/^(oui|ok|vas-y|envoie)/.test(text)) {
    const quoteId = lastQuoteId(request.messages);
    if (quoteId) return toolUse("send_quote", { quote_id: quoteId });
  }
  if (/retard/.test(text)) return toolUse("list_invoices", { filter: "overdue" });
  return say(
    "Banc d'essai : essayez « fais un devis pour la boulangerie Dupont : 4 passages de vitrerie à 45 € » ou « quelles factures sont en retard ? ».",
  );
}

class DemoLlm implements LlmClient {
  readonly model = "banc-d-essai";
  async createMessage(request: LlmRequest, handlers: LlmHandlers): Promise<Anthropic.Beta.BetaMessage> {
    await sleep(450);
    const reply = decide(request);
    for (const block of reply.content) {
      if (block.type !== "text") continue;
      for (const word of String(block.text).split(/(?<= )/)) {
        handlers.onTextDelta(word);
        await sleep(28);
      }
    }
    return {
      id: `msg_demo_${(counter += 1)}`,
      type: "message",
      role: "assistant",
      model: this.model,
      content: reply.content,
      stop_reason: reply.stop_reason,
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    } as unknown as Anthropic.Beta.BetaMessage;
  }
}

setLlmForTests(new DemoLlm());
const app = await buildApp();
await startOrgCacheSync();
await app.listen({ port: env.PORT, host: env.HOST });
console.log(`Banc d'essai de l'assistant prêt sur le port ${env.PORT} (modèle scénarisé, aucune requête vers Claude).`);
