import { useState, useMemo, useCallback } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getParks, getVisits } from '@/lib/api';
import type { ParkDetail, VisitEntry } from '@/lib/api';

type StatusFilter = 'all' | 'visited' | 'bucket_list' | 'notVisited';

const FILTER_LABELS: Record<StatusFilter, string> = {
  all: 'All',
  visited: 'Visited',
  bucket_list: 'Bucket List',
  notVisited: 'Not Visited',
};

const GRADIENTS: [string, string][] = [
  ['#1F3D2E', '#2F7A4A'],
  ['#2D4F66', '#1F3D2E'],
  ['#7B3A1F', '#C56B3D'],
  ['#3A2E5C', '#6E97A3'],
  ['#2F7A4A', '#2D4F66'],
];

function parkGradientColor(code: string): string {
  const idx = code.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % GRADIENTS.length;
  return GRADIENTS[idx][0];
}

interface ParkRow extends ParkDetail {
  visitStatus: 'visited' | 'bucket_list' | 'unvisited';
}

function ParkItem({ park, onPress }: { park: ParkRow; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className="flex-row items-center mx-3 mb-2 bg-white rounded-2xl overflow-hidden border border-gray-100 active:opacity-75"
    >
      <View style={{ width: 76, height: 76 }}>
        {park.image_url ? (
          <Image source={{ uri: park.image_url }} style={{ width: 76, height: 76 }} contentFit="cover" />
        ) : (
          <View style={{ width: 76, height: 76, backgroundColor: parkGradientColor(park.park_code), alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 28 }}>🏔️</Text>
          </View>
        )}
      </View>
      <View className="flex-1 px-3 py-3">
        <Text className="font-semibold text-gray-900 text-sm leading-tight" numberOfLines={2}>{park.name}</Text>
        <Text className="text-xs text-gray-400 mt-0.5">{park.states}</Text>
        {park.visitStatus === 'visited' && (
          <Text className="text-xs font-semibold mt-1" style={{ color: '#16a34a' }}>✓ Visited</Text>
        )}
        {park.visitStatus === 'bucket_list' && (
          <Text className="text-xs font-semibold mt-1" style={{ color: '#d97706' }}>🔖 Bucket List</Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={16} color="#d1d5db" style={{ marginRight: 12 }} />
    </TouchableOpacity>
  );
}

export default function ParksScreen() {
  const { getToken } = useAuth();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');

  const { data: parks, isLoading } = useQuery({
    queryKey: ['parks'],
    queryFn: async () => { const t = await getToken(); return getParks(t); },
    staleTime: Infinity,
  });

  const { data: visits } = useQuery({
    queryKey: ['visits'],
    queryFn: async () => { const t = await getToken(); return getVisits(t!); },
  });

  const parksWithStatus = useMemo<ParkRow[]>(() => {
    if (!parks) return [];
    const visitedSet = new Set<string>();
    const bucketSet = new Set<string>();
    for (const v of (visits ?? []) as VisitEntry[]) {
      if (!v.is_bucket_list && v.visited_date) visitedSet.add(v.park_code);
      else if (v.is_bucket_list) bucketSet.add(v.park_code);
    }
    return parks.map(p => ({
      ...p,
      visitStatus: visitedSet.has(p.park_code) ? 'visited'
        : bucketSet.has(p.park_code) ? 'bucket_list'
        : 'unvisited',
    }));
  }, [parks, visits]);

  const filtered = useMemo(() => {
    let list = parksWithStatus;
    if (filter === 'visited') list = list.filter(p => p.visitStatus === 'visited');
    else if (filter === 'bucket_list') list = list.filter(p => p.visitStatus === 'bucket_list');
    else if (filter === 'notVisited') list = list.filter(p => p.visitStatus === 'unvisited');
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || p.states.toLowerCase().includes(q));
    }
    return list;
  }, [parksWithStatus, filter, search]);

  const renderItem = useCallback(({ item }: { item: ParkRow }) => (
    <ParkItem park={item} onPress={() => router.push(`/park/${item.park_code}` as any)} />
  ), [router]);

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <View className="bg-white border-b border-gray-100 px-4 pb-3">
        <Text className="text-lg font-bold text-gray-900 py-3">Parks</Text>
        <View className="flex-row items-center bg-gray-100 rounded-xl px-3 gap-2 mb-3">
          <Ionicons name="search" size={16} color="#9ca3af" />
          <TextInput
            placeholder="Search parks..."
            placeholderTextColor="#9ca3af"
            value={search}
            onChangeText={setSearch}
            className="flex-1 text-sm text-gray-900 py-2.5"
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color="#9ca3af" />
            </TouchableOpacity>
          )}
        </View>
        <View className="flex-row gap-2">
          {(['all', 'visited', 'bucket_list', 'notVisited'] as StatusFilter[]).map(f => (
            <TouchableOpacity
              key={f}
              onPress={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full ${filter === f ? 'bg-brand-600' : 'bg-gray-100'}`}
            >
              <Text className={`text-xs font-semibold ${filter === f ? 'text-white' : 'text-gray-500'}`}>
                {FILTER_LABELS[f]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#16a34a" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.park_code}
          renderItem={renderItem}
          contentContainerStyle={{ paddingTop: 12, paddingBottom: 24 }}
          ListEmptyComponent={
            <View className="items-center justify-center py-20">
              <Text className="text-4xl mb-3">🔍</Text>
              <Text className="text-gray-500 text-center text-base">No parks found</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
