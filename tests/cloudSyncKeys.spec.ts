import test from 'tape';
import { resolveSyncKeys } from 'src/utils/cloudSyncWorker';

test('resolveSyncKeys returns ok when both keys are present', (t) => {
  const result = resolveSyncKeys({
    syncApiKey: 'anon-key',
    syncAuthToken: 'service-role-key',
  });

  t.equal(result.apiKey, 'anon-key', 'apiKey should match input');
  t.equal(result.syncKey, 'service-role-key', 'syncKey should match input');
  t.equal(result.ok, true, 'ok should be true when both keys are present');
  t.end();
});

test('resolveSyncKeys trims keys and returns ok', (t) => {
  const result = resolveSyncKeys({
    syncApiKey: '  anon  ',
    syncAuthToken: '\nservice\t',
  });

  t.equal(result.apiKey, 'anon', 'apiKey should be trimmed');
  t.equal(result.syncKey, 'service', 'syncKey should be trimmed');
  t.equal(result.ok, true, 'ok should be true after trimming');
  t.end();
});

test('resolveSyncKeys returns ok=false when keys are missing', (t) => {
  const missingApiKey = resolveSyncKeys({ syncAuthToken: 'service' });
  t.equal(missingApiKey.ok, false, 'ok should be false without apiKey');

  const missingSyncKey = resolveSyncKeys({ syncApiKey: 'anon' });
  t.equal(missingSyncKey.ok, false, 'ok should be false without syncKey');

  const missingBoth = resolveSyncKeys({});
  t.equal(missingBoth.ok, false, 'ok should be false without keys');
  t.end();
});
