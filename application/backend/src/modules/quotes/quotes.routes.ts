import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { validate } from "../../middleware/validate.middleware";
import { COMMERCIAL_ROLES } from "../commercial/roles";
import {
  acceptQuoteSchema,
  createQuoteSchema,
  listQuotesQuerySchema,
  quoteIdParamSchema,
  recordFollowUpSchema,
  rejectQuoteSchema,
  sendQuoteSchema,
  updateQuoteSchema,
} from "./quotes.validation";
import * as quotesController from "./quotes.controller";

export const quotesRouter = Router();

// Module commercial réservé à Superviseur/RH/Direction/Admin — la portée
// exacte (tous les devis vs seulement les siens pour un Superviseur, et la
// validation réservée à RH/Direction/Admin) est appliquée dans
// quotes.service.ts.
quotesRouter.use(authenticate(), requireRole(...COMMERCIAL_ROLES));

quotesRouter.post("/", validate(createQuoteSchema), quotesController.createQuoteHandler);
quotesRouter.get("/", validate(listQuotesQuerySchema), quotesController.listQuotesHandler);
quotesRouter.get("/:id", validate(quoteIdParamSchema), quotesController.getQuoteHandler);
quotesRouter.patch("/:id", validate(updateQuoteSchema), quotesController.updateQuoteHandler);
quotesRouter.get("/:id/events", validate(quoteIdParamSchema), quotesController.listQuoteEventsHandler);
quotesRouter.get("/:id/pdf", validate(quoteIdParamSchema), quotesController.getQuotePdfHandler);

quotesRouter.post("/:id/submit", validate(quoteIdParamSchema), quotesController.submitQuoteForValidationHandler);
quotesRouter.post("/:id/validate", validate(quoteIdParamSchema), quotesController.validateQuoteHandler);
quotesRouter.post("/:id/send", validate(sendQuoteSchema), quotesController.sendQuoteHandler);
quotesRouter.post("/:id/follow-up", validate(recordFollowUpSchema), quotesController.recordQuoteFollowUpHandler);
quotesRouter.post("/:id/accept", validate(acceptQuoteSchema), quotesController.markQuoteAcceptedHandler);
quotesRouter.post("/:id/reject", validate(rejectQuoteSchema), quotesController.markQuoteRejectedHandler);
quotesRouter.post("/:id/expire", validate(quoteIdParamSchema), quotesController.markQuoteExpiredHandler);
quotesRouter.post("/:id/versions", validate(quoteIdParamSchema), quotesController.createQuoteVersionHandler);
