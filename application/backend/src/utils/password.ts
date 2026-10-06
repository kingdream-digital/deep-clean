import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";

// bcryptjs est une implémentation pure JS (pas de binding natif) : le calcul
// tourne entièrement sur le thread JS principal et bloque l'event loop le
// temps du hash/compare. Sur l'hébergement actuel (CPU partagé/limité), un
// facteur de coût 12 fait grimper un login à plusieurs secondes en solo, et
// à ~20s quand plusieurs employés se connectent en même temps (chaque
// login se sérialise derrière les autres sur le même thread) — constaté
// lors d'un test de charge (2026-09-23). Le coût bcrypt double à chaque
// palier : 12 → 10 réduit le calcul d'un facteur ~4 tout en restant dans la
// fourchette recommandée (OWASP recommande 10 comme base). Les hachages
// existants restent valides : le coût est encodé dans le hash lui-même,
// bcrypt.compare le relit directement, aucune migration nécessaire.
const SALT_ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// Politique de mot de passe appliquée côté serveur (jamais uniquement côté mobile).
const MIN_LENGTH = 10;

export interface PasswordPolicyResult {
  valid: boolean;
  errors: string[];
}

export function checkPasswordPolicy(password: string): PasswordPolicyResult {
  const errors: string[] = [];

  if (password.length < MIN_LENGTH) {
    errors.push(`Le mot de passe doit contenir au moins ${MIN_LENGTH} caractères.`);
  }
  if (!/[a-z]/.test(password)) {
    errors.push("Le mot de passe doit contenir au moins une lettre minuscule.");
  }
  if (!/[A-Z]/.test(password)) {
    errors.push("Le mot de passe doit contenir au moins une lettre majuscule.");
  }
  if (!/[0-9]/.test(password)) {
    errors.push("Le mot de passe doit contenir au moins un chiffre.");
  }
  if (!/[^a-zA-Z0-9]/.test(password)) {
    errors.push("Le mot de passe doit contenir au moins un caractère spécial.");
  }

  return { valid: errors.length === 0, errors };
}

// Génère un mot de passe temporaire lisible pour que la RH puisse le communiquer à l'utilisateur.
const TEMP_PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";

// Tirage cryptographique (retour d'audit : Math.random n'est pas sûr) ; une
// lettre minuscule, une majuscule, un chiffre et un caractère spécial sont
// garantis puis mélangés à des positions aléatoires — plus de suffixe fixe.
export function generateTemporaryPassword(length = 16): string {
  const pick = (chars: string) => chars[randomInt(chars.length)]!;
  const required = [pick("abcdefghijkmnpqrstuvwxyz"), pick("ABCDEFGHJKLMNPQRSTUVWXYZ"), pick("23456789"), pick("!@#$%")];
  const chars = required.concat(Array.from({ length: Math.max(0, length - required.length) }, () => pick(TEMP_PASSWORD_CHARS)));
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}
