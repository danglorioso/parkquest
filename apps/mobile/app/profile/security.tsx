import {
  ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useState } from 'react';
import { useUser } from '@clerk/clerk-expo';
import type { EmailAddressResource } from '@clerk/types';
import { Ionicons } from '@expo/vector-icons';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { STATIC as BASE_C, useColors, useThemedStyles, type Colors } from '@/lib/palette';
import { AppleIcon, clerkMsg, GoogleG } from '@/components/AuthAtoms';
import { showToast } from '@/lib/toast';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 5 }}>
      <Text style={{ fontWeight: '600', fontSize: 13, color: BASE_C.ink, letterSpacing: 0.2 }}>{label}</Text>
      {children}
    </View>
  );
}

export default function SecurityScreen() {
  const { user } = useUser();
  const C = useColors();
  const styles = useThemedStyles(makeStyles);

  const [connectBusy, setConnectBusy] = useState<'google' | 'apple' | null>(null);
  const [passwordModal, setPasswordModal] = useState(false);
  const [pendingDisconnect, setPendingDisconnect] = useState<'google' | 'apple' | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [settingPassword, setSettingPassword] = useState(false);

  const [emailModal, setEmailModal] = useState(false);
  const [emailStep, setEmailStep] = useState<'enter' | 'verify'>('enter');
  const [newEmail, setNewEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [pendingEmail, setPendingEmail] = useState<EmailAddressResource | null>(null);
  const [emailError, setEmailError] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);

  const googleAccount = user?.verifiedExternalAccounts.find(a => a.provider === 'google') ?? null;
  const appleAccount  = user?.verifiedExternalAccounts.find(a => a.provider === 'apple')  ?? null;

  // A provider can only be disconnected if another sign-in method survives it —
  // a password, or another connected SSO account — otherwise the user is locked out.
  const canUnlink = (provider: 'google' | 'apple') => {
    if (!user) return false;
    if (user.passwordEnabled) return true;
    return user.verifiedExternalAccounts.some(a => a.provider !== provider);
  };

  const closePasswordModal = () => {
    setPasswordModal(false);
    setPendingDisconnect(null);
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
  };

  const performDisconnect = async (provider: 'google' | 'apple') => {
    const acct = provider === 'google' ? googleAccount : appleAccount;
    if (!acct) return;
    setConnectBusy(provider);
    try {
      await acct.destroy();
      await user?.reload();
      showToast(`${provider === 'google' ? 'Google' : 'Apple'} account disconnected`);
    } catch (e) {
      showToast(clerkMsg(e), 'error');
    } finally {
      setConnectBusy(null);
    }
  };

  const handleDisconnectPress = (provider: 'google' | 'apple') => {
    if (!canUnlink(provider)) {
      setPendingDisconnect(provider);
      setPasswordModal(true);
      return;
    }
    const label = provider === 'google' ? 'Google' : 'Apple';
    Alert.alert(`Disconnect ${label}`, `Sign in with ${label} will no longer work for this account.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Disconnect', style: 'destructive', onPress: () => performDisconnect(provider) },
    ]);
  };

  const handleConnect = async (provider: 'google' | 'apple') => {
    if (!user) return;
    setConnectBusy(provider);
    try {
      const redirectUrl = AuthSession.makeRedirectUri({ path: 'sso-callback' });
      const acct = await user.createExternalAccount({
        strategy: provider === 'google' ? 'oauth_google' : 'oauth_apple',
        redirectUrl,
      });
      const url = acct.verification?.externalVerificationRedirectURL;
      if (!url) {
        await acct.destroy().catch(() => {});
        throw new Error('Could not start sign-in');
      }
      const result = await WebBrowser.openAuthSessionAsync(url.toString(), redirectUrl);
      if (result.type === 'success') {
        await user.reload();
        showToast(`${provider === 'google' ? 'Google' : 'Apple'} account connected`);
      } else {
        await acct.destroy().catch(() => {});
      }
    } catch (e) {
      showToast(clerkMsg(e), 'error');
    } finally {
      setConnectBusy(null);
    }
  };

  const handleSetPassword = async () => {
    if (!user) return;
    if (newPassword.length < 8) { setPasswordError('Password must be at least 8 characters'); return; }
    if (newPassword !== confirmPassword) { setPasswordError('Passwords do not match'); return; }
    setPasswordError('');
    setSettingPassword(true);
    try {
      await user.updatePassword({ newPassword });
      const provider = pendingDisconnect;
      closePasswordModal();
      showToast('Password set');
      if (provider) await performDisconnect(provider);
    } catch (e) {
      setPasswordError(clerkMsg(e));
    } finally {
      setSettingPassword(false);
    }
  };

  const closeEmailModal = async () => {
    // Discard an unverified pending address rather than leaving it orphaned
    // on the account if the user backs out mid-flow.
    if (pendingEmail) await pendingEmail.destroy().catch(() => {});
    setEmailModal(false);
    setEmailStep('enter');
    setNewEmail('');
    setEmailCode('');
    setPendingEmail(null);
    setEmailError('');
  };

  const handleSendEmailCode = async () => {
    if (!user) return;
    const trimmed = newEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError('Enter a valid email address');
      return;
    }
    setEmailError('');
    setEmailBusy(true);
    try {
      const emailAddress = await user.createEmailAddress({ email: trimmed });
      await emailAddress.prepareVerification({ strategy: 'email_code' });
      setPendingEmail(emailAddress);
      setEmailStep('verify');
    } catch (e) {
      setEmailError(clerkMsg(e));
    } finally {
      setEmailBusy(false);
    }
  };

  const handleVerifyEmailCode = async () => {
    if (!pendingEmail || !user) return;
    setEmailError('');
    setEmailBusy(true);
    try {
      const verified = await pendingEmail.attemptVerification({ code: emailCode.trim() });
      await user.update({ primaryEmailAddressId: verified.id });
      // Drop any other addresses (old primary, other stale pending ones) now
      // that the new one is verified and primary.
      await Promise.all(
        user.emailAddresses.filter(e => e.id !== verified.id).map(e => e.destroy().catch(() => {}))
      );
      await user.reload();
      setEmailModal(false);
      setEmailStep('enter');
      setNewEmail('');
      setEmailCode('');
      setPendingEmail(null);
      showToast('Email updated');
    } catch (e) {
      setEmailError(clerkMsg(e));
    } finally {
      setEmailBusy(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 20, gap: 16 }}>
      <View style={{ gap: 10 }}>
        <Text style={styles.fieldLabel}>Email</Text>
        <View style={styles.row}>
          <View style={{ width: 24, alignItems: 'center' }}>
            <Ionicons name="mail-outline" size={20} color={C.inkSoft} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.rowTitle}>{user?.primaryEmailAddress?.emailAddress ?? '—'}</Text>
            <Text style={styles.rowSubtitle}>Primary email</Text>
          </View>
          <TouchableOpacity
            style={styles.button}
            onPress={() => setEmailModal(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.buttonText}>Change</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ gap: 10 }}>
        <Text style={styles.fieldLabel}>Connected accounts</Text>
        {(['google', 'apple'] as const).map(provider => {
          const acct = provider === 'google' ? googleAccount : appleAccount;
          const busy = connectBusy === provider;
          return (
            <View key={provider} style={styles.row}>
              <View style={{ width: 24, alignItems: 'center' }}>
                {provider === 'google' ? <GoogleG size={20} /> : <AppleIcon size={20} />}
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.rowTitle}>{provider === 'google' ? 'Google' : 'Apple'}</Text>
                <Text style={styles.rowSubtitle}>{acct ? 'Connected' : 'Not connected'}</Text>
              </View>
              <TouchableOpacity
                style={[styles.button, acct ? { borderColor: '#C04040' } : null, busy && { opacity: 0.4 }]}
                onPress={() => acct ? handleDisconnectPress(provider) : handleConnect(provider)}
                disabled={busy}
                activeOpacity={0.7}
              >
                {busy
                  ? <ActivityIndicator color={acct ? '#C04040' : C.primary} size="small" />
                  : <Text style={[styles.buttonText, acct ? { color: '#C04040' } : null]}>
                      {acct ? 'Disconnect' : 'Connect'}
                    </Text>
                }
              </TouchableOpacity>
            </View>
          );
        })}
      </View>

      <Modal visible={passwordModal} transparent animationType="fade" onRequestClose={() => !settingPassword && closePasswordModal()}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 }}
          onPress={() => !settingPassword && closePasswordModal()}
        >
          <Pressable onPress={() => {}} style={{ width: '100%', backgroundColor: BASE_C.surface, borderRadius: 16, padding: 24, gap: 16 }}>
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: BASE_C.ink }}>Set a password</Text>
              <Text style={{ fontSize: 13.5, color: BASE_C.inkMute, lineHeight: 20 }}>
                That's your only way to sign in right now. Set a password first so disconnecting it doesn't lock you out.
              </Text>
            </View>
            <Field label="New password">
              <TextInput
                value={newPassword}
                onChangeText={v => { setNewPassword(v); setPasswordError(''); }}
                secureTextEntry
                placeholder="At least 8 characters"
                placeholderTextColor={BASE_C.inkMute}
                style={styles.input}
              />
            </Field>
            <Field label="Confirm password">
              <TextInput
                value={confirmPassword}
                onChangeText={v => { setConfirmPassword(v); setPasswordError(''); }}
                secureTextEntry
                placeholder="Re-enter password"
                placeholderTextColor={BASE_C.inkMute}
                style={styles.input}
              />
            </Field>
            {passwordError ? <Text style={{ fontSize: 13, color: '#C04040' }}>{passwordError}</Text> : null}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={closePasswordModal}
                disabled={settingPassword}
                style={{ flex: 1, paddingVertical: 13, borderRadius: 10, borderWidth: 1, borderColor: BASE_C.hairline, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: BASE_C.inkSoft }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSetPassword}
                disabled={settingPassword || !newPassword || !confirmPassword}
                style={{
                  flex: 1, paddingVertical: 13, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: C.primary,
                  opacity: (settingPassword || !newPassword || !confirmPassword) ? 0.5 : 1,
                }}
              >
                {settingPassword
                  ? <ActivityIndicator color="#FFFBF1" size="small" />
                  : <Text style={{ fontSize: 14, fontWeight: '700', color: BASE_C.onPrimary }}>Set password</Text>
                }
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={emailModal} transparent animationType="fade" onRequestClose={() => !emailBusy && closeEmailModal()}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 }}
          onPress={() => !emailBusy && closeEmailModal()}
        >
          <Pressable onPress={() => {}} style={{ width: '100%', backgroundColor: BASE_C.surface, borderRadius: 16, padding: 24, gap: 16 }}>
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: BASE_C.ink }}>Change email</Text>
              <Text style={{ fontSize: 13.5, color: BASE_C.inkMute, lineHeight: 20 }}>
                {emailStep === 'enter'
                  ? "We'll send a code to your new address to verify it."
                  : `Enter the code we sent to ${newEmail.trim()}.`}
              </Text>
            </View>
            {emailStep === 'enter' ? (
              <Field label="New email">
                <TextInput
                  value={newEmail}
                  onChangeText={v => { setNewEmail(v); setEmailError(''); }}
                  placeholder="you@example.com"
                  placeholderTextColor={BASE_C.inkMute}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                />
              </Field>
            ) : (
              <Field label="Verification code">
                <TextInput
                  value={emailCode}
                  onChangeText={v => { setEmailCode(v); setEmailError(''); }}
                  placeholder="123456"
                  placeholderTextColor={BASE_C.inkMute}
                  keyboardType="number-pad"
                  style={styles.input}
                />
              </Field>
            )}
            {emailError ? <Text style={{ fontSize: 13, color: '#C04040' }}>{emailError}</Text> : null}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={closeEmailModal}
                disabled={emailBusy}
                style={{ flex: 1, paddingVertical: 13, borderRadius: 10, borderWidth: 1, borderColor: BASE_C.hairline, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: BASE_C.inkSoft }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={emailStep === 'enter' ? handleSendEmailCode : handleVerifyEmailCode}
                disabled={emailBusy || (emailStep === 'enter' ? !newEmail.trim() : !emailCode.trim())}
                style={{
                  flex: 1, paddingVertical: 13, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: C.primary,
                  opacity: (emailBusy || (emailStep === 'enter' ? !newEmail.trim() : !emailCode.trim())) ? 0.5 : 1,
                }}
              >
                {emailBusy
                  ? <ActivityIndicator color="#FFFBF1" size="small" />
                  : <Text style={{ fontSize: 14, fontWeight: '700', color: BASE_C.onPrimary }}>
                      {emailStep === 'enter' ? 'Send code' : 'Verify & save'}
                    </Text>
                }
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

function makeStyles(C: Colors) {
  return StyleSheet.create({
    fieldLabel: { fontWeight: '600', fontSize: 13, color: C.ink, letterSpacing: 0.2 },
    row: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.hairline,
      borderRadius: 12, padding: 12,
    },
    rowTitle: { fontSize: 14, fontWeight: '600', color: C.ink },
    rowSubtitle: { fontSize: 12, color: C.inkMute, marginTop: 1 },
    button: {
      borderWidth: 1, borderColor: C.hairline, borderRadius: 9,
      paddingHorizontal: 12, paddingVertical: 8,
    },
    buttonText: { fontSize: 13, fontWeight: '600', color: C.inkSoft },
    input: {
      borderWidth: 1, borderColor: C.hairline, borderRadius: 10,
      paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: C.ink,
      backgroundColor: C.bg,
    },
  });
}
