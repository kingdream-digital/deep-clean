import { z } from "zod";
import { AppError } from "./errors.ts";

z.config(z.locales.fr());

/** Valide une entrée avec un schéma partagé ; lève une erreur 400 lisible sinon. */
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data ?? {});
  if (!result.success) {
    const details: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.length ? issue.path.join(".") : "_";
      (details[key] ??= []).push(issue.message);
    }
    throw AppError.validation(details);
  }
  return result.data;
}
