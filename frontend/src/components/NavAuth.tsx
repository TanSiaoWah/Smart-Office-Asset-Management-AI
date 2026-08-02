"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * Navigation auth buttons for the landing page.
 *
 * - Shows "Login" + "Get Started" when logged out.
 * - Shows user profile button (avatar + name) + "Logout" when logged in.
 *
 * The display name is fetched from the backend (PostgreSQL Profile table)
 * so it stays in sync when the user changes their name on the /profile page.
 */
export default function NavAuth() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);

  useEffect(() => {
    /**
     * Fetch the profile name from the backend so the nav bar shows
     * the PostgreSQL-stored name (which may differ from Supabase's
     * user_metadata if the user changed it on /profile).
     */
    const fetchProfileName = async (accessToken: string) => {
      try {
        const res = await fetch(`${API_BASE_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (res.ok) {
          const profile = await res.json();
          if (profile.name) setUserName(profile.name);
        }
      } catch {
        // Non-fatal: fall back to Supabase user_metadata name.
      }
    };

    supabaseBrowser.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setIsLoggedIn(true);
        const user = session.user;
        setUserName(
          user.user_metadata?.full_name || user.email?.split("@")[0] || "User"
        );
        setAvatarUrl(user.user_metadata?.avatar_url || null);
        // Fetch the latest name from the backend (PostgreSQL).
        fetchProfileName(session.access_token);
      }
    });

    const { data: authListener } = supabaseBrowser.auth.onAuthStateChange(
      (_event, session) => {
        if (session) {
          setIsLoggedIn(true);
          const user = session.user;
          setUserName(
            user.user_metadata?.full_name ||
              user.email?.split("@")[0] ||
              "User"
          );
          setAvatarUrl(user.user_metadata?.avatar_url || null);
          // Fetch the latest name from the backend (PostgreSQL).
          fetchProfileName(session.access_token);
        } else {
          setIsLoggedIn(false);
          setUserName(null);
          setAvatarUrl(null);
        }
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    await supabaseBrowser.auth.signOut();
    setIsLoggedIn(false);
    setUserName(null);
    setAvatarUrl(null);
  };

  if (isLoggedIn) {
    return (
      <div className="flex items-center space-x-4">
        <Link
          href="/profile"
          className="flex items-center space-x-2 hover:opacity-80 transition-opacity"
          title="View Profile"
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={userName || "User"}
              className="w-8 h-8 rounded-full"
            />
          ) : (
            <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center text-white text-sm font-semibold">
              {(userName || "U").charAt(0).toUpperCase()}
            </div>
          )}
          <span className="text-purple-700 font-medium hidden sm:inline">
            {userName}
          </span>
        </Link>
        <button
          onClick={handleLogout}
          className="px-4 py-2 text-purple-600 hover:text-purple-800 transition-colors"
        >
          Logout
        </button>
      </div>
    );
  }

  return (
    <div className="flex space-x-4">
      <Link href="/login">
        <button className="px-4 py-2 text-purple-600 hover:text-purple-800 transition-colors">
          Login
        </button>
      </Link>
      <Link href="/login">
        <button className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">
          Get Started
        </button>
      </Link>
    </div>
  );
}