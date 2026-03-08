import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { formatDateDMY } from '../utils/date';

type LedgerEntry = {
  line_id: string;
  date: string;
  account_name: string;
  debit: number;
  credit: number;
  entry_type: string;
};

export default function LedgerScreen({ companyId }: { companyId: string }) {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadLedger = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('ledger_entries')
        .select('line_id,date,account_name,debit,credit,entry_type')
        .eq('company_id', companyId)
        .eq('submitted', true)
        .eq('cancelled', false)
        .order('account_name', { ascending: true })
        .order('date', { ascending: true })
        .limit(500);

      if (data) {
        setEntries(data as LedgerEntry[]);
      }
      setLoading(false);
    };

    loadLedger();
  }, [companyId]);

  const displayRows = useMemo(() => {
    const rows: Array<
      | { type: 'header'; key: string; account: string }
      | {
          type: 'entry';
          key: string;
          date: string;
          debit: number;
          credit: number;
          balance: number;
          entryType: string;
          account: string;
        }
    > = [];

    let currentAccount = '';
    let running = 0;
    for (const entry of entries) {
      if (entry.account_name !== currentAccount) {
        currentAccount = entry.account_name;
        running = 0;
        rows.push({
          type: 'header',
          key: `header-${currentAccount}`,
          account: currentAccount,
        });
      }
      running += (entry.debit || 0) - (entry.credit || 0);
      rows.push({
        type: 'entry',
        key: entry.line_id,
        date: entry.date,
        debit: entry.debit || 0,
        credit: entry.credit || 0,
        balance: running,
        entryType: entry.entry_type,
        account: currentAccount,
      });
    }
    return rows;
  }, [entries]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Ledger</Text>
      <FlatList
        data={displayRows}
        keyExtractor={(item) => item.key}
        contentContainerStyle={displayRows.length === 0 ? styles.emptyState : undefined}
        renderItem={({ item }) => {
          if (item.type === 'header') {
            return (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{item.account}</Text>
              </View>
            );
          }
          return (
            <View style={styles.row}>
              <View style={styles.meta}>
                <Text style={styles.date}>{formatDateDMY(item.date)}</Text>
                <Text style={styles.entryType}>{item.entryType}</Text>
              </View>
              <View style={styles.amounts}>
                <Text style={styles.debit}>+{item.debit}</Text>
                <Text style={styles.credit}>-{item.credit}</Text>
                <Text style={styles.balance}>Bal {item.balance}</Text>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color="#0f172a" />
              <Text style={styles.loadingText}>Loading ledger...</Text>
            </View>
          ) : (
            <Text style={styles.emptyText}>No submitted entries yet.</Text>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 10 },
  sectionHeader: {
    marginTop: 10,
    marginBottom: 4,
    paddingHorizontal: 8,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  row: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  meta: { flex: 1 },
  date: { fontSize: 13, color: '#64748b' },
  entryType: { fontSize: 13, color: '#0f172a', marginTop: 2 },
  amounts: { alignItems: 'flex-end', gap: 2 },
  debit: { fontSize: 13, color: '#16a34a' },
  credit: { fontSize: 13, color: '#dc2626' },
  balance: { fontSize: 13, color: '#334155' },
  emptyState: { flexGrow: 1, justifyContent: 'center' },
  loadingWrap: { alignItems: 'center', gap: 8, marginTop: 16 },
  loadingText: { fontSize: 13, color: '#64748b' },
  emptyText: { fontSize: 13, color: '#64748b', textAlign: 'center', marginTop: 16 },
});
