import {
  ActivityIndicator, Dimensions, FlatList, Image, Linking, Modal,
  Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { PostCard, type FeedPost } from '@/components/PostCard';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import MapView, { Marker } from 'react-native-maps';
import { fullStateName } from '@/lib/stateNames';
import { useColors } from '@/lib/palette';
import { useTabBarSpace } from '@/components/FloatingTabBar';

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
  end_date: string | null;
  title: string | null;
  notes: string | null;
  highlight: string | null;
  rating: number | null;
  crowd: number | null;
  difficulty: number | null;
  weather_conditions: string[] | null;
  activities: string[] | null;
  companions: string[] | null;
  photos: string[] | null;
  cover_photo: string | null;
  visibility: string | null;
  created_at: string;
}

interface PostLite {
  id: number;
  caption: string | null;
  photos: string[] | null;
  park_code: string | null;
  visit_id: number | null;
  badge_id: string | null;
  created_at: string;
  clerk_user_id: string;
  park_name: string | null;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
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

const GRADIENTS: [string, string, string][] = [
  ['#1F3D2E', '#2F7A4A', '#C56B3D'],
  ['#2D4F66', '#1F3D2E', '#D89A3A'],
  ['#7B3A1F', '#C56B3D', '#1F3D2E'],
  ['#3A2E5C', '#6E97A3', '#D89A3A'],
  ['#2F7A4A', '#1F3D2E', '#2D4F66'],
];

function gradientIndex(code: string): number {
  return code.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % GRADIENTS.length;
}

function gradientColor(code: string): string {
  return GRADIENTS[gradientIndex(code)][0];
}

function gradientColors(code: string): [string, string, string] {
  return GRADIENTS[gradientIndex(code)];
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
  const C = useColors();
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, limit);
  const hidden = items.length - limit;
  return (
    <View style={styles.chipWrap}>
      {shown.map(item => (
        <View key={item} style={[styles.chip, muted && styles.chipMuted]}>
          <Text style={[styles.chipText, muted && styles.chipTextMuted]}>{item}</Text>
        </View>
      ))}
      {items.length > limit && !expanded && (
        <TouchableOpacity onPress={() => setExpanded(true)} style={[styles.chip, styles.chipExpand, { borderColor: C.primary }]}>
          <Text style={[styles.chipExpandText, { color: C.primary }]}>+{hidden} more</Text>
        </TouchableOpacity>
      )}
      {expanded && items.length > limit && (
        <TouchableOpacity onPress={() => setExpanded(false)} style={[styles.chip, styles.chipExpand, { borderColor: C.primary }]}>
          <Text style={[styles.chipExpandText, { color: C.primary }]}>Show less</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Photo lightbox ────────────────────────────────────────────────────────────

function Lightbox({ images, initialIndex, onClose }: {
  images: NpsImage[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(initialIndex);
  const flatRef = useRef<FlatList<NpsImage>>(null);

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.lightboxBg} onPress={onClose}>
        <TouchableOpacity style={styles.lightboxClose} onPress={onClose}>
          <Ionicons name="close" size={26} color="#FFFBF1" />
        </TouchableOpacity>
        <FlatList
          ref={flatRef}
          data={images}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, index) => ({ length: SW, offset: SW * index, index })}
          onMomentumScrollEnd={e => {
            setIdx(Math.round(e.nativeEvent.contentOffset.x / SW));
          }}
          renderItem={({ item }) => (
            <Pressable onPress={() => {}} style={{ width: SW, justifyContent: 'center', alignItems: 'center' }}>
              <Image source={{ uri: item.url }} style={styles.lightboxImg} resizeMode="contain" />
            </Pressable>
          )}
          keyExtractor={(_, i) => String(i)}
          style={{ flexGrow: 0 }}
        />
        {images[idx]?.title ? (
          <Text style={styles.lightboxCaption}>{images[idx].title}</Text>
        ) : null}
        {images.length > 1 && (
          <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, marginTop: 24 }}>
            {idx + 1} / {images.length}
          </Text>
        )}
      </Pressable>
    </Modal>
  );
}

