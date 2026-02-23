import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';

type JournalEntry = {
  id: string;
  date: string;
  entry_type: string;
  user_remark: string | null;
  created_by_email: string | null;
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
      .order('date', { ascending: false })
      .limit(100);

    if (data) {
      setEntries(data as JournalEntry[]);
    }
    setLoading(false);
  }, [companyId]);

  const loadLines = useCallback(async (entryId: string) => {
    setDetailsLoading(true);
    const { data } = await supabase
      .from('ledger_entries')
      .select('line_id,account_name,debit,credit')
      .eq('journal_entry_id', entryId)
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
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => setSelectedEntry(item)}
            testID={`transaction-${item.id}`}
          >
            <Text style={styles.cardTitle}>{item.entry_type}</Text>
            <Text style={styles.cardMeta}>{item.date}</Text>
            <Text style={styles.cardMeta}>{item.created_by_email ?? 'Unknown'}</Text>
            {!!item.user_remark && <Text style={styles.cardNote}>{item.user_remark}</Text>}
          </TouchableOpacity>
        )}
      />
      <Modal visible={!!selectedEntry} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard} testID="transaction-details">
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Transaction Details</Text>
              <TouchableOpacity onPress={() => setSelectedEntry(null)}>
                <Text style={styles.modalClose}>Close</Text>
              </TouchableOpacity>
            </View>
            {selectedEntry && (
              <>
                <Text style={styles.modalMeta}>{selectedEntry.entry_type}</Text>
                <Text style={styles.modalMeta}>{selectedEntry.date}</Text>
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
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '600' },
  card: { backgroundColor: 'white', padding: 12, borderRadius: 10, marginTop: 10 },
  cardTitle: { fontSize: 14, fontWeight: '600' },
  cardMeta: { fontSize: 12, color: '#64748b' },
  cardNote: { marginTop: 6, fontSize: 12 },
  modalOverlay: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  modalCard: { margin: 20, backgroundColor: 'white', borderRadius: 12, padding: 16, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: 16, fontWeight: '700' },
  modalClose: { color: '#2563eb', fontSize: 13, fontWeight: '600' },
  modalMeta: { fontSize: 12, color: '#64748b', marginTop: 4 },
  modalNote: { marginTop: 6, fontSize: 12 },
  tableHeader: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  tableHeaderAccount: { flex: 1.4, fontSize: 12, fontWeight: '600', color: '#64748b' },
  tableHeaderAmount: { flex: 1, fontSize: 12, fontWeight: '600', color: '#64748b', textAlign: 'right' },
  tableRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  tableAccount: { flex: 1.4, fontSize: 13, fontWeight: '600', color: '#0f172a' },
  tableAmount: { flex: 1, fontSize: 13, color: '#0f172a', textAlign: 'right' },
});
