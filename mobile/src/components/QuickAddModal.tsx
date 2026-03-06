import React, { useEffect, useState } from 'react';
import {
  Button,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';

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
  const [amount, setAmount] = useState('');
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
    }
  }, [companyId, visible]);

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
      setDebitSearch('');
      setDebitParentId('');
      setDebitSuccess(`Created ${query} under ${parentName}.`);
    } else {
      setCreditAccountId((data as Account).id);
      setCreditSearch('');
      setCreditParentId('');
      setCreditSuccess(`Created ${query} under ${parentName}.`);
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
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setLoading(false);
      setSubmitError('Enter a valid amount greater than 0.');
      return;
    }
    const { error } = await supabase.rpc('create_journal_entry', {
      target_company: companyId,
      entry_type: 'Journal Entry',
      entry_date: new Date().toISOString().slice(0, 10),
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
      onClose();
    } else {
      setSubmitError(error.message || 'Unable to save. Please try again.');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={styles.modal}>
            <ScrollView
              contentContainerStyle={styles.modalContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.title}>Quick Add</Text>
              <TextInput
                style={styles.input}
                placeholder="Amount"
                keyboardType="decimal-pad"
                value={amount}
                onChangeText={setAmount}
                testID="quickadd-amount"
              />
              <Text style={styles.label}>Debit Account</Text>
              <View style={styles.accountBox}>
                <View style={styles.searchRow}>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search accounts"
                    value={debitSearch}
                    onFocus={() => setDebitFocused(true)}
                    onBlur={() => setDebitFocused(false)}
                    onChangeText={(text) => {
                      setDebitSearch(text);
                      if (debitSelectedName && text.toLowerCase() !== debitSelectedName.toLowerCase()) {
                        setDebitAccountId('');
                      }
                    }}
                    testID="debit-search"
                  />
                  {debitFocused && !debitExactMatch && debitQuery.length > 0 && (
                    <TouchableOpacity
                      style={[styles.createButton, (!debitParent || creatingAccount) && styles.createButtonDisabled]}
                      onPress={() => createAccount('debit')}
                      disabled={creatingAccount || !debitParent}
                    >
                      <Text style={styles.createButtonText}>
                        {creatingAccount ? 'Creating...' : 'Create'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
                {debitFocused && (
                  <>
                    {!debitExactMatch && debitQuery.length > 0 && (
                      <View style={styles.parentRow}>
                        <Text style={styles.parentLabel}>Parent account</Text>
                        {!debitParent && <Text style={styles.parentHint}>Select a parent to enable Create.</Text>}
                        <TouchableOpacity
                          style={styles.parentSelect}
                          onPress={() => {
                            Keyboard.dismiss();
                            setActiveParentPicker('debit');
                          }}
                        >
                          <Text style={styles.parentSelectText}>
                            {debitParent?.name ?? 'Choose parent account'}
                          </Text>
                        </TouchableOpacity>
                        {debitParent && (
                          <Text style={styles.parentMeta}>Category: {debitParent.root_type ?? 'Unknown'}</Text>
                        )}
                      </View>
                    )}
                    {!!debitError && <Text style={styles.errorText}>{debitError}</Text>}
                    {!!debitSuccess && <Text style={styles.successText}>{debitSuccess}</Text>}
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
                    onBlur={() => setCreditFocused(false)}
                    onChangeText={(text) => {
                      setCreditSearch(text);
                      if (creditSelectedName && text.toLowerCase() !== creditSelectedName.toLowerCase()) {
                        setCreditAccountId('');
                      }
                    }}
                    testID="credit-search"
                  />
                  {creditFocused && !creditExactMatch && creditQuery.length > 0 && (
                    <TouchableOpacity
                      style={[styles.createButton, (!creditParent || creatingAccount) && styles.createButtonDisabled]}
                      onPress={() => createAccount('credit')}
                      disabled={creatingAccount || !creditParent}
                    >
                      <Text style={styles.createButtonText}>
                        {creatingAccount ? 'Creating...' : 'Create'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
                {creditFocused && (
                  <>
                    {!creditExactMatch && creditQuery.length > 0 && (
                      <View style={styles.parentRow}>
                        <Text style={styles.parentLabel}>Parent account</Text>
                        {!creditParent && <Text style={styles.parentHint}>Select a parent to enable Create.</Text>}
                        <TouchableOpacity
                          style={styles.parentSelect}
                          onPress={() => {
                            Keyboard.dismiss();
                            setActiveParentPicker('credit');
                          }}
                        >
                          <Text style={styles.parentSelectText}>
                            {creditParent?.name ?? 'Choose parent account'}
                          </Text>
                        </TouchableOpacity>
                        {creditParent && (
                          <Text style={styles.parentMeta}>Category: {creditParent.root_type ?? 'Unknown'}</Text>
                        )}
                      </View>
                    )}
                    {!!creditError && <Text style={styles.errorText}>{creditError}</Text>}
                    {!!creditSuccess && <Text style={styles.successText}>{creditSuccess}</Text>}
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
                    <FlatList
                      data={groupAccounts}
                      keyExtractor={(item) => item.id}
                      keyboardShouldPersistTaps="handled"
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
                <Button title="Cancel" onPress={onClose} testID="quickadd-cancel" />
                <Button title={loading ? 'Saving...' : 'Save'} onPress={submit} testID="quickadd-save" />
              </View>
              {!!submitError && <Text style={styles.errorText}>{submitError}</Text>}
            </ScrollView>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  modal: { margin: 20, backgroundColor: 'white', borderRadius: 12, maxHeight: '90%' },
  modalContent: { padding: 16, gap: 12 },
  title: { fontSize: 18, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#e2e8f0', padding: 10, borderRadius: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  label: { fontSize: 12, color: '#64748b' },
  accountBox: {
    maxHeight: 220,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    padding: 8,
    gap: 6,
  },
  searchRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  searchInput: { flex: 1, borderWidth: 1, borderColor: '#e2e8f0', padding: 8, borderRadius: 8 },
  createButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#0f172a',
  },
  createButtonDisabled: { opacity: 0.5 },
  createButtonText: { color: '#f8fafc', fontSize: 12, fontWeight: '600' },
  parentRow: { gap: 6 },
  parentLabel: { fontSize: 12, color: '#64748b' },
  parentHint: { fontSize: 11, color: '#94a3b8' },
  parentSelect: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
  },
  parentSelectText: { fontSize: 12, color: '#0f172a' },
  parentItem: { paddingVertical: 8, paddingHorizontal: 10 },
  parentItemActive: { backgroundColor: '#e2e8f0' },
  parentItemText: { fontSize: 12 },
  parentMeta: { fontSize: 11, color: '#64748b' },
  errorText: { fontSize: 12, color: '#dc2626' },
  successText: { fontSize: 12, color: '#16a34a' },
  emptyText: { fontSize: 12, color: '#94a3b8', paddingVertical: 6 },
  accountListInner: { paddingVertical: 4 },
  accountItem: { paddingVertical: 8, paddingHorizontal: 10 },
  accountItemActive: { backgroundColor: '#e2e8f0' },
  accountText: { fontSize: 13 },
  parentModal: {
    margin: 20,
    padding: 16,
    backgroundColor: 'white',
    borderRadius: 12,
    maxHeight: '70%',
    gap: 10,
  },
  parentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  parentTitle: { fontSize: 16, fontWeight: '600' },
  parentClose: { fontSize: 13, color: '#2563eb', fontWeight: '600' },
});
