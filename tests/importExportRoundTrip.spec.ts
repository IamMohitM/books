import test from 'tape';
import {
  getCsvExportData,
  getExportFields,
  getExportTableFields,
  ensureSubmittableMetaFields,
} from 'src/utils/export';
import { parseCSV, generateCSV } from 'utils/csvParser';
import { ModelNameEnum } from 'models/types';
import { Importer } from 'src/importer';
import { Fyo } from 'fyo';
import { getTestFyo, getTestSetupWizardOptions } from './helpers';
import setupInstance from 'src/setup/setupInstance';
import {
  AccountRootType,
  AccountTypeEnum,
} from 'models/baseModels/Account/types';
import { Report } from 'reports/Report';
import { TrialBalance } from 'reports/TrialBalance/TrialBalance';
import { GeneralLedger } from 'reports/GeneralLedger/GeneralLedger';
import { BalanceSheet } from 'reports/BalanceSheet/BalanceSheet';
import { ProfitAndLoss } from 'reports/ProfitAndLoss/ProfitAndLoss';
import { LoanLedger } from 'reports/LoanLedger/LoanLedger';
import { LoanRegister } from 'reports/LoanRegister/LoanRegister';
import { QueryFilter } from 'utils/db/types';

const fyoSrc = getTestFyo();
const fyoDst = getTestFyo();

const TEST_FROM_DATE = '2024-01-01';
const TEST_TO_DATE = '2025-12-31';
const LOAN_AS_OF_DATE = '2025-12-31';

async function setupFyo(fyo: Fyo) {
  const options = getTestSetupWizardOptions();
  await setupInstance(':memory:', options, fyo);
}

async function getAnyGroupAccount(fyo: Fyo, rootType: AccountRootType) {
  const groups = (await fyo.db.getAll(ModelNameEnum.Account, {
    fields: ['name', 'rootType', 'isGroup'],
    filters: { rootType, isGroup: true },
  })) as { name: string }[];
  return groups[0]?.name;
}

async function createAccount(
  fyo: Fyo,
  data: {
    name: string;
    rootType: AccountRootType;
    parentAccount: string;
    accountType?: string;
    isGroup: boolean;
  }
) {
  const doc = fyo.doc.getNewDoc(ModelNameEnum.Account, data);
  await doc.sync();
  return doc.name as string;
}

