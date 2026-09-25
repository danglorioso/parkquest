import { useState, useRef, useCallback, useEffect, memo } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, FlatList, TextInput,
  Modal, Dimensions, Alert, ActivityIndicator, Share,
  StyleSheet, Pressable, KeyboardAvoidingView, Platform, Animated, PanResponder, useColorScheme,
  InteractionManager,
} from 'react-native';
import { MenuView } from '@react-native-menu/menu';
import { openImageLightbox } from '@/lib/imageLightbox';
import { PinchZoomPhoto } from '@/components/PinchZoomPhoto';
import { Avatar } from '@/components/Avatar';
import { AdminStar } from '@/components/AdminStar';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { BADGE_MAP, badgeColors, ensureBadgeDefs } from '@/lib/badges';
import { VisitStatsStrip, VisitFacts } from '@/components/VisitStats';
import { blockUser, sendFriendRequest } from '@/lib/api';
import { emitUserBlocked } from '@/lib/blocking';
import { STATIC as C, useColors } from '@/lib/palette';
import { relTime } from '@/lib/dates';
import { parkColor, parkGradientIndex } from '@/lib/parkColors';
import { fullStateName } from '@/lib/stateNames';
import { ParkStamp } from '@/components/ParkStamp';
import { BadgePatch } from '@/components/BadgeDetailModal';
import { showToast } from '@/lib/toast';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ReportTargetType, ReportReason, CustomStampGlyph } from '@parkquest/types';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FeedPost {
  id: number;
  caption: string | null;
  photos: string[] | null;
  park_code: string | null;
  badge_id: string | null;
  visit_id: number | null;
  created_at: string;
  clerk_user_id: string;
  park_name: string | null;
  park_image_url: string | null;
  park_states?: string | null;
  park_stamp_glyph?: CustomStampGlyph | null;
  is_national_park?: boolean | null;
  // Viewer's own relationship to this post's park — not the author's.
  viewer_visited?: boolean | null;
  viewer_bucket_listed?: boolean | null;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  author_is_admin?: boolean | null;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
  is_friend_post: boolean;
  // Effective visibility — visit posts inherit the visit's setting
  visibility?: string | null;
  // visit metadata
  visit_date: string | null;
  visit_rank_score: number | null;
  visit_activities: string[] | null;
  visit_weather: string[] | null;
  visit_crowd: number | null;
  visit_difficulty: number | null;
  visit_companion_count: number | null;
  visit_companion_names: Array<{ user_id: string; username: string; display_name: string | null; avatar_url: string | null }> | null;
  visit_highlight: string | null;
  visit_title: string | null;
  visit_ordinal: number | null;
  // Only present on the single-post detail fetch (/api/posts/[id]), not feed lists
  visit_notes?: string | null;
  visit_would_return?: string | null;
  // Attached GPX hike, if any (see HikeStatsCard)
  visit_distance_meters?: number | null;
  visit_duration_seconds?: number | null;
  visit_elevation_gain_meters?: number | null;
  visit_route_polyline?: string | null;
  visit_external_source?: string | null;
}

interface CommentRow {
  id: number;
  content: string;
  created_at: string;
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_admin?: boolean | null;
}

