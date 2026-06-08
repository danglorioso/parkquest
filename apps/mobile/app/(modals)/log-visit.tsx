import {
  Alert, FlatList, Image, KeyboardAvoidingView, Modal, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useRouter } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fullStateName } from '@/lib/stateNames';

// ── Design tokens ─────────────────────────────────────────────────────────────

const C = {
  bg:         '#F2EBDB',
  surface:    '#FFFBF1',
  surfaceAlt: '#F7F0DE',
  ink:        '#1B1A16',
  inkSoft:    '#3C3A33',
  inkMute:    '#7A746A',
  hairline:   'rgba(27,26,22,0.10)',
  hairlineSoft:'rgba(27,26,22,0.06)',
  primary:    '#1F3D2E',
  accent:     '#C56B3D',
  visited:    '#2F7A4A',
  bucket:     '#D89A3A',
};

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Draft {
  parkCode: string;
  startDate: Date | null;
  endDate:   Date | null;
  title:     string;
  rating:    number;
  crowd:     number;
  difficulty:number;
  weather:   string[];
  wouldReturn:'yes' | 'maybe' | 'no' | null;
  highlight: string;
  notes:     string;
  activities:string[];
  companions:string[];
  companionObjs: CompanionUser[];
  photos:    string[];
  cover:     string | null;
  visibility:'Private' | 'Friends' | 'Public';
  caption:   string;
}

interface ParkInfo { park_code: string; name: string; states: string; image_url: string | null; }
interface CompanionUser { clerk_user_id: string; username: string; display_name: string | null; avatar_url: string | null; }

// ── Constants ─────────────────────────────────────────────────────────────────

const WEATHER_OPTS = [
  { id: 'clear',  label: 'Clear',   emoji: '☀️'  },
  { id: 'partly', label: 'Partly',  emoji: '⛅'  },
  { id: 'cloudy', label: 'Cloudy',  emoji: '☁️'  },
  { id: 'rain',   label: 'Rain',    emoji: '🌧'  },
  { id: 'storm',  label: 'Storms',  emoji: '⛈'  },
  { id: 'snow',   label: 'Snow',    emoji: '❄️'  },
  { id: 'fog',    label: 'Fog',     emoji: '🌫'  },
  { id: 'wind',   label: 'Windy',   emoji: '💨'  },
];
const CROWD_LABELS  = ['Empty', 'Quiet', 'Moderate', 'Busy', 'Packed'];
const DIFF_LABELS   = ['Easy', 'Light', 'Moderate', 'Hard', 'Strenuous'];
const ALL_ACTIVITIES= ['hiking','camping','backpacking','climbing','kayaking','rafting','fishing','diving','wildlife','photography','stargazing','tours','cycling','mountaineering'];
const RETURN_OPTS   = [
  { id: 'yes',   label: 'Definitely',   color: C.visited, icon: 'heart-outline' as const,  iconFilled: 'heart' as const },
  { id: 'maybe', label: 'Maybe',        color: C.bucket,  icon: 'repeat-outline' as const, iconFilled: 'repeat' as const },
  { id: 'no',    label: 'Probably not', color: C.inkMute, icon: 'cloud-outline' as const,  iconFilled: 'cloud' as const },
];
const STEPS = ['Where & when', 'The visit', 'Journal', 'Share'];
const STAR_SIZE = 36;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeBlank(): Draft {
  return {
    parkCode: '', startDate: null, endDate: null, title: '',
    rating: 0, crowd: 0, difficulty: 0, weather: [], wouldReturn: null,
    highlight: '', notes: '', activities: [], companions: [], companionObjs: [],
    photos: [], cover: null, visibility: 'Friends', caption: '',
  };
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function dayCount(start: Date | null, end: Date | null): number {
  if (!start) return 0;
  if (!end) return 1;
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}

async function apiFetch<T>(path: string, token: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── StarRating ────────────────────────────────────────────────────────────────

const HALF_LABELS: Record<number, string> = {
  0:'', 0.5:'Not great', 1:'Rough', 1.5:'Below avg',
  2:'Meh', 2.5:'Decent', 3:'Good', 3.5:'Really good',
  4:'Great', 4.5:'Amazing', 5:'Unreal',
};

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 4, marginBottom: 8 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <View key={i} style={{ width: STAR_SIZE, height: STAR_SIZE, flexDirection: 'row' }}>
            <TouchableOpacity
              style={{ flex: 1 }}
              onPress={() => onChange(value === i + 0.5 ? 0 : i + 0.5)}
              activeOpacity={0.6}
            >
              <View style={[styles.starHalf, {
                borderTopLeftRadius: 4, borderBottomLeftRadius: 4,
                backgroundColor: value >= i + 0.5 ? C.accent : C.surfaceAlt,
              }]} />
            </TouchableOpacity>
            <TouchableOpacity
              style={{ flex: 1 }}
              onPress={() => onChange(value === i + 1 ? 0 : i + 1)}
              activeOpacity={0.6}
            >
              <View style={[styles.starHalf, {
                borderTopRightRadius: 4, borderBottomRightRadius: 4,
                backgroundColor: value >= i + 1 ? C.accent : C.surfaceAlt,
              }]} />
            </TouchableOpacity>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, minHeight: 22 }}>
        {value > 0 ? (
          <>
            <Text style={{ fontSize: 22, fontWeight: '800', color: C.ink, letterSpacing: -0.4 }}>{value}</Text>
            <Text style={{ fontSize: 12, color: C.inkMute, fontWeight: '600' }}>/ 5</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: C.accent }}>{HALF_LABELS[value]}</Text>
          </>
        ) : (
          <Text style={{ fontSize: 12.5, color: C.inkMute }}>Tap a star to rate</Text>
        )}
      </View>
    </View>
  );
}

