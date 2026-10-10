import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { AssistantStreamEvent } from "@aussitot/shared";
import { api, createClient, createMember, createTestOrg, sampleLines, testApp, type Session, type TestOrg } from "./helpers.ts";
import { setLlmForTests, type LlmClient, type LlmRequest } from "../src/modules/assistant/llm.ts";
import { withTenant } from "../src/lib/db.ts";

/**
 * L'assistant est testé avec un modèle SCÉNARISÉ : aucune requête réseau, et
 * chaque étape vérifie ce que le vrai modèle recevrait (outils proposés,
 * historique, résultats d'outils). Tout le reste — outils, permissions,
 * confirmations, base de données, emails — est réel.
 */
type Block = { type: string; [key: string]: unknown };
type Step = (request: LlmRequest) => { content: Block[]; stop_reason: string };

class ScriptedLlm implements LlmClient {
  readonly model = "modele-de-test";
  readonly requests: LlmRequest[] = [];
  constructor(private readonly steps: Step[]) {}

  async createMessage(request: LlmRequest, handlers: { onTextDelta: (t: string) => void }) {
    this.requests.push(JSON.parse(JSON.stringify(request)));
    const step = this.steps.shift();
    if (!step) throw new Error("Scénario épuisé : appel au modèle inattendu");
    const { content, stop_reason } = step(request);
    for (const block of content) if (block.type === "text") handlers.onTextDelta(block.text as string);
    return {
      id: `msg_${Math.random().toString(36).slice(2)}`,
      type: "message",
      role: "assistant",
      model: this.model,
      content,
      stop_reason,
      stop_sequence: null,
      usage: { input_tokens: 1200, output_tokens: 80, cache_read_input_tokens: 1000, cache_creation_input_tokens: 0 },
    } as never;
  }

  remaining(): number {
    return this.steps.length;
  }
}

const text = (t: string) => ({ content: [{ type: "text", text: t }], stop_reason: "end_turn" });
const useTool = (id: string, name: string, input: unknown, preamble?: string) => ({
  content: [...(preamble ? [{ type: "text", text: preamble }] : []), { type: "tool_use", id, name, input }],
  stop_reason: "tool_use",
});

/** Résultat d'outil renvoyé au modèle dans le dernier message utilisateur. */
function toolResult(request: LlmRequest, toolUseId: string): { content: string; is_error?: boolean } {
  const last = request.messages.at(-1)!;
  const blocks = last.content as Block[];
  const found = blocks.find((b) => b.type === "tool_result" && b.tool_use_id === toolUseId);
  if (!found) throw new Error(`Résultat ${toolUseId} absent`);
  return found as never;
}

function parseEvents(payload: string): AssistantStreamEvent[] {
  return payload
    .split("\n\n")
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.startsWith("data: "))
    .map((chunk) => JSON.parse(chunk.slice(6)));
}

let app: FastifyInstance;
let org: TestOrg;
let other: TestOrg;
let employee: Session;
let client: { id: string };

async function newConversation(session: Session): Promise<string> {
  const res = await api(app, session.token).post("/v1/assistant/conversations");
  expect(res.statusCode).toBe(201);
  return res.json().id;
}

async function say(session: Session, conversationId: string, textToSay: string, mode: "voice" | "text" = "voice") {
  const res = await api(app, session.token).post(`/v1/assistant/conversations/${conversationId}/messages`, {
    text: textToSay,
    mode,
    screen: "Accueil",
  });
  expect(res.statusCode).toBe(200);
  expect(res.headers["content-type"]).toContain("text/event-stream");
  return parseEvents(res.body);
}

async function decide(session: Session, actionId: string, decision: "confirm" | "cancel") {
  const res = await api(app, session.token).post(`/v1/assistant/actions/${actionId}/${decision}`);
  expect(res.statusCode).toBe(200);
  return parseEvents(res.body);
}

beforeAll(async () => {
  app = await testApp();
  org = await createTestOrg(app, "assist");
  other = await createTestOrg(app, "assist-autre");
  employee = await createMember(app, org, "EMPLOYEE", "Eva");
  client = await createClient(app, org.admin.token, "Boulangerie Dupont & Fils");
});
afterEach(() => setLlmForTests(undefined));
afterAll(async () => app.close());

