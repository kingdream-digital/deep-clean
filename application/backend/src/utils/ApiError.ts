// Erreur applicative typée : seul son `message` est renvoyé au client.
// Toute erreur non-ApiError est traitée comme une erreur serveur générique
// (voir error.middleware.ts) afin de ne jamais divulguer de détails internes.
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError(400, "BAD_REQUEST", message, details);
  }

  static unauthorized(message = "Authentification requise.") {
    return new ApiError(401, "UNAUTHORIZED", message);
  }

  static forbidden(message = "Accès refusé.") {
    return new ApiError(403, "FORBIDDEN", message);
  }

  static notFound(message = "Ressource introuvable.") {
    return new ApiError(404, "NOT_FOUND", message);
  }

  static conflict(message: string) {
    return new ApiError(409, "CONFLICT", message);
  }

  static tooManyRequests(message = "Trop de tentatives, réessayez plus tard.") {
    return new ApiError(429, "TOO_MANY_REQUESTS", message);
  }

  static internal(message = "Une erreur interne est survenue.") {
    return new ApiError(500, "INTERNAL_ERROR", message);
  }
}
