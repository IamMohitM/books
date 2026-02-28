import React, { useState } from 'react';
import { Alert, Button, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase';

export default function AuthScreen({
  activeProfileLabel,
}: {
  activeProfileLabel: string;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const signIn = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (error) Alert.alert('Sign in failed', error.message);
  };

  const signUp = async () => {
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) Alert.alert('Sign up failed', error.message);
    else {
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
