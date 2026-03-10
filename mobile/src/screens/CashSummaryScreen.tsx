import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { formatDateDMY } from '../utils/date';

type AccountRow = {
  id: string;
  name: string;
  account_type?: string | null;
  is_group?: boolean | null;
};

type LedgerRow = {
  date: string;
  debit: number;
  credit: number;
  account_id: string;
};

type CashSummaryRow = {
  period: string;
  periodStart: string;
  periodEnd: string;
  debits: number;
  credits: number;
  closingBalance: number;
};

const toLocalISODate = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseISODate = (value: string) => {
  const [year, month, day] = String(value ?? '')
    .split('-')
    .map((part) => Number(part));
  if (!year || !month || !day) {
    return new Date();
  }

  return new Date(year, month - 1, day);
};

const formatDateDMYDash = (value: string) => {
  const [year, month, day] = String(value ?? '').split('-');
  if (!year || !month || !day) return value;
  return `${day}-${month}-${year}`;
};

const getDefaultFromDate = () => {
  const today = new Date();
  const fromDate = new Date(today.getFullYear(), today.getMonth() - 2, 1);
  return toLocalISODate(fromDate);
};

const getDefaultToDate = () => toLocalISODate(new Date());

const buildMonthlyBuckets = (fromDate: string, toDate: string) => {
  const from = new Date(fromDate);
  const to = new Date(toDate);
  const endOfRange = new Date(to.getFullYear(), to.getMonth() + 1, 0);
  const buckets: CashSummaryRow[] = [];

  let current = new Date(from.getFullYear(), from.getMonth(), 1);
  while (current <= endOfRange) {
    const periodStart = new Date(current.getFullYear(), current.getMonth(), 1);
    const periodEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);
    const periodLabel = periodStart.toLocaleString('default', {
      month: 'short',
      year: 'numeric',
    });

    buckets.push({
      period: periodLabel,
      periodStart: toLocalISODate(periodStart),
      periodEnd: toLocalISODate(periodEnd),
      debits: 0,
      credits: 0,
      closingBalance: 0,
    });

    current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
  }

  return buckets;
};

const formatAmount = (value: number) => value.toFixed(2);

