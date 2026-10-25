/** /design-system is an internal page: always on in development, opt-in in production. */
export function designSystemEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.FORJA_WEB_DESIGN_SYSTEM === "true";
}
