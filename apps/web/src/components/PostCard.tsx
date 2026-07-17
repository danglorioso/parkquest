"use client";

import { useUser } from "@clerk/nextjs";
import { useId, useRef, useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Heart, MessageCircle, Share2,
  MoreHorizontal, MapPin, ChevronLeft, ChevronRight,
  Award, Send, X, Maximize2, Star,
  Globe, Users, Lock,
} from "lucide-react";
import Link from "next/link";
import { parkGradient } from "@/lib/parkGradient";
import { useToast } from "@/components/ToastProvider";
import { AdminStar } from "@/components/AdminStar";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface QuotedPost {
  id: number;
  caption: string | null;
  photos: string[] | null;
  park_code: string | null;
  park_name: string | null;
  badge_id: string | null;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
}

export interface FeedPost {
  id: number;
  caption: string | null;
  photos: string[] | null;
  park_code: string | null;
  badge_id: string | null;
  quoted_post_id: number | null;
  quoted_post: QuotedPost | null;
  visit_id: number | null;
  created_at: string;
  clerk_user_id: string;
  park_name: string | null;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  author_is_admin?: boolean | null;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
  is_friend_post: boolean;
  // Effective visibility — visit posts inherit the visit's setting.
  // null = API didn't return the field (stale deployment); hide the icon.
  visibility?: string | null;
  park_image_url?: string | null;
  // visit metadata (only present on visit posts)
  visit_date: string | null;
  visit_rating: number | null;
  visit_activities: string[] | null;
  visit_weather: string[] | null;
  visit_crowd: number | null;
  visit_difficulty: number | null;
  visit_companion_count: number | null;
  visit_companion_names: Array<{ username: string; display_name: string | null; avatar_url: string | null }> | null;
  visit_highlight: string | null;
  visit_ordinal?: number | null;
}

// ── Badge lookup ──────────────────────────────────────────────────────────────

interface BadgeDisplay {
  id: string;
  name: string;
  description: string;
  emoji: string;
  tier: string;
  colors?: { fill: string; light: string } | null;
}

export const BADGE_MAP = new Map<string, BadgeDisplay>();

// Badge display info lives entirely in the DB; fetch it before first render.
let badgeDefsPromise: Promise<void> | null = null;
function ensureBadgeDefs(): Promise<void> {
  badgeDefsPromise ??= fetch('/api/badges/defs')
    .then(r => r.json())
    .then((d: { badges?: BadgeDisplay[] }) => {
      for (const b of d.badges ?? []) BADGE_MAP.set(b.id, b);
    })
    .catch(() => { badgeDefsPromise = null; }); // allow a retry on next call
  return badgeDefsPromise;
}

export const BADGE_TIER_COLORS: Record<string, { fill: string; light: string }> = {
  bronze:    { fill: "#B27339", light: "#D4A070" },
  silver:    { fill: "#A8A39B", light: "#C5C0B8" },
  gold:      { fill: "#D4A93F", light: "#EBC96A" },
  platinum:  { fill: "#6E97A3", light: "#95B8C2" },
  legendary: { fill: "#8B5DBF", light: "#B08ADE" },
};

// ── Deterministic park gradient ───────────────────────────────────────────────

export { parkGradient };

// ── Relative time ─────────────────────────────────────────────────────────────

export function relTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Avatar ────────────────────────────────────────────────────────────────────

