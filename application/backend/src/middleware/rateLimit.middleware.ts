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

// Limite stricte et dédiée sur les routes d'authentification pour se protéger
// du brute force sur les mots de passe. Volontairement gardée par IP (pas de
// jeton d'accès disponible avant une connexion réussie — c'est justement ce
// qu'on protège) : `/login` et `/change-password` uniquement. `/refresh` ne
// doit PAS partager ce compteur : contrairement à un mot de passe, un jeton
// de rafraîchissement (64 octets aléatoires) ne se devine pas par force
// brute, et le rafraîchissement automatique et silencieux à chaque expiration
// de session fait partie de l'usage normal — le compter ici revenait à
// bloquer un utilisateur légitime, qui n'a jamais tapé un mauvais mot de
// passe, uniquement parce que sa session avait expiré plusieurs fois (bug
// trouvé en conditions réelles lors de l'audit web). `/refresh` reste
// couvert par la limite générale ci-dessus, largement suffisante pour ce
// trafic.
export const authRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  max: env.AUTH_RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    error: { code: "TOO_MANY_REQUESTS", message: "Trop de tentatives de connexion, réessayez plus tard." },
  },
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
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userAwareKeyGenerator,
  message: { error: { code: "TOO_MANY_REQUESTS", message: "Trop de requêtes sur cette action, réessayez plus tard." } },
});
