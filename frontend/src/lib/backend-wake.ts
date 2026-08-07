/**
 * Backend wake-up utility for Render-hosted services.
 *
 * Render's free tier puts a service to "sleep" after ~15 minutes of
 * inactivity, and the first request after sleeping incurs a cold-start
 * delay (several seconds).  This module lets the browser fire a
 * non-blocking "ping" to the backend's health-check endpoint the moment a
 * visitor lands on the main page — so the service starts waking up in the
 * background while the page renders instantly.
 *
 * Design goals
 * ------------
 * - **Never blocks rendering**: the `fetch` is intentionally not awaited.
 * - **Never throws**: all errors are caught and swallowed so a sleeping
 *   or down backend can never break the UI.
 * - **SSR-safe**: only runs in the browser (`typeof window` guard).
 * - **Dev-safe**: skips the ping entirely when the API URL is localhost.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/** Return `true` when the URL points to a local development server. */
function isLocalhost(url: string): boolean {
  return /^(https?:)?\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(url);
}

/**
 * Fire-and-forget ping to the backend health-check endpoint (`GET /`).
 *
 * Returns immediately — the caller does **not** await the network request.
 * Errors are silently swallowed so they can never propagate to the UI.
 *
 * Only sends the ping in production (non-localhost) environments.
 *
 * @returns `void` — the ping runs in the background.
 */
export function wakeBackend(): void {
  // Bail out during SSR (no `fetch` or `window`).
  if (typeof window === "undefined") return;

  // No benefit to pinging a local dev server that doesn't sleep.
  if (isLocalhost(API_BASE_URL)) return;

  // Fire-and-forget: do NOT await.  Errors are caught and discarded.
  void fetch(`${API_BASE_URL}/`, {
    method: "GET",
    cache: "no-store",
    // A short keep-alive hint helps when the tab is backgrounded, but the
    // request is still non-blocking for the main page render.
    keepalive: true,
  }).catch(() => {
    // Silently swallow — a sleeping/down backend should never break the UI.
  });
}
