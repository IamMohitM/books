import {
  compareSyncSnapshots,
  getLocalSyncSnapshot,
  SyncSnapshot,
} from 'src/utils/cloudSyncWorker';
import test from 'tape';
import { closeTestFyo, getTestFyo, setupTestFyo } from 'tests/helpers';

const fyo = getTestFyo();
setupTestFyo(fyo, __filename);

test('phase 4 compareSyncSnapshots returns ok for exact snapshot match', (t) => {
  const snapshot: SyncSnapshot = {
    accounts: 10,
    parties: 4,
    journal_entries: 8,
    journal_entry_lines: 16,
    debit_total: 1520.35,
    credit_total: 1520.35,
  };

  const result = compareSyncSnapshots(snapshot, { ...snapshot });
  t.equal(result.ok, true, 'match is considered ok');
  t.equal(result.mismatches.length, 0, 'no mismatch messages');
  t.end();
});

test('phase 4 compareSyncSnapshots reports mismatch details', (t) => {
  const local: SyncSnapshot = {
    accounts: 10,
    parties: 4,
    journal_entries: 8,
    journal_entry_lines: 16,
    debit_total: 1520.35,
    credit_total: 1520.35,
  };

  const remote: SyncSnapshot = {
    accounts: 11,
    parties: 4,
    journal_entries: 7,
    journal_entry_lines: 15,
    debit_total: 1500,
    credit_total: 1520.35,
  };

  const result = compareSyncSnapshots(local, remote);
  t.equal(result.ok, false, 'mismatch marks reconciliation as not ok');
  t.ok(result.mismatches.length >= 4, 'returns field-level mismatch messages');
  t.end();
});

test('phase 4 getLocalSyncSnapshot returns non-negative totals', async (t) => {
  const snapshot = await getLocalSyncSnapshot(fyo);

  t.ok(snapshot.accounts >= 0, 'account count is non-negative');
  t.ok(snapshot.parties >= 0, 'party count is non-negative');
  t.ok(snapshot.journal_entries >= 0, 'journal entry count is non-negative');
  t.ok(snapshot.journal_entry_lines >= 0, 'journal line count is non-negative');
  t.ok(snapshot.debit_total >= 0, 'debit total is non-negative');
  t.ok(snapshot.credit_total >= 0, 'credit total is non-negative');
});

closeTestFyo(fyo, __filename);
