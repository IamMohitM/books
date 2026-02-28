import React, { useEffect, useState } from 'react';
import {
  Alert,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  addOrUpdateMobileProjectProfile,
  loadMobileProjectProfilesFromDisk,
  mobileProjectProfiles,
  persistMobileProjectProfilesToDisk,
  resetMobileProjectProfilesToDefault,
  setActiveMobileProfile,
  validateMobileProjectCredentials,
} from './src/lib/supabase';
import AuthScreen from './src/screens/AuthScreen';
import AppShell from './src/screens/AppShell';

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [profilesReady, setProfilesReady] = useState(false);
  const [, setProfilesVersion] = useState(0);
  const [selectedProfileId, setSelectedProfileId] = useState(
    mobileProjectProfiles[0]?.id ?? 'default'
  );
  const [newProjectRef, setNewProjectRef] = useState('');
  const [newProjectKey, setNewProjectKey] = useState('');
  const [newProjectLabel, setNewProjectLabel] = useState('');
  const [validatingProject, setValidatingProject] = useState(false);

  useEffect(() => {
    let mounted = true;
    const hydrate = async () => {
      await loadMobileProjectProfilesFromDisk();
      if (!mounted) {
        return;
      }

      const nextActive = mobileProjectProfiles.find(
        (profile) => profile.id === selectedProfileId
      );
      if (!nextActive && mobileProjectProfiles[0]) {
        setSelectedProfileId(mobileProjectProfiles[0].id);
      }
      setProfilesVersion((v) => v + 1);
      setProfilesReady(true);
    };

    void hydrate();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!profilesReady) {
      return;
    }

    if (!mobileProjectProfiles.find((profile) => profile.id === selectedProfileId)) {
      return;
    }

    const client = setActiveMobileProfile(selectedProfileId);
    client.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const { data: listener } = client.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
      }
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [profilesReady, selectedProfileId]);

  const hasMultipleProfiles = mobileProjectProfiles.length > 1;
  const selectedProfile =
    mobileProjectProfiles.find((p) => p.id === selectedProfileId) ??
    mobileProjectProfiles[0];

  const addProjectProfile = async () => {
    try {
      setValidatingProject(true);
      const validation = await validateMobileProjectCredentials({
        projectRef: newProjectRef,
        anonKey: newProjectKey,
      });
      if (!validation.ok) {
        Alert.alert(
          'Unable to add project',
          validation.message ?? 'Project ref/key validation failed.'
        );
        return;
      }

      const profile = addOrUpdateMobileProjectProfile({
        projectRef: validation.normalizedProjectRef,
        anonKey: newProjectKey,
        label: newProjectLabel,
      });
      await persistMobileProjectProfilesToDisk();
      setSelectedProfileId(profile.id);
      setProfilesVersion((v) => v + 1);
      setNewProjectRef('');
      setNewProjectKey('');
      setNewProjectLabel('');
      Alert.alert('Project added', `Added ${profile.label}`);
    } catch (error) {
      Alert.alert('Unable to add project', (error as Error).message);
    } finally {
      setValidatingProject(false);
    }
  };

  const resetProjectProfiles = () => {
    Alert.alert(
      'Reset project profiles?',
      'This will remove all saved profiles on this device and restore default profile from app environment.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            await resetMobileProjectProfilesToDefault();
            const first = mobileProjectProfiles[0];
            if (first) {
              setSelectedProfileId(first.id);
            }
            setSession(null);
            setProfilesVersion((v) => v + 1);
            Alert.alert('Profiles reset', 'Saved project profiles were cleared.');
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {session ? (
        <AppShell
          session={session}
          activeProfileLabel={selectedProfile?.label ?? 'Project'}
          onSwitchProject={
            hasMultipleProfiles
              ? () => {
                  setSession(null);
                }
              : undefined
          }
        />
      ) : (
        <View style={styles.screen}>
          <Text style={styles.title}>Cash Books</Text>
          {hasMultipleProfiles && (
            <View style={styles.profilePicker}>
              <Text style={styles.subtitle}>Project</Text>
              <View style={styles.profileRow}>
                {mobileProjectProfiles.map((profile) => {
                  const active = profile.id === selectedProfileId;
                  return (
                    <TouchableOpacity
                      key={profile.id}
                      style={[
                        styles.profileChip,
                        active && styles.profileChipActive,
                      ]}
                      onPress={() => setSelectedProfileId(profile.id)}
                    >
                      <Text
                        style={[
                          styles.profileChipText,
                          active && styles.profileChipTextActive,
                        ]}
                      >
                        {profile.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}
          <View style={styles.addProjectCard}>
            <Text style={styles.subtitle}>Add Project (one-time)</Text>
            <TextInput
              style={styles.input}
              placeholder="Project ref (abcd1234...)"
              autoCapitalize="none"
              value={newProjectRef}
              onChangeText={setNewProjectRef}
            />
            <TextInput
              style={styles.input}
              placeholder="Publishable/anon key"
              autoCapitalize="none"
              value={newProjectKey}
              onChangeText={setNewProjectKey}
            />
            <TextInput
              style={styles.input}
              placeholder="Optional label"
              autoCapitalize="words"
              value={newProjectLabel}
              onChangeText={setNewProjectLabel}
            />
            <TouchableOpacity
              style={[
                styles.addProjectButton,
                validatingProject && styles.addProjectButtonDisabled,
              ]}
              onPress={addProjectProfile}
              disabled={validatingProject}
            >
              <Text style={styles.addProjectText}>
                {validatingProject ? 'Validating...' : 'Add Project Profile'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.resetProfilesButton}
              onPress={resetProjectProfiles}
            >
              <Text style={styles.resetProfilesText}>Reset Saved Profiles</Text>
            </TouchableOpacity>
          </View>
          <AuthScreen activeProfileLabel={selectedProfile?.label ?? 'Project'} />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  screen: { flex: 1, padding: 20, justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 16 },
  subtitle: { fontSize: 12, color: '#475569', marginBottom: 8 },
  profilePicker: { marginBottom: 12 },
  profileRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  profileChip: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#fff',
  },
  profileChipActive: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a',
  },
  profileChipText: { fontSize: 12, color: '#334155', fontWeight: '600' },
  profileChipTextActive: { color: '#f8fafc' },
  addProjectCard: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#fff',
    marginBottom: 10,
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  addProjectButton: {
    borderRadius: 8,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    paddingVertical: 10,
  },
  addProjectButtonDisabled: { opacity: 0.55 },
  addProjectText: { color: '#f8fafc', fontWeight: '600', fontSize: 12 },
  resetProfilesButton: {
    borderRadius: 8,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    paddingVertical: 10,
  },
  resetProfilesText: { color: '#0f172a', fontWeight: '600', fontSize: 12 },
});