interface Liker {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
// iOS system red — matches the native destructive text color these menu
// items already render in, so the leading SF Symbol matches instead of
// staying the same ink tone as the non-destructive rows.
const MENU_DESTRUCTIVE = '#FF3B30';

type TokenGetter = () => Promise<string | null>;

async function apiReq(path: string, getToken: TokenGetter, options: RequestInit = {}) {
  const token = await getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Clerk session tokens expire after ~60s, so a token captured when the feed
// loaded goes stale while the user scrolls or types a comment. Resolve a fresh
// token per request instead — Clerk returns the cached one while it's still
// valid. Same idiom as log-visit.tsx / map.tsx; never put getToken itself in a
// dep array (its identity changes every render in @clerk/clerk-expo).
function useFreshToken(): TokenGetter {
  const { getToken } = useAuth();
  const ref = useRef(getToken);
  ref.current = getToken;
  return useCallback(() => ref.current(), []);
}

// ── LikersSheet ───────────────────────────────────────────────────────────────

function LikersSheet({
  postId, onClose,
}: { postId: number; onClose: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const freshToken = useFreshToken();
  const [rows, setRows] = useState<Liker[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiReq(`/api/likes?postId=${postId}`, freshToken)
      .then(setRows)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [postId, freshToken]);

  const openProfile = (userId: string) => {
    onClose();
    router.push(`/user/${userId}` as never);
  };

  const slide = useRef(new Animated.Value(400)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slide, { toValue: 0, duration: 260, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
    ]).start();
  }, [slide, backdropOpacity]);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(slide, { toValue: 400, duration: 200, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => onClose());
  };

  return (
    <Modal visible transparent animationType="none" onRequestClose={dismiss} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.sheetBackdrop, { opacity: backdropOpacity }]}
          pointerEvents="none"
        />
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} />
        <Animated.View
          style={[styles.sheet, { paddingBottom: insets.bottom + 8, transform: [{ translateY: slide }] }]}
        >
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>LIKED BY</Text>
          {loading ? (
            <ActivityIndicator size="small" color={C.inkMute} style={{ margin: 24 }} />
          ) : rows.length === 0 ? (
            <Text style={styles.sheetEmpty}>No likes yet</Text>
          ) : (
            <ScrollView style={{ maxHeight: 380 }} bounces={false}>
              {rows.map(l => {
                const lname = l.display_name ?? l.username ?? 'Explorer';
                return (
                  <TouchableOpacity
                    key={l.user_id}
                    style={styles.likerRow}
                    activeOpacity={0.7}
                    onPress={() => openProfile(l.user_id)}
                  >
                    <Avatar url={l.avatar_url} name={lname} size={36} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.likerName}>{lname}</Text>
                      {l.username ? <Text style={styles.likerSub}>@{l.username}</Text> : null}
                    </View>
                    <Ionicons name="chevron-forward" size={14} color={C.inkMute} />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

// ── ReportSheet ───────────────────────────────────────────────────────────────

const REPORT_REASONS: Record<ReportTargetType, { key: ReportReason; label: string }[]> = {
  user: [
    { key: 'harassment', label: 'Harassment or bullying' },
    { key: 'impersonation', label: 'Impersonation' },
    { key: 'misleading', label: 'Misleading or fake account' },
    { key: 'spam', label: 'Spam' },
    { key: 'inappropriate', label: 'Inappropriate content' },
    { key: 'other', label: 'Other' },
  ],
  post: [
    { key: 'spam', label: 'Spam' },
    { key: 'harassment', label: 'Harassment or bullying' },
    { key: 'inappropriate', label: 'Inappropriate content' },
    { key: 'other', label: 'Other' },
  ],
  comment: [
    { key: 'spam', label: 'Spam' },
    { key: 'harassment', label: 'Harassment or bullying' },
    { key: 'inappropriate', label: 'Inappropriate content' },
    { key: 'other', label: 'Other' },
  ],
};

export function ReportSheet({
  targetType, targetId, onClose, onSubmitted,
}: {
  targetType: ReportTargetType;
  targetId: number | string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const C = useColors();
  const freshToken = useFreshToken();
  const reasons = REPORT_REASONS[targetType];
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const slide = useRef(new Animated.Value(400)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slide, { toValue: 0, duration: 260, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
    ]).start();
  }, [slide, backdropOpacity]);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(slide, { toValue: 400, duration: 200, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => onClose());
  };

  const submit = async () => {
    if (!reason || submitting) return;
    setSubmitting(true);
    try {
      await apiReq('/api/reports', freshToken, {
        method: 'POST',
        body: JSON.stringify({ targetType, targetId, reason, details: details.trim() || undefined }),
      });
      onSubmitted();
      dismiss();
    } catch {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible transparent animationType="none" onRequestClose={dismiss} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.sheetBackdrop, { opacity: backdropOpacity }]}
          pointerEvents="none"
        />
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY: slide }] }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>
            {targetType === 'comment' ? 'REPORT COMMENT' : targetType === 'user' ? 'REPORT USER' : 'REPORT POST'}
          </Text>

          {reasons.map(r => (
            <TouchableOpacity
              key={r.key}
              style={styles.reportReasonRow}
              activeOpacity={0.7}
              onPress={() => setReason(r.key)}
            >
              <Text style={styles.reportReasonText}>{r.label}</Text>
              <Ionicons
                name={reason === r.key ? 'radio-button-on' : 'radio-button-off'}
                size={18}
                color={reason === r.key ? C.primary : C.inkMute}
              />
            </TouchableOpacity>
          ))}

          <TextInput
            value={details}
            onChangeText={t => setDetails(t.slice(0, 500))}
            placeholder="Additional details (optional)"
            placeholderTextColor={C.inkMute}
            style={styles.reportDetailsInput}
            multiline
          />

          <TouchableOpacity
            style={[styles.reportSubmitBtn, { backgroundColor: reason ? C.primary : C.hairline }]}
            disabled={!reason || submitting}
            onPress={submit}
          >
            {submitting
              ? <ActivityIndicator size="small" color="#FFFBF1" />
              : <Text style={styles.reportSubmitText}>Submit report</Text>}
          </TouchableOpacity>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── PhotoCarousel ─────────────────────────────────────────────────────────────

const SCREEN_W = Dimensions.get('window').width;
const SCREEN_H = Dimensions.get('window').height;
// Fallback only, used for the first frame before onLayout reports the real
// width — the actual paging math below always uses the measured width, since
// this card-minus-margins guess drifts from the true value (border width,
// different padding in different screens the carousel is embedded in) just
// enough to leave a sliver of the next/prev photo visible after a swipe.
const CARD_W_FALLBACK = SCREEN_W - 32;

const CAROUSEL_CHROME_FADE_DELAY = 1200;

function PhotoCarousel({ photos, parkCode }: { photos: string[]; parkCode: string | null }) {
  const [activeIdx, setActiveIdx] = useState(0);
  // Measured from the carousel's own layout rather than assumed from screen
  // width — square, so this doubles as both the paging width and photo height.
  const [boxW, setBoxW] = useState(CARD_W_FALLBACK);
  // Disables the pager mid-pinch so a two-finger zoom can't also drag the
  // carousel to the next photo underneath it.
  const [zooming, setZooming] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const n = photos.length;
  const fallbackColor = parkColor(parkCode ?? 'xx');

  // Arrows + counter fade out after a few seconds of no interaction, and
  // reappear briefly on swipe/tap — same behavior as the fullscreen lightbox.
  const chromeOpacity = useRef(new Animated.Value(1)).current;
  const [chromeVisible, setChromeVisible] = useState(true);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showChromeBriefly = useCallback(() => {
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
    setChromeVisible(true);
    chromeOpacity.setValue(1);
    fadeTimer.current = setTimeout(() => {
      Animated.timing(chromeOpacity, { toValue: 0, duration: 400, useNativeDriver: true })
        .start(() => setChromeVisible(false));
    }, CAROUSEL_CHROME_FADE_DELAY);
  }, [chromeOpacity]);
  useEffect(() => {
    showChromeBriefly();
    return () => { if (fadeTimer.current) clearTimeout(fadeTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdx]);

  const goTo = (k: number) => {
    const next = Math.max(0, Math.min(n - 1, k));
    scrollRef.current?.scrollTo({ x: next * boxW, animated: true });
    setActiveIdx(next);
  };

  return (
    <View onLayout={e => setBoxW(e.nativeEvent.layout.width)}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        scrollEnabled={!zooming}
        showsHorizontalScrollIndicator={false}
        onScrollBeginDrag={showChromeBriefly}
        onScroll={e => {
          const x = e.nativeEvent.contentOffset.x;
          const next = Math.max(0, Math.min(n - 1, Math.round(x / boxW)));
          setActiveIdx(prev => (prev === next ? prev : next));
        }}
        scrollEventThrottle={16}
        onMomentumScrollEnd={e => {
          const x = e.nativeEvent.contentOffset.x;
          setActiveIdx(Math.round(x / boxW));
        }}
      >
        {photos.map((src, k) => (
          <PinchZoomPhoto
            key={k}
            uri={src || null}
            size={boxW}
            fallbackColor={fallbackColor}
            onPress={() => openImageLightbox({
              images: photos.filter(Boolean).map(url => ({ url })),
              initialIndex: k,
              loop: false,
              onClose: finalIndex => {
                setActiveIdx(finalIndex);
                scrollRef.current?.scrollTo({ x: finalIndex * boxW, animated: false });
              },
            })}
            onZoomChange={setZooming}
          />
        ))}
      </ScrollView>

      {/* Counter badge — fades after a few seconds of inactivity */}
      {n > 1 && (
        <Animated.View style={[styles.carouselCounter, { opacity: chromeOpacity }]} pointerEvents="none">
          <Text style={styles.carouselCounterText}>{activeIdx + 1}/{n}</Text>
        </Animated.View>
      )}

      {/* Prev arrow — fades after a few seconds of inactivity */}
      {n > 1 && activeIdx > 0 && (
        <Animated.View
          pointerEvents={chromeVisible ? 'auto' : 'none'}
          style={[styles.carouselNav, { left: 10, opacity: chromeOpacity }]}
        >
          <TouchableOpacity
            style={styles.carouselNavBtn}
            onPress={() => { goTo(activeIdx - 1); showChromeBriefly(); }}
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={18} color="#FFFBF1" />
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Next arrow — fades after a few seconds of inactivity */}
      {n > 1 && activeIdx < n - 1 && (
        <Animated.View
          pointerEvents={chromeVisible ? 'auto' : 'none'}
          style={[styles.carouselNav, { right: 10, opacity: chromeOpacity }]}
        >
          <TouchableOpacity
            style={styles.carouselNavBtn}
            onPress={() => { goTo(activeIdx + 1); showChromeBriefly(); }}
            hitSlop={8}
          >
            <Ionicons name="chevron-forward" size={18} color="#FFFBF1" />
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Dot strip */}
      {n > 1 && (
        <View style={styles.carouselDots}>
          {photos.map((_, k) => (
            <View
              key={k}
              style={[
                styles.carouselDot,
                k === activeIdx ? styles.carouselDotActive : styles.carouselDotInactive,
              ]}
            />
          ))}
        </View>
      )}

    </View>
  );
}

// ── BadgePostBody ─────────────────────────────────────────────────────────────

function BadgePostBody({ badgeId }: { badgeId: string }) {
  const [badge, setBadge] = useState(() => BADGE_MAP.get(badgeId));
  // Defs load from the server (no static bundle) — until the first fetch
  // resolves, badgeId is a raw slug like "hot_streak" and unfit to show.
  const [ready, setReady] = useState(() => BADGE_MAP.has(badgeId));

  // Defs are always re-fetched (never trusted from a prior read) since names,
  // colors, and tiers are admin-editable and can change between loads.
  useEffect(() => {
    let active = true;
    ensureBadgeDefs().then(() => {
      if (!active) return;
      setBadge(BADGE_MAP.get(badgeId));
      setReady(true);
    });
    return () => { active = false; };
  }, [badgeId]);

  if (!ready) {
    return (
      <View style={styles.badgeRow}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: C.hairline }} />
        <View style={styles.badgeText}>
          <View style={{ width: '55%', height: 15, borderRadius: 5, backgroundColor: C.hairline, marginBottom: 8 }} />
          <View style={{ width: 96, height: 11, borderRadius: 4, backgroundColor: C.hairline }} />
        </View>
      </View>
    );
  }

  // The same embroidered patch the passport and badge pages draw, at post
  // size — the badge's own artwork carries the tier color, so the row
  // around it stays plain: name, then "Gold · what it's for" in one muted
  // line. (Was a tinted, glowing box with a tracked "GOLD BADGE" label.)
  const tier = badge?.tier ?? 'bronze';
  return (
    <View style={styles.badgeRow}>
      <BadgePatch emoji={badge?.emoji ?? '🏅'} tier={tier} colors={badge?.colors} size={56} earned />
      <View style={styles.badgeText}>
        <Text style={styles.badgeName} numberOfLines={2}>{badge?.name ?? badgeId}</Text>
        <Text style={styles.badgeMeta} numberOfLines={3}>
          <Text style={{ color: badgeColors(badge).fill, fontWeight: '700' }}>
            {tier.charAt(0).toUpperCase() + tier.slice(1)}
          </Text>
          {badge?.description ? `  ·  ${badge.description}` : ''}
        </Text>
      </View>
    </View>
  );
}

// ── ParkHeroBanner ────────────────────────────────────────────────────────────

function ParkHeroBanner({ post, onPress }: { post: FeedPost; onPress?: () => void }) {
  const parkCol = parkColor(post.park_code ?? 'ZZZZ');
  const [npsImageUrl, setNpsImageUrl] = useState<string | null>(null);
  const imageUrl = post.park_image_url ?? npsImageUrl;

  useEffect(() => {
    if (post.park_image_url || !post.park_code) return;
    fetch(`${BASE}/api/parks/${post.park_code}/images`)
      .then(r => r.json())
      .then((d: { images?: { url: string }[] }) => {
        const url = d.images?.[0]?.url ?? null;
        if (url) setNpsImageUrl(url);
      })
      .catch(() => {});
  }, [post.park_code, post.park_image_url]);

  return (
    <TouchableOpacity activeOpacity={0.92} onPress={onPress} disabled={!onPress}>
      <View style={styles.parkHero}>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: parkCol }]} />
        )}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.82)']}
          locations={[0.25, 0.6, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.parkHeroContent}>
          {/* Name, then the state(s) it's in — the date is in the stat
              strip below the banner, not here. */}
          <Text style={styles.parkHeroName} numberOfLines={2}>
            {post.park_name ?? 'National Park'}
          </Text>
          {post.park_states ? (
            <Text style={styles.parkHeroStates} numberOfLines={1}>
              {fullStateName(post.park_states)}
            </Text>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── CommentsSheet ──────────────────────────────────────────────────────────────

const COMMENT_LIMIT = 500;
const COMMENT_PREVIEW_CHARS = 200;

function CommentsSheet({
  postId, myUserId, myAvatarUrl, myName, initialRows, onCountChange, onClose,
}: {
  postId: number;
  myUserId?: string | null;
  myAvatarUrl?: string | null;
  myName?: string | null;
  initialRows?: CommentRow[] | null;
  onCountChange: (delta: number) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const C = useColors();
  const insets = useSafeAreaInsets();
  const freshToken = useFreshToken();
  const [rows, setRows] = useState<CommentRow[]>(initialRows ?? []);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Preloaded from the feed scroll — already have the full list, no fetch needed.
  const [loading, setLoading] = useState(!initialRows);
  const menuInk = useColorScheme() === 'dark' ? '#FFFBF1' : '#26231C';
  const [reportingCommentId, setReportingCommentId] = useState<number | null>(null);
  const [editingComment, setEditingComment] = useState<{ id: number; text: string } | null>(null);
  const [expandedComments, setExpandedComments] = useState<Set<number>>(new Set());
  const scrollRef = useRef<FlatList<CommentRow>>(null);
  const scrollY = useRef(0);
  const editInputRef = useRef<TextInput>(null);

  const slide = useRef(new Animated.Value(600)).current;
  const panY = useRef(new Animated.Value(0)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (initialRows) return;
    apiReq(`/api/comments?postId=${postId}`, freshToken)
      .then(setRows)
      .catch(() => {})
      .finally(() => setLoading(false));
  // initialRows only matters on mount (whether we already have the full list)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, freshToken]);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slide, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 16 }),
      Animated.timing(backdropOpacity, { toValue: 1, duration: 240, useNativeDriver: true }),
    ]).start();
  }, []);

  const dismiss = useCallback(() => {
    // Transfer any live drag offset into slide so dismiss starts from current position
    const offset = (panY as any)._value ?? 0;
    if (offset > 0) { panY.setValue(0); slide.setValue(offset); }
    Animated.parallel([
      Animated.timing(slide, { toValue: 700, duration: 220, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => onClose());
  }, [slide, panY, backdropOpacity, onClose]);

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, { dy }) => scrollY.current <= 0 && dy > 6,
    onPanResponderMove: (_, { dy }) => {
      if (dy > 0) panY.setValue(dy);
    },
    onPanResponderRelease: (_, { dy, vy }) => {
      if (dy > 100 || vy > 0.8) {
        dismiss();
      } else {
        Animated.spring(panY, { toValue: 0, useNativeDriver: true, bounciness: 6, speed: 14 }).start();
      }
    },
    onPanResponderTerminate: () => {
      Animated.spring(panY, { toValue: 0, useNativeDriver: true, bounciness: 6, speed: 14 }).start();
    },
  })).current;

  const submit = useCallback(async () => {
    const text = draft.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    setDraft('');
    try {
      const newComment = await apiReq('/api/comments', freshToken, {
        method: 'POST',
        body: JSON.stringify({ postId, content: text }),
      });
      // Prepended, not appended — the list reads oldest-to-newest overall
      // (see the API's orderBy), but a comment you just posted should be
      // visible immediately without scrolling past everyone else's.
      setRows(prev => [{
        ...newComment,
        username: myName ?? null,
        display_name: myName ?? null,
        avatar_url: myAvatarUrl ?? null,
      }, ...prev]);
      onCountChange(1);
      setTimeout(() => scrollRef.current?.scrollToOffset({ offset: 0, animated: true }), 80);
    } catch {
      setDraft(text);
    } finally {
      setSubmitting(false);
    }
  }, [draft, submitting, postId, freshToken, myName, myAvatarUrl, onCountChange]);

  const deleteComment = useCallback(async (commentId: number) => {
    setRows(prev => prev.filter(c => c.id !== commentId));
    onCountChange(-1);
    try {
      await apiReq(`/api/comments/${commentId}`, freshToken, { method: 'DELETE' });
    } catch {
      apiReq(`/api/comments?postId=${postId}`, freshToken).then(setRows).catch(() => {});
    }
  }, [freshToken, postId, onCountChange]);

  const editComment = useCallback(async (commentId: number, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setEditingComment(null);
    setRows(prev => prev.map(c => c.id === commentId ? { ...c, content: trimmed } : c));
    try {
      await apiReq(`/api/comments/${commentId}`, freshToken, {
        method: 'PATCH',
        body: JSON.stringify({ content: trimmed }),
      });
    } catch {
      apiReq(`/api/comments?postId=${postId}`, freshToken).then(setRows).catch(() => {});
    }
  }, [freshToken, postId]);

  return (
    <Modal visible transparent animationType="none" onRequestClose={dismiss} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.sheetBackdrop, { opacity: backdropOpacity }]}
          pointerEvents="none"
        />
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Animated.View
            style={[styles.commentsSheet, { paddingBottom: insets.bottom || 12, transform: [{ translateY: Animated.add(slide, panY) }] }]}
            {...panResponder.panHandlers}
          >
            <View>
              <View style={styles.sheetHandle} />
              <View style={[styles.commentsSheetHeader, { justifyContent: 'flex-end' }]}>
                <TouchableOpacity onPress={dismiss} hitSlop={12}>
                  <Ionicons name="close" size={20} color={C.inkMute} />
                </TouchableOpacity>
              </View>
            </View>
            <View style={{ height: 0.5, backgroundColor: C.hairline }} />

            <FlatList
              ref={scrollRef}
              data={rows}
              keyExtractor={c => String(c.id)}
              style={{ maxHeight: SCREEN_H * 0.52 }}
              contentContainerStyle={{ paddingVertical: 4 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={(e) => { scrollY.current = e.nativeEvent.contentOffset.y; }}
              initialNumToRender={8}
              windowSize={7}
              ListEmptyComponent={loading ? (
                <ActivityIndicator size="small" color={C.inkMute} style={{ margin: 24 }} />
              ) : (
                <Text style={styles.sheetEmpty}>No comments yet. Be the first!</Text>
              )}
              renderItem={({ item: c }) => {
                const cname = c.display_name ?? c.username ?? 'Explorer';
                const isOwn = myUserId && c.user_id === myUserId;
                const isExpanded = expandedComments.has(c.id);
                const isEditing = editingComment?.id === c.id;
                return (
                  <View style={styles.commentRow}>
                    <TouchableOpacity onPress={() => { dismiss(); router.push(`/user/${c.user_id}` as never); }}>
                      <Avatar url={c.avatar_url} name={cname} size={36} />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                      {isEditing ? (
                        <View style={styles.commentEditInput}>
                          <TextInput
                            ref={editInputRef}
                            value={editingComment.text}
                            onChangeText={t => setEditingComment({ id: c.id, text: t.slice(0, COMMENT_LIMIT) })}
                            style={[styles.commentTextInput, { paddingLeft: 0 }]}
                            multiline
                            returnKeyType="done"
                            blurOnSubmit
                            onSubmitEditing={() => editComment(c.id, editingComment.text)}
                          />
                          <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                            <TouchableOpacity onPress={() => editComment(c.id, editingComment.text)}>
                              <Text style={{ fontSize: 13, fontWeight: '700', color: C.primary }}>Save</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setEditingComment(null)}>
                              <Text style={{ fontSize: 13, color: C.inkMute }}>Cancel</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ) : (
                        <>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Text
                              style={styles.commentAuthor}
                              onPress={() => { dismiss(); router.push(`/user/${c.user_id}` as never); }}
                            >
                              {cname}
                            </Text>
                            {c.is_admin ? <AdminStar size={12} /> : null}
                          </View>
                          <Text style={[styles.commentInlineText, { marginTop: 2 }]}>
                            {isExpanded || c.content.length <= COMMENT_PREVIEW_CHARS
                              ? c.content
                              : c.content.slice(0, COMMENT_PREVIEW_CHARS)}
                            {!isExpanded && c.content.length > COMMENT_PREVIEW_CHARS && (
                              <Text
                                style={styles.commentMore}
                                onPress={() => setExpandedComments(prev => {
                                  const next = new Set(prev); next.add(c.id); return next;
                                })}
                              >
                                {'… more'}
                              </Text>
                            )}
                          </Text>
                        </>
                      )}
                      <Text style={[styles.commentTime, { marginTop: 3 }]}>{relTime(c.created_at)}</Text>
                    </View>
                    <MenuView
                      onPressAction={({ nativeEvent }) => {
                        switch (nativeEvent.event) {
                          case 'edit':
                            setEditingComment({ id: c.id, text: c.content });
                            // Sheet is already open and settled by the time this menu
                            // action fires — but autoFocus still forces UITextView layout
                            // synchronously on tap, so defer it a frame instead.
                            InteractionManager.runAfterInteractions(() => editInputRef.current?.focus());
                            break;
                          case 'delete':
                            deleteComment(c.id);
                            break;
                          case 'report':
                            setReportingCommentId(c.id);
                            break;
                        }
                      }}
                      actions={isOwn ? [
                        { id: 'edit', title: 'Edit', image: 'pencil', imageColor: menuInk },
                        { id: 'delete', title: 'Delete', image: 'trash', imageColor: MENU_DESTRUCTIVE, attributes: { destructive: true } },
                      ] : [
                        { id: 'report', title: 'Report', image: 'flag', imageColor: MENU_DESTRUCTIVE, attributes: { destructive: true } },
                      ]}
                    >
                      <TouchableOpacity
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={{ paddingLeft: 6, paddingTop: 2 }}
                      >
                        <Ionicons name="ellipsis-horizontal" size={15} color={C.inkMute} />
                      </TouchableOpacity>
                    </MenuView>
                  </View>
                );
              }}
            />

            <View style={{ height: 0.5, backgroundColor: C.hairline }} />
            <View style={styles.commentInput}>
              <Avatar url={myAvatarUrl} name={myName} size={28} />
              <View style={styles.commentInputInner}>
                <TextInput
                  value={draft}
                  onChangeText={v => setDraft(v.slice(0, COMMENT_LIMIT))}
                  onSubmitEditing={submit}
                  placeholder="Add a comment…"
                  placeholderTextColor={C.inkMute}
                  returnKeyType="send"
                  style={styles.commentTextInput}
                />
                {draft.length >= COMMENT_LIMIT - 50 && (
                  <Text style={styles.commentCharCount}>
                    {COMMENT_LIMIT - draft.length}
                  </Text>
                )}
                <TouchableOpacity
                  onPress={submit}
                  disabled={!draft.trim() || submitting}
                  style={[styles.commentSend, { backgroundColor: draft.trim() ? C.primary : 'transparent' }]}
                >
                  {submitting
                    ? <ActivityIndicator size="small" color={draft.trim() ? C.onPrimary : C.inkMute} />
                    : <Ionicons name="send" size={13} color={draft.trim() ? C.onPrimary : C.inkMute} />}
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>

      {reportingCommentId != null && (
        <ReportSheet
          targetType="comment"
          targetId={reportingCommentId}
          onClose={() => setReportingCommentId(null)}
          onSubmitted={() => Alert.alert('Report submitted', "Thanks — we'll review this.")}
        />
      )}
    </Modal>
  );
}

