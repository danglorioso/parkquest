import {
  ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useEffect, useState } from 'react';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { STATIC as BASE_C, useColors, useThemedStyles, type Colors } from '@/lib/palette';
import { AppleIcon, clerkMsg, GoogleG } from '@/components/AuthAtoms';
import { showToast } from '@/lib/toast';
import { disconnectStrava, getStravaAuthorizeUrl, getStravaStatus } from '@/lib/api';

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
  const { getToken } = useAuth();
  const C = useColors();
  const styles = useThemedStyles(makeStyles);

  const [connectBusy, setConnectBusy] = useState<'google' | 'apple' | null>(null);
  const [passwordModal, setPasswordModal] = useState(false);
  const [pendingDisconnect, setPendingDisconnect] = useState<'google' | 'apple' | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [settingPassword, setSettingPassword] = useState(false);

  const [stravaConnected, setStravaConnected] = useState<boolean | null>(null);
  const [stravaBusy, setStravaBusy] = useState(false);

  const refreshStravaStatus = async () => {
    const tok = await getToken();
    if (!tok) return;
    try {
      const { connected } = await getStravaStatus(tok);
      setStravaConnected(connected);
    } catch {
      setStravaConnected(false);
    }
  };

  useEffect(() => {
    refreshStravaStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnectStrava = async () => {
    setStravaBusy(true);
    try {
      const tok = await getToken();
      if (!tok) throw new Error('Not signed in');
      const { url } = await getStravaAuthorizeUrl(tok);
      const redirectUrl = AuthSession.makeRedirectUri({ path: 'strava-callback' });
      const result = await WebBrowser.openAuthSessionAsync(url, redirectUrl);
      if (result.type === 'success' && result.url.includes('success=1')) {
        await refreshStravaStatus();
        showToast('Strava connected');
      } else if (result.type === 'success') {
        showToast('Could not connect Strava', 'error');
      }
    } catch (e) {
      showToast(clerkMsg(e), 'error');
    } finally {
      setStravaBusy(false);
    }
  };

  const handleDisconnectStrava = () => {
    Alert.alert('Disconnect Strava', 'Your logged visits keep their attached stats, but new visits won’t be able to pull in hikes.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect', style: 'destructive', onPress: async () => {
          setStravaBusy(true);
          try {
            const tok = await getToken();
            if (tok) await disconnectStrava(tok);
            setStravaConnected(false);
            showToast('Strava disconnected');
          } catch (e) {
            showToast(clerkMsg(e), 'error');
          } finally {
            setStravaBusy(false);
          }
        },
      },
    ]);
  };

  // An existing password means Clerk requires it re-entered to change it —
  // the disconnect-forced flow below only ever opens this modal when the
  // account has no password yet, so that path never needs this field.
  const hasPassword = user?.passwordEnabled === true;

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
    setCurrentPassword('');
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
    if (hasPassword && !currentPassword) { setPasswordError('Enter your current password'); return; }
    if (newPassword.length < 8) { setPasswordError('Password must be at least 8 characters'); return; }
    if (newPassword !== confirmPassword) { setPasswordError('Passwords do not match'); return; }
    setPasswordError('');
    setSettingPassword(true);
    try {
      await user.updatePassword({
        newPassword,
        ...(hasPassword ? { currentPassword } : {}),
      });
      const provider = pendingDisconnect;
      closePasswordModal();
      showToast(hasPassword ? 'Password updated' : 'Password set');
      if (provider) await performDisconnect(provider);
    } catch (e) {
      setPasswordError(clerkMsg(e));
    } finally {
      setSettingPassword(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 20, gap: 16 }}>
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

      <View style={{ gap: 10 }}>
        <Text style={styles.fieldLabel}>Password</Text>
        <View style={styles.row}>
          <View style={{ width: 24, alignItems: 'center' }}>
            <Ionicons name="lock-closed-outline" size={18} color={BASE_C.inkSoft} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.rowTitle}>Password</Text>
            <Text style={styles.rowSubtitle}>{hasPassword ? 'Set' : 'Not set'}</Text>
          </View>
          <TouchableOpacity
            style={styles.button}
            onPress={() => { setPendingDisconnect(null); setPasswordModal(true); }}
            activeOpacity={0.7}
          >
            <Text style={styles.buttonText}>{hasPassword ? 'Change' : 'Set password'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ gap: 10 }}>
        <Text style={styles.fieldLabel}>Tracking apps</Text>
        <View style={styles.row}>
          <View style={{ width: 24, alignItems: 'center' }}>
            <Ionicons name="bicycle-outline" size={20} color={BASE_C.inkSoft} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.rowTitle}>Strava</Text>
            <Text style={styles.rowSubtitle}>
              {stravaConnected === null ? 'Checking…' : stravaConnected ? 'Connected' : 'Not connected'}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.button, stravaConnected ? { borderColor: '#C04040' } : null, stravaBusy && { opacity: 0.4 }]}
            onPress={() => stravaConnected ? handleDisconnectStrava() : handleConnectStrava()}
            disabled={stravaBusy || stravaConnected === null}
            activeOpacity={0.7}
          >
            {stravaBusy
              ? <ActivityIndicator color={stravaConnected ? '#C04040' : C.primary} size="small" />
              : <Text style={[styles.buttonText, stravaConnected ? { color: '#C04040' } : null]}>
                  {stravaConnected ? 'Disconnect' : 'Connect'}
                </Text>
            }
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={passwordModal} transparent animationType="fade" onRequestClose={() => !settingPassword && closePasswordModal()}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 }}
          onPress={() => !settingPassword && closePasswordModal()}
        >
          <Pressable onPress={() => {}} style={{ width: '100%', backgroundColor: BASE_C.surface, borderRadius: 16, padding: 24, gap: 16 }}>
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: BASE_C.ink }}>
                {hasPassword ? 'Change your password' : 'Set a password'}
              </Text>
              <Text style={{ fontSize: 13.5, color: BASE_C.inkMute, lineHeight: 20 }}>
                {pendingDisconnect
                  ? "That's your only way to sign in right now. Set a password first so disconnecting it doesn't lock you out."
                  : hasPassword
                    ? 'Enter your current password, then choose a new one.'
                    : 'Add a password so you can sign in without Google or Apple.'}
              </Text>
            </View>
            {hasPassword && (
              <Field label="Current password">
                <TextInput
                  value={currentPassword}
                  onChangeText={v => { setCurrentPassword(v); setPasswordError(''); }}
                  secureTextEntry
                  placeholder="Current password"
                  placeholderTextColor={BASE_C.inkMute}
                  style={styles.input}
                />
              </Field>
            )}
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
                disabled={settingPassword || !newPassword || !confirmPassword || (hasPassword && !currentPassword)}
                style={{
                  flex: 1, paddingVertical: 13, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: C.primary,
                  opacity: (settingPassword || !newPassword || !confirmPassword || (hasPassword && !currentPassword)) ? 0.5 : 1,
                }}
              >
                {settingPassword
                  ? <ActivityIndicator color="#FFFBF1" size="small" />
                  : <Text style={{ fontSize: 14, fontWeight: '700', color: BASE_C.onPrimary }}>{hasPassword ? 'Update password' : 'Set password'}</Text>
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
