"use client";

import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import React, { use, useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import Image from "next/image";
import {
  ChevronLeft, ChevronRight, PenLine, MapPin, Plus, ExternalLink, Phone, Mail, Clock, DollarSign, Navigation, Cloud, Tag, Footprints,
} from "lucide-react";
import { LightboxModal, type LightboxImage } from "@/components/LightboxModal";
import { DesktopShell } from "@/components/desktop/DesktopShell";
import { DesktopButton } from "@/components/desktop/DesktopButton";
import { LogVisitModal, type VisitDraft } from "@/components/LogVisitModal";
import type { NpsData } from "@/app/api/parks/[park_code]/nps/route";
import type { WeatherForecast } from "@/app/api/parks/[park_code]/weather/route";

const ParkMap = dynamic(() => import("@/components/Map"), { ssr: false, loading: () => <div style={{ height: "100%", background: "var(--surface-alt)" }} /> });

// ── Types ─────────────────────────────────────────────────────────────────────

interface ParkData {
  park_code: string;
  name: string;
  states: string;
  description: string | null;
  latitude: string | null;
  longitude: string | null;
}

interface VisitData {
  park_code: string;
  visited_date: string | null;
  is_bucket_list: boolean;
  title: string | null;
  notes: string | null;
  photos: string[] | null;
  visibility: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const GRADIENTS = [
  ["#1F3D2E", "#2F7A4A", "#C56B3D"],
  ["#2D4F66", "#1F3D2E", "#D89A3A"],
  ["#7B3A1F", "#C56B3D", "#1F3D2E"],
  ["#3A2E5C", "#6E97A3", "#D89A3A"],
  ["#2F7A4A", "#1F3D2E", "#2D4F66"],
];

function parkGradient(code: string): string {
  const idx = code.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % GRADIENTS.length;
  const [a, b, c] = GRADIENTS[idx];
  return `linear-gradient(160deg, ${a} 0%, ${b} 55%, ${c} 130%)`;
}

// ── Topo pattern (wavy lines overlay) ────────────────────────────────────────

function topoPattern(color: string, opacity: number): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='420' height='420' viewBox='0 0 420 420'><g fill='none' stroke='${color}' stroke-opacity='${opacity}' stroke-width='1'><path d='M-20 60 Q 60 30 130 60 T 280 60 T 440 60'/><path d='M-20 110 Q 60 80 130 110 T 280 110 T 440 110'/><path d='M-20 160 Q 60 130 130 160 T 280 160 T 440 160'/><path d='M-20 210 Q 60 180 130 210 T 280 210 T 440 210'/><path d='M-20 260 Q 60 230 130 260 T 280 260 T 440 260'/><path d='M-20 310 Q 60 280 130 310 T 280 310 T 440 310'/><path d='M-20 360 Q 60 330 130 360 T 280 360 T 440 360'/><path d='M-20 410 Q 60 380 130 410 T 280 410 T 440 410'/></g></svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

// ── State name lookup ─────────────────────────────────────────────────────────

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  DC: "Washington D.C.", AS: "American Samoa", GU: "Guam", MP: "Northern Mariana Islands",
  PR: "Puerto Rico", VI: "U.S. Virgin Islands",
};

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Bone({ w, h, r = 8, mb = 0 }: { w?: string | number; h: number; r?: number; mb?: number }) {
  return (
    <div
      style={{
        width: w ?? "100%",
        height: h,
        borderRadius: r,
        background: "var(--surface-alt)",
        flexShrink: 0,
        marginBottom: mb || undefined,
        animation: "pqSkeleton 1.4s ease-in-out infinite",
      }}
    />
  );
}

function ParkPageSkeleton() {
  return (
    <DesktopShell fullbleed>
      <style>{`
        @keyframes pqSkeleton {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.45; }
        }
      `}</style>
      <div style={{ display: "flex", height: "100%" }}>

        {/* ── Left column ── */}
        <div style={{ flex: 1, minWidth: 0, overflowY: "auto", background: "var(--bg)" }}>

          {/* Breadcrumb */}
          <div style={{ padding: "18px 32px 0", display: "flex", alignItems: "center", gap: 8 }}>
            <Bone w={60} h={14} r={6} />
            <Bone w={120} h={14} r={6} />
          </div>

          {/* Hero */}
          <div style={{ padding: "14px 32px 0" }}>
            <div style={{ borderRadius: 14, overflow: "hidden", height: 360 }}>
              <Bone h={360} r={14} />
            </div>
          </div>

          {/* Photo strip */}
          <div style={{ padding: "14px 32px 0", display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
            {[0,1,2,3].map((i) => <Bone key={i} h={120} r={10} />)}
          </div>

          {/* About */}
          <div style={{ padding: "24px 32px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
            <Bone w={60} h={10} r={4} mb={2} />
            <Bone h={14} r={4} />
            <Bone h={14} r={4} />
            <Bone w="72%" h={14} r={4} />
          </div>

          {/* Quick stats */}
          <div style={{ padding: "0 32px 24px" }}>
            <div style={{ background: "var(--surface)", border: "0.5px solid var(--hairline)", borderRadius: 12, padding: "18px 0", display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, paddingLeft: 16, paddingRight: 16 }}>
              {[0,1,2,3].map((i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <Bone w={40} h={9} r={4} />
                  <Bone w={56} h={22} r={5} />
                </div>
              ))}
            </div>
          </div>

          {/* Activities */}
          <div style={{ padding: "0 32px 24px" }}>
            <Bone w={80} h={10} r={4} mb={10} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[90, 70, 110, 80, 95, 65].map((w, i) => <Bone key={i} w={w} h={28} r={100} />)}
            </div>
          </div>

          {/* Map */}
          <div style={{ padding: "0 32px 24px" }}>
            <Bone w={50} h={10} r={4} mb={10} />
            <Bone h={260} r={12} />
          </div>

          {/* Hours */}
          <div style={{ padding: "0 32px 24px" }}>
            <Bone w={70} h={10} r={4} mb={10} />
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[0,1,2,3,4,5,6].map((i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between" }}>
                  <Bone w={80} h={13} r={4} />
                  <Bone w={120} h={13} r={4} />
                </div>
              ))}
            </div>
          </div>

          {/* Weather */}
          <div style={{ padding: "0 32px 40px" }}>
            <Bone w={90} h={10} r={4} mb={12} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 8 }}>
              {[0,1,2,3,4,5,6].map((i) => <Bone key={i} h={90} r={10} />)}
            </div>
          </div>
        </div>

        {/* ── Journal column ── */}
        <div style={{ width: 420, flexShrink: 0, borderLeft: "0.5px solid var(--hairline)", background: "#FAF3E0", padding: "18px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 14, borderBottom: "0.5px dashed rgba(58,46,28,0.22)" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <Bone w={60} h={9} r={4} />
              <Bone w={120} h={22} r={6} />
            </div>
            <Bone w={88} h={32} r={8} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 12 }}>
              <Bone w={44} h={44} r={8} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                <Bone w="60%" h={13} r={4} />
                <Bone h={11} r={4} />
                <Bone w="80%" h={11} r={4} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[100, 80, 120, 90].map((w, i) => <Bone key={i} w={w} h={80} r={8} />)}
            </div>
            <Bone h={13} r={4} />
            <Bone w="70%" h={13} r={4} />
          </div>
        </div>

      </div>
    </DesktopShell>
  );
}

