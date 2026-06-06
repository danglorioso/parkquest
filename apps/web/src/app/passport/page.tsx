"use client";

import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Share2, PenLine, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { DesktopShell } from "@/components/desktop/DesktopShell";
import { DesktopHeader } from "@/components/desktop/DesktopHeader";
import { DesktopButton } from "@/components/desktop/DesktopButton";

// ── Types ─────────────────────────────────────────────────────────────────────

interface UserProfile {
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
}

interface VisitedPark {
  park_code: string;
  name: string;
  states: string;
  visited_date: string;
}

// ── Topo pattern ──────────────────────────────────────────────────────────────

function topoPattern(color: string, opacity: number = 0.05): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240' viewBox='0 0 240 240'><g fill='none' stroke='${color}' stroke-opacity='${opacity}' stroke-width='1'><path d='M-20 40 Q 30 20 80 40 T 180 40 T 280 40'/><path d='M-20 70 Q 30 50 80 70 T 180 70 T 280 70'/><path d='M-20 100 Q 30 80 80 100 T 180 100 T 280 100'/><path d='M-20 130 Q 30 110 80 130 T 180 130 T 280 130'/><path d='M-20 160 Q 30 140 80 160 T 180 160 T 280 160'/><path d='M-20 190 Q 30 170 80 190 T 180 190 T 280 190'/><path d='M-20 220 Q 30 200 80 220 T 180 220 T 280 220'/></g></svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

// ── Stamp colors ──────────────────────────────────────────────────────────────

const STAMP_COLORS = ["#5A2418", "#1F3D2E", "#2D4F66", "#3A2E5C", "#7B3A1F"];
function stampColor(idx: number): string {
  return STAMP_COLORS[idx % STAMP_COLORS.length];
}

// ── State abbreviation ────────────────────────────────────────────────────────

const STATE_ABBR: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA",
  Colorado: "CO", Connecticut: "CT", Delaware: "DE", Florida: "FL", Georgia: "GA",
  Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA",
  Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD",
  Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS",
  Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH",
  "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY", "North Carolina": "NC",
  "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA",
  "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD",
  Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT", Virginia: "VA",
  Washington: "WA", "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY",
};

function stateCode(states: string): string {
  const first = states.split(",")[0]?.trim() ?? states;
  if (first.length <= 3) return first.toUpperCase();
  return STATE_ABBR[first] ?? first.slice(0, 2).toUpperCase();
}

// ── PassportSeal ──────────────────────────────────────────────────────────────

function PassportSeal({ color, size = 64 }: { color: string; size?: number }) {
  const rays = Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2;
    return { x1: 50 + Math.cos(a) * 28, y1: 50 + Math.sin(a) * 28, x2: 50 + Math.cos(a) * 38, y2: 50 + Math.sin(a) * 38 };
  });
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ filter: "drop-shadow(0 1px 0 rgba(0,0,0,0.3))" }}>
      <circle cx="50" cy="50" r="46" fill="none" stroke={color} strokeWidth="1.2" />
      <circle cx="50" cy="50" r="42" fill="none" stroke={color} strokeWidth="0.6" />
      {rays.map((r, i) => (
        <line key={i} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} stroke={color} strokeWidth="0.5" opacity="0.5" />
      ))}
      <path d="M18 64 L 30 42 L 38 52 L 50 28 L 62 50 L 70 40 L 82 64 Z" fill={color} opacity="0.85" />
      <circle cx="32" cy="32" r="0.8" fill={color} />
      <circle cx="68" cy="30" r="0.8" fill={color} />
      <circle cx="50" cy="22" r="1" fill={color} />
      <rect x="22" y="64" width="56" height="1" fill={color} />
      <text x="50" y="74" fontSize="6" fontFamily="JetBrains Mono, monospace" fill={color} textAnchor="middle" letterSpacing="1.5">EST 1916</text>
    </svg>
  );
}

