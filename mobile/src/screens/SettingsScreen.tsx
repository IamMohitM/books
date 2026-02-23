import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase, supabasePublicAnonKey, supabasePublicUrl } from '../lib/supabase';

type Collaborator = {
  user_id: string;
  role: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
};

type Props = {
  companyId: string;
  onSignOut: () => void;
};

export default function SettingsScreen({ companyId, onSignOut }: Props) {
  const [email, setEmail] = useState('');
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [inviting, setInviting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const loadCollaborators = async () => {
    const { data, error } = await supabase
      .from('company_users_with_profile')
      .select('user_id,role,email,full_name,created_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: true });

    if (!error && data) {
      setCollaborators(data as Collaborator[]);
    }
  };

  useEffect(() => {
    loadCollaborators();
  }, [companyId]);

  const invite = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setStatus('Enter an email to invite.');
      return;
    }

    setInviting(true);
    setStatus(null);
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      setInviting(false);
      setStatus('Invite failed. Please sign in again.');
      return;
    }

    let inviteError: string | null = null;
    try {
      const response = await fetch(`${supabasePublicUrl}/functions/v1/invite-user`, {
        method: 'POST',
        headers: {
          apikey: supabasePublicAnonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          companyId,
          email: trimmedEmail,
          role: 'editor',
          accessToken: session.access_token,
        }),
      });

      const text = await response.text();
      let parsed: any = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = null;
      }

      if (!response.ok) {
        inviteError = parsed?.error ?? `Invite failed (${response.status}).`;
        if (parsed?.token_source) {
          inviteError += ` (token: ${parsed.token_source}, len: ${parsed.token_length ?? 'n/a'})`;
        }
        if (parsed?.auth_error) {
          inviteError += ` [${parsed.auth_error}]`;
        }
        if (!parsed?.error && text) {
          inviteError += ` [raw: ${text}]`;
        }
      }
    } catch (err) {
      inviteError = err instanceof Error ? err.message : 'Invite failed.';
    }

    setInviting(false);
    if (inviteError) {
      if (inviteError.toLowerCase().includes('only owners')) {
        setStatus('Only owners can invite collaborators.');
      } else if (inviteError.toLowerCase().includes('missing') && inviteError.toLowerCase().includes('supabase')) {
        setStatus('Invite failed. Supabase function is missing env configuration.');
      } else {
        setStatus(inviteError);
      }
      return;
    }

    setEmail('');
    setStatus('Invite sent. If the user is new, a magic link was emailed.');
    loadCollaborators();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Invite collaborator</Text>
        <Text style={styles.sectionHint}>Owners can invite existing users by email.</Text>
        <View style={styles.inviteRow}>
          <TextInput
            style={styles.input}
            placeholder="email@company.com"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TouchableOpacity style={styles.inviteButton} onPress={invite} disabled={inviting}>
            <Text style={styles.inviteButtonText}>{inviting ? 'Inviting...' : 'Invite'}</Text>
          </TouchableOpacity>
        </View>
        {!!status && <Text style={styles.status}>{status}</Text>}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Collaborators</Text>
        <FlatList
          data={collaborators}
          keyExtractor={(item) => item.user_id}
          renderItem={({ item }) => (
            <View style={styles.collabRow}>
              <View>
                <Text style={styles.collabName}>{item.full_name || item.email || 'Unknown user'}</Text>
                <Text style={styles.collabEmail}>{item.email ?? 'No email'}</Text>
              </View>
              <Text style={styles.collabRole}>{item.role}</Text>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No collaborators yet.</Text>}
        />
      </View>

      <TouchableOpacity style={styles.signOutButton} onPress={onSignOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  sectionHint: { fontSize: 12, color: '#64748b', marginBottom: 8 },
  inviteRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderColor: '#e2e8f0', padding: 10, borderRadius: 8 },
  inviteButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#0f172a',
  },
  inviteButtonText: { color: '#f8fafc', fontSize: 12, fontWeight: '600' },
  status: { marginTop: 8, fontSize: 12, color: '#0f172a' },
  collabRow: {
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  collabName: { fontSize: 13, fontWeight: '600' },
  collabEmail: { fontSize: 12, color: '#64748b' },
  collabRole: { fontSize: 12, color: '#0f172a', fontWeight: '600' },
  empty: { fontSize: 12, color: '#64748b' },
  signOutButton: {
    marginTop: 'auto',
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
  },
  signOutText: { fontSize: 12, fontWeight: '600', color: '#0f172a' },
});
