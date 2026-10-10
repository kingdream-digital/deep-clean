import type Anthropic from "@anthropic-ai/sdk";
import type { Role } from "@aussitot/shared";
import { toInputSchema, toolAllowed, type AssistantTool } from "./types.ts";
import * as sales from "./sales.tools.ts";
import * as ops from "./operations.tools.ts";

/**
 * Catalogue complet des outils, dans un ordre FIXE : la liste envoyée au
 * modèle doit être identique d'un tour à l'autre (cache de prompt, et
 * validité des blocs de réflexion d'une conversation).
 */
export const ALL_TOOLS: AssistantTool[] = [
  sales.searchClients,
  sales.getClient,
  sales.createClient,
  sales.updateClient,
  sales.searchSites,
  sales.searchCatalog,
  sales.listQuotes,
  sales.getQuote,
  sales.createQuote,
  sales.updateQuote,
  sales.duplicateQuote,
  sales.sendQuote,
  sales.setQuoteStatus,
  sales.listInvoices,
  sales.getInvoice,
  sales.createInvoice,
  sales.createInvoiceFromQuote,
  sales.sendInvoice,
  sales.recordPayment,
  sales.sendReminder,
  sales.cancelInvoice,
  ops.getPlanning,
  ops.getMission,
  ops.listTeam,
  ops.createMission,
  ops.updateMission,
  ops.cancelMission,
  ops.businessSummary,
  ops.openScreen,
] as AssistantTool[];

const byName = new Map(ALL_TOOLS.map((t) => [t.name, t]));

export function findTool(name: string): AssistantTool | undefined {
  return byName.get(name);
}

/** Outils proposés à un rôle : jamais un outil que ce rôle n'a pas le droit d'utiliser. */
export function toolsForRole(role: Role): AssistantTool[] {
  return ALL_TOOLS.filter((t) => toolAllowed({ role }, t));
}

const definitionCache = new Map<Role, Anthropic.Beta.BetaTool[]>();

/** Définitions envoyées au modèle (mises en cache : strictement identiques à chaque appel). */
export function toolDefinitionsForRole(role: Role): Anthropic.Beta.BetaTool[] {
  let defs = definitionCache.get(role);
  if (!defs) {
    defs = toolsForRole(role).map((t) => ({
      name: t.name,
      description: t.confirm ? `${t.description} (Action soumise à la confirmation de l'utilisateur.)` : t.description,
      input_schema: toInputSchema(t.input),
      eager_input_streaming: true,
    }));
    definitionCache.set(role, defs);
  }
  return defs;
}
