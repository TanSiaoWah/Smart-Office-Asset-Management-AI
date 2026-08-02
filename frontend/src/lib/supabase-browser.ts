/**
 * Supabase client for browser-side authentication (Google SSO).
 *
 * Uses NEXT_PUBLIC env vars so they are safe to expose to the browser.
 */
import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabaseBrowser = createBrowserClient(
  supabaseUrl,
  supabaseAnonKey
);