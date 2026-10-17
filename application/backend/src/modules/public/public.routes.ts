import { Router } from "express";
import rateLimit from "express-rate-limit";
import { asyncHandler } from "../../utils/asyncHandler";
import { validate } from "../../middleware/validate.middleware";
import { ApiError } from "../../utils/ApiError";
import { maintenanceStatus } from "../../config/maintenance";
import { quoteRequestSchema } from "./public.validation";
import { submitQuoteRequest } from "./public.service";

// Espace public de l'application (sans compte) : seule la demande de devis
// écrit en base. Limite stricte par adresse IP, en plus de la limite générale.
export const publicRouter = Router();

const quoteRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "TOO_MANY_REQUESTS", message: "Vous avez déjà envoyé plusieurs demandes. Réessayez dans une heure." } },
});

publicRouter.post(
  "/quote-requests",
  quoteRequestLimiter,
  validate(quoteRequestSchema),
  asyncHandler(async (req, res) => {
    const status = maintenanceStatus();
    if (status.maintenance) {
      throw new ApiError(503, "MAINTENANCE", status.message ?? "Mise à jour en cours.", { until: status.until });
    }
    await submitQuoteRequest(req.body, { ipAddress: req.ip });
    res.status(201).json({ message: "Votre demande a bien été envoyée. Nous revenons vers vous sous 24 à 48 h." });
  })
);
