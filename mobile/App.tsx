import React, { useEffect, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
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
  const [showProjectSwitcher, setShowProjectSwitcher] = useState(false);

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

    let mounted = true;
    let cleanup: (() => void) | null = null;
    const setupProfile = async () => {
      const client = await setActiveMobileProfile(selectedProfileId);
      if (!mounted) return;

      const { data } = await client.auth.getSession();
      if (mounted) {
        setSession(data.session);
      }

      const { data: listener } = client.auth.onAuthStateChange(
        (_event, newSession) => {
          if (mounted) {
            setSession(newSession);
          }
        }
      );

      // Also manually check for session in case listener doesn't fire immediately
      // This is especially important for signup which creates a session
      const checkSessionInterval = setInterval(async () => {
        if (!mounted) return;
        const { data } = await client.auth.getSession();
        if (mounted && data.session !== null) {
          setSession(data.session);
          clearInterval(checkSessionInterval);
        }
      }, 500);

      const localCleanup = () => {
        listener.subscription?.unsubscribe();
        clearInterval(checkSessionInterval);
      };
      cleanup = localCleanup;
      return localCleanup;
    };

    void setupProfile();
    return () => {
      mounted = false;
      cleanup?.();
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
      await setActiveMobileProfile(profile.id);
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
            try {
              await resetMobileProjectProfilesToDefault();

              // Force complete refresh
              const first = mobileProjectProfiles[0];
              if (first) {
                setSelectedProfileId(first.id);
              }
              setSession(null);
              setProfilesVersion((v) => v + 1);

              Alert.alert(
                'Profiles Reset',
                'All saved profiles cleared. App has been refreshed to default profile.'
              );
            } catch (error) {
              Alert.alert(
                'Reset Failed',
                `Could not complete reset: ${(error as Error).message}`
              );
            }
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
              ? () => setShowProjectSwitcher(true)
              : undefined
          }
        />
      ) : (
        <KeyboardAvoidingView
          style={styles.keyboard}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <ScrollView
              contentContainerStyle={styles.screen}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
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
                          onPress={() => {
                            void setActiveMobileProfile(profile.id);
                            setSelectedProfileId(profile.id);
                          }}
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
                  placeholder="Legacy Anon Key (not Secret Key)"
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
            </ScrollView>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      )}
      <Modal visible={showProjectSwitcher} animationType="slide" transparent>
        <View style={styles.switcherOverlay}>
          <View style={styles.switcherCard}>
            <Text style={styles.switcherTitle}>Switch Project</Text>
            <Text style={styles.switcherHint}>
              Select a project. You may be asked to sign in again.
            </Text>
            <View style={styles.switcherList}>
              {mobileProjectProfiles.map((profile) => {
                const active = profile.id === selectedProfileId;
                return (
                  <TouchableOpacity
                    key={profile.id}
                    style={[
                      styles.switcherRow,
                      active && styles.switcherRowActive,
                    ]}
                    onPress={async () => {
                      try {
                        const client = await setActiveMobileProfile(profile.id);
                        setSelectedProfileId(profile.id);
                        const { data } = await client.auth.getSession();
                        setSession(data.session);
                        setShowProjectSwitcher(false);
                      } catch (error) {
                        Alert.alert('Switch failed', (error as Error).message);
                      }
                    }}
                  >
                    <Text
                      style={[
                        styles.switcherLabel,
                        active && styles.switcherLabelActive,
                      ]}
                    >
                      {profile.label}
                    </Text>
                    {active && <Text style={styles.switcherActive}>Active</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity
              style={styles.switcherClose}
              onPress={() => setShowProjectSwitcher(false)}
            >
              <Text style={styles.switcherCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  keyboard: { flex: 1 },
  screen: { flexGrow: 1, padding: 24, justifyContent: 'center' },
  title: { fontSize: 30, fontWeight: '700', marginBottom: 18 },
  subtitle: { fontSize: 14, color: '#475569', marginBottom: 10 },
  profilePicker: { marginBottom: 12 },
  profileRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  profileChip: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  profileChipActive: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a',
  },
  profileChipText: { fontSize: 13, color: '#334155', fontWeight: '600' },
  profileChipTextActive: { color: '#f8fafc' },
  addProjectCard: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 14,
    backgroundColor: '#fff',
    marginBottom: 10,
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
    fontSize: 15,
  },
  addProjectButton: {
    borderRadius: 10,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    paddingVertical: 12,
  },
  addProjectButtonDisabled: { opacity: 0.55 },
  addProjectText: { color: '#f8fafc', fontWeight: '700', fontSize: 14 },
  resetProfilesButton: {
    borderRadius: 10,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    paddingVertical: 12,
  },
  resetProfilesText: { color: '#0f172a', fontWeight: '700', fontSize: 14 },
  switcherOverlay: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
    padding: 20,
  },
  switcherCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
    gap: 10,
  },
  switcherTitle: { fontSize: 18, fontWeight: '700' },
  switcherHint: { fontSize: 13, color: '#64748b' },
  switcherList: { gap: 8, marginTop: 6 },
  switcherRow: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#f8fafc',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  switcherRowActive: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  switcherLabel: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  switcherLabelActive: { color: '#f8fafc' },
  switcherActive: { fontSize: 12, color: '#f8fafc' },
  switcherClose: {
    marginTop: 4,
    borderRadius: 10,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    paddingVertical: 12,
  },
  switcherCloseText: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
});
