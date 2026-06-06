"use client";

import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useEffect, useId, useMemo, useState } from "react";
import {
  Calendar, MapPin, Users, Plus, Share2, Check,
  Settings, ChevronRight,
} from "lucide-react";
import { DesktopShell } from "@/components/desktop/DesktopShell";
import { DesktopButton } from "@/components/desktop/DesktopButton";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TripStop {
  park_code: string;
  name: string;
  states: string;
  position: [number, number];
  nights: number;
  notes: string;
}

// ── PlannerMap (dynamic import — no SSR) ─────────────────────────────────────

const PlannerMap = dynamic(() => import("@/components/PlannerMap"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full animate-pulse" style={{ background: "#E8E2D0" }} />
  ),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const MOCK_WEATHER = [
  { d: "MON", t: 78, c: "☀️" },
  { d: "TUE", t: 75, c: "☀️" },
  { d: "WED", t: 72, c: "⛅" },
  { d: "THU", t: 68, c: "⛅" },
  { d: "FRI", t: 64, c: "🌧️" },
  { d: "SAT", t: 67, c: "⛅" },
  { d: "SUN", t: 71, c: "☀️" },
];

const MOCK_NOTES = [
  "Sunrise hike recommended. Book permits early.",
  "Drive day — stop at scenic overlooks en route.",
  "Guided tour at 10am. Afternoon free for trails.",
  "Set up camp first, then head to the canyon rim.",
  "Short day — arrive early, evening stargaze.",
  "Full-day trail. Elevation change — pack layers.",
  "Explore the visitor center and short nature walk.",
];

// ── Pill ──────────────────────────────────────────────────────────────────────

function Pill({ icon: Icon, children }: { icon: React.ComponentType<{ size?: number; strokeWidth?: number }>; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "0.5px solid var(--hairline)",
        borderRadius: 100,
        padding: "4px 10px 4px 8px",
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontWeight: 600,
        fontSize: 11,
        color: "var(--ink)",
      }}
    >
      <Icon size={12} strokeWidth={2.2} />
      {children}
    </div>
  );
}

// ── StopCard ──────────────────────────────────────────────────────────────────

