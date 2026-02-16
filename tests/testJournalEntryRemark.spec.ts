import test from 'tape';
import { ModelNameEnum } from 'models/types';
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

test('submitted journal entry allows user remark update', async (t) => {
  const asset = await getAccountName('Asset');
  const income = await getAccountName('Income');

  t.ok(asset && income, 'accounts exist for journal entry');
  if (!asset || !income) {
    t.end();
    return;
  }

  const je = fyo.doc.getNewDoc(ModelNameEnum.JournalEntry, {
    entryType: 'Journal Entry',
    date: '2025-01-01',
  });
  je.push('accounts', { account: asset, debit: fyo.pesa(100), credit: fyo.pesa(0) });
  je.push('accounts', { account: income, debit: fyo.pesa(0), credit: fyo.pesa(100) });

  await je.sync();
  await je.submit();

  je.set('userRemark', 'Updated remark after submit');
  await je.sync();

  const reloaded = await fyo.doc.getDoc(ModelNameEnum.JournalEntry, je.name as string);
  t.equal(reloaded.get('userRemark'), 'Updated remark after submit', 'remark updated');
  t.equal(reloaded.submitted, true, 'submission state preserved');
  t.end();
});

closeTestFyo(fyo, __filename);
