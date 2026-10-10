import { passwordProblems, PASSWORD_MIN_LENGTH } from "@aussitot/shared";

/** Règles du mot de passe vérifiées en direct (les mêmes que celles appliquées par le serveur). */
export function passwordChecks(next: string, confirm: string, context: string[]) {
  const problems = passwordProblems(next, context);
  const checks = [
    { label: `Au moins ${PASSWORD_MIN_LENGTH} caractères`, ok: next.length >= PASSWORD_MIN_LENGTH },
    {
      label: "Assez varié (3 types de caractères) ou une phrase de 16 caractères",
      ok: next.length >= PASSWORD_MIN_LENGTH && problems.every((p) => !p.startsWith("Mélangez")),
    },
    { label: "Sans votre nom ni votre identifiant", ok: next.length > 0 && problems.every((p) => !p.startsWith("Ne doit pas")) },
    { label: "Identique dans les deux champs", ok: next.length > 0 && next === confirm },
  ];
  return { checks, valid: problems.length === 0 && next === confirm };
}
