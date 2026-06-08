import { useRef, useState, useMemo } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, StyleSheet } from 'react-native';
import MapView, { Marker, Region, PROVIDER_DEFAULT, Callout } from 'react-native-maps';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getParks, getVisits } from '@/lib/api';
import type { ParkDetail, VisitEntry } from '@/lib/api';

const US_REGION: Region = {
  latitude: 39.5,
  longitude: -98.35,
  latitudeDelta: 35,
  longitudeDelta: 55,
};

type VisitStatus = 'visited' | 'bucket_list' | 'unvisited';

const STATUS_COLOR: Record<VisitStatus, string> = {
  visited: '#16a34a',
  bucket_list: '#f59e0b',
  unvisited: '#9ca3af',
};

interface ParkWithStatus extends ParkDetail {
  visitStatus: VisitStatus;
}

export default function MapScreen() {
  const { getToken } = useAuth();
  const router = useRouter();
  const mapRef = useRef<MapView>(null);
  const [selected, setSelected] = useState<ParkWithStatus | null>(null);

  const { data: parks, isLoading } = useQuery({
    queryKey: ['parks'],
    queryFn: async () => { const t = await getToken(); return getParks(t); },
    staleTime: Infinity,
  });

  const { data: visits } = useQuery({
    queryKey: ['visits'],
    queryFn: async () => { const t = await getToken(); return getVisits(t!); },
  });

  const markers = useMemo<ParkWithStatus[]>(() => {
    if (!parks) return [];
    const visitedSet = new Set<string>();
    const bucketSet = new Set<string>();
    for (const v of (visits ?? []) as VisitEntry[]) {
      if (!v.is_bucket_list && v.visited_date) visitedSet.add(v.park_code);
      else if (v.is_bucket_list) bucketSet.add(v.park_code);
    }
    return parks
      .filter(p => p.latitude && p.longitude)
      .map(p => ({
        ...p,
        visitStatus: visitedSet.has(p.park_code) ? 'visited'
          : bucketSet.has(p.park_code) ? 'bucket_list'
          : 'unvisited',
      }));
  }, [parks, visits]);

  if (isLoading) {
    return (
      <View className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" color="#16a34a" />
      </View>
    );
  }

  return (
    <View className="flex-1">
      <MapView
        ref={mapRef}
        provider={PROVIDER_DEFAULT}
        style={StyleSheet.absoluteFillObject}
        initialRegion={US_REGION}
        showsUserLocation
        showsMyLocationButton={false}
        onPress={() => setSelected(null)}
      >
        {markers.map(park => (
          <Marker
            key={park.park_code}
            coordinate={{
              latitude: parseFloat(park.latitude!),
              longitude: parseFloat(park.longitude!),
            }}
            pinColor={STATUS_COLOR[park.visitStatus]}
            onPress={() => setSelected(park)}
          />
        ))}
      </MapView>

      {/* Legend */}
      <View style={styles.legend}>
        {([
          { color: '#16a34a', label: 'Visited' },
          { color: '#f59e0b', label: 'Bucket List' },
          { color: '#9ca3af', label: 'Unvisited' },
        ] as const).map(({ color, label }) => (
          <View key={label} className="flex-row items-center gap-1.5">
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
            <Text className="text-xs text-gray-700 font-medium">{label}</Text>
          </View>
        ))}
      </View>

      {/* Selected park card */}
      {selected && (
        <View style={styles.card}>
          <View className="flex-row items-start gap-3">
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: STATUS_COLOR[selected.visitStatus], marginTop: 5, flexShrink: 0 }} />
            <View className="flex-1">
              <Text className="font-bold text-gray-900 text-base leading-tight">{selected.name}</Text>
              <Text className="text-sm text-gray-500 mt-0.5">{selected.states}</Text>
              {selected.visitStatus === 'visited' && <Text className="text-xs text-brand-600 font-semibold mt-1">✓ Visited</Text>}
              {selected.visitStatus === 'bucket_list' && <Text className="text-xs font-semibold mt-1" style={{ color: '#f59e0b' }}>🔖 Bucket List</Text>}
            </View>
            <TouchableOpacity onPress={() => setSelected(null)} className="p-1">
              <Ionicons name="close" size={18} color="#9ca3af" />
            </TouchableOpacity>
          </View>
          <View className="flex-row gap-2 mt-3">
            <TouchableOpacity
              onPress={() => router.push(`/park/${selected.park_code}` as any)}
              className="flex-1 bg-brand-600 rounded-xl py-2.5 items-center"
            >
              <Text className="text-white font-semibold text-sm">View Park</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  legend: {
    position: 'absolute',
    top: 52,
    left: 12,
    right: 12,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 12,
    padding: 10,
    flexDirection: 'row',
    justifyContent: 'space-around',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  card: {
    position: 'absolute',
    bottom: 28,
    left: 12,
    right: 12,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
});
