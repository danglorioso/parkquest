import {
  ActivityIndicator, Dimensions, FlatList, Modal,
  ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useCallback, useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { ALL_BADGES } from '@/lib/badges';

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
  accent:     '#C56B3D',
};

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
const SW = Dimensions.get('window').width;
const CELL_GAP = 10;
const CELL_W = (SW - 32 - CELL_GAP * 2) / 3;

// ── Tier config ───────────────────────────────────────────────────────────────

const TIERS: Record<string, { fill: string; light: string; bg: string }> = {
  bronze:    { fill: '#B27339', light: '#D4A070', bg: 'rgba(178,115,57,0.13)' },
  silver:    { fill: '#A8A39B', light: '#C5C0B8', bg: 'rgba(168,163,155,0.13)' },
  gold:      { fill: '#D4A93F', light: '#EBC96A', bg: 'rgba(212,169,63,0.13)' },
  platinum:  { fill: '#6E97A3', light: '#95B8C2', bg: 'rgba(110,151,163,0.13)' },
  legendary: { fill: '#8B5DBF', light: '#B08ADE', bg: 'rgba(139,93,191,0.13)' },
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

// ── Badge patch ───────────────────────────────────────────────────────────────

function BadgePatch({ emoji, tier, size = 64, earned }: {
  emoji: string; tier: string; size?: number; earned: boolean;
}) {
  const t = TIERS[tier] ?? TIERS.bronze;
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: t.bg,
      borderWidth: 2, borderColor: t.fill + '66',
      alignItems: 'center', justifyContent: 'center',
      opacity: earned ? 1 : 0.45,
    }}>
      <Text style={{ fontSize: size * 0.38 }}>{emoji}</Text>
    </View>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ current, target, fill }: { current: number; target: number; fill: string }) {
  const pct = Math.min(100, Math.round((current / target) * 100));
  return (
    <View>
      <View style={{ height: 4, backgroundColor: C.surfaceAlt, borderRadius: 2, overflow: 'hidden' }}>
        <View style={{ height: '100%', width: `${pct}%`, backgroundColor: fill, borderRadius: 2 }} />
      </View>
      <Text style={{ fontSize: 9, fontWeight: '600', color: C.inkMute, marginTop: 3, textAlign: 'center' }}>
        {current} / {target}
      </Text>
    </View>
  );
}

// ── Badge cell ────────────────────────────────────────────────────────────────

function BadgeCell({ badge, onPress }: { badge: BadgeData; onPress: () => void }) {
  const t = TIERS[badge.tier] ?? TIERS.bronze;
  const dateStr = badge.earned_at
    ? new Date(badge.earned_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()
    : null;

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.cell, { width: CELL_W }]}
      activeOpacity={0.75}
    >
      {/* Tier glow background */}
      {badge.earned && (
        <View style={[StyleSheet.absoluteFill, { borderRadius: 14, backgroundColor: t.bg, opacity: 0.5 }]} />
      )}
      <BadgePatch emoji={badge.emoji} tier={badge.tier} size={64} earned={badge.earned} />
      <Text style={[styles.cellName, !badge.earned && { color: C.inkMute }]} numberOfLines={2}>
        {badge.name}
      </Text>
      <Text style={[styles.cellTier, { color: t.fill }]}>{TIERS[badge.tier]?.fill ? badge.tier.toUpperCase() : '–'}</Text>

      {badge.earned && dateStr ? (
        <Text style={styles.cellDate}>{dateStr}</Text>
      ) : badge.progress_current != null && badge.progress_target != null ? (
        <ProgressBar current={badge.progress_current} target={badge.progress_target} fill={t.fill} />
      ) : null}
    </TouchableOpacity>
  );
}

// ── Featured card ─────────────────────────────────────────────────────────────

