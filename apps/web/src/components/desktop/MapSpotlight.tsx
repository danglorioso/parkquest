"use client";

import { useState, useEffect, useRef } from "react";
import { Search, ArrowRight } from "lucide-react";
import { fullStateName } from "@/lib/stateNames";

type ParkStatus = "visited" | "notVisited" | "bucketList";
type TabFilter = "all" | "visited" | "bucketList" | "notVisited";

interface SpotPark {
  park_code: string;
  name: string;
  states: string;
  status: ParkStatus;
  visitedDate?: string | null;
}

interface Props {
  parks: SpotPark[];
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onPick: (code: string) => void;
}

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

function SpotGroup({
  label,
  parks,
  onPick,
  activeCode,
}: {
  label: string;
  parks: SpotPark[];
  onPick: (code: string) => void;
  activeCode: string | null;
}) {
  if (!parks.length) return null;
  return (
    <div>
      <div
        style={{
          padding: "10px 16px 4px",
          fontFamily: "var(--font-mono)",
          fontSize: 9.5,
          letterSpacing: "1.4px",
          color: "var(--ink-mute)",
          textTransform: "uppercase",
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      {parks.map((p) => (
        <button
          key={p.park_code}
          onClick={() => onPick(p.park_code)}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(31,61,46,0.04)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background =
              activeCode === p.park_code ? "rgba(31,61,46,0.07)" : "transparent";
          }}
          style={{
            width: "100%",
            background: activeCode === p.park_code ? "rgba(31,61,46,0.07)" : "transparent",
            border: 0,
            padding: "8px 16px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 11,
            textAlign: "left",
            transition: "background 100ms",
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: STATUS_DOT[p.status],
              flexShrink: 0,
              boxShadow:
                p.status === "visited"
                  ? `0 0 0 2px ${STATUS_DOT[p.status]}28`
                  : "none",
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontWeight: 700,
                fontSize: 13.5,
                color: "var(--ink)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {p.name}
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--ink-mute)",
                marginTop: 1,
                fontWeight: 500,
              }}
            >
              {fullStateName(p.states.split(",")[0].trim())}
            </div>
          </div>
          <ArrowRight
            style={{ width: 13, height: 13, color: "var(--ink-mute)", flexShrink: 0 }}
            strokeWidth={2.2}
          />
        </button>
      ))}
    </div>
  );
}

