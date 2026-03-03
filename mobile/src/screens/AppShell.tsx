import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { getSupabaseClient } from '../lib/supabase';
import QuickAddModal from '../components/QuickAddModal';
import LedgerScreen from './LedgerScreen';
import ReportsScreen from './ReportsScreen';
import SettingsScreen from './SettingsScreen';
import TransactionsScreen from './TransactionsScreen';

type TabKey = 'transactions' | 'ledger' | 'reports' | 'settings';

type CompanyUser = { company_id: string };

export default function AppShell({
  session,
  activeProfileLabel,
  onSwitchProject,
}: {
  session: any;
  activeProfileLabel: string;
  onSwitchProject?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<TabKey>('transactions');
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyMessage, setCompanyMessage] = useState('');
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const loadCompany = async () => {
      const currentUserId = String(session?.user?.id ?? '').trim();
      if (!currentUserId) {
        setCompanyId(null);
        setCompanyMessage('No signed-in user session found. Please sign in again.');
        return;
      }

      const { data, error } = await getSupabaseClient()
        .from('company_users')
        .select('company_id')
        .eq('user_id', currentUserId)
        .limit(1);

      if (error) {
        setCompanyId(null);
        setCompanyMessage('Unable to load company access right now. Pull to retry.');
        return;
      }

      if (data && data.length > 0) {
        setCompanyId((data[0] as CompanyUser).company_id);
        setCompanyMessage('');
        return;
      }

      setCompanyId(null);
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
                .eq('user_id', currentUserId)
                .limit(1);
              if (error) {
                setCompanyMessage(`Access refresh failed: ${error.message}`);
                return;
              }
              if (data && data.length > 0) {
                setCompanyId((data[0] as CompanyUser).company_id);
                setCompanyMessage('');
                return;
              }

              setCompanyMessage(
                'Still no company mapping for this signed-in email in the selected project.'
              );
            }}
          >
            <Text style={styles.refreshButtonText}>Refresh Access</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (activeTab === 'transactions') return <TransactionsScreen companyId={companyId} refreshKey={refreshKey} />;
    if (activeTab === 'ledger') return <LedgerScreen companyId={companyId} />;
    if (activeTab === 'reports') return <ReportsScreen companyId={companyId} />;
    return (
      <SettingsScreen
        companyId={companyId}
        onSignOut={() => getSupabaseClient().auth.signOut()}
        onSwitchProject={onSwitchProject}
      />
    );
  }, [activeTab, companyId, refreshKey, onSwitchProject]);

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Cash Books</Text>
      <Text style={styles.profileHint}>Project: {activeProfileLabel}</Text>
      <Text style={styles.profileHint}>
        Signed in as: {session?.user?.email ?? 'Unknown user'}
      </Text>
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
          label="Reports"
          icon="bar-chart-2"
          isActive={activeTab === 'reports'}
          onPress={() => setActiveTab('reports')}
        />
        <Tab
          label="Settings"
          icon="settings"
          isActive={activeTab === 'settings'}
          onPress={() => setActiveTab('settings')}
        />
        <TouchableOpacity style={styles.quickAddButton} onPress={() => setShowQuickAdd(true)}>
          <Text style={styles.quickAddText}>+</Text>
        </TouchableOpacity>
      </View>
      {companyId && (
        <QuickAddModal
          companyId={companyId}
          visible={showQuickAdd}
          onClose={() => setShowQuickAdd(false)}
          onCreated={() => setRefreshKey((prev) => prev + 1)}
        />
      )}
    </View>
  );
}

function Tab({
  label,
  icon,
  isActive,
  onPress,
}: {
  label: string;
  icon: keyof typeof Feather.glyphMap;
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
      <Feather name={icon} size={20} color={iconColor} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, paddingBottom: 10, backgroundColor: '#f8fafc' },
  header: { fontSize: 22, fontWeight: '700', marginBottom: 12 },
  profileHint: { fontSize: 12, color: '#64748b', marginTop: -8, marginBottom: 8 },
  tabs: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 10,
    backgroundColor: '#0f172a',
    borderRadius: 18,
    marginTop: 8,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 10,
    position: 'relative',
  },
  tab: {
    flex: 1,
    minHeight: 44,
    paddingVertical: 10,
    backgroundColor: 'rgba(248,250,252,0.08)',
    borderRadius: 14,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: '#f8fafc' },
  content: { flex: 1 },
  loading: { marginTop: 40, textAlign: 'center' },
  emptyState: {
    marginTop: 32,
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 10,
  },
  emptyDetail: { color: '#334155', fontSize: 12, lineHeight: 18 },
  refreshButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#0f172a',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  refreshButtonText: { color: '#f8fafc', fontSize: 12, fontWeight: '600' },
  centerSpacer: { width: 72 },
  quickAddButton: {
    position: 'absolute',
    top: -24,
    left: '50%',
    marginLeft: -30,
    width: 60,
    height: 60,
    borderRadius: 30,
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
  quickAddText: { color: '#0f172a', fontSize: 30, fontWeight: '800', marginTop: -2 },
});
