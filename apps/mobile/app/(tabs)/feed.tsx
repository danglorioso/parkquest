import { useCallback, useState } from 'react';
import { FlatList, View, Text, ActivityIndicator, RefreshControl, TouchableOpacity, Modal, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useInfiniteQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-expo';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { PostCard } from '@/components/PostCard';
import { getFeed, likePost, unlikePost, createPost } from '@/lib/api';
import type { EnrichedPost } from '@parkquest/types';

function CreatePostModal({ visible, onClose, onPosted }: { visible: boolean; onClose: () => void; onPosted: () => void }) {
  const { getToken } = useAuth();
  const [caption, setCaption] = useState('');
  const [posting, setPosting] = useState(false);

  const handlePost = async () => {
    if (!caption.trim()) return;
    setPosting(true);
    try {
      const token = await getToken();
      await createPost(token!, { caption: caption.trim() });
      setCaption('');
      onPosted();
      onClose();
    } catch (e) {
      // silent fail for now
    } finally {
      setPosting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <SafeAreaView className="flex-1 bg-white">
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100">
            <TouchableOpacity onPress={onClose}>
              <Text className="text-gray-500 text-base">Cancel</Text>
            </TouchableOpacity>
            <Text className="font-semibold text-gray-900">New Post</Text>
            <TouchableOpacity onPress={handlePost} disabled={!caption.trim() || posting}>
              <Text className={`font-semibold text-base ${caption.trim() && !posting ? 'text-brand-600' : 'text-gray-300'}`}>
                Post
              </Text>
            </TouchableOpacity>
          </View>
          <TextInput
            className="flex-1 px-4 pt-4 text-base text-gray-900"
            placeholder="Share your park adventure..."
            placeholderTextColor="#9ca3af"
            multiline
            value={caption}
            onChangeText={setCaption}
            autoFocus
          />
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function FeedScreen() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [createVisible, setCreateVisible] = useState(false);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, refetch, isRefetching } =
    useInfiniteQuery({
      queryKey: ['feed'],
      queryFn: async ({ pageParam = 0 }) => {
        const token = await getToken();
        return getFeed(token!, pageParam as number);
      },
      getNextPageParam: (lastPage, pages) =>
        lastPage.length === 20 ? pages.length * 20 : undefined,
      initialPageParam: 0,
    });

  const posts = data?.pages.flat() ?? [];

  const likeMutation = useMutation({
    mutationFn: async ({ postId, liked }: { postId: number; liked: boolean }) => {
      const token = await getToken();
      return liked ? unlikePost(token!, postId) : likePost(token!, postId);
    },
    onMutate: async ({ postId, liked }) => {
      await queryClient.cancelQueries({ queryKey: ['feed'] });
      queryClient.setQueryData(['feed'], (old: typeof data) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map(page =>
            page.map(p =>
              p.id === postId
                ? { ...p, liked_by_me: !liked, like_count: liked ? p.like_count - 1 : p.like_count + 1 }
                : p
            )
          ),
        };
      });
    },
  });

  const renderPost = useCallback(({ item }: { item: EnrichedPost }) => (
    <PostCard
      post={item}
      onLike={() => likeMutation.mutate({ postId: item.id, liked: item.liked_by_me })}
      onComment={() => {}}
    />
  ), [likeMutation]);

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50 items-center justify-center">
        <ActivityIndicator size="large" color="#16a34a" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <View className="flex-row items-center justify-between px-4 py-3 bg-white border-b border-gray-100">
        <Text className="text-lg font-bold text-brand-700">Feed</Text>
        <TouchableOpacity onPress={() => setCreateVisible(true)} className="bg-brand-600 rounded-full w-8 h-8 items-center justify-center">
          <Ionicons name="add" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={posts}
        keyExtractor={item => String(item.id)}
        renderItem={renderPost}
        contentContainerStyle={posts.length === 0 ? { flex: 1 } : undefined}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#16a34a" />}
        onEndReached={() => hasNextPage && !isFetchingNextPage && fetchNextPage()}
        onEndReachedThreshold={0.3}
        ListFooterComponent={isFetchingNextPage ? <ActivityIndicator className="py-4" color="#16a34a" /> : null}
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center gap-3 pb-20">
            <Text className="text-5xl">🏕️</Text>
            <Text className="text-gray-500 text-center text-base px-8">
              No posts yet.{'\n'}Add friends to see their park adventures.
            </Text>
            <TouchableOpacity
              onPress={() => setCreateVisible(true)}
              className="bg-brand-600 rounded-xl px-6 py-3 mt-2"
            >
              <Text className="text-white font-semibold">Share your first post</Text>
            </TouchableOpacity>
          </View>
        }
      />

      <CreatePostModal
        visible={createVisible}
        onClose={() => setCreateVisible(false)}
        onPosted={() => queryClient.invalidateQueries({ queryKey: ['feed'] })}
      />
    </SafeAreaView>
  );
}
