import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { getCommercialDashboard } from "./dashboard.service";

export const getCommercialDashboardHandler = asyncHandler(async (req: Request, res: Response) => {
  const dashboard = await getCommercialDashboard({ userId: req.auth!.userId, role: req.auth!.role });
  res.status(200).json({ dashboard });
});
