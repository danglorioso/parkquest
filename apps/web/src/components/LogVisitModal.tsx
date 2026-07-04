"use client";

import React, { useState, useReducer, useRef, useEffect, useCallback } from "react";
import { useUser } from "@clerk/nextjs";
import { ArrowRight, Check, ChevronLeft, ChevronRight, Eye, Globe, Lock, MapPin, Search, Star, Upload, Users, X } from "lucide-react";
import { LightboxModal } from "@/components/LightboxModal";
import { useToast } from "@/components/ToastProvider";

// ── Inline SVG icons matching the design reference exactly ────────────────

function SvgIcon({ d, size = 22, sw = 1.8, stroke = "currentColor", fill = "none", children }: {
  d?: string; size?: number; sw?: number; stroke?: string; fill?: string; children?: React.ReactNode;
}) {
  const props = { width: size, height: size, viewBox: "0 0 24 24", fill, stroke, strokeWidth: sw, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return <svg {...props}>{d ? <path d={d} /> : children}</svg>;
}

// Custom icons that need exact reference shapes
const Icons = {
  crowd:    (p: {size?:number; sw?:number; stroke?:string}) => <SvgIcon size={p.size??22} sw={p.sw??1.8} stroke={p.stroke??'currentColor'}><circle cx="7" cy="8" r="2"/><circle cx="12" cy="7" r="2"/><circle cx="17" cy="8" r="2"/><path d="M3 19c.5-3 2-4.5 4-4.5M21 19c-.5-3-2-4.5-4-4.5M8 20c.6-3.5 2.2-5 4-5s3.4 1.5 4 5"/></SvgIcon>,
  trail:    (p: {size?:number; sw?:number; stroke?:string}) => <SvgIcon size={p.size??22} sw={p.sw??1.8} stroke={p.stroke??'currentColor'}><path d="M5 21c3-2 3-5 6-5s3 3 6 5M7 14c2-1.5 2-4 5-4M11 7c1.5-1 3-1 5-1"/><circle cx="6" cy="20" r="0.6" fill={p.stroke??'currentColor'}/></SvgIcon>,
  thermo:   (p: {size?:number; sw?:number; stroke?:string}) => <SvgIcon size={p.size??22} sw={p.sw??1.8} stroke={p.stroke??'currentColor'}><path d="M14 14V5a2 2 0 0 0-4 0v9a4 4 0 1 0 4 0z"/><path d="M12 9v5"/></SvgIcon>,
  repeat:   (p: {size?:number; sw?:number; stroke?:string}) => <SvgIcon size={p.size??22} sw={p.sw??1.8} stroke={p.stroke??'currentColor'}><path d="M4 9a6 6 0 0 1 10-3l3 3M4 9V5M4 9h4M20 15a6 6 0 0 1-10 3l-3-3M20 15v4M20 15h-4"/></SvgIcon>,
  figure:   (p: {size?:number; sw?:number; stroke?:string}) => <SvgIcon size={p.size??22} sw={p.sw??1.8} stroke={p.stroke??'currentColor'}><circle cx="12" cy="4" r="2"/><path d="M12 6v8M9 18l3-6 3 6M12 12l-4-3M12 12l4-3"/></SvgIcon>,
  note:     (p: {size?:number; sw?:number; stroke?:string}) => <SvgIcon size={p.size??22} sw={p.sw??1.8} stroke={p.stroke??'currentColor'}><path d="M5 3h10l4 4v14H5z"/><path d="M15 3v4h4M9 12h6M9 16h6"/></SvgIcon>,
  partly:   (p: {size?:number; sw?:number; stroke?:string}) => <SvgIcon size={p.size??22} sw={p.sw??1.8} stroke={p.stroke??'currentColor'}><circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 3.4l-1 1"/><path d="M11 19h7a3.2 3.2 0 0 0 .3-6.38A4.7 4.7 0 0 0 10 12 3.3 3.3 0 0 0 11 19z"/></SvgIcon>,
  fog:      (p: {size?:number; sw?:number; stroke?:string}) => <SvgIcon size={p.size??22} sw={p.sw??1.8} stroke={p.stroke??'currentColor'}><path d="M5 9h12a4 4 0 0 0 .5-7.97A6 6 0 0 0 6 .5"/><path d="M3 13h16M5 17h14M7 21h10"/></SvgIcon>,
  storm:    (p: {size?:number; sw?:number; stroke?:string}) => <SvgIcon size={p.size??22} sw={p.sw??1.8} stroke={p.stroke??'currentColor'}><path d="M7 13h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6 4.5 4.2 4.2 0 0 0 7 13z"/><path d="M13 13l-3 5h3l-2 4"/></SvgIcon>,
  snow:     (p: {size?:number; sw?:number; stroke?:string}) => <SvgIcon size={p.size??22} sw={p.sw??1.8} stroke={p.stroke??'currentColor'}><path d="M12 2v20M2 12h20M4.5 4.5l15 15M19.5 4.5l-15 15"/></SvgIcon>,
  cloud:    (p: {size?:number; sw?:number; stroke?:string}) => <SvgIcon size={p.size??22} sw={p.sw??1.8} stroke={p.stroke??'currentColor'}><path d="M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6 9.5 4.2 4.2 0 0 0 7 18z"/></SvgIcon>,
  rain:     (p: {size?:number; sw?:number; stroke?:string}) => <SvgIcon size={p.size??22} sw={p.sw??1.8} stroke={p.stroke??'currentColor'}><path d="M7 14h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6 5.5 4.2 4.2 0 0 0 7 14z"/><path d="M8 18l-1 2.5M12 18l-1 2.5M16 18l-1 2.5"/></SvgIcon>,
  wind:     (p: {size?:number; sw?:number; stroke?:string}) => <SvgIcon size={p.size??22} sw={p.sw??1.8} stroke={p.stroke??'currentColor'}><path d="M3 8h11a3 3 0 1 0-3-3M3 16h14a3 3 0 1 1-3 3M3 12h9"/></SvgIcon>,
  sun:      (p: {size?:number; sw?:number; stroke?:string}) => <SvgIcon size={p.size??22} sw={p.sw??1.8} stroke={p.stroke??'currentColor'}><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/></SvgIcon>,
  heart:    (p: {size?:number; sw?:number; stroke?:string}) => <SvgIcon size={p.size??22} sw={p.sw??1.8} stroke={p.stroke??'currentColor'}><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/></SvgIcon>,
  calendar: (p: {size?:number; sw?:number; stroke?:string}) => <SvgIcon size={p.size??22} sw={p.sw??1.8} stroke={p.stroke??'currentColor'}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></SvgIcon>,
  pin:      (p: {size?:number; sw?:number; stroke?:string}) => <SvgIcon size={p.size??22} sw={p.sw??1.8} stroke={p.stroke??'currentColor'}><path d="M12 21s-7-7-7-12a7 7 0 1 1 14 0c0 5-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/></SvgIcon>,
  edit:     (p: {size?:number; sw?:number; stroke?:string}) => <SvgIcon size={p.size??22} sw={p.sw??1.8} stroke={p.stroke??'currentColor'}><path d="M14 4l6 6L8 22H2v-6L14 4z"/></SvgIcon>,
  image:    (p: {size?:number; sw?:number; stroke?:string}) => <SvgIcon size={p.size??22} sw={p.sw??1.8} stroke={p.stroke??'currentColor'}><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/></SvgIcon>,
  upload:   (p: {size?:number; sw?:number; stroke?:string}) => <SvgIcon size={p.size??22} sw={p.sw??1.8} stroke={p.stroke??'currentColor'}><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></SvgIcon>,
};

type IconName = keyof typeof Icons;
function Ic({ n, size = 22, sw = 1.8, stroke = "currentColor" }: { n: IconName; size?: number; sw?: number; stroke?: string }) {
  const Comp = Icons[n];
  return <Comp size={size} sw={sw} stroke={stroke} />;
}

// ── Types ──────────────────────────────────────────────────────────────────

interface DateRange { start: Date | null; end: Date | null; }
interface WeatherState { conds: string[]; }
interface FollowUser { clerk_user_id: string; username: string; display_name?: string | null; avatar_url: string | null; }

export interface VisitDraft {
  parkCode: string;
  dates: DateRange;
  title: string;
  rating: number;
  crowd: number;
  difficulty: number;
  weather: WeatherState;
  activities: string[];
  companions: string[]; // clerk_user_ids of tagged companions
  wouldReturn: string | null;
  highlight: string;
  notes: string;
  photos: string[];
  cover: string | null;
  visibility: "Private" | "Friends" | "Public";
  caption: string;
}

interface ParkData { park_code: string; name: string; states: string; }

// ── Constants ──────────────────────────────────────────────────────────────

const WEATHER_OPTS: { id: string; label: string; icon: IconName }[] = [
  { id: "clear",  label: "Clear",   icon: "sun" },
  { id: "partly", label: "Partly",  icon: "partly" },
  { id: "cloudy", label: "Cloudy",  icon: "cloud" },
  { id: "rain",   label: "Rain",    icon: "rain" },
  { id: "storm",  label: "Storms",  icon: "storm" },
  { id: "snow",   label: "Snow",    icon: "snow" },
  { id: "fog",    label: "Fog",     icon: "fog" },
  { id: "wind",   label: "Windy",   icon: "wind" },
];

const CROWD_LABELS  = ["Empty", "Quiet", "Moderate", "Busy", "Packed"];
const DIFF_LABELS   = ["Easy", "Light", "Moderate", "Hard", "Strenuous"];

const ALL_ACTIVITIES = [
  "hiking","camping","backpacking","climbing","kayaking","rafting",
  "fishing","diving","wildlife","photography","stargazing","tours",
  "cycling","mountaineering",
];

// Maps each internal activity ID to keywords found in NPS activity name strings
const ACTIVITY_KEYWORDS: Record<string, string[]> = {
  hiking:         ["hiking", "hike", "trail"],
  camping:        ["camping"],
  backpacking:    ["backpacking"],
  climbing:       ["climbing"],
  kayaking:       ["kayaking", "canoeing", "paddling"],
  rafting:        ["rafting"],
  fishing:        ["fishing"],
  diving:         ["diving", "scuba", "snorkeling"],
  wildlife:       ["wildlife", "birding", "bird watching", "wildlife watching"],
  photography:    ["photography"],
  stargazing:     ["stargazing", "astronomy"],
  tours:          ["guided", "tour", "ranger program", "auto and atv"],
  cycling:        ["biking", "cycling", "bicycle"],
  mountaineering: ["mountaineering"],
};

function matchActivities(npsNames: string[]): string[] {
  const lower = npsNames.map(n => n.toLowerCase());
  return ALL_ACTIVITIES.filter(id =>
    (ACTIVITY_KEYWORDS[id] ?? [id]).some(kw => lower.some(n => n.includes(kw)))
  );
}


const RETURN_OPTS: { id: string; label: string; icon: IconName }[] = [
  { id: "yes",   label: "Definitely",   icon: "heart" },
  { id: "maybe", label: "Maybe",        icon: "repeat" },
  { id: "no",    label: "Probably not", icon: "cloud" },
];

const STEPS = [
  { key: "where",   no: "01", label: "Where & when",    sub: "Park, title, dates",        icon: "pin" as IconName },
  { key: "rate",    no: "02", label: "The visit",        sub: "Rate it, the conditions",   icon: "heart" as IconName },
  { key: "journal", no: "03", label: "Journal & photos", sub: "Notes, activities, photos", icon: "note" as IconName },
  { key: "share",   no: "04", label: "Share",            sub: "Who can see it",            icon: "cloud" as IconName },
] as const;

// ── State name map ─────────────────────────────────────────────────────────

const STATE_NAMES: Record<string, string> = {
  AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",
  CO:"Colorado",CT:"Connecticut",DE:"Delaware",FL:"Florida",GA:"Georgia",
  HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",
  KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",
  MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",
  NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",
  NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",
  OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",
  SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",
  VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming",
};

function fullStateName(code: string): string {
  return code.split("/").map(s => STATE_NAMES[s.trim()] ?? s.trim()).join(" / ");
}

// ── Date helpers ───────────────────────────────────────────────────────────

const MONTHS      = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTHS_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DOW         = ["S","M","T","W","T","F","S"];

function stripTime(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }
function sameDay(a: Date | null, b: Date | null) { return !!a && !!b && stripTime(a) === stripTime(b); }
function dayCount(start: Date | null, end: Date | null) {
  if (!start) return 0;
  if (!end) return 1;
  return Math.round((stripTime(end) - stripTime(start)) / 86400000) + 1;
}
function fmtRange(start: Date | null, end: Date | null): string {
  if (!start) return "Pick your dates";
  if (!end || sameDay(start, end))
    return `${MONTHS[start.getMonth()]} ${start.getDate()}, ${start.getFullYear()}`;
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  if (sameMonth) return `${MONTHS[start.getMonth()]} ${start.getDate()} – ${end.getDate()}, ${end.getFullYear()}`;
  return `${MONTHS_ABBR[start.getMonth()]} ${start.getDate()} – ${MONTHS_ABBR[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;
}

// ── Draft persistence ──────────────────────────────────────────────────────

const DRAFT_KEY = "pq-visit-drafts";
const MAX_DRAFTS = 5;

interface SavedDraft {
  id: string;
  savedAt: string;   // ISO
  parkName?: string;
  draft: VisitDraft;
}

function draftHasContent(d: VisitDraft): boolean {
  return !!(d.parkCode || d.title || d.notes || d.highlight ||
    d.activities.length || d.photos.length || d.rating || d.dates.start);
}

function loadDrafts(): SavedDraft[] {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedDraft[];
    // Rehydrate date objects
    return parsed.map(sd => ({
      ...sd,
      draft: {
        ...sd.draft,
        dates: {
          start: sd.draft.dates.start ? new Date(sd.draft.dates.start as unknown as string) : null,
          end:   sd.draft.dates.end   ? new Date(sd.draft.dates.end   as unknown as string) : null,
        },
      },
    }));
  } catch { return []; }
}

function upsertDraft(d: VisitDraft, parkName: string | undefined, id: string): void {
  const saved: SavedDraft = { id, savedAt: new Date().toISOString(), parkName, draft: d };
  const rest = loadDrafts().filter(s => s.id !== id);
  localStorage.setItem(DRAFT_KEY, JSON.stringify([saved, ...rest].slice(0, MAX_DRAFTS)));
}

function deleteDraft(id: string): void {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(loadDrafts().filter(s => s.id !== id)));
}

// Best-effort cleanup of orphaned uploads (abandoned drafts, removed photos).
// Fire-and-forget: a failed cleanup just leaves an orphaned file, not a broken visit.
function deletePhotos(urls: string[]): void {
  if (urls.length === 0) return;
  fetch("/api/upload/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ urls }),
  }).catch(e => console.warn("Photo cleanup failed:", e));
}

function draftAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  const h = Math.floor(ms / 3600000);
  const d = Math.floor(ms / 86400000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d === 1) return "yesterday";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Draft selector screen ──────────────────────────────────────────────────

function DraftSelector({ drafts, onRestore, onDelete, onStartFresh }: {
  drafts: SavedDraft[];
  onRestore: (sd: SavedDraft) => void;
  onDelete: (id: string) => void;
  onStartFresh: () => void;
}) {
  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
      <div style={{ marginBottom: 6, ...({ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: 1.4, color: "var(--ink-mute)", textTransform: "uppercase", fontWeight: 600 } as React.CSSProperties) }}>
        Saved drafts
      </div>
      <div style={{ fontWeight: 800, fontSize: 20, color: "var(--ink)", letterSpacing: -0.3, marginBottom: 20 }}>
        Resume where you left off?
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
        {drafts.map(sd => {
          const d = sd.draft;
          const chips: string[] = [];
          if (d.rating) chips.push(`${d.rating}★`);
          if (d.activities.length) chips.push(`${d.activities.length} activit${d.activities.length > 1 ? "ies" : "y"}`);
          if (d.photos.length) chips.push(`${d.photos.length} photo${d.photos.length > 1 ? "s" : ""}`);
          return (
            <div key={sd.id} style={{ background: "var(--surface)", border: "0.5px solid var(--hairline)", borderRadius: 14, padding: "14px 16px", display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {sd.parkName ?? "No park selected"}
                  {d.title && <span style={{ fontWeight: 400, color: "var(--ink-mute)", marginLeft: 6 }}>— {d.title}</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11.5, color: "var(--ink-mute)" }}>{draftAge(sd.savedAt)}</span>
                  {chips.map(c => (
                    <span key={c} style={{ fontSize: 11, color: "var(--ink-mute)", background: "var(--surface-alt)", padding: "2px 7px", borderRadius: 100 }}>{c}</span>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button onClick={() => onDelete(sd.id)} style={{ padding: "7px 12px", borderRadius: 8, border: "0.5px solid var(--hairline)", background: "transparent", cursor: "pointer", fontSize: 12, color: "var(--ink-mute)", fontFamily: "inherit" }}>
                  Delete
                </button>
                <button onClick={() => onRestore(sd)} style={{ padding: "7px 14px", borderRadius: 8, border: 0, background: "var(--primary)", color: "#FFFBF1", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>
                  Resume
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <button onClick={onStartFresh} style={{ width: "100%", padding: "12px", borderRadius: 10, border: "0.5px solid var(--hairline)", background: "var(--surface)", color: "var(--ink-soft)", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>
        Start a new entry
      </button>
    </div>
  );
}

function makeBlankDraft(): VisitDraft {
  return {
    parkCode: "", dates: { start: null, end: null }, title: "",
    rating: 0, crowd: 0, difficulty: 0,
    weather: { conds: [] }, activities: [],
    companions: [], wouldReturn: null,
    highlight: "", notes: "", photos: [], cover: null, visibility: "Friends", caption: "",
  };
}

// ── Primitive blocks ───────────────────────────────────────────────────────

const mono: React.CSSProperties = { fontFamily: "var(--font-mono)" };

function Kicker({ children }: { children: React.ReactNode }) {
  return <div style={{ ...mono, fontSize: 9.5, letterSpacing: 1.4, color: "var(--ink-mute)", textTransform: "uppercase", fontWeight: 600 }}>{children}</div>;
}

function RequirementTag({ kind }: { kind: "required" | "optional" }) {
  return (
    <span style={{
      ...mono, fontSize: 9, letterSpacing: 1, textTransform: "uppercase", fontWeight: 600,
      color: kind === "required" ? "var(--primary)" : "var(--ink-mute)",
      marginLeft: 8, verticalAlign: "2px",
    }}>
      {kind}
    </span>
  );
}

function Section({ kicker, title, hint, tag, children, mb = 20 }: {
  kicker?: string; title?: string; hint?: string; tag?: "required" | "optional"; children: React.ReactNode; mb?: number;
}) {
  return (
    <div style={{ marginBottom: mb }}>
      {(kicker || title || hint) && (
        <div style={{ marginBottom: 10 }}>
          {kicker && <Kicker>{kicker}</Kicker>}
          {title  && (
            <div style={{ fontWeight: 800, fontSize: 19, color: "var(--ink)", letterSpacing: -0.3, marginTop: kicker ? 2 : 0 }}>
              {title}
              {tag && <RequirementTag kind={tag} />}
            </div>
          )}
          {hint   && <div style={{ fontSize: 12.5, color: "var(--ink-mute)", marginTop: 3, lineHeight: 1.4 }}>{hint}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

function Card({ children, pad = 16 }: { children: React.ReactNode; pad?: number }) {
  return (
    <div style={{ background: "var(--surface)", border: "0.5px solid var(--hairline)", borderRadius: 18, padding: pad }}>
      {children}
    </div>
  );
}

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 9 }}>
      <Kicker>{children}</Kicker>
      {hint && <span style={{ fontSize: 11.5, color: "var(--ink-mute)", fontWeight: 500 }}>{hint}</span>}
    </div>
  );
}

// ── Park picker dialog ─────────────────────────────────────────────────────

function ParkPickerDialog({ parks, value, onClose, onPick }: {
  parks: ParkData[]; value: string; onClose: () => void; onPick: (code: string) => void;
}) {
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { const t = setTimeout(() => inputRef.current?.focus(), 60); return () => clearTimeout(t); }, []);
  const list = (q.trim() ? parks.filter(p => p.name.toLowerCase().includes(q.toLowerCase()) || p.states.toLowerCase().includes(q.toLowerCase())) : parks)
    .slice().sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div onClick={onClose} style={{ position: "absolute", inset: 0, zIndex: 120, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 460, maxHeight: 560, background: "var(--surface)", borderRadius: 16, border: "0.5px solid var(--hairline)", boxShadow: "0 24px 60px rgba(0,0,0,0.4)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "18px 18px 12px" }}>
          <div style={{ fontWeight: 800, fontSize: 18, color: "var(--ink)", letterSpacing: -0.3 }}>Which park did you visit?</div>
          <div style={{ background: "var(--surface-alt)", borderRadius: 11, padding: "9px 12px", marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
            <Search style={{ width: 16, height: 16, color: "var(--ink-mute)", flexShrink: 0 }} strokeWidth={2} />
            <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Search 63 parks…" style={{ flex: 1, border: 0, outline: "none", background: "transparent", fontSize: 14, color: "var(--ink)", fontFamily: "inherit" }} />
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 12px" }}>
          {list.map(p => (
            <button key={p.park_code} onClick={() => onPick(p.park_code)} style={{ width: "100%", background: p.park_code === value ? "var(--surface-alt)" : "transparent", border: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: 11, padding: "8px 10px", borderRadius: 10, fontFamily: "inherit" }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: "linear-gradient(135deg, var(--primary), var(--accent))", color: "#FFFBF1", fontWeight: 800, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {p.states.split("/")[0].trim().substring(0, 2)}
              </div>
              <div style={{ flex: 1, textAlign: "left" }}>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--ink)" }}>{p.name}</div>
                <div style={{ fontSize: 11.5, color: "var(--ink-mute)" }}>{fullStateName(p.states)}</div>
              </div>
              {p.park_code === value && <Check style={{ width: 17, height: 17, color: "var(--primary)", flexShrink: 0 }} strokeWidth={2.4} />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Park hero strip ────────────────────────────────────────────────────────

function ParkHeroRow({ park, onChangePark }: { park: ParkData | undefined; onChangePark: () => void }) {
  const [fetchedImg, setFetchedImg] = useState<string | null>(null);

  useEffect(() => {
    if (!park) return;
    let cancelled = false;
    fetch(`/api/parks/${park.park_code}/images`)
      .then(r => r.ok ? r.json() : { images: [] })
      .then(({ images }: { images: { url: string }[] }) => {
        if (!cancelled) setFetchedImg(images[0]?.url ?? null);
      })
      .catch(() => { if (!cancelled) setFetchedImg(null); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [park?.park_code]); // intentionally only re-run when the park code changes, not on every park object ref change

  const imgUrl = park ? fetchedImg : null;

  // ── No park selected: prominent search-style button ──
  if (!park) {
    return (
      <button
        onClick={onChangePark}
        style={{
          width: "100%", border: "2px dashed var(--hairline)", borderRadius: 16,
          background: "var(--surface-alt)", cursor: "pointer", padding: "20px 18px",
          display: "flex", alignItems: "center", gap: 14, fontFamily: "inherit",
          transition: "border-color 150ms, background-color 150ms",
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--primary)";
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--surface)";
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = "";
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = "";
        }}
      >
        <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Search style={{ width: 20, height: 20, color: "#FFFBF1" }} strokeWidth={2.2} />
        </div>
        <div style={{ textAlign: "left" }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: "var(--ink)", letterSpacing: -0.2 }}>Select a park</div>
          <div style={{ fontSize: 12.5, color: "var(--ink-mute)", marginTop: 2 }}>Search over all US national parks</div>
        </div>
      </button>
    );
  }

  // ── Park selected: photo banner ──
  return (
    <button onClick={onChangePark} style={{ width: "100%", padding: 0, border: 0, background: "transparent", cursor: "pointer", display: "block" }}>
      <div style={{ position: "relative", borderRadius: 16, overflow: "hidden", height: 92 }}>
        {imgUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imgUrl} alt={park.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, var(--primary), var(--accent))" }} />
        )}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, rgba(0,0,0,0.55), rgba(0,0,0,0.1))" }} />
        <div style={{ position: "absolute", inset: 0, padding: "0 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ textAlign: "left", color: "#FFFBF1" }}>
            <div style={{ ...mono, fontSize: 9, letterSpacing: 1.4, opacity: 0.85, fontWeight: 600 }}>NATIONAL PARK</div>
            <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: -0.4, lineHeight: 1.05, marginTop: 2 }}>{park.name}</div>
            <div style={{ fontSize: 12, opacity: 0.85, marginTop: 1 }}>{fullStateName(park.states)}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(255,251,241,0.92)", color: "#1B1A16", padding: "6px 11px", borderRadius: 100, fontWeight: 700, fontSize: 12 }}>
            <Ic n="edit" size={13} sw={2.2} stroke="#1B1A16" /> Change
          </div>
        </div>
      </div>
    </button>
  );
}

// ── Date range calendar ────────────────────────────────────────────────────

function DateRangeCalendar({ value, onChange }: { value: DateRange; onChange: (v: DateRange) => void }) {
  const today = new Date();
  const [view, setView] = useState(() => {
    const d = value.start || today;
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const pick = useCallback((d: Date) => {
    const { start, end } = value;
    if (!start || (start && end)) { onChange({ start: d, end: null }); return; }
    if (stripTime(d) < stripTime(start)) { onChange({ start: d, end: null }); return; }
    onChange({ start, end: d });
  }, [value, onChange]);

  const navBtn: React.CSSProperties = { width: 26, height: 26, borderRadius: 7, cursor: "pointer", background: "var(--surface-alt)", border: "0.5px solid var(--hairline)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 };
  const rangeBg = "rgba(31,61,46,0.13)";

  const firstDow = new Date(view.getFullYear(), view.getMonth(), 1).getDay();
  const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(view.getFullYear(), view.getMonth(), d));
  // Always pad to 42 cells (6 full rows) so the grid height is constant across all months
  while (cells.length < 42) cells.push(null);

  return (
    <div>
      {/* quick chips */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        {[
          { label: "Today", build: () => ({ start: today, end: null }) },
          { label: "This weekend", build: () => {
            const sat = new Date(today); sat.setDate(today.getDate() + (6 - today.getDay()));
            const sun = new Date(sat); sun.setDate(sat.getDate() + 1);
            return { start: sat, end: sun };
          }},
          { label: "Clear", build: () => ({ start: null, end: null }) },
        ].map(({ label, build }) => (
          <button key={label} onClick={() => onChange(build())} style={{ background: "var(--surface-alt)", border: "0.5px solid var(--hairline)", color: "var(--ink-soft)", borderRadius: 100, padding: "5px 10px", cursor: "pointer", fontWeight: 600, fontSize: 11, whiteSpace: "nowrap", fontFamily: "inherit" }}>
            {label}
          </button>
        ))}
      </div>

      {/* two-column layout: day grid left, month/year picker right */}
      <div style={{ display: "flex", gap: 14 }}>

        {/* ── Left: day grid ── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <button onClick={() => setView(v => new Date(v.getFullYear(), v.getMonth() - 1, 1))} style={navBtn}>
              <ChevronLeft style={{ width: 14, height: 14, color: "var(--ink-soft)" }} strokeWidth={2.4} />
            </button>
            <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)", letterSpacing: -0.1 }}>
              {MONTHS[view.getMonth()]} {view.getFullYear()}
            </div>
            <button onClick={() => setView(v => new Date(v.getFullYear(), v.getMonth() + 1, 1))} style={navBtn}>
              <ChevronRight style={{ width: 14, height: 14, color: "var(--ink-soft)" }} strokeWidth={2.4} />
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 2 }}>
            {DOW.map((d, i) => <div key={i} style={{ textAlign: "center", ...mono, fontSize: 9, color: "var(--ink-mute)", padding: "2px 0", fontWeight: 600 }}>{d}</div>)}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", rowGap: 1 }}>
            {cells.map((d, i) => {
              if (!d) return <div key={i} />;
              const isStart = sameDay(d, value.start);
              const isEnd   = value.end ? sameDay(d, value.end) : false;
              const mid     = !!(value.start && value.end && stripTime(d) > stripTime(value.start) && stripTime(d) < stripTime(value.end));
              const isToday = sameDay(d, today);
              const endpoint = isStart || isEnd;
              return (
                <div key={i} style={{
                  position: "relative", display: "flex", alignItems: "center", justifyContent: "center", height: 34,
                  background: mid ? rangeBg
                    : isStart && value.end ? `linear-gradient(to right, transparent 50%, ${rangeBg} 50%)`
                    : isEnd ? `linear-gradient(to left, transparent 50%, ${rangeBg} 50%)`
                    : "transparent",
                }}>
                  <button onClick={() => pick(d)} style={{
                    width: 30, height: 30, borderRadius: "50%", cursor: "pointer",
                    border: isToday && !endpoint ? "1.5px solid rgba(31,61,46,0.4)" : "none",
                    background: endpoint ? "var(--primary)" : "transparent",
                    color: endpoint ? "#FFFBF1" : mid ? "var(--primary)" : "var(--ink)",
                    fontWeight: endpoint ? 800 : mid ? 700 : 400, fontSize: 12.5,
                    display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit",
                  }}>{d.getDate()}</button>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Right: year + month picker ── */}
        <div style={{ width: 130, flexShrink: 0, borderLeft: "0.5px solid var(--hairline-soft)", paddingLeft: 14 }}>
          <div style={{ ...mono, fontSize: 8.5, letterSpacing: 0.8, color: "var(--ink-mute)", fontWeight: 600, marginBottom: 5 }}>YEAR</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <button onClick={() => setView(v => new Date(v.getFullYear() - 1, v.getMonth(), 1))} style={navBtn}>
              <ChevronLeft style={{ width: 11, height: 11, color: "var(--ink-soft)" }} strokeWidth={2.4} />
            </button>
            <div style={{ fontWeight: 700, fontSize: 12.5, color: "var(--ink)", letterSpacing: -0.1 }}>{view.getFullYear()}</div>
            <button onClick={() => { if (view.getFullYear() < today.getFullYear()) setView(v => new Date(v.getFullYear() + 1, v.getMonth(), 1)); }} style={{ ...navBtn, opacity: view.getFullYear() >= today.getFullYear() ? 0.3 : 1, cursor: view.getFullYear() >= today.getFullYear() ? "default" : "pointer" }}>
              <ChevronRight style={{ width: 11, height: 11, color: "var(--ink-soft)" }} strokeWidth={2.4} />
            </button>
          </div>

          <div style={{ height: "0.5px", background: "var(--hairline-soft)", margin: "10px 0 10px" }} />
          <div style={{ ...mono, fontSize: 8.5, letterSpacing: 0.8, color: "var(--ink-mute)", fontWeight: 600, marginBottom: 4 }}>MONTH</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 2 }}>
            {MONTHS_ABBR.map((m, i) => {
              const isFuture = view.getFullYear() === today.getFullYear() && i > today.getMonth();
              const isViewMonth = i === view.getMonth();
              return (
                <button key={m} onClick={() => { if (!isFuture) setView(new Date(view.getFullYear(), i, 1)); }} style={{
                  padding: "3px 1px", borderRadius: 6, cursor: isFuture ? "default" : "pointer",
                  background: isViewMonth ? "var(--primary)" : "transparent", border: "none",
                  color: isViewMonth ? "#FFFBF1" : isFuture ? "var(--ink-mute)" : "var(--ink-soft)",
                  fontWeight: isViewMonth ? 700 : 400, fontSize: 10.5, fontFamily: "inherit",
                  opacity: isFuture ? 0.35 : 1, textAlign: "center",
                }}>{m}</button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Half-star rating ───────────────────────────────────────────────────────

// One label per half-step: 0 = unset, 0.5, 1.0, 1.5 … 5.0
const HALF_LABELS: Record<number, string> = {
  0:   "No rating",
  0.5: "Not great",
  1:   "Rough",
  1.5: "Below average",
  2:   "Meh",
  2.5: "Decent",
  3:   "Good",
  3.5: "Really good",
  4:   "Great",
  4.5: "Amazing",
  5:   "Unreal",
};

function StarRating({ value, onChange, accent = "var(--accent)" }: {
  value: number; onChange: (v: number) => void; accent?: string;
}) {
  const [hover, setHover] = useState<number>(0);
  const display = hover || value;

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>, i: number) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const isLeft = e.clientX - rect.left < rect.width / 2;
    const next = isLeft ? i + 0.5 : i + 1;
    onChange(next === value ? 0 : next);
  };

  const handleMove = (e: React.MouseEvent<HTMLButtonElement>, i: number) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const isLeft = e.clientX - rect.left < rect.width / 2;
    setHover(isLeft ? i + 0.5 : i + 1);
  };

  const fillType = (i: number, v: number): "full" | "half" | "empty" => {
    if (v >= i + 1) return "full";
    if (v >= i + 0.5) return "half";
    return "empty";
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 3, marginBottom: 10 }}>
        {Array.from({ length: 5 }).map((_, i) => {
          const fill = fillType(i, display);
          return (
            <button
              key={i}
              onClick={e => handleClick(e, i)}
              onMouseMove={e => handleMove(e, i)}
              onMouseLeave={() => setHover(0)}
              style={{ background: "transparent", border: 0, padding: 3, cursor: "pointer", lineHeight: 0 }}
            >
              <div style={{ position: "relative", width: 32, height: 32 }}>
                {/* empty base */}
                <Star style={{ position: "absolute", inset: 0, width: 32, height: 32, color: "var(--ink-mute)" }} strokeWidth={1.6} fill="none" />
                {/* filled overlay */}
                {fill !== "empty" && (
                  <Star style={{ position: "absolute", inset: 0, width: 32, height: 32, color: accent, clipPath: fill === "half" ? "inset(0 50% 0 0)" : "none" }} strokeWidth={1.6} fill={accent} />
                )}
              </div>
            </button>
          );
        })}
      </div>
      <div style={{ minHeight: 20 }}>
        {display > 0 ? (
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontWeight: 800, fontSize: 22, color: "var(--ink)", letterSpacing: -0.4, lineHeight: 1 }}>{display}</span>
            <span style={{ fontWeight: 600, fontSize: 13, color: "var(--ink-mute)" }}>/ 5</span>
            <span style={{ fontWeight: 700, fontSize: 14, color: accent, marginLeft: 2 }}>{HALF_LABELS[display]}</span>
            {!hover && value > 0 && (
              <button onClick={() => onChange(0)} style={{ background: "none", border: 0, cursor: "pointer", fontSize: 11.5, color: "var(--ink-mute)", marginLeft: 4, padding: 0, fontFamily: "inherit" }}>
                Clear
              </button>
            )}
          </div>
        ) : (
          <span style={{ fontSize: 12.5, color: "var(--ink-mute)" }}>Hover over a star to rate</span>
        )}
      </div>
    </div>
  );
}

// ── Scale control (segmented only — stars now use StarRating) ──────────────

function ScaleControl({ value, onChange, mode = "stars", labels, accent = "var(--accent)" }: {
  value: number; onChange: (v: number) => void;
  mode?: "stars" | "segmented"; labels?: string[]; accent?: string;
}) {
  if (mode === "stars") {
    return <StarRating value={value} onChange={onChange} accent={accent} />;
  }
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {Array.from({ length: 5 }).map((_, i) => {
        const on = value === i + 1;
        return (
          <button key={i} onClick={() => onChange(on ? 0 : i + 1)} style={{
            flex: 1, padding: labels ? "8px 2px" : "10px 0", borderRadius: 10, cursor: "pointer",
            background: on ? accent : "var(--surface-alt)", border: `0.5px solid ${on ? accent : "var(--hairline)"}`,
            color: on ? "#FFFBF1" : "var(--ink-soft)", fontWeight: on ? 800 : 600, fontSize: 11, fontFamily: "inherit",
            display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1.15, transition: "all 120ms",
          }}>
            {labels ? labels[i] : i + 1}
          </button>
        );
      })}
    </div>
  );
}

// ── Rating row wrapper ─────────────────────────────────────────────────────

function RatingRow({ iconName, label, tag, children, last = false }: { iconName: IconName; label: string; tag?: "required" | "optional"; children: React.ReactNode; last?: boolean }) {
  return (
    <div style={{ marginBottom: last ? 0 : 16, paddingBottom: last ? 0 : 16, borderBottom: last ? "none" : "0.5px solid var(--hairline-soft)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 9 }}>
        <Ic n={iconName} size={15} sw={2} stroke="var(--ink-mute)" />
        <span style={{ fontWeight: 700, fontSize: 13.5, color: "var(--ink)" }}>{label}{tag && <RequirementTag kind={tag} />}</span>
      </div>
      {children}
    </div>
  );
}

// ── Weather picker ─────────────────────────────────────────────────────────

function WeatherPicker({ value, onChange }: { value: WeatherState; onChange: (v: WeatherState) => void }) {
  const toggle = (id: string) => {
    const next = value.conds.includes(id)
      ? value.conds.filter(c => c !== id)
      : [...value.conds, id];
    onChange({ conds: next });
  };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 7 }}>
      {WEATHER_OPTS.map(w => {
        const on = value.conds.includes(w.id);
        return (
          <button key={w.id} onClick={() => toggle(w.id)} style={{
            padding: "11px 4px 9px", borderRadius: 13, cursor: "pointer",
            background: on ? "var(--primary)" : "var(--surface-alt)",
            border: `0.5px solid ${on ? "var(--primary)" : "var(--hairline)"}`,
            color: on ? "#FFFBF1" : "var(--ink-soft)",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
            fontWeight: on ? 700 : 600, fontSize: 11, fontFamily: "inherit",
            transition: "all 120ms",
          }}>
            <Ic n={w.icon} size={22} sw={1.9} stroke={on ? "#FFFBF1" : "var(--ink-soft)"} />
            {w.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Activity picker ────────────────────────────────────────────────────────

function ActivityPicker({ value, onChange, options = ALL_ACTIVITIES, npsActivityNames = [] }: {
  value: string[];
  onChange: (v: string[]) => void;
  options?: string[];
  npsActivityNames?: string[];
}) {
  const [query, setQuery] = useState("");
  const [dropOpen, setDropOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const toggle = (a: string) => {
    if (value.includes(a)) onChange(value.filter(x => x !== a));
    else if (value.length < 8) onChange([...value, a]);
  };

  const suggestions = query.trim().length > 0
    ? npsActivityNames
        .filter(name =>
          name.toLowerCase().includes(query.toLowerCase()) &&
          !value.some(v => v.toLowerCase() === name.toLowerCase())
        )
        .slice(0, 8)
    : [];

  const queryLower = query.trim().toLowerCase();
  const exactMatch = suggestions.some(s => s.toLowerCase() === queryLower);
  const alreadyAdded = value.some(v => v.toLowerCase() === queryLower);
  const showAddNew = query.trim().length > 1 && !exactMatch && !alreadyAdded;

  const addActivity = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || value.length >= 8) return;
    const hardcoded = options.find(o => o.toLowerCase() === trimmed.toLowerCase());
    const key = hardcoded ?? trimmed;
    if (!value.some(v => v.toLowerCase() === key.toLowerCase())) {
      onChange([...value, key]);
    }
    setQuery("");
    setDropOpen(false);
  };

  const customActivities = value.filter(a => !options.includes(a));
  const hasDropdown = dropOpen && (suggestions.length > 0 || showAddNew);

  return (
    <div>
      {/* Hardcoded quick-select chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 12 }}>
        {options.map(a => {
          const on = value.includes(a);
          return (
            <button key={a} onClick={() => toggle(a)} style={{
              background: on ? "var(--primary)" : "var(--surface-alt)",
              color: on ? "#FFFBF1" : "var(--ink-soft)",
              border: `0.5px solid ${on ? "var(--primary)" : "var(--hairline)"}`,
              borderRadius: 100, padding: "7px 13px", cursor: "pointer",
              fontWeight: 600, fontSize: 12.5, textTransform: "capitalize",
              display: "flex", alignItems: "center", gap: 5, fontFamily: "inherit",
              transition: "all 110ms",
            }}>
              {on && <Check style={{ width: 12, height: 12 }} strokeWidth={2.6} />}
              {a}
            </button>
          );
        })}
      </div>

      {/* Custom (non-hardcoded) activity chips */}
      {customActivities.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 12 }}>
          {customActivities.map(a => (
            <div key={a} style={{ display: "flex", alignItems: "center", gap: 5, background: "var(--primary)", color: "#FFFBF1", borderRadius: 100, padding: "7px 7px 7px 13px", fontWeight: 600, fontSize: 12.5 }}>
              {a}
              <button onClick={() => toggle(a)} style={{ background: "rgba(255,251,241,0.2)", border: 0, borderRadius: "50%", width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
                <X style={{ width: 10, height: 10, color: "#FFFBF1" }} strokeWidth={2.4} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Custom activity search input */}
      {value.length < 8 && (
        <div style={{ position: "relative" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "var(--surface)", border: "0.5px solid var(--hairline)",
            borderRadius: hasDropdown ? "10px 10px 0 0" : 10,
            padding: "9px 12px",
          }}>
            <Search style={{ width: 14, height: 14, color: "var(--ink-mute)", flexShrink: 0 }} strokeWidth={2} />
            <input
              ref={inputRef}
              value={query}
              onChange={e => { setQuery(e.target.value); setDropOpen(true); }}
              onFocus={() => setDropOpen(true)}
              onBlur={() => setTimeout(() => setDropOpen(false), 150)}
              onKeyDown={e => {
                if (e.key === "Enter") { e.preventDefault(); if (suggestions.length > 0) addActivity(suggestions[0]); else if (query.trim()) addActivity(query); }
                if (e.key === "Escape") { setQuery(""); setDropOpen(false); }
              }}
              placeholder="Add another activity…"
              style={{ flex: 1, border: 0, outline: "none", background: "transparent", fontSize: 13.5, color: "var(--ink)", fontFamily: "inherit" }}
            />
            {query && (
              <button onClick={() => { setQuery(""); setDropOpen(false); }} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--ink-mute)", lineHeight: 0, padding: 0 }}>
                <X style={{ width: 13, height: 13 }} strokeWidth={2} />
              </button>
            )}
          </div>

          {hasDropdown && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20, background: "var(--surface)", border: "0.5px solid var(--hairline)", borderTop: "none", borderRadius: "0 0 10px 10px", overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,0.12)" }}>
              {suggestions.map((name, i) => (
                <button
                  key={name}
                  onMouseDown={() => addActivity(name)}
                  style={{ width: "100%", textAlign: "left", background: "transparent", border: 0, borderBottom: (i < suggestions.length - 1 || showAddNew) ? "0.5px solid var(--hairline-soft)" : "none", padding: "9px 14px", cursor: "pointer", fontFamily: "inherit", fontSize: 13.5, color: "var(--ink)", fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-alt)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                >
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--primary)", flexShrink: 0 }} />
                  {name}
                </button>
              ))}
              {showAddNew && (
                <button
                  onMouseDown={() => addActivity(query)}
                  style={{ width: "100%", textAlign: "left", background: "transparent", border: 0, padding: "9px 14px", cursor: "pointer", fontFamily: "inherit", fontSize: 13.5, color: "var(--primary)", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-alt)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                >
                  <div style={{ width: 16, height: 16, borderRadius: 4, background: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ color: "#FFFBF1", fontSize: 14, fontWeight: 700, lineHeight: 1 }}>+</span>
                  </div>
                  Add &ldquo;{query.trim()}&rdquo;
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Companion picker ───────────────────────────────────────────────────────

function CompanionPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<FollowUser[]>([]);
  const [tagged, setTagged] = useState<FollowUser[]>([]); // cache of tagged user objects
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggle = (u: FollowUser) => {
    if (value.includes(u.clerk_user_id)) {
      onChange(value.filter(id => id !== u.clerk_user_id));
    } else {
      setTagged(prev => prev.find(t => t.clerk_user_id === u.clerk_user_id) ? prev : [...prev, u]);
      onChange([...value, u.clerk_user_id]);
    }
  };

  const handleSearch = (val: string) => {
    setQ(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!val.trim()) { setResults([]); return; }
    timerRef.current = setTimeout(() => {
      fetch(`/api/users?search=${encodeURIComponent(val)}&limit=10`)
        .then(r => r.ok ? r.json() : [])
        .then((data: FollowUser[]) => setResults(data))
        .catch(() => {});
    }, 200);
  };

  const UserRow = ({ u, onToggle }: { u: FollowUser; onToggle: () => void }) => {
    const on = value.includes(u.clerk_user_id);
    const displayName = u.display_name ?? u.username;
    return (
      <button onClick={onToggle} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: 10, background: on ? "rgba(31,61,46,0.08)" : "transparent", border: 0, cursor: "pointer", textAlign: "left", fontFamily: "inherit", width: "100%" }}>
        {u.avatar_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={u.avatar_url} alt={displayName} style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
          : <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--surface-alt)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "var(--ink-soft)", flexShrink: 0 }}>{displayName[0]?.toUpperCase()}</div>
        }
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {displayName}
            <span style={{ fontWeight: 400, color: "var(--ink-mute)", marginLeft: 5 }}>@{u.username}</span>
          </div>
        </div>
        {on && <Check style={{ width: 16, height: 16, color: "var(--primary)", flexShrink: 0 }} strokeWidth={2.4} />}
      </button>
    );
  };

  return (
    <div>
      {/* tagged chips */}
      {value.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {tagged.filter(u => value.includes(u.clerk_user_id)).map(u => {
            const name = (u.display_name ?? u.username).split(/\s+/)[0];
            return (
              <div key={u.clerk_user_id} style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 6px 4px 4px", borderRadius: 100, background: "var(--primary)" }}>
                {u.avatar_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={u.avatar_url} alt={name} style={{ width: 22, height: 22, borderRadius: "50%", objectFit: "cover" }} />
                  : <div style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(255,251,241,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#FFFBF1", fontWeight: 700 }}>{name[0]}</div>
                }
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "#FFFBF1", fontFamily: "inherit" }}>{name}</span>
                <button onClick={() => toggle(u)} style={{ background: "none", border: 0, cursor: "pointer", lineHeight: 0, padding: "2px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <X style={{ width: 12, height: 12, color: "rgba(255,251,241,0.8)" }} strokeWidth={2.4} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* search input */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface)", border: "0.5px solid var(--hairline)", borderRadius: 12, padding: "9px 12px", marginBottom: 6 }}>
        <Search style={{ width: 14, height: 14, color: "var(--ink-mute)", flexShrink: 0 }} strokeWidth={2} />
        <input value={q} onChange={e => handleSearch(e.target.value)} placeholder="Search for other users..."
          style={{ flex: 1, border: 0, outline: "none", background: "transparent", fontSize: 13.5, color: "var(--ink)", fontFamily: "inherit" }} />
        {q && <button onClick={() => { setQ(""); setResults([]); }} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--ink-mute)", lineHeight: 0, padding: 0 }}><X style={{ width: 13, height: 13 }} strokeWidth={2} /></button>}
      </div>

      {/* results */}
      {results.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 200, overflowY: "auto" }}>
          {results.map(u => <UserRow key={u.clerk_user_id} u={u} onToggle={() => toggle(u)} />)}
        </div>
      )}
      {q.trim() && results.length === 0 && (
        <div style={{ fontSize: 13, color: "var(--ink-mute)", padding: "6px 10px" }}>No users found</div>
      )}
    </div>
  );
}

// ── Would-return choice ────────────────────────────────────────────────────

function ReturnChoice({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {RETURN_OPTS.map(o => {
        const on = value === o.id;
        const col = o.id === "yes" ? "var(--visited)" : o.id === "no" ? "var(--ink-mute)" : "var(--bucket)";
        const textCol = on && o.id === "maybe" ? "#1B1A16" : on ? "#FFFBF1" : "var(--ink-soft)";
        return (
          <button key={o.id} onClick={() => onChange(on ? null : o.id)} style={{
            flex: 1, padding: "10px 4px", borderRadius: 12, cursor: "pointer",
            background: on ? col : "var(--surface-alt)", border: `0.5px solid ${on ? col : "var(--hairline)"}`,
            color: textCol, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            fontWeight: on ? 800 : 600, fontSize: 12.5, fontFamily: "inherit",
          }}>
            <Ic n={o.icon} size={15} sw={2.2} stroke={textCol} />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Photo uploader ─────────────────────────────────────────────────────────

const PHOTO_MAX_DIMENSION = 1600; // longest edge, px — matches the server's safety-net cap

// Downscale + recompress to JPEG in the browser before upload. Keeps requests well
// under Vercel's 4.5 MB function body limit and avoids storing full-res originals
// in R2 for photos that only ever render at feed/thumbnail size.
async function resizeImageFile(file: File, maxDim = PHOTO_MAX_DIMENSION, quality = 0.8): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
  return blob ?? file;
}

function PhotoUploader({ photos, cover, onAddPhotos, onRemove, onSetCover }: {
  photos: string[]; cover: string | null;
  onAddPhotos: (urls: string[]) => void;
  onRemove: (url: string) => void;
  onSetCover: (url: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadError(null);
    const urls: string[] = [];
    let failed = 0;
    for (const file of Array.from(files).slice(0, 10 - photos.length)) {
      try {
        // Resize client-side before it ever leaves the browser — Vercel Functions
        // hard-cap request bodies at 4.5 MB, and there's no point paying to store
        // (or wait to upload) a full-res original a feed thumbnail never needs.
        const resized = await resizeImageFile(file);
        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "image/jpeg" },
          body: resized,
        });
        if (!uploadRes.ok) {
          const err = await uploadRes.json().catch(() => ({}));
          throw new Error(err.error ?? `Upload failed (${uploadRes.status})`);
        }
        const { publicUrl } = await uploadRes.json();
        urls.push(publicUrl);
      } catch (e) {
        failed++;
        console.error("Photo upload error:", e);
      }
    }
    if (urls.length) onAddPhotos(urls);
    if (failed > 0) setUploadError(`${failed} photo${failed > 1 ? "s" : ""} failed to upload. Check your R2 configuration.`);
    setUploading(false);
  };

  return (
    <div>
      {photos.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <FieldLabel hint="★ to set cover">In this entry · {photos.length}</FieldLabel>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            {photos.map((url, idx) => {
              const isCover = cover === url;
              return (
                <div key={url} style={{ position: "relative", flexShrink: 0 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" onClick={() => setLightboxIdx(idx)} style={{ width: 76, height: 76, borderRadius: 11, objectFit: "cover", display: "block", cursor: "zoom-in" }} />
                  <button onClick={() => onSetCover(url)} style={{ position: "absolute", top: 5, left: 5, width: 22, height: 22, borderRadius: "50%", background: isCover ? "var(--accent)" : "rgba(255,251,241,0.85)", border: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }}>
                    <Star style={{ width: 12, height: 12, color: isCover ? "#FFFBF1" : "var(--ink-soft)", fill: isCover ? "#FFFBF1" : "none" }} strokeWidth={2} />
                  </button>
                  <button onClick={() => onRemove(url)} style={{ position: "absolute", top: 5, right: 5, width: 20, height: 20, borderRadius: "50%", background: "rgba(20,17,12,0.55)", border: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <X style={{ width: 12, height: 12, color: "#FFFBF1" }} strokeWidth={2.4} />
                  </button>
                  {isCover && <div style={{ position: "absolute", bottom: 5, left: 5, background: "rgba(20,17,12,0.6)", color: "#FFFBF1", ...mono, fontSize: 8.5, letterSpacing: 0.6, padding: "2px 5px", borderRadius: 100 }}>COVER</div>}
                  <div style={{ position: "absolute", bottom: 5, right: 5, background: "rgba(20,17,12,0.55)", color: "#FFFBF1", fontWeight: 800, fontSize: 10, borderRadius: "50%", width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>{idx + 1}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {lightboxIdx !== null && (
        <LightboxModal
          images={photos.map(url => ({ url }))}
          startIndex={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
        />
      )}

      {uploadError && (
        <div style={{ background: "rgba(192,64,64,0.08)", border: "0.5px solid rgba(192,64,64,0.3)", borderRadius: 10, padding: "9px 12px", marginBottom: 10, fontSize: 12.5, color: "#C04040", lineHeight: 1.4 }}>
          {uploadError}
        </div>
      )}

      {photos.length < 10 && (
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
          style={{ border: `1.5px dashed ${uploading ? "var(--primary)" : "var(--hairline)"}`, borderRadius: 14, padding: "20px 16px", background: "var(--surface-alt)", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, cursor: uploading ? "default" : "pointer" }}
        >
          <div style={{ width: 42, height: 42, borderRadius: 12, background: "var(--surface)", border: "0.5px solid var(--hairline)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Upload style={{ width: 20, height: 20, color: uploading ? "var(--ink-mute)" : "var(--primary)" }} strokeWidth={2} />
          </div>
          <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--ink)", textAlign: "center" }}>
            {uploading ? "Uploading…" : <>Drop photos or <span style={{ color: "var(--primary)" }}>browse</span></>}
          </div>
          <div style={{ ...mono, fontSize: 9.5, color: "var(--ink-mute)", letterSpacing: 0.6 }}>
            JPG · PNG · HEIC · up to {10 - photos.length} more
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple disabled={uploading} style={{ display: "none" }} onChange={e => handleFiles(e.target.files)} />
        </div>
      )}
    </div>
  );
}

// ── Visibility choice ──────────────────────────────────────────────────────

function VisibilityChoice({ value, onChange }: { value: VisitDraft["visibility"]; onChange: (v: VisitDraft["visibility"]) => void }) {
  const opts: { v: VisitDraft["visibility"]; desc: string }[] = [
    { v: "Private", desc: "Only you. Not posted to the feed." },
    { v: "Friends", desc: "Posted to your friends' feeds." },
    { v: "Public",  desc: "Posted publicly for all explorers." },
  ];
  const IconFor = { Private: Lock, Friends: Users, Public: Globe };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {opts.map(o => {
        const on = value === o.v;
        const Icon_ = IconFor[o.v];
        return (
          <button key={o.v} onClick={() => onChange(o.v)} style={{
            display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", borderRadius: 14, cursor: "pointer",
            background: on ? "var(--surface)" : "var(--surface-alt)",
            border: `1.5px solid ${on ? "var(--primary)" : "transparent"}`,
            textAlign: "left", fontFamily: "inherit",
          }}>
            <div style={{ width: 38, height: 38, borderRadius: 11, background: on ? "var(--primary)" : "var(--surface)", border: on ? "none" : "0.5px solid var(--hairline)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon_ style={{ width: 18, height: 18, color: on ? "#FFFBF1" : "var(--ink-soft)" }} strokeWidth={2} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14.5, color: "var(--ink)" }}>{o.v}</div>
              <div style={{ fontSize: 12, color: "var(--ink-mute)", marginTop: 1 }}>{o.desc}</div>
            </div>
            <div style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${on ? "var(--primary)" : "var(--hairline)"}`, background: on ? "var(--primary)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {on && <Check style={{ width: 12, height: 12, color: "#FFFBF1" }} strokeWidth={3} />}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Live preview card ──────────────────────────────────────────────────────

function PreviewChip({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, background: "var(--surface-alt)", borderRadius: 100, padding: "4px 9px", fontWeight: 600, fontSize: 11, color: "var(--ink-soft)", textTransform: "capitalize" }}>
      <Ic n={icon} size={11} sw={2.2} stroke="var(--ink-soft)" />
      {children}
    </div>
  );
}

