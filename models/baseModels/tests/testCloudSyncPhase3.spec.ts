import { ModelNameEnum } from 'models/types';
import { applyRemoteChange } from 'src/utils/cloudSyncWorker';
import test from 'tape';
import { closeTestFyo, getTestFyo, setupTestFyo } from 'tests/helpers';

const fyo = getTestFyo();
setupTestFyo(fyo, __filename);

test('phase 3 applyRemoteChange creates/updates party from remote payload', async (t) => {
  await applyRemoteChange(fyo, {
    seq: 1,
    doc_type: 'Party',
    operation: 'insert',
    payload: {
      external_key: 'Remote Party',
      data: {
        name: 'Remote Party',
        role: 'Customer',
        email: 'remote@party.test',
        phone: '1234567890',
      },
    },
  });

  const exists = await fyo.db.exists(ModelNameEnum.Party, 'Remote Party');
  t.equal(exists, true, 'party was created locally');

  const party = await fyo.doc.getDoc(ModelNameEnum.Party, 'Remote Party');
  t.equal(party.email, 'remote@party.test', 'email mapped');
  t.equal(party.phone, '1234567890', 'phone mapped');

  await applyRemoteChange(fyo, {
    seq: 2,
    doc_type: 'Party',
    operation: 'update',
    payload: {
      external_key: 'Remote Party',
      data: {
        name: 'Remote Party',
        role: 'Supplier',
        email: 'updated@party.test',
        phone: '9999999999',
      },
    },
  });

  const updated = await fyo.doc.getDoc(ModelNameEnum.Party, 'Remote Party');
  t.equal(updated.role, 'Supplier', 'role updated');
  t.equal(updated.email, 'updated@party.test', 'email updated');
});

test('phase 3 applyRemoteChange deletes party on remote delete', async (t) => {
  await applyRemoteChange(fyo, {
    seq: 3,
    doc_type: 'Party',
    operation: 'delete',
    payload: {
      external_key: 'Remote Party',
      data: {
        name: 'Remote Party',
      },
    },
  });

  const exists = await fyo.db.exists(ModelNameEnum.Party, 'Remote Party');
  t.equal(exists, false, 'party was deleted locally');
});

test('phase 3 applyRemoteChange creates and cancels journal entry from remote payload', async (t) => {
  const accounts = await fyo.db.getAll(ModelNameEnum.Account, {
    fields: ['name'],
    filters: { isGroup: false },
  });

  const debitAccount = accounts[0]?.name as string | undefined;
  const creditAccount = accounts[1]?.name as string | undefined;
  t.ok(debitAccount && creditAccount, 'at least two leaf accounts exist');
  if (!debitAccount || !creditAccount) {
    return;
  }

  await applyRemoteChange(fyo, {
    seq: 4,
    doc_type: 'JournalEntry',
    operation: 'insert',
    payload: {
      external_key: 'REMOTE-JE-001',
      data: {
        name: 'REMOTE-JE-001',
        entry_type: 'Journal Entry',
        date: '2026-02-23',
        user_remark: 'Remote sync JE',
        accounts: [
          { account: debitAccount, debit: 100, credit: 0 },
          { account: creditAccount, debit: 0, credit: 100 },
        ],
      },
    },
  });

  const jeExists = await fyo.db.exists(ModelNameEnum.JournalEntry, 'REMOTE-JE-001');
  t.equal(jeExists, true, 'journal entry was created locally');

  const je = (await fyo.doc.getDoc(
    ModelNameEnum.JournalEntry,
    'REMOTE-JE-001'
  )) as any;
  t.equal(je.submitted, true, 'journal entry auto-submitted');
  t.equal((je.accounts ?? []).length, 2, 'journal entry has 2 lines');

  await applyRemoteChange(fyo, {
    seq: 5,
    doc_type: 'JournalEntry',
    operation: 'delete',
    payload: {
      external_key: 'REMOTE-JE-001',
      data: { name: 'REMOTE-JE-001' },
    },
  });

  const cancelled = (await fyo.doc.getDoc(
    ModelNameEnum.JournalEntry,
    'REMOTE-JE-001'
  )) as any;
  t.equal(cancelled.cancelled, true, 'journal entry was cancelled on remote delete');
});

closeTestFyo(fyo, __filename);
