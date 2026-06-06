"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import {
  Star, ChevronLeft, ChevronRight, X, Lock, Users, Globe,
  MapPin, Image, PenLine, Search, SlidersHorizontal, Pencil, Trash2,
} from "lucide-react";
import { DesktopShell } from "@/components/desktop/DesktopShell";
import { LightboxModal } from "@/components/LightboxModal";
import { LogVisitModal, type VisitDraft } from "@/components/LogVisitModal";

// ── Types ─────────────────────────────────────────────────────────────────────

interface JournalEntry {
  id: number;
  park_code: string;
  park_name: string | null;
  states: string | null;
  visited_date: string | null;
  end_date: string | null;
  is_bucket_list: boolean;
  rating: number | null;
  crowd: number | null;
  difficulty: number | null;
  weather_conditions: string[] | null;
  activities: string[] | null;
  companions: string[] | null;
  would_return: string | null;
  highlight: string | null;
  title: string | null;
  notes: string | null;
  photos: string[] | null;
  cover_photo: string | null;
  visibility: string | null;
  created_at: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTHS     = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTHS_ABB = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

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

const WEATHER_LABELS: Record<string, string> = {
  clear:"Clear", partly:"Partly cloudy", cloudy:"Cloudy", rain:"Rain",
  storm:"Storms", snow:"Snow", fog:"Fog", wind:"Windy",
};
const CROWD_LABELS  = ["","Empty","Quiet","Moderate","Busy","Packed"];
const DIFF_LABELS   = ["","Easy","Light","Moderate","Hard","Strenuous"];
const RETURN_LABELS: Record<string, string> = { yes:"Definitely", maybe:"Maybe", no:"Probably not" };

function stateLabel(code: string): string {
  return code.split("/").map(s => STATE_NAMES[s.trim()] ?? s.trim()).join(" / ");
}

function photos(entry: JournalEntry): string[] {
  return entry.photos ?? [];
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function fmtRange(start: string | null, end: string | null): string {
  if (!start) return "";
  const s = new Date(start);
  if (!end) return `${MONTHS[s.getMonth()]} ${s.getDate()}, ${s.getFullYear()}`;
  const e = new Date(end);
  if (s.getFullYear() === e.getFullYear()) {
    if (s.getMonth() === e.getMonth())
      return `${MONTHS[s.getMonth()]} ${s.getDate()}–${e.getDate()}, ${e.getFullYear()}`;
    return `${MONTHS_ABB[s.getMonth()]} ${s.getDate()} – ${MONTHS_ABB[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`;
  }
  return `${MONTHS_ABB[s.getMonth()]} ${s.getDate()}, ${s.getFullYear()} – ${MONTHS_ABB[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`;
}

function dayCount(start: string | null, end: string | null): number {
  if (!start) return 0;
  if (!end) return 1;
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1;
}

function entryYear(e: JournalEntry): number {
  if (!e.visited_date) return 0;
  return new Date(e.visited_date).getFullYear();
}

const GRADIENTS = [
  "linear-gradient(160deg,#1F3D2E 0%,#2F7A4A 55%,#C56B3D 130%)",
  "linear-gradient(160deg,#2D4F66 0%,#1F3D2E 55%,#D89A3A 130%)",
  "linear-gradient(160deg,#7B3A1F 0%,#C56B3D 55%,#1F3D2E 130%)",
  "linear-gradient(160deg,#3A2E5C 0%,#6E97A3 55%,#D89A3A 130%)",
  "linear-gradient(160deg,#2F7A4A 0%,#1F3D2E 55%,#2D4F66 130%)",
];
function parkGradient(code: string): string {
  const idx = code.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % GRADIENTS.length;
  return GRADIENTS[idx];
}

const mono: React.CSSProperties = { fontFamily: "var(--font-mono)" };

// ── Sub-components ────────────────────────────────────────────────────────────

function Stars({ value, size = 13 }: { value: number; size?: number }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} style={{ position: "relative", width: size, height: size }}>
          <Star style={{ position: "absolute", inset: 0, width: size, height: size, color: "var(--ink-mute)" }} strokeWidth={1.6} fill="none" />
          {value >= i + 0.5 && (
            <Star style={{ position: "absolute", inset: 0, width: size, height: size, color: "var(--accent)", clipPath: value >= i + 1 ? "none" : "inset(0 50% 0 0)" }} strokeWidth={1.6} fill="var(--accent)" />
          )}
        </div>
      ))}
      <span style={{ ...mono, fontSize: size - 2, color: "var(--ink-mute)", marginLeft: 4 }}>{value}/5</span>
    </div>
  );
}