async function createTestData(fyo: Fyo) {
  const assetRoot = await getAnyGroupAccount(fyo, 'Asset');
  const liabilityRoot = await getAnyGroupAccount(fyo, 'Liability');
  const expenseRoot = await getAnyGroupAccount(fyo, 'Expense');
  const incomeRoot = await getAnyGroupAccount(fyo, 'Income');

  if (!assetRoot || !liabilityRoot || !expenseRoot || !incomeRoot) {
    throw new Error('Missing root group accounts');
  }

  const groupA = await createAccount(fyo, {
    name: 'Test Assets Group',
    rootType: 'Asset',
    parentAccount: assetRoot,
    isGroup: true,
  });

  const groupB = await createAccount(fyo, {
    name: 'Test Assets Subgroup',
    rootType: 'Asset',
    parentAccount: groupA,
    isGroup: true,
  });

  const assetAccount = await createAccount(fyo, {
    name: 'Test Cash Account',
    rootType: 'Asset',
    parentAccount: groupB,
    accountType: AccountTypeEnum.Cash,
    isGroup: false,
  });

  const incomeAccount = await createAccount(fyo, {
    name: 'Test Income Account',
    rootType: 'Income',
    parentAccount: incomeRoot,
    accountType: AccountTypeEnum['Income Account'],
    isGroup: false,
  });

  const expenseAccount = await createAccount(fyo, {
    name: 'Test Expense Account',
    rootType: 'Expense',
    parentAccount: expenseRoot,
    accountType: AccountTypeEnum['Expense Account'],
    isGroup: false,
  });

  const liabilityAccount = await createAccount(fyo, {
    name: 'Test Loan Liability',
    rootType: 'Liability',
    parentAccount: liabilityRoot,
    accountType: AccountTypeEnum.Payable,
    isGroup: false,
  });

  const interestExpenseAccount = await createAccount(fyo, {
    name: 'Test Interest Expense',
    rootType: 'Expense',
    parentAccount: expenseRoot,
    accountType: AccountTypeEnum['Expense Account'],
    isGroup: false,
  });

  const loanProfile = fyo.doc.getNewDoc(ModelNameEnum.LoanProfile, {
    name: 'LP-ROUNDTRIP',
    lenderName: 'Roundtrip Lender',
    startDate: '2024-12-31',
    liabilityAccount,
    interestExpenseAccount,
    annualInterestRate: 12,
    openingPrincipal: 10000,
    openingAccruedInterest: 200,
    historicalInterestPaid: 100,
    includeHistoricalInterestPaid: true,
    notes: 'Roundtrip test loan',
  });
  loanProfile.push('historicalPayments', {
    date: '2024-11-30',
    paymentType: 'Principal',
    amount: 500,
  });
  loanProfile.push('historicalPayments', {
    date: '2024-11-30',
    paymentType: 'Interest',
    amount: 50,
  });
  await loanProfile.sync();

  const journalEntry = fyo.doc.getNewDoc(ModelNameEnum.JournalEntry, {
    entryType: 'Journal Entry',
    date: '2025-02-01',
    referenceNumber: 'RT-JE-1',
  });
  journalEntry.push('accounts', {
    account: assetAccount,
    debit: fyo.pesa(1000),
    credit: fyo.pesa(0),
  });
  journalEntry.push('accounts', {
    account: incomeAccount,
    debit: fyo.pesa(0),
    credit: fyo.pesa(1000),
  });
  await journalEntry.sync();
  await journalEntry.submit();

  const loanEntry = fyo.doc.getNewDoc(ModelNameEnum.JournalEntry, {
    entryType: 'Journal Entry',
    date: '2025-03-01',
    referenceNumber: 'RT-JE-LOAN',
  });
  loanEntry.push('accounts', {
    account: liabilityAccount,
    debit: fyo.pesa(0),
    credit: fyo.pesa(500),
    loanProfile: loanProfile.name,
    loanComponent: 'Principal',
  });
  loanEntry.push('accounts', {
    account: interestExpenseAccount,
    debit: fyo.pesa(500),
    credit: fyo.pesa(0),
    loanProfile: loanProfile.name,
    loanComponent: 'Interest',
  });
  await loanEntry.sync();
  await loanEntry.submit();

  const cancelledEntry = fyo.doc.getNewDoc(ModelNameEnum.JournalEntry, {
    entryType: 'Journal Entry',
    date: '2025-04-01',
    referenceNumber: 'RT-JE-CANCELLED',
  });
  cancelledEntry.push('accounts', {
    account: expenseAccount,
    debit: fyo.pesa(200),
    credit: fyo.pesa(0),
  });
  cancelledEntry.push('accounts', {
    account: assetAccount,
    debit: fyo.pesa(0),
    credit: fyo.pesa(200),
  });
  await cancelledEntry.sync();
  await cancelledEntry.submit();
  await cancelledEntry.cancel();

  return {
    accounts: [
      groupA,
      groupB,
      assetAccount,
      incomeAccount,
      expenseAccount,
      liabilityAccount,
      interestExpenseAccount,
    ],
    loanProfile: loanProfile.name as string,
    journalEntries: [
      journalEntry.name as string,
      loanEntry.name as string,
      cancelledEntry.name as string,
    ],
    cancelledEntry: cancelledEntry.name as string,
    assetGroup: groupA,
    assetSubgroup: groupB,
  };
}

