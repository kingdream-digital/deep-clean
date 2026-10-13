import { classifyReply, extractQuoteNumbers, extractReplyText } from "../src/modules/quoteReplies/replyClassifier";

// Vraies tournures de clients, telles qu'elles arrivent par email.
const POSITIVE_REPLIES = [
  "Bonjour, ok pour moi. Cordialement",
  "C'est bon pour moi !",
  "Bon pour accord.",
  "Bonjour,\nJe vous confirme notre accord pour le devis DEV-2026-0001.\nBien à vous",
  "Parfait, on valide.",
  "Ça nous va, vous pouvez commencer lundi.",
  "Nous acceptons votre proposition.",
  "J'accepte le devis.",
  "Vous trouverez ci-joint le devis signé.",
  "OK c'est bon, quand pouvez-vous commencer ?",
  "Top, on part là-dessus !",
  "Pas de souci, c'est validé de notre côté.",
  "D'accord, merci.",
  "Feu vert pour la prestation.",
  "Très bien, je vous confirme.",
];

const NEGATIVE_REPLIES = [
  "Non merci.",
  "Non, ce n'est pas possible pour nous.",
  "Bonjour, nous ne donnerons pas suite à votre devis.",
  "C'est trop cher pour nous.",
  "Malheureusement nous avons choisi un autre prestataire.",
  "Je ne suis pas intéressé.",
  "Nous ne sommes pas intéressés pour le moment.",
  "Votre offre n'a pas été retenue.",
  "Je n'accepte pas ce devis.",
  "Pas d'accord avec ce tarif.",
  "Ça ne nous convient pas.",
  "Hors budget, désolé.",
  "On passe notre tour cette fois-ci.",
  "Nous déclinons votre offre.",
];

const UNCLEAR_REPLIES = [
  "OK mais pouvez-vous baisser le prix ?",
  "C'est bon pour moi, sauf la vitrerie à retirer.",
  "Merci, je reviens vers vous la semaine prochaine.",
  "Est-il possible de commencer plus tôt ?",
  "Bien reçu.",
  "J'ai une question sur la ligne 2.",
  "Intéressé, mais nous attendons d'autres devis.",
];

describe("Lecture par mots-clés des réponses aux devis", () => {
  it.each(POSITIVE_REPLIES)("lit comme positive : %s", (reply) => {
    expect(classifyReply(reply).intent).toBe("POSITIVE");
  });

  it.each(NEGATIVE_REPLIES)("lit comme négative : %s", (reply) => {
    expect(classifyReply(reply).intent).toBe("NEGATIVE");
  });

  it.each(UNCLEAR_REPLIES)("laisse à lire (ni accord ni refus nets) : %s", (reply) => {
    expect(classifyReply(reply).intent).toBe("UNCLEAR");
  });

  it("ne compte jamais « pas d'accord » comme un accord", () => {
    const result = classifyReply("Pas d'accord.");
    expect(result.intent).toBe("NEGATIVE");
    expect(result.positive).toEqual([]);
  });

  it("indique les mots-clés trouvés, pour que l'humain comprenne la suggestion", () => {
    const result = classifyReply("Bon pour accord, merci");
    expect(result.positive).toContain("bon pour accord");
  });
});

describe("Extraction de la réponse (sans le message cité)", () => {
  it("coupe au « Le … a écrit : » de Gmail et ignore l'ancien message", () => {
    const body = [
      "Non merci.",
      "",
      "Le lun. 13 oct. 2026 à 10:00, Deep Clean <contact@deepclean.fr> a écrit :",
      "> Veuillez trouver ci-joint notre devis DEV-2026-0001.",
      "> Bon pour accord",
    ].join("\n");
    expect(extractReplyText(body)).toBe("Non merci.");
    expect(classifyReply(extractReplyText(body)).intent).toBe("NEGATIVE");
  });

  it("ignore les lignes citées « > » et les en-têtes Outlook « De : »", () => {
    expect(extractReplyText("C'est bon pour moi\n> ancien texte\nsuite")).toBe("C'est bon pour moi\nsuite");
    expect(extractReplyText("Ok pour nous\n\nDe : Deep Clean\nEnvoyé : lundi")).toBe("Ok pour nous");
  });
});

describe("Repérage du numéro de devis", () => {
  it("trouve le numéro dans l'objet « Re: Devis DEV-2026-0001 — … »", () => {
    expect(extractQuoteNumbers("Re: Devis DEV-2026-0001 — Boulangerie Martin")).toEqual(["DEV-2026-0001"]);
  });

  it("accepte la casse minuscule et dédoublonne", () => {
    expect(extractQuoteNumbers("dev-2026-0007 et DEV-2026-0007, DEV-2026-0012")).toEqual(["DEV-2026-0007", "DEV-2026-0012"]);
  });
});
