import { Router } from "express";
import { Role } from "@prisma/client";
import { authenticate } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { validate } from "../../middleware/validate.middleware";
import { listEinvoicesQuerySchema } from "./einvoicing.validation";
import * as einvoicingController from "./einvoicing.controller";

export const einvoicingRouter = Router();

// Espace Super PDP (facture électronique) : mêmes rôles que la facturation —
// le Superviseur n'a pas accès aux factures (voir invoices.routes.ts).
einvoicingRouter.use(authenticate(), requireRole(Role.HR, Role.DIRECTOR, Role.ADMIN));

einvoicingRouter.get("/overview", einvoicingController.getOverviewHandler);
einvoicingRouter.get(
  "/invoices",
  validate(listEinvoicesQuerySchema),
  einvoicingController.listEinvoicesHandler
);
einvoicingRouter.post("/sync", einvoicingController.syncHandler);
einvoicingRouter.post("/test-connection", einvoicingController.testConnectionHandler);
