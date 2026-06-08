import { View, Text, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useAuth } from '@clerk/clerk-expo';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getNotifications, markNotificationsRead } from '@/lib/api';
import type { NotificationItem } from '@/lib/api';
import { useEffect } from 'react';

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

const TYPE_ICON: Record<string, { name: string; color: string; bg: string }> = {
  friend_request: { name: 'person-add', color: '#16a34a', bg: '#dcfce7' },
  friend_accepted: { name: 'people', color: '#16a34a', bg: '#dcfce7' },
  like: { name: 'heart', color: '#ef4444', bg: '#fee2e2' },
  comment: { name: 'chatbubble', color: '#3b82f6', bg: '#dbeafe' },
  visit_logged: { name: 'flag', color: '#16a34a', bg: '#dcfce7' },
  badge_earned: { name: 'ribbon', color: '#d97706', bg: '#fef3c7' },
  post: { name: 'image', color: '#8b5cf6', bg: '#ede9fe' },
};

function notifMessage(n: NotificationItem): string {
  const actor = n.actor_display_name ?? n.actor_username ?? 'Someone';
  switch (n.type) {
    case 'friend_request': return `${actor} sent you a friend request`;
    case 'friend_accepted': return `${actor} accepted your friend request`;
    case 'like': return `${actor} liked your post`;
    case 'comment': return `${actor} commented on your post`;
    case 'visit_logged': return n.park_name ? `${actor} visited ${n.park_name}` : `${actor} logged a visit`;
    case 'badge_earned': return n.badge_name ? `${actor} earned the ${n.badge_emoji ?? ''} ${n.badge_name} badge` : `${actor} earned a badge`;
    case 'post': return n.park_name ? `${actor} posted at ${n.park_name}` : `${actor} shared a post`;
    default: return `${actor} did something`;
  }
}

function NotifItem({ item, onPress }: { item: NotificationItem; onPress: () => void }) {
  const iconInfo = TYPE_ICON[item.type] ?? { name: 'notifications', color: '#6b7280', bg: '#f3f4f6' };

  return (
    <TouchableOpacity
      onPress={onPress}
      className={`flex-row items-start px-4 py-3.5 border-b border-gray-50 ${!item.is_read ? 'bg-brand-50/50' : 'bg-white'}`}
    >
      <View className="relative mr-3 flex-shrink-0">
        <View style={{ width: 40, height: 40, borderRadius: 20, overflow: 'hidden', backgroundColor: '#f3f4f6' }}>
          {item.actor_avatar_url
            ? <Image source={{ uri: item.actor_avatar_url }} style={{ width: 40, height: 40 }} contentFit="cover" />
            : <View style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#6b7280' }}>
                  {(item.actor_display_name ?? item.actor_username ?? '?')[0]?.toUpperCase()}
                </Text>
              </View>}
        </View>
        <View
          style={{
            position: 'absolute',
            bottom: -2,
            right: -2,
            width: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: iconInfo.bg,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1.5,
            borderColor: '#fff',
          }}
        >
          <Ionicons name={iconInfo.name as any} size={10} color={iconInfo.color} />
        </View>
      </View>
      <View className="flex-1">
        <Text className="text-sm text-gray-800 leading-5">{notifMessage(item)}</Text>
        <Text className="text-xs text-gray-400 mt-1">{timeAgo(item.created_at)}</Text>
      </View>
      {!item.is_read && (
        <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#16a34a', marginTop: 6, flexShrink: 0 }} />
      )}
    </TouchableOpacity>
  );
}

export default function NotificationsScreen() {
  const { getToken } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: notifications, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => { const t = await getToken(); return getNotifications(t!); },
  });

  const markReadMutation = useMutation({
    mutationFn: async () => { const t = await getToken(); return markNotificationsRead(t!); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  useEffect(() => {
    if (notifications?.some(n => !n.is_read)) {
      markReadMutation.mutate();
    }
  }, [notifications]);

  const handlePress = (n: NotificationItem) => {
    if (n.type === 'friend_request' || n.type === 'friend_accepted') {
      router.push('/friends' as any);
    } else if (n.park_code) {
      router.push(`/park/${n.park_code}` as any);
    } else if (n.actor_username) {
      router.push(`/user/${n.actor_username}` as any);
    }
  };

  if (isLoading) {
    return (
      <View className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" color="#16a34a" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <FlatList
        data={notifications ?? []}
        keyExtractor={item => String(item.id)}
        renderItem={({ item }) => <NotifItem item={item} onPress={() => handlePress(item)} />}
        contentContainerStyle={!notifications?.length ? { flex: 1 } : undefined}
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center py-20">
            <Text className="text-4xl mb-3">🔔</Text>
            <Text className="text-gray-500 text-center">No notifications yet</Text>
          </View>
        }
      />
    </View>
  );
}
