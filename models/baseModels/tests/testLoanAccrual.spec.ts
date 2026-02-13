import test from 'tape';
import { closeTestFyo, getTestFyo, setupTestFyo } from 'tests/helpers';
import { ModelNameEnum } from 'models/types';

const fyo = getTestFyo();
setupTestFyo(fyo, __filename);

test('loan accrual excludes receipt day', async (t) => {
  const loanProfile = fyo.doc.getNewDoc(ModelNameEnum.LoanProfile, {
    name: 'L-ACCRUAL',
    lenderName: 'Lender Accrual',
    startDate: '2026-02-12',
    liabilityAccount: 'Creditors',
    interestExpenseAccount: 'Cost of Goods Sold',
    annualInterestRate: 12,
    openingPrincipal: fyo.pesa(100000),
    openingAccruedInterest: fyo.pesa(0),
    active: true,
  });
  await loanProfile.sync();

  const snapshot = await fyo.db.getLoanSnapshot('L-ACCRUAL', '2026-02-14');
  t.ok(snapshot, 'snapshot generated');

  const accrued = snapshot?.accruedInterest ?? 0;
  const expected = 100000 * 0.12 * (2 / 365);
  t.ok(
    Math.abs(accrued - expected) < 0.01,
    `accrued interest ${accrued} ~ ${expected}`
  );
});

test('loan ledger includes same-day principal on as-of date', async (t) => {
  const loanProfile = fyo.doc.getNewDoc(ModelNameEnum.LoanProfile, {
    name: 'L-SAMEDAY',
    lenderName: 'Lender SameDay',
    startDate: '2026-02-10',
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
    date: '2026-02-14',
    accounts: [
      {
        account: 'Cash',
        debit: fyo.pesa(1000),
        credit: fyo.pesa(0),
      },
      {
        account: 'Creditors',
        debit: fyo.pesa(0),
        credit: fyo.pesa(1000),
        loanProfile: 'L-SAMEDAY',
        loanComponent: 'Principal',
      },
    ],
  });

  await jv.sync();
  await jv.submit();

  const ledgerRows = await fyo.db.getLoanLedger('L-SAMEDAY', undefined, '2026-02-14');
  t.ok(
    ledgerRows.some((row) => row.loanComponent === 'Principal'),
    'ledger includes same-day principal row'
  );

  const snapshot = await fyo.db.getLoanSnapshot('L-SAMEDAY', '2026-02-14');
  t.equal(
    snapshot?.principalOutstanding,
    1000,
    'principal includes same-day credit'
  );
});

test('loan portfolio excludes future start dates', async (t) => {
  const loanProfile = fyo.doc.getNewDoc(ModelNameEnum.LoanProfile, {
    name: 'L-FUTURE',
    lenderName: 'Lender Future',
    startDate: '2026-03-01',
    liabilityAccount: 'Creditors',
    interestExpenseAccount: 'Cost of Goods Sold',
    annualInterestRate: 12,
    openingPrincipal: fyo.pesa(5000),
    openingAccruedInterest: fyo.pesa(0),
    active: true,
  });
  await loanProfile.sync();

  const snapshots = await fyo.db.getLoanPortfolioSnapshot('2026-02-14');
  t.ok(
    !snapshots.some((row) => row.loanProfile === 'L-FUTURE'),
    'future loan excluded from portfolio snapshot'
  );
});

test('loan snapshot zero before start date', async (t) => {
  const loanProfile = fyo.doc.getNewDoc(ModelNameEnum.LoanProfile, {
    name: 'L-BEFORE',
    lenderName: 'Lender Before',
    startDate: '2026-02-12',
    liabilityAccount: 'Creditors',
    interestExpenseAccount: 'Cost of Goods Sold',
    annualInterestRate: 12,
    openingPrincipal: fyo.pesa(100000),
    openingAccruedInterest: fyo.pesa(500),
    active: true,
  });
  await loanProfile.sync();

  const snapshot = await fyo.db.getLoanSnapshot('L-BEFORE', '2026-02-10');
  t.ok(snapshot, 'snapshot generated');
  t.equal(snapshot?.principalOutstanding, 0, 'principal is zero before start');
  t.equal(snapshot?.accruedInterest, 0, 'accrued interest is zero before start');
  t.equal(snapshot?.interestOwed, 0, 'interest owed is zero before start');
  t.equal(snapshot?.totalDue, 0, 'total due is zero before start');
});

