/** Error body of the Forja API: {"error": {code, message, details}}. */
export type ApiErrorBody = {
  error: { code: string; message: string; details?: Record<string, unknown> };
};

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== "object" || value === null || !("error" in value)) return false;
  const error = (value as { error: unknown }).error;
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { code?: unknown }).code === "string" &&
    typeof (error as { message?: unknown }).message === "string"
  );
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown>;
  /** Seconds to wait, from Retry-After (429). */
  readonly retryAfter: number | null;

  constructor(
    status: number,
    code: string,
    message: string,
    details: Record<string, unknown> = {},
    retryAfter: number | null = null,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryAfter = retryAfter;
  }

  static from(status: number, body: unknown, retryAfterHeader: string | null): ApiError {
    const retryAfter = parseRetryAfter(retryAfterHeader);
    if (isApiErrorBody(body)) {
      return new ApiError(
        status,
        body.error.code,
        body.error.message,
        body.error.details ?? {},
        retryAfter,
      );
    }
    return new ApiError(
      status,
      status === 422 ? "validation_error" : "http_error",
      `HTTP ${status}`,
      {},
      retryAfter,
    );
  }
}

/** Retry-After as seconds; accepts a delay or an HTTP date. */
export function parseRetryAfter(value: string | null, now: number = Date.now()): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds));
  const date = Date.parse(value);
  if (Number.isNaN(date)) return null;
  return Math.max(0, Math.ceil((date - now) / 1000));
}

/** Codes the web layer adds on top of the API's. */
export const WEB_ERROR_CODES = {
  sessionExpired: "session_expired",
  csrf: "csrf_failed",
  apiUnreachable: "api_unreachable",
} as const;

/** A message already written in French (accents or common French words). */
function isFrench(text: string): boolean {
  return /[éèêàâùûôîçœ]|\b(le|la|les|des|une|est|pas|aucun|aucune|pour|dans)\b/i.test(text);
}

// What the user reads for an API error whose message is in English: by code, then a few
// frequent messages. The technical message stays in the run logs and the API.
const FRENCH_BY_CODE: Record<string, string> = {
  not_found: "Élément introuvable : il a peut-être été supprimé.",
  project_not_found: "Projet introuvable, ou vous n’en êtes pas membre.",
  source_not_found: "Source introuvable : elle a peut-être été supprimée.",
  plan_not_found: "Plan introuvable : il n’a pas encore été créé.",
  run_not_found: "Run introuvable.",
  table_not_found: "Table introuvable : elle n’a pas encore été construite.",
  conflict: "Action impossible pour l’instant : l’état a changé, rechargez la page.",
  invalid_plan_state: "Cette action n’est pas possible à cette étape.",
  plan_version_conflict:
    "Le plan a été modifié entre-temps : rechargez-le pour partir de sa dernière version.",
  invalid_plan: "Le plan n’est pas valide : corrigez les points signalés.",
  forbidden: "Action réservée à un autre rôle du projet.",
  unauthorized: "Session expirée : reconnectez-vous.",
  password_change_required: "Changez d’abord votre mot de passe initial.",
  build_failed: "La construction a échoué : le détail est dans les journaux du run.",
  warehouse_busy: "L’entrepôt est occupé par un autre run : réessayez dans un instant.",
  ingestion_error: "Le fichier n’a pas pu être chargé.",
  unsupported_format: "Format de fichier non pris en charge.",
  empty_file: "Le fichier est vide.",
  corrupted_file: "Le fichier est illisible ou corrompu.",
  unknown_encoding: "L’encodage du fichier n’a pas été reconnu.",
  duplicate_columns: "Le fichier a des colonnes en double.",
  file_too_large: "Le fichier dépasse la taille autorisée.",
  profiling_error: "L’analyse du fichier a échoué.",
  validation_error: "La requête n’est pas valide.",
  rate_limited: "Trop de tentatives : patientez un instant.",
  http_error: "Le serveur n’a pas pu répondre : réessayez dans un instant.",
  [WEB_ERROR_CODES.sessionExpired]: "Session expirée : reconnectez-vous.",
  [WEB_ERROR_CODES.apiUnreachable]: "Le serveur Forja ne répond pas : réessayez dans un instant.",
};
const FRENCH_BY_PATTERN: [RegExp, string][] = [
  [
    /no approved Gold plan/i,
    "Aucun modèle en étoile approuvé : proposez un modèle, approuvez-le, puis relancez.",
  ],
  [
    /no longer matches the Silver tables/i,
    "Le modèle en étoile ne correspond plus aux tables nettoyées : proposez-en une nouvelle version.",
  ],
  [/run build_silver first|no Silver table/i, "Lancez d’abord le nettoyage des sources."],
  [/still working on the previous version/i, "L’agent travaille encore sur la version précédente."],
  [/validate a request once its preview is ready/i, "Validez une fois l’aperçu prêt."],
  [/preview has failed controls/i, "L’aperçu a des contrôles en échec : affinez la demande."],
  [/\bcancell?ed\b/i, "Le run a été annulé."],
  [/timed? ?out|timeout/i, "Le délai d’attente est dépassé : réessayez."],
];

/** The French message of an error, whatever language the API wrote it in. */
export function frenchMessage(code: string, message: string): string {
  if (isFrench(message)) return message;
  const known = FRENCH_BY_PATTERN.find(([pattern]) => pattern.test(message));
  if (known) return known[1];
  return FRENCH_BY_CODE[code] ?? "Une erreur est survenue : réessayez, ou consultez les journaux.";
}

/** An error as the user reads it. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return frenchMessage(error.code, error.message);
  return "Réessayez dans un instant.";
}

/** The notice of a run that stopped on purpose (no approved star schema yet). */
export function runNotice(run: { result?: unknown }): string | null {
  const result = run.result as { message?: unknown } | null | undefined;
  return typeof result?.message === "string" ? result.message : null;
}
