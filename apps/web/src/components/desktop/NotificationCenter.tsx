"use client";

import { useEffect, useRef, useState } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import {
  Bell, UserPlus, Heart, MessageCircle, MapPin, Sparkles, X, UserCheck, BellOff,
} from "lucide-react";

type NotificationType = "friend_request" | "friend_accepted" | "like" | "comment" | "post" | "system" | "recommendation";

interface NotificationItem {
  id: number;
  type: NotificationType;
  actor_id: string | null;
  actor_username: string | null;
  actor_display_name: string | null;
  actor_avatar_url: string | null;
  post_id: number | null;
  park_code: string | null;
  park_name: string | null;
  metadata: { message?: string; excerpt?: string; friendship_id?: number } | null;
  read: boolean;
  created_at: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

const TYPE_CONFIG: Record<NotificationType, { icon: React.ElementType; bg: string; color: string }> = {
  friend_request: { icon: UserPlus,      bg: "#EDE9FE", color: "#7C3AED" },
  friend_accepted: { icon: UserCheck,    bg: "#D1FAE5", color: "#059669" },
  like:            { icon: Heart,         bg: "#FEE2E2", color: "#DC2626" },
  comment:         { icon: MessageCircle, bg: "#D1FAE5", color: "#059669" },
  post:            { icon: MapPin,        bg: "#DCFCE7", color: "#16A34A" },
  system:          { icon: Sparkles,      bg: "#FEF3C7", color: "#D97706" },
  recommendation:  { icon: Sparkles,      bg: "#FEF3C7", color: "#D97706" },
};

function notificationText(n: NotificationItem): string {
  const name = n.actor_display_name || n.actor_username || "Someone";
  switch (n.type) {
    case "friend_request":  return `${name} sent you a friend request`;
    case "friend_accepted": return `${name} accepted your friend request`;
    case "like":            return `${name} liked your post`;
    case "comment":         return `${name} commented on your post`;
    case "post":            return n.park_name ? `${name} posted at ${n.park_name}` : `${name} shared a new post`;
    default:                return n.metadata?.message ?? "New notification";
  }
}

function NotificationRow({
  n,
  responded,
  onRespond,
}: {
  n: NotificationItem;
  responded: boolean;
  onRespond: (friendshipId: number, action: 'accept' | 'reject') => Promise<void>;
}) {
  const cfg = TYPE_CONFIG[n.type] ?? TYPE_CONFIG.system;
  const Icon = cfg.icon;
  const name = n.actor_display_name || n.actor_username || "Someone";
  const [busy, setBusy] = useState(false);

  const avatarEl = n.actor_avatar_url ? (
    <img
      src={n.actor_avatar_url}
      alt={name}
      style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
    />
  ) : n.actor_id ? (
    <div style={{
      width: 36, height: 36, borderRadius: "50%", background: "var(--surface-alt)", flexShrink: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 700, fontSize: 13, color: "var(--ink-mute)", fontFamily: "var(--font-mono)",
    }}>
      {name[0]?.toUpperCase()}
    </div>
  ) : (
    <div style={{
      width: 36, height: 36, borderRadius: "50%", background: cfg.bg, flexShrink: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <Icon style={{ width: 16, height: 16, color: cfg.color }} strokeWidth={2} />
    </div>
  );

  const handleRespond = async (action: 'accept' | 'reject') => {
    const fid = n.metadata?.friendship_id;
    if (!fid || busy) return;
    setBusy(true);
    try { await onRespond(fid, action); } finally { setBusy(false); }
  };

  return (
    <div style={{
      display: "flex", gap: 10, padding: "10px 14px",
      background: n.read ? "transparent" : "rgba(31,61,46,0.045)",
    }}>
      <div style={{ position: "relative", flexShrink: 0 }}>
        {avatarEl}
        {n.actor_id && (
          <div style={{
            position: "absolute", bottom: -1, right: -1,
            width: 16, height: 16, borderRadius: "50%",
            background: cfg.bg, border: "1.5px solid var(--bg)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Icon style={{ width: 8, height: 8, color: cfg.color }} strokeWidth={2.5} />
          </div>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12.5, color: "var(--ink)", lineHeight: 1.35,
          fontWeight: n.read ? 400 : 550,
        }}>
          {notificationText(n)}
        </div>
        {n.type === "comment" && n.metadata?.excerpt && (
          <div style={{
            fontSize: 11.5, color: "var(--ink-soft)", marginTop: 2,
            fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            &ldquo;{n.metadata.excerpt}&rdquo;
          </div>
        )}

        {/* Friend request action buttons */}
        {n.type === "friend_request" && n.metadata?.friendship_id && (
          responded ? (
            <div style={{ fontSize: 11, color: "var(--ink-mute)", marginTop: 5, display: "flex", alignItems: "center", gap: 4 }}>
              <UserCheck style={{ width: 11, height: 11 }} /> Responded
            </div>
          ) : (
            <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
              <button
                onClick={() => handleRespond('accept')}
                disabled={busy}
                style={{
                  background: "var(--primary)", color: "#FFFBF1", border: "none",
                  borderRadius: 7, padding: "4px 12px", fontSize: 11.5, fontWeight: 700,
                  cursor: busy ? "wait" : "pointer", opacity: busy ? 0.7 : 1,
                }}
              >
                Accept
              </button>
              <button
                onClick={() => handleRespond('reject')}
                disabled={busy}
                style={{
                  background: "var(--surface-alt)", color: "var(--ink)", border: "0.5px solid var(--hairline)",
                  borderRadius: 7, padding: "4px 12px", fontSize: 11.5, fontWeight: 600,
                  cursor: busy ? "wait" : "pointer", opacity: busy ? 0.7 : 1,
                }}
              >
                Decline
              </button>
            </div>
          )
        )}

        <div style={{ fontSize: 11, color: "var(--ink-mute)", marginTop: 3 }}>
          {timeAgo(n.created_at)}
        </div>
      </div>
    </div>
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return new Uint8Array([...rawData].map((c) => c.charCodeAt(0)));
}

export function NotificationCenter({ compact = false }: { compact?: boolean } = {}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [respondedTo, setRespondedTo] = useState<Set<number>>(new Set());
  const [pushPermission, setPushPermission] = useState<NotificationPermission | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPushPermission(Notification.permission);
    }
  }, [open]);

  async function handleEnablePush() {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
    const permission = await Notification.requestPermission();
    setPushPermission(permission);
    if (permission !== "granted") return;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      });
      await fetch("/api/push-subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      localStorage.setItem("pq_push_asked", "1");
    } catch { /* silent */ }
  }

  // Poll unread count every 30s
  useEffect(() => {
    const fetchCount = () => {
      fetch("/api/notifications?count=true")
        .then((r) => (r.ok ? r.json() : { unread_count: 0 }))
        .then((d) => setUnreadCount(d.unread_count ?? 0))
        .catch(() => {});
    };
    fetchCount();
    const id = setInterval(fetchCount, 30_000);
    return () => clearInterval(id);
  }, []);

  // Fetch list + mark read when panel opens
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/notifications")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: NotificationItem[]) => {
        setItems(data);
        setLoading(false);
        if (data.some((n) => !n.read)) {
          fetch("/api/notifications", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ all: true }),
          })
            .then(() => setUnreadCount(0))
            .catch(() => {});
        } else {
          setUnreadCount(0);
        }
      })
      .catch(() => setLoading(false));
  }, [open]);

  const handleRespond = async (friendshipId: number, action: 'accept' | 'reject') => {
    const res = await fetch('/api/friends', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ friendshipId, action }),
    });
    if (res.ok) {
      setRespondedTo(prev => new Set([...prev, friendshipId]));
    }
  };

  const newCount = items.filter((n) => !n.read).length;
  const displayCount = open ? newCount : unreadCount;

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          title="Notifications"
          style={{
            position: "relative",
            width: compact ? "auto" : 36,
            height: compact ? "auto" : 36,
            borderRadius: 10,
            background: compact ? "transparent" : (open ? "rgba(31,61,46,0.06)" : "transparent"),
            border: compact ? "none" : `0.5px solid ${open ? "var(--hairline)" : "var(--hairline-soft)"}`,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            padding: compact ? "6px 8px" : 0,
            transition: "background 120ms",
          }}
        >
          <Bell style={{ width: compact ? 18 : 15, height: compact ? 18 : 15, color: "var(--ink-soft)" }} strokeWidth={2} />
          {displayCount > 0 && (
            <div style={{
              position: "absolute",
              top: compact ? 2 : 4,
              right: compact ? 2 : 4,
              minWidth: compact ? 13 : 14,
              height: compact ? 13 : 14,
              borderRadius: compact ? 6.5 : 7,
              background: "#DC2626",
              border: "1.5px solid var(--bg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: compact ? 7.5 : 8,
              fontWeight: 700,
              color: "#fff",
              fontFamily: "var(--font-mono)",
              padding: compact ? "0 2px" : "0 3px",
              lineHeight: 1,
            }}>
              {displayCount > 99 ? "99+" : displayCount}
            </div>
          )}
        </button>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="top"
          align="end"
          sideOffset={8}
          avoidCollisions
          collisionPadding={{ left: 12 }}
          style={{
            width: 320,
            background: "rgba(255,251,241,0.98)",
            backdropFilter: "blur(24px) saturate(160%)",
            WebkitBackdropFilter: "blur(24px) saturate(160%)",
            border: "0.5px solid var(--hairline)",
            borderRadius: 14,
            boxShadow: "0 12px 40px rgba(0,0,0,0.28)",
            zIndex: 9999,
            overflow: "hidden",
            outline: "none",
          }}
        >
          {/* Header */}
          <div style={{
            padding: "12px 14px 10px",
            borderBottom: "0.5px solid var(--hairline-soft)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>Activity</span>
              {newCount > 0 && (
                <span style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  fontWeight: 700,
                  color: "var(--ink-mute)",
                  background: "var(--surface-alt)",
                  padding: "2px 6px",
                  borderRadius: 4,
                  letterSpacing: "0.4px",
                }}>
                  {newCount} new
                </span>
              )}
            </div>
            <PopoverPrimitive.Close asChild>
              <button style={{
                background: "transparent",
                border: 0,
                cursor: "pointer",
                padding: 2,
                borderRadius: 6,
                color: "var(--ink-mute)",
                display: "flex",
                alignItems: "center",
              }}>
                <X style={{ width: 13, height: 13 }} strokeWidth={2} />
              </button>
            </PopoverPrimitive.Close>
          </div>

          {/* List */}
          <div style={{ maxHeight: 420, overflowY: "auto" }}>
            {loading ? (
              <div style={{ padding: "24px 14px", textAlign: "center", fontSize: 12.5, color: "var(--ink-mute)" }}>
                Loading…
              </div>
            ) : items.length === 0 ? (
              <div style={{ padding: "28px 14px", textAlign: "center" }}>
                <Bell style={{ width: 26, height: 26, color: "var(--ink-mute)", margin: "0 auto 10px" }} strokeWidth={1.5} />
                <div style={{ fontSize: 13, color: "var(--ink)", fontWeight: 600, marginBottom: 4 }}>
                  No notifications yet
                </div>
                <div style={{ fontSize: 12, color: "var(--ink-mute)" }}>
                  Add friends and interact with posts to get started.
                </div>
              </div>
            ) : (
              items.map((n, i) => (
                <div key={n.id}>
                  {i > 0 && (
                    <div style={{ height: "0.5px", background: "var(--hairline-soft)", margin: "0 14px" }} />
                  )}
                  <NotificationRow
                    n={n}
                    responded={n.type === "friend_request" && n.metadata?.friendship_id != null
                      ? respondedTo.has(n.metadata.friendship_id)
                      : false}
                    onRespond={handleRespond}
                  />
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div style={{ borderTop: "0.5px solid var(--hairline-soft)", padding: "8px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
            {items.length > 0 && (
              <button
                onClick={() => setOpen(false)}
                style={{
                  width: "100%", background: "transparent", border: 0, cursor: "pointer",
                  fontSize: 12.5, fontWeight: 600, color: "var(--primary)",
                  textAlign: "center", padding: "4px 0",
                }}
              >
                See all activity
              </button>
            )}
            {pushPermission !== null && pushPermission !== "granted" && (
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "7px 10px",
                background: "var(--surface-alt)",
                borderRadius: 9,
                border: "0.5px solid var(--hairline-soft)",
              }}>
                <BellOff style={{ width: 13, height: 13, color: "var(--ink-mute)", flexShrink: 0 }} strokeWidth={2} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  {pushPermission === "denied" ? (
                    <span style={{ fontSize: 11.5, color: "var(--ink-mute)", lineHeight: 1.3 }}>
                      Browser notifications blocked — enable in your browser settings.
                    </span>
                  ) : (
                    <button
                      onClick={handleEnablePush}
                      style={{
                        background: "transparent", border: 0, padding: 0, cursor: "pointer",
                        fontSize: 11.5, fontWeight: 600, color: "var(--primary)", textAlign: "left",
                      }}
                    >
                      Enable browser notifications
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
