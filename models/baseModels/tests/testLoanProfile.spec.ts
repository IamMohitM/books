import test from 'tape';
import { closeTestFyo, getTestFyo, setupTestFyo } from 'tests/helpers';
import { ModelNameEnum } from 'models/types';

const fyo = getTestFyo();
setupTestFyo(fyo, __filename);

test('create loan profile and post principal journal entry', async (t) => {
  const loanProfile = fyo.doc.getNewDoc(ModelNameEnum.LoanProfile, {
    name: 'L-001',
    lenderName: 'Person A',
    startDate: '2026-01-01',
    liabilityAccount: 'Creditors',
    interestExpenseAccount: 'Cost of Goods Sold',
    annualInterestRate: 12,
    openingPrincipal: fyo.pesa(0),
    openingAccruedInterest: fyo.pesa(0),
    active: true,
  });
  await loanProfile.sync();

  const jv = fyo.doc.getNewDoc(ModelNameEnum.JournalEntry, {
    entryType: 'Cash Entry',
    date: '2026-01-15',
    accounts: [
      {
        account: 'Cash',
        debit: fyo.pesa(5000),
        credit: fyo.pesa(0),
      },
      {
        account: 'Creditors',
        debit: fyo.pesa(0),
        credit: fyo.pesa(5000),
        loanProfile: 'L-001',
        loanComponent: 'Principal',
      },
    ],
  });

  await jv.sync();
  await jv.submit();

  const entries = await fyo.db.getAllRaw(ModelNameEnum.AccountingLedgerEntry, {
    fields: ['account', 'loanProfile', 'loanComponent'],
    filters: {
      referenceType: ModelNameEnum.JournalEntry,
      referenceName: jv.name!,
      account: 'Creditors',
      reverted: false,
    },
  });

  t.equal(entries.length, 1, 'one liability ledger entry created');
  t.equal(entries[0].loanProfile, 'L-001', 'loan profile propagated');
  t.equal(entries[0].loanComponent, 'Principal', 'loan component propagated');
});

test('auto-map loan component account based on loan profile', async (t) => {
  const interestJv = fyo.doc.getNewDoc(ModelNameEnum.JournalEntry, {
    entryType: 'Cash Entry',
    date: '2026-01-16',
    accounts: [
      {
        account: 'Cash',
        debit: fyo.pesa(300),
        credit: fyo.pesa(0),
      },
      {
        account: 'Creditors',
        debit: fyo.pesa(0),
        credit: fyo.pesa(300),
        loanProfile: 'L-001',
        loanComponent: 'Interest',
      },
    ],
  });

  await interestJv.sync();

  const loanRow = (interestJv.accounts as { loanComponent?: string; account?: string }[])
    ?.find((row) => row.loanComponent === 'Interest');
  t.equal(
    loanRow?.account,
    'Cost of Goods Sold',
    'interest row account auto-mapped to interest expense account'
  );
});

closeTestFyo(fyo, __filename);
