import "server-only";

import type { NextRequest } from "next/server";
import { landingPath, type Me, type Project } from "@/lib/session/views";
import { COOKIES } from "./cookies";
import { forwardedHeaders, readJson, upstream } from "./upstream";

/** Where a freshly signed-in user should go, asked to the API with the new token. */
export async function landingWithToken(request: NextRequest, accessToken: string): Promise<string> {
  const headers = forwardedHeaders(request);
  const [meResponse, projectsResponse] = await Promise.all([
    upstream("/auth/me", { headers, accessToken }),
    upstream("/projects", { headers, accessToken }),
  ]);
  if (!meResponse.ok) return "/";
  const me = (await readJson(meResponse)) as Me;
  const projects = projectsResponse.ok ? ((await readJson(projectsResponse)) as Project[]) : [];
  return landingPath(
    me,
    projects,
    request.cookies.get(COOKIES.project)?.value,
    request.cookies.get(COOKIES.view)?.value,
  );
}
