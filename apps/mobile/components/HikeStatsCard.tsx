import { StyleSheet, Text, View } from 'react-native';
import MapView, { Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/lib/palette';
import { decodePolyline, fmtDuration, fmtElevationFt, fmtMiles, fmtPace } from '@/lib/hikeStats';

interface Props {
  distanceMeters: number | null;
  durationSeconds: number | null;
  elevationGainMeters: number | null;
  routePolyline: string | null;
  source?: 'strava' | 'gpx' | string | null;
}

// Stat chip row + (if a route was captured) a static, non-interactive route
// map — shown on a visit's detail view and on post cards for visits with an
// attached hike (Strava or an imported GPX file). See StepWhere in
// log-visit.tsx for where this data gets attached.
export function HikeStatsCard({ distanceMeters, durationSeconds, elevationGainMeters, routePolyline, source }: Props) {
  const C = useColors();
  const coords = routePolyline ? decodePolyline(routePolyline) : [];
  const isStrava = source === 'strava';

  const lats = coords.map(c => c.latitude);
  const lngs = coords.map(c => c.longitude);
  const region = coords.length > 1 ? {
    latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
    longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
    latitudeDelta: Math.max((Math.max(...lats) - Math.min(...lats)) * 1.4, 0.005),
    longitudeDelta: Math.max((Math.max(...lngs) - Math.min(...lngs)) * 1.4, 0.005),
  } : null;

  return (
    <View style={[styles.card, { backgroundColor: C.surfaceAlt, borderColor: C.hairline }]}>
      <View style={styles.header}>
        <Ionicons name={isStrava ? 'bicycle' : 'map'} size={14} color={isStrava ? '#FC4C02' : C.primary} />
        <Text style={[styles.headerText, { color: C.inkMute }]}>{isStrava ? 'Strava' : 'GPX route'}</Text>
      </View>

      {region && (
        <MapView
          provider={PROVIDER_DEFAULT}
          style={styles.map}
          initialRegion={region}
          scrollEnabled={false}
          zoomEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          pointerEvents="none"
        >
          <Polyline coordinates={coords} strokeColor={isStrava ? '#FC4C02' : C.primary} strokeWidth={3} />
        </MapView>
      )}

      <View style={styles.statsRow}>
        {distanceMeters != null && (
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: C.ink }]}>{fmtMiles(distanceMeters)}</Text>
            <Text style={[styles.statLabel, { color: C.inkMute }]}>Distance</Text>
          </View>
        )}
        {durationSeconds != null && (
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: C.ink }]}>{fmtDuration(durationSeconds)}</Text>
            <Text style={[styles.statLabel, { color: C.inkMute }]}>Time</Text>
          </View>
        )}
        {distanceMeters != null && durationSeconds != null && (
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: C.ink }]}>{fmtPace(distanceMeters, durationSeconds)}</Text>
            <Text style={[styles.statLabel, { color: C.inkMute }]}>Pace</Text>
          </View>
        )}
        {elevationGainMeters != null && (
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: C.ink }]}>{fmtElevationFt(elevationGainMeters)}</Text>
            <Text style={[styles.statLabel, { color: C.inkMute }]}>Elevation</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6 },
  headerText: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  map: { width: '100%', height: 140 },
  statsRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 12, gap: 16 },
  stat: { gap: 2 },
  statValue: { fontSize: 15, fontWeight: '800' },
  statLabel: { fontSize: 11, fontWeight: '600' },
});
