import test from 'tape';
import { closeTestFyo, getTestFyo, setupTestFyo } from 'tests/helpers';
import { JournalEntryAccount } from 'models/baseModels/JournalEntryAccount/JournalEntryAccount';
import { ModelNameEnum } from 'models/types';

const fyo = getTestFyo();
setupTestFyo(fyo, __filename);

test('journal entry account create filters do not set rootType or parent defaults', async (t) => {
  const jv = fyo.doc.getNewDoc(ModelNameEnum.JournalEntry, {
    entryType: 'Journal Entry',
    date: '2026-02-23',
  });

  await jv.append('accounts', {
    debit: fyo.pesa(100),
    credit: fyo.pesa(0),
  });
  const row = (jv.accounts as unknown[])[0];

  const filters = await JournalEntryAccount.createFilters.account!(row as any);

  t.equal(filters.rootType, undefined, 'rootType is not defaulted');
  t.equal(filters.parentAccount, undefined, 'parentAccount is not defaulted');
  t.equal(filters.isGroup, false, 'new account defaults to non-group');
});

test('journal entry account create filters stay neutral for credit rows too', async (t) => {
  const jv = fyo.doc.getNewDoc(ModelNameEnum.JournalEntry, {
    entryType: 'Journal Entry',
    date: '2026-02-23',
  });

  await jv.append('accounts', {
    debit: fyo.pesa(0),
    credit: fyo.pesa(100),
  });
  const row = (jv.accounts as unknown[])[0];

  const filters = await JournalEntryAccount.createFilters.account!(row as any);

  t.equal(filters.rootType, undefined, 'rootType remains unset');
  t.equal(filters.parentAccount, undefined, 'parentAccount remains unset');
  t.equal(filters.isGroup, false, 'new account defaults to non-group');
});

closeTestFyo(fyo, __filename);
