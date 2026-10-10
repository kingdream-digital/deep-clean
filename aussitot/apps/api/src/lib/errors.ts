/**
 * Erreur métier présentable à l'utilisateur : message en français, simple,
 * sans aucun détail technique. Toute autre erreur est journalisée et
 * remplacée par un message générique (voir app.ts, gestionnaire d'erreurs).
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "AppError";
  }

  static badRequest(message: string, details?: Record<string, string[]>) {
    return new AppError(400, "BAD_REQUEST", message, details);
  }

  static validation(details: Record<string, string[]>, message = "Certaines informations sont invalides.") {
    return new AppError(400, "VALIDATION_ERROR", message, details);
  }

  static unauthorized(message = "Votre session a expiré. Merci de vous reconnecter.", code = "UNAUTHORIZED") {
    return new AppError(401, code, message);
  }

  static forbidden(message = "Vous n'avez pas accès à cette fonctionnalité.") {
    return new AppError(403, "FORBIDDEN", message);
  }

  /** 404 aussi quand l'élément existe dans une autre entreprise : on ne révèle jamais son existence. */
  static notFound(message = "Élément introuvable.") {
    return new AppError(404, "NOT_FOUND", message);
  }

  static conflict(message: string, code = "CONFLICT") {
    return new AppError(409, code, message);
  }

  static tooManyRequests(message = "Trop de tentatives. Merci de patienter quelques minutes.") {
    return new AppError(429, "TOO_MANY_REQUESTS", message);
  }

  static unavailable(message = "Service momentanément indisponible. Réessayez dans un instant.", code = "UNAVAILABLE") {
    return new AppError(503, code, message);
  }
}

export function assertFound<T>(value: T | null | undefined, message?: string): T {
  if (value === null || value === undefined) throw AppError.notFound(message);
  return value;
}
