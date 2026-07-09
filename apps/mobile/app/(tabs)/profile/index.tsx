import {
  ActivityIndicator, Animated, Dimensions, Image, Linking, ScrollView, Share, StyleSheet,
  Text, TouchableOpacity, View, Alert,
} from 'react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth, useUser, useClerk } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { BADGE_TIER_COLORS, type BadgeTier } from '@/lib/badges';
import { BadgeInfoModal } from '@/components/BadgeInfoModal';
import { Wordmark } from '@/components/Wordmark';
import { ParkStamp } from '@/components/ParkStamp';
import { SearchOverlay } from '@/components/SearchOverlay';
import { NotificationBell } from '@/components/NotificationCenter';
import { EmptyState } from '@/components/EmptyState';
import { STATIC as C, useColors } from '@/lib/palette';
import { useTabBarSpace } from '@/components/FloatingTabBar';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';

// Passport gold foil — fixed across palettes, matches the passport screen
const GOLD = '#C9A94A';

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

interface Park {
  park_code: string;
  name: string;
  states: string;
}

interface StampPreview {
  park_code: string;
  name: string;
  states: string;
  colorIdx: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function tierFill(tier: string): string {
  return (BADGE_TIER_COLORS[tier as BadgeTier] ?? BADGE_TIER_COLORS.bronze).fill;
}

async function apiFetch<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Loading skeletons — subtle placeholders while data streams in ──────────────

function usePulse() {
  const pulse = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.55, duration: 750, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return pulse;
}

// Passport-card identity placeholder — sits where the name/handle render
function NameSkeleton() {
  const pulse = usePulse();
  return (
    <View>
      <Animated.View style={[styles.skeletonName, { opacity: pulse }]} />
      <Animated.View style={[styles.skeletonHandle, { opacity: pulse }]} />
    </View>
  );
}

// Horizontal strip placeholder — matches the stamp/badge preview rows
function PreviewSkeleton() {
  const pulse = usePulse();
  return (
    <Animated.View style={{ flexDirection: 'row', gap: 10, paddingBottom: 4, opacity: pulse }}>
      {[0, 1, 2, 3].map(i => (
        <View key={i} style={styles.badgePreviewItem}>
          <View style={styles.skeletonCircle} />
          <View style={styles.skeletonLine} />
        </View>
      ))}
    </Animated.View>
  );
}

// ── Nav row ───────────────────────────────────────────────────────────────────

function NavRow({
  icon, label, subtitle, count, onPress, danger,
}: {
  icon: string; label: string; subtitle?: string;
  count?: number | string; onPress: () => void; danger?: boolean;
}) {
  const T = useColors();
  return (
    <TouchableOpacity onPress={onPress} style={styles.navRow} activeOpacity={0.7}>
      <View style={[styles.navIcon, { backgroundColor: T.primary + '12' }, danger && { backgroundColor: `${T.accent}1F` }]}>
        <Ionicons name={icon as any} size={18} color={danger ? T.accent : T.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.navLabel, danger && { color: T.accent }]}>{label}</Text>
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
  const C = useColors();
  const tabBarSpace = useTabBarSpace();
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
  const [rawVisits, setRawVisits] = useState<any[]>([]);
  const [searchOpen,   setSearchOpen]   = useState(false);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(false);
  // Per-fetch success flags — sections show skeletons until their data has
  // actually arrived, so an offline/slow start never looks like an empty account
  const [visitsLoaded,  setVisitsLoaded]  = useState(false);
  const [badgesLoaded,  setBadgesLoaded]  = useState(false);
  const [friendsLoaded, setFriendsLoaded] = useState(false);

  // getToken from @clerk/clerk-expo is a new function every render — keeping it
  // in dep arrays re-triggers effects on each render and loops fetches forever.
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const loadData = useCallback(async () => {
    const tok = await getTokenRef.current();
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
        setRawVisits(vs);
        setVisitsLoaded(true);
      }
      if (badgesRes.status === 'fulfilled') {
        const all = badgesRes.value.badges ?? [];
        const earned = all.filter((b: any) => b.earned);
        setBadgesEarned(earned.length);
        setTotalBadges(all.length);
        setEarnedBadges(earned.slice(0, 5));
        setBadgesLoaded(true);
      }
      if (friendsRes.status === 'fulfilled') {
        setFriendCount(Array.isArray(friendsRes.value) ? friendsRes.value.length : 0);
        setFriendsLoaded(true);
      }
    } catch (e) {
      console.error('Profile load error:', e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  // null = identity not loaded yet (offline/slow) — show a skeleton, not "Explorer"
  const realName    = profile?.display_name || user?.fullName || user?.username || null;
  const displayName = realName ?? 'Explorer';
  const username    = profile?.username || user?.username || '';
  const avatarUrl   = profile?.avatar_url || user?.imageUrl || null;
  const joinDate    = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null;
  const mapParks = useMemo(() => {
    const seen = new Set<string>();
    return rawVisits
      .filter((v: any) => {
        if (!v.latitude || !v.longitude || v.is_bucket_list || !v.visited_date) return false;
        if (seen.has(v.park_code)) return false;
        seen.add(v.park_code);
        return true;
      })
      .map((v: any) => ({
        park_code: v.park_code,
        name: v.park_name,
        lat: parseFloat(v.latitude),
        lng: parseFloat(v.longitude),
      }))
      .filter((p: any) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  }, [rawVisits]);

  const mapRegion = useMemo(() => {
    if (mapParks.length === 0) return undefined;
    const lats = mapParks.map(p => p.lat);
    const lngs = mapParks.map(p => p.lng);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max((maxLat - minLat) * 1.5, 4),
      longitudeDelta: Math.max((maxLng - minLng) * 1.5, 6),
    };
  }, [mapParks]);

  // Most recent stamps first; colorIdx = chronological index so colors match the passport screen
  const recentStamps = useMemo((): StampPreview[] => {
    const byPark = new Map<string, any>();
    rawVisits.forEach((v: any) => {
      if (!v.is_bucket_list && v.visited_date) byPark.set(v.park_code, v);
    });
    return [...byPark.values()]
      .sort((a, b) => (a.visited_date ?? '').localeCompare(b.visited_date ?? ''))
      .map((v, idx) => ({
        park_code: v.park_code,
        name: v.park_name ?? v.park_code,
        states: v.states ?? '',
        colorIdx: idx,
      }))
      .slice(-5)
      .reverse();
  }, [rawVisits]);

  const handleShare = async () => {
    if (!user?.id) return;
    // Universal Link — opens the app if installed, web profile otherwise
    const url = username
      ? `https://parkquest.me/u/${username}`
      : `parkquest://user/${user.id}`;
    try {
      await Share.share({
        message: `Follow ${displayName} on ParkQuest and explore national parks together! ${url}`,
      });
    } catch {
      // user dismissed the share sheet
    }
  };

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

  const CARD_W = Dimensions.get('window').width - 32; // card = screen - 2×16 margin

  // MRZ-style bottom strip — encodes real user data in passport MRZ format
  const mrzLine1 = (() => {
    const parts = displayName.toUpperCase().replace(/[^A-Z ]/g, '').split(' ');
    const surname = (parts[0] ?? 'UNKNOWN').slice(0, 12);
    const given = (parts.slice(1).join('<') || 'EXPLORER').slice(0, 10);
    const raw = `P<USA<<${surname}<<${given}`;
    return raw.padEnd(44, '<').slice(0, 44);
  })();

  const mrzLine2 = (() => {
    const uid = user?.id?.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(-7).padStart(7, '0') ?? '0000000';
    const joined = user?.createdAt
      ? new Date(user.createdAt).toISOString().slice(2, 10).replace(/-/g, '')
      : '000000';
    const parks3 = String(parksVisited).padStart(3, '0');
    const uname = username.toUpperCase().slice(0, 9).padEnd(9, '<');
    const raw = `${uid}<USA${joined}${parks3}${uname}`;
    return raw.padEnd(44, '<').slice(0, 44);
  })();

  // Top bar — wordmark + actions, matches feed
  const topBar = (
    <View style={styles.topBar}>
      <Wordmark />
      <View style={styles.topBarActions}>
        <NotificationBell style={styles.iconBtn} />
        <TouchableOpacity
          style={styles.iconBtn}
          activeOpacity={0.7}
          onPress={() => setSearchOpen(true)}
        >
          <Ionicons name="search" size={17} color={C.inkSoft} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.iconBtn}
          activeOpacity={0.8}
          onPress={() => router.push('/profile/edit' as never)}
        >
          <Ionicons name="settings-outline" size={17} color={C.inkSoft} />
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading && !profile) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        {topBar}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (error && !profile) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        {topBar}
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
      {topBar}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: tabBarSpace + 16 }}>

