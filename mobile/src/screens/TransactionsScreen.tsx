import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';

type JournalEntry = {
  id: string;
  date: string;
  entry_type: string;
  user_remark: string | null;
  created_by_email: string | null;
};

export default function TransactionsScreen({ companyId, refreshKey }: { companyId: string; refreshKey: number }) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(false);

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

  useEffect(() => {
    loadEntries();
  }, [loadEntries, refreshKey]);

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
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{item.entry_type}</Text>
            <Text style={styles.cardMeta}>{item.date}</Text>
            <Text style={styles.cardMeta}>{item.created_by_email ?? 'Unknown'}</Text>
            {!!item.user_remark && <Text style={styles.cardNote}>{item.user_remark}</Text>}
          </View>
        )}
      />
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
});
