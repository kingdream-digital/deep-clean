import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { validate } from "../../middleware/validate.middleware";
import { COMMERCIAL_ROLES } from "./clients.service";
import { clientIdParamSchema, companyLookupSchema, createClientSchema, listClientsQuerySchema, updateClientSchema } from "./clients.validation";
import * as clientsController from "./clients.controller";

export const clientsRouter = Router();

clientsRouter.use(authenticate(), requireRole(...COMMERCIAL_ROLES));

clientsRouter.post("/", validate(createClientSchema), clientsController.createClientHandler);
clientsRouter.get("/", validate(listClientsQuerySchema), clientsController.listClientsHandler);
// Pré-remplissage d'une fiche client ou prospect depuis l'annuaire officiel
// des entreprises (SIRET/SIREN) — voir companyLookup.service.ts.
clientsRouter.get("/lookup/:number", validate(companyLookupSchema), clientsController.companyLookupHandler);
clientsRouter.get("/:id", validate(clientIdParamSchema), clientsController.getClientHandler);
clientsRouter.patch("/:id", validate(updateClientSchema), clientsController.updateClientHandler);