export default function CashSummaryScreen({ companyId }: { companyId: string }) {
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [summaryRows, setSummaryRows] = useState<CashSummaryRow[]>([]);
  const [loadingCash, setLoadingCash] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [loadingOverShort, setLoadingOverShort] = useState(false);
  const [dateFrom, setDateFrom] = useState(getDefaultFromDate());
  const [dateTo, setDateTo] = useState(getDefaultToDate());
  const [activeRangePicker, setActiveRangePicker] = useState<'from' | 'to' | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(parseISODate(getDefaultToDate()));
  const [accountSearch, setAccountSearch] = useState('');
  const [selectedOverShortAccount, setSelectedOverShortAccount] = useState<AccountRow | null>(
    null
  );
  const [overShortRows, setOverShortRows] = useState<CashSummaryRow[]>([]);

  useEffect(() => {
    const loadAccounts = async () => {
      setLoadingAccounts(true);
      const { data: accountData } = await supabase
        .rpc('fetch_accounts_for_company', { target_company: companyId })
        .eq('is_group', false)
        .order('name', { ascending: true });

      const rows = (accountData ?? []) as AccountRow[];
      setAccounts(rows);

      if (!selectedOverShortAccount && rows.length > 0) {
        const preferred = rows.find((row) => {
          const name = row.name.toLowerCase();
          return name.includes('cash over') || name.includes('cash short');
        });
        setSelectedOverShortAccount(preferred ?? rows[0]);
      }

      setLoadingAccounts(false);
    };

    void loadAccounts();
  }, [companyId]);

  useEffect(() => {
    const loadCashSummary = async () => {
      setLoadingCash(true);
      const cashAccountIds = accounts
        .filter(
          (row) =>
            String(row.account_type ?? '').toLowerCase() === 'cash' &&
            row.is_group === false
        )
        .map((row) => row.id);

      if (cashAccountIds.length === 0) {
        setSummaryRows([]);
        setLoadingCash(false);
        return;
      }

      const { data } = await supabase
        .from('ledger_entries')
        .select('date,debit,credit,account_id')
        .eq('company_id', companyId)
        .eq('submitted', true)
        .in('account_id', cashAccountIds)
        .lte('date', dateTo)
        .order('date', { ascending: true });

      const allRows = (data ?? []) as LedgerRow[];

      const monthlyBuckets = buildMonthlyBuckets(dateFrom, dateTo);
      const bucketMap = new Map(monthlyBuckets.map((row) => [row.periodStart, row]));

      allRows.forEach((entry) => {
        if (entry.date < dateFrom || entry.date > dateTo) {
          return;
        }
        const entryDate = new Date(entry.date);
        const periodStart = toLocalISODate(
          new Date(entryDate.getFullYear(), entryDate.getMonth(), 1)
        );
        const bucket = bucketMap.get(periodStart);
        if (bucket) {
          bucket.debits += entry.debit || 0;
          bucket.credits += entry.credit || 0;
          bucket.closingBalance = bucket.debits - bucket.credits;
        }
      });

      setSummaryRows(monthlyBuckets);
      setLoadingCash(false);
    };

    if (accounts.length > 0) {
      void loadCashSummary();
    } else {
      setSummaryRows([]);
    }
  }, [companyId, accounts, dateFrom, dateTo]);

  useEffect(() => {
    const loadOverShortSummary = async () => {
      if (!selectedOverShortAccount?.id) {
        setOverShortRows([]);
        return;
      }

      setLoadingOverShort(true);
      const { data } = await supabase
        .from('ledger_entries')
        .select('date,debit,credit,account_id')
        .eq('company_id', companyId)
        .eq('submitted', true)
        .eq('account_id', selectedOverShortAccount.id)
        .gte('date', dateFrom)
        .lte('date', dateTo)
        .order('date', { ascending: true });

      const monthlyBuckets = buildMonthlyBuckets(dateFrom, dateTo);
      const bucketMap = new Map(monthlyBuckets.map((row) => [row.periodStart, row]));

      ((data ?? []) as LedgerRow[]).forEach((entry) => {
        const entryDate = new Date(entry.date);
        const periodStart = toLocalISODate(
          new Date(entryDate.getFullYear(), entryDate.getMonth(), 1)
        );
        const bucket = bucketMap.get(periodStart);
        if (bucket) {
          bucket.debits += Number(entry.debit ?? 0);
          bucket.credits += Number(entry.credit ?? 0);
          bucket.closingBalance = bucket.debits - bucket.credits;
        }
      });

      setOverShortRows(monthlyBuckets);
      setLoadingOverShort(false);
    };

    void loadOverShortSummary();
  }, [companyId, selectedOverShortAccount, dateFrom, dateTo]);

  const filteredAccounts = useMemo(() => {
    const query = accountSearch.trim().toLowerCase();
    if (!query) {
      return accounts;
    }
    return accounts.filter((row) => row.name.toLowerCase().includes(query));
  }, [accountSearch, accounts]);

  const calendarYear = calendarMonth.getFullYear();
  const calendarMonthIndex = calendarMonth.getMonth();
  const monthStart = new Date(calendarYear, calendarMonthIndex, 1);
  const monthEnd = new Date(calendarYear, calendarMonthIndex + 1, 0);
  const monthDays = monthEnd.getDate();
  const startWeekday = monthStart.getDay();
  const leadingBlanks = Array.from({ length: startWeekday }, (_, i) => `blank-${i}`);
  const dayCells = Array.from({ length: monthDays }, (_, i) => i + 1);
  const selectedDate = activeRangePicker === 'from' ? dateFrom : dateTo;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.title}>Cash In Hand Summary</Text>

      <View style={styles.rangeCard}>
        <View style={styles.rangeField}>
          <Text style={styles.rangeLabel}>From</Text>
          <TouchableOpacity
            style={styles.rangeInput}
            onPress={() => {
              setActiveRangePicker('from');
              setCalendarMonth(parseISODate(dateFrom));
            }}
          >
            <Text style={styles.rangeValue}>{formatDateDMYDash(dateFrom)}</Text>
          </TouchableOpacity>
          <Text style={styles.rangeHint}>{formatDateDMY(dateFrom)}</Text>
        </View>
        <View style={styles.rangeField}>
          <Text style={styles.rangeLabel}>To</Text>
          <TouchableOpacity
            style={styles.rangeInput}
            onPress={() => {
              setActiveRangePicker('to');
              setCalendarMonth(parseISODate(dateTo));
            }}
          >
            <Text style={styles.rangeValue}>{formatDateDMYDash(dateTo)}</Text>
          </TouchableOpacity>
          <Text style={styles.rangeHint}>{formatDateDMY(dateTo)}</Text>
        </View>
      </View>
      <Modal visible={activeRangePicker !== null} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={styles.calendarCard}>
            <View style={styles.calendarHeader}>
              <TouchableOpacity
                style={styles.calendarNav}
                onPress={() =>
                  setCalendarMonth(new Date(calendarYear, calendarMonthIndex - 1, 1))
                }
              >
                <Text style={styles.calendarNavText}>{'<'}</Text>
              </TouchableOpacity>
              <Text style={styles.calendarMonthLabel}>
                {calendarMonth.toLocaleString('default', {
                  month: 'long',
                  year: 'numeric',
                })}
              </Text>
              <TouchableOpacity
                style={styles.calendarNav}
                onPress={() =>
                  setCalendarMonth(new Date(calendarYear, calendarMonthIndex + 1, 1))
                }
              >
                <Text style={styles.calendarNavText}>{'>'}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.calendarWeekdays}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
                <Text key={`${day}-${index}`} style={styles.calendarWeekday}>
                  {day}
                </Text>
              ))}
            </View>
            <View style={styles.calendarGrid}>
              {leadingBlanks.map((key) => (
                <View key={key} style={styles.calendarCell} />
              ))}
              {dayCells.map((day) => {
                const iso = toLocalISODate(
                  new Date(calendarYear, calendarMonthIndex, day)
                );
                const selected = iso === selectedDate;
                return (
                  <TouchableOpacity
                    key={iso}
                    style={[styles.calendarCell, selected && styles.calendarCellActive]}
                    onPress={() => {
                      if (activeRangePicker === 'from') {
                        setDateFrom(iso);
                      } else {
                        setDateTo(iso);
                      }
                      setActiveRangePicker(null);
                    }}
                  >
                    <Text
                      style={[
                        styles.calendarCellText,
                        selected && styles.calendarCellTextActive,
                      ]}
                    >
                      {day}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.calendarFooter}>
              <TouchableOpacity
                style={styles.todayButton}
                onPress={() => {
                  const today = toLocalISODate(new Date());
                  if (activeRangePicker === 'from') {
                    setDateFrom(today);
                  } else {
                    setDateTo(today);
                  }
                  setCalendarMonth(parseISODate(today));
                  setActiveRangePicker(null);
                }}
              >
                <Text style={styles.todayButtonText}>Today</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setActiveRangePicker(null)}
              >
                <Text style={styles.closeButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <View style={styles.tableHeader}>
        <Text style={[styles.tableHeaderCell, styles.periodCol]}>Period</Text>
        <Text style={[styles.tableHeaderCell, styles.debitCol]}>Debits</Text>
        <Text style={[styles.tableHeaderCell, styles.creditCol]}>Credits</Text>
        <Text style={[styles.tableHeaderCell, styles.closingCol]}>Closing</Text>
      </View>
      {loadingCash ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color="#0f172a" />
          <Text style={styles.loadingText}>Loading cash summary...</Text>
        </View>
      ) : summaryRows.length === 0 ? (
        <Text style={styles.emptyText}>No cash transactions in this period.</Text>
      ) : (
        summaryRows.map((item) => (
          <View key={item.periodStart} style={styles.tableRow}>
            <Text style={[styles.tableCell, styles.periodCol]}>{item.period}</Text>
            <Text style={[styles.tableCell, styles.debitCol]}>{formatAmount(item.debits)}</Text>
            <Text style={[styles.tableCell, styles.creditCol]}>{formatAmount(item.credits)}</Text>
            <Text style={[styles.tableCell, styles.closingCol]}>
              {formatAmount(item.closingBalance)}
            </Text>
          </View>
        ))
      )}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Account Summary</Text>
      </View>
      <View style={styles.selectorCard}>
        <Text style={styles.rangeLabel}>Select Account</Text>
        <TextInput
          style={styles.searchInput}
          value={accountSearch}
          onChangeText={setAccountSearch}
          placeholder="Search account..."
          autoCapitalize="none"
        />
        {loadingAccounts ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="small" color="#0f172a" />
            <Text style={styles.loadingText}>Loading accounts...</Text>
          </View>
        ) : (
          <View style={styles.accountChipsWrap}>
            {filteredAccounts.slice(0, 10).map((account) => (
              <TouchableOpacity
                key={account.id}
                style={[
                  styles.accountChip,
                  selectedOverShortAccount?.id === account.id && styles.accountChipActive,
                ]}
                onPress={() => setSelectedOverShortAccount(account)}
              >
                <Text
                  style={[
                    styles.accountChipText,
                    selectedOverShortAccount?.id === account.id && styles.accountChipTextActive,
                  ]}
                >
                  {account.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      <View style={styles.tableHeader}>
        <Text style={[styles.tableHeaderCell, styles.periodCol]}>Period</Text>
        <Text style={[styles.tableHeaderCell, styles.debitCol]}>Debits</Text>
        <Text style={[styles.tableHeaderCell, styles.creditCol]}>Credits</Text>
        <Text style={[styles.tableHeaderCell, styles.closingCol]}>Balance</Text>
      </View>
      {loadingOverShort ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color="#0f172a" />
          <Text style={styles.loadingText}>Loading cash over/short summary...</Text>
        </View>
      ) : overShortRows.length === 0 ? (
        <Text style={styles.emptyText}>No posted entries in this period.</Text>
      ) : (
        overShortRows.map((item) => (
          <View key={`os-${item.periodStart}`} style={styles.tableRow}>
            <Text style={[styles.tableCell, styles.periodCol]}>{item.period}</Text>
            <Text style={[styles.tableCell, styles.debitCol]}>{formatAmount(item.debits)}</Text>
            <Text style={[styles.tableCell, styles.creditCol]}>{formatAmount(item.credits)}</Text>
            <Text
              style={[
                styles.tableCell,
                styles.closingCol,
                item.closingBalance >= 0 ? styles.balancePositive : styles.balanceNegative,
              ]}
            >
              {formatAmount(item.closingBalance)}
            </Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  contentContainer: { paddingBottom: 12 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 12 },
  sectionHeader: { marginTop: 14, marginBottom: 8 },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: '#0f172a' },
  rangeCard: {
    backgroundColor: 'white',
    padding: 14,
    borderRadius: 14,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  selectorCard: {
    backgroundColor: 'white',
    padding: 14,
    borderRadius: 14,
    marginBottom: 12,
  },
  rangeField: { flex: 1 },
  rangeLabel: { fontSize: 13, color: '#64748b', fontWeight: '600' },
  rangeInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 6,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  rangeValue: { fontSize: 16, color: '#0f172a', fontWeight: '600' },
  rangeHint: { fontSize: 13, color: '#94a3b8', marginTop: 4 },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    padding: 20,
  },
  calendarCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
    gap: 12,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  calendarNav: { padding: 6 },
  calendarNavText: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  calendarMonthLabel: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  calendarWeekdays: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  calendarWeekday: {
    width: 34,
    textAlign: 'center',
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  calendarCell: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarCellActive: { backgroundColor: '#0f172a' },
  calendarCellText: { fontSize: 14, color: '#0f172a', fontWeight: '600' },
  calendarCellTextActive: { color: '#f8fafc' },
  calendarFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  todayButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#e2e8f0',
  },
  todayButtonText: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  closeButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#0f172a',
  },
  closeButtonText: { fontSize: 13, fontWeight: '700', color: '#f8fafc' },
  searchInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8,
    fontSize: 16,
  },
  accountChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  accountChip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
  },
  accountChipActive: {
    backgroundColor: '#0f172a',
  },
  accountChipText: {
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '600',
  },
  accountChipTextActive: {
    color: '#f8fafc',
  },
  tableHeader: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  tableHeaderCell: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
  },
  tableRow: {
    backgroundColor: 'white',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tableCell: { fontSize: 15, color: '#0f172a' },
  periodCol: { flex: 1.4 },
  debitCol: { flex: 1, textAlign: 'right', color: '#16a34a', fontWeight: '600' },
  creditCol: { flex: 1, textAlign: 'right', color: '#dc2626', fontWeight: '600' },
  closingCol: { flex: 1, textAlign: 'right', fontWeight: '700' },
  balancePositive: { color: '#16a34a' },
  balanceNegative: { color: '#dc2626' },
  loadingWrap: { alignItems: 'center', gap: 8, marginTop: 16 },
  loadingText: { fontSize: 13, color: '#64748b' },
  emptyText: { fontSize: 13, color: '#64748b', textAlign: 'center', marginTop: 16 },
});
