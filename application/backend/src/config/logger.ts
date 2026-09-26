import pino from "pino";
import { env } from "./env";

// Logger structuré. En production : JSON brut (ingestible par un agrégateur de logs).
// En développement : sortie lisible via pino-pretty.
export const logger = pino({
  level: env.isProduction ? "info" : "debug",
  transport: env.isProduction
    ? undefined
    : {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
      },
  redact: {
    // Les patterns "*.x" ne redactent QUE les champs imbriqués à un niveau précis
    // (ex: user.password), jamais une clé directement au premier niveau de l'objet
    // loggé (ex: logger.warn({ token: ... })) ni les imbrications à 2 niveaux et plus
    // (ex: req.body.password) — vérifié empiriquement, ce n'est pas un comportement
    // récursif façon glob. Sans les entrées "nues" et "*.*.x" ci-dessous, un appel
    // comme celui de pushSender.ts (`logger.warn({ token: ... })`) publiait le jeton
    // push en clair dans les logs malgré la config de redaction. On couvre donc
    // explicitement : niveau 0 (clé nue), niveau 1 ("*.x") et niveau 2 ("*.*.x").
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "password",
      "*.password",
      "*.*.password",
      "passwordHash",
      "*.passwordHash",
      "*.*.passwordHash",
      "token",
      "*.token",
      "*.*.token",
      "refreshToken",
      "*.refreshToken",
      "*.*.refreshToken",
      "accessToken",
      "*.accessToken",
      "*.*.accessToken",
    ],
    censor: "[REDACTED]",
  },
});
