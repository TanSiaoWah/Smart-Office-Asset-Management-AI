"use client";

import { useEffect, useState } from "react";

/** Props for {@link BackendWakingNotice}. */
interface BackendWakingNoticeProps {
  /**
   * Layout style.
   * - `fullscreen` — centers a card on the whole page (for page-level loads).
   * - `inline` — compact card for embedding inside an existing page.
   */
  variant?: "fullscreen" | "inline";
}

/**
 * Loading notice shown while the Render free-tier backend wakes up from sleep.
 *
 * Render's free plan puts a service to sleep after ~15 minutes of inactivity.
 * The first request after sleeping incurs a cold-start delay of up to ~1 minute
 * while the instance boots. This component explains that to the user, shows a
 * live elapsed-seconds timer, and adds extra reassurance when the wait exceeds
 * a normal cold start — so the wait feels intentional instead of like a frozen
 * page.
 */
export default function BackendWakingNotice({
  variant = "fullscreen",
}: BackendWakingNoticeProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const isSlow = elapsed >= 45;

  const message = (
    <>
      <p className="font-semibold text-purple-800">Waking up the server…</p>
      <p className="text-sm text-purple-600 mt-2">
        This app runs on the{" "}
        <span className="font-semibold">Render free plan</span>, which puts the
        backend to sleep after ~15 minutes of inactivity. The first request
        takes about{" "}
        <span className="font-semibold">1 minute</span> to wake it up — the page
        will load automatically.
      </p>
      {isSlow && (
        <p className="text-sm text-purple-500 mt-2 italic">
          Still waking up — free instances sometimes take a little longer.
          Thanks for your patience!
        </p>
      )}
      <p className="text-xs text-purple-400 mt-3">Elapsed: {elapsed}s</p>
    </>
  );

  if (variant === "inline") {
    return (
      <div className="mt-4 flex items-start gap-3 bg-purple-50 border border-purple-200 rounded-lg p-4">
        <div className="w-5 h-5 mt-0.5 shrink-0 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        <div className="text-left">{message}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-purple-100 to-purple-200 flex items-center justify-center">
      <div className="bg-white/90 rounded-2xl p-8 shadow-lg max-w-md text-center">
        <div className="w-10 h-10 mx-auto mb-4 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
        {message}
      </div>
    </div>
  );
}
