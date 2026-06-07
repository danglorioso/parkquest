"use client";

import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  MapPin, Bookmark, Award, Mountain,
} from "lucide-react";
import { DesktopShell, AccountMenu } from "@/components/desktop/DesktopShell";
import { DesktopButton } from "@/components/desktop/DesktopButton";
import { FindFriendsDialog } from "@/components/desktop/FindFriendsDialog";
import type { MapPark } from "@/components/USAMapGL";
import EditProfileDialog from "@/components/EditProfileDialog";

const USAMap = dynamic(() => import("@/components/USAMapGL"), {
  ssr: false,
  loading: () => <div className="h-full w-full" style={{ background: "#CECDBC" }} />,
});

// ── Types ─────────────────────────────────────────────────────────────────────

interface BadgeData {
  id: string;
  name: string;
  description: string;
  emoji: string;
  tier: string;
  earned: boolean;
  progress_current: number | null;
  progress_target: number | null;
}

// ── Activity types ────────────────────────────────────────────────────────────

type ActivityEvent =
  | { type: "visit" | "bucket" | "post"; user_id: string; username: string | null; display_name: string | null; avatar_url: string | null; park_name: string | null; created_at: string | null }
  | { type: "badge"; user_id: string; username: string | null; display_name: string | null; avatar_url: string | null; badge_id: string; badge_name: string; badge_emoji: string; created_at: string | null };


const TIER_COLOR: Record<string, string> = {
  bronze:    "#B27339",
  silver:    "#A8A39B",
  gold:      "#D4A93F",
  platinum:  "#6E97A3",
  legendary: "#8B5DBF",
};

// ── Sub-components ────────────────────────────────────────────────────────────

function Panel({
  kicker,
  title,
  action,
  children,
  fullbleed = false,
}: {
  kicker: string;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  fullbleed?: boolean;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "0.5px solid var(--hairline)",
        borderRadius: 14,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "14px 18px 10px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: fullbleed ? "none" : "0.5px solid var(--hairline-soft)",
          flexShrink: 0,
        }}
      >
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
            {kicker}
          </div>
          <div
            style={{
              fontWeight: 800,
              fontSize: 18,
              color: "var(--ink)",
              letterSpacing: -0.2,
              marginTop: 2,
            }}
          >
            {title}
          </div>
        </div>
        {action}
      </div>
      <div
        style={{
          padding: fullbleed ? 0 : "12px 18px 16px",
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function BigStat({
  kicker,
  value,
  total,
  unit,
  color,
  delta,
  icon: Icon,
  loading = false,
}: {
  kicker: string;
  value: number | string;
  total?: string;
  unit?: string;
  color: string;
  delta: React.ReactNode;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; style?: React.CSSProperties }>;
  loading?: boolean;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "0.5px solid var(--hairline)",
        borderRadius: 14,
        padding: 16,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Decorative icon */}
      <div
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          opacity: 0.15,
          color,
        }}
      >
        <Icon size={40} strokeWidth={1.6} style={{ color }} />
      </div>

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
        {kicker}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 5,
          marginTop: 6,
        }}
      >
        {loading ? (
          <Skel width={56} height={38} radius={6} />
        ) : (
          <>
            <div
              style={{
                fontWeight: 900,
                fontSize: 38,
                color: "var(--ink)",
                letterSpacing: -1.2,
                lineHeight: 1,
              }}
            >
              {value}
            </div>
            {total && (
              <div style={{ fontSize: 14, color: "var(--ink-mute)", fontWeight: 600 }}>
                / {total}
              </div>
            )}
            {unit && (
              <div style={{ fontSize: 13, color: "var(--ink-mute)", fontWeight: 600 }}>
                {unit}
              </div>
            )}
          </>
        )}
      </div>
      <div
        style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 6 }}
      >
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: color,
            flexShrink: 0,
          }}
        />
        <div style={{ fontSize: 11.5, color: "var(--ink-mute)", fontWeight: 500 }}>
          {delta}
        </div>
      </div>
    </div>
  );
}

function Skel({ width, height, radius = 6 }: { width?: number | string; height: number; radius?: number }) {
  return (
    <div
      className="animate-pulse"
      style={{ width, height, borderRadius: radius, background: "var(--surface-alt)" }}
    />
  );
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "JUST NOW";
  if (mins < 60) return `${mins}M AGO`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}H AGO`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}D AGO`;
  return `${Math.floor(days / 7)}W AGO`;
}