function VisitPreview({ draft, park, userName, avatarUrl }: {
  draft: VisitDraft; park: ParkData | undefined; userName: string; avatarUrl: string;
}) {
  const VisIcon = draft.visibility === "Private" ? Lock : draft.visibility === "Public" ? Globe : Users;
  const selectedWeather = WEATHER_OPTS.filter(w => draft.weather.conds.includes(w.id));
  const days = dayCount(draft.dates.start, draft.dates.end);

  return (
    <div style={{ background: "var(--surface)", border: "0.5px solid var(--hairline)", borderRadius: 18, overflow: "hidden" }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "11px 13px 9px" }}>
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
        ) : (
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ color: "#FFFBF1", fontWeight: 800, fontSize: 13 }}>{userName[0]?.toUpperCase()}</span>
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)" }}>
            {userName} <span style={{ color: "var(--ink-mute)", fontWeight: 500 }}>· now</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, ...mono, fontSize: 9.5, color: "var(--primary)", letterSpacing: 0.4, fontWeight: 700 }}>
            <MapPin style={{ width: 11, height: 11 }} strokeWidth={2.4} />
            {park ? `${park.name.toUpperCase()} · ${park.states}` : "NO PARK"}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10.5, fontWeight: 600, color: "var(--ink-mute)", background: "var(--surface-alt)", padding: "3px 8px", borderRadius: 100 }}>
          <VisIcon style={{ width: 11, height: 11 }} strokeWidth={2.2} /> {draft.visibility}
        </div>
      </div>

      {/* cover — gradient placeholder or real photo */}
      {(draft.photos.length > 0 || draft.rating > 0) && (
        <div style={{ position: "relative" }}>
          {draft.photos.length > 0 ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={draft.cover ?? draft.photos[0]} alt="" style={{ width: "100%", height: 190, objectFit: "cover", display: "block" }} />
          ) : (
            <div style={{ height: 190, background: "linear-gradient(135deg, var(--primary), var(--accent))", opacity: 0.25 }} />
          )}
          {draft.rating > 0 && (
            <div style={{ position: "absolute", top: 10, right: 10, background: "rgba(20,17,12,0.55)", backdropFilter: "blur(8px)", padding: "5px 9px", borderRadius: 100, display: "flex", gap: 3 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} style={{ position: "relative", width: 12, height: 12 }}>
                  <Star style={{ position: "absolute", inset: 0, width: 12, height: 12, color: "rgba(255,255,255,0.3)" }} strokeWidth={1.6} fill="none" />
                  {draft.rating >= i + 0.5 && (
                    <Star style={{ position: "absolute", inset: 0, width: 12, height: 12, color: "#FFD580", clipPath: draft.rating >= i + 1 ? "none" : "inset(0 50% 0 0)" }} strokeWidth={1.6} fill="#FFD580" />
                  )}
                </div>
              ))}
            </div>
          )}
          {draft.photos.length > 1 && (
            <div style={{ position: "absolute", top: 10, left: 10, background: "rgba(20,17,12,0.55)", backdropFilter: "blur(8px)", color: "#FFFBF1", ...mono, fontSize: 10, fontWeight: 500, padding: "4px 8px", borderRadius: 100, display: "flex", alignItems: "center", gap: 4 }}>
              <Eye style={{ width: 11, height: 11 }} strokeWidth={2} /> {draft.photos.length}
            </div>
          )}
        </div>
      )}

      {/* body */}
      <div style={{ padding: "11px 13px 13px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontWeight: 600, fontSize: 11.5, color: "var(--ink-soft)" }}>
            <Ic n="calendar" size={13} sw={2} stroke="var(--ink-mute)" />
            {fmtRange(draft.dates.start, draft.dates.end)}
          </div>
          {days > 1 && (
            <div style={{ ...mono, fontSize: 9, letterSpacing: 0.6, color: "var(--accent)", background: "rgba(197,107,61,0.1)", padding: "2px 7px", borderRadius: 100, fontWeight: 700 }}>{days} DAYS</div>
          )}
        </div>
        {draft.title   && <div style={{ fontWeight: 800, fontSize: 17, color: "var(--ink)", letterSpacing: -0.3, lineHeight: 1.15, marginBottom: 5 }}>{draft.title}</div>}
        {draft.caption && <div style={{ fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.5 }}>{draft.caption.length > 160 ? draft.caption.slice(0, 160) + "…" : draft.caption}</div>}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 10 }}>
          {selectedWeather.map(w => <PreviewChip key={w.id} icon={w.icon}>{w.label}</PreviewChip>)}
          {draft.crowd > 0 && <PreviewChip icon="crowd">{CROWD_LABELS[draft.crowd - 1]}</PreviewChip>}
          {draft.difficulty > 0 && <PreviewChip icon="trail">{DIFF_LABELS[draft.difficulty - 1]}</PreviewChip>}
          {draft.activities.slice(0, 3).map(a => <PreviewChip key={a} icon="pin">{a}</PreviewChip>)}
        </div>
      </div>
    </div>
  );
}

