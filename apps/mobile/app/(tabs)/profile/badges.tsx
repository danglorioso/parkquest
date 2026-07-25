import {
  ActivityIndicator, Animated, Dimensions, Easing, FlatList,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { useTabBarSpace } from '@/components/FloatingTabBar';
import { STATIC as C, useColors } from '@/lib/palette';
import {
  BadgeDetailModal, BadgePatch, TierGlow, badgeTheme, type BadgeColorPair,
} from '@/components/BadgeDetailModal';
import { BadgeShareSheet } from '@/components/BadgeShareSheet';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
const SW   = Dimensions.get('window').width;
const H_PAD = 16;
const CELL_GAP = 10;
const CELL_W = (SW - H_PAD * 2 - CELL_GAP * 2) / 3;

// Tier palette + patch/glow art + the detail modal all live in the shared
// component now, so the profile preview rows and friend profiles open the
// exact same popup as this screen.
const TIER_ORDER = ['bronze', 'silver', 'gold', 'platinum', 'legendary'] as const;

// ── Types ─────────────────────────────────────────────────────────────────────

interface BadgeData {
  id: string;
  name: string;
  description: string;
  emoji: string;
  tier: string;
  colors?: BadgeColorPair | null;
  earned: boolean;
  earned_at: string | null;
  progress_current: number | null;
  progress_target: number | null;
}

// FlatList row union
type Row =
  | { _type: 'pageHeader' }
  | { _type: 'featured'; badge: BadgeData }
  | { _type: 'sectionHead'; kicker: string; title: string }
  | { _type: 'badgeRow'; items: BadgeData[] }
  | { _type: 'empty' };

// ── ProgressBar ───────────────────────────────────────────────────────────────

function ProgressBar({ current, target, fill }: { current: number; target: number; fill: string }) {
  const pct = Math.min(100, Math.round((current / target) * 100));
  return (
    <View style={{ width: '100%', paddingHorizontal: 6 }}>
      <View style={{ height: 3.5, backgroundColor: C.surfaceAlt, borderRadius: 2, overflow: 'hidden' }}>
        <View style={{ height: '100%', width: `${pct}%`, backgroundColor: fill, borderRadius: 2 }} />
      </View>
      <Text style={{ fontSize: 13, fontWeight: '600', color: C.inkMute, marginTop: 4, textAlign: 'center', letterSpacing: 0.4 }}>
        {current} / {target}
      </Text>
    </View>
  );
}

// ── BadgeCell ─────────────────────────────────────────────────────────────────

function BadgeCell({ badge, onPress }: { badge: BadgeData; onPress: () => void }) {
  const t = badgeTheme(badge.tier, badge.colors);
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

      <BadgePatch emoji={badge.emoji} tier={badge.tier} colors={badge.colors} size={72} earned={badge.earned} />

      {/* Badge name */}
      <Text
        style={[styles.cellName, !badge.earned && { color: C.inkMute }]}
        numberOfLines={2}
      >
        {badge.name}
      </Text>

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
  const t = badgeTheme(badge.tier, badge.colors);

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.featured}>
      {/* Tier glow from top-left — matches web:
          radial-gradient(120% 80% at 20% 0%, glow 0%, transparent 55%) */}
      <TierGlow glow={t.glow} cx={0.2} cy={0} rx={1.2} ry={0.8} fade={0.55} />
      <View style={{ position: 'relative' }}>
        <BadgePatch emoji={badge.emoji} tier={badge.tier} colors={badge.colors} size={108} earned />
      </View>
      <View style={{ flex: 1, gap: 5, position: 'relative' }}>
        <Text style={styles.featuredKicker}>
          LATEST UNLOCK
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

// ── Screen ────────────────────────────────────────────────────────────────────

export default function BadgesScreen() {
  const { getToken } = useAuth();
  const { badgeId } = useLocalSearchParams<{ badgeId?: string }>();
  const tabBarSpace = useTabBarSpace();
  const T = useColors();
  const [badges,        setBadges]        = useState<BadgeData[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(false);
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

  // Deep-link from a badge_earned notification — open that badge's popup once loaded.
  useEffect(() => {
    if (!badgeId || badges.length === 0) return;
    const match = badges.find(b => b.id === badgeId);
    if (match) setSelectedBadge(match);
  }, [badgeId, badges]);

  const earned  = useMemo(() => badges.filter(b => b.earned), [badges]);
  const visibleEarned = useMemo(() => badges.filter(b => b.earned),  [badges]);
  const visibleLocked = useMemo(() => {
    const locked = badges.filter(b => !b.earned);
    return locked.sort((a, b) => {
      const aPct = a.progress_target ? (a.progress_current ?? 0) / a.progress_target : 0;
      const bPct = b.progress_target ? (b.progress_current ?? 0) / b.progress_target : 0;
      return bPct - aPct;
    });
  }, [badges]);
  const latestUnlock  = earned[0] ?? null;
  const earnedPct     = badges.length > 0 ? Math.round((earned.length / badges.length) * 100) : 0;

  // Build flat FlatList data — each item is one full-width row
  const data: Row[] = useMemo(() => {
    const rows: Row[] = [
      { _type: 'pageHeader' },
    ];

    if (latestUnlock) {
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
  }, [latestUnlock, visibleEarned, visibleLocked, loading, badges.length]);

  const renderRow = useCallback(({ item }: { item: Row }) => {
    switch (item._type) {

      case 'pageHeader':
        return (
          <View style={styles.pageHeader}>
            <Text style={styles.headerKicker}>
              {earned.length} EARNED
            </Text>
            <Text style={styles.headerTitle}>Badge collection</Text>
            <Text style={styles.headerSub}>See your progress and earn more by exploring.</Text>
          </View>
        );

      case 'featured':
        return (
          <View style={{ paddingHorizontal: H_PAD, marginTop: 12, marginBottom: 20 }}>
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
    earned.length, badges, earnedPct,
    visibleEarned.length, visibleLocked.length,
  ]);

  if (loading) {
    return (
      <SafeAreaView style={styles.screen} edges={[]}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={T.primary} />
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
            style={{ paddingHorizontal: 20, paddingVertical: 10, backgroundColor: T.primary, borderRadius: 12 }}
          >
            <Text style={{ color: C.onPrimary, fontWeight: '700', fontSize: 14 }}>Retry</Text>
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
        contentContainerStyle={{ paddingBottom: tabBarSpace + 16 }}
        // Improved scroll performance
        removeClippedSubviews={false}
      />

      {selectedBadge && (
        <BadgeDetailModal
          badge={selectedBadge}
          onClose={() => setSelectedBadge(null)}
          onShare={() => { setSharingBadge(selectedBadge); setSelectedBadge(null); }}
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

  // Page header — bottom padding split with the featured card's top margin so
  // the divider floats evenly between the subheader and the latest-unlock banner.
  pageHeader: {
    paddingHorizontal: H_PAD, paddingTop: 22, paddingBottom: 12,
    borderBottomWidth: 0.5, borderBottomColor: C.hairlineSoft,
  },
  headerKicker: {
    fontSize: 13, fontWeight: '600', color: C.inkMute, letterSpacing: 1.6, marginBottom: 5,
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
    fontSize: 13, fontWeight: '500', color: C.ink,
  },
  filterLabelActive: {
    fontWeight: '700',
  },
  filterCount: {
    fontSize: 13, fontWeight: '600', color: C.inkMute,
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
    fontSize: 13, fontWeight: '600', color: C.inkMute, letterSpacing: 1.6,
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
    fontSize: 13, fontWeight: '700', color: C.ink,
  },

  // Section headers
  sectionHead: {
    paddingHorizontal: H_PAD, paddingTop: 24, paddingBottom: 14,
  },
  sectionKicker: {
    fontSize: 13, fontWeight: '600', color: C.inkMute, letterSpacing: 1.6,
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
    fontSize: 13, fontWeight: '700', color: C.ink,
    textAlign: 'center', lineHeight: 15,
  },
  // Tier label: full name, inkMute — matches web
  cellTier: {
    fontSize: 13, fontWeight: '600', color: C.inkMute,
    letterSpacing: 1, textTransform: 'uppercase',
  },
  cellDate: {
    fontSize: 13, fontWeight: '600', color: C.inkMute, letterSpacing: 0.6,
  },

  emptyState: {
    alignItems: 'center', paddingTop: 60, paddingHorizontal: 32,
  },
});
