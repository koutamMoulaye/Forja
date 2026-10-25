import { COOKIES } from "./cookies";

export const CSRF_HEADER = "X-CSRF-Token";

/** The double-submit token, read from its cookie in the browser. */
export function readCsrfToken(
  cookieString: string = globalThis.document?.cookie ?? "",
): string | null {
  for (const part of cookieString.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIES.csrf) return decodeURIComponent(rest.join("="));
  }
  return null;
}
