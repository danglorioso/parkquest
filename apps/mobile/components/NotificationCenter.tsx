import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList, Modal, StyleSheet, Text, TouchableOpacity, View, ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/components/Avatar';
import {
  getNotifications, getUnreadNotificationCount, markNotificationsRead,
  respondFriendRequest, type NotificationItem, type NotificationType,
} from '@/lib/api';

// Mirrors web NotificationCenter.tsx — same types, copy, icon colors, and
// mark-read-on-open behavior, rendered as a native bottom sheet.

const C = {
  bg:           '#F2EBDB',
  surface:      '#FFFBF1',
  surfaceAlt:   '#F7F0DE',
  ink:          '#1B1A16',
  inkSoft:      '#3C3A33',
  inkMute:      '#7A746A',
  hairline:     'rgba(27,26,22,0.10)',
  hairlineSoft: 'rgba(27,26,22,0.06)',
  primary:      '#1F3D2E',
  unreadTint:   'rgba(31,61,46,0.045)',
};

const TYPE_CONFIG: Record<NotificationType, { icon: keyof typeof Ionicons.glyphMap; bg: string; color: string }> = {
  friend_request:  { icon: 'person-add', bg: '#EDE9FE', color: '#7C3AED' },
  friend_accepted: { icon: 'checkmark',  bg: '#D1FAE5', color: '#059669' },
  like:            { icon: 'heart',      bg: '#FEE2E2', color: '#DC2626' },
  comment:         { icon: 'chatbubble', bg: '#D1FAE5', color: '#059669' },
  post:            { icon: 'location',   bg: '#DCFCE7', color: '#16A34A' },
  visit_logged:    { icon: 'location',   bg: '#DCFCE7', color: '#16A34A' },
  badge_earned:    { icon: 'trophy',     bg: '#FEF3C7', color: '#D97706' },
  system:          { icon: 'sparkles',   bg: '#FEF3C7', color: '#D97706' },
  recommendation:  { icon: 'sparkles',   bg: '#FEF3C7', color: '#D97706' },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function notificationText(n: NotificationItem): string {
  const name = n.actor_display_name || n.actor_username || 'Someone';
  switch (n.type) {
    case 'friend_request':  return `${name} sent you a friend request`;
    case 'friend_accepted': return `${name} accepted your friend request`;
    case 'like':            return `${name} liked your post`;
    case 'comment':         return `${name} commented on your post`;
    case 'post':            return n.park_name ? `${name} posted at ${n.park_name}` : `${name} shared a new post`;
    case 'visit_logged':    return n.park_name ? `${name} visited ${n.park_name}` : `${name} logged a visit`;
    case 'badge_earned':    return n.metadata?.badge_emoji
      ? `${n.metadata.badge_emoji} You earned the ${n.metadata.badge_name ?? 'badge'} badge!`
      : `You earned a new badge: ${n.metadata?.badge_name ?? 'Unknown'}`;
    default:                return n.metadata?.message ?? 'New notification';
  }
}

function NotificationRow({
  n, responded, onRespond,
}: {
  n: NotificationItem;
  responded: boolean;
  onRespond: (friendshipId: number, action: 'accept' | 'reject') => Promise<void>;
}) {
  const cfg = TYPE_CONFIG[n.type] ?? TYPE_CONFIG.system;
  const name = n.actor_display_name || n.actor_username || 'Someone';
  const [busy, setBusy] = useState(false);

  const handleRespond = async (action: 'accept' | 'reject') => {
    const fid = n.metadata?.friendship_id;
    if (!fid || busy) return;
    setBusy(true);
    try { await onRespond(fid, action); } finally { setBusy(false); }
  };

  return (
    <View style={[styles.row, !n.read && { backgroundColor: C.unreadTint }]}>
      <View style={{ position: 'relative', flexShrink: 0 }}>
        {n.actor_id ? (
          <Avatar url={n.actor_avatar_url} name={name} size={36} />
        ) : (
          <View style={[styles.typeCircle, { backgroundColor: cfg.bg }]}>
            <Ionicons name={cfg.icon} size={16} color={cfg.color} />
          </View>
        )}
        {n.actor_id ? (
          <View style={[styles.typeDot, { backgroundColor: cfg.bg }]}>
            <Ionicons name={cfg.icon} size={8} color={cfg.color} />
          </View>
        ) : null}
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.rowText, !n.read && { fontWeight: '600' }]}>
          {notificationText(n)}
        </Text>
        {n.type === 'comment' && n.metadata?.excerpt ? (
          <Text style={styles.rowExcerpt} numberOfLines={1}>
            &ldquo;{n.metadata.excerpt}&rdquo;
          </Text>
        ) : null}

        {n.type === 'friend_request' && n.metadata?.friendship_id ? (
          responded ? (
            <View style={styles.respondedRow}>
              <Ionicons name="checkmark" size={11} color={C.inkMute} />
              <Text style={styles.respondedText}>Responded</Text>
            </View>
          ) : (
            <View style={styles.actionRow}>
              <TouchableOpacity
                onPress={() => handleRespond('accept')}
                disabled={busy}
                style={[styles.acceptBtn, busy && { opacity: 0.7 }]}
                activeOpacity={0.8}
              >
                <Text style={styles.acceptText}>Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleRespond('reject')}
                disabled={busy}
                style={[styles.declineBtn, busy && { opacity: 0.7 }]}
                activeOpacity={0.8}
              >
                <Text style={styles.declineText}>Decline</Text>
              </TouchableOpacity>
            </View>
          )
        ) : null}

        <Text style={styles.rowTime}>{timeAgo(n.created_at)}</Text>
      </View>
    </View>
  );
}

