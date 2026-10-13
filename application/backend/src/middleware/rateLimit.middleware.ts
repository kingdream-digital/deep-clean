import rateLimit from "express-rate-limit";
import type { Request } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

// Clé de compteur : l'utilisateur authentifié (extrait du JWT d'accès, sans
// vérifier sa signature — un `jwt.decode()`, jamais utilisé pour autoriser
// quoi que ce soit, juste pour choisir le bon compartiment de compteur) si la
// requête en porte un, sinon l'IP comme avant.
//
// Sans ça, la limite générale (300/15min) était partagée par IP entre TOUS
// les utilisateurs derrière la même box/le même NAT — un scénario courant
// pour une entreprise de nettoyage où plusieurs employés/chefs d'équipe
// sont au même bureau. Vérifié en conditions réelles (audit web) : quelques
// minutes d'usage normal et concurrent suffisaient à épuiser la limite et
// bloquaient alors TOUTE l'API, pour TOUT LE MONDE derrière cette IP, pendant
// 15 minutes — pas seulement pour la personne à l'origine du pic. Chaque
// utilisateur connecté a désormais son propre compteur ; seules les requêtes
// non authentifiées (avant connexion) restent groupées par IP.
function userAwareKeyGenerator(request: Request): string {
  const header = request.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      const decoded = jwt.decode(header.slice(7)) as { sub?: string } | null;
      if (decoded?.sub) return `user:${decoded.sub}`;
    } catch {
      // Jeton illisible : on retombe sur l'IP, comme pour une requête non authentifiée.
    }
  }
  return request.ip ?? "unknown";
}

// Limite générale sur toute l'API.
export const generalRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userAwareKeyGenerator,
  message: { error: { code: "TOO_MANY_REQUESTS", message: "Trop de requêtes, réessayez plus tard." } },
});

// Protection anti-force-brute des mots de passe. BUG CORRIGÉ (test de charge,
// 48 premières connexions simultanées depuis le Wi-Fi d'un même bureau) : un
// compteur unique PAR IP plafonné à 10 bloquait tout le bureau — les
// connexions simultanées dépassaient 10 avant que les réussites ne soient
// décomptées, puis chaque refus « 429 » comptait lui-même comme un échec :
// plus personne ne pouvait se connecter ni changer son mot de passe pendant
// 15 minutes. Désormais :
// - par COMPTE et par IP : 10 échecs (protège chaque compte du brute force) ;
// - par IP seule : un plafond large d'échecs (bloque l'essai de nombreux
//   comptes depuis une même machine) ;
// les connexions réussies ne comptent jamais (skipSuccessfulRequests).
function loginAccountKey(request: Request): string {
  const username = typeof request.body?.username === "string" ? request.body.username.trim().toLowerCase().slice(0, 100) : "";
  return `login:${request.ip ?? "unknown"}:${username}`;
}

const tooManyLogins = {
  error: { code: "TOO_MANY_REQUESTS", message: "Trop de tentatives de connexion, réessayez plus tard." },
};

export const loginRateLimiters = [
  rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
    max: env.AUTH_IP_RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: tooManyLogins,
  }),
  rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
    max: env.AUTH_RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    keyGenerator: loginAccountKey,
    message: tooManyLogins,
  }),
];

// Changement de mot de passe : l'utilisateur est déjà connecté (jeton
// d'accès), on compte donc ses échecs à lui (mot de passe actuel erroné), et
// non ceux de toute son IP. `/refresh` n'est volontairement soumis à aucune
// de ces limites : un jeton de rafraîchissement (64 octets aléatoires) ne se
// devine pas, et le rafraîchissement automatique fait partie de l'usage
// normal — il reste couvert par la limite générale.
export const changePasswordRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  max: env.AUTH_RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: userAwareKeyGenerator,
  message: tooManyLogins,
});

// Limite dédiée sur les routes RH sensibles (création de compte, activation/
// désactivation, réinitialisation d'accès) : jusqu'ici seule la limite
// générale de l'API (300/15min, partagée avec toutes les routes) s'y
// appliquait — un token RH compromis pouvait l'épuiser en créant/désactivant
// des comptes en masse avant d'être bloqué. Plafond volontairement plus
// large que celui du login (usage RH légitime répété dans une même session
// d'administration), mais bien plus strict que la limite générale. Gardée
// par utilisateur (même logique que `generalRateLimiter`) : plus précis pour
// arrêter UN token compromis sans bloquer le reste de l'équipe RH derrière
// la même IP.
export const hrSensitiveRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  // 30 bloquait la RH au 31e compte le jour de la mise en service (inscription
  // de toute l'équipe, constaté en test de charge) : réglable, 100 par défaut.
  max: env.HR_RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userAwareKeyGenerator,
  message: { error: { code: "TOO_MANY_REQUESTS", message: "Trop de requêtes sur cette action, réessayez plus tard." } },
});