function ActivityItem({ event }: { event: ActivityEvent }) {
  const name = event.display_name || event.username || "Someone";
  const initials = name.slice(0, 2).toUpperCase();

  let what: string;
  let dest: string | null = null;
  let destColor = "var(--primary)";

  if (event.type === "visit") {
    what = "visited";
    dest = event.park_name;
  } else if (event.type === "bucket") {
    what = "added to bucket list:";
    dest = event.park_name;
    destColor = "var(--bucket)";
  } else if (event.type === "badge") {
    what = `unlocked ${event.badge_emoji}`;
    dest = event.badge_name;
    destColor = "var(--bucket)";
  } else {
    what = event.park_name ? "posted at" : "shared a post";
    dest = event.park_name ?? null;
  }

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "8px 0", borderBottom: "0.5px solid var(--hairline-soft)",
    }}>
      {event.avatar_url ? (
        <img
          src={event.avatar_url}
          alt={name}
          style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
        />
      ) : (
        <div style={{
          width: 28, height: 28, borderRadius: "50%",
          background: "var(--surface-alt)", border: "0.5px solid var(--hairline)",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          fontSize: 9, fontWeight: 700, color: "var(--ink-mute)", fontFamily: "var(--font-mono)",
        }}>
          {initials}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: "var(--ink-soft)", lineHeight: 1.4 }}>
        <strong style={{ color: "var(--ink)", fontWeight: 700 }}>{name}</strong>{" "}
        {what}{" "}
        {dest && <span style={{ color: destColor, fontWeight: 600 }}>{dest}</span>}
      </div>
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--ink-mute)",
        letterSpacing: "0.6px", flexShrink: 0,
      }}>
        {timeAgo(event.created_at)}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user, isLoaded, isSignedIn } = useUser();
  const router = useRouter();

  const [visitedCount,   setVisitedCount]   = useState(0);
  const [bucketCount,    setBucketCount]    = useState(0);
  const [totalCount,     setTotalCount]     = useState(63);
  const [badgesEarned,   setBadgesEarned]   = useState(0);
  const [closestBadges,  setClosestBadges]  = useState<BadgeData[]>([]);
  const [miniMapParks,   setMiniMapParks]   = useState<MapPark[]>([]);
  const [activityItems,  setActivityItems]  = useState<ActivityEvent[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [editOpen,       setEditOpen]       = useState(false);
  const [findFriendsOpen, setFindFriendsOpen] = useState(false);
  const [mapHover,       setMapHover]       = useState(false);

  useEffect(() => {
    if (isLoaded && !isSignedIn) router.push("/");
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    if (!isSignedIn) return;

    fetch("/api/activity")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: ActivityEvent[]) => setActivityItems(data))
      .catch(() => {});

    Promise.all([
      fetch("/api/visits").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/parks").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/badges").then((r) => (r.ok ? r.json() : { badges: [] })),
    ])
      .then(([visits, parks, { badges }]) => {
        type Visit = { park_code: string; is_bucket_list: boolean; visited_date: string | null };
        type ParkRow = { park_code: string; name: string; states: string; latitude: string | null; longitude: string | null };

        const visitedCodes = new Set<string>(
          (visits as Visit[])
            .filter((v) => !v.is_bucket_list && v.visited_date)
            .map((v) => v.park_code)
        );
        const bucketCodes = new Set<string>(
          (visits as Visit[])
            .filter((v) => v.is_bucket_list)
            .map((v) => v.park_code)
        );

        setVisitedCount(visitedCodes.size);
        setBucketCount(bucketCodes.size);
        setTotalCount((parks as ParkRow[]).length || 63);

        // Build mini-map parks
        const mapParks: MapPark[] = (parks as ParkRow[])
          .filter((p) => p.latitude && p.longitude)
          .map((p) => ({
            park_code: p.park_code,
            name: p.name,
            position: [parseFloat(p.latitude!), parseFloat(p.longitude!)] as [number, number],
            status: visitedCodes.has(p.park_code)
              ? "visited"
              : bucketCodes.has(p.park_code)
              ? "bucketList"
              : "notVisited",
          }));
        setMiniMapParks(mapParks);

        // Badges
        const earned = (badges as BadgeData[]).filter((b) => b.earned);
        setBadgesEarned(earned.length);

        const closest = (badges as BadgeData[])
          .filter(
            (b) =>
              !b.earned &&
              b.progress_current !== null &&
              b.progress_target !== null &&
              b.progress_target > 0
          )
          .sort(
            (a, b) =>
              b.progress_current! / b.progress_target! -
              a.progress_current! / a.progress_target!
          )
          .slice(0, 3);
        setClosestBadges(closest);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [isSignedIn]);

  const isReady = isLoaded && !loading;
  const firstName = user?.firstName ?? "Explorer";

  // Formatted date kicker
  const now = new Date();
  const dayName  = now.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase();
  const dateStr  = now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }).toUpperCase();
  const dateKicker = `${dayName} · ${dateStr}`;

  const parksLeft = totalCount - visitedCount;

  return (
    <DesktopShell>
      <EditProfileDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={() => { void user?.reload(); }}
      />
      <div className="px-4 md:px-8 pt-6 pb-8 overflow-y-auto h-full">

        {/* ── Greeting row ──────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 22,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "1.6px",
                color: "var(--ink-mute)",
                textTransform: "uppercase",
                marginBottom: 6,
                fontWeight: 600,
              }}
            >
              {dateKicker}
            </div>
            {isReady ? (
              <>
                <div
                  className="text-2xl md:text-4xl"
                  style={{
                    fontWeight: 800,
                    color: "var(--ink)",
                    letterSpacing: -0.8,
                    lineHeight: 1,
                  }}
                >
                  Welcome back,{" "}
                  <span style={{ color: "var(--primary)" }}>{firstName}</span>.
                </div>
                <div
                  style={{
                    fontSize: 15,
                    color: "var(--ink-mute)",
                    marginTop: 8,
                  }}
                >
                  You&rsquo;ve logged{" "}
                  <strong style={{ color: "var(--ink)", fontWeight: 700 }}>
                    {visitedCount} parks
                  </strong>
                  , you&rsquo;re{" "}
                  <strong style={{ color: "var(--ink)", fontWeight: 700 }}>
                    {parksLeft} away from legendary
                  </strong>
                  , and{" "}
                  <strong style={{ color: "var(--ink)", fontWeight: 700 }}>
                    {badgesEarned} badges
                  </strong>{" "}
                  earned so far.
                </div>
              </>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
                <Skel width={300} height={36} radius={8} />
                <Skel width={440} height={18} radius={5} />
              </div>
            )}
          </div>
          <div className="self-start md:self-auto" style={{ flexShrink: 0 }}>
            <AccountMenu compact onEditAccount={() => setEditOpen(true)} />
          </div>
        </div>

        {/* ── Big stats row ──────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <BigStat
            kicker="VISITED"
            value={visitedCount}
            total={String(totalCount)}
            color="var(--visited)"
            delta="+2 this year"
            icon={MapPin}
            loading={!isReady}
          />
          <BigStat
            kicker="BUCKET LIST"
            value={bucketCount}
            color="var(--bucket)"
            delta={<Link href="/parks" style={{ color: "var(--ink-mute)", textDecoration: "none", fontWeight: 600 }} onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--bucket)"; }} onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--ink-mute)"; }}>Browse parks →</Link>}
            icon={Bookmark}
            loading={!isReady}
          />
          <BigStat
            kicker="BADGES"
            value={badgesEarned}
            color="var(--accent)"
            delta={closestBadges.length > 0 ? `${closestBadges.length} close to unlock` : "keep exploring"}
            icon={Award}
            loading={!isReady}
          />
          <BigStat
            kicker="PARKS LEFT"
            value={parksLeft}
            unit="to go"
            color="var(--primary)"
            delta="until legendary status"
            icon={Mountain}
            loading={!isReady}
          />
        </div>

        {/* ── Panel grid ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-[1.6fr_1fr] gap-4">
          {/* Mini-map */}
          <Panel
            kicker="THE MAP"
            title="Your quest"
            fullbleed
            action={
              <Link href="/map" style={{ textDecoration: "none" }}>
                <DesktopButton size="sm" primary>
                  Open map →
                </DesktopButton>
              </Link>
            }
          >
            <Link href="/map" style={{ display: "flex", flexDirection: "column", flex: 1, textDecoration: "none" }}>
              <div
                style={{
                  position: "relative",
                  flex: 1,
                  minHeight: 320,
                  overflow: "hidden",
                  background: "#CECDBC",
                  cursor: "pointer",
                }}
                onMouseEnter={() => setMapHover(true)}
                onMouseLeave={() => setMapHover(false)}
              >
                {/* Non-interactive map */}
                <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                  {!loading && miniMapParks.length > 0 && (
                    <USAMap
                      parks={miniMapParks}
                      className="h-full w-full"
                      initialBounds={[[-125, 24], [-66, 50]]}
                      showControls={false}
                    />
                  )}
                </div>

                {/* Hover affordance */}
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: mapHover ? "rgba(22,34,26,0.22)" : "rgba(0,0,0,0)",
                    transition: "background 180ms",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    pointerEvents: "none",
                  }}
                >
                  <div
                    style={{
                      background: "rgba(255,251,241,0.95)",
                      backdropFilter: "blur(12px)",
                      WebkitBackdropFilter: "blur(12px)",
                      borderRadius: 100,
                      padding: "8px 20px",
                      fontSize: 12.5,
                      fontWeight: 700,
                      color: "var(--primary)",
                      letterSpacing: 0.2,
                      boxShadow: "0 4px 16px rgba(0,0,0,0.14)",
                      opacity: mapHover ? 1 : 0,
                      transform: mapHover ? "translateY(0)" : "translateY(4px)",
                      transition: "opacity 180ms, transform 180ms",
                    }}
                  >
                    View full map →
                  </div>
                </div>
              </div>
            </Link>
          </Panel>

          {/* Activity feed */}
          <Panel
            kicker="ACTIVITY"
            title="What's new"
            action={
              <div style={{ display: "flex", gap: 6 }}>
                <DesktopButton size="sm" onClick={() => setFindFriendsOpen(true)}>
                  Add Friends
                </DesktopButton>
                <Link href="/feed" style={{ textDecoration: "none" }}>
                  <DesktopButton size="sm">View all</DesktopButton>
                </Link>
              </div>
            }
          >
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              {loading ? (
                <div style={{ padding: "20px 0", textAlign: "center", fontSize: 12.5, color: "var(--ink-mute)" }}>
                  Loading…
                </div>
              ) : activityItems.length === 0 ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, textAlign: "center", padding: "24px 0" }}>
                  <div style={{ fontSize: 13, color: "var(--ink)", fontWeight: 600, marginBottom: 6 }}>
                    Nothing here yet
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--ink-mute)", marginBottom: 14 }}>
                    Add friends to see their visits, badges, and posts.
                  </div>
                  <button
                    onClick={() => setFindFriendsOpen(true)}
                    style={{
                      background: "var(--primary)", color: "#fff",
                      border: "none", borderRadius: 8, cursor: "pointer",
                      fontSize: 12.5, fontWeight: 650, padding: "7px 18px",
                    }}
                  >
                    Find friends
                  </button>
                </div>
              ) : (
                activityItems.map((event, i) => (
                  <ActivityItem key={`${event.type}-${event.user_id}-${i}`} event={event} />
                ))
              )}
            </div>
          </Panel>
          <FindFriendsDialog open={findFriendsOpen} onOpenChange={setFindFriendsOpen} />

          {/* Trips on deck */}
          <Panel
            kicker="UP NEXT"
            title="Trips on deck"
          >
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, padding: "24px 16px", textAlign: "center" }}>
              <div style={{ fontSize: 22 }}>🗺️</div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>Coming soon</div>
              <div style={{ fontSize: 12.5, color: "var(--ink-mute)", maxWidth: 220 }}>
                Trip planning is on the way. You&apos;ll be able to schedule and manage your upcoming park adventures here.
              </div>
            </div>
          </Panel>

          {/* Closest badge unlocks */}
          <Panel
            kicker="ALMOST THERE"
            title="Closest unlocks"
            action={
              <Link href="/badges" style={{ textDecoration: "none" }}>
                <DesktopButton size="sm">All badges</DesktopButton>
              </Link>
            }
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {closestBadges.length === 0 && !loading && (
                <p style={{ fontSize: 12.5, color: "var(--ink-mute)" }}>
                  No badges in progress yet — keep exploring!
                </p>
              )}
              {closestBadges.map((badge) => {
                const pct =
                  badge.progress_target && badge.progress_target > 0
                    ? Math.min(
                        100,
                        Math.round(
                          (badge.progress_current! / badge.progress_target!) * 100
                        )
                      )
                    : 0;
                const tierColor = TIER_COLOR[badge.tier] ?? "var(--ink-mute)";
                return (
                  <div
                    key={badge.id}
                    style={{ display: "flex", alignItems: "center", gap: 12 }}
                  >
                    {/* Badge icon */}
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: "50%",
                        background: `${tierColor}22`,
                        border: `1.5px solid ${tierColor}55`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 20,
                        flexShrink: 0,
                      }}
                    >
                      {badge.emoji}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "baseline",
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)" }}>
                          {badge.name}
                        </div>
                        <div
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 10,
                            color: "var(--ink-mute)",
                            fontWeight: 600,
                            letterSpacing: "0.4px",
                          }}
                        >
                          {badge.progress_current} / {badge.progress_target}
                        </div>
                      </div>
                      <div
                        style={{
                          height: 4,
                          background: "var(--surface-alt)",
                          borderRadius: 2,
                          marginTop: 5,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${pct}%`,
                            background: tierColor,
                            borderRadius: 2,
                            transition: "width 0.5s ease",
                          }}
                        />
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--ink-mute)",
                          marginTop: 3,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {badge.description}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>
      </div>
    </DesktopShell>
  );
}