export function Avatar({ url, name, size = 40 }: { url?: string | null; name?: string | null; size?: number }) {
  const initials = (name ?? "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div
      style={{
        width: size, height: size, borderRadius: "50%", overflow: "hidden",
        flexShrink: 0, background: "var(--surface-alt)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: size * 0.32, fontWeight: 700, color: "var(--ink-mute)",
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

// ── ReportDialog ──────────────────────────────────────────────────────────────

export type ReportTargetType = "post" | "comment" | "user";
type ReportReason = "spam" | "harassment" | "inappropriate" | "impersonation" | "misleading" | "other";

const REPORT_REASONS: Record<ReportTargetType, { key: ReportReason; label: string }[]> = {
  user: [
    { key: "harassment", label: "Harassment or bullying" },
    { key: "impersonation", label: "Impersonation" },
    { key: "misleading", label: "Misleading or fake account" },
    { key: "spam", label: "Spam" },
    { key: "inappropriate", label: "Inappropriate content" },
    { key: "other", label: "Other" },
  ],
  post: [
    { key: "spam", label: "Spam" },
    { key: "harassment", label: "Harassment or bullying" },
    { key: "inappropriate", label: "Inappropriate content" },
    { key: "other", label: "Other" },
  ],
  comment: [
    { key: "spam", label: "Spam" },
    { key: "harassment", label: "Harassment or bullying" },
    { key: "inappropriate", label: "Inappropriate content" },
    { key: "other", label: "Other" },
  ],
};

export function ReportDialog({
  targetType, targetId, onClose, onSubmitted,
}: {
  targetType: ReportTargetType;
  targetId: number | string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const reasons = REPORT_REASONS[targetType];
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async () => {
    if (!reason || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType, targetId, reason, details: details.trim() || undefined }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onSubmitted();
      onClose();
    } catch {
      setSubmitting(false);
    }
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9500,
        background: "rgba(0,0,0,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 400,
          background: "var(--surface)", border: "0.5px solid var(--hairline)",
          borderRadius: 16, padding: "20px 20px 18px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.22)",
        }}
      >
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700,
          letterSpacing: "1.2px", color: "var(--ink-mute)", marginBottom: 12,
        }}>
          {targetType === "comment" ? "REPORT COMMENT" : targetType === "user" ? "REPORT USER" : "REPORT POST"}
        </div>

        {reasons.map(r => (
          <button
            key={r.key}
            onClick={() => setReason(r.key)}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              width: "100%", padding: "10px 2px",
              background: "transparent", border: "none",
              borderBottom: "0.5px solid var(--hairline-soft)",
              cursor: "pointer", fontSize: 14, color: "var(--ink)", textAlign: "left",
            }}
          >
            {r.label}
            <span style={{
              width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
              border: `1.5px solid ${reason === r.key ? "var(--primary)" : "var(--ink-mute)"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {reason === r.key && (
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--primary)" }} />
              )}
            </span>
          </button>
        ))}

        <textarea
          value={details}
          onChange={e => setDetails(e.target.value.slice(0, 500))}
          placeholder="Additional details (optional)"
          style={{
            width: "100%", minHeight: 64, marginTop: 12, padding: "8px 10px",
            borderRadius: 10, border: "0.5px solid var(--hairline)",
            fontSize: 13.5, color: "var(--ink)", background: "var(--surface-alt)",
            resize: "vertical", fontFamily: "inherit", boxSizing: "border-box",
          }}
        />

        <button
          onClick={submit}
          disabled={!reason || submitting}
          style={{
            width: "100%", marginTop: 12, padding: "11px 0",
            borderRadius: 10, border: "none",
            background: reason ? "var(--primary)" : "var(--hairline)",
            color: reason ? "#FFFBF1" : "var(--ink-mute)",
            fontSize: 14, fontWeight: 700,
            cursor: reason && !submitting ? "pointer" : "default",
          }}
        >
          {submitting ? "Submitting…" : "Submit report"}
        </button>
      </div>
    </div>,
    document.body
  );
}

// ── Lightbox ──────────────────────────────────────────────────────────────────

function Lightbox({ photos, startIdx, onClose }: {
  photos: string[];
  startIdx: number;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(startIdx);
  const n = photos.length;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setIdx(i => Math.min(i + 1, n - 1));
      if (e.key === "ArrowLeft")  setIdx(i => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [n, onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9000,
        background: "rgba(0,0,0,0.92)",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "zoom-out",
      }}
    >
      {/* Close */}
      <button
        onClick={onClose}
        style={{
          position: "absolute", top: 18, right: 18,
          width: 40, height: 40, borderRadius: "50%",
          background: "rgba(255,255,255,0.12)", border: "none",
          cursor: "pointer", color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1,
        }}
      >
        <X size={20} strokeWidth={2} />
      </button>

      {/* Counter */}
      {n > 1 && (
        <div style={{
          position: "absolute", top: 22, left: "50%", transform: "translateX(-50%)",
          fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600,
          color: "rgba(255,255,255,0.6)", letterSpacing: "0.5px",
        }}>
          {idx + 1} / {n}
        </div>
      )}

      {/* Image */}
      <img
        src={photos[idx]}
        alt=""
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: "90vw", maxHeight: "90vh",
          objectFit: "contain", borderRadius: 8,
          cursor: "default",
          userSelect: "none",
        }}
      />

      {/* Prev */}
      {idx > 0 && (
        <button
          onClick={e => { e.stopPropagation(); setIdx(idx - 1); }}
          style={{
            position: "absolute", left: 18, top: "50%", transform: "translateY(-50%)",
            width: 48, height: 48, borderRadius: "50%",
            background: "rgba(255,255,255,0.12)", border: "none",
            cursor: "pointer", color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <ChevronLeft size={24} strokeWidth={2} />
        </button>
      )}

      {/* Next */}
      {idx < n - 1 && (
        <button
          onClick={e => { e.stopPropagation(); setIdx(idx + 1); }}
          style={{
            position: "absolute", right: 18, top: "50%", transform: "translateY(-50%)",
            width: 48, height: 48, borderRadius: "50%",
            background: "rgba(255,255,255,0.12)", border: "none",
            cursor: "pointer", color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <ChevronRight size={24} strokeWidth={2} />
        </button>
      )}

      {/* Dot strip */}
      {n > 1 && (
        <div style={{
          position: "absolute", bottom: 22, left: "50%", transform: "translateX(-50%)",
          display: "flex", gap: 6,
        }}>
          {photos.map((_, k) => (
            <button
              key={k}
              onClick={e => { e.stopPropagation(); setIdx(k); }}
              style={{
                width: k === idx ? 22 : 7, height: 7, borderRadius: 4,
                background: k === idx ? "#fff" : "rgba(255,255,255,0.35)",
                border: "none", cursor: "pointer", padding: 0,
                transition: "width 200ms ease, background 200ms ease",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── PhotoCarousel ─────────────────────────────────────────────────────────────

function PhotoCarousel({ photos, parkCode }: { photos: string[]; parkCode: string | null }) {
  const [idx, setIdx] = useState(0);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const n = photos.length;

  return (
    <>
      {lightboxIdx !== null && (
        <Lightbox
          photos={photos.filter(Boolean)}
          startIdx={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
        />
      )}

      <div className="pq-photo-frame" style={{ position: "relative", height: 480, overflow: "hidden", userSelect: "none" }}>
        {photos.map((src, k) => (
          <div
            key={k}
            style={{
              position: "absolute", inset: 0,
              opacity: k === idx ? 1 : 0,
              transition: "opacity 280ms ease",
            }}
          >
            {src ? (
              <div style={{ width: "100%", height: "100%", cursor: "pointer" }}
                onClick={() => setLightboxIdx(idx)}
              >
                <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
            ) : (
              <div style={{ width: "100%", height: "100%", background: parkGradient(parkCode ?? "xx") }} />
            )}
          </div>
        ))}

        {/* Top-right: counter + expand button */}
        <div style={{ position: "absolute", top: 10, right: 10, display: "flex", alignItems: "center", gap: 6 }}>
          {n > 1 && (
            <div style={{
              background: "rgba(20,17,12,0.6)", backdropFilter: "blur(8px)",
              color: "#FFFBF1", padding: "5px 10px", borderRadius: 100,
              fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 500,
              pointerEvents: "none",
            }}>
              {idx + 1} / {n}
            </div>
          )}
          <button
            className="pq-expand-btn"
            onClick={e => { e.stopPropagation(); setLightboxIdx(idx); }}
            style={{
              background: "rgba(20,17,12,0.6)", backdropFilter: "blur(8px)",
              color: "#FFFBF1", border: "none", cursor: "pointer",
              borderRadius: "50%", width: 34, height: 34,
              display: "flex", alignItems: "center", justifyContent: "center",
              opacity: 0, transition: "opacity 160ms ease",
            }}
          >
            <Maximize2 size={15} strokeWidth={2} />
          </button>
        </div>

        {idx > 0 && (
          <button
            onClick={e => { e.stopPropagation(); setIdx(idx - 1); }}
            style={{
              position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
              width: 38, height: 38, borderRadius: "50%",
              background: "none",
              border: "none", cursor: "pointer", color: "#FFFBF1",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <ChevronLeft size={18} strokeWidth={2.4} />
          </button>
        )}
        {idx < n - 1 && (
          <button
            onClick={e => { e.stopPropagation(); setIdx(idx + 1); }}
            style={{
              position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
              width: 38, height: 38, borderRadius: "50%",
              background: "none",
              border: "none", cursor: "pointer", color: "#FFFBF1",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <ChevronRight size={18} strokeWidth={2.4} />
          </button>
        )}

        {n > 1 && (
          <div style={{
            position: "absolute", bottom: 14, left: 0, right: 0,
            display: "flex", justifyContent: "center", gap: 5, pointerEvents: "none",
          }}>
            {photos.map((_, k) => (
              <div
                key={k}
                style={{
                  width: k === idx ? 22 : 6, height: 6, borderRadius: 4,
                  background: k === idx ? "#FFFBF1" : "rgba(255,251,241,0.50)",
                  transition: "width 200ms ease",
                }}
              />
            ))}
          </div>
        )}
      </div>

      <style>{`
        .pq-photo-frame:hover .pq-expand-btn { opacity: 1 !important; }
      `}</style>
    </>
  );
}

// ── BadgePostBody ─────────────────────────────────────────────────────────────

function BadgePostBody({ badgeId }: { badgeId: string }) {
  const [badge, setBadge] = useState(() => BADGE_MAP.get(badgeId));

  // Static defs never carry admin edits (custom colors, renames), so always
  // refresh from the server defs and re-read.
  useEffect(() => {
    let active = true;
    ensureBadgeDefs().then(() => { if (active) setBadge(BADGE_MAP.get(badgeId)); });
    return () => { active = false; };
  }, [badgeId]);

  if (!badge) return null;
  const colors = badge.colors ?? BADGE_TIER_COLORS[badge.tier] ?? BADGE_TIER_COLORS.bronze;

  return (
    <div style={{ padding: "0 18px 16px" }}>
      <div style={{
        borderRadius: 14, padding: "18px 20px",
        background: `linear-gradient(140deg, ${colors.fill}1a 0%, ${colors.light}14 100%)`,
        border: `0.5px solid ${colors.fill}40`,
        display: "flex", alignItems: "center", gap: 18,
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: "50%", flexShrink: 0,
          background: `linear-gradient(140deg, ${colors.light} 0%, ${colors.fill} 100%)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 30, boxShadow: `0 6px 20px ${colors.fill}50`,
        }}>
          {badge.emoji}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "1.4px",
            color: colors.fill, fontWeight: 700, marginBottom: 3, textTransform: "uppercase",
          }}>
            {badge.tier} badge
          </div>
          <div style={{ fontWeight: 800, fontSize: 18, color: "var(--ink)", letterSpacing: -0.3, lineHeight: 1.2 }}>
            {badge.name}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--ink-mute)", marginTop: 4, lineHeight: 1.45 }}>
            {badge.description}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── LikesTooltip ──────────────────────────────────────────────────────────────

