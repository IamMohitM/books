import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import QuickAddModal from '../components/QuickAddModal';
import LedgerScreen from './LedgerScreen';
import ReportsScreen from './ReportsScreen';
import SettingsScreen from './SettingsScreen';
import TransactionsScreen from './TransactionsScreen';

type TabKey = 'transactions' | 'ledger' | 'reports' | 'settings';

type CompanyUser = { company_id: string };

export default function AppShell({ session }: { session: any }) {
  const [activeTab, setActiveTab] = useState<TabKey>('transactions');
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const loadCompany = async () => {
      const { data, error } = await supabase
        .from('company_users')
        .select('company_id')
        .limit(1);

      if (!error && data && data.length > 0) {
        setCompanyId((data[0] as CompanyUser).company_id);
      }
    };

    loadCompany();
  }, []);

  const content = useMemo(() => {
    if (!companyId) {
      return <Text style={styles.loading}>No company assigned.</Text>;
    }

    if (activeTab === 'transactions') return <TransactionsScreen companyId={companyId} refreshKey={refreshKey} />;
    if (activeTab === 'ledger') return <LedgerScreen companyId={companyId} />;
    if (activeTab === 'reports') return <ReportsScreen companyId={companyId} />;
    return <SettingsScreen companyId={companyId} onSignOut={() => supabase.auth.signOut()} />;
  }, [activeTab, companyId, refreshKey]);

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Cash Books</Text>
      <View style={styles.content}>{content}</View>
      <View style={styles.tabs}>
        <Tab label="Transactions" isActive={activeTab === 'transactions'} onPress={() => setActiveTab('transactions')} />
        <Tab label="Ledger" isActive={activeTab === 'ledger'} onPress={() => setActiveTab('ledger')} />
        <View style={styles.centerSpacer} />
        <Tab label="Reports" isActive={activeTab === 'reports'} onPress={() => setActiveTab('reports')} />
        <Tab label="Settings" isActive={activeTab === 'settings'} onPress={() => setActiveTab('settings')} />
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

function Tab({ label, isActive, onPress }: { label: string; isActive: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.tab, isActive && styles.tabActive]}>
      <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, paddingBottom: 4, backgroundColor: '#f8fafc' },
  header: { fontSize: 22, fontWeight: '700', marginBottom: 12 },
  tabs: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 6,
    paddingTop: 10,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    position: 'relative',
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    backgroundColor: '#e2e8f0',
    borderRadius: 12,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: '#0f172a' },
  tabText: { fontSize: 11, color: '#0f172a' },
  tabTextActive: { color: '#f8fafc' },
  content: { flex: 1 },
  loading: { marginTop: 40, textAlign: 'center' },
  centerSpacer: { width: 64 },
  quickAddButton: {
    position: 'absolute',
    top: -18,
    left: '50%',
    marginLeft: -28,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#f8fafc',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
  quickAddText: { color: '#f8fafc', fontSize: 28, fontWeight: '700', marginTop: -2 },
});
