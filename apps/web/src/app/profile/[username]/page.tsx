"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { MapPin, Users, UserCheck, UserPlus, Clock, TreePine, Footprints } from "lucide-react";
import { DesktopShell } from "@/components/desktop/DesktopShell";
import { fullStateName } from "@/lib/stateNames";

// ── Types ─────────────────────────────────────────────────────────────────────

type FriendshipStatus = 'none' | 'pending_sent' | 'pending_received' | 'accepted';

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
  friend_count: number;
  friendship_status: FriendshipStatus;
  friendship_id: number | null;
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

// ── Friend action button ───────────────────────────────────────────────────────

function FriendButton({
  status,
  busy,
  onAddFriend,
  onCancelRequest,
  onAcceptRequest,
  onDeclineRequest,
  onUnfriend,
}: {
  status: FriendshipStatus;
  busy: boolean;
  onAddFriend: () => void;
  onCancelRequest: () => void;
  onAcceptRequest: () => void;
  onDeclineRequest: () => void;
  onUnfriend: () => void;
}) {
  const base: React.CSSProperties = {
    flexShrink: 0,
    borderRadius: 10,
    padding: "9px 18px",
    fontSize: 13,
    fontWeight: 700,
    cursor: busy ? "wait" : "pointer",
    display: "flex",
    alignItems: "center",
    gap: 6,
    opacity: busy ? 0.7 : 1,
    transition: "opacity 120ms",
    border: "none",
  };

  if (status === 'accepted') {
    return (
      <button
        onClick={onUnfriend}
        disabled={busy}
        style={{ ...base, background: "var(--surface)", color: "var(--ink)", border: "0.5px solid var(--hairline)" }}
      >
        <UserCheck size={14} /> Friends
      </button>
    );
  }

  if (status === 'pending_sent') {
    return (
      <button
        onClick={onCancelRequest}
        disabled={busy}
        style={{ ...base, background: "var(--surface)", color: "var(--ink-mute)", border: "0.5px solid var(--hairline)" }}
      >
        <Clock size={14} /> Request Sent
      </button>
    );
  }

  if (status === 'pending_received') {
    return (
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <button
          onClick={onAcceptRequest}
          disabled={busy}
          style={{ ...base, background: "var(--primary)", color: "#FFFBF1" }}
        >
          <UserCheck size={14} /> Accept
        </button>
        <button
          onClick={onDeclineRequest}
          disabled={busy}
          style={{ ...base, background: "var(--surface)", color: "var(--ink)", border: "0.5px solid var(--hairline)" }}
        >
          Decline
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={onAddFriend}
      disabled={busy}
      style={{ ...base, background: "var(--primary)", color: "#FFFBF1" }}
    >
      <UserPlus size={14} /> Add Friend
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const router = useRouter();
  const { isSignedIn, isLoaded } = useUser();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!username) return;
    setError(false);
    fetch(`/api/users/${encodeURIComponent(username)}`)
      .then((r) => {
        if (r.status === 404) { setNotFound(true); return null; }
        if (!r.ok) { setError(true); return null; }
        return r.json();
      })
      .then((data) => {
        if (data) setProfile(data);
      })
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
    setProfile(p => p ? { ...p, friendship_status: 'pending_sent' } : p); // optimistic
    const res = await fetch('/api/friends', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: profile!.clerk_user_id }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('[friends] POST failed:', res.status, err);
      setProfile(p => p ? { ...p, friendship_status: prev } : p); // revert
      return;
    }
    const data = await res.json();
    setProfile(p => p ? { ...p, friendship_status: data.status ?? 'pending_sent' } : p);
  });

  const handleCancelRequest = withBusy(async () => {
    setProfile(p => p ? { ...p, friendship_status: 'none' } : p); // optimistic
    const res = await fetch(`/api/friends?userId=${profile!.clerk_user_id}`, { method: 'DELETE' });
    if (!res.ok) setProfile(p => p ? { ...p, friendship_status: 'pending_sent' } : p); // revert
  });

  const handleAcceptRequest = withBusy(async () => {
    if (!profile!.friendship_id) return;
    const res = await fetch('/api/friends', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ friendshipId: profile!.friendship_id, action: 'accept' }),
    });
    if (res.ok) {
      setProfile(p => p ? { ...p, friendship_status: 'accepted', friend_count: p.friend_count + 1 } : p);
    }
  });

  const handleDeclineRequest = withBusy(async () => {
    if (!profile!.friendship_id) return;
    const res = await fetch('/api/friends', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ friendshipId: profile!.friendship_id, action: 'reject' }),
    });
    if (res.ok) setProfile(p => p ? { ...p, friendship_status: 'none', friendship_id: null } : p);
  });

  const handleUnfriend = withBusy(async () => {
    const res = await fetch(`/api/friends?userId=${profile!.clerk_user_id}`, { method: 'DELETE' });
    if (res.ok) {
      setProfile(p => p ? { ...p, friendship_status: 'none', friend_count: Math.max(0, p.friend_count - 1) } : p);
    }
  });

  const profileContent = (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "48px 32px" }}>
        {loading && (
          <div style={{ textAlign: "center", padding: "80px 0", color: "var(--ink-mute)", fontSize: 14 }}>
            Loading…
          </div>
        )}

        {error && (
          <div style={{ textAlign: "center", padding: "80px 0" }}>
            <TreePine size={40} style={{ color: "var(--ink-mute)", marginBottom: 16 }} />
            <div style={{ fontWeight: 700, fontSize: 20, color: "var(--ink)" }}>Failed to load profile</div>
            <div style={{ color: "var(--ink-mute)", marginTop: 8, fontSize: 14 }}>Something went wrong. Try refreshing the page.</div>
            <button
              onClick={() => { setError(false); setLoading(true); fetch(`/api/users/${encodeURIComponent(username)}`).then(r => r.ok ? r.json() : null).then(d => { if (d) setProfile(d); else setError(true); }).catch(() => setError(true)).finally(() => setLoading(false)); }}
              style={{ marginTop: 24, background: "var(--primary)", color: "#FFFBF1", border: "none", borderRadius: 10, padding: "10px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
            >
              Try again
            </button>
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

              {/* Friend button */}
              {!profile.is_own_profile && isSignedIn && (
                <FriendButton
                  status={profile.friendship_status}
                  busy={busy}
                  onAddFriend={handleAddFriend}
                  onCancelRequest={handleCancelRequest}
                  onAcceptRequest={handleAcceptRequest}
                  onDeclineRequest={handleDeclineRequest}
                  onUnfriend={handleUnfriend}
                />
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
                { value: profile.friend_count, label: "FRIENDS" },
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
  );

  // Signed-in users get the full shell
  if (isLoaded && isSignedIn) {
    return <DesktopShell>{profileContent}</DesktopShell>;
  }

  // Logged-out visitors get a public layout with a sign-up nudge
  const displayName = profile?.display_name || (profile ? `@${profile.username}` : "This explorer");

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
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
        <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 7, color: "var(--primary)" }}>
          <Footprints size={20} strokeWidth={2} />
          <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: -0.3 }}>ParkQuest</span>
        </Link>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/sign-in" style={{ textDecoration: "none" }}>
            <button style={{
              background: "transparent", border: "0.5px solid var(--hairline)",
              borderRadius: 8, padding: "7px 16px", fontSize: 13, fontWeight: 600,
              color: "var(--ink)", cursor: "pointer",
            }}>
              Sign in
            </button>
          </Link>
          <Link href="/sign-up" style={{ textDecoration: "none" }}>
            <button style={{
              background: "var(--primary)", border: "none",
              borderRadius: 8, padding: "7px 16px", fontSize: 13, fontWeight: 700,
              color: "#FFFBF1", cursor: "pointer",
            }}>
              Get started
            </button>
          </Link>
        </div>
      </div>

      {/* Profile content */}
      <div style={{ paddingBottom: 100 }}>
        {profileContent}
      </div>

      {/* Sticky sign-up banner */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 200,
        background: "var(--primary)",
        padding: "16px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
      }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#FFFBF1" }}>
            Join {displayName} on ParkQuest
          </div>
          <div style={{ fontSize: 12.5, color: "rgba(255,251,241,0.75)", marginTop: 2 }}>
            Track your national park adventures, earn badges, and connect with friends.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <Link href="/sign-in" style={{ textDecoration: "none" }}>
            <button style={{
              background: "rgba(255,251,241,0.15)", border: "1px solid rgba(255,251,241,0.35)",
              borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 600,
              color: "#FFFBF1", cursor: "pointer",
            }}>
              Sign in
            </button>
          </Link>
          <Link href="/sign-up" style={{ textDecoration: "none" }}>
            <button style={{
              background: "#FFFBF1", border: "none",
              borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 700,
              color: "var(--primary)", cursor: "pointer",
            }}>
              Create free account
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}
