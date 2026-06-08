import { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, TextInput, Alert } from 'react-native';
import { Image } from 'expo-image';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getFriends, getPendingRequests, searchUsers, sendFriendRequest, respondFriendRequest, getSuggestions } from '@/lib/api';
import type { Friend, FriendRequest, PublicProfile } from '@parkquest/types';

function Avatar({ uri, name, size = 40 }: { uri: string | null | undefined; name: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: '#dcfce7', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {uri
        ? <Image source={{ uri }} style={{ width: size, height: size }} contentFit="cover" />
        : <Text style={{ fontSize: size * 0.35, fontWeight: '700', color: '#15803d' }}>{name[0]?.toUpperCase()}</Text>}
    </View>
  );
}

type Tab = 'friends' | 'requests' | 'search';

export default function FriendsScreen() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('friends');
  const [query, setQuery] = useState('');

  const userId = user?.id ?? '';

  const { data: friends, isLoading: friendsLoading } = useQuery({
    queryKey: ['friends', userId],
    queryFn: async () => { const t = await getToken(); return getFriends(t!, userId); },
    enabled: !!userId && tab === 'friends',
  });

  const { data: requests, isLoading: requestsLoading } = useQuery({
    queryKey: ['friend-requests', userId],
    queryFn: async () => { const t = await getToken(); return getPendingRequests(t!, userId); },
    enabled: !!userId && tab === 'requests',
  });

  const { data: suggestions } = useQuery({
    queryKey: ['suggestions'],
    queryFn: async () => { const t = await getToken(); return getSuggestions(t!); },
    enabled: tab === 'search' && query.length === 0,
  });

  const { data: searchResults, isFetching: searching } = useQuery({
    queryKey: ['user-search', query],
    queryFn: async () => { const t = await getToken(); return searchUsers(t, query); },
    enabled: query.length >= 2,
  });

  const acceptMutation = useMutation({
    mutationFn: async ({ friendshipId, action }: { friendshipId: number; action: 'accept' | 'reject' }) => {
      const token = await getToken();
      return respondFriendRequest(token!, friendshipId, action);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friend-requests', userId] });
      queryClient.invalidateQueries({ queryKey: ['friends', userId] });
    },
    onError: (e: Error) => Alert.alert('Error', e.message),
  });

  const addMutation = useMutation({
    mutationFn: async (targetId: string) => {
      const token = await getToken();
      return sendFriendRequest(token!, targetId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-search', query] });
      queryClient.invalidateQueries({ queryKey: ['suggestions'] });
    },
    onError: (e: Error) => Alert.alert('Error', e.message),
  });

  const pendingCount = (requests ?? []).length;

  return (
    <View className="flex-1 bg-gray-50">
      {/* Tabs */}
      <View className="flex-row bg-white border-b border-gray-100">
        {([
          { key: 'friends', label: 'Friends' },
          { key: 'requests', label: pendingCount > 0 ? `Requests (${pendingCount})` : 'Requests' },
          { key: 'search', label: 'Find' },
        ] as { key: Tab; label: string }[]).map(t => (
          <TouchableOpacity
            key={t.key}
            onPress={() => setTab(t.key)}
            className={`flex-1 py-3 items-center border-b-2 ${tab === t.key ? 'border-brand-600' : 'border-transparent'}`}
          >
            <Text className={`text-sm font-semibold ${tab === t.key ? 'text-brand-600' : 'text-gray-500'}`}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Friends list */}
      {tab === 'friends' && (
        friendsLoading ? (
          <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color="#16a34a" /></View>
        ) : (
          <FlatList
            data={friends ?? []}
            keyExtractor={item => item.clerk_user_id}
            renderItem={({ item }: { item: Friend }) => (
              <TouchableOpacity
                onPress={() => item.username && router.push(`/user/${item.username}` as any)}
                className="flex-row items-center px-4 py-3 bg-white border-b border-gray-50 active:opacity-70"
              >
                <Avatar uri={item.avatar_url} name={item.display_name ?? item.username ?? '?'} />
                <View className="flex-1 ml-3">
                  <Text className="font-semibold text-gray-900 text-sm">{item.display_name ?? item.username}</Text>
                  {item.username && <Text className="text-xs text-gray-400">@{item.username}</Text>}
                </View>
                <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
              </TouchableOpacity>
            )}
            contentContainerStyle={!friends?.length ? { flex: 1 } : undefined}
            ListEmptyComponent={
              <View className="flex-1 items-center justify-center py-20">
                <Text className="text-4xl mb-3">👥</Text>
                <Text className="text-gray-500 text-center">No friends yet</Text>
                <TouchableOpacity onPress={() => setTab('search')} className="mt-3">
                  <Text className="text-brand-600 font-semibold">Find friends →</Text>
                </TouchableOpacity>
              </View>
            }
          />
        )
      )}

      {/* Pending requests */}
      {tab === 'requests' && (
        requestsLoading ? (
          <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color="#16a34a" /></View>
        ) : (
          <FlatList
            data={requests ?? []}
            keyExtractor={item => String(item.friendship_id)}
            renderItem={({ item }: { item: FriendRequest }) => (
              <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-50">
                <Avatar uri={item.avatar_url} name={item.display_name ?? item.username ?? '?'} />
                <View className="flex-1 ml-3">
                  <Text className="font-semibold text-gray-900 text-sm">{item.display_name ?? item.username}</Text>
                  {item.username && <Text className="text-xs text-gray-400">@{item.username}</Text>}
                </View>
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={() => acceptMutation.mutate({ friendshipId: item.friendship_id, action: 'accept' })}
                    className="bg-brand-600 rounded-lg px-3 py-1.5"
                  >
                    <Text className="text-white text-xs font-semibold">Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => acceptMutation.mutate({ friendshipId: item.friendship_id, action: 'reject' })}
                    className="bg-gray-100 rounded-lg px-3 py-1.5"
                  >
                    <Text className="text-gray-600 text-xs font-semibold">Decline</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            contentContainerStyle={!requests?.length ? { flex: 1 } : undefined}
            ListEmptyComponent={
              <View className="flex-1 items-center justify-center py-20">
                <Text className="text-4xl mb-3">🎉</Text>
                <Text className="text-gray-500 text-center">No pending requests</Text>
              </View>
            }
          />
        )
      )}

      {/* Search / discover */}
      {tab === 'search' && (
        <View className="flex-1">
          <View className="bg-white border-b border-gray-100 px-3 py-2">
            <View className="flex-row items-center bg-gray-100 rounded-xl px-3 gap-2">
              <Ionicons name="search" size={16} color="#9ca3af" />
              <TextInput
                placeholder="Search by username..."
                placeholderTextColor="#9ca3af"
                value={query}
                onChangeText={setQuery}
                className="flex-1 text-sm text-gray-900 py-2.5"
                autoCapitalize="none"
                returnKeyType="search"
              />
              {searching && <ActivityIndicator size="small" color="#9ca3af" />}
            </View>
          </View>

          {query.length >= 2 ? (
            <FlatList
              data={searchResults ?? []}
              keyExtractor={item => item.clerk_user_id}
              renderItem={({ item }: { item: PublicProfile }) => (
                <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-50">
                  <Avatar uri={item.avatar_url} name={item.display_name ?? item.username ?? '?'} />
                  <View className="flex-1 ml-3">
                    <Text className="font-semibold text-gray-900 text-sm">{item.display_name ?? item.username}</Text>
                    {item.username && <Text className="text-xs text-gray-400">@{item.username}</Text>}
                  </View>
                  {item.friendship_status === 'none' && (
                    <TouchableOpacity
                      onPress={() => addMutation.mutate(item.clerk_user_id)}
                      disabled={addMutation.isPending}
                      className="bg-brand-600 rounded-lg px-3 py-1.5"
                    >
                      <Text className="text-white text-xs font-semibold">Add</Text>
                    </TouchableOpacity>
                  )}
                  {item.friendship_status === 'accepted' && (
                    <View className="bg-gray-100 rounded-lg px-3 py-1.5">
                      <Text className="text-gray-500 text-xs font-semibold">Friends</Text>
                    </View>
                  )}
                  {item.friendship_status === 'pending_sent' && (
                    <View className="bg-gray-100 rounded-lg px-3 py-1.5">
                      <Text className="text-gray-500 text-xs font-semibold">Sent</Text>
                    </View>
                  )}
                </View>
              )}
              ListEmptyComponent={
                <View className="items-center py-12">
                  <Text className="text-gray-400 text-sm">No users found</Text>
                </View>
              }
            />
          ) : (
            <FlatList
              data={suggestions ?? []}
              keyExtractor={item => item.clerk_user_id}
              ListHeaderComponent={
                <View className="px-4 pt-4 pb-2">
                  <Text className="text-xs font-semibold text-gray-400 tracking-widest">SUGGESTED</Text>
                </View>
              }
              renderItem={({ item }) => (
                <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-50">
                  <Avatar uri={item.avatar_url} name={item.display_name ?? item.username ?? '?'} />
                  <View className="flex-1 ml-3">
                    <Text className="font-semibold text-gray-900 text-sm">{item.display_name ?? item.username}</Text>
                    <Text className="text-xs text-gray-400">
                      {item.mutual_friends > 0 ? `${item.mutual_friends} mutual friends` : `${item.shared_parks} shared parks`}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => addMutation.mutate(item.clerk_user_id)}
                    disabled={addMutation.isPending}
                    className="bg-brand-600 rounded-lg px-3 py-1.5"
                  >
                    <Text className="text-white text-xs font-semibold">Add</Text>
                  </TouchableOpacity>
                </View>
              )}
            />
          )}
        </View>
      )}
    </View>
  );
}
