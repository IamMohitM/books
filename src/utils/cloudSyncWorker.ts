import { Fyo } from 'fyo';
import { CloudSyncOutbox } from 'models/baseModels/CloudSyncOutbox/CloudSyncOutbox';
import { ModelNameEnum } from 'models/types';
import { sendAPIRequest } from './api';

let syncTimer: ReturnType<typeof setInterval> | null = null;
let syncing = false;

type CloudSyncPayload = {
  schemaName?: string;
  name?: string;
  operation?: string;
  data?: Record<string, unknown>;
};

function getSystemSettings(fyo: Fyo) {
  return fyo.singles.SystemSettings as
    | {
        syncEnabled?: boolean;
        syncMode?: string;
        syncCompanyId?: string;
        syncAuthToken?: string;
        syncApiUrl?: string;
        syncIntervalSeconds?: number;
      }
    | undefined;
}

function getWorkerConfig(fyo: Fyo) {
  const settings = getSystemSettings(fyo);
  return {
    enabled:
      !!settings?.syncEnabled &&
      settings?.syncMode !== 'off' &&
      !!settings?.syncApiUrl &&
      !!settings?.syncAuthToken &&
      !!settings?.syncCompanyId,
    apiUrl: settings?.syncApiUrl ?? '',
    token: settings?.syncAuthToken ?? '',
    companyId: settings?.syncCompanyId ?? '',
    intervalSeconds: Math.max(settings?.syncIntervalSeconds ?? 15, 5),
  };
}

export function startCloudSyncWorker(fyo: Fyo) {
  stopCloudSyncWorker();

  const config = getWorkerConfig(fyo);
  if (!config.enabled) {
    return;
  }

  syncTimer = setInterval(() => {
    flushCloudSyncOutbox(fyo).catch(() => undefined);
  }, config.intervalSeconds * 1000);

  flushCloudSyncOutbox(fyo).catch(() => undefined);
}

export function stopCloudSyncWorker() {
  if (!syncTimer) {
    return;
  }

  clearInterval(syncTimer);
  syncTimer = null;
}

export async function flushCloudSyncOutbox(fyo: Fyo) {
  const online =
    typeof navigator === 'undefined' ? true : navigator.onLine !== false;
  if (syncing || !online) {
    return;
  }

  const config = getWorkerConfig(fyo);
  if (!config.enabled) {
    return;
  }

  syncing = true;
  try {
    const queued = await fyo.db.getAll(ModelNameEnum.CloudSyncOutbox, {
      filters: { status: 'queued' },
      orderBy: 'created',
    });

    const failed = await fyo.db.getAll(ModelNameEnum.CloudSyncOutbox, {
      filters: { status: 'failed' },
      orderBy: 'modified',
    });

    const items = [...queued, ...failed].slice(0, 20);
    for (const item of items) {
      await processOutboxItem(fyo, item as CloudSyncOutbox, config);
    }
  } finally {
    syncing = false;
  }
}

async function processOutboxItem(
  fyo: Fyo,
  item: CloudSyncOutbox,
  config: { apiUrl: string; token: string; companyId: string }
) {
  if (!item.name) {
    return;
  }

  const outboxDoc = (await fyo.doc.getDoc(
    ModelNameEnum.CloudSyncOutbox,
    item.name
  )) as CloudSyncOutbox;

  await outboxDoc.setAndSync('status', 'processing');
  await outboxDoc.setAndSync('attempts', (outboxDoc.attempts ?? 0) + 1);

  const payload = parsePayload(outboxDoc.payload);

  try {
    const response = (await sendAPIRequest(config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.token}`,
        apikey: config.token,
      },
      body: JSON.stringify({
        event: {
          event_id: outboxDoc.eventId,
          company_id: config.companyId,
          reference_type: outboxDoc.referenceType,
          document_name: outboxDoc.documentName,
          operation: outboxDoc.operation,
          payload,
        },
      }),
    })) as { success?: boolean; error?: string } | null;

    if (response?.error) {
      throw new Error(response.error);
    }

    await outboxDoc.setAndSync({
      status: 'sent',
      errorMessage: '',
    });
  } catch (error) {
    await outboxDoc.setAndSync({
      status: 'failed',
      errorMessage: (error as Error).message,
    });
  }
}

function parsePayload(payloadText?: string): CloudSyncPayload {
  if (!payloadText) {
    return {};
  }

  try {
    return JSON.parse(payloadText) as CloudSyncPayload;
  } catch {
    return {};
  }
}
