/**
 * Cookies of the web session. Tokens never reach browser scripts: they live in httpOnly
 * cookies scoped to /api, the only path that forwards them to the Forja API.
 */
export const COOKIES = {
  /** Access token (JWT, 15 min). Expires a little before the token itself. */
  access: "forja_at",
  /** Refresh token (opaque, single use, rotated on every refresh). */
  refresh: "forja_rt",
  /** "1" when the refresh cookie must persist ("Rester connecté"). */
  remember: "forja_remember",
  /** Session marker for page routing; carries no secret. */
  session: "forja_session",
  /** Set while the initial password has not been replaced. */
  passwordChange: "forja_pwc",
  /** Double-submit CSRF token, readable by scripts on purpose. */
  csrf: "forja_csrf",
  /** Last project opened, to land there after signing in (readable, no secret). */
  project: "forja_project",
  /** Last view chosen by a user holding both, "engineer" or "analyst" (readable). */
  view: "forja_view",
} as const;

export const TOKEN_COOKIE_PATH = "/api";

/** Refresh tokens last 14 days on the API side (FORJA_AUTH_REFRESH_TOKEN_DAYS). */
export const REFRESH_MAX_AGE = 14 * 24 * 3600;

/** The access cookie expires this many seconds before the token, so it is refreshed first. */
export const ACCESS_EXPIRY_MARGIN = 30;

export function secureCookies(): boolean {
  const flag = process.env.FORJA_WEB_SECURE_COOKIES;
  if (flag === "true") return true;
  if (flag === "false") return false;
  return process.env.NODE_ENV === "production";
}
