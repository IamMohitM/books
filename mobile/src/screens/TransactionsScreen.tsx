import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { formatDateDMY } from '../utils/date';

type JournalEntry = {
  id: string;
  date: string;
  entry_type: string;
  user_remark: string | null;
  created_by_email: string | null;
  main_account_name?: string | null;
  secondary_account_name?: string | null;
  amount?: number | null;
  main_is_debit?: boolean;
};

type EntryLine = {
  line_id: string;
  account_name: string;
  debit: number;
  credit: number;
};

export default function TransactionsScreen({ companyId, refreshKey }: { companyId: string; refreshKey: number }) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
  const [lines, setLines] = useState<EntryLine[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('journal_entries_with_user')
      .select('id,date,entry_type,user_remark,created_by_email')
      .eq('company_id', companyId)
      .eq('submitted', true)
      .order('date', { ascending: false })
      .limit(100);

    if (data && data.length > 0) {
      const entryIds = data.map((entry) => entry.id);
      const { data: lines } = await supabase
        .from('ledger_entries')
        .select('journal_entry_id,account_name,debit,credit')
        .in('journal_entry_id', entryIds);

      const lineMap = new Map<
        string,
        { account_name: string | null; amount: number; isDebit: boolean }
      >();
      const cashMap = new Map<
        string,
        { account_name: string | null; amount: number; isDebit: boolean }
      >();
      const lineGroups = new Map<
        string,
        { account_name: string | null; amount: number; isDebit: boolean }[]
      >();

      (lines ?? []).forEach((line: any) => {
        const debit = Number(line.debit ?? 0);
        const credit = Number(line.credit ?? 0);
        const amount = debit > 0 ? debit : credit;
        const isDebit = debit > 0;
        const accountName = String(line.account_name ?? '');
        const isCash = accountName.toLowerCase().includes('cash');
        if (isCash && amount > 0) {
          cashMap.set(line.journal_entry_id, {
            account_name: line.account_name ?? null,
            amount,
            isDebit,
          });
        }
        const existing = lineMap.get(line.journal_entry_id);
        if (
          !existing ||
          amount > existing.amount ||
          (amount === existing.amount && isDebit && !existing.isDebit)
        ) {
          lineMap.set(line.journal_entry_id, {
            account_name: line.account_name ?? null,
            amount,
            isDebit,
          });
        }

        const existingLines = lineGroups.get(line.journal_entry_id) ?? [];
        existingLines.push({
          account_name: line.account_name ?? null,
          amount,
          isDebit,
        });
        lineGroups.set(line.journal_entry_id, existingLines);
      });

      const merged = (data as JournalEntry[]).map((entry) => {
        const summary = cashMap.get(entry.id) ?? lineMap.get(entry.id);
        const lines = lineGroups.get(entry.id) ?? [];
        const topAccounts = lines
          .sort((a, b) => b.amount - a.amount)
          .map((line) => line.account_name)
          .filter((name): name is string => !!name);
        return {
          ...entry,
          main_account_name: summary?.account_name ?? null,
          secondary_account_name: topAccounts[1] ?? null,
          amount: summary?.amount ?? null,
          main_is_debit: summary?.isDebit ?? undefined,
        };
      });

      setEntries(merged);
    } else {
      setEntries([]);
    }
    setLoading(false);
  }, [companyId]);

  const loadLines = useCallback(async (entryId: string) => {
    setDetailsLoading(true);
    const { data } = await supabase
      .from('ledger_entries')
      .select('line_id,account_name,debit,credit')
      .eq('journal_entry_id', entryId)
      .eq('submitted', true)
      .order('account_name', { ascending: true });

    setLines((data ?? []) as EntryLine[]);
    setDetailsLoading(false);
  }, []);

  useEffect(() => {
    loadEntries();
  }, [loadEntries, refreshKey]);

  useEffect(() => {
    if (selectedEntry) {
      loadLines(selectedEntry.id);
    } else {
      setLines([]);
    }
  }, [selectedEntry, loadLines]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Transactions</Text>
      </View>
      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadEntries} />}
        contentContainerStyle={entries.length === 0 ? styles.emptyState : undefined}
        renderItem={({ item }) => (
          (() => {
            const isCashAccount =
              String(item.main_account_name ?? '').toLowerCase().includes('cash');
            const amountColor = isCashAccount
              ? item.main_is_debit
                ? styles.amountPositive
                : styles.amountNegative
              : styles.cardAmount;
            return (
          <TouchableOpacity
            style={styles.card}
            onPress={() => setSelectedEntry(item)}
            testID={`transaction-${item.id}`}
          >
            <View style={styles.cardRow}>
              <Text style={styles.cardTitle}>
                {item.secondary_account_name
                  ? `${item.main_account_name ?? 'Account'} • ${item.secondary_account_name}`
                  : item.main_account_name ?? 'Account'}
              </Text>
              <Text style={amountColor}>{item.amount ?? '-'}</Text>
            </View>
            <Text style={styles.cardMeta}>{formatDateDMY(item.date)}</Text>
          </TouchableOpacity>
            );
          })()
        )}
        ListEmptyComponent={
          loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color="#0f172a" />
              <Text style={styles.loadingText}>Loading transactions...</Text>
            </View>
          ) : (
            <Text style={styles.emptyText}>No submitted transactions yet.</Text>
          )
        }
      />
      <Modal visible={!!selectedEntry} animationType="slide" transparent>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setSelectedEntry(null)}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}} style={styles.modalCard} testID="transaction-details">
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Transaction Details</Text>
              <TouchableOpacity onPress={() => setSelectedEntry(null)}>
                <Text style={styles.modalClose}>Close</Text>
              </TouchableOpacity>
            </View>
            {selectedEntry && (
              <>
                <Text style={styles.modalMeta}>{selectedEntry.entry_type}</Text>
                <Text style={styles.modalMeta}>{formatDateDMY(selectedEntry.date)}</Text>
                <Text style={styles.modalMeta}>
                  {selectedEntry.created_by_email ?? 'Unknown'}
                </Text>
                {!!selectedEntry.user_remark && (
                  <Text style={styles.modalNote}>{selectedEntry.user_remark}</Text>
                )}
              </>
            )}
            <View style={styles.tableHeader}>
              <Text style={styles.tableHeaderAccount}>Account</Text>
              <Text style={styles.tableHeaderAmount}>Debit</Text>
              <Text style={styles.tableHeaderAmount}>Credit</Text>
            </View>
            {detailsLoading ? (
              <Text style={styles.modalMeta}>Loading...</Text>
              ) : (
                <FlatList
                  data={lines}
                  keyExtractor={(item) => item.line_id}
                  renderItem={({ item }) => (
                    <View style={styles.tableRow}>
                      <Text style={styles.tableAccount}>{item.account_name}</Text>
                      <Text style={styles.tableAmount}>{item.debit || '-'}</Text>
                      <Text style={styles.tableAmount}>{item.credit || '-'}</Text>
                    </View>
                  )}
                  ListEmptyComponent={<Text style={styles.modalMeta}>No lines found.</Text>}
                />
              )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '700' },
  card: { backgroundColor: 'white', padding: 14, borderRadius: 12, marginTop: 12 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  cardAmount: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  amountPositive: { fontSize: 16, fontWeight: '800', color: '#16a34a' },
  amountNegative: { fontSize: 16, fontWeight: '800', color: '#dc2626' },
  cardMeta: { fontSize: 14, color: '#64748b' },
  modalOverlay: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  modalCard: { margin: 20, backgroundColor: 'white', borderRadius: 14, padding: 18, maxHeight: '82%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  modalClose: { color: '#2563eb', fontSize: 14, fontWeight: '700' },
  modalMeta: { fontSize: 13, color: '#64748b', marginTop: 4 },
  modalNote: { marginTop: 8, fontSize: 13 },
  tableHeader: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  tableHeaderAccount: { flex: 1.4, fontSize: 13, fontWeight: '700', color: '#64748b' },
  tableHeaderAmount: { flex: 1, fontSize: 13, fontWeight: '700', color: '#64748b', textAlign: 'right' },
  tableRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  tableAccount: { flex: 1.4, fontSize: 14, fontWeight: '700', color: '#0f172a' },
  tableAmount: { flex: 1, fontSize: 14, color: '#0f172a', textAlign: 'right' },
  emptyState: { flexGrow: 1, justifyContent: 'center' },
  loadingWrap: { alignItems: 'center', gap: 8, marginTop: 16 },
  loadingText: { fontSize: 13, color: '#64748b' },
  emptyText: { fontSize: 13, color: '#64748b', textAlign: 'center', marginTop: 16 },
});
