"use client";

import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import {
  Heart, MessageCircle, Share2, Bookmark,
  MoreHorizontal, MapPin, ChevronLeft, ChevronRight,
  Filter, Plus, Search,
} from "lucide-react";
import Link from "next/link";
import { DesktopShell } from "@/components/desktop/DesktopShell";
import { DesktopHeader } from "@/components/desktop/DesktopHeader";
import { DesktopButton } from "@/components/desktop/DesktopButton";
import { CreatePostModal } from "@/components/CreatePostModal";

// ── Types ─────────────────────────────────────────────────────────────────────

interface FeedPost {
  id: number;
  caption: string | null;
  photos: string[] | null;
  park_code: string | null;
  created_at: string;
  clerk_user_id: string;
  park_name: string | null;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
}

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

// ── PostCard ──────────────────────────────────────────────────────────────────

function PostCard({
  post,
  onLike,
}: {
  post: FeedPost;
  onLike: (id: number, liked: boolean) => void;
}) {
  const photos = post.photos && post.photos.length > 0 ? post.photos : [""]; // one empty = gradient placeholder
  const name = post.display_name ?? post.username ?? "Explorer";

  return (
    <div
      style={{
        background: "var(--surface)",
        borderRadius: 16,
        border: "0.5px solid var(--hairline)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "14px 18px",
        }}
      >
        <Avatar url={post.avatar_url} name={name} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>{name}</div>
            {post.username && (
              <div style={{ fontSize: 12.5, color: "var(--ink-mute)" }}>
                @{post.username} · {relTime(post.created_at)}
              </div>
            )}
          </div>
          {post.park_name && (
            <Link
              href={`/parks/${post.park_code}`}
              style={{ textDecoration: "none" }}
            >
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  marginTop: 2,
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

      {/* Photo carousel */}
      <PhotoCarousel photos={photos} parkCode={post.park_code} />

      {/* Action row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 18,
          padding: "14px 18px 6px",
        }}
      >
        <ActionButton
          active={post.liked_by_me}
          onClick={() => onLike(post.id, post.liked_by_me)}
          color={post.liked_by_me ? "#D45040" : undefined}
        >
          <Heart
            size={22}
            strokeWidth={2.0}
            fill={post.liked_by_me ? "#D45040" : "none"}
            style={{ color: post.liked_by_me ? "#D45040" : "var(--ink)" }}
          />
          <span>{post.like_count.toLocaleString()}</span>
        </ActionButton>

        <ActionButton>
          <MessageCircle size={22} strokeWidth={2.0} style={{ color: "var(--ink)" }} />
          <span>{post.comment_count}</span>
        </ActionButton>

        <ActionButton>
          <Share2 size={22} strokeWidth={2.0} style={{ color: "var(--ink)" }} />
          <span>Share</span>
        </ActionButton>

        <div style={{ flex: 1 }} />

        <button
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "var(--ink)",
            display: "flex",
            alignItems: "center",
          }}
        >
          <Bookmark size={20} strokeWidth={1.8} />
        </button>
      </div>

      {/* Comments link */}
      {post.comment_count > 0 && (
        <div style={{ padding: "8px 18px 16px" }}>
          <button
            style={{
              background: "transparent",
              border: "none",
              padding: 0,
              fontSize: 12.5,
              color: "var(--ink-mute)",
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
            }}
          >
            View all {post.comment_count} comment{post.comment_count !== 1 ? "s" : ""}
          </button>
        </div>
      )}
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  active,
  color,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "transparent",
        border: "none",
        cursor: "pointer",
        padding: 0,
        display: "flex",
        alignItems: "center",
        gap: 6,
        color: color ?? "var(--ink)",
        fontSize: 14,
        fontWeight: 600,
        transform: active ? "scale(1.06)" : "scale(1)",
        transition: "transform 120ms ease",
        fontFamily: "var(--font-sans)",
      }}
    >
      {children}
    </button>
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

// ── Mock data for rail ────────────────────────────────────────────────────────

const MOCK_NEARBY = [
  { name: "Maya Jensen",  handle: "@maya",   parks: 31, avatar: null },
  { name: "Jordan Park",  handle: "@jpark",  parks: 18, avatar: null },
  { name: "Rin Suzuki",   handle: "@rinsuz", parks: 24, avatar: null },
  { name: "Sam Morales",  handle: "@samm",   parks: 12, avatar: null },
];

const MOCK_TRENDING = [
  { name: "Yosemite NP",        count: 48 },
  { name: "Glacier NP",         count: 34 },
  { name: "Zion NP",            count: 29 },
  { name: "Arches NP",          count: 22 },
];

// ── Right rail ────────────────────────────────────────────────────────────────

function FeedRightRail({ visited, total }: { visited: number; total: number }) {
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
      <div
        style={{
          background: "var(--surface)",
          border: "0.5px solid var(--hairline)",
          borderRadius: 10,
          padding: "8px 12px",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Search size={14} strokeWidth={2.2} style={{ color: "var(--ink-mute)", flexShrink: 0 }} />
        <input
          placeholder="Search parks, people, posts…"
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            background: "transparent",
            fontFamily: "var(--font-sans)",
            fontSize: 12.5,
            color: "var(--ink)",
          }}
        />
        <div
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
        </div>
      </div>

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

      {/* Explorers nearby */}
      <RailPanel
        kicker="EXPLORERS · NEAR YOU"
        title="People you may know"
        action={<DesktopButton ghost size="sm">See all</DesktopButton>}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {MOCK_NEARBY.map((u) => (
            <div key={u.handle} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Avatar url={u.avatar} name={u.name} size={34} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 12.5, color: "var(--ink)" }}>{u.name}</div>
                <div style={{ fontSize: 11, color: "var(--ink-mute)" }}>
                  {u.handle} · {u.parks} parks
                </div>
              </div>
              <button
                style={{
                  background: "transparent",
                  border: "1px solid var(--primary)",
                  color: "var(--primary)",
                  padding: "4px 10px",
                  borderRadius: 100,
                  cursor: "pointer",
                  fontFamily: "var(--font-sans)",
                  fontWeight: 700,
                  fontSize: 11,
                }}
              >
                Add Friend
              </button>
            </div>
          ))}
        </div>
      </RailPanel>

      {/* Trending */}
      <RailPanel kicker="TRENDING" title="Most posted this week">
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {MOCK_TRENDING.map((t, i) => (
            <div
              key={t.name}
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
              <div style={{ flex: 1, fontWeight: 600, fontSize: 12.5, color: "var(--ink)" }}>
                {t.name}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  color: "var(--primary)",
                  fontWeight: 700,
                }}
              >
                {t.count} posts
              </div>
            </div>
          ))}
        </div>
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
  }, [isSignedIn]);

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

  return (
    <>
    {showCreate && (
      <CreatePostModal
        onClose={() => setShowCreate(false)}
        onPost={() => {
          setShowCreate(false);
          // Refresh feed after posting
          fetch("/api/feed").then(r => r.ok ? r.json() : []).then(setPosts).catch(() => {});
        }}
      />
    )}
    <DesktopShell
      rightRail={<FeedRightRail visited={visited} total={total} />}
    >
      <DesktopHeader
        kicker="THE FEED"
        title="Out there"
        sub="Latest posts from your friends"
        actions={
          <>
            <DesktopButton size="sm">
              <Filter size={13} strokeWidth={2} /> Filter
            </DesktopButton>
            <DesktopButton size="sm" primary onClick={() => setShowCreate(true)}>
              <Plus size={13} strokeWidth={2.4} /> New post
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
            Nothing in your feed yet — add some friends or log your first visit.
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
            ◆ END OF FEED · ALL CAUGHT UP
          </div>
        )}
      </div>
    </DesktopShell>
    </>
  );
}
