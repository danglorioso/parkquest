import { useCallback, useRef, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { PostCard, type FeedPost } from '@/components/PostCard';
import { Wordmark } from '@/components/Wordmark';
import { SearchOverlay } from '@/components/SearchOverlay';

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

// ── Filter chip ───────────────────────────────────────────────────────────────

type Filter = 'all' | 'visits' | 'badges';

function FilterChip({
  label, active, onPress,
}: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[styles.chip, active && styles.chipActive]}
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

  const [token, setToken]         = useState<string | null>(null);
  const [posts, setPosts]         = useState<FeedPost[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter]       = useState<Filter>('all');
  const [error, setError]         = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const loadFeed = useCallback(async (isRefresh = false) => {
    const tok = await getToken();
    if (!tok) { setLoading(false); return; }
    setToken(tok);
    if (isRefresh) setRefreshing(true);
    else setPosts(prev => { if (prev.length === 0) setLoading(true); return prev; });
    setError(false);
    try {
      const res = await fetch(`${BASE}/api/feed`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPosts(data);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getToken]);

  const loadFeedRef = useRef(loadFeed);
  loadFeedRef.current = loadFeed;

  useFocusEffect(useCallback(() => { loadFeedRef.current(); }, []));

  const handleDelete = useCallback((id: number) => {
    setPosts(prev => prev.filter(p => p.id !== id));
  }, []);

  const filtered = posts.filter(p =>
    filter === 'visits' ? !!p.visit_id :
    filter === 'badges' ? !!p.badge_id :
    true
  );

  // ── Header component ──────────────────────────────────────────────────────

  const ListHeader = (
    <View style={styles.header}>
      {/* Page kicker + title */}
      <View style={styles.headerTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>THE FEED</Text>
          <Text style={styles.title}>Out there</Text>
          <Text style={styles.subtitle}>Latest posts from your friends and the community</Text>
        </View>
      </View>

      {/* Filter chips — only show when there are posts */}
      {posts.length > 0 && (
        <View style={styles.chips}>
          <FilterChip label="All"    active={filter === 'all'}    onPress={() => setFilter('all')} />
          <FilterChip label="Visits" active={filter === 'visits'} onPress={() => setFilter('visits')} />
          <FilterChip label="Badges" active={filter === 'badges'} onPress={() => setFilter('badges')} />
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
        style={{ marginTop: 4, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: C.primary, borderRadius: 12 }}
      >
        <Text style={{ color: '#FFFBF1', fontWeight: '700', fontSize: 14 }}>Retry</Text>
      </TouchableOpacity>
    </View>
  ) : (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyEmoji}>🌲</Text>
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
    <SafeAreaView style={styles.screen} edges={['top']}>
      {/* Top bar — wordmark + actions */}
      <View style={styles.topBar}>
        <Wordmark />
        <View style={styles.topBarActions}>
          <TouchableOpacity style={styles.iconBtn} activeOpacity={0.7}>
            <Ionicons name="notifications-outline" size={18} color={C.inkSoft} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconBtn}
            activeOpacity={0.7}
            onPress={() => setSearchOpen(true)}
          >
            <Ionicons name="search" size={17} color={C.inkSoft} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconBtn, styles.plusBtn]}
            activeOpacity={0.8}
            onPress={() => router.push('/(modals)/log-visit' as never)}
          >
            <Ionicons name="add" size={20} color="#FFFBF1" />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList<FeedPost>
        data={loading ? [] : filtered}
        keyExtractor={item => String(item.id)}
        renderItem={({ item }) =>
          token ? (
            <PostCard
              post={item}
              token={token}
              myUserId={user?.id ?? ''}
              myAvatarUrl={user?.imageUrl}
              myName={user?.fullName ?? user?.username}
              onDelete={handleDelete}
            />
          ) : null
        }
        ListHeaderComponent={ListHeader}
        ListFooterComponent={ListFooter}
        ListEmptyComponent={ListEmpty}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshing={refreshing}
        onRefresh={() => loadFeed(true)}
        // Slight performance tuning for a social feed
        removeClippedSubviews
        windowSize={5}
        maxToRenderPerBatch={3}
      />

      <SearchOverlay visible={searchOpen} onClose={() => setSearchOpen(false)} />
    </SafeAreaView>
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

  // Top bar
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
  plusBtn: {
    backgroundColor: C.primary,
    borderColor: C.primary,
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
  kicker: {
    fontSize: 10, fontWeight: '700', letterSpacing: 1.4,
    color: C.inkMute, marginBottom: 4,
  },
  title: {
    fontSize: 26, fontWeight: '800', color: C.ink,
    letterSpacing: -0.5, lineHeight: 30,
  },
  subtitle: {
    fontSize: 13, color: C.inkMute, marginTop: 4, lineHeight: 18,
  },
  chips: {
    flexDirection: 'row', gap: 6, marginTop: 14,
  },
  chip: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 100, borderWidth: 0.5, borderColor: C.hairline,
    backgroundColor: C.surfaceAlt,
  },
  chipActive: {
    backgroundColor: C.primary, borderColor: C.primary,
  },
  chipText: {
    fontSize: 12, fontWeight: '600', color: C.inkSoft,
  },
  chipTextActive: {
    color: '#FFFBF1',
  },

  // Footer
  endOfFeed: {
    textAlign: 'center', paddingVertical: 20,
    fontSize: 10, fontWeight: '700', letterSpacing: 1.5, color: C.inkMute,
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