// ── Step content blocks ────────────────────────────────────────────────────

function StepWhere({ draft, set, onOpenPark, park }: { draft: VisitDraft; set: SetFn; onOpenPark: () => void; park: ParkData | undefined }) {
  const days = dayCount(draft.dates.start, draft.dates.end);
  const hasPark = !!draft.parkCode;
  const lockedStyle: React.CSSProperties = {
    opacity: 0.38,
    pointerEvents: "none",
    transition: "opacity 200ms",
  };
  const unlockedStyle: React.CSSProperties = { transition: "opacity 200ms" };

  return (
    <>
      <Section mb={18}>
        <ParkHeroRow park={park} onChangePark={onOpenPark} />
      </Section>
      <div style={{ display: "flex", flexDirection: "column", gap: 18, ...(hasPark ? unlockedStyle : lockedStyle) }}>
        <Section title="Trip title" tag="optional" mb={0}>
          <input value={draft.title} onChange={e => set("title", e.target.value.slice(0, 80))} placeholder="Give this trip a name"
            style={{ width: "100%", background: "var(--surface)", border: "0.5px solid var(--hairline)", borderRadius: 14, padding: "13px 14px", fontSize: 15, color: "var(--ink)", outline: "none", fontWeight: 600, boxSizing: "border-box", fontFamily: "inherit" }} />
        </Section>
        <Section title="Dates" tag="required" mb={0}>
          <Card pad={14}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, paddingBottom: 12, borderBottom: "0.5px solid var(--hairline-soft)" }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16, color: "var(--ink)", letterSpacing: -0.3 }}>{fmtRange(draft.dates.start, draft.dates.end)}</div>
                <div style={{ ...mono, fontSize: 10, letterSpacing: 0.6, color: "var(--ink-mute)", marginTop: 2 }}>
                  {draft.dates.start ? `${days} DAY${days > 1 ? "S" : ""}` : "NO DATES YET"}
                </div>
              </div>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: "var(--primary)", color: "#FFFBF1", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Ic n="calendar" size={20} sw={2} stroke="#FFFBF1" />
              </div>
            </div>
            <DateRangeCalendar value={draft.dates} onChange={v => set("dates", v)} />
          </Card>
        </Section>
      </div>
    </>
  );
}