// ── Visit card ────────────────────────────────────────────────────────────────

function VisitCard({ visit }: { visit: Visit }) {
  const C = useColors();
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
  const { user } = useUser();
  const insets = useSafeAreaInsets();
  const C = useColors();
  const tabBarSpace = useTabBarSpace();

  const [park,         setPark]         = useState<Park | null>(null);
  const [nps,          setNps]          = useState<NpsData | null>(null);
  const [weather,      setWeather]      = useState<WeatherForecast | null>(null);
  const [visits,       setVisits]       = useState<Visit[]>([]);
  const [myParkPosts,  setMyParkPosts]  = useState<FeedPost[]>([]);
  const [token,        setToken]        = useState<string | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [lightbox,     setLightbox]     = useState<{ images: NpsImage[]; idx: number } | null>(null);
  const [onBucket,     setOnBucket]     = useState(false);
  const [bucketBusy,   setBucketBusy]   = useState(false);
  const [heroIdx,      setHeroIdx]      = useState(0);
  const [heroLoaded,   setHeroLoaded]   = useState(false);
  const [prevHeroImage, setPrevHeroImage] = useState<string | null>(null);
  const prevHeroRef = useRef<string | null>(null);
  const npsRef = useRef<NpsData | null>(null);
  npsRef.current = nps;

  const loadData = useCallback(async () => {
    const tok = await getToken();
    if (!tok || !id) return;
    setToken(tok);
    setPark(prev => { if (!prev) setLoading(true); return prev; });
    try {
      const [parkData, npsData, visitsData, postsData] = await Promise.allSettled([
        apiFetch<Park>(`/api/parks/${id}`, tok),
        apiFetch<NpsData>(`/api/parks/${id}/nps`, tok),
        apiFetch<Visit[]>('/api/visits', tok),
        apiFetch<PostLite[]>(`/api/posts?parkCode=${id}`, tok),
      ]);
      if (parkData.status === 'fulfilled') setPark(parkData.value);
      if (npsData.status === 'fulfilled')  setNps(npsData.value);

      const allVisits = visitsData.status === 'fulfilled' ? visitsData.value : [];
      const parkVisits = allVisits.filter((v: Visit) => v.park_code === id && !v.is_bucket_list && v.visited_date);
      setVisits(parkVisits);
      setOnBucket(allVisits.some((v: Visit) => v.park_code === id && v.is_bucket_list));

      if (postsData.status === 'fulfilled') {
        const merged: FeedPost[] = postsData.value
          .filter(p => p.clerk_user_id === user?.id)
          .map(p => {
            const v = parkVisits.find(pv => pv.id === p.visit_id);
            return {
              ...p,
              park_image_url: null,
              is_friend_post: false,
              visibility: v?.visibility ?? null,
              visit_date: v?.visited_date ?? null,
              visit_rating: v?.rating ?? null,
              visit_activities: v?.activities ?? null,
              visit_weather: v?.weather_conditions ?? null,
              visit_crowd: v?.crowd ?? null,
              visit_difficulty: v?.difficulty ?? null,
              visit_companion_count: v?.companions?.length ?? null,
              visit_companion_names: null,
              visit_highlight: v?.highlight ?? null,
            } as FeedPost;
          });
        setMyParkPosts(merged);
      }
    } catch (e) {
      console.error('Park detail load failed:', e);
    } finally {
      setLoading(false);
    }
  }, [getToken, id, user?.id]);

  const loadWeather = useCallback(async () => {
    const tok = await getToken();
    if (!tok || !id) return;
    try {
      const data = await apiFetch<WeatherForecast>(`/api/parks/${id}/weather`, tok);
      setWeather(data);
    } catch { /* weather is optional */ }
  }, [getToken, id]);

  const toggleBucketList = useCallback(async () => {
    const tok = await getToken();
    if (!tok || !id) return;
    setBucketBusy(true);
    try {
      if (onBucket) {
        await fetch(`${BASE}/api/visits?park_code=${id}`, {
          method: 'DELETE', headers: { Authorization: `Bearer ${tok}` },
        });
        setOnBucket(false);
      } else {
        await fetch(`${BASE}/api/visits`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
          body: JSON.stringify({ park_code: id, is_bucket_list: true }),
        });
        setOnBucket(true);
      }
    } catch { /* ignore */ }
    setBucketBusy(false);
  }, [getToken, id, onBucket]);

  const loadDataRef = useRef(loadData);
  const loadWeatherRef = useRef(loadWeather);
  loadDataRef.current = loadData;
  loadWeatherRef.current = loadWeather;

  useEffect(() => {
    loadDataRef.current();
    loadWeatherRef.current();
  }, []);

  useEffect(() => {
    setHeroIdx(0);
    setHeroLoaded(false);
    setPrevHeroImage(null);
    prevHeroRef.current = null;
  }, [nps]);

  const totalImgs = nps?.images?.length ?? 0;
  const heroImage = totalImgs > 0 ? nps!.images[heroIdx]?.url : park?.image_url;

  useEffect(() => {
    if (!heroImage) return;
    if (prevHeroRef.current !== heroImage) {
      setPrevHeroImage(prevHeroRef.current);
      prevHeroRef.current = heroImage;
    }
  }, [heroImage]);

  useEffect(() => {
    if (!heroLoaded || !nps || nps.images.length < 2) return;
    const tid = setInterval(() => {
      setHeroIdx(prev => (prev + 1) % npsRef.current!.images.length);
    }, 5000);
    return () => clearInterval(tid);
  }, [heroLoaded, nps]);

  const parkStatus = (() => {
    if (visits.some(v => !v.is_bucket_list && v.visited_date)) return 'visited';
    return 'notVisited';
  })();

  // Daytime forecast periods only
  const forecastDays = weather?.periods.filter(p => p.isDaytime).slice(0, 7) ?? [];
  // Pair each daytime with the night low
  const forecastNights = weather?.periods.filter(p => !p.isDaytime) ?? [];

  const stripImages: Array<{ img: NpsImage; actualIdx: number }> = [];
  if (nps && totalImgs >= 2) {
    const stripCount = Math.min(totalImgs - 1, 4);
    for (let i = 0; i < stripCount; i++) {
      const actualIdx = (heroIdx + 1 + i) % totalImgs;
      stripImages.push({ img: nps.images[actualIdx], actualIdx });
    }
  }

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
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {lightbox && (
        <Lightbox
          images={lightbox.images}
          initialIndex={lightbox.idx}
          onClose={() => setLightbox(null)}
        />
      )}

      {/* Back button — fixed overlay, always visible */}
      <TouchableOpacity
        style={[styles.backBtn, { top: insets.top + 8, zIndex: 10 }]}
        onPress={() => router.back()}
        hitSlop={8}
      >
        <Ionicons name="chevron-back" size={24} color="#FFFBF1" />
      </TouchableOpacity>

      <ScrollView
        style={styles.screen}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: tabBarSpace + 12 }}
      >
        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <View style={[styles.hero, { height: 260 + insets.top, backgroundColor: gradientColor(park.park_code) }]}>
          {/* Previous image stays visible as background during cross-dissolve */}
          {prevHeroImage && (
            <ExpoImage
              source={{ uri: prevHeroImage }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          )}
          {heroImage && (
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={0.95}
              disabled={!nps?.images?.length}
              onPress={() => nps?.images?.length && setLightbox({ images: nps.images, idx: heroIdx })}
            >
              <ExpoImage
                key={heroImage}
                source={{ uri: heroImage }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={800}
                cachePolicy="memory-disk"
                onLoad={() => { if (!heroLoaded) setHeroLoaded(true); }}
              />
            </TouchableOpacity>
          )}
          <LinearGradient
            colors={['rgba(0,0,0,0.78)', 'rgba(0,0,0,0.42)', 'transparent']}
            locations={[0, 0.35, 0.65]}
            start={{ x: 0, y: 1 }}
            end={{ x: 0, y: 0 }}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />

          <View style={styles.heroContent} pointerEvents="none">
            <Text style={styles.heroDesignation}>{stateName.toUpperCase()}</Text>
            <Text style={styles.heroName}>{park.name}</Text>
          </View>
        </View>

        {/* ── Photo strip ──────────────────────────────────────────────────── */}
        {stripImages.length > 0 && (
          <ScrollView
            horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.photoStrip}
          >
            {stripImages.map(({ img, actualIdx }, slotIdx) => {
              const gc = gradientColors(park.park_code);
              return (
                <TouchableOpacity
                  key={slotIdx}
                  onPress={() => setLightbox({ images: nps!.images, idx: actualIdx })}
                  activeOpacity={0.85}
                  style={styles.photoStripItem}
                >
                  <LinearGradient
                    colors={gc}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  <ExpoImage
                    source={{ uri: img.url }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    transition={800}
                    cachePolicy="memory-disk"
                  />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* ── Quick stats ───────────────────────────────────────────────────── */}
        <View style={styles.statsRow}>
          <StatCell label="State" value={fullStateName(park.states)} />
          <View style={styles.statDivider} />
          <StatCell
            label="Status"
            value={parkStatus === 'visited' ? 'Visited' : onBucket ? 'Bucket list' : 'Not yet'}
            valueColor={parkStatus === 'visited' ? C.visited : onBucket ? C.bucket : C.inkMute}
          />
          <View style={styles.statDivider} />
          <StatCell label="Visits" value={String(visits.length)} />
        </View>

        {/* ── Action buttons ────────────────────────────────────────────────── */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: C.primary }]}
            onPress={() => router.push({ pathname: '/(modals)/log-visit', params: { parkCode: id } } as never)}
            activeOpacity={0.8}
          >
            <Ionicons name="pencil" size={16} color="#FFFBF1" />
            <Text style={styles.actionBtnText}>
              {parkStatus === 'visited' ? 'Log another visit' : 'Log a visit'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtnOutline, { borderColor: C.primary }]}
            onPress={() => router.push({ pathname: '/(tabs)/map', params: { parkCode: park.park_code } } as never)}
            activeOpacity={0.8}
          >
            <Ionicons name="map-outline" size={16} color={C.primary} />
            <Text style={[styles.actionBtnOutlineText, { color: C.primary }]}>View on map</Text>
          </TouchableOpacity>
        </View>

        {parkStatus !== 'visited' && (
          <TouchableOpacity
            style={[styles.bucketBtn, onBucket && styles.bucketBtnActive]}
            onPress={toggleBucketList}
            activeOpacity={0.8}
            disabled={bucketBusy}
          >
            {bucketBusy ? (
              <ActivityIndicator size="small" color={onBucket ? '#FFFBF1' : C.bucket} />
            ) : (
              <>
                <Ionicons
                  name={onBucket ? 'bookmark' : 'bookmark-outline'}
                  size={16}
                  color={onBucket ? '#FFFBF1' : C.bucket}
                />
                <Text style={[styles.bucketBtnText, onBucket && { color: '#FFFBF1' }]}>
                  {onBucket ? 'On bucket list' : 'Add to bucket list'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}

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
              <View key={hi} style={[styles.hoursCard, hi < nps.operatingHours.length - 1 && { marginBottom: 10 }]}>
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
                  <Text style={[styles.bodyText, { marginTop: 10 }]}>
                    {h.description}
                  </Text>
                ) : null}
              </View>
            ))}
          </Section>
        ) : null}

        {/* ── Location ──────────────────────────────────────────────────────── */}
        {park.latitude && park.longitude ? (
          <Section title="Location">
            <View style={styles.miniMapContainer}>
              <MapView
                style={styles.miniMap}
                scrollEnabled={false}
                zoomEnabled={false}
                rotateEnabled={false}
                pitchEnabled={false}
                initialRegion={{
                  latitude: parseFloat(park.latitude),
                  longitude: parseFloat(park.longitude),
                  latitudeDelta: 1.2,
                  longitudeDelta: 1.2,
                }}
                showsUserLocation={false}
                showsMyLocationButton={false}
                showsCompass={false}
                toolbarEnabled={false}
                moveOnMarkerPress={false}
                pointerEvents="none"
              >
                <Marker
                  coordinate={{
                    latitude: parseFloat(park.latitude),
                    longitude: parseFloat(park.longitude),
                  }}
                  pinColor={C.primary}
                />
              </MapView>
            </View>
            <TouchableOpacity
              style={styles.viewOnMapBtn}
              onPress={() => router.push({ pathname: '/(tabs)/map', params: { parkCode: park.park_code } } as never)}
              activeOpacity={0.8}
            >
              <Ionicons name="map-outline" size={14} color={C.primary} />
              <Text style={styles.viewOnMapBtnText}>View on full map</Text>
              <Ionicons name="arrow-forward" size={13} color={C.primary} />
            </TouchableOpacity>
          </Section>
        ) : null}

        {/* ── Entrance fees ─────────────────────────────────────────────────── */}
        {nps?.entranceFees && nps.entranceFees.length > 0 ? (
          <Section title="Entrance Fees">
            {nps.entranceFees.map((fee, fi) => (
              <View key={fi} style={[styles.feeRow, fi < nps.entranceFees.length - 1 && { marginBottom: 12 }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                  <Text style={styles.feeName}>{fee.title || 'Entrance'}</Text>
                  <Text style={[styles.feeCost, { color: C.primary }]}>
                    {fee.cost === '0.00' || fee.cost === '0' ? 'Free' : `$${parseFloat(fee.cost).toFixed(0)}`}
                  </Text>
                </View>
                {fee.description ? (
                  <Text style={styles.feeDesc}>{fee.description}</Text>
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
                <Text style={[styles.linkBtnText, { color: C.primary }]}>Open directions</Text>
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
              <Text style={{ fontSize: 36, marginBottom: 14 }}>🌲</Text>
              <Text style={{ fontWeight: '800', color: C.ink, fontSize: 16, marginBottom: 6 }}>
                No visits yet
              </Text>
              <Text style={{ color: C.inkMute, fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 22 }}>
                Log your first adventure at {park.name}.
              </Text>
              <TouchableOpacity
                style={[styles.journalEmptyBtn, { backgroundColor: C.primary }]}
                onPress={() => router.push({ pathname: '/(modals)/log-visit', params: { parkCode: id } } as never)}
                activeOpacity={0.8}
              >
                <Ionicons name="pencil" size={14} color="#FFFBF1" />
                <Text style={styles.actionBtnText}>Log a visit</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ gap: 0 }}>
              {token && myParkPosts.length > 0
                ? myParkPosts.map(post => (
                    <PostCard
                      key={post.id}
                      post={post}
                      token={token}
                      myUserId={user?.id ?? ''}
                      myAvatarUrl={user?.imageUrl}
                      myName={user?.fullName ?? user?.username}
                      onDelete={deletedId => setMyParkPosts(prev => prev.filter(p => p.id !== deletedId))}
                    />
                  ))
                : visits.map(v => (
                    <View key={v.id} style={[styles.visitCard, { marginBottom: 12 }]}>
                      <Text style={styles.visitDate}>
                        {v.visited_date
                          ? new Date(v.visited_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                          : 'No date'}
                      </Text>
                      {v.title ? <Text style={styles.visitTitle}>{v.title}</Text> : null}
                      {v.notes ? <Text style={styles.visitNotes} numberOfLines={4}>{v.notes}</Text> : null}
                    </View>
                  ))
              }
              <TouchableOpacity
                style={[styles.actionBtnOutline, { borderColor: C.primary, marginTop: 4 }]}
                onPress={() => router.push({ pathname: '/(modals)/log-visit', params: { parkCode: id } } as never)}
                activeOpacity={0.8}
              >
                <Ionicons name="add" size={16} color={C.primary} />
                <Text style={[styles.actionBtnOutlineText, { color: C.primary }]}>Log another visit</Text>
              </TouchableOpacity>
            </View>
          )}
        </Section>

        {/* ── Attribution ───────────────────────────────────────────────────── */}
        <View style={styles.attribution}>
          <Text style={styles.attributionText}>
            Park information is sourced directly from the{" "}
            <Text style={styles.attributionLink} onPress={() => Linking.openURL("https://www.nps.gov")}>
              National Park Service (NPS)
            </Text>
            . Weather forecasts are provided by the{" "}
            <Text style={styles.attributionLink} onPress={() => Linking.openURL("https://www.weather.gov")}>
              National Weather Service (NWS)
            </Text>
            . ParkQuest does not guarantee the accuracy, completeness, or timeliness of any information displayed. Always verify details with official sources before your visit.
          </Text>
        </View>
      </ScrollView>
    </View>
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
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  backBtn: {
    position: 'absolute',
    left: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroContent: {
    padding: 20,
    paddingBottom: 22,
  },
  heroDesignation: {
    fontSize: 13,
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

  // Photo strip
  photoStrip: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    flexDirection: 'row',
  },
  photoStripItem: {
    width: 110,
    height: 72,
    borderRadius: 10,
    overflow: 'hidden',
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
    marginTop: 0,
    marginBottom: 12,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
  },
  statLabel: {
    fontSize: 13,
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
    textAlign: 'center',
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
    marginBottom: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: C.primary,
    borderRadius: 12,
    paddingVertical: 11,
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
    paddingVertical: 11,
    borderWidth: 1.5,
    borderColor: C.primary,
  },
  actionBtnOutlineText: {
    fontSize: 13,
    fontWeight: '700',
    color: C.primary,
  },
  bucketBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    paddingVertical: 11,
    borderWidth: 1.5,
    borderColor: C.bucket,
    marginHorizontal: 16,
    marginTop: 0,
    marginBottom: 12,
  },
  bucketBtnActive: {
    backgroundColor: C.bucket,
  },
  bucketBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: C.bucket,
  },

  divider: {
    height: 0.5,
    backgroundColor: C.hairline,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 0,
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
    fontSize: 13,
    fontWeight: '600',
    color: C.inkSoft,
  },
  chipTextMuted: {
    color: C.inkMute,
    fontWeight: '500',
  },
  chipExpand: {
    backgroundColor: 'transparent',
    borderColor: C.primary,
  },
  chipExpandText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.primary,
  },

  // Hours
  hoursCard: {
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: C.hairline,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  hoursName: {
    fontSize: 13,
    fontWeight: '700',
    color: C.inkMute,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  hoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
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
    fontSize: 13,
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
    fontSize: 13,
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
    fontSize: 13,
    color: C.inkMute,
    marginTop: 1,
    marginBottom: 6,
  },
  weatherDesc: {
    fontSize: 13,
    color: C.inkMute,
    textAlign: 'center',
    lineHeight: 13,
    marginTop: 4,
  },

  // Journal
  journalEmpty: {
    alignItems: 'center',
    paddingTop: 32,
    paddingBottom: 28,
    paddingHorizontal: 24,
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 0.5,
    borderColor: C.hairline,
  },
  journalEmptyBtn: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    paddingVertical: 13,
  },
  visitCard: {
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: C.hairline,
    padding: 14,
  },
  visitDate: {
    fontSize: 13,
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
    fontSize: 13,
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
    fontSize: 13,
    color: C.inkMute,
    lineHeight: 16,
    textAlign: 'center',
  },
  attributionLink: {
    textDecorationLine: 'underline',
  },

  // Location mini-map
  miniMapContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: 'rgba(27,26,22,0.10)',
    height: 200,
  },
  miniMap: {
    flex: 1,
  },
  viewOnMapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 11,
    backgroundColor: '#FFFBF1',
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: 'rgba(27,26,22,0.10)',
  },
  viewOnMapBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1F3D2E',
  },
});
