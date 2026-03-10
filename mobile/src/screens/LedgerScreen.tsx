import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { formatDateDMY } from '../utils/date';

type LedgerEntry = {
  line_id: string;
  date: string;
  account_name: string;
  debit: number;
  credit: number;
  entry_type: string;
  account_id?: string;
};

type AccountRow = {
  id: string;
  name: string;
};

export default function LedgerScreen({ companyId }: { companyId: string }) {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [accountsSource, setAccountsSource] = useState<'accounts' | 'ledger' | null>(null);
  const [search, setSearch] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<AccountRow | null>(null);

  useEffect(() => {
    const loadLedger = async () => {
      if (!selectedAccount) {
        setEntries([]);
        return;
      }

      setLoading(true);
      const { data } = await supabase
        .from('ledger_entries')
        .select('line_id,date,account_name,debit,credit,entry_type,account_id')
        .eq('company_id', companyId)
        .eq('submitted', true)
        .eq('account_id', selectedAccount.id)
        .order('date', { ascending: true })
        .limit(500);

      if (data) {
        setEntries(data as LedgerEntry[]);
      } else {
        setEntries([]);
      }
      setLoading(false);
    };

    loadLedger();
  }, [companyId, selectedAccount]);

  useEffect(() => {
    const loadAccounts = async () => {
      setAccountsLoading(true);
      setAccountsError(null);
      const { data, error } = await supabase
        .rpc('fetch_accounts_for_company', { target_company: companyId })
        .order('name', { ascending: true });

      if (!error && data && data.length > 0) {
        setAccounts(data as AccountRow[]);
        setAccountsSource('accounts');
        setAccountsLoading(false);
        return;
      }

      if (error) {
        setAccountsError(error.message);
      }

      const { data: ledgerData, error: ledgerError } = await supabase
        .from('ledger_entries')
        .select('account_id,account_name')
        .eq('company_id', companyId)
        .eq('submitted', true)
        .order('account_name', { ascending: true });

      if (ledgerError) {
        setAccountsError(ledgerError.message);
        setAccounts([]);
        setAccountsSource(null);
        setAccountsLoading(false);
        return;
      }

      const unique = new Map<string, AccountRow>();
      (ledgerData ?? []).forEach((row: any) => {
        const id = String(row.account_id ?? '').trim();
        const name = String(row.account_name ?? '').trim();
        if (id && name && !unique.has(id)) {
          unique.set(id, { id, name });
        }
      });
      const fallback = Array.from(unique.values());
      setAccounts(fallback);
      setAccountsSource('ledger');
      setAccountsLoading(false);
    };

    loadAccounts();
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

    let running = 0;
    for (const entry of entries) {
      running += (entry.debit || 0) - (entry.credit || 0);
      rows.push({
        type: 'entry',
        key: entry.line_id,
        date: entry.date,
        debit: entry.debit || 0,
        credit: entry.credit || 0,
        balance: running,
        entryType: entry.entry_type,
        account: entry.account_name,
      });
    }
    return rows;
  }, [entries]);

  const filteredAccounts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return accounts;
    }
    return accounts.filter((acc) => acc.name.toLowerCase().includes(query));
  }, [accounts, search]);

  const accountTotals = useMemo(() => {
    return entries.reduce(
      (acc, row) => {
        acc.debit += Number(row.debit ?? 0);
        acc.credit += Number(row.credit ?? 0);
        acc.balance += Number(row.debit ?? 0) - Number(row.credit ?? 0);
        return acc;
      },
      { debit: 0, credit: 0, balance: 0 }
    );
  }, [entries]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Ledger</Text>
      {selectedAccount ? (
        <View style={styles.accountHeader}>
          <View>
            <Text style={styles.accountLabel}>Account</Text>
            <Text style={styles.accountName}>{selectedAccount.name}</Text>
          </View>
          <TouchableOpacity
            style={styles.changeButton}
            onPress={() => {
              setSelectedAccount(null);
              setEntries([]);
            }}
          >
            <Text style={styles.changeButtonText}>Select Another</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.accountPicker}>
          <Text style={styles.accountLabel}>Select Account</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search accounts..."
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
          />
          {!!accountsError && (
            <Text style={styles.errorText}>
              Unable to load accounts directly. {accountsError}
            </Text>
          )}
          {accountsSource === 'ledger' && (
            <Text style={styles.infoText}>
              Showing accounts from transactions. Ask an owner to verify account access.
            </Text>
          )}
          {accountsLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color="#0f172a" />
              <Text style={styles.loadingText}>Loading accounts...</Text>
            </View>
          ) : (
            <FlatList
              data={filteredAccounts}
              keyExtractor={(item) => item.id}
              style={styles.accountList}
              contentContainerStyle={
                filteredAccounts.length === 0 ? styles.emptyState : undefined
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.accountRow}
                  onPress={() => setSelectedAccount(item)}
                >
                  <Text style={styles.accountRowText}>{item.name}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.emptyText}>No accounts found.</Text>
              }
            />
          )}
        </View>
      )}

      {!!selectedAccount && (
        <>
          <View style={styles.summaryCard}>
            <View style={styles.summaryCol}>
              <Text style={styles.summaryLabel}>Debit</Text>
              <Text style={[styles.summaryValue, styles.summaryDebit]}>
                {accountTotals.debit.toFixed(2)}
              </Text>
            </View>
            <View style={styles.summaryCol}>
              <Text style={styles.summaryLabel}>Credit</Text>
              <Text style={[styles.summaryValue, styles.summaryCredit]}>
                {accountTotals.credit.toFixed(2)}
              </Text>
            </View>
            <View style={styles.summaryCol}>
              <Text style={styles.summaryLabel}>Balance</Text>
              <Text style={styles.summaryValue}>{accountTotals.balance.toFixed(2)}</Text>
            </View>
          </View>
          <FlatList
            data={displayRows}
            keyExtractor={(item) => item.key}
            contentContainerStyle={displayRows.length === 0 ? styles.emptyState : undefined}
            renderItem={({ item }) => (
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
            )}
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
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 12 },
  accountHeader: {
    backgroundColor: 'white',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  accountPicker: {
    backgroundColor: 'white',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    flex: 1,
  },
  accountLabel: { fontSize: 12, color: '#64748b' },
  accountName: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginTop: 4 },
  changeButton: {
    backgroundColor: '#0f172a',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  changeButtonText: { color: '#f8fafc', fontSize: 12, fontWeight: '700' },
  searchInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 10,
    fontSize: 15,
  },
  errorText: { fontSize: 12, color: '#dc2626', marginTop: 8 },
  infoText: { fontSize: 12, color: '#475569', marginTop: 6 },
  accountList: { marginTop: 10 },
  accountRow: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  accountRowText: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  summaryCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  summaryCol: { flex: 1 },
  summaryLabel: { fontSize: 12, color: '#64748b' },
  summaryValue: { fontSize: 15, fontWeight: '700', color: '#0f172a', marginTop: 2 },
  summaryDebit: { color: '#16a34a' },
  summaryCredit: { color: '#dc2626' },
  row: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  meta: { flex: 1 },
  date: { fontSize: 14, color: '#64748b' },
  entryType: { fontSize: 14, color: '#0f172a', marginTop: 2 },
  amounts: { alignItems: 'flex-end', gap: 2 },
  debit: { fontSize: 14, color: '#16a34a' },
  credit: { fontSize: 14, color: '#dc2626' },
  balance: { fontSize: 14, color: '#334155' },
  emptyState: { flexGrow: 1, justifyContent: 'center' },
  loadingWrap: { alignItems: 'center', gap: 8, marginTop: 16 },
  loadingText: { fontSize: 13, color: '#64748b' },
  emptyText: { fontSize: 13, color: '#64748b', textAlign: 'center', marginTop: 16 },
});
