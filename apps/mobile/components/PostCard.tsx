import { View, Text, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { EnrichedPost } from '@parkquest/types';

interface Props {
  post: EnrichedPost;
  onLike: () => void;
  onComment: () => void;
}

function timeAgo(dateStr: Date | string | null): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

export function PostCard({ post, onLike, onComment }: Props) {
  const router = useRouter();
  const firstPhoto = post.photos?.[0];
  const authorName = post.display_name ?? post.username ?? 'Explorer';
  const initial = authorName[0]?.toUpperCase() ?? '?';

  return (
    <View className="bg-white mb-px border-b border-gray-100">
      {/* Header */}
      <View className="flex-row items-center px-4 py-3">
        <TouchableOpacity
          onPress={() => post.username && router.push(`/user/${post.username}` as any)}
          className="w-9 h-9 rounded-full bg-brand-100 items-center justify-center mr-3 overflow-hidden"
        >
          {post.avatar_url
            ? <Image source={{ uri: post.avatar_url }} style={{ width: 36, height: 36 }} contentFit="cover" />
            : <Text className="text-brand-700 font-bold text-sm">{initial}</Text>}
        </TouchableOpacity>
        <View className="flex-1">
          <View className="flex-row items-center gap-1.5">
            <Text className="font-semibold text-gray-900 text-sm">{authorName}</Text>
            {post.created_at && (
              <Text className="text-xs text-gray-400">· {timeAgo(post.created_at)}</Text>
            )}
          </View>
          {post.park_name && (
            <Text className="text-xs text-gray-400 mt-0.5" numberOfLines={1}>📍 {post.park_name}</Text>
          )}
        </View>
      </View>

      {/* Photo */}
      {firstPhoto && (
        <Image
          source={{ uri: firstPhoto.url }}
          style={{ width: '100%', aspectRatio: 1 }}
          contentFit="cover"
        />
      )}

      {/* Actions */}
      <View className="flex-row px-4 py-2.5 gap-5 items-center">
        <TouchableOpacity className="flex-row items-center gap-1.5" onPress={onLike}>
          <Ionicons
            name={post.liked_by_me ? 'heart' : 'heart-outline'}
            size={24}
            color={post.liked_by_me ? '#ef4444' : '#374151'}
          />
          {post.like_count > 0 && (
            <Text className="text-sm text-gray-500">{post.like_count}</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity className="flex-row items-center gap-1.5" onPress={onComment}>
          <Ionicons name="chatbubble-outline" size={22} color="#374151" />
          {post.comment_count > 0 && (
            <Text className="text-sm text-gray-500">{post.comment_count}</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Caption */}
      {post.caption && (
        <View className="px-4 pb-4">
          <Text className="text-sm text-gray-800 leading-5">
            <Text className="font-semibold">{authorName} </Text>
            {post.caption}
          </Text>
        </View>
      )}
    </View>
  );
}