export function NotificationBell({ style }: { style?: ViewStyle }) {
  const { getToken } = useAuth();
  const insets = useSafeAreaInsets();

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [respondedTo, setRespondedTo] = useState<Set<number>>(new Set());

  // getToken from @clerk/clerk-expo is a new function every render — keeping it
  // in dep arrays re-triggers effects on each render and loops fetches forever.
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  // Poll unread count every 30s, same cadence as web
  useEffect(() => {
    let active = true;
    const fetchCount = async () => {
      try {
        const tok = await getTokenRef.current();
        if (!tok) return;
        const d = await getUnreadNotificationCount(tok);
        if (active) setUnreadCount(d.unread_count ?? 0);
      } catch { /* silent */ }
    };
    fetchCount();
    const id = setInterval(fetchCount, 30_000);
    return () => { active = false; clearInterval(id); };
  }, []);

  // Fetch list + mark read when sheet opens
  useEffect(() => {
    if (!open) return;
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const tok = await getTokenRef.current();
        if (!tok) return;
        const data = await getNotifications(tok);
        if (!active) return;
        setItems(data);
        if (data.some(n => !n.read)) {
          markNotificationsRead(tok)
            .then(() => { if (active) setUnreadCount(0); })
            .catch(() => {});
        } else {
          setUnreadCount(0);
        }
      } catch { /* silent */ } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [open]);

  const handleRespond = useCallback(async (friendshipId: number, action: 'accept' | 'reject') => {
    const tok = await getTokenRef.current();
    if (!tok) return;
    try {
      await respondFriendRequest(tok, friendshipId, action);
      setRespondedTo(prev => new Set([...prev, friendshipId]));
    } catch { /* silent */ }
  }, []);

  const newCount = items.filter(n => !n.read).length;
  const displayCount = open ? newCount : unreadCount;

  return (
    <>
      <TouchableOpacity style={style} activeOpacity={0.7} onPress={() => setOpen(true)}>
        <Ionicons name="notifications-outline" size={18} color={C.inkSoft} />
        {displayCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{displayCount > 99 ? '99+' : displayCount}</Text>
          </View>
        )}
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
        statusBarTranslucent
      >
        <View style={styles.overlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 8 }]}>
            {/* Header */}
            <View style={styles.sheetHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <Text style={styles.sheetTitle}>Activity</Text>
                {newCount > 0 && (
                  <View style={styles.newChip}>
                    <Text style={styles.newChipText}>{newCount} new</Text>
                  </View>
                )}
              </View>
              <TouchableOpacity onPress={() => setOpen(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={16} color={C.inkMute} />
              </TouchableOpacity>
            </View>

            {/* List */}
            {loading ? (
              <View style={styles.centerBox}>
                <Text style={styles.centerMuted}>Loading…</Text>
              </View>
            ) : items.length === 0 ? (
              <View style={styles.centerBox}>
                <Ionicons name="notifications-outline" size={26} color={C.inkMute} style={{ marginBottom: 10 }} />
                <Text style={styles.emptyTitle}>No notifications yet</Text>
                <Text style={styles.centerMuted}>Add friends and interact with posts to get started.</Text>
              </View>
            ) : (
              <FlatList
                data={items}
                keyExtractor={n => String(n.id)}
                style={{ maxHeight: 480 }}
                ItemSeparatorComponent={() => <View style={styles.separator} />}
                renderItem={({ item }) => (
                  <NotificationRow
                    n={item}
                    responded={item.type === 'friend_request' && item.metadata?.friendship_id != null
                      ? respondedTo.has(item.metadata.friendship_id)
                      : false}
                    onRespond={handleRespond}
                  />
                )}
              />
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // Bell badge
  badge: {
    position: 'absolute', top: 2, right: 2,
    minWidth: 14, height: 14, borderRadius: 7,
    backgroundColor: '#DC2626',
    borderWidth: 1.5, borderColor: C.bg,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    fontSize: 8, fontWeight: '700', color: '#fff', lineHeight: 9,
  },

  // Sheet
  overlay: {
    flex: 1, justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 18, borderTopRightRadius: 18,
    borderWidth: 0.5, borderColor: C.hairline,
    overflow: 'hidden',
  },
  sheetHeader: {
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10,
    borderBottomWidth: 0.5, borderBottomColor: C.hairlineSoft,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  sheetTitle: { fontWeight: '700', fontSize: 16, color: C.ink },
  newChip: {
    backgroundColor: C.surfaceAlt, borderRadius: 4,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  newChipText: {
    fontSize: 9, fontWeight: '700', color: C.inkMute, letterSpacing: 0.4,
  },
  closeBtn: { padding: 4 },

  // Rows
  row: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  typeCircle: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  typeDot: {
    position: 'absolute', bottom: -1, right: -1,
    width: 16, height: 16, borderRadius: 8,
    borderWidth: 1.5, borderColor: C.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  rowText: { fontSize: 13, color: C.ink, lineHeight: 18 },
  rowExcerpt: {
    fontSize: 12, color: C.inkSoft, marginTop: 2, fontStyle: 'italic',
  },
  rowTime: { fontSize: 11, color: C.inkMute, marginTop: 3 },
  separator: {
    height: 0.5, backgroundColor: C.hairlineSoft, marginHorizontal: 16,
  },

  // Friend request actions
  actionRow: { flexDirection: 'row', gap: 6, marginTop: 7 },
  acceptBtn: {
    backgroundColor: C.primary, borderRadius: 7,
    paddingHorizontal: 14, paddingVertical: 5,
  },
  acceptText: { color: '#FFFBF1', fontSize: 12, fontWeight: '700' },
  declineBtn: {
    backgroundColor: C.surfaceAlt, borderRadius: 7,
    borderWidth: 0.5, borderColor: C.hairline,
    paddingHorizontal: 14, paddingVertical: 5,
  },
  declineText: { color: C.ink, fontSize: 12, fontWeight: '600' },
  respondedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5,
  },
  respondedText: { fontSize: 11, color: C.inkMute },

  // Empty / loading
  centerBox: {
    paddingVertical: 32, paddingHorizontal: 24, alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 14, color: C.ink, fontWeight: '600', marginBottom: 4,
  },
  centerMuted: {
    fontSize: 12.5, color: C.inkMute, textAlign: 'center',
  },
});
