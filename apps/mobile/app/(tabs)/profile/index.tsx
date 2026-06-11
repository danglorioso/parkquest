import {
  ActivityIndicator, Image, Modal, ScrollView, StyleSheet,
  Text, TouchableOpacity, View, Alert,
} from 'react-native';
import { useCallback, useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth, useUser, useClerk } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { BADGE_MAP } from '@/lib/badges';

// ── Design tokens ─────────────────────────────────────────────────────────────

const C = {
  bg:          '#F2EBDB',
  surface:     '#FFFBF1',
  surfaceAlt:  '#F7F0DE',
  ink:         '#1B1A16',
  inkSoft:     '#3C3A33',
  inkMute:     '#7A746A',
  hairline:    'rgba(27,26,22,0.10)',
  primary:     '#1F3D2E',
  primaryDeep: '#152A20',
  accent:      '#C56B3D',
  gold:        '#C9A94A',
};

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProfileInfo {
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
}

interface BadgeSummary {
  id: string;
  name: string;
  emoji: string;
  tier: string;
  earned: boolean;
  earned_at: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function explorerRank(n: number): string {
  if (n >= 63) return 'NATIONAL LEGEND';
  if (n >= 50) return 'PIONEER';
  if (n >= 30) return 'TRAILBLAZER';
  if (n >= 15) return 'RANGER';
  if (n >= 5)  return 'EXPLORER';
  if (n >= 1)  return 'INITIATE';
  return 'TRAILHEAD';
}

const TIER_COLOR: Record<string, string> = {
  bronze: '#B27339', silver: '#A8A39B', gold: '#D4A93F',
  platinum: '#6E97A3', legendary: '#8B5DBF',
};

async function apiFetch<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Badge detail modal — emoji, tier, how-to-earn, earned date ─────────────────

function BadgeInfoModal({ badge, onClose }: { badge: BadgeSummary; onClose: () => void }) {
  const def = BADGE_MAP.get(badge.id);
  const tint = TIER_COLOR[badge.tier] ?? '#B27339';
  const earnedDate = badge.earned_at
    ? new Date(badge.earned_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.badgeOverlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.badgeModal}>
          <TouchableOpacity onPress={onClose} style={styles.badgeModalClose}>
            <Ionicons name="close" size={16} color={C.inkMute} />
          </TouchableOpacity>

          <View style={[styles.badgeModalEmoji, { backgroundColor: tint + '14', borderColor: tint + '44' }]}>
            <Text style={{ fontSize: 36 }}>{badge.emoji}</Text>
          </View>
          <Text style={styles.badgeModalName}>{badge.name}</Text>
          <Text style={[styles.badgeModalTier, { color: tint }]}>{badge.tier}</Text>

          {def ? (
            <View style={styles.badgeModalHow}>
              <Text style={styles.badgeModalHowKicker}>HOW TO EARN</Text>
              <Text style={styles.badgeModalHowText}>{def.description}</Text>
            </View>
          ) : null}

          {earnedDate ? (
            <Text style={styles.badgeModalEarned}>
              Earned on <Text style={{ fontWeight: '700', color: C.inkSoft }}>{earnedDate}</Text>
            </Text>
          ) : (
            <Text style={[styles.badgeModalEarned, { fontStyle: 'italic' }]}>Not yet earned</Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ── Stat cell ─────────────────────────────────────────────────────────────────

function StatCell({ value, sub, label, onPress }: {
  value: number; sub?: string; label: string; onPress?: () => void;
}) {
  const inner = (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 1 }}>
        <Text style={styles.statValue}>{value}</Text>
        {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
      </View>
      <Text style={styles.statLabel}>{label}</Text>
    </>
  );
  if (onPress) {
    return (
      <TouchableOpacity style={styles.statCell} onPress={onPress} activeOpacity={0.6}>
        {inner}
      </TouchableOpacity>
    );
  }
  return <View style={styles.statCell}>{inner}</View>;
}

// ── Nav row ───────────────────────────────────────────────────────────────────

function NavRow({
  icon, label, subtitle, count, onPress, danger,
}: {
  icon: string; label: string; subtitle?: string;
  count?: number | string; onPress: () => void; danger?: boolean;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.navRow} activeOpacity={0.7}>
      <View style={[styles.navIcon, danger && { backgroundColor: 'rgba(197,107,61,0.12)' }]}>
        <Ionicons name={icon as any} size={18} color={danger ? C.accent : C.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.navLabel, danger && { color: C.accent }]}>{label}</Text>
        {subtitle ? <Text style={styles.navSub}>{subtitle}</Text> : null}
      </View>
      {count != null ? (
        <View style={styles.navCount}>
          <Text style={styles.navCountText}>{count}</Text>
        </View>
      ) : null}
      <Ionicons name="chevron-forward" size={15} color={C.inkMute} style={{ opacity: 0.6 }} />
    </TouchableOpacity>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const router   = useRouter();
  const { getToken } = useAuth();
  const { user }     = useUser();
  const { signOut }  = useClerk();

  const [profile,      setProfile]      = useState<ProfileInfo | null>(null);
  const [parksVisited, setParksVisited] = useState(0);
  const [bucketList,   setBucketList]   = useState(0);
  const [badgesEarned, setBadgesEarned] = useState(0);
  const [totalBadges,  setTotalBadges]  = useState(0);
  const [friendCount,  setFriendCount]  = useState(0);
  const [earnedBadges, setEarnedBadges] = useState<BadgeSummary[]>([]);
  const [selectedBadge, setSelectedBadge] = useState<BadgeSummary | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(false);

  const loadData = useCallback(async () => {
    const tok = await getToken();
    if (!tok) { setLoading(false); return; }
    setLoading(true);
    setError(false);
    try {
      const [profRes, visitsRes, badgesRes, friendsRes] = await Promise.allSettled([
        apiFetch<ProfileInfo>('/api/profile', tok),
        apiFetch<any[]>('/api/visits', tok),
        apiFetch<{ badges: BadgeSummary[] }>('/api/badges', tok),
        apiFetch<any[]>('/api/friends?type=friends', tok),
      ]);

      if ([profRes, visitsRes, badgesRes, friendsRes].every(r => r.status === 'rejected')) {
        setError(true);
      }

      if (profRes.status === 'fulfilled')   setProfile(profRes.value);
      if (visitsRes.status === 'fulfilled') {
        const vs = visitsRes.value;
        const visited = [...new Set(vs.filter((v: any) => !v.is_bucket_list && v.visited_date).map((v: any) => v.park_code))];
        setParksVisited(visited.length);
        setBucketList(vs.filter((v: any) => v.is_bucket_list).length);
      }
      if (badgesRes.status === 'fulfilled') {
        const all = badgesRes.value.badges ?? [];
        const earned = all.filter((b: any) => b.earned);
        setBadgesEarned(earned.length);
        setTotalBadges(all.length);
        setEarnedBadges(earned.slice(0, 5));
      }
      if (friendsRes.status === 'fulfilled') {
        setFriendCount(Array.isArray(friendsRes.value) ? friendsRes.value.length : 0);
      }
    } catch (e) {
      console.error('Profile load error:', e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { loadData(); }, [loadData]);
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const displayName = profile?.display_name || user?.fullName || user?.username || 'Explorer';
  const username    = profile?.username || user?.username || '';
  const avatarUrl   = profile?.avatar_url || user?.imageUrl || null;
  const joinDate    = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null;
  const rank = explorerRank(parksVisited);

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out', style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/(auth)/sign-in' as never);
        },
      },
    ]);
  };

  if (loading && !profile) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (error && !profile) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <Ionicons name="cloud-offline-outline" size={36} color={C.inkMute} />
          <Text style={{ color: C.inkMute, fontSize: 15, fontWeight: '600' }}>Failed to load</Text>
          <TouchableOpacity
            onPress={() => loadData()}
            style={{ paddingHorizontal: 20, paddingVertical: 10, backgroundColor: C.primary, borderRadius: 12 }}
          >
            <Text style={{ color: '#FFFBF1', fontWeight: '700', fontSize: 14 }}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

        {/* ── Hero header ──────────────────────────────────────────────────── */}
        <View style={styles.hero}>
          {/* Avatar */}
          <View style={styles.avatarWrap}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarInitial}>{(displayName[0] ?? 'E').toUpperCase()}</Text>
              </View>
            )}
          </View>

          {/* Name + handle + join date */}
          <View style={{ marginTop: 14, alignItems: 'center' }}>
            <Text style={styles.heroName}>{displayName}</Text>
            {username ? (
              <Text style={styles.heroHandle}>@{username}</Text>
            ) : null}
            <View style={styles.heroMeta}>
              {joinDate ? (
                <Text style={styles.heroMetaText}>Joined {joinDate}</Text>
              ) : null}
              <View style={styles.rankBadge}>
                <Text style={styles.rankText}>{rank}</Text>
              </View>
            </View>
            {profile?.bio ? (
              <Text style={styles.heroBio}>{profile.bio}</Text>
            ) : null}
          </View>
        </View>

        {/* ── Stats strip ──────────────────────────────────────────────────── */}
        <View style={styles.statsStrip}>
          <StatCell value={parksVisited} sub="/63" label="PARKS" />
          <View style={styles.statDivider} />
          <StatCell value={bucketList}   label="BUCKET" />
          <View style={styles.statDivider} />
          <StatCell value={badgesEarned} sub={`/${totalBadges}`} label="BADGES" />
          <View style={styles.statDivider} />
          <StatCell value={friendCount}  label="FRIENDS" onPress={() => router.push('/profile/friends' as never)} />
        </View>

        {/* ── Mini passport card ───────────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.passportCard}
          onPress={() => router.push('/profile/passport' as never)}
          activeOpacity={0.88}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.passportKicker}>PARKQUEST · PASSPORT</Text>
            <Text style={styles.passportName} numberOfLines={1}>
              {displayName.toUpperCase()}
            </Text>
            {username ? <Text style={styles.passportHandle}>@{username}</Text> : null}
            <View style={styles.passportStats}>
              {[
                { label: 'VISITED', value: `${parksVisited}/63` },
                { label: 'BUCKET',  value: String(bucketList) },
                { label: 'CLASS',   value: rank },
                { label: 'BADGES',  value: String(badgesEarned) },
              ].map(s => (
                <View key={s.label} style={styles.passportStatItem}>
                  <Text style={styles.passportStatLabel}>{s.label}</Text>
                  <Text style={styles.passportStatVal}>{s.value}</Text>
                </View>
              ))}
            </View>
          </View>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.passportAvatar} />
          ) : null}
        </TouchableOpacity>

        {/* ── Earned badges preview ────────────────────────────────────────── */}
        {earnedBadges.length > 0 && (
          <View style={styles.badgesPreview}>
            <View style={styles.sectionHeader}>
              <Ionicons name="ribbon-outline" size={13} color={C.inkMute} />
              <Text style={styles.sectionKicker}>EARNED</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 4 }}>
              {earnedBadges.map(b => (
                <TouchableOpacity
                  key={b.id}
                  onPress={() => setSelectedBadge(b)}
                  activeOpacity={0.7}
                  style={styles.badgePreviewItem}
                >
                  <View style={[styles.badgeCircle, { backgroundColor: (TIER_COLOR[b.tier] ?? '#B27339') + '22', borderColor: (TIER_COLOR[b.tier] ?? '#B27339') + '55' }]}>
                    <Text style={{ fontSize: 22 }}>{b.emoji}</Text>
                  </View>
                  <Text style={styles.badgePreviewName} numberOfLines={2}>{b.name}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                onPress={() => router.push('/profile/badges' as never)}
                style={styles.badgePreviewMore}
              >
                <Ionicons name="arrow-forward-circle" size={24} color={C.primary} />
                <Text style={styles.badgePreviewMoreText}>See all</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}

        {/* ── My collection nav rows ───────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="grid-outline" size={13} color={C.inkMute} />
            <Text style={styles.sectionKicker}>MY COLLECTION</Text>
          </View>
          <View style={styles.card}>
            <NavRow
              icon="ribbon-outline"
              label="Badges"
              subtitle="Achievements and milestones"
              count={badgesEarned > 0 ? `${badgesEarned}/${totalBadges}` : undefined}
              onPress={() => router.push('/profile/badges' as never)}
            />
            <View style={styles.rowDivider} />
            <NavRow
              icon="journal-outline"
              label="Journal"
              subtitle="Your park visit logs"
              count={parksVisited > 0 ? parksVisited : undefined}
              onPress={() => router.push('/profile/journal' as never)}
            />
            <View style={styles.rowDivider} />
            <NavRow
              icon="book-outline"
              label="Passport"
              subtitle="Stamps from every visit"
              count={parksVisited > 0 ? parksVisited : undefined}
              onPress={() => router.push('/profile/passport' as never)}
            />
            <View style={styles.rowDivider} />
            <NavRow
              icon="people-outline"
              label="Friends"
              subtitle="People exploring with you"
              count={friendCount > 0 ? friendCount : undefined}
              onPress={() => router.push('/profile/friends' as never)}
            />
          </View>
        </View>

        {/* ── Account settings ─────────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="person-outline" size={13} color={C.inkMute} />
            <Text style={styles.sectionKicker}>ACCOUNT</Text>
          </View>
          <View style={styles.card}>
            <NavRow
              icon="create-outline"
              label="Edit Profile"
              subtitle="Update your name, bio, and avatar"
              onPress={() => router.push('/profile/edit' as never)}
            />
            <View style={styles.rowDivider} />
            <NavRow
              icon="log-out-outline"
              label="Sign Out"
              danger
              onPress={handleSignOut}
            />
          </View>
        </View>

        {/* Attribution */}
        <Text style={styles.attribution}>ParkQuest · Track your national park adventures</Text>
        <Text style={styles.attribution}>© {new Date().getFullYear()} ParkQuest. All rights reserved.</Text>

      </ScrollView>

      {selectedBadge ? (
        <BadgeInfoModal badge={selectedBadge} onClose={() => setSelectedBadge(null)} />
      ) : null}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },

  // Hero
  hero: {
    alignItems: 'center',
    paddingTop: 28,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  avatarWrap: {
    padding: 3,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: C.hairline,
    backgroundColor: C.surface,
  },
  avatar: {
    width: 84, height: 84, borderRadius: 42,
  },
  avatarFallback: {
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 30, fontWeight: '900', color: '#FFFBF1',
  },
  heroName: {
    fontSize: 26, fontWeight: '800', color: C.ink, letterSpacing: -0.5, textAlign: 'center',
  },
  heroHandle: {
    fontSize: 12, fontWeight: '600', color: C.inkMute, letterSpacing: 0.8, marginTop: 2,
  },
  heroMeta: {
    flexDirection: 'column', alignItems: 'center', gap: 4, marginTop: 6,
  },
  heroMetaText: {
    fontSize: 11, color: C.inkMute,
  },
  rankBadge: {
    backgroundColor: C.primary + '18',
    borderRadius: 100,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  rankText: {
    fontSize: 9, fontWeight: '800', color: C.primary, letterSpacing: 1.2,
  },
  heroBio: {
    fontSize: 13.5, color: C.inkSoft, lineHeight: 19, textAlign: 'center', marginTop: 10, maxWidth: 300,
  },

  // Stats strip
  statsStrip: {
    flexDirection: 'row', marginHorizontal: 16, marginBottom: 20,
    backgroundColor: C.surface, borderRadius: 14,
    borderWidth: 0.5, borderColor: C.hairline, overflow: 'hidden',
  },
  statCell: {
    flex: 1, alignItems: 'center', paddingVertical: 18,
  },
  statValue: {
    fontSize: 28, fontWeight: '900', color: C.ink, letterSpacing: -0.8, lineHeight: 30,
  },
  statSub: {
    fontSize: 14, fontWeight: '600', color: C.inkMute, marginLeft: 1,
  },
  statLabel: {
    fontSize: 9.5, fontWeight: '700', color: C.inkMute, letterSpacing: 1.4,
    textTransform: 'uppercase', marginTop: 4,
  },
  statDivider: {
    width: 0.5, backgroundColor: C.hairline, marginVertical: 10,
  },

  // Passport card
  passportCard: {
    marginHorizontal: 16,
    marginBottom: 20,
    borderRadius: 14,
    padding: '20px' as any,
    paddingHorizontal: 20,
    paddingVertical: 18,
    backgroundColor: C.primaryDeep,
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.3)',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    // Topo-like inner pattern using shadow
    shadowColor: C.primaryDeep,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  passportKicker: {
    fontSize: 8, fontWeight: '600', color: 'rgba(201,169,74,0.7)',
    letterSpacing: 2, marginBottom: 6,
  },
  passportName: {
    fontSize: 20, fontWeight: '900', color: C.gold, letterSpacing: 2.5, lineHeight: 22,
  },
  passportHandle: {
    fontSize: 9, fontWeight: '600', color: 'rgba(201,169,74,0.6)', letterSpacing: 0.8, marginTop: 2,
  },
  passportStats: {
    flexDirection: 'row', flexWrap: 'wrap', marginTop: 14, paddingTop: 12,
    borderTopWidth: 0.5, borderTopColor: 'rgba(201,169,74,0.2)',
  },
  passportStatItem: {
    width: '50%', marginBottom: 10,
  },
  passportStatLabel: {
    fontSize: 7, fontWeight: '600', color: 'rgba(201,169,74,0.55)', letterSpacing: 1.2,
  },
  passportStatVal: {
    fontSize: 11, fontWeight: '700', color: C.gold, marginTop: 2, letterSpacing: 0.2,
  },
  passportAvatar: {
    width: 44, height: 44, borderRadius: 6,
    borderWidth: 1.5, borderColor: 'rgba(201,169,74,0.4)',
    marginTop: 4,
  },

  // Badges preview
  badgesPreview: {
    marginBottom: 20, paddingLeft: 16,
  },

  badgePreviewItem: {
    alignItems: 'center', width: 70,
  },
  badgeCircle: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, marginBottom: 6,
  },
  badgePreviewName: {
    fontSize: 10, fontWeight: '600', color: C.ink, textAlign: 'center', lineHeight: 13,
  },
  badgePreviewMore: {
    width: 70, alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  badgePreviewMoreText: {
    fontSize: 10, fontWeight: '600', color: C.primary,
  },

  // Sections
  section: {
    marginHorizontal: 16, marginBottom: 16,
  },
  sectionHeader: {
    marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  sectionKicker: {
    fontSize: 10, fontWeight: '700', color: C.inkMute, letterSpacing: 1.4, textTransform: 'uppercase',
  },
  sectionTitle: {
    fontSize: 17, fontWeight: '800', color: C.ink, letterSpacing: -0.2, marginTop: 2,
  },
  card: {
    backgroundColor: C.surface, borderRadius: 14,
    borderWidth: 0.5, borderColor: C.hairline, overflow: 'hidden',
  },

  // Nav row
  navRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  navIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: C.primary + '12',
    alignItems: 'center', justifyContent: 'center',
  },
  navLabel: {
    fontSize: 14, fontWeight: '700', color: C.ink, marginBottom: 1,
  },
  navSub: {
    fontSize: 11.5, color: C.inkMute,
  },
  navCount: {
    backgroundColor: C.surfaceAlt, borderRadius: 100,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  navCountText: {
    fontSize: 11, fontWeight: '700', color: C.inkSoft,
  },
  rowDivider: {
    height: 0.5, backgroundColor: C.hairline, marginLeft: 66,
  },

  // Attribution
  attribution: {
    textAlign: 'center', fontSize: 11, color: C.inkMute,
    marginTop: 24, marginHorizontal: 16,
  },

  // Badge detail modal — light theme, matches web profile BadgeModal
  badgeOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  badgeModal: {
    backgroundColor: C.bg, borderRadius: 18,
    borderWidth: 0.5, borderColor: C.hairline,
    paddingVertical: 32, paddingHorizontal: 28,
    width: '100%', maxWidth: 360, alignItems: 'center',
  },
  badgeModalClose: {
    position: 'absolute', top: 14, right: 14, zIndex: 10, padding: 4,
  },
  badgeModalEmoji: {
    width: 72, height: 72, borderRadius: 20, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  badgeModalName: {
    fontSize: 20, fontWeight: '800', color: C.ink,
    letterSpacing: -0.3, textAlign: 'center',
  },
  badgeModalTier: {
    fontSize: 9, fontWeight: '700', letterSpacing: 1.6,
    textTransform: 'uppercase', marginTop: 5, marginBottom: 20,
  },
  badgeModalHow: {
    backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.hairline,
    borderRadius: 10, paddingVertical: 14, paddingHorizontal: 16,
    marginBottom: 16, alignSelf: 'stretch',
  },
  badgeModalHowKicker: {
    fontSize: 8.5, fontWeight: '600', letterSpacing: 1.2,
    color: C.inkMute, marginBottom: 6,
  },
  badgeModalHowText: {
    fontSize: 13.5, color: C.inkSoft, lineHeight: 21,
  },
  badgeModalEarned: {
    fontSize: 12, color: C.inkMute, textAlign: 'center',
  },
});
