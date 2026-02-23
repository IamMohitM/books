import { ModelNameEnum } from 'models/types';
import test from 'tape';
import { closeTestFyo, getTestFyo, setupTestFyo } from 'tests/helpers';
import { getCloudSyncEventId } from 'src/utils/cloudSync';

const fyo = getTestFyo();
setupTestFyo(fyo, __filename);

test('cloud sync queue stays empty when sync is disabled', async (t) => {
  const party = fyo.doc.getNewDoc(ModelNameEnum.Party, {
    name: 'Sync Off Party',
  });
  await party.sync();

  const count = await fyo.db.count(ModelNameEnum.CloudSyncOutbox);
  t.equal(count, 0, 'no outbox rows are created while sync is disabled');
});

test('cloud sync enqueue starts only when feature flag is enabled', async (t) => {
  const systemSettings = fyo.singles.SystemSettings;
  t.ok(systemSettings, 'system settings doc exists');
  if (!systemSettings) {
    t.fail('system settings is required for this test');
    return;
  }

  await systemSettings.setAndSync('syncEnabled', true);
  await systemSettings.setAndSync('syncMode', 'on');

  const party = fyo.doc.getNewDoc(ModelNameEnum.Party, {
    name: 'Sync On Party',
  });
  await party.sync();

  const rows = await fyo.db.getAll(ModelNameEnum.CloudSyncOutbox, {
    filters: {
      referenceType: ModelNameEnum.Party,
      documentName: 'Sync On Party',
      operation: 'create',
    },
  });

  t.equal(rows.length, 1, 'one outbox event is queued');
});

test('cloud sync outbox event id includes schema, doc name, and operation', async (t) => {
  const party = await fyo.doc.getDoc(ModelNameEnum.Party, 'Sync On Party');
  const eventId = getCloudSyncEventId(party, 'create');
  t.ok(
    eventId.startsWith('Party:Sync On Party:create:'),
    'event id prefix is deterministic'
  );
});

closeTestFyo(fyo, __filename);
