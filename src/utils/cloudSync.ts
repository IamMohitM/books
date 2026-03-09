import type { Doc } from 'fyo/model/doc';
import { ModelNameEnum } from 'models/types';
import { getRandomString } from 'utils';

type CloudSyncOperation = 'create' | 'update' | 'submit' | 'cancel' | 'delete';

const CLOUD_SYNC_DOCTYPES = new Set<string>([
  ModelNameEnum.Account,
  ModelNameEnum.Party,
  ModelNameEnum.JournalEntry,
]);

function getSystemSettings(doc: Doc) {
  return doc.fyo.singles.SystemSettings as
    | {
        syncEnabled?: boolean;
        syncMode?: string;
        syncDeviceId?: string;
      }
    | undefined;
}

export function getIsCloudSyncEnabled(doc: Doc): boolean {
  const settings = getSystemSettings(doc);
  if (!settings?.syncEnabled) {
    return false;
  }

  return settings.syncMode !== 'off';
}

export function shouldEnqueueCloudSyncForDoc(doc: Doc): boolean {
  if (!getIsCloudSyncEnabled(doc)) {
    return false;
  }

  return CLOUD_SYNC_DOCTYPES.has(doc.schemaName);
}

export function getCloudSyncEventId(
  doc: Doc,
  operation: CloudSyncOperation
): string {
  return `${doc.schemaName}:${String(
    doc.name ?? ''
  )}:${operation}:${getRandomString()}`;
}

export async function enqueueCloudSyncEvent(
  doc: Doc,
  operation: CloudSyncOperation
): Promise<void> {
  if (!doc.name) {
    return;
  }

  const settings = getSystemSettings(doc);
  const rawDocData = doc.fyo.db.converter.toRawValueMap(
    doc.schemaName,
    doc.getValidDict(false, true)
  );

  const payload = JSON.stringify({
    schemaName: doc.schemaName,
    name: doc.name,
    operation,
    submitted: !!doc.submitted && !doc.cancelled,
    modified: doc.modified ?? null,
    deviceId: settings?.syncDeviceId || doc.fyo.store.deviceId || '',
    data: rawDocData,
  });

  const outboxDoc = doc.fyo.doc.getNewDoc(ModelNameEnum.CloudSyncOutbox, {
    eventId: getCloudSyncEventId(doc, operation),
    referenceType: doc.schemaName,
    documentName: doc.name,
    operation,
    status: 'queued',
    attempts: 0,
    deviceId: settings?.syncDeviceId || doc.fyo.store.deviceId || '',
    payload,
  });

  outboxDoc._addDocToSyncQueue = false;
  await outboxDoc.sync();
}
