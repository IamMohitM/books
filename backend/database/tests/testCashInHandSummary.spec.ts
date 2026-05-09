import test from 'tape';
import { closeTestFyo, getTestFyo, setupTestFyo } from 'tests/helpers';
import { ModelNameEnum } from 'models/types';

const fyo = getTestFyo();
setupTestFyo(fyo, __filename);

async function postCashEntry(
  date: string,
  {
    cashDebit = 0,
    cashCredit = 0,
    otherAccount = 'Creditors',
  }: {
    cashDebit?: number;
    cashCredit?: number;
    otherAccount?: string;
  }
) {
  const amount = cashDebit || cashCredit;
  const jv = fyo.doc.getNewDoc(ModelNameEnum.JournalEntry, {
    entryType: 'Cash Entry',
    date,
    accounts: [
      {
        account: 'Cash',
        debit: fyo.pesa(cashDebit),
        credit: fyo.pesa(cashCredit),
      },
      {
        account: otherAccount,
        debit: fyo.pesa(cashCredit ? amount : 0),
        credit: fyo.pesa(cashDebit ? amount : 0),
      },
    ],
  });

  await jv.sync();
  await jv.submit();
}

async function saveMonthlyClose(periodStart: string, closingBalance: number) {
  const existing = await fyo.db.exists(
    ModelNameEnum.MonthlyCashClose,
    periodStart
  );

  if (existing) {
    const doc = await fyo.doc.getDoc(
      ModelNameEnum.MonthlyCashClose,
      periodStart
    );
    await doc.set('closingBalance', closingBalance);
    await doc.sync();
    return;
  }

  const doc = fyo.doc.getNewDoc(ModelNameEnum.MonthlyCashClose, {
    name: periodStart,
    periodStart,
    closingBalance,
  });
  await doc.sync();
}

test('cash summary uses ledger balances when no monthly closes are saved', async (t) => {
  await postCashEntry('2026-01-10', { cashDebit: 1000 });
  await postCashEntry('2026-01-15', { cashCredit: 200 });
  await postCashEntry('2026-02-05', { cashDebit: 300 });

  const rows = await fyo.db.getCashInHandSummary('2026-01-01', '2026-02-28');

  t.equal(rows.length, 2, 'returns both months');
  t.equal(rows[0].openingBalance, 0, 'january opens from ledger baseline');
  t.equal(
    rows[0].expectedClosingBalance,
    800,
    'january expected closing uses ledger'
  );
  t.equal(rows[0].actualClosingBalance, null, 'january has no saved close');
  t.equal(
    rows[0].difference,
    null,
    'january difference is empty without saved close'
  );
  t.equal(
    rows[1].openingBalance,
    800,
    'february opens from january expected closing'
  );
  t.equal(
    rows[1].expectedClosingBalance,
    1100,
    'february expected closing chains correctly'
  );
  t.equal(rows[1].actualClosingBalance, null, 'february has no saved close');
});

test('saved monthly closes override the chain, updates recompute, and clear restores ledger chaining', async (t) => {
  await saveMonthlyClose('2026-01-01', 750);

  let rows = await fyo.db.getCashInHandSummary('2026-01-01', '2026-02-28');
  t.equal(rows[0].actualClosingBalance, 750, 'january saved close is returned');
  t.equal(rows[0].difference, -50, 'difference is actual minus expected');
  t.equal(
    rows[1].openingBalance,
    750,
    'february opening uses january saved close'
  );
  t.equal(
    rows[1].expectedClosingBalance,
    1050,
    'february expected closing recalculates from saved opening'
  );

  await saveMonthlyClose('2026-01-01', 700);

  rows = await fyo.db.getCashInHandSummary('2026-01-01', '2026-02-28');
  t.equal(rows[0].actualClosingBalance, 700, 'updated close is reflected');
  t.equal(
    rows[1].openingBalance,
    700,
    'later month opening recomputes after update'
  );
  t.equal(
    rows[1].expectedClosingBalance,
    1000,
    'later month expected close recomputes after update'
  );

  await fyo.db.delete(ModelNameEnum.MonthlyCashClose, '2026-01-01');

  rows = await fyo.db.getCashInHandSummary('2026-01-01', '2026-02-28');
  t.equal(rows[0].actualClosingBalance, null, 'clear removes saved close');
  t.equal(
    rows[1].openingBalance,
    800,
    'later month opening falls back to ledger chaining'
  );
  t.equal(
    rows[1].expectedClosingBalance,
    1100,
    'later month expected close returns to ledger chaining'
  );
});

test('latest saved close before the visible range anchors the first visible month opening', async (t) => {
  await saveMonthlyClose('2026-12-01', 600);

  await postCashEntry('2027-01-07', { cashDebit: 100 });
  await postCashEntry('2027-01-20', { cashCredit: 50 });
  await postCashEntry('2027-02-12', { cashDebit: 25 });

  const rows = await fyo.db.getCashInHandSummary('2027-02-01', '2027-02-28');

  t.equal(rows.length, 1, 'returns only the visible month');
  t.equal(
    rows[0].openingBalance,
    650,
    'first visible month rolls forward from prior saved close'
  );
  t.equal(
    rows[0].expectedClosingBalance,
    675,
    'visible month expected close uses bridged opening plus current movement'
  );
  t.equal(
    rows[0].actualClosingBalance,
    null,
    'no saved close in visible month'
  );
});

closeTestFyo(fyo, __filename);
