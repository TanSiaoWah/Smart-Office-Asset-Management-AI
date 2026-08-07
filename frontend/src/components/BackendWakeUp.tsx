"use client";

import { useEffect } from "react";
import { wakeBackend } from "@/lib/backend-wake";

/**
 * Client component that triggers a fire-and-forget backend wake-up ping
 * when it mounts.
 *
 * Rendered on the home page so that the first time a visitor lands on the
 * site, the backend (Render free tier) starts waking up in the background.
 * By the time the user navigates to pages that need the API (e.g. `/scans`,
 * `/inventory`), the service should be fully awake and responsive.
 *
 * Renders **nothing** — it is purely a side-effect component.
 */
export default function BackendWakeUp(): null {
  useEffect(() => {
    wakeBackend();
  }, []);

  return null;
}