test('accrual handles mid-period principal increase excluding receipt day', async (t) => {
  const loanProfile = fyo.doc.getNewDoc(ModelNameEnum.LoanProfile, {
    name: 'L-PRINCIPAL-STEP',
    lenderName: 'Lender Step',
    startDate: '2026-02-10',
    liabilityAccount: 'Creditors',
    interestExpenseAccount: 'Cost of Goods Sold',
    annualInterestRate: 12,
    openingPrincipal: fyo.pesa(1000),
    openingAccruedInterest: fyo.pesa(0),
    active: true,
  });
  await loanProfile.sync();

  const jv = fyo.doc.getNewDoc(ModelNameEnum.JournalEntry, {
    entryType: 'Cash Entry',
    date: '2026-02-12',
    accounts: [
      {
        account: 'Cash',
        debit: fyo.pesa(1000),
        credit: fyo.pesa(0),
      },
      {
        account: 'Creditors',
        debit: fyo.pesa(0),
        credit: fyo.pesa(1000),
        loanProfile: 'L-PRINCIPAL-STEP',
        loanComponent: 'Principal',
      },
    ],
  });

  await jv.sync();
  await jv.submit();

  const snapshot = await fyo.db.getLoanSnapshot(
    'L-PRINCIPAL-STEP',
    '2026-02-14'
  );
  t.ok(snapshot, 'snapshot generated');

  const expected =
    1000 * 0.12 * (1 / 365) + 2000 * 0.12 * (2 / 365);
  t.ok(
    Math.abs((snapshot?.accruedInterest ?? 0) - expected) < 0.01,
    `accrued interest ${snapshot?.accruedInterest} ~ ${expected}`
  );
});

test('principal inferred from liability account when loanProfile missing', async (t) => {
  const loanProfile = fyo.doc.getNewDoc(ModelNameEnum.LoanProfile, {
    name: 'L-INFER',
    lenderName: 'Lender Infer',
    startDate: '2026-02-01',
    liabilityAccount: 'Creditors',
    interestExpenseAccount: 'Cost of Goods Sold',
    annualInterestRate: 12,
    openingPrincipal: fyo.pesa(0),
    openingAccruedInterest: fyo.pesa(0),
    active: true,
  });
  await loanProfile.sync();

  const jv = fyo.doc.getNewDoc(ModelNameEnum.JournalEntry, {
    entryType: 'Journal Entry',
    date: '2026-02-05',
    accounts: [
      {
        account: 'Cash',
        debit: fyo.pesa(2500),
        credit: fyo.pesa(0),
      },
      {
        account: 'Creditors',
        debit: fyo.pesa(0),
        credit: fyo.pesa(2500),
      },
    ],
  });
  await jv.sync();
  await jv.submit();

  const snapshot = await fyo.db.getLoanSnapshot('L-INFER', '2026-02-10');
  t.equal(
    snapshot?.principalOutstanding,
    2500,
    'principal inferred from liability account entries'
  );
});

test('interest inferred from expense account when loanProfile missing', async (t) => {
  const loanProfile = fyo.doc.getNewDoc(ModelNameEnum.LoanProfile, {
    name: 'L-INFER-INT',
    lenderName: 'Lender Infer Interest',
    startDate: '2026-02-01',
    liabilityAccount: 'Creditors',
    interestExpenseAccount: 'Cost of Goods Sold',
    annualInterestRate: 12,
    openingPrincipal: fyo.pesa(0),
    openingAccruedInterest: fyo.pesa(0),
    active: true,
  });
  await loanProfile.sync();

  const jv = fyo.doc.getNewDoc(ModelNameEnum.JournalEntry, {
    entryType: 'Journal Entry',
    date: '2026-02-05',
    accounts: [
      {
        account: 'Cost of Goods Sold',
        debit: fyo.pesa(100),
        credit: fyo.pesa(0),
      },
      {
        account: 'Cash',
        debit: fyo.pesa(0),
        credit: fyo.pesa(100),
      },
    ],
  });
  await jv.sync();
  await jv.submit();

  const snapshot = await fyo.db.getLoanSnapshot('L-INFER-INT', '2026-02-10');
  t.equal(snapshot?.interestPaid, 100, 'interest inferred from expense account');
});

closeTestFyo(fyo, __filename);
