import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { changePasswordSchema, loginSchema, type AuthResponseDto } from "@aussitot/shared";
import { env } from "../../config/env.ts";
import { parse } from "../../lib/validate.ts";
import { AppError } from "../../lib/errors.ts";
import { authenticate } from "../../plugins/auth.ts";
import * as auth from "./auth.service.ts";

/**
 * Sur le web, le jeton de renouvellement vit dans un cookie httpOnly (jamais
 * lisible par du JavaScript, donc à l'abri d'une faille XSS) ; les apps
 * natives le reçoivent dans la réponse et le rangent dans le trousseau
 * sécurisé du téléphone (Keychain / Keystore).
 */
const REFRESH_COOKIE = "aussitot_rt";
const COOKIE_PATH = "/v1/auth";

function isWebClient(request: FastifyRequest): boolean {
  return request.headers["x-client-platform"] === "web";
}

function sendAuth(request: FastifyRequest, reply: FastifyReply, result: auth.AuthResult, rememberMe?: boolean): AuthResponseDto {
  if (isWebClient(request)) {
    reply.setCookie(REFRESH_COOKIE, result.refreshToken, {
      httpOnly: true,
      secure: env.isProduction,
      sameSite: "strict",
      path: COOKIE_PATH,
      // Sans « Rester connecté » : cookie de session (effacé à la fermeture du navigateur).
      maxAge: rememberMe === false ? undefined : env.REMEMBER_ME_TTL_DAYS * 86_400,
    });
    const { refreshToken: _omit, ...rest } = result;
    return rest;
  }
  return result;
}

const refreshBodySchema = z.object({ refreshToken: z.string().min(20).max(200).optional() });

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/login",
    { config: { rateLimit: { max: env.LOGIN_RATE_LIMIT_PER_15_MIN, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const input = parse(loginSchema, request.body);
      const result = await auth.login(input, { ip: request.ip, userAgent: request.headers["user-agent"] });
      return sendAuth(request, reply, result, input.rememberMe);
    },
  );

  app.post("/refresh", { config: { rateLimit: { max: 120, timeWindow: "15 minutes" } } }, async (request, reply) => {
    const body = parse(refreshBodySchema, request.body);
    const token = body.refreshToken ?? request.cookies[REFRESH_COOKIE];
    if (!token) throw AppError.unauthorized();
    try {
      const result = await auth.refresh(token, { ip: request.ip, userAgent: request.headers["user-agent"] });
      return sendAuth(request, reply, result);
    } catch (err) {
      if (err instanceof AppError && err.status === 401 && err.code !== "REFRESH_RACE") {
        reply.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
      }
      throw err;
    }
  });

  app.post("/logout", { onRequest: authenticate, config: { allowPendingPasswordChange: true } }, async (request, reply) => {
    await auth.logout(request.ctx);
    reply.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
    return { ok: true };
  });

  app.get("/me", { onRequest: authenticate, config: { allowPendingPasswordChange: true } }, async (request) =>
    auth.currentUser(request.ctx),
  );

  app.post(
    "/change-password",
    { onRequest: authenticate, config: { allowPendingPasswordChange: true, rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (request) => {
      // La politique de mot de passe (schéma partagé + nom et identifiant de la
      // personne) est appliquée dans le service.
      const body = parse(changePasswordSchema.pick({ currentPassword: true }).extend({ newPassword: z.string().max(256) }), request.body);
      await auth.changeOwnPassword(request.ctx, body.currentPassword, body.newPassword);
      return { ok: true };
    },
  );
}
