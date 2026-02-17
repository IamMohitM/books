import { DateTime } from 'luxon';
import { ModelNameEnum } from 'models/types';
import { GeneralLedger } from 'reports/GeneralLedger/GeneralLedger';
import { LoanLedger } from 'reports/LoanLedger/LoanLedger';
import { LoanRegister } from 'reports/LoanRegister/LoanRegister';
import test from 'tape';
import { closeTestFyo, getTestFyo, setupTestFyo } from './helpers';

const fyo = getTestFyo();
setupTestFyo(fyo, __filename);

async function getAccountName(rootType: string) {
  const rows = (await fyo.db.getAll(ModelNameEnum.Account, {
    fields: ['name'],
    filters: { rootType, isGroup: false },
  })) as { name: string }[];
  return rows[0]?.name;
}

test('general ledger defaults to month-to-date', async (t) => {
  const now = DateTime.now();
  const gl = new GeneralLedger(fyo);
  gl.setDefaultFilters();

  t.equal(
    gl.fromDate,
    now.startOf('month').toISODate(),
    'from date defaults to month start'
  );
  t.equal(gl.toDate, now.toISODate(), 'to date defaults to today');
  t.end();
});

test('general ledger respects date filters', async (t) => {
  const asset = await getAccountName('Asset');
  const income = await getAccountName('Income');

  t.ok(asset && income, 'accounts exist for journal entry');
  if (!asset || !income) {
    t.end();
    return;
  }

  const jeInside = fyo.doc.getNewDoc(ModelNameEnum.JournalEntry, {
    entryType: 'Journal Entry',
    date: '2025-01-05',
  });
  jeInside.push('accounts', {
    account: asset,
    debit: fyo.pesa(100),
    credit: fyo.pesa(0),
  });
  jeInside.push('accounts', {
    account: income,
    debit: fyo.pesa(0),
    credit: fyo.pesa(100),
  });
  await jeInside.sync();
  await jeInside.submit();

  const jeOutside = fyo.doc.getNewDoc(ModelNameEnum.JournalEntry, {
    entryType: 'Journal Entry',
    date: '2025-02-05',
  });
  jeOutside.push('accounts', {
    account: asset,
    debit: fyo.pesa(200),
    credit: fyo.pesa(0),
  });
  jeOutside.push('accounts', {
    account: income,
    debit: fyo.pesa(0),
    credit: fyo.pesa(200),
  });
  await jeOutside.sync();
  await jeOutside.submit();

  const gl = new GeneralLedger(fyo);
  await gl.initialize();
  await gl.set('fromDate', '2025-01-01');
  await gl.set('toDate', '2025-01-31');

  const dateIndex = gl.columns.findIndex((c) => c.fieldname === 'date');
  const dates = gl.reportData
    .map((row) => row.cells[dateIndex]?.rawValue)
    .filter((value) => value instanceof Date) as Date[];

  t.equal(dates.length, 2, 'only in-range ledger entries are included');

  const from = DateTime.fromISO('2025-01-01').startOf('day');
  const to = DateTime.fromISO('2025-01-31').endOf('day');

  for (const date of dates) {
    const dt = DateTime.fromJSDate(date);
    t.ok(dt >= from && dt <= to, `date ${dt.toISODate()} in range`);
  }
  t.end();
});

test('loan register can sort by lender name', async (t) => {
  const liability = await getAccountName('Liability');
  const expense = await getAccountName('Expense');

  t.ok(liability && expense, 'accounts exist for loan profile');
  if (!liability || !expense) {
    t.end();
    return;
  }

  const alpha = fyo.doc.getNewDoc(ModelNameEnum.LoanProfile, {
    name: 'L-ALPHA',
    lenderName: 'Alpha Bank',
    startDate: '2025-01-10',
    liabilityAccount: liability,
    interestExpenseAccount: expense,
    annualInterestRate: 10,
  });
  await alpha.sync();

  const beta = fyo.doc.getNewDoc(ModelNameEnum.LoanProfile, {
    name: 'L-BETA',
    lenderName: 'Beta Bank',
    startDate: '2025-01-11',
    liabilityAccount: liability,
    interestExpenseAccount: expense,
    annualInterestRate: 12,
  });
  await beta.sync();

  const report = new LoanRegister(fyo);
  await report.initialize();
  await report.set('asOfDate', '2025-02-01');
  await report.set('sortByField', 'lenderName');
  await report.set('sortByDate', 'asc');

  const lenderIndex = report.columns.findIndex(
    (c) => c.fieldname === 'lenderName'
  );
  const lenders = report.reportData
    .map((row) => row.cells[lenderIndex]?.rawValue)
    .filter((value) => typeof value === 'string') as string[];

  t.deepEqual(
    lenders.slice(0, 2),
    ['Alpha Bank', 'Beta Bank'],
    'sorted by lender name asc'
  );
  t.end();
});

