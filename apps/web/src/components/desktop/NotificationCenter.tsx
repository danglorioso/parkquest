"use client";

import { useEffect, useRef, useState } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import {
  Bell, UserPlus, Heart, MessageCircle, MapPin, Sparkles, X,
} from "lucide-react";

type NotificationType = "follow" | "like" | "comment" | "post" | "system" | "recommendation";

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
  metadata: { message?: string; excerpt?: string } | null;
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
  follow:         { icon: UserPlus,      bg: "#EDE9FE", color: "#7C3AED" },
  like:           { icon: Heart,         bg: "#FEE2E2", color: "#DC2626" },
  comment:        { icon: MessageCircle, bg: "#D1FAE5", color: "#059669" },
  post:           { icon: MapPin,        bg: "#DCFCE7", color: "#16A34A" },
  system:         { icon: Sparkles,      bg: "#FEF3C7", color: "#D97706" },
  recommendation: { icon: Sparkles,      bg: "#FEF3C7", color: "#D97706" },
};

function notificationText(n: NotificationItem): string {
  const name = n.actor_display_name || n.actor_username || "Someone";
  switch (n.type) {
    case "follow":  return `${name} started following you`;
    case "like":    return `${name} liked your post`;
    case "comment": return `${name} commented on your post`;
    case "post":    return n.park_name ? `${name} posted at ${n.park_name}` : `${name} shared a new post`;
    default:        return n.metadata?.message ?? "New notification";
  }
}

function NotificationRow({ n }: { n: NotificationItem }) {
  const cfg = TYPE_CONFIG[n.type] ?? TYPE_CONFIG.system;
  const Icon = cfg.icon;
  const name = n.actor_display_name || n.actor_username || "Someone";

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
            "{n.metadata.excerpt}"
          </div>
        )}
        <div style={{ fontSize: 11, color: "var(--ink-mute)", marginTop: 3 }}>
          {timeAgo(n.created_at)}
        </div>
      </div>
    </div>
  );
}

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

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

  const newCount = items.filter((n) => !n.read).length;
  const displayCount = open ? newCount : unreadCount;

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          title="Notifications"
          style={{
            position: "relative",
            width: 36,
            height: 36,
            borderRadius: 10,
            background: open ? "rgba(31,61,46,0.06)" : "transparent",
            border: `0.5px solid ${open ? "var(--hairline)" : "var(--hairline-soft)"}`,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            transition: "background 120ms",
          }}
        >
          <Bell style={{ width: 15, height: 15, color: "var(--ink-soft)" }} strokeWidth={2} />
          {displayCount > 0 && (
            <div style={{
              position: "absolute",
              top: 4,
              right: 4,
              minWidth: 14,
              height: 14,
              borderRadius: 7,
              background: "#DC2626",
              border: "1.5px solid var(--bg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 8,
              fontWeight: 700,
              color: "#fff",
              fontFamily: "var(--font-mono)",
              padding: "0 3px",
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
                  Follow friends and interact with posts to get started.
                </div>
              </div>
            ) : (
              items.map((n, i) => (
                <div key={n.id}>
                  {i > 0 && (
                    <div style={{ height: "0.5px", background: "var(--hairline-soft)", margin: "0 14px" }} />
                  )}
                  <NotificationRow n={n} />
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {items.length > 0 && (
            <div style={{ borderTop: "0.5px solid var(--hairline-soft)", padding: "8px 14px" }}>
              <button
                onClick={() => setOpen(false)}
                style={{
                  width: "100%",
                  background: "transparent",
                  border: 0,
                  cursor: "pointer",
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: "var(--primary)",
                  textAlign: "center",
                  padding: "4px 0",
                }}
              >
                See all activity
              </button>
            </div>
          )}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
