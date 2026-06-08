import {
  ActivityIndicator, Dimensions, FlatList, Image, Linking, Modal,
  ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { fullStateName } from '@/lib/stateNames';

// ── Design tokens ─────────────────────────────────────────────────────────────

const C = {
  bg:          '#F2EBDB',
  surface:     '#FFFBF1',
  surfaceAlt:  '#F7F0DE',
  ink:         '#1B1A16',
  inkSoft:     '#3C3A33',
  inkMute:     '#7A746A',
  hairline:    'rgba(27,26,22,0.10)',
  primary:     '#1F3D2E',
  accent:      '#C56B3D',
  visited:     '#2F7A4A',
  bucket:      '#C48A20',
};

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
const SW = Dimensions.get('window').width;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Park {
  park_code: string;
  name: string;
  states: string;
  description: string | null;
  latitude: string | null;
  longitude: string | null;
  image_url: string | null;
}

interface Visit {
  id: number;
  park_code: string;
  is_bucket_list: boolean;
  visited_date: string | null;
  title: string | null;
  notes: string | null;
  rating: number | null;
  photos: string[] | null;
}

interface NpsImage {
  url: string;
  title: string;
  altText: string;
  credit: string;
}

interface OperatingHours {
  name: string;
  description: string;
  standardHours: Record<string, string>;
}

interface EntranceFee {
  cost: string;
  title: string;
  description: string;
}

interface NpsData {
  images: NpsImage[];
  activities: string[];
  topics: string[];
  operatingHours: OperatingHours[];
  entranceFees: EntranceFee[];
  directionsInfo: string;
  directionsUrl: string;
  weatherInfo: string;
  phone: string;
  email: string;
  url: string;
  designation: string;
}

interface ForecastPeriod {
  name: string;
  temperature: number;
  temperatureUnit: string;
  shortForecast: string;
  icon: string;
  windSpeed: string;
  windDirection: string;
  isDaytime: boolean;
}

interface WeatherForecast {
  periods: ForecastPeriod[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const GRADIENTS = [
  ['#1F3D2E', '#2F7A4A'],
  ['#2D4F66', '#1F3D2E'],
  ['#7B3A1F', '#C56B3D'],
  ['#3A2E5C', '#6E97A3'],
  ['#2F7A4A', '#2D4F66'],
];

function gradientColor(code: string): string {
  const idx = code.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % GRADIENTS.length;
  return GRADIENTS[idx][0];
}

function weatherEmoji(shortForecast: string): string {
  const f = shortForecast.toLowerCase();
  if (f.includes('thunder') || f.includes('storm'))    return '⛈️';
  if (f.includes('snow') && f.includes('rain'))         return '🌨️';
  if (f.includes('heavy snow'))                         return '❄️';
  if (f.includes('snow'))                               return '❄️';
  if (f.includes('heavy rain') || f.includes('showers')) return '🌧️';
  if (f.includes('rain') || f.includes('drizzle'))     return '🌦️';
  if (f.includes('fog') || f.includes('haze'))         return '🌫️';
  if (f.includes('windy') || f.includes('breezy'))     return '🌬️';
  if (f.includes('partly cloudy') || f.includes('partly sunny')) return '⛅';
  if (f.includes('mostly cloudy'))                      return '🌥️';
  if (f.includes('cloud') || f.includes('overcast'))   return '☁️';
  if (f.includes('sunny') || f.includes('clear'))      return '☀️';
  return '🌤️';
}

async function apiFetch<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

// ── Chip grid ─────────────────────────────────────────────────────────────────

function ChipGrid({
  items, muted = false, limit = 8,
}: { items: string[]; muted?: boolean; limit?: number }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, limit);
  return (
    <>
      <View style={styles.chipWrap}>
        {shown.map(item => (
          <View key={item} style={[styles.chip, muted && styles.chipMuted]}>
            <Text style={[styles.chipText, muted && styles.chipTextMuted]}>{item}</Text>
          </View>
        ))}
      </View>
      {items.length > limit && (
        <TouchableOpacity onPress={() => setExpanded(e => !e)} style={styles.expandBtn}>
          <Text style={styles.expandText}>
            {expanded ? '↑ Show less' : `+${items.length - limit} more`}
          </Text>
        </TouchableOpacity>
      )}
    </>
  );
}

// ── Photo lightbox ────────────────────────────────────────────────────────────

function Lightbox({ images, initialIndex, onClose }: {
  images: NpsImage[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(initialIndex);
  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.lightboxBg}>
        <TouchableOpacity style={styles.lightboxClose} onPress={onClose}>
          <Ionicons name="close" size={26} color="#FFFBF1" />
        </TouchableOpacity>
        <Image source={{ uri: images[idx]?.url }} style={styles.lightboxImg} resizeMode="contain" />
        {images[idx]?.title ? (
          <Text style={styles.lightboxCaption}>{images[idx].title}</Text>
        ) : null}
        {images.length > 1 && (
          <View style={styles.lightboxNav}>
            <TouchableOpacity
              disabled={idx === 0}
              onPress={() => setIdx(i => i - 1)}
              style={[styles.lightboxNavBtn, idx === 0 && { opacity: 0.3 }]}
            >
              <Ionicons name="chevron-back" size={22} color="#FFFBF1" />
            </TouchableOpacity>
            <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12 }}>
              {idx + 1} / {images.length}
            </Text>
            <TouchableOpacity
              disabled={idx === images.length - 1}
              onPress={() => setIdx(i => i + 1)}
              style={[styles.lightboxNavBtn, idx === images.length - 1 && { opacity: 0.3 }]}
            >
              <Ionicons name="chevron-forward" size={22} color="#FFFBF1" />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

// ── Visit card ────────────────────────────────────────────────────────────────

function VisitCard({ visit }: { visit: Visit }) {
  const date = visit.visited_date
    ? new Date(visit.visited_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;
  return (
    <View style={styles.visitCard}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        {date && <Text style={styles.visitDate}>{date}</Text>}
        {visit.rating ? (
          <View style={{ flexDirection: 'row', gap: 1 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Ionicons
                key={i} name={i < Math.round(visit.rating!) ? 'star' : 'star-outline'}
                size={11} color={C.accent}
              />
            ))}
          </View>
        ) : null}
      </View>
      {visit.title && <Text style={styles.visitTitle}>{visit.title}</Text>}
      {visit.notes && <Text style={styles.visitNotes} numberOfLines={3}>{visit.notes}</Text>}
      {visit.photos && visit.photos.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {visit.photos.map((uri, i) => (
              <Image key={i} source={{ uri }} style={styles.visitPhoto} />
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ParkDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { getToken } = useAuth();

  const [park,     setPark]     = useState<Park | null>(null);
  const [nps,      setNps]      = useState<NpsData | null>(null);
  const [weather,  setWeather]  = useState<WeatherForecast | null>(null);
  const [visits,   setVisits]   = useState<Visit[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [heroErr,  setHeroErr]  = useState(false);
  const [lightbox, setLightbox] = useState<{ images: NpsImage[]; idx: number } | null>(null);

  const loadData = useCallback(async () => {
    const tok = await getToken();
    if (!tok || !id) return;
    setLoading(true);
    try {
      const [parkData, npsData, visitsData] = await Promise.allSettled([
        apiFetch<Park>(`/api/parks/${id}`, tok),
        apiFetch<NpsData>(`/api/parks/${id}/nps`, tok),
        apiFetch<Visit[]>('/api/visits', tok),
      ]);
      if (parkData.status === 'fulfilled') setPark(parkData.value);
      if (npsData.status === 'fulfilled')  setNps(npsData.value);
      if (visitsData.status === 'fulfilled') {
        setVisits(visitsData.value.filter((v: Visit) => v.park_code === id && !v.is_bucket_list && v.visited_date));
      }
    } catch (e) {
      console.error('Park detail load failed:', e);
    } finally {
      setLoading(false);
    }
  }, [getToken, id]);

  // Weather fetched separately (may be slow / fail without breaking the page)
  const loadWeather = useCallback(async () => {
    const tok = await getToken();
    if (!tok || !id) return;
    try {
      const data = await apiFetch<WeatherForecast>(`/api/parks/${id}/weather`, tok);
      setWeather(data);
    } catch { /* weather is optional */ }
  }, [getToken, id]);

  useEffect(() => {
    loadData();
    loadWeather();
  }, [loadData, loadWeather]);

  const parkStatus = (() => {
    if (visits.some(v => !v.is_bucket_list && v.visited_date)) return 'visited';
    return 'notVisited';
  })();

  // Daytime forecast periods only
  const forecastDays = weather?.periods.filter(p => p.isDaytime).slice(0, 7) ?? [];
  // Pair each daytime with the night low
  const forecastNights = weather?.periods.filter(p => !p.isDaytime) ?? [];

  const heroImage = nps?.images?.[0]?.url ?? park?.image_url;
  const extraImages: NpsImage[] = nps?.images?.slice(1, 5) ?? [];

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }

  if (!park) {
    return (
      <View style={styles.loadingWrap}>
        <Ionicons name="cloud-offline-outline" size={36} color={C.inkMute} style={{ marginBottom: 10 }} />
        <Text style={{ color: C.inkMute, fontSize: 15, fontWeight: '600', marginBottom: 14 }}>
          Failed to load park
        </Text>
        <TouchableOpacity
          onPress={() => loadData()}
          style={{ paddingHorizontal: 20, paddingVertical: 10, backgroundColor: C.primary, borderRadius: 12 }}
        >
          <Text style={{ color: '#FFFBF1', fontWeight: '700', fontSize: 14 }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const stateName = fullStateName(park.states);

  return (
    <>
      <Stack.Screen options={{ title: park.name }} />

      {lightbox && (
        <Lightbox
          images={lightbox.images}
          initialIndex={lightbox.idx}
          onClose={() => setLightbox(null)}
        />
      )}

      <ScrollView
        style={styles.screen}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 60 }}
      >
        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <View style={[styles.hero, { backgroundColor: gradientColor(park.park_code) }]}>
          {heroImage && !heroErr && (
            <Image
              source={{ uri: heroImage }}
              style={StyleSheet.absoluteFill as any}
              resizeMode="cover"
              onError={() => setHeroErr(true)}
            />
          )}
          <View style={styles.heroOverlay} />
          <View style={styles.heroContent}>
            {nps?.designation ? (
              <Text style={styles.heroDesignation}>{nps.designation.toUpperCase()}</Text>
            ) : null}
            <Text style={styles.heroName}>{park.name}</Text>
            <Text style={styles.heroState}>{stateName}</Text>
          </View>
        </View>

        {/* ── Photo strip ──────────────────────────────────────────────────── */}
        {extraImages.length > 0 && (
          <ScrollView
            horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.photoStrip}
          >
            {extraImages.map((img, i) => (
              <TouchableOpacity
                key={i}
                onPress={() => setLightbox({ images: nps!.images, idx: i + 1 })}
                activeOpacity={0.85}
              >
                <Image source={{ uri: img.url }} style={styles.photoStripImg} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* ── Quick stats ───────────────────────────────────────────────────── */}
        <View style={styles.statsRow}>
          <StatCell label="State" value={park.states.split(',').join(', ')} />
          <View style={styles.statDivider} />
          <StatCell
            label="Status"
            value={parkStatus === 'visited' ? 'Visited' : 'Not yet'}
            valueColor={parkStatus === 'visited' ? C.visited : C.inkMute}
          />
          <View style={styles.statDivider} />
          <StatCell label="Visits" value={String(visits.length)} />
        </View>

        {/* ── Action buttons ────────────────────────────────────────────────── */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => router.push('/(modals)/log-visit' as never)}
            activeOpacity={0.8}
          >
            <Ionicons name="pencil" size={16} color="#FFFBF1" />
            <Text style={styles.actionBtnText}>
              {parkStatus === 'visited' ? 'Log another visit' : 'Log a visit'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtnOutline}
            onPress={() => router.push('/(tabs)/map' as never)}
            activeOpacity={0.8}
          >
            <Ionicons name="map-outline" size={16} color={C.primary} />
            <Text style={styles.actionBtnOutlineText}>View on map</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        {/* ── About ─────────────────────────────────────────────────────────── */}
        {park.description ? (
          <Section title="About">
            <Text style={styles.bodyText}>{park.description}</Text>
          </Section>
        ) : null}

        {/* ── Activities ───────────────────────────────────────────────────── */}
        {nps?.activities && nps.activities.length > 0 ? (
          <Section title="Activities">
            <ChipGrid items={nps.activities} />
          </Section>
        ) : null}

        {/* ── Topics ───────────────────────────────────────────────────────── */}
        {nps?.topics && nps.topics.length > 0 ? (
          <Section title="Topics">
            <ChipGrid items={nps.topics} muted />
          </Section>
        ) : null}

        {/* ── Operating hours ───────────────────────────────────────────────── */}
        {nps?.operatingHours && nps.operatingHours.length > 0 ? (
          <Section title="Operating Hours">
            {nps.operatingHours.map((h, hi) => (
              <View key={hi} style={{ marginBottom: hi < nps.operatingHours.length - 1 ? 16 : 0 }}>
                {nps.operatingHours.length > 1 && (
                  <Text style={styles.hoursName}>{h.name}</Text>
                )}
                {DAYS.map(day => {
                  const val = h.standardHours?.[day.toLowerCase()] ?? '—';
                  return (
                    <View key={day} style={styles.hoursRow}>
                      <Text style={styles.hoursDay}>{day}</Text>
                      <Text style={styles.hoursVal}>{val}</Text>
                    </View>
                  );
                })}
                {h.description ? (
                  <Text style={[styles.bodyText, { marginTop: 8 }]} numberOfLines={4}>
                    {h.description}
                  </Text>
                ) : null}
              </View>
            ))}
          </Section>
        ) : null}

        {/* ── Entrance fees ─────────────────────────────────────────────────── */}
        {nps?.entranceFees && nps.entranceFees.length > 0 ? (
          <Section title="Entrance Fees">
            {nps.entranceFees.map((fee, fi) => (
              <View key={fi} style={[styles.feeRow, fi < nps.entranceFees.length - 1 && { marginBottom: 12 }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                  <Text style={styles.feeName}>{fee.title || 'Entrance'}</Text>
                  <Text style={styles.feeCost}>
                    {fee.cost === '0.00' || fee.cost === '0' ? 'Free' : `$${parseFloat(fee.cost).toFixed(0)}`}
                  </Text>
                </View>
                {fee.description ? (
                  <Text style={styles.feeDesc} numberOfLines={3}>{fee.description}</Text>
                ) : null}
              </View>
            ))}
          </Section>
        ) : null}

        {/* ── Directions ───────────────────────────────────────────────────── */}
        {nps?.directionsInfo ? (
          <Section title="Directions">
            <Text style={styles.bodyText}>{nps.directionsInfo}</Text>
            {nps.directionsUrl ? (
              <TouchableOpacity
                onPress={() => Linking.openURL(nps.directionsUrl)}
                style={styles.linkBtn}
              >
                <Ionicons name="navigate-outline" size={14} color={C.primary} />
                <Text style={styles.linkBtnText}>Open directions</Text>
              </TouchableOpacity>
            ) : null}
          </Section>
        ) : null}

        {/* ── Contact ───────────────────────────────────────────────────────── */}
        {(nps?.phone || nps?.email || nps?.url) ? (
          <Section title="Contact">
            <View style={{ gap: 10 }}>
              {nps.phone ? (
                <TouchableOpacity
                  style={styles.contactRow}
                  onPress={() => Linking.openURL(`tel:${nps.phone.replace(/\D/g, '')}`)}
                >
                  <Ionicons name="call-outline" size={15} color={C.inkMute} />
                  <Text style={styles.contactText}>{nps.phone}</Text>
                </TouchableOpacity>
              ) : null}
              {nps.email ? (
                <TouchableOpacity
                  style={styles.contactRow}
                  onPress={() => Linking.openURL(`mailto:${nps.email}`)}
                >
                  <Ionicons name="mail-outline" size={15} color={C.inkMute} />
                  <Text style={styles.contactText}>{nps.email}</Text>
                </TouchableOpacity>
              ) : null}
              {nps.url ? (
                <TouchableOpacity
                  style={styles.contactRow}
                  onPress={() => Linking.openURL(nps.url)}
                >
                  <Ionicons name="globe-outline" size={15} color={C.inkMute} />
                  <Text style={styles.contactText}>NPS Website</Text>
                  <Ionicons name="arrow-forward" size={11} color={C.inkMute} />
                </TouchableOpacity>
              ) : null}
            </View>
          </Section>
        ) : null}

        {/* ── Weather ───────────────────────────────────────────────────────── */}
        {forecastDays.length > 0 ? (
          <Section title="Weather Forecast">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }}>
              <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 4 }}>
                {forecastDays.map((p, i) => {
                  const night = forecastNights[i];
                  return (
                    <View key={i} style={styles.weatherCard}>
                      <Text style={styles.weatherDay}>{p.name.replace('This ', '').replace('Tonight', 'Tonight')}</Text>
                      <Text style={styles.weatherEmoji}>{weatherEmoji(p.shortForecast)}</Text>
                      <Text style={styles.weatherTemp}>{p.temperature}°{p.temperatureUnit}</Text>
                      {night && (
                        <Text style={styles.weatherLow}>{night.temperature}° low</Text>
                      )}
                      <Text style={styles.weatherDesc} numberOfLines={2}>{p.shortForecast}</Text>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
            {nps?.weatherInfo ? (
              <Text style={[styles.bodyText, { marginTop: 12 }]}>{nps.weatherInfo}</Text>
            ) : null}
          </Section>
        ) : (
          nps?.weatherInfo ? (
            <Section title="Weather">
              <Text style={styles.bodyText}>{nps.weatherInfo}</Text>
            </Section>
          ) : null
        )}

        <View style={styles.divider} />

        {/* ── Journal ───────────────────────────────────────────────────────── */}
        <Section title={`Your Journal (${visits.length})`}>
          {visits.length === 0 ? (
            <View style={styles.journalEmpty}>
              <Text style={{ fontSize: 28, marginBottom: 10 }}>🌲</Text>
              <Text style={{ fontWeight: '700', color: C.ink, fontSize: 14, marginBottom: 4 }}>
                No visits yet
              </Text>
              <Text style={{ color: C.inkMute, fontSize: 12, textAlign: 'center', marginBottom: 16 }}>
                Be the first to log your adventure at {park.name}.
              </Text>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => router.push('/(modals)/log-visit' as never)}
                activeOpacity={0.8}
              >
                <Ionicons name="pencil" size={14} color="#FFFBF1" />
                <Text style={styles.actionBtnText}>Log a visit</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {visits.map(v => <VisitCard key={v.id} visit={v} />)}
              <TouchableOpacity
                style={styles.actionBtnOutline}
                onPress={() => router.push('/(modals)/log-visit' as never)}
                activeOpacity={0.8}
              >
                <Ionicons name="add" size={16} color={C.primary} />
                <Text style={styles.actionBtnOutlineText}>Log another visit</Text>
              </TouchableOpacity>
            </View>
          )}
        </Section>

        {/* ── Attribution ───────────────────────────────────────────────────── */}
        <View style={styles.attribution}>
          <Text style={styles.attributionText}>
            Park information sourced from the National Park Service (NPS). Always verify details before your visit.
          </Text>
        </View>
      </ScrollView>
    </>
  );
}

// ── Stat cell ─────────────────────────────────────────────────────────────────

function StatCell({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.bg,
  },
  loadingWrap: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Hero
  hero: {
    height: 260,
    justifyContent: 'flex-end',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.32)',
  },
  heroContent: {
    padding: 20,
    paddingBottom: 22,
  },
  heroDesignation: {
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.65)',
    letterSpacing: 1.4,
    marginBottom: 4,
  },
  heroName: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFBF1',
    letterSpacing: -0.5,
    lineHeight: 32,
  },
  heroState: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.72)',
    marginTop: 4,
  },

  // Photo strip
  photoStrip: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    flexDirection: 'row',
  },
  photoStripImg: {
    width: 110,
    height: 72,
    borderRadius: 10,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: C.hairline,
    overflow: 'hidden',
    marginTop: 4,
    marginBottom: 14,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
  },
  statLabel: {
    fontSize: 9.5,
    fontWeight: '600',
    color: C.inkMute,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '700',
    color: C.ink,
  },
  statDivider: {
    width: 0.5,
    backgroundColor: C.hairline,
    marginVertical: 10,
  },

  // Actions
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 20,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: C.primary,
    borderRadius: 12,
    paddingVertical: 12,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFBF1',
  },
  actionBtnOutline: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'transparent',
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: C.primary,
  },
  actionBtnOutlineText: {
    fontSize: 13,
    fontWeight: '700',
    color: C.primary,
  },

  divider: {
    height: 0.5,
    backgroundColor: C.hairline,
    marginHorizontal: 16,
    marginVertical: 8,
  },

  // Section
  section: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: C.ink,
    letterSpacing: -0.2,
    marginBottom: 12,
  },
  bodyText: {
    fontSize: 13.5,
    color: C.inkSoft,
    lineHeight: 20,
  },

  // Chip grid
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
    backgroundColor: C.surface,
    borderWidth: 0.5,
    borderColor: C.hairline,
  },
  chipMuted: {
    backgroundColor: C.surfaceAlt,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: C.inkSoft,
  },
  chipTextMuted: {
    color: C.inkMute,
    fontWeight: '500',
  },
  expandBtn: {
    marginTop: 8,
  },
  expandText: {
    fontSize: 12,
    fontWeight: '600',
    color: C.primary,
  },

  // Hours
  hoursName: {
    fontSize: 12,
    fontWeight: '700',
    color: C.inkMute,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  hoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: C.hairline,
  },
  hoursDay: {
    fontSize: 13,
    fontWeight: '500',
    color: C.inkSoft,
  },
  hoursVal: {
    fontSize: 13,
    color: C.inkMute,
    fontWeight: '400',
  },

  // Fees
  feeRow: {
    backgroundColor: C.surface,
    borderRadius: 10,
    padding: 12,
    borderWidth: 0.5,
    borderColor: C.hairline,
  },
  feeName: {
    fontSize: 13,
    fontWeight: '700',
    color: C.ink,
  },
  feeCost: {
    fontSize: 13,
    fontWeight: '700',
    color: C.primary,
  },
  feeDesc: {
    fontSize: 12,
    color: C.inkMute,
    lineHeight: 17,
    marginTop: 4,
  },

  // Links / contact
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  linkBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.primary,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  contactText: {
    fontSize: 13,
    color: C.ink,
    flex: 1,
  },

  // Weather
  weatherCard: {
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: C.hairline,
    padding: 12,
    width: 96,
    alignItems: 'center',
  },
  weatherDay: {
    fontSize: 10,
    fontWeight: '700',
    color: C.inkMute,
    letterSpacing: 0.3,
    marginBottom: 6,
    textAlign: 'center',
  },
  weatherEmoji: {
    fontSize: 26,
    marginBottom: 4,
  },
  weatherTemp: {
    fontSize: 17,
    fontWeight: '800',
    color: C.ink,
  },
  weatherLow: {
    fontSize: 10,
    color: C.inkMute,
    marginTop: 1,
    marginBottom: 6,
  },
  weatherDesc: {
    fontSize: 10,
    color: C.inkMute,
    textAlign: 'center',
    lineHeight: 13,
    marginTop: 4,
  },

  // Journal
  journalEmpty: {
    alignItems: 'center',
    paddingVertical: 24,
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: C.hairline,
    paddingHorizontal: 20,
  },
  visitCard: {
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: C.hairline,
    padding: 14,
  },
  visitDate: {
    fontSize: 11,
    fontWeight: '600',
    color: C.inkMute,
    letterSpacing: 0.2,
  },
  visitTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: C.ink,
    marginBottom: 4,
  },
  visitNotes: {
    fontSize: 13,
    color: C.inkSoft,
    lineHeight: 19,
  },
  visitPhoto: {
    width: 90,
    height: 70,
    borderRadius: 8,
  },

  // Lightbox
  lightboxBg: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxClose: {
    position: 'absolute',
    top: 56,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  lightboxImg: {
    width: SW,
    height: SW * 0.75,
  },
  lightboxCaption: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 24,
    marginTop: 12,
  },
  lightboxNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
    marginTop: 24,
  },
  lightboxNavBtn: {
    padding: 8,
  },

  // Attribution
  attribution: {
    marginHorizontal: 16,
    paddingVertical: 20,
    borderTopWidth: 0.5,
    borderTopColor: C.hairline,
    marginTop: 8,
  },
  attributionText: {
    fontSize: 11,
    color: C.inkMute,
    lineHeight: 16,
    textAlign: 'center',
  },
});
