import { useEffect, useId, useRef, useState } from 'react';
import { Animated, Easing, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Defs, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { BADGE_MAP, ensureBadgeDefs } from '@/lib/badges';

// Shared rich badge detail modal — the dark animated card from the badges
// screen, reused by the profile preview row and other users' profiles so a
// badge tap looks identical everywhere.

// ── Tier config — matches web exactly ────────────────────────────────────────

const TIERS: Record<string, { name: string; fill: string; light: string; glow: string }> = {
  bronze:    { name: 'Bronze',    fill: '#B27339', light: '#D4A070', glow: 'rgba(178,115,57,0.28)'  },
  silver:    { name: 'Silver',    fill: '#A8A39B', light: '#C5C0B8', glow: 'rgba(168,163,155,0.30)' },
  gold:      { name: 'Gold',      fill: '#D4A93F', light: '#EBC96A', glow: 'rgba(212,169,63,0.32)'  },
  platinum:  { name: 'Platinum',  fill: '#6E97A3', light: '#95B8C2', glow: 'rgba(110,151,163,0.32)' },
  legendary: { name: 'Legendary', fill: '#8B5DBF', light: '#B08ADE', glow: 'rgba(139,93,191,0.36)'  },
};

export type BadgeColorPair = { fill: string; light: string };

/** '#B27339' + 0.3 → 'rgba(178,115,57,0.3)' */
function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** Tier palette, with the badge's admin-set colors layered on top when present. */
export function badgeTheme(tier: string, colors?: BadgeColorPair | null) {
  const t = TIERS[tier] ?? TIERS.bronze;
  return colors
    ? { ...t, fill: colors.fill, light: colors.light, glow: hexToRgba(colors.fill, 0.3) }
    : t;
}

// ── BadgePatch — same SVG as web: radial gradient fill, rings, stars ──────────

export function BadgePatch({
  emoji, tier, colors, size = 72, earned,
}: { emoji: string; tier: string; colors?: BadgeColorPair | null; size?: number; earned: boolean }) {
  const id = useId().replace(/:/g, '');
  const t = badgeTheme(tier, colors);

  return (
    <View style={{ width: size, height: size, opacity: earned ? 1 : 0.5 }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id={`g${id}`} cx="38%" cy="32%" r="75%">
            <Stop offset="0%" stopColor={t.light} />
            <Stop offset="100%" stopColor={t.fill} />
          </RadialGradient>
        </Defs>
        <Circle cx="50" cy="50" r="49" fill={`url(#g${id})`} />
        <Circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,251,241,0.55)" strokeWidth={1.5} />
        <Circle cx="50" cy="50" r="40.5" fill="none" stroke="rgba(255,251,241,0.32)" strokeWidth={1} strokeDasharray="4 3" />
        <SvgText x="50" y="17" textAnchor="middle" fontSize="6" fill="rgba(255,251,241,0.65)">★ ★ ★</SvgText>
        <SvgText x="50" y="91" textAnchor="middle" fontSize="6" fill="rgba(255,251,241,0.65)">★ ★ ★</SvgText>
      </Svg>
      {/* Emoji — RN Text overlay; SVG <Text> emoji rendering is unreliable on Android */}
      <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: size * 0.38, lineHeight: size * 0.48 }}>{emoji}</Text>
      </View>
    </View>
  );
}

// ── TierGlow — soft radial fade, replicates web's CSS radial-gradient ─────────
// cx/rx are fractions of measured width, cy/ry of height; fade = transparent stop.
// Needs explicit userSpaceOnUse coords + numeric stopOpacity — react-native-svg
// renders percentage gradients with hard edges and drops rgba() alpha in stops.

export function TierGlow({
  glow, cx, cy, rx, ry, fade,
}: { glow: string; cx: number; cy: number; rx: number; ry: number; fade: number }) {
  const id = useId().replace(/:/g, '');
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const rgb   = glow.match(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  const color = rgb ? `rgb(${rgb[1]},${rgb[2]},${rgb[3]})` : glow;
  const alpha = Number(glow.match(/[\d.]+(?=\s*\)$)/)?.[0] ?? 0.3);

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      onLayout={e => {
        const { width, height } = e.nativeEvent.layout;
        setDims({ w: width, h: height });
      }}
    >
      {dims.w > 0 && dims.h > 0 && (
        <Svg width={dims.w} height={dims.h}>
          <Defs>
            <RadialGradient
              id={`tg${id}`}
              gradientUnits="userSpaceOnUse"
              cx={dims.w * cx} cy={dims.h * cy}
              rx={dims.w * rx} ry={dims.h * ry}
            >
              <Stop offset="0"    stopColor={color} stopOpacity={alpha} />
              <Stop offset={fade} stopColor={color} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={dims.w} height={dims.h} fill={`url(#tg${id})`} />
        </Svg>
      )}
    </View>
  );
}

// ── BadgeDetailModal ──────────────────────────────────────────────────────────

export interface BadgeDetailData {
  id: string;
  name: string;
  emoji: string;
  tier: string;
  colors?: BadgeColorPair | null;
  earned: boolean;
  earned_at: string | null;
  /** Optional — when missing (profile preview rows), falls back to the
      server badge defs so "how to earn" text still shows. */
  description?: string | null;
  progress_current?: number | null;
  progress_target?: number | null;
}