interface Liker { user_id: string; display_name: string | null; username: string | null; }

function LikesTooltip({ postId, likeCount, onLike, children }: {
  postId: number; likeCount: number; onLike: () => void; children: React.ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const [likers, setLikers] = useState<Liker[]>([]);
  const [fetched, setFetched] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const wrapRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    timerRef.current = setTimeout(() => {
      if (wrapRef.current) {
        const r = wrapRef.current.getBoundingClientRect();
        setPos({ x: r.left + r.width / 2, y: r.top });
      }
      setVisible(true);
      if (!fetched && likeCount > 0) {
        fetch(`/api/likes?postId=${postId}`)
          .then(r => r.ok ? r.json() : [])
          .then((rows: Liker[]) => { setLikers(rows); setFetched(true); })
          .catch(() => {});
      }
    }, 250);
  };

  const hide = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
  };

  const label = (() => {
    if (likeCount === 0) return null;
    const names = likers.map(l => l.display_name ?? l.username ?? "Someone");
    if (names.length === 0) return `${likeCount} like${likeCount !== 1 ? "s" : ""}`;
    if (names.length <= 3) return names.join(", ");
    return `${names.slice(0, 2).join(", ")} and ${likeCount - 2} others`;
  })();

  return (
    <div ref={wrapRef} style={{ display: "inline-flex" }} onMouseEnter={show} onMouseLeave={hide}>
      <div onClick={onLike}>{children}</div>
      {visible && label && (
        <div style={{
          position: "fixed", left: pos.x, top: pos.y - 8,
          transform: "translate(-50%, -100%)",
          background: "var(--ink)", color: "var(--bg)",
          padding: "5px 10px", borderRadius: 7,
          fontSize: 11.5, fontWeight: 600, fontFamily: "var(--font-sans)",
          whiteSpace: "nowrap", pointerEvents: "none", zIndex: 9999, letterSpacing: 0.1,
        }}>
          {label}
          <div style={{
            position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)",
            width: 0, height: 0,
            borderLeft: "5px solid transparent", borderRight: "5px solid transparent",
            borderTop: "5px solid var(--ink)",
          }} />
        </div>
      )}
    </div>
  );
}

// ── CommentsPanel ─────────────────────────────────────────────────────────────

interface CommentRow {
  id: number; content: string; created_at: string;
  user_id: string; username: string | null; display_name: string | null; avatar_url: string | null;
  is_admin?: boolean | null;
}

const COMMENT_LIMIT = 500;
const COMMENT_PREVIEW_CHARS = 200;

