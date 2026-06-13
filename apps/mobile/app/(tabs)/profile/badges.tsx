import {
  ActivityIndicator, Alert, Animated, Dimensions, Easing, FlatList, KeyboardAvoidingView, Modal,
  Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Defs, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';

// ── Design tokens ─────────────────────────────────────────────────────────────

const C = {
  bg:         '#F2EBDB',
  surface:    '#FFFBF1',
  surfaceAlt: '#F7F0DE',
  ink:        '#1B1A16',
  inkSoft:    '#3C3A33',
  inkMute:    '#7A746A',
  hairline:   'rgba(27,26,22,0.10)',
  primary:    '#1F3D2E',
};

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
const SW   = Dimensions.get('window').width;
const H_PAD = 16;
const CELL_GAP = 10;
const CELL_W = (SW - H_PAD * 2 - CELL_GAP * 2) / 3;

// ── Tier config — matches web exactly ────────────────────────────────────────

const TIERS: Record<string, { name: string; fill: string; light: string; glow: string }> = {
  bronze:    { name: 'Bronze',    fill: '#B27339', light: '#D4A070', glow: 'rgba(178,115,57,0.28)'  },
  silver:    { name: 'Silver',    fill: '#A8A39B', light: '#C5C0B8', glow: 'rgba(168,163,155,0.30)' },
  gold:      { name: 'Gold',      fill: '#D4A93F', light: '#EBC96A', glow: 'rgba(212,169,63,0.32)'  },
  platinum:  { name: 'Platinum',  fill: '#6E97A3', light: '#95B8C2', glow: 'rgba(110,151,163,0.32)' },
  legendary: { name: 'Legendary', fill: '#8B5DBF', light: '#B08ADE', glow: 'rgba(139,93,191,0.36)'  },
};
const TIER_ORDER = ['bronze', 'silver', 'gold', 'platinum', 'legendary'] as const;

// ── Types ─────────────────────────────────────────────────────────────────────

interface BadgeData {
  id: string;
  name: string;
  description: string;
  emoji: string;
  tier: string;
  earned: boolean;
  earned_at: string | null;
  progress_current: number | null;
  progress_target: number | null;
}

type TierFilter = 'all' | typeof TIER_ORDER[number];

// FlatList row union
type Row =
  | { _type: 'pageHeader' }
  | { _type: 'filterBar' }
  | { _type: 'featured'; badge: BadgeData }
  | { _type: 'sectionHead'; kicker: string; title: string }
  | { _type: 'badgeRow'; items: BadgeData[] }
  | { _type: 'empty' };

// ── BadgePatch — same SVG as web: radial gradient fill, rings, stars ──────────

function BadgePatch({
  emoji, tier, size = 72, earned,
}: { emoji: string; tier: string; size?: number; earned: boolean }) {
  const id = useId().replace(/:/g, '');
  const t = TIERS[tier] ?? TIERS.bronze;

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

function TierGlow({
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

// ── ProgressBar ───────────────────────────────────────────────────────────────

function ProgressBar({ current, target, fill }: { current: number; target: number; fill: string }) {
  const pct = Math.min(100, Math.round((current / target) * 100));
  return (
    <View style={{ width: '100%', paddingHorizontal: 6 }}>
      <View style={{ height: 3.5, backgroundColor: C.surfaceAlt, borderRadius: 2, overflow: 'hidden' }}>
        <View style={{ height: '100%', width: `${pct}%`, backgroundColor: fill, borderRadius: 2 }} />
      </View>
      <Text style={{ fontSize: 9.5, fontWeight: '600', color: C.inkMute, marginTop: 4, textAlign: 'center', letterSpacing: 0.4 }}>
        {current} / {target}
      </Text>
    </View>
  );
}

// ── BadgeCell ─────────────────────────────────────────────────────────────────

function BadgeCell({ badge, onPress }: { badge: BadgeData; onPress: () => void }) {
  const t = TIERS[badge.tier] ?? TIERS.bronze;
  const earnedDateStr = badge.earned_at
    ? new Date(badge.earned_at)
        .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        .toUpperCase()
    : null;
  const pct = badge.progress_target && badge.progress_target > 0
    ? Math.min(100, Math.round(((badge.progress_current ?? 0) / badge.progress_target) * 100))
    : 0;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[styles.cell, { width: CELL_W }]}
    >
      {/* Radial glow from top — earned cards only, matches web:
          radial-gradient(140% 100% at 50% -20%, glow 0%, transparent 60%) */}
      {badge.earned && (
        <TierGlow glow={t.glow} cx={0.5} cy={-0.2} rx={1.4} ry={1.0} fade={0.6} />
      )}

      <BadgePatch emoji={badge.emoji} tier={badge.tier} size={72} earned={badge.earned} />

      {/* Badge name */}
      <Text
        style={[styles.cellName, !badge.earned && { color: C.inkMute }]}
        numberOfLines={2}
      >
        {badge.name}
      </Text>

      {/* Tier label — full name, inkMute, matches web */}
      <Text style={styles.cellTier}>{t.name}</Text>

      {/* Earned date or progress bar */}
      {badge.earned && earnedDateStr ? (
        <Text style={styles.cellDate}>{earnedDateStr}</Text>
      ) : badge.progress_current != null && badge.progress_target != null ? (
        <ProgressBar current={badge.progress_current} target={badge.progress_target} fill={t.fill} />
      ) : null}
    </TouchableOpacity>
  );
}

// ── FeaturedCard ──────────────────────────────────────────────────────────────

function FeaturedCard({ badge, onPress, onShare }: { badge: BadgeData; onPress: () => void; onShare: () => void }) {
  const t = TIERS[badge.tier] ?? TIERS.bronze;
  const dateStr = badge.earned_at
    ? new Date(badge.earned_at)
        .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        .toUpperCase()
    : 'RECENTLY';

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.featured}>
      {/* Tier glow from top-left — matches web:
          radial-gradient(120% 80% at 20% 0%, glow 0%, transparent 55%) */}
      <TierGlow glow={t.glow} cx={0.2} cy={0} rx={1.2} ry={0.8} fade={0.55} />
      <View style={{ position: 'relative' }}>
        <BadgePatch emoji={badge.emoji} tier={badge.tier} size={108} earned />
      </View>
      <View style={{ flex: 1, gap: 5, position: 'relative' }}>
        <Text style={styles.featuredKicker}>
          LATEST UNLOCK · {dateStr} · {t.name.toUpperCase()}
        </Text>
        <Text style={styles.featuredName}>{badge.name}</Text>
        <Text style={styles.featuredDesc} numberOfLines={2}>{badge.description}</Text>
        <TouchableOpacity onPress={onShare} activeOpacity={0.7} style={styles.featuredShare}>
          <Ionicons name="share-social-outline" size={13} color={C.ink} />
          <Text style={styles.featuredShareText}>Share to feed</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

// ── BadgeDetailModal ──────────────────────────────────────────────────────────

function BadgeDetailModal({ badge, onClose, onShare }: { badge: BadgeData; onClose: () => void; onShare: (badge: BadgeData) => void }) {
  const t = TIERS[badge.tier] ?? TIERS.bronze;
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
            <BadgePatch emoji={badge.emoji} tier={badge.tier} size={120} earned={badge.earned} />
          </Animated.View>

          {/* Tier pill */}
          <View style={[styles.tierPill, { backgroundColor: t.fill + '22' }]}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.fill }} />
            <Text style={[styles.tierPillText, { color: t.fill }]}>{t.name.toUpperCase()} TIER</Text>
          </View>

          {/* Name + description */}
          <Text style={styles.modalName}>{badge.name}</Text>
          <Text style={styles.modalDesc}>{badge.description}</Text>

          {/* Progress or earned date */}
          {badge.earned && earnedDateStr ? (
            <View style={styles.earnedRow}>
              <Text style={styles.earnedText}>✦ Earned {earnedDateStr}</Text>
            </View>
          ) : badge.progress_current != null && badge.progress_target != null ? (
            <View style={{ width: '100%', marginTop: 20, paddingHorizontal: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ fontSize: 10, fontWeight: '600', color: 'rgba(255,251,241,0.4)', letterSpacing: 0.6 }}>
                  PROGRESS
                </Text>
                <Text style={{ fontSize: 10, fontWeight: '700', color: t.fill, letterSpacing: 0.4 }}>
                  {badge.progress_current} / {badge.progress_target}
                </Text>
              </View>
              <View style={{ height: 5, backgroundColor: 'rgba(255,251,241,0.10)', borderRadius: 3, overflow: 'hidden' }}>
                <View style={{ height: '100%', width: `${pct}%`, backgroundColor: t.fill, borderRadius: 3 }} />
              </View>
            </View>
          ) : null}

          {/* Share to feed — earned badges only, matches web */}
          {badge.earned && (
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

// ── BadgeShareSheet — share badge to feed, one time, matches web modal ────────

const AUDIENCE_OPTS = [
  { value: 'friends', label: 'Friends', icon: 'people-outline' },
  { value: 'public',  label: 'Public',  icon: 'globe-outline'  },
  { value: 'private', label: 'Only me', icon: 'lock-closed-outline' },
] as const;
type Audience = typeof AUDIENCE_OPTS[number]['value'];

function BadgeShareSheet({ badge, onClose }: { badge: BadgeData; onClose: () => void }) {
  const { getToken, userId } = useAuth();
  const [caption, setCaption]             = useState('');
  const [audience, setAudience]           = useState<Audience>('friends');
  const [submitting, setSubmitting]       = useState(false);
  const [alreadyShared, setAlreadyShared] = useState(false);
  const t = TIERS[badge.tier] ?? TIERS.bronze;

  // One-time share: check if this badge was already posted
  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const tok = await getToken();
        if (!tok) return;
        const res = await fetch(
          `${BASE}/api/posts?userId=${userId}&badgeId=${encodeURIComponent(badge.id)}&limit=1`,
          { headers: { Authorization: `Bearer ${tok}` } }
        );
        if (res.ok) {
          const rows = await res.json();
          if (Array.isArray(rows) && rows.length > 0) setAlreadyShared(true);
        }
      } catch {}
    })();
    // getToken intentionally omitted — unstable identity re-runs this every render
  }, [userId, badge.id]);

  const handleShare = async () => {
    setSubmitting(true);
    try {
      const tok = await getToken();
      if (!tok) return;
      const res = await fetch(`${BASE}/api/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({
          badge_id: badge.id,
          caption: caption.trim() || null,
          visibility: audience,
          photos: [],
        }),
      });
      if (res.status === 409) { setAlreadyShared(true); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onClose();
      Alert.alert(`${badge.emoji} Badge shared to feed`);
    } catch {
      Alert.alert('Something went wrong', 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.shareOverlay}
      >
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.shareModal}>
          {/* Header */}
          <View style={styles.shareHeader}>
            <Text style={styles.shareTitle}>Share badge</Text>
          </View>

          {/* Badge preview */}
          <View style={[styles.sharePreview, { borderColor: t.fill + '44', backgroundColor: t.fill + '18' }]}>
            <View style={[styles.sharePreviewPatch, { backgroundColor: t.fill }]}>
              <View style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: 32,
                borderRadius: 26, backgroundColor: t.light, opacity: 0.4,
              }} />
              <Text style={{ fontSize: 24 }}>{badge.emoji}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sharePreviewKicker, { color: t.fill }]}>
                BADGE EARNED · {t.name.toUpperCase()}
              </Text>
              <Text style={styles.sharePreviewName}>{badge.name}</Text>
              <Text style={styles.sharePreviewDesc} numberOfLines={2}>{badge.description}</Text>
            </View>
          </View>

          {/* Visibility picker */}
          <View style={styles.audienceRow}>
            {AUDIENCE_OPTS.map(opt => {
              const active = audience === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => setAudience(opt.value)}
                  activeOpacity={0.7}
                  style={[styles.audiencePill, active && styles.audiencePillActive]}
                >
                  <Ionicons name={opt.icon} size={13} color={active ? C.primary : C.inkMute} />
                  <Text style={[styles.audienceLabel, active && { color: C.primary }]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Caption */}
          <TextInput
            value={caption}
            onChangeText={txt => setCaption(txt.slice(0, 500))}
            placeholder="Add a note… (optional)"
            placeholderTextColor={C.inkMute}
            multiline
            style={styles.captionInput}
          />
          <Text style={styles.captionCount}>{caption.length} / 500</Text>

          {/* Action buttons — bottom right */}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <TouchableOpacity onPress={onClose} style={styles.shareCancelBtn} activeOpacity={0.7}>
              <Text style={styles.shareCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleShare}
              disabled={submitting || alreadyShared}
              activeOpacity={0.8}
              style={[
                styles.shareBtn,
                alreadyShared && styles.shareBtnDisabled,
                submitting && { opacity: 0.55 },
              ]}
            >
              {!alreadyShared && <Ionicons name="checkmark" size={13} color="#FFFBF1" />}
              <Text style={[styles.shareBtnText, alreadyShared && { color: C.inkMute }]}>
                {alreadyShared ? 'Already shared' : 'Share'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function BadgesScreen() {
  const { getToken } = useAuth();
  const [badges,        setBadges]        = useState<BadgeData[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(false);
  const [tierFilter,    setTierFilter]    = useState<TierFilter>('all');
  const [selectedBadge, setSelectedBadge] = useState<BadgeData | null>(null);
  const [sharingBadge,  setSharingBadge]  = useState<BadgeData | null>(null);

  // getToken is unstable across renders — dep arrays containing it loop forever
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const loadBadges = useCallback(async () => {
    const tok = await getTokenRef.current();
    if (!tok) return;
    setError(false);
    try {
      const res = await fetch(`${BASE}/api/badges`, { headers: { Authorization: `Bearer ${tok}` } });
      if (res.ok) {
        const { badges: data } = await res.json();
        const sorted = [...(data ?? [])].sort((a: BadgeData, b: BadgeData) => {
          const aT = a.earned_at ? new Date(a.earned_at).getTime() : 0;
          const bT = b.earned_at ? new Date(b.earned_at).getTime() : 0;
          return bT - aT;
        });
        setBadges(sorted);
      } else {
        setError(true);
      }
    } catch (e) {
      console.error('Badges load error:', e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadBadges(); }, [loadBadges]);

  const earned  = useMemo(() => badges.filter(b => b.earned), [badges]);
  const visible = useMemo(
    () => tierFilter === 'all' ? badges : badges.filter(b => b.tier === tierFilter),
    [badges, tierFilter]
  );
  const visibleEarned = useMemo(() => visible.filter(b => b.earned),  [visible]);
  const visibleLocked = useMemo(() => visible.filter(b => !b.earned), [visible]);
  const latestUnlock  = earned[0] ?? null;
  const earnedPct     = badges.length > 0 ? Math.round((earned.length / badges.length) * 100) : 0;

  // Build flat FlatList data — each item is one full-width row
  const data: Row[] = useMemo(() => {
    const rows: Row[] = [
      { _type: 'pageHeader' },
      { _type: 'filterBar' },
    ];

    if (latestUnlock && tierFilter === 'all') {
      rows.push({ _type: 'featured', badge: latestUnlock });
    }

    if (visibleEarned.length > 0) {
      rows.push({
        _type: 'sectionHead',
        kicker: `${visibleEarned.length} badge${visibleEarned.length !== 1 ? 's' : ''}`,
        title: 'Earned',
      });
      for (let i = 0; i < visibleEarned.length; i += 3) {
        rows.push({ _type: 'badgeRow', items: visibleEarned.slice(i, i + 3) });
      }
    }

    if (visibleLocked.length > 0) {
      rows.push({
        _type: 'sectionHead',
        kicker: `${visibleLocked.length} to unlock`,
        title: 'In progress',
      });
      for (let i = 0; i < visibleLocked.length; i += 3) {
        rows.push({ _type: 'badgeRow', items: visibleLocked.slice(i, i + 3) });
      }
    }

    if (!loading && badges.length === 0) {
      rows.push({ _type: 'empty' });
    }

    return rows;
  }, [latestUnlock, tierFilter, visibleEarned, visibleLocked, loading, badges.length]);

  const renderRow = useCallback(({ item }: { item: Row }) => {
    switch (item._type) {

      case 'pageHeader':
        return (
          <View style={styles.pageHeader}>
            <Text style={styles.headerKicker}>
              {earned.length} OF {badges.length} EARNED · {earnedPct}%
            </Text>
            <Text style={styles.headerTitle}>Badge collection</Text>
            <Text style={styles.headerSub}>Five tiers, every milestone marked. Earn them by exploring.</Text>
          </View>
        );

      case 'filterBar':
        return (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterScroll}
          >
            {(['all', ...TIER_ORDER] as TierFilter[]).map(f => {
              const active = tierFilter === f;
              const tier   = TIERS[f];
              const count  = f === 'all' ? badges.length : badges.filter(b => b.tier === f).length;
              return (
                <TouchableOpacity
                  key={f}
                  onPress={() => setTierFilter(f)}
                  activeOpacity={0.7}
                  style={[styles.filterPill, active && styles.filterPillActive]}
                >
                  {f !== 'all' && tier && (
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tier.fill }} />
                  )}
                  <Text style={[styles.filterLabel, active && styles.filterLabelActive]}>
                    {f === 'all' ? 'All tiers' : tier.name}
                  </Text>
                  <Text style={[styles.filterCount, active && { color: 'rgba(255,251,241,0.7)' }]}>
                    {count}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        );

      case 'featured':
        return (
          <View style={{ paddingHorizontal: H_PAD, marginBottom: 20 }}>
            <FeaturedCard
              badge={item.badge}
              onPress={() => setSelectedBadge(item.badge)}
              onShare={() => setSharingBadge(item.badge)}
            />
          </View>
        );

      case 'sectionHead':
        return (
          <View style={styles.sectionHead}>
            <Text style={styles.sectionKicker}>{item.kicker}</Text>
            <Text style={styles.sectionTitle}>{item.title}</Text>
          </View>
        );

      case 'badgeRow':
        return (
          <View style={styles.badgeRow}>
            {item.items.map(b => (
              <BadgeCell key={b.id} badge={b} onPress={() => setSelectedBadge(b)} />
            ))}
            {item.items.length < 3 &&
              Array.from({ length: 3 - item.items.length }, (_, i) => (
                <View key={`spacer-${i}`} style={{ width: CELL_W }} />
              ))
            }
          </View>
        );

      case 'empty':
        return (
          <View style={styles.emptyState}>
            <Text style={{ fontSize: 36, marginBottom: 12 }}>🏅</Text>
            <Text style={{ fontSize: 16, fontWeight: '700', color: C.ink }}>No badges yet</Text>
            <Text style={{ fontSize: 13, color: C.inkMute, textAlign: 'center', marginTop: 6, paddingHorizontal: 32 }}>
              Start exploring parks to unlock your first badge.
            </Text>
          </View>
        );
    }
  }, [
    earned.length, badges, earnedPct, tierFilter,
    visibleEarned.length, visibleLocked.length,
  ]);

  if (loading) {
    return (
      <SafeAreaView style={styles.screen} edges={[]}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.screen} edges={[]}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <Ionicons name="cloud-offline-outline" size={36} color={C.inkMute} />
          <Text style={{ color: C.inkMute, fontSize: 15, fontWeight: '600' }}>Failed to load</Text>
          <TouchableOpacity
            onPress={() => { setLoading(true); loadBadges(); }}
            style={{ paddingHorizontal: 20, paddingVertical: 10, backgroundColor: C.primary, borderRadius: 12 }}
          >
            <Text style={{ color: '#FFFBF1', fontWeight: '700', fontSize: 14 }}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={[]}>
      <FlatList
        data={data}
        renderItem={renderRow}
        keyExtractor={(item, idx) => {
          if (item._type === 'featured')    return 'featured';
          if (item._type === 'badgeRow')    return `row-${idx}`;
          if (item._type === 'sectionHead') return `sh-${item.title}`;
          return item._type;
        }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        // Improved scroll performance
        removeClippedSubviews={false}
      />

      {selectedBadge && (
        <BadgeDetailModal
          badge={selectedBadge}
          onClose={() => setSelectedBadge(null)}
          onShare={b => { setSelectedBadge(null); setSharingBadge(b); }}
        />
      )}
      {sharingBadge && (
        <BadgeShareSheet badge={sharingBadge} onClose={() => setSharingBadge(null)} />
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },

  // Page header
  pageHeader: {
    paddingHorizontal: H_PAD, paddingTop: 22, paddingBottom: 18,
    borderBottomWidth: 0.5, borderBottomColor: 'rgba(27,26,22,0.06)',
  },
  headerKicker: {
    fontSize: 9.5, fontWeight: '600', color: C.inkMute, letterSpacing: 1.6, marginBottom: 5,
  },
  headerTitle: {
    fontSize: 30, fontWeight: '800', color: C.ink, letterSpacing: -0.6,
  },
  headerSub: {
    fontSize: 14, color: C.inkMute, marginTop: 6,
  },

  // Filter bar
  filterScroll: {
    paddingHorizontal: H_PAD, paddingVertical: 14, gap: 6, flexDirection: 'row',
  },
  filterPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingLeft: 8, paddingRight: 12, paddingVertical: 6,
    borderRadius: 100, borderWidth: 0.5, borderColor: 'transparent',
    backgroundColor: 'transparent',
  },
  filterPillActive: {
    backgroundColor: C.surface, borderColor: C.hairline,
  },
  filterLabel: {
    fontSize: 12, fontWeight: '500', color: C.ink,
  },
  filterLabelActive: {
    fontWeight: '700',
  },
  filterCount: {
    fontSize: 10, fontWeight: '600', color: C.inkMute,
  },

  // Featured card
  featured: {
    backgroundColor: C.surface,
    borderRadius: 16, borderWidth: 0.5, borderColor: C.hairline,
    padding: 20, paddingHorizontal: 22,
    flexDirection: 'row', gap: 22, alignItems: 'center',
    overflow: 'hidden', position: 'relative',
  },
  featuredKicker: {
    fontSize: 10, fontWeight: '600', color: C.inkMute, letterSpacing: 1.6,
  },
  featuredName: {
    fontSize: 28, fontWeight: '800', color: C.ink, letterSpacing: -0.5,
  },
  featuredDesc: {
    fontSize: 14, color: C.inkSoft, lineHeight: 21,
  },
  featuredShare: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: C.surface,
    borderWidth: 0.5, borderColor: C.hairline,
    borderRadius: 100, paddingHorizontal: 14, paddingVertical: 7,
    marginTop: 8,
  },
  featuredShareText: {
    fontSize: 12, fontWeight: '700', color: C.ink,
  },

  // Section headers
  sectionHead: {
    paddingHorizontal: H_PAD, paddingTop: 24, paddingBottom: 14,
  },
  sectionKicker: {
    fontSize: 9.5, fontWeight: '600', color: C.inkMute, letterSpacing: 1.6,
    textTransform: 'uppercase', marginBottom: 3,
  },
  sectionTitle: {
    fontSize: 20, fontWeight: '800', color: C.ink, letterSpacing: -0.3,
  },

  // Badge row
  badgeRow: {
    flexDirection: 'row',
    paddingHorizontal: H_PAD,
    gap: CELL_GAP,
    marginBottom: CELL_GAP,
  },

  // Badge cell — padding matches web's 16px 12px 12px
  cell: {
    backgroundColor: C.surface,
    borderRadius: 14, borderWidth: 0.5, borderColor: C.hairline,
    paddingTop: 16, paddingHorizontal: 12, paddingBottom: 12,
    alignItems: 'center', gap: 8,
    overflow: 'hidden', position: 'relative',
  },
  cellName: {
    fontSize: 12.5, fontWeight: '700', color: C.ink,
    textAlign: 'center', lineHeight: 15,
  },
  // Tier label: full name, inkMute — matches web
  cellTier: {
    fontSize: 9, fontWeight: '600', color: C.inkMute,
    letterSpacing: 1, textTransform: 'uppercase',
  },
  cellDate: {
    fontSize: 9.5, fontWeight: '600', color: C.inkMute, letterSpacing: 0.6,
  },

  // Detail modal
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
  // No border — matches web
  tierPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4,
    marginTop: 14,
  },
  tierPillText: {
    fontSize: 10, fontWeight: '600', letterSpacing: 1.6,
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
    fontSize: 11, fontWeight: '600', color: 'rgba(255,251,241,0.55)', letterSpacing: 0.6,
  },
  emptyState: {
    alignItems: 'center', paddingTop: 60, paddingHorizontal: 32,
  },

  // Share CTA inside detail modal
  shareCta: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: '#FFFBF1', borderRadius: 100,
    paddingHorizontal: 24, paddingVertical: 10,
    marginTop: 20,
  },
  shareCtaText: {
    fontSize: 13, fontWeight: '700', color: '#1B1A16',
  },

  // Share sheet — matches web BadgeShareModal
  shareOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center', padding: 20,
  },
  shareModal: {
    width: '100%', maxWidth: 440,
    backgroundColor: C.surface, borderRadius: 18,
    borderWidth: 0.5, borderColor: C.hairline,
    overflow: 'hidden', paddingBottom: 18,
  },
  shareHeader: {
    paddingHorizontal: 18, paddingVertical: 14,
    borderBottomWidth: 0.5, borderBottomColor: 'rgba(27,26,22,0.06)',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  shareTitle: {
    fontSize: 13, fontWeight: '700', color: C.ink,
  },
  shareCancelBtn: {
    borderWidth: 0.5, borderColor: C.hairline, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  shareCancelText: {
    fontSize: 12.5, fontWeight: '700', color: C.ink,
  },
  shareBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: C.primary, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 5,
  },
  shareBtnDisabled: {
    backgroundColor: C.surfaceAlt,
    borderWidth: 0.5, borderColor: C.hairline,
  },
  shareBtnText: {
    fontSize: 12.5, fontWeight: '700', color: '#FFFBF1',
  },
  sharePreview: {
    marginHorizontal: 18, marginTop: 16,
    padding: 14, paddingHorizontal: 16,
    borderRadius: 12, borderWidth: 0.5,
    flexDirection: 'row', alignItems: 'center', gap: 14,
  },
  sharePreviewPatch: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  sharePreviewKicker: {
    fontSize: 9, fontWeight: '700', letterSpacing: 1.4, marginBottom: 2,
  },
  sharePreviewName: {
    fontSize: 16, fontWeight: '800', color: C.ink, letterSpacing: -0.3,
  },
  sharePreviewDesc: {
    fontSize: 12, color: C.inkMute, marginTop: 2,
  },
  audienceRow: {
    flexDirection: 'row', gap: 6,
    paddingHorizontal: 18, paddingTop: 14,
  },
  audiencePill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 7, borderRadius: 8,
    borderWidth: 0.5, borderColor: C.hairline,
  },
  audiencePillActive: {
    borderWidth: 1.5, borderColor: C.primary,
    backgroundColor: 'rgba(31,61,46,0.09)',
  },
  audienceLabel: {
    fontSize: 12, fontWeight: '700', color: C.inkMute,
  },
  captionInput: {
    marginHorizontal: 18, marginTop: 12,
    minHeight: 80, maxHeight: 160,
    backgroundColor: C.bg, borderWidth: 0.5, borderColor: C.hairline,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: C.ink, lineHeight: 21,
    textAlignVertical: 'top',
  },
  captionCount: {
    fontSize: 10, fontWeight: '600', color: C.inkMute, letterSpacing: 0.5,
    textAlign: 'right', marginHorizontal: 18, marginTop: 6,
  },
});
