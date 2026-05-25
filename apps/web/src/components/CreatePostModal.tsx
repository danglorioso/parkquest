"use client";

import { useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import {
  Camera, MapPin, Globe, Users, Lock, Calendar, ChevronRight, Check,
} from "lucide-react";

interface Park {
  park_code: string;
  name: string;
  states: string | null;
}

const AUDIENCE_CYCLE = ["Friends", "Public", "Private"] as const;
type Audience = (typeof AUDIENCE_CYCLE)[number];

const PHOTO_PALETTES: [string, string][] = [
  ["#1F3D2E", "#2F7A4A"],
  ["#2D4F66", "#6E97A3"],
  ["#7B3A1F", "#C56B3D"],
  ["#3A2E5C", "#8B5DBF"],
  ["#2F7A4A", "#D89A3A"],
  ["#1F3D2E", "#D89A3A"],
  ["#C56B3D", "#D89A3A"],
  ["#2D4F66", "#2F7A4A"],
  ["#7B3A1F", "#3A2E5C"],
  ["#1F3D2E", "#6E97A3"],
  ["#D89A3A", "#C56B3D"],
  ["#2F7A4A", "#3A2E5C"],
  ["#6E97A3", "#2D4F66"],
  ["#8B5DBF", "#2D4F66"],
  ["#C56B3D", "#1F3D2E"],
  ["#D89A3A", "#2F7A4A"],
];

function Avatar({
  url,
  name,
  size = 40,
}: {
  url?: string | null;
  name?: string | null;
  size?: number;
}) {
  const initials = (name ?? "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        overflow: "hidden",
        flexShrink: 0,
        background: "var(--surface-alt)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.32,
        fontWeight: 700,
        color: "var(--ink-mute)",
        fontFamily: "var(--font-mono)",
      }}
    >
      {url ? (
        <img src={url} alt={name ?? ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        initials
      )}
    </div>
  );
}

function DetailRow({
  icon,
  label,
  value,
  highlight,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        background: "transparent",
        border: 0,
        cursor: onClick ? "pointer" : "default",
        padding: "8px 0",
        display: "flex",
        alignItems: "center",
        gap: 10,
        textAlign: "left",
        borderBottom: "0.5px solid var(--hairline-soft)",
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          background: highlight ? "var(--primary)" : "var(--surface)",
          border: highlight ? "none" : "0.5px solid var(--hairline)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: "1.2px",
            color: "var(--ink-mute)",
            fontWeight: 600,
          }}
        >
          {label.toUpperCase()}
        </div>
        <div
          style={{
            fontWeight: 600,
            fontSize: 12.5,
            color: "var(--ink)",
            marginTop: 1,
          }}
        >
          {value}
        </div>
      </div>
      {onClick && (
        <ChevronRight size={14} strokeWidth={2.0} style={{ color: "var(--ink-mute)", flexShrink: 0 }} />
      )}
    </button>
  );
}

export interface CreatePostModalProps {
  onClose: () => void;
  onPost?: () => void;
}

