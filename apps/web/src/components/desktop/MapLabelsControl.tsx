"use client";

import { useEffect, useRef, useState } from "react";
import { Type } from "lucide-react";

// Mirrors the mobile map's label menu (min/max/default 0.5pt steps) — see
// apps/mobile/app/(tabs)/map.tsx LABEL_FONT_MIN/MAX/DEFAULT.
export const LABEL_FONT_MIN = 9;
export const LABEL_FONT_MAX = 15;
export const LABEL_FONT_DEFAULT = 11.5;

interface Props {
  labelsEnabled: boolean;
  onLabelsEnabledChange: (v: boolean) => void;
  labelFontSize: number;
  onLabelFontSizeChange: (v: number) => void;
}

export function MapLabelsControl({
  labelsEnabled, onLabelsEnabledChange, labelFontSize, onLabelFontSizeChange,
}: Props) {
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
        aria-label="Label settings"
        style={{
          width: 32,
          height: 32,
          borderRadius: 100,
          background: "rgba(255,251,241,0.92)",
          backdropFilter: "blur(24px) saturate(160%)",
          WebkitBackdropFilter: "blur(24px) saturate(160%)",
          border: "0.5px solid var(--hairline)",
          boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          position: "relative",
        }}
      >
        <Type style={{ width: 15, height: 15, color: "var(--ink)" }} strokeWidth={2} />
        {!labelsEnabled && (
          <span
            style={{
              position: "absolute",
              width: 20,
              height: 1.5,
              background: "var(--ink)",
              transform: "rotate(-45deg)",
            }}
          />
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            minWidth: 200,
            background: "rgba(255,251,241,0.97)",
            backdropFilter: "blur(24px) saturate(160%)",
            WebkitBackdropFilter: "blur(24px) saturate(160%)",
            border: "0.5px solid var(--hairline)",
            borderRadius: 12,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            padding: "8px 10px",
            zIndex: 30,
            fontFamily: "var(--font-mono)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              padding: "4px 0",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.3px",
              color: "var(--ink)",
            }}
          >
            Show labels
            <span
              onClick={() => onLabelsEnabledChange(!labelsEnabled)}
              role="switch"
              aria-checked={labelsEnabled}
              style={{
                width: 32,
                height: 18,
                borderRadius: 100,
                background: labelsEnabled ? "var(--visited)" : "var(--hairline)",
                position: "relative",
                cursor: "pointer",
                transition: "background 150ms",
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 2,
                  left: labelsEnabled ? 16 : 2,
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: "#FFFBF1",
                  transition: "left 150ms",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
                }}
              />
            </span>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              paddingTop: 8,
              marginTop: 4,
              borderTop: "0.5px solid var(--hairline)",
              opacity: labelsEnabled ? 1 : 0.4,
            }}
          >
            <span style={{ fontSize: 10, color: "var(--ink-soft)" }}>A</span>
            <input
              type="range"
              min={LABEL_FONT_MIN}
              max={LABEL_FONT_MAX}
              step={0.5}
              value={labelFontSize}
              disabled={!labelsEnabled}
              onChange={(e) => onLabelFontSizeChange(parseFloat(e.target.value))}
              style={{ flex: 1, accentColor: "var(--visited)" }}
            />
            <span style={{ fontSize: 15, color: "var(--ink-soft)" }}>A</span>
          </div>
        </div>
      )}
    </div>
  );
}
