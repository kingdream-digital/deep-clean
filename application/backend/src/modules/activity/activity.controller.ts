import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import * as activityService from "./activity.service";

export const listActivityLogsHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await activityService.listActivityLogs(req.query as never);
  res.status(200).json(result);
});

export const listActionsHandler = asyncHandler(async (_req: Request, res: Response) => {
  const actions = await activityService.listDistinctActions();
  res.status(200).json({ actions });
});
