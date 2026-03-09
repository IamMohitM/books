import React, { useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { formatDateDMY } from '../utils/date';

type Account = {
  id: string;
  name: string;
  is_group?: boolean | null;
  root_type?: string | null;
  account_type?: string | null;
};

type Props = {
  companyId: string;
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
};

export default function QuickAddModal({ companyId, visible, onClose, onCreated }: Props) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const [amount, setAmount] = useState('');
  const [entryDate, setEntryDate] = useState(todayIso);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [debitAccountId, setDebitAccountId] = useState<string>('');
  const [creditAccountId, setCreditAccountId] = useState<string>('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [debitSearch, setDebitSearch] = useState('');
  const [creditSearch, setCreditSearch] = useState('');
  const [debitFocused, setDebitFocused] = useState(false);
  const [creditFocused, setCreditFocused] = useState(false);
  const [debitError, setDebitError] = useState<string | null>(null);
  const [creditError, setCreditError] = useState<string | null>(null);
  const [debitSuccess, setDebitSuccess] = useState<string | null>(null);
  const [creditSuccess, setCreditSuccess] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [debitParentId, setDebitParentId] = useState<string>('');
  const [creditParentId, setCreditParentId] = useState<string>('');
  const [activeParentPicker, setActiveParentPicker] = useState<'debit' | 'credit' | null>(null);
  const [pendingCreateSide, setPendingCreateSide] = useState<'debit' | 'credit' | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    const loadAccounts = async () => {
      const { data } = await supabase
        .from('accounts')
        .select('id,name,is_group,root_type,account_type')
        .eq('company_id', companyId)
        .order('name', { ascending: true });

      if (data && data.length > 0) {
        setAccounts(data as Account[]);
        setDebitAccountId((data[0] as Account).id);
        setCreditAccountId((data[0] as Account).id);
      }
    };

    if (visible) {
      loadAccounts();
      setDebitSearch('');
      setCreditSearch('');
      setDebitError(null);
      setCreditError(null);
      setDebitSuccess(null);
      setCreditSuccess(null);
      setDebitParentId('');
      setCreditParentId('');
      setSubmitError(null);
      setDebitFocused(false);
      setCreditFocused(false);
      setEntryDate(todayIso);
      setShowDatePicker(false);
    }
  }, [companyId, visible, todayIso]);

  const dateOptions = Array.from({ length: 180 }).map((_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - index);
    return date.toISOString().slice(0, 10);
  });

  const groupAccounts = accounts.filter((acc) => acc.is_group);
  const debitQuery = debitSearch.trim();
  const creditQuery = creditSearch.trim();
  const debitFiltered = debitQuery
    ? accounts.filter((acc) => acc.name.toLowerCase().includes(debitQuery.toLowerCase()))
    : accounts;
  const creditFiltered = creditQuery
    ? accounts.filter((acc) => acc.name.toLowerCase().includes(creditQuery.toLowerCase()))
    : accounts;
  const debitExactMatch = debitQuery
    ? accounts.some((acc) => acc.name.toLowerCase() === debitQuery.toLowerCase())
    : false;
  const creditExactMatch = creditQuery
    ? accounts.some((acc) => acc.name.toLowerCase() === creditQuery.toLowerCase())
    : false;
  const debitSelectedName = debitAccountId ? accounts.find((acc) => acc.id === debitAccountId)?.name ?? '' : '';
  const creditSelectedName = creditAccountId ? accounts.find((acc) => acc.id === creditAccountId)?.name ?? '' : '';
  const debitParent = groupAccounts.find((acc) => acc.id === debitParentId);
  const creditParent = groupAccounts.find((acc) => acc.id === creditParentId);
  const debitMatches = debitFiltered.length;
  const creditMatches = creditFiltered.length;
  const debitShowScrollHint = debitMatches > 4;
  const creditShowScrollHint = creditMatches > 4;

  const createAccount = async (kind: 'debit' | 'credit') => {
    const query = kind === 'debit' ? debitQuery : creditQuery;
    const exactMatch = kind === 'debit' ? debitExactMatch : creditExactMatch;
    const parent = kind === 'debit' ? debitParent : creditParent;
    if (!query || exactMatch || !parent) {
      if (!parent) {
        if (kind === 'debit') setDebitError('Select a parent account to create this entry.');
        else setCreditError('Select a parent account to create this entry.');
      }
      return;
    }
    setCreatingAccount(true);
    if (kind === 'debit') {
      setDebitError(null);
      setDebitSuccess(null);
    } else {
      setCreditError(null);
      setCreditSuccess(null);
    }
    const parentName = parent.name;
    const { data, error } = await supabase
      .from('accounts')
      .insert([
        {
          company_id: companyId,
          name: query,
          parent_account: parentName,
          root_type: parent.root_type,
          account_type: parent.account_type,
          is_group: false,
        },
      ])
      .select('id,name')
      .single();

    setCreatingAccount(false);
    if (error || !data) {
      if (kind === 'debit') setDebitError(error?.message ?? 'Unable to create account.');
      else setCreditError(error?.message ?? 'Unable to create account.');
      return;
    }

    const nextAccounts = [...accounts, data as Account].sort((a, b) => a.name.localeCompare(b.name));
    setAccounts(nextAccounts);
    if (kind === 'debit') {
      setDebitAccountId((data as Account).id);
      setDebitSearch((data as Account).name ?? query);
      setDebitParentId('');
      setDebitSuccess(`Created ${query} under ${parentName}.`);
      setDebitFocused(false);
    } else {
      setCreditAccountId((data as Account).id);
      setCreditSearch((data as Account).name ?? query);
      setCreditParentId('');
      setCreditSuccess(`Created ${query} under ${parentName}.`);
      setCreditFocused(false);
    }
    setActiveParentPicker(null);
  };

  const submit = async () => {
    setSubmitError(null);
    if (!amount || !debitAccountId || !creditAccountId) {
      setSubmitError('Enter an amount and select both accounts.');
      return;
    }
    if (debitAccountId === creditAccountId) {
      setDebitError('Debit and Credit accounts must be different.');
      return;
    }

    setLoading(true);
    if (Platform.OS === 'web') {
      onClose();
    }
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setLoading(false);
      setSubmitError('Enter a valid amount greater than 0.');
      return;
    }
    const { error } = await supabase.rpc('create_journal_entry', {
      target_company: companyId,
      entry_type: 'Journal Entry',
      entry_date: entryDate,
      reference_number: null,
      reference_date: null,
      user_remark: note,
      lines: [
        { account_id: debitAccountId, debit: numericAmount, credit: 0 },
        { account_id: creditAccountId, debit: 0, credit: numericAmount },
      ],
    });

    setLoading(false);
    if (!error) {
      setAmount('');
      setNote('');
      setDebitSearch('');
      setCreditSearch('');
      setDebitError(null);
      setCreditError(null);
      setDebitSuccess(null);
      setCreditSuccess(null);
      setDebitParentId('');
      setCreditParentId('');
      onCreated();
      Alert.alert('Saved', 'Transaction saved successfully.');
      if (Platform.OS !== 'web') {
        onClose();
      }
    } else {
      setSubmitError(error.message || 'Unable to save. Please try again.');
    }
  };

  const modalBody = (
    <View style={styles.modal}>
      <View style={styles.modalContent}>
              <Text style={styles.title}>Quick Add</Text>
              <TextInput
                style={styles.input}
                placeholder="Amount"
                keyboardType="decimal-pad"
                value={amount}
                onChangeText={setAmount}
                testID="quickadd-amount"
              />
              <Text style={styles.label}>Date</Text>
              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => setShowDatePicker(true)}
                testID="quickadd-date-picker-open"
              >
                <Text style={styles.dateButtonText}>{formatDateDMY(entryDate)}</Text>
                <Text style={styles.dateButtonHint}>{entryDate}</Text>
              </TouchableOpacity>
              <Text style={styles.label}>Debit Account</Text>
              <View style={styles.accountBox}>
                <View style={styles.searchRow}>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search accounts"
                    value={debitSearch}
                    onFocus={() => setDebitFocused(true)}
                    onBlur={() => {
                      if (Platform.OS !== 'web') {
                        setDebitFocused(false);
                      }
                    }}
                    onChangeText={(text) => {
                      setDebitSearch(text);
                      if (Platform.OS === 'web') {
                        if (!text.trim()) {
                          setDebitFocused(false);
                        } else {
                          setDebitFocused(true);
                        }
                      }
                      const match = accounts.find(
                        (acc) => acc.name.toLowerCase() === text.trim().toLowerCase()
                      );
                      if (match) {
                        setDebitAccountId(match.id);
                        setDebitSuccess(null);
                      } else if (
                        debitSelectedName &&
                        text.toLowerCase() !== debitSelectedName.toLowerCase()
                      ) {
                        setDebitAccountId('');
                      }
                    }}
                    testID="debit-search"
                  />
                  {debitFocused && debitQuery.length > 0 && (
                    <TouchableOpacity
                      style={[styles.createButton, creatingAccount && styles.createButtonDisabled]}
                      onPress={() => {
                        Keyboard.dismiss();
                        setPendingCreateSide('debit');
                        setActiveParentPicker('debit');
                      }}
                      disabled={creatingAccount}
                    >
                      <Text style={styles.createButtonText}>
                        {creatingAccount ? 'Creating...' : 'Create'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
                {debitFocused && (
                  <>
                    {!!debitError && <Text style={styles.errorText}>{debitError}</Text>}
                    {!!debitSuccess && <Text style={styles.successText}>{debitSuccess}</Text>}
                    <View style={styles.matchRow}>
                      <Text style={styles.matchText}>
                        {debitMatches === 0 ? 'No matches' : `${debitMatches} matching accounts`}
                      </Text>
                      {debitShowScrollHint && (
                        <Text style={styles.scrollHint}>Scroll for more</Text>
                      )}
                    </View>
                    <FlatList
                      data={debitFiltered}
                      keyExtractor={(item) => item.id}
                      style={styles.accountListInner}
                      keyboardShouldPersistTaps="handled"
                      nestedScrollEnabled
                      showsVerticalScrollIndicator
                      ListEmptyComponent={
                        debitQuery.length > 0 ? (
                          <Text style={styles.emptyText}>No matching accounts.</Text>
                        ) : null
                      }
                      renderItem={({ item }) => (
                        <TouchableOpacity
                          style={[styles.accountItem, item.id === debitAccountId && styles.accountItemActive]}
                          onPress={() => {
                            setDebitAccountId(item.id);
                            setDebitSearch(item.name);
                            setDebitFocused(false);
                            Keyboard.dismiss();
                          }}
                          testID={`debit-account-${item.id}`}
                        >
                          <Text style={styles.accountText}>{item.name}</Text>
                        </TouchableOpacity>
                      )}
                    />
                  </>
                )}
              </View>
              <Text style={styles.label}>Credit Account</Text>
              <View style={styles.accountBox}>
                <View style={styles.searchRow}>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search accounts"
                    value={creditSearch}
                    onFocus={() => setCreditFocused(true)}
                    onBlur={() => {
                      if (Platform.OS !== 'web') {
                        setCreditFocused(false);
                      }
                    }}
                    onChangeText={(text) => {
                      setCreditSearch(text);
                      if (Platform.OS === 'web') {
                        if (!text.trim()) {
                          setCreditFocused(false);
                        } else {
                          setCreditFocused(true);
                        }
                      }
                      const match = accounts.find(
                        (acc) => acc.name.toLowerCase() === text.trim().toLowerCase()
                      );
                      if (match) {
                        setCreditAccountId(match.id);
                        setCreditSuccess(null);
                      } else if (
                        creditSelectedName &&
                        text.toLowerCase() !== creditSelectedName.toLowerCase()
                      ) {
                        setCreditAccountId('');
                      }
                    }}
                    testID="credit-search"
                  />
                  {creditFocused && creditQuery.length > 0 && (
                    <TouchableOpacity
                      style={[styles.createButton, creatingAccount && styles.createButtonDisabled]}
                      onPress={() => {
                        Keyboard.dismiss();
                        setPendingCreateSide('credit');
                        setActiveParentPicker('credit');
                      }}
                      disabled={creatingAccount}
                    >
                      <Text style={styles.createButtonText}>
                        {creatingAccount ? 'Creating...' : 'Create'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
                {creditFocused && (
                  <>
                    {!!creditError && <Text style={styles.errorText}>{creditError}</Text>}
                    {!!creditSuccess && <Text style={styles.successText}>{creditSuccess}</Text>}
                    <View style={styles.matchRow}>
                      <Text style={styles.matchText}>
                        {creditMatches === 0 ? 'No matches' : `${creditMatches} matching accounts`}
                      </Text>
                      {creditShowScrollHint && (
                        <Text style={styles.scrollHint}>Scroll for more</Text>
                      )}
                    </View>
                    <FlatList
                      data={creditFiltered}
                      keyExtractor={(item) => item.id}
                      style={styles.accountListInner}
                      keyboardShouldPersistTaps="handled"
                      nestedScrollEnabled
                      showsVerticalScrollIndicator
                      ListEmptyComponent={
                        creditQuery.length > 0 ? (
                          <Text style={styles.emptyText}>No matching accounts.</Text>
                        ) : null
                      }
                      renderItem={({ item }) => (
                        <TouchableOpacity
                          style={[styles.accountItem, item.id === creditAccountId && styles.accountItemActive]}
                          onPress={() => {
                            setCreditAccountId(item.id);
                            setCreditSearch(item.name);
                            setCreditFocused(false);
                            Keyboard.dismiss();
                          }}
                          testID={`credit-account-${item.id}`}
                        >
                          <Text style={styles.accountText}>{item.name}</Text>
                        </TouchableOpacity>
                      )}
                    />
                  </>
                )}
              </View>
              <Modal visible={activeParentPicker !== null} animationType="slide" transparent>
                <View style={styles.overlay}>
                  <View style={styles.parentModal}>
                    <View style={styles.parentHeader}>
                      <Text style={styles.parentTitle}>Choose parent account</Text>
                      <TouchableOpacity onPress={() => setActiveParentPicker(null)}>
                        <Text style={styles.parentClose}>Done</Text>
                      </TouchableOpacity>
                    </View>
                    {!!pendingCreateSide && (
                      <View style={styles.parentMetaRow}>
                        <Text style={styles.parentMetaLabel}>Creating</Text>
                        <Text style={styles.parentMetaValue}>
                          {pendingCreateSide === 'debit' ? debitQuery : creditQuery}
                        </Text>
                      </View>
                    )}
                    <FlatList
                      data={groupAccounts}
                      keyExtractor={(item) => item.id}
                      keyboardShouldPersistTaps="handled"
                      style={styles.parentList}
                      contentContainerStyle={styles.parentListContent}
                      renderItem={({ item }) => (
                        <TouchableOpacity
                          style={[
                            styles.parentItem,
                            item.id === (activeParentPicker === 'debit' ? debitParentId : creditParentId) &&
                              styles.parentItemActive,
                          ]}
                          onPress={() => {
                            if (activeParentPicker === 'debit') {
                              setDebitParentId(item.id);
                              setDebitError(null);
                            } else {
                              setCreditParentId(item.id);
                              setCreditError(null);
                            }
                          }}
                        >
                          <Text style={styles.parentItemText}>{item.name}</Text>
                        </TouchableOpacity>
                      )}
                    />
                    <View style={styles.parentFooter}>
                      <TouchableOpacity
                        style={[
                          styles.parentSaveButton,
                          (!pendingCreateSide ||
                            (pendingCreateSide === 'debit' ? !debitParent : !creditParent) ||
                            creatingAccount) &&
                            styles.parentSaveButtonDisabled,
                        ]}
                        onPress={async () => {
                          if (!pendingCreateSide) {
                            return;
                          }
                          await createAccount(pendingCreateSide);
                          setActiveParentPicker(null);
                          setPendingCreateSide(null);
                        }}
                        disabled={
                          !pendingCreateSide ||
                          (pendingCreateSide === 'debit' ? !debitParent : !creditParent) ||
                          creatingAccount
                        }
                      >
                        <Text style={styles.parentSaveButtonText}>
                          {creatingAccount ? 'Saving...' : 'Save'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </Modal>
              <Modal visible={showDatePicker} animationType="slide" transparent>
                <View style={styles.overlay}>
                  <View style={styles.parentModal}>
                    <View style={styles.parentHeader}>
                      <Text style={styles.parentTitle}>Select transaction date</Text>
                      <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                        <Text style={styles.parentClose}>Done</Text>
                      </TouchableOpacity>
                    </View>
                    <FlatList
                      data={dateOptions}
                      keyExtractor={(item) => item}
                      keyboardShouldPersistTaps="handled"
                      style={styles.parentList}
                      contentContainerStyle={styles.parentListContent}
                      renderItem={({ item }) => (
                        <TouchableOpacity
                          style={[
                            styles.parentItem,
                            item === entryDate && styles.parentItemActive,
                          ]}
                          onPress={() => {
                            setEntryDate(item);
                            setShowDatePicker(false);
                          }}
                          testID={`quickadd-date-${item}`}
                        >
                          <Text style={styles.parentItemText}>{formatDateDMY(item)}</Text>
                          <Text style={styles.parentMeta}>{item}</Text>
                        </TouchableOpacity>
                      )}
                    />
                  </View>
                </View>
              </Modal>
              <TextInput
                style={styles.input}
                placeholder="Notes"
                value={note}
                onChangeText={setNote}
              />
              <View style={styles.row}>
                <TouchableOpacity style={styles.secondaryButton} onPress={onClose} testID="quickadd-cancel">
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
                  onPress={submit}
                  testID="quickadd-save"
                  disabled={loading}
                >
                  <Text style={styles.primaryButtonText}>{loading ? 'Saving...' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
              {!!submitError && <Text style={styles.errorText}>{submitError}</Text>}
      </View>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {Platform.OS === 'web' ? (
          modalBody
        ) : (
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            {modalBody}
          </TouchableWithoutFeedback>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  modal: { margin: 20, backgroundColor: 'white', borderRadius: 14, padding: 18, gap: 14, maxHeight: '92%' },
  modalContent: { gap: 14 },
  title: { fontSize: 20, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: '#e2e8f0', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10, fontSize: 15 },
  dateButton: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
    gap: 2,
  },
  dateButtonText: { fontSize: 15, color: '#0f172a', fontWeight: '700' },
  dateButtonHint: { fontSize: 12, color: '#64748b' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  label: { fontSize: 14, color: '#64748b' },
  accountBox: {
    maxHeight: 300,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    padding: 12,
    gap: 8,
  },
  searchRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  searchInput: { flex: 1, borderWidth: 1, borderColor: '#e2e8f0', paddingVertical: 10, paddingHorizontal: 10, borderRadius: 10, fontSize: 15 },
  createButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#0f172a',
  },
  createButtonDisabled: { opacity: 0.5 },
  createButtonText: { color: '#f8fafc', fontSize: 14, fontWeight: '700' },
  parentRow: { gap: 6 },
  parentLabel: { fontSize: 15, color: '#64748b' },
  parentHint: { fontSize: 13, color: '#94a3b8' },
  parentSelect: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
  },
  parentSelectText: { fontSize: 15, color: '#0f172a' },
  parentItem: { paddingVertical: 10, paddingHorizontal: 12 },
  parentItemActive: { backgroundColor: '#e2e8f0' },
  parentItemText: { fontSize: 15 },
  parentMeta: { fontSize: 13, color: '#64748b' },
  errorText: { fontSize: 13, color: '#dc2626' },
  successText: { fontSize: 13, color: '#16a34a' },
  emptyText: { fontSize: 13, color: '#94a3b8', paddingVertical: 8 },
  matchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
  },
  matchText: { fontSize: 13, color: '#475569', fontWeight: '600' },
  scrollHint: { fontSize: 12, color: '#0f172a', fontWeight: '700' },
  accountListInner: {
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    maxHeight: 160,
  },
  accountItem: { paddingVertical: 12, paddingHorizontal: 12 },
  accountItemActive: { backgroundColor: '#e2e8f0' },
  accountText: { fontSize: 15 },
  parentModal: {
    margin: 20,
    padding: 18,
    backgroundColor: 'white',
    borderRadius: 14,
    maxHeight: '80%',
    gap: 12,
    paddingBottom: 12,
  },
  parentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  parentTitle: { fontSize: 19, fontWeight: '700' },
  parentClose: { fontSize: 15, color: '#2563eb', fontWeight: '700' },
  parentMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
  },
  parentMetaLabel: { fontSize: 12, color: '#64748b', fontWeight: '600' },
  parentMetaValue: { fontSize: 14, color: '#0f172a', fontWeight: '700' },
  parentList: { maxHeight: 360 },
  parentListContent: { paddingBottom: 16 },
  parentFooter: {
    paddingTop: 8,
    paddingBottom: 6,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  parentSaveButton: {
    width: '100%',
    minHeight: 46,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  parentSaveButtonDisabled: { opacity: 0.6 },
  parentSaveButtonText: { color: '#f8fafc', fontSize: 15, fontWeight: '700' },
  primaryButton: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButtonDisabled: { opacity: 0.6 },
  primaryButtonText: { color: '#f8fafc', fontSize: 14, fontWeight: '700' },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#e2e8f0',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: { color: '#0f172a', fontSize: 14, fontWeight: '700' },
});
