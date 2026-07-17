import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, TextInput,
  Modal, Dimensions, Alert, ActivityIndicator, Share,
  StyleSheet, Pressable, KeyboardAvoidingView, Platform, Animated, PanResponder,
} from 'react-native';
import { MenuView } from '@react-native-menu/menu';
import { ImageLightbox } from '@/components/ImageLightbox';
import { Avatar } from '@/components/Avatar';
import { AdminStar } from '@/components/AdminStar';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { BADGE_MAP, badgeColors, ensureBadgeDefs } from '@/lib/badges';
import { blockUser } from '@/lib/api';
import { emitUserBlocked } from '@/lib/blocking';
import { STATIC as C, useColors } from '@/lib/palette';
import { relTime } from '@/lib/dates';
import { parkColor } from '@/lib/parkColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ReportTargetType, ReportReason } from '@parkquest/types';

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
  visit_rating: number | null;
  visit_activities: string[] | null;
  visit_weather: string[] | null;
  visit_crowd: number | null;
  visit_difficulty: number | null;
  visit_companion_count: number | null;
  visit_companion_names: Array<{ username: string; display_name: string | null; avatar_url: string | null }> | null;
  visit_highlight: string | null;
  visit_ordinal: number | null;
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

const WEATHER_LABELS: Record<string, string> = {
  clear: 'Clear', partly: 'Partly cloudy', cloudy: 'Cloudy',
  rain: 'Rain', storm: 'Storms', snow: 'Snow', fog: 'Fog', wind: 'Windy',
};
const WEATHER_ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  clear: 'sunny-outline', partly: 'partly-sunny-outline', cloudy: 'cloud-outline',
  rain: 'rainy-outline', storm: 'thunderstorm-outline', snow: 'snow-outline',
  fog: 'water-outline', wind: 'speedometer-outline',
};
const ACTIVITY_ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  hiking: 'walk-outline', camping: 'bonfire-outline', backpacking: 'walk-outline',
  climbing: 'trending-up-outline', kayaking: 'boat-outline', rafting: 'boat-outline',
  fishing: 'fish-outline', diving: 'water-outline', wildlife: 'paw-outline',
  photography: 'camera-outline', stargazing: 'moon-outline', tours: 'map-outline',
  cycling: 'bicycle-outline', mountaineering: 'trending-up-outline',
};
const CROWD_LABELS  = ['Empty', 'Quiet', 'Moderate', 'Busy', 'Packed'];
const DIFF_LABELS   = ['Easy', 'Light', 'Moderate', 'Hard', 'Strenuous'];

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

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

const CAROUSEL_CHROME_FADE_DELAY = 2500;

