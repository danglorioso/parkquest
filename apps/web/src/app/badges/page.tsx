"use client";

import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { Filter, Sparkles, Share2 } from "lucide-react";
import { DesktopShell } from "@/components/desktop/DesktopShell";
import { DesktopHeader } from "@/components/desktop/DesktopHeader";
import { DesktopButton } from "@/components/desktop/DesktopButton";
import { BadgeCelebration } from "@/components/BadgeCelebration";

// ── Types ─────────────────────────────────────────────────────────────────────

interface BadgeData {
  id: string;
  name: string;
  description: string;
  emoji: string;
  tier: string;
  earned: boolean;
  earned_at: string | null;
  progress_current: number | null;
  progress_target: number | null;
}

// ── Tier config ───────────────────────────────────────────────────────────────

const TIERS: Record<string, { name: string; fill: string; light: string; glow: string }> = {
  bronze:    { name: "Bronze",    fill: "#B27339", light: "#D4A070", glow: "rgba(178,115,57,0.28)" },
  silver:    { name: "Silver",    fill: "#A8A39B", light: "#C5C0B8", glow: "rgba(168,163,155,0.30)" },
  gold:      { name: "Gold",      fill: "#D4A93F", light: "#EBC96A", glow: "rgba(212,169,63,0.32)" },
  platinum:  { name: "Platinum",  fill: "#6E97A3", light: "#95B8C2", glow: "rgba(110,151,163,0.32)" },
  legendary: { name: "Legendary", fill: "#8B5DBF", light: "#B08ADE", glow: "rgba(139,93,191,0.36)" },
};

const TIER_ORDER = ["bronze", "silver", "gold", "platinum", "legendary"];

// ── BadgePatch ────────────────────────────────────────────────────────────────

function BadgePatch({
  emoji,
  tier,
  size = 72,
  earned = true,
}: {
  emoji: string;
  tier: string;
  size?: number;
  earned?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const t = TIERS[tier] ?? TIERS.bronze;

  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        flexShrink: 0,
        filter: earned ? "none" : "grayscale(1)",
        opacity: earned ? 1 : 0.5,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        style={{ position: "absolute", inset: 0 }}
      >
        <defs>
          <radialGradient id={`g${id}`} cx="38%" cy="32%" r="75%">
            <stop offset="0%" stopColor={t.light} />
            <stop offset="100%" stopColor={t.fill} />
          </radialGradient>
        </defs>
        <circle cx="50" cy="50" r="49" fill={`url(#g${id})`} />
        <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,251,241,0.55)" strokeWidth="1.5" />
        <circle cx="50" cy="50" r="40.5" fill="none" stroke="rgba(255,251,241,0.32)" strokeWidth="1" strokeDasharray="4 3" />
        <text x="50" y="17" textAnchor="middle" fontSize="6" fill="rgba(255,251,241,0.65)" fontFamily="serif">★ ★ ★</text>
        <text x="50" y="91" textAnchor="middle" fontSize="6" fill="rgba(255,251,241,0.65)" fontFamily="serif">★ ★ ★</text>
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: size * 0.38,
        }}
      >
        {emoji}
      </div>
    </div>
  );
}

// ── BadgeCell ─────────────────────────────────────────────────────────────────

