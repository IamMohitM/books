import { AccountLedger } from 'reports/AccountLedger/AccountLedger';
import { ModelNameEnum } from 'models/types';
import test from 'tape';
import { closeTestFyo, getTestFyo, setupTestFyo } from './helpers';

const fyo = getTestFyo();
setupTestFyo(fyo, __filename);

async function getAccountName(rootType: string, isGroup = false) {
  const rows = (await fyo.db.getAll(ModelNameEnum.Account, {
    fields: ['name'],
    filters: { rootType, isGroup },
    orderBy: 'name',
    order: 'asc',
  })) as { name: string }[];

  return rows[0]?.name;
}

test('account ledger prompts for an account before rendering data', async (t) => {
  const report = new AccountLedger(fyo);
  await report.initialize();

  t.equal(report.reportData.length, 0, 'report starts empty');
  t.equal(
    report.emptyMessage,
    'Select one or more accounts or groups to view the ledger.',
    'empty state asks for an account selection'
  );
  t.end();
});

test('account ledger includes descendant entries for group accounts and respects date filters', async (t) => {
  const assetGroup = await getAccountName('Asset', true);
  const assetLeaf = await getAccountName('Asset', false);
  const income = await getAccountName('Income', false);

  t.ok(assetGroup && assetLeaf && income, 'base accounts exist for setup');
  if (!assetGroup || !assetLeaf || !income) {
    t.end();
    return;
  }

  const parentGroup = fyo.doc.getNewDoc(ModelNameEnum.Account, {
    name: 'AL Parent Group',
    rootType: 'Asset',
    parentAccount: assetGroup,
    isGroup: true,
  });
  await parentGroup.sync();

  const childGroup = fyo.doc.getNewDoc(ModelNameEnum.Account, {
    name: 'AL Child Group',
    rootType: 'Asset',
    parentAccount: 'AL Parent Group',
    isGroup: true,
  });
  await childGroup.sync();

  const childLeaf = fyo.doc.getNewDoc(ModelNameEnum.Account, {
    name: 'AL Child Leaf',
    rootType: 'Asset',
    parentAccount: 'AL Child Group',
    accountType: 'Cash',
    isGroup: false,
  });
  await childLeaf.sync();

  const inRange = fyo.doc.getNewDoc(ModelNameEnum.JournalEntry, {
    entryType: 'Journal Entry',
    date: '2025-03-10',
  });
  inRange.push('accounts', {
    account: 'AL Child Leaf',
    debit: fyo.pesa(125),
    credit: fyo.pesa(0),
  });
  inRange.push('accounts', {
    account: income,
    debit: fyo.pesa(0),
    credit: fyo.pesa(125),
  });
  await inRange.sync();
  await inRange.submit();

  const outOfRange = fyo.doc.getNewDoc(ModelNameEnum.JournalEntry, {
    entryType: 'Journal Entry',
    date: '2025-04-10',
  });
  outOfRange.push('accounts', {
    account: 'AL Child Leaf',
    debit: fyo.pesa(225),
    credit: fyo.pesa(0),
  });
  outOfRange.push('accounts', {
    account: income,
    debit: fyo.pesa(0),
    credit: fyo.pesa(225),
  });
  await outOfRange.sync();
  await outOfRange.submit();

  const unrelated = fyo.doc.getNewDoc(ModelNameEnum.JournalEntry, {
    entryType: 'Journal Entry',
    date: '2025-03-12',
  });
  unrelated.push('accounts', {
    account: assetLeaf,
    debit: fyo.pesa(300),
    credit: fyo.pesa(0),
  });
  unrelated.push('accounts', {
    account: income,
    debit: fyo.pesa(0),
    credit: fyo.pesa(300),
  });
  await unrelated.sync();
  await unrelated.submit();

  const report = new AccountLedger(fyo);
  await report.initialize();
  await report.set('account', 'AL Parent Group');
  await report.set('fromDate', '2025-03-01');
  await report.set('toDate', '2025-03-31');

  const accountIndex = report.columns.findIndex((column) => column.fieldname === 'account');
  const debitIndex = report.columns.findIndex((column) => column.fieldname === 'debit');
  const dateIndex = report.columns.findIndex((column) => column.fieldname === 'date');

  const datedRows = report.reportData.filter(
    (row) => row.cells[dateIndex]?.rawValue instanceof Date
  );

  t.equal(datedRows.length, 1, 'only one descendant ledger row falls inside the date range');
  t.equal(
    datedRows[0]?.cells[accountIndex]?.rawValue,
    'AL Child Leaf',
    'group account expands to the descendant leaf account'
  );
  t.equal(
    datedRows[0]?.cells[debitIndex]?.rawValue,
    125,
    'in-range descendant entry is included'
  );
  t.notOk(
    report.reportData.some((row) => row.cells[debitIndex]?.rawValue === 225),
    'out-of-range descendant entry is excluded'
  );
  t.notOk(
    report.reportData.some((row) => row.cells[accountIndex]?.rawValue === assetLeaf),
    'unrelated account entries are excluded'
  );
  t.end();
});

