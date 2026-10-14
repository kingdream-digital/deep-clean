import { Router } from "express";
import { Role } from "@prisma/client";
import { authenticate } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { validate } from "../../middleware/validate.middleware";
import { listEinvoicesQuerySchema } from "./einvoicing.validation";
import * as einvoicingController from "./einvoicing.controller";

export const einvoicingRouter = Router();

// Retour de Super PDP après « Connecter Super PDP » : page ouverte dans le
// navigateur, sans session — sécurisée par le `state` à usage unique et
// PKCE (voir superpdpOAuth.ts). Déclarée AVANT l'authentification ci-dessous.
einvoicingRouter.get("/superpdp/callback", einvoicingController.callbackHandler);

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
// Mode éditeur : relier / délier le compte Super PDP de l'entreprise.
einvoicingRouter.post("/superpdp/connect", einvoicingController.connectHandler);
einvoicingRouter.delete("/superpdp/connection", einvoicingController.disconnectHandler);