function BadgeCell({ badge }: { badge: BadgeData }) {
  const t = TIERS[badge.tier] ?? TIERS.bronze;
  const pct =
    badge.progress_target && badge.progress_target > 0
      ? Math.min(100, Math.round((badge.progress_current! / badge.progress_target!) * 100))
      : 0;

  const earnedDateStr = badge.earned_at
    ? new Date(badge.earned_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).toUpperCase()
    : null;

  return (
    <div
      style={{
        background: "var(--surface)",
        borderRadius: 14,
        padding: "16px 12px 12px",
        border: "0.5px solid var(--hairline)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        position: "relative",
        overflow: "hidden",
        cursor: "pointer",
        transition: "box-shadow 0.15s ease",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = "var(--shadow-card)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
      }}
    >
      {badge.earned && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `radial-gradient(140% 100% at 50% -20%, ${t.glow} 0%, transparent 60%)`,
            pointerEvents: "none",
          }}
        />
      )}

      <BadgePatch emoji={badge.emoji} tier={badge.tier} size={72} earned={badge.earned} />

      <div
        style={{
          fontWeight: 700,
          fontSize: 12.5,
          color: badge.earned ? "var(--ink)" : "var(--ink-mute)",
          textAlign: "center",
          lineHeight: 1.2,
          position: "relative",
        }}
      >
        {badge.name}
      </div>

      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          letterSpacing: "1px",
          color: "var(--ink-mute)",
          fontWeight: 600,
          position: "relative",
          textTransform: "uppercase",
        }}
      >
        {t.name}
      </div>

      {badge.earned && earnedDateStr ? (
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9.5,
            color: "var(--ink-mute)",
            letterSpacing: "0.6px",
            fontWeight: 600,
            position: "relative",
          }}
        >
          {earnedDateStr}
        </div>
      ) : badge.progress_current !== null && badge.progress_target !== null ? (
        <div style={{ width: "100%", padding: "0 6px", position: "relative" }}>
          <div
            style={{
              height: 3.5,
              background: "var(--surface-alt)",
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${pct}%`,
                background: t.fill,
                borderRadius: 2,
              }}
            />
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9.5,
              color: "var(--ink-mute)",
              textAlign: "center",
              marginTop: 4,
              letterSpacing: "0.4px",
              fontWeight: 600,
            }}
          >
            {badge.progress_current} / {badge.progress_target}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── SectionLabel ──────────────────────────────────────────────────────────────

function SectionLabel({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9.5,
          letterSpacing: "1.6px",
          color: "var(--ink-mute)",
          fontWeight: 600,
          textTransform: "uppercase",
          marginBottom: 3,
        }}
      >
        {kicker}
      </div>
      <div style={{ fontWeight: 800, fontSize: 20, color: "var(--ink)", letterSpacing: -0.3 }}>
        {title}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type TierFilter = "all" | "bronze" | "silver" | "gold" | "platinum" | "legendary";

export default function BadgesPage() {
  const { isLoaded, isSignedIn } = useUser();
  const router = useRouter();

  const [badges, setBadges]       = useState<BadgeData[]>([]);
  const [loading, setLoading]     = useState(true);
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");

  useEffect(() => {
    if (isLoaded && !isSignedIn) router.push("/");
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    if (!isSignedIn) return;
    fetch("/api/badges")
      .then((r) => (r.ok ? r.json() : { badges: [] }))
      .then(({ badges: data }: { badges: BadgeData[] }) => {
        const sorted = [...data].sort((a, b) => {
          const aDate = a.earned_at ? new Date(a.earned_at).getTime() : 0;
          const bDate = b.earned_at ? new Date(b.earned_at).getTime() : 0;
          return bDate - aDate;
        });
        setBadges(sorted);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [isSignedIn]);

  const earned = badges.filter((b) => b.earned);
  const locked = badges.filter((b) => !b.earned);

  const visible = tierFilter === "all" ? badges : badges.filter((b) => b.tier === tierFilter);
  const visibleEarned = visible.filter((b) => b.earned);
  const visibleLocked = visible.filter((b) => !b.earned);

  const latestUnlock = earned[0] ?? null;
  const earnedPct = badges.length > 0 ? Math.round((earned.length / badges.length) * 100) : 0;

  return (
    <DesktopShell>
      <div style={{ height: "100%", overflowY: "auto" }}>
        <DesktopHeader
          kicker={`${earned.length} OF ${badges.length} EARNED · ${earnedPct}%`}
          title="Badge collection"
          sub="Five tiers, every milestone marked. Earn them by exploring."
          actions={
            <>
              <DesktopButton size="sm">
                <Filter size={13} strokeWidth={2} /> Filter
              </DesktopButton>
              <DesktopButton size="sm" primary>
                <Sparkles size={13} strokeWidth={2} /> Replay last
              </DesktopButton>
            </>
          }
        />

        {/* ── Tier filter ─────────────────────────────────────────── */}
        <div
          style={{
            padding: "16px 32px 0",
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
          }}
        >
          {(["all", ...TIER_ORDER] as TierFilter[]).map((t) => {
            const active = tierFilter === t;
            const tier = TIERS[t];
            const count = t === "all" ? badges.length : badges.filter((b) => b.tier === t).length;
            return (
              <button
                key={t}
                onClick={() => setTierFilter(t)}
                style={{
                  background: active ? "var(--surface)" : "transparent",
                  border: active ? "0.5px solid var(--hairline)" : "0.5px solid transparent",
                  borderRadius: 100,
                  padding: "6px 12px 6px 8px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontFamily: "var(--font-sans)",
                  fontWeight: active ? 700 : 500,
                  fontSize: 12,
                  color: "var(--ink)",
                  transition: "background 0.15s ease",
                }}
              >
                {t !== "all" && (
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: tier.fill,
                      flexShrink: 0,
                    }}
                  />
                )}
                {t === "all" ? "All tiers" : tier.name}
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--ink-mute)",
                    fontWeight: 600,
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Featured unlock ──────────────────────────────────────── */}
        {latestUnlock && (
          <div style={{ padding: "20px 32px 0" }}>
            <FeaturedCard badge={latestUnlock} />
          </div>
        )}

        {/* ── Earned grid ──────────────────────────────────────────── */}
        {visibleEarned.length > 0 && (
          <div style={{ padding: "24px 32px 0" }}>
            <SectionLabel
              kicker={`${visibleEarned.length} badge${visibleEarned.length !== 1 ? "s" : ""}`}
              title="Earned"
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(6, 1fr)",
                gap: 12,
              }}
            >
              {visibleEarned.map((b) => (
                <BadgeCell key={b.id} badge={b} />
              ))}
            </div>
          </div>
        )}

        {/* ── Locked grid ──────────────────────────────────────────── */}
        {visibleLocked.length > 0 && (
          <div style={{ padding: "28px 32px 40px" }}>
            <SectionLabel
              kicker={`${visibleLocked.length} to unlock`}
              title="In progress"
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(6, 1fr)",
                gap: 12,
              }}
            >
              {visibleLocked.map((b) => (
                <BadgeCell key={b.id} badge={b} />
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && badges.length === 0 && (
          <div
            style={{
              padding: "60px 32px",
              textAlign: "center",
              color: "var(--ink-mute)",
              fontSize: 14,
            }}
          >
            Start exploring parks to unlock badges.
          </div>
        )}
      </div>
    </DesktopShell>
  );
}

// ── FeaturedCard ──────────────────────────────────────────────────────────────

function FeaturedCard({ badge }: { badge: BadgeData }) {
  const [celebrating, setCelebrating] = useState(false);
  const t = TIERS[badge.tier] ?? TIERS.bronze;
  const dateStr = badge.earned_at
    ? new Date(badge.earned_at)
        .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
        .toUpperCase()
    : "RECENTLY";

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "0.5px solid var(--hairline)",
        borderRadius: 16,
        padding: "20px 22px",
        display: "flex",
        gap: 22,
        alignItems: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Tier glow */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(120% 80% at 20% 0%, ${t.glow} 0%, transparent 55%)`,
          pointerEvents: "none",
        }}
      />

      <div style={{ position: "relative" }}>
        <BadgePatch emoji={badge.emoji} tier={badge.tier} size={108} earned />
      </div>

      <div style={{ position: "relative", flex: 1 }}>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "1.6px",
            color: "var(--ink-mute)",
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          LATEST UNLOCK · {dateStr} · {t.name.toUpperCase()}
        </div>
        <div
          style={{
            fontWeight: 800,
            fontSize: 28,
            color: "var(--ink)",
            marginTop: 6,
            letterSpacing: -0.5,
          }}
        >
          {badge.name}
        </div>
        <div
          style={{
            fontSize: 14,
            color: "var(--ink-soft)",
            marginTop: 4,
            lineHeight: 1.5,
            maxWidth: 480,
          }}
        >
          {badge.description}
        </div>
        <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
          <DesktopButton primary size="sm" onClick={() => setCelebrating(true)}>
            <Sparkles size={13} strokeWidth={2} /> Replay celebration
          </DesktopButton>
          <DesktopButton size="sm">
            <Share2 size={13} strokeWidth={2} /> Share
          </DesktopButton>
        </div>
      </div>
      {celebrating && (
        <BadgeCelebration badge={badge} onClose={() => setCelebrating(false)} />
      )}
    </div>
  );
}
