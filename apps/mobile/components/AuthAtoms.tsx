import {
  ActivityIndicator, Linking, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View,
  type TextInputProps,
} from 'react-native';
import { useRef } from 'react';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { STATIC as C, useColors } from '@/lib/palette';

const WEB = process.env.EXPO_PUBLIC_API_URL ?? 'https://www.parkquest.me';

// Shared form atoms for the auth flow (sign-in landing, login, sign-up).
// One source of truth so fields, buttons, and error boxes look identical
// on every auth screen.

export const MONO = 'JetBrainsMono_600SemiBold';

// Clerk errors carry an array of { message, longMessage } — surface the most
// descriptive one, with a generic fallback.
export function clerkMsg(e: unknown): string {
  const ce = e as { errors?: { message?: string; longMessage?: string }[] };
  return ce?.errors?.[0]?.longMessage ?? ce?.errors?.[0]?.message ?? 'Something went wrong.';
}

export function FField({
  label, value, onChange, secureText = false,
  keyboard, trailing, onTrailing, autoFocus = false,
  autoCapitalize = 'none', textContentType,
}: {
  label: string; value: string; onChange: (v: string) => void;
  secureText?: boolean; keyboard?: 'email-address' | 'number-pad' | 'default';
  trailing?: string; onTrailing?: () => void; autoFocus?: boolean;
  autoCapitalize?: 'none' | 'words' | 'sentences' | 'characters';
  // Without this, iOS Keychain falls back to "nearest text field above the
  // password field" to guess the username — on the reset-password screen
  // that's the verification-code field, so it got saved as the username.
  // Explicit typing (username / oneTimeCode / password / newPassword) tells
  // Keychain which field is actually which.
  textContentType?: TextInputProps['textContentType'];
}) {
  const T = useColors();
  const inputRef = useRef<TextInput>(null);
  return (
    // Pressable on the whole card, not just the TextInput itself — tapping
    // the label or the surrounding padding used to do nothing, so only the
    // TextInput's own tight bounds (just the typed text's line) actually
    // opened the keyboard. No style feedback (no activeOpacity/pressed
    // dimming) since this isn't really a button, just a bigger hit target
    // for the input it wraps; the trailing Show/Hide TouchableOpacity below
    // still claims its own taps first (RN's responder system resolves to
    // the deepest touched view), so this doesn't fight it.
    <Pressable style={st.fField} onPress={() => inputRef.current?.focus()}>
      <View style={{ flex: 1 }}>
        <Text style={st.fFieldLabel}>{label}</Text>
        <TextInput
          ref={inputRef}
          style={st.fFieldInput}
          value={value} onChangeText={onChange}
          secureTextEntry={secureText}
          keyboardType={keyboard ?? 'default'}
          autoCapitalize={autoCapitalize} autoCorrect={false}
          autoFocus={autoFocus}
          textContentType={textContentType}
        />
      </View>
      {trailing ? (
        <TouchableOpacity onPress={onTrailing} style={{ paddingLeft: 8, paddingBottom: 4 }}>
          <Text style={[st.trailingText, { color: T.primary }]}>{trailing}</Text>
        </TouchableOpacity>
      ) : null}
    </Pressable>
  );
}

// Collapsible FIRST/LAST NAME card — chevron flips open/closed, "Optional"
// badge sits in the header (above the fields) instead of as helper text below.
export function NameField({
  open, onToggle, firstName, lastName, onFirstName, onLastName,
}: {
  open: boolean; onToggle: () => void;
  firstName: string; lastName: string;
  onFirstName: (v: string) => void; onLastName: (v: string) => void;
}) {
  const T = useColors();
  return (
    <View style={st.nameField}>
      <TouchableOpacity onPress={onToggle} style={st.nameFieldHeader} activeOpacity={0.7}>
        <View style={st.nameFieldHeaderLeft}>
          <Text style={st.fFieldLabel}>FULL NAME</Text>
          <Text style={st.nameFieldOptional}>Optional</Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={T.primary} />
      </TouchableOpacity>
      {open && (
        <View style={st.nameFieldBody}>
          <View style={st.nameFieldRow}>
            <Text style={st.nameFieldRowLabel}>FIRST NAME</Text>
            <TextInput
              style={st.fFieldInput}
              value={firstName} onChangeText={onFirstName}
              autoCapitalize="words" autoCorrect={false}
            />
          </View>
          <View style={st.nameFieldDivider} />
          <View style={st.nameFieldRow}>
            <Text style={st.nameFieldRowLabel}>LAST NAME</Text>
            <TextInput
              style={st.fFieldInput}
              value={lastName} onChangeText={onLastName}
              autoCapitalize="words" autoCorrect={false}
            />
          </View>
        </View>
      )}
    </View>
  );
}

