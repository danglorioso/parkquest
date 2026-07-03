import {
  ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal,
  Platform, Pressable, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { useState, useEffect, useMemo, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth, useUser, useClerk } from '@clerk/clerk-expo';
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
  fieldLabel: { fontWeight: '600', fontSize: 13, color: BASE_C.ink, letterSpacing: 0.2 },
  fieldError: { fontSize: 13, color: BASE_C.error },
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
  const { getToken } = useAuth();
  const { signOut } = useClerk();
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
  const [deleteModal,         setDeleteModal]         = useState(false);
  const [deleteInput,         setDeleteInput]         = useState('');
  const [deleting,            setDeleting]            = useState(false);
  const [removeAvatarPending, setRemoveAvatarPending] = useState(false);
  const [fullscreenAvatar,    setFullscreenAvatar]    = useState(false);

  const original = useRef({ firstName: '', lastName: '', username: '', bio: '', paletteId: '' });

  // Load current values
  useEffect(() => {
    if (!user) return;
    setFirstName(user.firstName ?? '');
    setLastName(user.lastName ?? '');
    setUsername(user.username ?? '');
    setAvatarPreview(user.imageUrl ?? null);
    setRemoveAvatarPending(false);
    original.current.firstName = user.firstName ?? '';
    original.current.lastName  = user.lastName ?? '';
    original.current.username  = user.username ?? '';

    getToken().then(tok => {
      if (!tok) { setLoading(false); return; }
      fetch(`${BASE}/api/profile`, { headers: { Authorization: `Bearer ${tok}` } })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data) {
            setBio(data.bio ?? '');
            original.current.bio = data.bio ?? '';
            // Profile DB is the source of truth for username — Clerk's copy can drift
            if (data.username) {
              setUsername(data.username);
              original.current.username = data.username;
            }
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    });
  }, [user]);

  useEffect(() => {
    original.current.paletteId = paletteId;
  // only on mount — paletteId changes after user edits, so capture initial value
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasChanges =
    firstName !== original.current.firstName ||
    lastName  !== original.current.lastName  ||
    username  !== original.current.username  ||
    bio       !== original.current.bio       ||
    paletteId !== original.current.paletteId ||
    avatarFile !== null ||
    removeAvatarPending;

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
      setRemoveAvatarPending(false);
    }
  };

  const handleAvatarTap = () => {
    const hasImage = avatarPreview !== null && !removeAvatarPending;
    const canRemove = (user?.hasImage || avatarFile !== null) && !removeAvatarPending;
    Alert.alert('Profile photo', undefined, [
      ...(hasImage ? [{ text: 'View photo', onPress: () => setFullscreenAvatar(true) }] : []),
      { text: hasImage ? 'Choose new photo' : 'Choose photo', onPress: pickAvatar },
      ...(canRemove ? [{
        text: 'Remove photo',
        style: 'destructive' as const,
        onPress: () => { setAvatarPreview(null); setAvatarFile(null); setRemoveAvatarPending(true); },
      }] : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
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
      // Upload / remove avatar via Clerk
      if (removeAvatarPending) {
        try { await user.setProfileImage({ file: null as unknown as File }); } catch { /* non-fatal */ }
      } else if (avatarFile?.base64) {
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

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/(auth)/sign-in' as never);
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    setDeleteInput('');
    setDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (deleteInput !== 'DELETE') return;
    setDeleting(true);
    try {
      const tok = await getToken();
      if (!tok) throw new Error('Not authenticated');
      const res = await fetch(`${BASE}/api/account`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (!res.ok) throw new Error('Failed to delete account');
      setDeleteModal(false);
      await signOut();
      router.replace('/(auth)/sign-in' as never);
    } catch {
      Alert.alert('Error', 'Failed to delete account. Please try again.');
    } finally {
      setDeleting(false);
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
          {/* Avatar + Name */}
          <View style={styles.avatarNameRow}>
            <TouchableOpacity onPress={handleAvatarTap} activeOpacity={0.8}>
              <View style={styles.avatarWrap}>
                {avatarPreview && !removeAvatarPending ? (
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
              <Text style={styles.avatarHint}>Edit photo</Text>
            </TouchableOpacity>
            <View style={{ flex: 1, gap: 10 }}>
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
          <View style={[fieldStyles.field, { gap: 10 }]}>
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
                      selected
                        ? { borderColor: colors.primary, backgroundColor: C.surface }
                        : { borderColor: 'transparent' },
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
            style={[
              styles.saveButton,
              !hasChanges && { backgroundColor: C.inkMute, opacity: 0.45 },
              (saving || username.trim().length < 3) && { opacity: 0.55 },
            ]}
            onPress={handleSave}
            disabled={saving || username.trim().length < 3 || !hasChanges}
            activeOpacity={0.8}
          >
            {saving
              ? <ActivityIndicator color="#FFFBF1" size="small" />
              : <Text style={styles.saveText}>Save changes</Text>
            }
          </TouchableOpacity>

          {/* Sign out — quiet text button */}
          <TouchableOpacity
            style={styles.signOutBtn}
            onPress={handleSignOut}
            activeOpacity={0.5}
          >
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* Delete account — fixed footer */}
      <TouchableOpacity
        style={styles.deleteBtn}
        onPress={handleDeleteAccount}
        activeOpacity={0.5}
      >
        <Text style={styles.deleteBtnText}>Delete account</Text>
      </TouchableOpacity>

      {/* Fullscreen avatar */}
      <Modal visible={fullscreenAvatar} transparent animationType="fade" onRequestClose={() => setFullscreenAvatar(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' }}
          onPress={() => setFullscreenAvatar(false)}
        >
          {avatarPreview && (
            <Image source={{ uri: avatarPreview }} style={{ width: '86%', aspectRatio: 1, borderRadius: 16 }} resizeMode="cover" />
          )}
          <TouchableOpacity
            onPress={() => setFullscreenAvatar(false)}
            style={{ position: 'absolute', top: 56, right: 20, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="close" size={20} color="#fff" />
          </TouchableOpacity>
        </Pressable>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal visible={deleteModal} transparent animationType="fade" onRequestClose={() => !deleting && setDeleteModal(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 }}
          onPress={() => !deleting && setDeleteModal(false)}
        >
          <Pressable onPress={() => {}} style={{ width: '100%', backgroundColor: BASE_C.surface, borderRadius: 16, padding: 24, gap: 16 }}>
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: BASE_C.ink }}>Delete account</Text>
              <Text style={{ fontSize: 13.5, color: BASE_C.inkMute, lineHeight: 20 }}>
                This will permanently delete all your visits, posts, badges, and account data.{' '}
                <Text style={{ fontWeight: '700', color: BASE_C.ink }}>This cannot be undone.</Text>
              </Text>
            </View>
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: BASE_C.inkMute, letterSpacing: 0.3 }}>
                Type <Text style={{ fontFamily: 'JetBrainsMono_700Bold', color: '#C04040' }}>DELETE</Text> to confirm
              </Text>
              <TextInput
                value={deleteInput}
                onChangeText={setDeleteInput}
                placeholder="DELETE"
                placeholderTextColor={BASE_C.inkMute}
                autoCapitalize="characters"
                autoCorrect={false}
                style={{
                  borderWidth: 1.5,
                  borderColor: deleteInput === 'DELETE' ? '#C04040' : BASE_C.hairline,
                  borderRadius: 10,
                  paddingHorizontal: 14,
                  paddingVertical: 11,
                  fontSize: 15,
                  fontFamily: 'JetBrainsMono_600SemiBold',
                  color: '#C04040',
                  backgroundColor: BASE_C.bg,
                }}
              />
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={() => setDeleteModal(false)}
                disabled={deleting}
                style={{ flex: 1, paddingVertical: 13, borderRadius: 10, borderWidth: 1, borderColor: BASE_C.hairline, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: BASE_C.inkSoft }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmDelete}
                disabled={deleteInput !== 'DELETE' || deleting}
                style={{
                  flex: 1, paddingVertical: 13, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: '#C04040',
                  opacity: (deleteInput !== 'DELETE' || deleting) ? 0.4 : 1,
                }}
              >
                {deleting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>Delete account</Text>
                }
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function makeStyles(C: typeof BASE_C & { primary: string; accent: string }) {
  return StyleSheet.create({
  scroll: {
    padding: 20,
    paddingBottom: 32,
    gap: 16,
  },
  avatarNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatarWrap: {
    position: 'relative',
    alignItems: 'center',
  },
  avatarHint: {
    fontSize: 11,
    fontWeight: '500',
    color: C.inkMute,
    marginTop: 6,
    textAlign: 'center',
  },
  avatar: {
    width: 92,
    height: 92,
    borderRadius: 46,
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
    fontSize: 30,
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
    fontSize: 13,
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
    fontSize: 13,
    color: C.error,
  },
  saveButton: {
    backgroundColor: C.primary,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    minHeight: 46,
  },
  saveText: {
    color: '#FFFBF1',
    fontWeight: '700',
    fontSize: 14,
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
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: C.hairline,
    backgroundColor: C.surfaceAlt,
    minWidth: '46%',
    flex: 1,
  },
  paletteSwatch: {
    width: 28,
    height: 20,
    borderRadius: 5,
    flexShrink: 0,
  },
  paletteLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: C.inkSoft,
  },
  signOutBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  signOutText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.inkMute,
  },
  deleteBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderTopWidth: 0.5,
    borderTopColor: BASE_C.hairline,
    backgroundColor: BASE_C.bg,
  },
  deleteBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#C04040',
  },
  });
}
