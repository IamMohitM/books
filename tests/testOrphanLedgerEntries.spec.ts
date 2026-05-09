import test from 'tape';
import { GeneralLedger } from 'reports/GeneralLedger/GeneralLedger';
import { LoanLedger } from 'reports/LoanLedger/LoanLedger';
import { ModelNameEnum } from 'models/types';
import { closeTestFyo, getTestFyo, setupTestFyo } from './helpers';

const fyo = getTestFyo();
setupTestFyo(fyo, __filename);

test('orphaned ledger rows are excluded from general ledger and loan ledger', async (t) => {
  const loanProfile = fyo.doc.getNewDoc(ModelNameEnum.LoanProfile, {
    name: 'L-ORPHAN',
    lenderName: 'Orphan Lender',
    startDate: '2026-01-01',
    liabilityAccount: 'Creditors',
    interestExpenseAccount: 'Cost of Goods Sold',
    annualInterestRate: 12,
    openingPrincipal: fyo.pesa(0),
    openingAccruedInterest: fyo.pesa(0),
    active: true,
  });
  await loanProfile.sync();

  const journalEntry = fyo.doc.getNewDoc(ModelNameEnum.JournalEntry, {
    entryType: 'Cash Entry',
    date: '2026-01-15',
    userRemark: 'orphan ledger row',
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
        loanProfile: 'L-ORPHAN',
        loanComponent: 'Principal',
      },
    ],
  });

  await journalEntry.sync();
  await journalEntry.submit();

  const ledgerEntries = await fyo.db.getAllRaw(
    ModelNameEnum.AccountingLedgerEntry,
    {
      fields: ['name', 'referenceType', 'referenceName'],
      filters: {
        referenceType: ModelNameEnum.JournalEntry,
        referenceName: journalEntry.name!,
        reverted: false,
      },
    }
  );
  t.ok(
    ledgerEntries.length > 0,
    'ledger entries exist before orphaning source doc'
  );

  await fyo.db.delete(ModelNameEnum.JournalEntry, journalEntry.name!);

  const generalLedger = new GeneralLedger(fyo);
  await generalLedger.initialize();
  await generalLedger.set('fromDate', '2026-01-01');
  await generalLedger.set('toDate', '2026-01-31');

  const generalLedgerHasOrphan = generalLedger.reportData.some((row) =>
    row.cells.some((cell) => cell.rawValue === journalEntry.name)
  );
  t.equal(
    generalLedgerHasOrphan,
    false,
    'general ledger excludes orphaned ledger rows'
  );

  const loanLedger = new LoanLedger(fyo);
  await loanLedger.initialize();
  await loanLedger.set('loanProfile', 'L-ORPHAN');
  await loanLedger.set('fromDate', '2026-01-01');
  await loanLedger.set('toDate', '2026-01-31');
  await loanLedger.set('asOfDate', '2026-01-31');

  const loanLedgerHasOrphan = loanLedger.reportData.some((row) =>
    row.cells.some((cell) => cell.rawValue === journalEntry.name)
  );
  t.equal(
    loanLedgerHasOrphan,
    false,
    'loan ledger excludes orphaned ledger rows from calculations and display'
  );
});

closeTestFyo(fyo, __filename);
