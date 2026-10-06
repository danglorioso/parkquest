"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import {
  Users, UserCheck, UserPlus, Clock,
  ChevronLeft, ChevronRight, X, Lock, Pencil,
  MoreHorizontal, Share, Share2,
} from "lucide-react";
import type { CustomStampGlyph } from "@parkquest/types";
import { DesktopShell } from "@/components/desktop/DesktopShell";
import { ParkStamp } from "@/components/desktop/ParkStamp";
import { PublicNav, PUBLIC_NAV_HEIGHT } from "@/components/public/PublicNav";
import { PublicFooter } from "@/components/public/PublicFooter";
import { APP_STORE_URL } from "@/components/AppStoreBadge";
import { OpenInAppOverlay } from "@/components/OpenInAppOverlay";
import type { MapPark } from "@/components/USAMapGL";
import { PostCard, ReportDialog, type FeedPost } from "@/components/PostCard";
import { useToast } from "@/components/ToastProvider";
import { AdminStar } from "@/components/AdminStar";
import { LogVisitModal, type VisitDraft } from "@/components/LogVisitModal";
import { BadgeShareModal } from "@/components/BadgeShareModal";
import { fullStateName } from "@/lib/stateNames";
import { isMobileBrowser } from "@/lib/device";

const USAMap = dynamic(() => import("@/components/USAMapGL"), {
  ssr: false,
  loading: () => <div style={{ background: "#CECDBC", width: "100%", height: "100%" }} />,
});

// ── Types ──────────────────────────────────────────────────────────────────────

type FriendshipStatus = "none" | "pending_sent" | "pending_received" | "accepted";

interface BadgeData {
  badge_id: string;
  earned_at: string | null;
  name: string;
  emoji: string;
  tier: string;
  colors?: { fill: string; light: string } | null;
  description?: string | null;
}

interface VisitedPark {
  park_code: string;
  name: string;
  states: string;
  latitude: string | null;
  longitude: string | null;
  image_url: string | null;
  visited_date: string | null;
}

/** One stamp per park — visited_parks collapsed, with how many visits it stands for. */
interface Stamp extends VisitedPark {
  count: number;
}

/** Per-park extras from /api/parks that the profile response doesn't carry. */
interface ParkMeta {
  stamp_glyph: CustomStampGlyph | null;
  is_national_park: boolean;
  colorIdx: number;
}

interface ProfileData {
  clerk_user_id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  is_admin?: boolean;
  created_at: string | null;
  parks_visited: number;
  parks_total: number;
  areas_visited: number;
  areas_total: number;
  states_visited: number;
  bucket_list_count: number;
  friend_count: number;
  mutual_friends: number;
  badges: BadgeData[];
  recent_visits: VisitedPark[];
  visited_parks: VisitedPark[];
  recent_posts: FeedPost[];
  journal: JournalEntry[];
  friendship_status: FriendshipStatus;
  friendship_id: number | null;
  is_own_profile: boolean;
}

interface JournalEntry {
  visit_id: number;
  visited_date: string | null;
  park_code: string | null;
  park_name: string | null;
  states: string | null;
  title: string | null;
  notes: string | null;
  rating: number | null;
  activities: string[] | null;
  visibility: string | null;
  redacted?: boolean;
}

// ── Tier config ────────────────────────────────────────────────────────────────

const TIER_COLOR: Record<string, string> = {
  bronze: "#B27339", silver: "#8A9BA6", gold: "#C49A28",
  platinum: "#5B8A96", legendary: "#7B4FB5",
};
const TIER_BG: Record<string, string> = {
  bronze: "#FDF5EB", silver: "#F4F6F7", gold: "#FEF9E6",
  platinum: "#EBF4F7", legendary: "#F5EFFE",
};

/** Admin-set badge colors win over the tier palette; bg is the light color at low alpha. */
function badgeAccent(b: BadgeData): { color: string; bg: string } {
  if (b.colors) return { color: b.colors.fill, bg: `${b.colors.light}2e` };
  return { color: TIER_COLOR[b.tier] ?? "#888", bg: TIER_BG[b.tier] ?? "#F9F9F9" };
}

function BadgeModal({ badge, onClose, isOwnProfile, onShare }: { badge: BadgeData; onClose: () => void; isOwnProfile: boolean; onShare: (badge: BadgeData) => void }) {
  const { color: tierColor, bg: tierBg } = badgeAccent(badge);
  const earnedDate = badge.earned_at
    ? new Date(badge.earned_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg)",
          borderRadius: 18,
          border: "0.5px solid var(--hairline)",
          padding: "32px 28px",
          maxWidth: 360,
          width: "100%",
          position: "relative",
          boxShadow: "0 24px 64px rgba(0,0,0,0.18)",
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute", top: 14, right: 14,
            background: "none", border: "none", cursor: "pointer",
            color: "var(--ink-mute)", padding: 4, borderRadius: 6,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <X size={16} />
        </button>

        {/* Emoji + tier badge */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 20 }}>
          <div style={{
            width: 72, height: 72, borderRadius: 20,
            background: tierBg,
            border: `2px solid ${tierColor}44`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 36, marginBottom: 12,
          }}>
            {badge.emoji}
          </div>
          <div style={{ fontWeight: 800, fontSize: 20, color: "var(--ink)", textAlign: "center", letterSpacing: -0.3 }}>
            {badge.name}
          </div>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "1.6px",
            color: tierColor, fontWeight: 700, textTransform: "uppercase",
            marginTop: 5,
          }}>
            {badge.tier}
          </div>
        </div>

        {/* Description */}
        {badge.description && (
          <div style={{
            background: "var(--surface)",
            border: "0.5px solid var(--hairline)",
            borderRadius: 10,
            padding: "14px 16px",
            marginBottom: 16,
          }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8.5, letterSpacing: "1.2px", color: "var(--ink-mute)", fontWeight: 600, marginBottom: 6 }}>
              HOW TO EARN
            </div>
            <div style={{ fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.55 }}>
              {badge.description}
            </div>
          </div>
        )}

        {/* Earned date */}
        {earnedDate ? (
          <div style={{ textAlign: "center", fontSize: 12, color: "var(--ink-mute)" }}>
            Earned on <span style={{ fontWeight: 650, color: "var(--ink-soft)" }}>{earnedDate}</span>
          </div>
        ) : (
          <div style={{ textAlign: "center", fontSize: 12, color: "var(--ink-mute)", fontStyle: "italic" }}>
            Not yet earned
          </div>
        )}

        {/* Share to feed — own earned badges only */}
        {isOwnProfile && badge.earned_at && (
          <div style={{ marginTop: 18, display: "flex", justifyContent: "center" }}>
            <button
              onClick={() => { onShare(badge); onClose(); }}
              style={{
                background: "var(--ink)",
                color: "var(--bg)",
                border: "none", borderRadius: 100,
                padding: "9px 20px", cursor: "pointer",
                fontWeight: 700, fontSize: 12.5,
                display: "inline-flex", alignItems: "center", gap: 6,
              }}
            >
              <Share2 size={13} strokeWidth={2.2} />
              Share to feed
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Stat({ value, sub, label, href }: { value: number; sub?: string; label: string; href?: string }) {
  const body = (
    <>
      <div style={{ fontWeight: 900, fontSize: 28, color: "var(--ink)", letterSpacing: -0.8, lineHeight: 1 }}>
        {value}
        {sub && <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-mute)", letterSpacing: 0 }}>{sub}</span>}
      </div>
      <div className="pq-prof-stat-label" style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "1.4px", color: "var(--ink-mute)", fontWeight: 600, marginTop: 6 }}>
        {label}
      </div>
    </>
  );
  if (!href) return <div className="pq-prof-stat">{body}</div>;
  // Same-page anchors stay plain <a> — the signed-in shell scrolls an inner
  // container, which a native hash jump handles and a router push doesn't.
  return href.startsWith("#")
    ? <a href={href} className="pq-prof-stat">{body}</a>
    : <Link href={href} className="pq-prof-stat">{body}</Link>;
}

