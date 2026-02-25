import { Fyo } from 'fyo';
import { DocValueMap } from 'fyo/core/types';
import { Doc } from 'fyo/model/doc';
import { CloudSyncOutbox } from 'models/baseModels/CloudSyncOutbox/CloudSyncOutbox';
import { CloudSyncCursor } from 'models/baseModels/CloudSyncCursor/CloudSyncCursor';
import { CloudSyncState } from 'models/baseModels/CloudSyncState/CloudSyncState';
import { ModelNameEnum } from 'models/types';
import { sendAPIRequest } from './api';

let syncTimer: ReturnType<typeof setInterval> | null = null;
let syncing = false;
const RECONCILIATION_INTERVAL_MS = 24 * 60 * 60 * 1000;

type CloudSyncPayload = {
  data?: Record<string, unknown>;
};

type RemoteSyncChange = {
  seq: number;
  doc_type: string;
  operation: string;
  payload: {
    data?: Record<string, unknown>;
    external_key?: string;
  };
};

export type SyncSnapshot = {
  accounts: number;
  parties: number;
  journal_entries: number;
  journal_entry_lines: number;
  debit_total: number;
  credit_total: number;
};

export type ReconciliationResult = {
  ok: boolean;
  mismatches: string[];
  local: SyncSnapshot;
  remote: SyncSnapshot;
};

function getSystemSettings(fyo: Fyo) {
  return fyo.singles.SystemSettings as
    | {
        syncEnabled?: boolean;
        syncMode?: string;
        syncProjectId?: string;
        syncCompanyId?: string;
        syncAuthToken?: string;
        syncApiUrl?: string;
        syncPullApiUrl?: string;
        syncIntervalSeconds?: number;
      }
    | undefined;
}

function getDefaultPullApiUrl(pushApiUrl: string) {
  if (pushApiUrl.includes('/apply_sync_event')) {
    return pushApiUrl.replace('/apply_sync_event', '/fetch_sync_changes');
  }

  return pushApiUrl;
}

function getDefaultSnapshotApiUrl(pullApiUrl: string) {
  if (pullApiUrl.includes('/fetch_sync_changes')) {
    return pullApiUrl.replace('/fetch_sync_changes', '/fetch_sync_snapshot');
  }

  if (pullApiUrl.includes('/apply_sync_event')) {
    return pullApiUrl.replace('/apply_sync_event', '/fetch_sync_snapshot');
  }

  return pullApiUrl;
}

function normalizeProjectRef(projectIdOrUrl?: string) {
  const input = String(projectIdOrUrl ?? '').trim();
  if (!input) {
    return '';
  }

  if (input.endsWith('.supabase.co')) {
    return input.replace('https://', '').replace('http://', '').replace(
      '.supabase.co',
      ''
    );
  }

  if (!input.includes('http')) {
    return input.replace(/\/+$/, '');
  }

  try {
    const url = new URL(input);
    const host = url.hostname.toLowerCase();
    if (!host.endsWith('.supabase.co')) {
      return '';
    }

    return host.replace('.supabase.co', '');
  } catch {
    return '';
  }
}

function getBaseRestRpcUrl(projectIdOrUrl?: string) {
  const ref = normalizeProjectRef(projectIdOrUrl);
  if (!ref) {
    return '';
  }

  return `https://${ref}.supabase.co/rest/v1/rpc`;
}

function getDerivedPushApiUrl(projectIdOrUrl?: string) {
  const baseRpcUrl = getBaseRestRpcUrl(projectIdOrUrl);
  if (!baseRpcUrl) {
    return '';
  }

  return `${baseRpcUrl}/apply_sync_event`;
}

function getDerivedPullApiUrl(projectIdOrUrl?: string) {
  const baseRpcUrl = getBaseRestRpcUrl(projectIdOrUrl);
  if (!baseRpcUrl) {
    return '';
  }

  return `${baseRpcUrl}/fetch_sync_changes`;
}