// ── Visibility icons ──────────────────────────────────────────────────────────

const VIS_ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  public:  'globe-outline',
  friends: 'people-outline',
  private: 'lock-closed-outline',
};
const VIS_ORDER = ['public', 'friends', 'private'] as const;

// ── PostCard ──────────────────────────────────────────────────────────────────

// Wrapped in memo — the feed's FlatList now appends pages as the user
// scrolls (see feed/index.tsx), and each parent re-render used to force
// every mounted card to fully re-render regardless of whether its own
// `post` prop actually changed (this component has ~9 useState/4 useEffect
// at the top level alone, plus preload fetches in nested subcomponents).
function PostCardImpl({
  post,
  myUserId,
  myAvatarUrl,
  myName,
  onDelete,
  onParkPress,
  autoOpenComments = false,
  autoOpenLikers = false,
}: {
  post: FeedPost;
  myUserId: string;
  myAvatarUrl?: string | null;
  myName?: string | null;
  onDelete?: (id: number) => void;
  /** `seed`, when given, is this post's own park_name/states/image — pass
      it straight through as the park page's seedName/seedStates/seedImageUrl
      route params so it can paint its real header instantly instead of a
      bare spinner. Every post already carries this data; the only reason
      not to forward it would be a caller with no route to attach params to. */
  onParkPress?: (parkCode: string, seed?: { name: string; states: string; imageUrl: string | null }) => void;
  autoOpenComments?: boolean;
  autoOpenLikers?: boolean;
}) {
  const router = useRouter();
  const C = useColors();
  // Literal resolved hex, not a DynamicColorIOS token — the menu lib's
  // native bridge can't render SF Symbols tinted with one (same class of
  // issue as LinearGradient; see the park page header menu's note).
  const isDark = useColorScheme() === 'dark';
  const menuInk = isDark ? '#FFFBF1' : '#26231C';
  const freshToken = useFreshToken();
  const [liked, setLiked] = useState(post.liked_by_me);
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [showComments, setShowComments] = useState(false);
  const [showLikers, setShowLikers] = useState(false);
  const [commentDelta, setCommentDelta] = useState(0);
  const [showMenu, setShowMenu] = useState(false);
  const [showReportSheet, setShowReportSheet] = useState(false);
  const [reported, setReported] = useState(false);
  const [friendAdded, setFriendAdded] = useState(false);
  // Full comment list, preloaded as the card scrolls into view so the sheet
  // opens instantly instead of showing a spinner.
  const [allComments, setAllComments] = useState<CommentRow[] | null>(null);
  const previewComments = allComments?.slice(-2) ?? [];

  // Deferred past the screen's own push-transition (InteractionManager waits
  // for it to finish) — opening this Modal, with its native MenuView/context
  // menu inside, WHILE the post-detail screen is still animating in left its
  // touch targets (the "..." menu, the commenter name) unresponsive: iOS
  // doesn't reliably wire up a context-menu interaction's gesture recognizer
  // on a view that appears mid-transition.
  useEffect(() => {
    if (!autoOpenComments) return;
    const task = InteractionManager.runAfterInteractions(() => setShowComments(true));
    return () => task.cancel();
  }, [autoOpenComments]);

  useEffect(() => {
    if (!autoOpenLikers || likeCount <= 0) return;
    const task = InteractionManager.runAfterInteractions(() => setShowLikers(true));
    return () => task.cancel();
  }, [autoOpenLikers, likeCount]);

  // Server comment_count is the source of truth; drop the optimistic local
  // delta once a fresh count arrives so counts don't double-add after a
  // feed refetch picks up the comment we already added locally.
  useEffect(() => {
    setCommentDelta(0);
  }, [post.comment_count]);

  useEffect(() => {
    if (post.comment_count + commentDelta <= 0) { setAllComments([]); return; }
    let active = true;
    apiReq(`/api/comments?postId=${post.id}`, freshToken)
      .then((rows: CommentRow[]) => { if (active) setAllComments(rows); })
      .catch(() => {});
    return () => { active = false; };
  // freshToken is stable; post.id never changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id, post.comment_count, commentDelta]);
  const [editingCaption, setEditingCaption] = useState(false);
  const [captionDraft, setCaptionDraft] = useState(post.caption ?? '');
  const [currentCaption, setCurrentCaption] = useState<string | null>(post.caption ?? null);
  // null = API didn't return the field (stale deployment) — hide the icon
  const [visibility, setVisibility] = useState<string | null>(post.visibility ?? null);
  const [visDraft, setVisDraft] = useState(post.visibility ?? 'public');
  const [bucketListed, setBucketListed] = useState(!!post.viewer_bucket_listed);
  const [bucketBusy, setBucketBusy] = useState(false);

  const handleToggleBucketList = useCallback(async () => {
    if (!post.park_code || bucketBusy) return;
    const next = !bucketListed;
    Haptics.impactAsync(next ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
    setBucketListed(next);
    setBucketBusy(true);
    try {
      if (next) {
        await apiReq('/api/visits', freshToken, {
          method: 'POST',
          body: JSON.stringify({ park_code: post.park_code, is_bucket_list: true }),
        });
      } else {
        await apiReq(`/api/visits?park_code=${post.park_code}`, freshToken, { method: 'DELETE' });
      }
      showToast(next ? 'Added to bucket list' : 'Removed from bucket list');
    } catch {
      setBucketListed(!next);
      showToast('Could not update bucket list', 'error');
    } finally {
      setBucketBusy(false);
    }
  }, [post.park_code, bucketListed, bucketBusy, freshToken]);

  // Feed refetches on focus (e.g. after editing a visit) — keep the locally
  // edited caption in sync with the fresh server value
  useEffect(() => {
    setCurrentCaption(post.caption ?? null);
  }, [post.caption]);

  useEffect(() => {
    setVisibility(post.visibility ?? null);
  }, [post.visibility]);

  // Momentary grow-on-press for the like/comment/share row — same feel as a
  // physical button, and Animated.spring naturally covers both a quick tap
  // (press+release fire back to back) and a long hold (stays grown until release).
  const likeScale    = useRef(new Animated.Value(1)).current;
  const commentScale = useRef(new Animated.Value(1)).current;
  const shareScale   = useRef(new Animated.Value(1)).current;
  const growIn  = (v: Animated.Value) => Animated.spring(v, { toValue: 1.22, useNativeDriver: true, speed: 40, bounciness: 10 }).start();
  const growOut = (v: Animated.Value) => Animated.spring(v, { toValue: 1,    useNativeDriver: true, speed: 20, bounciness: 6  }).start();

  const isOwnPost  = myUserId === post.clerk_user_id;
  const isBadge    = !!post.badge_id;
  const hasPhotos  = !isBadge && !!post.photos?.length;
  const photos     = hasPhotos ? post.photos! : [''];
  const name       = post.display_name ?? post.username ?? 'Explorer';
  const commentCount = post.comment_count + commentDelta;

  const handleLike = async () => {
    const prev = liked;
    // Liking lands a firmer tap than unliking
    Haptics.impactAsync(prev ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium);
    setLiked(!prev);
    setLikeCount(c => c + (prev ? -1 : 1));
    try {
      if (prev) {
        await apiReq(`/api/likes?postId=${post.id}`, freshToken, { method: 'DELETE' });
      } else {
        await apiReq('/api/likes', freshToken, {
          method: 'POST', body: JSON.stringify({ postId: post.id }),
        });
      }
    } catch {
      setLiked(prev);
      setLikeCount(c => c + (prev ? 1 : -1));
    }
  };

  const handleDelete = () => {
    Alert.alert('Delete post', 'Are you sure you want to delete this post?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await apiReq(`/api/posts/${post.id}`, freshToken, { method: 'DELETE' }).catch(() => {});
          onDelete?.(post.id);
        },
      },
    ]);
    setShowMenu(false);
  };

  const handleBlock = () => {
    setShowMenu(false);
    Alert.alert(
      'Block user',
      `${name} won't be able to see your posts or contact you, and you won't see theirs. This also flags them for review.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block', style: 'destructive',
          onPress: async () => {
            try {
              const tok = await freshToken();
              if (!tok) throw new Error('Not signed in');
              await blockUser(tok, post.clerk_user_id);
              emitUserBlocked(post.clerk_user_id);
            } catch {
              Alert.alert('Error', 'Could not block this user. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleAddFriend = async () => {
    setShowMenu(false);
    try {
      const tok = await freshToken();
      if (!tok) throw new Error('Not signed in');
      await sendFriendRequest(tok, post.clerk_user_id);
      setFriendAdded(true);
      showToast(`Friend request sent to ${name}`);
    } catch {
      Alert.alert('Error', 'Could not send friend request. Please try again.');
    }
  };

  const handleSaveCaption = async () => {
    // Visit posts inherit the visit's visibility, so route the change there;
    // all other posts carry their own
    const res = await apiReq(`/api/posts/${post.id}`, freshToken, {
      method: 'PATCH',
      body: JSON.stringify({
        caption: captionDraft,
        ...(post.visit_id == null ? { visibility: visDraft } : {}),
      }),
    }).catch(() => null);
    if (res === null) return;

    if (post.visit_id != null && visDraft !== visibility) {
      const visRes = await apiReq(`/api/visits/${post.visit_id}`, freshToken, {
        method: 'PATCH',
        body: JSON.stringify({ visibility: visDraft }),
      }).catch(() => null);
      if (visRes !== null) setVisibility(visDraft);
    } else {
      setVisibility(visDraft);
    }
    setCurrentCaption(captionDraft || null);
    setEditingCaption(false);
  };

  const isFirstVisit = !isBadge && !!post.visit_id && Number(post.visit_ordinal) === 1;
  // First-visit callout is reserved for the classic 63 National Parks;
  // every other designation gets none.
  const isNationalParkFirstVisit = isFirstVisit && !!post.is_national_park;

  const showPark = !isBadge && !!post.park_name;
  const goPark = () => {
    if (!post.park_code) return;
    const seed = post.park_name
      ? { name: post.park_name, states: post.park_states ?? '', imageUrl: post.park_image_url ?? null }
      : undefined;
    if (onParkPress) {
      onParkPress(post.park_code, seed);
    } else if (seed) {
      router.push({
        pathname: '/park/[id]',
        params: { id: post.park_code, name: seed.name, states: seed.states, imageUrl: seed.imageUrl ?? '' },
      } as never);
    } else {
      router.push(`/park/${post.park_code}` as never);
    }
  };
  // Already-visited parks can't be bucket-listed — POST /api/visits would
  // wipe the dated visit's visited_date.
  const canBookmark = !isBadge && !!post.park_code && !isOwnPost && !post.viewer_visited;

  // Layout, top to bottom: who (header: name, then where · when), the
  // story (title, caption, highlight), the picture, the facts (stat strip,
  // details line), then likes/comments. One left edge throughout, no
  // banner strips or colored card borders — the park in the header line
  // and the badge artwork itself are what tell the post types apart.
  return (
    <View style={styles.card}>
      {/* First visit — the park's passport stamp, big, faded and tilted,
          bleeding off the card's top-right corner behind everything else
          (first child = bottom of the stack; the card clips it), as if the
          post itself had been stamped. No label: the impression is the
          callout. `dark` picks the lightened inks so it still shows on
          the dark card. */}
      {isNationalParkFirstVisit && (
        <View style={[styles.firstVisitStamp, { opacity: isDark ? 0.2 : 0.14 }]} pointerEvents="none">
          <ParkStamp
            parkCode={post.park_code ?? ''}
            name={post.park_name ?? ''}
            states={post.park_states ?? ''}
            colorIdx={parkGradientIndex(post.park_code ?? 'xx')}
            size={150}
            dark={isDark}
            customGlyph={post.park_stamp_glyph}
            idSuffix={`-fv-${post.id}`}
          />
        </View>
      )}

      {/* Header */}
      {/* Who: avatar, then name (with the menu at the row's end) over
          "@handle · when · visibility" — two lines that match the avatar's
          height. The menu button's padding is pulled back with negative
          margins so it doesn't inflate the name row and push the handle
          line down. Where (the park) is its own full-width line under the
          whole header, below. Avatar and name link to the author. */}
      <View style={styles.cardHeader}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => router.push(`/user/${post.clerk_user_id}` as never)}
        >
          <Avatar url={post.avatar_url} name={name} size={40} />
        </TouchableOpacity>
        <View style={styles.cardHeaderMeta}>
          <View style={styles.nameRow}>
            <TouchableOpacity
              style={styles.nameTap}
              activeOpacity={0.7}
              onPress={() => router.push(`/user/${post.clerk_user_id}` as never)}
            >
              <Text style={styles.authorName} numberOfLines={1}>{name}</Text>
              {post.author_is_admin ? <AdminStar /> : null}
            </TouchableOpacity>
            <View style={{ flex: 1 }} />
            <View style={styles.headerRight}>
          <MenuView
            onOpenMenu={() => setShowMenu(true)}
            onCloseMenu={() => setShowMenu(false)}
            onPressAction={({ nativeEvent }) => {
              switch (nativeEvent.event) {
                case 'edit-visit':
                  router.push(`/(modals)/log-visit?visitId=${post.visit_id}&postId=${post.id}` as never);
                  break;
                case 'log-visit':
                  // A NEW visit to this same park — not the one this post is
                  // already about. Same park/name/states/image handoff
                  // park/[id].tsx's own logVisitParams uses, so the modal's
                  // "Where" step renders filled in immediately instead of
                  // waiting on its own parks fetch.
                  router.push({
                    pathname: '/(modals)/log-visit',
                    params: {
                      parkCode: post.park_code ?? '',
                      parkName: post.park_name ?? '',
                      parkStates: post.park_states ?? '',
                      parkImageUrl: post.park_image_url ?? '',
                    },
                  } as never);
                  break;
                case 'edit-caption':
                  setCaptionDraft(currentCaption ?? '');
                  setVisDraft(visibility ?? 'public');
                  setEditingCaption(true);
                  break;
                case 'delete':
                  handleDelete();
                  break;
                case 'report':
                  setShowReportSheet(true);
                  break;
                case 'block':
                  handleBlock();
                  break;
                case 'bucket':
                  handleToggleBucketList();
                  break;
                case 'add-friend':
                  handleAddFriend();
                  break;
              }
            }}
            actions={isOwnPost ? [
              ...(post.visit_id != null ? [{ id: 'edit-visit', title: 'Edit visit', image: 'pencil', imageColor: menuInk }] : []),
              // A separate, NEW visit to this park — distinct from editing
              // the one above. Own posts can be about a park you'd happily
              // log again (e.g. a badge post, or a return trip).
              ...(post.park_code ? [{ id: 'log-visit', title: 'Log a visit', image: 'calendar.badge.plus', imageColor: menuInk }] : []),
              { id: 'edit-caption', title: 'Edit caption', image: 'text.bubble', imageColor: menuInk },
              { id: 'delete', title: 'Delete post', image: 'trash', imageColor: MENU_DESTRUCTIVE, attributes: { destructive: true } },
            ] : [
              // Bucket-listing is about the PARK, not the post — as a bare
              // bookmark icon in the header it read as "save this post".
              // Spelled out here instead. (Gated the same as before: not
              // your own post, and a park you haven't already visited.)
              ...(canBookmark ? [{
                id: 'bucket',
                title: bucketListed ? 'Remove park from bucket list' : 'Add park to bucket list',
                image: bucketListed ? 'bookmark.slash' : 'bookmark',
                imageColor: menuInk,
                attributes: { disabled: bucketBusy },
              }] : []),
              ...(post.park_code ? [{ id: 'log-visit', title: 'Log a visit', image: 'calendar.badge.plus', imageColor: menuInk }] : []),
              ...(!post.is_friend_post ? [{
                id: 'add-friend',
                title: friendAdded ? 'Friend request sent' : 'Add friend',
                image: friendAdded ? 'person.badge.checkmark' : 'person.badge.plus',
                imageColor: menuInk,
                attributes: { disabled: friendAdded },
              }] : []),
              { id: 'report', title: reported ? 'Reported' : 'Report post', image: 'flag', imageColor: MENU_DESTRUCTIVE, attributes: { destructive: true, disabled: reported } },
              { id: 'block', title: 'Block user', image: 'person.crop.circle.badge.xmark', imageColor: MENU_DESTRUCTIVE, attributes: { destructive: true } },
            ]}
          >
            <TouchableOpacity
              hitSlop={8}
              style={[styles.menuBtn, showMenu && [styles.menuBtnActive, { backgroundColor: C.primary + '14' }]]}
            >
              <Ionicons name="ellipsis-horizontal" size={18} color={showMenu ? C.primary : C.inkMute} />
            </TouchableOpacity>
          </MenuView>
            </View>
          </View>
          <View style={styles.handleRow}>
            <Text style={styles.handleText} numberOfLines={1}>
              {post.username ? `@${post.username} · ` : ''}
              {relTime(post.created_at)}
            </Text>
            {visibility != null && (
              <Ionicons
                name={VIS_ICONS[visibility] ?? VIS_ICONS.public}
                size={11}
                color={C.inkMute}
                style={{ opacity: 0.75 }}
              />
            )}
          </View>
        </View>
      </View>

      {/* Where. The park name is the most important thing on the card, so
          it gets its own full-width line under the header — from the
          card's left edge, under the avatar, out to the right edge — and
          wraps to a second line before it ever truncates. */}
      {showPark && (
        <View style={styles.parkLine}>
          <TouchableOpacity style={styles.parkLineTap} activeOpacity={0.7} onPress={goPark}>
            {/* flex-start, not center — with a wrapped 2-line name, centering
                the icon against the whole block floats it at mid-height;
                flex-start plus a small nudge sits it beside the first line's
                cap height instead, where a leading pin belongs. */}
            <Ionicons name="location" size={14} color={C.primary} style={styles.parkPin} />
            <Text style={[styles.parkText, { color: C.primary }]} numberOfLines={2}>
              {post.park_name}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <View>
      {/* Story — a headline (the visit's title), the caption as a
          paragraph, and the highlight set off as a pull quote. No
          "Highlight:" / "Notes:" labels; the hierarchy does that work. */}
      {(post.visit_title || editingCaption || currentCaption || (!isBadge && post.visit_highlight)) ? (
        <View style={styles.story}>
          {post.visit_title ? <Text style={styles.title}>{post.visit_title}</Text> : null}
          {editingCaption ? (
            <View>
              <TextInput
                value={captionDraft}
                onChangeText={setCaptionDraft}
                multiline
                placeholder="Add a caption…"
                placeholderTextColor={C.inkMute}
                style={styles.captionInput}
              />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center' }}>
                <TouchableOpacity
                  onPress={handleSaveCaption}
                  style={[styles.captionBtn, { backgroundColor: C.primary }]}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: C.onPrimary }}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setEditingCaption(false)}
                  style={[styles.captionBtn, { backgroundColor: C.surfaceAlt, borderWidth: 0.5, borderColor: C.hairline }]}
                >
                  <Text style={{ fontSize: 13, color: C.ink }}>Cancel</Text>
                </TouchableOpacity>
                <View style={styles.visPicker}>
                  {VIS_ORDER.map(v => {
                    const active = visDraft === v;
                    return (
                      <TouchableOpacity
                        key={v}
                        onPress={() => setVisDraft(v)}
                        hitSlop={4}
                        style={[styles.visPickerBtn, active && [styles.visPickerBtnActive, { borderColor: C.primary + '40' }]]}
                      >
                        <Ionicons name={VIS_ICONS[v]} size={13} color={active ? C.primary : C.inkMute} />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </View>
          ) : currentCaption ? (
            <Text style={styles.caption}>{currentCaption}</Text>
          ) : null}
          {!isBadge && post.visit_highlight ? (
            <View style={[styles.highlight, { borderLeftColor: C.primary + '66' }]}>
              <Text style={styles.highlightText}>{post.visit_highlight}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Badge */}
      {isBadge && post.badge_id && (
        <View style={styles.padH}>
          <BadgePostBody badgeId={post.badge_id} />
        </View>
      )}

      {/* Picture — the photos, or the park's own image for a photo-less visit */}
      {!isBadge && !hasPhotos && !!post.visit_id && (
        <View style={styles.padH}>
          <ParkHeroBanner post={post} onPress={post.park_code ? goPark : undefined} />
        </View>
      )}
      {!isBadge && hasPhotos && <PhotoCarousel photos={photos} parkCode={post.park_code} />}

      {/* Rating / crowd / difficulty — the first thing under the picture */}
      {!isBadge && (
        <View style={styles.statsStrip}>
          <VisitStatsStrip visit={post} />
        </View>
      )}

      {/* Facts — the details line (weather, activities, company, would
          return), notes, hike stats */}
      {!isBadge && (
        <View style={styles.facts}>
          <VisitFacts visit={post} />
        </View>
      )}

      {/* Action row — extra bottom padding when it's the last row in the card */}
      <View style={[styles.actionRow, commentCount === 0 && { paddingBottom: 12 }]}>
        <TouchableOpacity
          onPress={handleLike}
          onLongPress={() => { if (likeCount > 0) setShowLikers(true); }}
          onPressIn={() => growIn(likeScale)}
          onPressOut={() => growOut(likeScale)}
          delayLongPress={300}
          activeOpacity={0.7}
          hitSlop={6}
          style={liked && styles.actionBtnLiked}
        >
          <Animated.View style={[styles.actionBtn, { transform: [{ scale: likeScale }] }]}>
            <Ionicons
              name={liked ? 'heart' : 'heart-outline'}
              size={22}
              color={liked ? C.liked : C.inkSoft}
            />
            {likeCount > 0 && (
              <Text style={[styles.actionBtnText, liked && { color: C.liked }]}>
                {likeCount.toLocaleString()}
              </Text>
            )}
          </Animated.View>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setShowComments(true)}
          onPressIn={() => growIn(commentScale)}
          onPressOut={() => growOut(commentScale)}
          activeOpacity={0.7}
          hitSlop={6}
        >
          <Animated.View style={[styles.actionBtn, { transform: [{ scale: commentScale }] }]}>
            <Ionicons name="chatbubble-outline" size={20} color={C.inkSoft} />
            {commentCount > 0 && (
              <Text style={styles.actionBtnText}>
                {commentCount.toLocaleString()}
              </Text>
            )}
          </Animated.View>
        </TouchableOpacity>

        <View style={{ flex: 1 }} />

        <TouchableOpacity
          onPress={async () => {
            // Universal Link — opens the app if installed, web fallback otherwise
            try {
              await Share.share({ message: `Check out this post on ParkQuest! https://parkquest.me/p/${post.id}` });
            } catch {
              // user dismissed the share sheet
            }
          }}
          onPressIn={() => growIn(shareScale)}
          onPressOut={() => growOut(shareScale)}
          activeOpacity={0.7}
          hitSlop={6}
          accessibilityLabel="Share post"
        >
          <Animated.View style={[styles.actionBtn, { transform: [{ scale: shareScale }] }]}>
            <Ionicons name="share-outline" size={20} color={C.inkSoft} />
          </Animated.View>
        </TouchableOpacity>
      </View>

      {/* Likers sheet */}
      {showLikers && (
        <LikersSheet
          postId={post.id}
          onClose={() => setShowLikers(false)}
        />
      )}

      {/* Comment preview */}
      {commentCount > 0 && (
        <View style={styles.previewPanel}>
          {previewComments.map(c => {
            const cname = c.display_name ?? c.username ?? 'Explorer';
            const isTruncated = c.content.length > 100;
            return (
              <TouchableOpacity
                key={c.id}
                onPress={() => setShowComments(true)}
                activeOpacity={0.75}
                style={styles.previewCommentRow}
              >
                <Text style={styles.previewCommentText} numberOfLines={2}>
                  <Text
                    style={styles.previewCommentAuthor}
                    onPress={() => router.push(`/user/${c.user_id}` as never)}
                    suppressHighlighting
                  >
                    {cname}{' '}
                  </Text>
                  {isTruncated ? `${c.content.slice(0, 100)}…` : c.content}
                </Text>
              </TouchableOpacity>
            );
          })}
          {commentCount > previewComments.length && (
            <TouchableOpacity
              onPress={() => setShowComments(true)}
              style={styles.viewAllBtn}
              activeOpacity={0.7}
            >
              <Text style={styles.viewAllText}>
                {`View all ${commentCount} comment${commentCount !== 1 ? 's' : ''}`}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Comments sheet */}
      {showComments && (
        <CommentsSheet
          postId={post.id}
          myUserId={myUserId}
          myAvatarUrl={myAvatarUrl}
          myName={myName}
          initialRows={allComments}
          onCountChange={delta => setCommentDelta(prev => prev + delta)}
          onClose={() => setShowComments(false)}
        />
      )}

      {/* Report sheet */}
      {showReportSheet && (
        <ReportSheet
          targetType="post"
          targetId={post.id}
          onClose={() => setShowReportSheet(false)}
          onSubmitted={() => {
            setReported(true);
            Alert.alert('Report submitted', "Thanks — we'll review this.");
            // Wait for the sheet's own close animation so we don't unmount
            // this card (and its Modal) mid-animation.
            setTimeout(() => onDelete?.(post.id), 250);
          }}
        />
      )}
      </View>
    </View>
  );
}

export const PostCard = memo(PostCardImpl);

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Carousel
  carouselCounter: {
    position: 'absolute', top: 10, right: 10,
    backgroundColor: 'rgba(20,17,12,0.60)',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 100,
  },
  carouselCounterText: {
    color: '#FFFBF1', fontSize: 13, fontWeight: '500',
  },
  carouselDots: {
    position: 'absolute', bottom: 14,
    width: '100%', flexDirection: 'row', justifyContent: 'center', gap: 5,
  },
  carouselDot: { height: 6, borderRadius: 4 },
  carouselDotActive: { width: 22, backgroundColor: '#FFFBF1' },
  carouselDotInactive: { width: 6, backgroundColor: 'rgba(255,251,241,0.50)' },
  carouselNav: {
    position: 'absolute', top: '50%', marginTop: -18,
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  carouselNavBtn: {
    flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center',
  },

  // Likers sheet
  sheetBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 18, borderTopRightRadius: 18,
    paddingTop: 8, paddingBottom: 34,
  },
  sheetHandle: {
    alignSelf: 'center', width: 36, height: 4, borderRadius: 2,
    backgroundColor: C.hairline, marginBottom: 10,
  },
  sheetTitle: {
    textAlign: 'center', fontSize: 13, fontWeight: '700',
    color: C.inkMute, letterSpacing: 1.2,
    paddingBottom: 10, borderBottomWidth: 0.5, borderBottomColor: C.hairlineSoft,
  },
  sheetEmpty: {
    textAlign: 'center', fontSize: 13, color: C.inkMute, padding: 24,
  },
  likerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 18, paddingVertical: 10,
  },
  likerName: { fontSize: 14, fontWeight: '600', color: C.ink },
  likerSub: { fontSize: 13, color: C.inkMute, marginTop: 1 },

  reportReasonRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 13,
    borderBottomWidth: 0.5, borderBottomColor: C.hairlineSoft,
  },
  reportReasonText: { fontSize: 14, color: C.ink, fontWeight: '500' },
  reportDetailsInput: {
    marginHorizontal: 18, marginTop: 12, minHeight: 64,
    fontSize: 14, color: C.ink, textAlignVertical: 'top',
    backgroundColor: C.hairlineSoft, borderRadius: 10, padding: 12,
  },
  reportSubmitBtn: {
    marginHorizontal: 18, marginTop: 16, marginBottom: 8,
    borderRadius: 12, paddingVertical: 13,
    alignItems: 'center', justifyContent: 'center',
  },
  reportSubmitText: { fontSize: 14, fontWeight: '700', color: '#FFFBF1' },

  // Park hero (photo-less visits)
  parkHero: {
    borderRadius: 14, overflow: 'hidden',
    height: 180, marginBottom: 12,
    justifyContent: 'flex-end',
  },
  parkHeroContent: {
    padding: 14,
  },
  parkHeroName: {
    fontSize: 19, fontWeight: '800', color: '#FFFBF1',
    letterSpacing: -0.3, lineHeight: 23,
  },
  parkHeroStates: {
    fontSize: 13, color: 'rgba(255,251,241,0.72)',
    marginTop: 3, fontWeight: '500',
  },

  // Badge row
  badgeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 14, marginBottom: 14, borderRadius: 14,
    backgroundColor: C.surfaceAlt, borderWidth: 0.5, borderColor: C.hairline,
  },
  badgeText: { flex: 1, minWidth: 0, gap: 3 },
  badgeName: {
    fontWeight: '700', fontSize: 16, color: C.ink, letterSpacing: -0.2, lineHeight: 21,
  },
  badgeMeta: {
    fontSize: 13, color: C.inkMute, lineHeight: 18,
  },

  // Story
  story: { paddingHorizontal: 18, paddingBottom: 12, gap: 6 },
  title: {
    fontSize: 17, fontWeight: '700', color: C.ink, letterSpacing: -0.2, lineHeight: 22,
  },
  highlight: {
    borderLeftWidth: 2, paddingLeft: 10, marginTop: 2,
  },
  highlightText: {
    fontSize: 14, color: C.inkSoft, lineHeight: 20, fontStyle: 'italic',
  },

  // Facts
  facts: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 14, gap: 10 },
  // Natural-width stats spread edge to edge; each Stat aligns its own
  // label under its value (left / center / right, see VisitStatsStrip).
  statsStrip: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: 18, paddingTop: 12, paddingBottom: 12,
  },
  stat: { gap: 1 },
  statValueRow: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 20 },
  statValue: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: C.ink },
  statLabel: { fontSize: 12, fontWeight: '500', color: C.inkMute },
  details: { fontSize: 13.5, color: C.inkSoft, lineHeight: 20 },
  detailsLink: { fontWeight: '600', color: C.ink },
  notes: { fontSize: 14, color: C.ink, lineHeight: 21 },

  // Comments
  previewPanel: {
    paddingBottom: 12,
  },
  viewAllBtn: {
    paddingHorizontal: 18, paddingTop: 8, paddingBottom: 2,
  },
  viewAllText: {
    fontSize: 13, fontWeight: '600', color: C.inkMute,
  },
  previewCommentRow: {
    paddingHorizontal: 18, paddingTop: 10, paddingBottom: 0,
  },
  previewCommentText: {
    fontSize: 13, color: C.ink, lineHeight: 18,
  },
  previewCommentAuthor: {
    fontWeight: '700', fontSize: 13, color: C.ink,
  },
  commentsSheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 8,
  },
  commentsSheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingTop: 4, paddingBottom: 12,
  },
  commentsSheetTitle: {
    fontSize: 13, fontWeight: '700', color: C.inkMute, letterSpacing: 1.4,
  },
  commentRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingHorizontal: 18, paddingVertical: 10,
  },
  commentInlineText: {
    fontSize: 13.5, color: C.ink, lineHeight: 19, flexShrink: 1,
  },
  commentAuthor: { fontWeight: '700', fontSize: 13.5, color: C.ink },
  commentMore: { fontSize: 13.5, color: C.inkMute, fontWeight: '600' },
  commentTime: {
    fontSize: 13, color: C.inkMute, letterSpacing: 0.3,
  },
  commentInput: {
    flexDirection: 'row', alignItems: 'center',
    gap: 9, paddingHorizontal: 18, paddingVertical: 10,
  },
  commentInputInner: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surfaceAlt, borderWidth: 0.5, borderColor: C.hairline,
    borderRadius: 20, paddingLeft: 13, paddingRight: 5,
  },
  commentTextInput: {
    flex: 1, fontSize: 13, color: C.ink,
    paddingVertical: 8, textAlignVertical: 'center',
  },
  commentSend: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  commentCharCount: {
    fontSize: 13, color: C.inkMute, paddingHorizontal: 4,
  },
  commentEditInput: {
    flex: 1, backgroundColor: C.surfaceAlt, borderRadius: 12,
    borderTopLeftRadius: 4, padding: 8, paddingHorizontal: 11,
    borderWidth: 0.5, borderColor: C.hairline,
  },

  // Card
  card: {
    backgroundColor: C.surface, borderRadius: 16,
    borderWidth: 0.5, borderColor: C.hairline,
    overflow: 'hidden', marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 18, paddingTop: 14, paddingBottom: 12,
  },
  cardHeaderMeta: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  nameTap: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1 },
  authorName: { fontWeight: '700', fontSize: 15, lineHeight: 20, color: C.ink, flexShrink: 1 },
  handleRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 },
  handleText: { fontSize: 13, lineHeight: 17, color: C.inkMute, flexShrink: 1 },
  // Pulled up a touch toward the header it belongs to; the first-visit
  // row / story below keep their own spacing.
  parkLine: { paddingHorizontal: 18, marginTop: -4, paddingBottom: 12 },
  parkLineTap: { flexDirection: 'row', alignItems: 'flex-start', gap: 5 },
  parkPin: { marginTop: 3 },
  parkText: { flex: 1, fontSize: 15, fontWeight: '600', lineHeight: 20, letterSpacing: -0.1 },
  firstVisitStamp: {
    position: 'absolute', top: -22, right: -26,
    transform: [{ rotate: '-14deg' }],
  },
  // Negative vertical margin cancels menuBtn's padding so the 30pt button
  // doesn't make the name row taller than its text.
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 2, marginVertical: -6 },
  menuBtn: { padding: 6, borderRadius: 6 },
  menuBtnActive: {
    borderRadius: 6,
  },
  caption: {
    fontSize: 15, color: C.ink, lineHeight: 22,
  },
  captionInput: {
    minHeight: 80, padding: 10, borderRadius: 8,
    borderWidth: 0.5, borderColor: C.hairline,
    fontSize: 15, color: C.ink, lineHeight: 22,
    backgroundColor: C.surface,
  },
  captionBtn: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8,
  },
  visPicker: {
    flexDirection: 'row', gap: 2, marginLeft: 'auto',
    backgroundColor: C.surfaceAlt, borderRadius: 8,
    borderWidth: 0.5, borderColor: C.hairline, padding: 2,
  },
  visPickerBtn: {
    width: 26, height: 24, borderRadius: 6,
    alignItems: 'center', justifyContent: 'center',
  },
  visPickerBtnActive: {
    backgroundColor: C.surface,
    borderWidth: 0.5,
  },
  padH: { paddingHorizontal: 18 },
  actionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 28,
    paddingHorizontal: 18, paddingVertical: 6,
    borderTopWidth: 0.5, borderTopColor: C.hairlineSoft,
  },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 6, paddingHorizontal: 2,
  },
  actionBtnLiked: {},
  actionBtnActive: {},
  actionBtnText: {
    fontSize: 13, fontWeight: '700', color: C.inkSoft, letterSpacing: 0.3,
  },
});
