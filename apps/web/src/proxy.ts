import { NextResponse, type NextRequest } from "next/server";
import { COOKIES, secureCookies } from "@/lib/auth/cookies";
import { newCsrfToken } from "@/lib/auth/csrf";
import { designSystemEnabled } from "@/lib/design-system-flag";
import { HSTS, contentSecurityPolicy, newNonce } from "@/lib/security/csp";

const LOGIN = "/auth/login";
const CHANGE_PASSWORD = "/auth/change-password";
const INVITE = "/auth/invite/";

/**
 * Page routing before rendering: signed-out visitors go to the login screen, a user who
 * still has the initial password is held on the password screen, and every page gets
 * a CSRF token cookie for its later requests. The API remains the authority: these
 * cookies only steer navigation.
 *
 * Each page also gets its Content-Security-Policy with a fresh nonce: Next.js reads it
 * from the request headers and puts it on its scripts, the root layout on the theme
 * script (x-nonce).
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const nonce = newNonce();
  const csp = contentSecurityPolicy(nonce, { dev: process.env.NODE_ENV === "development" });
  const forwarded = new Headers(request.headers);
  forwarded.set("x-nonce", nonce);
  forwarded.set("content-security-policy", csp);
  const next = () => NextResponse.next({ request: { headers: forwarded } });
  const signedIn = request.cookies.has(COOKIES.session);
  const mustChange = request.cookies.has(COOKIES.passwordChange);

  let response: NextResponse;
  if (pathname === "/design-system" && !designSystemEnabled()) {
    response = new NextResponse(null, { status: 404 });
  } else if (pathname === LOGIN) {
    response = signedIn
      ? NextResponse.redirect(new URL(mustChange ? CHANGE_PASSWORD : "/", request.url))
      : next();
  } else if (pathname === CHANGE_PASSWORD) {
    response = signedIn ? next() : NextResponse.redirect(new URL(LOGIN, request.url));
  } else if (pathname === "/design-system" || pathname.startsWith(INVITE)) {
    // An invitation link opens signed out (a new account) as well as signed in.
    response = next();
  } else if (!signedIn) {
    const login = new URL(LOGIN, request.url);
    if (pathname !== "/") login.searchParams.set("next", pathname + search);
    response = NextResponse.redirect(login);
  } else if (mustChange) {
    response = NextResponse.redirect(new URL(CHANGE_PASSWORD, request.url));
  } else {
    response = next();
  }

  response.headers.set("content-security-policy", csp);
  if (process.env.NODE_ENV === "production" && secureCookies()) {
    response.headers.set("strict-transport-security", HSTS);
  }
  if (!request.cookies.has(COOKIES.csrf)) {
    response.cookies.set(COOKIES.csrf, newCsrfToken(), {
      httpOnly: false,
      sameSite: "lax",
      secure: secureCookies(),
      path: "/",
    });
  }
  return response;
}

export const config = {
  matcher: [
    // Pages only: API routes check their own requests, assets need no session.
    "/((?!api/|_next/|brand/|fonts/|icon|apple-icon|manifest|favicon|robots|.*\\.(?:svg|png|jpg|ico|woff2|txt|webmanifest)$).*)",
  ],
};
