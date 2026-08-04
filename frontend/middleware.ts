/**
 * Next.js middleware for Supabase session refresh and route protection.
 *
 * - Refreshes the Supabase auth session on every request (so cookies stay valid).
 * - Redirects logged-in users away from /login (to `next` or `/`).
 * - Redirects unauthenticated users away from protected routes to /login?next=...
 *
 * Public routes: /, /login, /auth/callback, /scans
 * Add protected route prefixes to PROTECTED_PREFIXES as needed.
 */
import { type NextRequest, NextResponse } from "next/server";
import { createSupabaseMiddlewareClient } from "@/lib/supabase-server";

/**
 * Route prefixes that require authentication.
 *
 * /scans is public (detection works without login), but /inventory
 * requires the user to be signed in so they can view their saved assets.
 */
const PROTECTED_PREFIXES: string[] = ["/inventory"];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });
  const supabase = createSupabaseMiddlewareClient(request, response);

  // Refresh the session (updates cookies if needed).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isLoginPage = pathname === "/login";

  // 1. If logged in and visiting /login, redirect to `next` or `/`.
  if (user && isLoginPage) {
    const next = request.nextUrl.searchParams.get("next") || "/";
    const url = request.nextUrl.clone();
    url.pathname = next;
    url.search = "";
    return NextResponse.redirect(url);
  }

  // 2. If not logged in and visiting a protected route, redirect to /login.
  if (!user && isProtected(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public assets
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};