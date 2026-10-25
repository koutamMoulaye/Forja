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
