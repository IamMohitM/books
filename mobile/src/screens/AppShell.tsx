import React, { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { getSupabaseClient } from '../lib/supabase';
import QuickAddModal from '../components/QuickAddModal';
import LedgerScreen from './LedgerScreen';
import SettingsScreen from './SettingsScreen';
import TransactionsScreen from './TransactionsScreen';
import CashSummaryScreen from './CashSummaryScreen';

type TabKey = 'transactions' | 'ledger' | 'cash' | 'settings';

type CompanyUser = { company_id: string };

const getCompanySelectionKey = (userId: string) => `mobile-company-selection-${userId}`;
const formatCompanyId = (companyId: string) => {
  if (!companyId) return 'Unknown';
  if (companyId.length <= 8) return companyId;
  return `${companyId.slice(0, 4)}...${companyId.slice(-4)}`;
};

export default function AppShell({
  session,
  activeProfileLabel,
  onSwitchProject,
  onAddProject,
}: {
  session: any;
  activeProfileLabel: string;
  onSwitchProject?: () => void;
  onAddProject?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<TabKey>('transactions');
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyOptions, setCompanyOptions] = useState<string[]>([]);
  const [companyMessage, setCompanyMessage] = useState('');
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showCompanyPicker, setShowCompanyPicker] = useState(false);

  const persistCompanySelection = async (nextCompanyId: string) => {
    const currentUserId = String(session?.user?.id ?? '').trim();
    if (!currentUserId) return;
    const storageKey = getCompanySelectionKey(currentUserId);
    try {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        localStorage.setItem(storageKey, nextCompanyId);
      } else {
        await AsyncStorage.setItem(storageKey, nextCompanyId);
      }
    } catch {
      // Ignore storage errors.
    }
  };

  const selectCompany = async (nextCompanyId: string) => {
    setCompanyId(nextCompanyId);
    setCompanyMessage('');
    setShowCompanyPicker(false);
    await persistCompanySelection(nextCompanyId);
  };

  useEffect(() => {
    const loadCompany = async () => {
      const currentUserId = String(session?.user?.id ?? '').trim();
      if (!currentUserId) {
        setCompanyId(null);
        setCompanyOptions([]);
        setCompanyMessage('No signed-in user session found. Please sign in again.');
        return;
      }

      const { data, error } = await getSupabaseClient()
        .from('company_users')
        .select('company_id')
        .eq('user_id', currentUserId);

      if (error) {
        setCompanyId(null);
        setCompanyOptions([]);
        setCompanyMessage('Unable to load company access right now. Pull to retry.');
        return;
      }

      const rows = (data ?? []) as CompanyUser[];
      const uniqueCompanyIds = Array.from(
        new Set(rows.map((row) => String(row.company_id ?? '').trim()).filter(Boolean))
      );
      if (uniqueCompanyIds.length > 0) {
        setCompanyOptions(uniqueCompanyIds);
        let preferred = uniqueCompanyIds[0];
        try {
          const storageKey = getCompanySelectionKey(currentUserId);
          const stored =
            Platform.OS === 'web' && typeof localStorage !== 'undefined'
              ? localStorage.getItem(storageKey)
              : await AsyncStorage.getItem(storageKey);
        if (stored && uniqueCompanyIds.includes(stored)) {
          preferred = stored;
        }
      } catch {
        // Fall back to first company.
      }
        setCompanyId(preferred);
        setCompanyMessage('');
        await persistCompanySelection(preferred);
        return;
      }

      setCompanyId(null);
      setCompanyOptions([]);
      setCompanyMessage(
        'Your account exists, but this email is not yet assigned to a company in this project. Ask an owner to invite this email as collaborator, then tap Refresh Access.'
      );
    };

    void loadCompany();
  }, [session?.user?.id]);

  const content = useMemo(() => {
    if (!companyId) {
      return (
        <View style={styles.emptyState}>
          <Text style={styles.loading}>No company assigned.</Text>
          {!!companyMessage && <Text style={styles.emptyDetail}>{companyMessage}</Text>}
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={async () => {
              const currentUserId = String(session?.user?.id ?? '').trim();
              if (!currentUserId) {
                setCompanyMessage('No signed-in user session found. Please sign in again.');
                return;
              }

              const { data, error } = await getSupabaseClient()
                .from('company_users')
                .select('company_id')
                .eq('user_id', currentUserId);
              if (error) {
                setCompanyMessage(`Access refresh failed: ${error.message}`);
                return;
              }
              const rows = (data ?? []) as CompanyUser[];
              const uniqueCompanyIds = Array.from(
                new Set(rows.map((row) => String(row.company_id ?? '').trim()).filter(Boolean))
              );
              if (uniqueCompanyIds.length > 0) {
                setCompanyOptions(uniqueCompanyIds);
                const preferred = uniqueCompanyIds[0];
                await selectCompany(preferred);
                return;
              }

              setCompanyMessage(
                'Still no company mapping for this signed-in email in the selected project.'
              );
            }}
          >
            <Text style={styles.refreshButtonText}>Refresh Access</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.emptySignOutButton}
            onPress={() => getSupabaseClient().auth.signOut()}
          >
            <Text style={styles.emptySignOutText}>Sign Out</Text>
          </TouchableOpacity>
          {!!onSwitchProject && (
            <TouchableOpacity style={styles.emptySwitchButton} onPress={onSwitchProject}>
              <Text style={styles.emptySwitchText}>Switch Project</Text>
            </TouchableOpacity>
          )}
          {!!onAddProject && (
            <TouchableOpacity style={styles.emptyAddProjectButton} onPress={onAddProject}>
              <Text style={styles.emptyAddProjectText}>Add Project</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    if (activeTab === 'transactions')
      return <TransactionsScreen companyId={companyId} refreshKey={refreshKey} />;
    if (activeTab === 'ledger') return <LedgerScreen companyId={companyId} />;
    if (activeTab === 'cash') return <CashSummaryScreen companyId={companyId} />;
    return (
      <SettingsScreen
        companyId={companyId}
        onSignOut={() => getSupabaseClient().auth.signOut()}
        onSwitchProject={onSwitchProject}
        onAddProject={onAddProject}
      />
    );
  }, [activeTab, companyId, refreshKey, onSwitchProject, onAddProject]);

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Cash Books</Text>
      <Text style={styles.profileHint}>Project: {activeProfileLabel}</Text>
      <Text style={styles.profileHint}>
        Signed in as: {session?.user?.email ?? 'Unknown user'}
      </Text>
      {companyId && companyOptions.length > 1 && (
        <View style={styles.companyRow}>
          <Text style={styles.companyLabel}>Company: {formatCompanyId(companyId)}</Text>
          <TouchableOpacity
            style={styles.companySwitchButton}
            onPress={() => setShowCompanyPicker(true)}
          >
            <Text style={styles.companySwitchText}>Switch Company</Text>
          </TouchableOpacity>
        </View>
      )}
      <View style={styles.content}>{content}</View>
      <View style={styles.tabs}>
        <Tab
          label="Transactions"
          icon="list"
          isActive={activeTab === 'transactions'}
          onPress={() => setActiveTab('transactions')}
        />
        <Tab
          label="Ledger"
          icon="book-open"
          isActive={activeTab === 'ledger'}
          onPress={() => setActiveTab('ledger')}
        />
        <View style={styles.centerSpacer} />
        <Tab
          label="Cash"
          symbol="₹"
          isActive={activeTab === 'cash'}
          onPress={() => setActiveTab('cash')}
        />
        <Tab
          label="Settings"
          icon="settings"
          isActive={activeTab === 'settings'}
          onPress={() => setActiveTab('settings')}
        />
        <View style={styles.quickAddAnchor}>
          <TouchableOpacity style={styles.quickAddButton} onPress={() => setShowQuickAdd(true)}>
            <Text style={styles.quickAddText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>
      {companyId && (
        <QuickAddModal
          companyId={companyId}
          visible={showQuickAdd}
          onClose={() => setShowQuickAdd(false)}
          onCreated={() => setRefreshKey((prev) => prev + 1)}
        />
      )}
      <Modal visible={showCompanyPicker} animationType="slide" transparent>
        <View style={styles.companyPickerOverlay}>
          <View style={styles.companyPickerCard}>
            <Text style={styles.companyPickerTitle}>Select Company</Text>
            {companyOptions.map((id) => {
              const active = id === companyId;
              return (
                <TouchableOpacity
                  key={id}
                  style={[styles.companyPickerRow, active && styles.companyPickerRowActive]}
                  onPress={() => selectCompany(id)}
                >
                  <Text style={[styles.companyPickerText, active && styles.companyPickerTextActive]}>
                    {formatCompanyId(id)}
                  </Text>
                  {active && <Text style={styles.companyPickerActive}>Active</Text>}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={styles.companyPickerClose}
              onPress={() => setShowCompanyPicker(false)}
            >
              <Text style={styles.companyPickerCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Tab({
  label,
  icon,
  symbol,
  isActive,
  onPress,
}: {
  label: string;
  icon?: keyof typeof Feather.glyphMap;
  symbol?: string;
  isActive: boolean;
  onPress: () => void;
}) {
  const iconColor = isActive ? '#0f172a' : '#e2e8f0';
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.tab, isActive && styles.tabActive]}
      accessibilityLabel={label}
    >
      {symbol ? (
        <Text style={[styles.tabSymbol, { color: iconColor }]}>{symbol}</Text>
      ) : (
        <Feather name={icon!} size={22} color={iconColor} />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    paddingHorizontal: 18,
    paddingTop: Platform.OS === 'web' ? 24 : 20,
    paddingBottom: Platform.OS === 'web' ? 16 : 12,
    backgroundColor: '#f8fafc',
  },
  header: { fontSize: 24, fontWeight: '700', marginBottom: 12 },
  profileHint: { fontSize: 14, color: '#64748b', marginTop: -6, marginBottom: 8 },
  companyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  companyLabel: { fontSize: 13, color: '#0f172a', fontWeight: '600' },
  companySwitchButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#0f172a',
    borderRadius: 8,
  },
  companySwitchText: { fontSize: 12, color: '#f8fafc', fontWeight: '700' },
  tabs: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#0f172a',
    borderRadius: 22,
    marginTop: 2,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 10,
    position: 'relative',
  },
  tab: {
    width: 52,
    minHeight: 50,
    paddingVertical: 12,
    backgroundColor: 'rgba(248,250,252,0.08)',
    borderRadius: 14,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: '#f8fafc' },
  tabSymbol: { fontSize: 24, fontWeight: '700', lineHeight: 24 },
  content: {
    flex: 1,
    paddingBottom: Platform.OS === 'web' ? 14 : 8,
  },
  loading: { marginTop: 40, textAlign: 'center', fontSize: 15 },
  emptyState: {
    marginTop: 32,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 12,
  },
  emptyDetail: { color: '#334155', fontSize: 13, lineHeight: 20 },
  refreshButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#0f172a',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  refreshButtonText: { color: '#f8fafc', fontSize: 14, fontWeight: '700' },
  emptySignOutButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  emptySignOutText: { color: '#0f172a', fontSize: 14, fontWeight: '700' },
  emptySwitchButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#0f172a',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  emptySwitchText: { color: '#f8fafc', fontSize: 14, fontWeight: '700' },
  emptyAddProjectButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#0f172a',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  emptyAddProjectText: { color: '#f8fafc', fontSize: 14, fontWeight: '700' },
  centerSpacer: { width: 84 },
  quickAddAnchor: {
    position: 'absolute',
    top: -26,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  quickAddButton: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#38bdf8',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#0f172a',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
  quickAddText: { color: '#0f172a', fontSize: 32, fontWeight: '800', marginTop: -2 },
  companyPickerOverlay: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    padding: 20,
  },
  companyPickerCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
    gap: 10,
  },
  companyPickerTitle: { fontSize: 18, fontWeight: '700' },
  companyPickerRow: {
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
  companyPickerRowActive: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  companyPickerText: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  companyPickerTextActive: { color: '#f8fafc' },
  companyPickerActive: { fontSize: 12, color: '#f8fafc', fontWeight: '700' },
  companyPickerClose: {
    marginTop: 6,
    borderRadius: 10,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    paddingVertical: 12,
  },
  companyPickerCloseText: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
});