function CommentsPanel({ postId, initialRows, onCountChange }: {
  postId: number;
  // Preloaded by the card for the inline preview — skip the refetch when present.
  initialRows?: CommentRow[] | null;
  onCountChange: (delta: number) => void;
}) {
  const { user } = useUser();
  const { toast } = useToast();
  const [rows, setRows] = useState<CommentRow[]>(initialRows ?? []);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [activeCommentMenu, setActiveCommentMenu] = useState<number | null>(null);
  const [reportingCommentId, setReportingCommentId] = useState<number | null>(null);
  const [editingComment, setEditingComment] = useState<{ id: number; text: string } | null>(null);
  const [expandedComments, setExpandedComments] = useState<Set<number>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!initialRows) {
      fetch(`/api/comments?postId=${postId}`)
        .then(r => r.ok ? r.json() : [])
        .then(setRows)
        .catch(() => {});
    }
    setTimeout(() => inputRef.current?.focus(), 60);
  // initialRows only matters on mount (whether we already have the full list)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  useEffect(() => {
    if (activeCommentMenu === null) return;
    const close = () => setActiveCommentMenu(null);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [activeCommentMenu]);

  const submit = useCallback(async () => {
    const text = draft.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    setDraft("");
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, content: text }),
      });
      if (res.ok) {
        const newComment = await res.json();
        setRows(prev => [...prev, {
          ...newComment,
          username: user?.username ?? null,
          display_name: user?.fullName ?? null,
          avatar_url: user?.imageUrl ?? null,
        }]);
        onCountChange(1);
      }
    } catch {
      setDraft(text);
    } finally {
      setSubmitting(false);
    }
  }, [draft, submitting, postId, user, onCountChange]);

  const deleteComment = useCallback(async (commentId: number) => {
    setActiveCommentMenu(null);
    setRows(prev => prev.filter(c => c.id !== commentId));
    onCountChange(-1);
    try {
      const res = await fetch(`/api/comments/${commentId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      fetch(`/api/comments?postId=${postId}`).then(r => r.ok ? r.json() : []).then(setRows).catch(() => {});
    }
  }, [postId, onCountChange]);

  const editComment = useCallback(async (commentId: number, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setEditingComment(null);
    setRows(prev => prev.map(c => c.id === commentId ? { ...c, content: trimmed } : c));
    try {
      const res = await fetch(`/api/comments/${commentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: trimmed }),
      });
      if (!res.ok) throw new Error();
    } catch {
      fetch(`/api/comments?postId=${postId}`).then(r => r.ok ? r.json() : []).then(setRows).catch(() => {});
    }
  }, [postId]);

  const myName = user?.fullName ?? user?.username ?? "You";
  const myInitials = myName.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div style={{ borderTop: "0.5px solid var(--hairline-soft)" }}>
      {rows.length > 0 && (
        <div style={{ padding: "10px 18px 4px", display: "flex", flexDirection: "column", gap: 12 }}>
          {rows.map(c => {
            const cname = c.display_name ?? c.username ?? "Explorer";
            const initials = cname.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
            const isOwn = user?.id === c.user_id;
            const isExpanded = expandedComments.has(c.id);
            const isEditing = editingComment?.id === c.id;
            const menuOpen = activeCommentMenu === c.id;
            const avatarEl = (
              <div style={{
                width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                overflow: "hidden", background: "var(--surface-alt)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 9, fontWeight: 700, color: "var(--ink-mute)", fontFamily: "var(--font-mono)",
              }}>
                {c.avatar_url
                  ? <img src={c.avatar_url} alt={cname} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : initials}
              </div>
            );
            const nameEl = (
              <span style={{ fontWeight: 700, fontSize: 12, color: "var(--ink)", marginRight: 6 }}>
                {cname}
                {c.is_admin && <span style={{ marginLeft: 4, display: "inline-flex", verticalAlign: "text-bottom" }}><AdminStar size={12} /></span>}
              </span>
            );
            return (
              <div key={c.id} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
                  {c.username
                    ? <Link href={`/profile/${c.username}`} style={{ textDecoration: "none", flexShrink: 0 }}>{avatarEl}</Link>
                    : avatarEl}
                  <div style={{
                    flex: 1, minWidth: 0,
                    background: "var(--surface-alt)", borderRadius: "4px 12px 12px 12px",
                    padding: "7px 11px", border: "0.5px solid var(--hairline)",
                  }}>
                    {isEditing ? (
                      <div>
                        <textarea
                          autoFocus
                          value={editingComment.text}
                          onChange={e => setEditingComment({ id: c.id, text: e.target.value.slice(0, COMMENT_LIMIT) })}
                          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); editComment(c.id, editingComment.text); } }}
                          style={{
                            width: "100%", minHeight: 40, background: "transparent",
                            border: "none", outline: "none", resize: "vertical",
                            fontSize: 12.5, color: "var(--ink)", fontFamily: "inherit",
                            lineHeight: 1.45, boxSizing: "border-box", padding: 0,
                          }}
                        />
                        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                          <button
                            onClick={() => editComment(c.id, editingComment.text)}
                            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 12, fontWeight: 700, color: "var(--primary)" }}
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingComment(null)}
                            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 12, color: "var(--ink-mute)" }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {c.username
                          ? <Link href={`/profile/${c.username}`} className="hover:underline" style={{ textDecoration: "none" }}>{nameEl}</Link>
                          : nameEl}
                        <span style={{ fontSize: 12.5, color: "var(--ink)", lineHeight: 1.45 }}>
                          {isExpanded || c.content.length <= COMMENT_PREVIEW_CHARS
                            ? c.content
                            : c.content.slice(0, COMMENT_PREVIEW_CHARS)}
                          {!isExpanded && c.content.length > COMMENT_PREVIEW_CHARS && (
                            <button
                              onClick={() => setExpandedComments(prev => { const next = new Set(prev); next.add(c.id); return next; })}
                              style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 12.5, color: "var(--ink-mute)" }}
                            >
                              … more
                            </button>
                          )}
                        </span>
                      </>
                    )}
                  </div>
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <button
                      onClick={e => { e.stopPropagation(); setActiveCommentMenu(menuOpen ? null : c.id); }}
                      onMouseDown={e => e.stopPropagation()}
                      style={{
                        background: "transparent", border: "none", cursor: "pointer",
                        color: "var(--ink-mute)", padding: 4, borderRadius: 6, display: "flex",
                      }}
                    >
                      <MoreHorizontal size={13} strokeWidth={1.8} />
                    </button>
                    {menuOpen && (
                      <div
                        onMouseDown={e => e.stopPropagation()}
                        style={{
                          position: "absolute", top: "calc(100% + 2px)", right: 0, zIndex: 100,
                          background: "var(--surface)", border: "0.5px solid var(--hairline)",
                          borderRadius: 10, boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                          minWidth: 110, overflow: "hidden",
                        }}
                      >
                        {isOwn ? (
                          <>
                            <button
                              onClick={() => { setActiveCommentMenu(null); setEditingComment({ id: c.id, text: c.content }); }}
                              style={{
                                display: "block", width: "100%", padding: "9px 14px",
                                background: "transparent", border: "none", cursor: "pointer",
                                fontSize: 13, color: "var(--ink)", textAlign: "left",
                              }}
                            >
                              Edit
                            </button>
                            <div style={{ height: "0.5px", background: "var(--hairline)" }} />
                            <button
                              onClick={() => deleteComment(c.id)}
                              style={{
                                display: "block", width: "100%", padding: "9px 14px",
                                background: "transparent", border: "none", cursor: "pointer",
                                fontSize: 13, color: "var(--liked)", textAlign: "left",
                              }}
                            >
                              Delete
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => { setActiveCommentMenu(null); setReportingCommentId(c.id); }}
                            style={{
                              display: "block", width: "100%", padding: "9px 14px",
                              background: "transparent", border: "none", cursor: "pointer",
                              fontSize: 13, color: "var(--liked)", textAlign: "left",
                            }}
                          >
                            Report
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{
                  paddingLeft: 37, fontFamily: "var(--font-mono)",
                  fontSize: 9.5, color: "var(--ink-mute)", letterSpacing: "0.3px",
                }}>
                  {relTime(c.created_at)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {reportingCommentId != null && (
        <ReportDialog
          targetType="comment"
          targetId={reportingCommentId}
          onClose={() => setReportingCommentId(null)}
          onSubmitted={() => toast("Report submitted — we'll review this.")}
        />
      )}

      <div style={{ display: "flex", gap: 9, alignItems: "center", padding: "10px 18px 14px" }}>
        <div style={{
          width: 28, height: 28, borderRadius: "50%", flexShrink: 0, overflow: "hidden",
          background: "var(--surface-alt)", display: "flex", alignItems: "center",
          justifyContent: "center", fontSize: 9, fontWeight: 700, color: "var(--ink-mute)",
          fontFamily: "var(--font-mono)",
        }}>
          {user?.imageUrl
            ? <img src={user.imageUrl} alt={myName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : myInitials}
        </div>
        <div style={{
          flex: 1, display: "flex", alignItems: "center",
          background: "var(--surface-alt)", border: "0.5px solid var(--hairline)",
          borderRadius: 20, paddingLeft: 13, paddingRight: 6, gap: 6,
        }}>
          <input
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value.slice(0, COMMENT_LIMIT))}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
            placeholder="Add a comment…"
            style={{
              flex: 1, background: "transparent", border: "none", outline: "none",
              fontSize: 13, color: "var(--ink)", fontFamily: "var(--font-sans)", padding: "7px 0",
            }}
          />
          {draft.length >= COMMENT_LIMIT - 50 && (
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-mute)",
              flexShrink: 0,
            }}>
              {COMMENT_LIMIT - draft.length}
            </span>
          )}
          <button
            onClick={submit}
            disabled={!draft.trim() || submitting}
            className="hover:opacity-75 transition-opacity"
            style={{
              background: draft.trim() ? "var(--primary)" : "transparent",
              border: "none", borderRadius: 16,
              width: 28, height: 28, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: draft.trim() ? "pointer" : "default",
              color: draft.trim() ? "#FFFBF1" : "var(--ink-mute)",
              transition: "background 140ms ease",
            }}
          >
            <Send size={13} strokeWidth={2.2} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Visit metadata display ────────────────────────────────────────────────────

