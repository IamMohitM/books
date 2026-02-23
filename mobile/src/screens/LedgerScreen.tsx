import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';

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

  useEffect(() => {
    const loadLedger = async () => {
      const { data } = await supabase
        .from('ledger_entries')
        .select('line_id,date,account_name,debit,credit,entry_type')
        .eq('company_id', companyId)
        .order('account_name', { ascending: true })
        .order('date', { ascending: true })
        .limit(500);

      if (data) {
        setEntries(data as LedgerEntry[]);
      }
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
                <Text style={styles.date}>{item.date}</Text>
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
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  sectionHeader: {
    marginTop: 10,
    marginBottom: 4,
    paddingHorizontal: 6,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  row: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  meta: { flex: 1 },
  date: { fontSize: 12, color: '#64748b' },
  entryType: { fontSize: 12, color: '#0f172a', marginTop: 2 },
  amounts: { alignItems: 'flex-end', gap: 2 },
  debit: { fontSize: 12, color: '#16a34a' },
  credit: { fontSize: 12, color: '#dc2626' },
  balance: { fontSize: 12, color: '#334155' },
});
