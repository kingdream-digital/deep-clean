/** Contrôles d'identifiants français, partagés API / app. */

/** Algorithme de Luhn (SIREN, SIRET). */
function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    let n = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

export function normalizeDigits(value: string): string {
  return value.replace(/[\s.\-]/g, "");
}

export function isValidSiren(value: string): boolean {
  const digits = normalizeDigits(value);
  return /^\d{9}$/.test(digits) && luhn(digits);
}

export function isValidSiret(value: string): boolean {
  const digits = normalizeDigits(value);
  if (!/^\d{14}$/.test(digits)) return false;
  // Les établissements de La Poste (SIREN 356000000) dérogent à la règle de Luhn.
  if (digits.startsWith("356000000")) return true;
  return luhn(digits);
}

export function sirenFromSiret(siret: string): string {
  return normalizeDigits(siret).slice(0, 9);
}

/** IBAN : contrôle modulo 97 (ISO 13616). */
export function isValidIban(value: string): boolean {
  const iban = value.replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const code = char >= "A" && char <= "Z" ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of code) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

export function formatIban(value: string): string {
  return value.replace(/\s/g, "").toUpperCase().replace(/(.{4})/g, "$1 ").trim();
}

/**
 * Politique de mot de passe (recommandation CNIL) : au moins 12 caractères
 * mêlant au moins 3 types parmi minuscules, majuscules, chiffres et
 * caractères spéciaux — ou une phrase de passe d'au moins 16 caractères.
 */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSPHRASE_MIN_LENGTH = 16;

export function passwordProblems(password: string, context: string[] = []): string[] {
  const problems: string[] = [];
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z0-9]/].filter((re) => re.test(password)).length;
  if (password.length < PASSWORD_MIN_LENGTH) {
    problems.push(`Au moins ${PASSWORD_MIN_LENGTH} caractères.`);
  } else if (password.length < PASSPHRASE_MIN_LENGTH && classes < 3) {
    problems.push("Mélangez au moins 3 types de caractères (minuscules, majuscules, chiffres, symboles), ou utilisez une phrase d'au moins 16 caractères.");
  }
  const lowered = password.toLowerCase();
  for (const word of context) {
    if (word && word.length >= 4 && lowered.includes(word.toLowerCase())) {
      problems.push("Ne doit pas contenir votre nom ou votre identifiant.");
      break;
    }
  }
  if (password.length > 256) problems.push("256 caractères au maximum.");
  return problems;
}