describe("devis dicté à la voix, de bout en bout", () => {
  let conversationId: string;
  let quoteId: string;

  it("comprend la demande, retrouve le client malgré l'orthographe et crée le devis", async () => {
    const llm = new ScriptedLlm([
      (req) => {
        const last = req.messages.at(-1)!.content as Block[];
        const said = last.find((b) => b.type === "text")!.text as string;
        expect(said).toContain("<contexte>");
        expect(said).toContain("Mode : vocal");
        expect(said).toContain("devis pour la boulangerie Dupond");
        return useTool("t1", "search_clients", { query: "boulangerie Dupond" });
      },
      (req) => {
        const found = JSON.parse(toolResult(req, "t1").content);
        expect(found[0].nom).toBe("Boulangerie Dupont & Fils");
        return useTool("t2", "create_quote", {
          client_id: found[0].id,
          title: "Nettoyage des vitres",
          lines: [{ description: "Nettoyage des vitres", quantity: 3, unit: "HOUR", unit_price_eur: 35 }],
        });
      },
      (req) => {
        const created = JSON.parse(toolResult(req, "t2").content);
        expect(created.total_ttc).toBe("126,00 €");
        quoteId = created.id;
        return text("C'est prêt : un devis de 126 € TTC pour la boulangerie Dupont. Je l'envoie ?");
      },
    ]);
    setLlmForTests(llm);
    conversationId = await newConversation(org.admin);
    const events = await say(org.admin, conversationId, "Fais un devis pour la boulangerie Dupond, trois heures de vitres à 35 euros");

    expect(events[0]).toEqual({ type: "turn_start", conversationId });
    const tools = events.filter((e) => e.type === "tool_end");
    expect(tools.map((e) => e.type === "tool_end" && e.name)).toEqual(["search_clients", "create_quote"]);
    const quoteCard = events.find((e) => e.type === "tool_end" && e.card?.kind === "quote");
    expect(quoteCard).toBeTruthy();
    expect(
      events
        .filter((e) => e.type === "text_delta")
        .map((e) => (e.type === "text_delta" ? e.text : ""))
        .join(""),
    ).toContain("Je l'envoie ?");
    expect(events.at(-1)).toEqual({ type: "turn_end", stopReason: "end_turn" });
    expect(llm.remaining()).toBe(0);

    // Le devis existe réellement, avec des montants calculés par l'application.
    const quote = (await api(app, org.admin.token).get(`/v1/quotes/${quoteId}`)).json();
    expect(quote.totalCents).toBe(12600);
    expect(quote.status).toBe("DRAFT");

    // Traçabilité : l'action est journalisée comme faite via l'assistant.
    const log = await withTenant(org.orgId, (tx) => tx.activityLog.findFirst({ where: { entityId: quoteId, action: "QUOTE_CREATED" } }));
    expect(log?.viaAssistant).toBe(true);

    // Historique en ajout seul : chaque appel reprend exactement le précédent.
    for (let i = 1; i < llm.requests.length; i += 1) {
      const prev = llm.requests[i - 1]!;
      const curr = llm.requests[i]!;
      expect(curr.system).toBe(prev.system);
      expect(curr.tools).toEqual(prev.tools);
      expect(curr.messages.slice(0, prev.messages.length)).toEqual(prev.messages);
    }
  });

  it("n'envoie le devis au client qu'après confirmation", async () => {
    const llm = new ScriptedLlm([
      () => useTool("t3", "send_quote", { quote_id: quoteId }, "Je prépare l'envoi."),
      (req) => {
        const result = toolResult(req, "t3");
        expect(result.is_error).toBeFalsy();
        expect(result.content).toContain("en cours d'envoi");
        return text("C'est envoyé.");
      },
    ]);
    setLlmForTests(llm);
    const events = await say(org.admin, conversationId, "Oui, envoie-le");
    const required = events.find((e) => e.type === "action_required");
    expect(required && required.type === "action_required" && required.action.title).toMatch(/^Envoyer le devis D-\d{4}-\d{4}$/);
    expect(required && required.type === "action_required" && required.action.details).toContain("À : contact@dupont.test");
    expect(events.at(-1)).toEqual({ type: "turn_end", stopReason: "awaiting_confirmation" });

    // Rien n'est parti tant que la personne n'a pas confirmé.
    const before = await withTenant(org.orgId, (tx) => tx.emailOutbox.count({ where: { entityId: quoteId } }));
    expect(before).toBe(0);

    const actionId = required!.type === "action_required" ? required!.action.id : "";
    const resolved = await decide(org.admin, actionId, "confirm");
    expect(resolved[0]).toMatchObject({ type: "action_resolved", status: "CONFIRMED" });
    expect(resolved.at(-1)).toEqual({ type: "turn_end", stopReason: "end_turn" });

    const emails = await withTenant(org.orgId, (tx) => tx.emailOutbox.findMany({ where: { entityId: quoteId } }));
    expect(emails).toHaveLength(1);
    expect(emails[0]!.to).toBe("contact@dupont.test");
    expect((await api(app, org.admin.token).get(`/v1/quotes/${quoteId}`)).json().status).toBe("SENT");

    // Une même confirmation ne peut pas être rejouée.
    expect((await api(app, org.admin.token).post(`/v1/assistant/actions/${actionId}/confirm`)).body).toContain("déjà été traitée");
  });

  it("restitue l'historique de la conversation", async () => {
    const conversation = (await api(app, org.admin.token).get(`/v1/assistant/conversations/${conversationId}`)).json();
    const kinds = conversation.items.map((i: { kind: string }) => i.kind);
    expect(kinds[0]).toBe("user");
    expect(kinds).toContain("tool");
    expect(kinds).toContain("action");
    expect(conversation.items[0].text).toContain("boulangerie Dupond");
    expect(conversation.pendingActions).toHaveLength(0);
  });
});

