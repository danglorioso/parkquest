import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getParks, getVisits, getBadges, getActivity } from '@/lib/api';
import type { ActivityEvent } from '@/lib/api';
import type { Badge } from '@parkquest/types';

const TIER_COLOR: Record<string, string> = {
  bronze: '#B27339',
  silver: '#A8A39B',
  gold: '#D4A93F',
  platinum: '#6E97A3',
  legendary: '#8B5DBF',
};

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

function ActivityRow({ event }: { event: ActivityEvent }) {
  const name = event.display_name || event.username || 'Someone';
  const initials = name.slice(0, 2).toUpperCase();

  let what: string;
  let dest: string | null = null;
  let destColor = '#16a34a';

  if (event.type === 'visit') {
    what = 'visited';
    dest = event.park_name;
  } else if (event.type === 'bucket') {
    what = 'added to bucket list:';
    dest = event.park_name;
    destColor = '#d97706';
  } else if (event.type === 'badge') {
    what = `unlocked ${event.badge_emoji}`;
    dest = event.badge_name;
    destColor = '#d97706';
  } else {
    what = event.park_name ? 'posted at' : 'shared a post';
    dest = event.park_name ?? null;
  }

  return (
    <View className="flex-row items-center gap-3 py-2.5 border-b border-gray-50">
      <View className="w-8 h-8 rounded-full bg-gray-100 items-center justify-center overflow-hidden flex-shrink-0">
        {event.avatar_url
          ? <Image source={{ uri: event.avatar_url }} style={{ width: 32, height: 32 }} contentFit="cover" />
          : <Text className="text-xs font-bold text-gray-500">{initials}</Text>}
      </View>
      <Text className="flex-1 text-sm text-gray-600 leading-5">
        <Text className="font-semibold text-gray-900">{name}</Text>
        {' '}{what}{dest ? <Text style={{ color: destColor, fontWeight: '600' }}>{' '}{dest}</Text> : null}
      </Text>
      <Text className="text-xs text-gray-400 flex-shrink-0">{timeAgo(event.created_at)}</Text>
    </View>
  );
}

