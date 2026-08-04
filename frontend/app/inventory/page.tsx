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

interface TypeCounts {
  chairs: number;
  desks: number;
  monitors: number;
  other: number;
  total: number;
}

/** Return a local date string in YYYY-MM-DD format for the given Date. */
function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Return true if the item's created_at falls on the given YYYY-MM-DD date (local time). */
function isOnDate(item: InventoryItem, dateStr: string): boolean {
  const created = new Date(item.created_at);
  return toDateInputValue(created) === dateStr;
}

/** Classify an asset name into a type bucket. */
type AssetType = "chairs" | "desks" | "monitors" | "other";

function classifyAsset(name: string): AssetType {
  const lower = name.toLowerCase();
  if (lower.includes("chair")) return "chairs";
  if (lower.includes("desk")) return "desks";
  if (lower.includes("monitor")) return "monitors";
  return "other";
}

const TYPE_COLORS: Record<AssetType, string> = {
  chairs: "#a855f7", // purple-500
  desks: "#7e22ce", // purple-800
  monitors: "#d946ef", // fuchsia-500
  other: "#c4b5fd", // purple-300
};

const TYPE_LABELS: Record<AssetType, string> = {
  chairs: "Chairs",
  desks: "Desks",
  monitors: "Monitors",
  other: "Other",
};

