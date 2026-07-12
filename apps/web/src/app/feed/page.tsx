"use client";

import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { DesktopShell } from "@/components/desktop/DesktopShell";
import { DesktopHeader } from "@/components/desktop/DesktopHeader";
import { DesktopButton } from "@/components/desktop/DesktopButton";
import { LogVisitModal, type VisitDraft } from "@/components/LogVisitModal";
import { PostCard, Avatar, type FeedPost } from "@/components/PostCard";

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
            cx="40" cy="40" r="34"
            stroke={`url(#qr${id})`} strokeWidth="5" fill="none"
            strokeLinecap="round"
            strokeDasharray={`${pct * circ} ${circ}`}
            transform="rotate(-90 40 40)"
          />
        </svg>
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{ fontWeight: 900, fontSize: 22, color: "var(--ink)", letterSpacing: -0.6, lineHeight: 1 }}>
            {visited}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8.5, color: "var(--ink-mute)", letterSpacing: "0.8px", marginTop: 2 }}>
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

function RailPanel({ kicker, title, action, children }: {
  kicker: string; title: string; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div style={{ background: "var(--surface)", border: "0.5px solid var(--hairline)", borderRadius: 14, overflow: "hidden" }}>
      <div style={{
        padding: "12px 16px 10px", borderBottom: "0.5px solid var(--hairline-soft)",
        display: "flex", alignItems: "flex-end", justifyContent: "space-between",
      }}>
        <div>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "1.4px",
            color: "var(--ink-mute)", textTransform: "uppercase", fontWeight: 600, marginBottom: 2,
          }}>
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

// ── Right rail ────────────────────────────────────────────────────────────────