function FeaturedCard({ badge, onPress }: { badge: BadgeData; onPress: () => void }) {
  const t = TIERS[badge.tier] ?? TIERS.bronze;
  const dateStr = badge.earned_at
    ? new Date(badge.earned_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()
    : 'RECENTLY';

  return (
    <TouchableOpacity onPress={onPress} style={styles.featured} activeOpacity={0.85}>
      <View style={[StyleSheet.absoluteFill, { borderRadius: 14, backgroundColor: t.bg }]} />
      <BadgePatch emoji={badge.emoji} tier={badge.tier} size={84} earned />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ fontSize: 9.5, fontWeight: '700', color: C.inkMute, letterSpacing: 1.2 }}>
          LATEST UNLOCK · {dateStr} · {badge.tier.toUpperCase()}
        </Text>
        <Text style={{ fontSize: 20, fontWeight: '900', color: C.ink, letterSpacing: -0.4 }}>{badge.name}</Text>
        <Text style={{ fontSize: 12.5, color: C.inkSoft, lineHeight: 17 }} numberOfLines={2}>{badge.description}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Detail modal ──────────────────────────────────────────────────────────────

function BadgeDetailModal({ badge, onClose }: { badge: BadgeData; onClose: () => void }) {
  const t = TIERS[badge.tier] ?? TIERS.bronze;
  const def = ALL_BADGES.find(b => b.id === badge.id);
  const pct = badge.progress_target
    ? Math.min(100, Math.round(((badge.progress_current ?? 0) / badge.progress_target) * 100))
    : 0;
  const earnedDateStr = badge.earned_at
    ? new Date(badge.earned_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.modal, { borderColor: t.fill + '44' }]}>
          {/* Tier glow */}
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 120, borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: t.bg, opacity: 0.6 }} />

          <TouchableOpacity onPress={onClose} style={styles.modalClose}>
            <Ionicons name="close" size={16} color="rgba(255,251,241,0.7)" />
          </TouchableOpacity>

          {/* Badge */}
          <View style={{ alignItems: 'center', paddingTop: 8, position: 'relative' }}>
            <BadgePatch emoji={badge.emoji} tier={badge.tier} size={100} earned={badge.earned} />
            <View style={[styles.tierPill, { backgroundColor: t.fill + '33', borderColor: t.fill + '44' }]}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.fill }} />
              <Text style={[styles.tierPillText, { color: t.fill }]}>{badge.tier.toUpperCase()} TIER</Text>
            </View>
          </View>

          <Text style={styles.modalName}>{badge.name}</Text>
          <Text style={styles.modalDesc}>{badge.description}</Text>

          {/* How to earn (from ALL_BADGES) */}
          {def?.description && def.description !== badge.description && (
            <View style={styles.modalInfoBox}>
              <Text style={styles.modalInfoLabel}>HOW TO EARN</Text>
              <Text style={styles.modalInfoText}>{def.description}</Text>
            </View>
          )}

          {/* Earned date or progress */}
          {badge.earned && earnedDateStr ? (
            <View style={styles.earnedRow}>
              <Text style={styles.earnedText}>✦ Earned {earnedDateStr}</Text>
            </View>
          ) : badge.progress_current != null && badge.progress_target != null ? (
            <View style={{ width: '100%', marginTop: 16 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ fontSize: 10, fontWeight: '600', color: 'rgba(255,251,241,0.4)', letterSpacing: 0.6 }}>PROGRESS</Text>
                <Text style={{ fontSize: 10, fontWeight: '700', color: t.fill }}>{badge.progress_current} / {badge.progress_target}</Text>
              </View>
              <View style={{ height: 6, backgroundColor: 'rgba(255,251,241,0.10)', borderRadius: 3, overflow: 'hidden' }}>
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
  const [badges,       setBadges]       = useState<BadgeData[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [tierFilter,   setTierFilter]   = useState<TierFilter>('all');
  const [selectedBadge, setSelectedBadge] = useState<BadgeData | null>(null);

  useEffect(() => {
    (async () => {
      const tok = await getToken();
      if (!tok) return;
      try {
        const res = await fetch(`${BASE}/api/badges`, { headers: { Authorization: `Bearer ${tok}` } });
        if (res.ok) {
          const data = await res.json();
          const sorted = [...(data.badges ?? [])].sort((a: BadgeData, b: BadgeData) => {
            const aDate = a.earned_at ? new Date(a.earned_at).getTime() : 0;
            const bDate = b.earned_at ? new Date(b.earned_at).getTime() : 0;
            return bDate - aDate;
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

  const earned  = badges.filter(b => b.earned);
  const locked  = badges.filter(b => !b.earned);
  const visible = tierFilter === 'all' ? badges : badges.filter(b => b.tier === tierFilter);
  const visibleEarned = visible.filter(b => b.earned);
  const visibleLocked = visible.filter(b => !b.earned);
  const latestUnlock = earned[0] ?? null;
  const earnedPct = badges.length > 0 ? Math.round((earned.length / badges.length) * 100) : 0;

  const ListHeader = (
    <View>
      {/* Stats */}
      <View style={styles.header}>
        <Text style={styles.headerKicker}>{earned.length} OF {badges.length} EARNED · {earnedPct}%</Text>
        <Text style={styles.headerTitle}>Badge Collection</Text>
        <Text style={styles.headerSub}>Five tiers, every milestone marked.</Text>
      </View>

      {/* Tier filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tierFilter}>
        {(['all', ...TIER_ORDER] as TierFilter[]).map(t => {
          const on = tierFilter === t;
          const tier = TIERS[t];
          const count = t === 'all' ? badges.length : badges.filter(b => b.tier === t).length;
          return (
            <TouchableOpacity
              key={t} onPress={() => setTierFilter(t)} activeOpacity={0.7}
              style={[styles.tierPill2, on && styles.tierPillActive]}
            >
              {t !== 'all' && tier && (
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tier.fill }} />
              )}
              <Text style={[styles.tierPillLabel, on && styles.tierPillLabelActive]}>
                {t === 'all' ? 'All tiers' : tier?.fill ? t.charAt(0).toUpperCase() + t.slice(1) : t}
              </Text>
              <Text style={[styles.tierPillCount, on && { color: '#FFFBF1' }]}>{count}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Featured latest unlock */}
      {latestUnlock && tierFilter === 'all' && (
        <View style={{ paddingHorizontal: 16, marginBottom: 20 }}>
          <FeaturedCard badge={latestUnlock} onPress={() => setSelectedBadge(latestUnlock)} />
        </View>
      )}

      {/* Earned section header */}
      {visibleEarned.length > 0 && (
        <View style={styles.gridSectionHeader}>
          <Text style={styles.gridSectionKicker}>{visibleEarned.length} BADGE{visibleEarned.length !== 1 ? 'S' : ''}</Text>
          <Text style={styles.gridSectionTitle}>Earned</Text>
        </View>
      )}
    </View>
  );

  const renderRows = useCallback(() => {
    const rows: JSX.Element[] = [];

    // Earned rows
    for (let i = 0; i < visibleEarned.length; i += 3) {
      const row = visibleEarned.slice(i, i + 3);
      rows.push(
        <View key={`e-${i}`} style={styles.gridRow}>
          {row.map(b => (
            <BadgeCell key={b.id} badge={b} onPress={() => setSelectedBadge(b)} />
          ))}
          {row.length < 3 && Array.from({ length: 3 - row.length }, (_, j) => (
            <View key={`ep-${j}`} style={{ width: CELL_W }} />
          ))}
        </View>
      );
    }

    // Locked section header
    if (visibleLocked.length > 0) {
      rows.push(
        <View key="locked-header" style={[styles.gridSectionHeader, { marginTop: 12 }]}>
          <Text style={styles.gridSectionKicker}>{visibleLocked.length} TO UNLOCK</Text>
          <Text style={styles.gridSectionTitle}>In progress</Text>
        </View>
      );
    }

    // Locked rows
    for (let i = 0; i < visibleLocked.length; i += 3) {
      const row = visibleLocked.slice(i, i + 3);
      rows.push(
        <View key={`l-${i}`} style={styles.gridRow}>
          {row.map(b => (
            <BadgeCell key={b.id} badge={b} onPress={() => setSelectedBadge(b)} />
          ))}
          {row.length < 3 && Array.from({ length: 3 - row.length }, (_, j) => (
            <View key={`lp-${j}`} style={{ width: CELL_W }} />
          ))}
        </View>
      );
    }

    return rows;
  }, [visibleEarned, visibleLocked]);

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
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {ListHeader}
        <View style={{ paddingHorizontal: 16 }}>
          {renderRows()}
        </View>
        {!loading && badges.length === 0 && (
          <View style={{ alignItems: 'center', paddingTop: 60 }}>
            <Text style={{ fontSize: 36, marginBottom: 12 }}>🏅</Text>
            <Text style={{ fontSize: 16, fontWeight: '700', color: C.ink, marginBottom: 4 }}>No badges yet</Text>
            <Text style={{ fontSize: 13, color: C.inkMute, textAlign: 'center', paddingHorizontal: 40 }}>
              Start exploring parks to unlock your first badge.
            </Text>
          </View>
        )}
      </ScrollView>

      {selectedBadge && (
        <BadgeDetailModal badge={selectedBadge} onClose={() => setSelectedBadge(null)} />
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },

  header: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 4 },
  headerKicker: {
    fontSize: 9.5, fontWeight: '600', color: C.inkMute, letterSpacing: 1.2, marginBottom: 3,
  },
  headerTitle: {
    fontSize: 26, fontWeight: '900', color: C.ink, letterSpacing: -0.6,
  },
  headerSub: {
    fontSize: 13, color: C.inkMute, marginTop: 2,
  },

  tierFilter: {
    paddingHorizontal: 16, paddingVertical: 14, gap: 6, flexDirection: 'row',
  },
  tierPill2: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 100, borderWidth: 0.5, borderColor: C.hairline,
    backgroundColor: C.surface,
  },
  tierPillActive: {
    backgroundColor: C.primary, borderColor: C.primary,
  },
  tierPillLabel: {
    fontSize: 12, fontWeight: '500', color: C.ink,
  },
  tierPillLabelActive: {
    color: '#FFFBF1', fontWeight: '700',
  },
  tierPillCount: {
    fontSize: 10, fontWeight: '600', color: C.inkMute,
  },

  featured: {
    backgroundColor: C.surface,
    borderRadius: 14, borderWidth: 0.5, borderColor: C.hairline,
    padding: 16, flexDirection: 'row', gap: 16, alignItems: 'center',
    overflow: 'hidden',
  },

  // Grid
  gridSectionHeader: {
    paddingHorizontal: 16, marginBottom: 12,
  },
  gridSectionKicker: {
    fontSize: 9.5, fontWeight: '600', color: C.inkMute, letterSpacing: 1.2,
  },
  gridSectionTitle: {
    fontSize: 18, fontWeight: '800', color: C.ink, letterSpacing: -0.3, marginTop: 1,
  },
  gridRow: {
    flexDirection: 'row', gap: CELL_GAP, marginBottom: CELL_GAP,
  },
  cell: {
    backgroundColor: C.surface,
    borderRadius: 14, borderWidth: 0.5, borderColor: C.hairline,
    padding: 10, alignItems: 'center', gap: 6, overflow: 'hidden',
  },
  cellName: {
    fontSize: 11, fontWeight: '700', color: C.ink, textAlign: 'center', lineHeight: 14,
  },
  cellTier: {
    fontSize: 8, fontWeight: '700', letterSpacing: 0.8,
  },
  cellDate: {
    fontSize: 9, color: C.inkMute, letterSpacing: 0.4, fontWeight: '600',
  },

  // Detail modal
  overlay: {
    flex: 1, backgroundColor: 'rgba(13,12,10,0.88)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  modal: {
    backgroundColor: 'rgba(22,22,18,0.97)',
    borderRadius: 20, borderWidth: 0.5,
    padding: 28, paddingTop: 36,
    width: '100%', maxWidth: 360,
    alignItems: 'center', overflow: 'hidden',
  },
  modalClose: {
    position: 'absolute', top: 14, right: 14,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255,251,241,0.10)',
    alignItems: 'center', justifyContent: 'center', zIndex: 10,
  },
  tierPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, marginTop: 12,
  },
  tierPillText: {
    fontSize: 10, fontWeight: '600', letterSpacing: 1.2,
  },
  modalName: {
    fontSize: 22, fontWeight: '800', color: '#FFFBF1', letterSpacing: -0.4,
    marginTop: 10, textAlign: 'center',
  },
  modalDesc: {
    fontSize: 13, color: 'rgba(255,251,241,0.6)', marginTop: 6, textAlign: 'center', lineHeight: 19,
  },
  modalInfoBox: {
    width: '100%', marginTop: 16,
    backgroundColor: 'rgba(255,251,241,0.06)',
    borderRadius: 10, padding: '12px 14px' as any,
    paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 0.5, borderColor: 'rgba(255,251,241,0.10)',
  },
  modalInfoLabel: {
    fontSize: 8.5, fontWeight: '600', color: 'rgba(255,251,241,0.4)',
    letterSpacing: 1, marginBottom: 5,
  },
  modalInfoText: {
    fontSize: 13, color: 'rgba(255,251,241,0.65)', lineHeight: 18,
  },
  earnedRow: {
    marginTop: 16, backgroundColor: 'rgba(255,251,241,0.07)',
    borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8,
  },
  earnedText: {
    fontSize: 11, fontWeight: '600', color: 'rgba(255,251,241,0.55)', letterSpacing: 0.4,
  },
});
