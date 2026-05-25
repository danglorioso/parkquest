"use client";

import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  MapPin, Bookmark, Award, Mountain,
  Plus, Compass, ChevronRight,
} from "lucide-react";
import { DesktopShell } from "@/components/desktop/DesktopShell";
import { DesktopButton } from "@/components/desktop/DesktopButton";
import Map from "@/components/Map";
import type { Park as MapPark } from "@/components/LeafletMap";

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

// ── Mock data ─────────────────────────────────────────────────────────────────

const MOCK_ACTIVITY = [
  { initials: "MJ", name: "Maya",   what: "visited",                 where: "Olympic NP",       badge: false, when: "2h" },
  { initials: "JD", name: "Jordan", what: "unlocked",                where: "Camp Wanderer",     badge: true,  when: "5h" },
  { initials: "RS", name: "Rin",    what: "added to bucket list:",   where: "Glacier Bay",       badge: false, when: "1d" },
  { initials: "SM", name: "Sam",    what: "logged visit #15 at",     where: "Arches",            badge: false, when: "2d" },
  { initials: "NG", name: "Nora",   what: "started following you",   where: "",                  badge: false, when: "3d" },
  { initials: "MJ", name: "Maya",   what: "commented on your post about", where: "Acadia",       badge: false, when: "4d" },
];

const MOCK_TRIPS = [
  { month: "JUN", day: "8",  name: "Crater Lake",  state: "OR", away: "17 days away",  company: "3 companions" },
  { month: "AUG", day: "14", name: "Denali",        state: "AK", away: "84 days",       company: "Solo" },
  { month: "OCT", day: "3",  name: "Mesa Verde",    state: "CO", away: "Autumn trip",   company: "2 companions" },
];

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
          alignItems: "flex-end",
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
}: {
  kicker: string;
  value: number | string;
  total?: string;
  unit?: string;
  color: string;
  delta: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; style?: React.CSSProperties }>;
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