function PhotoCarousel({ photos, parkCode }: { photos: string[]; parkCode: string | null }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  // Measured from the carousel's own layout rather than assumed from screen
  // width — square, so this doubles as both the paging width and photo height.
  const [boxW, setBoxW] = useState(CARD_W_FALLBACK);
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
        showsHorizontalScrollIndicator={false}
        onScrollBeginDrag={showChromeBriefly}
        onMomentumScrollEnd={e => {
          const x = e.nativeEvent.contentOffset.x;
          setActiveIdx(Math.round(x / boxW));
        }}
      >
        {photos.map((src, k) => (
          <TouchableOpacity
            key={k}
            activeOpacity={0.92}
            onPress={() => setLightboxIdx(k)}
            style={{ width: boxW, height: boxW }}
          >
            {src ? (
              <Image
                source={{ uri: src }}
                style={{ width: boxW, height: boxW }}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            ) : (
              <View style={{ width: boxW, height: boxW, backgroundColor: fallbackColor }} />
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Counter badge — fades after a few seconds of inactivity */}
      {n > 1 && (
        <Animated.View style={[styles.carouselCounter, { opacity: chromeOpacity }]} pointerEvents="none">
          <Text style={styles.carouselCounterText}>{activeIdx + 1} / {n}</Text>
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

      {lightboxIdx !== null && (
        <ImageLightbox
          images={photos.filter(Boolean).map(url => ({ url }))}
          initialIndex={lightboxIdx}
          onClose={finalIndex => {
            setLightboxIdx(null);
            setActiveIdx(finalIndex);
            scrollRef.current?.scrollTo({ x: finalIndex * boxW, animated: false });
          }}
        />
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
      <View style={[styles.badgeBody, { borderColor: C.hairline, backgroundColor: C.surfaceAlt }]}>
        <View style={[styles.badgeCircle, { backgroundColor: C.hairline, shadowOpacity: 0, elevation: 0 }]} />
        <View style={styles.badgeText}>
          <View style={{ width: 72, height: 11, borderRadius: 4, backgroundColor: C.hairline, marginBottom: 8 }} />
          <View style={{ width: '55%', height: 15, borderRadius: 5, backgroundColor: C.hairline }} />
        </View>
      </View>
    );
  }

  const col = badgeColors(badge);

  return (
    <View style={[styles.badgeBody, {
      borderColor: col.fill + '60',
      backgroundColor: col.fill + '1a',
    }]}>
      <View style={[styles.badgeCircle, { shadowColor: col.fill, backgroundColor: col.fill }]}>
        <Text style={styles.badgeEmoji}>{badge?.emoji ?? '🏅'}</Text>
      </View>
      <View style={styles.badgeText}>
        <Text style={[styles.badgeTierLabel, { color: col.fill }]}>
          {(badge?.tier ?? 'bronze').toUpperCase()} BADGE
        </Text>
        <Text style={styles.badgeName}>{badge?.name ?? badgeId}</Text>
        {badge?.description ? (
          <Text style={styles.badgeDesc}>{badge.description}</Text>
        ) : null}
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
          <Text style={styles.parkHeroName} numberOfLines={2}>
            {post.park_name ?? 'National Park'}
          </Text>
          {post.visit_date && (
            <Text style={styles.parkHeroDate}>
              {new Date(post.visit_date).toLocaleDateString('en-US', {
                month: 'long', day: 'numeric', year: 'numeric',
              })}
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── MetaChip ──────────────────────────────────────────────────────────────────

function MetaChip({ icon, children }: { icon?: React.ComponentProps<typeof Ionicons>['name']; children: React.ReactNode }) {
  return (
    <View style={styles.chip}>
      {icon && <Ionicons name={icon} size={11} color={C.inkSoft} style={{ marginRight: 3 }} />}
      {typeof children === 'string'
        ? <Text style={styles.chipText}>{children}</Text>
        : children}
    </View>
  );
}

// ── VisitMeta ─────────────────────────────────────────────────────────────────

function VisitMeta({ post, heroDate = false }: { post: FeedPost; heroDate?: boolean }) {
  const router = useRouter();

  const hasAny =
    post.visit_date || post.visit_rating ||
    (post.visit_activities?.length ?? 0) > 0 ||
    (post.visit_weather?.length ?? 0) > 0 ||
    post.visit_crowd || post.visit_difficulty ||
    (post.visit_companion_count ?? 0) > 0 ||
    post.visit_highlight;

  if (!hasAny) return null;

  const dateLabel = post.visit_date
    ? new Date(post.visit_date).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      })
    : null;

  return (
    <View style={styles.visitMeta}>
      {post.visit_highlight && (
        <Text style={styles.visitHighlight}>"{post.visit_highlight}"</Text>
      )}
      <View style={styles.chipRow}>
        {post.visit_rating ? (
          <MetaChip>
            <Text style={styles.chipText}>
              <Text style={{ color: '#C49A28' }}>★ </Text>
              {post.visit_rating % 1 === 0
                ? post.visit_rating.toFixed(0)
                : post.visit_rating.toFixed(1)}
            </Text>
          </MetaChip>
        ) : null}
        {dateLabel && !heroDate ? (
          <MetaChip icon="calendar-outline"><Text style={styles.chipText}>{dateLabel}</Text></MetaChip>
        ) : null}
        {post.visit_weather?.map(w => (
          <MetaChip key={w} icon={WEATHER_ICONS[w] ?? 'cloudy-outline'}>
            <Text style={styles.chipText}>{WEATHER_LABELS[w] ?? w}</Text>
          </MetaChip>
        ))}
        {post.visit_crowd ? (
          <MetaChip icon="people-outline"><Text style={styles.chipText}>{CROWD_LABELS[post.visit_crowd - 1]}</Text></MetaChip>
        ) : null}
        {post.visit_difficulty ? (
          <MetaChip icon="trail-sign-outline"><Text style={styles.chipText}>{DIFF_LABELS[post.visit_difficulty - 1]}</Text></MetaChip>
        ) : null}
        {post.visit_activities?.map(a => (
          <MetaChip key={a} icon={ACTIVITY_ICONS[a.toLowerCase()] ?? 'star-outline'}>
            <Text style={styles.chipText}>{a.charAt(0).toUpperCase() + a.slice(1)}</Text>
          </MetaChip>
        ))}
        {(post.visit_companion_count ?? 0) > 0 && (() => {
          const names = post.visit_companion_names;
          if (names && names.length > 0) {
            const MAX = 2;
            const shown = names.slice(0, MAX);
            const extra = names.length - MAX;
            return (
              <MetaChip icon="people-outline">
                <Text style={styles.chipText}>
                  {'With '}
                  {shown.map((c, i) => (
                    <Text key={c.username}>
                      {i > 0 && ', '}
                      <Text
                        style={{ textDecorationLine: 'underline' }}
                        onPress={() => router.push(`/profile/${c.username}` as never)}
                      >
                        {c.display_name ?? `@${c.username}`}
                      </Text>
                    </Text>
                  ))}
                  {extra > 0 ? `, +${extra} more` : ''}
                </Text>
              </MetaChip>
            );
          }
          return (
            <MetaChip icon="people-outline">
              <Text style={styles.chipText}>
                +{post.visit_companion_count}{' '}
                {post.visit_companion_count === 1 ? 'companion' : 'companions'}
              </Text>
            </MetaChip>
          );
        })()}
      </View>
    </View>
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
  const [activeCommentMenu, setActiveCommentMenu] = useState<number | null>(null);
  const [reportingCommentId, setReportingCommentId] = useState<number | null>(null);
  const [editingComment, setEditingComment] = useState<{ id: number; text: string } | null>(null);
  const [expandedComments, setExpandedComments] = useState<Set<number>>(new Set());
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);

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
      setRows(prev => [...prev, {
        ...newComment,
        username: myName ?? null,
        display_name: myName ?? null,
        avatar_url: myAvatarUrl ?? null,
      }]);
      onCountChange(1);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    } catch {
      setDraft(text);
    } finally {
      setSubmitting(false);
    }
  }, [draft, submitting, postId, freshToken, myName, myAvatarUrl, onCountChange]);

  const deleteComment = useCallback(async (commentId: number) => {
    setActiveCommentMenu(null);
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
              <View style={styles.commentsSheetHeader}>
                <Text style={styles.commentsSheetTitle}>COMMENTS</Text>
                <TouchableOpacity onPress={dismiss} hitSlop={12}>
                  <Ionicons name="close" size={20} color={C.inkMute} />
                </TouchableOpacity>
              </View>
            </View>
            <View style={{ height: 0.5, backgroundColor: C.hairline }} />

            {activeCommentMenu !== null && (
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setActiveCommentMenu(null)} />
            )}
            <ScrollView
              ref={scrollRef}
              style={{ maxHeight: SCREEN_H * 0.52 }}
              contentContainerStyle={{ paddingVertical: 4 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={(e) => { scrollY.current = e.nativeEvent.contentOffset.y; }}
            >
              {loading ? (
                <ActivityIndicator size="small" color={C.inkMute} style={{ margin: 24 }} />
              ) : rows.length === 0 ? (
                <Text style={styles.sheetEmpty}>No comments yet. Be the first!</Text>
              ) : (
                rows.map(c => {
                  const cname = c.display_name ?? c.username ?? 'Explorer';
                  const isOwn = myUserId && c.user_id === myUserId;
                  const isExpanded = expandedComments.has(c.id);
                  const isEditing = editingComment?.id === c.id;
                  const menuOpen = activeCommentMenu === c.id;
                  return (
                    <View key={c.id} style={styles.commentRow}>
                      <TouchableOpacity onPress={() => { dismiss(); router.push(`/user/${c.user_id}` as never); }}>
                        <Avatar url={c.avatar_url} name={cname} size={36} />
                      </TouchableOpacity>
                      <View style={{ flex: 1 }}>
                        {isEditing ? (
                          <View style={styles.commentEditInput}>
                            <TextInput
                              autoFocus
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
                      <View style={{ position: 'relative' }}>
                        <TouchableOpacity
                          onPress={() => setActiveCommentMenu(menuOpen ? null : c.id)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          style={{ paddingLeft: 6, paddingTop: 2 }}
                        >
                          <Ionicons name="ellipsis-horizontal" size={15} color={C.inkMute} />
                        </TouchableOpacity>
                        {menuOpen && (
                          <View style={styles.commentMenu}>
                            {isOwn ? (
                              <>
                                <TouchableOpacity
                                  style={styles.menuItem}
                                  onPress={() => {
                                    setActiveCommentMenu(null);
                                    setEditingComment({ id: c.id, text: c.content });
                                  }}
                                >
                                  <Text style={styles.menuItemText}>Edit</Text>
                                </TouchableOpacity>
                                <View style={styles.menuDivider} />
                                <TouchableOpacity style={styles.menuItem} onPress={() => deleteComment(c.id)}>
                                  <Text style={[styles.menuItemText, { color: C.liked }]}>Delete</Text>
                                </TouchableOpacity>
                              </>
                            ) : (
                              <TouchableOpacity
                                style={styles.menuItem}
                                onPress={() => { setActiveCommentMenu(null); setReportingCommentId(c.id); }}
                              >
                                <Text style={[styles.menuItemText, { color: C.liked }]}>Report</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>

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

export function PostCard({
  post,
  myUserId,
  myAvatarUrl,
  myName,
  onDelete,
  onParkPress,
  openOnPress = true,
  autoOpenComments = false,
  autoOpenLikers = false,
}: {
  post: FeedPost;
  myUserId: string;
  myAvatarUrl?: string | null;
  myName?: string | null;
  onDelete?: (id: number) => void;
  onParkPress?: (parkCode: string) => void;
  // Tapping anywhere on the card (outside links/buttons) opens the post's
  // dedicated focus view. Disabled when the card is already rendered there.
  openOnPress?: boolean;
  autoOpenComments?: boolean;
  autoOpenLikers?: boolean;
}) {
  const router = useRouter();
  const C = useColors();
  const freshToken = useFreshToken();
  const [liked, setLiked] = useState(post.liked_by_me);
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [showComments, setShowComments] = useState(false);
  const [showLikers, setShowLikers] = useState(false);
  const [commentDelta, setCommentDelta] = useState(0);
  const [showMenu, setShowMenu] = useState(false);
  const [showReportSheet, setShowReportSheet] = useState(false);
  const [reported, setReported] = useState(false);
  // Full comment list, preloaded as the card scrolls into view so the sheet
  // opens instantly instead of showing a spinner.
  const [allComments, setAllComments] = useState<CommentRow[] | null>(null);
  const previewComments = allComments?.slice(-2) ?? [];

  useEffect(() => {
    if (autoOpenComments) setShowComments(true);
  }, [autoOpenComments]);

  useEffect(() => {
    if (autoOpenLikers && likeCount > 0) setShowLikers(true);
  }, [autoOpenLikers]);

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

  // Feed refetches on focus (e.g. after editing a visit) — keep the locally
  // edited caption in sync with the fresh server value
  useEffect(() => {
    setCurrentCaption(post.caption ?? null);
  }, [post.caption]);

  useEffect(() => {
    setVisibility(post.visibility ?? null);
  }, [post.visibility]);

  const isOwnPost  = myUserId === post.clerk_user_id;
  const isBadge    = !!post.badge_id;
  const hasPhotos  = !isBadge && !!post.photos?.length;
  const photos     = hasPhotos ? post.photos! : [''];
  const name       = post.display_name ?? post.username ?? 'Explorer';
  const commentCount = post.comment_count + commentDelta;

  const handleLike = async () => {
    const prev = liked;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
  // Only the body (park chip / photos / caption / actions) opens the post on tap —
  // the header can't be inside this Pressable. MenuView is a native context-menu
  // view, not a JS Touchable; its gesture recognizer doesn't participate in RN's
  // responder negotiation, so an ancestor Pressable's onPress fires right through it.
  const CardBody = openOnPress ? Pressable : View;

  return (
    <View style={[styles.card, isBadge && { borderWidth: 1, borderColor: C.primary + '60' }, isFirstVisit && { borderWidth: 1, borderColor: C.accent + '60' }]}>
      {/* Badge banner */}
      {isBadge && (
        <View style={[styles.badgeBanner, { borderBottomColor: C.primary + '60' }]}>
          <Ionicons name="ribbon" size={14} color={C.primary} />
          <Text style={[styles.badgeBannerText, { color: C.primary }]}>BADGE EARNED</Text>
        </View>
      )}

      {/* First visit banner */}
      {isFirstVisit && (
        <View style={[styles.badgeBanner, { backgroundColor: C.accent + '1A', borderBottomColor: C.accent + '60' }]}>
          <Ionicons name="star" size={14} color={C.accent} />
          <Text style={[styles.badgeBannerText, { color: C.accent }]}>FIRST VISIT</Text>
        </View>
      )}

      {/* Header */}
      <View style={styles.cardHeader}>
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}
          activeOpacity={0.7}
          onPress={() => router.push(`/user/${post.clerk_user_id}` as never)}
        >
          <Avatar url={post.avatar_url} name={name} size={40} />
          <View style={styles.cardHeaderMeta}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Text style={styles.authorName}>{name}</Text>
              {post.author_is_admin ? <AdminStar /> : null}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 1 }}>
              <Text style={[styles.authorSub, { marginTop: 0 }]}>
                {post.username ? `@${post.username} · ` : ''}
                {relTime(post.created_at)}
              </Text>
              {visibility != null && (
                <Ionicons
                  name={VIS_ICONS[visibility] ?? VIS_ICONS.public}
                  size={10.5}
                  color={C.inkMute}
                  style={{ opacity: 0.75 }}
                />
              )}
            </View>
          </View>
        </TouchableOpacity>
        <View style={{ position: 'relative' }}>
          <MenuView
            onOpenMenu={() => setShowMenu(true)}
            onCloseMenu={() => setShowMenu(false)}
            onPressAction={({ nativeEvent }) => {
              switch (nativeEvent.event) {
                case 'edit-visit':
                  router.push(`/(modals)/log-visit?visitId=${post.visit_id}&postId=${post.id}` as never);
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
              }
            }}
            actions={isOwnPost ? [
              ...(post.visit_id != null ? [{ id: 'edit-visit', title: 'Edit visit' }] : []),
              { id: 'edit-caption', title: 'Edit caption' },
              { id: 'delete', title: 'Delete post', attributes: { destructive: true } },
            ] : [
              { id: 'report', title: reported ? 'Reported' : 'Report post', attributes: { destructive: true, disabled: reported } },
              { id: 'block', title: 'Block user', attributes: { destructive: true } },
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

      <CardBody {...(openOnPress ? { onPress: () => router.push(`/(tabs)/feed/post/${post.id}` as never) } : {})}>
      {/* Park chip */}
      {post.park_name && !isBadge && !(!hasPhotos && post.visit_id) && (
        <TouchableOpacity
          style={styles.parkChip}
          onPress={() =>
            onParkPress
              ? onParkPress(post.park_code!)
              : router.push(`/parks/${post.park_code}` as never)
          }
        >
          <Ionicons name="location-sharp" size={11} color={C.primary} />
          <Text style={[styles.parkChipText, { color: C.primary }]}>{post.park_name.toUpperCase()}</Text>
        </TouchableOpacity>
      )}

      {/* Caption */}
      {editingCaption ? (
        <View style={styles.captionEdit}>
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

      {/* Badge body */}
      {isBadge && post.badge_id && (
        <View style={styles.padH}>
          <BadgePostBody badgeId={post.badge_id} />
        </View>
      )}

      {/* Park hero banner — visit posts with no photos */}
      {!isBadge && !hasPhotos && post.visit_id && (
        <View style={styles.padH}>
          <ParkHeroBanner
            post={post}
            onPress={post.park_code
              ? () => (onParkPress
                  ? onParkPress(post.park_code!)
                  : router.push(`/parks/${post.park_code}` as never))
              : undefined}
          />
        </View>
      )}

      {/* Visit metadata */}
      {!isBadge && <VisitMeta post={post} heroDate={!hasPhotos && !!post.visit_id} />}

      {/* Photo carousel */}
      {!isBadge && hasPhotos && <PhotoCarousel photos={photos} parkCode={post.park_code} />}

      {/* Action row — extra bottom padding when it's the last row in the card */}
      <View style={[styles.actionRow, commentCount === 0 && { paddingBottom: 12 }]}>
        <TouchableOpacity
          onPress={handleLike}
          onLongPress={() => { if (likeCount > 0) setShowLikers(true); }}
          delayLongPress={300}
          activeOpacity={0.7}
          hitSlop={6}
          style={[styles.actionBtn, liked && styles.actionBtnLiked]}
        >
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
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setShowComments(true)}
          activeOpacity={0.7}
          hitSlop={6}
          style={styles.actionBtn}
        >
          <Ionicons name="chatbubble-outline" size={20} color={C.inkSoft} />
          {commentCount > 0 && (
            <Text style={styles.actionBtnText}>
              {commentCount.toLocaleString()}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={async () => {
            // Universal Link — opens the app if installed, web fallback otherwise
            try {
              await Share.share({ message: `Check out this post on ParkQuest! https://parkquest.me/p/${post.id}` });
            } catch {
              // user dismissed the share sheet
            }
          }}
          activeOpacity={0.7}
          hitSlop={6}
          style={styles.actionBtn}
          accessibilityLabel="Share post"
        >
          <Ionicons name="share-outline" size={20} color={C.inkSoft} />
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
      </CardBody>
    </View>
  );
}

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

  // Badge post body
  parkHero: {
    borderRadius: 14, overflow: 'hidden',
    height: 180, marginBottom: 14,
    justifyContent: 'flex-end',
  },
  parkHeroContent: {
    padding: 16,
  },
  parkHeroName: {
    fontSize: 22, fontWeight: '800', color: '#FFFBF1',
    letterSpacing: -0.4, lineHeight: 26,
  },
  parkHeroDate: {
    fontSize: 13, color: 'rgba(255,251,241,0.70)',
    marginTop: 4, fontWeight: '500', letterSpacing: 0.2,
  },

  badgeBody: {
    borderRadius: 14, padding: 18, borderWidth: 0.5,
    flexDirection: 'row', alignItems: 'center', gap: 18,
    marginBottom: 14,
  },
  badgeCircle: {
    width: 64, height: 64, borderRadius: 32,
    alignItems: 'center', justifyContent: 'center',
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 12,
    elevation: 6,
    flexShrink: 0,
  },
  badgeEmoji: { fontSize: 30 },
  badgeText: { flex: 1, minWidth: 0 },
  badgeTierLabel: {
    fontSize: 13, letterSpacing: 1.4, fontWeight: '700', marginBottom: 3,
  },
  badgeName: {
    fontWeight: '800', fontSize: 18, color: C.ink, letterSpacing: -0.3, lineHeight: 22,
  },
  badgeDesc: {
    fontSize: 13, color: C.inkMute, marginTop: 4, lineHeight: 18,
  },

  // Chips
  chip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surfaceAlt, borderWidth: 0.5, borderColor: C.hairline,
    borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4,
  },
  chipText: { fontSize: 13, fontWeight: '600', color: C.inkSoft },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },

  // Visit meta
  visitMeta: { paddingHorizontal: 18, paddingBottom: 14, gap: 10 },
  visitHighlight: {
    fontSize: 13, color: C.inkSoft, fontStyle: 'italic', lineHeight: 19,
  },

  // Comments
  previewPanel: {
    borderTopWidth: 0.5, borderTopColor: C.hairlineSoft,
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
  commentMenu: {
    position: 'absolute', top: 22, right: 0, zIndex: 200,
    backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.hairline,
    borderRadius: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12, shadowRadius: 12, elevation: 8,
    minWidth: 120, overflow: 'hidden',
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
  badgeBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 18, paddingVertical: 10,
    backgroundColor: C.surfaceAlt,
    borderBottomWidth: 1,
  },
  badgeBannerText: {
    fontSize: 13, letterSpacing: 1.2, fontWeight: '700',
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 18, paddingTop: 14, paddingBottom: 10,
  },
  cardHeaderMeta: { flex: 1 },
  authorName: { fontWeight: '700', fontSize: 14, color: C.ink },
  authorSub: { fontSize: 13, color: C.inkMute, marginTop: 1 },
  menuBtn: { padding: 6, borderRadius: 6 },
  menuBtnActive: {
    borderRadius: 6,
  },
  menuItem: { paddingHorizontal: 14, paddingVertical: 11 },
  menuItemText: { fontSize: 14, color: C.ink },
  menuDivider: { height: 0.5, backgroundColor: C.hairline },
  parkChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 18, paddingBottom: 10,
  },
  parkChipText: {
    fontSize: 13, fontWeight: '700', letterSpacing: 0.4,
  },
  caption: {
    paddingHorizontal: 18, paddingBottom: 12,
    fontSize: 15, color: C.ink, lineHeight: 22,
  },
  captionEdit: {
    paddingHorizontal: 18, paddingBottom: 12,
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
