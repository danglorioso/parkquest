import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getOwnProfile, getVisits, getBadges } from '@/lib/api';
import type { Badge } from '@parkquest/types';

const MENU_ITEMS = [
  { icon: 'ribbon-outline', label: 'Badges', route: '/badges' },
  { icon: 'book-outline', label: 'Journal', route: '/journal' },
  { icon: 'id-card-outline', label: 'Passport', route: '/passport' },
  { icon: 'people-outline', label: 'Friends', route: '/friends' },
  { icon: 'map-outline', label: 'Trip Planner', route: '/planner' },
] as const;

export default function ProfileScreen() {
  const { getToken, signOut } = useAuth();
  const { user } = useUser();
  const router = useRouter();

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', 'me'],
    queryFn: async () => { const t = await getToken(); return getOwnProfile(t!); },
  });

  const { data: visits } = useQuery({
    queryKey: ['visits'],
    queryFn: async () => { const t = await getToken(); return getVisits(t!); },
  });

  const { data: badgesData } = useQuery({
    queryKey: ['badges'],
    queryFn: async () => { const t = await getToken(); return getBadges(t!); },
  });

  const visitList = Array.isArray(visits) ? visits : [];
  const parksVisited = visitList.filter(v => !v.is_bucket_list).length;
  const bucketCount = visitList.filter(v => v.is_bucket_list).length;
  const earnedBadges = (badgesData?.badges ?? []).filter((b: Badge) => b.earned);
  const avatarUri = profile?.avatar_url ?? user?.imageUrl;
  const displayName = profile?.display_name ?? user?.fullName ?? profile?.username ?? 'Explorer';

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" color="#16a34a" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <View className="flex-row items-center justify-between px-4 py-3 bg-white border-b border-gray-100">
        <Text className="text-lg font-bold text-gray-900">Profile</Text>
        <TouchableOpacity onPress={() => signOut().then(() => router.replace('/(auth)/sign-in'))}>
          <Ionicons name="log-out-outline" size={22} color="#9ca3af" />
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Avatar + name */}
        <View className="bg-white items-center pt-8 pb-6 px-6 mb-3">
          <View className="w-24 h-24 rounded-full bg-brand-100 items-center justify-center mb-4 overflow-hidden">
            {avatarUri
              ? <Image source={{ uri: avatarUri }} style={{ width: 96, height: 96 }} contentFit="cover" />
              : <Text className="text-brand-700 font-bold text-3xl">{displayName[0]?.toUpperCase()}</Text>}
          </View>
          <Text className="text-xl font-bold text-gray-900">{displayName}</Text>
          {profile?.username && (
            <Text className="text-gray-400 text-sm mt-0.5">@{profile.username}</Text>
          )}
          {profile?.bio && (
            <Text className="text-gray-500 text-sm text-center mt-2 leading-5">{profile.bio}</Text>
          )}
        </View>

        {/* Stats */}
        <View className="flex-row bg-white border-y border-gray-100 mb-3">
          {[
            { label: 'Visited', value: parksVisited },
            { label: 'Bucket List', value: bucketCount },
            { label: 'Badges', value: earnedBadges.length },
          ].map(({ label, value }, i, arr) => (
            <View key={label} className={`flex-1 items-center py-4 ${i < arr.length - 1 ? 'border-r border-gray-100' : ''}`}>
              <Text className="text-2xl font-bold text-gray-900">{value}</Text>
              <Text className="text-xs text-gray-400 mt-0.5">{label}</Text>
            </View>
          ))}
        </View>

        {/* Recent badges */}
        {earnedBadges.length > 0 && (
          <View className="bg-white px-4 py-4 mb-3">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-base font-semibold text-gray-900">Badges</Text>
              <TouchableOpacity onPress={() => router.push('/badges')}>
                <Text className="text-sm text-brand-600">See all</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-3">
                {earnedBadges.slice(0, 10).map((badge: Badge) => (
                  <View key={badge.id} className="items-center w-16">
                    <View className="w-12 h-12 rounded-full bg-brand-50 items-center justify-center mb-1">
                      <Text style={{ fontSize: 22 }}>{badge.emoji}</Text>
                    </View>
                    <Text className="text-xs text-gray-500 text-center leading-tight" numberOfLines={2}>{badge.name}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        {/* Navigation menu */}
        <View className="bg-white mb-3">
          {MENU_ITEMS.map(({ icon, label, route }, i) => (
            <TouchableOpacity
              key={label}
              onPress={() => router.push(route as any)}
              className={`flex-row items-center px-4 py-4 ${i > 0 ? 'border-t border-gray-50' : ''} active:bg-gray-50`}
            >
              <View className="w-8 h-8 rounded-lg bg-brand-50 items-center justify-center mr-3">
                <Ionicons name={icon as any} size={18} color="#16a34a" />
              </View>
              <Text className="flex-1 text-gray-800 font-medium">{label}</Text>
              <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
            </TouchableOpacity>
          ))}
        </View>

        <View className="mb-8" />
      </ScrollView>
    </SafeAreaView>
  );
}
