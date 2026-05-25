"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { fullStateName } from "@/lib/stateNames";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Park {
  park_code: string;
  name: string;
  states: string;
}

interface Visit {
  park_code: string;
  is_bucket_list: boolean;
  visited_date: string | null;
}

interface UserResult {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

type ParkStatus = "visited" | "bucketList" | "notVisited";
type TabFilter = "all" | "visited" | "bucketList" | "notVisited";

interface ParkWithStatus extends Park {
  status: ParkStatus;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_DOT: Record<ParkStatus, string> = {
  visited: "var(--visited)",
  bucketList: "var(--bucket)",
  notVisited: "var(--unvisited)",
};

const TAB_DEFS: { id: TabFilter; label: string; color: string }[] = [
  { id: "all",        label: "All",     color: "var(--ink)"       },
  { id: "visited",    label: "Visited", color: "var(--visited)"   },
  { id: "bucketList", label: "Bucket",  color: "var(--bucket)"    },
  { id: "notVisited", label: "Not yet", color: "var(--unvisited)" },
];

function resolveParkStatus(code: string, visits: Visit[]): ParkStatus {
  const pv = visits.filter((v) => v.park_code === code);
  if (pv.some((v) => !v.is_bucket_list && v.visited_date)) return "visited";
  if (pv.some((v) => v.is_bucket_list)) return "bucketList";
  return "notVisited";
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ParkRow({ park, onPick }: { park: ParkWithStatus; onPick: () => void }) {
  return (
    <button
      onClick={onPick}
      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(31,61,46,0.04)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      style={{
        width: "100%", background: "transparent", border: 0,
        padding: "8px 16px", cursor: "pointer",
        display: "flex", alignItems: "center", gap: 11,
        textAlign: "left", transition: "background 100ms",
      }}
    >
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS_DOT[park.status], flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {park.name}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-mute)", marginTop: 1, fontWeight: 500 }}>
          {fullStateName(park.states.split(",")[0].trim())}
        </div>
      </div>
      <ArrowRight style={{ width: 13, height: 13, color: "var(--ink-mute)", flexShrink: 0 }} strokeWidth={2.2} />
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: "10px 16px 4px", fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "1.4px", color: "var(--ink-mute)", fontWeight: 600 }}>
      {children}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
}

export function GlobalSpotlight({ open, onClose }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const userTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [q, setQ] = useState("");
  const [tab, setTab] = useState<TabFilter>("all");
  const [parks, setParks] = useState<Park[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [users, setUsers] = useState<UserResult[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);

  // Fetch parks + visits once on first open
  useEffect(() => {
    if (!open || dataLoaded) return;
    Promise.all([
      fetch("/api/parks").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/visits").then((r) => (r.ok ? r.json() : [])),
    ]).then(([p, v]) => {
      setParks(p);
      setVisits(v);
      setDataLoaded(true);
    }).catch(() => {});
  }, [open, dataLoaded]);

  // Focus + reset on open/close
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 60);
    } else {
      setQ("");
      setTab("all");
      setUsers([]);
    }
  }, [open]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [open, onClose]);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    const t = setTimeout(() => document.addEventListener("mousedown", onDocClick), 0);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", onDocClick); };
  }, [open, onClose]);

  // Debounced user search
  const searchUsers = useCallback((query: string) => {
    if (userTimer.current) clearTimeout(userTimer.current);
    if (!query.trim()) { setUsers([]); return; }
    userTimer.current = setTimeout(() => {
      fetch(`/api/users?search=${encodeURIComponent(query)}`)
        .then((r) => (r.ok ? r.json() : []))
        .then(setUsers)
        .catch(() => {});
    }, 200);
  }, []);

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQ(val);
    searchUsers(val);
  };

  const handleSelect = (href: string) => {
    onClose();
    router.push(href);
  };

  if (!open) return null;

  // Build park list with statuses
  const parksWithStatus: ParkWithStatus[] = parks.map((p) => ({
    ...p,
    status: resolveParkStatus(p.park_code, visits),
  }));

  const filteredParks = parksWithStatus.filter((p) => {
    if (tab !== "all" && p.status !== tab) return false;
    if (!q) return true;
    const stateStr = p.states.split(",").map((s) => fullStateName(s.trim())).join(" ");
    return `${p.name} ${stateStr}`.toLowerCase().includes(q.toLowerCase());
  });

  const suggestions =
    !q && tab === "all"
      ? {
          recent: parksWithStatus
            .filter((p) => p.status === "visited")
            .slice(0, 5),
          bucket: parksWithStatus.filter((p) => p.status === "bucketList").slice(0, 5),
          discover: parksWithStatus.filter((p) => p.status === "notVisited").slice(0, 5),
        }
      : null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(20,17,12,0.35)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "10vh",
      }}
    >
      <div
        ref={panelRef}
        style={{
          width: 600,
          maxWidth: "calc(100vw - 48px)",
          maxHeight: "72vh",
          background: "rgba(255,251,241,0.98)",
          backdropFilter: "blur(32px) saturate(180%)",
          WebkitBackdropFilter: "blur(32px) saturate(180%)",
          border: "0.5px solid var(--hairline)",
          borderRadius: 16,
          boxShadow: "0 24px 60px rgba(0,0,0,0.28), 0 8px 20px rgba(0,0,0,0.12)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          animation: "pqGSpotIn 200ms cubic-bezier(.2,.7,.3,1)",
        }}
      >
        <style>{`@keyframes pqGSpotIn { from { opacity:0; transform:translateY(-8px) scale(0.98) } to { opacity:1; transform:translateY(0) scale(1) } }`}</style>

        {/* Input row */}
        <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, borderBottom: "0.5px solid var(--hairline-soft)" }}>
          <Search style={{ width: 17, height: 17, color: "var(--ink-soft)", flexShrink: 0 }} strokeWidth={2.0} />
          <input
            ref={inputRef}
            value={q}
            onChange={handleQueryChange}
            placeholder="Search parks and people…"
            style={{
              flex: 1, border: 0, outline: "none", background: "transparent",
              fontSize: 16, color: "var(--ink)", fontWeight: 500, fontFamily: "inherit",
            }}
          />
          <button
            onClick={onClose}
            style={{
              background: "var(--surface-alt)", border: 0, padding: "4px 8px",
              borderRadius: 5, cursor: "pointer", fontFamily: "var(--font-mono)",
              fontSize: 9.5, color: "var(--ink-soft)", letterSpacing: "0.6px", fontWeight: 600,
            }}
          >
            ESC
          </button>
        </div>

        {/* Park filter tabs */}
        <div style={{ padding: "8px 12px", display: "flex", gap: 4, borderBottom: "0.5px solid var(--hairline-soft)" }}>
          {TAB_DEFS.map((f) => {
            const active = tab === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setTab(f.id)}
                style={{
                  background: active ? "rgba(31,61,46,0.06)" : "transparent",
                  border: 0, borderRadius: 8, padding: "5px 10px", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 5,
                  fontWeight: active ? 700 : 600, fontSize: 11.5,
                  color: active ? "var(--ink)" : "var(--ink-soft)",
                }}
              >
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: f.color }} />
                {f.label}
              </button>
            );
          })}
        </div>

        {/* Results */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {/* People */}
          {q && users.length > 0 && (
            <div>
              <SectionLabel>PEOPLE</SectionLabel>
              {users.slice(0, 4).map((user) => (
                <button
                  key={user.username}
                  onClick={() => handleSelect(`/profile/${user.username}`)}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(31,61,46,0.04)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  style={{
                    width: "100%", background: "transparent", border: 0,
                    padding: "8px 16px", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 11,
                    textAlign: "left", transition: "background 100ms",
                  }}
                >
                  {user.avatar_url ? (
                    <img src={user.avatar_url} alt={user.username} style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--surface-alt)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "var(--ink-mute)" }}>
                      {user.username[0]?.toUpperCase()}
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {user.display_name && (
                      <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {user.display_name}
                      </div>
                    )}
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-mute)", marginTop: 1, fontWeight: 500 }}>
                      @{user.username}
                    </div>
                  </div>
                  <ArrowRight style={{ width: 13, height: 13, color: "var(--ink-mute)", flexShrink: 0 }} strokeWidth={2.2} />
                </button>
              ))}
            </div>
          )}

          {/* Parks */}
          {suggestions ? (
            <>
              {suggestions.recent.length > 0 && (
                <div>
                  <SectionLabel>RECENTLY VISITED</SectionLabel>
                  {suggestions.recent.map((p) => <ParkRow key={p.park_code} park={p} onPick={() => handleSelect(`/parks/${p.park_code}`)} />)}
                </div>
              )}
              {suggestions.bucket.length > 0 && (
                <div>
                  <SectionLabel>ON YOUR BUCKET LIST</SectionLabel>
                  {suggestions.bucket.map((p) => <ParkRow key={p.park_code} park={p} onPick={() => handleSelect(`/parks/${p.park_code}`)} />)}
                </div>
              )}
              {suggestions.discover.length > 0 && (
                <div>
                  <SectionLabel>DISCOVER</SectionLabel>
                  {suggestions.discover.map((p) => <ParkRow key={p.park_code} park={p} onPick={() => handleSelect(`/parks/${p.park_code}`)} />)}
                </div>
              )}
            </>
          ) : filteredParks.length > 0 ? (
            <div>
              <SectionLabel>
                {q ? `${filteredParks.length} PARK${filteredParks.length !== 1 ? "S" : ""}` : `${filteredParks.length} PARKS`}
              </SectionLabel>
              {filteredParks.map((p) => <ParkRow key={p.park_code} park={p} onPick={() => handleSelect(`/parks/${p.park_code}`)} />)}
            </div>
          ) : q && users.length === 0 ? (
            <div style={{ padding: "40px 16px", textAlign: "center", fontSize: 13, color: "var(--ink-mute)" }}>
              No results for &ldquo;{q}&rdquo;.
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div style={{ padding: "8px 14px", borderTop: "0.5px solid var(--hairline-soft)", display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-mute)", letterSpacing: "0.6px", fontWeight: 600 }}>
          <span>↑↓ NAVIGATE · ⏎ OPEN</span>
          <span>⌘K TOGGLE</span>
        </div>
      </div>
    </div>
  );
}
