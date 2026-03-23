import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Centralized route redirects for the dashboard UI/UX reorganization.
 * Old routes are permanently redirected to their new locations.
 */
const REDIRECTS: Record<string, string> = {
  "/dashboard/volunteers": "/dashboard/people",
  "/dashboard/members": "/dashboard/people?tab=invites",
  "/dashboard/import": "/dashboard/people",
  "/dashboard/ministries": "/dashboard/settings?tab=teams",
  "/dashboard/billing": "/dashboard/settings?tab=billing",
  "/dashboard/services": "/dashboard/services-events",
  "/dashboard/events": "/dashboard/services-events?tab=events",
  "/dashboard/my-availability": "/dashboard/my-schedule?tab=availability",
};

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const redirectTo = REDIRECTS[pathname];
  if (redirectTo) {
    const url = request.nextUrl.clone();
    // Parse the redirect target to handle query params
    const [path, query] = redirectTo.split("?");
    url.pathname = path;
    url.search = query ? `?${query}` : "";
    return NextResponse.redirect(url, 308);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/volunteers",
    "/dashboard/members",
    "/dashboard/import",
    "/dashboard/ministries",
    "/dashboard/billing",
    "/dashboard/services",
    "/dashboard/events",
    "/dashboard/my-availability",
  ],
};
