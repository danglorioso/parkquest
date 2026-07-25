"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  MapPin, Users, UserCheck, UserPlus, Clock,
  TreePine, Award, ChevronLeft, X, Lock, Pencil,
  MoreHorizontal, Share2,
} from "lucide-react";
import { DesktopShell } from "@/components/desktop/DesktopShell";
import Logo from "@/components/Logo";
import { OpenInAppOverlay } from "@/components/OpenInAppOverlay";
import type { MapPark } from "@/components/USAMapGL";
import { PostCard, ReportDialog, type FeedPost } from "@/components/PostCard";
import { useToast } from "@/components/ToastProvider";
import { AdminStar } from "@/components/AdminStar";
import { LogVisitModal, type VisitDraft } from "@/components/LogVisitModal";
import { BadgeShareModal } from "@/components/BadgeShareModal";

const APP_STORE_URL: string | null = 'https://apps.apple.com/us/app/parkquest-national-park-log/id6778208311';

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

interface ProfileData {
  clerk_user_id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  is_admin?: boolean;
  created_at: string | null;
  parks_visited: number;
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

function StatPill({ value, label, sub }: { value: string | number; label: string; sub?: string }) {
  return (
    <div style={{ textAlign: "center", padding: "18px 12px" }}>
      <div style={{ fontWeight: 900, fontSize: 28, color: "var(--ink)", letterSpacing: -0.8, lineHeight: 1 }}>
        {value}
        {sub && <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-mute)", letterSpacing: 0 }}>{sub}</span>}
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "1.4px", color: "var(--ink-mute)", fontWeight: 600, marginTop: 4 }}>
        {label}
      </div>
    </div>
  );
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