function buildAccountCsvForImport(fyo: Fyo, accountNames: string[]) {
  const importer = new Importer(ModelNameEnum.Account, fyo);
  let headerRows = parseCSV(importer.getCSVTemplate());
  const fieldKeys = importer.assignedTemplateFields;

  return fyo.db
    .getAll(ModelNameEnum.Account, {
      fields: [
        'name',
        'rootType',
        'parentAccount',
        'accountType',
        'isGroup',
        'description',
      ],
      filters: { name: ['in', accountNames] },
    })
    .then((rows) => {
      const dataRows = (
        rows as {
          name: string;
          rootType?: AccountRootType;
          parentAccount?: string | null;
          accountType?: string;
          isGroup?: boolean;
          description?: string | null;
        }[]
      ).map((account) => {
        const values: Record<string, string | number> = {
          'Account.name': account.name,
          'Account.rootType': account.rootType ?? '',
          'Account.parentAccount': account.parentAccount ?? '',
          'Account.accountType': account.accountType ?? '',
          'Account.isGroup': account.isGroup ? 1 : 0,
          'Account.description': account.description ?? '',
        };

        return fieldKeys.map((key) => (key ? values[key] ?? '' : ''));
      });

      return generateCSV([...headerRows, ...dataRows]);
    });
}

async function exportCsv(schemaName: string, fyo: Fyo, filters: QueryFilter) {
  const schemaFields = fyo.schemaMap[schemaName]?.fields ?? [];
  let fields = ensureSubmittableMetaFields(
    getExportFields(schemaFields),
    schemaName,
    fyo
  );
  const tableFields = getExportTableFields(schemaFields, fyo);
  return getCsvExportData(schemaName, fields, tableFields, null, filters, fyo);
}

function getExistingNamesBySchema(importer: Importer) {
  const namesBySchema: Record<string, Set<string>> = {};
  const nameIndices = importer.assignedTemplateFields
    .map((key, index) => ({ key, index }))
    .filter((f) => f.key?.endsWith('.name'))
    .reduce((acc, f) => {
      if (!f.key) {
        return acc;
      }

      const schemaName = f.key.split('.')[0];
      acc[schemaName] = f.index;
      return acc;
    }, {} as Record<string, number>);

  for (const schemaName of Object.keys(nameIndices)) {
    namesBySchema[schemaName] = new Set();
  }

  for (const row of importer.valueMatrix) {
    for (const schemaName of Object.keys(nameIndices)) {
      const idx = nameIndices[schemaName];
      const value = row[idx]?.value;
      if (typeof value === 'string' && value) {
        namesBySchema[schemaName].add(value);
      }
    }
  }

  return namesBySchema;
}