export function MapSpotlight({ parks, open, onToggle, onClose, onPick }: Props) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<TabFilter>("all");
  const [activeIdx, setActiveIdx] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Refs to avoid stale closures in event handlers
  const activeIdxRef = useRef(-1);
  const flatRef = useRef<SpotPark[]>([]);

  const setIdx = (n: number) => {
    activeIdxRef.current = n;
    setActiveIdx(n);
  };

  // Focus / reset on open/close
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 60);
    } else {
      setQ("");
      setTab("all");
      setIdx(-1);
    }
  }, [open]);

  // Reset active item when query or tab changes
  useEffect(() => { setIdx(-1); }, [q, tab]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    const t = setTimeout(() => document.addEventListener("mousedown", onDocClick), 0);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", onDocClick); };
  }, [open, onClose]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = Math.min(activeIdxRef.current + 1, flatRef.current.length - 1);
        setIdx(next);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const next = Math.max(activeIdxRef.current - 1, -1);
        setIdx(next);
        if (next === -1) inputRef.current?.focus();
      } else if (e.key === "Enter") {
        const park = flatRef.current[activeIdxRef.current];
        if (park) { e.preventDefault(); onPick(park.park_code); }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onPick]);

  const filtered = parks.filter((p) => {
    if (tab !== "all" && p.status !== tab) return false;
    if (!q) return true;
    const stateStr = p.states.split(",").map((s) => fullStateName(s.trim())).join(" ");
    return `${p.name} ${stateStr}`.toLowerCase().includes(q.toLowerCase());
  });

  const suggestions =
    !q && tab === "all"
      ? {
          recent: [...parks]
            .filter((p) => p.status === "visited")
            .sort((a, b) => {
              const da = a.visitedDate ? new Date(a.visitedDate).getTime() : 0;
              const db = b.visitedDate ? new Date(b.visitedDate).getTime() : 0;
              return db - da;
            })
            .slice(0, 4),
          bucket: parks.filter((p) => p.status === "bucketList").slice(0, 4),
          discover: parks.filter((p) => p.status === "notVisited").slice(0, 4),
        }
      : null;

  // Keep flat ref current for keyboard handler
  flatRef.current = suggestions
    ? [...suggestions.recent, ...suggestions.bucket, ...suggestions.discover]
    : filtered;

  const activeCode = activeIdx >= 0 ? (flatRef.current[activeIdx]?.park_code ?? null) : null;

  if (!open) {
    return (
      <button
        onClick={onToggle}
        style={{
          position: "absolute",
          top: 16,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 20,
          background: "rgba(255,251,241,0.94)",
          backdropFilter: "blur(24px) saturate(160%)",
          WebkitBackdropFilter: "blur(24px) saturate(160%)",
          border: "0.5px solid var(--hairline)",
          borderRadius: 100,
          padding: "8px 14px 8px 12px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 10,
          minWidth: 300,
          boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          fontFamily: "inherit",
          fontWeight: 500,
          fontSize: 13,
          color: "var(--ink-mute)",
        }}
      >
        <Search style={{ width: 15, height: 15, flexShrink: 0 }} strokeWidth={2.2} />
        <span style={{ flex: 1, textAlign: "left" }}>Find a park…</span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            padding: "2px 6px",
            background: "var(--surface-alt)",
            color: "var(--ink-soft)",
            borderRadius: 5,
            letterSpacing: "0.4px",
            fontWeight: 600,
          }}
        >
          ⌘K
        </span>
      </button>
    );
  }

  return (
    <div
      ref={panelRef}
      style={{
        position: "absolute",
        top: 16,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 30,
        width: 560,
        maxHeight: "calc(100% - 32px)",
        background: "rgba(255,251,241,0.98)",
        backdropFilter: "blur(32px) saturate(180%)",
        WebkitBackdropFilter: "blur(32px) saturate(180%)",
        border: "0.5px solid var(--hairline)",
        borderRadius: 14,
        boxShadow: "0 20px 50px rgba(0,0,0,0.28)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        animation: "pqSpotIn 200ms cubic-bezier(.2,.7,.3,1)",
      }}
    >
      <style>{`@keyframes pqSpotIn { from { opacity:0; transform:translate(-50%,-6px) scale(0.98) } to { opacity:1; transform:translate(-50%,0) scale(1) } } `}</style>

      {/* Search input row */}
      <div
        style={{
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          borderBottom: "0.5px solid var(--hairline-soft)",
        }}
      >
        <Search style={{ width: 16, height: 16, color: "var(--ink-soft)", flexShrink: 0 }} strokeWidth={2.0} />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Search ${parks.length} national parks…`}
          style={{
            flex: 1,
            border: 0,
            outline: "none",
            background: "transparent",
            fontSize: 15,
            color: "var(--ink)",
            fontWeight: 500,
            fontFamily: "inherit",
          }}
        />
        <button
          onClick={onClose}
          style={{
            background: "var(--surface-alt)",
            border: 0,
            padding: "4px 8px",
            borderRadius: 5,
            cursor: "pointer",
            fontFamily: "var(--font-mono)",
            fontSize: 9.5,
            color: "var(--ink-soft)",
            letterSpacing: "0.6px",
            fontWeight: 600,
          }}
        >
          ESC
        </button>
      </div>

      {/* Filter tabs */}
      <div
        style={{
          padding: "8px 12px",
          display: "flex",
          gap: 4,
          borderBottom: "0.5px solid var(--hairline-soft)",
        }}
      >
        {TAB_DEFS.map((f) => {
          const active = tab === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setTab(f.id)}
              style={{
                background: active ? "rgba(31,61,46,0.06)" : "transparent",
                border: 0,
                borderRadius: 8,
                padding: "5px 10px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 5,
                fontWeight: active ? 700 : 600,
                fontSize: 11.5,
                color: active ? "var(--ink)" : "var(--ink-soft)",
              }}
            >
              <div
                style={{ width: 6, height: 6, borderRadius: "50%", background: f.color }}
              />
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Results */}
      <div style={{ flex: 1, overflowY: "auto", maxHeight: 460 }}>
        {suggestions ? (
          <>
            <SpotGroup label="RECENTLY VISITED" parks={suggestions.recent} onPick={onPick} activeCode={activeCode} />
            <SpotGroup label="ON YOUR BUCKET LIST" parks={suggestions.bucket} onPick={onPick} activeCode={activeCode} />
            <SpotGroup label="DISCOVER" parks={suggestions.discover} onPick={onPick} activeCode={activeCode} />
          </>
        ) : filtered.length === 0 ? (
          <div
            style={{
              padding: "40px 16px",
              textAlign: "center",
              fontSize: 13,
              color: "var(--ink-mute)",
            }}
          >
            No parks match &ldquo;{q}&rdquo;.
          </div>
        ) : (
          <SpotGroup
            label={q ? `${filtered.length} MATCH${filtered.length !== 1 ? "ES" : ""}` : `${filtered.length} PARKS`}
            parks={filtered}
            onPick={onPick}
            activeCode={activeCode}
          />
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "8px 14px",
          borderTop: "0.5px solid var(--hairline-soft)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--ink-mute)",
          letterSpacing: "0.6px",
          fontWeight: 600,
        }}
      >
        <span>↑↓ NAVIGATE · ⏎ SELECT</span>
        <span>⌘K CLOSE</span>
      </div>
    </div>
  );
}
