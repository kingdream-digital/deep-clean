import { Router } from "express";
import { Role } from "@prisma/client";
import { authenticate } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import { updateWelcomeOfferSchema } from "./welcomeOffer.validation";
import { getWelcomeOfferSettings, saveWelcomeOffer } from "./welcomeOffer.service";

// Réglage de l'offre de bienvenue : Direction et admin technique uniquement
// (une offre commerciale engage l'entreprise). La lecture publique passe par
// GET /api/v1/public/welcome-offer.
export const WELCOME_OFFER_ROLES: Role[] = [Role.DIRECTOR, Role.ADMIN];

export const welcomeOfferRouter = Router();
welcomeOfferRouter.use(authenticate(), requireRole(...WELCOME_OFFER_ROLES));

welcomeOfferRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json({ offer: await getWelcomeOfferSettings() });
  })
);

welcomeOfferRouter.put(
  "/",
  validate(updateWelcomeOfferSchema),
  asyncHandler(async (req, res) => {
    res.json({ offer: await saveWelcomeOffer(req.body, { userId: req.auth!.userId, ipAddress: req.ip }) });
  })
);
