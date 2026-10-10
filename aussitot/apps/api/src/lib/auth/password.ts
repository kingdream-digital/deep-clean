import { randomInt } from "node:crypto";
import argon2 from "argon2";

/**
 * Hachage des mots de passe : Argon2id (recommandation OWASP), exécuté par
 * une bibliothèque native dans le pool de threads de Node — il ne bloque
 * jamais la boucle d'événements. (Deep Clean utilisait bcrypt en JavaScript
 * pur : en test de charge, une vague de connexions simultanées faisait monter
 * chaque connexion à ~20 s.)
 */
const OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456, // 19 Mio
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, OPTIONS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

let decoyHash: Promise<string> | null = null;

/**
 * Vérification factice quand l'identifiant n'existe pas : le temps de réponse
 * est le même que pour un mauvais mot de passe (pas d'énumération de comptes).
 */
export async function verifyDecoy(plain: string): Promise<void> {
  decoyHash ??= hashPassword(`decoy-${randomInt(1e9)}`);
  await verifyPassword(await decoyHash, plain);
}

const LOWER = "abcdefghijkmnpqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%*?";
const ALL = LOWER + UPPER + DIGITS + SYMBOLS;

/** Mot de passe temporaire lisible (sans caractères ambigus) remis par la RH. */
export function generateTemporaryPassword(length = 14): string {
  const pick = (chars: string) => chars[randomInt(chars.length)]!;
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < length) chars.push(pick(ALL));
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}

/** « Jean-Éric Dupont » → « jdupont » (lettres minuscules sans accents). */
export function baseUsername(firstName: string, lastName: string): string {
  const clean = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z]/g, "");
  const base = `${clean(firstName).slice(0, 1)}${clean(lastName)}`.slice(0, 24);
  return base.length >= 2 ? base : `utilisateur${base}`;
}