function FriendButton({
  status, busy,
  onAddFriend, onCancelRequest, onAcceptRequest, onDeclineRequest, onUnfriend,
}: {
  status: FriendshipStatus; busy: boolean;
  onAddFriend: () => void; onCancelRequest: () => void;
  onAcceptRequest: () => void; onDeclineRequest: () => void;
  onUnfriend: () => void;
}) {
  const base: React.CSSProperties = {
    flexShrink: 0, borderRadius: 10, padding: "9px 18px",
    fontSize: 13, fontWeight: 700,
    cursor: busy ? "wait" : "pointer",
    display: "flex", alignItems: "center", gap: 6,
    opacity: busy ? 0.7 : 1, transition: "opacity 120ms", border: "none",
  };
  if (status === "accepted") return (
    <button onClick={onUnfriend} disabled={busy}
      style={{ ...base, background: "var(--surface)", color: "var(--ink)", border: "0.5px solid var(--hairline)" }}>
      <UserCheck size={14} /> Friends
    </button>
  );
  if (status === "pending_sent") return (
    <button onClick={onCancelRequest} disabled={busy}
      style={{ ...base, background: "var(--surface)", color: "var(--ink-mute)", border: "0.5px solid var(--hairline)" }}>
      <Clock size={14} /> Request Sent
    </button>
  );
  if (status === "pending_received") return (
    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
      <button onClick={onAcceptRequest} disabled={busy}
        style={{ ...base, background: "var(--primary)", color: "#FFFBF1" }}>
        <UserCheck size={14} /> Accept
      </button>
      <button onClick={onDeclineRequest} disabled={busy}
        style={{ ...base, background: "var(--surface)", color: "var(--ink)", border: "0.5px solid var(--hairline)" }}>
        Decline
      </button>
    </div>
  );
  return (
    <button onClick={onAddFriend} disabled={busy}
      style={{ ...base, background: "var(--primary)", color: "#FFFBF1" }}>
      <UserPlus size={14} /> Add Friend
    </button>
  );
}

function Section({ id, title, meta, action, children }: {
  id?: string;
  title: string;
  meta?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="pq-prof-section">
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14, minHeight: 32 }}>
        <h2 style={{ fontWeight: 800, fontSize: 18, color: "var(--ink)", letterSpacing: -0.3, margin: 0 }}>{title}</h2>
        {meta && <span style={{ fontSize: 13, color: "var(--ink-mute)" }}>{meta}</span>}
        {action && <div style={{ marginLeft: "auto" }}>{action}</div>}
      </div>
      {children}
    </section>
  );
}

function SectionLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="pq-prof-more">
      {children}
      <ChevronRight size={14} strokeWidth={2.4} />
    </Link>
  );
}

// ── Stamps ────────────────────────────────────────────────────────────────────

// Passport paper + inks are fixed in both themes, same as /passport.
const PAPER = "#FAF3E0";
const P_INK = "#3A2E1C";
const P_MUTE = "rgba(58,46,28,0.55)";
const STAMP_D = 88;
const STAMPS_COLLAPSED = 24;

type StampView = "stamps" | "list";

