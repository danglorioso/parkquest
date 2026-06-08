import {
  ActivityIndicator, Dimensions, FlatList, Modal,
  ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';

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

// ── BadgePatch — approximates web's SVG radial gradient + rings ───────────────

function BadgePatch({
  emoji, tier, size = 72, earned,
}: { emoji: string; tier: string; size?: number; earned: boolean }) {
  const t = TIERS[tier] ?? TIERS.bronze;
  const r  = size / 2;
  const i1 = size * 0.065; // outer ring inset
  const i2 = size * 0.13;  // inner ring inset
  const starSize = Math.max(7, size * 0.09);

  return (
    <View style={{ width: size, height: size, opacity: earned ? 1 : 0.5 }}>
      {/* Base fill — tier color */}
      <View style={{ position: 'absolute', inset: 0, borderRadius: r, backgroundColor: t.fill }} />
      {/* Light highlight top — approximates radial gradient from t.light */}
      <View style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: size * 0.62,
        borderTopLeftRadius: r, borderTopRightRadius: r, borderBottomLeftRadius: r, borderBottomRightRadius: r,
        backgroundColor: t.light, opacity: 0.4,
      }} />
      {/* Outer solid ring */}
      <View style={{
        position: 'absolute', inset: i1, borderRadius: r - i1,
        borderWidth: 1.5, borderColor: 'rgba(255,251,241,0.55)',
      }} />
      {/* Inner dashed ring */}
      <View style={{
        position: 'absolute', inset: i2, borderRadius: r - i2,
        borderWidth: 1, borderColor: 'rgba(255,251,241,0.32)',
        borderStyle: 'dashed',
      }} />
      {/* Stars — top */}
      <Text style={{
        position: 'absolute', top: size * 0.08, left: 0, right: 0,
        textAlign: 'center', fontSize: starSize, lineHeight: starSize + 2,
        color: 'rgba(255,251,241,0.65)',
      }}>★ ★ ★</Text>
      {/* Emoji — centered */}
      <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: size * 0.38, lineHeight: size * 0.48 }}>{emoji}</Text>
      </View>
      {/* Stars — bottom */}
      <Text style={{
        position: 'absolute', bottom: size * 0.08, left: 0, right: 0,
        textAlign: 'center', fontSize: starSize, lineHeight: starSize + 2,
        color: 'rgba(255,251,241,0.65)',
      }}>★ ★ ★</Text>
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
      {/* Radial glow from top — earned cards only, matches web */}
      {badge.earned && (
        <View style={{
          position: 'absolute', top: -CELL_W * 0.3, left: -CELL_W * 0.3, right: -CELL_W * 0.3,
          height: CELL_W * 1.2, borderRadius: CELL_W * 0.6,
          backgroundColor: t.glow, opacity: 0.7,
          pointerEvents: 'none',
        }} />
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

function FeaturedCard({ badge, onPress }: { badge: BadgeData; onPress: () => void }) {
  const t = TIERS[badge.tier] ?? TIERS.bronze;
  const dateStr = badge.earned_at
    ? new Date(badge.earned_at)
        .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        .toUpperCase()
    : 'RECENTLY';

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.featured}>
      {/* Tier glow from top-left — matches web radial-gradient at 20% 0% */}
      <View style={{
        position: 'absolute', top: -60, left: -60,
        width: 180, height: 180, borderRadius: 90,
        backgroundColor: t.glow, opacity: 0.7,
        pointerEvents: 'none',
      }} />
      <View style={{ position: 'relative' }}>
        <BadgePatch emoji={badge.emoji} tier={badge.tier} size={108} earned />
      </View>
      <View style={{ flex: 1, gap: 5, position: 'relative' }}>
        <Text style={styles.featuredKicker}>
          LATEST UNLOCK · {dateStr} · {t.name.toUpperCase()}
        </Text>
        <Text style={styles.featuredName}>{badge.name}</Text>
        <Text style={styles.featuredDesc} numberOfLines={2}>{badge.description}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ── BadgeDetailModal ──────────────────────────────────────────────────────────

function BadgeDetailModal({ badge, onClose }: { badge: BadgeData; onClose: () => void }) {
  const t = TIERS[badge.tier] ?? TIERS.bronze;
  const pct = badge.progress_target && badge.progress_target > 0
    ? Math.min(100, Math.round(((badge.progress_current ?? 0) / badge.progress_target) * 100))
    : 0;
  const earnedDateStr = badge.earned_at
    ? new Date(badge.earned_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.modal, { borderColor: t.fill + '55' }]}>
          {/* Tier radial glow at top — matches web */}
          <View style={{
            position: 'absolute', top: -40, left: -40, right: -40, height: 200,
            borderRadius: 100, backgroundColor: t.glow, opacity: 0.8,
            pointerEvents: 'none',
          }} />

          {/* Close */}
          <TouchableOpacity onPress={onClose} style={styles.modalClose}>
            <Ionicons name="close" size={16} color="rgba(255,251,241,0.55)" />
          </TouchableOpacity>

          {/* Patch — 120px, matches web */}
          <View style={{ position: 'relative', alignItems: 'center', paddingTop: 8 }}>
            <BadgePatch emoji={badge.emoji} tier={badge.tier} size={120} earned={badge.earned} />
          </View>

          {/* Tier pill */}
          <View style={[styles.tierPill, { backgroundColor: t.fill + '22', borderColor: t.fill + '44' }]}>
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
        </View>
      </View>
    </Modal>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function BadgesScreen() {
  const { getToken } = useAuth();
  const [badges,        setBadges]        = useState<BadgeData[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [tierFilter,    setTierFilter]    = useState<TierFilter>('all');
  const [selectedBadge, setSelectedBadge] = useState<BadgeData | null>(null);

  useEffect(() => {
    (async () => {
      const tok = await getToken();
      if (!tok) return;
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
        }
      } catch (e) {
        console.error('Badges load error:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [getToken]);

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
            <FeaturedCard badge={item.badge} onPress={() => setSelectedBadge(item.badge)} />
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
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
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
        <BadgeDetailModal badge={selectedBadge} onClose={() => setSelectedBadge(null)} />
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },

  // Page header
  pageHeader: {
    paddingHorizontal: H_PAD, paddingTop: 22, paddingBottom: 4,
  },
  headerKicker: {
    fontSize: 9.5, fontWeight: '600', color: C.inkMute, letterSpacing: 1.6, marginBottom: 3,
  },
  headerTitle: {
    fontSize: 26, fontWeight: '800', color: C.ink, letterSpacing: -0.4,
  },
  headerSub: {
    fontSize: 13, color: C.inkMute, marginTop: 3,
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
    fontSize: 22, fontWeight: '800', color: C.ink, letterSpacing: -0.5,
  },
  featuredDesc: {
    fontSize: 13.5, color: C.inkSoft, lineHeight: 19,
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
    alignItems: 'center', gap: 6,
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
  },
  modalClose: {
    position: 'absolute', top: 14, right: 14, zIndex: 10,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255,251,241,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  tierPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, marginTop: 14,
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
});
