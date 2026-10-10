import { z } from "zod";
import type { AssistantCard, Permission } from "@aussitot/shared";
import { can } from "@aussitot/shared";
import type { Ctx } from "../../../lib/context.ts";

/**
 * Un outil de l'assistant = une action métier existante (le même service que
 * les écrans de l'app), avec :
 * - un schéma d'entrée strict (revalidé avant chaque exécution) ;
 * - la permission requise (outil absent de la liste si l'utilisateur ne l'a
 *   pas, ET revérifiée à l'exécution par le service lui-même) ;
 * - `confirm` pour les actions qui sortent de l'entreprise ou engagent
 *   légalement : l'assistant ne peut que les PROPOSER, l'utilisateur confirme.
 */
export interface ToolResult {
  /** Données renvoyées au modèle (JSON compact). */
  content: unknown;
  /** Résumé court affiché dans l'app (« Devis D-2026-0012 créé »). */
  summary?: string;
  card?: AssistantCard;
  /** Écran à ouvrir dans l'app. */
  navigate?: string;
}

export interface ConfirmationPreview {
  title: string;
  details: string[];
  confirmLabel: string;
}

export interface AssistantTool<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  input: S;
  /** L'outil n'est proposé que si l'utilisateur a AU MOINS une de ces permissions. */
  permissions?: Permission[];
  confirm?: boolean;
  label: (input: z.output<S>) => string;
  describe?: (ctx: Ctx, input: z.output<S>) => Promise<ConfirmationPreview>;
  run: (ctx: Ctx, input: z.output<S>) => Promise<ToolResult>;
}

export function defineTool<S extends z.ZodType>(tool: AssistantTool<S>): AssistantTool<S> {
  return tool;
}

export function toolAllowed(ctx: Pick<Ctx, "role">, tool: AssistantTool): boolean {
  return !tool.permissions || tool.permissions.some((p) => can(ctx.role, p));
}

/** Schéma JSON envoyé au modèle, dérivé du schéma Zod (source unique). */
export function toInputSchema(schema: z.ZodType): { type: "object"; properties?: Record<string, unknown>; required?: string[] } {
  const json = z.toJSONSchema(schema, { target: "draft-2020-12", unrepresentable: "any", io: "input" }) as Record<string, unknown>;
  delete json.$schema;
  return json as { type: "object"; properties?: Record<string, unknown>; required?: string[] };
}