function stampMonth(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function ViewToggle({ value, onChange }: { value: StampView; onChange: (v: StampView) => void }) {
  return (
    <div style={{ display: "inline-flex", background: "var(--surface-alt)", border: "0.5px solid var(--hairline)", borderRadius: 10, padding: 3, gap: 2 }}>
      {([["stamps", "Stamps"], ["list", "List"]] as const).map(([id, label]) => {
        const active = value === id;
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            aria-pressed={active}
            style={{
              border: 0, borderRadius: 7, padding: "5px 13px", cursor: "pointer",
              fontSize: 12.5, fontWeight: active ? 700 : 600, fontFamily: "inherit",
              background: active ? "var(--surface)" : "transparent",
              color: active ? "var(--ink)" : "var(--ink-mute)",
              boxShadow: active ? "0 1px 3px rgba(0,0,0,0.10)" : "none",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function StampGrid({ stamps, meta }: { stamps: Stamp[]; meta: Map<string, ParkMeta> | null }) {
  return (
    <div style={{ background: PAPER, border: "0.5px solid var(--hairline)", borderRadius: 14, padding: "8px 10px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(124px, 1fr))" }}>
        {stamps.map((s, i) => {
          const m = meta?.get(s.park_code);
          return (
            <Link key={s.park_code} href={`/parks/${s.park_code}`} className="pq-prof-stamp">
              <div style={{ position: "relative", width: STAMP_D, height: STAMP_D }}>
                {/* Inks are seeded from /api/parks order — hold the stamp back until
                    it's in so the color doesn't change under the reader */}
                {meta ? (
                  <ParkStamp parkCode={s.park_code} name={s.name} states={s.states} colorIdx={m?.colorIdx ?? i} size={STAMP_D} customGlyph={m?.stamp_glyph} />
                ) : (
                  <div style={{ width: STAMP_D, height: STAMP_D, borderRadius: "50%", background: "rgba(58,46,28,0.08)" }} />
                )}
                {s.count > 1 && (
                  <span style={{
                    position: "absolute", top: -4, right: -12,
                    background: PAPER, border: `0.5px solid ${P_MUTE}`, borderRadius: 100,
                    padding: "1px 6px", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, color: P_INK,
                  }}>
                    ×{s.count}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: P_INK, textAlign: "center", marginTop: 8, lineHeight: 1.3 }}>
                {s.name}
              </div>
              {s.visited_date && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: P_MUTE, textAlign: "center", marginTop: 2 }}>
                  {stampMonth(s.visited_date)}
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function StampList({ stamps }: { stamps: Stamp[] }) {
  return (
    <div style={{ background: "var(--surface)", border: "0.5px solid var(--hairline)", borderRadius: 14, overflow: "hidden" }}>
      {stamps.map((s, i) => {
        const where = s.states.split(",").map((st) => fullStateName(st.trim())).join(", ");
        const details = [where, s.visited_date && stampMonth(s.visited_date), s.count > 1 && `${s.count} visits`].filter(Boolean);
        return (
          <Link
            key={s.park_code}
            href={`/parks/${s.park_code}`}
            className="pq-prof-row"
            style={{ borderTop: i > 0 ? "0.5px solid var(--hairline-soft)" : "none" }}
          >
            <div style={{ width: 44, height: 44, borderRadius: 8, overflow: "hidden", flexShrink: 0, background: "var(--surface-alt)" }}>
              {s.image_url && (
                <Image src={s.image_url} alt="" width={44} height={44} sizes="44px" style={{ width: 44, height: 44, objectFit: "cover" }} />
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {s.name}
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-mute)", marginTop: 2 }}>{details.join(" · ")}</div>
            </div>
            <ChevronRight size={15} strokeWidth={2.2} style={{ color: "var(--ink-mute)", flexShrink: 0 }} />
          </Link>
        );
      })}
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function SideCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: "var(--surface)", border: "0.5px solid var(--hairline)", borderRadius: 14, overflow: "hidden", ...style }}>
      {children}
    </div>
  );
}

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "1.4px", color: "var(--ink-mute)", fontWeight: 600, textTransform: "uppercase" }}>
      {children}
    </div>
  );
}

function ProgressRow({ label, value, total, caption }: { label: string; value: number; total: number; caption: string }) {
  const pct = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-soft)" }}>{label}</span>
        <span style={{ fontWeight: 800, fontSize: 17, color: "var(--ink)", letterSpacing: -0.3 }}>
          {value}
          <span style={{ fontWeight: 600, fontSize: 13, color: "var(--ink-mute)", letterSpacing: 0 }}> / {total}</span>
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 100, background: "var(--surface-alt)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, borderRadius: 100, background: "linear-gradient(to right, var(--primary), var(--visited))" }} />
      </div>
      <div style={{ fontSize: 12, color: "var(--ink-mute)", marginTop: 7, lineHeight: 1.45 }}>{caption}</div>
    </div>
  );
}

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function groupJournalByYearMonth(entries: JournalEntry[]) {
  const map = new Map<number, Map<number, JournalEntry[]>>();
  for (const e of entries) {
    if (!e.visited_date) continue;
    const d = new Date(e.visited_date);
    const y = d.getFullYear();
    const m = d.getMonth();
    if (!map.has(y)) map.set(y, new Map());
    if (!map.get(y)!.has(m)) map.get(y)!.set(m, []);
    map.get(y)!.get(m)!.push(e);
  }
  // Sort years desc, months desc within each year
  return Array.from(map.entries())
    .sort(([a], [b]) => b - a)
    .map(([year, months]) => ({
      year,
      months: Array.from(months.entries())
        .sort(([a], [b]) => b - a)
        .map(([month, items]) => ({ month, items })),
    }));
}

function StarRating({ n }: { n: number }) {
  return (
    <span style={{ fontSize: 11, letterSpacing: 1 }}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} style={{ color: i < n ? "#C49A28" : "var(--hairline)" }}>★</span>
      ))}
    </span>
  );
}

function VisibilityPill({ vis }: { vis: string | null }) {
  if (!vis || vis === "public") return null;
  const label = vis === "friends" ? "Friends only" : "Private";
  const color = vis === "private" ? "#9A6B4B" : "#5B8A96";
  return (
    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8.5, letterSpacing: "0.8px", color, fontWeight: 600, background: `${color}18`, borderRadius: 4, padding: "1px 5px" }}>
      {label}
    </span>
  );
}

