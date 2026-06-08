import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { getUserByUsername, sendFriendRequest, respondFriendRequest, removeFriend } from '@/lib/api';
import type { UserPublicProfile } from '@/lib/api';
import { PostCard } from '@/components/PostCard';
import type { EnrichedPost } from '@parkquest/types';

const TIER_COLOR: Record<string, string> = {
  bronze: '#B27339',
  silver: '#A8A39B',
  gold: '#D4A93F',
  platinum: '#6E97A3',
  legendary: '#8B5DBF',
};

function FriendButton({ profile, onAction }: { profile: UserPublicProfile; onAction: () => void }) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const requestMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (profile.friendship_status === 'none') {
        return sendFriendRequest(token!, profile.clerk_user_id);
      } else if (profile.friendship_status === 'pending_received' && profile.friendship_id) {
        return respondFriendRequest(token!, profile.friendship_id, 'accept');
      } else if (profile.friendship_status === 'accepted') {
        return removeFriend(token!, profile.clerk_user_id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-profile', profile.username] });
      onAction();
    },
    onError: (e: Error) => Alert.alert('Error', e.message),
  });

  if (profile.is_own_profile) return null;

  const { friendship_status } = profile;
  let label = 'Add Friend';
  let icon: string = 'person-add-outline';
  let variant = 'primary';

  if (friendship_status === 'accepted') {
    label = 'Friends';
    icon = 'people';
    variant = 'secondary';
  } else if (friendship_status === 'pending_sent') {
    label = 'Requested';
    icon = 'time-outline';
    variant = 'secondary';
  } else if (friendship_status === 'pending_received') {
    label = 'Accept Request';
    icon = 'checkmark-circle-outline';
    variant = 'primary';
  }

  return (
    <TouchableOpacity
      onPress={() => {
        if (friendship_status === 'accepted') {
          Alert.alert('Remove Friend', `Remove ${profile.display_name ?? profile.username} as a friend?`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Remove', style: 'destructive', onPress: () => requestMutation.mutate() },
          ]);
        } else {
          requestMutation.mutate();
        }
      }}
      disabled={requestMutation.isPending || friendship_status === 'pending_sent'}
      className={`flex-1 rounded-xl py-3 items-center flex-row justify-center gap-2 ${variant === 'primary' ? 'bg-brand-600' : 'bg-gray-100'}`}
    >
      {requestMutation.isPending
        ? <ActivityIndicator size="small" color={variant === 'primary' ? '#fff' : '#374151'} />
        : <Ionicons name={icon as any} size={18} color={variant === 'primary' ? '#fff' : '#374151'} />}
      <Text className={`font-semibold ${variant === 'primary' ? 'text-white' : 'text-gray-700'}`}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function UserProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: ['user-profile', username],
    queryFn: async () => { const t = await getToken(); return getUserByUsername(t, username); },
  });

  if (isLoading) {
    return (
      <View className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" color="#16a34a" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View className="flex-1 bg-white items-center justify-center">
        <Text className="text-gray-500">User not found</Text>
      </View>
    );
  }

  const displayName = profile.display_name ?? profile.username;

  return (
    <View className="flex-1 bg-gray-50">
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Profile header */}
        <View className="bg-white px-4 pt-6 pb-5">
          <View className="items-center mb-4">
            <View className="w-20 h-20 rounded-full bg-brand-100 items-center justify-center mb-3 overflow-hidden">
              {profile.avatar_url
                ? <Image source={{ uri: profile.avatar_url }} style={{ width: 80, height: 80 }} contentFit="cover" />
                : <Text className="text-brand-700 font-bold text-2xl">{displayName[0]?.toUpperCase()}</Text>}
            </View>
            <Text className="text-xl font-bold text-gray-900">{displayName}</Text>
            <Text className="text-gray-400 text-sm mt-0.5">@{profile.username}</Text>
            {profile.bio && (
              <Text className="text-gray-500 text-sm text-center mt-2 leading-5">{profile.bio}</Text>
            )}
          </View>

          {/* Friend button */}
          <FriendButton
            profile={profile}
            onAction={() => queryClient.invalidateQueries({ queryKey: ['user-profile', username] })}
          />
        </View>

        {/* Stats */}
        <View className="flex-row bg-white border-y border-gray-100 mt-3 mb-3">
          {[
            { label: 'Parks', value: profile.parks_visited },
            { label: 'Badges', value: profile.badges?.length ?? 0 },
            { label: 'Friends', value: profile.friend_count },
          ].map(({ label, value }, i, arr) => (
            <View key={label} className={`flex-1 items-center py-4 ${i < arr.length - 1 ? 'border-r border-gray-100' : ''}`}>
              <Text className="text-2xl font-bold text-gray-900">{value}</Text>
              <Text className="text-xs text-gray-400 mt-0.5">{label}</Text>
            </View>
          ))}
        </View>

        {/* Badges */}
        {profile.badges && profile.badges.length > 0 && (
          <View className="bg-white px-4 py-4 mb-3">
            <Text className="text-base font-semibold text-gray-900 mb-3">Badges</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-3">
                {profile.badges.slice(0, 12).map(badge => (
                  <View key={badge.badge_id} className="items-center w-14">
                    <View
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 24,
                        backgroundColor: `${TIER_COLOR[badge.tier] ?? '#6b7280'}22`,
                        borderWidth: 1.5,
                        borderColor: `${TIER_COLOR[badge.tier] ?? '#6b7280'}55`,
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: 4,
                      }}
                    >
                      <Text style={{ fontSize: 22 }}>{badge.emoji}</Text>
                    </View>
                    <Text className="text-xs text-gray-500 text-center leading-tight" numberOfLines={2}>{badge.name}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        {/* Recent visits */}
        {profile.recent_visits && profile.recent_visits.length > 0 && (
          <View className="bg-white px-4 py-4 mb-3">
            <Text className="text-base font-semibold text-gray-900 mb-3">Recent Parks</Text>
            <View className="gap-2">
              {profile.recent_visits.slice(0, 5).map(v => (
                <View key={v.park_code} className="flex-row items-center gap-3">
                  <View className="w-9 h-9 rounded-full bg-brand-50 items-center justify-center">
                    <Text style={{ fontSize: 16 }}>🌲</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-medium text-gray-900">{v.name}</Text>
                    <Text className="text-xs text-gray-400">{v.states}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Recent posts */}
        {profile.recent_posts && profile.recent_posts.length > 0 && (
          <View className="mb-3">
            <View className="px-4 py-3 bg-white border-b border-gray-100">
              <Text className="text-base font-semibold text-gray-900">Posts</Text>
            </View>
            {profile.recent_posts.map((post: EnrichedPost) => (
              <PostCard key={post.id} post={post} onLike={() => {}} onComment={() => {}} />
            ))}
          </View>
        )}

        <View className="h-8" />
      </ScrollView>
    </View>
  );
}