function Section({ title, icon: Icon, children }: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14 }}>
        <Icon size={13} style={{ color: "var(--ink-mute)" }} strokeWidth={2} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "1.4px", color: "var(--ink-mute)", fontWeight: 600 }}>
          {title}
        </span>
      </div>
      {children}
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
                              <span style={{
                                fontWeight: 700, fontSize: 14, color: "var(--ink)",
                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                              }}>
                                {entry.park_name}
                              </span>
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
    <>
      <style>{`
        @keyframes pq-shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }
        .pq-map-passport-grid { display: grid; grid-template-columns: 1fr 260px; }
        @media (max-width: 640px) {
          .pq-map-passport-grid { grid-template-columns: 1fr; }
        }
      `}</style>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 22, marginBottom: 28 }}>
        <Bone w={84} h={84} r={42} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
          <Bone w={180} h={22} r={6} />
          <Bone w={120} h={13} r={4} />
          <Bone w={260} h={13} r={4} />
        </div>
      </div>
      {/* Stats row */}
      <div style={{ display: "flex", background: "var(--surface)", border: "0.5px solid var(--hairline)", borderRadius: 14, overflow: "hidden", marginBottom: 28 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ flex: 1, padding: "18px 12px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, borderRight: i < 4 ? "0.5px solid var(--hairline)" : "none" }}>
            <Bone w={36} h={28} r={4} />
            <Bone w={52} h={10} r={3} />
          </div>
        ))}
      </div>
      {/* Map + passport */}
      <div className="pq-map-passport-grid" style={{ gap: 16, marginBottom: 28 }}>
        <Bone h={240} r={14} />
        <Bone h={240} r={14} />
      </div>
      {/* Badges */}
      <div style={{ marginBottom: 28 }}>
        <Bone w={100} h={12} r={4} style={{ marginBottom: 14 }} />
        <div style={{ display: "flex", gap: 8 }}>
          {Array.from({ length: 4 }).map((_, i) => <Bone key={i} w={120} h={38} r={8} />)}
        </div>
      </div>
      {/* Journal */}
      <div>
        <Bone w={80} h={12} r={4} style={{ marginBottom: 20 }} />
        <Bone w={48} h={20} r={4} style={{ marginBottom: 16 }} />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} style={{ paddingLeft: 20, marginBottom: 14, position: "relative" }}>
            <Bone h={70} r={10} />
          </div>
        ))}
      </div>
    </>
  );
}

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

  // Signed-out visitors arrive here from a shared /u/<username> link — same
  // "open in app" overlay + deep-link attempt as the shared-post page.
  const [showAppOverlay, setShowAppOverlay] = useState(true);
  const attemptedOpen = useRef(false);
  const openApp = () => { window.location.href = `parkquest://u/${username}`; };
  useEffect(() => {
    if (!isLoaded || isSignedIn || attemptedOpen.current) return;
    attemptedOpen.current = true;
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

  // Build MapPark array for the visited map
  const mapParks: MapPark[] = (profile?.visited_parks ?? [])
    .filter((v) => v.latitude && v.longitude)
    .map((v) => ({
      park_code: v.park_code,
      name: v.name,
      position: [parseFloat(v.latitude!), parseFloat(v.longitude!)] as [number, number],
      status: "visited" as const,
    }));

  // ── Inner page content ────────────────────────────────────────────────────

  const stateAbbr = (states: string) => states.split(",")[0].trim();

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

  const content = profile ? (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 28px 80px" }}>
      <style>{`
        .pq-map-passport-grid { display: grid; grid-template-columns: 1fr 260px; }
        @media (max-width: 640px) {
          .pq-map-passport-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* ── Back button ── */}
      {!profile.is_own_profile && (
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

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 22, marginBottom: 28 }}>
        {profile.avatar_url ? (
          <img src={profile.avatar_url} alt={profile.username}
            style={{ width: 84, height: 84, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: "2px solid var(--hairline)" }} />
        ) : (
          <div style={{
            width: 84, height: 84, borderRadius: "50%", flexShrink: 0,
            background: "var(--primary)", display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 30, fontWeight: 800, color: "#FFFBF1",
          }}>
            {profile.username[0]?.toUpperCase()}
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800, fontSize: 26, color: "var(--ink)", letterSpacing: -0.5, lineHeight: 1.1 }}>
            {profile.display_name || `@${profile.username}`}
            {profile.is_admin && <AdminStar size={20} />}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 3, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-mute)", fontWeight: 600, letterSpacing: "0.8px" }}>
              @{profile.username}
            </span>
            {memberSince && (
              <span style={{ fontSize: 11, color: "var(--ink-mute)" }}>
                Joined {memberSince}
              </span>
            )}
          </div>
          {profile.bio && (
            <div style={{ fontSize: 13.5, color: "var(--ink-soft)", marginTop: 10, lineHeight: 1.55 }}>
              {profile.bio}
            </div>
          )}
          {isSignedIn && !profile.is_own_profile && profile.mutual_friends > 0 && (
            <div style={{ fontSize: 12, color: "var(--ink-mute)", marginTop: 8, display: "flex", alignItems: "center", gap: 5 }}>
              <Users size={12} strokeWidth={2} />
              {profile.mutual_friends} mutual {profile.mutual_friends === 1 ? "friend" : "friends"}
            </div>
          )}
        </div>

        {!profile.is_own_profile && isSignedIn && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <FriendButton
              status={profile.friendship_status} busy={busy}
              onAddFriend={handleAddFriend} onCancelRequest={handleCancelRequest}
              onAcceptRequest={handleAcceptRequest} onDeclineRequest={handleDeclineRequest}
              onUnfriend={handleUnfriend}
            />
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
                  position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 100,
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
          </div>
        )}
      </div>

      {showReportUser && (
        <ReportDialog
          targetType="user"
          targetId={profile.clerk_user_id}
          onClose={() => setShowReportUser(false)}
          onSubmitted={() => { setReportedUser(true); toast("Report submitted — we'll review this."); }}
        />
      )}

      {/* ── Stats row ── */}
      <div style={{
        display: "flex", background: "var(--surface)", border: "0.5px solid var(--hairline)",
        borderRadius: 14, overflow: "hidden", marginBottom: 28,
      }}>
        {[
          { value: profile.parks_visited, sub: "/63", label: "PARKS VISITED" },
          { value: profile.states_visited, label: "STATES" },
          { value: profile.bucket_list_count, label: "BUCKET LIST" },
          { value: profile.badges.length, label: "BADGES EARNED" },
          { value: profile.friend_count, label: "FRIENDS" },
        ].map((s, i, arr) => (
          <div key={s.label} style={{
            flex: 1,
            borderRight: i < arr.length - 1 ? "0.5px solid var(--hairline)" : "none",
          }}>
            <StatPill value={s.value} sub={s.sub} label={s.label} />
          </div>
        ))}
      </div>

      {/* ── Map + Passport card ── */}
      <div className="pq-map-passport-grid" style={{ gap: 16, marginBottom: 28, alignItems: "stretch" }}>
        {/* Map */}
        <div style={{
          borderRadius: 14, overflow: "hidden",
          border: "0.5px solid var(--hairline)",
          minHeight: 240,
          background: "#CECDBC",
        }}>
          {mapParks.length > 0 ? (
            <USAMap
              parks={mapParks}
              showControls={false}
              initialBounds={[[-124.8, 24.4], [-66.9, 49.4]]}
            />
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", minHeight: 240, color: "var(--ink-mute)", fontSize: 13 }}>
              No park visits yet
            </div>
          )}
        </div>

        {/* Passport card */}
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
            <div style={{ fontWeight: 900, fontSize: 20, letterSpacing: "3px", marginTop: 12, color: "#C9A94A", textShadow: "0 1px 0 #8A5E18" }}>
              {profile.display_name?.toUpperCase() || profile.username.toUpperCase()}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "rgba(201,169,74,0.7)", marginTop: 4, letterSpacing: "1px" }}>
              @{profile.username}
            </div>
          </div>

          <div style={{ borderTop: "0.5px dashed rgba(201,169,74,0.3)", paddingTop: 14, marginTop: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                { label: "VISITED", value: `${profile.parks_visited}/63` },
                { label: "STATES", value: `${profile.states_visited}/50` },
                { label: "BADGES", value: String(profile.badges.length) },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, letterSpacing: "1.5px", opacity: 0.6, textTransform: "uppercase" }}>{label}</div>
                  <div style={{ fontWeight: 700, fontSize: 11, marginTop: 2, color: "#C9A94A" }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {profile.avatar_url && (
            <div style={{
              width: 44, height: 44, borderRadius: 6, overflow: "hidden",
              border: "1.5px solid rgba(201,169,74,0.5)",
              marginTop: 14, alignSelf: "flex-end",
            }}>
              <img src={profile.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: "grayscale(30%)" }} />
            </div>
          )}
        </div>
      </div>

      {/* ── Badges ── */}
      {profile.badges.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <Section title="BADGES EARNED" icon={Award}>
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
        </div>
      )}

      {selectedBadge && (
        <BadgeModal
          badge={selectedBadge}
          onClose={() => setSelectedBadge(null)}
          isOwnProfile={profile.is_own_profile}
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

      {/* ── Passport stamps ── */}
      {profile.visited_parks.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <Section title="PARK STAMPS" icon={MapPin}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
              {profile.visited_parks.slice(0, 24).map((v) => (
                <button
                  key={v.park_code}
                  onClick={() => router.push(`/parks/${v.park_code}`)}
                  style={{
                    background: "var(--surface)",
                    border: "0.5px solid var(--hairline)",
                    borderRadius: 10,
                    padding: "11px 13px",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "background 120ms",
                    position: "relative",
                    overflow: "hidden",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-alt)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "var(--surface)"; }}
                >
                  {/* Stamp circle deco */}
                  <div style={{
                    position: "absolute", top: -12, right: -12,
                    width: 44, height: 44, borderRadius: "50%",
                    border: "2px solid var(--primary)", opacity: 0.08,
                  }} />
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--visited)", flexShrink: 0 }} />
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "1px", color: "var(--ink-mute)", fontWeight: 600 }}>
                      {stateAbbr(v.states)}
                    </div>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 12.5, color: "var(--ink)", lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                    {v.name}
                  </div>
                  {v.visited_date && (
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ink-mute)", marginTop: 5, letterSpacing: "0.5px" }}>
                      {new Date(v.visited_date).toLocaleDateString("en-US", { month: "short", year: "numeric" }).toUpperCase()}
                    </div>
                  )}
                </button>
              ))}
            </div>
            {profile.visited_parks.length > 24 && (
              <div style={{ marginTop: 10, fontSize: 12, color: "var(--ink-mute)", textAlign: "center" }}>
                +{profile.visited_parks.length - 24} more parks
              </div>
            )}
          </Section>
        </div>
      )}

      {/* ── Journal timeline ── */}
      <div style={{ marginBottom: 28 }}>
        <Section title="JOURNAL" icon={MapPin}>
          <JournalTimeline
            entries={profile.journal}
            onEdit={profile.is_own_profile ? handleEditVisit : undefined}
          />
        </Section>
      </div>

      {/* ── Posts ── */}
      {profile.recent_posts.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <Section title="POSTS" icon={TreePine}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {profile.recent_posts.map((post) => (
                <PostCard key={post.id} post={post} onLike={handleLike} onDelete={id => setProfile(prev => prev ? { ...prev, recent_posts: prev.recent_posts.filter(p => p.id !== id) } : prev)} onEditVisit={handleEditVisit} onUserBlocked={() => router.push(fromPath)} />
              ))}
            </div>
          </Section>
        </div>
      )}

    </div>
  ) : (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 28px" }}>
      {emptyOrLoading}
    </div>
  );

  // Signed-in users get the full shell
  if (isLoaded && isSignedIn) {
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

  return (
    <>
    <LogVisitModal
      open={!!editDraft}
      editMode
      initialDraft={editDraft}
      onClose={() => setEditDraft(undefined)}
      onPosted={() => setEditDraft(undefined)}
    />
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <style>{`
        .pq-signup-banner { display: flex; align-items: center; justify-content: space-between; }
        @media (max-width: 560px) {
          .pq-signup-banner { flex-direction: column; align-items: stretch; }
          .pq-signup-banner-actions { justify-content: flex-end; }
        }
      `}</style>
      {/* Minimal public nav */}
      <div style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "rgba(245,239,224,0.92)",
        backdropFilter: "blur(20px) saturate(160%)",
        WebkitBackdropFilter: "blur(20px) saturate(160%)",
        borderBottom: "0.5px solid var(--hairline)",
        padding: "0 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        height: 54,
      }}>
        <Logo />
        <div style={{ display: "flex", gap: 8 }}>
          <Link href={`/sign-in?redirect=${encodeURIComponent(`/profile/${username}`)}`} style={{ textDecoration: "none" }}>
            <button style={{
              background: "transparent", border: "0.5px solid var(--hairline)",
              borderRadius: 8, padding: "7px 16px", fontSize: 13, fontWeight: 600,
              color: "var(--ink)", cursor: "pointer",
            }}>Sign in</button>
          </Link>
          <Link href="/sign-up" style={{ textDecoration: "none" }}>
            <button style={{
              background: "var(--primary)", border: "none",
              borderRadius: 8, padding: "7px 16px", fontSize: 13, fontWeight: 700,
              color: "#FFFBF1", cursor: "pointer",
            }}>Get started</button>
          </Link>
        </div>
      </div>

      <div style={{ paddingBottom: 100 }}>{content}</div>

      {/* Sticky sign-up banner */}
      <div className="pq-signup-banner" style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 200,
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
          <Link href={`/sign-in?redirect=${encodeURIComponent(`/profile/${username}`)}`} style={{ textDecoration: "none" }}>
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