        {/* ── Passport hero card ───────────────────────────────────────────── */}
        <TouchableOpacity
          style={[styles.passportCard, { backgroundColor: C.primaryDeep, shadowColor: C.primaryDeep }]}
          onPress={() => router.push('/profile/passport' as never)}
          activeOpacity={0.88}
        >
          {/* Wavy background texture */}
          <Svg
            width={CARD_W}
            height={400}
            viewBox={`0 0 ${CARD_W} 400`}
            style={{ position: 'absolute', top: 0, left: 0 }}
          >
            {[0, 22, 44, 66, 88, 110, 132, 154, 176, 198, 220, 242, 264, 286, 308, 330, 352, 374, 396].map((y, i) => {
              const W = CARD_W;
              return (
                <Path
                  key={i}
                  d={`M0 ${y} C ${W * 0.18} ${y - 13}, ${W * 0.38} ${y + 13}, ${W * 0.5} ${y} S ${W * 0.82} ${y - 13}, ${W} ${y}`}
                  stroke="rgba(201,169,74,0.07)"
                  strokeWidth={1.5}
                  fill="none"
                />
              );
            })}
          </Svg>

          {/* Watermark strip */}
          <Text style={styles.passportWatermark} numberOfLines={1} ellipsizeMode="clip" pointerEvents="none">
            {'PARKQUEST • '.repeat(16)}
          </Text>

