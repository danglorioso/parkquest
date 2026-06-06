"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Users, UserCheck, Clock, UserRound, UserPlus } from "lucide-react";
import { DesktopShell } from "@/components/desktop/DesktopShell";

// ── Types ─────────────────────────────────────────────────────────────────────

interface FriendUser {
  clerk_user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  friends_since: string | null;
}

interface PendingUser {
  friendship_id: number;
  clerk_user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  requested_at: string | null;
}

// ── Avatar ─────────────────────────────────────────────────────────────────────

function Avatar({ url, name, size = 44 }: { url: string | null; name: string; size?: number }) {
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", border: "1px solid var(--hairline)", flexShrink: 0 }}
      />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: "var(--primary)", display: "flex", alignItems: "center",
      justifyContent: "center", fontSize: size * 0.35, fontWeight: 800, color: "#FFFBF1",
    }}>
      {name[0]?.toUpperCase() ?? <UserRound size={size * 0.5} />}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FriendsPage() {
  const { user, isLoaded, isSignedIn } = useUser();
  const router = useRouter();
  const [friends, setFriends] = useState<FriendUser[] | null>(null);
  const [incoming, setIncoming] = useState<PendingUser[] | null>(null);
  const [outgoing, setOutgoing] = useState<PendingUser[] | null>(null);
  const [respondedTo, setRespondedTo] = useState<Set<number>>(new Set());
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) { router.replace("/sign-in"); return; }
    const userId = user.id;

    Promise.all([
      fetch(`/api/friends?userId=${userId}&type=friends`).then(r => r.ok ? r.json() : []),
      fetch(`/api/friends?userId=${userId}&type=pending_incoming`).then(r => r.ok ? r.json() : []),
      fetch(`/api/friends?userId=${userId}&type=pending_outgoing`).then(r => r.ok ? r.json() : []),
    ]).then(([f, inc, out]) => {
      setFriends(f);
      setIncoming(inc);
      setOutgoing(out);
    }).catch(() => {
      setFriends([]);
      setIncoming([]);
      setOutgoing([]);
    });
  }, [isLoaded, isSignedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRespond = async (friendshipId: number, action: 'accept' | 'reject') => {
    if (busy.has(friendshipId)) return;
    setBusy(prev => new Set([...prev, friendshipId]));
    try {
      const res = await fetch('/api/friends', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friendshipId, action }),
      });
      if (res.ok) {
        setRespondedTo(prev => new Set([...prev, friendshipId]));
        if (action === 'accept') {
          const accepted = incoming?.find(r => r.friendship_id === friendshipId);
          if (accepted) {
            setFriends(prev => prev ? [{ ...accepted, friends_since: new Date().toISOString() }, ...prev] : prev);
          }
        }
      }
    } finally {
      setBusy(prev => { const s = new Set(prev); s.delete(friendshipId); return s; });
    }
  };

  const handleUnfriend = async (userId: string) => {
    if (removingIds.has(userId)) return;
    setRemovingIds(prev => new Set([...prev, userId]));
    try {
      const res = await fetch(`/api/friends?userId=${userId}`, { method: 'DELETE' });
      if (res.ok) setFriends(prev => prev ? prev.filter(f => f.clerk_user_id !== userId) : prev);
    } finally {
      setRemovingIds(prev => { const s = new Set(prev); s.delete(userId); return s; });
    }
  };

  const handleCancelRequest = async (userId: string) => {
    const res = await fetch(`/api/friends?userId=${userId}`, { method: 'DELETE' });
    if (res.ok) setOutgoing(prev => prev ? prev.filter(r => r.clerk_user_id !== userId) : prev);
  };

  const pendingIncoming = (incoming ?? []).filter(r => !respondedTo.has(r.friendship_id));

  const Section = ({ title, icon: Icon, count, children }: {
    title: string; icon: React.ElementType; count?: number; children: React.ReactNode;
  }) => (
    <section style={{ marginBottom: 36 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <Icon size={14} style={{ color: "var(--ink-mute)" }} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "1.4px", color: "var(--ink-mute)", fontWeight: 600 }}>
          {title}
        </span>
        {count != null && count > 0 && (
          <span style={{
            background: "#DC2626", color: "#fff", fontSize: 9, fontWeight: 700,
            borderRadius: 10, padding: "1px 6px", fontFamily: "var(--font-mono)",
          }}>
            {count}
          </span>
        )}
      </div>
      {children}
    </section>
  );

  const UserRow = ({
    avatarUrl, username, displayName, children,
  }: {
    avatarUrl: string | null; username: string; displayName: string | null; children?: React.ReactNode;
  }) => (
    <div style={{
      display: "flex", alignItems: "center", gap: 14,
      padding: "12px 16px",
      background: "var(--surface)",
      border: "0.5px solid var(--hairline)",
      borderRadius: 12,
    }}>
      <Link href={`/profile/${username}`} style={{ textDecoration: "none", flexShrink: 0 }}>
        <Avatar url={avatarUrl} name={displayName || username} />
      </Link>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Link href={`/profile/${username}`} style={{ textDecoration: "none" }}>
          {displayName && (
            <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {displayName}
            </div>
          )}
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-mute)", fontWeight: 600 }}>
            @{username}
          </div>
        </Link>
      </div>
      {children}
    </div>
  );

  const btnBase: React.CSSProperties = {
    border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12.5, fontWeight: 700,
    cursor: "pointer", flexShrink: 0, transition: "opacity 100ms",
  };

  if (!isLoaded || friends === null) {
    return (
      <DesktopShell>
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "48px 32px", textAlign: "center", color: "var(--ink-mute)", fontSize: 14 }}>
          Loading…
        </div>
      </DesktopShell>
    );
  }

  return (
    <DesktopShell>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "48px 32px" }}>
        {/* Page header */}
        <div style={{ marginBottom: 36 }}>
          <h1 style={{ fontWeight: 800, fontSize: 26, color: "var(--ink)", letterSpacing: -0.5, marginBottom: 4 }}>
            Friends
          </h1>
          <p style={{ fontSize: 13.5, color: "var(--ink-mute)" }}>
            Manage your friends and pending requests.
          </p>
        </div>

        {/* Incoming requests */}
        {pendingIncoming.length > 0 && (
          <Section title="FRIEND REQUESTS" icon={UserPlus} count={pendingIncoming.length}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {pendingIncoming.map(r => (
                <UserRow key={r.friendship_id} avatarUrl={r.avatar_url} username={r.username} displayName={r.display_name}>
                  <div style={{ display: "flex", gap: 7, flexShrink: 0 }}>
                    <button
                      onClick={() => handleRespond(r.friendship_id, 'accept')}
                      disabled={busy.has(r.friendship_id)}
                      style={{ ...btnBase, background: "var(--primary)", color: "#FFFBF1", opacity: busy.has(r.friendship_id) ? 0.7 : 1 }}
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => handleRespond(r.friendship_id, 'reject')}
                      disabled={busy.has(r.friendship_id)}
                      style={{ ...btnBase, background: "var(--surface-alt)", color: "var(--ink)", border: "0.5px solid var(--hairline)", opacity: busy.has(r.friendship_id) ? 0.7 : 1 }}
                    >
                      Decline
                    </button>
                  </div>
                </UserRow>
              ))}
            </div>
          </Section>
        )}

        {/* Friends list */}
        <Section title="FRIENDS" icon={Users} count={friends.length}>
          {friends.length === 0 ? (
            <div style={{
              textAlign: "center", padding: "40px 24px",
              background: "var(--surface)", border: "0.5px solid var(--hairline)", borderRadius: 14,
              color: "var(--ink-mute)", fontSize: 13,
            }}>
              <Users size={28} style={{ color: "var(--ink-mute)", margin: "0 auto 12px", display: "block" }} strokeWidth={1.5} />
              No friends yet. Visit someone&apos;s profile to send a friend request.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {friends.map(f => (
                <UserRow key={f.clerk_user_id} avatarUrl={f.avatar_url} username={f.username} displayName={f.display_name}>
                  <button
                    onClick={() => handleUnfriend(f.clerk_user_id)}
                    disabled={removingIds.has(f.clerk_user_id)}
                    style={{ ...btnBase, background: "var(--surface-alt)", color: "var(--ink-mute)", border: "0.5px solid var(--hairline)", opacity: removingIds.has(f.clerk_user_id) ? 0.5 : 1 }}
                  >
                    <UserCheck size={12} style={{ display: "inline", marginRight: 4 }} />
                    Unfriend
                  </button>
                </UserRow>
              ))}
            </div>
          )}
        </Section>

        {/* Outgoing requests */}
        {(outgoing ?? []).length > 0 && (
          <Section title="SENT REQUESTS" icon={Clock}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(outgoing ?? []).map(r => (
                <UserRow key={r.friendship_id} avatarUrl={r.avatar_url} username={r.username} displayName={r.display_name}>
                  <button
                    onClick={() => handleCancelRequest(r.clerk_user_id)}
                    style={{ ...btnBase, background: "var(--surface-alt)", color: "var(--ink-mute)", border: "0.5px solid var(--hairline)" }}
                  >
                    Cancel
                  </button>
                </UserRow>
              ))}
            </div>
          </Section>
        )}
      </div>
    </DesktopShell>
  );
}
