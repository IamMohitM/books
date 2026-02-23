import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import TransactionsScreen from '../src/screens/TransactionsScreen';
import { supabase } from '../src/lib/supabase';

jest.mock('../src/lib/supabase', () => {
  return {
    supabase: {
      from: jest.fn(),
    },
  };
});

describe('TransactionsScreen', () => {
  const entries = [
    {
      id: 'entry-1',
      date: '2026-02-23',
      entry_type: 'Journal Entry',
      user_remark: 'Test note',
      created_by_email: 'user@example.com',
    },
  ];

  const lines = [
    { line_id: 'line-1', account_name: 'Cash', debit: 100, credit: 0 },
    { line_id: 'line-2', account_name: 'Sales', debit: 0, credit: 100 },
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    const entriesQuery: any = {
      select: jest.fn(() => entriesQuery),
      eq: jest.fn(() => entriesQuery),
      order: jest.fn(() => entriesQuery),
      limit: jest.fn(async () => ({ data: entries })),
    };

    const linesQuery: any = {
      select: jest.fn(() => linesQuery),
      eq: jest.fn(() => linesQuery),
      order: jest.fn(async () => ({ data: lines })),
    };

    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'journal_entries_with_user') return entriesQuery;
      if (table === 'ledger_entries') return linesQuery;
      throw new Error(`Unexpected table ${table}`);
    });
  });

  it('renders transactions and opens details on tap', async () => {
    const { getByTestId, getByText } = render(
      <TransactionsScreen companyId="company-1" refreshKey={0} />
    );

    await waitFor(() => expect(getByText('Journal Entry')).toBeTruthy());

    fireEvent.press(getByTestId('transaction-entry-1'));

    await waitFor(() => expect(getByText('Transaction Details')).toBeTruthy());
    await waitFor(() => expect(getByText('Cash')).toBeTruthy());
    await waitFor(() => expect(getByText('Dr 100')).toBeTruthy());
    await waitFor(() => expect(getByText('Cr 100')).toBeTruthy());
  });
});
