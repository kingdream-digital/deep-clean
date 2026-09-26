import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import * as sitesService from "./sites.service";

function actorOf(req: Request) {
  return { userId: req.auth!.userId, role: req.auth!.role };
}

export const createSiteHandler = asyncHandler(async (req: Request, res: Response) => {
  const site = await sitesService.createSite(req.auth!.userId, req.body);
  res.status(201).json({ site });
});

export const listSitesHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await sitesService.listSites(actorOf(req), req.query as never);
  res.status(200).json(result);
});

export const getSiteHandler = asyncHandler(async (req: Request, res: Response) => {
  const site = await sitesService.getSiteById(actorOf(req), req.params.id as string);
  res.status(200).json({ site });
});

export const updateSiteHandler = asyncHandler(async (req: Request, res: Response) => {
  const site = await sitesService.updateSite(actorOf(req), req.params.id as string, req.body);
  res.status(200).json({ site });
});

export const addSiteMemberHandler = asyncHandler(async (req: Request, res: Response) => {
  await sitesService.addSiteMember(actorOf(req), req.params.id as string, req.body.userId);
  res.status(204).send();
});

export const removeSiteMemberHandler = asyncHandler(async (req: Request, res: Response) => {
  await sitesService.removeSiteMember(actorOf(req), req.params.id as string, req.params.userId as string);
  res.status(204).send();
});