function JournalTimeline({ entries, onEdit }: { entries: JournalEntry[]; onEdit?: (visitId: number) => void }) {
  if (entries.length === 0) {
    return (
      <div style={{ padding: "32px 0", textAlign: "center", color: "var(--ink-mute)", fontSize: 13 }}>
        No journal entries visible.
      </div>
    );
  }
  const groups = groupJournalByYearMonth(entries);
  return (
    <div>
      {groups.map(({ year, months }) => (
        <div key={year} style={{ marginBottom: 36 }}>
          {/* Year header */}
          <div style={{
            fontWeight: 900, fontSize: 20, color: "var(--ink)",
            letterSpacing: -0.4, marginBottom: 16,
          }}>
            {year}
          </div>
          {months.map(({ month, items }) => (
            <div key={month} style={{ marginBottom: 24 }}>
              {/* Month header with line */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 9.5,
                  letterSpacing: "1.8px", fontWeight: 700,
                  color: "var(--ink-mute)",
                  textTransform: "uppercase",
                  flexShrink: 0,
                }}>
                  {MONTH_NAMES[month]}
                </span>
                <div style={{ flex: 1, height: 1, background: "var(--hairline)" }} />
              </div>
              {/* Entries */}
              <div style={{ position: "relative", paddingLeft: 20 }}>
                {/* Vertical line */}
                <div style={{
                  position: "absolute", left: 5, top: 8, bottom: 8,
                  width: 1, background: "var(--hairline)",
                }} />
                {items.map((entry, idx) => {
                  const d = new Date(entry.visited_date!);
                  const day = d.getDate();
                  const mon = MONTH_SHORT[d.getMonth()];
                  return (
                    <div key={entry.visit_id} style={{
                      position: "relative",
                      marginBottom: idx < items.length - 1 ? 18 : 0,
                    }}>
                      {/* Dot */}
                      <div style={{
                        position: "absolute", left: -19, top: 5,
                        width: 9, height: 9, borderRadius: "50%",
                        background: entry.redacted ? "var(--hairline)" : "var(--visited)",
                        border: "2px solid var(--bg)",
                        flexShrink: 0,
                      }} />
                      {entry.redacted ? (
                        /* Redacted / private visit — show date only */
                        <div style={{
                          background: "var(--surface)",
                          border: "0.5px dashed var(--hairline)",
                          borderRadius: 10,
                          padding: "10px 14px",
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                        }}>
                          <span style={{
                            fontFamily: "var(--font-mono)", fontSize: 10,
                            letterSpacing: "0.6px", color: "var(--ink-mute)",
                            fontWeight: 600, flexShrink: 0,
                          }}>
                            {mon} {day}
                          </span>
                          <Lock size={11} style={{ color: "var(--ink-mute)", flexShrink: 0 }} strokeWidth={2.5} />
                          <span style={{ fontSize: 12.5, color: "var(--ink-mute)", fontStyle: "italic" }}>
                            Private visit
                          </span>
                        </div>
                      ) : (
                        /* Full visit card */
                        <div style={{
                          background: "var(--surface)",
                          border: "0.5px solid var(--hairline)",
                          borderRadius: 10,
                          padding: "12px 14px",
                        }}>
                          {/* Top row: date + park + visibility + edit */}
                          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: entry.title || entry.notes || entry.rating || (entry.activities?.length ?? 0) > 0 ? 8 : 0 }}>
                            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flex: 1, minWidth: 0 }}>
                              <span style={{
                                fontFamily: "var(--font-mono)", fontSize: 10,
                                letterSpacing: "0.6px", color: "var(--ink-mute)",
                                fontWeight: 600, flexShrink: 0,
                              }}>
                                {mon} {day}
                              </span>
                              <Link
                                href={`/parks/${entry.park_code}`}
                                className="pq-prof-park-link"
                                style={{
                                  fontWeight: 700, fontSize: 14, color: "var(--ink)",
                                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                }}
                              >
                                {entry.park_name}
                              </Link>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                              <VisibilityPill vis={entry.visibility} />
                              {onEdit && (
                                <button
                                  onClick={() => onEdit(entry.visit_id)}
                                  title="Edit visit"
                                  style={{
                                    background: "none", border: "none", cursor: "pointer",
                                    padding: 3, borderRadius: 5, color: "var(--ink-mute)",
                                    display: "flex", alignItems: "center",
                                    transition: "color 120ms, background 120ms",
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.color = "var(--ink)";
                                    e.currentTarget.style.background = "var(--surface-alt)";
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.color = "var(--ink-mute)";
                                    e.currentTarget.style.background = "none";
                                  }}
                                >
                                  <Pencil size={11} strokeWidth={2.5} />
                                </button>
                              )}
                            </div>
                          </div>
                          {/* Custom title */}
                          {entry.title && (
                            <div style={{ fontSize: 12, fontWeight: 650, color: "var(--ink-soft)", marginBottom: 5, fontStyle: "italic" }}>
                              "{entry.title}"
                            </div>
                          )}
                          {/* Rating + activities row */}
                          {(entry.rating || (entry.activities?.length ?? 0) > 0) && (
                            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: entry.notes ? 6 : 0 }}>
                              {entry.rating && <StarRating n={entry.rating} />}
                              {(entry.activities?.length ?? 0) > 0 && (
                                <span style={{ fontSize: 11, color: "var(--ink-mute)" }}>
                                  {entry.activities!.join(" · ")}
                                </span>
                              )}
                            </div>
                          )}
                          {/* Notes */}
                          {entry.notes && (
                            <div style={{
                              fontSize: 12.5, color: "var(--ink-soft)", lineHeight: 1.55,
                              display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical",
                              overflow: "hidden",
                            }}>
                              {entry.notes}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Bone({ w = "100%", h = 16, r = 6, style }: { w?: number | string; h?: number; r?: number; style?: React.CSSProperties }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: r,
      background: "linear-gradient(90deg, var(--surface-alt) 25%, var(--hairline) 50%, var(--surface-alt) 75%)",
      backgroundSize: "200% 100%",
      animation: "pq-shimmer 1.4s ease-in-out infinite",
      flexShrink: 0,
      ...style,
    }} />
  );
}

function ProfileSkeleton() {
  return (
    <div className="pq-prof-grid">
      <div className="pq-prof-head">
        <div style={{ display: "flex", alignItems: "flex-start", gap: 22, marginBottom: 28 }}>
          <Bone w={96} h={96} r={48} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, paddingTop: 6 }}>
            <Bone w={220} h={28} r={6} />
            <Bone w={150} h={13} r={4} />
            <Bone w={280} h={13} r={4} />
          </div>
        </div>
        <div className="pq-prof-stats">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="pq-prof-stat" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Bone w={44} h={28} r={4} />
              <Bone w={72} h={10} r={3} />
            </div>
          ))}
        </div>
      </div>
      <div className="pq-prof-aside">
        <Bone h={330} r={14} />
        <Bone h={190} r={14} />
      </div>
      <div className="pq-prof-body">
        <Bone w={90} h={18} r={4} style={{ marginBottom: 16 }} />
        <Bone h={300} r={14} style={{ marginBottom: 40 }} />
        <Bone w={80} h={18} r={4} style={{ marginBottom: 16 }} />
        <div style={{ display: "flex", gap: 8, marginBottom: 40 }}>
          {Array.from({ length: 4 }).map((_, i) => <Bone key={i} w={120} h={38} r={8} />)}
        </div>
        <Bone w={80} h={18} r={4} style={{ marginBottom: 16 }} />
        {Array.from({ length: 3 }).map((_, i) => <Bone key={i} h={70} r={10} style={{ marginBottom: 14 }} />)}
      </div>
    </div>
  );
}

// ── Layout CSS ────────────────────────────────────────────────────────────────

// Sidebar drops under the header once the content column gets tight. Media
// queries rather than a container query: container-type on an ancestor would
// become the containing block for every position:fixed modal below it
// (badge modal, report dialog, PostCard's lightbox).
const stackedCss = (scope: string) => `
  ${scope} .pq-prof-grid { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto; grid-template-areas: "head" "aside" "body"; }
  ${scope} .pq-prof-aside { position: static; margin-bottom: 36px; }
`;

const PROFILE_CSS = `
  @keyframes pq-shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }
  .pq-prof { --pq-prof-top: ${PUBLIC_NAV_HEIGHT}px; }
  .pq-prof--shell { --pq-prof-top: 0px; }
  .pq-prof-inner { max-width: 1120px; margin: 0 auto; padding: 36px 28px 72px; }
  .pq-prof-grid {
    display: grid; grid-template-columns: minmax(0, 1fr) 320px; grid-template-rows: auto 1fr;
    grid-template-areas: "head aside" "body aside"; column-gap: 44px;
  }
  .pq-prof-head { grid-area: head; min-width: 0; }
  .pq-prof-body { grid-area: body; min-width: 0; }
  .pq-prof-aside { grid-area: aside; align-self: start; display: flex; flex-direction: column; gap: 16px; }
  .pq-prof-section { margin-bottom: 40px; scroll-margin-top: calc(var(--pq-prof-top) + 24px); }
  .pq-prof-stats { display: flex; padding-bottom: 26px; margin-bottom: 32px; border-bottom: 0.5px solid var(--hairline); }
  .pq-prof-stat { display: block; padding: 0 36px; border-left: 0.5px solid var(--hairline); text-decoration: none; }
  .pq-prof-stat:first-child { padding-left: 0; border-left: 0; }
  a.pq-prof-stat:hover .pq-prof-stat-label { color: var(--ink) !important; }
  .pq-prof-stamp { display: flex; flex-direction: column; align-items: center; padding: 14px 6px; border-radius: 10px; text-decoration: none; transition: background 120ms; }
  .pq-prof-stamp:hover { background: rgba(58,46,28,0.06); }
  .pq-prof-row { display: flex; align-items: center; gap: 12px; padding: 10px 14px; text-decoration: none; transition: background 120ms; }
  .pq-prof-row:hover { background: var(--surface-alt); }
  .pq-prof-more { display: inline-flex; align-items: center; gap: 2px; font-size: 13px; font-weight: 600; color: var(--ink-mute); text-decoration: none; }
  .pq-prof-more:hover { color: var(--ink); }
  .pq-prof-park-link { text-decoration: none; }
  .pq-prof-park-link:hover { text-decoration: underline; text-underline-offset: 3px; }
  .pq-prof-btn {
    display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0; cursor: pointer;
    background: var(--surface); color: var(--ink); border: 0.5px solid var(--hairline);
    border-radius: 10px; padding: 9px 16px; font-size: 13px; font-weight: 700; font-family: inherit;
  }
  .pq-prof-btn:hover { background: var(--surface-alt); }
  .pq-signup-banner { display: flex; align-items: center; justify-content: space-between; }
  @media (min-height: 860px) {
    .pq-prof-aside { position: sticky; top: calc(var(--pq-prof-top) + 24px); }
  }
  @media (max-width: 900px) { ${stackedCss(".pq-prof")} }
  /* Inside DesktopShell the 232px sidebar comes out of the same viewport */
  @media (max-width: 1132px) { ${stackedCss(".pq-prof--shell")} }
  @media (max-width: 767px) { .pq-prof--shell { --pq-prof-top: 54px; } }
  @media (max-width: 560px) {
    .pq-prof-inner { padding: 24px 18px 56px; }
    .pq-prof-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); row-gap: 20px; }
    .pq-prof-stat, .pq-prof-stat:first-child { padding: 0; border-left: 0; }
    .pq-signup-banner { flex-direction: column; align-items: stretch; }
    .pq-signup-banner-actions { justify-content: flex-end; }
  }
`;

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isSignedIn, isLoaded } = useUser();

  const fromPath = searchParams.get("from") ?? "/friends";
  const fromLabel = fromPath === "/feed" ? "Feed" : "Friends";
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selectedBadge, setSelectedBadge] = useState<BadgeData | null>(null);
  const [sharingBadge, setSharingBadge] = useState<BadgeData | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<VisitDraft> | undefined>();
  const { toast } = useToast();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showReportUser, setShowReportUser] = useState(false);
  const [reportedUser, setReportedUser] = useState(false);
  // null until /api/parks answers; an empty map if it fails (stamps still render, default art)
  const [parkMeta, setParkMeta] = useState<Map<string, ParkMeta> | null>(null);
  const [stampView, setStampView] = useState<StampView>("stamps");
  const [showAllStamps, setShowAllStamps] = useState(false);

  // Signed-out visitors arrive here from a shared /u/<username> link — same
  // "open in app" overlay + deep-link attempt as the shared-post page.
  // Mobile-only: desktop has no app to catch the parkquest:// scheme, and
  // attempting it there made desktop Safari show "the address is invalid"
  // instead of this profile — the sign-in/create-account bar at the bottom
  // of the page (always rendered, see below) is desktop's only CTA.
  const [showAppOverlay, setShowAppOverlay] = useState(false);
  const attemptedOpen = useRef(false);
  const openApp = () => { window.location.href = `parkquest://u/${username}`; };
  useEffect(() => {
    if (!isLoaded || isSignedIn || attemptedOpen.current || !isMobileBrowser()) return;
    attemptedOpen.current = true;
    setShowAppOverlay(true);
    openApp();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, username]);

  useEffect(() => {
    if (!showProfileMenu) return;
    const close = () => setShowProfileMenu(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [showProfileMenu]);

  const handleBlockUser = async () => {
    setShowProfileMenu(false);
    if (!profile) return;
    const name = profile.display_name ?? `@${profile.username}`;
    if (!confirm(`Block ${name}?\n\nThey won't be able to see your posts or contact you, and you won't see theirs. This also flags them for review.`)) return;
    try {
      const res = await fetch("/api/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: profile.clerk_user_id }),
      });
      if (!res.ok) throw new Error();
      toast(`Blocked ${name}`);
      router.push(fromPath);
    } catch {
      toast("Could not block this user. Please try again.", "error");
    }
  };

  const handleEditVisit = async (visitId: number) => {
    const r = await fetch(`/api/visits/${visitId}`);
    if (!r.ok) return;
    const v = await r.json();
    setEditDraft({
      parkCode:   v.park_code,
      dates:      { start: v.visited_date ? new Date(v.visited_date) : null, end: v.end_date ? new Date(v.end_date) : null },
      rating:     v.rating     ?? 0,
      crowd:      v.crowd      ?? 0,
      difficulty: v.difficulty ?? 0,
      weather:    { conds: v.weather_conditions ?? [] },
      activities: v.activities  ?? [],
      companions: v.companions  ?? [],
      wouldReturn: v.would_return ?? null,
      highlight:  v.highlight  ?? "",
      title:      v.title      ?? "",
      notes:      v.notes      ?? "",
      photos:     v.photos     ?? [],
      cover:      v.cover_photo ?? null,
      visibility: (v.visibility
        ? v.visibility.charAt(0).toUpperCase() + v.visibility.slice(1)
        : "Private") as "Private" | "Friends" | "Public",
    });
  };

  const handleLike = async (postId: number, currentlyLiked: boolean) => {
    setProfile((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        recent_posts: prev.recent_posts.map((p) =>
          p.id === postId
            ? { ...p, liked_by_me: !currentlyLiked, like_count: p.like_count + (currentlyLiked ? -1 : 1) }
            : p
        ),
      };
    });
    try {
      if (currentlyLiked) {
        await fetch(`/api/likes?postId=${postId}`, { method: "DELETE" });
      } else {
        await fetch("/api/likes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ postId }),
        });
      }
    } catch {
      setProfile((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          recent_posts: prev.recent_posts.map((p) =>
            p.id === postId
              ? { ...p, liked_by_me: currentlyLiked, like_count: p.like_count + (currentlyLiked ? 1 : -1) }
              : p
          ),
        };
      });
    }
  };

  useEffect(() => {
    if (!username) return;
    setError(false); setNotFound(false); setLoading(true);
    fetch(`/api/users/${encodeURIComponent(username)}`)
      .then((r) => {
        if (r.status === 404) { setNotFound(true); return null; }
        if (!r.ok) { setError(true); return null; }
        return r.json();
      })
      .then((data) => { if (data) setProfile(data); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [username]);

  // Stamp art + designation live on the park rows, not the profile response.
  // Same long-cached list the shell and search already pull.
  useEffect(() => {
    fetch("/api/parks")
      .then((r) => (r.ok ? r.json() : []))
      .then((parks: Array<{ park_code: string; stamp_glyph: CustomStampGlyph | null; is_national_park: boolean }>) => {
        const meta = new Map<string, ParkMeta>();
        // Ink color index = position among the national parks, matching
        // /passport so a park's stamp is the same color on both pages.
        let np = 0;
        parks.forEach((park, i) => {
          meta.set(park.park_code, {
            stamp_glyph: park.stamp_glyph,
            is_national_park: park.is_national_park,
            colorIdx: park.is_national_park ? np++ : i,
          });
        });
        setParkMeta(meta);
      })
      .catch(() => setParkMeta(new Map()));
  }, []);

  const withBusy = (fn: () => Promise<void>) => async () => {
    if (!profile || !isSignedIn || busy) return;
    setBusy(true);
    try { await fn(); } catch {}
    finally { setBusy(false); }
  };

  const handleAddFriend = withBusy(async () => {
    const prev = profile!.friendship_status;
    setProfile((p) => p ? { ...p, friendship_status: "pending_sent" } : p);
    const res = await fetch("/api/friends", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: profile!.clerk_user_id }),
    });
    if (!res.ok) setProfile((p) => p ? { ...p, friendship_status: prev } : p);
    else {
      const data = await res.json();
      setProfile((p) => p ? { ...p, friendship_status: data.status ?? "pending_sent" } : p);
    }
  });
  const handleCancelRequest = withBusy(async () => {
    if (!confirm(`Cancel your friend request to ${profile!.display_name ?? profile!.username}?`)) return;
    setProfile((p) => p ? { ...p, friendship_status: "none" } : p);
    const res = await fetch(`/api/friends?userId=${profile!.clerk_user_id}`, { method: "DELETE" });
    if (!res.ok) setProfile((p) => p ? { ...p, friendship_status: "pending_sent" } : p);
  });
  const handleAcceptRequest = withBusy(async () => {
    if (!profile!.friendship_id) return;
    const res = await fetch("/api/friends", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ friendshipId: profile!.friendship_id, action: "accept" }),
    });
    if (res.ok) setProfile((p) => p ? { ...p, friendship_status: "accepted", friend_count: p.friend_count + 1 } : p);
  });
  const handleDeclineRequest = withBusy(async () => {
    if (!profile!.friendship_id) return;
    const res = await fetch("/api/friends", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ friendshipId: profile!.friendship_id, action: "reject" }),
    });
    if (res.ok) setProfile((p) => p ? { ...p, friendship_status: "none", friendship_id: null } : p);
  });
  const handleUnfriend = withBusy(async () => {
    const res = await fetch(`/api/friends?userId=${profile!.clerk_user_id}`, { method: "DELETE" });
    if (res.ok) setProfile((p) => p ? { ...p, friendship_status: "none", friend_count: Math.max(0, p.friend_count - 1) } : p);
  });

  // visited_parks is one row per visit, newest first — collapse to one stamp
  // per park, keeping the latest date and counting the repeats.
  const visitedParks = profile?.visited_parks;
  const stamps = useMemo(() => {
    const byCode = new Map<string, Stamp>();
    for (const v of visitedParks ?? []) {
      const existing = byCode.get(v.park_code);
      if (existing) existing.count += 1;
      else byCode.set(v.park_code, { ...v, count: 1 });
    }
    return Array.from(byCode.values());
  }, [visitedParks]);

  const mapParks: MapPark[] = useMemo(() => stamps
    .filter((v) => v.latitude && v.longitude)
    .map((v) => ({
      park_code: v.park_code,
      name: v.name,
      position: [parseFloat(v.latitude!), parseFloat(v.longitude!)] as [number, number],
      status: "visited" as const,
      is_national_park: parkMeta?.get(v.park_code)?.is_national_park,
    })), [stamps, parkMeta]);

  const handleShare = async () => {
    // /u/<username> is the universal link: opens the app where it's installed, this page everywhere else
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/u/${username}`);
      toast("Profile link copied");
    } catch {
      toast("Could not copy the link.", "error");
    }
  };

  // ── Inner page content ────────────────────────────────────────────────────

  const emptyOrLoading = loading
    ? <ProfileSkeleton />
    : (
      <div style={{ textAlign: "center", padding: "80px 0", color: "var(--ink-mute)", fontSize: 14 }}>
        {error ? "Failed to load profile." : notFound ? `@${username} doesn't exist.` : null}
      </div>
    );

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : null;

  const inShell = isLoaded && !!isSignedIn;

  const renderProfile = (profile: ProfileData) => {
    const own = profile.is_own_profile;
    const firstName = profile.display_name?.trim().split(/\s+/)[0] || `@${profile.username}`;
    const shownStamps = showAllStamps ? stamps : stamps.slice(0, STAMPS_COLLAPSED);
    const parksPct = profile.parks_total > 0 ? Math.round((profile.parks_visited / profile.parks_total) * 100) : 0;
    const areasPct = profile.areas_total > 0 ? Math.round((profile.areas_visited / profile.areas_total) * 100) : 0;

    const passportCard = (
      <div style={{
        borderRadius: 14, overflow: "hidden",
        background: "radial-gradient(120% 100% at 50% 0%, #1F3D2E 0%, #152A20 50%, #0D1D15 100%)",
        border: "0.5px solid rgba(0,0,0,0.3)",
        padding: "20px 18px",
        display: "flex", flexDirection: "column", justifyContent: "space-between",
        color: "#C9A94A",
      }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "2px", opacity: 0.7 }}>
            PARKQUEST · PASSPORT
          </div>
          <div style={{ fontWeight: 900, fontSize: 20, letterSpacing: "3px", marginTop: 12, color: "#C9A94A", textShadow: "0 1px 0 #8A5E18", overflowWrap: "anywhere" }}>
            {profile.display_name?.toUpperCase() || profile.username.toUpperCase()}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "rgba(201,169,74,0.7)", marginTop: 4, letterSpacing: "1px" }}>
            @{profile.username}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, borderTop: "0.5px dashed rgba(201,169,74,0.3)", paddingTop: 14, marginTop: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "10px 22px" }}>
            {[
              { label: "VISITED", value: `${profile.parks_visited}/${profile.parks_total}` },
              { label: "STATES", value: `${profile.states_visited}/50` },
              { label: "BADGES", value: String(profile.badges.length) },
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, letterSpacing: "1.5px", opacity: 0.6, textTransform: "uppercase" }}>{label}</div>
                <div style={{ fontWeight: 700, fontSize: 11, marginTop: 2, color: "#C9A94A" }}>{value}</div>
              </div>
            ))}
          </div>

          {profile.avatar_url && (
            <div style={{
              width: 44, height: 44, borderRadius: 6, overflow: "hidden", flexShrink: 0,
              border: "1.5px solid rgba(201,169,74,0.5)",
            }}>
              <img src={profile.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: "grayscale(30%)" }} />
            </div>
          )}
        </div>
      </div>
    );

    return (
      <div className="pq-prof-grid">
        {/* ── Header + stats ── */}
        <div className="pq-prof-head">
          {!own && isSignedIn && (
            <button
              onClick={() => router.push(fromPath)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                background: "none", border: "none", cursor: "pointer",
                color: "var(--ink-mute)", fontSize: 13, fontWeight: 600,
                padding: "0 0 20px", marginLeft: -4,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--ink)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--ink-mute)"; }}
            >
              <ChevronLeft size={15} strokeWidth={2.5} />
              Back to {fromLabel}
            </button>
          )}

          <div style={{ marginBottom: 28 }}>
            {/* Avatar centered against the name + handle/joined block only —
                bio/mutual-friends/actions flow below, full width, so they
                don't pull this row's cross-axis center down with them. */}
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "18px 22px" }}>
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt={profile.username}
                  style={{ width: 96, height: 96, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: "2px solid var(--hairline)" }} />
              ) : (
                <div style={{
                  width: 96, height: 96, borderRadius: "50%", flexShrink: 0,
                  background: "var(--primary)", display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 34, fontWeight: 800, color: "#FFFBF1",
                }}>
                  {profile.username[0]?.toUpperCase()}
                </div>
              )}

              <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <h1 style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800, fontSize: 30, color: "var(--ink)", letterSpacing: -0.6, lineHeight: 1.1, margin: 0, overflowWrap: "anywhere" }}>
                    {profile.display_name || `@${profile.username}`}
                    {profile.is_admin && (
                      // flex align-items:center centers against the line box, not
                      // the glyphs' optical cap-height — at this font size/weight
                      // that reads visibly high next to the star. Nudge down.
                      <span style={{ display: "inline-flex", marginTop: 3 }}>
                        <AdminStar size={20} />
                      </span>
                    )}
                  </h1>
                  <button onClick={handleShare} className="pq-prof-btn" style={{ flexShrink: 0 }}>
                    <Share size={14} strokeWidth={2.2} /> Share
                  </button>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 5, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--ink-mute)", fontWeight: 600, letterSpacing: "0.8px" }}>
                    @{profile.username}
                  </span>
                  {memberSince && (
                    <span style={{ fontSize: 12, color: "var(--ink-mute)" }}>
                      Joined {memberSince}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {profile.bio && (
              <div style={{ fontSize: 14, color: "var(--ink-soft)", marginTop: 14, lineHeight: 1.55, maxWidth: 560 }}>
                {profile.bio}
              </div>
            )}
            {isSignedIn && !own && profile.mutual_friends > 0 && (
              <div style={{ fontSize: 12, color: "var(--ink-mute)", marginTop: 8, display: "flex", alignItems: "center", gap: 5 }}>
                <Users size={12} strokeWidth={2} />
                {profile.mutual_friends} mutual {profile.mutual_friends === 1 ? "friend" : "friends"}
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
                {!own && isSignedIn && (
                  <FriendButton
                    status={profile.friendship_status} busy={busy}
                    onAddFriend={handleAddFriend} onCancelRequest={handleCancelRequest}
                    onAcceptRequest={handleAcceptRequest} onDeclineRequest={handleDeclineRequest}
                    onUnfriend={handleUnfriend}
                  />
                )}
                {!own && isSignedIn && (
                  <div style={{ position: "relative" }} onMouseDown={e => e.stopPropagation()}>
                    <button
                      onClick={() => setShowProfileMenu(v => !v)}
                      aria-label="Profile options"
                      style={{
                        background: "transparent", border: "0.5px solid var(--hairline)",
                        borderRadius: 9, cursor: "pointer",
                        color: "var(--ink-mute)", padding: "8px 9px", display: "flex",
                      }}
                    >
                      <MoreHorizontal size={16} strokeWidth={1.8} />
                    </button>
                    {showProfileMenu && (
                      <div style={{
                        position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 100,
                        background: "var(--surface)", border: "0.5px solid var(--hairline)",
                        borderRadius: 10, boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                        minWidth: 150, overflow: "hidden",
                      }}>
                        <button
                          onClick={() => { setShowProfileMenu(false); if (!reportedUser) setShowReportUser(true); }}
                          disabled={reportedUser}
                          style={{
                            display: "block", width: "100%", padding: "10px 14px",
                            background: "transparent", border: "none",
                            cursor: reportedUser ? "default" : "pointer",
                            fontSize: 14, color: reportedUser ? "var(--ink-mute)" : "var(--liked)", textAlign: "left",
                          }}
                        >
                          {reportedUser ? "Reported" : "Report user"}
                        </button>
                        <div style={{ height: "0.5px", background: "var(--hairline)" }} />
                        <button
                          onClick={handleBlockUser}
                          style={{
                            display: "block", width: "100%", padding: "10px 14px",
                            background: "transparent", border: "none", cursor: "pointer",
                            fontSize: 14, color: "var(--liked)", textAlign: "left",
                          }}
                        >
                          Block user
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
          </div>

          {showReportUser && (
            <ReportDialog
              targetType="user"
              targetId={profile.clerk_user_id}
              onClose={() => setShowReportUser(false)}
              onSubmitted={() => { setReportedUser(true); toast("Report submitted — we'll review this."); }}
            />
          )}

          <div className="pq-prof-stats">
            <Stat value={profile.parks_visited} sub={`/${profile.parks_total}`} label="PARKS VISITED" href={stamps.length > 0 ? "#stamps" : undefined} />
            <Stat value={profile.states_visited} label="STATES" />
            <Stat value={profile.badges.length} label="BADGES EARNED" href={profile.badges.length > 0 ? "#badges" : undefined} />
            <Stat value={profile.bucket_list_count} label="BUCKET LIST" href={own ? "/parks?status=bucketList" : undefined} />
            <Stat value={profile.friend_count} label="FRIENDS" href={own ? "/friends" : undefined} />
          </div>
        </div>

        {/* ── Sidebar: map, progress, passport ── */}
        <aside className="pq-prof-aside">
          <SideCard style={{ padding: "16px 18px 18px" }}>
            <Kicker>Progress</Kicker>
            <div style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 14 }}>
              <ProgressRow
                label="National parks"
                value={profile.parks_visited}
                total={profile.parks_total}
                caption={`${parksPct}% of the national parks`}
              />
              <ProgressRow
                label="NPS areas"
                value={profile.areas_visited}
                total={profile.areas_total}
                caption={`${areasPct}% of all NPS areas`}
              />
            </div>
          </SideCard>

          <SideCard>
            <div style={{ padding: "16px 18px 14px" }}>
              <Kicker>{own ? "Where I've been" : `Where ${firstName} has been`}</Kicker>
              <div style={{ marginTop: 6 }}>
                <span style={{ fontWeight: 800, fontSize: 17, color: "var(--ink)", letterSpacing: -0.3 }}>
                  {stamps.length} {stamps.length === 1 ? "park" : "parks"}
                </span>
              </div>
            </div>
            <div style={{ height: 230, background: "#CECDBC", borderTop: "0.5px solid var(--hairline)", borderBottom: "0.5px solid var(--hairline)" }}>
              {mapParks.length > 0 ? (
                <USAMap
                  parks={mapParks}
                  showControls={false}
                  minZoom={1.5}
                  initialBounds={[[-124.8, 24.4], [-66.9, 49.4]]}
                  onSelectPark={(code) => router.push(`/parks/${code}`)}
                />
              ) : (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#4A4535", fontSize: 13 }}>
                  No park visits yet
                </div>
              )}
            </div>
            <div style={{ padding: "11px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--ink-soft)" }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--visited)" }} />
                Visited
              </span>
              <SectionLink href="/parks">Browse all parks</SectionLink>
            </div>
          </SideCard>

          {own ? (
            <Link href="/passport" aria-label="Open your passport" style={{ textDecoration: "none" }}>{passportCard}</Link>
          ) : passportCard}
        </aside>

        {/* ── Stamps, badges, journal, posts ── */}
        <div className="pq-prof-body">
          <Section
            id="stamps"
            title="Stamps"
            meta={`${stamps.length} ${stamps.length === 1 ? "park" : "parks"} stamped`}
            action={stamps.length > 0 ? <ViewToggle value={stampView} onChange={setStampView} /> : undefined}
          >
            {stamps.length === 0 ? (
              <div style={{ fontSize: 13.5, color: "var(--ink-mute)" }}>
                No stamps yet. <Link href="/parks" style={{ color: "var(--ink-soft)", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 3 }}>Browse the parks</Link>
              </div>
            ) : stampView === "stamps" ? (
              <StampGrid stamps={shownStamps} meta={parkMeta} />
            ) : (
              <StampList stamps={shownStamps} />
            )}
            {stamps.length > STAMPS_COLLAPSED && (
              <div style={{ marginTop: 12, textAlign: "center" }}>
                <button onClick={() => setShowAllStamps((v) => !v)} className="pq-prof-btn">
                  {showAllStamps ? "Show fewer" : `Show all ${stamps.length} stamps`}
                </button>
              </div>
            )}
          </Section>

          {profile.badges.length > 0 && (
            <Section
              id="badges"
              title="Badges"
              meta={`${profile.badges.length} earned`}
              action={own ? <SectionLink href="/badges">All badges</SectionLink> : undefined}
            >
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {profile.badges.map((b) => {
                  const accent = badgeAccent(b);
                  return (
                    <button
                      key={b.badge_id}
                      onClick={() => setSelectedBadge(b)}
                      style={{
                        display: "flex", alignItems: "center", gap: 6,
                        background: accent.bg,
                        border: `1px solid ${accent.color}33`,
                        borderRadius: 8, padding: "5px 10px",
                        cursor: "pointer",
                        transition: "filter 120ms",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(0.96)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.filter = "none"; }}
                    >
                      <span style={{ fontSize: 15 }}>{b.emoji}</span>
                      <div>
                        <div style={{ fontSize: 11.5, fontWeight: 650, color: "var(--ink)", lineHeight: 1.2 }}>{b.name}</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 8.5, letterSpacing: "0.8px", color: accent.color, fontWeight: 600, textTransform: "uppercase" }}>
                          {b.tier}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </Section>
          )}

          {selectedBadge && (
            <BadgeModal
              badge={selectedBadge}
              onClose={() => setSelectedBadge(null)}
              isOwnProfile={own}
              onShare={(b) => { setSelectedBadge(null); setSharingBadge(b); }}
            />
          )}

          {sharingBadge && (
            <BadgeShareModal
              badge={{
                id: sharingBadge.badge_id,
                name: sharingBadge.name,
                description: sharingBadge.description ?? "",
                emoji: sharingBadge.emoji,
                tier: sharingBadge.tier,
                colors: sharingBadge.colors,
              }}
              onClose={() => setSharingBadge(null)}
            />
          )}

          <Section
            id="journal"
            title="Journal"
            action={own ? <SectionLink href="/journal">Open journal</SectionLink> : undefined}
          >
            <JournalTimeline
              entries={profile.journal}
              onEdit={own ? handleEditVisit : undefined}
            />
          </Section>

          {profile.recent_posts.length > 0 && (
            <Section id="posts" title="Posts">
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {profile.recent_posts.map((post) => (
                  <PostCard key={post.id} post={post} onLike={handleLike} onDelete={id => setProfile(prev => prev ? { ...prev, recent_posts: prev.recent_posts.filter(p => p.id !== id) } : prev)} onEditVisit={handleEditVisit} onUserBlocked={() => router.push(fromPath)} />
                ))}
              </div>
            </Section>
          )}
        </div>
      </div>
    );
  };

  const content = (
    <div className={inShell ? "pq-prof pq-prof--shell" : "pq-prof"}>
      <style>{PROFILE_CSS}</style>
      <div className="pq-prof-inner">
        {profile ? renderProfile(profile) : emptyOrLoading}
      </div>
    </div>
  );

  // Signed-in users get the full shell
  if (inShell) {
    return (
      <>
        <LogVisitModal
          open={!!editDraft}
          editMode
          initialDraft={editDraft}
          onClose={() => setEditDraft(undefined)}
          onPosted={() => {
            setEditDraft(undefined);
            fetch(`/api/users/${encodeURIComponent(username)}`)
              .then((r) => r.json())
              .then((data) => setProfile(data))
              .catch(() => {});
          }}
        />
        <DesktopShell>{content}</DesktopShell>
      </>
    );
  }

  const displayName = profile?.display_name || (profile ? `@${profile.username}` : "This explorer");
  const profilePath = `/profile/${username}`;

  return (
    <>
    <LogVisitModal
      open={!!editDraft}
      editMode
      initialDraft={editDraft}
      onClose={() => setEditDraft(undefined)}
      onPosted={() => setEditDraft(undefined)}
    />
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      <PublicNav redirectTo={profilePath} />

      <div style={{ flex: 1 }}>{content}</div>

      <PublicFooter />

      {/* Sign-up banner — sticky rather than fixed, so it rides the bottom of
          the viewport but comes to rest under the footer instead of covering it */}
      <div className="pq-signup-banner" style={{
        position: "sticky", bottom: 0, zIndex: 200,
        background: "var(--primary)", padding: "16px 24px", gap: 16,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#FFFBF1", overflowWrap: "break-word" }}>
            Join {displayName} on ParkQuest
          </div>
          <div style={{ fontSize: 12.5, color: "rgba(255,251,241,0.75)", marginTop: 2 }}>
            Track your national park adventures, earn badges, and connect with friends.
          </div>
        </div>
        <div className="pq-signup-banner-actions" style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <Link href={`/sign-in?redirect=${encodeURIComponent(profilePath)}`} style={{ textDecoration: "none" }}>
            <button style={{
              background: "rgba(255,251,241,0.15)", border: "1px solid rgba(255,251,241,0.35)",
              borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 600,
              color: "#FFFBF1", cursor: "pointer", whiteSpace: "nowrap",
            }}>Sign in</button>
          </Link>
          <Link href="/sign-up" style={{ textDecoration: "none" }}>
            <button style={{
              background: "#FFFBF1", border: "none",
              borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 700,
              color: "var(--primary)", cursor: "pointer", whiteSpace: "nowrap",
            }}>Create free account</button>
          </Link>
        </div>
      </div>

      {showAppOverlay && (
        <OpenInAppOverlay
          title="Open this profile in the app"
          description="See full park stamps, badges, and posts, and connect with friends in the ParkQuest app."
          onDismiss={() => setShowAppOverlay(false)}
          onOpenApp={openApp}
          appStoreUrl={APP_STORE_URL}
        />
      )}
    </div>
    </>
  );
}