// ── ScaleRow ──────────────────────────────────────────────────────────────────

function ScaleRow({ value, onChange, labels }: { value: number; onChange: (v: number) => void; labels: string[] }) {
  return (
    <View style={{ flexDirection: 'row', gap: 5 }}>
      {labels.map((l, i) => {
        const on = value === i + 1;
        return (
          <TouchableOpacity
            key={l} onPress={() => onChange(on ? 0 : i + 1)}
            style={[styles.scaleBtn, { backgroundColor: on ? C.primary : C.surfaceAlt, borderColor: on ? C.primary : C.hairline }]}
            activeOpacity={0.7}
          >
            <Text style={[styles.scaleBtnText, { color: on ? '#FFFBF1' : C.inkSoft }]}>{l}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── WeatherGrid ───────────────────────────────────────────────────────────────

function WeatherGrid({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter(w => w !== id) : [...value, id]);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
      {WEATHER_OPTS.map(w => {
        const on = value.includes(w.id);
        return (
          <TouchableOpacity
            key={w.id} onPress={() => toggle(w.id)} activeOpacity={0.7}
            style={[styles.weatherChip, { backgroundColor: on ? C.primary : C.surfaceAlt, borderColor: on ? C.primary : C.hairline }]}
          >
            <Text style={{ fontSize: 18, lineHeight: 22 }}>{w.emoji}</Text>
            <Text style={[styles.weatherLabel, { color: on ? '#FFFBF1' : C.inkSoft }]}>{w.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── ActivityChips ─────────────────────────────────────────────────────────────

function ActivityChips({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [customQ, setCustomQ] = useState('');

  const toggle = (a: string) =>
    onChange(value.includes(a) ? value.filter(x => x !== a) : value.length < 8 ? [...value, a] : value);

  const removeCustom = (a: string) => onChange(value.filter(x => x !== a));

  const addCustom = () => {
    const trimmed = customQ.trim();
    if (!trimmed || value.length >= 8) return;
    const std = ALL_ACTIVITIES.find(a => a.toLowerCase() === trimmed.toLowerCase());
    const key = std ?? trimmed;
    if (!value.some(v => v.toLowerCase() === key.toLowerCase())) onChange([...value, key]);
    setCustomQ('');
  };

  const customActivities = value.filter(a => !ALL_ACTIVITIES.includes(a));

  return (
    <View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
        {ALL_ACTIVITIES.map(a => {
          const on = value.includes(a);
          return (
            <TouchableOpacity
              key={a} onPress={() => toggle(a)} activeOpacity={0.7}
              style={[styles.activityChip, { backgroundColor: on ? C.primary : C.surfaceAlt, borderColor: on ? C.primary : C.hairline }]}
            >
              {on && <Ionicons name="checkmark" size={11} color="#FFFBF1" />}
              <Text style={[styles.activityChipText, { color: on ? '#FFFBF1' : C.inkSoft }]}>{a}</Text>
            </TouchableOpacity>
          );
        })}
        {customActivities.map(a => (
          <View key={a} style={[styles.activityChip, { backgroundColor: C.primary, borderColor: C.primary }]}>
            <Text style={[styles.activityChipText, { color: '#FFFBF1' }]}>{a}</Text>
            <TouchableOpacity onPress={() => removeCustom(a)} hitSlop={6}>
              <Ionicons name="close" size={11} color="rgba(255,251,241,0.8)" />
            </TouchableOpacity>
          </View>
        ))}
      </View>
      {value.length < 8 && (
        <View style={[styles.searchRow, { marginTop: 10 }]}>
          <Ionicons name="add" size={14} color={C.inkMute} />
          <TextInput
            value={customQ} onChangeText={setCustomQ}
            placeholder="Add another activity…" placeholderTextColor={C.inkMute}
            style={styles.searchInput}
            autoCorrect={false} autoCapitalize="none"
            onSubmitEditing={addCustom} returnKeyType="done"
          />
          {customQ.length > 0 && (
            <TouchableOpacity onPress={addCustom}>
              <Ionicons name="checkmark-circle" size={16} color={C.primary} />
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

// ── ReturnRow ─────────────────────────────────────────────────────────────────

function ReturnRow({ value, onChange }: { value: Draft['wouldReturn']; onChange: (v: Draft['wouldReturn']) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 7 }}>
      {RETURN_OPTS.map(o => {
        const on = value === o.id;
        const textCol = on ? '#FFFBF1' : C.inkSoft;
        return (
          <TouchableOpacity
            key={o.id} onPress={() => onChange(on ? null : o.id as Draft['wouldReturn'])} activeOpacity={0.7}
            style={[styles.returnBtn, { backgroundColor: on ? o.color : C.surfaceAlt, borderColor: on ? o.color : C.hairline }]}
          >
            <Ionicons name={on ? o.iconFilled : o.icon} size={14} color={textCol} />
            <Text style={[styles.returnBtnText, { color: textCol }]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── VisibilityPicker ──────────────────────────────────────────────────────────

const VIS_OPTS: Array<{ v: Draft['visibility']; icon: string; desc: string }> = [
  { v: 'Private', icon: 'lock-closed',  desc: 'Only you. Not posted to the feed.' },
  { v: 'Friends', icon: 'people',       desc: 'Posted to your friends\' feeds.' },
  { v: 'Public',  icon: 'globe',        desc: 'Posted publicly for all explorers.' },
];

function VisibilityPicker({ value, onChange }: { value: Draft['visibility']; onChange: (v: Draft['visibility']) => void }) {
  return (
    <View style={{ gap: 8 }}>
      {VIS_OPTS.map(o => {
        const on = value === o.v;
        return (
          <TouchableOpacity
            key={o.v} onPress={() => onChange(o.v)} activeOpacity={0.7}
            style={[styles.visRow, { borderColor: on ? C.primary : 'transparent', backgroundColor: on ? C.surface : C.surfaceAlt }]}
          >
            <View style={[styles.visIcon, { backgroundColor: on ? C.primary : C.surface, borderColor: on ? C.primary : C.hairline }]}>
              <Ionicons name={o.icon as any} size={17} color={on ? '#FFFBF1' : C.inkSoft} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700', fontSize: 14, color: C.ink }}>{o.v}</Text>
              <Text style={{ fontSize: 11.5, color: C.inkMute, marginTop: 1 }}>{o.desc}</Text>
            </View>
            <View style={[styles.visRadio, { borderColor: on ? C.primary : C.hairline, backgroundColor: on ? C.primary : 'transparent' }]}>
              {on && <Ionicons name="checkmark" size={11} color="#FFFBF1" />}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── CompanionSearch ───────────────────────────────────────────────────────────

function CompanionSearch({ companions, companionObjs, onChange, token }: {
  companions: string[];
  companionObjs: CompanionUser[];
  onChange: (ids: string[], objs: CompanionUser[]) => void;
  token: string | null;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<CompanionUser[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggle = (u: CompanionUser) => {
    if (companions.includes(u.clerk_user_id)) {
      onChange(companions.filter(id => id !== u.clerk_user_id), companionObjs.filter(o => o.clerk_user_id !== u.clerk_user_id));
    } else {
      const newObjs = companionObjs.find(o => o.clerk_user_id === u.clerk_user_id) ? companionObjs : [...companionObjs, u];
      onChange([...companions, u.clerk_user_id], newObjs);
    }
  };

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!q.trim()) { setResults([]); return; }
    timer.current = setTimeout(() => {
      fetch(`${BASE}/api/users?search=${encodeURIComponent(q)}&limit=10`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then(r => r.ok ? r.json() : [])
        .then(setResults)
        .catch(() => {});
    }, 250);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q, token]);

  const tagged = companionObjs.filter(u => companions.includes(u.clerk_user_id));

  return (
    <View>
      {tagged.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {tagged.map(u => {
            const name = (u.display_name ?? u.username).split(' ')[0];
            return (
              <View key={u.clerk_user_id} style={styles.companionChip}>
                {u.avatar_url
                  ? <Image source={{ uri: u.avatar_url }} style={{ width: 22, height: 22, borderRadius: 11 }} />
                  : <View style={styles.companionInitial}><Text style={{ color: '#FFFBF1', fontSize: 10, fontWeight: '700' }}>{name[0]}</Text></View>
                }
                <Text style={{ fontSize: 12.5, fontWeight: '600', color: '#FFFBF1' }}>{name}</Text>
                <TouchableOpacity onPress={() => toggle(u)} hitSlop={6}>
                  <Ionicons name="close" size={13} color="rgba(255,251,241,0.8)" />
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      )}

      <View style={styles.searchRow}>
        <Ionicons name="search" size={14} color={C.inkMute} />
        <TextInput
          value={q} onChangeText={setQ} placeholder="Search for other users…"
          placeholderTextColor={C.inkMute} style={styles.searchInput}
          autoCorrect={false} autoCapitalize="none"
        />
        {q.length > 0 && (
          <TouchableOpacity onPress={() => { setQ(''); setResults([]); }}>
            <Ionicons name="close-circle" size={16} color={C.inkMute} />
          </TouchableOpacity>
        )}
      </View>

      {results.length > 0 && (
        <View style={styles.resultsBox}>
          {results.map((u, idx) => {
            const on = companions.includes(u.clerk_user_id);
            const name = u.display_name ?? u.username;
            return (
              <TouchableOpacity
                key={u.clerk_user_id} onPress={() => toggle(u)} activeOpacity={0.7}
                style={[styles.resultRow, { backgroundColor: on ? 'rgba(31,61,46,0.06)' : 'transparent',
                  borderBottomWidth: idx < results.length - 1 ? 0.5 : 0, borderBottomColor: C.hairlineSoft }]}
              >
                {u.avatar_url
                  ? <Image source={{ uri: u.avatar_url }} style={{ width: 32, height: 32, borderRadius: 16 }} />
                  : <View style={[styles.companionInitial, { width: 32, height: 32, borderRadius: 16 }]}><Text style={{ color: '#FFFBF1', fontWeight: '700' }}>{name[0]}</Text></View>
                }
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '600', fontSize: 13.5, color: C.ink }}>{name}</Text>
                  <Text style={{ fontSize: 11.5, color: C.inkMute }}>@{u.username}</Text>
                </View>
                {on && <Ionicons name="checkmark-circle" size={18} color={C.primary} />}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
      {q.trim().length > 0 && results.length === 0 && (
        <Text style={{ fontSize: 13, color: C.inkMute, paddingHorizontal: 4, paddingTop: 6 }}>No users found</Text>
      )}
    </View>
  );
}

// ── PhotoStrip ────────────────────────────────────────────────────────────────

function PhotoStrip({ token, photos, cover, onAdd, onRemove, onSetCover }: {
  token: string; photos: string[]; cover: string | null;
  onAdd: (urls: string[]) => void;
  onRemove: (url: string) => void;
  onSetCover: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);

  const pickAndUpload = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.85,
      selectionLimit: Math.max(1, 10 - photos.length),
    });
    if (result.canceled || !result.assets?.length) return;

    setUploading(true);
    const urls: string[] = [];
    for (const asset of result.assets) {
      try {
        const presignRes = await apiFetch<{ uploadUrl: string; publicUrl: string }>(
          '/api/upload/presign', token,
          {
            method: 'POST',
            body: JSON.stringify({
              filename: asset.fileName ?? 'photo.jpg',
              contentType: asset.mimeType ?? 'image/jpeg',
              size: asset.fileSize ?? 0,
            }),
          }
        );
        const fileRes = await fetch(asset.uri);
        const blob = await fileRes.blob();
        await fetch(presignRes.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': asset.mimeType ?? 'image/jpeg' },
          body: blob,
        });
        urls.push(presignRes.publicUrl);
      } catch (e) {
        console.warn('Photo upload failed:', e);
      }
    }
    if (urls.length) onAdd(urls);
    setUploading(false);
  };

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
        {photos.map((url, idx) => {
          const isCover = cover === url;
          return (
            <View key={url} style={styles.photoThumb}>
              <Image source={{ uri: url }} style={StyleSheet.absoluteFill as any} resizeMode="cover" />
              <TouchableOpacity style={styles.photoCoverBtn} onPress={() => onSetCover(url)}>
                <Ionicons name={isCover ? 'star' : 'star-outline'} size={11} color={isCover ? C.accent : '#FFFBF1'} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.photoRemoveBtn} onPress={() => onRemove(url)}>
                <Ionicons name="close" size={11} color="#FFFBF1" />
              </TouchableOpacity>
              {isCover && (
                <View style={styles.coverBadge}>
                  <Text style={{ fontSize: 7.5, fontWeight: '700', color: '#FFFBF1', letterSpacing: 0.5 }}>COVER</Text>
                </View>
              )}
              <View style={styles.photoIndex}>
                <Text style={{ fontSize: 9, fontWeight: '800', color: '#FFFBF1' }}>{idx + 1}</Text>
              </View>
            </View>
          );
        })}
        {photos.length < 10 && (
          <TouchableOpacity onPress={pickAndUpload} disabled={uploading} style={styles.photoAdd} activeOpacity={0.7}>
            <Ionicons name={uploading ? 'hourglass' : 'add'} size={24} color={C.primary} />
            <Text style={{ fontSize: 10.5, fontWeight: '600', color: C.primary, marginTop: 3 }}>
              {uploading ? 'Uploading…' : 'Add photos'}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

// ── ParkPickerSheet ───────────────────────────────────────────────────────────

function ParkPickerSheet({ visible, parks, selected, onClose, onPick }: {
  visible: boolean; parks: ParkInfo[]; selected: string;
  onClose: () => void; onPick: (code: string) => void;
}) {
  const [q, setQ] = useState('');
  const insets = useSafeAreaInsets();

  const filtered = (q.trim()
    ? parks.filter(p => p.name.toLowerCase().includes(q.toLowerCase()) || p.states.toLowerCase().includes(q.toLowerCase()))
    : parks
  ).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.pickerContainer, { paddingTop: insets.top + 8, paddingBottom: insets.bottom }]}>
        {/* Header */}
        <View style={styles.pickerHeader}>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ fontSize: 17, color: C.inkMute }}>Cancel</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 17, fontWeight: '700', color: C.ink }}>Which park?</Text>
          <View style={{ width: 64 }} />
        </View>

        {/* Search */}
        <View style={styles.pickerSearch}>
          <Ionicons name="search" size={15} color={C.inkMute} />
          <TextInput
            value={q} onChangeText={setQ} placeholder="Search 63 parks…"
            placeholderTextColor={C.inkMute} style={{ flex: 1, fontSize: 15, color: C.ink }}
            autoFocus autoCorrect={false}
          />
          {q.length > 0 && (
            <TouchableOpacity onPress={() => setQ('')}>
              <Ionicons name="close-circle" size={17} color={C.inkMute} />
            </TouchableOpacity>
          )}
        </View>

        {/* List */}
        <FlatList
          data={filtered}
          keyExtractor={p => p.park_code}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 20 }}
          renderItem={({ item: p }) => {
            const on = selected === p.park_code;
            const state2 = p.states.split(',')[0].trim().slice(0, 2).toUpperCase();
            return (
              <TouchableOpacity onPress={() => { onPick(p.park_code); onClose(); }} activeOpacity={0.7}
                style={[styles.parkRow, { backgroundColor: on ? C.surfaceAlt : 'transparent' }]}>
                <View style={styles.parkBadge}>
                  <Text style={{ color: '#FFFBF1', fontWeight: '800', fontSize: 11 }}>{state2}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', fontSize: 13.5, color: C.ink }}>{p.name}</Text>
                  <Text style={{ fontSize: 11.5, color: C.inkMute }}>{fullStateName(p.states.split(',')[0].trim())}</Text>
                </View>
                {on && <Ionicons name="checkmark" size={17} color={C.primary} />}
              </TouchableOpacity>
            );
          }}
        />
      </View>
    </Modal>
  );
}

// ── DateRow + DatePickerSheet ─────────────────────────────────────────────────

function DatePickerSheet({ visible, label, value, maxDate, onDone, onClear, onClose }: {
  visible: boolean; label: string; value: Date | null; maxDate: Date;
  onDone: (d: Date) => void; onClear: () => void; onClose: () => void;
}) {
  const [current, setCurrent] = useState(value ?? new Date());
  useEffect(() => { if (visible) setCurrent(value ?? new Date()); }, [visible, value]);

  if (Platform.OS === 'android') {
    if (!visible) return null;
    return (
      <DateTimePicker
        value={current} mode="date" display="default" maximumDate={maxDate}
        onChange={(e, d) => { if (e.type === 'set' && d) onDone(d); else onClose(); }}
      />
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.dateBackdrop} onPress={onClose} />
      <View style={styles.dateSheet}>
        <View style={styles.dateSheetHeader}>
          <TouchableOpacity onPress={() => { onClear(); onClose(); }}>
            <Text style={{ fontSize: 16, color: C.inkMute }}>Clear</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 16, fontWeight: '700', color: C.ink }}>{label}</Text>
          <TouchableOpacity onPress={() => { onDone(current); onClose(); }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: C.primary }}>Done</Text>
          </TouchableOpacity>
        </View>
        <DateTimePicker
          value={current} mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          maximumDate={maxDate}
          onChange={(_, d) => { if (d) setCurrent(d); }}
          style={{ width: '100%' }}
        />
      </View>
    </Modal>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ kicker, title, hint, children }: {
  kicker?: string; title?: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <View style={{ marginBottom: 24 }}>
      {(kicker || title || hint) && (
        <View style={{ marginBottom: 10 }}>
          {kicker && <Text style={styles.kicker}>{kicker}</Text>}
          {title  && <Text style={styles.sectionTitle}>{title}</Text>}
          {hint   && <Text style={{ fontSize: 12.5, color: C.inkMute, marginTop: 3, lineHeight: 17 }}>{hint}</Text>}
        </View>
      )}
      {children}
    </View>
  );
}

// ── Step screens ──────────────────────────────────────────────────────────────

function StepWhere({ draft, set, parks, onPickPark }: {
  draft: Draft; set: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
  parks: ParkInfo[]; onPickPark: () => void;
}) {
  const park = parks.find(p => p.park_code === draft.parkCode);
  const [showStart, setShowStart] = useState(false);
  const [showEnd,   setShowEnd]   = useState(false);
  const today = new Date();

  const days = dayCount(draft.startDate, draft.endDate);

  return (
    <View>
      <DatePickerSheet
        visible={showStart} label="Start date" value={draft.startDate} maxDate={today}
        onDone={d => { set('startDate', d); if (draft.endDate && d > draft.endDate) set('endDate', null); }}
        onClear={() => { set('startDate', null); set('endDate', null); }}
        onClose={() => setShowStart(false)}
      />
      <DatePickerSheet
        visible={showEnd} label="End date" value={draft.endDate} maxDate={today}
        onDone={d => set('endDate', d)} onClear={() => set('endDate', null)}
        onClose={() => setShowEnd(false)}
      />

      <Section kicker="01" title="Where & when">
        {/* Park picker */}
        <TouchableOpacity onPress={onPickPark} activeOpacity={0.7} style={[
          styles.parkBanner,
          { backgroundColor: park ? C.primary : C.surfaceAlt, borderStyle: park ? 'solid' : 'dashed' },
        ]}>
          {park ? (
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View>
                <Text style={{ fontSize: 9, fontWeight: '600', color: 'rgba(255,251,241,0.8)', letterSpacing: 1.2 }}>NATIONAL PARK</Text>
                <Text style={{ fontSize: 19, fontWeight: '800', color: '#FFFBF1', letterSpacing: -0.3, marginTop: 2 }}>{park.name}</Text>
                <Text style={{ fontSize: 12, color: 'rgba(255,251,241,0.8)', marginTop: 1 }}>{fullStateName(park.states.split(',')[0].trim())}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,251,241,0.92)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 100 }}>
                <Ionicons name="pencil" size={11} color={C.ink} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: C.ink }}>Change</Text>
              </View>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="search" size={20} color="#FFFBF1" />
              </View>
              <View>
                <Text style={{ fontWeight: '800', fontSize: 16, color: C.ink, letterSpacing: -0.2 }}>Select a park</Text>
                <Text style={{ fontSize: 12.5, color: C.inkMute, marginTop: 2 }}>Search all 63 national parks</Text>
              </View>
            </View>
          )}
        </TouchableOpacity>
      </Section>

      {/* Rest locked until park selected */}
      <View style={{ opacity: park ? 1 : 0.35, pointerEvents: park ? 'auto' : 'none' } as any}>
        <Section title="Trip title">
          <TextInput
            value={draft.title} onChangeText={v => set('title', v.slice(0, 80))}
            placeholder="Give this trip a name" placeholderTextColor={C.inkMute}
            style={styles.textField}
          />
        </Section>

        <Section title="Dates">
          <View style={styles.card}>
            <TouchableOpacity
              onPress={() => setShowStart(true)} activeOpacity={0.7}
              style={[styles.dateRow, { borderBottomWidth: 0.5, borderBottomColor: C.hairlineSoft }]}
            >
              <View style={styles.dateIcon}>
                <Ionicons name="calendar" size={16} color={C.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.dateLabel}>Start date *</Text>
                <Text style={[styles.dateValue, { color: draft.startDate ? C.ink : C.inkMute }]}>
                  {draft.startDate ? fmtDate(draft.startDate) : 'Pick a date'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={C.inkMute} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowEnd(true)} activeOpacity={0.7}
              disabled={!draft.startDate}
              style={[styles.dateRow, { opacity: draft.startDate ? 1 : 0.4 }]}
            >
              <View style={styles.dateIcon}>
                <Ionicons name="calendar-outline" size={16} color={C.inkMute} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.dateLabel}>End date</Text>
                <Text style={[styles.dateValue, { color: draft.endDate ? C.ink : C.inkMute }]}>
                  {draft.endDate ? fmtDate(draft.endDate) : 'Optional multi-day trip'}
                </Text>
              </View>
              {draft.endDate
                ? <TouchableOpacity onPress={() => set('endDate', null)} hitSlop={8}><Ionicons name="close-circle" size={16} color={C.inkMute} /></TouchableOpacity>
                : <Ionicons name="chevron-forward" size={14} color={C.inkMute} />
              }
            </TouchableOpacity>
          </View>
          {days > 1 && (
            <Text style={{ fontSize: 11.5, color: C.accent, fontWeight: '700', marginTop: 6 }}>{days} day trip</Text>
          )}
        </Section>
      </View>
    </View>
  );
}

function StepVisit({ draft, set }: { draft: Draft; set: <K extends keyof Draft>(k: K, v: Draft[K]) => void }) {
  return (
    <View>
      <Section kicker="02" title="How was it?">
        <View style={styles.card}>
          <StarRating value={draft.rating} onChange={v => set('rating', v)} />
        </View>
      </Section>

      <Section title="Conditions">
        <View style={styles.card}>
          <View style={{ marginBottom: 14, paddingBottom: 14, borderBottomWidth: 0.5, borderBottomColor: C.hairlineSoft }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Ionicons name="people-outline" size={15} color={C.inkMute} />
              <Text style={{ fontWeight: '700', fontSize: 13.5, color: C.ink }}>Crowd level</Text>
            </View>
            <ScaleRow value={draft.crowd} onChange={v => set('crowd', v)} labels={CROWD_LABELS} />
          </View>
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Ionicons name="walk-outline" size={15} color={C.inkMute} />
              <Text style={{ fontWeight: '700', fontSize: 13.5, color: C.ink }}>Trail difficulty</Text>
            </View>
            <ScaleRow value={draft.difficulty} onChange={v => set('difficulty', v)} labels={DIFF_LABELS} />
          </View>
        </View>
      </Section>

      <Section title="Weather">
        <View style={styles.card}>
          <WeatherGrid value={draft.weather} onChange={v => set('weather', v)} />
        </View>
      </Section>

      <Section title="Would you go back?">
        <ReturnRow value={draft.wouldReturn} onChange={v => set('wouldReturn', v)} />
      </Section>
    </View>
  );
}

function StepJournal({ draft, set, token }: {
  draft: Draft; set: <K extends keyof Draft>(k: K, v: Draft[K]) => void; token: string;
}) {
  return (
    <View>
      <Section kicker="03" title="Journal & photos">
        <View style={[styles.textFieldWrap, { marginBottom: 0 }]}>
          <TextInput
            value={draft.highlight} onChangeText={v => set('highlight', v.slice(0, 90))}
            placeholder="Highlight — the one moment you'll remember" placeholderTextColor={C.inkMute}
            style={[styles.textField, { marginBottom: 0 }]}
          />
          <Text style={styles.charCount}>{draft.highlight.length}/90</Text>
        </View>
      </Section>

      <Section title="Notes">
        <View style={styles.textFieldWrap}>
          <TextInput
            value={draft.notes} onChangeText={v => set('notes', v.slice(0, 2000))}
            placeholder="What did you see, hear, feel?" placeholderTextColor={C.inkMute}
            multiline style={[styles.textField, styles.textArea]}
          />
          <Text style={[styles.charCount, { bottom: 8 }]}>{draft.notes.length}/2000</Text>
        </View>
      </Section>

      <Section title="Activities">
        <ActivityChips value={draft.activities} onChange={v => set('activities', v)} />
      </Section>

      <Section title="Who came along?">
        <CompanionSearch
          companions={draft.companions} companionObjs={draft.companionObjs}
          onChange={(ids, objs) => { set('companions', ids); set('companionObjs', objs); }}
          token={token}
        />
      </Section>

      <Section title="Photos">
        <PhotoStrip
          token={token} photos={draft.photos} cover={draft.cover}
          onAdd={urls => {
            const next = [...draft.photos, ...urls].slice(0, 10);
            set('photos', next);
            if (!draft.cover && next.length > 0) set('cover', next[0]);
          }}
          onRemove={url => {
            const next = draft.photos.filter(p => p !== url);
            set('photos', next);
            if (draft.cover === url) set('cover', next[0] ?? null);
          }}
          onSetCover={url => set('cover', url)}
        />
      </Section>
    </View>
  );
}

function StepShare({ draft, set }: { draft: Draft; set: <K extends keyof Draft>(k: K, v: Draft[K]) => void }) {
  return (
    <View>
      <Section title="Add a caption">
        <View style={styles.textFieldWrap}>
          <TextInput
            value={draft.caption} onChangeText={v => set('caption', v.slice(0, 500))}
            placeholder="Share what made this trip special…" placeholderTextColor={C.inkMute}
            multiline style={[styles.textField, styles.textArea]}
          />
          <Text style={[styles.charCount, { bottom: 8 }]}>{draft.caption.length}/500</Text>
        </View>
      </Section>

      <Section title="Who can see this?">
        <VisibilityPicker value={draft.visibility} onChange={v => set('visibility', v)} />
      </Section>
    </View>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

export default function LogVisitModal() {
  const router   = useRouter();
  const { getToken } = useAuth();
  const { user } = useUser();
  const insets   = useSafeAreaInsets();

  const [token,      setToken]      = useState<string | null>(null);
  const [draft,      setDraftState] = useState<Draft>(makeBlank);
  const [step,       setStep]       = useState(0);
  const [parks,      setParks]      = useState<ParkInfo[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const set = useCallback(<K extends keyof Draft>(k: K, v: Draft[K]) => {
    setDraftState(prev => ({ ...prev, [k]: v }));
  }, []);

  useEffect(() => {
    getToken().then(tok => {
      setToken(tok);
      if (tok) {
        apiFetch<ParkInfo[]>('/api/parks', tok).then(setParks).catch(() => {});
      }
    });
  }, [getToken]);

  const canContinue = step === 0 ? !!draft.parkCode && !!draft.startDate : true;
  const isLast = step === STEPS.length - 1;

  const goNext = () => {
    if (!canContinue) return;
    const next = Math.min(step + 1, STEPS.length - 1);
    setStep(next);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };
  const goBack = () => {
    if (step === 0) return;
    setStep(s => s - 1);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  const handleCancel = () => {
    const dirty = !!draft.parkCode || !!draft.startDate || !!draft.title || draft.photos.length > 0;
    if (dirty) {
      Alert.alert('Discard changes?', 'Your entry hasn\'t been saved.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => router.back() },
      ]);
    } else {
      router.back();
    }
  };

  const handleSubmit = async () => {
    if (!draft.parkCode || !draft.startDate || !token) return;
    setSubmitting(true);
    try {
      const visitRes = await apiFetch<{ visit: { id: number } }>('/api/visits', token, {
        method: 'POST',
        body: JSON.stringify({
          park_code:          draft.parkCode,
          visited_date:       draft.startDate.toISOString(),
          end_date:           draft.endDate?.toISOString() ?? null,
          rating:             draft.rating  > 0 ? draft.rating  : null,
          crowd:              draft.crowd   > 0 ? draft.crowd   : null,
          difficulty:         draft.difficulty > 0 ? draft.difficulty : null,
          weather_conditions: draft.weather.length > 0 ? draft.weather : null,
          activities:         draft.activities.length > 0 ? draft.activities : null,
          companions:         draft.companions.length > 0 ? draft.companions : null,
          would_return:       draft.wouldReturn ?? null,
          highlight:          draft.highlight || null,
          title:              draft.title || null,
          notes:              draft.notes || null,
          photos:             draft.photos.length > 0 ? draft.photos : null,
          cover_photo:        draft.cover ?? null,
          visibility:         draft.visibility.toLowerCase(),
        }),
      });

      if (draft.visibility !== 'Private' && visitRes.visit?.id) {
        await apiFetch('/api/posts', token, {
          method: 'POST',
          body: JSON.stringify({
            caption:   draft.caption || null,
            photos:    draft.photos.length > 0 ? draft.photos : null,
            park_code: draft.parkCode,
            visit_id:  visitRes.visit.id,
          }),
        });
      }

      router.back();
    } catch (e) {
      Alert.alert('Something went wrong', 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <Stack.Screen
        options={{
          title: STEPS[step],
          headerLeft: () => (
            <TouchableOpacity onPress={handleCancel} hitSlop={8}>
              <Text style={{ fontSize: 17, color: C.inkMute }}>Cancel</Text>
            </TouchableOpacity>
          ),
          headerRight: () => (
            <TouchableOpacity
              onPress={isLast ? handleSubmit : goNext}
              disabled={!canContinue || submitting}
              hitSlop={8}
            >
              <Text style={{ fontSize: 17, fontWeight: '600', color: canContinue && !submitting ? C.primary : C.inkMute }}>
                {isLast ? (submitting ? 'Saving…' : 'Save') : 'Next'}
              </Text>
            </TouchableOpacity>
          ),
        }}
      />

      {/* Step indicator */}
      <View style={styles.stepBar}>
        {STEPS.map((_, i) => (
          <View
            key={i}
            style={[styles.stepDot, {
              flex: i === step ? 2 : 1,
              backgroundColor: i <= step ? C.primary : C.hairline,
            }]}
          />
        ))}
      </View>

      {/* Step kicker */}
      <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4 }}>
        <Text style={styles.kicker}>STEP {String(step + 1).padStart(2, '0')} OF {String(STEPS.length).padStart(2, '0')} · {STEPS[step].toUpperCase()}</Text>
      </View>

      {/* Content */}
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {step === 0 && <StepWhere draft={draft} set={set} parks={parks} onPickPark={() => setShowPicker(true)} />}
        {step === 1 && <StepVisit draft={draft} set={set} />}
        {step === 2 && token && <StepJournal draft={draft} set={set} token={token} />}
        {step === 3 && <StepShare draft={draft} set={set} />}
      </ScrollView>

      {/* Footer nav */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        {step > 0 ? (
          <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={15} color={C.ink} />
            <Text style={{ fontSize: 14, fontWeight: '700', color: C.ink }}>Back</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 80 }} />
        )}

        <View style={{ flexDirection: 'row', gap: 5 }}>
          {STEPS.map((_, i) => (
            <View key={i} style={[styles.progDot, {
              width: i === step ? 18 : 6,
              backgroundColor: i <= step ? C.primary : C.hairline,
            }]} />
          ))}
        </View>

        <TouchableOpacity
          onPress={isLast ? handleSubmit : goNext}
          disabled={!canContinue || submitting}
          style={[styles.nextBtn, { backgroundColor: canContinue ? C.primary : C.surfaceAlt }]}
          activeOpacity={0.8}
        >
          <Text style={{ fontSize: 14, fontWeight: '800', color: canContinue ? '#FFFBF1' : C.inkMute }}>
            {isLast ? (submitting ? 'Saving…' : 'Post entry') : 'Continue'}
          </Text>
          {!isLast && <Ionicons name="arrow-forward" size={14} color={canContinue ? '#FFFBF1' : C.inkMute} />}
        </TouchableOpacity>
      </View>

      <ParkPickerSheet
        visible={showPicker} parks={parks} selected={draft.parkCode}
        onClose={() => setShowPicker(false)} onPick={code => set('parkCode', code)}
      />
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Step bar
  stepBar: {
    flexDirection: 'row', gap: 4, paddingHorizontal: 20, paddingTop: 8,
  },
  stepDot: {
    height: 4, borderRadius: 2,
  },

  // Typography
  kicker: {
    fontSize: 9.5, fontWeight: '600', color: C.inkMute, letterSpacing: 1.4,
  },
  sectionTitle: {
    fontSize: 19, fontWeight: '800', color: C.ink, letterSpacing: -0.3, marginTop: 2,
  },

  // Card wrapper
  card: {
    backgroundColor: C.surface, borderRadius: 18, borderWidth: 0.5, borderColor: C.hairline, padding: 14,
  },

  // Star rating
  starHalf: {
    flex: 1, height: STAR_SIZE,
  },

  // Scale buttons
  scaleBtn: {
    flex: 1, paddingVertical: 9, paddingHorizontal: 2,
    borderRadius: 10, borderWidth: 0.5,
    alignItems: 'center', justifyContent: 'center',
  },
  scaleBtnText: {
    fontSize: 11, fontWeight: '600',
  },

  // Weather
  weatherChip: {
    width: '22.5%', paddingVertical: 10, borderRadius: 13, borderWidth: 0.5,
    alignItems: 'center', gap: 4,
  },
  weatherLabel: {
    fontSize: 11, fontWeight: '600',
  },

  // Activity
  activityChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 13, paddingVertical: 7, borderRadius: 100, borderWidth: 0.5,
  },
  activityChipText: {
    fontSize: 12.5, fontWeight: '600', textTransform: 'capitalize',
  },

  // Would return
  returnBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 0.5,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
  },
  returnBtnText: {
    fontSize: 12.5, fontWeight: '700',
  },

  // Visibility
  visRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13,
    borderRadius: 14, borderWidth: 1.5,
  },
  visIcon: {
    width: 38, height: 38, borderRadius: 11, borderWidth: 0.5,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  visRadio: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },

  // Companion
  companionChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingLeft: 4, paddingRight: 8, paddingVertical: 4, borderRadius: 100,
    backgroundColor: C.primary,
  },
  companionInitial: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(255,251,241,0.2)', alignItems: 'center', justifyContent: 'center',
  },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.surface, borderRadius: 12, padding: 10,
    borderWidth: 0.5, borderColor: C.hairline, marginBottom: 6,
  },
  searchInput: {
    flex: 1, fontSize: 13.5, color: C.ink, padding: 0,
  },
  resultsBox: {
    backgroundColor: C.surface, borderRadius: 12,
    borderWidth: 0.5, borderColor: C.hairline, overflow: 'hidden',
  },
  resultRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10,
  },

  // Photos
  photoThumb: {
    width: 80, height: 80, borderRadius: 12, overflow: 'hidden',
    backgroundColor: C.surfaceAlt,
  },
  photoCoverBtn: {
    position: 'absolute', top: 5, left: 5,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(20,17,12,0.55)', alignItems: 'center', justifyContent: 'center',
  },
  photoRemoveBtn: {
    position: 'absolute', top: 5, right: 5,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(20,17,12,0.55)', alignItems: 'center', justifyContent: 'center',
  },
  coverBadge: {
    position: 'absolute', bottom: 5, left: 5,
    backgroundColor: 'rgba(20,17,12,0.6)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 100,
  },
  photoIndex: {
    position: 'absolute', bottom: 5, right: 5,
    backgroundColor: 'rgba(20,17,12,0.55)', width: 17, height: 17, borderRadius: 8.5,
    alignItems: 'center', justifyContent: 'center',
  },
  photoAdd: {
    width: 80, height: 80, borderRadius: 12,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.hairline,
    backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center',
  },

  // Park picker
  pickerContainer: {
    flex: 1, backgroundColor: C.surface,
  },
  pickerHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingBottom: 14,
    borderBottomWidth: 0.5, borderBottomColor: C.hairline,
  },
  pickerSearch: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    margin: 12, backgroundColor: C.surfaceAlt, borderRadius: 12,
    padding: 10, borderWidth: 0.5, borderColor: C.hairline,
  },
  parkRow: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    padding: 10, borderRadius: 10,
  },
  parkBadge: {
    width: 34, height: 34, borderRadius: 9,
    backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },

  // Date picker
  dateBackdrop: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)',
  },
  dateSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: C.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18,
    borderWidth: 0.5, borderColor: C.hairline,
    paddingBottom: 40,
  },
  dateSheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 0.5, borderBottomColor: C.hairline,
  },

  // Park banner
  parkBanner: {
    borderRadius: 16, borderWidth: 1.5, borderColor: C.hairline,
    padding: 16, marginBottom: 0,
  },

  // Text fields
  textField: {
    backgroundColor: C.surface, borderRadius: 14, padding: 13,
    fontSize: 15, color: C.ink, fontWeight: '600',
    borderWidth: 0.5, borderColor: C.hairline,
  },
  textArea: {
    minHeight: 120, textAlignVertical: 'top', fontWeight: '400',
  },
  textFieldWrap: {
    position: 'relative',
  },
  charCount: {
    position: 'absolute', right: 10, top: 8,
    fontSize: 9.5, color: C.inkMute, fontWeight: '600', letterSpacing: 0.5,
  },

  // Date rows
  dateRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10,
  },
  dateIcon: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  dateLabel: {
    fontSize: 11.5, fontWeight: '600', color: C.inkMute, letterSpacing: 0.3,
  },
  dateValue: {
    fontSize: 15, fontWeight: '600', marginTop: 1,
  },

  // Footer
  footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 12,
    borderTopWidth: 0.5, borderTopColor: C.hairlineSoft,
    backgroundColor: C.bg,
  },
  backBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
    backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.hairline,
    width: 80, justifyContent: 'center',
  },
  progDot: {
    height: 6, borderRadius: 3,
  },
  nextBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 18, paddingVertical: 11, borderRadius: 10,
    width: 120, justifyContent: 'center',
    shadowColor: '#1F3D2E', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
});
