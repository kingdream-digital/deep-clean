import { z, ZodIssueCode } from "zod";
import type { ZodErrorMap } from "zod";

// Messages de validation en français, avec le nom du champ (retour d'audit :
// l'app n'affichait que « Données invalides. » sans dire quoi corriger).
// Les messages déjà rédigés dans les schémas (ex. politique de mot de passe)
// restent prioritaires.
const FIELD_LABELS: Record<string, string> = {
  email: "l'adresse e-mail",
  contactEmail: "l'adresse e-mail du contact",
  phone: "le téléphone",
  firstName: "le prénom",
  lastName: "le nom",
  companyName: "le nom de l'entreprise",
  name: "le nom",
  title: "le titre",
  description: "la description",
  comment: "le commentaire",
  body: "le message",
  address: "l'adresse",
  newPassword: "le nouveau mot de passe",
  currentPassword: "le mot de passe actuel",
  startDate: "la date de début",
  endDate: "la date de fin",
  date: "la date",
  startTime: "l'heure de début",
  endTime: "l'heure de fin",
  siret: "le SIRET",
  siren: "le SIREN",
  quantity: "la quantité",
  unitPriceHt: "le prix unitaire",
  weeklyHours: "les heures par semaine",
  days: "le nombre de jours",
  note: "le motif",
  reason: "le motif",
};

function fieldLabel(path: (string | number)[]): string {
  const key = [...path].reverse().find((p) => typeof p === "string") as string | undefined;
  return key ? FIELD_LABELS[key] ?? `le champ « ${key} »` : "une valeur";
}

const frenchErrorMap: ZodErrorMap = (issue, ctx) => {
  const field = fieldLabel(issue.path);
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === "undefined") return { message: `Merci de renseigner ${field}.` };
      return { message: `Format invalide pour ${field}.` };
    case ZodIssueCode.invalid_string:
      if (issue.validation === "email") return { message: `${capitalize(field)} n'est pas valide.` };
      return { message: `Format invalide pour ${field}.` };
    case ZodIssueCode.too_small:
      if (issue.type === "string") {
        return { message: Number(issue.minimum) <= 1 ? `Merci de renseigner ${field}.` : `${capitalize(field)} doit contenir au moins ${issue.minimum} caractères.` };
      }
      if (issue.type === "array") return { message: `Ajoutez au moins ${issue.minimum} élément${Number(issue.minimum) > 1 ? "s" : ""}.` };
      return { message: `${capitalize(field)} doit être au moins ${issue.minimum}.` };
    case ZodIssueCode.too_big:
      if (issue.type === "string") return { message: `${capitalize(field)} ne doit pas dépasser ${issue.maximum} caractères.` };
      if (issue.type === "array") return { message: `Pas plus de ${issue.maximum} éléments.` };
      return { message: `${capitalize(field)} ne doit pas dépasser ${issue.maximum}.` };
    case ZodIssueCode.invalid_enum_value:
      return { message: `Valeur non autorisée pour ${field}.` };
    case ZodIssueCode.invalid_date:
      return { message: `Date invalide pour ${field}.` };
    default:
      return { message: ctx.defaultError };
  }
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

z.setErrorMap(frenchErrorMap);
