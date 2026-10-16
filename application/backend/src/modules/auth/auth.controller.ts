import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import * as authService from "./auth.service";
import { requestOwnAccountDeletion } from "../users/users.service";

function requestContext(req: Request) {
  return { ipAddress: req.ip, userAgent: req.headers["user-agent"] };
}

export const loginHandler = asyncHandler(async (req: Request, res: Response) => {
  const { username, password, rememberMe } = req.body;
  const result = await authService.login(username, password, rememberMe, requestContext(req));
  res.status(200).json(result);
});

export const refreshHandler = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  const result = await authService.refresh(refreshToken, requestContext(req));
  res.status(200).json(result);
});

export const logoutHandler = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  await authService.logout(refreshToken);
  res.status(204).send();
});

export const changePasswordHandler = asyncHandler(async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  await authService.changeOwnPassword(req.auth!.userId, currentPassword, newPassword, req.auth!.sessionId);
  res.status(200).json({ message: "Mot de passe mis à jour." });
});

export const meHandler = asyncHandler(async (req: Request, res: Response) => {
  const user = await authService.getCurrentUser(req.auth!.userId);
  res.status(200).json({ user });
});

export const accountDeletionHandler = asyncHandler(async (req: Request, res: Response) => {
  await requestOwnAccountDeletion(req.auth!.userId, req.body.password as string);
  res.status(200).json({
    message: "Votre compte est désactivé. La RH effacera vos données dans un délai d'un mois, sauf celles que la loi impose de conserver.",
  });
});
