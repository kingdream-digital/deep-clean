import { prisma } from "../db/prisma";

// Retire les accents/diacritiques puis ne garde que les lettres ASCII — un
// identifiant de connexion doit rester simple à taper sur n'importe quel
// clavier, y compris pour un prénom/nom accentué ("Éric Noël" -> "enoel").
function toAsciiLetters(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

/**
 * Génère l'identifiant de connexion d'un nouveau compte : première lettre du
 * prénom + nom complet (ex. "Jean Dupont" -> "jdupont"), retour explicite du
 * client — jamais l'email. En cas de collision (homonymes), un suffixe
 * numérique croissant est ajouté (jdupont, jdupont2, jdupont3...) jusqu'à
 * trouver un identifiant libre.
 */
export async function generateUsername(firstName: string, lastName: string): Promise<string> {
  const base = `${toAsciiLetters(firstName).charAt(0)}${toAsciiLetters(lastName)}`;
  if (!base) {
    throw new Error("Impossible de générer un identifiant à partir de ce prénom/nom.");
  }

  let candidate = base;
  let suffix = 1;
  // Nombre de comptes attendu (quelques dizaines à quelques centaines) : une
  // boucle séquentielle reste largement assez rapide, pas besoin d'une
  // requête plus élaborée pour trouver le premier suffixe libre.
  // eslint-disable-next-line no-await-in-loop
  while (await prisma.user.findUnique({ where: { username: candidate }, select: { id: true } })) {
    suffix += 1;
    candidate = `${base}${suffix}`;
  }

  return candidate;
}
