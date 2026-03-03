import React, { useState } from 'react';
import { Alert, Button, StyleSheet, Text, TextInput, View } from 'react-native';
import { getSupabaseClient, classifyAuthError, testSupabaseConnection, getActiveMobileProfile } from '../lib/supabase';

export default function AuthScreen({
  activeProfileLabel,
}: {
  activeProfileLabel: string;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const normalizeEmail = (value: string) =>
    String(value ?? '')
      .trim()
      .toLowerCase();

  const mapSignInErrorMessage = (message: string) => {
    const normalized = String(message ?? '').toLowerCase();
    if (normalized.includes('invalid login credentials')) {
      return "Incorrect password, or user doesn't exist in this project yet. If new, sign up first.";
    }

    if (normalized.includes('email not confirmed')) {
      return 'Email not confirmed yet. Confirm your email first, then sign in.';
    }

    if (normalized.includes('too many requests')) {
      return 'Too many attempts. Please wait and try again.';
    }

    return message;
  };

  const signIn = async () => {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !password) {
      Alert.alert('Sign in failed', 'Email and password are required.');
      return;
    }

    setLoading(true);

    // Test connection first
    const profile = getActiveMobileProfile();
    const connectionTest = await testSupabaseConnection(profile.url, profile.anonKey);

    if (!connectionTest.ok) {
      setLoading(false);
      Alert.alert('Connection error', connectionTest.message);
      return;
    }

    const { error } = await getSupabaseClient().auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });
    setLoading(false);

    if (error) {
      const classified = classifyAuthError(error);
      Alert.alert('Sign in failed', classified.userMessage);
    }
  };

  const signUp = async () => {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !password) {
      Alert.alert('Sign up failed', 'Email and password are required.');
      return;
    }

    setLoading(true);
    const client = getSupabaseClient();
    const { data, error } = await client.auth.signUp({
      email: normalizedEmail,
      password,
    });
    setLoading(false);
    if (error) {
      Alert.alert('Sign up failed', error.message);
    } else {
      const identities = data?.user?.identities;
      const existingUserReturned =
        Array.isArray(identities) && identities.length === 0;
      if (existingUserReturned) {
        Alert.alert(
          'Account already exists',
          'This email already exists in the selected project. Use Sign In or Reset Password.'
        );
        return;
      }

      const hasSession = Boolean(data?.session);
      Alert.alert(
        hasSession ? 'Signed up' : 'Check your email for confirmation',
        hasSession
          ? 'Account created. If you do not see company data yet, ask an owner to invite your email to this company.'
          : 'Account created. After confirming email, sign in and ask an owner to invite your email to this company.'
      );
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
      <View style={styles.buttonRow}>
        <Button title={loading ? '...' : 'Sign In'} onPress={signIn} />
        <Button title={loading ? '...' : 'Sign Up'} onPress={signUp} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  profileHint: { fontSize: 12, color: '#64748b' },
  input: {
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  buttonRow: { flexDirection: 'row', justifyContent: 'space-between' },
});
