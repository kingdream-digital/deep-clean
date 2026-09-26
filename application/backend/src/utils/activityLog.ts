import { prisma } from "../db/prisma";
import { logger } from "../config/logger";

interface LogActivityInput {
  userId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

/**
 * Journal d'activité pour les actions sensibles (comptes, plannings, validations...).
 * N'échoue jamais l'opération métier principale : une erreur de log est capturée
 * et journalisée séparément plutôt que de faire échouer la requête utilisateur.
 */
export async function logActivity(input: LogActivityInput): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: input.metadata as never,
        ipAddress: input.ipAddress,
      },
    });
  } catch (err) {
    logger.error({ err, input }, "Échec de l'écriture du journal d'activité");
  }
}