function MiniSeal({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22">
      <circle cx="11" cy="11" r="10" fill="none" stroke={color} strokeWidth="0.8" />
      <circle cx="11" cy="11" r="8" fill="none" stroke={color} strokeWidth="0.4" opacity="0.6" />
      <path d="M4 14 L 7 10 L 9 12 L 11.5 8 L 14 11 L 16 9 L 18 14 Z" fill={color} opacity="0.9" />
      <circle cx="11.5" cy="6.5" r="0.6" fill={color} />
    </svg>
  );
}

// ── CornerFlourish ────────────────────────────────────────────────────────────

type CornerPos = "tl" | "tr" | "bl" | "br";
const CORNER_POS: Record<CornerPos, React.CSSProperties> = {
  tl: { top: 8, left: 8, transform: "rotate(0deg)" },
  tr: { top: 8, right: 8, transform: "rotate(90deg)" },
  bl: { bottom: 8, left: 8, transform: "rotate(-90deg)" },
  br: { bottom: 8, right: 8, transform: "rotate(180deg)" },
};

function CornerFlourish({ color, pos }: { color: string; pos: CornerPos }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" style={{ position: "absolute", ...CORNER_POS[pos], opacity: 0.85 }}>
      <path d="M2 14 L 2 2 L 14 2" stroke={color} strokeWidth="0.9" fill="none" />
      <path d="M5 11 L 5 5 L 11 5" stroke={color} strokeWidth="0.7" fill="none" opacity="0.6" />
      <circle cx="2" cy="2" r="1.2" fill={color} />
    </svg>
  );
}

// ── Stamp ─────────────────────────────────────────────────────────────────────

function Stamp({ park, idx, visitedDate }: { park: VisitedPark; idx: number; visitedDate: string }) {
  const c = stampColor(idx);
  const size = 96;
  const id = park.park_code.replace(/[^a-zA-Z0-9]/g, "");
  const dateStr = new Date(visitedDate)
    .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    .toUpperCase();
  const sc = stateCode(park.states);

  // Truncate to fit arc (arc length ≈ 113 units at r=36); scale font for longer names
  const raw = park.name.toUpperCase();
  const shortName = raw.length > 18 ? raw.slice(0, 16) + "…" : raw;
  const nameFontSize = shortName.length > 16 ? 7 : shortName.length > 13 ? 7.5 : shortName.length > 10 ? 8 : 9;

  return (
    <div style={{ width: size, height: size, position: "relative", overflow: "visible" }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        overflow="visible"
        style={{ overflow: "visible" }}
      >
        <defs>
          {/* Wide filter region so overflowing arc text still gets the ink texture */}
          <filter id={`ink-${id}`} x="-50%" y="-50%" width="200%" height="200%">
            <feTurbulence baseFrequency="0.7" numOctaves="2" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.5" />
          </filter>
          <path id={`top-${id}`} d="M 14 50 A 36 36 0 0 1 86 50" fill="none" />
          <path id={`bot-${id}`} d="M 14 50 A 36 36 0 0 0 86 50" fill="none" />
        </defs>
        <g filter={`url(#ink-${id})`}>
          <circle cx="50" cy="50" r="44" fill="none" stroke={c} strokeWidth="2.2" opacity="0.85" />
          <circle cx="50" cy="50" r="38" fill="none" stroke={c} strokeWidth="0.8" opacity="0.7" />
          <text fill={c} fontFamily="Archivo, sans-serif" fontWeight="800" fontSize={nameFontSize} letterSpacing="1.5" opacity="0.9">
            <textPath href={`#top-${id}`} startOffset="50%" textAnchor="middle">
              {shortName}
            </textPath>
          </text>
          <text fill={c} fontFamily="JetBrains Mono, monospace" fontWeight="600" fontSize="6.5" letterSpacing="1.5" opacity="0.85">
            <textPath href={`#bot-${id}`} startOffset="50%" textAnchor="middle">
              ★ {sc} ★
            </textPath>
          </text>
          <path d="M30 60 L 42 44 L 50 52 L 60 38 L 70 60 Z" fill={c} opacity="0.85" />
          <circle cx="60" cy="34" r="2" fill={c} opacity="0.85" />
          <text x="50" y="76" fill={c} fontFamily="JetBrains Mono, monospace" fontWeight="700" fontSize="6.5" textAnchor="middle" letterSpacing="0.8" opacity="0.9">
            {dateStr}
          </text>
        </g>
      </svg>
    </div>
  );
}

function StampPlaceholder() {
  return (
    <div
      style={{
        width: 96,
        height: 96,
        borderRadius: "50%",
        border: "1.5px dashed var(--hairline)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--ink-mute)",
      }}
    >
      <Plus size={20} strokeWidth={2.0} />
    </div>
  );
}

// ── PassportCover ─────────────────────────────────────────────────────────────

function PassportCover() {
  const foil = "#D4A93F";
  const cover = "#152A20";

  return (
    <div
      style={{
        position: "relative",
        borderRadius: 14,
        overflow: "hidden",
        background: `radial-gradient(120% 100% at 50% 0%, #1F3D2E 0%, ${cover} 50%, #0D1D15 100%)`,
        padding: "20px 18px 18px",
        height: "100%",
        minHeight: 480,
        boxShadow: "0 10px 24px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.08)",
        border: "0.5px solid rgba(0,0,0,0.3)",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: topoPattern("#000", 0.18),
          backgroundSize: "160px 160px",
          opacity: 0.5,
          pointerEvents: "none",
        }}
      />
      {(["tl", "tr", "bl", "br"] as CornerPos[]).map((p) => (
        <CornerFlourish key={p} color={foil} pos={p} />
      ))}
      <div style={{ position: "relative", textAlign: "center", color: foil }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "2.5px", opacity: 0.9 }}>
          UNITED STATES OF AMERICA
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "2.5px", opacity: 0.7, marginTop: 2 }}>
          NATIONAL PARK SERVICE
        </div>
        <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
          <PassportSeal color={foil} size={64} />
        </div>
        <div style={{ fontWeight: 900, fontSize: 26, letterSpacing: "6px", marginTop: 16, textShadow: `0 1px 0 #8A5E18` }}>
          PARKQUEST
        </div>
        <div style={{ fontWeight: 700, fontSize: 13, letterSpacing: "4px", marginTop: 4, opacity: 0.85 }}>
          PASSPORT
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "2.5px", opacity: 0.6, marginTop: 18 }}>
          63 PARKS · 8 REGIONS · ONE QUEST
        </div>
      </div>
    </div>
  );
}

