"use client";

import { useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Users, UserCheck, Clock, UserRound, UserPlus, Search } from "lucide-react";
import { DesktopShell } from "@/components/desktop/DesktopShell";

// ── Types ─────────────────────────────────────────────────────────────────────

interface FriendUser {
  clerk_user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  friends_since: string | null;
}

interface SearchUser {
  clerk_user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
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
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    if (!searchQuery.trim()) { setSearchResults([]); setSearchLoading(false); return; }
    setSearchLoading(true);
    searchDebounce.current = setTimeout(() => {
      fetch(`/api/users?search=${encodeURIComponent(searchQuery.trim())}&limit=12`)
        .then(r => r.ok ? r.json() : [])
        .then((data: SearchUser[]) => { setSearchResults(data); setSearchLoading(false); })
        .catch(() => setSearchLoading(false));
    }, 280);
  }, [searchQuery]);

  const handleAddFromSearch = async (targetId: string) => {
    setSentIds(prev => new Set(prev).add(targetId));
    const res = await fetch("/api/friends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: targetId }),
    });
    if (!res.ok) setSentIds(prev => { const s = new Set(prev); s.delete(targetId); return s; });
  };

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
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "48px 32px" }}>
          {/* Header */}
          <div style={{ marginBottom: 36 }}>
            <div style={{ height: 28, width: 120, borderRadius: 6, background: "var(--surface-alt)", marginBottom: 8 }} />
            <div style={{ height: 14, width: 260, borderRadius: 4, background: "var(--surface-alt)" }} />
          </div>
          {/* Search bar */}
          <div style={{ height: 42, borderRadius: 10, background: "var(--surface-alt)", marginBottom: 36 }} />
          {/* Section label */}
          <div style={{ height: 10, width: 80, borderRadius: 3, background: "var(--surface-alt)", marginBottom: 14 }} />
          {/* Friend rows */}
          {[1, 2, 3].map(i => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 14,
              padding: "12px 16px", background: "var(--surface)",
              border: "0.5px solid var(--hairline)", borderRadius: 12, marginBottom: 8,
            }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--surface-alt)", flexShrink: 0 }} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ height: 13, width: `${[55, 70, 45][i - 1]}%`, borderRadius: 4, background: "var(--surface-alt)" }} />
                <div style={{ height: 11, width: `${[35, 45, 30][i - 1]}%`, borderRadius: 3, background: "var(--surface-alt)" }} />
              </div>
              <div style={{ height: 32, width: 80, borderRadius: 8, background: "var(--surface-alt)", flexShrink: 0 }} />
            </div>
          ))}
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

        {/* Search */}
        <div style={{ marginBottom: 36, position: "relative" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 9,
            background: "var(--surface)", border: "0.5px solid var(--hairline)",
            borderRadius: 10, padding: "10px 14px",
          }}>
            <Search size={14} strokeWidth={2} style={{ color: "var(--ink-mute)", flexShrink: 0 }} />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by name or username…"
              style={{
                flex: 1, border: "none", background: "transparent", outline: "none",
                fontSize: 13.5, color: "var(--ink)", fontFamily: "inherit",
              }}
            />
            {searchLoading && (
              <div style={{
                width: 13, height: 13, borderRadius: "50%",
                border: "2px solid var(--hairline)", borderTopColor: "var(--primary)",
                animation: "pqSpin 600ms linear infinite", flexShrink: 0,
              }} />
            )}
            <style>{`@keyframes pqSpin { to { transform: rotate(360deg) } }`}</style>
          </div>

          {searchQuery.trim() && (
            <div style={{
              position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 50,
              background: "var(--bg)", border: "0.5px solid var(--hairline)",
              borderRadius: 10, overflow: "hidden",
              boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
              maxHeight: 360, overflowY: "auto",
            }}>
              {searchResults.length === 0 && !searchLoading ? (
                <div style={{ padding: "20px 16px", textAlign: "center", fontSize: 13, color: "var(--ink-mute)" }}>
                  No users found for &ldquo;{searchQuery}&rdquo;
                </div>
              ) : (
                searchResults.map(u => {
                  const name = u.display_name || u.username;
                  const friendIds = new Set((friends ?? []).map(f => f.clerk_user_id));
                  const pendingIncomingIds = new Set((incoming ?? []).map(f => f.clerk_user_id));
                  const pendingOutgoingIds = new Set((outgoing ?? []).map(f => f.clerk_user_id));
                  const isFriend   = friendIds.has(u.clerk_user_id);
                  const isIncoming = pendingIncomingIds.has(u.clerk_user_id);
                  const isSent     = sentIds.has(u.clerk_user_id) || pendingOutgoingIds.has(u.clerk_user_id);
                  return (
                    <div key={u.clerk_user_id} style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "10px 14px", borderBottom: "0.5px solid var(--hairline-soft)",
                    }}>
                      <Link href={`/profile/${u.username}`} style={{ textDecoration: "none", flexShrink: 0 }}>
                        <Avatar url={u.avatar_url} name={name} size={36} />
                      </Link>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Link href={`/profile/${u.username}`} style={{ textDecoration: "none" }}>
                          <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-mute)" }}>@{u.username}</div>
                        </Link>
                      </div>
                      {isFriend ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 600, color: "var(--primary)", padding: "5px 11px", borderRadius: 7, background: "rgba(31,61,46,0.07)" }}>
                          <Users size={11} strokeWidth={2.5} /> Friends
                        </div>
                      ) : isIncoming ? (
                        <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--ink-mute)", padding: "5px 11px", borderRadius: 7, background: "var(--surface-alt)", border: "0.5px solid var(--hairline)" }}>
                          Respond ↑
                        </div>
                      ) : isSent ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 600, color: "var(--ink-mute)", padding: "5px 11px", borderRadius: 7, background: "var(--surface-alt)", border: "0.5px solid var(--hairline)" }}>
                          <Clock size={11} strokeWidth={2.5} /> Pending
                        </div>
                      ) : (
                        <button
                          onClick={() => handleAddFromSearch(u.clerk_user_id)}
                          style={{ display: "flex", alignItems: "center", gap: 5, background: "var(--primary)", color: "#fff", border: "none", borderRadius: 7, cursor: "pointer", fontSize: 12, fontWeight: 700, padding: "5px 12px" }}
                        >
                          <UserPlus size={12} strokeWidth={2.5} /> Add
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
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
