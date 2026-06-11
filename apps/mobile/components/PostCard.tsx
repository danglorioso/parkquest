import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, TextInput,
  Modal, Dimensions, Alert, ActivityIndicator,
  StyleSheet, Pressable, KeyboardAvoidingView, Platform, Animated,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BADGE_MAP, BADGE_TIER_COLORS } from '@/lib/badges';

// ── Design tokens ─────────────────────────────────────────────────────────────

const C = {
  bg:          '#F2EBDB',
  surface:     '#FFFBF1',
  surfaceAlt:  '#F7F0DE',
  ink:         '#1B1A16',
  inkSoft:     '#3C3A33',
  inkMute:     '#7A746A',
  hairline:    'rgba(27,26,22,0.10)',
  hairlineSoft:'rgba(27,26,22,0.06)',
  primary:     '#1F3D2E',
  accent:      '#C56B3D',
  liked:       '#D45040',
};

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
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
  is_friend_post: boolean;
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
}

interface CommentRow {
  id: number;
  content: string;
  created_at: string;
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

interface Liker {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function relTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)       return 'just now';
  if (diff < 3600)     return `${Math.floor(diff / 60)}m`;
  if (diff < 86400)    return `${Math.floor(diff / 3600)}h`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const PARK_COLORS = [
  '#1F3D2E', '#2D4F66', '#7B3A1F', '#3A2E5C', '#2F7A4A',
];
export function parkColor(code: string): string {
  const idx = code.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % PARK_COLORS.length;
  return PARK_COLORS[idx];
}

const WEATHER_LABELS: Record<string, string> = {
  clear: 'Clear', partly: 'Partly cloudy', cloudy: 'Cloudy',
  rain: 'Rain', storm: 'Storms', snow: 'Snow', fog: 'Fog', wind: 'Windy',
};
const CROWD_LABELS  = ['Empty', 'Quiet', 'Moderate', 'Busy', 'Packed'];
const DIFF_LABELS   = ['Easy', 'Light', 'Moderate', 'Hard', 'Strenuous'];

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

async function apiReq(path: string, token: string, options: RequestInit = {}) {
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

// ── Avatar ────────────────────────────────────────────────────────────────────

export function Avatar({
  url, name, size = 40,
}: { url?: string | null; name?: string | null; size?: number }) {
  const initials = (name ?? '?')
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <View style={[styles.avatarWrap, { width: size, height: size, borderRadius: size / 2 }]}>
      {url ? (
        <Image
          source={{ uri: url }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      ) : (
        <Text style={[styles.avatarInitials, { fontSize: size * 0.32 }]}>{initials}</Text>
      )}
    </View>
  );
}

// ── Lightbox ──────────────────────────────────────────────────────────────────

function Lightbox({
  photos, startIdx, onClose,
}: { photos: string[]; startIdx: number; onClose: () => void }) {
  const [idx, setIdx] = useState(startIdx);
  const n = photos.length;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.lightboxBg}>
        {/* Close */}
        <TouchableOpacity style={styles.lightboxClose} onPress={onClose} hitSlop={16}>
          <Ionicons name="close" size={22} color="#fff" />
        </TouchableOpacity>

        {/* Counter */}
        {n > 1 && (
          <View style={styles.lightboxCounter}>
            <Text style={styles.lightboxCounterText}>{idx + 1} / {n}</Text>
          </View>
        )}

        {/* Image */}
        <Image
          source={{ uri: photos[idx] }}
          style={styles.lightboxImage}
          contentFit="contain"
        />

        {/* Prev */}
        {idx > 0 && (
          <TouchableOpacity
            style={[styles.lightboxNav, { left: 16 }]}
            onPress={() => setIdx(i => i - 1)}
          >
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
        )}

        {/* Next */}
        {idx < n - 1 && (
          <TouchableOpacity
            style={[styles.lightboxNav, { right: 16 }]}
            onPress={() => setIdx(i => i + 1)}
          >
            <Ionicons name="chevron-forward" size={24} color="#fff" />
          </TouchableOpacity>
        )}

        {/* Dot strip */}
        {n > 1 && (
          <View style={styles.lightboxDots}>
            {photos.map((_, k) => (
              <TouchableOpacity key={k} onPress={() => setIdx(k)}>
                <View style={[styles.dot, k === idx ? styles.dotActive : styles.dotInactive]} />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </Modal>
  );
}

// ── LikersSheet ───────────────────────────────────────────────────────────────

function LikersSheet({
  postId, token, onClose,
}: { postId: number; token: string; onClose: () => void }) {
  const router = useRouter();
  const [rows, setRows] = useState<Liker[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiReq(`/api/likes?postId=${postId}`, token)
      .then(setRows)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [postId, token]);

  const openProfile = (userId: string) => {
    onClose();
    router.push(`/user/${userId}` as never);
  };

  const slide = useRef(new Animated.Value(480)).current;
  useEffect(() => {
    Animated.timing(slide, {
      toValue: 0,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [slide]);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <Animated.View style={[styles.sheet, { transform: [{ translateY: slide }] }]}>
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
    </Modal>
  );
}

// ── PhotoCarousel ─────────────────────────────────────────────────────────────

const SCREEN_W = Dimensions.get('window').width;
// Cards have 16px horizontal margin on each side in the feed list.
const CARD_W   = SCREEN_W - 32;
const PHOTO_H  = 380;

function PhotoCarousel({ photos, parkCode }: { photos: string[]; parkCode: string | null }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const n = photos.length;
  const fallbackColor = parkColor(parkCode ?? 'xx');

  const goTo = (k: number) => {
    const next = Math.max(0, Math.min(n - 1, k));
    scrollRef.current?.scrollTo({ x: next * CARD_W, animated: true });
    setActiveIdx(next);
  };

  return (
    <View>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={e => {
          const x = e.nativeEvent.contentOffset.x;
          setActiveIdx(Math.round(x / CARD_W));
        }}
      >
        {photos.map((src, k) => (
          <TouchableOpacity
            key={k}
            activeOpacity={0.92}
            onPress={() => setLightboxIdx(k)}
            style={{ width: CARD_W, height: PHOTO_H }}
          >
            {src ? (
              <Image
                source={{ uri: src }}
                style={{ width: CARD_W, height: PHOTO_H }}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            ) : (
              <View style={{ width: CARD_W, height: PHOTO_H, backgroundColor: fallbackColor }} />
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Counter badge */}
      {n > 1 && (
        <View style={styles.carouselCounter}>
          <Text style={styles.carouselCounterText}>{activeIdx + 1} / {n}</Text>
        </View>
      )}

      {/* Prev arrow */}
      {n > 1 && activeIdx > 0 && (
        <TouchableOpacity
          style={[styles.carouselNav, { left: 10 }]}
          onPress={() => goTo(activeIdx - 1)}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={18} color="#FFFBF1" />
        </TouchableOpacity>
      )}

      {/* Next arrow */}
      {n > 1 && activeIdx < n - 1 && (
        <TouchableOpacity
          style={[styles.carouselNav, { right: 10 }]}
          onPress={() => goTo(activeIdx + 1)}
          hitSlop={8}
        >
          <Ionicons name="chevron-forward" size={18} color="#FFFBF1" />
        </TouchableOpacity>
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
        <Lightbox
          photos={photos.filter(Boolean)}
          startIdx={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
        />
      )}
    </View>
  );
}

// ── BadgePostBody ─────────────────────────────────────────────────────────────

function BadgePostBody({ badgeId }: { badgeId: string }) {
  const badge = BADGE_MAP.get(badgeId);
  const tier  = badge?.tier ?? 'bronze';
  const col   = BADGE_TIER_COLORS[tier];

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
          {tier.toUpperCase()} BADGE
        </Text>
        <Text style={styles.badgeName}>{badge?.name ?? badgeId}</Text>
        {badge?.description ? (
          <Text style={styles.badgeDesc}>{badge.description}</Text>
        ) : null}
      </View>
    </View>
  );
}

// ── MetaChip ──────────────────────────────────────────────────────────────────

function MetaChip({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.chip}>
      {typeof children === 'string'
        ? <Text style={styles.chipText}>{children}</Text>
        : children}
    </View>
  );
}

// ── VisitMeta ─────────────────────────────────────────────────────────────────

function VisitMeta({ post }: { post: FeedPost }) {
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
        {dateLabel ? (
          <MetaChip><Text style={styles.chipText}>{dateLabel}</Text></MetaChip>
        ) : null}
        {post.visit_weather?.map(w => (
          <MetaChip key={w}>
            <Text style={styles.chipText}>{WEATHER_LABELS[w] ?? w}</Text>
          </MetaChip>
        ))}
        {post.visit_crowd ? (
          <MetaChip><Text style={styles.chipText}>{CROWD_LABELS[post.visit_crowd - 1]} crowd</Text></MetaChip>
        ) : null}
        {post.visit_difficulty ? (
          <MetaChip><Text style={styles.chipText}>{DIFF_LABELS[post.visit_difficulty - 1]}</Text></MetaChip>
        ) : null}
        {post.visit_activities?.map(a => (
          <MetaChip key={a}>
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
              <MetaChip>
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
            <MetaChip>
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

// ── CommentsPanel ─────────────────────────────────────────────────────────────

function CommentsPanel({
  postId, token, myAvatarUrl, myName, onCountChange,
}: {
  postId: number;
  token: string;
  myAvatarUrl?: string | null;
  myName?: string | null;
  onCountChange: (delta: number) => void;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<CommentRow[]>([]);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiReq(`/api/comments?postId=${postId}`, token)
      .then(setRows)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [postId, token]);

  const submit = useCallback(async () => {
    const text = draft.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    setDraft('');
    try {
      const newComment = await apiReq('/api/comments', token, {
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
    } catch {
      setDraft(text);
    } finally {
      setSubmitting(false);
    }
  }, [draft, submitting, postId, token, myName, myAvatarUrl, onCountChange]);

  return (
    <View style={styles.commentsPanel}>
      {loading && (
        <ActivityIndicator size="small" color={C.inkMute} style={{ margin: 12 }} />
      )}
      {rows.map(c => {
        const cname = c.display_name ?? c.username ?? 'Explorer';
        return (
          <View key={c.id} style={styles.commentRow}>
            <TouchableOpacity onPress={() => router.push(`/user/${c.user_id}` as never)}>
              <Avatar url={c.avatar_url} name={cname} size={28} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <View style={styles.commentBubble}>
                <Text
                  style={styles.commentAuthor}
                  onPress={() => router.push(`/user/${c.user_id}` as never)}
                >
                  {cname}{' '}
                </Text>
                <Text style={styles.commentContent}>{c.content}</Text>
              </View>
              <Text style={styles.commentTime}>{relTime(c.created_at)}</Text>
            </View>
          </View>
        );
      })}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.commentInput}>
          <Avatar url={myAvatarUrl} name={myName} size={28} />
          <View style={styles.commentInputInner}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={submit}
              placeholder="Add a comment…"
              placeholderTextColor={C.inkMute}
              returnKeyType="send"
              style={styles.commentTextInput}
            />
            <TouchableOpacity
              onPress={submit}
              disabled={!draft.trim() || submitting}
              style={[styles.commentSend, { backgroundColor: draft.trim() ? C.primary : 'transparent' }]}
            >
              {submitting
                ? <ActivityIndicator size="small" color={draft.trim() ? '#FFFBF1' : C.inkMute} />
                : <Ionicons name="send" size={13} color={draft.trim() ? '#FFFBF1' : C.inkMute} />}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

// ── PostCard ──────────────────────────────────────────────────────────────────

export function PostCard({
  post,
  token,
  myUserId,
  myAvatarUrl,
  myName,
  onDelete,
}: {
  post: FeedPost;
  token: string;
  myUserId: string;
  myAvatarUrl?: string | null;
  myName?: string | null;
  onDelete?: (id: number) => void;
}) {
  const router = useRouter();
  const [liked, setLiked] = useState(post.liked_by_me);
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [showComments, setShowComments] = useState(false);
  const [showLikers, setShowLikers] = useState(false);
  const [commentDelta, setCommentDelta] = useState(0);
  const [showMenu, setShowMenu] = useState(false);
  const [editingCaption, setEditingCaption] = useState(false);
  const [captionDraft, setCaptionDraft] = useState(post.caption ?? '');
  const [currentCaption, setCurrentCaption] = useState<string | null>(post.caption ?? null);

  // Feed refetches on focus (e.g. after editing a visit) — keep the locally
  // edited caption in sync with the fresh server value
  useEffect(() => {
    setCurrentCaption(post.caption ?? null);
  }, [post.caption]);

  const isOwnPost  = myUserId === post.clerk_user_id;
  const isBadge    = !!post.badge_id;
  const hasPhotos  = !isBadge && !!post.photos?.length;
  const photos     = hasPhotos ? post.photos! : [''];
  const name       = post.display_name ?? post.username ?? 'Explorer';
  const commentCount = post.comment_count + commentDelta;

  const handleLike = async () => {
    const prev = liked;
    setLiked(!prev);
    setLikeCount(c => c + (prev ? -1 : 1));
    try {
      if (prev) {
        await apiReq(`/api/likes?postId=${post.id}`, token, { method: 'DELETE' });
      } else {
        await apiReq('/api/likes', token, {
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
          await apiReq(`/api/posts/${post.id}`, token, { method: 'DELETE' }).catch(() => {});
          onDelete?.(post.id);
        },
      },
    ]);
    setShowMenu(false);
  };

  const handleSaveCaption = async () => {
    const res = await apiReq(`/api/posts/${post.id}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ caption: captionDraft }),
    }).catch(() => null);
    if (res !== null) {
      setCurrentCaption(captionDraft || null);
      setEditingCaption(false);
    }
  };

  return (
    <View style={styles.card}>
      {/* Badge banner */}
      {isBadge && (
        <View style={styles.badgeBanner}>
          <Ionicons name="ribbon" size={14} color={C.primary} />
          <Text style={styles.badgeBannerText}>BADGE EARNED</Text>
        </View>
      )}

      {/* Header */}
      <View style={styles.cardHeader}>
        <TouchableOpacity onPress={() => router.push(`/user/${post.clerk_user_id}` as never)}>
          <Avatar url={post.avatar_url} name={name} size={40} />
        </TouchableOpacity>
        <View style={styles.cardHeaderMeta}>
          <TouchableOpacity onPress={() => router.push(`/user/${post.clerk_user_id}` as never)}>
            <Text style={styles.authorName}>{name}</Text>
          </TouchableOpacity>
          <Text style={styles.authorSub}>
            {post.username ? `@${post.username} · ` : ''}
            {relTime(post.created_at)}
          </Text>
        </View>
        {isOwnPost && (
          <TouchableOpacity onPress={() => setShowMenu(v => !v)} hitSlop={8} style={styles.menuBtn}>
            <Ionicons name="ellipsis-horizontal" size={18} color={C.inkMute} />
          </TouchableOpacity>
        )}
      </View>

      {/* ... menu */}
      {showMenu && isOwnPost && (
        <View style={styles.menu}>
          {post.visit_id != null && (
            <>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setShowMenu(false);
                  router.push(`/(modals)/log-visit?visitId=${post.visit_id}&postId=${post.id}` as never);
                }}
              >
                <Text style={styles.menuItemText}>Edit visit</Text>
              </TouchableOpacity>
              <View style={styles.menuDivider} />
            </>
          )}
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => { setCaptionDraft(currentCaption ?? ''); setEditingCaption(true); setShowMenu(false); }}
          >
            <Text style={styles.menuItemText}>Edit caption</Text>
          </TouchableOpacity>
          <View style={styles.menuDivider} />
          <TouchableOpacity style={styles.menuItem} onPress={handleDelete}>
            <Text style={[styles.menuItemText, { color: '#D45040' }]}>Delete post</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Park chip */}
      {post.park_name && !isBadge && (
        <TouchableOpacity
          style={styles.parkChip}
          onPress={() => router.push(`/parks/${post.park_code}` as never)}
        >
          <Ionicons name="location-sharp" size={11} color={C.primary} />
          <Text style={styles.parkChipText}>{post.park_name.toUpperCase()}</Text>
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
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <TouchableOpacity
              onPress={handleSaveCaption}
              style={[styles.captionBtn, { backgroundColor: C.primary }]}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFFBF1' }}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setEditingCaption(false)}
              style={[styles.captionBtn, { backgroundColor: C.surfaceAlt, borderWidth: 0.5, borderColor: C.hairline }]}
            >
              <Text style={{ fontSize: 13, color: C.ink }}>Cancel</Text>
            </TouchableOpacity>
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

      {/* Visit metadata */}
      {!isBadge && <VisitMeta post={post} />}

      {/* Photo carousel */}
      {!isBadge && <PhotoCarousel photos={photos} parkCode={post.park_code} />}

      {/* Action row */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          onPress={handleLike}
          onLongPress={() => { if (likeCount > 0) setShowLikers(true); }}
          delayLongPress={300}
          activeOpacity={0.7}
          style={[styles.actionBtn, liked && styles.actionBtnLiked]}
        >
          <Ionicons
            name={liked ? 'heart' : 'heart-outline'}
            size={15}
            color={liked ? C.liked : C.inkSoft}
          />
          <Text style={[styles.actionBtnText, liked && { color: C.liked }]}>
            {likeCount > 0 ? likeCount.toLocaleString() : 'Like'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setShowComments(v => !v)}
          activeOpacity={0.7}
          style={[styles.actionBtn, showComments && styles.actionBtnActive]}
        >
          <Ionicons
            name={showComments ? 'chatbubble' : 'chatbubble-outline'}
            size={15}
            color={showComments ? C.primary : C.inkSoft}
          />
          <Text style={[styles.actionBtnText, showComments && { color: C.primary }]}>
            {commentCount > 0 ? commentCount.toLocaleString() : 'Comment'}
          </Text>
        </TouchableOpacity>

        <View style={{ flex: 1 }} />

        <TouchableOpacity activeOpacity={0.7} style={styles.actionBtn}>
          <Ionicons name="bookmark-outline" size={15} color={C.inkSoft} />
        </TouchableOpacity>
      </View>

      {/* Likers sheet */}
      {showLikers && (
        <LikersSheet
          postId={post.id}
          token={token}
          onClose={() => setShowLikers(false)}
        />
      )}

      {/* Comments panel */}
      {showComments && (
        <CommentsPanel
          postId={post.id}
          token={token}
          myAvatarUrl={myAvatarUrl}
          myName={myName}
          onCountChange={delta => setCommentDelta(prev => prev + delta)}
        />
      )}

      {/* Footer date */}
      <Text style={styles.footerDate}>
        {new Date(post.created_at)
          .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
          .toUpperCase()}
      </Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Avatar
  avatarWrap: {
    overflow: 'hidden', backgroundColor: C.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitials: {
    fontWeight: '700', color: C.inkMute,
  },

  // Lightbox
  lightboxBg: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.93)',
    alignItems: 'center', justifyContent: 'center',
  },
  lightboxClose: {
    position: 'absolute', top: 52, right: 18,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center', zIndex: 10,
  },
  lightboxCounter: {
    position: 'absolute', top: 60,
    alignSelf: 'center',
  },
  lightboxCounterText: {
    color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: '600',
  },
  lightboxImage: {
    width: '90%', height: '75%',
  },
  lightboxNav: {
    position: 'absolute', top: '50%', marginTop: -24,
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  lightboxDots: {
    position: 'absolute', bottom: 40,
    flexDirection: 'row', gap: 6,
  },
  dot: { height: 7, borderRadius: 4 },
  dotActive: { width: 22, backgroundColor: '#fff' },
  dotInactive: { width: 7, backgroundColor: 'rgba(255,255,255,0.35)' },

  // Carousel
  carouselCounter: {
    position: 'absolute', top: 10, right: 10,
    backgroundColor: 'rgba(20,17,12,0.60)',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 100,
  },
  carouselCounterText: {
    color: '#FFFBF1', fontSize: 11, fontWeight: '500',
  },
  carouselDots: {
    position: 'absolute', bottom: 14,
    width: '100%', flexDirection: 'row', justifyContent: 'center', gap: 5,
  },
  carouselDot: { height: 6, borderRadius: 4 },
  carouselDotActive: { width: 22, backgroundColor: '#FFFBF1' },
  carouselDotInactive: { width: 6, backgroundColor: 'rgba(255,251,241,0.50)' },
  carouselNav: {
    position: 'absolute', top: PHOTO_H / 2 - 18,
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
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
    textAlign: 'center', fontSize: 11, fontWeight: '700',
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
  likerSub: { fontSize: 12, color: C.inkMute, marginTop: 1 },

  // Badge post body
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
    fontSize: 9, letterSpacing: 1.4, fontWeight: '700', marginBottom: 3,
  },
  badgeName: {
    fontWeight: '800', fontSize: 18, color: C.ink, letterSpacing: -0.3, lineHeight: 22,
  },
  badgeDesc: {
    fontSize: 12.5, color: C.inkMute, marginTop: 4, lineHeight: 18,
  },

  // Chips
  chip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surfaceAlt, borderWidth: 0.5, borderColor: C.hairline,
    borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4,
  },
  chipText: { fontSize: 11.5, fontWeight: '600', color: C.inkSoft },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },

  // Visit meta
  visitMeta: { paddingHorizontal: 18, paddingBottom: 14, gap: 10 },
  visitHighlight: {
    fontSize: 13, color: C.inkSoft, fontStyle: 'italic', lineHeight: 19,
  },

  // Comments
  commentsPanel: {
    borderTopWidth: 0.5, borderTopColor: C.hairlineSoft,
  },
  commentRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 9,
    paddingHorizontal: 18, paddingTop: 10,
  },
  commentBubble: {
    flex: 1, flexDirection: 'row', flexWrap: 'wrap',
    backgroundColor: C.surfaceAlt, borderRadius: 12,
    borderTopLeftRadius: 4, padding: 8, paddingHorizontal: 11,
    borderWidth: 0.5, borderColor: C.hairline,
  },
  commentAuthor: { fontWeight: '700', fontSize: 12, color: C.ink, lineHeight: 18 },
  commentContent: { fontSize: 12.5, color: C.ink, lineHeight: 18 },
  commentTime: {
    paddingLeft: 9, marginTop: 3,
    fontSize: 9.5, color: C.inkMute, letterSpacing: 0.3,
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
    flex: 1, fontSize: 13, color: C.ink, paddingVertical: 8,
  },
  commentSend: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
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
    backgroundColor: C.surfaceAlt, borderBottomWidth: 0.5, borderBottomColor: C.hairlineSoft,
  },
  badgeBannerText: {
    fontSize: 10, letterSpacing: 1.2, fontWeight: '700', color: C.primary,
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 18, paddingTop: 14, paddingBottom: 10,
  },
  cardHeaderMeta: { flex: 1 },
  authorName: { fontWeight: '700', fontSize: 14, color: C.ink },
  authorSub: { fontSize: 12, color: C.inkMute, marginTop: 1 },
  menuBtn: { padding: 6, borderRadius: 6 },
  menu: {
    position: 'absolute', top: 52, right: 14, zIndex: 100,
    backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.hairline,
    borderRadius: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12, shadowRadius: 12, elevation: 8,
    minWidth: 150, overflow: 'hidden',
  },
  menuItem: { paddingHorizontal: 14, paddingVertical: 11 },
  menuItemText: { fontSize: 14, color: C.ink },
  menuDivider: { height: 0.5, backgroundColor: C.hairline },
  parkChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 18, paddingBottom: 10,
  },
  parkChipText: {
    fontSize: 10.5, fontWeight: '700', color: C.primary, letterSpacing: 0.4,
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
  padH: { paddingHorizontal: 18 },
  actionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 18, paddingVertical: 12,
    borderTopWidth: 0.5, borderTopColor: C.hairlineSoft,
  },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.surfaceAlt, borderWidth: 0.5, borderColor: C.hairline,
    borderRadius: 9, paddingHorizontal: 12, paddingVertical: 6,
  },
  actionBtnLiked: {
    backgroundColor: 'rgba(212,80,64,0.10)', borderColor: 'rgba(212,80,64,0.38)',
  },
  actionBtnActive: {
    backgroundColor: 'rgba(31,61,46,0.10)', borderColor: 'rgba(31,61,46,0.30)',
  },
  actionBtnText: {
    fontSize: 11, fontWeight: '700', color: C.inkSoft, letterSpacing: 0.5,
  },
  footerDate: {
    paddingHorizontal: 18, paddingBottom: 14, paddingTop: 4,
    fontSize: 11, color: C.inkMute, letterSpacing: 0.3,
  },
});