// ── PassportDataPage ──────────────────────────────────────────────────────────

function PassportDataPage({
  profile,
  visitedCount,
  bucketCount,
  badgeCount,
  totalBadges,
  passportNo,
  avatarUrl,
}: {
  profile: UserProfile | null;
  visitedCount: number;
  bucketCount: number;
  badgeCount: number;
  totalBadges: number;
  passportNo: string;
  avatarUrl: string | null;
}) {
  const paperBg = "#FAF3E0";
  const paperInk = "#3A2E1C";
  const paperMute = "rgba(58,46,28,0.55)";
  const paperFaint = "rgba(58,46,28,0.22)";
  const foil = "#A87E2C";
  const name = profile?.display_name ?? profile?.username ?? "Explorer";

  return (
    <div
      style={{
        background: paperBg,
        borderRadius: 18,
        border: "0.5px solid var(--hairline)",
        padding: "14px 18px 18px",
        position: "relative",
        overflow: "hidden",
        height: "100%",
        minHeight: 480,
        boxShadow: "0 8px 22px rgba(58,42,18,0.10), inset 0 0 60px rgba(160,120,40,0.07)",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: topoPattern("#1F3D2E", 0.07),
          backgroundSize: "260px 260px",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingBottom: 10,
          borderBottom: `0.5px dashed ${paperFaint}`,
          color: foil,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <MiniSeal color={foil} />
          <div>
            <div style={{ fontWeight: 900, fontSize: 11, letterSpacing: "2.8px", color: foil }}>PARKQUEST</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "1.6px", opacity: 0.75, marginTop: 1, color: foil }}>
              NATIONAL PARK PASSPORT
            </div>
          </div>
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "1.4px", opacity: 0.8, color: foil }}>
          NO · {passportNo}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          top: 80,
          right: -28,
          transform: "rotate(-14deg)",
          border: "2.5px solid var(--primary)",
          color: "var(--primary)",
          padding: "6px 30px",
          fontFamily: "var(--font-mono)",
          fontWeight: 800,
          fontSize: 13,
          letterSpacing: "3px",
          opacity: 0.16,
          borderRadius: 3,
          pointerEvents: "none",
        }}
      >
        VERIFIED
      </div>

      <div style={{ position: "relative", display: "flex", gap: 16, marginTop: 16, alignItems: "flex-start" }}>
        <div
          style={{
            width: 108,
            height: 130,
            position: "relative",
            flexShrink: 0,
            background: "var(--surface-alt)",
            border: `0.5px solid ${paperMute}`,
            padding: 5,
            overflow: "hidden",
          }}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                background: "var(--primary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#FFFBF1",
                fontWeight: 900,
                fontSize: 44,
                letterSpacing: "0.5px",
              }}
            >
              {name.slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8.5, letterSpacing: "1.6px", color: paperMute, textTransform: "uppercase" }}>
            BEARER
          </div>
          <div style={{ fontWeight: 900, fontSize: 26, color: paperInk, marginTop: 4, letterSpacing: -0.6, lineHeight: 1.05 }}>
            {name}
          </div>
          {profile?.username && (
            <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 11, color: paperInk, letterSpacing: "0.6px", marginTop: 6 }}>
              @{profile.username}
            </div>
          )}
          {profile?.bio && (
            <div style={{ fontSize: 13, color: paperInk, lineHeight: 1.45, fontStyle: "italic", opacity: 0.85, marginTop: 10 }}>
              &ldquo;{profile.bio}&rdquo;
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          marginTop: 26,
          padding: "14px 0 12px",
          borderTop: `0.5px dashed ${paperFaint}`,
          borderBottom: `0.5px dashed ${paperFaint}`,
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          position: "relative",
        }}
      >
        <div style={{ padding: "0 10px" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8.5, letterSpacing: "1.5px", color: paperMute, textTransform: "uppercase" }}>VISITED</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 4 }}>
            <div style={{ fontWeight: 900, fontSize: 28, color: paperInk, letterSpacing: -1, lineHeight: 1 }}>{visitedCount}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: paperMute, fontWeight: 600 }}>/63</div>
          </div>
        </div>
        <div style={{ padding: "0 10px", borderLeft: `0.5px dashed ${paperMute}`, borderRight: `0.5px dashed ${paperMute}` }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8.5, letterSpacing: "1.5px", color: paperMute, textTransform: "uppercase" }}>BUCKET</div>
          <div style={{ fontWeight: 900, fontSize: 28, color: paperInk, letterSpacing: -1, lineHeight: 1, marginTop: 4 }}>{bucketCount}</div>
        </div>
        <div style={{ padding: "0 10px" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8.5, letterSpacing: "1.5px", color: paperMute, textTransform: "uppercase" }}>BADGES</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 4 }}>
            <div style={{ fontWeight: 900, fontSize: 28, color: paperInk, letterSpacing: -1, lineHeight: 1 }}>{badgeCount}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: paperMute, fontWeight: 600 }}>/{totalBadges}</div>
          </div>
        </div>
      </div>

      <div style={{ position: "relative", marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        {[
          { label: "NATIONALITY", value: "U.S." },
          { label: "ISSUED", value: new Date().toLocaleDateString("en-US", { month: "short", year: "numeric" }).toUpperCase() },
          { label: "CODE", value: "USA · NPS" },
        ].map(({ label, value }) => (
          <div key={label}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "1.5px", color: paperMute, textTransform: "uppercase" }}>
              {label}
            </div>
            <div style={{ fontWeight: 700, fontSize: 12, color: paperInk, marginTop: 2, letterSpacing: "0.2px" }}>{value}</div>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 14,
          padding: "10px 0 2px",
          borderTop: `0.5px dashed ${paperFaint}`,
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          letterSpacing: "1.2px",
          color: paperMute,
          lineHeight: 1.5,
          wordBreak: "break-all",
          position: "relative",
        }}
      >
        {"P<USA"}
        {(name.split(" ")[1] ?? "EXPLORER").toUpperCase()}
        {"<<"}
        {(name.split(" ")[0] ?? "").toUpperCase()}
        {"<<"}
        {passportNo}
        {"USA"}
        {visitedCount.toString().padStart(2, "0")}
        {"63"}
        {badgeCount.toString().padStart(2, "0")}
        {"<<<<"}
      </div>
    </div>
  );
}