export function CreatePostModal({ onClose, onPost }: CreatePostModalProps) {
  const { user } = useUser();
  const [caption, setCaption] = useState("");
  const [picked, setPicked] = useState<number[]>([]);
  const [audience, setAudience] = useState<Audience>("Friends");
  const [parks, setParks] = useState<Park[]>([]);
  const [selectedPark, setSelectedPark] = useState<Park | null>(null);
  const [showParkPicker, setShowParkPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/parks")
      .then((r) => (r.ok ? r.json() : []))
      .then((p: Park[]) => setParks(p))
      .catch(() => {});
  }, []);

  const togglePick = (i: number) => {
    setPicked((prev) =>
      prev.includes(i)
        ? prev.filter((x) => x !== i)
        : prev.length < 10
        ? [...prev, i]
        : prev
    );
  };

  const cycleAudience = () => {
    const idx = AUDIENCE_CYCLE.indexOf(audience);
    setAudience(AUDIENCE_CYCLE[(idx + 1) % AUDIENCE_CYCLE.length]);
  };

  const handleShare = async () => {
    setSubmitting(true);
    try {
      await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caption,
          park_code: selectedPark?.park_code ?? null,
          photos: [],
        }),
      });
      onPost?.();
      onClose();
    } catch {
      // silently fail — user can retry
    } finally {
      setSubmitting(false);
    }
  };

  const AudienceIcon =
    audience === "Public" ? Globe : audience === "Friends" ? Users : Lock;

  const name = user?.fullName ?? user?.username ?? "Explorer";
  const avatarUrl = user?.imageUrl;
  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(0,0,0,0.5)",
        backdropFilter: "blur(12px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <style>{`@keyframes pqModalIn { from { transform: scale(0.95); opacity: 0 } to { transform: scale(1); opacity: 1 } }`}</style>

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 980,
          height: 640,
          background: "var(--surface)",
          borderRadius: 18,
          border: "0.5px solid var(--hairline)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.4)",
          display: "flex",
          overflow: "hidden",
          position: "relative",
          animation: "pqModalIn 220ms cubic-bezier(.2,.7,.3,1)",
        }}
      >
        {/* ── Header ──────────────────────────────────────────────── */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            padding: "14px 22px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "0.5px solid var(--hairline-soft)",
            background: "var(--surface)",
            zIndex: 2,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Avatar url={avatarUrl} name={name} size={26} />
            <div>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 13,
                  color: "var(--ink)",
                }}
              >
                New post
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9.5,
                  color: "var(--ink-mute)",
                  letterSpacing: "0.6px",
                  fontWeight: 600,
                }}
              >
                DRAFT · {picked.length}/10 PHOTOS
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={onClose}
              style={{
                background: "transparent",
                border: "0.5px solid var(--hairline)",
                color: "var(--ink)",
                padding: "6px 14px",
                borderRadius: 8,
                cursor: "pointer",
                fontWeight: 700,
                fontSize: 12.5,
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleShare}
              disabled={submitting}
              style={{
                background: "var(--primary)",
                border: "none",
                color: "#FFFBF1",
                padding: "6px 16px",
                borderRadius: 8,
                cursor: submitting ? "not-allowed" : "pointer",
                fontWeight: 700,
                fontSize: 12.5,
                display: "flex",
                alignItems: "center",
                gap: 5,
                opacity: submitting ? 0.6 : 1,
              }}
            >
              <Check size={13} strokeWidth={2.4} />
              Share
            </button>
          </div>
        </div>

        {/* ── Left: photo grid ─────────────────────────────────────── */}
        <div
          style={{
            flex: 1,
            paddingTop: 60,
            paddingLeft: 22,
            paddingRight: 14,
            paddingBottom: 22,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 10,
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9.5,
                  letterSpacing: "1.4px",
                  color: "var(--ink-mute)",
                  textTransform: "uppercase",
                  fontWeight: 600,
                }}
              >
                RECENT · {PHOTO_PALETTES.length} PHOTOS
              </div>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 15,
                  color: "var(--ink)",
                  marginTop: 2,
                }}
              >
                Choose up to 10
              </div>
            </div>
            <button
              style={{
                background: "transparent",
                border: 0,
                color: "var(--primary)",
                fontWeight: 700,
                fontSize: 12.5,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Camera size={14} strokeWidth={2.2} />
              Upload
            </button>
          </div>

          <div
            style={{
              flex: 1,
              overflowY: "auto",
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 6,
              alignContent: "start",
            }}
          >
            {PHOTO_PALETTES.map((pal, i) => {
              const isPicked = picked.includes(i);
              const ord = picked.indexOf(i) + 1;
              return (
                <button
                  key={i}
                  onClick={() => togglePick(i)}
                  style={{
                    position: "relative",
                    border: 0,
                    background: "transparent",
                    padding: 0,
                    cursor: "pointer",
                    borderRadius: 8,
                  }}
                >
                  <div
                    style={{
                      height: 120,
                      borderRadius: 8,
                      background: `linear-gradient(160deg, ${pal[0]} 0%, ${pal[1]} 100%)`,
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      borderRadius: 8,
                      background: isPicked ? "rgba(31,61,46,0.30)" : "transparent",
                      border: isPicked ? "2.5px solid var(--primary)" : "none",
                      transition: "all 120ms",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      top: 6,
                      right: 6,
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      background: isPicked ? "var(--primary)" : "rgba(255,251,241,0.7)",
                      border: isPicked ? "none" : "1.5px solid rgba(255,255,255,0.95)",
                      color: "#FFFBF1",
                      fontWeight: 800,
                      fontSize: 11,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
                    }}
                  >
                    {isPicked ? ord : ""}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Right: composer ──────────────────────────────────────── */}
        <div
          style={{
            width: 380,
            flexShrink: 0,
            paddingTop: 60,
            paddingLeft: 16,
            paddingRight: 22,
            paddingBottom: 22,
            borderLeft: "0.5px solid var(--hairline-soft)",
            background: "var(--bg)",
            display: "flex",
            flexDirection: "column",
            overflowY: "auto",
          }}
        >
          {/* Caption */}
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9.5,
              letterSpacing: "1.4px",
              color: "var(--ink-mute)",
              textTransform: "uppercase",
              fontWeight: 600,
              marginBottom: 6,
            }}
          >
            CAPTION
          </div>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value.slice(0, 500))}
            placeholder="Share your experience…"
            style={{
              width: "100%",
              minHeight: 140,
              resize: "none",
              background: "var(--surface)",
              border: "0.5px solid var(--hairline)",
              borderRadius: 12,
              padding: "12px 14px",
              fontSize: 14,
              color: "var(--ink)",
              lineHeight: 1.5,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 6,
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--ink-mute)",
                letterSpacing: "0.6px",
                fontWeight: 600,
              }}
            >
              {caption.length} / 500
            </div>
            <button
              style={{
                background: "transparent",
                border: 0,
                color: "var(--primary)",
                fontWeight: 700,
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              Add hashtags
            </button>
          </div>

          {/* Details */}
          <div
            style={{
              marginTop: 18,
              fontFamily: "var(--font-mono)",
              fontSize: 9.5,
              letterSpacing: "1.4px",
              color: "var(--ink-mute)",
              textTransform: "uppercase",
              fontWeight: 600,
              marginBottom: 8,
            }}
          >
            DETAILS
          </div>

          <DetailRow
            icon={
              <MapPin
                size={14}
                strokeWidth={2.0}
                style={{ color: selectedPark ? "#FFFBF1" : "var(--ink-soft)" }}
              />
            }
            label="Park"
            value={
              selectedPark
                ? `${selectedPark.name}${selectedPark.states ? ` · ${selectedPark.states}` : ""}`
                : "Select a park"
            }
            highlight={!!selectedPark}
            onClick={() => setShowParkPicker((p) => !p)}
          />

          {showParkPicker && (
            <div
              style={{
                maxHeight: 160,
                overflowY: "auto",
                background: "var(--surface)",
                border: "0.5px solid var(--hairline)",
                borderRadius: 10,
                marginBottom: 4,
              }}
            >
              {parks.slice(0, 40).map((p) => (
                <button
                  key={p.park_code}
                  onClick={() => {
                    setSelectedPark(p);
                    setShowParkPicker(false);
                  }}
                  style={{
                    width: "100%",
                    background: "transparent",
                    border: 0,
                    padding: "8px 12px",
                    textAlign: "left",
                    cursor: "pointer",
                    fontSize: 12.5,
                    color: "var(--ink)",
                    borderBottom: "0.5px solid var(--hairline-soft)",
                    display: "block",
                  }}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}

          <DetailRow
            icon={
              <AudienceIcon size={14} strokeWidth={2.0} style={{ color: "var(--ink-soft)" }} />
            }
            label="Audience"
            value={audience}
            onClick={cycleAudience}
          />
          <DetailRow
            icon={<Calendar size={14} strokeWidth={2.0} style={{ color: "var(--ink-soft)" }} />}
            label="Date"
            value={today}
          />
          <DetailRow
            icon={<Users size={14} strokeWidth={2.0} style={{ color: "var(--ink-soft)" }} />}
            label="Tag friends"
            value="None tagged"
            onClick={() => {}}
          />

          <div style={{ flex: 1 }} />

          {/* Preview snippet */}
          <div
            style={{
              marginTop: 14,
              padding: 14,
              background: "var(--surface)",
              border: "0.5px solid var(--hairline)",
              borderRadius: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Avatar url={avatarUrl} name={name} size={28} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 12.5, color: "var(--ink)" }}>
                  {name}{" "}
                  <span style={{ color: "var(--ink-mute)", fontWeight: 500 }}>· now</span>
                </div>
                {selectedPark && (
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      color: "var(--primary)",
                      letterSpacing: "0.4px",
                      fontWeight: 700,
                    }}
                  >
                    📍 {selectedPark.name.toUpperCase()}
                  </div>
                )}
              </div>
            </div>
            <div
              style={{
                fontSize: 12.5,
                color: "var(--ink-mute)",
                marginTop: 8,
                lineHeight: 1.4,
              }}
            >
              {caption
                ? `${caption.slice(0, 120)}${caption.length > 120 ? "…" : ""}`
                : <em>Your caption will appear here…</em>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