export default function InventoryPage() {
  const router = useRouter();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    toDateInputValue(new Date())
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Room management state
  const [newRoomName, setNewRoomName] = useState("");
  const [isAddingRoom, setIsAddingRoom] = useState(false);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editingRoomName, setEditingRoomName] = useState("");

  // Scan date editing state
  const [editingScanId, setEditingScanId] = useState<string | null>(null);
  const [editingScanDate, setEditingScanDate] = useState("");
  const [isUpdatingScanDate, setIsUpdatingScanDate] = useState(false);

  // Scan assets editing state
  const [editingAssetsScanId, setEditingAssetsScanId] = useState<string | null>(null);
  const [editingAssets, setEditingAssets] = useState<{ name: string }[]>([]);
  const [editingAssetsRoomId, setEditingAssetsRoomId] = useState("");
  const [isAddingScanAsset, setIsAddingScanAsset] = useState(false);
  const [newScanAssetName, setNewScanAssetName] = useState("");
  const [isUpdatingScanAssets, setIsUpdatingScanAssets] = useState(false);

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

  const handleUpdateScanDate = async (scanId: string) => {
    const { data: { session } } = await supabaseBrowser.auth.getSession();
    if (!session || !editingScanDate) return;

    setIsUpdatingScanDate(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`${API_BASE_URL}/scans/${scanId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ date: editingScanDate }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.detail || `Failed to update scan date (HTTP ${res.status})`);
      }

      setEditingScanId(null);
      setEditingScanDate("");
      setSuccessMsg("Scan date updated. The summary now reflects the new date.");
      await fetchData(session.access_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update scan date");
    } finally {
      setIsUpdatingScanDate(false);
    }
  };

  const handleStartEditScanAssets = (scan: ScanRecord) => {
    setEditingAssetsScanId(scan.id);
    setEditingAssets(scan.assets.map((name) => ({ name })));
    setEditingAssetsRoomId(scan.room_id || "");
    setIsAddingScanAsset(false);
    setNewScanAssetName("");
  };

  const handleCancelEditScanAssets = () => {
    setEditingAssetsScanId(null);
    setEditingAssets([]);
    setEditingAssetsRoomId("");
    setIsAddingScanAsset(false);
    setNewScanAssetName("");
  };

  const handleUpdateScanAssetName = (index: number, name: string) => {
    setEditingAssets((prev) =>
      prev.map((a, i) => (i === index ? { ...a, name } : a))
    );
  };

  const handleRemoveScanAsset = (index: number) => {
    setEditingAssets((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddScanAsset = () => {
    const name = newScanAssetName.trim();
    if (!name) return;
    setEditingAssets((prev) => [...prev, { name }]);
    setNewScanAssetName("");
    setIsAddingScanAsset(false);
  };

  const handleSaveScanAssets = async (scanId: string) => {
    const { data: { session } } = await supabaseBrowser.auth.getSession();
    if (!session) return;

    setIsUpdatingScanAssets(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`${API_BASE_URL}/scans/${scanId}/assets`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          items: editingAssets.map((a) => ({
            name: a.name.trim(),
            room_id: editingAssetsRoomId || null,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.detail || `Failed to update scan assets (HTTP ${res.status})`);
      }

      handleCancelEditScanAssets();
      setSuccessMsg("Scan assets updated successfully!");
      await fetchData(session.access_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update scan assets");
    } finally {
      setIsUpdatingScanAssets(false);
    }
  };

  // Items saved on the selected date.
  const filteredItems = items.filter((item) => isOnDate(item, selectedDate));

  // Aggregate filtered items into per-room summaries.
  const buildRoomSummaries = (): RoomSummary[] => {
    const roomMap = new Map<string, Map<string, number>>();

    for (const item of filteredItems) {
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

  // Count filtered items by asset type.
  const buildTypeCounts = (): TypeCounts => {
    const counts: TypeCounts = { chairs: 0, desks: 0, monitors: 0, other: 0, total: 0 };
    for (const item of filteredItems) {
      counts[classifyAsset(item.name)] += 1;
      counts.total += 1;
    }
    return counts;
  };

  const roomSummaries = buildRoomSummaries();
  const typeCounts = buildTypeCounts();

  // Build the conic-gradient pie chart from type counts.
  const buildPieGradient = (): string => {
    const { chairs, desks, monitors, other, total } = typeCounts;
    if (total === 0) {
      return "conic-gradient(#e9d5ff 0deg 360deg)";
    }
    let cursor = 0;
    const stops: string[] = [];
    const slices: { count: number; color: string }[] = [
      { count: chairs, color: TYPE_COLORS.chairs },
      { count: desks, color: TYPE_COLORS.desks },
      { count: monitors, color: TYPE_COLORS.monitors },
      { count: other, color: TYPE_COLORS.other },
    ];
    for (const slice of slices) {
      if (slice.count === 0) continue;
      const from = Math.round((cursor / total) * 360);
      cursor += slice.count;
      const to = Math.round((cursor / total) * 360);
      stops.push(`${slice.color} ${from}deg ${to}deg`);
    }
    return `conic-gradient(${stops.join(", ")})`;
  };

  const legendEntries: { label: string; color: string; count: number }[] = [
    { label: TYPE_LABELS.chairs, color: TYPE_COLORS.chairs, count: typeCounts.chairs },
    { label: TYPE_LABELS.desks, color: TYPE_COLORS.desks, count: typeCounts.desks },
    { label: TYPE_LABELS.monitors, color: TYPE_COLORS.monitors, count: typeCounts.monitors },
    { label: TYPE_LABELS.other, color: TYPE_COLORS.other, count: typeCounts.other },
  ];

  const isToday = selectedDate === toDateInputValue(new Date());

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
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <h2 className="text-2xl font-bold text-purple-800">Inventory Summary</h2>

            {/* Date selection */}
            <div className="flex items-center gap-3">
              <label htmlFor="summary-date" className="text-sm text-purple-700 font-medium">
                Date:
              </label>
              <input
                type="date"
                id="summary-date"
                value={selectedDate}
                max={toDateInputValue(new Date())}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-3 py-2 border-2 border-purple-300 rounded-lg text-purple-800 focus:border-purple-500 focus:outline-none"
              />
              {!isToday && (
                <button
                  onClick={() => setSelectedDate(toDateInputValue(new Date()))}
                  className="px-3 py-2 bg-white text-purple-600 rounded-lg text-sm border-2 border-purple-300 hover:bg-purple-50 transition-colors"
                >
                  Today
                </button>
              )}
            </div>
          </div>

          {/* Pie chart */}
          <div className="flex flex-col md:flex-row items-center gap-8 mb-8">
            <div
              className="relative w-52 h-52 rounded-full"
              style={{ background: buildPieGradient() }}
            >
              <div className="absolute inset-4 bg-white rounded-full flex flex-col items-center justify-center">
                <span className="text-3xl font-bold text-purple-800">{typeCounts.total}</span>
                <span className="text-xs text-purple-500">assets</span>
              </div>
            </div>

            {/* Legend */}
            <div className="flex-1 w-full space-y-2">
              {legendEntries.map((entry) => (
                <div key={entry.label} className="flex items-center justify-between bg-purple-50 rounded-lg px-4 py-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: entry.color }}
                    />
                    <span className="text-purple-800 font-medium">{entry.label}</span>
                  </div>
                  <span className="text-purple-600 font-semibold">{entry.count}</span>
                </div>
              ))}
              {typeCounts.total === 0 && (
                <p className="text-sm text-purple-500 text-center">
                  No assets saved on this date.
                </p>
              )}
            </div>
          </div>

          {/* Per-room summary for the selected date */}
          {roomSummaries.length === 0 ? (
            <p className="text-purple-600 text-center">
              No assets saved for{" "}
              <span className="font-medium">
                {new Date(`${selectedDate}T00:00:00`).toLocaleDateString()}
              </span>
              .{" "}
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
                  <div key={scan.id} className="bg-purple-50 rounded-xl p-5">
                    <div className="flex flex-col md:flex-row md:items-center gap-3">
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
                      <div className="md:w-48 shrink-0 text-left md:text-right">
                        {editingScanId === scan.id ? (
                          <div className="flex flex-col items-end gap-2">
                            <input
                              type="date"
                              value={editingScanDate}
                              max={toDateInputValue(new Date())}
                              onChange={(e) => setEditingScanDate(e.target.value)}
                              className="px-2 py-1 border-2 border-purple-300 rounded-lg text-purple-800 focus:border-purple-500 focus:outline-none text-sm"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleUpdateScanDate(scan.id)}
                                disabled={isUpdatingScanDate || !editingScanDate}
                                className="px-3 py-1 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              >
                                {isUpdatingScanDate ? "Saving…" : "Save"}
                              </button>
                              <button
                                onClick={() => {
                                  setEditingScanId(null);
                                  setEditingScanDate("");
                                }}
                                className="px-3 py-1 bg-white text-purple-600 rounded-lg text-sm border-2 border-purple-300 hover:bg-purple-50 transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <div>
                              <p className="text-sm text-purple-600">
                                {new Date(scan.created_at).toLocaleDateString()}
                              </p>
                              <p className="text-xs text-purple-400">
                                {new Date(scan.created_at).toLocaleTimeString()}
                              </p>
                            </div>
                            <button
                              onClick={() => {
                                setEditingScanId(scan.id);
                                setEditingScanDate(toDateInputValue(new Date(scan.created_at)));
                              }}
                              className="text-purple-600 hover:text-purple-800 transition-colors"
                              title="Change scan date"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleStartEditScanAssets(scan)}
                              className="text-purple-600 hover:text-purple-800 transition-colors"
                              title="Edit detection results"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Inline asset editor */}
                    {editingAssetsScanId === scan.id && (
                      <div className="mt-4 pt-4 border-t border-purple-200 space-y-3">
                        {/* Room selector for all assets */}
                        <div className="flex items-center gap-3">
                          <label className="text-sm text-purple-700 font-medium whitespace-nowrap">
                            Room:
                          </label>
                          <select
                            value={editingAssetsRoomId}
                            onChange={(e) => setEditingAssetsRoomId(e.target.value)}
                            className="flex-1 px-3 py-2 border-2 border-purple-300 rounded-lg text-purple-800 focus:border-purple-500 focus:outline-none text-sm"
                          >
                            <option value="">No room (unassigned)…</option>
                            {rooms.map((room) => (
                              <option key={room.id} value={room.id}>
                                {room.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Editable asset list */}
                        {editingAssets.map((asset, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={asset.name}
                              onChange={(e) => handleUpdateScanAssetName(idx, e.target.value)}
                              className="flex-1 px-3 py-2 border-2 border-purple-300 rounded-lg text-purple-800 focus:border-purple-500 focus:outline-none text-sm"
                            />
                            <button
                              onClick={() => handleRemoveScanAsset(idx)}
                              className="text-red-500 hover:text-red-700 transition-colors"
                              title="Remove asset"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        ))}

                        {/* Add asset */}
                        {isAddingScanAsset ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={newScanAssetName}
                              onChange={(e) => setNewScanAssetName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleAddScanAsset();
                              }}
                              placeholder="Asset name (e.g. Whiteboard)"
                              className="flex-1 px-3 py-2 border-2 border-purple-300 rounded-lg text-purple-800 focus:border-purple-500 focus:outline-none text-sm"
                              autoFocus
                            />
                            <button
                              onClick={handleAddScanAsset}
                              disabled={!newScanAssetName.trim()}
                              className="px-3 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              Add
                            </button>
                            <button
                              onClick={() => {
                                setIsAddingScanAsset(false);
                                setNewScanAssetName("");
                              }}
                              className="px-3 py-2 bg-white text-purple-600 rounded-lg text-sm border-2 border-purple-300 hover:bg-purple-50 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setIsAddingScanAsset(true)}
                            className="px-3 py-1.5 bg-white text-purple-600 rounded-lg text-sm border-2 border-purple-300 hover:bg-purple-50 transition-colors"
                          >
                            + Add Asset
                          </button>
                        )}

                        {/* Save / Cancel */}
                        <div className="flex gap-2 pt-2">
                          <button
                            onClick={() => handleSaveScanAssets(scan.id)}
                            disabled={isUpdatingScanAssets}
                            className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            {isUpdatingScanAssets ? "Saving…" : "Save Changes"}
                          </button>
                          <button
                            onClick={handleCancelEditScanAssets}
                            className="px-4 py-2 bg-white text-purple-600 rounded-lg text-sm border-2 border-purple-300 hover:bg-purple-50 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
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
