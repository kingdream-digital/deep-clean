// Lecture par mots-clés de la réponse d'un client à un devis (retour explicite
// du client : « plein de mots-clés », sans IA — tout reste sur le serveur).
// Le résultat n'est qu'une SUGGESTION : la décision Accepté / Refusé est
// toujours confirmée en un clic par un humain (voir quoteReplies.service.ts).

export type ReplyIntent = "POSITIVE" | "NEGATIVE" | "UNCLEAR";

export interface ReplyClassification {
  intent: ReplyIntent;
  positive: string[];
  negative: string[];
  doubts: string[];
}

// Formules de REFUS. Lues en premier puis retirées du texte : « pas d'accord »
// ne doit jamais compter comme « d'accord », ni « pas intéressé » comme
// « intéressé ». Écrites sans accents (le texte est normalisé de même).
const NEGATIVE_PHRASES = [
  // pas de suite / pas intéressé
  "ne donnerons pas suite", "ne donnons pas suite", "ne pas donner suite", "pas donner suite", "pas de suite a donner", "sans suite",
  "pas interesse", "pas interesses", "pas interessee", "pas interessees", "plus interesse", "plus interesses",
  "ne sommes pas interesses", "ne suis pas interesse", "ne suis pas interessee",
  // prix / budget
  "trop cher", "trop chere", "trop chers", "trop eleve", "trop eleves", "trop onereux", "hors budget", "hors de notre budget",
  "au dessus de notre budget", "au-dessus de notre budget", "depasse notre budget", "depasse mon budget", "pas le budget",
  "pas les moyens", "budget insuffisant", "budget trop juste",
  // refus explicite
  "non merci", "malheureusement", "je refuse", "nous refusons", "on refuse", "refusons", "refuse", "refus",
  "je decline", "nous declinons", "declinons", "decline", "decliner",
  "n'accepte pas", "n'acceptons pas", "n'acceptez pas", "ne pouvons pas accepter", "ne peux pas accepter", "ne pas accepter",
  "ne valide pas", "ne validons pas", "ne pas valider", "pas d'accord", "pas daccord",
  "ne nous convient pas", "ne me convient pas", "ne convient pas", "ne correspond pas", "ne correspond pas a nos attentes",
  "ca ne va pas", "ca ne me va pas", "ca ne nous va pas", "ne nous va pas", "ne me va pas",
  "ne souhaite pas", "ne souhaitons pas", "ne souhaitons plus", "ne desire pas", "ne desirons pas",
  "on ne va pas", "nous n'allons pas", "je ne vais pas", "ne pas poursuivre", "pas poursuivre", "ne poursuivrons pas",
  "pas convaincu", "pas convaincus", "pas convaincue", "pas retenu", "pas ete retenu", "pas ete retenue", "n'avons pas retenu",
  "non retenu", "non retenue", "pas ete selectionne", "pas selectionne",
  // autre choix / report sine die
  "autre prestataire", "autre entreprise", "autre societe", "un concurrent", "la concurrence", "deja un prestataire",
  "deja trouve", "avons trouve quelqu'un", "avons choisi une autre", "choisi un autre",
  "pas pour le moment", "pas pour l'instant", "pas maintenant", "pas cette annee", "on passe notre tour", "je passe mon tour",
  "nous passons notre tour", "je renonce", "nous renoncons", "renoncons", "renonce", "abandonnons", "on abandonne",
  "j'annule", "nous annulons", "on annule", "annulons",
  "c'est non", "ce sera non", "ca sera non", "reponse negative", "avis defavorable", "pas favorable", "defavorable",
];

// Formules d'ACCORD.
const POSITIVE_PHRASES = [
  "bon pour accord", "bpa", "j'accepte", "nous acceptons", "on accepte", "acceptons", "accepte", "acceptee",
  "d'accord", "daccord", "dac", "ok", "okay", "oki", "okey", "c'est bon", "cest bon", "c bon", "c'est ok", "cest ok",
  "c'est tout bon", "on est bon", "on est ok", "c'est parfait", "parfait", "impeccable", "nickel",
  "ca me va", "ca nous va", "ca marche", "ca roule", "ca me convient", "ca nous convient", "nous convient", "me convient", "convient parfaitement",
  "ok pour moi", "ok pour nous", "bon pour moi", "bon pour nous", "valide pour moi", "valide pour nous",
  "je valide", "on valide", "nous validons", "validons", "valide", "validee",
  "go", "banco", "allons-y", "allons y", "on y va", "on part la-dessus", "on part la dessus", "on part sur", "on fonce",
  "feu vert", "donnons notre accord", "donne mon accord", "notre accord", "mon accord", "accord",
  "vous pouvez commencer", "vous pouvez demarrer", "vous pouvez lancer", "quand pouvez-vous commencer", "quand pouvez vous commencer",
  "quand pouvez-vous demarrer", "quand commencez-vous", "a partir de quand", "date de debut", "pour demarrer",
  "on signe", "je signe", "nous signons", "devis signe", "ci-joint le devis signe", "ci joint le devis signe", "ci-joint signe", "signe et tamponne",
  "je confirme", "nous confirmons", "on confirme", "confirme", "confirmons", "je vous confirme", "nous vous confirmons",
  "je commande", "nous commandons", "bon de commande", "passons commande", "on prend", "je prends", "nous prenons",
  "partant", "partants", "partante", "interesse", "interesses", "interessee",
  "pas de souci", "pas de soucis", "pas de probleme", "aucun souci", "aucun probleme", "sans probleme", "sans souci",
  "tres bien", "entendu", "c'est entendu", "top", "super", "genial", "excellent", "parfaitement",
];