function getWorkerConfig(fyo: Fyo) {
  const settings = getSystemSettings(fyo);
  const derivedPushApiUrl = getDerivedPushApiUrl(settings?.syncProjectId);
  const pushApiUrl = settings?.syncApiUrl?.trim() || derivedPushApiUrl;
  const derivedPullApiUrl = getDerivedPullApiUrl(settings?.syncProjectId);
  const pullApiUrl =
    settings?.syncPullApiUrl?.trim() ||
    derivedPullApiUrl ||
    getDefaultPullApiUrl(pushApiUrl);

  return {
    enabled:
      !!settings?.syncEnabled &&
      settings?.syncMode !== 'off' &&
      !!pushApiUrl &&
      !!pullApiUrl &&
      !!settings?.syncAuthToken &&
      !!settings?.syncCompanyId,
    pushApiUrl,
    pullApiUrl,
    token: settings?.syncAuthToken ?? '',
    companyId: settings?.syncCompanyId ?? '',
    intervalSeconds: Math.max(settings?.syncIntervalSeconds ?? 15, 5),
  };
}

function getCloudSyncStateDoc(fyo: Fyo): CloudSyncState | null {
  return (fyo.singles.CloudSyncState as CloudSyncState | undefined) ?? null;
}

async function updateCloudSyncState(
  fyo: Fyo,
  values: Partial<{
    enrollmentStatus: string;
    lastPushAt: string;
    lastPullAt: string;
    lastError: string;
    lastReconciliationAt: string;
    lastReconciliationStatus: string;
    lastReconciliationSummary: string;
  }>
) {
  const stateDoc = getCloudSyncStateDoc(fyo);
  if (!stateDoc) {
    return;
  }

  stateDoc._addDocToSyncQueue = false;
  await stateDoc.setAndSync(values).catch(() => undefined);
}

function toNumber(value: unknown) {
  const numeric =
    typeof value === 'number' ? value : Number(String(value ?? '').trim());
  if (Number.isNaN(numeric)) {
    return 0;
  }

  return numeric;
}

export function compareSyncSnapshots(
  local: SyncSnapshot,
  remote: SyncSnapshot
): ReconciliationResult {
  const mismatches: string[] = [];
  const exactKeys: Array<keyof SyncSnapshot> = [
    'accounts',
    'parties',
    'journal_entries',
    'journal_entry_lines',
  ];

  for (const key of exactKeys) {
    if (local[key] !== remote[key]) {
      mismatches.push(`${key}: local=${local[key]} remote=${remote[key]}`);
    }
  }

  const decimalKeys: Array<keyof SyncSnapshot> = ['debit_total', 'credit_total'];
  for (const key of decimalKeys) {
    if (Math.abs(local[key] - remote[key]) > 0.01) {
      mismatches.push(
        `${key}: local=${local[key].toFixed(2)} remote=${remote[key].toFixed(
          2
        )}`
      );
    }
  }

  return {
    ok: mismatches.length === 0,
    mismatches,
    local,
    remote,
  };
}

export async function getLocalSyncSnapshot(fyo: Fyo): Promise<SyncSnapshot> {
  const [accounts, parties, journalEntries] = await Promise.all([
    fyo.db.count(ModelNameEnum.Account),
    fyo.db.count(ModelNameEnum.Party),
    fyo.db.count(ModelNameEnum.JournalEntry),
  ]);

  const lineRows = await fyo.db.getAll(ModelNameEnum.JournalEntryAccount, {
    fields: ['debit', 'credit'],
  });

  let debitTotal = 0;
  let creditTotal = 0;
  for (const row of lineRows) {
    debitTotal += toNumber(row.debit);
    creditTotal += toNumber(row.credit);
  }

  return {
    accounts,
    parties,
    journal_entries: journalEntries,
    journal_entry_lines: lineRows.length,
    debit_total: Number(debitTotal.toFixed(2)),
    credit_total: Number(creditTotal.toFixed(2)),
  };
}