function ActivityItem({
  initials, name, what, where: dest, badge, when,
}: (typeof MOCK_ACTIVITY)[number]) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 0",
        borderBottom: "0.5px solid var(--hairline-soft)",
      }}
    >
      {/* Avatar placeholder */}
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: "var(--surface-alt)",
          border: "0.5px solid var(--hairline)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          fontSize: 9,
          fontWeight: 700,
          color: "var(--ink-mute)",
          fontFamily: "var(--font-mono)",
        }}
      >
        {initials}
      </div>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 12.5,
          color: "var(--ink-soft)",
          lineHeight: 1.4,
        }}
      >
        <strong style={{ color: "var(--ink)", fontWeight: 700 }}>{name}</strong>{" "}
        {what}{" "}
        {dest && (
          <span
            style={{
              color: badge ? "var(--bucket)" : "var(--primary)",
              fontWeight: 600,
            }}
          >
            {dest}
          </span>
        )}
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9.5,
          color: "var(--ink-mute)",
          letterSpacing: "0.6px",
          flexShrink: 0,
        }}
      >
        {when.toUpperCase()}
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
  const [loading,        setLoading]        = useState(true);

  useEffect(() => {
    if (isLoaded && !isSignedIn) router.push("/");
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    if (!isSignedIn) return;

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
            states: p.states,
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

  const firstName = user?.firstName ?? "Explorer";

  // Formatted date kicker
  const now = new Date();
  const dayName  = now.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase();
  const dateStr  = now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }).toUpperCase();
  const dateKicker = `${dayName} · ${dateStr}`;

  const parksLeft = totalCount - visitedCount;

  return (
    <DesktopShell>
      <div style={{ padding: "24px 32px 32px", overflowY: "auto", height: "100%" }}>

        {/* ── Greeting row ──────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            marginBottom: 22,
          }}
        >
          <div>
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
            <div
              style={{
                fontWeight: 800,
                fontSize: 36,
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
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <DesktopButton>
              <Plus size={14} strokeWidth={2.4} /> Log a visit
            </DesktopButton>
            <DesktopButton primary>
              <Compass size={14} strokeWidth={2} />
              <Link
                href="/planner"
                style={{ color: "inherit", textDecoration: "none" }}
              >
                Plan a trip
              </Link>
            </DesktopButton>
          </div>
        </div>

        {/* ── Big stats row ──────────────────────────────────────── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 12,
            marginBottom: 24,
          }}
        >
          <BigStat
            kicker="VISITED"
            value={visitedCount}
            total={String(totalCount)}
            color="var(--visited)"
            delta="+2 this year"
            icon={MapPin}
          />
          <BigStat
            kicker="BUCKET LIST"
            value={bucketCount}
            color="var(--bucket)"
            delta="add more parks"
            icon={Bookmark}
          />
          <BigStat
            kicker="BADGES"
            value={badgesEarned}
            color="var(--accent)"
            delta={closestBadges.length > 0 ? `${closestBadges.length} close to unlock` : "keep exploring"}
            icon={Award}
          />
          <BigStat
            kicker="PARKS LEFT"
            value={parksLeft}
            unit="to go"
            color="var(--primary)"
            delta="until legendary status"
            icon={Mountain}
          />
        </div>

        {/* ── Panel grid ─────────────────────────────────────────── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.6fr 1fr",
            gap: 16,
          }}
        >
          {/* Mini-map */}
          <Panel
            kicker="THE MAP"
            title="Your quest"
            fullbleed
            action={
              <Link href="/map" style={{ textDecoration: "none" }}>
                <DesktopButton ghost size="sm">
                  Open map →
                </DesktopButton>
              </Link>
            }
          >
            <div
              style={{
                position: "relative",
                height: 260,
                borderRadius: "0 0 14px 14px",
                overflow: "hidden",
                background: "#E8E2D0",
              }}
            >
              {!loading && miniMapParks.length > 0 && (
                <Map
                  center={[39.8283, -98.5795]}
                  zoom={3}
                  className="h-full w-full"
                  parks={miniMapParks}
                />
              )}
              {/* Mini legend overlay */}
              <div
                style={{
                  position: "absolute",
                  bottom: 10,
                  left: 10,
                  background: "rgba(255,251,241,0.92)",
                  border: "0.5px solid var(--hairline)",
                  borderRadius: 8,
                  padding: "6px 10px",
                  display: "flex",
                  gap: 10,
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  letterSpacing: "0.8px",
                  color: "var(--ink-soft)",
                }}
              >
                {[
                  { color: "var(--visited)",   label: "Visited" },
                  { color: "var(--bucket)",    label: "Bucket" },
                  { color: "var(--unvisited)", label: "Not yet" },
                ].map(({ color, label }) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
                    {label}
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          {/* Activity feed */}
          <Panel
            kicker="ACTIVITY"
            title="What's new"
            action={
              <Link href="/feed" style={{ textDecoration: "none" }}>
                <DesktopButton ghost size="sm">View all</DesktopButton>
              </Link>
            }
          >
            <div style={{ display: "flex", flexDirection: "column" }}>
              {MOCK_ACTIVITY.map((item, i) => (
                <ActivityItem key={i} {...item} />
              ))}
            </div>
          </Panel>

          {/* Trips on deck */}
          <Panel
            kicker="UP NEXT"
            title="Trips on deck"
            action={
              <Link href="/planner" style={{ textDecoration: "none" }}>
                <DesktopButton ghost size="sm">
                  <Plus size={13} strokeWidth={2.2} /> New trip
                </DesktopButton>
              </Link>
            }
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {MOCK_TRIPS.map((trip, i) => (
                <div
                  key={i}
                  style={{
                    background: "var(--surface-alt)",
                    border: "0.5px solid var(--hairline-soft)",
                    borderRadius: 10,
                    padding: "10px 12px",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    cursor: "pointer",
                  }}
                >
                  {/* Date block */}
                  <div
                    style={{
                      width: 44,
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
                    <div
                      style={{
                        fontSize: 9,
                        letterSpacing: "1.2px",
                        opacity: 0.85,
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {trip.month}
                    </div>
                    <div style={{ fontSize: 15 }}>{trip.day}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>
                      {trip.name}
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 10,
                          color: "var(--ink-mute)",
                          letterSpacing: "0.6px",
                          marginLeft: 6,
                          fontWeight: 600,
                        }}
                      >
                        · {trip.state}
                      </span>
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--ink-mute)", marginTop: 1 }}>
                      {trip.away} · {trip.company}
                    </div>
                  </div>
                  <ChevronRight
                    size={14}
                    strokeWidth={2}
                    style={{ color: "var(--ink-mute)", flexShrink: 0 }}
                  />
                </div>
              ))}
            </div>
          </Panel>

          {/* Closest badge unlocks */}
          <Panel
            kicker="ALMOST THERE"
            title="Closest unlocks"
            action={
              <Link href="/badges" style={{ textDecoration: "none" }}>
                <DesktopButton ghost size="sm">All badges</DesktopButton>
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