function StepRate({ draft, set }: { draft: VisitDraft; set: SetFn }) {
  return (
    <>
      <Section title="How was it?" tag="optional" mb={18}>
        <Card>
          <ScaleControl value={draft.rating} onChange={v => set("rating", v)} mode="stars" accent="var(--accent)" />
        </Card>
      </Section>
      <Section mb={18}>
        <Card>
          <RatingRow iconName="crowd" label="Crowd level" tag="optional">
            <ScaleControl value={draft.crowd} onChange={v => set("crowd", v)} mode="segmented" labels={CROWD_LABELS} accent="var(--primary)" />
          </RatingRow>
          <RatingRow iconName="trail" label="Trail difficulty" tag="optional" last>
            <ScaleControl value={draft.difficulty} onChange={v => set("difficulty", v)} mode="segmented" labels={DIFF_LABELS} accent="var(--primary)" />
          </RatingRow>
        </Card>
      </Section>
      <Section title="Weather" tag="optional" mb={18}>
        <Card><WeatherPicker value={draft.weather} onChange={v => set("weather", v)} /></Card>
      </Section>
      <Section title="Would you go back?" tag="optional">
        <ReturnChoice value={draft.wouldReturn} onChange={v => set("wouldReturn", v)} />
      </Section>
    </>
  );
}

