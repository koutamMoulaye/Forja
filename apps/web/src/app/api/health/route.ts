import { NextResponse } from "next/server";
import { errorResponse, readJson, upstream } from "@/lib/auth/upstream";

/** Public service status: version and auth mode, for the sign-in screen. */
export async function GET() {
  try {
    const response = await upstream("/health");
    const body = await readJson(response);
    return NextResponse.json(body, {
      status: response.status,
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return errorResponse(502, "api_unreachable", "L’API Forja ne répond pas.");
  }
}
