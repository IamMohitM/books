import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { act } from 'react-test-renderer';
import QuickAddModal from '../src/components/QuickAddModal';
import { supabase } from '../src/lib/supabase';

jest.mock('../src/lib/supabase', () => {
  return {
    supabase: {
      from: jest.fn(),
      rpc: jest.fn(),
    },
  };
});

describe('QuickAddModal', () => {
  const accounts = [
    { id: 'a1', name: 'Cash', is_group: false },
    { id: 'a2', name: 'Sales', is_group: false },
  ];

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();

    const accountsQuery: any = {
      select: jest.fn(() => accountsQuery),
      eq: jest.fn(() => accountsQuery),
      order: jest.fn(async () => ({ data: accounts })),
    };

    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'accounts') return accountsQuery;
      throw new Error(`Unexpected table ${table}`);
    });

    (supabase.rpc as jest.Mock).mockResolvedValue({ error: null });
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  const flushAnimations = () => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
  };

  it('shows an error when amount is missing', async () => {
    const { getByTestId, getByText } = render(
      <QuickAddModal
        companyId="company-1"
        visible
        onClose={jest.fn()}
        onCreated={jest.fn()}
      />
    );
    flushAnimations();

    await waitFor(() => expect(getByTestId('debit-search')).toBeTruthy());

    fireEvent.press(getByTestId('quickadd-save'));

    await waitFor(() => expect(getByText('Enter an amount and select both accounts.')).toBeTruthy());
  });

  it('submits a balanced debit and credit entry', async () => {
    const onClose = jest.fn();
    const onCreated = jest.fn();

    const { getByTestId } = render(
      <QuickAddModal companyId="company-1" visible onClose={onClose} onCreated={onCreated} />
    );
    flushAnimations();

    await waitFor(() => expect(getByTestId('credit-search')).toBeTruthy());

    fireEvent(getByTestId('credit-search'), 'focus');
    fireEvent.press(getByTestId('credit-account-a2'));

    fireEvent.changeText(getByTestId('quickadd-amount'), '100');
    fireEvent.press(getByTestId('quickadd-save'));

    await waitFor(() =>
      expect(supabase.rpc).toHaveBeenCalledWith(
        'create_journal_entry',
        expect.objectContaining({
          target_company: 'company-1',
          entry_type: 'Journal Entry',
          lines: [
            { account_id: 'a1', debit: 100, credit: 0 },
            { account_id: 'a2', debit: 0, credit: 100 },
          ],
        })
      )
    );
  });
});