// ── Weather emoji ─────────────────────────────────────────────────────────────

function weatherEmoji(shortForecast: string): string {
  const f = shortForecast.toLowerCase();
  if (f.includes("thunder") || f.includes("storm"))       return "⛈️";
  if (f.includes("tornado"))                              return "🌪️";
  if (f.includes("blizzard"))                             return "🌨️";
  if (f.includes("snow") && f.includes("rain"))           return "🌨️";
  if (f.includes("freezing"))                             return "🧊";
  if (f.includes("sleet") || f.includes("wintry"))        return "🌨️";
  if (f.includes("heavy snow") || f.includes("blowing snow")) return "❄️";
  if (f.includes("snow"))                                 return "❄️";
  if (f.includes("heavy rain") || f.includes("showers"))  return "🌧️";
  if (f.includes("rain") || f.includes("drizzle"))        return "🌦️";
  if (f.includes("fog") || f.includes("haze") || f.includes("smoke")) return "🌫️";
  if (f.includes("windy") || f.includes("breezy"))        return "🌬️";
  if (f.includes("partly cloudy") || f.includes("partly sunny") || f.includes("mix")) return "⛅";
  if (f.includes("mostly cloudy") || f.includes("increasing clouds")) return "🌥️";
  if (f.includes("cloud") || f.includes("overcast"))      return "☁️";
  if (f.includes("sunny") || f.includes("clear"))         return "☀️";
  if (f.includes("hot"))                                  return "🌡️";
  return "🌤️";
}

// ── SectionLabel ──────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        letterSpacing: "1.6px",
        color: "var(--ink-mute)",
        textTransform: "uppercase",
        marginBottom: 10,
        fontWeight: 600,
      }}
    >
      {children}
    </div>
  );
}

// ── InfoChip ──────────────────────────────────────────────────────────────────

function InfoChip({ children, muted, href }: { children: React.ReactNode; muted?: boolean; href?: string }) {
  const style: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 10px",
    borderRadius: 100,
    background: muted ? "var(--surface-alt)" : "var(--surface)",
    border: "0.5px solid var(--hairline)",
    fontSize: 11.5,
    fontWeight: 500,
    color: muted ? "var(--ink-soft)" : "var(--ink)",
    textDecoration: "none",
    cursor: href ? "pointer" : "default",
    transition: href ? "background 0.12s ease, border-color 0.12s ease" : undefined,
  };
  if (href) {
    return <Link href={href} style={style}>{children}</Link>;
  }
  return <span style={style}>{children}</span>;
}

// ── StatTile ──────────────────────────────────────────────────────────────────