function FeedRightRail({
  visited, total, suggestions, suggestionsLoading, onAddFriend, trending, trendingLoading,
}: {
  visited: number; total: number;
  suggestions: SuggestedUser[]; suggestionsLoading: boolean;
  onAddFriend: (userId: string) => Promise<void>;
  trending: TrendingPark[]; trendingLoading: boolean;
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
    <div style={{ padding: "20px 16px 32px", display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Search */}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent("pq:open-spotlight"))}
        style={{
          width: "100%", background: "var(--surface)", border: "0.5px solid var(--hairline)",
          borderRadius: 10, padding: "8px 12px", display: "flex", alignItems: "center",
          gap: 8, cursor: "pointer", fontFamily: "inherit", textAlign: "left",
        }}
      >
        <Search size={14} strokeWidth={2.2} style={{ color: "var(--ink-mute)", flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 12.5, color: "var(--ink-mute)", fontWeight: 500 }}>
          Search parks, people, posts…
        </span>
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--ink-mute)",
          padding: "2px 5px", background: "var(--surface-alt)", borderRadius: 4,
          letterSpacing: "0.4px", fontWeight: 600,
        }}>
          ⌘K
        </span>
      </button>

      {/* Quest ring */}
      <RailPanel kicker="YOUR QUEST" title={`${visited} of ${total}`} action={
        <Link href="/map" style={{ textDecoration: "none" }}>
          <DesktopButton ghost size="sm">Map</DesktopButton>
        </Link>
      }>
        <QuestRing visited={visited} total={total} />
      </RailPanel>

      {/* People you may know */}
      <RailPanel kicker="SUGGESTED" title="People you may know" action={
        <Link href="/friends" style={{ textDecoration: "none" }}>
          <DesktopButton ghost size="sm">See all</DesktopButton>
        </Link>
      }>
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
                  <Link href={`/profile/${u.username}?from=/feed`} style={{ textDecoration: "none", flexShrink: 0 }}>
                    <Avatar url={u.avatar_url} name={name} size={34} />
                  </Link>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Link href={`/profile/${u.username}?from=/feed`} style={{ textDecoration: "none" }}>
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
                      padding: "4px 10px", borderRadius: 100,
                      cursor: isSent || isPending ? "default" : "pointer",
                      fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 11,
                      opacity: isPending ? 0.6 : 1, transition: "all 140ms ease", whiteSpace: "nowrap",
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
      <RailPanel kicker="TRENDING" title={
        trending.length > 0 && trending[0].period === 'week' ? "Most posted this week"
        : trending.length > 0 && trending[0].period === 'popular' ? "Most visited parks"
        : "Most posted parks"
      }>
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
              <div key={t.park_code ?? i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
                <div style={{
                  width: 18, fontFamily: "var(--font-mono)", fontSize: 11,
                  color: "var(--ink-mute)", fontWeight: 700, flexShrink: 0,
                }}>
                  {i + 1}.
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {t.park_code ? (
                    <Link href={`/parks/${t.park_code}`} className="pq-trending-link" style={{ textDecoration: "none" }}>
                      <div style={{
                        fontWeight: 600, fontSize: 12.5, color: "var(--ink)",
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {t.park_name ?? t.park_code}
                      </div>
                    </Link>
                  ) : (
                    <div style={{
                      fontWeight: 600, fontSize: 12.5, color: "var(--ink)",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                      {t.park_name ?? "Unknown park"}
                    </div>
                  )}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--primary)", fontWeight: 700, flexShrink: 0 }}>
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
  const [editDraft, setEditDraft] = useState<Partial<VisitDraft> | undefined>();
  const [filterType, setFilterType] = useState<"all" | "visits" | "badges">("all");
  const [suggestions, setSuggestions] = useState<SuggestedUser[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(true);
  const [trending, setTrending] = useState<TrendingPark[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(true);

  useEffect(() => {
    if (isLoaded && !isSignedIn) router.push("/sign-in?redirect=/feed");
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
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, liked_by_me: !currentlyLiked, like_count: p.like_count + (currentlyLiked ? -1 : 1) }
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
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, liked_by_me: currentlyLiked, like_count: p.like_count + (currentlyLiked ? 1 : -1) }
            : p
        )
      );
    }
  };

  const refreshFeed = () =>
    fetch("/api/feed").then(r => r.ok ? r.json() : []).then(setPosts).catch(() => {});

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

  return (
    <>
      <LogVisitModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onPosted={() => { setShowCreate(false); refreshFeed(); }}
      />
      <LogVisitModal
        open={!!editDraft}
        editMode
        initialDraft={editDraft}
        onClose={() => setEditDraft(undefined)}
        onPosted={() => { setEditDraft(undefined); refreshFeed(); }}
      />
      <DesktopShell
        rightRail={
          <FeedRightRail
            visited={visited} total={total}
            suggestions={suggestions} suggestionsLoading={suggestionsLoading}
            onAddFriend={handleAddFriend}
            trending={trending} trendingLoading={trendingLoading}
          />
        }
      >
        <DesktopHeader
          kicker="THE FEED"
          title="Out there"
          sub="Latest posts from your friends and the community"
          actions={
            <DesktopButton size="sm" primary onClick={() => setShowCreate(true)}>
              <Plus size={13} strokeWidth={2.4} /> Log visit
            </DesktopButton>
          }
        />

        <div style={{
          padding: "20px 32px 32px", display: "flex", flexDirection: "column",
          gap: 16, maxWidth: 720, margin: "0 auto",
        }}>
          {/* Filter chips */}
          {!loading && posts.length > 0 && (
            <div style={{ display: "flex", gap: 6 }}>
              {(["all", "visits", "badges"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setFilterType(t)}
                  style={{
                    padding: "6px 14px", borderRadius: 100, fontSize: 12, fontWeight: 600,
                    cursor: "pointer", border: "0.5px solid",
                    borderColor: filterType === t ? "var(--primary)" : "var(--hairline)",
                    background: filterType === t ? "var(--primary)" : "var(--surface-alt)",
                    color: filterType === t ? "#FFFBF1" : "var(--ink-soft)",
                    transition: "all 120ms ease",
                  }}
                >
                  {t === "all" ? "All" : t === "visits" ? "Visits" : "Badges"}
                </button>
              ))}
            </div>
          )}

          {loading && (
            <div style={{
              textAlign: "center", padding: "60px 0",
              fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "1.4px", color: "var(--ink-mute)",
            }}>
              LOADING FEED…
            </div>
          )}

          {(() => {
            const filtered = posts.filter(p =>
              filterType === "visits" ? !!p.visit_id :
              filterType === "badges" ? !!p.badge_id :
              true
            );
            return (
              <>
                {!loading && filtered.length === 0 && (
                  <div style={{ textAlign: "center", padding: "60px 0", color: "var(--ink-mute)", fontSize: 14 }}>
                    {posts.length === 0 ? "No posts yet — be the first to share a park!" : `No ${filterType} posts yet.`}
                  </div>
                )}
                {filtered.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    onLike={handleLike}
                    from="/feed"
                    onDelete={id => setPosts(prev => prev.filter(p => p.id !== id))}
                    onEditVisit={handleEditVisit}
                    onUserBlocked={userId => setPosts(prev => prev.filter(p => p.clerk_user_id !== userId))}
                  />
                ))}
                {!loading && filtered.length > 0 && (
                  <div style={{
                    textAlign: "center", padding: "14px 0 6px",
                    fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "1.5px", color: "var(--ink-mute)",
                  }}>
                    ◆ END OF FEED · ALL CAUGHT UP ◆
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </DesktopShell>
    </>
  );
}