async function fetchRemoteSyncSnapshot(
  apiUrl: string,
  token: string,
  companyId: string
): Promise<SyncSnapshot> {
  const snapshotApiUrl = getDefaultSnapshotApiUrl(apiUrl);
  const response = (await sendAPIRequest(snapshotApiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: token,
    },
    body: JSON.stringify({
      target_company: companyId,
    }),
  })) as
    | {
        accounts?: unknown;
        parties?: unknown;
        journal_entries?: unknown;
        journal_entry_lines?: unknown;
        debit_total?: unknown;
        credit_total?: unknown;
        error?: string;
      }
    | null;

  if (!response) {
    throw new Error('Empty response from sync snapshot API');
  }

  if (response.error) {
    throw new Error(response.error);
  }

  return {
    accounts: toNumber(response.accounts),
    parties: toNumber(response.parties),
    journal_entries: toNumber(response.journal_entries),
    journal_entry_lines: toNumber(response.journal_entry_lines),
    debit_total: Number(toNumber(response.debit_total).toFixed(2)),
    credit_total: Number(toNumber(response.credit_total).toFixed(2)),
  };
}

export async function runCloudSyncReconciliation(
  fyo: Fyo
): Promise<ReconciliationResult> {
  const config = getWorkerConfig(fyo);
  if (!config.enabled) {
    throw new Error('Cloud sync is not fully configured');
  }

  const [local, remote] = await Promise.all([
    getLocalSyncSnapshot(fyo),
    fetchRemoteSyncSnapshot(config.pullApiUrl, config.token, config.companyId),
  ]);

  const result = compareSyncSnapshots(local, remote);
  await updateCloudSyncState(fyo, {
    lastReconciliationAt: new Date().toISOString(),
    lastReconciliationStatus: result.ok ? 'passed' : 'failed',
    lastReconciliationSummary: result.ok
      ? 'Snapshot matched.'
      : result.mismatches.join('\n'),
    lastError: result.ok ? '' : 'Reconciliation mismatch detected',
  });

  return result;
}

function shouldRunDailyReconciliation(stateDoc: CloudSyncState | null) {
  const lastAt = stateDoc?.lastReconciliationAt;
  if (!lastAt) {
    return true;
  }

  const lastMs = new Date(lastAt).getTime();
  if (Number.isNaN(lastMs)) {
    return true;
  }

  return Date.now() - lastMs >= RECONCILIATION_INTERVAL_MS;
}

async function runAutoReconciliationIfDue(fyo: Fyo) {
  const stateDoc = getCloudSyncStateDoc(fyo);
  if (!shouldRunDailyReconciliation(stateDoc)) {
    return;
  }

  try {
    await runCloudSyncReconciliation(fyo);
  } catch (error) {
    await updateCloudSyncState(fyo, {
      lastReconciliationAt: new Date().toISOString(),
      lastReconciliationStatus: 'failed',
      lastReconciliationSummary: (error as Error).message,
      lastError: (error as Error).message,
    });
  }
}

export function startCloudSyncWorker(fyo: Fyo) {
  stopCloudSyncWorker();

  const config = getWorkerConfig(fyo);
  if (!config.enabled) {
    return;
  }

  syncTimer = setInterval(() => {
    runCloudSyncCycle(fyo).catch(() => undefined);
  }, config.intervalSeconds * 1000);

  runCloudSyncCycle(fyo).catch(() => undefined);
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
      await processOutboxItem(fyo, item as CloudSyncOutbox, {
        apiUrl: config.pushApiUrl,
        token: config.token,
        companyId: config.companyId,
      });
    }
  } finally {
    syncing = false;
  }
}

export async function runCloudSyncCycle(fyo: Fyo) {
  await flushCloudSyncOutbox(fyo);
  await pullCloudSyncChanges(fyo);
  await runAutoReconciliationIfDue(fyo);
}

