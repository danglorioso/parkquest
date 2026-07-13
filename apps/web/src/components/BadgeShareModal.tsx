"use client";

import { useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { Check, Globe, Users, Lock } from "lucide-react";
import { useToast } from "@/components/ToastProvider";

const AUDIENCE_OPTS = [
  { value: "friends", label: "Friends", icon: Users },
  { value: "public",  label: "Public",  icon: Globe  },
  { value: "private", label: "Only me", icon: Lock   },
] as const;
type Audience = "friends" | "public" | "private";

interface CelebrationBadge {
  id?: string;
  name: string;
  description: string;
  emoji: string;
  tier: string;
  colors?: { fill: string; light: string } | null;
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
  const { toast } = useToast();
  const [caption, setCaption] = useState("");
  const [audience, setAudience] = useState<Audience>("friends");
  const [submitting, setSubmitting] = useState(false);
  const [alreadyShared, setAlreadyShared] = useState(false);
  const tier = TIERS[badge.tier] ?? TIERS.bronze;
  const t = badge.colors ? { ...tier, ...badge.colors } : tier;
  const badgeKey = badge.id ?? badge.name;

  useEffect(() => {
    if (!user) return;
    fetch(`/api/posts?userId=${user.id}&badgeId=${encodeURIComponent(badgeKey)}&limit=1`)
      .then(r => r.json())
      .then((rows: unknown[]) => { if (rows.length > 0) setAlreadyShared(true); })
      .catch(() => {});
  }, [user, badgeKey]);

  const handleShare = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          badge_id: badgeKey,
          caption: caption.trim() || null,
          visibility: audience,
          photos: [],
        }),
      });
      if (res.status === 409) { setAlreadyShared(true); return; }
      onPost?.();
      onClose();
      toast(`${badge.emoji} Badge shared to feed`);
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
              disabled={submitting || alreadyShared}
              title={alreadyShared ? "Already shared to feed" : undefined}
              style={{
                background: alreadyShared ? "var(--surface-alt)" : "var(--primary)",
                border: alreadyShared ? "0.5px solid var(--hairline)" : "none",
                color: alreadyShared ? "var(--ink-mute)" : "#FFFBF1",
                padding: "5px 14px", borderRadius: 8,
                cursor: submitting || alreadyShared ? "not-allowed" : "pointer",
                fontWeight: 700, fontSize: 12.5, display: "flex", alignItems: "center", gap: 5,
                opacity: submitting ? 0.55 : 1,
              }}
            >
              <Check size={13} strokeWidth={2.4} />
              {alreadyShared ? "Already shared" : "Share"}
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

        {/* Visibility picker */}
        <div style={{ padding: "14px 18px 0", display: "flex", gap: 6 }}>
          {AUDIENCE_OPTS.map(opt => {
            const Icon = opt.icon;
            const active = audience === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setAudience(opt.value)}
                style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                  padding: "7px 0", borderRadius: 8, cursor: "pointer",
                  border: active ? "1.5px solid var(--primary)" : "0.5px solid var(--hairline)",
                  background: active ? "var(--primary)18" : "transparent",
                  color: active ? "var(--primary)" : "var(--ink-mute)",
                  fontWeight: 700, fontSize: 12, fontFamily: "var(--font-sans)",
                  transition: "all 120ms ease",
                }}
              >
                <Icon size={13} strokeWidth={2.2} />
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Caption */}
        <div style={{ padding: "12px 18px 4px" }}>
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
