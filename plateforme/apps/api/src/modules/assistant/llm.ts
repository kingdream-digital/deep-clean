import Anthropic from "@anthropic-ai/sdk";
import { env } from "../../config/env.ts";
import { AppError } from "../../lib/errors.ts";
import { logger } from "../../lib/logger.ts";

/**
 * Accès au modèle de langage. L'interface est volontairement minimale :
 * l'implémentation réelle utilise Claude (SDK officiel Anthropic) ; les tests
 * injectent un modèle scénarisé (aucun appel réseau, comportement exact).
 */
export interface LlmRequest {
  system: string;
  tools: Anthropic.Beta.BetaTool[];
  messages: Anthropic.Beta.BetaMessageParam[];
}

export interface LlmHandlers {
  onTextDelta: (text: string) => void;
  signal?: AbortSignal;
}

export interface LlmClient {
  readonly model: string;
  createMessage(request: LlmRequest, handlers: LlmHandlers): Promise<Anthropic.Beta.BetaMessage>;
}

class AnthropicLlm implements LlmClient {
  private readonly client: Anthropic;
  readonly model = env.ASSISTANT_MODEL;

  constructor(apiKey: string) {
    // Délai court par requête (et 2 nouvelles tentatives automatiques du SDK) :
    // un assistant vocal qui ne répond pas doit échouer vite et le dire.
    this.client = new Anthropic({ apiKey, timeout: 90_000, maxRetries: 2 });
  }

  async createMessage(request: LlmRequest, handlers: LlmHandlers): Promise<Anthropic.Beta.BetaMessage> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        const stream = this.client.beta.messages.stream(
          {
            model: this.model,
            max_tokens: 32_000,
            system: request.system,
            tools: request.tools,
            messages: request.messages,
            output_config: { effort: env.ASSISTANT_EFFORT },
            // Mise en cache automatique du préfixe (outils + consignes + historique).
            cache_control: { type: "ephemeral" },
            // Si un filtre de sécurité refuse à tort une demande légitime, la
            // requête est rejouée automatiquement sur le modèle de repli recommandé.
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
          },
          { signal: handlers.signal },
        );
        stream.on("text", (delta) => handlers.onTextDelta(delta));
        return await stream.finalMessage();
      } catch (err) {
        // Entrée d'outil illisible (JSON tronqué, flux d'entrée « eager ») : on
        // relance le tour une fois ; les erreurs d'API, elles, sont remontées.
        if (!(err instanceof Anthropic.APIError) && err instanceof SyntaxError && attempt < 1) {
          logger.warn({ err: err.message }, "Entrée d'outil illisible — nouvel essai du tour");
          continue;
        }
        throw toAppError(err);
      }
    }
  }
}

export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof Anthropic.RateLimitError)
    return AppError.unavailable("L'assistant est très sollicité. Réessayez dans un instant.", "ASSISTANT_BUSY");
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    logger.error({ err: (err as Error).message }, "Clé de l'assistant refusée");
    return AppError.unavailable("L'assistant est momentanément indisponible.", "ASSISTANT_CONFIG");
  }
  if (err instanceof Anthropic.APIConnectionError || err instanceof Anthropic.InternalServerError) {
    return AppError.unavailable("L'assistant ne répond pas. Réessayez dans un instant.", "ASSISTANT_UNREACHABLE");
  }
  if (err instanceof Anthropic.APIError) {
    logger.error({ status: err.status, err: err.message }, "Erreur de l'API du modèle");
    return AppError.unavailable("L'assistant n'a pas pu traiter la demande.", "ASSISTANT_ERROR");
  }
  logger.error({ err }, "Erreur inattendue de l'assistant");
  return AppError.unavailable("L'assistant n'a pas pu traiter la demande.", "ASSISTANT_ERROR");
}

let override: LlmClient | null | undefined;
let defaultClient: LlmClient | null | undefined;

/** Modèle utilisé (null si aucune clé n'est configurée : l'assistant le dit clairement). */
export function getLlm(): LlmClient | null {
  if (override !== undefined) return override;
  if (defaultClient === undefined) defaultClient = env.ANTHROPIC_API_KEY ? new AnthropicLlm(env.ANTHROPIC_API_KEY) : null;
  return defaultClient;
}

/** Tests uniquement : remplace le modèle (undefined = revenir au modèle réel). */
export function setLlmForTests(client: LlmClient | null | undefined): void {
  override = client;
}