export async function pullCloudSyncChanges(fyo: Fyo) {
  const online =
    typeof navigator === 'undefined' ? true : navigator.onLine !== false;
  if (!online) {
    return;
  }

  const config = getWorkerConfig(fyo);
  if (!config.enabled) {
    return;
  }

  const cursorDoc = await getOrCreateCursor(fyo, config.companyId);
  const lastSeq = cursorDoc.lastSeq ?? 0;

  const response = (await sendAPIRequest(config.pullApiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.token}`,
      apikey: config.token,
    },
    body: JSON.stringify({
      target_company: config.companyId,
      last_seq: lastSeq,
      max_rows: 100,
    }),
  })) as RemoteSyncChange[] | { error?: string } | null;

  if (!response || !Array.isArray(response)) {
    return;
  }

  let maxSeq = lastSeq;
  for (const change of response) {
    await applyRemoteChange(fyo, change);
    maxSeq = Math.max(maxSeq, change.seq ?? maxSeq);
  }

  if (maxSeq > lastSeq) {
    await cursorDoc.setAndSync('lastSeq', maxSeq);
  }

  await updateCloudSyncState(fyo, {
    enrollmentStatus: 'active',
    lastPullAt: new Date().toISOString(),
    lastError: '',
  });
}

async function getOrCreateCursor(
  fyo: Fyo,
  companyId: string
): Promise<CloudSyncCursor> {
  const cursorRows = await fyo.db.getAll(ModelNameEnum.CloudSyncCursor, {
    filters: { companyId },
  });

  if (cursorRows.length) {
    return (await fyo.doc.getDoc(
      ModelNameEnum.CloudSyncCursor,
      cursorRows[0]?.name as string
    )) as CloudSyncCursor;
  }

  const cursorDoc = fyo.doc.getNewDoc(ModelNameEnum.CloudSyncCursor, {
    companyId,
    lastSeq: 0,
  }) as CloudSyncCursor;
  cursorDoc._addDocToSyncQueue = false;
  await cursorDoc.sync();
  return cursorDoc;
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
    await updateCloudSyncState(fyo, {
      enrollmentStatus: 'active',
      lastPushAt: new Date().toISOString(),
      lastError: '',
    });
  } catch (error) {
    await outboxDoc.setAndSync({
      status: 'failed',
      errorMessage: (error as Error).message,
    });
    await updateCloudSyncState(fyo, {
      enrollmentStatus: 'error',
      lastError: (error as Error).message,
    });
  }
}

export async function applyRemoteChange(fyo: Fyo, change: RemoteSyncChange) {
  const operation = (change.operation ?? '').toLowerCase();
  if (change.doc_type === 'Account') {
    await applyRemoteAccountChange(fyo, change.payload ?? {}, operation);
    return;
  }

  if (change.doc_type === 'Party') {
    await applyRemotePartyChange(fyo, change.payload ?? {}, operation);
    return;
  }

  if (change.doc_type === 'JournalEntry') {
    await applyRemoteJournalEntryChange(fyo, change.payload ?? {}, operation);
    return;
  }
}

async function applyRemoteAccountChange(
  fyo: Fyo,
  payload: { data?: Record<string, unknown>; external_key?: string },
  operation: string
) {
  const data = payload.data ?? {};
  const name = String(data.name ?? payload.external_key ?? '');
  if (!name) {
    return;
  }

  const existing = await getExistingDocByName(fyo, ModelNameEnum.Account, name);
  if (operation === 'delete') {
    if (existing) {
      existing._addDocToSyncQueue = false;
      await existing.delete().catch(() => undefined);
    }
    return;
  }

  const valueMap = {
    name,
    rootType: String(data.root_type ?? data.rootType ?? ''),
    parentAccount: String(data.parent_account ?? data.parentAccount ?? ''),
    accountType: String(data.account_type ?? data.accountType ?? ''),
    isGroup: !!(data.is_group ?? data.isGroup ?? false),
    description: String(data.description ?? ''),
  };

  if (existing) {
    await applyDocUpdate(existing, valueMap);
    return;
  }

  const doc = fyo.doc.getNewDoc(ModelNameEnum.Account, valueMap);
  doc._addDocToSyncQueue = false;
  await doc.sync().catch(() => undefined);
}

async function applyRemotePartyChange(
  fyo: Fyo,
  payload: { data?: Record<string, unknown>; external_key?: string },
  operation: string
) {
  const data = payload.data ?? {};
  const name = String(data.name ?? payload.external_key ?? '');
  if (!name) {
    return;
  }

  const existing = await getExistingDocByName(fyo, ModelNameEnum.Party, name);
  if (operation === 'delete') {
    if (existing) {
      existing._addDocToSyncQueue = false;
      await existing.delete().catch(() => undefined);
    }
    return;
  }

  const valueMap = {
    name,
    role: String(data.role ?? 'Both'),
    email: String(data.email ?? ''),
    phone: String(data.phone ?? ''),
  };

  if (existing) {
    await applyDocUpdate(existing, valueMap);
    return;
  }

  const doc = fyo.doc.getNewDoc(ModelNameEnum.Party, valueMap);
  doc._addDocToSyncQueue = false;
  await doc.sync().catch(() => undefined);
}

async function applyDocUpdate(doc: Doc, valueMap: DocValueMap) {
  doc._addDocToSyncQueue = false;
  await doc.setMultiple(valueMap);
  await doc.sync().catch(() => undefined);
}

async function getExistingDocByName(
  fyo: Fyo,
  schemaName:
    | ModelNameEnum.Account
    | ModelNameEnum.Party
    | ModelNameEnum.JournalEntry,
  name: string
) {
  const exists = await fyo.db.exists(schemaName, name);
  if (!exists) {
    return null;
  }

  return await fyo.doc.getDoc(schemaName, name);
}

async function applyRemoteJournalEntryChange(
  fyo: Fyo,
  payload: { data?: Record<string, unknown>; external_key?: string },
  operation: string
) {
  const data = payload.data ?? {};
  const name = String(data.name ?? payload.external_key ?? '');
  if (!name) {
    return;
  }

  const existing = await getExistingDocByName(
    fyo,
    ModelNameEnum.JournalEntry,
    name
  );
  if (operation === 'delete') {
    if (!existing) {
      return;
    }

    existing._addDocToSyncQueue = false;
    if (existing.canDelete) {
      await existing.delete().catch(() => undefined);
      return;
    }

    if (existing.canCancel) {
      await existing.cancel().catch(() => undefined);
    }
    return;
  }

  const jeValues: DocValueMap = {
    name,
    entryType: String(data.entry_type ?? data.entryType ?? 'Journal Entry'),
    date: String(data.date ?? ''),
    referenceNumber: String(
      data.reference_number ?? data.referenceNumber ?? ''
    ),
    referenceDate: String(data.reference_date ?? data.referenceDate ?? ''),
    userRemark: String(data.user_remark ?? data.userRemark ?? ''),
  };

  const lineRows = Array.isArray(data.accounts) ? data.accounts : [];
  const mappedLines = [] as DocValueMap[];
  for (const rawRow of lineRows) {
    const row = (rawRow ?? {}) as Record<string, unknown>;
    const accountRef = String(row.account ?? '');
    const localAccount = await resolveAccountName(fyo, accountRef);
    if (!localAccount) {
      continue;
    }

    mappedLines.push({
      account: localAccount,
      debit: Number(row.debit ?? 0),
      credit: Number(row.credit ?? 0),
      loanProfile: String(row.loanProfile ?? ''),
      loanComponent: String(row.loanComponent ?? 'None'),
    });
  }

  if (mappedLines.length < 2) {
    return;
  }

  if (!existing) {
    const doc = fyo.doc.getNewDoc(ModelNameEnum.JournalEntry, jeValues);
    doc._addDocToSyncQueue = false;
    doc.skipAutoName = true;
    for (const row of mappedLines) {
      await doc.append('accounts', row);
    }

    await doc.sync().catch(() => undefined);
    if (doc.canSubmit) {
      await doc.submit().catch(() => undefined);
    }
    return;
  }

  if (existing.isSubmitted || existing.isCancelled) {
    return;
  }

  existing._addDocToSyncQueue = false;
  await existing.setMultiple(jeValues);
  await existing.set('accounts', []);
  for (const row of mappedLines) {
    await existing.append('accounts', row);
  }

  await existing.sync().catch(() => undefined);
  if (existing.canSubmit) {
    await existing.submit().catch(() => undefined);
  }
}

async function resolveAccountName(fyo: Fyo, accountRef: string) {
  if (!accountRef) {
    return null;
  }

  const byName = await fyo.db.exists(ModelNameEnum.Account, accountRef);
  if (byName) {
    return accountRef;
  }

  const rows = await fyo.db.getAll(ModelNameEnum.Account, {
    fields: ['name'],
    filters: { name: accountRef },
  });

  const accountName = rows[0]?.name as string | undefined;
  return accountName ?? null;
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
