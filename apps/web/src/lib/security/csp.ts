/**
 * The toast library inserts its stylesheet at import, without a nonce: it is allowed by
 * its hash, and so is the empty element it appends before filling it. A test recomputes
 * the hash from the installed package (csp.test.ts).
 */
export const SONNER_STYLE_HASHES = [
  "sha256-StEaX+se6YS7pqjzrzMIA0KaX9zF/8zAhvQXZAe5epY=",
  "sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=",
];

/**
 * Content-Security-Policy of the pages: scripts and style elements only from this
 * origin or carrying the nonce of the request (Next.js puts it on its own scripts, the
 * root layout on the theme script), nothing framed, nothing posted elsewhere.
 *
 * Style attributes stay allowed (`style-src-attr`): server-rendered components set
 * sizes and colours with them, and an attribute cannot run code.
 */
export function contentSecurityPolicy(nonce: string, { dev = false } = {}): string {
  const hashes = SONNER_STYLE_HASHES.map((hash) => `'${hash}'`).join(" ");
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'report-sample'${dev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    // 'report-sample': a refused element shows its first characters in the console.
    `style-src-elem 'self' 'nonce-${nonce}' ${hashes} 'report-sample'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws:" : ""}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** Responses that are not pages (API routes) need no script at all. */
export const API_CSP = "default-src 'none'; frame-ancestors 'none'";

/** A fresh, unpredictable nonce for each page request. */
export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/** One year, subdomains included: only sent when the site is served over HTTPS. */
export const HSTS = "max-age=31536000; includeSubDomains";
