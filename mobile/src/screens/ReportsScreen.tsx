import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
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

  useEffect(() => {
    const loadBalances = async () => {
      const { data } = await supabase
        .from('account_balances')
        .select('account_id,account_name,total_debit,total_credit,balance')
        .eq('company_id', companyId)
        .order('account_name', { ascending: true });

      if (data) {
        setRows(data as BalanceRow[]);
      }
    };

    loadBalances();
  }, [companyId]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Reports</Text>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.account_id}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.account}>{item.account_name}</Text>
            <Text style={styles.balance}>{item.balance}</Text>
          </View>
        )}
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
});