function StatTile({ label, value, unit, border, sm }: { label: string; value: string; unit?: string; border?: boolean; sm?: boolean }) {
  return (
    <div
      style={{
        padding: "0 14px",
        textAlign: "center",
        borderLeft: border ? "0.5px solid var(--hairline-soft)" : "none",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          letterSpacing: "1.4px",
          color: "var(--ink-mute)",
          fontWeight: 600,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontWeight: 900,
          fontSize: sm ? 13 : 22,
          color: "var(--ink)",
          marginTop: 4,
          letterSpacing: sm ? 0 : -0.5,
          lineHeight: 1.2,
        }}
      >
        {value}
        {unit && (
          <span style={{ fontSize: 11, color: "var(--ink-mute)", fontWeight: 500, marginLeft: 3 }}>
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}


// ── JournalColumn ─────────────────────────────────────────────────────────────

function JournalColumn({
  allVisits,
  onEdit,
  onAdd,
  collapsed,
  onToggle,
  onImageClick,
}: {
  allVisits: VisitData[];
  onEdit: (visit: VisitData) => void;
  onAdd: () => void;
  collapsed: boolean;
  onToggle: () => void;
  onImageClick: (images: LightboxImage[], index: number) => void;
}) {
  const paperBg = "#FAF3E0";
  const inkPaper = "#3A2E1C";
  const hairlinePaper = "rgba(58,46,28,0.22)";

  const latestVisit = allVisits
    .filter((v) => !v.is_bucket_list && v.visited_date)
    .sort((a, b) => new Date(b.visited_date!).getTime() - new Date(a.visited_date!).getTime())[0] ?? null;

  const earlierVisits = allVisits
    .filter((v) => !v.is_bucket_list && v.visited_date && v !== latestVisit)
    .sort((a, b) => new Date(b.visited_date!).getTime() - new Date(a.visited_date!).getTime());

  const entryCount = allVisits.filter((v) => !v.is_bucket_list && v.visited_date).length;

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return {
      month: d.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
      day: d.getDate().toString(),
      full: d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
    };
  };

  if (collapsed) {
    return (
      <div
        style={{
          width: 48,
          flexShrink: 0,
          borderLeft: "0.5px solid var(--hairline)",
          background: paperBg,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: 14,
          gap: 14,
          transition: "width 0.2s ease",
          position: "relative",
        }}
      >
        <button
          onClick={onToggle}
          title="Open journal"
          style={{
            width: 32, height: 32, borderRadius: "50%",
            background: "rgba(58,46,28,0.08)", border: "0.5px solid rgba(58,46,28,0.15)",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            color: inkPaper, flexShrink: 0,
          }}
        >
          <ChevronLeft size={16} />
        </button>
        {entryCount > 0 && (
          <div
            style={{
              width: 26, height: 26, borderRadius: "50%",
              background: "var(--primary)", color: "#FFFBF1",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700, flexShrink: 0,
            }}
          >
            {entryCount}
          </div>
        )}
        <div
          style={{
            writingMode: "vertical-rl",
            textOrientation: "mixed",
            transform: "rotate(180deg)",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: "1.6px",
            color: "rgba(58,46,28,0.4)",
            textTransform: "uppercase",
            fontWeight: 600,
            marginTop: 4,
            userSelect: "none",
          }}
        >
          Journal
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        width: 420,
        flexShrink: 0,
        borderLeft: "0.5px solid var(--hairline)",
        background: paperBg,
        display: "flex",
        flexDirection: "column",
        overflow: "visible",
        transition: "width 0.2s ease",
        position: "relative",
      }}
    >
      {/* Collapse toggle — centered on left border */}
      <button
        onClick={onToggle}
        title="Collapse journal"
        style={{
          position: "absolute",
          left: -16,
          top: "50%",
          transform: "translateY(-50%)",
          width: 32, height: 32, borderRadius: "50%",
          background: paperBg,
          border: "0.5px solid var(--hairline)",
          cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: inkPaper,
          zIndex: 10,
          boxShadow: "0 1px 4px rgba(0,0,0,0.10)",
        }}
      >
        <ChevronRight size={14} />
      </button>

      {/* Journal header */}
      <div
        style={{
          padding: "18px 22px 14px",
          borderBottom: `0.5px dashed ${hairlinePaper}`,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9.5,
                letterSpacing: "1.6px",
                color: "var(--ink-mute)",
                textTransform: "uppercase",
                fontWeight: 600,
              }}
            >
              JOURNAL
            </div>
            <div
              style={{
                fontWeight: 800,
                fontSize: 22,
                color: inkPaper,
                letterSpacing: -0.3,
                marginTop: 2,
              }}
            >
              Your entries
            </div>
          </div>
          <DesktopButton size="sm" primary onClick={onAdd}>
            <Plus size={13} strokeWidth={2.4} /> Log visit
          </DesktopButton>
        </div>
      </div>

      {/* Journal body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 22px 24px", position: "relative" }}>
        {latestVisit ? (
          <div>
            {/* Date header */}
            {(() => {
              const d = formatDate(latestVisit.visited_date!);
              return (
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                  <div
                    style={{
                      width: 56,
                      padding: "6px 0",
                      textAlign: "center",
                      background: "var(--primary)",
                      color: "#FFFBF1",
                      borderRadius: 8,
                      fontWeight: 800,
                      lineHeight: 1.1,
                      flexShrink: 0,
                    }}
                  >
                    <div style={{ fontSize: 10, letterSpacing: "1.2px", opacity: 0.85, fontFamily: "var(--font-mono)" }}>
                      {d.month}
                    </div>
                    <div style={{ fontSize: 18 }}>{d.day}</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: inkPaper }}>{d.full}</div>
                    <div style={{ fontSize: 12.5, color: "var(--ink-mute)", marginTop: 1 }}>
                      {latestVisit.visibility ?? "Private"}
                    </div>
                  </div>
                  <button
                    onClick={() => onEdit(latestVisit)}
                    style={{
                      background: "transparent", border: "0.5px solid rgba(58,46,28,0.18)",
                      borderRadius: 8, padding: "5px 10px", cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 5,
                      fontSize: 11, fontWeight: 600, color: inkPaper, flexShrink: 0,
                    }}
                  >
                    <PenLine size={11} strokeWidth={2} /> Edit
                  </button>
                </div>
              );
            })()}

            {/* Title */}
            {latestVisit.title && (
              <div style={{ fontWeight: 700, fontSize: 16, color: inkPaper, marginBottom: 8 }}>
                {latestVisit.title}
              </div>
            )}

            {/* Notes */}
            {latestVisit.notes ? (
              <div
                style={{
                  fontSize: 15,
                  color: inkPaper,
                  lineHeight: 1.65,
                  marginBottom: 16,
                }}
              >
                {latestVisit.notes}
              </div>
            ) : (
              <p style={{ fontSize: 14, color: "var(--ink-mute)", fontStyle: "italic", marginBottom: 16 }}>
                No notes for this visit.
              </p>
            )}

            {/* Photos */}
            {latestVisit.photos && latestVisit.photos.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9.5,
                    letterSpacing: "1.4px",
                    color: "var(--ink-mute)",
                    textTransform: "uppercase",
                    marginBottom: 8,
                    fontWeight: 600,
                  }}
                >
                  {latestVisit.photos.length} PHOTO{latestVisit.photos.length !== 1 ? "S" : ""}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4 }}>
                  {latestVisit.photos.slice(0, 9).map((url, i) => (
                    <Image
                      key={i}
                      src={url}
                      alt=""
                      width={400}
                      height={88}
                      onClick={() => onImageClick(latestVisit.photos!.map((u) => ({ url: u })), i)}
                      style={{ width: "100%", height: 88, objectFit: "cover", borderRadius: 6, cursor: "pointer" }}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Earlier visits */}
            {earlierVisits.length > 0 && (
              <div style={{ paddingTop: 16, borderTop: `0.5px dashed ${hairlinePaper}` }}>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9.5,
                    letterSpacing: "1.4px",
                    color: "var(--ink-mute)",
                    textTransform: "uppercase",
                    marginBottom: 10,
                    fontWeight: 600,
                  }}
                >
                  EARLIER VISITS
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {earlierVisits.map((v, i) => {
                    const d = formatDate(v.visited_date!);
                    return (
                      <div
                        key={i}
                        style={{
                          background: "rgba(0,0,0,0.04)",
                          borderRadius: 8,
                          padding: "10px 12px",
                          borderLeft: "2px solid var(--primary)",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 3 }}>
                          <div
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: 9.5,
                              letterSpacing: "1px",
                              color: "var(--ink-mute)",
                              fontWeight: 600,
                            }}
                          >
                            {d.full.toUpperCase()}
                          </div>
                          <button
                            onClick={() => onEdit(v)}
                            style={{
                              background: "transparent", border: "none", padding: "2px 4px",
                              cursor: "pointer", color: "var(--ink-mute)", flexShrink: 0,
                              display: "flex", alignItems: "center",
                            }}
                          >
                            <PenLine size={11} strokeWidth={2} />
                          </button>
                        </div>
                        {v.notes && (
                          <div style={{ fontSize: 12.5, color: inkPaper, lineHeight: 1.45 }}>
                            {v.notes}
                          </div>
                        )}
                        {v.title && !v.notes && (
                          <div style={{ fontSize: 12.5, color: inkPaper }}>{v.title}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Empty journal CTA */
          <button
            onClick={onAdd}
            style={{
              width: "100%",
              padding: 40,
              border: "1.5px dashed var(--hairline)",
              background: "transparent",
              borderRadius: 14,
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
              color: "var(--ink-mute)",
              fontFamily: "var(--font-sans)",
            }}
          >
            <PenLine size={28} strokeWidth={1.8} />
            <div style={{ fontWeight: 700, fontSize: 15, color: "var(--ink)" }}>Start your journal</div>
            <div style={{ fontSize: 12.5 }}>Notes, photos, companions — keep it for you.</div>
          </button>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ParkDetailPage({
  params,
}: {
  params: Promise<{ park_code: string }>;
}) {
  const { park_code } = use(params);
  const { isLoaded, isSignedIn, user } = useUser();
  const router = useRouter();

  const [park, setPark]       = useState<ParkData | null>(null);
  const [visits, setVisits]   = useState<VisitData[]>([]);
  const [allVisitsGlobal, setAllVisitsGlobal] = useState<VisitData[]>([]);
  const [allParks, setAllParks] = useState<ParkData[]>([]);
  const [loading, setLoading] = useState(true);
  const [logVisitOpen, setLogVisitOpen]   = useState(false);
  const [logVisitDraft, setLogVisitDraft] = useState<Partial<VisitDraft> | undefined>(undefined);
  const [logVisitEditMode, setLogVisitEditMode] = useState(false);
  const [nps, setNps] = useState<NpsData | null>(null);
  const [forecast, setForecast] = useState<WeatherForecast | null>(null);
  const [journalOpen, setJournalOpen] = useState(false);
  const [activitiesExpanded, setActivitiesExpanded] = useState(false);
  const [topicsExpanded, setTopicsExpanded] = useState(false);
  const [lightbox, setLightbox] = useState<{ images: LightboxImage[]; index: number } | null>(null);
  const [heroLoaded, setHeroLoaded]   = useState(false);
  const [stripLoaded, setStripLoaded] = useState([false, false, false, false]);

  useEffect(() => {
    if (isLoaded && !isSignedIn) router.push("/");
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    fetch(`/api/parks/${park_code}/nps`)
      .then((r) => r.json())
      .then((data) => setNps(data))
      .catch(() => {});
    fetch(`/api/parks/${park_code}/weather`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => data && setForecast(data))
      .catch(() => {});
  }, [park_code]);

  useEffect(() => {
    fetch("/api/parks").then((r) => r.ok ? r.json() : []).then(setAllParks).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isSignedIn) return;
    Promise.all([
      fetch(`/api/parks/${park_code}`).then((r) => (r.ok ? r.json() : null)),
      fetch("/api/visits").then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([parkData, allVisits]) => {
        setPark(parkData);
        setAllVisitsGlobal(allVisits as VisitData[]);
        const parkVisits = (allVisits as VisitData[]).filter(
          (v) => v.park_code === park_code
        );
        setVisits(parkVisits);
        setJournalOpen(parkVisits.some((v) => !v.is_bucket_list && v.visited_date));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [isSignedIn, park_code]);

  const openLogVisit = () => {
    setLogVisitDraft({ parkCode: park_code });
    setLogVisitEditMode(false);
    setLogVisitOpen(true);
  };

  const openEditVisit = (v: VisitData) => {
    setLogVisitDraft({
      parkCode: park_code,
      dates: {
        start: v.visited_date ? new Date(v.visited_date) : null,
        end: null,
      },
      title: v.title ?? "",
      notes: v.notes ?? "",
      photos: Array.isArray(v.photos) ? v.photos : [],
      cover: Array.isArray(v.photos) && v.photos.length > 0 ? v.photos[0] : null,
      visibility: (v.visibility
        ? v.visibility.charAt(0).toUpperCase() + v.visibility.slice(1)
        : "Private") as "Private" | "Friends" | "Public",
    });
    setLogVisitEditMode(true);
    setLogVisitOpen(true);
  };

  const refreshVisits = async () => {
    const res = await fetch("/api/visits");
    if (!res.ok) return;
    const all = await res.json();
    setVisits((all as VisitData[]).filter((v) => v.park_code === park_code));
  };

  const latestVisit = visits
    .filter((v) => !v.is_bucket_list && v.visited_date)
    .sort((a, b) => new Date(b.visited_date!).getTime() - new Date(a.visited_date!).getTime())[0] ?? null;

  const status: "visited" | "bucketList" | "notVisited" = latestVisit
    ? "visited"
    : visits.some((v) => v.is_bucket_list)
    ? "bucketList"
    : "notVisited";

  if (loading) return <ParkPageSkeleton />;

  if (!park) {
    return (
      <DesktopShell fullbleed>
        <div className="flex items-center justify-center h-full" style={{ color: "var(--ink-mute)" }}>
          Park not found.
        </div>
      </DesktopShell>
    );
  }

  const stateLabel = park.states.split(",")[0]?.trim() ?? park.states;
  const stateName = STATE_NAMES[stateLabel] ?? stateLabel;
  const gradient = parkGradient(park.park_code);

  return (
    <DesktopShell fullbleed>
      <div style={{ display: "flex", height: "100%" }}>

        {/* ── Left column ─────────────────────────────────────────── */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            overflowY: "auto",
            background: "var(--bg)",
          }}
        >
          {/* Breadcrumb */}
          <div
            style={{
              padding: "18px 32px 0",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Link
              href="/map"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                color: "var(--ink-mute)",
                textDecoration: "none",
                fontSize: 12.5,
                fontWeight: 500,
              }}
            >
              <ChevronLeft size={14} strokeWidth={2.2} /> Map
            </Link>
            <span style={{ color: "var(--ink-mute)", fontSize: 12 }}>›</span>
            <span style={{ fontSize: 12.5, color: "var(--ink)", fontWeight: 700 }}>
              {park.name}
            </span>
          </div>

          {/* Hero */}
          <div style={{ padding: "14px 32px 0" }}>
            <div
              style={{
                position: "relative",
                borderRadius: 14,
                overflow: "hidden",
                height: 360,
              }}
            >
              {/* Gradient + topo skeleton — always present, fades out once image loads */}
              <div
                style={{
                  position: "absolute", inset: 0,
                  background: gradient,
                  backgroundImage: topoPattern("#ffffff", 0.10),
                  opacity: heroLoaded ? 0 : 1,
                  transition: "opacity 0.5s ease",
                  pointerEvents: "none",
                }}
              />
              {nps?.images[0] && (
                <Image
                  src={nps.images[0].url}
                  alt={nps.images[0].altText || park.name}
                  fill
                  sizes="(max-width: 1200px) 100vw, 900px"
                  onLoad={() => setHeroLoaded(true)}
                  onClick={() => setLightbox({ images: nps.images.map((img) => ({ url: img.url, caption: img.title || undefined, credit: img.credit || undefined })), index: 0 })}
                  style={{ objectFit: "cover", cursor: "pointer", opacity: heroLoaded ? 1 : 0, transition: "opacity 0.5s ease" }}
                />
              )}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.42) 35%, rgba(0,0,0,0) 65%)",
                  pointerEvents: "none",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  bottom: 18,
                  left: 22,
                  right: 22,
                  color: "#FFFBF1",
                  pointerEvents: "none",
                }}
              >
                <div style={{ marginBottom: 6 }}>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      color: "rgba(255,251,241,0.92)",
                      letterSpacing: "1.4px",
                      textTransform: "uppercase",
                      textShadow: "0 1px 3px rgba(0,0,0,0.6)",
                    }}
                  >
                    {stateName}
                  </div>
                </div>
                <div
                  style={{
                    fontWeight: 800,
                    fontSize: 44,
                    letterSpacing: -1,
                    lineHeight: 1,
                  }}
                >
                  {park.name}
                </div>
              </div>
            </div>
          </div>

          {/* Photo strip */}
          <div
            style={{
              padding: "14px 32px 0",
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 8,
            }}
          >
            {Array.from({ length: 4 }).map((_, i) => {
              const img = nps?.images[i + 1];
              return (
                <div
                  key={i}
                  style={{ position: "relative", height: 120, borderRadius: 10, overflow: "hidden", background: gradient, backgroundImage: topoPattern("#ffffff", 0.10) }}
                >
                  {img && (
                    <Image
                      src={img.url}
                      alt={img.altText || ""}
                      fill
                      sizes="200px"
                      onLoad={() => setStripLoaded((prev) => prev.map((v, j) => j === i ? true : v))}
                      onClick={() => setLightbox({ images: nps.images.map((im) => ({ url: im.url, caption: im.title || undefined, credit: im.credit || undefined })), index: i + 1 })}
                      style={{ objectFit: "cover", cursor: "pointer", opacity: stripLoaded[i] ? 1 : 0, transition: "opacity 0.5s ease" }}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* About */}
          {park.description && (
            <div style={{ padding: "24px 32px 16px" }}>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  letterSpacing: "1.6px",
                  color: "var(--ink-mute)",
                  textTransform: "uppercase",
                  marginBottom: 8,
                  fontWeight: 600,
                }}
              >
                ABOUT
              </div>
              <div
                style={{
                  fontSize: 16,
                  color: "var(--ink-soft)",
                  lineHeight: 1.6,
                }}
              >
                {park.description}
              </div>
            </div>
          )}

          {/* Quick stats */}
          <div style={{ padding: "0 32px 24px" }}>
            <div
              style={{
                background: "var(--surface)",
                border: "0.5px solid var(--hairline)",
                borderRadius: 12,
                padding: "14px 0",
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
              }}
            >
              <StatTile label="State" value={stateName} sm />
              <StatTile label="Status" value={status === "visited" ? "Visited" : status === "bucketList" ? "Bucket list" : "—"} border />
              <StatTile
                label="Visits"
                value={visits.filter((v) => !v.is_bucket_list && v.visited_date).length.toString()}
                unit="trips"
                border
              />
              <StatTile
                label="Photos"
                value={visits
                  .flatMap((v) => v.photos ?? [])
                  .length.toString()}
                unit="saved"
                border
              />
            </div>
          </div>

          {/* Quick actions */}
          <div style={{ padding: "0 32px 32px", display: "flex", gap: 10 }}>
            {status !== "visited" ? (
              <DesktopButton primary onClick={() => openLogVisit()}>
                <Plus size={14} strokeWidth={2.4} /> Log a visit
              </DesktopButton>
            ) : (
              <DesktopButton onClick={() => openLogVisit()}>
                <Plus size={14} strokeWidth={2.4} /> Log another visit
              </DesktopButton>
            )}
            <Link href="/map" style={{ textDecoration: "none" }}>
              <DesktopButton>
                <MapPin size={14} strokeWidth={2} /> View on map
              </DesktopButton>
            </Link>
          </div>

          {/* Mini map */}
          {park.latitude && park.longitude && (
            <div style={{ padding: "0 32px 28px" }}>
              <SectionLabel>
                <MapPin size={11} strokeWidth={2} style={{ display: "inline", marginRight: 5, verticalAlign: "middle" }} />
                LOCATION
              </SectionLabel>
              <div
                style={{
                  height: 240,
                  borderRadius: 12,
                  overflow: "hidden",
                  border: "0.5px solid var(--hairline)",
                }}
              >
                <ParkMap
                  center={[parseFloat(park.latitude), parseFloat(park.longitude)]}
                  zoom={10}
                  parks={allParks
                    .filter((p) => p.latitude && p.longitude)
                    .map((p) => {
                      const hasVisit = allVisitsGlobal.some((v) => v.park_code === p.park_code && !v.is_bucket_list && v.visited_date);
                      const hasBucket = allVisitsGlobal.some((v) => v.park_code === p.park_code && v.is_bucket_list);
                      return {
                        park_code: p.park_code,
                        name: p.name,
                        position: [parseFloat(p.latitude!), parseFloat(p.longitude!)] as [number, number],
                        status: hasVisit ? "visited" : hasBucket ? "bucketList" : "notVisited",
                      };
                    })
                  }
                />
              </div>
            </div>
          )}

          {/* Activities */}
          {nps?.activities && nps.activities.length > 0 && (() => {
            const LIMIT = 6;
            const shown = activitiesExpanded ? nps.activities : nps.activities.slice(0, LIMIT);
            const hidden = nps.activities.length - LIMIT;
            return (
              <div style={{ padding: "0 32px 28px" }}>
                <SectionLabel>
                  <Footprints size={11} strokeWidth={2} style={{ display: "inline", marginRight: 5, verticalAlign: "middle" }} />
                  ACTIVITIES
                </SectionLabel>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                  {shown.map((a, i) => <InfoChip key={i} href={`/parks?activity=${encodeURIComponent(a)}`}>{a}</InfoChip>)}
                  {!activitiesExpanded && hidden > 0 && (
                    <button
                      onClick={() => setActivitiesExpanded(true)}
                      style={{ display: "inline-flex", alignItems: "center", padding: "4px 10px", borderRadius: 100, background: "var(--surface)", border: "0.5px solid var(--hairline)", fontSize: 11.5, fontWeight: 600, color: "var(--primary)", cursor: "pointer" }}
                    >
                      +{hidden} more
                    </button>
                  )}
                  {activitiesExpanded && nps.activities.length > LIMIT && (
                    <button
                      onClick={() => setActivitiesExpanded(false)}
                      style={{ display: "inline-flex", alignItems: "center", padding: "4px 10px", borderRadius: 100, background: "var(--surface)", border: "0.5px solid var(--hairline)", fontSize: 11.5, fontWeight: 500, color: "var(--ink-mute)", cursor: "pointer" }}
                    >
                      Show less
                    </button>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Topics */}
          {nps?.topics && nps.topics.length > 0 && (() => {
            const LIMIT = 6;
            const shown = topicsExpanded ? nps.topics : nps.topics.slice(0, LIMIT);
            const hidden = nps.topics.length - LIMIT;
            return (
              <div style={{ padding: "0 32px 28px" }}>
                <SectionLabel>
                  <Tag size={11} strokeWidth={2} style={{ display: "inline", marginRight: 5, verticalAlign: "middle" }} />
                  TOPICS
                </SectionLabel>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                  {shown.map((t, i) => <InfoChip key={i} muted href={`/parks?topic=${encodeURIComponent(t)}`}>{t}</InfoChip>)}
                  {!topicsExpanded && hidden > 0 && (
                    <button
                      onClick={() => setTopicsExpanded(true)}
                      style={{ display: "inline-flex", alignItems: "center", padding: "4px 10px", borderRadius: 100, background: "var(--surface-alt)", border: "0.5px solid var(--hairline)", fontSize: 11.5, fontWeight: 600, color: "var(--primary)", cursor: "pointer" }}
                    >
                      +{hidden} more
                    </button>
                  )}
                  {topicsExpanded && nps.topics.length > LIMIT && (
                    <button
                      onClick={() => setTopicsExpanded(false)}
                      style={{ display: "inline-flex", alignItems: "center", padding: "4px 10px", borderRadius: 100, background: "var(--surface-alt)", border: "0.5px solid var(--hairline)", fontSize: 11.5, fontWeight: 500, color: "var(--ink-mute)", cursor: "pointer" }}
                    >
                      Show less
                    </button>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Operating hours + Contact side by side */}
          {(nps?.operatingHours && nps.operatingHours.length > 0) && (
            <div style={{ padding: "0 32px 28px" }}>
              {nps?.operatingHours && nps.operatingHours.length > 0 && (
                <div>
                  <SectionLabel>
                    <Clock size={11} strokeWidth={2} style={{ display: "inline", marginRight: 5, verticalAlign: "middle" }} />
                    HOURS
                  </SectionLabel>
                  {nps.operatingHours.map((h, i, hours) => {
                    const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
                    const dayLabels: Record<string, string> = {
                      monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu",
                      friday: "Fri", saturday: "Sat", sunday: "Sun",
                    };
                    return (
                      <div
                        key={i}
                        style={{
                          background: "var(--surface)",
                          border: "0.5px solid var(--hairline)",
                          borderRadius: 12,
                          padding: "14px 18px",
                          marginBottom: i < hours.length - 1 ? 8 : 0,
                        }}
                      >
                        {hours.length > 1 && (
                          <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)", marginBottom: 10 }}>
                            {h.name}
                          </div>
                        )}
                        <div style={{ display: "grid", gridTemplateColumns: "48px 1fr", rowGap: 6, columnGap: 12 }}>
                          {days.map((day) => (
                            h.standardHours[day] != null && (
                              <React.Fragment key={day}>
                                <span
                                  style={{
                                    fontFamily: "var(--font-mono)",
                                    fontSize: 10,
                                    fontWeight: 700,
                                    color: "var(--ink-mute)",
                                    letterSpacing: "0.6px",
                                    paddingTop: 1,
                                  }}
                                >
                                  {dayLabels[day]}
                                </span>
                                <span style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
                                  {h.standardHours[day]}
                                </span>
                              </React.Fragment>
                            )
                          ))}
                        </div>
                        {h.description && (
                          <div style={{ fontSize: 12, color: "var(--ink-mute)", marginTop: 10, lineHeight: 1.5 }}>
                            {h.description}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}


          {/* Entrance fees */}
          {nps?.entranceFees && nps.entranceFees.length > 0 && (
            <div style={{ padding: "0 32px 28px" }}>
              <SectionLabel>
                <DollarSign size={11} strokeWidth={2} style={{ display: "inline", marginRight: 5, verticalAlign: "middle" }} />
                ENTRANCE FEES
              </SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {nps.entranceFees.map((fee, i) => (
                  <div
                    key={i}
                    style={{
                      background: "var(--surface)",
                      border: "0.5px solid var(--hairline)",
                      borderRadius: 12,
                      padding: "12px 16px",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 12,
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 900,
                        fontSize: 20,
                        color: "var(--primary)",
                        letterSpacing: -0.5,
                        lineHeight: 1,
                        flexShrink: 0,
                        paddingTop: 2,
                      }}
                    >
                      ${parseFloat(fee.cost).toFixed(0)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)", marginBottom: 2 }}>
                        {fee.title}
                      </div>
                      {fee.description && (
                        <div style={{ fontSize: 12, color: "var(--ink-mute)", lineHeight: 1.5 }}>
                          {fee.description}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Directions */}
          {nps?.directionsInfo && (
            <div style={{ padding: "0 32px 28px" }}>
              <SectionLabel>
                <Navigation size={11} strokeWidth={2} style={{ display: "inline", marginRight: 5, verticalAlign: "middle" }} />
                DIRECTIONS
              </SectionLabel>
              <div
                style={{
                  background: "var(--surface)",
                  border: "0.5px solid var(--hairline)",
                  borderRadius: 12,
                  padding: "14px 18px",
                }}
              >
                <div style={{ fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.6, marginBottom: nps.directionsUrl ? 12 : 0 }}>
                  {nps.directionsInfo}
                </div>
                {nps.directionsUrl && (
                  <a
                    href={nps.directionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      fontSize: 12,
                      fontWeight: 700,
                      color: "var(--primary)",
                      textDecoration: "none",
                    }}
                  >
                    <ExternalLink size={12} strokeWidth={2.2} />
                    Get directions
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Weather */}
          {(forecast || nps?.weatherInfo) && (
            <div style={{ padding: "0 32px 28px" }}>
              <SectionLabel>
                <Cloud size={11} strokeWidth={2} style={{ display: "inline", marginRight: 5, verticalAlign: "middle" }} />
                WEATHER
              </SectionLabel>

              {/* NWS forecast */}
              {forecast && forecast.periods.length > 0 && (() => {
                const daytime = forecast.periods.filter((p) => p.isDaytime);
                type Period = WeatherForecast["periods"][number];
                const nightEntries: [string, Period][] = forecast.periods
                  .filter((p) => !p.isDaytime)
                  .map((p) => [p.name.replace(" Night", "").replace(" night", ""), p]);
                const nightMap = new Map<string, Period>(nightEntries);
                return (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: `repeat(${Math.min(daytime.length, 7)}, 1fr)`,
                      gap: 6,
                      marginBottom: nps?.weatherInfo ? 12 : 0,
                    }}
                  >
                    {daytime.slice(0, 7).map((period, i) => {
                      const night = nightMap.get(period.name);
                      const shortDay = period.name === "Today" ? "Today" : period.name.slice(0, 3);
                      return (
                        <div
                          key={i}
                          style={{
                            background: "var(--surface)",
                            border: "0.5px solid var(--hairline)",
                            borderRadius: 10,
                            padding: "10px 8px",
                            textAlign: "center",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ink-mute)", letterSpacing: "0.8px", textTransform: "uppercase" }}>
                            {shortDay}
                          </div>
                          <div style={{ fontSize: 30, lineHeight: 1 }}>{weatherEmoji(period.shortForecast)}</div>
                          <div style={{ fontWeight: 800, fontSize: 15, color: "var(--ink)", lineHeight: 1 }}>
                            {period.temperature}°{period.temperatureUnit}
                          </div>
                          {night && (
                            <div style={{ fontSize: 11, color: "var(--ink-mute)", fontWeight: 500 }}>
                              {night.temperature}°
                            </div>
                          )}
                          <div style={{ fontSize: 10, color: "var(--ink-soft)", lineHeight: 1.3, marginTop: 2 }}>
                            {period.shortForecast}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* NPS general weather description */}
              {nps?.weatherInfo && (
                <div
                  style={{
                    background: "var(--surface)",
                    border: "0.5px solid var(--hairline)",
                    borderRadius: 12,
                    padding: "14px 18px",
                    fontSize: 13,
                    color: "var(--ink-soft)",
                    lineHeight: 1.6,
                  }}
                >
                  {nps.weatherInfo}
                </div>
              )}
            </div>
          )}

          {/* Contact */}
          {(nps?.phone || nps?.email || nps?.url) && (
            <div style={{ padding: "0 32px 40px" }}>
              <SectionLabel>CONTACT</SectionLabel>
              <div
                style={{
                  background: "var(--surface)",
                  border: "0.5px solid var(--hairline)",
                  borderRadius: 12,
                  padding: "14px 18px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                {nps.phone && (
                  <a href={`tel:${nps.phone}`} style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "var(--ink)" }}>
                    <Phone size={14} strokeWidth={2} style={{ color: "var(--ink-mute)", flexShrink: 0 }} />
                    <span style={{ fontSize: 13 }}>{nps.phone}</span>
                  </a>
                )}
                {nps.email && (
                  <a href={`mailto:${nps.email}`} style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "var(--ink)" }}>
                    <Mail size={14} strokeWidth={2} style={{ color: "var(--ink-mute)", flexShrink: 0 }} />
                    <span style={{ fontSize: 13 }}>{nps.email}</span>
                  </a>
                )}
                {nps.url && (
                  <a href={nps.url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "var(--primary)" }}>
                    <ExternalLink size={14} strokeWidth={2} style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Official NPS page</span>
                  </a>
                )}
              </div>
            </div>
          )}

        </div>

        {/* ── Right column — Journal ───────────────────────────────── */}
        <JournalColumn
          allVisits={visits}
          onEdit={(v) => openEditVisit(v)}
          onAdd={() => openLogVisit()}
          collapsed={!journalOpen}
          onToggle={() => setJournalOpen((v) => !v)}
          onImageClick={(images, index) => setLightbox({ images, index })}
        />
      </div>

      {/* Log / Edit visit modal */}
      <LogVisitModal
        open={logVisitOpen}
        onClose={() => { setLogVisitOpen(false); setLogVisitDraft(undefined); setLogVisitEditMode(false); }}
        onPosted={refreshVisits}
        initialDraft={logVisitDraft}
        editMode={logVisitEditMode}
      />

      {lightbox && (
        <LightboxModal
          images={lightbox.images}
          startIndex={lightbox.index}
          onClose={() => setLightbox(null)}
        />
      )}
    </DesktopShell>
  );
}
