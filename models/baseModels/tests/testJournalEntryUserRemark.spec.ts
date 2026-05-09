import test from 'tape';
import { closeTestFyo, getTestFyo, setupTestFyo } from 'tests/helpers';
import { ModelNameEnum } from 'models/types';

const fyo = getTestFyo();
setupTestFyo(fyo, __filename);

test('submitted journal entry user remark updates stay submitted and clean', async (t) => {
  const cashAccountRows = (await fyo.db.getAll(ModelNameEnum.Account, {
    fields: ['name'],
    filters: { accountType: 'Cash', isGroup: false },
  })) as { name: string }[];

  const creditAccountRows = (await fyo.db.getAll(ModelNameEnum.Account, {
    fields: ['name'],
    filters: { isGroup: false, accountType: ['!=', 'Cash'] },
  })) as { name: string }[];

  const debitAccount = cashAccountRows[0]?.name;
  const creditAccount = creditAccountRows[0]?.name;

  t.ok(debitAccount && creditAccount, 'accounts exist for journal entry');
  if (!debitAccount || !creditAccount) {
    return;
  }

  const jv = fyo.doc.getNewDoc(ModelNameEnum.JournalEntry, {
    entryType: 'Journal Entry',
    date: '2026-05-09',
    userRemark: 'Initial remark',
    accounts: [
      {
        account: debitAccount,
        debit: fyo.pesa(100),
        credit: fyo.pesa(0),
      },
      {
        account: creditAccount,
        debit: fyo.pesa(0),
        credit: fyo.pesa(100),
      },
    ],
  });

  await jv.sync();
  await jv.submit();

  t.equal(jv.isSubmitted, true, 'journal entry submitted');
  t.equal(jv.dirty, false, 'journal entry clean after submit');

  await jv.set('userRemark', 'Updated remark');

  t.equal(jv.isSubmitted, true, 'journal entry stays submitted after remark update');
  t.equal(jv.dirty, false, 'journal entry stays clean after remark update');
  t.equal(jv.userRemark, 'Updated remark', 'remark updated in memory');

  const reloaded = await fyo.doc.getDoc(ModelNameEnum.JournalEntry, jv.name!);
  t.equal(reloaded.isSubmitted, true, 'reloaded journal entry is still submitted');
  t.equal(reloaded.userRemark, 'Updated remark', 'remark persisted to db');
});

closeTestFyo(fyo, __filename);
