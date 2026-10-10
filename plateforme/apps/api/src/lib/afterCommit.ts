import { withTenant, type Db } from "./db.ts";
import { logger } from "./logger.ts";

/**
 * Effets à déclencher APRÈS la validation d'une transaction (notification
 * temps réel, mise en file d'un email ou d'un push) : jamais avant, sinon
 * on pourrait annoncer quelque chose qu'une erreur aurait finalement annulé.
 */
export class AfterCommit {
  private readonly tasks: (() => Promise<unknown>)[] = [];

  add(task: () => Promise<unknown>): void {
    this.tasks.push(task);
  }

  async run(): Promise<void> {
    for (const task of this.tasks) {
      try {
        await task();
      } catch (err) {
        // L'action principale est déjà enregistrée : on journalise sans échouer.
        logger.warn({ err }, "Effet post-transaction en échec");
      }
    }
  }
}

/** `withTenant` + effets post-validation. */
export async function withTenantEffects<T>(orgId: string, fn: (tx: Db, after: AfterCommit) => Promise<T>): Promise<T> {
  const after = new AfterCommit();
  const result = await withTenant(orgId, (tx) => fn(tx, after));
  await after.run();
  return result;
}