function StopCard({
  stop,
  index,
  isLast,
  onRemove,
}: {
  stop: TripStop;
  index: number;
  isLast: boolean;
  onRemove: () => void;
}) {
  const stateCode = stop.states.split(",")[0]?.trim().slice(0, 2).toUpperCase() ?? "US";

  return (
    <div style={{ position: "relative", display: "flex", gap: 12, padding: "8px", marginBottom: 4 }}>
      {/* Connecting line */}
      {!isLast && (
        <div
          style={{
            position: "absolute",
            left: 20,
            top: 32,
            bottom: -4,
            width: 2,
            background: "var(--primary)",
            opacity: 0.2,
            borderRadius: 1,
          }}
        />
      )}

      {/* Step badge */}
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: "50%",
          background: "var(--primary)",
          color: "#FFFBF1",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 800,
          fontSize: 11,
          flexShrink: 0,
          position: "relative",
          zIndex: 1,
          boxShadow: "0 0 0 3px var(--bg)",
        }}
      >
        {index + 1}
      </div>

      {/* Card */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          background: "var(--surface)",
          border: "0.5px solid var(--hairline)",
          borderRadius: 10,
          padding: "8px 12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {stop.name}
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9.5,
              color: "var(--ink-mute)",
              letterSpacing: "0.6px",
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            {stop.nights}n
          </div>
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9.5,
            color: "var(--ink-mute)",
            letterSpacing: "0.8px",
            marginTop: 1,
            fontWeight: 600,
          }}
        >
          {stateCode}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--ink-soft)",
            marginTop: 6,
            lineHeight: 1.4,
          }}
        >
          {stop.notes}
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PlannerPage() {
  const { isLoaded, isSignedIn } = useUser();
  const router = useRouter();

  const [stops, setStops]   = useState<TripStop[]>([]);
  const [loading, setLoading] = useState(true);
  const [tripName, setTripName] = useState("My Road Trip");
  const [saved, setSaved]   = useState(false);

  useEffect(() => {
    if (isLoaded && !isSignedIn) router.push("/");
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    if (!isSignedIn) return;

    Promise.all([
      fetch("/api/visits").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/parks").then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([visits, parks]) => {
        type V = { park_code: string; is_bucket_list: boolean };
        type P = { park_code: string; name: string; states: string; latitude: string | null; longitude: string | null };

        const bucketCodes = new Set(
          (visits as V[]).filter((v) => v.is_bucket_list).map((v) => v.park_code)
        );

        const parkMap = new Map<string, P>((parks as P[]).map((p: P) => [p.park_code, p]));

        const tripStops: TripStop[] = Array.from(bucketCodes)
          .map((code, i) => {
            const p = parkMap.get(code);
            if (!p || !p.latitude || !p.longitude) return null;
            return {
              park_code: code,
              name: p.name,
              states: p.states,
              position: [parseFloat(p.latitude), parseFloat(p.longitude)] as [number, number],
              nights: 1 + (i % 3),
              notes: MOCK_NOTES[i % MOCK_NOTES.length],
            };
          })
          .filter(Boolean) as TripStop[];

        setStops(tripStops);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [isSignedIn]);

  const totalNights = stops.reduce((sum, s) => sum + s.nights, 0);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <DesktopShell fullbleed>
      <div style={{ display: "flex", height: "100%", position: "relative" }}>

        {/* ── Coming soon overlay ───────────────────────────────────── */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 50,
            background: "rgba(245,239,224,0.72)",
            backdropFilter: "blur(12px) saturate(140%)",
            WebkitBackdropFilter: "blur(12px) saturate(140%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
          }}
        >
          <div
            style={{
              background: "rgba(255,251,241,0.96)",
              border: "0.5px solid var(--hairline)",
              borderRadius: 18,
              padding: "36px 48px",
              textAlign: "center",
              boxShadow: "0 12px 40px rgba(0,0,0,0.10)",
              maxWidth: 420,
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "2.4px",
                color: "var(--ink-mute)",
                textTransform: "uppercase",
                fontWeight: 600,
                marginBottom: 12,
              }}
            >
              Coming soon
            </div>
            <div
              style={{
                fontWeight: 800,
                fontSize: 28,
                color: "var(--ink)",
                letterSpacing: -0.6,
                lineHeight: 1.1,
                marginBottom: 12,
              }}
            >
              Trip Planner
            </div>
            <div
              style={{
                fontSize: 14,
                color: "var(--ink-mute)",
                lineHeight: 1.6,
              }}
            >
              Plan multi-park road trips, invite companions, and get weather
              forecasts baked in. This feature is in the works.
            </div>
          </div>
        </div>

        {/* ── Left: itinerary panel ──────────────────────────────── */}
        <div
          style={{
            width: 380,
            flexShrink: 0,
            borderRight: "0.5px solid var(--hairline)",
            background: "var(--bg)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "18px 22px 14px",
              borderBottom: "0.5px solid var(--hairline-soft)",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
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
                TRIP · DRAFT
              </div>
              <button
                style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--ink-mute)", padding: 4, borderRadius: 6 }}
              >
                <Settings size={16} strokeWidth={1.8} />
              </button>
            </div>

            <input
              value={tripName}
              onChange={(e) => setTripName(e.target.value)}
              style={{
                fontWeight: 800,
                fontSize: 24,
                color: "var(--ink)",
                marginTop: 4,
                letterSpacing: -0.4,
                background: "transparent",
                border: "none",
                outline: "none",
                width: "100%",
                fontFamily: "var(--font-sans)",
                padding: 0,
              }}
            />

            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10.5,
                color: "var(--ink-mute)",
                letterSpacing: "0.8px",
                marginTop: 4,
                fontWeight: 600,
              }}
            >
              {totalNights} NIGHTS · {stops.length} PARKS
            </div>

            {/* Stat pills */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <Pill icon={Calendar}>{totalNights} nights</Pill>
              <Pill icon={MapPin}>{stops.length} parks</Pill>
              <Pill icon={Users}>Solo</Pill>
            </div>
          </div>

          {/* Itinerary list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px 18px" }}>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9.5,
                letterSpacing: "1.4px",
                color: "var(--ink-mute)",
                textTransform: "uppercase",
                fontWeight: 600,
                padding: "0 8px 8px",
              }}
            >
              ITINERARY · {stops.length} STOPS
            </div>

            {stops.length === 0 && !loading && (
              <div
                style={{
                  padding: "32px 8px",
                  textAlign: "center",
                  color: "var(--ink-mute)",
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
              >
                Add parks to your bucket list to start planning a trip.
              </div>
            )}

            {stops.map((stop, i) => (
              <StopCard
                key={stop.park_code}
                stop={stop}
                index={i}
                isLast={i === stops.length - 1}
                onRemove={() => setStops((prev) => prev.filter((_, j) => j !== i))}
              />
            ))}

            {/* Add stop */}
            <button
              style={{
                marginLeft: 32,
                marginTop: 4,
                padding: "8px 12px",
                background: "transparent",
                border: "1px dashed var(--hairline)",
                borderRadius: 10,
                cursor: "pointer",
                color: "var(--ink-mute)",
                fontFamily: "var(--font-sans)",
                fontWeight: 600,
                fontSize: 12,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Plus size={13} strokeWidth={2.2} /> Add a stop
            </button>
          </div>

          {/* Footer */}
          <div
            style={{
              padding: 14,
              borderTop: "0.5px solid var(--hairline-soft)",
              display: "flex",
              gap: 8,
              flexShrink: 0,
            }}
          >
            <DesktopButton>
              <Share2 size={13} strokeWidth={2} /> Share
            </DesktopButton>
            <button
              onClick={handleSave}
              style={{
                flex: 1,
                background: "var(--primary)",
                color: "#FFFBF1",
                border: "none",
                padding: "10px 14px",
                borderRadius: 10,
                cursor: "pointer",
                fontFamily: "var(--font-sans)",
                fontWeight: 700,
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                transition: "opacity 0.15s ease",
              }}
            >
              <Check size={14} strokeWidth={2.4} />
              {saved ? "Saved!" : "Save trip"}
            </button>
          </div>
        </div>

        {/* ── Right: Map ────────────────────────────────────────────── */}
        <div style={{ flex: 1, position: "relative", background: "#E8E2D0", overflow: "hidden" }}>
          {!loading && (
            <PlannerMap stops={stops} />
          )}

          {/* Top left chip: trip stats */}
          <div
            style={{
              position: "absolute",
              top: 16,
              left: 16,
              zIndex: 15,
              background: "rgba(255,251,241,0.94)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: "0.5px solid var(--hairline)",
              borderRadius: 10,
              padding: "8px 12px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "1.2px",
              color: "var(--ink-soft)",
              fontWeight: 600,
            }}
          >
            <span><strong style={{ color: "var(--ink)" }}>{totalNights}</strong> NIGHTS</span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span><strong style={{ color: "var(--ink)" }}>{stops.length}</strong> STOPS</span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span>BUCKET LIST ROUTE</span>
          </div>

          {/* Top right chip: date range */}
          <div
            style={{
              position: "absolute",
              top: 16,
              right: 16,
              zIndex: 15,
              background: "rgba(255,251,241,0.94)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: "0.5px solid var(--hairline)",
              borderRadius: 10,
              padding: "8px 12px",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Calendar size={14} strokeWidth={2} style={{ color: "var(--ink-mute)" }} />
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.6px",
                color: "var(--ink)",
                fontWeight: 600,
              }}
            >
              PLAN IN PROGRESS
            </div>
          </div>

          {/* Bottom right: weather panel */}
          <div
            style={{
              position: "absolute",
              right: 16,
              bottom: 16,
              zIndex: 15,
              background: "rgba(255,251,241,0.94)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: "0.5px solid var(--hairline)",
              borderRadius: 12,
              padding: 12,
              maxWidth: 360,
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "1.4px",
                color: "var(--ink-mute)",
                fontWeight: 600,
                marginBottom: 8,
              }}
            >
              WEATHER · 7-DAY OUTLOOK
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {MOCK_WEATHER.map((d, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    textAlign: "center",
                    padding: "6px 0",
                    background: "var(--surface-alt)",
                    borderRadius: 6,
                  }}
                >
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 8,
                      color: "var(--ink-mute)",
                      letterSpacing: "0.6px",
                      fontWeight: 600,
                    }}
                  >
                    {d.d}
                  </div>
                  <div style={{ fontSize: 14, marginTop: 1 }}>{d.c}</div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--ink)",
                      marginTop: 1,
                    }}
                  >
                    {d.t}°
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </DesktopShell>
  );
}
