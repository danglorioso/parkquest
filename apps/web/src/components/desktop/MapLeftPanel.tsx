"use client";

import { useState } from "react";
import { Search } from "lucide-react";

export type FilterStatus = "all" | "visited" | "bucketList" | "notVisited";

interface Park {
  park_code: string;
  name: string;
  states: string;
  status: "visited" | "notVisited" | "bucketList";
}

interface Props {
  parks: Park[];
  filterStatus: FilterStatus;
  onFilterChange: (f: FilterStatus) => void;
  selectedParkCode: string | null;
  onSelectPark: (code: string) => void;
  loading?: boolean;
}

const FILTERS: { key: FilterStatus; label: string; color: string }[] = [
  { key: "all",        label: "All",     color: "var(--ink)" },
  { key: "visited",    label: "Visited", color: "var(--visited)" },
  { key: "bucketList", label: "Bucket",  color: "var(--bucket)" },
  { key: "notVisited", label: "Not yet", color: "var(--unvisited)" },
];

const glassPanel: React.CSSProperties = {
  position: "absolute",
  top: 16,
  left: 16,
  bottom: 16,
  width: 320,
  zIndex: 20,
  background: "rgba(255,251,241,0.92)",
  backdropFilter: "blur(28px) saturate(160%)",
  WebkitBackdropFilter: "blur(28px) saturate(160%)",
  border: "0.5px solid var(--hairline)",
  borderRadius: 14,
  boxShadow: "0 12px 36px rgba(0,0,0,0.18)",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

export function MapLeftPanel({
  parks,
  filterStatus,
  onFilterChange,
  selectedParkCode,
  onSelectPark,
  loading,
}: Props) {
  const [search, setSearch] = useState("");

  const counts = {
    all:        parks.length,
    visited:    parks.filter((p) => p.status === "visited").length,
    bucketList: parks.filter((p) => p.status === "bucketList").length,
    notVisited: parks.filter((p) => p.status === "notVisited").length,
  };

  const visible = parks
    .filter((p) => filterStatus === "all" || p.status === filterStatus)
    .filter(
      (p) => !search || p.name.toLowerCase().includes(search.toLowerCase())
    );

  const dotColor = (status: Park["status"]) =>
    status === "visited"
      ? "var(--visited)"
      : status === "bucketList"
      ? "var(--bucket)"
      : "var(--unvisited)";

  return (
    <div style={glassPanel}>
      {/* Header */}
      <div
        style={{
          padding: "14px 16px 10px",
          borderBottom: "0.5px solid var(--hairline-soft)",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "1.6px",
            color: "var(--ink-mute)",
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          BROWSE · {visible.length} PARKS
        </div>
        <div
          style={{
            fontWeight: 800,
            fontSize: 22,
            color: "var(--ink)",
            marginTop: 2,
            letterSpacing: -0.3,
          }}
        >
          The Map
        </div>

        {/* Search */}
        <div
          style={{
            marginTop: 10,
            background: "var(--surface-alt)",
            borderRadius: 9,
            padding: "6px 10px",
            display: "flex",
            alignItems: "center",
            gap: 7,
          }}
        >
          <Search
            style={{ width: 13, height: 13, color: "var(--ink-mute)", flexShrink: 0 }}
            strokeWidth={2.2}
          />
          <input
            type="text"
            placeholder={`Search ${parks.length} parks…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1,
              border: 0,
              outline: "none",
              background: "transparent",
              fontSize: 12,
              color: "var(--ink)",
              fontFamily: "inherit",
            }}
          />
        </div>

        {/* Filter pills */}
        <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
          {FILTERS.map((f) => {
            const active = filterStatus === f.key;
            return (
              <button
                key={f.key}
                onClick={() => onFilterChange(f.key)}
                style={{
                  flex: 1,
                  background: active ? "rgba(31,61,46,0.08)" : "transparent",
                  border: 0,
                  borderRadius: 8,
                  padding: "6px 0",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 1,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontWeight: 700,
                    fontSize: 10.5,
                    color: "var(--ink)",
                  }}
                >
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: f.color,
                    }}
                  />
                  {f.label}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9.5,
                    color: "var(--ink-mute)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {counts[f.key]}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Park list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {loading ? (
          <div
            style={{
              padding: 16,
              textAlign: "center",
              color: "var(--ink-mute)",
              fontSize: 12,
            }}
          >
            Loading parks…
          </div>
        ) : (
          visible.map((p) => {
            const isSel = p.park_code === selectedParkCode;
            const color = dotColor(p.status);
            const firstState = p.states.split(",")[0].trim();

            return (
              <button
                key={p.park_code}
                onClick={() => onSelectPark(p.park_code)}
                style={{
                  width: "100%",
                  background: isSel ? "rgba(31,61,46,0.05)" : "transparent",
                  border: 0,
                  padding: "10px 16px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  textAlign: "left",
                  borderBottom: "0.5px solid var(--hairline-soft)",
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: color,
                    flexShrink: 0,
                    boxShadow:
                      p.status === "visited"
                        ? `0 0 0 2px ${color}30`
                        : "none",
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 13,
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
                      fontSize: 9.5,
                      color: "var(--ink-mute)",
                      letterSpacing: "0.5px",
                      marginTop: 1,
                      fontWeight: 600,
                    }}
                  >
                    {firstState}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
