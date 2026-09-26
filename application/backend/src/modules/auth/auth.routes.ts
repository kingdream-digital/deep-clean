import { Router } from "express";
import { authRateLimiter } from "../../middleware/rateLimit.middleware";
import { validate } from "../../middleware/validate.middleware";
import { authenticate } from "../../middleware/auth.middleware";
import { changePasswordSchema, loginSchema, logoutSchema, refreshSchema } from "./auth.validation";
import * as authController from "./auth.controller";

export const authRouter = Router();

// Pas de route d'inscription : les comptes sont exclusivement créés par la RH (voir users.routes.ts).
authRouter.post("/login", authRateLimiter, validate(loginSchema), authController.loginHandler);
// Pas de authRateLimiter ici : un refresh token ne se devine pas par force
// brute (64 octets aléatoires), et le rafraîchissement automatique à chaque
// expiration de session fait partie de l'usage normal — le compter dans la
// même limite stricte que /login bloquait un utilisateur légitime qui n'a
// jamais tapé un mauvais mot de passe (voir middleware/rateLimit.middleware.ts).
// Reste couvert par la limite générale de l'API.
authRouter.post("/refresh", validate(refreshSchema), authController.refreshHandler);
authRouter.post("/logout", validate(logoutSchema), authController.logoutHandler);

// Les deux seules routes accessibles avec un mot de passe temporaire jamais
// changé : consulter son profil et le changer (voir authenticate()).
authRouter.get("/me", authenticate({ allowPasswordChangePending: true }), authController.meHandler);
authRouter.post(
  "/change-password",
  authRateLimiter,
  authenticate({ allowPasswordChangePending: true }),
  validate(changePasswordSchema),
  authController.changePasswordHandler
);
