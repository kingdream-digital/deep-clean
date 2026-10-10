import pino from "pino";
import { env } from "../config/env.ts";

/**
 * Journal technique (JSON en production, lisible en développement). Les
 * champs sensibles sont masqués à la source : jamais de mot de passe, de
 * jeton ou de clé dans les logs.
 */
export const logger = pino({
  level: env.isTest ? "silent" : env.LOG_LEVEL,
  base: { service: "aussitot-api" },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers['set-cookie']",
      "*.password",
      "*.passwordHash",
      "*.currentPassword",
      "*.newPassword",
      "*.refreshToken",
      "*.accessToken",
      "*.temporaryPassword",
      "*.token",
    ],
    censor: "[masqué]",
  },
  transport:
    !env.isProduction && !env.isTest
      ? { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname,service" } }
      : undefined,
});