          {/* Share profile — top-right corner */}
          <TouchableOpacity
            style={styles.shareBtn}
            activeOpacity={0.7}
            onPress={handleShare}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="share-outline" size={15} color="#C9A94A" />
          </TouchableOpacity>

          <View style={styles.passportHeader}>
            <View style={styles.avatarWrap}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: C.primary }]}>
                  {realName ? (
                    <Text style={styles.avatarInitial}>{realName[0].toUpperCase()}</Text>
                  ) : (
                    <Ionicons name="person" size={30} color="rgba(255,251,241,0.45)" />
                  )}
                </View>
              )}
            </View>
            <View style={{ flex: 1, paddingRight: 30 }}>
              {realName ? (
                <>
                  <Text style={styles.passportName} numberOfLines={1} adjustsFontSizeToFit>
                    {realName}
                  </Text>
                  {username ? <Text style={styles.passportHandle}>@{username}</Text> : null}
                  {joinDate ? <Text style={styles.passportJoined}>Joined {joinDate}</Text> : null}
                </>
              ) : (
                <NameSkeleton />
              )}
            </View>
          </View>

          {profile?.bio ? (
            <Text style={styles.passportBio}>{profile.bio}</Text>
          ) : null}

          <View style={styles.passportStats}>
            {([
              { label: 'VISITED', value: visitsLoaded ? `${parksVisited}/63` : '–' },
              { label: 'BUCKET',  value: visitsLoaded ? String(bucketList) : '–' },
              { label: 'BADGES',  value: badgesLoaded ? String(badgesEarned) : '–' },
              { label: 'FRIENDS', value: friendsLoaded ? String(friendCount) : '–' },
            ] as { label: string; value: string }[]).map(s => (
              <View key={s.label} style={styles.passportStatItem}>
                <Text style={styles.passportStatLabel}>{s.label}</Text>
                <Text style={styles.passportStatVal}>{s.value}</Text>
              </View>
            ))}
          </View>

          {/* Stamp count progress line — mirrors the passport page */}
          <View style={styles.passportProgress}>
            <Text style={styles.passportProgressText}>
              {visitsLoaded ? `${parksVisited} of 63 parks stamped` : 'Loading…'}
            </Text>
            <View style={styles.passportProgressTrack}>
              <View style={[styles.passportProgressFill, { width: `${(parksVisited / 63) * 100}%` as `${number}%` }]} />
            </View>
          </View>

          {/* MRZ strip */}
          <View style={{ marginTop: 2, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: 'rgba(201,169,74,0.15)' }}>
            <Text style={styles.mrzText} numberOfLines={1}>{mrzLine1}</Text>
            <Text style={styles.mrzText} numberOfLines={1}>{mrzLine2}</Text>
          </View>
        </TouchableOpacity>

        {/* ── Recent stamps preview — skeleton until visits load, hidden only when truly empty ── */}
        {(!visitsLoaded || recentStamps.length > 0) && (
          <View style={styles.badgesPreview}>
            <View style={styles.sectionHeader}>
              <Ionicons name="book-outline" size={13} color={C.inkMute} />
              <Text style={styles.sectionKicker}>RECENT STAMPS</Text>
            </View>
            {!visitsLoaded ? <PreviewSkeleton /> : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 4 }}>
              {recentStamps.map(s => (
                <TouchableOpacity
                  key={s.park_code}
                  onPress={() => router.push(`/parks/${s.park_code}` as never)}
                  activeOpacity={0.7}
                  style={styles.badgePreviewItem}
                >
                  <View style={{ marginBottom: 6 }}>
                    <ParkStamp
                      parkCode={s.park_code}
                      name={s.name}
                      states={s.states}
                      colorIdx={s.colorIdx}
                      size={52}
                      idSuffix="-profile"
                    />
                  </View>
                  <Text style={styles.badgePreviewName} numberOfLines={2}>{s.name}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                onPress={() => router.push('/profile/passport' as never)}
                style={styles.badgePreviewItem}
                activeOpacity={0.7}
              >
                <Svg width={52} height={52} viewBox="0 0 52 52" style={{ marginBottom: 6 }}>
                  <Circle
                    cx={26} cy={26} r={25.5}
                    fill="none"
                    stroke={C.primary}
                    strokeWidth={1}
                    strokeDasharray="3 2.5"
                  />
                  <SvgText
                    x={26} y={19.5}
                    textAnchor="middle"
                    alignmentBaseline="central"
                    fill={C.primary}
                    fontSize={9.5}
                    fontWeight="800"
                    letterSpacing={0.6}
                  >SEE</SvgText>
                  <SvgText
                    x={26} y={32.5}
                    textAnchor="middle"
                    alignmentBaseline="central"
                    fill={C.primary}
                    fontSize={9.5}
                    fontWeight="800"
                    letterSpacing={0.6}
                  >ALL</SvgText>
                </Svg>
                <Text style={[styles.badgePreviewName, { color: C.primary }]} numberOfLines={2}>All Stamps</Text>
              </TouchableOpacity>
            </ScrollView>
            )}
          </View>
        )}

        {/* ── Earned badges preview — skeleton until badges load, hidden only when truly empty ── */}
        {(!badgesLoaded || earnedBadges.length > 0) && (
          <View style={styles.badgesPreview}>
            <View style={styles.sectionHeader}>
              <Ionicons name="ribbon-outline" size={13} color={C.inkMute} />
              <Text style={styles.sectionKicker}>EARNED</Text>
            </View>
            {!badgesLoaded ? <PreviewSkeleton /> : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 4 }}>
              {earnedBadges.map(b => (
                <TouchableOpacity
                  key={b.id}
                  onPress={() => setSelectedBadge(b)}
                  activeOpacity={0.7}
                  style={styles.badgePreviewItem}
                >
                  <View style={[styles.badgeCircle, { backgroundColor: tierFill(b.tier) + '22', borderColor: tierFill(b.tier) + '55' }]}>
                    <Text style={{ fontSize: 22 }}>{b.emoji}</Text>
                  </View>
                  <Text style={styles.badgePreviewName} numberOfLines={2}>{b.name}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                onPress={() => router.push('/profile/badges' as never)}
                style={styles.badgePreviewItem}
                activeOpacity={0.7}
              >
                <Svg width={52} height={52} viewBox="0 0 52 52" style={{ marginBottom: 6 }}>
                  <Circle
                    cx={26} cy={26} r={25.5}
                    fill="none"
                    stroke={C.primary}
                    strokeWidth={1}
                    strokeDasharray="3 2.5"
                  />
                  <SvgText
                    x={26} y={19.5}
                    textAnchor="middle"
                    alignmentBaseline="central"
                    fill={C.primary}
                    fontSize={9.5}
                    fontWeight="800"
                    letterSpacing={0.6}
                  >SEE</SvgText>
                  <SvgText
                    x={26} y={32.5}
                    textAnchor="middle"
                    alignmentBaseline="central"
                    fill={C.primary}
                    fontSize={9.5}
                    fontWeight="800"
                    letterSpacing={0.6}
                  >ALL</SvgText>
                </Svg>
                <Text style={[styles.badgePreviewName, { color: C.primary }]} numberOfLines={2}>All Badges</Text>
              </TouchableOpacity>
            </ScrollView>
            )}
          </View>
        )}

        {/* ── Visited parks map ────────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="map-outline" size={13} color={C.inkMute} />
            <Text style={styles.sectionKicker}>VISITED PARKS</Text>
          </View>
          <TouchableOpacity
            style={styles.mapCard}
            activeOpacity={0.85}
            onPress={() => router.push('/(tabs)/map' as never)}
          >
            {mapParks.length > 0 ? (
              <MapView
                style={{ width: '100%', height: 200, borderRadius: 14 }}
                provider={PROVIDER_DEFAULT}
                initialRegion={mapRegion}
                rotateEnabled={false}
                pitchEnabled={false}
                scrollEnabled={false}
                zoomEnabled={false}
                toolbarEnabled={false}
                pointerEvents="none"
              >
                {mapParks.map(p => (
                  <Marker
                    key={p.park_code}
                    coordinate={{ latitude: p.lat, longitude: p.lng }}
                    tracksViewChanges={false}
                  >
                    <View style={styles.markerDot} />
                  </Marker>
                ))}
              </MapView>
            ) : visitsLoaded ? (
              <View style={styles.mapEmpty}>
                <EmptyState
                  icon="map-outline"
                  title="No park visits yet"
                  action={{
                    label: 'Add a visit',
                    // Nested TouchableOpacity — claims the touch itself, so this
                    // doesn't also trigger the card's own onPress (which pushes
                    // to the full map view).
                    onPress: () => router.push('/(modals)/log-visit' as never),
                  }}
                />
              </View>
            ) : (
              <View style={styles.mapEmpty}>
                <ActivityIndicator size="small" color={C.inkMute} />
              </View>
            )}
          </TouchableOpacity>
        </View>

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
              count={badgesEarned > 0 ? badgesEarned : undefined}
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
              onPress={() => router.push('/profile/edit' as never)}
            />
            <View style={styles.rowDivider} />
            <NavRow
              icon="ban-outline"
              label="Blocked Users"
              onPress={() => router.push('/profile/blocked' as never)}
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

        {user?.publicMetadata?.role === 'admin' && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="shield-outline" size={13} color={C.inkMute} />
              <Text style={styles.sectionKicker}>ADMIN</Text>
            </View>
            <View style={styles.card}>
              <NavRow
                icon="analytics-outline"
                label="Admin Dashboard"
                subtitle="Reports queue and app stats"
                onPress={() => router.push('/admin' as never)}
              />
            </View>
          </View>
        )}

        {/* Attribution */}
        <Text style={styles.attribution}>
          © {new Date().getFullYear()}{' '}
          <Text
            style={{ fontWeight: '600' }}
            onPress={() => Linking.openURL('https://parkquest.me')}
            suppressHighlighting
          >
            ParkQuest
          </Text>
          {' '}· Track your national park adventures
        </Text>
      </ScrollView>

      {selectedBadge ? (
        <BadgeInfoModal badge={selectedBadge} onClose={() => setSelectedBadge(null)} />
      ) : null}

      <SearchOverlay visible={searchOpen} onClose={() => setSearchOpen(false)} />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },

  // Avatar
  avatarWrap: {
    padding: 1.5,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: C.hairline,
    backgroundColor: C.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  avatar: {
    width: 84, height: 84, borderRadius: 42,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 30, fontWeight: '900', color: C.onPrimary,
  },

  // Passport card
  passportCard: {
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 20,
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.3)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
    overflow: 'hidden',
  },
  passportWatermark: {
    marginTop: -8,
    marginHorizontal: -20,
    marginBottom: 12,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 2.2,
    color: 'rgba(201,169,74,0.28)',
  },
  passportHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
  },
  shareBtn: {
    position: 'absolute', top: 28, right: 12, zIndex: 2,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(201,169,74,0.12)',
    borderWidth: 1, borderColor: 'rgba(201,169,74,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },
  passportName: {
    fontSize: 26, fontWeight: '800', color: GOLD, letterSpacing: -0.5,
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },
  passportHandle: {
    fontSize: 13, fontWeight: '600', color: 'rgba(201,169,74,0.85)', letterSpacing: 0.8, marginTop: 2,
  },
  passportJoined: {
    fontSize: 13, color: 'rgba(201,169,74,0.8)', marginTop: 4,
  },
  passportBio: {
    fontSize: 13.5, color: 'rgba(255,251,241,0.75)', lineHeight: 19, marginTop: 12,
  },
  passportStats: {
    flexDirection: 'row', flexWrap: 'wrap', marginTop: 14, paddingTop: 12,
    borderTopWidth: 0.5, borderTopColor: 'rgba(201,169,74,0.2)',
  },
  passportStatItem: {
    width: '50%', marginBottom: 10,
  },
  passportStatLabel: {
    fontSize: 13, fontWeight: '600', color: 'rgba(201,169,74,0.8)', letterSpacing: 1.2,
  },
  passportStatVal: {
    fontSize: 13, fontWeight: '700', color: GOLD, marginTop: 2, letterSpacing: 0.2,
    textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },
  passportProgress: {
    gap: 6,
    marginTop: 2,
    marginBottom: 10,
  },
  passportProgressText: {
    fontSize: 11,
    fontWeight: '600',
    color: GOLD,
    opacity: 0.7,
    letterSpacing: 0.5,
  },
  passportProgressTrack: {
    height: 3,
    backgroundColor: GOLD + '22',
    borderRadius: 2,
    overflow: 'hidden',
  },
  passportProgressFill: {
    height: 3,
    backgroundColor: GOLD,
    borderRadius: 2,
    opacity: 0.85,
  },
  mrzText: {
    fontFamily: 'JetBrainsMono_400Regular',
    fontSize: 9,
    color: 'rgba(201,169,74,0.35)',
    letterSpacing: 1.5,
    lineHeight: 14,
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
    fontSize: 13, fontWeight: '600', color: C.ink, textAlign: 'center', lineHeight: 13,
  },

  // Sections
  section: {
    marginHorizontal: 16, marginBottom: 20,
  },
  sectionHeader: {
    marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  sectionKicker: {
    fontSize: 13, fontWeight: '700', color: C.inkMute, letterSpacing: 1.4, textTransform: 'uppercase',
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
    alignItems: 'center', justifyContent: 'center',
  },
  navLabel: {
    fontSize: 14, fontWeight: '700', color: C.ink, marginBottom: 1,
  },
  navSub: {
    fontSize: 13, color: C.inkMute,
  },
  navCount: {
    backgroundColor: C.surfaceAlt, borderRadius: 100,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  navCountText: {
    fontSize: 13, fontWeight: '700', color: C.inkSoft,
  },
  rowDivider: {
    height: 0.5, backgroundColor: C.hairline, marginLeft: 66,
  },

  // Map
  mapCard: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: C.hairline,
    backgroundColor: '#CECDBC',
  },
  mapEmpty: {
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.surface,
    borderRadius: 14,
  },
  mapEmptyText: {
    fontSize: 13,
    color: C.inkMute,
  },
  markerDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: C.visited,
    borderWidth: 2,
    borderColor: C.onPrimary,
  },

  // Loading skeletons
  skeletonName: {
    width: 150, height: 22, borderRadius: 6,
    backgroundColor: 'rgba(201,169,74,0.25)', marginTop: 4,
  },
  skeletonHandle: {
    width: 90, height: 11, borderRadius: 5,
    backgroundColor: 'rgba(201,169,74,0.16)', marginTop: 8,
  },
  skeletonCircle: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(27,26,22,0.08)', marginBottom: 6,
  },
  skeletonLine: {
    width: 48, height: 9, borderRadius: 5,
    backgroundColor: 'rgba(27,26,22,0.06)',
  },

  // Attribution
  attribution: {
    textAlign: 'center', fontSize: 13, color: C.inkMute,
    marginTop: 24, marginHorizontal: 16,
  },

  // Top bar — matches feed
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: C.hairline,
  },
  topBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.surface,
    borderWidth: 0.5,
    borderColor: C.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