export function PrimaryBtn({ label, onPress, loading = false, disabled = false }: {
  label: string; onPress: () => void; loading?: boolean; disabled?: boolean;
}) {
  const T = useColors();
  return (
    <TouchableOpacity
      onPress={onPress} disabled={loading || disabled}
      style={[st.primaryBtn, { backgroundColor: T.primary }, (loading || disabled) && { opacity: 0.65 }]}
      activeOpacity={0.85}
    >
      {loading
        ? <ActivityIndicator color={C.onPrimary} size="small" />
        : <Text style={st.primaryBtnText}>{label}</Text>}
    </TouchableOpacity>
  );
}

export function SecondaryBtn({ label, icon, onPress }: {
  label?: string; icon?: keyof typeof Ionicons.glyphMap; onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={st.secondaryBtn} activeOpacity={0.7} hitSlop={8}>
      {icon != null && <Ionicons name={icon} size={18} color={C.inkMute} />}
      {label != null && <Text style={st.secondaryBtnText}>{label}</Text>}
    </TouchableOpacity>
  );
}

export function ErrorBox({ msg }: { msg: string }) {
  return (
    <View style={st.errorBox}>
      <Text style={st.errorBoxText}>{msg}</Text>
    </View>
  );
}

export function InfoText({ children }: { children: React.ReactNode }) {
  return <Text style={st.infoText}>{children}</Text>;
}

// Required acceptance gate shown right before an account is created — Apple
// Guideline 1.2 requires terms be presented and agreed to before registration,
// not just linked to in passing.
export function TermsCheckbox({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  const T = useColors();
  return (
    <TouchableOpacity onPress={onToggle} style={st.termsRow} activeOpacity={0.7}>
      <View style={[st.checkbox, checked && { backgroundColor: T.primary, borderColor: T.primary }]}>
        {checked && <Ionicons name="checkmark" size={13} color={C.onPrimary} />}
      </View>
      <Text style={st.termsText}>
        I agree to the{' '}
        <Text style={{ color: T.primary, fontWeight: '600' }} onPress={() => Linking.openURL(`${WEB}/terms`)}>Terms of Use</Text>
        {' '}and{' '}
        <Text style={{ color: T.primary, fontWeight: '600' }} onPress={() => Linking.openURL(`${WEB}/privacy`)}>Privacy Policy</Text>
      </Text>
    </TouchableOpacity>
  );
}

export function GoogleG({ size = 16 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <Path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <Path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <Path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </Svg>
  );
}

export function AppleIcon({ size = 16 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={C.ink}>
      <Path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </Svg>
  );
}

const st = StyleSheet.create({
  fField: {
    backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.hairline,
    borderRadius: 12, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10,
    marginBottom: 10, flexDirection: 'row', alignItems: 'flex-end', gap: 10,
  },
  fFieldLabel:  { fontFamily: MONO, fontSize: 13, letterSpacing: 1.4, color: C.inkMute, fontWeight: '600' },
  fFieldInput:  { fontSize: 15, color: C.ink, paddingTop: 4 },
  trailingText: { fontSize: 13, fontWeight: '600' },

  nameField: {
    backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.hairline,
    borderRadius: 12, marginBottom: 14, overflow: 'hidden',
  },
  nameFieldHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12,
  },
  nameFieldHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nameFieldOptional: {
    fontSize: 11, fontWeight: '600', color: C.inkMute,
    backgroundColor: C.hairline, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
    overflow: 'hidden',
  },
  nameFieldBody: { borderTopWidth: 0.5, borderTopColor: C.hairline },
  nameFieldRow: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 10 },
  nameFieldRowLabel: { fontFamily: MONO, fontSize: 11, letterSpacing: 1.2, color: C.inkMute, fontWeight: '600', marginBottom: 2 },
  nameFieldDivider: { height: StyleSheet.hairlineWidth, backgroundColor: C.hairline, marginHorizontal: 14 },

  primaryBtn:       { borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginBottom: 10, minHeight: 50 },
  primaryBtnText:   { fontSize: 15, fontWeight: '700', color: C.onPrimary },
  secondaryBtn:     { paddingVertical: 12, alignItems: 'center' },
  secondaryBtnText: { fontSize: 13, fontWeight: '600', color: C.inkMute },

  errorBox:     { backgroundColor: 'rgba(192,64,64,0.08)', borderRadius: 10, borderWidth: 0.5, borderColor: 'rgba(192,64,64,0.25)', padding: 12, marginBottom: 12 },
  errorBoxText: { fontSize: 13, color: '#C04040' },
  infoText:     { fontSize: 13.5, color: C.inkMute, lineHeight: 20, marginBottom: 14 },

  termsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 16 },
  checkbox: {
    width: 20, height: 20, borderRadius: 5, marginTop: 1,
    borderWidth: 1.5, borderColor: C.hairline,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  termsText: { fontSize: 13, color: C.inkMute, lineHeight: 19, flex: 1 },
});
