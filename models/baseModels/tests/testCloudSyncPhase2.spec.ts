import { CloudSyncOutbox } from 'models/baseModels/CloudSyncOutbox/CloudSyncOutbox';
import { ModelNameEnum } from 'models/types';
import { flushCloudSyncOutbox } from 'src/utils/cloudSyncWorker';
import test from 'tape';
import { closeTestFyo, getTestFyo, setupTestFyo } from 'tests/helpers';

const fyo = getTestFyo();
setupTestFyo(fyo, __filename);

test('cloud sync outbox payload includes document snapshot data', async (t) => {
  const systemSettings = fyo.singles.SystemSettings;
  t.ok(systemSettings, 'system settings doc exists');
  if (!systemSettings) {
    t.fail('system settings is required for this test');
    return;
  }

  await systemSettings.setAndSync('syncEnabled', true);
  await systemSettings.setAndSync('syncMode', 'on');

  const party = fyo.doc.getNewDoc(ModelNameEnum.Party, {
    name: 'Sync Payload Party',
    role: 'Customer',
    email: 'payload@party.test',
  });
  await party.sync();

  const rows = await fyo.db.getAll(ModelNameEnum.CloudSyncOutbox, {
    filters: {
      referenceType: ModelNameEnum.Party,
      documentName: 'Sync Payload Party',
      operation: 'create',
    },
  });
  t.equal(rows.length, 1, 'one outbox event is queued');

  const outbox = (await fyo.doc.getDoc(
    ModelNameEnum.CloudSyncOutbox,
    rows[0]?.name as string
  )) as CloudSyncOutbox;
  const payload = JSON.parse(outbox.payload ?? '{}') as {
    data?: Record<string, unknown>;
  };

  t.equal(
    payload.data?.name,
    'Sync Payload Party',
    'payload includes document data'
  );
});

test('flush skips processing when sync endpoint config is missing', async (t) => {
  await flushCloudSyncOutbox(fyo);

  const rows = await fyo.db.getAll(ModelNameEnum.CloudSyncOutbox, {
    filters: {
      referenceType: ModelNameEnum.Party,
      documentName: 'Sync Payload Party',
      operation: 'create',
    },
  });
  t.equal(rows.length, 1, 'queued event remains present');

  const outbox = (await fyo.doc.getDoc(
    ModelNameEnum.CloudSyncOutbox,
    rows[0]?.name as string
  )) as CloudSyncOutbox;

  t.equal(
    outbox.status,
    'queued',
    'status remains queued without api config'
  );
});

closeTestFyo(fyo, __filename);
