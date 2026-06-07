"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { Check } from "lucide-react";

interface CelebrationBadge {
  id?: string;
  name: string;
  description: string;
  emoji: string;
  tier: string;
}

const TIERS: Record<string, { fill: string; light: string; label: string }> = {
  bronze:    { fill: "#B27339", light: "#D4A070", label: "Bronze" },
  silver:    { fill: "#A8A39B", light: "#C5C0B8", label: "Silver" },
  gold:      { fill: "#D4A93F", light: "#EBC96A", label: "Gold" },
  platinum:  { fill: "#6E97A3", light: "#95B8C2", label: "Platinum" },
  legendary: { fill: "#8B5DBF", light: "#B08ADE", label: "Legendary" },
};

export interface BadgeShareModalProps {
  badge: CelebrationBadge;
  onClose: () => void;
  onPost?: () => void;
}

export function BadgeShareModal({ badge, onClose, onPost }: BadgeShareModalProps) {
  const { user } = useUser();
  const [caption, setCaption] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const t = TIERS[badge.tier] ?? TIERS.bronze;
  const name = user?.fullName ?? user?.username ?? "Explorer";

  const handleShare = async () => {
    setSubmitting(true);
    try {
      await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          badge_id: badge.id ?? badge.name,
          caption: caption.trim() || null,
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
        position: "fixed", inset: 0, zIndex: 110,
        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(14px)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={onClose}
    >
      <style>{`@keyframes pqBSModal { from { transform: scale(0.95); opacity: 0 } to { transform: scale(1); opacity: 1 } }`}</style>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 440, background: "var(--surface)", borderRadius: 18,
          border: "0.5px solid var(--hairline)", boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
          overflow: "hidden", animation: "pqBSModal 200ms cubic-bezier(.2,.7,.3,1)",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "14px 18px", borderBottom: "0.5px solid var(--hairline-soft)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)" }}>Share badge</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={onClose} style={{
              background: "transparent", border: "0.5px solid var(--hairline)",
              color: "var(--ink)", padding: "5px 12px", borderRadius: 8,
              cursor: "pointer", fontWeight: 700, fontSize: 12.5,
            }}>Cancel</button>
            <button
              onClick={handleShare}
              disabled={submitting}
              style={{
                background: "var(--primary)", border: "none", color: "#FFFBF1",
                padding: "5px 14px", borderRadius: 8,
                cursor: submitting ? "not-allowed" : "pointer",
                fontWeight: 700, fontSize: 12.5, display: "flex", alignItems: "center", gap: 5,
                opacity: submitting ? 0.55 : 1,
              }}
            >
              <Check size={13} strokeWidth={2.4} /> Share
            </button>
          </div>
        </div>

        {/* Badge preview */}
        <div style={{
          margin: "16px 18px 0",
          padding: "14px 16px",
          borderRadius: 12,
          background: `linear-gradient(140deg, ${t.fill}22 0%, ${t.light}18 100%)`,
          border: `0.5px solid ${t.fill}44`,
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}>
          <div style={{
            width: 52, height: 52, borderRadius: "50%", flexShrink: 0,
            background: `linear-gradient(140deg, ${t.light} 0%, ${t.fill} 100%)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 24,
            boxShadow: `0 4px 16px ${t.fill}55`,
          }}>
            {badge.emoji}
          </div>
          <div>
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "1.4px",
              color: t.fill, fontWeight: 700, marginBottom: 2,
            }}>
              BADGE EARNED · {t.label.toUpperCase()}
            </div>
            <div style={{ fontWeight: 800, fontSize: 16, color: "var(--ink)", letterSpacing: -0.3 }}>
              {badge.name}
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-mute)", marginTop: 2 }}>
              {badge.description}
            </div>
          </div>
        </div>

        {/* Caption */}
        <div style={{ padding: "14px 18px 4px" }}>
          <textarea
            autoFocus
            value={caption}
            onChange={e => setCaption(e.target.value.slice(0, 500))}
            placeholder="Add a note… (optional)"
            style={{
              width: "100%", minHeight: 80, resize: "none",
              background: "var(--bg)", border: "0.5px solid var(--hairline)",
              borderRadius: 10, padding: "10px 12px", outline: "none",
              fontSize: 14, color: "var(--ink)", lineHeight: 1.5,
              fontFamily: "var(--font-sans)", boxSizing: "border-box",
            }}
          />
        </div>
        <div style={{ padding: "4px 18px 18px", display: "flex", justifyContent: "flex-end" }}>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-mute)",
            letterSpacing: "0.5px", fontWeight: 600,
          }}>{caption.length} / 500</span>
        </div>
      </div>
    </div>
  );
}
