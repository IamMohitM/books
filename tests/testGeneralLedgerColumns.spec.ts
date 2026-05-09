import test from 'tape';
import { GeneralLedger } from 'reports/GeneralLedger/GeneralLedger';
import { closeTestFyo, getTestFyo, setupTestFyo } from './helpers';
import { ModelNameEnum } from 'models/types';

const fyo = getTestFyo();
setupTestFyo(fyo, __filename);

async function getAccountName(rootType: string) {
  const rows = (await fyo.db.getAll(ModelNameEnum.Account, {
    fields: ['name'],
    filters: { rootType, isGroup: false },
  })) as { name: string }[];
  return rows[0]?.name;
}

test('general ledger shows journal entry remark and supports column filtering', async (t) => {
  const asset = await getAccountName('Asset');
  const income = await getAccountName('Income');

  t.ok(asset && income, 'accounts exist for general ledger entry');
  if (!asset || !income) {
    return;
  }

  const je = fyo.doc.getNewDoc(ModelNameEnum.JournalEntry, {
    entryType: 'Journal Entry',
    date: '2026-05-20',
    userRemark: 'Ledger remark test',
    accounts: [
      {
        account: asset,
        debit: fyo.pesa(250),
        credit: fyo.pesa(0),
      },
      {
        account: income,
        debit: fyo.pesa(0),
        credit: fyo.pesa(250),
      },
    ],
  });

  await je.sync();
  await je.submit();

  const report = new GeneralLedger(fyo);
  await report.initialize();
  await report.set('fromDate', '2026-05-01');
  await report.set('toDate', '2026-05-31');

  const remarkColumnIndex = report.columns.findIndex(
    (column) => column.fieldname === 'userRemark'
  );
  t.ok(remarkColumnIndex >= 0, 'remark column is available in general ledger');

  const rowWithRemark = report.reportData.find((row) =>
    row.cells.some((cell) => cell.rawValue === 'Ledger remark test')
  );
  t.ok(rowWithRemark, 'report data includes the journal entry remark');

  await report.updateColumnSelection('party', false);

  t.equal(
    report.columns.some((column) => column.fieldname === 'party'),
    false,
    'party column can be hidden'
  );
  t.equal(
    report.columns.some((column) => column.fieldname === 'userRemark'),
    true,
    'remark column remains visible after filtering another column'
  );
  t.equal(
    report.reportData[0]?.cells.length,
    report.columns.length,
    'row values follow the filtered visible columns'
  );

  const balanceIndex = report.columns.findIndex(
    (column) => column.fieldname === 'balance'
  );
  await report.moveColumn('balance', 'up');
  const movedBalanceIndex = report.columns.findIndex(
    (column) => column.fieldname === 'balance'
  );
  t.equal(
    movedBalanceIndex,
    Math.max(balanceIndex - 1, 0),
    'balance column can be reordered'
  );

  const reportColumnState = fyo.config.get('reportColumnState', {}) ?? {};
  const persistedState =
    reportColumnState['general-ledger']?.columnSelection ?? {};
  t.equal(persistedState.party, false, 'column visibility is saved in config');

  const refreshedReport = new GeneralLedger(fyo);
  await refreshedReport.initialize();
  await refreshedReport.set('fromDate', '2026-05-01');
  await refreshedReport.set('toDate', '2026-05-31');

  t.equal(
    refreshedReport.columns.some((column) => column.fieldname === 'party'),
    false,
    'hidden column stays hidden for a fresh report instance'
  );
  t.equal(
    refreshedReport.reportData[0]?.cells.length,
    refreshedReport.columns.length,
    'fresh report instance renders only persisted visible columns'
  );

  const refreshedBalanceIndex = refreshedReport.columns.findIndex(
    (column) => column.fieldname === 'balance'
  );
  t.equal(
    refreshedBalanceIndex,
    movedBalanceIndex,
    'column order is restored for a fresh report instance'
  );
});

closeTestFyo(fyo, __filename);