export default function HomeScreen() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const firstName = user?.firstName ?? 'Explorer';

  const now = new Date();
  const dayName = now.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
  const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();

  const { data: parks } = useQuery({
    queryKey: ['parks'],
    queryFn: async () => { const t = await getToken(); return getParks(t); },
    staleTime: Infinity,
  });

  const { data: visits } = useQuery({
    queryKey: ['visits'],
    queryFn: async () => { const t = await getToken(); return getVisits(t!); },
  });

  const { data: badgesData } = useQuery({
    queryKey: ['badges'],
    queryFn: async () => { const t = await getToken(); return getBadges(t!); },
  });

  const { data: activity, isLoading: activityLoading } = useQuery({
    queryKey: ['activity'],
    queryFn: async () => { const t = await getToken(); return getActivity(t!); },
  });

  const visitList = Array.isArray(visits) ? visits : [];
  const parksVisited = visitList.filter(v => !v.is_bucket_list).length;
  const bucketCount = visitList.filter(v => v.is_bucket_list).length;
  const totalParks = parks?.length ?? 63;
  const earnedBadges = badgesData?.badges?.filter((b: Badge) => b.earned) ?? [];
  const parksLeft = totalParks - parksVisited;

  const closestBadges = ((badgesData?.badges ?? []) as Badge[])
    .filter(b => !b.earned && b.progress_current !== null && b.progress_target !== null && b.progress_target > 0)
    .sort((a, b) => (b.progress_current! / b.progress_target!) - (a.progress_current! / a.progress_target!))
    .slice(0, 3);

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <View className="flex-row items-center justify-between px-4 py-3 bg-white border-b border-gray-100">
        <Text className="text-lg font-bold text-brand-700">ParkQuest</Text>
        <TouchableOpacity onPress={() => router.push('/notifications')}>
          <Ionicons name="notifications-outline" size={24} color="#6b7280" />
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Greeting */}
        <View className="px-4 pt-5 pb-4 bg-white mb-3">
          <Text className="text-xs text-gray-400 font-semibold tracking-widest mb-1">{dayName} · {dateStr}</Text>
          <Text className="text-2xl font-black text-gray-900 leading-tight">
            Welcome back, <Text className="text-brand-600">{firstName}</Text>.
          </Text>
          <Text className="text-sm text-gray-500 mt-2 leading-5">
            You've logged <Text className="font-semibold text-gray-800">{parksVisited} parks</Text>,{' '}
            <Text className="font-semibold text-gray-800">{parksLeft} away from legendary</Text>, and{' '}
            <Text className="font-semibold text-gray-800">{earnedBadges.length} badges</Text> earned.
          </Text>
        </View>

        {/* Stats grid */}
        <View className="flex-row flex-wrap px-3 gap-2 mb-3">
          {([
            { label: 'VISITED', value: parksVisited, sub: `/ ${totalParks}`, color: '#16a34a' },
            { label: 'BUCKET LIST', value: bucketCount, sub: 'saved', color: '#d97706' },
            { label: 'BADGES', value: earnedBadges.length, sub: 'earned', color: '#7c3aed' },
            { label: 'PARKS LEFT', value: parksLeft, sub: 'to go', color: '#0ea5e9' },
          ] as const).map(stat => (
            <View key={stat.label} className="bg-white rounded-2xl p-4 border border-gray-100" style={{ width: '47.5%' }}>
              <Text className="text-xs font-semibold text-gray-400 tracking-widest mb-1">{stat.label}</Text>
              <View className="flex-row items-baseline gap-1">
                <Text className="text-3xl font-black text-gray-900">{stat.value}</Text>
                <Text className="text-xs text-gray-400 font-medium">{stat.sub}</Text>
              </View>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: stat.color, marginTop: 6 }} />
            </View>
          ))}
        </View>

        {/* Quick actions */}
        <View className="mx-3 mb-3 flex-row gap-2">
          {([
            { icon: 'map-outline', label: 'Map', route: '/(tabs)/map' },
            { icon: 'leaf-outline', label: 'Parks', route: '/(tabs)/parks' },
            { icon: 'ribbon-outline', label: 'Badges', route: '/badges' },
            { icon: 'book-outline', label: 'Journal', route: '/journal' },
          ] as const).map(action => (
            <TouchableOpacity
              key={action.label}
              onPress={() => router.push(action.route as any)}
              className="flex-1 bg-white rounded-xl py-3 items-center border border-gray-100 active:opacity-70"
            >
              <Ionicons name={action.icon as any} size={20} color="#16a34a" />
              <Text className="text-xs text-gray-600 mt-1 font-medium">{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Activity */}
        <View className="mx-3 mb-3 bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100">
            <View>
              <Text className="text-xs font-semibold text-gray-400 tracking-widest">ACTIVITY</Text>
              <Text className="text-base font-bold text-gray-900 mt-0.5">What's new</Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/(tabs)/feed')}>
              <Text className="text-sm text-brand-600 font-medium">View all</Text>
            </TouchableOpacity>
          </View>
          <View className="px-4">
            {activityLoading ? (
              <ActivityIndicator className="py-6" color="#16a34a" />
            ) : !activity || activity.length === 0 ? (
              <View className="py-6 items-center gap-2">
                <Text className="text-2xl">🏕️</Text>
                <Text className="text-sm font-semibold text-gray-700">Nothing yet</Text>
                <Text className="text-xs text-gray-400 text-center">Add friends to see their park visits and posts.</Text>
                <TouchableOpacity
                  onPress={() => router.push('/friends')}
                  className="mt-2 bg-brand-600 rounded-xl px-5 py-2"
                >
                  <Text className="text-white text-sm font-semibold">Find friends</Text>
                </TouchableOpacity>
              </View>
            ) : (
              activity.slice(0, 5).map((event, i) => (
                <ActivityRow key={`${event.type}-${event.user_id}-${i}`} event={event} />
              ))
            )}
          </View>
        </View>

        {/* Closest badge unlocks */}
        {closestBadges.length > 0 && (
          <View className="mx-3 mb-8 bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100">
              <View>
                <Text className="text-xs font-semibold text-gray-400 tracking-widest">ALMOST THERE</Text>
                <Text className="text-base font-bold text-gray-900 mt-0.5">Closest unlocks</Text>
              </View>
              <TouchableOpacity onPress={() => router.push('/badges')}>
                <Text className="text-sm text-brand-600 font-medium">All badges</Text>
              </TouchableOpacity>
            </View>
            <View className="px-4 py-3 gap-4">
              {closestBadges.map((badge: Badge) => {
                const pct = badge.progress_target! > 0
                  ? Math.min(100, Math.round((badge.progress_current! / badge.progress_target!) * 100))
                  : 0;
                const color = TIER_COLOR[badge.tier] ?? '#6b7280';
                return (
                  <View key={badge.id} className="flex-row items-center gap-3">
                    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: `${color}22`, borderWidth: 1.5, borderColor: `${color}55`, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Text style={{ fontSize: 20 }}>{badge.emoji}</Text>
                    </View>
                    <View className="flex-1">
                      <View className="flex-row justify-between items-baseline">
                        <Text className="text-sm font-semibold text-gray-900">{badge.name}</Text>
                        <Text className="text-xs text-gray-400">{badge.progress_current} / {badge.progress_target}</Text>
                      </View>
                      <View className="h-1.5 bg-gray-100 rounded-full mt-1.5 overflow-hidden">
                        <View style={{ height: '100%', width: `${pct}%`, backgroundColor: color, borderRadius: 99 }} />
                      </View>
                      <Text className="text-xs text-gray-400 mt-1" numberOfLines={1}>{badge.description}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