async function importCsv(
  schemaName: string,
  fyo: Fyo,
  csv: string,
  opts?: { includeMetaFields?: boolean; twoPassAccounts?: boolean }
) {
  const importer = new Importer(schemaName, fyo, {
    includeMetaFields: Boolean(opts?.includeMetaFields),
  });
  if (!importer.selectFile(csv)) {
    throw new Error('Invalid CSV');
  }

  const absentLinks = await importer.checkLinks(
    getExistingNamesBySchema(importer)
  );
  if (absentLinks.length) {
    throw new Error(
      `Missing links: ${absentLinks.map((l) => l.name).join(', ')}`
    );
  }

  importer.populateDocs();

  const hasSubmittedField = importer.assignedTemplateFields.includes(
    `${schemaName}.submitted`
  );
  const hasCancelledField = importer.assignedTemplateFields.includes(
    `${schemaName}.cancelled`
  );
  const useStatusFields = hasSubmittedField || hasCancelledField;
  const statusByName = new Map<
    string,
    { submitted?: boolean; cancelled?: boolean }
  >();
  if (useStatusFields) {
    const nameIndex = importer.assignedTemplateFields.indexOf(
      `${schemaName}.name`
    );
    const submittedIndex = importer.assignedTemplateFields.indexOf(
      `${schemaName}.submitted`
    );
    const cancelledIndex = importer.assignedTemplateFields.indexOf(
      `${schemaName}.cancelled`
    );

    if (nameIndex >= 0) {
      for (const row of importer.valueMatrix) {
        const name = row[nameIndex]?.value;
        if (typeof name !== 'string' || !name) {
          continue;
        }

        const submitted =
          submittedIndex >= 0 ? Boolean(row[submittedIndex]?.value) : undefined;
        const cancelled =
          cancelledIndex >= 0 ? Boolean(row[cancelledIndex]?.value) : undefined;
        statusByName.set(name, { submitted, cancelled });
      }
    }
  }

  const syncDoc = async (doc: any) => {
    const sourceName = doc.name ?? '';
    if (doc.name) {
      doc.skipAutoName = true;
    }
    await doc.sync();
    if (!useStatusFields) {
      return;
    }
    const status = statusByName.get(sourceName);
    const submitted = Boolean(status?.submitted);
    const cancelled = Boolean(status?.cancelled);
    if (cancelled) {
      if (!doc.submitted) {
        await doc.submit();
      }
      if (!doc.cancelled) {
        await doc.cancel();
      }
      if (!doc.submitted) {
        await doc.setAndSync('submitted', true);
      }
      if (!doc.cancelled) {
        await doc.setAndSync('cancelled', true);
      }
      return;
    }
    if (submitted && !doc.submitted) {
      await doc.submit();
    }
  };

  const docs = importer.docs;
  if (schemaName === ModelNameEnum.JournalEntry) {
    for (const doc of docs) {
      if (!doc.name) {
        throw new Error('JournalEntry import missing name');
      }
      if (!statusByName.has(doc.name)) {
        throw new Error(
          `JournalEntry name ${doc.name} not found in status map`
        );
      }
    }
  }

  if (schemaName === ModelNameEnum.Account && opts?.twoPassAccounts) {
    const groupDocs = docs.filter((doc) => !!doc.get('isGroup'));
    const leafDocs = docs.filter((doc) => !doc.get('isGroup'));
    const pending = new Map<string, any>();
    for (const doc of groupDocs) {
      if (doc.name) {
        pending.set(doc.name, doc);
      }
    }

    const orderedGroups: any[] = [];
    while (pending.size > 0) {
      let progressed = false;
      for (const [name, doc] of pending.entries()) {
        const parent = doc.get('parentAccount') as string | undefined;
        const parentIsPending = parent && pending.has(parent);
        if (parentIsPending) {
          continue;
        }
        orderedGroups.push(doc);
        pending.delete(name);
        progressed = true;
      }

      if (!progressed) {
        throw new Error(
          `Could not resolve account groups: ${[...pending.keys()].join(', ')}`
        );
      }
    }

    for (const doc of orderedGroups) {
      await syncDoc(doc);
    }
    for (const doc of leafDocs) {
      await syncDoc(doc);
    }
    return;
  }

  for (const doc of docs) {
    await syncDoc(doc);
  }
}

function normalizeValue(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value ?? '';
}

function normalizeReportData(reportData: any) {
  return reportData.map((row: any) => {
    if (row.isEmpty) {
      return { empty: true, cells: [] };
    }
    return {
      empty: false,
      cells: row.cells.map((cell: any) => normalizeValue(cell.rawValue)),
    };
  });
}

async function compareReports(
  t: test.Test,
  src: Report,
  dst: Report,
  label: string
) {
  const srcData = normalizeReportData(src.reportData);
  const dstData = normalizeReportData(dst.reportData);
  t.deepEqual(dstData, srcData, `${label} matches`);
}

function rowsToFieldObjects(report: Report) {
  const fieldnames = report.columns.map((c) => c.fieldname);
  return report.reportData
    .filter((row: any) => !row.isEmpty)
    .map((row: any) => {
      const obj: Record<string, unknown> = {};
      row.cells.forEach((cell: any, idx: number) => {
        obj[fieldnames[idx]] = normalizeValue(cell.rawValue);
      });
      return obj;
    });
}

function compareGeneralLedger(t: test.Test, src: Report, dst: Report) {
  const srcRows = rowsToFieldObjects(src);
  const dstRows = rowsToFieldObjects(dst);

  const getClosingRow = (rows: Record<string, unknown>[]) =>
    rows.find((row) => row.account === 'Closing');

  const stripForCompare = (row: Record<string, unknown>) => {
    const { index, balance, ...rest } = row;
    return rest;
  };

  const filterEntries = (rows: Record<string, unknown>[]) =>
    rows
      .filter((row) => row.account !== 'Closing')
      .map(stripForCompare)
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

  t.deepEqual(
    filterEntries(dstRows),
    filterEntries(srcRows),
    'General Ledger entries match'
  );

  const srcClosing = getClosingRow(srcRows);
  const dstClosing = getClosingRow(dstRows);
  t.deepEqual(dstClosing, srcClosing, 'General Ledger closing row matches');
}