function VisChip({ v }: { v: string | null }) {
  const map: Record<string, { Icon: typeof Lock; color: string }> = {
    private: { Icon: Lock,  color: "var(--ink-mute)" },
    friends: { Icon: Users, color: "var(--primary)" },
    public:  { Icon: Globe, color: "var(--visited)" },
  };
  const key = (v ?? "private").toLowerCase();
  const { Icon, color } = map[key] ?? map.private;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, ...mono, fontSize: 9, letterSpacing: 0.8, fontWeight: 600, color, textTransform: "uppercase" }}>
      <Icon style={{ width: 10, height: 10 }} strokeWidth={2} /> {key}
    </div>
  );
}

function MetaChip({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "var(--surface-alt)", borderRadius: 100, padding: "4px 9px", fontSize: 12, color: "var(--ink-soft)", fontWeight: 600 }}>
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ ...mono, fontSize: 9.5, letterSpacing: 1.2, color: "var(--ink-mute)", fontWeight: 600, textTransform: "uppercase", marginBottom: 8 }}>
      {children}
    </div>
  );
}

// ── Entry card ────────────────────────────────────────────────────────────────

function EntryCard({ entry, selected, onClick }: { entry: JournalEntry; selected: boolean; onClick: () => void }) {
  const imgs = photos(entry);
  const cover = entry.cover_photo ?? imgs[0] ?? null;
  const days = dayCount(entry.visited_date, entry.end_date);

  return (
    <button
      onClick={onClick}
      style={{
        width: "100%", display: "flex", gap: 0,
        background: selected ? "var(--surface)" : "transparent",
        border: `0.5px solid ${selected ? "var(--primary)" : "var(--hairline)"}`,
        borderRadius: 14, overflow: "hidden", cursor: "pointer", textAlign: "left",
        transition: "border-color 120ms, background 120ms", fontFamily: "inherit",
        boxShadow: selected ? "0 0 0 1.5px var(--primary)" : "none",
      }}
    >
      {/* Thumbnail */}
      <div style={{ width: 80, flexShrink: 0, position: "relative", background: parkGradient(entry.park_code) }}>
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        )}
        {imgs.length > 1 && (
          <div style={{ position: "absolute", bottom: 6, right: 6, background: "rgba(0,0,0,0.55)", color: "#FFFBF1", ...mono, fontSize: 9, fontWeight: 600, padding: "2px 5px", borderRadius: 100, display: "flex", alignItems: "center", gap: 3 }}>
            <Image style={{ width: 9, height: 9 }} strokeWidth={2} /> {imgs.length}
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0, padding: "12px 14px 12px 13px", display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <MapPin style={{ width: 10, height: 10, color: "var(--primary)", flexShrink: 0 }} strokeWidth={2.4} />
          <span style={{ ...mono, fontSize: 9.5, letterSpacing: 0.8, color: "var(--primary)", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {entry.park_name?.toUpperCase() ?? entry.park_code.toUpperCase()}
          </span>
        </div>
        <div style={{ fontWeight: 800, fontSize: 14, color: "var(--ink)", letterSpacing: -0.2, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {entry.title || fmtDate(entry.visited_date)}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--ink-mute)", display: "flex", alignItems: "center", gap: 6 }}>
          {fmtRange(entry.visited_date, entry.end_date)}
          {days > 1 && (
            <span style={{ ...mono, fontSize: 9, background: "var(--surface-alt)", borderRadius: 100, padding: "1px 6px", color: "var(--accent)", fontWeight: 700 }}>{days}D</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
          {entry.rating ? <Stars value={entry.rating} size={11} /> : <span />}
          <VisChip v={entry.visibility} />
        </div>
      </div>
    </button>
  );
}

// ── Detail overlay ────────────────────────────────────────────────────────────

function EntryDetail({
  entry, onClose, onEdit, onDelete,
}: {
  entry: JournalEntry;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const imgs = photos(entry);
  const cover = entry.cover_photo ?? imgs[0] ?? null;
  const coverIdx = cover ? Math.max(0, imgs.indexOf(cover)) : 0;
  const [photoIdx, setPhotoIdx] = useState(coverIdx);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [companionProfiles, setCompanionProfiles] = useState<{ clerk_user_id: string; username: string; display_name: string | null; avatar_url: string | null }[]>([]);
  const days = dayCount(entry.visited_date, entry.end_date);

  useEffect(() => { setPhotoIdx(coverIdx); setConfirmDelete(false); }, [entry.id, coverIdx]);

  useEffect(() => {
    if (!entry.companions?.length) { setCompanionProfiles([]); return; }
    fetch(`/api/users?ids=${entry.companions.join(',')}`)
      .then(r => r.ok ? r.json() : [])
      .then(setCompanionProfiles)
      .catch(() => {});
  }, [entry.companions]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);

  const handleDelete = async () => {
    setDeleting(true);
    await onDelete();
    setDeleting(false);
  };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(10px)", display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <style>{`@keyframes pqDetailIn { from { transform: scale(0.97); opacity: 0 } to { transform: scale(1); opacity: 1 } }`}</style>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 700, maxHeight: "90vh", background: "var(--bg)", borderRadius: 18,
          border: "0.5px solid var(--hairline)", boxShadow: "0 24px 80px rgba(0,0,0,0.45)",
          display: "flex", flexDirection: "column", overflow: "hidden",
          animation: "pqDetailIn 200ms cubic-bezier(.2,.7,.3,1)",
        }}
      >
        {/* ── Photo section ── */}
        {imgs.length > 0 ? (
          <div style={{ flexShrink: 0 }}>

            {/* Hero — full-width, no radius (modal clips top corners) */}
            <div style={{ position: "relative", height: 360, background: parkGradient(entry.park_code) }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imgs[photoIdx]}
                alt=""
                onClick={() => setLightboxOpen(true)}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", cursor: "zoom-in" }}
              />
              {/* subtle vignette so close button is readable */}
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, transparent 40%)" }} />

              {/* Close */}
              <button onClick={onClose} style={{ position: "absolute", top: 12, right: 12, width: 30, height: 30, borderRadius: "50%", background: "rgba(20,17,12,0.55)", border: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10 }}>
                <X style={{ width: 13, height: 13, color: "#FFFBF1" }} strokeWidth={2.4} />
              </button>

              {/* Prev / next */}
              {imgs.length > 1 && (
                <>
                  <button onClick={() => setPhotoIdx(i => (i - 1 + imgs.length) % imgs.length)} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 34, height: 34, borderRadius: "50%", background: "rgba(255,251,241,0.88)", border: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <ChevronLeft style={{ width: 16, height: 16, color: "var(--ink)" }} strokeWidth={2.4} />
                  </button>
                  <button onClick={() => setPhotoIdx(i => (i + 1) % imgs.length)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", width: 34, height: 34, borderRadius: "50%", background: "rgba(255,251,241,0.88)", border: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <ChevronRight style={{ width: 16, height: 16, color: "var(--ink)" }} strokeWidth={2.4} />
                  </button>
                </>
              )}
            </div>

            {/* Thumbnail strip — only when there are multiple images */}
            {imgs.length > 1 && (
              <div style={{ display: "flex", gap: 3, padding: "6px 8px", overflowX: "auto", background: "rgba(0,0,0,0.7)", scrollbarWidth: "none" }}>
                {imgs.map((url, i) => (
                  <button
                    key={url}
                    onClick={() => setPhotoIdx(i)}
                    style={{
                      flexShrink: 0, padding: 0,
                      border: `2px solid ${i === photoIdx ? "#FFFBF1" : "transparent"}`,
                      borderRadius: 5, overflow: "hidden", cursor: "pointer", background: "none",
                      opacity: i === photoIdx ? 1 : 0.55,
                      transition: "opacity 120ms, border-color 120ms",
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" style={{ width: 60, height: 44, objectFit: "cover", display: "block" }} />
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px 0" }}>
            <div />
            <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--surface-alt)", border: "0.5px solid var(--hairline)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <X style={{ width: 14, height: 14, color: "var(--ink-soft)" }} strokeWidth={2.4} />
            </button>
          </div>
        )}

        {/* ── Body ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px 24px" }}>

          {/* Park + state */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <MapPin style={{ width: 13, height: 13, color: "var(--primary)", flexShrink: 0 }} strokeWidth={2.4} />
            <span style={{ ...mono, fontSize: 10.5, letterSpacing: 1, color: "var(--primary)", fontWeight: 700, textTransform: "uppercase" }}>
              {entry.park_name ?? entry.park_code}
            </span>
            {entry.states && (
              <span style={{ ...mono, fontSize: 10, color: "var(--ink-mute)", fontWeight: 500 }}>· {stateLabel(entry.states)}</span>
            )}
          </div>

          {/* Title */}
          {entry.title && (
            <div style={{ fontWeight: 800, fontSize: 22, color: "var(--ink)", letterSpacing: -0.4, lineHeight: 1.15, marginBottom: 10 }}>
              {entry.title}
            </div>
          )}

          {/* Date + duration + visibility */}
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 18, paddingBottom: 16, borderBottom: "0.5px solid var(--hairline-soft)" }}>
            <span style={{ fontSize: 13, color: "var(--ink-soft)", fontWeight: 600 }}>
              {fmtRange(entry.visited_date, entry.end_date)}
            </span>
            {days > 1 && (
              <span style={{ ...mono, fontSize: 10, background: "rgba(197,107,61,0.12)", color: "var(--accent)", borderRadius: 100, padding: "2px 7px", fontWeight: 700 }}>{days} DAYS</span>
            )}
            {entry.rating != null && entry.rating > 0 && <Stars value={entry.rating} size={15} />}
            <VisChip v={entry.visibility} />
          </div>

          {/* Highlight */}
          {entry.highlight && (
            <div style={{ marginBottom: 18 }}>
              <SectionLabel>Highlight</SectionLabel>
              <div style={{ fontSize: 15, color: "var(--ink)", fontWeight: 600, lineHeight: 1.5, fontStyle: "italic" }}>
                &ldquo;{entry.highlight}&rdquo;
              </div>
            </div>
          )}

          {/* Conditions row: crowd, difficulty, weather, would return */}
          {(entry.crowd || entry.difficulty || (entry.weather_conditions?.length) || entry.would_return) && (
            <div style={{ marginBottom: 18 }}>
              <SectionLabel>Conditions</SectionLabel>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {entry.crowd != null && entry.crowd > 0 && (
                  <MetaChip>👥 {CROWD_LABELS[entry.crowd]}</MetaChip>
                )}
                {entry.difficulty != null && entry.difficulty > 0 && (
                  <MetaChip>🥾 {DIFF_LABELS[entry.difficulty]}</MetaChip>
                )}
                {entry.weather_conditions?.map(w => (
                  <MetaChip key={w}>🌤 {WEATHER_LABELS[w] ?? w}</MetaChip>
                ))}
                {entry.would_return && (
                  <MetaChip>
                    {entry.would_return === "yes" ? "❤️" : entry.would_return === "maybe" ? "🤔" : "☁️"}
                    {" "}Return: {RETURN_LABELS[entry.would_return] ?? entry.would_return}
                  </MetaChip>
                )}
              </div>
            </div>
          )}

          {/* Activities */}
          {entry.activities && entry.activities.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <SectionLabel>Activities</SectionLabel>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {entry.activities.map(a => (
                  <MetaChip key={a}>{a.charAt(0).toUpperCase() + a.slice(1)}</MetaChip>
                ))}
              </div>
            </div>
          )}

          {/* Companions */}
          {companionProfiles.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <SectionLabel>Went with</SectionLabel>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {companionProfiles.map(u => {
                  const name = u.display_name ?? u.username;
                  return (
                    <div key={u.clerk_user_id} style={{ display: "flex", alignItems: "center", gap: 7, background: "var(--surface-alt)", borderRadius: 100, padding: "5px 10px 5px 5px" }}>
                      {u.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={u.avatar_url} alt={name} style={{ width: 24, height: 24, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#FFFBF1", flexShrink: 0 }}>
                          {name[0]?.toUpperCase()}
                        </div>
                      )}
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{name}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Notes */}
          {entry.notes ? (
            <div style={{ marginBottom: 18 }}>
              <SectionLabel>Notes</SectionLabel>
              <div style={{ fontSize: 14, color: "var(--ink-soft)", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
                {entry.notes}
              </div>
            </div>
          ) : !entry.highlight && (
            <div style={{ fontSize: 13, color: "var(--ink-mute)", fontStyle: "italic", marginBottom: 18 }}>No notes for this visit.</div>
          )}

          {/* Photo thumbnails */}
          {imgs.length > 1 && (
            <div>
              <SectionLabel>Photos · {imgs.length}</SectionLabel>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {imgs.map((url, i) => (
                  <button
                    key={url}
                    onClick={() => { setPhotoIdx(i); setLightboxOpen(true); }}
                    style={{ padding: 0, border: `2px solid ${i === photoIdx ? "var(--primary)" : "transparent"}`, borderRadius: 9, overflow: "hidden", cursor: "zoom-in", background: "none", transition: "border-color 120ms" }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" style={{ width: 60, height: 60, objectFit: "cover", display: "block" }} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer: edit / delete ── */}
        <div style={{ padding: "12px 20px", borderTop: "0.5px solid var(--hairline-soft)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, gap: 8 }}>

          {confirmDelete ? (
            <>
              <span style={{ fontSize: 13, color: "var(--ink-soft)", fontWeight: 500 }}>Delete this entry?</span>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setConfirmDelete(false)} style={{ padding: "7px 14px", borderRadius: 9, border: "0.5px solid var(--hairline)", background: "transparent", cursor: "pointer", fontSize: 12.5, fontWeight: 600, color: "var(--ink-soft)", fontFamily: "inherit" }}>
                  Cancel
                </button>
                <button onClick={handleDelete} disabled={deleting} style={{ padding: "7px 14px", borderRadius: 9, border: 0, background: "#C04040", color: "#FFFBF1", cursor: deleting ? "default" : "pointer", fontSize: 12.5, fontWeight: 700, fontFamily: "inherit", opacity: deleting ? 0.7 : 1 }}>
                  {deleting ? "Deleting…" : "Delete"}
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                onClick={() => setConfirmDelete(true)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 9, border: "0.5px solid var(--hairline)", background: "transparent", cursor: "pointer", fontSize: 12.5, fontWeight: 600, color: "var(--ink-mute)", fontFamily: "inherit" }}
              >
                <Trash2 style={{ width: 13, height: 13 }} strokeWidth={2} /> Delete
              </button>
              <button
                onClick={onEdit}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 9, border: 0, background: "var(--primary)", color: "#FFFBF1", cursor: "pointer", fontSize: 12.5, fontWeight: 700, fontFamily: "inherit" }}
              >
                <Pencil style={{ width: 13, height: 13 }} strokeWidth={2.2} /> Edit entry
              </button>
            </>
          )}
        </div>
      </div>

      {lightboxOpen && (
        <LightboxModal
          images={imgs.map(url => ({ url }))}
          startIndex={photoIdx}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 24px", gap: 12, textAlign: "center" }}>
      <div style={{ width: 52, height: 52, borderRadius: 16, background: "var(--surface-alt)", border: "0.5px solid var(--hairline)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <PenLine style={{ width: 22, height: 22, color: "var(--ink-mute)" }} strokeWidth={1.8} />
      </div>
      <div style={{ fontWeight: 800, fontSize: 17, color: "var(--ink)", letterSpacing: -0.2 }}>
        {filtered ? "No matching entries" : "No journal entries yet"}
      </div>
      <div style={{ fontSize: 13, color: "var(--ink-mute)", maxWidth: 260, lineHeight: 1.5 }}>
        {filtered ? "Try adjusting your search or filters." : `Use "Log a visit" to record your first national park trip.`}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function JournalPage() {
  const { isLoaded, isSignedIn } = useUser();
  const router = useRouter();

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<JournalEntry | null>(null);
  const [logVisitOpen, setLogVisitOpen] = useState(false);
  const [logVisitDraft, setLogVisitDraft] = useState<Partial<VisitDraft> | undefined>(undefined);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "rating">("newest");
  const [yearFilter, setYearFilter] = useState<number | null>(null);
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isLoaded && !isSignedIn) router.push("/");
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    fetch("/api/visits")
      .then(r => r.ok ? r.json() : [])
      .then((data: JournalEntry[]) => {
        setEntries(data.filter(e => !e.is_bucket_list && e.visited_date));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const years = useMemo(() => {
    const set = new Set<number>();
    entries.forEach(e => { if (e.visited_date) set.add(new Date(e.visited_date).getFullYear()); });
    return Array.from(set).sort((a, b) => b - a);
  }, [entries]);

  const filtered = useMemo(() => {
    let list = entries;
    if (yearFilter) list = list.filter(e => entryYear(e) === yearFilter);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(e =>
        (e.park_name ?? e.park_code).toLowerCase().includes(q) ||
        (e.title ?? "").toLowerCase().includes(q) ||
        (e.notes ?? "").toLowerCase().includes(q)
      );
    }
    if (sortBy === "oldest") list = [...list].sort((a, b) => (a.visited_date ?? "").localeCompare(b.visited_date ?? ""));
    else if (sortBy === "newest") list = [...list].sort((a, b) => (b.visited_date ?? "").localeCompare(a.visited_date ?? ""));
    else if (sortBy === "rating") list = [...list].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    return list;
  }, [entries, query, yearFilter, sortBy]);

  const totalPhotos = useMemo(() => entries.reduce((n, e) => n + photos(e).length, 0), [entries]);

  // ── Open edit modal ──
  const openEdit = useCallback((entry: JournalEntry) => {
    setLogVisitDraft({
      parkCode: entry.park_code,
      dates: {
        start: entry.visited_date ? new Date(entry.visited_date) : null,
        end:   entry.end_date    ? new Date(entry.end_date)    : null,
      },
      rating:             entry.rating     ?? 0,
      crowd:              entry.crowd      ?? 0,
      difficulty:         entry.difficulty ?? 0,
      weather:            { conds: entry.weather_conditions ?? [] },
      activities:         entry.activities  ?? [],
      companions:         entry.companions  ?? [],
      wouldReturn:        entry.would_return ?? null,
      highlight:          entry.highlight   ?? "",
      title:              entry.title       ?? "",
      notes:              entry.notes       ?? "",
      photos:             entry.photos      ?? [],
      cover:              entry.cover_photo ?? null,
      visibility: (entry.visibility
        ? entry.visibility.charAt(0).toUpperCase() + entry.visibility.slice(1)
        : "Private") as "Private" | "Friends" | "Public",
    });
    setLogVisitOpen(true);
    setSelected(null);
  }, []);

  // ── Refresh after edit / post ──
  const refreshEntries = useCallback(() => {
    fetch("/api/visits")
      .then(r => r.ok ? r.json() : [])
      .then((data: JournalEntry[]) => setEntries(data.filter(e => !e.is_bucket_list && e.visited_date)))
      .catch(() => {});
  }, []);

  // ── Delete handler ──
  const handleDelete = useCallback(async () => {
    if (!selected) return;
    await fetch(`/api/visits?park_code=${selected.park_code}`, { method: "DELETE" });
    setEntries(prev => prev.filter(e => e.id !== selected.id));
    setSelected(null);
  }, [selected]);

  const SORT_LABELS: Record<string, string> = { newest: "Newest first", oldest: "Oldest first", rating: "Highest rated" };

  return (
    <DesktopShell>
      <div style={{ padding: "28px 32px 32px", height: "100%", display: "flex", flexDirection: "column", overflowY: "auto" }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: 22 }}>
          <div style={{ ...mono, fontSize: 10, letterSpacing: 1.6, color: "var(--ink-mute)", textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>COLLECTIONS</div>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 32, color: "var(--ink)", letterSpacing: -0.7, lineHeight: 1 }}>Journal</div>
              {!loading && (
                <div style={{ fontSize: 13.5, color: "var(--ink-mute)", marginTop: 6 }}>
                  <strong style={{ color: "var(--ink)", fontWeight: 700 }}>{entries.length}</strong> {entries.length === 1 ? "entry" : "entries"}
                  {totalPhotos > 0 && <> · <strong style={{ color: "var(--ink)", fontWeight: 700 }}>{totalPhotos}</strong> photos</>}
                  {years.length > 0 && <> · spanning <strong style={{ color: "var(--ink)", fontWeight: 700 }}>{years.length}</strong> {years.length === 1 ? "year" : "years"}</>}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Filter bar ── */}
        {entries.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, background: "var(--surface)", border: "0.5px solid var(--hairline)", borderRadius: 11, padding: "8px 12px" }}>
              <Search style={{ width: 14, height: 14, color: "var(--ink-mute)", flexShrink: 0 }} strokeWidth={2} />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search parks, titles, notes…"
                style={{ flex: 1, border: 0, outline: "none", background: "transparent", fontSize: 13.5, color: "var(--ink)", fontFamily: "inherit" }}
              />
              {query && (
                <button onClick={() => setQuery("")} style={{ background: "none", border: 0, cursor: "pointer", padding: 0, lineHeight: 0, color: "var(--ink-mute)" }}>
                  <X style={{ width: 12, height: 12 }} strokeWidth={2.4} />
                </button>
              )}
            </div>

            {years.length > 1 && (
              <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                {[null, ...years].map(y => (
                  <button key={y ?? "all"} onClick={() => setYearFilter(y)} style={{ padding: "7px 11px", borderRadius: 9, border: `0.5px solid ${yearFilter === y ? "var(--primary)" : "var(--hairline)"}`, background: yearFilter === y ? "var(--primary)" : "var(--surface)", color: yearFilter === y ? "#FFFBF1" : "var(--ink-soft)", ...mono, fontSize: 10.5, fontWeight: 700, cursor: "pointer", letterSpacing: 0.4 }}>
                    {y ?? "All"}
                  </button>
                ))}
              </div>
            )}

            <div ref={sortRef} style={{ position: "relative", flexShrink: 0 }}>
              <button
                onClick={() => setSortOpen(o => !o)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 9, border: "0.5px solid var(--hairline)", background: "var(--surface)", cursor: "pointer", fontSize: 12.5, color: "var(--ink-soft)", fontWeight: 600, fontFamily: "inherit" }}
              >
                <SlidersHorizontal style={{ width: 13, height: 13 }} strokeWidth={2} />
                {SORT_LABELS[sortBy]}
              </button>
              {sortOpen && (
                <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, background: "var(--surface)", border: "0.5px solid var(--hairline)", borderRadius: 10, overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,0.18)", zIndex: 50, minWidth: 160 }}>
                  {(["newest", "oldest", "rating"] as const).map(s => (
                    <button key={s} onClick={() => { setSortBy(s); setSortOpen(false); }} style={{ width: "100%", padding: "9px 14px", border: 0, background: sortBy === s ? "rgba(31,61,46,0.07)" : "transparent", color: sortBy === s ? "var(--primary)" : "var(--ink)", fontWeight: sortBy === s ? 700 : 500, fontSize: 12.5, cursor: "pointer", textAlign: "left", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      {SORT_LABELS[s]}
                      {sortBy === s && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--primary)", flexShrink: 0 }} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Loading ── */}
        {loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ height: 88, borderRadius: 14, background: "var(--surface-alt)", border: "0.5px solid var(--hairline)", opacity: 1 - i * 0.15 }} />
            ))}
          </div>
        )}

        {/* ── Entry grid ── */}
        {!loading && filtered.length === 0 && <EmptyState filtered={!!query || !!yearFilter} />}

        {!loading && filtered.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 10 }}>
            {filtered.map(entry => (
              <EntryCard
                key={entry.id}
                entry={entry}
                selected={selected?.id === entry.id}
                onClick={() => setSelected(selected?.id === entry.id ? null : entry)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Detail overlay ── */}
      {selected && (
        <EntryDetail
          entry={selected}
          onClose={() => setSelected(null)}
          onEdit={() => openEdit(selected)}
          onDelete={handleDelete}
        />
      )}

      {/* ── Log / edit modal ── */}
      <LogVisitModal
        open={logVisitOpen}
        onClose={() => { setLogVisitOpen(false); setLogVisitDraft(undefined); }}
        onPosted={refreshEntries}
        initialDraft={logVisitDraft}
        editMode={!!logVisitDraft}
      />
    </DesktopShell>
  );
}
