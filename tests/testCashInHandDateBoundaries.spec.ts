import test from 'tape';
import { getDefaultMetaFieldValueMap } from 'backend/helpers';
import { ModelNameEnum } from 'models/types';
import { closeTestFyo, getTestFyo, setupTestFyo } from './helpers';

const fyo = getTestFyo();
setupTestFyo(fyo, __filename);

async function getCashAccountName() {
  const rows = (await fyo.db.getAll(ModelNameEnum.Account, {
    fields: ['name'],
    filters: { accountType: 'Cash', isGroup: false },
  })) as { name: string }[];
  return rows[0]?.name;
}

async function insertLedgerEntry(args: {
  date: string;
  account: string;
  debit: number;
  credit: number;
}) {
  await fyo.db.insert(ModelNameEnum.AccountingLedgerEntry, {
    ...getDefaultMetaFieldValueMap(),
    date: args.date,
    account: args.account,
    debit: args.debit,
    credit: args.credit,
    reverted: false,
  });
}

test('cash in hand includes end-of-month entries with time', async (t) => {
  const cashAccount = await getCashAccountName();
  t.ok(cashAccount, 'cash account exists');
  if (!cashAccount) {
    t.end();
    return;
  }

  const baseline = await fyo.db.getCashInHand('2024-12-31');
  const baselineSummary = await fyo.db.getCashInHandSummary(
    '2024-12-01',
    '2025-01-31'
  );

  await insertLedgerEntry({
    date: '2024-12-31T10:00:00.000Z',
    account: cashAccount,
    debit: 300,
    credit: 0,
  });
  await insertLedgerEntry({
    date: '2024-12-31T12:00:00.000Z',
    account: cashAccount,
    debit: 0,
    credit: 500,
  });
  await insertLedgerEntry({
    date: '2024-12-31T18:00:00.000Z',
    account: cashAccount,
    debit: 50,
    credit: 0,
  });

  const asOf = await fyo.db.getCashInHand('2024-12-31');
  t.equal(
    asOf.cashInHand,
    baseline.cashInHand - 150,
    'as-of balance includes 12/31 entries'
  );

  const janDetail = await fyo.db.getCashInHandMonthDetail(
    '2025-01-01',
    '2025-01-31'
  );
  t.equal(
    janDetail.openingBalance,
    baseline.cashInHand - 150,
    'opening includes 12/31 entries'
  );
  t.equal(janDetail.debits, 0, 'no jan debits');
  t.equal(janDetail.credits, 0, 'no jan credits');

  const summary = await fyo.db.getCashInHandSummary('2024-12-01', '2025-01-31');
  const decRow = summary.find((row) => row.periodStart === '2024-12-01');
  const janRow = summary.find((row) => row.periodStart === '2025-01-01');
  const baselineDecRow = baselineSummary.find(
    (row) => row.periodStart === '2024-12-01'
  );
  const baselineJanRow = baselineSummary.find(
    (row) => row.periodStart === '2025-01-01'
  );
  t.ok(decRow, 'dec summary row exists');
  t.ok(janRow, 'jan summary row exists');
  t.ok(baselineDecRow, 'baseline dec summary row exists');
  t.ok(baselineJanRow, 'baseline jan summary row exists');
  if (decRow) {
    t.equal(
      decRow.closingBalance - (baselineDecRow?.closingBalance ?? 0),
      -150,
      'dec closing includes 12/31 entries'
    );
  }
  if (janRow) {
    t.equal(
      janRow.closingBalance - (baselineJanRow?.closingBalance ?? 0),
      0,
      'jan closing unchanged without jan entries'
    );
  }

  t.end();
});

closeTestFyo(fyo, __filename);
