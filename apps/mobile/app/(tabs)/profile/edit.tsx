import {
  ActivityIndicator, Alert, Image, KeyboardAvoidingView,
  Platform, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { useState, useEffect, useMemo } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { usePalette, PALETTES } from '@/lib/palette';
import * as ImagePicker from 'expo-image-picker';

// ── Design tokens ─────────────────────────────────────────────────────────────

const BASE_C = {
  bg:       '#F2EBDB',
  surface:  '#FFFBF1',
  surfaceAlt:'#F7F0DE',
  ink:      '#1B1A16',
  inkSoft:  '#3C3A33',
  inkMute:  '#7A746A',
  hairline: 'rgba(27,26,22,0.10)',
  error:    '#C04040',
};

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

// ── Field ─────────────────────────────────────────────────────────────────────

const fieldStyles = StyleSheet.create({
  field:      { gap: 5 },
  fieldLabel: { fontWeight: '600', fontSize: 12, color: BASE_C.ink, letterSpacing: 0.2 },
  fieldError: { fontSize: 11, color: BASE_C.error },
});

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <View style={fieldStyles.field}>
      <Text style={fieldStyles.fieldLabel}>{label}</Text>
      {children}
      {error ? <Text style={fieldStyles.fieldError}>{error}</Text> : null}
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function EditProfileScreen() {
  const router = useRouter();
  const { getToken, signOut } = useAuth();
  const { user } = useUser();
  const { paletteId, colors: paletteColors, setPalette } = usePalette();
  const C = useMemo(
    () => ({ ...BASE_C, primary: paletteColors.primary, accent: paletteColors.accent }),
    [paletteColors],
  );
  const styles = useMemo(() => makeStyles(C), [C]);

  const [firstName,     setFirstName]     = useState('');
  const [lastName,      setLastName]      = useState('');
  const [username,      setUsername]      = useState('');
  const [bio,           setBio]           = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile,    setAvatarFile]    = useState<{ uri: string; base64: string | null | undefined } | null>(null);
  const [saving,        setSaving]        = useState(false);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState('');
  const [usernameError, setUsernameError] = useState('');

  // Load current values
  useEffect(() => {
    if (!user) return;
    setFirstName(user.firstName ?? '');
    setLastName(user.lastName ?? '');
    setUsername(user.username ?? '');
    setAvatarPreview(user.imageUrl ?? null);

    getToken().then(tok => {
      if (!tok) { setLoading(false); return; }
      fetch(`${BASE}/api/profile`, { headers: { Authorization: `Bearer ${tok}` } })
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data) setBio(data.bio ?? ''); })
        .catch(() => {})
        .finally(() => setLoading(false));
    });
  }, [user]);

  const pickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo access to change your avatar.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setAvatarPreview(asset.uri);
      setAvatarFile({ uri: asset.uri, base64: asset.base64 });
    }
  };

  const validateUsername = (val: string) => {
    if (val.length < 3) return 'Username must be at least 3 characters';
    return '';
  };

  const handleSave = async () => {
    if (!user) return;
    const uErr = validateUsername(username.trim());
    if (uErr) { setUsernameError(uErr); return; }
    setError('');
    setUsernameError('');
    setSaving(true);

    try {
      // Upload avatar via Clerk
      if (avatarFile?.base64) {
        try {
          const blob = await fetch(avatarFile.uri).then(r => r.blob());
          await user.setProfileImage({ file: blob as File });
        } catch { /* non-fatal */ }
      }

      // Update name via Clerk
      try {
        await user.update({ firstName: firstName.trim(), lastName: lastName.trim() });
      } catch { /* non-fatal */ }

      // Update username + bio via API
      const tok = await getToken();
      if (!tok) throw new Error('Not authenticated');
      const res = await fetch(`${BASE}/api/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({
          username: username.trim().toLowerCase(),
          display_name: [firstName.trim(), lastName.trim()].filter(Boolean).join(' ') || null,
          bio: bio.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        const msg: string = data.error ?? 'Failed to save';
        if (msg.toLowerCase().includes('username')) {
          setUsernameError(msg);
        } else {
          setError(msg);
        }
        return;
      }

      router.back();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  const initials = ([firstName[0], lastName[0]].filter(Boolean).join('').toUpperCase()
    || user?.username?.[0]?.toUpperCase()) ?? '?';

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={C.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Avatar */}
          <View style={styles.avatarRow}>
            <TouchableOpacity onPress={pickAvatar} activeOpacity={0.8}>
              <View style={styles.avatarWrap}>
                {avatarPreview ? (
                  <Image source={{ uri: avatarPreview }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Text style={styles.avatarInitials}>{initials}</Text>
                  </View>
                )}
                <View style={styles.cameraButton}>
                  <Ionicons name="camera" size={13} color="#FFFBF1" />
                </View>
              </View>
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.avatarHint}>Tap to change photo</Text>
              <Text style={styles.avatarSub}>Square photos work best</Text>
            </View>
          </View>

          {/* Name row */}
          <View style={styles.nameRow}>
            <View style={{ flex: 1 }}>
              <Field label="First name">
                <TextInput
                  style={styles.input}
                  value={firstName}
                  onChangeText={setFirstName}
                  maxLength={50}
                  placeholder="First"
                  placeholderTextColor={C.inkMute}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Last name">
                <TextInput
                  style={styles.input}
                  value={lastName}
                  onChangeText={setLastName}
                  maxLength={50}
                  placeholder="Last"
                  placeholderTextColor={C.inkMute}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </Field>
            </View>
          </View>

          {/* Username */}
          <Field label="Username" error={usernameError}>
            <View style={styles.usernameRow}>
              <View style={styles.usernameAt}>
                <Text style={styles.usernameAtText}>@</Text>
              </View>
              <TextInput
                style={[styles.input, styles.usernameInput]}
                value={username}
                onChangeText={v => {
                  setUsername(v.toLowerCase().replace(/[^a-z0-9_]/g, ''));
                  setUsernameError('');
                }}
                onBlur={() => {
                  const e = validateUsername(username.trim());
                  if (e) setUsernameError(e);
                }}
                maxLength={20}
                placeholder="username"
                placeholderTextColor={C.inkMute}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
              />
            </View>
          </Field>

          {/* Bio */}
          <Field label="Bio">
            <View>
              <TextInput
                style={[styles.input, styles.bioInput]}
                value={bio}
                onChangeText={setBio}
                maxLength={200}
                placeholder="A short description about yourself…"
                placeholderTextColor={C.inkMute}
                multiline
                returnKeyType="done"
              />
              <Text style={styles.charCount}>{bio.length}/200</Text>
            </View>
          </Field>

          {/* Appearance */}
          <View style={fieldStyles.field}>
            <Text style={fieldStyles.fieldLabel}>Appearance</Text>
            <View style={styles.paletteGrid}>
              {PALETTES.map(({ id, label, colors }) => {
                const selected = id === paletteId;
                return (
                  <TouchableOpacity
                    key={id}
                    onPress={() => setPalette(id)}
                    activeOpacity={0.7}
                    style={[
                      styles.paletteChip,
                      selected && { borderColor: colors.primary, borderWidth: 2, backgroundColor: C.surface },
                    ]}
                  >
                    <View style={[styles.paletteSwatch, { backgroundColor: colors.primary }]} />
                    <Text style={[styles.paletteLabel, selected && { color: C.ink, fontWeight: '700' }]}>
                      {label}
                    </Text>
                    {selected && (
                      <Ionicons name="checkmark" size={12} color={colors.primary} style={{ marginLeft: 'auto' }} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Error */}
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Save button */}
          <TouchableOpacity
            style={[styles.saveButton, (saving || username.trim().length < 3) && { opacity: 0.55 }]}
            onPress={handleSave}
            disabled={saving || username.trim().length < 3}
            activeOpacity={0.8}
          >
            {saving
              ? <ActivityIndicator color="#FFFBF1" size="small" />
              : <Text style={styles.saveText}>Save changes</Text>
            }
          </TouchableOpacity>

          {/* Sign out */}
          <TouchableOpacity
            style={styles.signOutBtn}
            onPress={() => signOut()}
            activeOpacity={0.7}
          >
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function makeStyles(C: typeof BASE_C & { primary: string; accent: string }) {
  return StyleSheet.create({
  scroll: {
    padding: 20,
    gap: 16,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 4,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1.5,
    borderColor: C.hairline,
  },
  avatarFallback: {
    backgroundColor: C.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontWeight: '800',
    fontSize: 24,
    color: C.inkMute,
  },
  cameraButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: C.primary,
    borderWidth: 2,
    borderColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarHint: {
    fontWeight: '600',
    fontSize: 13,
    color: C.ink,
  },
  avatarSub: {
    fontSize: 11.5,
    color: C.inkMute,
    marginTop: 2,
  },
  nameRow: {
    flexDirection: 'row',
    gap: 12,
  },
  input: {
    backgroundColor: C.surface,
    borderWidth: 0.5,
    borderColor: C.hairline,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13.5,
    color: C.ink,
  },
  usernameRow: {
    flexDirection: 'row',
  },
  usernameAt: {
    backgroundColor: C.surfaceAlt,
    borderWidth: 0.5,
    borderColor: C.hairline,
    borderRightWidth: 0,
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 9,
    justifyContent: 'center',
  },
  usernameAtText: {
    fontSize: 13.5,
    color: C.inkMute,
    fontWeight: '600',
  },
  usernameInput: {
    flex: 1,
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
  },
  bioInput: {
    minHeight: 80,
    textAlignVertical: 'top',
    paddingBottom: 24,
  },
  charCount: {
    position: 'absolute',
    bottom: 8,
    right: 10,
    fontSize: 10,
    color: C.inkMute,
    fontVariant: ['tabular-nums'],
  },
  errorBox: {
    padding: 12,
    backgroundColor: 'rgba(192,64,64,0.08)',
    borderWidth: 0.5,
    borderColor: 'rgba(192,64,64,0.25)',
    borderRadius: 8,
  },
  errorText: {
    fontSize: 12.5,
    color: C.error,
  },
  saveButton: {
    backgroundColor: C.primary,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 4,
    minHeight: 46,
  },
  saveText: {
    color: '#FFFBF1',
    fontWeight: '700',
    fontSize: 14,
  },
  signOutBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 8,
    marginBottom: 8,
  },
  signOutText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#DC2626',
  },
  paletteGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  paletteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: C.hairline,
    backgroundColor: C.surfaceAlt,
    minWidth: '46%',
    flex: 1,
  },
  paletteSwatch: {
    width: 12,
    height: 12,
    borderRadius: 6,
    flexShrink: 0,
  },
  paletteLabel: {
    fontSize: 12.5,
    fontWeight: '500',
    color: C.inkSoft,
  },
  });
}