function StepJournal({ draft, set, activities, npsActivityNames, originalPhotos }: { draft: VisitDraft; set: SetFn; activities: string[]; npsActivityNames: string[]; originalPhotos: Set<string> }) {
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 18, marginBottom: 18 }}>
        <Section title="Highlight" tag="optional" mb={0}>
          <div style={{ position: "relative" }}>
            <input value={draft.highlight} onChange={e => set("highlight", e.target.value.slice(0, 90))} placeholder="The one moment you'll remember"
              style={{ width: "100%", background: "var(--surface)", border: "0.5px solid var(--hairline)", borderRadius: 14, padding: "13px 52px 13px 14px", fontSize: 15, color: "var(--ink)", outline: "none", fontWeight: 600, boxSizing: "border-box", fontFamily: "inherit" }} />
            <div style={{ ...mono, position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 9.5, color: "var(--ink-mute)", letterSpacing: 0.6, pointerEvents: "none" }}>{draft.highlight.length}/90</div>
          </div>
        </Section>
        <Section title="Notes" tag="optional" mb={0}>
          <div style={{ position: "relative" }}>
            <textarea value={draft.notes} onChange={e => set("notes", e.target.value.slice(0, 2000))} placeholder="What did you see, hear, feel?"
              style={{ width: "100%", background: "var(--surface)", border: "0.5px solid var(--hairline)", borderRadius: 14, padding: "13px 14px 28px", fontSize: 15, color: "var(--ink)", outline: "none", lineHeight: 1.5, minHeight: 130, resize: "none", boxSizing: "border-box", fontFamily: "inherit" }} />
            <div style={{ ...mono, position: "absolute", right: 12, bottom: 10, fontSize: 9.5, color: "var(--ink-mute)", letterSpacing: 0.6, pointerEvents: "none" }}>{draft.notes.length}/2000</div>
          </div>
        </Section>
      </div>
      <Section title="Activities" tag="optional" mb={18}>
        <ActivityPicker value={draft.activities} onChange={v => set("activities", v)} options={activities} npsActivityNames={npsActivityNames} />
      </Section>
      <Section title="Who came along?" tag="optional" mb={18}>
        <CompanionPicker value={draft.companions} onChange={v => set("companions", v)} />
      </Section>
      <Section title="Photos" tag="optional" hint={`${draft.photos.length} of 10`}>
        <PhotoUploader photos={draft.photos} cover={draft.cover}
          onAddPhotos={urls => {
            const next = [...draft.photos, ...urls].slice(0, 10);
            set("photos", next);
            if (draft.cover == null && next.length > 0) set("cover", next[0]);
          }}
          onRemove={url => {
            const next = draft.photos.filter(p => p !== url);
            set("photos", next);
            if (draft.cover === url) set("cover", next[0] ?? null);
            // Only nuke it immediately if it was uploaded this session — photos already
            // attached to the saved visit stay live until the edit is actually submitted.
            if (!originalPhotos.has(url)) deletePhotos([url]);
          }}
          onSetCover={url => set("cover", url)}
        />
      </Section>
    </>
  );
}

