import { Router } from "express";
import { Role } from "@prisma/client";
import { authenticate } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { validate } from "../../middleware/validate.middleware";
import {
  cancelInvoiceSchema,
  createInvoiceSchema,
  invoiceIdParamSchema,
  listInvoicesQuerySchema,
  sendInvoiceSchema,
  updateInvoiceSchema,
} from "./invoices.validation";
import * as invoicesController from "./invoices.controller";

export const invoicesRouter = Router();

// Facturation réservée à RH/Direction/Admin — le Superviseur ne figure pas
// dans la liste de permissions "facturation" du cahier des charges (§1-3),
// contrairement aux prospects/clients/devis. Aucune portée supplémentaire à
// appliquer côté service : ces rôles voient et gèrent toutes les factures.
const INVOICE_ROLES = [Role.HR, Role.DIRECTOR, Role.ADMIN];

invoicesRouter.use(authenticate(), requireRole(...INVOICE_ROLES));

invoicesRouter.post("/", validate(createInvoiceSchema), invoicesController.createInvoiceHandler);
invoicesRouter.get("/", validate(listInvoicesQuerySchema), invoicesController.listInvoicesHandler);
invoicesRouter.get("/:id", validate(invoiceIdParamSchema), invoicesController.getInvoiceHandler);
invoicesRouter.patch("/:id", validate(updateInvoiceSchema), invoicesController.updateInvoiceHandler);
invoicesRouter.get("/:id/pdf", validate(invoiceIdParamSchema), invoicesController.getInvoicePdfHandler);

invoicesRouter.post("/:id/validate", validate(invoiceIdParamSchema), invoicesController.validateInvoiceHandler);
invoicesRouter.post("/:id/send", validate(sendInvoiceSchema), invoicesController.sendInvoiceHandler);
invoicesRouter.post("/:id/pay", validate(invoiceIdParamSchema), invoicesController.markInvoicePaidHandler);
invoicesRouter.post("/:id/cancel", validate(cancelInvoiceSchema), invoicesController.cancelInvoiceHandler);
