import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/rbac.middleware";
import { COMMERCIAL_ROLES } from "./roles";
import { getCommercialDashboardHandler } from "./dashboard.controller";

export const commercialDashboardRouter = Router();

commercialDashboardRouter.use(authenticate(), requireRole(...COMMERCIAL_ROLES));
commercialDashboardRouter.get("/", getCommercialDashboardHandler);
