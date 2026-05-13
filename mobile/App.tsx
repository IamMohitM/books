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
  getSupabaseClient,
  loadMobileProjectProfilesFromDisk,
  mobileProjectProfiles,
  persistMobileProjectProfilesToDisk,
  removeMobileProjectProfile,
  resetMobileProjectProfilesToDefault,
  setActiveMobileProfile,
  validateMobileProjectCredentials,
} from './src/lib/supabase';
import AuthScreen from './src/screens/AuthScreen';
import AppShell from './src/screens/AppShell';

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [profilesReady, setProfilesReady] = useState(false);
  const [, setProfilesEpoch] = useState(0);
  const [profilesSnapshot, setProfilesSnapshot] = useState([...mobileProjectProfiles]);
  const [selectedProfileId, setSelectedProfileId] = useState(
    mobileProjectProfiles[0]?.id ?? ''
  );
  const [newProjectRef, setNewProjectRef] = useState('');
  const [newProjectKey, setNewProjectKey] = useState('');
  const [newProjectLabel, setNewProjectLabel] = useState('');
  const [validatingProject, setValidatingProject] = useState(false);
  const [showProjectSwitcher, setShowProjectSwitcher] = useState(false);
  const [showAddProjectModal, setShowAddProjectModal] = useState(false);
  const [projectStatus, setProjectStatus] = useState<string | null>(null);

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.alert(`${title}\n\n${message}`);
      setProjectStatus(message);
      return;
    }

    Alert.alert(title, message);
  };

  const confirmAlert = (title: string, message: string): Promise<boolean> => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return Promise.resolve(window.confirm(`${title}\n\n${message}`));
    }

    return new Promise((resolve) => {
      Alert.alert(title, message, [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'OK', onPress: () => resolve(true) },
      ]);
    });
  };

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
      setProfilesSnapshot([...mobileProjectProfiles]);
      setProfilesEpoch((value) => value + 1);
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

    if (!profilesSnapshot.find((profile) => profile.id === selectedProfileId)) {
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
      let attempts = 0;
      const maxAttempts = 20;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      const checkSession = async () => {
        if (!mounted) return;
        const { data } = await client.auth.getSession();
        if (mounted && data.session !== null) {
          setSession(data.session);
          return;
        }
        attempts += 1;
        if (attempts < maxAttempts) {
          timeoutId = setTimeout(checkSession, 500);
        }
      };
      void checkSession();

      const localCleanup = () => {
        listener.subscription?.unsubscribe();
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
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

  const hasProfiles = profilesSnapshot.length > 0;
  const hasMultipleProfiles = profilesSnapshot.length > 1;
  const selectedProfile =
    profilesSnapshot.find((p) => p.id === selectedProfileId) ??
    profilesSnapshot[0];

  const profilePicker = (
    <View style={styles.profilePicker}>
      <Text style={styles.subtitle}>Project</Text>
      <View style={styles.profileRow}>
        {profilesSnapshot.map((profile) => {
          const active = profile.id === selectedProfileId;
          return (
            <TouchableOpacity
              key={profile.id}
              style={[styles.profileChip, active && styles.profileChipActive]}
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
  );

  const addProjectProfile = async () => {
    try {
      setValidatingProject(true);
      setProjectStatus(null);
      const validation = await validateMobileProjectCredentials({
        projectRef: newProjectRef,
        anonKey: newProjectKey,
      });
      if (!validation.ok) {
        showAlert(
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
      setProfilesSnapshot([...mobileProjectProfiles]);
      setProfilesEpoch((value) => value + 1);
      setNewProjectRef('');
      setNewProjectKey('');
      setNewProjectLabel('');
      setShowAddProjectModal(false);
      setShowProjectSwitcher(false);
      setProjectStatus(`Project added: ${profile.label}`);
    } catch (error) {
      showAlert('Unable to add project', (error as Error).message);
    } finally {
      setValidatingProject(false);
    }
  };

  const resetProjectProfiles = async () => {
    const confirmed = await confirmAlert(
      'Reset project profiles?',
      'This will remove all saved profiles on this device and clear any defaults.'
    );
    if (!confirmed) {
      return;
    }

    try {
      await resetMobileProjectProfilesToDefault();

      // Force complete refresh
      setSelectedProfileId('');
      setSession(null);
      setProfilesSnapshot([...mobileProjectProfiles]);
      setProfilesEpoch((value) => value + 1);

      showAlert('Profiles Reset', 'All saved profiles cleared on this device.');
    } catch (error) {
      showAlert(
        'Reset Failed',
        `Could not complete reset: ${(error as Error).message}`
      );
    }
  };

  const openAddProjectModal = () => {
    setShowProjectSwitcher(false);
    setProjectStatus(null);
    setShowAddProjectModal(true);
  };

  const removeProjectProfile = async (profileId: string) => {
    const target = mobileProjectProfiles.find((profile) => profile.id === profileId);
    if (!target) {
      return;
    }

    const isActive = profileId === selectedProfileId;
    const isLast = mobileProjectProfiles.length <= 1;
    const confirmTitle = isActive && isLast
      ? `Remove ${target.label} and sign out?`
      : `Remove ${target.label}?`;
    const confirmMessage = isActive && isLast
      ? 'This removes the last saved profile and signs you out of this project.'
      : 'This removes only the saved profile from this device.';

    const confirmed = await confirmAlert(confirmTitle, confirmMessage);
    if (!confirmed) {
      return;
    }

    try {
      if (isActive && isLast) {
        await getSupabaseClient().auth.signOut();
      }

      if (isActive && !isLast) {
        const fallback = profilesSnapshot.find(
          (profile) => profile.id !== profileId
        );
        if (!fallback) {
          showAlert('Cannot remove profile', 'No alternate profile found.');
          return;
        }
        const client = await setActiveMobileProfile(fallback.id);
        setSelectedProfileId(fallback.id);
        const { data } = await client.auth.getSession();
        setSession(data.session);
      }

      await removeMobileProjectProfile(profileId);
      await persistMobileProjectProfilesToDisk();
      if (isActive && isLast) {
        setSelectedProfileId('');
        setSession(null);
      }
      setProfilesSnapshot([...mobileProjectProfiles]);
      setProfilesEpoch((value) => value + 1);
      showAlert('Profile removed', `${target.label} was removed.`);
    } catch (error) {
      showAlert('Unable to remove profile', (error as Error).message);
    }
  };

  const addProjectForm = (
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
      {!!projectStatus && <Text style={styles.projectStatus}>{projectStatus}</Text>}
    </View>
  );

  const authContent = (
    <>
      <Text style={styles.title}>Vaulta</Text>
      {!hasProfiles && (
        <Text style={styles.emptyHint}>
          No project configured yet. Add a project profile to continue.
        </Text>
      )}
      {hasMultipleProfiles && profilePicker}
      {addProjectForm}
      {hasProfiles && <AuthScreen activeProfileLabel={selectedProfile?.label ?? 'Project'} />}
    </>
  );

  return (
    <SafeAreaView style={styles.container}>
      {session ? (
        <AppShell
          session={session}
          activeProfileLabel={selectedProfile?.label ?? 'Project'}
          onSwitchProject={() => setShowProjectSwitcher(true)}
          onAddProject={openAddProjectModal}
        />
      ) : (
        <KeyboardAvoidingView
          style={styles.keyboard}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {Platform.OS === 'web' ? (
            <ScrollView
              contentContainerStyle={styles.screen}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {authContent}
            </ScrollView>
          ) : (
            <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
              <ScrollView
                contentContainerStyle={styles.screen}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {authContent}
              </ScrollView>
            </TouchableWithoutFeedback>
          )}
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
              {profilesSnapshot.map((profile) => {
                const active = profile.id === selectedProfileId;
                return (
                  <View key={profile.id} style={styles.switcherRowWrap}>
                    <TouchableOpacity
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
                    <TouchableOpacity
                      style={styles.switcherRemove}
                      onPress={() => removeProjectProfile(profile.id)}
                    >
                      <Text style={styles.switcherRemoveText}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
            <TouchableOpacity
              style={styles.switcherAdd}
              onPress={openAddProjectModal}
            >
              <Text style={styles.switcherAddText}>Add Project</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.switcherClose}
              onPress={() => setShowProjectSwitcher(false)}
            >
              <Text style={styles.switcherCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <Modal visible={showAddProjectModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.switcherOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.switcherCard}>
            <Text style={styles.switcherTitle}>Add Project</Text>
            <Text style={styles.switcherHint}>
              Add a new project without signing out.
            </Text>
            {addProjectForm}
            <TouchableOpacity
              style={styles.switcherClose}
              onPress={() => setShowAddProjectModal(false)}
            >
              <Text style={styles.switcherCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, width: '100%', backgroundColor: '#f8fafc' },
  keyboard: { flex: 1 },
  screen: { flexGrow: 1, padding: 24, justifyContent: 'center' },
  title: { fontSize: 30, fontWeight: '700', marginBottom: 18 },
  emptyHint: { fontSize: 14, color: '#64748b', marginBottom: 12 },
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
  projectStatus: { fontSize: 13, color: '#0f172a' },
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
  switcherRowWrap: { gap: 6 },
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
  switcherRemove: {
    alignSelf: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#fee2e2',
  },
  switcherRemoveText: { fontSize: 12, fontWeight: '700', color: '#b91c1c' },
  switcherAdd: {
    marginTop: 4,
    borderRadius: 10,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    paddingVertical: 12,
  },
  switcherAddText: { fontSize: 14, fontWeight: '700', color: '#f8fafc' },
  switcherClose: {
    marginTop: 4,
    borderRadius: 10,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    paddingVertical: 12,
  },
  switcherCloseText: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
});
