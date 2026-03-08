import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';

type BalanceRow = {
  account_id: string;
  account_name: string;
  total_debit: number;
  total_credit: number;
  balance: number;
};

export default function ReportsScreen({ companyId }: { companyId: string }) {
  const [rows, setRows] = useState<BalanceRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadBalances = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('account_balances')
        .select('account_id,account_name,total_debit,total_credit,balance')
        .eq('company_id', companyId)
        .order('account_name', { ascending: true });

      if (data) {
        setRows(data as BalanceRow[]);
      }
      setLoading(false);
    };

    loadBalances();
  }, [companyId]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Reports</Text>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.account_id}
        contentContainerStyle={rows.length === 0 ? styles.emptyState : undefined}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.account}>{item.account_name}</Text>
            <Text style={styles.balance}>{item.balance}</Text>
          </View>
        )}
        ListEmptyComponent={
          loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color="#0f172a" />
              <Text style={styles.loadingText}>Loading reports...</Text>
            </View>
          ) : (
            <Text style={styles.emptyText}>No submitted balances yet.</Text>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 10 },
  row: {
    backgroundColor: 'white',
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  account: { fontSize: 15 },
  balance: { fontSize: 15, fontWeight: '700' },
  emptyState: { flexGrow: 1, justifyContent: 'center' },
  loadingWrap: { alignItems: 'center', gap: 8, marginTop: 16 },
  loadingText: { fontSize: 13, color: '#64748b' },
  emptyText: { fontSize: 13, color: '#64748b', textAlign: 'center', marginTop: 16 },
});
