"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface ProfileData {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  role: string;
  created_at: string;
  updated_at: string;
}

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [editName, setEditName] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchProfile = useCallback(async (accessToken: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        // If profile doesn't exist yet, try syncing it first
        if (res.status === 404) {
          const syncRes = await fetch(`${API_BASE_URL}/auth/google`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ access_token: accessToken }),
          });
          if (syncRes.ok) {
            const syncData = await syncRes.json();
            setProfile(syncData.profile);
            setEditName(syncData.profile.name);
            return;
          }
        }
        throw new Error(`Failed to fetch profile (HTTP ${res.status})`);
      }
      const data = await res.json();
      setProfile(data);
      setEditName(data.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profile");
    }
  }, []);

  useEffect(() => {
    supabaseBrowser.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.replace("/login?next=/profile");
        return;
      }
      await fetchProfile(session.access_token);
      setIsLoading(false);
    });
  }, [router, fetchProfile]);

  const handleSaveName = async () => {
    const { data: { session } } = await supabaseBrowser.auth.getSession();
    if (!session || !editName.trim()) return;

    setIsSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`${API_BASE_URL}/auth/me`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ name: editName.trim() }),
      });

      if (!res.ok) {
        throw new Error(`Failed to update name (HTTP ${res.status})`);
      }

      const updated = await res.json();
      setProfile(updated);
      setIsEditing(false);
      setSuccessMsg("Profile name updated successfully!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update name");
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    await supabaseBrowser.auth.signOut();
    router.replace("/");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-purple-100 to-purple-200 flex items-center justify-center">
        <p className="text-purple-700 text-lg">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-purple-100 to-purple-200">
      {/* Navigation */}
      <nav className="bg-white/80 backdrop-blur-sm shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M3 12h18M3 17h18" />
              </svg>
            </div>
            <span className="text-2xl font-bold text-purple-800">Smart Office Asset Management AI</span>
          </Link>
          <button
            onClick={handleLogout}
            className="px-4 py-2 text-purple-600 hover:text-purple-800 transition-colors"
          >
            Logout
          </button>
        </div>
      </nav>

      {/* Profile Content */}
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-4xl font-bold text-purple-800 mb-8 text-center">
          Your Profile
        </h1>

        {error && (
          <div className="mb-6 p-4 bg-red-100 text-red-700 rounded-lg">
            {error}
          </div>
        )}

        {successMsg && (
          <div className="mb-6 p-4 bg-green-100 text-green-700 rounded-lg">
            {successMsg}
          </div>
        )}

        {profile && (
          <div className="bg-white/90 rounded-2xl shadow-lg p-8">
            {/* Avatar + Email */}
            <div className="flex items-center space-x-4 mb-8">
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.name}
                  className="w-20 h-20 rounded-full"
                />
              ) : (
                <div className="w-20 h-20 bg-purple-500 rounded-full flex items-center justify-center text-white text-2xl font-semibold">
                  {profile.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <p className="text-xl font-semibold text-purple-900">{profile.name}</p>
                <p className="text-purple-600">{profile.email}</p>
                <span className="inline-block mt-1 px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium">
                  Role: {profile.role}
                </span>
              </div>
            </div>

            {/* Edit Name Section */}
            <div className="border-t border-purple-100 pt-6">
              <h2 className="text-lg font-semibold text-purple-800 mb-4">Display Name</h2>
              {!isEditing ? (
                <div className="flex items-center justify-between">
                  <span className="text-purple-700 text-lg">{profile.name}</span>
                  <button
                    onClick={() => {
                      setEditName(profile.name);
                      setIsEditing(true);
                      setSuccessMsg(null);
                      setError(null);
                    }}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                  >
                    Change Name
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-4 py-2 border-2 border-purple-300 rounded-lg text-purple-800 focus:border-purple-500 focus:outline-none"
                    placeholder="Enter your name"
                    autoFocus
                  />
                  <div className="flex space-x-3">
                    <button
                      onClick={handleSaveName}
                      disabled={isSaving || !editName.trim()}
                      className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isSaving ? "Saving…" : "Save"}
                    </button>
                    <button
                      onClick={() => {
                        setIsEditing(false);
                        setEditName(profile.name);
                        setError(null);
                      }}
                      className="px-6 py-2 bg-white text-purple-600 rounded-lg border-2 border-purple-300 hover:bg-purple-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Account Info */}
            <div className="border-t border-purple-100 pt-6 mt-6">
              <h2 className="text-lg font-semibold text-purple-800 mb-4">Account Info</h2>
              <div className="space-y-2 text-sm text-purple-600">
                <p>
                  <span className="font-medium">Member since:</span>{" "}
                  {new Date(profile.created_at).toLocaleDateString()}
                </p>
                <p>
                  <span className="font-medium">Last updated:</span>{" "}
                  {new Date(profile.updated_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="text-center mt-6">
          <Link href="/" className="text-purple-600 hover:text-purple-800 transition-colors">
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}