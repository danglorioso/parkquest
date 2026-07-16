import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DeviceEventEmitter, View, Text, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, StyleSheet,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useScrollToTop } from '@react-navigation/native';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { PostCard, type FeedPost } from '@/components/PostCard';
import { Wordmark } from '@/components/Wordmark';
import { GlassIconBg } from '@/components/GlassIconBg';
import { SearchOverlay } from '@/components/SearchOverlay';
import { NotificationBell } from '@/components/NotificationCenter';
import { OfflineBanner } from '@/components/OfflineBanner';
import { STATIC as C, dyn, useColors } from '@/lib/palette';
import { useTabBarSpace } from '@/components/FloatingTabBar';
import { useIsOnline } from '@/lib/network';
import { loadOfflineFeed, saveOfflineFeed } from '@/lib/offlineFeed';
import { onUserBlocked } from '@/lib/blocking';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

// ── Filter chip ───────────────────────────────────────────────────────────────

type Filter = 'all' | 'friends' | 'visits' | 'badges';

function FilterChip({
  label, active, primary, onPress,
}: { label: string; active: boolean; primary: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[styles.chip, active && [styles.chipActive, { backgroundColor: primary, borderColor: primary }]]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Skeleton card ─────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <View style={styles.skeleton}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <View style={styles.skeletonAvatar} />
        <View style={{ gap: 6, flex: 1 }}>
          <View style={[styles.skeletonLine, { width: '55%' }]} />
          <View style={[styles.skeletonLine, { width: '35%' }]} />
        </View>
      </View>
      <View style={[styles.skeletonLine, { width: '80%', marginBottom: 6 }]} />
      <View style={[styles.skeletonLine, { width: '60%', marginBottom: 14 }]} />
      <View style={styles.skeletonPhoto} />
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function FeedScreen() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const palette = useColors();
  const insets = useSafeAreaInsets();
  const tabBarSpace = useTabBarSpace();
  const TOP_BAR_H = insets.top + 56.5;

  const [token, setToken]         = useState<string | null>(null);
  const [posts, setPosts]         = useState<FeedPost[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef = useRef(false);
  const [filter, setFilter]       = useState<Filter>('all');
  const [error, setError]         = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [offlineFetchedAt, setOfflineFetchedAt] = useState<string | null>(null);
  const isOnline = useIsOnline();
  const hasLoadedRef = useRef(false);
  const lastFetchedAtRef = useRef<string | null>(null);

  const flatListRef = useRef<FlatList<FeedPost>>(null);
  useScrollToTop(flatListRef);
  const scrollOffsetRef = useRef(0);

  const scrollToTop = () => flatListRef.current?.scrollToOffset({ offset: 0, animated: true });

  const loadFeed = useCallback(async (isRefresh = false) => {
    // RefreshControl ends the native spinner unless `refreshing` flips true
    // synchronously inside onRefresh — set it before any await.
    if (isRefresh) {
      setRefreshing(true);
      refreshingRef.current = true;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    const tok = await getToken();
    if (!tok) { setLoading(false); setRefreshing(false); refreshingRef.current = false; return; }
    setToken(tok);

    const isFirstLoad = !hasLoadedRef.current;

    // Paint whatever's cached instantly instead of blocking on the network —
    // the live fetch below still runs and replaces it once it lands.
    let cache = isFirstLoad ? await loadOfflineFeed() : null;
    if (cache) {
      setPosts(cache.posts);
      setOfflineFetchedAt(isOnline ? null : cache.fetchedAt);
      setLoading(false);
      hasLoadedRef.current = true;
    }

    if (!isOnline) {
      if (!hasLoadedRef.current) {
        cache ??= await loadOfflineFeed();
        if (cache) {
          setPosts(cache.posts);
          setOfflineFetchedAt(cache.fetchedAt);
          hasLoadedRef.current = true;
        } else {
          setError(true);
        }
      }
      setLoading(false);
      setRefreshing(false);
      refreshingRef.current = false;
      return;
    }

    if (!isRefresh) setPosts(prev => { if (prev.length === 0) setLoading(true); return prev; });
    setError(false);
    try {
      const [res] = await Promise.all([
        fetch(`${BASE}/api/feed`, { headers: { Authorization: `Bearer ${tok}` } }),
        isRefresh ? new Promise<void>(r => setTimeout(r, 700)) : Promise.resolve(),
      ]);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPosts(data);
      setOfflineFetchedAt(null);
      hasLoadedRef.current = true;
      lastFetchedAtRef.current = new Date().toISOString();
      saveOfflineFeed(data); // silent background refresh of the offline cache
    } catch (e) {
      console.error('Feed load failed, falling back to offline cache:', e);
      cache ??= await loadOfflineFeed();
      if (cache) {
        setPosts(cache.posts);
        setOfflineFetchedAt(cache.fetchedAt);
        hasLoadedRef.current = true;
      } else if (!hasLoadedRef.current) {
        setError(true);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      refreshingRef.current = false;
    }
  }, [getToken, isOnline]);

  const loadFeedRef = useRef(loadFeed);
  loadFeedRef.current = loadFeed;

  useFocusEffect(useCallback(() => { loadFeedRef.current(); }, []));

  // React to connectivity changes without waiting for the next focus/tab-press:
  // coming back online quietly refetches (dropping the banner once fresh data
  // lands); going offline mid-session surfaces the banner right away instead of
  // leaving stale posts on screen with no indication they're out of date.
  const wasOnlineRef = useRef(isOnline);
  useEffect(() => {
    if (!wasOnlineRef.current && isOnline) {
      loadFeedRef.current();
    } else if (wasOnlineRef.current && !isOnline && hasLoadedRef.current) {
      setOfflineFetchedAt(prev => prev ?? lastFetchedAtRef.current ?? new Date().toISOString());
    }
    wasOnlineRef.current = isOnline;
  }, [isOnline]);

  // Programmatic refresh (tab re-press / wordmark tap). Fabric's begin-refresh
  // jumps the content offset without animation, so animate the pull-down reveal
  // ourselves before flipping `refreshing`, then settle at the spinner's rest
  // position once the native side has applied its own offset.
  const triggerRefresh = useCallback(() => {
    if (refreshingRef.current) return;
    // Fire the haptic + actual refetch immediately — this used to be gated behind
    // the 260ms scroll-reveal animation below, so a second tap on the feed tab
    // looked like it did nothing for a beat before anything happened. The reveal
    // is purely cosmetic and can run in parallel with the real reload instead of
    // in front of it.
    loadFeedRef.current(true);
    const list = flatListRef.current;
    list?.scrollToOffset({ offset: 0, animated: false });
    list?.scrollToOffset({ offset: -70, animated: true });
    setTimeout(() => flatListRef.current?.scrollToOffset({ offset: -60, animated: true }), 380);
  }, []);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('feedTabPress', triggerRefresh);
    return () => sub.remove();
  }, [triggerRefresh]);

  const handleDelete = useCallback((id: number) => {
    setPosts(prev => prev.filter(p => p.id !== id));
  }, []);

  // Blocking a user should hide their posts from the feed instantly, without
  // waiting on a refetch.
  useEffect(() => {
    const unsubscribe = onUserBlocked(blockedId => {
      setPosts(prev => prev.filter(p => p.clerk_user_id !== blockedId));
    });
    return unsubscribe;
  }, []);

  const filtered = posts.filter(p =>
    filter === 'friends' ? p.is_friend_post :
    filter === 'visits' ? !!p.visit_id :
    filter === 'badges' ? !!p.badge_id :
    true
  );

  // ── Header component ──────────────────────────────────────────────────────

  const ListHeader = (
    <View style={styles.header}>
      {offlineFetchedAt && (
        // The feed's FlatList already insets its content 16px horizontally
        // (contentContainerStyle), so cancel OfflineBanner's own side margin
        // here to keep it flush with the header/post cards above and below it.
        <OfflineBanner fetchedAt={offlineFetchedAt} noun="posts" style={{ marginHorizontal: 0 }} />
      )}

      {/* Page title — the sticky top bar above already carries the ParkQuest
          brand, so this stays to a single line rather than repeating it. */}
      <View style={styles.headerTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Out there</Text>
        </View>
      </View>

      {/* Filter chips — only show when there are posts */}
      {posts.length > 0 && (
        <View style={styles.chips}>
          <FilterChip label="All"     active={filter === 'all'}     primary={palette.primary} onPress={() => setFilter('all')} />
          <FilterChip label="Friends" active={filter === 'friends'} primary={palette.primary} onPress={() => setFilter(f => f === 'friends' ? 'all' : 'friends')} />
          <FilterChip label="Visits"  active={filter === 'visits'}  primary={palette.primary} onPress={() => setFilter(f => f === 'visits' ? 'all' : 'visits')} />
          <FilterChip label="Badges"  active={filter === 'badges'}  primary={palette.primary} onPress={() => setFilter(f => f === 'badges' ? 'all' : 'badges')} />
        </View>
      )}
    </View>
  );

  // ── Footer component ──────────────────────────────────────────────────────

  const ListFooter = filtered.length > 0 && !loading ? (
    <Text style={styles.endOfFeed}>◆ END OF FEED · ALL CAUGHT UP ◆</Text>
  ) : null;

  // ── Empty / loading state ─────────────────────────────────────────────────

  const ListEmpty = loading ? (
    <View style={styles.loadingContainer}>
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </View>
  ) : error ? (
    <View style={styles.emptyContainer}>
      <Ionicons name="cloud-offline-outline" size={36} color={C.inkMute} />
      <Text style={[styles.emptyTitle, { marginTop: 8 }]}>Failed to load</Text>
      <TouchableOpacity
        onPress={() => loadFeed()}
        style={{ marginTop: 4, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: palette.primary, borderRadius: 12 }}
      >
        <Text style={{ color: C.onPrimary, fontWeight: '700', fontSize: 14 }}>Retry</Text>
      </TouchableOpacity>
    </View>
  ) : (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyEmoji}>{filter === 'friends' ? '⛰️' : '🌲'}</Text>
      <Text style={styles.emptyTitle}>
        {posts.length === 0
          ? 'No posts yet'
          : `No ${filter} posts yet`}
      </Text>
      <Text style={styles.emptyBody}>
        {posts.length === 0
          ? 'Log a visit or add friends to see activity here.'
          : 'Try switching the filter above.'}
      </Text>
    </View>
  );

  return (
    <View style={styles.screen}>
      <FlatList<FeedPost>
        ref={flatListRef}
        data={loading ? [] : filtered}
        keyExtractor={item => String(item.id)}
        renderItem={({ item }) =>
          token ? (
            <PostCard
              post={item}
              myUserId={user?.id ?? ''}
              myAvatarUrl={user?.imageUrl}
              myName={user?.fullName ?? user?.username}
              onDelete={handleDelete}
              onParkPress={(code) => router.push(`/(tabs)/feed/park/${code}` as never)}
            />
          ) : null
        }
        ListHeaderComponent={ListHeader}
        ListFooterComponent={ListFooter}
        ListEmptyComponent={ListEmpty}
        style={{ marginTop: TOP_BAR_H }}
        contentContainerStyle={[styles.listContent, { paddingTop: 8, paddingBottom: tabBarSpace + 8 }]}
        showsVerticalScrollIndicator={false}
        onScroll={e => { scrollOffsetRef.current = e.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadFeed(true)}
            tintColor={palette.primary}
          />
        }
        removeClippedSubviews
        windowSize={5}
        maxToRenderPerBatch={3}
      />

      {/* Floating glass top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top, height: TOP_BAR_H }]}>
        <View style={styles.topBarInner}>
          <Wordmark onPress={triggerRefresh} />
          <View style={styles.topBarActions}>
            <NotificationBell style={styles.iconBtn} />
            <TouchableOpacity
              style={styles.iconBtn}
              activeOpacity={0.7}
              onPress={() => setSearchOpen(true)}
            >
              <GlassIconBg />
              <Ionicons name="search" size={17} color={C.inkSoft} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconBtn}
              activeOpacity={0.7}
              onPress={() => router.push('/profile/edit' as never)}
            >
              <GlassIconBg />
              <Ionicons name="settings-outline" size={17} color={C.inkSoft} />
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.topBarHairline} />
      </View>

      <SearchOverlay visible={searchOpen} onClose={() => setSearchOpen(false)} />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.bg,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },

  // Glass top bar — semi-transparent until expo-blur lands in a native build
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    overflow: 'hidden',
    backgroundColor: dyn('rgba(242,235,219,0.88)', 'rgba(23,21,17,0.88)'),
  },
  topBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  topBarHairline: {
    height: 0.5,
    backgroundColor: C.hairline,
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
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: C.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Header
  header: {
    paddingTop: 16,
    paddingBottom: 16,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 0,
  },
  title: {
    fontSize: 26, fontWeight: '800', color: C.ink,
    letterSpacing: -0.5, lineHeight: 30,
  },
  chips: {
    flexDirection: 'row', gap: 6, marginTop: 14,
  },
  chip: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 100, borderWidth: 0.5, borderColor: C.hairline,
    backgroundColor: C.surfaceAlt,
  },
  chipActive: {},
  chipText: {
    fontSize: 13, fontWeight: '600', color: C.inkSoft,
  },
  chipTextActive: {
    color: C.onPrimary,
  },

  // Footer
  endOfFeed: {
    textAlign: 'center', paddingVertical: 20,
    fontSize: 13, fontWeight: '700', letterSpacing: 1.5, color: C.inkMute,
  },

  // Empty state
  loadingContainer: { gap: 12 },
  emptyContainer: {
    alignItems: 'center', paddingTop: 60, paddingHorizontal: 32, gap: 8,
  },
  emptyEmoji: { fontSize: 40 },
  emptyTitle: {
    fontSize: 17, fontWeight: '700', color: C.ink, textAlign: 'center',
  },
  emptyBody: {
    fontSize: 13, color: C.inkMute, textAlign: 'center', lineHeight: 19,
  },

  // Skeleton
  skeleton: {
    backgroundColor: C.surface, borderRadius: 16,
    borderWidth: 0.5, borderColor: C.hairline,
    padding: 18, overflow: 'hidden',
  },
  skeletonAvatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: C.surfaceAlt,
  },
  skeletonLine: {
    height: 12, borderRadius: 6, backgroundColor: C.surfaceAlt,
  },
  skeletonPhoto: {
    height: 200, borderRadius: 10, backgroundColor: C.surfaceAlt,
  },
});