function StepShare({ draft, set }: { draft: VisitDraft; set: SetFn }) {
  return (
    <>
      <Section title="Add a caption" tag="optional" mb={18}>
        <textarea
          value={draft.caption}
          onChange={e => set("caption", e.target.value.slice(0, 500))}
          placeholder="Share what made this trip special…"
          rows={4}
          style={{
            width: "100%", background: "var(--surface)", border: "0.5px solid var(--hairline)",
            borderRadius: 14, padding: "13px 14px", fontSize: 14, color: "var(--ink)",
            outline: "none", fontFamily: "inherit", resize: "none", lineHeight: 1.5,
            boxSizing: "border-box",
          }}
        />
        <div style={{ textAlign: "right", fontSize: 11, color: "var(--ink-mute)", marginTop: 4, fontFamily: "var(--font-mono)" }}>
          {draft.caption.length}/500
        </div>
      </Section>
      <Section title="Who can see this?">
        <VisibilityChoice value={draft.visibility} onChange={v => set("visibility", v)} />
      </Section>
    </>
  );
}

// ── Session reducer (avoids multiple setState calls in a single effect) ────────

type SessionState = {
  draft: VisitDraft;
  step: number;
  visited: Set<number>;
  showExitConfirm: boolean;
};

type SessionAction =
  | { type: 'open'; draft: VisitDraft; editMode: boolean }
  | { type: 'set-field'; key: keyof VisitDraft; value: VisitDraft[keyof VisitDraft] }
  | { type: 'set-draft'; draft: VisitDraft }
  | { type: 'go-to-step'; step: number }
  | { type: 'show-exit-confirm' }
  | { type: 'hide-exit-confirm' };