function WxSvg({ children, size = 14, sw = 1.8 }: { children: React.ReactNode; size?: number; sw?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      {children}
    </svg>
  );
}

const WEATHER_ICONS: Record<string, (size?: number) => React.ReactNode> = {
  clear:  (s) => <WxSvg size={s}><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/></WxSvg>,
  partly: (s) => <WxSvg size={s}><circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 3.4l-1 1"/><path d="M11 19h7a3.2 3.2 0 0 0 .3-6.38A4.7 4.7 0 0 0 10 12 3.3 3.3 0 0 0 11 19z"/></WxSvg>,
  cloudy: (s) => <WxSvg size={s}><path d="M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6 9.5 4.2 4.2 0 0 0 7 18z"/></WxSvg>,
  rain:   (s) => <WxSvg size={s}><path d="M7 14h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6 5.5 4.2 4.2 0 0 0 7 14z"/><path d="M8 18l-1 2.5M12 18l-1 2.5M16 18l-1 2.5"/></WxSvg>,
  storm:  (s) => <WxSvg size={s}><path d="M7 13h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6 4.5 4.2 4.2 0 0 0 7 13z"/><path d="M13 13l-3 5h3l-2 4"/></WxSvg>,
  snow:   (s) => <WxSvg size={s}><path d="M12 2v20M2 12h20M4.5 4.5l15 15M19.5 4.5l-15 15"/></WxSvg>,
  fog:    (s) => <WxSvg size={s}><path d="M5 9h12a4 4 0 0 0 .5-7.97A6 6 0 0 0 6 .5"/><path d="M3 13h16M5 17h14M7 21h10"/></WxSvg>,
  wind:   (s) => <WxSvg size={s}><path d="M3 8h11a3 3 0 1 0-3-3M3 16h14a3 3 0 1 1-3 3M3 12h9"/></WxSvg>,
};

const WEATHER_LABELS: Record<string, string> = {
  clear: "Clear", partly: "Partly", cloudy: "Cloudy",
  rain: "Rain", storm: "Storms", snow: "Snow", fog: "Fog", wind: "Windy",
};
const CROWD_LABELS  = ["Empty", "Quiet", "Moderate", "Busy", "Packed"];
const DIFF_LABELS   = ["Easy", "Light", "Moderate", "Hard", "Strenuous"];

function StarRating({ rating }: { rating: number }) {
  return (
    <span style={{ fontSize: 13, letterSpacing: 1.5, lineHeight: 1 }}>
      {Array.from({ length: 5 }, (_, i) => {
        const full = rating >= i + 1;
        const half = !full && rating >= i + 0.5;
        return (
          <span key={i} style={{ position: "relative", display: "inline-block", width: 13 }}>
            <span style={{ color: "var(--hairline)" }}>★</span>
            {(full || half) && (
              <span style={{
                position: "absolute", left: 0, top: 0,
                color: "#C49A28",
                clipPath: half ? "inset(0 50% 0 0)" : undefined,
              }}>★</span>
            )}
          </span>
        );
      })}
    </span>
  );
}

