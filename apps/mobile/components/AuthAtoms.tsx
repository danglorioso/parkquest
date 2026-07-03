import {
  ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { STATIC as C, useColors } from '@/lib/palette';

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
}: {
  label: string; value: string; onChange: (v: string) => void;
  secureText?: boolean; keyboard?: 'email-address' | 'number-pad' | 'default';
  trailing?: string; onTrailing?: () => void; autoFocus?: boolean;
}) {
  const T = useColors();
  return (
    <View style={st.fField}>
      <View style={{ flex: 1 }}>
        <Text style={st.fFieldLabel}>{label}</Text>
        <TextInput
          style={st.fFieldInput}
          value={value} onChangeText={onChange}
          secureTextEntry={secureText}
          keyboardType={keyboard ?? 'default'}
          autoCapitalize="none" autoCorrect={false}
          autoFocus={autoFocus}
        />
      </View>
      {trailing ? (
        <TouchableOpacity onPress={onTrailing} style={{ paddingLeft: 8, paddingBottom: 4 }}>
          <Text style={[st.trailingText, { color: T.primary }]}>{trailing}</Text>
        </TouchableOpacity>
      ) : null}
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

export function SecondaryBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={st.secondaryBtn} activeOpacity={0.7}>
      <Text style={st.secondaryBtnText}>{label}</Text>
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

const st = StyleSheet.create({
  fField: {
    backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.hairline,
    borderRadius: 12, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10,
    marginBottom: 10, flexDirection: 'row', alignItems: 'flex-end', gap: 10,
  },
  fFieldLabel:  { fontFamily: MONO, fontSize: 13, letterSpacing: 1.4, color: C.inkMute, fontWeight: '600' },
  fFieldInput:  { fontSize: 15, color: C.ink, paddingTop: 4 },
  trailingText: { fontSize: 13, fontWeight: '600' },

  primaryBtn:       { borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginBottom: 10, minHeight: 50 },
  primaryBtnText:   { fontSize: 15, fontWeight: '700', color: C.onPrimary },
  secondaryBtn:     { paddingVertical: 12, alignItems: 'center' },
  secondaryBtnText: { fontSize: 13, fontWeight: '600', color: C.inkMute },

  errorBox:     { backgroundColor: 'rgba(192,64,64,0.08)', borderRadius: 10, borderWidth: 0.5, borderColor: 'rgba(192,64,64,0.25)', padding: 12, marginBottom: 12 },
  errorBoxText: { fontSize: 13, color: '#C04040' },
  infoText:     { fontSize: 13.5, color: C.inkMute, lineHeight: 20, marginBottom: 14 },
});