function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'open':
      return {
        draft: action.draft,
        step: 0,
        visited: action.editMode ? new Set([0, 1, 2, 3]) : new Set([0]),
        showExitConfirm: false,
      };
    case 'set-field':
      return { ...state, draft: { ...state.draft, [action.key]: action.value } };
    case 'set-draft':
      return { ...state, draft: action.draft };
    case 'go-to-step':
      return { ...state, step: action.step, visited: new Set([...state.visited, action.step]) };
    case 'show-exit-confirm':
      return { ...state, showExitConfirm: true };
    case 'hide-exit-confirm':
      return { ...state, showExitConfirm: false };
  }
}

// ── Main modal ─────────────────────────────────────────────────────────────

type SetFn = <K extends keyof VisitDraft>(k: K, v: VisitDraft[K]) => void;

interface LogVisitModalProps {
  open: boolean;
  onClose: () => void;
  onPosted?: () => void;
  initialDraft?: Partial<VisitDraft>;
  editMode?: boolean;
}

export function LogVisitModal({ open, onClose, onPosted, initialDraft, editMode = false }: LogVisitModalProps) {
  const { user } = useUser();
  const { toast } = useToast();
  const [session, dispatch] = useReducer(sessionReducer, undefined, () => ({
    draft: makeBlankDraft(),
    step: 0,
    visited: new Set([0]) as Set<number>,
    showExitConfirm: false,
  }));
  const { draft, step, visited, showExitConfirm } = session;

  const [parks, setParks]               = useState<ParkData[]>([]);
  const [showParkPicker, setShowParkPicker] = useState(false);
  const [submitting, setSubmitting]           = useState(false);
  const [npsActivityCache, setNpsActivityCache] = useState<{ parkCode: string; names: string[] } | null>(null);
  const [restoreBannerDraft, setRestoreBannerDraft] = useState<SavedDraft | null>(
    () => { const d = loadDrafts(); return d.length > 0 ? d[0] : null; }
  );
  const draftId   = useRef("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  const isDirty   = useRef(false);
  // Photo URLs already persisted server-side before this session started (populated
  // when editing an existing visit). Anything in draft.photos NOT in this set was
  // freshly uploaded this session and is safe to delete from storage if abandoned.
  const originalPhotos = useRef<Set<string>>(new Set());

  // Single dispatch on open — avoids multiple setState calls in one effect
  useEffect(() => {
    if (open) {
      draftId.current = `draft-${Date.now()}`;
      isDirty.current = false;
      originalPhotos.current = new Set(editMode ? (initialDraft?.photos ?? []) : []);
      dispatch({
        type: 'open',
        draft: initialDraft ? { ...makeBlankDraft(), ...initialDraft } : makeBlankDraft(),
        editMode,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const goToStep = useCallback((i: number) => {
    dispatch({ type: 'go-to-step', step: i });
  }, []);

  const set = useCallback(<K extends keyof VisitDraft>(k: K, v: VisitDraft[K]) => {
    isDirty.current = true;
    dispatch({ type: 'set-field', key: k, value: v });
  }, []) as SetFn;

  useEffect(() => {
    if (!open) return;
    fetch("/api/parks").then(r => r.ok ? r.json() : []).then(setParks).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!draft.parkCode) return;
    let cancelled = false;
    fetch(`/api/parks/${draft.parkCode}/nps`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { activities?: string[] } | null) => {
        if (!cancelled) setNpsActivityCache({ parkCode: draft.parkCode, names: data?.activities ?? [] });
      })
      .catch(() => { if (!cancelled) setNpsActivityCache({ parkCode: draft.parkCode, names: [] }); });
    return () => { cancelled = true; };
  }, [draft.parkCode]);


  useEffect(() => {
    if (centerRef.current) centerRef.current.scrollTop = 0;
  }, [step]);

  const park        = parks.find(p => p.park_code === draft.parkCode);
  const availableActivities = (() => {
    if (!npsActivityCache || npsActivityCache.parkCode !== draft.parkCode) return ALL_ACTIVITIES;
    const matched = matchActivities(npsActivityCache.names);
    return matched.length ? matched : ALL_ACTIVITIES;
  })();
  const userName    = user?.fullName ?? user?.username ?? "Explorer";
  const avatarUrl   = user?.imageUrl ?? "";
  const last        = step === STEPS.length - 1;
  const stepComplete = (i: number) => {
    if (i === 0) return !!draft.parkCode && !!draft.dates.start;
    return true;
  };
  const canContinue = stepComplete(step);

  // Green check: visited AND required fields met (reuses stepComplete).
  const isStepDone = (i: number) => visited.has(i) && stepComplete(i);

  const handleClose = useCallback(() => {
    dispatch({ type: 'open', draft: makeBlankDraft(), editMode: false });
    draftId.current = "";
    isDirty.current = false;
    const nextDrafts = loadDrafts();
    setRestoreBannerDraft(nextDrafts.length > 0 ? nextDrafts[0] : null);
    onClose();
  }, [onClose]);

  const handleRequestClose = useCallback(() => {
    const shouldWarn = editMode ? isDirty.current : draftHasContent(draft);
    if (shouldWarn) {
      dispatch({ type: 'show-exit-confirm' });
    } else {
      handleClose();
    }
  }, [draft, editMode, handleClose]);

  const handleSaveAsDraft = useCallback(() => {
    const parkName = parks.find(p => p.park_code === draft.parkCode)?.name;
    upsertDraft(draft, parkName, draftId.current);
    handleClose();
  }, [draft, parks, handleClose]);


  const handleSubmit = async () => {
    if (!draft.parkCode || !draft.dates.start) return;
    setSubmitting(true);
    try {
      // In edit mode, if the park changed, remove the old visit record first.
      // skip_photo_cleanup: this is a relabel, not a real delete — the same photos
      // are about to be re-attached to the new visit row below.
      if (editMode && initialDraft?.parkCode && initialDraft.parkCode !== draft.parkCode) {
        await fetch(`/api/visits?park_code=${initialDraft.parkCode}&skip_photo_cleanup=1`, { method: "DELETE" });
      }
      const visitRes = await fetch("/api/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          park_code:          draft.parkCode,
          visited_date:       draft.dates.start.toISOString(),
          end_date:           draft.dates.end?.toISOString() ?? null,
          rating:             draft.rating > 0 ? draft.rating : null,
          crowd:              draft.crowd > 0 ? draft.crowd : null,
          difficulty:         draft.difficulty > 0 ? draft.difficulty : null,
          weather_conditions: draft.weather.conds.length > 0 ? draft.weather.conds : null,
          activities:         draft.activities.length > 0 ? draft.activities : null,
          companions:         draft.companions.length > 0 ? draft.companions : null,
          would_return:       draft.wouldReturn ?? null,
          highlight:          draft.highlight || null,
          title:              draft.title || null,
          notes:              draft.notes || null,
          photos:             draft.photos.length > 0 ? draft.photos : null,
          cover_photo:        draft.cover ?? null,
          visibility:         draft.visibility.toLowerCase(),
        }),
      });

      if (!editMode && draft.visibility !== "Private") {
        const { visit } = await visitRes.json();
        if (visit?.id) {
          await fetch("/api/posts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              caption:   draft.caption || null,
              photos:    draft.photos.length > 0 ? draft.photos : null,
              park_code: draft.parkCode,
              visit_id:  visit.id,
            }),
          });
        }
      }

      if (editMode) {
        // Original photos dropped during this edit are no longer referenced anywhere — clean them up.
        deletePhotos([...originalPhotos.current].filter(p => !draft.photos.includes(p)));
      }
      onPosted?.();
      handleClose();
      if (editMode) {
        toast("Visit updated");
      } else if (draft.visibility !== "Private") {
        toast("Visit logged and shared to feed");
      } else {
        toast("Visit logged");
      }
    } catch {
      // keep open on error
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const renderStep = (key: string) => {
    if (key === "where")   return <StepWhere   draft={draft} set={set} onOpenPark={() => setShowParkPicker(true)} park={park} />;
    if (key === "rate")    return <StepRate    draft={draft} set={set} />;
    if (key === "journal") return <StepJournal draft={draft} set={set} activities={availableActivities} npsActivityNames={npsActivityCache?.names ?? []} originalPhotos={originalPhotos.current} />;
    if (key === "share")   return <StepShare   draft={draft} set={set} />;
    return null;
  };

  return (
    <div onClick={handleRequestClose} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(12px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{`
        @keyframes pqLogIn { from { transform: scale(0.96); opacity: 0 } to { transform: scale(1); opacity: 1 } }
        .pq-stepnav:hover { background: rgba(31,61,46,0.05) !important; }
      `}</style>

      <div onClick={e => e.stopPropagation()} style={{ position: "relative", width: 1120, height: 724, background: "var(--bg)", borderRadius: 18, border: "0.5px solid var(--hairline)", boxShadow: "0 24px 60px rgba(0,0,0,0.4)", display: "flex", overflow: "hidden", animation: "pqLogIn 220ms cubic-bezier(.2,.7,.3,1)", fontFamily: "inherit" }}>

        {/* ── Left: step nav ─────────────────────────────── */}
        <div style={{ width: 248, flexShrink: 0, background: "rgba(245,239,224,0.5)", borderRight: "0.5px solid var(--hairline)", padding: "22px 16px", display: "flex", flexDirection: "column" }}>
          <Kicker>{editMode ? "EDIT ENTRY" : "NEW ENTRY"}</Kicker>
          <div style={{ fontWeight: 800, fontSize: 22, color: "var(--ink)", letterSpacing: -0.4, marginTop: 4, marginBottom: 20 }}>{editMode ? "Edit entry" : "Log a visit"}</div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {STEPS.map((s, i) => {
              const active = step === i;
              const done   = !active && isStepDone(i);
              const reachable = visited.has(i) || (i === step + 1 && canContinue);
              return (
                <button key={s.key} className="pq-stepnav"
                  onClick={() => { if (reachable) goToStep(i); }}
                  style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 11px", borderRadius: 11, cursor: reachable ? "pointer" : "default", background: active ? "var(--surface)" : "transparent", border: `0.5px solid ${active ? "var(--hairline)" : "transparent"}`, textAlign: "left", transition: "background 120ms", fontFamily: "inherit" }}
                >
                  <div style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: active ? "var(--primary)" : done ? "var(--visited)" : "var(--surface-alt)", color: (active || done) ? "#FFFBF1" : "var(--ink-mute)", ...mono, fontSize: 11, fontWeight: 700 }}>
                    {done ? <Check style={{ width: 15, height: 15 }} strokeWidth={2.6} /> : s.no}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: active ? 800 : 600, fontSize: 13.5, color: active ? "var(--ink)" : "var(--ink-soft)" }}>{s.label}</div>
                    <div style={{ fontSize: 11, color: "var(--ink-mute)", marginTop: 1 }}>{s.sub}</div>
                  </div>
                </button>
              );
            })}
          </div>

          <div style={{ flex: 1 }} />
        </div>

        {/* ── Center: fields ─────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "18px 28px 14px", borderBottom: "0.5px solid var(--hairline-soft)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <Kicker>STEP {STEPS[step].no} OF 04</Kicker>
              <div style={{ fontWeight: 800, fontSize: 20, color: "var(--ink)", letterSpacing: -0.3, marginTop: 2 }}>{STEPS[step].label}</div>
            </div>
            <button onClick={handleRequestClose} style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--surface)", border: "0.5px solid var(--hairline)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <X style={{ width: 17, height: 17, color: "var(--ink-soft)" }} strokeWidth={2.4} />
            </button>
          </div>

          <div ref={centerRef} style={{ flex: 1, overflowY: "auto", padding: "20px 28px 24px" }}>
            {restoreBannerDraft && !editMode && step === 0 && (
              <div style={{ background: "rgba(31,61,46,0.07)", border: "0.5px solid rgba(31,61,46,0.18)", borderRadius: 12, padding: "11px 14px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)" }}>You have a saved draft</div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-mute)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {restoreBannerDraft.parkName ?? "No park selected"}{restoreBannerDraft.draft.title ? ` — ${restoreBannerDraft.draft.title}` : ""} · {draftAge(restoreBannerDraft.savedAt)}
                  </div>
                </div>
                <button onClick={() => { dispatch({ type: 'set-draft', draft: restoreBannerDraft.draft }); draftId.current = restoreBannerDraft.id; setRestoreBannerDraft(null); }} style={{ padding: "7px 14px", borderRadius: 8, border: 0, background: "var(--primary)", color: "#FFFBF1", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
                  Restore
                </button>
                <button onClick={() => { deleteDraft(restoreBannerDraft.id); deletePhotos(restoreBannerDraft.draft.photos); setRestoreBannerDraft(null); }} style={{ padding: "7px 14px", borderRadius: 8, border: "0.5px solid var(--hairline)", background: "transparent", color: "var(--ink-mute)", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
                  Discard
                </button>
                <button onClick={() => setRestoreBannerDraft(null)} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--ink-mute)", lineHeight: 0, padding: 4, flexShrink: 0 }}>
                  <X style={{ width: 14, height: 14 }} strokeWidth={2.4} />
                </button>
              </div>
            )}
            {renderStep(STEPS[step].key)}
          </div>

          <div style={{ padding: "14px 28px", borderTop: "0.5px solid var(--hairline-soft)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            {step > 0 ? (
              <button onClick={() => goToStep(step - 1)} style={{ padding: "10px 18px", borderRadius: 10, border: "0.5px solid var(--hairline)", background: "var(--surface)", color: "var(--ink)", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit" }}>
                <ChevronLeft style={{ width: 15, height: 15 }} strokeWidth={2.4} /> Back
              </button>
            ) : (
              <div style={{ width: 88 }} />
            )}
            <div style={{ display: "flex", gap: 5 }}>
              {STEPS.map((_, i) => <div key={i} style={{ width: i === step ? 20 : 6, height: 6, borderRadius: 3, background: i <= step ? "var(--primary)" : "var(--hairline)", transition: "all 200ms" }} />)}
            </div>
            <button onClick={() => { if (last) handleSubmit(); else if (canContinue) goToStep(step + 1); }} disabled={!canContinue || submitting}
              style={{ padding: "11px 20px", borderRadius: 10, border: 0, background: canContinue ? "var(--primary)" : "var(--surface-alt)", color: canContinue ? "#FFFBF1" : "var(--ink-mute)", fontWeight: 800, fontSize: 13, cursor: canContinue && !submitting ? "pointer" : "default", display: "flex", alignItems: "center", gap: 7, fontFamily: "inherit", boxShadow: canContinue ? "0 4px 12px rgba(31,61,46,0.35)" : "none", opacity: submitting ? 0.7 : 1 }}>
              {last
                ? <><Check style={{ width: 15, height: 15 }} strokeWidth={2.6} /> {submitting ? (editMode ? "Saving…" : "Posting…") : (editMode ? "Save changes" : "Post entry")}</>
                : <>Continue <ArrowRight style={{ width: 15, height: 15 }} strokeWidth={2.4} /></>
              }
            </button>
          </div>
        </div>

        {/* ── Right: live preview (share step only) ─────── */}
        {last && (
          <div style={{ width: 372, flexShrink: 0, borderLeft: "0.5px solid var(--hairline)", background: "rgba(245,239,224,0.4)", padding: "20px 22px", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
              <Eye style={{ width: 14, height: 14, color: "var(--ink-mute)" }} strokeWidth={2} />
              <Kicker>LIVE PREVIEW</Kicker>
            </div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              <VisitPreview draft={draft} park={park} userName={userName} avatarUrl={avatarUrl} />
            </div>
          </div>
        )}

        {showParkPicker && (
          <ParkPickerDialog parks={parks} value={draft.parkCode} onClose={() => setShowParkPicker(false)} onPick={code => { set("parkCode", code); setShowParkPicker(false); }} />
        )}

        {showExitConfirm && (
          <div style={{ position: "absolute", inset: 0, zIndex: 130, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: "var(--bg)", borderRadius: 16, padding: "28px", width: 360, border: "0.5px solid var(--hairline)", boxShadow: "0 16px 40px rgba(0,0,0,0.35)" }}>
              <div style={{ fontWeight: 800, fontSize: 18, color: "var(--ink)", letterSpacing: -0.3, marginBottom: 6 }}>
                {editMode ? "Discard changes?" : "Leave without saving?"}
              </div>
              <div style={{ fontSize: 13, color: "var(--ink-mute)", lineHeight: 1.5, marginBottom: 22 }}>
                {editMode
                  ? "Your edits haven’t been saved yet."
                  : "Your changes haven’t been posted yet. Save a draft to come back to them later."}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {!editMode && (
                  <button onClick={handleSaveAsDraft} style={{ padding: "12px", borderRadius: 10, border: 0, background: "var(--primary)", color: "#FFFBF1", fontWeight: 800, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit" }}>
                    Save as draft
                  </button>
                )}
                <button onClick={() => {
                  // Clean up whatever photos are abandoned by this discard: in edit mode only
                  // ones added this session (the visit's original photos stay live); for a
                  // brand-new entry, nothing was ever submitted so all of them are orphaned.
                  const orphaned = editMode
                    ? draft.photos.filter(p => !originalPhotos.current.has(p))
                    : draft.photos;
                  deletePhotos(orphaned);
                  dispatch({ type: 'hide-exit-confirm' });
                  handleClose();
                }} style={{ padding: "12px", borderRadius: 10, border: editMode ? 0 : "0.5px solid var(--hairline)", background: editMode ? "#C04040" : "transparent", color: editMode ? "#FFFBF1" : "var(--ink)", fontWeight: 700, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit" }}>
                  Discard changes
                </button>
                <button onClick={() => dispatch({ type: 'hide-exit-confirm' })} style={{ padding: "9px", borderRadius: 10, border: 0, background: "transparent", color: "var(--ink-mute)", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                  Keep editing
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
