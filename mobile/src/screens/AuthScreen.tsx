import React, { useState } from 'react';
import { Alert, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getSupabaseClient, classifyAuthError, testSupabaseConnection, getActiveMobileProfile } from '../lib/supabase';

export default function AuthScreen({
  activeProfileLabel,
}: {
  activeProfileLabel: string;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.alert(`${title}\n\n${message}`);
      setStatus(message);
      return;
    }

    Alert.alert(title, message);
  };

  const normalizeEmail = (value: string) =>
    String(value ?? '')
      .trim()
      .toLowerCase();

  const signIn = async () => {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !password) {
      showAlert('Sign in failed', 'Email and password are required.');
      return;
    }

    setLoading(true);
    setStatus(null);

    // Test connection first
    try {
      const profile = getActiveMobileProfile();
      const connectionTest = await testSupabaseConnection(profile.url, profile.anonKey);

      if (!connectionTest.ok) {
        showAlert('Connection error', connectionTest.message);
        return;
      }

      const { error } = await getSupabaseClient().auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) {
        const classified = classifyAuthError(error);
        showAlert('Sign in failed', classified.userMessage);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      showAlert('Sign in failed', message);
    } finally {
      setLoading(false);
    }
  };

  const signUp = async () => {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !password) {
      showAlert('Sign up failed', 'Email and password are required.');
      return;
    }

    setLoading(true);
    setStatus(null);
    try {
      const client = getSupabaseClient();
      const { data, error } = await client.auth.signUp({
        email: normalizedEmail,
        password,
      });
      if (error) {
        showAlert('Sign up failed', error.message);
        return;
      }

      const identities = data?.user?.identities;
      const existingUserReturned =
        Array.isArray(identities) && identities.length === 0;
      if (existingUserReturned) {
        showAlert(
          'Account already exists',
          'This email already exists in the selected project. Use Sign In or Reset Password.'
        );
        return;
      }

      const hasSession = Boolean(data?.session);
      showAlert(
        hasSession ? 'Signed up' : 'Check your email for confirmation',
        hasSession
          ? 'Account created. If you do not see company data yet, ask an owner to invite your email to this company.'
          : 'Account created. After confirming email, sign in and ask an owner to invite your email to this company.'
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      showAlert('Sign up failed', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.profileHint}>Signing into: {activeProfileLabel}</Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        onChangeText={setEmail}
        value={email}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        onChangeText={setPassword}
        value={password}
      />
      {!!status && <Text style={styles.status}>{status}</Text>}
      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.primaryButton} onPress={signIn} disabled={loading}>
          <Text style={styles.primaryButtonText}>{loading ? '...' : 'Sign In'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={signUp} disabled={loading}>
          <Text style={styles.secondaryButtonText}>{loading ? '...' : 'Sign Up'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 16 },
  profileHint: { fontSize: 14, color: '#64748b' },
  input: {
    backgroundColor: 'white',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    fontSize: 15,
  },
  buttonRow: { flexDirection: 'row', gap: 10 },
  status: { fontSize: 13, color: '#0f172a' },
  primaryButton: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#f8fafc', fontWeight: '700', fontSize: 14 },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#e2e8f0',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: { color: '#0f172a', fontWeight: '700', fontSize: 14 },
});
