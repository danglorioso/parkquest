import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DeviceEventEmitter, View, Text, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, StyleSheet, Platform, useColorScheme,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useScrollToTop } from '@react-navigation/native';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { PostCard, type FeedPost } from '@/components/PostCard';
import { Wordmark } from '@/components/Wordmark';
import { GlassIconBg } from '@/components/GlassIconBg';
import { GlassView, GlassContainer, liquidGlassAvailable } from '@/lib/glass';
import { SearchOverlay } from '@/components/SearchOverlay';
import { NotificationBell } from '@/components/NotificationCenter';
import { OfflineBanner } from '@/components/OfflineBanner';
import { STATIC as C, useColors } from '@/lib/palette';
import { useTabBarSpace } from '@/components/FloatingTabBar';
import { useIsOnline } from '@/lib/network';
import { useFeedColumns } from '@/lib/responsive';
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
  // Wraps the row's own content exactly (marginTop -8 + paddingTop 6 + the 44pt
  // buttons + paddingBottom 8, see topBarInner) — no leftover slack below the
  // buttons, so the hairline sits right after the bottom padding instead of
  // floating further down like the old fixed 56.5 did.
  const TOP_BAR_H = insets.top + 50;
  const barGlass = liquidGlassAvailable && GlassView != null && GlassContainer != null;
  const isDark = useColorScheme() === 'dark';

  const [token, setToken]         = useState<string | null>(null);
  const [posts, setPosts]         = useState<FeedPost[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef = useRef(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);
  const offsetRef = useRef(0);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 20;
  const [filter, setFilter]       = useState<Filter>('all');
  const [error, setError]         = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [offlineFetchedAt, setOfflineFetchedAt] = useState<string | null>(null);
  const isOnline = useIsOnline();
  const hasLoadedRef = useRef(false);
  const lastFetchedAtRef = useRef<string | null>(null);

  const flatListRef = useRef<FlatList<FeedPost>>(null);
  useScrollToTop(flatListRef);
  // 2-up at iPad width — a single post's photo filling the whole iPad
  // screen made it impossible to see a full post without scrolling.
  const columns = useFeedColumns();
  const scrollOffsetRef = useRef(0);
  // Clerk tokens expire in ~60s — never stash getToken itself in a dep array
  // (unstable identity has caused runaway re-invocation before), always call
  // through this ref so every fetch gets a fresh token instead of a cached
  // Clerk instance whose identity happens to still match.
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  // Guards onEndReached against hammering the same failed request — FlatList
  // can refire onEndReached immediately after a failed page (content height
  // unchanged, still within threshold), so only retry once the user has
  // actually scrolled further than where the last attempt started.
  const lastLoadMoreScrollYRef = useRef(-1);

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
    if (tok) setToken(tok);

    const isFirstLoad = !hasLoadedRef.current;

    // Paint whatever's cached instantly instead of blocking on the network —
    // the live fetch below still runs and replaces it once it lands.
    let cache = isFirstLoad ? await loadOfflineFeed() : null;
    if (cache) {
      setPosts(cache.posts);
      setOfflineFetchedAt(isOnline && tok ? null : cache.fetchedAt);
      setLoading(false);
      hasLoadedRef.current = true;
    }

    // No token also covers Clerk still bootstrapping (e.g. offline at
    // startup) — same fallback as being offline: show cache, don't hang
    // waiting on a fetch that needs an Authorization header we don't have.
    if (!isOnline || !tok) {
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
        fetch(`${BASE}/api/feed?limit=${PAGE_SIZE}&offset=0`, { headers: { Authorization: `Bearer ${tok}` } }),
        isRefresh ? new Promise<void>(r => setTimeout(r, 700)) : Promise.resolve(),
      ]);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPosts(data);
      offsetRef.current = data.length;
      setHasMore(data.length === PAGE_SIZE);
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

  // Infinite scroll — the initial load only ever pulls PAGE_SIZE posts across
  // ALL friends combined, so a single friend's older posts were getting
  // crowded out by everyone else's the moment they scrolled ("Friends" tab
  // just filters this same small batch client-side). Fetch further pages as
  // the list end approaches; the API already supports offset, it just wasn't
  // being used past the first page.
  const loadMoreFeed = useCallback(async () => {
    if (loadingMoreRef.current || refreshingRef.current || !hasMore || !isOnline) return;
    if (scrollOffsetRef.current <= lastLoadMoreScrollYRef.current) return;
    lastLoadMoreScrollYRef.current = scrollOffsetRef.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const tok = await getTokenRef.current();
      if (!tok) return;
      const res = await fetch(`${BASE}/api/feed?limit=${PAGE_SIZE}&offset=${offsetRef.current}`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: FeedPost[] = await res.json();
      setPosts(prev => [...prev, ...data]);
      offsetRef.current += data.length;
      setHasMore(data.length === PAGE_SIZE);
    } catch (e) {
      console.error('Feed load-more failed:', e);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [hasMore, isOnline]);

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

  const handleParkPress = useCallback((code: string) => {
    router.push(`/park/${code}` as never);
  }, [router]);

  // Stable identity — FlatList's CellRenderer shallow-compares renderItem
  // (among other props) to decide whether to re-render a cell. An inline
  // arrow here would get a new identity every FeedScreen render, forcing
  // every mounted cell to re-render regardless of whether its own post data
  // changed, which is exactly what defeats PostCard's memoization below.
  const renderPost = useCallback(({ item }: { item: FeedPost }) =>
    token ? (
      // Fixed '48%' (not flex:1) so a trailing lone post in an odd-count,
      // 2-column grid stays column-width instead of stretching full-row —
      // columnWrapperStyle's justifyContent:'space-between' below is what
      // actually produces the gap between the two columns from that.
      <View style={columns === 2 ? { width: '48%' } : undefined}>
        <PostCard
          post={item}
          myUserId={user?.id ?? ''}
          myAvatarUrl={user?.imageUrl}
          myName={user?.fullName ?? user?.username}
          onDelete={handleDelete}
          onParkPress={handleParkPress}
        />
      </View>
    ) : null,
  [token, user, handleDelete, handleParkPress, columns]);

  // Blocking a user should hide their posts from the feed instantly, without
  // waiting on a refetch.
  useEffect(() => {
    const unsubscribe = onUserBlocked(blockedId => {
      setPosts(prev => prev.filter(p => p.clerk_user_id !== blockedId));
    });
    return unsubscribe;
  }, []);

  // Memoized — pagination now churns `posts` far more often than before
  // (a new page appended per scroll), and an unmemoized filter here handed
  // FlatList a new `data` array reference on every render, forcing it to
  // re-render every mounted cell regardless of whether that cell's post
  // actually changed.
  const filtered = useMemo(() => posts.filter(p =>
    filter === 'friends' ? p.is_friend_post :
    filter === 'visits' ? !!p.visit_id :
    filter === 'badges' ? !!p.badge_id :
    true
  ), [posts, filter]);

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
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
          <View style={[styles.chips, { marginTop: 0 }]}>
            <FilterChip label="All"     active={filter === 'all'}     primary={palette.primary} onPress={() => setFilter('all')} />
            <FilterChip label="Friends" active={filter === 'friends'} primary={palette.primary} onPress={() => setFilter(f => f === 'friends' ? 'all' : 'friends')} />
            <FilterChip label="Visits"  active={filter === 'visits'}  primary={palette.primary} onPress={() => setFilter(f => f === 'visits' ? 'all' : 'visits')} />
            <FilterChip label="Badges"  active={filter === 'badges'}  primary={palette.primary} onPress={() => setFilter(f => f === 'badges' ? 'all' : 'badges')} />
          </View>
          {filter === 'friends' && (
            <TouchableOpacity
              onPress={() => {
                // Seed the profile tab's stack with its root before navigating to
                // the nested friends screen — pushing the nested route directly
                // (from a different tab) left that stack as just [friends] with
                // no index beneath it, so back had nowhere to go. The second
                // navigate is deferred a tick: expo-router's imperative navigate()
                // computes its target against the state at call time and only
                // dispatches later, so firing both synchronously back-to-back had
                // the second call compute against the same stale (pre-navigation)
                // state as the first, silently dropping the seeded root.
                router.navigate('/(tabs)/profile' as never);
                setTimeout(() => router.navigate('/(tabs)/profile/friends' as never), 0);
              }}
              hitSlop={8}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingRight: 2 }}
            >
              <Ionicons name="people-outline" size={13} color={palette.primary} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: palette.primary }}>Manage</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );

  // ── Footer component ──────────────────────────────────────────────────────

  const ListFooter = filtered.length > 0 && !loading ? (
    loadingMore ? (
      <ActivityIndicator style={{ paddingVertical: 20 }} color={palette.primary} />
    ) : !hasMore ? (
      <Text style={styles.endOfFeed}>◆ END OF FEED · ALL CAUGHT UP ◆</Text>
    ) : null
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
        // FlatList throws if numColumns changes on an already-mounted
        // instance ("Changing numColumns on the fly is not supported") —
        // keying on it forces a clean remount instead, which matters here
        // since useFeedColumns is width-reactive (iPad Split View resize).
        key={`feed-cols-${columns}`}
        ref={flatListRef}
        data={loading ? [] : filtered}
        keyExtractor={item => String(item.id)}
        renderItem={renderPost}
        numColumns={columns}
        columnWrapperStyle={columns === 2 ? styles.gridRow : undefined}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={ListFooter}
        ListEmptyComponent={ListEmpty}
        onEndReached={loadMoreFeed}
        onEndReachedThreshold={0.6}
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

      {/* Floating glass top bar. The bar's own fill and the buttons floating
          on top of it must share one GlassContainer — stacked GlassViews
          outside a shared container can't sample each other and the lower
          one (here, the bar) renders as opaque white, which is what made
          this bar and its buttons read as flat/non-adaptive before: the
          bar was a plain painted rgba tint, so the buttons' real glass had
          nothing but a near-solid color to sample. Same recipe as the
          floating tab bar's pill background. */}
      {/* Safe-area offset lives on the inner row (not the bar's padding):
          absolutely-positioned children (the GlassContainer) don't inherit
          parent padding on the new architecture, which let the glass
          branch's content ride up over the status bar. */}
      <View style={[styles.topBar, { height: TOP_BAR_H }]}>
        {barGlass && GlassView && GlassContainer ? (
          <GlassContainer style={StyleSheet.absoluteFill}>
            <GlassView style={StyleSheet.absoluteFill} glassEffectStyle="regular" tintColor={isDark ? '#171511' : '#F2EBDB'} />
            {/* Fades the glass tint to fully transparent by the bar's own
                bottom edge — same height, no hard cutoff */}
            <LinearGradient
              pointerEvents="none"
              colors={isDark
                ? ['rgba(23,21,17,0.5)', 'rgba(23,21,17,0.22)', 'rgba(23,21,17,0)']
                : ['rgba(242,235,219,0.5)', 'rgba(242,235,219,0.22)', 'rgba(242,235,219,0)']}
              locations={[0, 0.55, 1]}
              style={StyleSheet.absoluteFill}
            />
            <View style={[styles.topBarInner, { marginTop: insets.top - 8 }]}>
              {/* Explicit 44px box (matching iconBtn) instead of trusting
                  flex alignItems:center to match cross-axis centers — the
                  Wordmark's own row measures shorter than 44 by an amount
                  that isn't just its rendered height (font metrics on the
                  text add asymmetric slack above/below the glyphs), so
                  centering by auto-height alone still read visibly off. */}
              <View style={{ height: 44, justifyContent: 'center' }}>
                <Wordmark onPress={triggerRefresh} />
              </View>
              <View style={styles.topBarActions}>
                <NotificationBell style={styles.iconBtn} />
                <TouchableOpacity
                  style={styles.iconBtn}
                  activeOpacity={0.7}
                  onPress={() => setSearchOpen(true)}
                >
                  <GlassIconBg />
                  <Ionicons name="search" size={22} color={C.inkSoft} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.iconBtn}
                  activeOpacity={0.7}
                  onPress={() => router.push('/profile/edit' as never)}
                >
                  <GlassIconBg />
                  <Ionicons name="settings-outline" size={22} color={C.inkSoft} />
                </TouchableOpacity>
              </View>
            </View>
          </GlassContainer>
        ) : (
          <>
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              {Platform.OS === 'ios' && (
                <>
                  {/* Top-anchored, taller/stronger blur stacked over a full-height
                      softer one — a crude but effective step-down in blur strength
                      toward the bottom edge, since BlurView has no gradient mask */}
                  <BlurView
                    intensity={90}
                    tint={isDark ? 'systemUltraThinMaterialDark' : 'systemUltraThinMaterialLight'}
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, height: TOP_BAR_H * 0.6 }}
                  />
                  <BlurView
                    intensity={40}
                    tint={isDark ? 'systemUltraThinMaterialDark' : 'systemUltraThinMaterialLight'}
                    style={StyleSheet.absoluteFill}
                  />
                </>
              )}
              {/* Fades the tint color to fully transparent by the bar's own
                  bottom edge — same height, no hard cutoff */}
              <LinearGradient
                colors={isDark
                  ? ['rgba(23,21,17,0.72)', 'rgba(23,21,17,0.4)', 'rgba(23,21,17,0)']
                  : ['rgba(242,235,219,0.72)', 'rgba(242,235,219,0.4)', 'rgba(242,235,219,0)']}
                locations={[0, 0.55, 1]}
                style={StyleSheet.absoluteFill}
              />
            </View>
            <View style={[styles.topBarInner, { marginTop: insets.top - 8 }]}>
              {/* Explicit 44px box (matching iconBtn) instead of trusting
                  flex alignItems:center to match cross-axis centers — the
                  Wordmark's own row measures shorter than 44 by an amount
                  that isn't just its rendered height (font metrics on the
                  text add asymmetric slack above/below the glyphs), so
                  centering by auto-height alone still read visibly off. */}
              <View style={{ height: 44, justifyContent: 'center' }}>
                <Wordmark onPress={triggerRefresh} />
              </View>
              <View style={styles.topBarActions}>
                <NotificationBell style={styles.iconBtn} />
                <TouchableOpacity
                  style={styles.iconBtn}
                  activeOpacity={0.7}
                  onPress={() => setSearchOpen(true)}
                >
                  <GlassIconBg />
                  <Ionicons name="search" size={22} color={C.inkSoft} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.iconBtn}
                  activeOpacity={0.7}
                  onPress={() => router.push('/profile/edit' as never)}
                >
                  <GlassIconBg />
                  <Ionicons name="settings-outline" size={22} color={C.inkSoft} />
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}
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
  // iPad 2-column grid row — '48%'-wide cards (see renderPost) plus
  // space-between is what actually produces the gap between them.
  gridRow: {
    justifyContent: 'space-between',
  },

  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    overflow: 'hidden',
  },
  topBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    // Asymmetric on purpose: paddingTop pairs with the marginTop pull-up
    // (insets.top - 8, set where this style is used) to land the buttons a
    // fixed distance under the safe area — left untouched so that gap never
    // moves. paddingBottom is the matching gap to the bar's bottom edge (see
    // TOP_BAR_H, which now wraps this row with no extra slack).
    paddingTop: 6,
    paddingBottom: 8,
  },
  topBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    // 44pt — the app-wide round icon button size (matches the park page
    // header buttons).
    width: 44,
    height: 44,
    borderRadius: 22,
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
