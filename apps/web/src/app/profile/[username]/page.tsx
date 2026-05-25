"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { MapPin, Users, UserCheck, TreePine } from "lucide-react";
import { DesktopShell } from "@/components/desktop/DesktopShell";
import { fullStateName } from "@/lib/stateNames";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RecentVisit {
  park_code: string;
  name: string;
  states: string;
  visited_date: string | null;
}

interface ProfileData {
  clerk_user_id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  parks_visited: number;
  follower_count: number;
  following_count: number;
  is_following: boolean;
  is_own_profile: boolean;
  recent_visits: RecentVisit[];
}

// ── Stat chip ─────────────────────────────────────────────────────────────────

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontWeight: 800, fontSize: 22, color: "var(--ink)", letterSpacing: -0.5 }}>
        {value.toLocaleString()}
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "1.2px", color: "var(--ink-mute)", fontWeight: 600, marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}

// ── Park card ─────────────────────────────────────────────────────────────────

function VisitCard({ visit, onClick }: { visit: RecentVisit; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-alt)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "var(--surface)"; }}
      style={{
        background: "var(--surface)",
        border: "0.5px solid var(--hairline)",
        borderRadius: 12,
        padding: "14px 16px",
        cursor: "pointer",
        textAlign: "left",
        transition: "background 120ms",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--visited)", flexShrink: 0 }} />
        <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {visit.name}
        </div>
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-mute)", letterSpacing: "0.6px", fontWeight: 600 }}>
        {fullStateName(visit.states.split(",")[0].trim())}
      </div>
      {visit.visited_date && (
        <div style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 2 }}>
          {new Date(visit.visited_date).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
        </div>
      )}
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const router = useRouter();
  const { isSignedIn } = useUser();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  useEffect(() => {
    if (!username) return;
    fetch(`/api/users/${encodeURIComponent(username)}`)
      .then((r) => {
        if (r.status === 404) { setNotFound(true); return null; }
        return r.ok ? r.json() : null;
      })
      .then((data) => {
        if (data) setProfile(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [username]);

  const toggleFollow = async () => {
    if (!profile || !isSignedIn || followBusy) return;
    setFollowBusy(true);
    const method = profile.is_following ? "DELETE" : "POST";
    try {
      const res = await fetch(`/api/follows/${profile.clerk_user_id}`, { method });
      if (res.ok) {
        setProfile((p) => p ? {
          ...p,
          is_following: !p.is_following,
          follower_count: p.is_following ? p.follower_count - 1 : p.follower_count + 1,
        } : p);
      }
    } catch {}
    finally { setFollowBusy(false); }
  };

  return (
    <DesktopShell>
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "48px 32px" }}>
        {loading && (
          <div style={{ textAlign: "center", padding: "80px 0", color: "var(--ink-mute)", fontSize: 14 }}>
            Loading…
          </div>
        )}

        {notFound && (
          <div style={{ textAlign: "center", padding: "80px 0" }}>
            <TreePine size={40} style={{ color: "var(--ink-mute)", marginBottom: 16 }} />
            <div style={{ fontWeight: 700, fontSize: 20, color: "var(--ink)" }}>User not found</div>
            <div style={{ color: "var(--ink-mute)", marginTop: 8, fontSize: 14 }}>@{username} doesn&apos;t exist.</div>
            <button
              onClick={() => router.back()}
              style={{ marginTop: 24, background: "var(--primary)", color: "#FFFBF1", border: "none", borderRadius: 10, padding: "10px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
            >
              Go back
            </button>
          </div>
        )}

        {profile && (
          <>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 24, marginBottom: 36 }}>
              {/* Avatar */}
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.username}
                  style={{ width: 80, height: 80, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: "2px solid var(--hairline)" }}
                />
              ) : (
                <div style={{
                  width: 80, height: 80, borderRadius: "50%", flexShrink: 0,
                  background: "var(--primary)", display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 28, fontWeight: 800, color: "#FFFBF1",
                }}>
                  {profile.username[0]?.toUpperCase()}
                </div>
              )}

              {/* Name / username / bio */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 24, color: "var(--ink)", letterSpacing: -0.5 }}>
                  {profile.display_name || `@${profile.username}`}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-mute)", fontWeight: 600, letterSpacing: "0.8px", marginTop: 2 }}>
                  @{profile.username}
                </div>
                {profile.bio && (
                  <div style={{ fontSize: 13.5, color: "var(--ink-soft)", marginTop: 10, lineHeight: 1.55 }}>
                    {profile.bio}
                  </div>
                )}
              </div>

              {/* Follow button */}
              {!profile.is_own_profile && isSignedIn && (
                <button
                  onClick={toggleFollow}
                  disabled={followBusy}
                  style={{
                    flexShrink: 0,
                    background: profile.is_following ? "var(--surface)" : "var(--primary)",
                    color: profile.is_following ? "var(--ink)" : "#FFFBF1",
                    border: profile.is_following ? "0.5px solid var(--hairline)" : "none",
                    borderRadius: 10,
                    padding: "9px 18px",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: followBusy ? "wait" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    opacity: followBusy ? 0.7 : 1,
                    transition: "opacity 120ms",
                  }}
                >
                  {profile.is_following
                    ? <><UserCheck size={14} /> Following</>
                    : <><Users size={14} /> Follow</>
                  }
                </button>
              )}
            </div>

            {/* Stats row */}
            <div style={{
              display: "flex",
              gap: 0,
              background: "var(--surface)",
              border: "0.5px solid var(--hairline)",
              borderRadius: 14,
              overflow: "hidden",
              marginBottom: 36,
            }}>
              {[
                { value: profile.parks_visited, label: "PARKS VISITED" },
                { value: profile.follower_count, label: "FOLLOWERS" },
                { value: profile.following_count, label: "FOLLOWING" },
              ].map((s, i, arr) => (
                <div
                  key={s.label}
                  style={{
                    flex: 1,
                    padding: "20px 16px",
                    borderRight: i < arr.length - 1 ? "0.5px solid var(--hairline)" : "none",
                  }}
                >
                  <Stat value={s.value} label={s.label} />
                </div>
              ))}
            </div>

            {/* Recent visits */}
            {profile.recent_visits.length > 0 && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                  <MapPin size={14} style={{ color: "var(--visited)" }} />
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "1.4px", color: "var(--ink-mute)", fontWeight: 600 }}>
                    RECENTLY VISITED
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
                  {profile.recent_visits.map((v) => (
                    <VisitCard key={v.park_code} visit={v} onClick={() => router.push(`/parks/${v.park_code}`)} />
                  ))}
                </div>
              </>
            )}

            {profile.recent_visits.length === 0 && (
              <div style={{
                textAlign: "center",
                padding: "48px 24px",
                background: "var(--surface)",
                border: "0.5px solid var(--hairline)",
                borderRadius: 14,
                color: "var(--ink-mute)",
                fontSize: 13,
              }}>
                No park visits yet.
              </div>
            )}
          </>
        )}
      </div>
    </DesktopShell>
  );
}
