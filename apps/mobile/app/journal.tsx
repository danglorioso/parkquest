import { useState, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native';
import { Image } from 'expo-image';
import { useAuth } from '@clerk/clerk-expo';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getVisits } from '@/lib/api';
import type { VisitEntry } from '@/lib/api';

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Unknown date';
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

const GRADIENTS: Record<number, string> = {
  0: '#1F3D2E', 1: '#2D4F66', 2: '#7B3A1F', 3: '#3A2E5C', 4: '#2F7A4A',
};
function bgColor(code: string): string {
  const idx = code.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 5;
  return GRADIENTS[idx];
}

function JournalEntry({ entry, onPress }: { entry: VisitEntry; onPress: () => void }) {
  const firstPhoto = entry.photos?.[0];
  return (
    <TouchableOpacity
      onPress={onPress}
      className="mx-3 mb-3 bg-white rounded-2xl overflow-hidden border border-gray-100 active:opacity-75"
    >
      <View style={{ height: 120 }}>
        {firstPhoto ? (
          <Image source={{ uri: firstPhoto.url }} style={{ width: '100%', height: 120 }} contentFit="cover" />
        ) : (
          <View style={{ width: '100%', height: 120, backgroundColor: bgColor(entry.park_code), alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 36 }}>🏔️</Text>
          </View>
        )}
      </View>
      <View className="p-4">
        <View className="flex-row items-start justify-between gap-2">
          <View className="flex-1">
            <Text className="font-bold text-gray-900 text-base" numberOfLines={1}>{entry.park_name ?? entry.park_code}</Text>
            <Text className="text-xs text-gray-400 mt-0.5">{formatDate(entry.visited_date)}</Text>
          </View>
          {entry.rating && (
            <View className="flex-row gap-0.5 mt-0.5">
              {[1, 2, 3, 4, 5].map(i => (
                <Ionicons key={i} name={i <= entry.rating! ? 'star' : 'star-outline'} size={12} color={i <= entry.rating! ? '#f59e0b' : '#d1d5db'} />
              ))}
            </View>
          )}
        </View>
        {entry.notes && (
          <Text className="text-sm text-gray-500 mt-2 leading-5" numberOfLines={2}>{entry.notes}</Text>
        )}
        {entry.activities && entry.activities.length > 0 && (
          <View className="flex-row flex-wrap gap-1.5 mt-2">
            {entry.activities.slice(0, 3).map(a => (
              <View key={a} className="bg-brand-50 rounded-full px-2 py-0.5">
                <Text className="text-xs text-brand-700">{a}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function JournalScreen() {
  const { getToken } = useAuth();
  const router = useRouter();
  const [search, setSearch] = useState('');

  const { data: visits, isLoading } = useQuery({
    queryKey: ['visits'],
    queryFn: async () => { const t = await getToken(); return getVisits(t!); },
  });

  const journal = useMemo(() => {
    const entries = (visits ?? []).filter((v: VisitEntry) => !v.is_bucket_list && v.visited_date);
    const sorted = [...entries].sort((a, b) =>
      new Date(b.visited_date!).getTime() - new Date(a.visited_date!).getTime()
    );
    if (!search.trim()) return sorted;
    const q = search.toLowerCase();
    return sorted.filter(v =>
      (v.park_name ?? '').toLowerCase().includes(q) ||
      (v.notes ?? '').toLowerCase().includes(q)
    );
  }, [visits, search]);

  if (isLoading) {
    return (
      <View className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" color="#16a34a" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <View className="bg-white px-3 pt-2 pb-3 border-b border-gray-100">
        <View className="flex-row items-center bg-gray-100 rounded-xl px-3 gap-2">
          <Ionicons name="search" size={16} color="#9ca3af" />
          <TextInput
            placeholder="Search journal..."
            placeholderTextColor="#9ca3af"
            value={search}
            onChangeText={setSearch}
            className="flex-1 text-sm text-gray-900 py-2.5"
          />
        </View>
      </View>

      <FlatList
        data={journal}
        keyExtractor={item => String(item.id)}
        renderItem={({ item }) => (
          <JournalEntry
            entry={item}
            onPress={() => router.push(`/park/${item.park_code}` as any)}
          />
        )}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 24 }}
        ListEmptyComponent={
          <View className="items-center justify-center py-20 px-8">
            <Text className="text-5xl mb-4">📖</Text>
            <Text className="text-gray-700 font-semibold text-base text-center">Your journal is empty</Text>
            <Text className="text-gray-400 text-sm text-center mt-2">
              Log visits to parks to build your travel journal.
            </Text>
          </View>
        }
      />
    </View>
  );
}
