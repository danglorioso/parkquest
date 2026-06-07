"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { Check, MapPin, X } from "lucide-react";

interface QuotedPost {
  id: number;
  caption: string | null;
  park_name: string | null;
  park_code: string | null;
  badge_id: string | null;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  photos: string[] | null;
}

export interface QuotePostModalProps {
  post: QuotedPost;
  onClose: () => void;
  onPost?: () => void;
}

function Avatar({ url, name, size = 28 }: { url?: string | null; name?: string | null; size?: number }) {
  const initials = (name ?? "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", overflow: "hidden", flexShrink: 0,
      background: "var(--surface-alt)", display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.32, fontWeight: 700, color: "var(--ink-mute)", fontFamily: "var(--font-mono)",
    }}>
      {url ? <img src={url} alt={name ?? ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials}
    </div>
  );
}

export function QuotePostModal({ post, onClose, onPost }: QuotePostModalProps) {
  const { user } = useUser();
  const [caption, setCaption] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const name = user?.fullName ?? user?.username ?? "Explorer";
  const originalName = post.display_name ?? post.username ?? "Explorer";
  const preview = post.photos?.[0] ?? null;

  const handleShare = async () => {
    if (!caption.trim()) return;
    setSubmitting(true);
    try {
      await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caption,
          quoted_post_id: post.id,
          park_code: post.park_code ?? null,
          photos: [],
        }),
      });
      onPost?.();
      onClose();
    } catch {
      // user can retry
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(0,0,0,0.55)", backdropFilter: "blur(12px)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={onClose}
    >
      <style>{`@keyframes pqQModal { from { transform: scale(0.95); opacity: 0 } to { transform: scale(1); opacity: 1 } }`}</style>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 520, background: "var(--surface)", borderRadius: 18,
          border: "0.5px solid var(--hairline)", boxShadow: "0 24px 60px rgba(0,0,0,0.4)",
          overflow: "hidden", animation: "pqQModal 200ms cubic-bezier(.2,.7,.3,1)",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "14px 18px", borderBottom: "0.5px solid var(--hairline-soft)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <Avatar url={user?.imageUrl} name={name} size={26} />
            <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)" }}>Quote post</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={onClose} style={{
              background: "transparent", border: "0.5px solid var(--hairline)",
              color: "var(--ink)", padding: "5px 12px", borderRadius: 8,
              cursor: "pointer", fontWeight: 700, fontSize: 12.5,
            }}>Cancel</button>
            <button
              onClick={handleShare}
              disabled={!caption.trim() || submitting}
              style={{
                background: "var(--primary)", border: "none", color: "#FFFBF1",
                padding: "5px 14px", borderRadius: 8,
                cursor: !caption.trim() || submitting ? "not-allowed" : "pointer",
                fontWeight: 700, fontSize: 12.5, display: "flex", alignItems: "center", gap: 5,
                opacity: !caption.trim() || submitting ? 0.55 : 1,
              }}
            >
              <Check size={13} strokeWidth={2.4} /> Share
            </button>
          </div>
        </div>

        {/* Caption area */}
        <div style={{ padding: "16px 18px 12px" }}>
          <textarea
            autoFocus
            value={caption}
            onChange={e => setCaption(e.target.value.slice(0, 500))}
            placeholder="Add your thoughts…"
            style={{
              width: "100%", minHeight: 100, resize: "none",
              background: "transparent", border: "none", outline: "none",
              fontSize: 15, color: "var(--ink)", lineHeight: 1.55,
              fontFamily: "var(--font-sans)", boxSizing: "border-box",
            }}
          />
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-mute)",
            letterSpacing: "0.5px", fontWeight: 600, textAlign: "right",
          }}>
            {caption.length} / 500
          </div>
        </div>

        {/* Quoted post preview */}
        <div style={{ padding: "0 18px 18px" }}>
          <div style={{
            border: "0.5px solid var(--hairline)", borderRadius: 12, overflow: "hidden",
            background: "var(--bg)",
          }}>
            {/* Photo strip */}
            {preview && (
              <img src={preview} alt="" style={{ width: "100%", height: 160, objectFit: "cover", display: "block" }} />
            )}
            <div style={{ padding: "10px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
                <Avatar url={post.avatar_url} name={originalName} size={20} />
                <div style={{ fontWeight: 700, fontSize: 12, color: "var(--ink)" }}>{originalName}</div>
                {post.username && (
                  <div style={{ fontSize: 11, color: "var(--ink-mute)" }}>@{post.username}</div>
                )}
              </div>
              {post.park_name && (
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 3, marginBottom: 5,
                  fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--primary)",
                  fontWeight: 700, letterSpacing: "0.4px",
                }}>
                  <MapPin size={10} strokeWidth={2.4} />
                  {post.park_name.toUpperCase()}
                </div>
              )}
              {post.caption && (
                <div style={{ fontSize: 12.5, color: "var(--ink)", lineHeight: 1.45 }}>
                  {post.caption.length > 140 ? post.caption.slice(0, 140) + "…" : post.caption}
                </div>
              )}
              {!post.caption && post.badge_id && (
                <div style={{ fontSize: 12.5, color: "var(--ink-mute)", fontStyle: "italic" }}>
                  Badge earned
                </div>
              )}
              {!post.caption && !post.badge_id && (
                <div style={{ fontSize: 12.5, color: "var(--ink-mute)", fontStyle: "italic" }}>
                  Park visit
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
