import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Linking, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { getPark, getParkNPS, getParkWeather, getVisits, createVisit } from '@/lib/api';
import type { VisitEntry } from '@/lib/api';

const GRADIENTS: [string, string][] = [
  ['#1F3D2E', '#2F7A4A'],
  ['#2D4F66', '#1F3D2E'],
  ['#7B3A1F', '#C56B3D'],
  ['#3A2E5C', '#6E97A3'],
  ['#2F7A4A', '#2D4F66'],
];

function heroBg(code: string): string {
  const idx = code.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % GRADIENTS.length;
  return GRADIENTS[idx][0];
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Unknown';
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function StarRating({ rating }: { rating: number | null }) {
  if (!rating) return null;
  return (
    <View className="flex-row gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Ionicons key={i} name={i <= rating ? 'star' : 'star-outline'} size={14} color={i <= rating ? '#f59e0b' : '#d1d5db'} />
      ))}
    </View>
  );
}

export default function ParkDetailScreen() {
  const { park_code } = useLocalSearchParams<{ park_code: string }>();
  const { getToken } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [loggingVisit, setLoggingVisit] = useState(false);

  const { data: park, isLoading } = useQuery({
    queryKey: ['park', park_code],
    queryFn: async () => { const t = await getToken(); return getPark(t, park_code); },
  });

  const { data: nps } = useQuery({
    queryKey: ['park-nps', park_code],
    queryFn: async () => { const t = await getToken(); return getParkNPS(t, park_code); },
  });

  const { data: weather } = useQuery({
    queryKey: ['park-weather', park_code],
    queryFn: async () => { const t = await getToken(); return getParkWeather(t, park_code); },
    retry: false,
  });

  const { data: visits } = useQuery({
    queryKey: ['visits'],
    queryFn: async () => { const t = await getToken(); return getVisits(t!); },
  });

  const myVisits = (visits ?? []).filter((v: VisitEntry) => v.park_code === park_code && !v.is_bucket_list);
  const inBucket = (visits ?? []).some((v: VisitEntry) => v.park_code === park_code && v.is_bucket_list);
  const hasVisited = myVisits.length > 0;

  const logVisitMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return createVisit(token!, {
        park_code,
        visited_date: new Date().toISOString().split('T')[0],
        visibility: 'public',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visits'] });
      queryClient.invalidateQueries({ queryKey: ['badges'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
      Alert.alert('Visit logged!', `${park?.name ?? 'Park'} added to your visited parks.`);
    },
    onError: (e: Error) => Alert.alert('Error', e.message),
  });

  const addBucketMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return createVisit(token!, { park_code, is_bucket_list: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visits'] });
      Alert.alert('Added!', `${park?.name ?? 'Park'} added to your bucket list.`);
    },
    onError: (e: Error) => Alert.alert('Error', e.message),
  });

  if (isLoading) {
    return (
      <View className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" color="#16a34a" />
      </View>
    );
  }

  if (!park) {
    return (
      <View className="flex-1 bg-white items-center justify-center">
        <Text className="text-gray-500">Park not found</Text>
      </View>
    );
  }

  const infoRows: { icon: string; label: string; value: string; onPress?: () => void }[] = [];

  if (nps?.phoneNumber) {
    infoRows.push({ icon: 'call-outline', label: 'Phone', value: nps.phoneNumber, onPress: () => Linking.openURL(`tel:${nps.phoneNumber}`) });
  }
  if (nps?.url) {
    infoRows.push({ icon: 'globe-outline', label: 'Website', value: 'nps.gov', onPress: () => Linking.openURL(nps.url) });
  }
  if (nps?.operatingHours?.[0]?.description) {
    infoRows.push({ icon: 'time-outline', label: 'Hours', value: nps.operatingHours[0].description });
  }
  if (nps?.entranceFees?.[0]) {
    const fee = nps.entranceFees[0];
    infoRows.push({ icon: 'cash-outline', label: 'Entry Fee', value: `$${fee.cost} — ${fee.title}` });
  }

  return (
    <View className="flex-1 bg-white">
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={{ height: 220 }}>
          {park.image_url ? (
            <Image source={{ uri: park.image_url }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
          ) : (
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: heroBg(park_code) }]} />
          )}
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.35)' }]} />
          <SafeAreaView className="flex-1 justify-end pb-4 px-4" edges={['top']}>
            <Text className="text-white text-2xl font-black leading-tight" style={{ textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 8 }}>
              {park.name}
            </Text>
            <Text className="text-white/80 text-sm mt-1">{park.states}</Text>
          </SafeAreaView>
        </View>

        {/* Action buttons */}
        <View className="flex-row gap-3 px-4 py-4 border-b border-gray-100">
          {!hasVisited ? (
            <TouchableOpacity
              onPress={() => logVisitMutation.mutate()}
              disabled={logVisitMutation.isPending}
              className="flex-1 bg-brand-600 rounded-xl py-3 items-center flex-row justify-center gap-2"
            >
              {logVisitMutation.isPending
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />}
              <Text className="text-white font-semibold">Log Visit</Text>
            </TouchableOpacity>
          ) : (
            <View className="flex-1 bg-brand-50 rounded-xl py-3 items-center flex-row justify-center gap-2">
              <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
              <Text className="text-brand-700 font-semibold">Visited ✓</Text>
            </View>
          )}
          {!inBucket && !hasVisited && (
            <TouchableOpacity
              onPress={() => addBucketMutation.mutate()}
              disabled={addBucketMutation.isPending}
              className="px-4 bg-gray-100 rounded-xl py-3 items-center flex-row gap-2"
            >
              <Ionicons name="bookmark-outline" size={18} color="#d97706" />
              <Text className="text-gray-700 font-semibold">Bucket List</Text>
            </TouchableOpacity>
          )}
          {inBucket && (
            <View className="px-4 bg-amber-50 rounded-xl py-3 items-center flex-row gap-2">
              <Ionicons name="bookmark" size={18} color="#d97706" />
              <Text className="font-semibold" style={{ color: '#d97706' }}>In Bucket List</Text>
            </View>
          )}
        </View>

        {/* About */}
        {park.description && (
          <View className="px-4 py-5 border-b border-gray-100">
            <Text className="text-xs font-semibold text-gray-400 tracking-widest mb-2">ABOUT</Text>
            <Text className="text-sm text-gray-700 leading-6">{park.description}</Text>
          </View>
        )}

        {/* Weather */}
        {weather && (
          <View className="px-4 py-4 border-b border-gray-100">
            <Text className="text-xs font-semibold text-gray-400 tracking-widest mb-3">WEATHER</Text>
            <Text className="text-sm text-gray-600 leading-5">{weather.weatherInfo}</Text>
          </View>
        )}

        {/* Park info */}
        {infoRows.length > 0 && (
          <View className="px-4 py-4 border-b border-gray-100">
            <Text className="text-xs font-semibold text-gray-400 tracking-widest mb-3">PARK INFO</Text>
            <View className="gap-3">
              {infoRows.map(row => (
                <TouchableOpacity
                  key={row.label}
                  onPress={row.onPress}
                  disabled={!row.onPress}
                  className="flex-row items-start gap-3"
                >
                  <Ionicons name={row.icon as any} size={18} color="#9ca3af" style={{ marginTop: 1 }} />
                  <View className="flex-1">
                    <Text className="text-xs text-gray-400 mb-0.5">{row.label}</Text>
                    <Text className={`text-sm ${row.onPress ? 'text-brand-600' : 'text-gray-700'}`} numberOfLines={3}>{row.value}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* My visits */}
        {myVisits.length > 0 && (
          <View className="px-4 py-4 border-b border-gray-100">
            <Text className="text-xs font-semibold text-gray-400 tracking-widest mb-3">MY VISITS ({myVisits.length})</Text>
            <View className="gap-3">
              {myVisits.map((v: VisitEntry) => (
                <View key={v.id} className="flex-row items-start gap-3 bg-gray-50 rounded-xl p-3">
                  <Ionicons name="calendar-outline" size={18} color="#9ca3af" style={{ marginTop: 1 }} />
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-gray-900">{formatDate(v.visited_date)}</Text>
                    {v.rating && <StarRating rating={v.rating} />}
                    {v.notes && <Text className="text-xs text-gray-500 mt-1 leading-4">{v.notes}</Text>}
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        <View className="h-8" />
      </ScrollView>
    </View>
  );
}
