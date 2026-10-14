import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import * as einvoicingService from "./einvoicing.service";
import { bumpChangeVersion } from "../../utils/changeVersion";
import type { EinvoiceView } from "./einvoicing.service";

function actorOf(req: Request) {
  return { userId: req.auth!.userId, role: req.auth!.role };
}

export const getOverviewHandler = asyncHandler(async (_req: Request, res: Response) => {
  const overview = await einvoicingService.getEinvoicingOverview();
  res.status(200).json({ overview });
});

export const listEinvoicesHandler = asyncHandler(async (req: Request, res: Response) => {
  const { view, page, pageSize } = req.query as unknown as {
    view: EinvoiceView;
    page: number;
    pageSize: number;
  };
  res.status(200).json(await einvoicingService.listEinvoices(view, page, pageSize));
});

export const syncHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await einvoicingService.syncEinvoiceStatuses(actorOf(req));
  res.status(200).json({ result });
});

export const testConnectionHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await einvoicingService.testEinvoicingConnection(actorOf(req));
  res.status(200).json({ result });
});

export const connectHandler = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json(await einvoicingService.startSuperPdpConnection(actorOf(req)));
});

export const disconnectHandler = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json(await einvoicingService.disconnectSuperPdp(actorOf(req)));
});

const VERIFICATION_TEXT: Record<string, string> = {
  verified: "Votre entreprise est vérifiée : les factures électroniques peuvent partir dès maintenant.",
  needs_review: "Super PDP termine la vérification de votre entreprise. Les envois seront possibles dès qu'elle sera validée.",
  failed: "Super PDP n'a pas pu vérifier votre entreprise. Contactez le support Super PDP depuis votre compte.",
};

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Page affichée dans le navigateur au retour de Super PDP (aucun script, styles en ligne). */
function callbackPage(ok: boolean, title: string, message: string, detail?: string): string {
  const tone = ok ? "#1E9CC6" : "#B42318";
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · Deep Clean</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#1F2D69,#243F86 55%,#1E86B8);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;padding:20px;box-sizing:border-box">
<main style="background:#fff;border-radius:24px;max-width:440px;width:100%;padding:36px 28px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.25)">
<div style="width:64px;height:64px;border-radius:50%;margin:0 auto 18px;background:${tone};color:#fff;font-size:34px;line-height:64px;font-weight:700">${ok ? "&#10003;" : "!"}</div>
<div style="font-size:12px;font-weight:700;letter-spacing:1.5px;color:#1E9CC6">DEEP CLEAN · SUPER PDP</div>
<h1 style="font-size:24px;color:#1F2D69;margin:10px 0 10px">${escapeHtml(title)}</h1>
<p style="font-size:16px;line-height:1.5;color:#56607A;margin:0 0 12px">${escapeHtml(message)}</p>
${detail ? `<p style="font-size:14px;line-height:1.5;color:#1F2D69;background:#E8F4FA;border-radius:12px;padding:12px;margin:0 0 12px">${escapeHtml(detail)}</p>` : ""}
<p style="font-size:14px;color:#8B93A7;margin:18px 0 0">Vous pouvez fermer cette page et revenir dans l'application Deep Clean.</p>
</main></body></html>`;
}

/**
 * Retour de Super PDP après « Connecter Super PDP » : ouvert dans le
 * navigateur, donc sans session de l'application — l'identité de la
 * personne qui a lancé la connexion est retrouvée par le `state` à usage
 * unique (voir superpdpOAuth.ts).
 */
export const callbackHandler = async (req: Request, res: Response) => {
  res.set("Cache-Control", "no-store");
  const { state, code, error } = req.query as Record<string, string | undefined>;
  if (error || typeof state !== "string" || typeof code !== "string") {
    const cancelled = error === "access_denied";
    return res
      .status(400)
      .type("html")
      .send(
        callbackPage(
          false,
          cancelled ? "Connexion annulée" : "Connexion impossible",
          cancelled ? "Vous n'avez pas autorisé l'application. Rien n'a été modifié." : "La réponse de Super PDP est incomplète.",
          "Relancez « Connecter Super PDP » depuis l'espace Super PDP de l'application."
        )
      );
  }
  try {
    const done = await einvoicingService.completeSuperPdpConnection(state, code);
    // Les applications ouvertes (téléphone, ordinateur) affichent aussitôt « relié ».
    bumpChangeVersion();
    const who = done.companyName
      ? `Le compte Super PDP de ${done.companyName} est relié à l'application.`
      : "Votre compte Super PDP est relié à l'application.";
    res.status(200).type("html").send(callbackPage(true, "Super PDP est connecté", who, VERIFICATION_TEXT[done.verificationStatus ?? ""] ?? undefined));
  } catch (err) {
    const message = err instanceof Error && "statusCode" in err ? err.message : "Une erreur est survenue. Réessayez dans quelques minutes.";
    res.status(400).type("html").send(callbackPage(false, "Connexion impossible", message));
  }
};
