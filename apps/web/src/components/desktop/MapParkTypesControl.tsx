"use client";

import { useEffect, useRef, useState } from "react";
import { Layers, Check } from "lucide-react";

// One entry per park designation the app tracks — a park matches exactly one.
// Add a row here (matching the real NPS `designation` string) whenever a new
// batch gets seeded (Monuments, Memorials, ...); nothing else about this
// control needs to change to scale to a dozen of these.
export interface ParkTypeOption {
  key: string;
  label: string;
  match: (p: { is_national_park: boolean; designation?: string | null }) => boolean;
}
export const PARK_TYPES: ParkTypeOption[] = [
  { key: "national_park", label: "National Parks", match: (p) => p.is_national_park },
  { key: "historical_park", label: "National Historical Parks", match: (p) => p.designation === "National Historical Park" },
  { key: "monument", label: "National Monuments", match: (p) => p.designation === "National Monument" },
];
export const DEFAULT_PARK_TYPES = new Set(["national_park"]);

function collapsedLabel(enabled: Set<string>): string {
  if (enabled.size === 0) return "No parks shown";
  if (enabled.size === PARK_TYPES.length) return "All types";
  if (enabled.size === 1 && enabled.has("national_park")) return "National Parks";
  return `${enabled.size} types shown`;
}

interface Props {
  enabled: Set<string>;
  counts: Record<string, number>;
  onToggleType: (key: string) => void;
}

export function MapParkTypesControl({ enabled, counts, onToggleType }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Park types shown on map"
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          height: 32,
          background: "rgba(255,251,241,0.92)",
          backdropFilter: "blur(24px) saturate(160%)",
          WebkitBackdropFilter: "blur(24px) saturate(160%)",
          border: "0.5px solid var(--hairline)",
          borderRadius: 100,
          padding: "0 12px",
          fontFamily: "var(--font-mono)",
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: "0.6px",
          color: "var(--ink)",
          cursor: "pointer",
          boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          whiteSpace: "nowrap",
        }}
      >
        <Layers style={{ width: 13, height: 13, color: "var(--ink-soft)" }} strokeWidth={2} />
        {collapsedLabel(enabled)}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            minWidth: 240,
            background: "rgba(255,251,241,0.97)",
            backdropFilter: "blur(24px) saturate(160%)",
            WebkitBackdropFilter: "blur(24px) saturate(160%)",
            border: "0.5px solid var(--hairline)",
            borderRadius: 12,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            overflow: "hidden",
            zIndex: 30,
            fontFamily: "var(--font-mono)",
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "var(--ink-mute)",
              letterSpacing: "0.6px",
              textTransform: "uppercase",
              padding: "10px 12px 4px",
            }}
          >
            Park types shown on map
          </div>
          {PARK_TYPES.map((t, i) => {
            const checked = enabled.has(t.key);
            return (
              <button
                key={t.key}
                onClick={() => onToggleType(t.key)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "9px 12px",
                  background: checked ? "rgba(31,61,46,0.08)" : "transparent",
                  border: 0,
                  borderTop: i > 0 ? "0.5px solid var(--hairline)" : undefined,
                  cursor: "pointer",
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: checked ? "var(--ink)" : "var(--ink-soft)",
                  textAlign: "left",
                }}
              >
                <span
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 4,
                    border: `1.5px solid ${checked ? "var(--visited)" : "var(--hairline)"}`,
                    background: checked ? "var(--visited)" : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {checked && <Check style={{ width: 11, height: 11, color: "#FFFBF1" }} strokeWidth={3} />}
                </span>
                <span style={{ flex: 1 }}>{t.label}</span>
                <span style={{ color: "var(--ink-mute)", fontVariantNumeric: "tabular-nums" }}>
                  {counts[t.key] ?? 0}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
