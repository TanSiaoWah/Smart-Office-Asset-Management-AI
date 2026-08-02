/**
 * OAuth callback route handler.
 *
 * After Google SSO redirects back to this URL, we exchange the `code`
 * for a Supabase session, sync the user's profile with the backend,
 * and redirect to the `next` destination (defaults to the main page).
 */
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") || "/";

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.session) {
      // Sync the user's profile with the backend (creates/updates Profile row).
      try {
        await fetch(`${API_BASE_URL}/auth/google`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_token: data.session.access_token,
          }),
        });
      } catch {
        // Non-fatal: the session is still valid in the browser.
        // The profile will be synced on the next /auth/me call.
      }

      return NextResponse.redirect(`${requestUrl.origin}${next}`);
    }
  }

  // If code exchange failed, redirect back to login with the original `next`.
  return NextResponse.redirect(
    `${requestUrl.origin}/login?next=${encodeURIComponent(next)}`
  );
}