import type { NextConfig } from "next";
import { API_CSP } from "./src/lib/security/csp";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  // The Docker image runs the standalone server (docker/web.Dockerfile).
  output: process.env.FORJA_WEB_STANDALONE === "true" ? "standalone" : undefined,
  // Pages render on each request: their Content-Security-Policy carries a fresh nonce
  // (src/proxy.ts), which prerendered shells could not (docs/decisions.md).
  agentRules: false,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Pages get theirs, with a nonce, from the proxy.
      { source: "/api/:path*", headers: [{ key: "Content-Security-Policy", value: API_CSP }] },
    ];
  },
};

export default nextConfig;
