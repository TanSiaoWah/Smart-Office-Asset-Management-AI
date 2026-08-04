"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Room {
  id: string;
  name: string;
  created_at: string;
}

interface InventoryItem {
  id: string;
  owner_id: string;
  name: string;
  room_id: string | null;
  room_name: string | null;
  image_id: string;
  image_url: string;
  confidence: number | null;
  bbox: number[] | null;
  created_at: string;
}

interface RoomSummary {
  roomName: string;
  counts: { name: string; count: number }[];
  total: number;
}

interface ScanRecord {
  id: string;
  image_id: string;
  image_url: string;
  room_id: string | null;
  room_name: string | null;
  asset_count: number;
  assets: string[];
  created_at: string;
}

export default function InventoryPage() {
  const router = useRouter();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Room management state
  const [newRoomName, setNewRoomName] = useState("");
  const [isAddingRoom, setIsAddingRoom] = useState(false);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editingRoomName, setEditingRoomName] = useState("");

  const fetchData = useCallback(async (accessToken: string) => {
    try {
      const [itemsRes, roomsRes, scansRes] = await Promise.all([
        fetch(`${API_BASE_URL}/inventory`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
        fetch(`${API_BASE_URL}/rooms`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
        fetch(`${API_BASE_URL}/scans`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      ]);

      if (itemsRes.ok) {
        setItems(await itemsRes.json());
      }
      if (roomsRes.ok) {
        setRooms(await roomsRes.json());
      }
      if (scansRes.ok) {
        setScans(await scansRes.json());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load inventory");
    }
  }, []);

  useEffect(() => {
    supabaseBrowser.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.replace("/login?next=/inventory");
        return;
      }
      await fetchData(session.access_token);
      setIsLoading(false);
    });
  }, [router, fetchData]);

  const handleAddRoom = async () => {
    const { data: { session } } = await supabaseBrowser.auth.getSession();
    if (!session || !newRoomName.trim()) return;

    setIsAddingRoom(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`${API_BASE_URL}/rooms`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ name: newRoomName.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.detail || `Failed to add room (HTTP ${res.status})`);
      }

      setNewRoomName("");
      setSuccessMsg("Room added successfully!");
      await fetchData(session.access_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add room");
    } finally {
      setIsAddingRoom(false);
    }
  };

  const handleRenameRoom = async (roomId: string) => {
    const { data: { session } } = await supabaseBrowser.auth.getSession();
    if (!session || !editingRoomName.trim()) return;

    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`${API_BASE_URL}/rooms/${roomId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ name: editingRoomName.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.detail || `Failed to rename room (HTTP ${res.status})`);
      }

      setEditingRoomId(null);
      setEditingRoomName("");
      setSuccessMsg("Room renamed successfully!");
      await fetchData(session.access_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename room");
    }
  };

  const handleDeleteRoom = async (roomId: string) => {
    const { data: { session } } = await supabaseBrowser.auth.getSession();
    if (!session) return;

    if (!window.confirm("Delete this room? Inventory items in it will keep their room name but be unassigned.")) {
      return;
    }

    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`${API_BASE_URL}/rooms/${roomId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!res.ok) {
        throw new Error(`Failed to delete room (HTTP ${res.status})`);
      }

      setSuccessMsg("Room deleted.");
      await fetchData(session.access_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete room");
    }
  };

  const handleLogout = async () => {
    await supabaseBrowser.auth.signOut();
    router.replace("/");
  };

  // Aggregate items into per-room summaries.
  const buildRoomSummaries = (): RoomSummary[] => {
    const roomMap = new Map<string, Map<string, number>>();

    for (const item of items) {
      const roomName = item.room_name || "Unassigned";
      if (!roomMap.has(roomName)) {
        roomMap.set(roomName, new Map());
      }
      const counts = roomMap.get(roomName)!;
      counts.set(item.name, (counts.get(item.name) || 0) + 1);
    }

    const summaries: RoomSummary[] = [];
    for (const [roomName, counts] of roomMap.entries()) {
      const entries = Array.from(counts.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
      const total = entries.reduce((sum, e) => sum + e.count, 0);
      summaries.push({ roomName, counts: entries, total });
    }

    // Sort rooms alphabetically, with "Unassigned" last.
    return summaries.sort((a, b) => {
      if (a.roomName === "Unassigned") return 1;
      if (b.roomName === "Unassigned") return -1;
      return a.roomName.localeCompare(b.roomName);
    });
  };

  const roomSummaries = buildRoomSummaries();
  const grandTotal = items.length;

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
          <div className="flex items-center space-x-4">
            <Link href="/scans" className="px-4 py-2 text-purple-600 hover:text-purple-800 transition-colors">
              Scan Assets
            </Link>
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-purple-600 hover:text-purple-800 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-4xl font-bold text-purple-800 mb-8 text-center">
          My Inventory
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

        {/* Room Management */}
        <div className="bg-white/90 rounded-2xl shadow-lg p-8 mb-8">
          <h2 className="text-2xl font-bold text-purple-800 mb-6">Rooms</h2>

          <div className="flex space-x-3 mb-6">
            <input
              type="text"
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              placeholder="New room name (e.g. Room A)"
              className="flex-1 px-4 py-2 border-2 border-purple-300 rounded-lg text-purple-800 focus:border-purple-500 focus:outline-none"
            />
            <button
              onClick={handleAddRoom}
              disabled={isAddingRoom || !newRoomName.trim()}
              className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isAddingRoom ? "Adding…" : "Add Room"}
            </button>
          </div>

          {rooms.length === 0 ? (
            <p className="text-purple-600">
              No rooms yet. Add a room above so you can assign assets to it when scanning.
            </p>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {rooms.map((room) => (
                <div key={room.id} className="bg-purple-50 rounded-lg p-4">
                  {editingRoomId === room.id ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={editingRoomName}
                        onChange={(e) => setEditingRoomName(e.target.value)}
                        className="w-full px-3 py-2 border-2 border-purple-300 rounded-lg text-purple-800 focus:border-purple-500 focus:outline-none"
                        autoFocus
                      />
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleRenameRoom(room.id)}
                          className="px-3 py-1 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 transition-colors"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setEditingRoomId(null);
                            setEditingRoomName("");
                          }}
                          className="px-3 py-1 bg-white text-purple-600 rounded-lg text-sm border-2 border-purple-300 hover:bg-purple-50 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-purple-800">{room.name}</span>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => {
                            setEditingRoomId(room.id);
                            setEditingRoomName(room.name);
                          }}
                          className="text-purple-600 hover:text-purple-800 transition-colors"
                          title="Rename"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDeleteRoom(room.id)}
                          className="text-red-500 hover:text-red-700 transition-colors"
                          title="Delete"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Inventory Summary */}
        <div className="bg-white/90 rounded-2xl shadow-lg p-8">
          <h2 className="text-2xl font-bold text-purple-800 mb-6">Inventory Summary</h2>

          {/* Grand Total */}
          <div className="bg-purple-600 rounded-xl p-6 text-center mb-8">
            <p className="text-purple-200 text-sm font-medium uppercase tracking-wide mb-1">
              Total Assets
            </p>
            <p className="text-5xl font-bold text-white">{grandTotal}</p>
          </div>

          {roomSummaries.length === 0 ? (
            <p className="text-purple-600 text-center">
              No assets saved yet.{" "}
              <Link href="/scans" className="text-purple-700 underline">
                Scan an image
              </Link>{" "}
              to detect and save assets.
            </p>
          ) : (
            <div className="grid md:grid-cols-2 gap-6">
              {roomSummaries.map((summary) => (
                <div key={summary.roomName} className="bg-purple-50 rounded-xl p-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-purple-900">
                      {summary.roomName}
                    </h3>
                    <span className="bg-purple-600 text-white px-3 py-1 rounded-full text-sm font-medium">
                      {summary.total} {summary.total === 1 ? "asset" : "assets"}
                    </span>
                  </div>
                  <p className="text-purple-700">
                    {summary.counts
                      .map((c) => `${c.count} ${c.name}${c.count > 1 ? "s" : ""}`)
                      .join(", ")}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Scan History */}
        <div className="bg-white/90 rounded-2xl shadow-lg p-8 mt-8">
          <h2 className="text-2xl font-bold text-purple-800 mb-6">Scan History</h2>

          {scans.length === 0 ? (
            <p className="text-purple-600 text-center">
              No scans saved yet. Save assets from a scan to see your history here.
            </p>
          ) : (
            <div className="space-y-4">
              {/* scans is newest-first; number chronologically so #1 = oldest */}
              {scans.map((scan, index) => {
                const scanNumber = scans.length - index;
                const roomLabel = scan.room_name || "Unassigned";
                return (
                  <div key={scan.id} className="bg-purple-50 rounded-xl p-5 flex flex-col md:flex-row md:items-center gap-3">
                    <div className="md:w-24 shrink-0">
                      <span className="bg-purple-600 text-white px-3 py-1 rounded-full text-sm font-bold">
                        Scan #{scanNumber}
                      </span>
                    </div>
                    <div className="flex-1">
                      <p className="text-purple-800 font-medium">
                        {scan.assets.join(", ") || "No assets"}
                      </p>
                      <p className="text-sm text-purple-600">
                        {scan.asset_count} {scan.asset_count === 1 ? "asset" : "assets"} •{" "}
                        {roomLabel}
                      </p>
                    </div>
                    <div className="md:w-40 shrink-0 text-left md:text-right">
                      <p className="text-sm text-purple-600">
                        {new Date(scan.created_at).toLocaleDateString()}
                      </p>
                      <p className="text-xs text-purple-400">
                        {new Date(scan.created_at).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
