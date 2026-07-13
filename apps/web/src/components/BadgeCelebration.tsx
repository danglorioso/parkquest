"use client";

import { useId } from "react";

interface CelebrationBadge {
  name: string;
  description: string;
  emoji: string;
  tier: string;
  colors?: { fill: string; light: string } | null;
}

interface BadgeCelebrationProps {
  badge: CelebrationBadge;
  onClose: () => void;
  onShare?: (badge: CelebrationBadge) => void;
}

const TIERS: Record<string, { name: string; fill: string; light: string; glow: string }> = {
  bronze:    { name: "Bronze",    fill: "#B27339", light: "#D4A070", glow: "rgba(178,115,57,0.28)" },
  silver:    { name: "Silver",    fill: "#A8A39B", light: "#C5C0B8", glow: "rgba(168,163,155,0.30)" },
  gold:      { name: "Gold",      fill: "#D4A93F", light: "#EBC96A", glow: "rgba(212,169,63,0.32)" },
  platinum:  { name: "Platinum",  fill: "#6E97A3", light: "#95B8C2", glow: "rgba(110,151,163,0.32)" },
  legendary: { name: "Legendary", fill: "#8B5DBF", light: "#B08ADE", glow: "rgba(139,93,191,0.36)" },
};

const CONFETTI_COLORS = ["#C56B3D", "#D89A3A", "#2F7A4A", "#FFFBF1", "#6E97A3"];

/** "#B27339" + 0.3 → "rgba(178,115,57,0.3)" for the glow behind custom-colored badges. */
function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

export function BadgeCelebration({ badge, onClose, onShare }: BadgeCelebrationProps) {
  const id = useId().replace(/:/g, "");
  const tier = TIERS[badge.tier] ?? TIERS.bronze;
  const t = badge.colors
    ? { ...tier, fill: badge.colors.fill, light: badge.colors.light, glow: hexToRgba(badge.colors.fill, 0.3) }
    : tier;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(13,12,10,0.86)",
        backdropFilter: "blur(12px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        animation: "pqCelBg 220ms ease",
      }}
      onClick={onClose}
    >
      <style>{`
        @keyframes pqCelBg    { from { opacity: 0 } to { opacity: 1 } }
        @keyframes pqBadgeIn  { 0%{transform:scale(0.2) rotate(-30deg);opacity:0} 60%{transform:scale(1.15) rotate(8deg);opacity:1} 100%{transform:scale(1) rotate(0deg);opacity:1} }
        @keyframes pqRays     { 0%{transform:scale(0.4) rotate(0deg);opacity:0} 40%{opacity:0.7} 100%{transform:scale(1.6) rotate(360deg);opacity:0} }
        @keyframes pqTextIn   { from{transform:translateY(12px);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes pqConfetti { 0%{transform:translateY(-20px) rotate(0deg);opacity:1} 100%{transform:translateY(480px) rotate(720deg);opacity:0} }
      `}</style>

      {/* Confetti */}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        {Array.from({ length: 32 }).map((_, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              top: "15%",
              left: `${(i * 13) % 100}%`,
              width: i % 3 === 0 ? 10 : 7,
              height: i % 3 === 0 ? 7 : 12,
              background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
              borderRadius: i % 4 === 0 ? "50%" : 2,
              animation: `pqConfetti ${1200 + (i * 20) % 600}ms ${(i * 30) % 600}ms ease-in forwards`,
            }}
          />
        ))}
      </div>

      {/* Spinning rays */}
      <div
        style={{
          position: "absolute",
          width: 360,
          height: 360,
          borderRadius: "50%",
          background: `conic-gradient(${t.fill}88, transparent 18deg, ${t.fill}88 36deg, transparent 54deg, ${t.fill}88 72deg, transparent 90deg, ${t.fill}88 108deg, transparent 126deg, ${t.fill}88 144deg, transparent 162deg, ${t.fill}88 180deg, transparent 198deg, ${t.fill}88 216deg, transparent 234deg, ${t.fill}88 252deg, transparent 270deg, ${t.fill}88 288deg, transparent 306deg, ${t.fill}88 324deg, transparent 342deg, ${t.fill}88 360deg)`,
          opacity: 0.55,
          animation: "pqRays 2400ms ease-out forwards",
        }}
      />

      {/* Content */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ position: "relative", textAlign: "center", padding: 32 }}
      >
        {/* Tier label */}
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "2.4px",
            color: t.fill,
            marginBottom: 10,
            animation: "pqTextIn 400ms 200ms both",
          }}
        >
          BADGE UNLOCKED · {t.name.toUpperCase()}
        </div>

        {/* Badge patch (animated) */}
        <div style={{ animation: "pqBadgeIn 700ms cubic-bezier(.34,1.56,.64,1) both", display: "inline-block" }}>
          <svg width="160" height="160" viewBox="0 0 100 100">
            <defs>
              <radialGradient id={`celg${id}`} cx="38%" cy="32%" r="75%">
                <stop offset="0%" stopColor={t.light} />
                <stop offset="100%" stopColor={t.fill} />
              </radialGradient>
            </defs>
            <circle cx="50" cy="50" r="49" fill={`url(#celg${id})`} />
            <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,251,241,0.55)" strokeWidth="1.5" />
            <circle cx="50" cy="50" r="40.5" fill="none" stroke="rgba(255,251,241,0.32)" strokeWidth="1" strokeDasharray="4 3" />
            <text x="50" y="17" textAnchor="middle" fontSize="6" fill="rgba(255,251,241,0.65)" fontFamily="serif">★ ★ ★</text>
            <text x="50" y="91" textAnchor="middle" fontSize="6" fill="rgba(255,251,241,0.65)" fontFamily="serif">★ ★ ★</text>
            <text x="50" y="62" textAnchor="middle" fontSize="32">
              {badge.emoji}
            </text>
          </svg>
        </div>

        {/* Badge name */}
        <div
          style={{
            fontWeight: 800,
            fontSize: 32,
            color: "#FFFBF1",
            letterSpacing: -0.6,
            marginTop: 18,
            animation: "pqTextIn 400ms 600ms both",
          }}
        >
          {badge.name}
        </div>

        {/* Description */}
        <div
          style={{
            fontSize: 14,
            color: "rgba(255,251,241,0.7)",
            maxWidth: 300,
            margin: "8px auto 0",
            lineHeight: 1.5,
            animation: "pqTextIn 400ms 800ms both",
          }}
        >
          {badge.description}
        </div>

        {/* CTAs */}
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 28, animation: "pqTextIn 400ms 1000ms both" }}>
          {onShare && (
            <button
              onClick={() => { onShare(badge); onClose(); }}
              style={{
                background: "#FFFBF1",
                color: "#1B1A16",
                border: 0,
                padding: "12px 24px",
                borderRadius: 100,
                cursor: "pointer",
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              Share to feed
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              color: "rgba(255,251,241,0.7)",
              border: "1.5px solid rgba(255,251,241,0.35)",
              padding: "12px 24px",
              borderRadius: 100,
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            {onShare ? "Maybe later" : "Dismiss"}
          </button>
        </div>
      </div>
    </div>
  );
}