test('account ledger combines direct account and group selections with provenance labels', async (t) => {
  const assetGroup = await getAccountName('Asset', true);
  const income = await getAccountName('Income', false);
  const expense = await getAccountName('Expense', false);

  t.ok(assetGroup && income && expense, 'base accounts exist for setup');
  if (!assetGroup || !income || !expense) {
    t.end();
    return;
  }

  const parentGroup = fyo.doc.getNewDoc(ModelNameEnum.Account, {
    name: 'AL Multi Parent',
    rootType: 'Asset',
    parentAccount: assetGroup,
    isGroup: true,
  });
  await parentGroup.sync();

  const childLeaf = fyo.doc.getNewDoc(ModelNameEnum.Account, {
    name: 'AL Multi Child',
    rootType: 'Asset',
    parentAccount: 'AL Multi Parent',
    accountType: 'Cash',
    isGroup: false,
  });
  await childLeaf.sync();

  const groupMatch = fyo.doc.getNewDoc(ModelNameEnum.JournalEntry, {
    entryType: 'Journal Entry',
    date: '2025-05-01',
  });
  groupMatch.push('accounts', {
    account: 'AL Multi Child',
    debit: fyo.pesa(50),
    credit: fyo.pesa(0),
  });
  groupMatch.push('accounts', {
    account: income,
    debit: fyo.pesa(0),
    credit: fyo.pesa(50),
  });
  await groupMatch.sync();
  await groupMatch.submit();

  const directMatch = fyo.doc.getNewDoc(ModelNameEnum.JournalEntry, {
    entryType: 'Journal Entry',
    date: '2025-05-02',
  });
  directMatch.push('accounts', {
    account: expense,
    debit: fyo.pesa(75),
    credit: fyo.pesa(0),
  });
  directMatch.push('accounts', {
    account: income,
    debit: fyo.pesa(0),
    credit: fyo.pesa(75),
  });
  await directMatch.sync();
  await directMatch.submit();

  const report = new AccountLedger(fyo);
  await report.initialize();
  await report.set(
    'accounts',
    JSON.stringify(['AL Multi Parent', expense])
  );
  await report.set('fromDate', '2025-05-01');
  await report.set('toDate', '2025-05-31');

  const accountIndex = report.columns.findIndex((column) => column.fieldname === 'account');
  const selectedViaIndex = report.columns.findIndex(
    (column) => column.fieldname === 'selectedVia'
  );
  const dateIndex = report.columns.findIndex((column) => column.fieldname === 'date');

  const datedRows = report.reportData.filter(
    (row) => row.cells[dateIndex]?.rawValue instanceof Date
  );
  const childRow = datedRows.find(
    (row) => row.cells[accountIndex]?.rawValue === 'AL Multi Child'
  );
  const expenseRow = datedRows.find(
    (row) => row.cells[accountIndex]?.rawValue === expense
  );

  t.equal(datedRows.length, 2, 'direct account and group descendant rows are both included');
  t.equal(
    childRow?.cells[selectedViaIndex]?.rawValue,
    'AL Multi Parent',
    'group descendant row is labeled with the selected group'
  );
  t.equal(
    expenseRow?.cells[selectedViaIndex]?.rawValue,
    '',
    'directly selected account row has no group provenance label'
  );
  t.end();
});

closeTestFyo(fyo, __filename);