export function BadgeDetailModal({ badge, onClose, onShare }: {
  badge: BadgeDetailData;
  onClose: () => void;
  /** When provided (badges screen), earned badges get a "Share to feed" CTA. */
  onShare?: (badge: BadgeDetailData) => void;
}) {
  const t = badgeTheme(badge.tier, badge.colors);

  // Callers that only have a summary row (id/name/emoji) pull the full
  // description from the shared server defs.
  const [fallbackDesc, setFallbackDesc] = useState(() => BADGE_MAP.get(badge.id)?.description ?? null);
  useEffect(() => {
    if (badge.description) return;
    let active = true;
    ensureBadgeDefs().then(() => {
      if (active) setFallbackDesc(BADGE_MAP.get(badge.id)?.description ?? null);
    });
    return () => { active = false; };
  }, [badge.id, badge.description]);
  const description = badge.description ?? fallbackDesc;

  const pct = badge.progress_target && badge.progress_target > 0
    ? Math.min(100, Math.round(((badge.progress_current ?? 0) / badge.progress_target) * 100))
    : 0;
  const earnedDateStr = badge.earned_at
    ? new Date(badge.earned_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  // Entrance — matches web: card scales in, patch pops with overshoot
  const cardAnim  = useRef(new Animated.Value(0)).current;
  const patchAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(cardAnim, {
        toValue: 1, duration: 240,
        easing: Easing.bezier(0.2, 0.8, 0.3, 1), useNativeDriver: true,
      }),
      Animated.timing(patchAnim, {
        toValue: 1, duration: 400, delay: 80,
        easing: Easing.bezier(0.34, 1.4, 0.64, 1), useNativeDriver: true,
      }),
    ]).start();
  }, [cardAnim, patchAnim]);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View style={[
          styles.modal,
          { borderColor: t.fill + '55' },
          {
            opacity: cardAnim,
            transform: [
              { scale:      cardAnim.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) },
              { translateY: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
            ],
          },
        ]}>
          {/* Tier glow — matches web:
              radial-gradient(120% 80% at 50% -10%, glow 0%, transparent 60%) */}
          <TierGlow glow={t.glow} cx={0.5} cy={-0.1} rx={1.2} ry={0.8} fade={0.6} />

          {/* Close */}
          <TouchableOpacity onPress={onClose} style={styles.modalClose}>
            <Ionicons name="close" size={16} color="rgba(255,251,241,0.55)" />
          </TouchableOpacity>

          {/* Patch — 120px, matches web */}
          <Animated.View style={{
            position: 'relative', alignItems: 'center', paddingTop: 8,
            opacity: patchAnim,
            transform: [
              { scale:      patchAnim.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) },
              { translateY: patchAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
            ],
          }}>
            <BadgePatch emoji={badge.emoji} tier={badge.tier} colors={badge.colors} size={120} earned={badge.earned} />
          </Animated.View>

          {/* Name + description */}
          <Text style={styles.modalName}>{badge.name}</Text>
          {description ? <Text style={styles.modalDesc}>{description}</Text> : null}

          {/* Progress or earned date */}
          {badge.earned && earnedDateStr ? (
            <View style={styles.earnedRow}>
              <Text style={styles.earnedText}>✦ Earned {earnedDateStr}</Text>
            </View>
          ) : badge.progress_current != null && badge.progress_target != null ? (
            <View style={{ width: '100%', marginTop: 20, paddingHorizontal: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: 'rgba(255,251,241,0.4)', letterSpacing: 0.6 }}>
                  PROGRESS
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: t.fill, letterSpacing: 0.4 }}>
                  {badge.progress_current} / {badge.progress_target}
                </Text>
              </View>
              <View style={{ height: 5, backgroundColor: 'rgba(255,251,241,0.10)', borderRadius: 3, overflow: 'hidden' }}>
                <View style={{ height: '100%', width: `${pct}%`, backgroundColor: t.fill, borderRadius: 3 }} />
              </View>
            </View>
          ) : null}

          {/* Share to feed — earned badges only, matches web */}
          {badge.earned && onShare && (
            <TouchableOpacity
              onPress={() => onShare(badge)}
              activeOpacity={0.8}
              style={styles.shareCta}
            >
              <Ionicons name="share-social-outline" size={14} color="#1B1A16" />
              <Text style={styles.shareCtaText}>Share to feed</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(13,12,10,0.92)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  modal: {
    backgroundColor: 'rgba(22,22,18,0.97)',
    borderRadius: 20, borderWidth: 0.5,
    padding: 32, paddingTop: 36,
    width: '100%', maxWidth: 380,
    alignItems: 'center', overflow: 'hidden', position: 'relative',
    // Matches web: 0 32px 80px rgba(0,0,0,0.5)
    shadowColor: '#000', shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.5, shadowRadius: 40, elevation: 24,
  },
  modalClose: {
    position: 'absolute', top: 14, right: 14, zIndex: 10,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255,251,241,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  modalName: {
    fontSize: 26, fontWeight: '800', color: '#FFFBF1', letterSpacing: -0.5,
    marginTop: 12, textAlign: 'center',
  },
  modalDesc: {
    fontSize: 13.5, color: 'rgba(255,251,241,0.65)',
    marginTop: 8, textAlign: 'center', lineHeight: 19,
  },
  earnedRow: {
    marginTop: 20, backgroundColor: 'rgba(255,251,241,0.07)',
    borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8,
  },
  earnedText: {
    fontSize: 13, fontWeight: '600', color: 'rgba(255,251,241,0.55)', letterSpacing: 0.6,
  },
  shareCta: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: '#FFFBF1', borderRadius: 100,
    paddingHorizontal: 24, paddingVertical: 10,
    marginTop: 20,
  },
  shareCtaText: {
    fontSize: 13, fontWeight: '700', color: '#1B1A16',
  },
});
