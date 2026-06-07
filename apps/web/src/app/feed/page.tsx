"use client";

import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useCallback } from "react";
import {
  Heart, MessageCircle, Bookmark,
  MoreHorizontal, MapPin, ChevronLeft, ChevronRight,
  Filter, Plus, Search, Award, Send,
} from "lucide-react";
import Link from "next/link";
import { DesktopShell } from "@/components/desktop/DesktopShell";
import { DesktopHeader } from "@/components/desktop/DesktopHeader";
import { DesktopButton } from "@/components/desktop/DesktopButton";
import { LogVisitModal } from "@/components/LogVisitModal";
import { ALL_BADGES } from "@/lib/badges";

// ── Types ─────────────────────────────────────────────────────────────────────

interface QuotedPost {
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

interface FeedPost {
  id: number;
  caption: string | null;
  photos: string[] | null;
  park_code: string | null;
  badge_id: string | null;
  quoted_post_id: number | null;
  quoted_post: QuotedPost | null;
  created_at: string;
  clerk_user_id: string;
  park_name: string | null;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
  is_friend_post: boolean;
}

// ── Badge lookup ──────────────────────────────────────────────────────────────

const BADGE_MAP = new Map(ALL_BADGES.map(b => [b.id, b]));

const BADGE_TIER_COLORS: Record<string, { fill: string; light: string }> = {
  bronze:    { fill: "#B27339", light: "#D4A070" },
  silver:    { fill: "#A8A39B", light: "#C5C0B8" },
  gold:      { fill: "#D4A93F", light: "#EBC96A" },
  platinum:  { fill: "#6E97A3", light: "#95B8C2" },
  legendary: { fill: "#8B5DBF", light: "#B08ADE" },
};

// ── Deterministic park gradient ───────────────────────────────────────────────

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

// ── Relative time ─────────────────────────────────────────────────────────────

function relTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ url, name, size = 40 }: { url?: string | null; name?: string | null; size?: number }) {
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

// ── PhotoCarousel ─────────────────────────────────────────────────────────────

function PhotoCarousel({ photos, parkCode }: { photos: string[]; parkCode: string | null }) {
  const [idx, setIdx] = useState(0);
  const n = photos.length;

  return (
    <div style={{ position: "relative", height: 480, overflow: "hidden", userSelect: "none" }}>
      {photos.map((src, k) => (
        <div
          key={k}
          style={{
            position: "absolute",
            inset: 0,
            opacity: k === idx ? 1 : 0,
            transition: "opacity 280ms ease",
          }}
        >
          {src ? (
            <img
              src={src}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                background: parkGradient(parkCode ?? "xx"),
              }}
            />
          )}
        </div>
      ))}

      {/* Counter pill */}
      <div
        style={{
          position: "absolute",
          top: 14,
          right: 14,
          background: "rgba(20,17,12,0.6)",
          backdropFilter: "blur(8px)",
          color: "#FFFBF1",
          padding: "5px 10px",
          borderRadius: 100,
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          fontWeight: 500,
        }}
      >
        {idx + 1} / {n}
      </div>

      {/* Arrows */}
      {idx > 0 && (
        <button
          onClick={() => setIdx(idx - 1)}
          style={{
            position: "absolute",
            left: 12,
            top: "50%",
            transform: "translateY(-50%)",
            width: 38,
            height: 38,
            borderRadius: "50%",
            background: "rgba(20,17,12,0.55)",
            backdropFilter: "blur(8px)",
            border: "none",
            cursor: "pointer",
            color: "#FFFBF1",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ChevronLeft size={18} strokeWidth={2.4} />
        </button>
      )}
      {idx < n - 1 && (
        <button
          onClick={() => setIdx(idx + 1)}
          style={{
            position: "absolute",
            right: 12,
            top: "50%",
            transform: "translateY(-50%)",
            width: 38,
            height: 38,
            borderRadius: "50%",
            background: "rgba(20,17,12,0.55)",
            backdropFilter: "blur(8px)",
            border: "none",
            cursor: "pointer",
            color: "#FFFBF1",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ChevronRight size={18} strokeWidth={2.4} />
        </button>
      )}

      {/* Dot indicators */}
      {n > 1 && (
        <div
          style={{
            position: "absolute",
            bottom: 14,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            gap: 5,
            pointerEvents: "none",
          }}
        >
          {photos.map((_, k) => (
            <div
              key={k}
              style={{
                width: k === idx ? 22 : 6,
                height: 6,
                borderRadius: 4,
                background: k === idx ? "#FFFBF1" : "rgba(255,251,241,0.50)",
                transition: "width 200ms ease",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── BadgePostBody ─────────────────────────────────────────────────────────────

function BadgePostBody({ badgeId }: { badgeId: string }) {
  const badge = BADGE_MAP.get(badgeId);
  if (!badge) return null;
  const colors = BADGE_TIER_COLORS[badge.tier] ?? BADGE_TIER_COLORS.bronze;

  return (
    <div style={{ padding: "0 18px 16px" }}>
      <div style={{
        borderRadius: 14,
        padding: "18px 20px",
        background: `linear-gradient(140deg, ${colors.fill}1a 0%, ${colors.light}14 100%)`,
        border: `0.5px solid ${colors.fill}40`,
        display: "flex",
        alignItems: "center",
        gap: 18,
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: "50%", flexShrink: 0,
          background: `linear-gradient(140deg, ${colors.light} 0%, ${colors.fill} 100%)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 30,
          boxShadow: `0 6px 20px ${colors.fill}50`,
        }}>
          {badge.emoji}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "1.4px",
            color: colors.fill, fontWeight: 700, marginBottom: 3,
            textTransform: "uppercase",
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
  postId: number;
  likeCount: number;
  onLike: () => void;
  children: React.ReactNode;
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
          position: "fixed",
          left: pos.x,
          top: pos.y - 8,
          transform: "translate(-50%, -100%)",
          background: "var(--ink)",
          color: "var(--bg)",
          padding: "5px 10px",
          borderRadius: 7,
          fontSize: 11.5,
          fontWeight: 600,
          fontFamily: "var(--font-sans)",
          whiteSpace: "nowrap",
          pointerEvents: "none",
          zIndex: 9999,
          letterSpacing: 0.1,
        }}>
          {label}
          <div style={{
            position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)",
            width: 0, height: 0,
            borderLeft: "5px solid transparent",
            borderRight: "5px solid transparent",
            borderTop: "5px solid var(--ink)",
          }} />
        </div>
      )}
    </div>
  );
}

// ── CommentsPanel ─────────────────────────────────────────────────────────────

interface CommentRow {
  id: number;
  content: string;
  created_at: string;
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

function CommentsPanel({ postId, onCountChange }: { postId: number; onCountChange: (delta: number) => void }) {
  const { user } = useUser();
  const [rows, setRows] = useState<CommentRow[]>([]);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/comments?postId=${postId}`)
      .then(r => r.ok ? r.json() : [])
      .then(setRows)
      .catch(() => {});
    setTimeout(() => inputRef.current?.focus(), 60);
  }, [postId]);

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

  const myName = user?.fullName ?? user?.username ?? "You";
  const myInitials = myName.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div style={{ borderTop: "0.5px solid var(--hairline-soft)" }}>
      {/* Comment list */}
      {rows.length > 0 && (
        <div style={{ padding: "10px 18px 4px", display: "flex", flexDirection: "column", gap: 12 }}>
          {rows.map(c => {
            const cname = c.display_name ?? c.username ?? "Explorer";
            const initials = cname.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
            return (
              <div key={c.id} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
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
                  <div style={{
                    flex: 1, minWidth: 0,
                    background: "var(--surface-alt)", borderRadius: "4px 12px 12px 12px",
                    padding: "7px 11px",
                    border: "0.5px solid var(--hairline)",
                    display: "flex", alignItems: "center",
                  }}>
                    <span style={{ fontWeight: 700, fontSize: 12, color: "var(--ink)", marginRight: 6 }}>{cname}</span>
                    <span style={{ fontSize: 12.5, color: "var(--ink)", lineHeight: 1 }}>{c.content}</span>
                  </div>
                </div>
                <div style={{
                  paddingLeft: 37,
                  fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--ink-mute)",
                  letterSpacing: "0.3px",
                }}>
                  {relTime(c.created_at)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Input row */}
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
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
            placeholder="Add a comment…"
            style={{
              flex: 1, background: "transparent", border: "none", outline: "none",
              fontSize: 13, color: "var(--ink)", fontFamily: "var(--font-sans)",
              padding: "7px 0",
            }}
          />
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

// ── PostCard ──────────────────────────────────────────────────────────────────

function PostCard({
  post,
  onLike,
}: {
  post: FeedPost;
  onLike: (id: number, liked: boolean) => void;
}) {
  const [showComments, setShowComments] = useState(false);
  const [commentDelta, setCommentDelta] = useState(0);
  const isBadgePost = !!post.badge_id;
  const hasPhotos = !isBadgePost && post.photos && post.photos.length > 0;
  const photos = hasPhotos ? post.photos! : [""];
  const name = post.display_name ?? post.username ?? "Explorer";
  const commentCount = post.comment_count + commentDelta;

  return (
    <div
      style={{
        background: "var(--surface)",
        borderRadius: 16,
        border: "0.5px solid var(--hairline)",
        overflow: "hidden",
      }}
    >
      {/* Badge banner */}
      {isBadgePost && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 18px",
          background: "var(--surface-alt)",
          borderBottom: "0.5px solid var(--hairline-soft)",
        }}>
          <Award size={14} strokeWidth={2} style={{ color: "var(--primary)", flexShrink: 0 }} />
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "1.2px",
            color: "var(--primary)",
            fontWeight: 700,
          }}>
            BADGE EARNED
          </span>
        </div>
      )}

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "14px 18px",
        }}
      >
        <Link href={`/profile/${post.username}`} style={{ textDecoration: "none", flexShrink: 0 }}>
          <Avatar url={post.avatar_url} name={name} size={40} />
        </Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link href={`/profile/${post.username}`} style={{ textDecoration: "none" }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>{name}</div>
          </Link>
          <div style={{ fontSize: 12, color: "var(--ink-mute)", marginTop: 1 }}>
            {post.username && <span>@{post.username} · </span>}
            {relTime(post.created_at)}
          </div>
          {post.park_name && !isBadgePost && (
            <Link
              href={`/parks/${post.park_code}`}
              style={{ textDecoration: "none" }}
            >
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  marginTop: 3,
                  fontFamily: "var(--font-mono)",
                  fontSize: 10.5,
                  color: "var(--primary)",
                  fontWeight: 700,
                  letterSpacing: "0.4px",
                }}
              >
                <MapPin size={11} strokeWidth={2.4} style={{ color: "var(--primary)" }} />
                {post.park_name.toUpperCase()}
              </div>
            </Link>
          )}
        </div>
        <button
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "var(--ink-mute)",
            padding: 6,
            borderRadius: 6,
          }}
        >
          <MoreHorizontal size={16} strokeWidth={1.8} />
        </button>
      </div>

      {/* Caption */}
      {post.caption && (
        <div
          style={{
            padding: "0 18px 12px",
            fontSize: 15,
            color: "var(--ink)",
            lineHeight: 1.5,
          }}
        >
          {post.caption}
        </div>
      )}

      {/* Badge body */}
      {isBadgePost && post.badge_id && (
        <BadgePostBody badgeId={post.badge_id} />
      )}

      {/* Photo carousel — only for regular posts with photos */}
      {!isBadgePost && (
        <PhotoCarousel photos={photos} parkCode={post.park_code} />
      )}

      {/* Action row */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "12px 18px 14px",
        borderTop: "0.5px solid var(--hairline-soft)",
      }}>
        {/* Like */}
        <LikesTooltip
          postId={post.id}
          likeCount={post.like_count}
          onLike={() => onLike(post.id, post.liked_by_me)}
        >
          <button
            className="hover:opacity-75 transition-opacity"
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: post.liked_by_me ? "rgba(212,80,64,0.10)" : "var(--surface-alt)",
              border: post.liked_by_me ? "0.5px solid rgba(212,80,64,0.38)" : "0.5px solid var(--hairline)",
              borderRadius: 9, padding: "6px 12px", cursor: "pointer",
              color: post.liked_by_me ? "#D45040" : "var(--ink-soft)",
              transition: "background 140ms ease, border-color 140ms ease, color 140ms ease",
            }}
          >
            <Heart
              size={15} strokeWidth={2.2}
              fill={post.liked_by_me ? "#D45040" : "none"}
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

        {/* Comment */}
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

        {/* Save */}
        <button
          className="hover:opacity-75 transition-opacity"
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "var(--surface-alt)",
            border: "0.5px solid var(--hairline)",
            borderRadius: 9, padding: "6px 10px", cursor: "pointer",
            color: "var(--ink-soft)",
          }}
        >
          <Bookmark size={15} strokeWidth={2.2} style={{ color: "inherit", flexShrink: 0 }} />
        </button>
      </div>

      {/* Comments panel */}
      {showComments && (
        <CommentsPanel
          postId={post.id}
          onCountChange={delta => setCommentDelta(prev => prev + delta)}
        />
      )}
    </div>
  );
}

// ── QuestRing ─────────────────────────────────────────────────────────────────

function QuestRing({ visited, total }: { visited: number; total: number }) {
  const id = useId().replace(/:/g, "");
  const pct = total > 0 ? visited / total : 0;
  const circ = 2 * Math.PI * 34;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ position: "relative", width: 80, height: 80, flexShrink: 0 }}>
        <svg width="80" height="80" viewBox="0 0 80 80">
          <defs>
            <linearGradient id={`qr${id}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--primary)" />
              <stop offset="100%" stopColor="var(--accent)" />
            </linearGradient>
          </defs>
          <circle cx="40" cy="40" r="34" stroke="var(--hairline)" strokeWidth="5" fill="none" />
          <circle
            cx="40"
            cy="40"
            r="34"
            stroke={`url(#qr${id})`}
            strokeWidth="5"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${pct * circ} ${circ}`}
            transform="rotate(-90 40 40)"
          />
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              fontWeight: 900,
              fontSize: 22,
              color: "var(--ink)",
              letterSpacing: -0.6,
              lineHeight: 1,
            }}
          >
            {visited}
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 8.5,
              color: "var(--ink-mute)",
              letterSpacing: "0.8px",
              marginTop: 2,
            }}
          >
            OF {total}
          </div>
        </div>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>
          {Math.round(pct * 100)}% complete
        </div>
        <div style={{ fontSize: 12, color: "var(--ink-mute)", marginTop: 3 }}>
          {total - visited} parks remaining
        </div>
      </div>
    </div>
  );
}

// ── RailPanel ─────────────────────────────────────────────────────────────────

function RailPanel({
  kicker,
  title,
  action,
  children,
}: {
  kicker: string;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "0.5px solid var(--hairline)",
        borderRadius: 14,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 16px 10px",
          borderBottom: "0.5px solid var(--hairline-soft)",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
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
              marginBottom: 2,
            }}
          >
            {kicker}
          </div>
          <div style={{ fontWeight: 800, fontSize: 16, color: "var(--ink)", letterSpacing: -0.2 }}>
            {title}
          </div>
        </div>
        {action}
      </div>
      <div style={{ padding: "12px 16px 14px" }}>{children}</div>
    </div>
  );
}

// ── Types for right rail ──────────────────────────────────────────────────────

interface SuggestedUser {
  clerk_user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  mutual_friends: number;
  shared_parks: number;
  visit_count: number;
}

interface TrendingPark {
  park_code: string | null;
  park_name: string | null;
  post_count: number;
  period: 'week' | 'all_time' | 'popular';
}

// ── Right rail ────────────────────────────────────────────────────────────────

function FeedRightRail({
  visited,
  total,
  suggestions,
  suggestionsLoading,
  onAddFriend,
  trending,
  trendingLoading,
}: {
  visited: number;
  total: number;
  suggestions: SuggestedUser[];
  suggestionsLoading: boolean;
  onAddFriend: (userId: string) => Promise<void>;
  trending: TrendingPark[];
  trendingLoading: boolean;
}) {
  const [sentSet, setSentSet] = useState<Set<string>>(new Set());
  const [pendingSet, setPendingSet] = useState<Set<string>>(new Set());

  const handleAdd = async (userId: string) => {
    if (sentSet.has(userId) || pendingSet.has(userId)) return;
    setPendingSet(prev => new Set(prev).add(userId));
    try {
      await onAddFriend(userId);
      setSentSet(prev => new Set(prev).add(userId));
    } finally {
      setPendingSet(prev => { const s = new Set(prev); s.delete(userId); return s; });
    }
  };

  return (
    <div
      style={{
        padding: "20px 16px 32px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      {/* Search */}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent("pq:open-spotlight"))}
        style={{
          width: "100%",
          background: "var(--surface)",
          border: "0.5px solid var(--hairline)",
          borderRadius: 10,
          padding: "8px 12px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          cursor: "pointer",
          fontFamily: "inherit",
          textAlign: "left",
        }}
      >
        <Search size={14} strokeWidth={2.2} style={{ color: "var(--ink-mute)", flexShrink: 0 }} />
        <span
          style={{
            flex: 1,
            fontSize: 12.5,
            color: "var(--ink-mute)",
            fontWeight: 500,
          }}
        >
          Search parks, people, posts…
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9.5,
            color: "var(--ink-mute)",
            padding: "2px 5px",
            background: "var(--surface-alt)",
            borderRadius: 4,
            letterSpacing: "0.4px",
            fontWeight: 600,
          }}
        >
          ⌘K
        </span>
      </button>

      {/* Quest ring */}
      <RailPanel
        kicker="YOUR QUEST"
        title={`${visited} of ${total}`}
        action={
          <Link href="/map" style={{ textDecoration: "none" }}>
            <DesktopButton ghost size="sm">Map</DesktopButton>
          </Link>
        }
      >
        <QuestRing visited={visited} total={total} />
      </RailPanel>

      {/* People you may know */}
      <RailPanel
        kicker="SUGGESTED"
        title="People you may know"
        action={
          <Link href="/friends" style={{ textDecoration: "none" }}>
            <DesktopButton ghost size="sm">See all</DesktopButton>
          </Link>
        }
      >
        {suggestionsLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[55, 70, 45, 65].map((nameW, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--surface-alt)", flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
                  <div style={{ height: 12, width: `${nameW}%`, borderRadius: 4, background: "var(--surface-alt)" }} />
                  <div style={{ height: 10, width: `${nameW - 15}%`, borderRadius: 4, background: "var(--surface-alt)" }} />
                </div>
                <div style={{ height: 26, width: 74, borderRadius: 100, border: "1px solid var(--hairline)", flexShrink: 0 }} />
              </div>
            ))}
          </div>
        ) : suggestions.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--ink-mute)", textAlign: "center", padding: "8px 0" }}>
            No suggestions yet — add some friends to discover more explorers.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {suggestions.map((u) => {
              const name = u.display_name ?? u.username ?? "Explorer";
              const handle = u.username ? `@${u.username}` : "";
              const isSent    = sentSet.has(u.clerk_user_id);
              const isPending = pendingSet.has(u.clerk_user_id);
              const subtext = u.mutual_friends > 0
                ? `${u.mutual_friends} mutual friend${u.mutual_friends !== 1 ? "s" : ""}`
                : u.shared_parks > 0
                ? `${u.shared_parks} shared park${u.shared_parks !== 1 ? "s" : ""}`
                : u.visit_count > 0
                ? `${u.visit_count} park${u.visit_count !== 1 ? "s" : ""} visited`
                : "Explorer";
              return (
                <div key={u.clerk_user_id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Link href={`/profile/${u.username}`} style={{ textDecoration: "none", flexShrink: 0 }}>
                    <Avatar url={u.avatar_url} name={name} size={34} />
                  </Link>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Link href={`/profile/${u.username}`} style={{ textDecoration: "none" }}>
                      <div style={{ fontWeight: 700, fontSize: 12.5, color: "var(--ink)" }}>{name}</div>
                    </Link>
                    <div style={{ fontSize: 11, color: "var(--ink-mute)" }}>
                      {handle && `${handle} · `}{subtext}
                    </div>
                  </div>
                  <button
                    onClick={() => handleAdd(u.clerk_user_id)}
                    disabled={isSent || isPending}
                    style={{
                      background: isSent ? "var(--surface-alt)" : "transparent",
                      border: `1px solid ${isSent ? "var(--hairline)" : "var(--primary)"}`,
                      color: isSent ? "var(--ink-mute)" : "var(--primary)",
                      padding: "4px 10px",
                      borderRadius: 100,
                      cursor: isSent || isPending ? "default" : "pointer",
                      fontFamily: "var(--font-sans)",
                      fontWeight: 700,
                      fontSize: 11,
                      opacity: isPending ? 0.6 : 1,
                      transition: "all 140ms ease",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {isSent ? "Sent" : isPending ? "…" : "Add Friend"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </RailPanel>

      {/* Trending */}
      <RailPanel
        kicker="TRENDING"
        title={
          trending.length > 0 && trending[0].period === 'week'
            ? "Most posted this week"
            : trending.length > 0 && trending[0].period === 'popular'
            ? "Most visited parks"
            : "Most posted parks"
        }
      >
        <style>{`.pq-trending-link:hover > div { text-decoration: underline; text-underline-offset: 2px; }`}</style>
        {trendingLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[70, 55, 65, 50, 60].map((w, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0" }}>
                <div style={{ width: 18, height: 12, borderRadius: 3, background: "var(--surface-alt)", flexShrink: 0 }} />
                <div style={{ flex: 1, height: 12, width: `${w}%`, borderRadius: 3, background: "var(--surface-alt)" }} />
                <div style={{ width: 40, height: 12, borderRadius: 3, background: "var(--surface-alt)", flexShrink: 0 }} />
              </div>
            ))}
          </div>
        ) : trending.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--ink-mute)", textAlign: "center", padding: "8px 0" }}>
            No posts yet — be the first to share a park!
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {trending.map((t, i) => (
              <div
                key={t.park_code ?? i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "6px 0",
                }}
              >
                <div
                  style={{
                    width: 18,
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--ink-mute)",
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {i + 1}.
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {t.park_code ? (
                    <Link
                      href={`/parks/${t.park_code}`}
                      className="pq-trending-link"
                      style={{ textDecoration: "none" }}
                    >
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: 12.5,
                          color: "var(--ink)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {t.park_name ?? t.park_code}
                      </div>
                    </Link>
                  ) : (
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: 12.5,
                        color: "var(--ink)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {t.park_name ?? "Unknown park"}
                    </div>
                  )}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--primary)",
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {t.post_count} {t.period === 'popular' ? 'visits' : 'posts'}
                </div>
              </div>
            ))}
          </div>
        )}
      </RailPanel>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FeedPage() {
  const { isLoaded, isSignedIn } = useUser();
  const router = useRouter();

  const [posts, setPosts]   = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [visited, setVisited] = useState(0);
  const [total, setTotal]   = useState(63);
  const [showCreate, setShowCreate] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestedUser[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(true);
  const [trending, setTrending] = useState<TrendingPark[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(true);

  useEffect(() => {
    if (isLoaded && !isSignedIn) router.push("/");
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    if (!isSignedIn) return;

    Promise.all([
      fetch("/api/feed").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/visits").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/parks").then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([feedPosts, visits, parks]) => {
        setPosts(feedPosts);
        const v = (visits as Array<{ is_bucket_list: boolean; visited_date: string | null }>).filter(
          (v) => !v.is_bucket_list && v.visited_date
        ).length;
        setVisited(v);
        if ((parks as unknown[]).length) setTotal((parks as unknown[]).length);
      })
      .catch(console.error)
      .finally(() => setLoading(false));

    fetch("/api/users/suggestions")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setSuggestions(data))
      .catch(console.error)
      .finally(() => setSuggestionsLoading(false));

    fetch("/api/posts/trending")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setTrending(data))
      .catch(console.error)
      .finally(() => setTrendingLoading(false));
  }, [isSignedIn]);

  const handleAddFriend = async (targetId: string) => {
    await fetch("/api/friends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: targetId }),
    });
  };

  const handleLike = async (postId: number, currentlyLiked: boolean) => {
    // Optimistic update
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? {
              ...p,
              liked_by_me: !currentlyLiked,
              like_count: p.like_count + (currentlyLiked ? -1 : 1),
            }
          : p
      )
    );

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
      // Revert on failure
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                liked_by_me: currentlyLiked,
                like_count: p.like_count + (currentlyLiked ? 1 : -1),
              }
            : p
        )
      );
    }
  };

  const refreshFeed = () =>
    fetch("/api/feed").then(r => r.ok ? r.json() : []).then(setPosts).catch(() => {});

  return (
    <>
    <LogVisitModal
      open={showCreate}
      onClose={() => setShowCreate(false)}
      onPosted={() => { setShowCreate(false); refreshFeed(); }}
    />
    <DesktopShell
      rightRail={
        <FeedRightRail
          visited={visited}
          total={total}
          suggestions={suggestions}
          suggestionsLoading={suggestionsLoading}
          onAddFriend={handleAddFriend}
          trending={trending}
          trendingLoading={trendingLoading}
        />
      }
    >
      <DesktopHeader
        kicker="THE FEED"
        title="Out there"
        sub="Latest posts from your friends and the community"
        actions={
          <>
            <DesktopButton size="sm">
              <Filter size={13} strokeWidth={2} /> Filter
            </DesktopButton>
            <DesktopButton size="sm" primary onClick={() => setShowCreate(true)}>
              <Plus size={13} strokeWidth={2.4} /> Log visit
            </DesktopButton>
          </>
        }
      />

      <div
        style={{
          padding: "20px 32px 32px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          maxWidth: 720,
          margin: "0 auto",
        }}
      >
        {loading && (
          <div
            style={{
              textAlign: "center",
              padding: "60px 0",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "1.4px",
              color: "var(--ink-mute)",
            }}
          >
            LOADING FEED…
          </div>
        )}

        {!loading && posts.length === 0 && (
          <div
            style={{
              textAlign: "center",
              padding: "60px 0",
              color: "var(--ink-mute)",
              fontSize: 14,
            }}
          >
            No posts yet — be the first to share a park!
          </div>
        )}

        {posts.map((post) => (
          <PostCard key={post.id} post={post} onLike={handleLike} />
        ))}

        {!loading && posts.length > 0 && (
          <div
            style={{
              textAlign: "center",
              padding: "14px 0 6px",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "1.5px",
              color: "var(--ink-mute)",
            }}
          >
            ◆ END OF FEED · ALL CAUGHT UP ◆
          </div>
        )}
      </div>
    </DesktopShell>
    </>
  );
}