test('loan register integrates pre-system amounts into totals', async (t) => {
  const liability = await getAccountName('Liability');
  const expense = await getAccountName('Expense');

  t.ok(liability && expense, 'accounts exist for loan profile');
  if (!liability || !expense) {
    t.end();
    return;
  }

  const loan = fyo.doc.getNewDoc(ModelNameEnum.LoanProfile, {
    name: 'L-PREPAID',
    lenderName: 'Prepaid Bank',
    startDate: '2025-01-01',
    openingPrincipal: 1000,
    openingAccruedInterest: 100,
    historicalInterestPaid: 50,
    includeHistoricalInterestPaid: false,
    annualInterestRate: 0,
    liabilityAccount: liability,
    interestExpenseAccount: expense,
  });
  loan.push('historicalPayments', {
    date: '2024-12-31',
    paymentType: 'Principal',
    amount: 200,
  });
  await loan.sync();

  const report = new LoanRegister(fyo);
  await report.initialize();
  await report.set('loanProfile', 'L-PREPAID');
  await report.set('asOfDate', '2025-01-01');

  const fieldnames = report.columns.map((c) => c.fieldname);
  t.notOk(
    fieldnames.includes('preSystemInterestPaid'),
    'pre-system interest column removed'
  );
  t.notOk(
    fieldnames.includes('preSystemPrincipalPaid'),
    'pre-system principal column removed'
  );

  const principalIdx = report.columns.findIndex(
    (c) => c.fieldname === 'principalOutstanding'
  );
  const interestPaidIdx = report.columns.findIndex(
    (c) => c.fieldname === 'interestPaid'
  );
  const interestOwedIdx = report.columns.findIndex(
    (c) => c.fieldname === 'interestOwed'
  );
  const totalDueIdx = report.columns.findIndex(
    (c) => c.fieldname === 'totalDue'
  );

  const firstRow = report.reportData[0];
  t.equal(
    firstRow.cells[principalIdx]?.rawValue,
    800,
    'principal outstanding includes pre-system principal paid'
  );
  t.equal(
    firstRow.cells[interestPaidIdx]?.rawValue,
    50,
    'interest paid includes pre-system interest'
  );
  t.equal(
    firstRow.cells[interestOwedIdx]?.rawValue,
    50,
    'interest owed reflects integrated pre-system interest'
  );
  t.equal(
    firstRow.cells[totalDueIdx]?.rawValue,
    850,
    'total due reflects integrated pre-system amounts'
  );
  t.end();
});

test('loan ledger integrates pre-system payments into balances', async (t) => {
  const liability = await getAccountName('Liability');
  const expense = await getAccountName('Expense');

  t.ok(liability && expense, 'accounts exist for loan profile');
  if (!liability || !expense) {
    t.end();
    return;
  }

  const loan = fyo.doc.getNewDoc(ModelNameEnum.LoanProfile, {
    name: 'L-LEDGER-PREPAID',
    lenderName: 'Ledger Bank',
    startDate: '2025-01-01',
    openingPrincipal: 100000,
    openingAccruedInterest: 2000,
    historicalInterestPaid: 1000,
    includeHistoricalInterestPaid: false,
    annualInterestRate: 0,
    liabilityAccount: liability,
    interestExpenseAccount: expense,
  });
  loan.push('historicalPayments', {
    date: '2024-12-31',
    paymentType: 'Principal',
    amount: 2000,
  });
  await loan.sync();

  const report = new LoanLedger(fyo);
  await report.initialize();
  await report.set('loanProfile', 'L-LEDGER-PREPAID');
  await report.set('asOfDate', '2025-01-01');

  const principalIdx = report.columns.findIndex(
    (c) => c.fieldname === 'principalOutstanding'
  );
  const interestPaidIdx = report.columns.findIndex(
    (c) => c.fieldname === 'interestPaid'
  );
  const interestOwedIdx = report.columns.findIndex(
    (c) => c.fieldname === 'interestOwed'
  );
  const totalDueIdx = report.columns.findIndex(
    (c) => c.fieldname === 'totalDue'
  );

  const finalRow = report.reportData.at(-1);
  t.ok(finalRow, 'final as-of row exists');
  if (!finalRow) {
    t.end();
    return;
  }

  t.equal(
    finalRow.cells[principalIdx]?.rawValue,
    98000,
    'principal outstanding reduced by pre-system principal'
  );
  t.equal(
    finalRow.cells[interestPaidIdx]?.rawValue,
    1000,
    'interest paid includes pre-system interest'
  );
  t.equal(
    finalRow.cells[interestOwedIdx]?.rawValue,
    1000,
    'interest owed reflects pre-system interest paid'
  );
  t.equal(
    finalRow.cells[totalDueIdx]?.rawValue,
    99000,
    'total due reflects integrated pre-system amounts'
  );
  t.end();
});

closeTestFyo(fyo, __filename);