// ── PassportStampsPage ────────────────────────────────────────────────────────

function PassportStampsPage({
  visitedParks,
  pageNum,
  onOpenPark,
}: {
  visitedParks: VisitedPark[];
  pageNum: number;
  onOpenPark: (code: string) => void;
}) {
  const paperBg = "#FAF3E0";
  const paperInk = "#3A2E1C";
  const paperMute = "rgba(58,46,28,0.55)";
  const paperFaint = "rgba(58,46,28,0.22)";
  const placeholders = Math.max(0, 9 - visitedParks.length);

  return (
    <div
      style={{
        borderRadius: 14,
        border: "0.5px solid var(--hairline)",
        padding: "14px 18px 18px",
        position: "relative",
        // overflow visible so stamp arc text doesn't get clipped by the page edge
        overflow: "visible",
        height: "100%",
        minHeight: 480,
      }}
    >
      {/* Background layers positioned absolutely so they respect border-radius */}
      <div style={{ position: "absolute", inset: 0, background: paperBg, borderRadius: 14, zIndex: 0, boxShadow: "0 8px 22px rgba(58,42,18,0.10), inset 0 0 60px rgba(160,120,40,0.07)" }} />
      <div style={{ position: "absolute", inset: 0, backgroundImage: topoPattern("#1F3D2E", 0.07), backgroundSize: "260px 260px", borderRadius: 14, zIndex: 0, pointerEvents: "none" }} />

      <div style={{ position: "relative", zIndex: 1 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingBottom: 10,
            borderBottom: `0.5px dashed ${paperFaint}`,
          }}
        >
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "1.6px", color: paperMute, fontWeight: 600 }}>
            STAMPS · {pageNum}
          </div>
          <div style={{ fontWeight: 800, fontSize: 12, color: paperInk, letterSpacing: "0.4px" }}>
            VISITED · {visitedParks.length}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "1.6px", color: paperMute, fontWeight: 600 }}>
            2024 — 2026
          </div>
        </div>

        {/* Extra top padding gives headroom for stamp arc text overflowing above the stamp div */}
        <div
          style={{
            marginTop: 8,
            paddingTop: 16,
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "18px 8px",
            justifyItems: "center",
          }}
        >
          {visitedParks.map((park, i) => (
            <button
              key={park.park_code}
              onClick={() => onOpenPark(park.park_code)}
              style={{
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
                transform: `rotate(${((i * 37) % 16) - 8}deg)`,
                overflow: "visible",
              }}
            >
              <Stamp park={park} idx={i} visitedDate={park.visited_date} />
            </button>
          ))}
          {Array.from({ length: placeholders }).map((_, i) => (
            <div key={`ph-${i}`} style={{ opacity: 0.25 }}>
              <StampPlaceholder />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── EmptyPage ─────────────────────────────────────────────────────────────────

function EmptyPage() {
  return (
    <div
      style={{
        background: "#FAF3E0",
        borderRadius: 14,
        border: "0.5px solid var(--hairline)",
        height: "100%",
        minHeight: 480,
        backgroundImage: topoPattern("#1F3D2E", 0.05),
        backgroundSize: "260px 260px",
      }}
    />
  );
}

// ── Book CSS ──────────────────────────────────────────────────────────────────

const BOOK_CSS = `
  @keyframes bookClose {
    from { transform: perspective(1400px) rotateY(-8deg) translateX(8%); }
    to   { transform: none; }
  }
  @keyframes bookOpen {
    from { transform: perspective(1400px) rotateY(-18deg) translateX(12%); }
    to   { transform: none; }
  }
  @keyframes spreadNext {
    from { transform: perspective(1400px) rotateY(10deg) translateX(18px); }
    to   { transform: none; }
  }
  @keyframes spreadPrev {
    from { transform: perspective(1400px) rotateY(-10deg) translateX(-18px); }
    to   { transform: none; }
  }
  .passport-arrow {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    border-radius: 50%;
    background: var(--surface-alt);
    border: 0.5px solid var(--hairline);
    cursor: pointer;
    color: var(--ink-mute);
    transition: background 0.15s, color 0.15s, transform 0.15s;
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    z-index: 10;
  }
  .passport-arrow:hover {
    background: var(--surface);
    color: var(--ink);
    transform: translateY(-50%) scale(1.08);
  }
  .passport-arrow-left  { left:  -19px; }
  .passport-arrow-right { right: -19px; }
`;

const STAMPS_PER_PAGE = 9;

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PassportPage() {
  const { isLoaded, isSignedIn, user } = useUser();
  const router = useRouter();

  const [profile, setProfile]           = useState<UserProfile | null>(null);
  const [visitedParks, setVisitedParks] = useState<VisitedPark[]>([]);
  const [bucketCount, setBucketCount]   = useState(0);
  const [badgeCount, setBadgeCount]     = useState(0);
  const [totalBadges, setTotalBadges]   = useState(0);
  const [loading, setLoading]           = useState(true);

  const [spread, setSpread]     = useState(0); // 0 = cover closed, 1..N = open spreads
  const [animType, setAnimType] = useState<"initial" | "open" | "next" | "prev">("initial");
  const [animKey, setAnimKey]   = useState(0);
  const hasAutoOpened           = useRef(false);

  useEffect(() => {
    if (isLoaded && !isSignedIn) router.push("/");
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    if (!isSignedIn) return;

    Promise.all([
      fetch("/api/profile").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/visits").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/parks").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/badges").then((r) => (r.ok ? r.json() : { badges: [] })),
    ])
      .then(([prof, visits, parks, { badges }]) => {
        setProfile(prof);

        type V = { park_code: string; is_bucket_list: boolean; visited_date: string | null };
        type P = { park_code: string; name: string; states: string };

        const visitedSet = new Map<string, string>();
        (visits as V[]).forEach((v) => {
          if (!v.is_bucket_list && v.visited_date) visitedSet.set(v.park_code, v.visited_date);
        });
        setBucketCount((visits as V[]).filter((v) => v.is_bucket_list).length);

        const parkMap = new Map<string, P>((parks as P[]).map((p) => [p.park_code, p]));

        const vParks: VisitedPark[] = Array.from(visitedSet.entries())
          .map(([code, date]) => {
            const p = parkMap.get(code);
            if (!p) return null;
            return { park_code: code, name: p.name, states: p.states, visited_date: date };
          })
          .filter(Boolean) as VisitedPark[];

        // Most recent first
        vParks.sort((a, b) => new Date(b.visited_date).getTime() - new Date(a.visited_date).getTime());
        setVisitedParks(vParks);

        const badgesArr = badges as Array<{ earned: boolean }>;
        setBadgeCount(badgesArr.filter((b) => b.earned).length);
        setTotalBadges(badgesArr.length);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [isSignedIn]);

  // Auto-open to first spread after data loads
  useEffect(() => {
    if (!loading && !hasAutoOpened.current) {
      hasAutoOpened.current = true;
      const t = setTimeout(() => {
        setAnimType("open");
        setSpread(1);
        setAnimKey(1);
      }, 700);
      return () => clearTimeout(t);
    }
  }, [loading]);

  const stampPageCount  = Math.max(1, Math.ceil(visitedParks.length / STAMPS_PER_PAGE));
  const totalInnerPages = 1 + stampPageCount; // 1 profile page + N stamp pages
  const maxSpread       = Math.ceil(totalInnerPages / 2);

  const passportNo =
    "PQ" +
    (((profile?.username?.length ?? 4) * 73291 + 41023) % 9999999)
      .toString()
      .padStart(7, "0");

  const avatarUrl = user?.imageUrl ?? profile?.avatar_url ?? null;

  function goNext() {
    if (spread >= maxSpread) return;
    setAnimType(spread === 0 ? "open" : "next");
    setSpread((s) => s + 1);
    setAnimKey((k) => k + 1);
  }

  function goPrev() {
    if (spread <= 0) return;
    setAnimType("prev");
    setSpread((s) => s - 1);
    setAnimKey((k) => k + 1);
  }

  function goToSpread(s: number) {
    if (s === spread) return;
    setAnimType(s > spread ? (spread === 0 ? "open" : "next") : "prev");
    setSpread(s);
    setAnimKey((k) => k + 1);
  }

  function getPageContent(pageIdx: number) {
    if (pageIdx >= totalInnerPages) return <EmptyPage />;
    if (pageIdx === 0) {
      return (
        <PassportDataPage
          profile={profile}
          visitedCount={visitedParks.length}
          bucketCount={bucketCount}
          badgeCount={badgeCount}
          totalBadges={totalBadges}
          passportNo={passportNo}
          avatarUrl={avatarUrl}
        />
      );
    }
    const stampPageIdx = pageIdx - 1;
    const pageParks = visitedParks.slice(
      stampPageIdx * STAMPS_PER_PAGE,
      (stampPageIdx + 1) * STAMPS_PER_PAGE
    );
    return (
      <PassportStampsPage
        visitedParks={pageParks}
        pageNum={stampPageIdx + 1}
        onOpenPark={(code) => router.push(`/parks/${code}`)}
      />
    );
  }

  const spreadAnim =
    animType === "open" ? "bookOpen 0.55s ease"
    : animType === "next" ? "spreadNext 0.4s ease"
    : animType === "prev" ? "spreadPrev 0.4s ease"
    : undefined;

  return (
    <DesktopShell>
      <style>{BOOK_CSS}</style>
      <div style={{ height: "100%", overflowY: "auto" }}>
        <DesktopHeader
          kicker="OFFICIAL ISSUE · NATIONAL PARK PASSPORT"
          title="Your passport"
          sub="Flip through every park you've visited."
          actions={
            <>
              <DesktopButton size="sm">
                <Share2 size={13} strokeWidth={2} /> Share
              </DesktopButton>
              <DesktopButton size="sm">
                <PenLine size={13} strokeWidth={2} /> Edit
              </DesktopButton>
              <DesktopButton size="sm" primary>
                <Plus size={13} strokeWidth={2.4} /> New stamp
              </DesktopButton>
            </>
          }
        />

        <div style={{ padding: "20px 32px 40px" }}>
          <div style={{ maxWidth: 1020, margin: "0 auto", position: "relative" }}>

            {spread === 0 ? (
              /* ── Closed book ── */
              <div
                style={{ maxWidth: 380, margin: "0 auto", position: "relative", animation: animType === "prev" ? "bookClose 0.45s ease" : undefined }}
              >
                {/* Stacked shadow edges simulate closed-book page thickness */}
                <div style={{ position: "absolute", top: 6, right: -6, bottom: -6, left: 6, background: "#121f16", borderRadius: 14, zIndex: -2 }} />
                <div style={{ position: "absolute", top: 3, right: -3, bottom: -3, left: 3, background: "#1a2d1f", borderRadius: 14, zIndex: -1 }} />
                <div onClick={goNext} style={{ cursor: "pointer" }}>
                  <PassportCover />
                </div>
                <div style={{ textAlign: "center", marginTop: 24 }}>
                  <button
                    onClick={goNext}
                    style={{
                      background: "var(--primary)",
                      color: "#fff",
                      border: "none",
                      borderRadius: 8,
                      padding: "10px 24px",
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      letterSpacing: "2px",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    OPEN PASSPORT <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            ) : (
              /* ── Open book ── */
              <>
                {/* Arrow wrapper keeps arrows positioned relative to the book spread only */}
                <div style={{ position: "relative" }}>
                  <button className="passport-arrow passport-arrow-left" onClick={goPrev} aria-label="Previous page">
                    <ChevronLeft size={20} />
                  </button>

                  <div
                    key={animKey}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 0,
                      background: "rgba(58,42,18,0.08)",
                      padding: 14,
                      borderRadius: 18,
                      boxShadow: "0 24px 60px rgba(0,0,0,0.18)",
                      animation: spreadAnim,
                      position: "relative",
                    }}
                  >
                    {/* Spine shadow */}
                    <div
                      style={{
                        position: "absolute",
                        left: "50%",
                        top: 14,
                        bottom: 14,
                        width: 1,
                        background: "rgba(0,0,0,0.22)",
                        pointerEvents: "none",
                        zIndex: 2,
                        boxShadow: "2px 0 8px rgba(0,0,0,0.14), -1px 0 4px rgba(0,0,0,0.08)",
                      }}
                    />

                    <div style={{ paddingRight: 7 }}>
                      {getPageContent((spread - 1) * 2)}
                    </div>
                    <div style={{ paddingLeft: 7 }}>
                      {getPageContent((spread - 1) * 2 + 1)}
                    </div>
                  </div>

                  {spread < maxSpread && (
                    <button className="passport-arrow passport-arrow-right" onClick={goNext} aria-label="Next page">
                      <ChevronRight size={20} />
                    </button>
                  )}
                </div>

                {/* Spread indicator dots */}
                {maxSpread > 1 && (
                  <div style={{ display: "flex", gap: 7, justifyContent: "center", marginTop: 20 }}>
                    {Array.from({ length: maxSpread }, (_, i) => (
                      <button
                        key={i}
                        onClick={() => goToSpread(i + 1)}
                        aria-label={`Go to spread ${i + 1}`}
                        style={{
                          width: spread === i + 1 ? 20 : 8,
                          height: 8,
                          borderRadius: 4,
                          background: spread === i + 1 ? "var(--primary)" : "var(--hairline)",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                          transition: "width 0.2s, background 0.2s",
                        }}
                      />
                    ))}
                  </div>
                )}
              </>
            )}

            {!loading && visitedParks.length === 0 && spread > 0 && (
              <div style={{ marginTop: 24, textAlign: "center", color: "var(--ink-mute)", fontSize: 14, padding: "20px 0" }}>
                Log your first visit to earn a passport stamp.{" "}
                <Link href="/map" style={{ color: "var(--primary)", fontWeight: 700 }}>
                  Open the map →
                </Link>
              </div>
            )}

            {/* ── All stamps ── */}
            {visitedParks.length > 0 && (
              <div style={{ marginTop: 32 }}>
                <div style={{ marginBottom: 14 }}>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 9.5,
                      letterSpacing: "1.6px",
                      color: "var(--ink-mute)",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      marginBottom: 3,
                    }}
                  >
                    {visitedParks.length} STAMPS · MOST RECENT FIRST
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 20, color: "var(--ink)", letterSpacing: -0.3 }}>
                    Every stamp in your book
                  </div>
                </div>

                <div
                  style={{
                    background: "#FAF3E0",
                    border: "0.5px solid var(--hairline)",
                    borderRadius: 14,
                    padding: "24px 20px",
                    position: "relative",
                    overflow: "hidden",
                    display: "grid",
                    gridTemplateColumns: "repeat(8, 1fr)",
                    gap: "24px 16px",
                    justifyItems: "center",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      backgroundImage: topoPattern("#1F3D2E", 0.06),
                      backgroundSize: "260px 260px",
                      pointerEvents: "none",
                    }}
                  />
                  {visitedParks.map((park, i) => (
                    <button
                      key={park.park_code}
                      onClick={() => router.push(`/parks/${park.park_code}`)}
                      style={{
                        background: "transparent",
                        border: "none",
                        padding: 0,
                        cursor: "pointer",
                        transform: `rotate(${((i * 37) % 14) - 7}deg)`,
                        position: "relative",
                      }}
                    >
                      <Stamp park={park} idx={i} visitedDate={park.visited_date} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </DesktopShell>
  );
}