describe("garde-fous", () => {
  it("un refus de l'utilisateur annule l'action et le modèle en est informé", async () => {
    const draft = (await api(app, org.admin.token).post("/v1/invoices", { clientId: client.id, lines: sampleLines })).json();
    await api(app, org.admin.token).post(`/v1/invoices/${draft.id}/issue`);
    const llm = new ScriptedLlm([
      () => useTool("p1", "record_payment", { invoice_id: draft.id }),
      (req) => {
        const result = toolResult(req, "p1");
        expect(result.is_error).toBe(true);
        expect(result.content).toContain("n'a pas confirmé");
        return text("D'accord, je n'enregistre rien.");
      },
    ]);
    setLlmForTests(llm);
    const conversationId = await newConversation(org.admin);
    const events = await say(org.admin, conversationId, "Encaisse la facture de la boulangerie");
    const required = events.find((e) => e.type === "action_required");
    const resolved = await decide(org.admin, required!.type === "action_required" ? required!.action.id : "", "cancel");
    expect(resolved[0]).toMatchObject({ type: "action_resolved", status: "CANCELLED" });
    expect((await api(app, org.admin.token).get(`/v1/invoices/${draft.id}`)).json().payments).toHaveLength(0);
  });

  it("un nouveau message abandonne l'action en attente", async () => {
    const quote = (await api(app, org.admin.token).post("/v1/quotes", { clientId: client.id, lines: sampleLines })).json();
    const llm = new ScriptedLlm([
      () => useTool("s1", "send_quote", { quote_id: quote.id }),
      (req) => {
        const blocks = req.messages.at(-1)!.content as Block[];
        expect(blocks[0]).toMatchObject({ type: "tool_result", tool_use_id: "s1", is_error: true });
        expect(blocks.at(-1)!.text).toContain("attends");
        return text("Entendu, je n'envoie rien.");
      },
    ]);
    setLlmForTests(llm);
    const conversationId = await newConversation(org.admin);
    await say(org.admin, conversationId, "Envoie le devis");
    await say(org.admin, conversationId, "Non attends, je veux d'abord changer le prix", "text");
    const actions = await withTenant(org.orgId, (tx) => tx.assistantAction.findMany({ where: { conversationId } }));
    expect(actions[0]!.status).toBe("CANCELLED");
    expect(await withTenant(org.orgId, (tx) => tx.emailOutbox.count({ where: { entityId: quote.id } }))).toBe(0);
  });

  it("n'offre à un employé que ses outils, et refuse les autres même s'ils sont demandés", async () => {
    const llm = new ScriptedLlm([
      (req) => {
        const names = req.tools.map((t) => t.name);
        expect(names).toContain("get_planning");
        expect(names).not.toContain("create_quote");
        expect(names).not.toContain("search_clients");
        expect(names).not.toContain("list_invoices");
        return useTool("x1", "create_quote", {
          client_id: client.id,
          lines: [{ description: "x", quantity: 1, unit: "FLAT", unit_price_eur: 1 }],
        });
      },
      (req) => {
        const result = toolResult(req, "x1");
        expect(result.is_error).toBe(true);
        expect(result.content).toContain("pas disponible");
        return text("Je ne peux pas créer de devis avec votre compte.");
      },
    ]);
    setLlmForTests(llm);
    const before = await withTenant(org.orgId, (tx) => tx.quote.count());
    const conversationId = await newConversation(employee);
    await say(employee, conversationId, "Fais un devis");
    expect(await withTenant(org.orgId, (tx) => tx.quote.count())).toBe(before);
  });

  it("ne donne jamais accès aux données d'une autre entreprise", async () => {
    const foreignQuote = (await api(app, org.admin.token).post("/v1/quotes", { clientId: client.id, lines: sampleLines })).json();
    const llm = new ScriptedLlm([
      () => useTool("i1", "get_quote", { quote_id: foreignQuote.id }),
      (req) => {
        const result = toolResult(req, "i1");
        expect(result.is_error).toBe(true);
        expect(result.content).toContain("introuvable");
        return text("Je ne trouve pas ce devis.");
      },
    ]);
    setLlmForTests(llm);
    const conversationId = await newConversation(other.admin);
    await say(other.admin, conversationId, "Ouvre le devis");
    // La conversation elle-même n'est visible que par son auteur.
    expect((await api(app, org.admin.token).get(`/v1/assistant/conversations/${conversationId}`)).statusCode).toBe(404);
  });

  it("rejette une entrée d'outil invalide sans rien exécuter", async () => {
    const llm = new ScriptedLlm([
      () => useTool("v1", "create_quote", { client_id: client.id, lines: [] }),
      (req) => {
        expect(toolResult(req, "v1").content).toContain("INVALID_INPUT");
        return text("Il me manque les prestations.");
      },
    ]);
    setLlmForTests(llm);
    const conversationId = await newConversation(org.admin);
    await say(org.admin, conversationId, "Fais un devis vide", "text");
    expect(llm.remaining()).toBe(0);
  });

  it("dit clairement quand l'assistant n'est pas activé", async () => {
    setLlmForTests(null);
    const status = (await api(app, org.admin.token).get("/v1/assistant/status")).json();
    expect(status.enabled).toBe(false);
    expect(status.reason).toContain("pas encore activé");
    const conversationId = await newConversation(org.admin);
    const events = await say(org.admin, conversationId, "Bonjour");
    expect(events).toEqual([{ type: "error", code: "ASSISTANT_DISABLED", message: expect.stringContaining("pas encore activé") }]);
  });

  it("applique le quota mensuel de l'abonnement", async () => {
    const pg = await import("pg");
    const admin = new pg.default.Client({ connectionString: process.env.DATABASE_ADMIN_URL });
    await admin.connect();
    await admin.query(`UPDATE organizations SET "assistantMonthlyQuota" = 1 WHERE id = $1`, [other.orgId]);
    await admin.end();
    const { invalidateOrg } = await import("../src/lib/orgCache.ts");
    await invalidateOrg(other.orgId);
    setLlmForTests(new ScriptedLlm([() => text("Bonjour !")]));
    const conversationId = await newConversation(other.admin);
    // other.admin a déjà consommé une demande dans le test d'isolation.
    const events = await say(other.admin, conversationId, "Bonjour");
    expect(events).toEqual([{ type: "error", code: "ASSISTANT_QUOTA", message: expect.stringContaining("quota") }]);
  });
});
