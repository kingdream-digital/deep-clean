import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import * as statsService from "./stats.service";

export const getOverviewHandler = asyncHandler(async (_req: Request, res: Response) => {
  const overview = await statsService.getOverview();
  res.status(200).json(overview);
});

export const getTrendsHandler = asyncHandler(async (_req: Request, res: Response) => {
  const trends = await statsService.getTrends();
  res.status(200).json(trends);
});