function CompanionLink({ username, displayName, avatarUrl }: {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLAnchorElement>(null);

  return (
    <>
      <Link
        ref={ref}
        href={`/profile/${username}`}
        onMouseEnter={() => {
          if (ref.current) {
            const r = ref.current.getBoundingClientRect();
            setPos({ x: r.left + r.width / 2, y: r.top });
          }
        }}
        onMouseLeave={() => setPos(null)}
        style={{
          color: "inherit", textDecoration: "underline",
          textDecorationStyle: "dotted", textUnderlineOffset: 2,
          cursor: "pointer",
        }}
      >
        {displayName ?? `@${username}`}
      </Link>
      {pos && typeof document !== "undefined" && createPortal(
        <div
          style={{
            position: "fixed",
            left: pos.x, top: pos.y - 10,
            transform: "translate(-50%, -100%)",
            background: "var(--surface)", border: "0.5px solid var(--hairline)",
            borderRadius: 12, padding: "10px 12px", zIndex: 9999,
            boxShadow: "0 4px 20px rgba(0,0,0,0.14)",
            display: "flex", alignItems: "center", gap: 10,
            pointerEvents: "none", whiteSpace: "nowrap",
          }}
        >
          <Avatar url={avatarUrl} name={displayName ?? username} size={30} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)" }}>
              {displayName ?? username}
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-mute)", marginTop: 1 }}>
              @{username}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

function MetaChip({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      background: "var(--surface-alt)", border: "0.5px solid var(--hairline)",
      borderRadius: 100, padding: "4px 10px",
      fontSize: 11.5, fontWeight: 600, color: "var(--ink-soft)",
      whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}

function VisitMeta({ post, heroDate = false }: { post: FeedPost; heroDate?: boolean }) {
  const hasAny = post.visit_date || post.visit_rating || (post.visit_activities?.length ?? 0) > 0
    || (post.visit_weather?.length ?? 0) > 0 || post.visit_crowd || post.visit_difficulty
    || (post.visit_companion_count ?? 0) > 0 || post.visit_highlight;

  if (!hasAny) return null;

  const dateLabel = post.visit_date
    ? new Date(post.visit_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  return (
    <div style={{ padding: "0 18px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Highlight */}
      {post.visit_highlight && (
        <div style={{ fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.45, fontStyle: "italic" }}>
          "{post.visit_highlight}"
        </div>
      )}

      {/* Chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {post.visit_rating && (
          <MetaChip>
            <span style={{ color: "#C49A28", marginRight: 3, fontSize: 12 }}>★</span>
            {post.visit_rating % 1 === 0 ? post.visit_rating.toFixed(0) : post.visit_rating.toFixed(1)}
          </MetaChip>
        )}
        {dateLabel && !heroDate && (
          <MetaChip>
            <span style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.2px" }}>{dateLabel}</span>
          </MetaChip>
        )}
        {post.visit_weather?.map(w => (
          <MetaChip key={w}>
            {WEATHER_ICONS[w]?.(13)}
            <span style={{ marginLeft: 4 }}>{WEATHER_LABELS[w] ?? w}</span>
          </MetaChip>
        ))}
        {post.visit_crowd ? <MetaChip>{CROWD_LABELS[post.visit_crowd - 1]} crowd</MetaChip> : null}
        {post.visit_difficulty ? <MetaChip>{DIFF_LABELS[post.visit_difficulty - 1]}</MetaChip> : null}
        {post.visit_activities?.map(a => (
          <MetaChip key={a}>{a.charAt(0).toUpperCase() + a.slice(1)}</MetaChip>
        ))}
        {(post.visit_companion_count ?? 0) > 0 && (() => {
          const names = post.visit_companion_names;
          if (names && names.length > 0) {
            const MAX = 2;
            const shown = names.slice(0, MAX);
            const extra = names.length - MAX;
            return (
              <MetaChip>
                {"With "}
                {shown.map((c, i) => (
                  <span key={c.username}>
                    {i > 0 && ", "}
                    <CompanionLink username={c.username} displayName={c.display_name} avatarUrl={c.avatar_url} />
                  </span>
                ))}
                {extra > 0 && `, +${extra} more`}
              </MetaChip>
            );
          }
          return (
            <MetaChip>
              +{post.visit_companion_count} {post.visit_companion_count === 1 ? "companion" : "companions"}
            </MetaChip>
          );
        })()}
      </div>
    </div>
  );
}

// ── ParkHeroBanner — visit posts with no photos ───────────────────────────────

function ParkHeroBanner({ post }: { post: FeedPost }) {
  const [npsImageUrl, setNpsImageUrl] = useState<string | null>(null);
  const imageUrl = post.park_image_url ?? npsImageUrl;

  useEffect(() => {
    if (post.park_image_url || !post.park_code) return;
    fetch(`/api/parks/${post.park_code}/images`)
      .then(r => r.json())
      .then((d: { images?: { url: string }[] }) => {
        const url = d.images?.[0]?.url ?? null;
        if (url) setNpsImageUrl(url);
      })
      .catch(() => {});
  }, [post.park_code, post.park_image_url]);

  const inner = (
    <div style={{
      position: "relative", height: 190, borderRadius: 14, overflow: "hidden",
      background: imageUrl ? undefined : parkGradient(post.park_code ?? "xx"),
    }}>
      {imageUrl && (
        <img src={imageUrl} alt={post.park_name ?? ""} style={{
          position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover",
        }} />
      )}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(to bottom, transparent 25%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0.82) 100%)",
      }} />
      <div style={{ position: "absolute", left: 16, right: 16, bottom: 14 }}>
        <div style={{
          fontWeight: 800, fontSize: 19, color: "#FFFBF1",
          letterSpacing: -0.3, lineHeight: 1.2,
          textShadow: "0 1px 8px rgba(0,0,0,0.4)",
        }}>
          {post.park_name ?? "National Park"}
        </div>
        {post.visit_date && (
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600,
            color: "rgba(255,251,241,0.85)", marginTop: 3, letterSpacing: "0.4px",
          }}>
            {new Date(post.visit_date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ padding: "0 18px 14px" }}>
      {post.park_code
        ? <Link href={`/parks/${post.park_code}`} style={{ textDecoration: "none", display: "block" }}>{inner}</Link>
        : inner}
    </div>
  );
}

// ── Visibility icons ──────────────────────────────────────────────────────────

const VIS_ICONS: Record<string, typeof Globe> = {
  public: Globe,
  friends: Users,
  private: Lock,
};
const VIS_ORDER = ["public", "friends", "private"] as const;

// ── PostCard ──────────────────────────────────────────────────────────────────

export function PostCard({
  post,
  onLike,
  from,
  onDelete,
  onEditVisit,
  onUserBlocked,
  canDelete = false,
}: {
  post: FeedPost;
  onLike: (id: number, liked: boolean) => void;
  from?: string;
  onDelete?: (id: number) => void;
  onEditVisit?: (visitId: number) => void;
  // Lets the parent list drop every post by a user the viewer just blocked.
  onUserBlocked?: (userId: string) => void;
  // Lets an admin delete any post, not just their own.
  canDelete?: boolean;
}) {
  const [showComments, setShowComments] = useState(false);
  const [commentDelta, setCommentDelta] = useState(0);
  const [showMenu, setShowMenu] = useState(false);
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [reported, setReported] = useState(false);
  const [editingCaption, setEditingCaption] = useState(false);
  const [captionDraft, setCaptionDraft] = useState(post.caption ?? "");
  const [currentCaption, setCurrentCaption] = useState<string | null>(post.caption ?? null);
  // null = API didn't return the field (stale deployment) — hide the icon
  const [visibility, setVisibility] = useState<string | null>(post.visibility ?? null);
  const [visDraft, setVisDraft] = useState(post.visibility ?? "public");
  // Full comment list, preloaded so the inline preview can render and the
  // panel opens without a spinner.
  const [allComments, setAllComments] = useState<CommentRow[] | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { user } = useUser();
  const { toast } = useToast();
  const isOwnPost = user?.id === post.clerk_user_id;
  const isBadgePost = !!post.badge_id;
  const hasPhotos = !isBadgePost && post.photos && post.photos.length > 0;
  const photos = hasPhotos ? post.photos! : [""];
  const name = post.display_name ?? post.username ?? "Explorer";
  const commentCount = post.comment_count + commentDelta;
  const isFirstVisit = !isBadgePost && !!post.visit_id && Number(post.visit_ordinal) === 1;

  useEffect(() => {
    if (!showMenu) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showMenu]);

  // Lists refetch on focus (e.g. after editing a visit) — keep the locally
  // edited caption/visibility in sync with the fresh server value
  useEffect(() => {
    setCurrentCaption(post.caption ?? null);
  }, [post.caption]);

  useEffect(() => {
    setVisibility(post.visibility ?? null);
  }, [post.visibility]);

  useEffect(() => {
    if (post.comment_count + commentDelta <= 0) { setAllComments([]); return; }
    let active = true;
    fetch(`/api/comments?postId=${post.id}`)
      .then(r => r.ok ? r.json() : [])
      .then((rows: CommentRow[]) => { if (active) setAllComments(rows); })
      .catch(() => {});
    return () => { active = false; };
  }, [post.id, post.comment_count, commentDelta]);

  const previewComments = allComments?.slice(-2) ?? [];

  async function handleDelete() {
    if (!confirm("Delete this post?")) return;
    await fetch(`/api/posts/${post.id}`, { method: "DELETE" });
    onDelete?.(post.id);
    setShowMenu(false);
  }

  async function handleBlock() {
    setShowMenu(false);
    if (!confirm(`Block ${name}?\n\nThey won't be able to see your posts or contact you, and you won't see theirs. This also flags them for review.`)) return;
    try {
      const res = await fetch("/api/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: post.clerk_user_id }),
      });
      if (!res.ok) throw new Error();
      toast(`Blocked ${name}`);
      onUserBlocked?.(post.clerk_user_id);
    } catch {
      toast("Could not block this user. Please try again.", "error");
    }
  }

  async function handleShare() {
    const url = `https://parkquest.me/p/${post.id}`;
    if (navigator.share) {
      try { await navigator.share({ url }); } catch { /* user dismissed */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied");
    } catch {
      toast("Could not copy link", "error");
    }
  }

  async function handleSaveCaption() {
    // Visit posts inherit the visit's visibility, so route the change there;
    // all other posts carry their own
    const res = await fetch(`/api/posts/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        caption: captionDraft,
        ...(post.visit_id == null ? { visibility: visDraft } : {}),
      }),
    });
    if (!res.ok) return;

    if (post.visit_id != null && visDraft !== visibility) {
      const visRes = await fetch(`/api/visits/${post.visit_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility: visDraft }),
      });
      if (visRes.ok) setVisibility(visDraft);
    } else {
      setVisibility(visDraft);
    }
    setCurrentCaption(captionDraft || null);
    setEditingCaption(false);
  }

  return (
    <div style={{
      background: "var(--surface)", borderRadius: 16,
      border: isBadgePost
        ? "1px solid color-mix(in srgb, var(--primary) 38%, transparent)"
        : isFirstVisit
          ? "1px solid color-mix(in srgb, var(--accent) 38%, transparent)"
          : "0.5px solid var(--hairline)",
      overflow: "hidden",
    }}>
      {/* Badge banner */}
      {isBadgePost && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 18px",
          background: "var(--surface-alt)", borderBottom: "0.5px solid var(--hairline-soft)",
        }}>
          <Award size={14} strokeWidth={2} style={{ color: "var(--primary)", flexShrink: 0 }} />
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "1.2px",
            color: "var(--primary)", fontWeight: 700,
          }}>
            BADGE EARNED
          </span>
        </div>
      )}

      {/* First visit banner */}
      {isFirstVisit && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 18px",
          background: "color-mix(in srgb, var(--accent) 10%, transparent)",
          borderBottom: "0.5px solid color-mix(in srgb, var(--accent) 38%, transparent)",
        }}>
          <Star size={14} strokeWidth={2} fill="var(--accent)" style={{ color: "var(--accent)", flexShrink: 0 }} />
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "1.2px",
            color: "var(--accent)", fontWeight: 700,
          }}>
            FIRST VISIT
          </span>
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px 10px" }}>
        <Link href={`/profile/${post.username}${from ? `?from=${from}` : ""}`} style={{ textDecoration: "none", flexShrink: 0 }}>
          <Avatar url={post.avatar_url} name={name} size={40} />
        </Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link href={`/profile/${post.username}${from ? `?from=${from}` : ""}`} style={{ textDecoration: "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>
              {name}
              {post.author_is_admin && <AdminStar />}
            </div>
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--ink-mute)", marginTop: 1 }}>
            <span>
              {post.username && <span>@{post.username} · </span>}
              {relTime(post.created_at)}
            </span>
            {visibility != null && (() => {
              const VisIcon = VIS_ICONS[visibility] ?? Globe;
              return <VisIcon size={11} strokeWidth={2} style={{ opacity: 0.75, flexShrink: 0 }} />;
            })()}
          </div>
        </div>
        <div ref={menuRef} style={{ position: "relative" }}>
          <button
            onClick={() => setShowMenu(v => !v)}
            style={{
              background: "transparent", border: "none",
              cursor: "pointer",
              color: "var(--ink-mute)", padding: 6, borderRadius: 6,
            }}
          >
            <MoreHorizontal size={16} strokeWidth={1.8} />
          </button>
          {showMenu && (
            <div style={{
              position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 100,
              background: "var(--surface)", border: "0.5px solid var(--hairline)",
              borderRadius: 10, boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
              minWidth: 150, overflow: "hidden",
            }}>
              {isOwnPost && post.visit_id && onEditVisit && (
                <>
                  <button
                    onClick={() => { onEditVisit(post.visit_id!); setShowMenu(false); }}
                    style={{
                      display: "block", width: "100%", padding: "10px 14px",
                      background: "transparent", border: "none", cursor: "pointer",
                      fontSize: 14, color: "var(--ink)", textAlign: "left",
                    }}
                  >
                    Edit visit
                  </button>
                  <div style={{ height: "0.5px", background: "var(--hairline)" }} />
                </>
              )}
              {isOwnPost && (
                <>
                  <button
                    onClick={() => { setEditingCaption(true); setCaptionDraft(currentCaption ?? ""); setVisDraft(visibility ?? "public"); setShowMenu(false); }}
                    style={{
                      display: "block", width: "100%", padding: "10px 14px",
                      background: "transparent", border: "none", cursor: "pointer",
                      fontSize: 14, color: "var(--ink)", textAlign: "left",
                    }}
                  >
                    Edit caption
                  </button>
                  <div style={{ height: "0.5px", background: "var(--hairline)" }} />
                </>
              )}
              {!isOwnPost && (
                <>
                  <button
                    onClick={() => { setShowMenu(false); if (!reported) setShowReportDialog(true); }}
                    disabled={reported}
                    style={{
                      display: "block", width: "100%", padding: "10px 14px",
                      background: "transparent", border: "none",
                      cursor: reported ? "default" : "pointer",
                      fontSize: 14, color: reported ? "var(--ink-mute)" : "var(--liked)", textAlign: "left",
                    }}
                  >
                    {reported ? "Reported" : "Report post"}
                  </button>
                  <div style={{ height: "0.5px", background: "var(--hairline)" }} />
                  <button
                    onClick={handleBlock}
                    style={{
                      display: "block", width: "100%", padding: "10px 14px",
                      background: "transparent", border: "none", cursor: "pointer",
                      fontSize: 14, color: "var(--liked)", textAlign: "left",
                    }}
                  >
                    Block user
                  </button>
                  {canDelete && <div style={{ height: "0.5px", background: "var(--hairline)" }} />}
                </>
              )}
              {(isOwnPost || canDelete) && (
                <button
                  onClick={handleDelete}
                  style={{
                    display: "block", width: "100%", padding: "10px 14px",
                    background: "transparent", border: "none", cursor: "pointer",
                    fontSize: 14, color: "var(--liked)", textAlign: "left",
                  }}
                >
                  Delete post
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Park location — hidden on photoless visit posts; the hero banner carries it */}
      {post.park_name && !isBadgePost && !(!hasPhotos && post.visit_id) && (
        <div style={{ padding: "0 18px 10px" }}>
          <Link href={`/parks/${post.park_code}`} style={{ textDecoration: "none" }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--primary)",
              fontWeight: 700, letterSpacing: "0.4px",
            }}>
              <MapPin size={11} strokeWidth={2.4} style={{ color: "var(--primary)" }} />
              {post.park_name.toUpperCase()}
            </div>
          </Link>
        </div>
      )}

      {/* Caption */}
      {editingCaption ? (
        <div style={{ padding: "0 18px 12px" }}>
          <textarea
            value={captionDraft}
            onChange={e => setCaptionDraft(e.target.value)}
            style={{
              width: "100%", minHeight: 80, padding: "8px 10px",
              borderRadius: 8, border: "0.5px solid var(--hairline)",
              fontSize: 15, color: "var(--ink)", resize: "vertical",
              fontFamily: "inherit", lineHeight: 1.5, background: "var(--surface)",
              boxSizing: "border-box",
            }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center" }}>
            <button
              onClick={handleSaveCaption}
              style={{
                padding: "6px 14px", borderRadius: 8,
                background: "var(--primary)", color: "#fff",
                border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
              }}
            >
              Save
            </button>
            <button
              onClick={() => { setEditingCaption(false); setCaptionDraft(currentCaption ?? ""); }}
              style={{
                padding: "6px 14px", borderRadius: 8,
                background: "var(--surface-alt)", color: "var(--ink)",
                border: "0.5px solid var(--hairline)", cursor: "pointer", fontSize: 13,
              }}
            >
              Cancel
            </button>
            <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
              {VIS_ORDER.map(v => {
                const active = visDraft === v;
                const VisIcon = VIS_ICONS[v];
                return (
                  <button
                    key={v}
                    onClick={() => setVisDraft(v)}
                    title={v.charAt(0).toUpperCase() + v.slice(1)}
                    style={{
                      width: 28, height: 28, borderRadius: 8,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: active ? "var(--surface-alt)" : "transparent",
                      border: active
                        ? "1px solid color-mix(in srgb, var(--primary) 25%, transparent)"
                        : "1px solid transparent",
                      cursor: "pointer",
                      color: active ? "var(--primary)" : "var(--ink-mute)",
                    }}
                  >
                    <VisIcon size={13} strokeWidth={2.2} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : currentCaption ? (
        <div style={{ padding: "0 18px 12px", fontSize: 15, color: "var(--ink)", lineHeight: 1.5 }}>
          {currentCaption}
        </div>
      ) : null}

      {/* Badge body */}
      {isBadgePost && post.badge_id && <BadgePostBody badgeId={post.badge_id} />}

      {/* Park hero banner — visit posts with no photos */}
      {!isBadgePost && !hasPhotos && post.visit_id && <ParkHeroBanner post={post} />}

      {/* Visit metadata */}
      {!isBadgePost && <VisitMeta post={post} heroDate={!hasPhotos && !!post.visit_id} />}

      {/* Photo carousel */}
      {!isBadgePost && hasPhotos && <PhotoCarousel photos={photos} parkCode={post.park_code} />}

      {/* Action row */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "12px 18px 14px", borderTop: "0.5px solid var(--hairline-soft)",
      }}>
        <LikesTooltip postId={post.id} likeCount={post.like_count} onLike={() => onLike(post.id, post.liked_by_me)}>
          <button
            className="hover:opacity-75 transition-opacity"
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: post.liked_by_me ? "color-mix(in srgb, var(--liked) 10%, transparent)" : "var(--surface-alt)",
              border: post.liked_by_me ? "0.5px solid color-mix(in srgb, var(--liked) 38%, transparent)" : "0.5px solid var(--hairline)",
              borderRadius: 9, padding: "6px 12px", cursor: "pointer",
              color: post.liked_by_me ? "var(--liked)" : "var(--ink-soft)",
              transition: "background 140ms ease, border-color 140ms ease, color 140ms ease",
            }}
          >
            <Heart
              size={15} strokeWidth={2.2}
              fill={post.liked_by_me ? "var(--liked)" : "none"}
              style={{ color: "inherit", flexShrink: 0 }}
            />
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700,
              letterSpacing: "0.5px", lineHeight: 1,
            }}>
              {post.like_count > 0 ? post.like_count.toLocaleString() : "Like"}
            </span>
          </button>
        </LikesTooltip>

        <button
          onClick={() => setShowComments(v => !v)}
          className="hover:opacity-75 transition-opacity"
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: showComments ? "rgba(31,61,46,0.10)" : "var(--surface-alt)",
            border: showComments ? "0.5px solid rgba(31,61,46,0.30)" : "0.5px solid var(--hairline)",
            borderRadius: 9, padding: "6px 12px", cursor: "pointer",
            color: showComments ? "var(--primary)" : "var(--ink-soft)",
            transition: "background 140ms ease, border-color 140ms ease, color 140ms ease",
          }}
        >
          <MessageCircle size={15} strokeWidth={2.2} style={{ color: "inherit", flexShrink: 0 }} />
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700,
            letterSpacing: "0.5px", lineHeight: 1,
          }}>
            {commentCount > 0 ? commentCount.toLocaleString() : "Comment"}
          </span>
        </button>

        <div style={{ flex: 1 }} />

        <button
          onClick={handleShare}
          aria-label="Share post"
          className="hover:opacity-75 transition-opacity"
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "var(--surface-alt)", border: "0.5px solid var(--hairline)",
            borderRadius: 9, padding: "6px 10px", cursor: "pointer", color: "var(--ink-soft)",
          }}
        >
          <Share2 size={15} strokeWidth={2.2} style={{ color: "inherit", flexShrink: 0 }} />
        </button>
      </div>

      {showReportDialog && (
        <ReportDialog
          targetType="post"
          targetId={post.id}
          onClose={() => setShowReportDialog(false)}
          onSubmitted={() => { setReported(true); toast("Report submitted — we'll review this."); }}
        />
      )}

      {/* Comment preview — last two comments, tap to open the full panel */}
      {!showComments && commentCount > 0 && previewComments.length > 0 && (
        <div style={{ padding: "0 18px 12px", display: "flex", flexDirection: "column", gap: 5 }}>
          {previewComments.map(c => {
            const cname = c.display_name ?? c.username ?? "Explorer";
            const truncated = c.content.length > 100 ? `${c.content.slice(0, 100)}…` : c.content;
            return (
              <div
                key={c.id}
                onClick={() => setShowComments(true)}
                style={{ fontSize: 12.5, color: "var(--ink-soft)", lineHeight: 1.45, cursor: "pointer" }}
              >
                {c.username ? (
                  <Link
                    href={`/profile/${c.username}`}
                    onClick={e => e.stopPropagation()}
                    style={{ fontWeight: 700, color: "var(--ink)", textDecoration: "none" }}
                  >
                    {cname}
                  </Link>
                ) : (
                  <span style={{ fontWeight: 700, color: "var(--ink)" }}>{cname}</span>
                )}
                {" "}{truncated}
              </div>
            );
          })}
          {commentCount > previewComments.length && (
            <button
              onClick={() => setShowComments(true)}
              style={{
                background: "none", border: "none", cursor: "pointer", padding: 0,
                fontSize: 12, fontWeight: 600, color: "var(--ink-mute)", textAlign: "left",
              }}
            >
              View all {commentCount} comment{commentCount !== 1 ? "s" : ""}
            </button>
          )}
        </div>
      )}

      {showComments && (
        <CommentsPanel
          postId={post.id}
          initialRows={allComments}
          onCountChange={delta => setCommentDelta(prev => prev + delta)}
        />
      )}

      {/* Posted date */}
      <div style={{ padding: "4px 18px 14px", fontSize: 11, color: "var(--ink-mute)", letterSpacing: "0.3px" }}>
        {new Date(post.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }).toUpperCase()}
      </div>
    </div>
  );
}