// Signes de DOUTE : négociation, question, réponse différée. Avec une formule
// d'accord, le message est classé « À lire » plutôt que « positif » — un
// « OK mais pouvez-vous baisser le prix ? » n'est pas une acceptation.
const DOUBT_PHRASES = [
  "mais", "cependant", "toutefois", "neanmoins", "par contre", "en revanche", "sauf", "a condition", "sous reserve", "si vous",
  "pourriez-vous", "pourriez vous", "pouvez-vous", "pouvez vous", "serait-il possible", "est-il possible", "est-ce possible",
  "est ce possible", "est-ce que", "est ce que", "possible de",
  "revoir le prix", "revoir votre prix", "revoir le tarif", "baisser", "baisse", "reduire", "remise", "rabais", "ristourne",
  "negocier", "negociation", "geste commercial", "moins cher", "meilleur prix", "un effort",
  "question", "questions", "precision", "precisions", "detail", "details", "modifier", "modification", "ajuster", "ajout", "retirer",
  "rappelez-moi", "appelez-moi", "en discuter", "discuter", "rendez-vous", "rdv",
  "reflechir", "reflexion", "je reviens vers vous", "nous revenons vers vous", "on revient vers vous", "je vous reviens",
  "nous vous reviendrons", "je vous recontacte", "nous vous recontacterons", "en attente", "plus tard", "a voir", "on verra",
  "comparer", "comparatif", "d'autres devis", "autres devis",
];

// Minuscules, sans accents, apostrophes et espaces homogènes.
export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\u2019\u2018\u02bc`\u00b4]/g, "'")
    .replace(/[\u00a0\s]+/g, " ")
    .trim();
}

// Lignes qui marquent le début du message cité (la réponse est au-dessus).
const QUOTE_HEADER_PATTERNS = [
  /^le .{3,200} a (ecrit|ecrit\s*:)/,
  /^on .{3,200} wrote:?/,
  /^-{2,}\s*(message d'origine|original message|message transfere|forwarded message)/,
  /^(de|from)\s*:\s*.+/,
  /^envoye (depuis|de) mon /,
  /^sent from my /,
];

/**
 * Garde uniquement ce que le client a écrit : coupe au début du message cité
 * (« Le lun. 13 oct. 2026, Deep Clean a écrit : », « De : … ») et ignore les
 * lignes citées commençant par « > ».
 */
export function extractReplyText(body: string): string {
  const kept: string[] = [];
  for (const rawLine of body.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trim();
    const normalized = normalizeText(line);
    if (QUOTE_HEADER_PATTERNS.some((pattern) => pattern.test(normalized))) break;
    if (line.startsWith(">")) continue;
    kept.push(rawLine);
  }
  return kept.join("\n").trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Trie du plus long au plus court : « bon pour accord » avant « accord ».
function compile(phrases: string[]): { phrase: string; regex: RegExp }[] {
  return [...new Set(phrases.map(normalizeText))]
    .sort((a, b) => b.length - a.length)
    .map((phrase) => ({ phrase, regex: new RegExp(`(^|[^a-z0-9'])${escapeRegex(phrase)}(?=$|[^a-z0-9])`, "g") }));
}

const NEGATIVE = compile(NEGATIVE_PHRASES);
const POSITIVE = compile(POSITIVE_PHRASES);
const DOUBT = compile(DOUBT_PHRASES);

// Trouve les formules présentes et les efface du texte (remplacées par des
// espaces) pour qu'une formule déjà comptée ne soit pas relue par la suite.
function takeMatches(text: string, patterns: { phrase: string; regex: RegExp }[]): { text: string; found: string[] } {
  const found: string[] = [];
  let remaining = text;
  for (const { phrase, regex } of patterns) {
    regex.lastIndex = 0;
    if (regex.test(remaining)) {
      found.push(phrase);
      regex.lastIndex = 0;
      remaining = remaining.replace(regex, (match, before: string) => before + " ".repeat(match.length - before.length));
    }
  }
  return { text: remaining, found };
}

/** Classe le texte de la réponse : positive, négative, ou à lire. */
export function classifyReply(replyText: string): ReplyClassification {
  let text = normalizeText(replyText);
  // « Non. » / « Non, … » en tout début de réponse : refus net.
  const startsWithNo = /^non\b/.test(text);

  const negative = takeMatches(text, NEGATIVE);
  text = negative.text;
  const positive = takeMatches(text, POSITIVE);
  text = positive.text;
  const doubts = takeMatches(text, DOUBT).found;
  const negativeFound = startsWithNo ? ["non", ...negative.found] : negative.found;

  let intent: ReplyIntent = "UNCLEAR";
  if (negativeFound.length && !positive.found.length) intent = "NEGATIVE";
  else if (positive.found.length && !negativeFound.length && !doubts.length) intent = "POSITIVE";

  return { intent, positive: positive.found, negative: negativeFound, doubts };
}

/** Numéros de devis (DEV-AAAA-NNNN) cités dans un texte, sans doublon. */
export function extractQuoteNumbers(text: string): string[] {
  const matches = text.toUpperCase().match(/\bDEV-\d{4}-\d{4,}\b/g) ?? [];
  return [...new Set(matches)];
}