test('setup source company', async (t) => {
  await setupFyo(fyoSrc);
  t.end();
});

test('setup target company', async (t) => {
  await setupFyo(fyoDst);
  t.end();
});

test('round-trip import/export reliability', async (t) => {
  const data = await createTestData(fyoSrc);

  const accountCsv = await buildAccountCsvForImport(fyoSrc, data.accounts);
  const loanProfileCsv = await exportCsv(ModelNameEnum.LoanProfile, fyoSrc, {
    name: ['in', [data.loanProfile]],
  });
  const journalCsv = await exportCsv(ModelNameEnum.JournalEntry, fyoSrc, {
    name: ['in', data.journalEntries],
  });

  const journalParsed = parseCSV(journalCsv);
  const journalKeyRow = journalParsed.find((row) =>
    row.some((cell) => cell === 'JournalEntry.submitted')
  );
  t.ok(
    journalKeyRow?.includes('JournalEntry.submitted'),
    'journal export includes submitted column'
  );
  t.ok(
    journalKeyRow?.includes('JournalEntry.cancelled'),
    'journal export includes cancelled column'
  );
  if (journalKeyRow) {
    const nameIdx = journalKeyRow.indexOf('JournalEntry.name');
    const submittedIdx = journalKeyRow.indexOf('JournalEntry.submitted');
    const cancelledIdx = journalKeyRow.indexOf('JournalEntry.cancelled');
    const dataRows = journalParsed.slice(
      journalParsed.indexOf(journalKeyRow) + 1
    );
    const cancelledRow = dataRows.find(
      (row) => row[nameIdx] === data.cancelledEntry
    );
    t.ok(cancelledRow, 'journal export includes cancelled entry row');
    if (cancelledRow) {
      t.equal(
        cancelledRow[submittedIdx],
        '1',
        'cancelled entry submitted flag exported'
      );
      t.equal(
        cancelledRow[cancelledIdx],
        '1',
        'cancelled entry cancelled flag exported'
      );
    }

    const submittedRows = data.journalEntries
      .filter((name) => name !== data.cancelledEntry)
      .map((name) => dataRows.find((row) => row[nameIdx] === name))
      .filter(Boolean) as string[][];
    for (const row of submittedRows) {
      t.equal(
        row[submittedIdx],
        '1',
        'submitted entry submitted flag exported'
      );
      t.equal(
        row[cancelledIdx],
        '0',
        'submitted entry cancelled flag exported'
      );
    }
  }

  await importCsv(ModelNameEnum.Account, fyoDst, accountCsv, {
    twoPassAccounts: true,
  });
  await importCsv(ModelNameEnum.LoanProfile, fyoDst, loanProfileCsv);
  await importCsv(ModelNameEnum.JournalEntry, fyoDst, journalCsv, {
    includeMetaFields: true,
  });

  const cancelled = await fyoDst.doc.getDoc(
    ModelNameEnum.JournalEntry,
    data.cancelledEntry
  );
  t.ok(cancelled.isCancelled, 'cancelled journal entry remains cancelled');
  t.equal(
    cancelled.submitted,
    true,
    'cancelled journal entry retains submitted flag'
  );

  const importedGroup = await fyoDst.db.get(
    ModelNameEnum.Account,
    data.assetSubgroup,
    ['parentAccount']
  );
  t.equal(
    (importedGroup as { parentAccount?: string }).parentAccount,
    data.assetGroup,
    'account group parent preserved'
  );

  const trialSrc = new TrialBalance(fyoSrc);
  await trialSrc.initialize();
  await trialSrc.set('fromDate', TEST_FROM_DATE);
  await trialSrc.set('toDate', TEST_TO_DATE);

  const trialDst = new TrialBalance(fyoDst);
  await trialDst.initialize();
  await trialDst.set('fromDate', TEST_FROM_DATE);
  await trialDst.set('toDate', TEST_TO_DATE);

  const glSrc = new GeneralLedger(fyoSrc);
  await glSrc.initialize();
  await glSrc.set('fromDate', TEST_FROM_DATE);
  await glSrc.set('toDate', TEST_TO_DATE);

  const glDst = new GeneralLedger(fyoDst);
  await glDst.initialize();
  await glDst.set('fromDate', TEST_FROM_DATE);
  await glDst.set('toDate', TEST_TO_DATE);

  const bsSrc = new BalanceSheet(fyoSrc);
  await bsSrc.initialize();
  await bsSrc.set('basedOn', 'Until Date');
  await bsSrc.set('periodicity', 'Monthly');
  await bsSrc.set('count', 24);
  await bsSrc.set('consolidateColumns', true);
  await bsSrc.set('toDate', TEST_TO_DATE);

  const bsDst = new BalanceSheet(fyoDst);
  await bsDst.initialize();
  await bsDst.set('basedOn', 'Until Date');
  await bsDst.set('periodicity', 'Monthly');
  await bsDst.set('count', 24);
  await bsDst.set('consolidateColumns', true);
  await bsDst.set('toDate', TEST_TO_DATE);

  const plSrc = new ProfitAndLoss(fyoSrc);
  await plSrc.initialize();
  await plSrc.set('basedOn', 'Until Date');
  await plSrc.set('periodicity', 'Monthly');
  await plSrc.set('count', 24);
  await plSrc.set('consolidateColumns', true);
  await plSrc.set('toDate', TEST_TO_DATE);

  const plDst = new ProfitAndLoss(fyoDst);
  await plDst.initialize();
  await plDst.set('basedOn', 'Until Date');
  await plDst.set('periodicity', 'Monthly');
  await plDst.set('count', 24);
  await plDst.set('consolidateColumns', true);
  await plDst.set('toDate', TEST_TO_DATE);

  const loanLedgerSrc = new LoanLedger(fyoSrc);
  await loanLedgerSrc.initialize();
  await loanLedgerSrc.set('loanProfile', data.loanProfile);
  await loanLedgerSrc.set('fromDate', TEST_FROM_DATE);
  await loanLedgerSrc.set('toDate', TEST_TO_DATE);
  await loanLedgerSrc.set('asOfDate', LOAN_AS_OF_DATE);

  const loanLedgerDst = new LoanLedger(fyoDst);
  await loanLedgerDst.initialize();
  await loanLedgerDst.set('loanProfile', data.loanProfile);
  await loanLedgerDst.set('fromDate', TEST_FROM_DATE);
  await loanLedgerDst.set('toDate', TEST_TO_DATE);
  await loanLedgerDst.set('asOfDate', LOAN_AS_OF_DATE);

  const loanRegisterSrc = new LoanRegister(fyoSrc);
  await loanRegisterSrc.initialize();
  await loanRegisterSrc.set('asOfDate', LOAN_AS_OF_DATE);

  const loanRegisterDst = new LoanRegister(fyoDst);
  await loanRegisterDst.initialize();
  await loanRegisterDst.set('asOfDate', LOAN_AS_OF_DATE);

  await compareReports(t, trialSrc, trialDst, 'Trial Balance');
  compareGeneralLedger(t, glSrc, glDst);
  await compareReports(t, bsSrc, bsDst, 'Balance Sheet');
  await compareReports(t, plSrc, plDst, 'Profit & Loss');
  await compareReports(t, loanLedgerSrc, loanLedgerDst, 'Loan Ledger');
  await compareReports(t, loanRegisterSrc, loanRegisterDst, 'Loan Register');

  t.end();
});

test('cleanup source company', async (t) => {
  await fyoSrc.close();
  t.end();
});

test('cleanup target company', async (t) => {
  await fyoDst.close();
  t.end();
});
