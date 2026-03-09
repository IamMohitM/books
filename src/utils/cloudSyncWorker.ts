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
const PROCESSING_STALE_MS = 2 * 60 * 1000;
const BOOTSTRAP_REQUEST_TIMEOUT_MS = 15_000;

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

export type BootstrapResult = {
  accounts: number;
  parties: number;
  journalEntries: number;
  journalEntryLines: number;
};

export type BootstrapDryRunResult = {
  canProceed: boolean;
  remoteHasData: boolean;
  localBalanced: boolean;
  local: SyncSnapshot;
  remote: SyncSnapshot;
  errors: string[];
  warnings: string[];
  checksum: string;
};

export type CloudSyncDiagnostics = {
  generatedAt: string;
  companyId: string;
  enrollmentStatus: string;
  syncMode: string;
  localSnapshot: SyncSnapshot;
  remoteSnapshot?: SyncSnapshot;
  dryRun?: BootstrapDryRunResult;
  outbox: {
    queued: number;
    processing: number;
    failed: number;
    sent: number;
  };
  lastError: string;
};

export type CollaboratorRow = {
  user_id: string;
  role: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
};

export type CollaboratorInviteRow = {
  id: string;
  company_id: string;
  email: string;
  role: string;
  created_at: string;
};

export type InviteFunctionStatus = {
  ok: boolean;
  status: number;
  message: string;
};

export type RemoteSchemaCheck = {
  ok: boolean;
  missingTables: string[];
  missingViews: string[];
  rlsMissing: string[];
};

type RemoteInitializationResult = {
  projectRef: string;
  appliedScripts: string[];
};
type BootstrapProgress = {
  stage:
    | 'starting'
    | 'checking_remote'
    | 'loading_local'
    | 'pushing_accounts'
    | 'pushing_parties'
    | 'pushing_journal_entries'
    | 'completed';
  message: string;
  processed?: number;
  total?: number;
};
const BOOTSTRAP_RETRY_ATTEMPTS = 5;
const BOOTSTRAP_BASE_RETRY_DELAY_MS = 600;
const BOOTSTRAP_ACCOUNTS_CONCURRENCY = 6;
const BOOTSTRAP_PARTIES_CONCURRENCY = 6;
const BOOTSTRAP_JOURNAL_ENTRIES_CONCURRENCY = 3;

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
        syncAllowedCompanies?: string;
      }
    | undefined;
}

function logCloudSync(message: string) {
  // Visible in terminal when desktop is started from terminal in dev mode.
  console.info(`[cloud-sync] ${message}`);
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

function getDefaultCompaniesApiUrl(pushApiUrl: string) {
  const marker = '/rest/v1/rpc/';
  const markerIndex = pushApiUrl.indexOf(marker);
  if (markerIndex >= 0) {
    const base = pushApiUrl.slice(0, markerIndex);
    return `${base}/rest/v1/companies`;
  }

  if (pushApiUrl.includes('/apply_sync_event')) {
    return pushApiUrl.replace('/rpc/apply_sync_event', '/companies');
  }

  return pushApiUrl;
}

function getDefaultClearApiUrl(pushApiUrl: string) {
  if (pushApiUrl.includes('/apply_sync_event')) {
    return pushApiUrl.replace('/apply_sync_event', '/clear_sync_company_data');
  }

  return pushApiUrl;
}

function normalizeProjectRef(projectIdOrUrl?: string) {
  const input = String(projectIdOrUrl ?? '').trim();
  if (!input) {
    return '';
  }

  if (input.endsWith('.supabase.co')) {
    return input
      .replace('https://', '')
      .replace('http://', '')
      .replace('.supabase.co', '');
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

function getSupabaseBaseUrl(projectIdOrUrl?: string) {
  const ref = normalizeProjectRef(projectIdOrUrl);
  if (!ref) {
    return '';
  }

  return `https://${ref}.supabase.co`;
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
  const companiesApiUrl = getDefaultCompaniesApiUrl(pushApiUrl);

  const isPilotMode = settings?.syncMode === 'pilot';
  const allowedCompanies = String(settings?.syncAllowedCompanies ?? '')
    .split(/[\n,]/)
    .map((v) => v.trim())
    .filter(Boolean);
  const pilotAllowed =
    !isPilotMode || allowedCompanies.includes(settings?.syncCompanyId ?? '');

  return {
    enabled:
      !!settings?.syncEnabled &&
      settings?.syncMode !== 'off' &&
      pilotAllowed &&
      !!pushApiUrl &&
      !!pullApiUrl &&
      !!settings?.syncAuthToken &&
      !!settings?.syncCompanyId,
    pushApiUrl,
    pullApiUrl,
    companiesApiUrl,
    token: settings?.syncAuthToken ?? '',
    companyId: settings?.syncCompanyId ?? '',
    intervalSeconds: Math.max(settings?.syncIntervalSeconds ?? 15, 5),
  };
}

async function ensureRemoteCompanyExists(config: {
  companiesApiUrl: string;
  token: string;
  companyId: string;
}) {
  try {
    await sendAPIRequest(config.companiesApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.token,
        Authorization: `Bearer ${config.token}`,
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify([
        {
          id: config.companyId,
          name: `Company ${config.companyId.slice(0, 8)}`,
        },
      ]),
    });
  } catch (error) {
    throw new Error(
      `Unable to ensure remote company exists. Check Sync Auth Token permissions and Company ID. ${
        (error as Error).message
      }`
    );
  }
}

function getSnapshotChecksum(snapshot: SyncSnapshot) {
  return [
    snapshot.accounts,
    snapshot.parties,
    snapshot.journal_entries,
    snapshot.journal_entry_lines,
    snapshot.debit_total.toFixed(2),
    snapshot.credit_total.toFixed(2),
  ].join('|');
}

function getCloudSyncStateDoc(fyo: Fyo): CloudSyncState | null {
  return (fyo.singles.CloudSyncState as CloudSyncState | undefined) ?? null;
}

function isSyncEnrollmentPaused(fyo: Fyo): boolean {
  const stateDoc = getCloudSyncStateDoc(fyo);
  return String(stateDoc?.enrollmentStatus ?? '') === 'paused';
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
    lastDryRunAt: string;
    lastDryRunStatus: string;
    lastDryRunSummary: string;
    lastDryRunChecksum: string;
  }>
) {
  const stateDoc = getCloudSyncStateDoc(fyo);
  if (!stateDoc) {
    return;
  }

  stateDoc._addDocToSyncQueue = false;
  await stateDoc.setAndSync(values).catch(() => undefined);
}

export async function setCloudSyncEnrollmentStatus(
  fyo: Fyo,
  status: 'not_enrolled' | 'enrolling' | 'active' | 'paused' | 'error',
  lastError = ''
) {
  await updateCloudSyncState(fyo, {
    enrollmentStatus: status,
    lastError,
  });
}

function toNumber(value: unknown) {
  const numeric =
    typeof value === 'number' ? value : Number(String(value ?? '').trim());
  if (Number.isNaN(numeric)) {
    return 0;
  }

  return numeric;
}

function normalizeDateForSync(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return '';
  }

  const isoMatch = raw.match(/\d{4}-\d{2}-\d{2}/);
  if (isoMatch) {
    return isoMatch[0];
  }

  // Handle JS Date text such as "... GMT+0530 (India Standard Time)".
  const normalized = raw
    .replace(/\s*\(.*\)\s*$/, '')
    .replace(/\sGMT([+-]\d{2})(\d{2})$/, ' GMT$1:$2');
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  // Keep the local calendar date to avoid timezone day rollback.
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
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

  const decimalKeys: Array<keyof SyncSnapshot> = [
    'debit_total',
    'credit_total',
  ];
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
  const response = (await withTimeout(
    sendAPIRequest(snapshotApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: token,
      },
      body: JSON.stringify({
        target_company: companyId,
      }),
    }),
    BOOTSTRAP_REQUEST_TIMEOUT_MS,
    'fetch_sync_snapshot'
  )) as {
    accounts?: unknown;
    parties?: unknown;
    journal_entries?: unknown;
    journal_entry_lines?: unknown;
    debit_total?: unknown;
    credit_total?: unknown;
    error?: string;
  } | null;

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

async function sendApplySyncEvent(
  apiUrl: string,
  token: string,
  companyId: string,
  event: {
    event_id: string;
    reference_type: string;
    document_name: string;
    operation: string;
    payload: Record<string, unknown>;
  }
) {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= BOOTSTRAP_RETRY_ATTEMPTS; attempt++) {
    try {
      logCloudSync(
        `apply_sync_event attempt ${attempt}/${BOOTSTRAP_RETRY_ATTEMPTS} for ${event.reference_type} ${event.document_name}`
      );
      const response = (await withTimeout(
        sendAPIRequest(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: token,
          },
          body: JSON.stringify({
            event: {
              ...event,
              company_id: companyId,
            },
          }),
        }),
        BOOTSTRAP_REQUEST_TIMEOUT_MS,
        'apply_sync_event'
      )) as { success?: boolean; error?: string } | null;

      if (response?.error) {
        throw new Error(response.error);
      }

      return;
    } catch (error) {
      lastError = error as Error;
      logCloudSync(
        `apply_sync_event failed attempt ${attempt} for ${event.reference_type} ${event.document_name}: ${lastError.message}`
      );
      if (attempt >= BOOTSTRAP_RETRY_ATTEMPTS) {
        break;
      }

      const delayMs = BOOTSTRAP_BASE_RETRY_DELAY_MS * attempt;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw new Error(
    `Failed after ${BOOTSTRAP_RETRY_ATTEMPTS} attempts for ${
      event.reference_type
    } ${event.document_name}: ${lastError?.message ?? 'Unknown error'}`
  );
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
) {
  if (!items.length) {
    return;
  }

  let nextIndex = 0;
  const safeConcurrency = Math.max(1, Math.min(concurrency, items.length));
  const runners = Array.from({ length: safeConcurrency }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await worker(items[index]!);
    }
  });

  await Promise.all(runners);
}

function normalizeJournalEntryEventPayload(payload: Record<string, unknown>) {
  const data = (payload.data ?? {}) as Record<string, unknown>;
  const normalizedDate = normalizeDateForSync(data.date ?? data.date_value);
  const normalizedReferenceDate = normalizeDateForSync(
    data.referenceDate ?? data.reference_date
  );
  const hasCancelled =
    payload.cancelled !== undefined || data.cancelled !== undefined;
  const cancelled =
    payload.cancelled === true ||
    payload.cancelled === 1 ||
    data.cancelled === true ||
    data.cancelled === 1;
  const submitted =
    payload.submitted === true ||
    payload.submitted === 1 ||
    data.submitted === true ||
    data.submitted === 1;
  const normalizedSubmitted = hasCancelled
    ? submitted && !cancelled
    : submitted;

  return {
    ...payload,
    submitted: normalizedSubmitted,
    data: {
      ...data,
      date: normalizedDate || null,
      referenceDate: normalizedReferenceDate || null,
      reference_date: normalizedReferenceDate || null,
      submitted: normalizedSubmitted,
    },
  };
}

export async function bootstrapCloudSyncFromLocal(
  fyo: Fyo,
  options?: {
    force?: boolean;
    onProgress?: (progress: BootstrapProgress) => void;
  }
): Promise<BootstrapResult> {
  const onProgress = options?.onProgress;
  const reportProgress = (progress: BootstrapProgress) => {
    onProgress?.(progress);
    logCloudSync(`bootstrap ${progress.stage}: ${progress.message}`);
  };

  const config = getWorkerConfig(fyo);
  if (!config.enabled) {
    throw new Error('Cloud sync is not fully configured');
  }

  await ensureRemoteCompanyExists({
    companiesApiUrl: config.companiesApiUrl,
    token: config.token,
    companyId: config.companyId,
  });

  await updateCloudSyncState(fyo, {
    enrollmentStatus: 'enrolling',
    lastError: '',
  });

  try {
    reportProgress({
      stage: 'starting',
      message: 'Starting bootstrap',
    });
    reportProgress({
      stage: 'checking_remote',
      message: 'Checking remote snapshot',
    });
    const remoteSnapshot = await fetchRemoteSyncSnapshot(
      config.pullApiUrl,
      config.token,
      config.companyId
    );
    const remoteHasData =
      remoteSnapshot.accounts > 0 ||
      remoteSnapshot.parties > 0 ||
      remoteSnapshot.journal_entries > 0 ||
      remoteSnapshot.journal_entry_lines > 0;

    if (remoteHasData && !options?.force) {
      throw new Error(
        'Remote company already has data. Clear remote company data first, or run forced bootstrap.'
      );
    }

    reportProgress({
      stage: 'loading_local',
      message: 'Loading local records',
    });
    const accounts = await fyo.db.getAll(ModelNameEnum.Account, {
      fields: [
        'name',
        'rootType',
        'parentAccount',
        'accountType',
        'isGroup',
        'description',
      ],
      orderBy: 'name',
    });
    const parties = await fyo.db.getAll(ModelNameEnum.Party, {
      fields: ['name', 'role', 'email', 'phone'],
      orderBy: 'name',
    });
    const journalEntries = await fyo.db.getAll(ModelNameEnum.JournalEntry, {
      fields: [
        'name',
        'entryType',
        'date',
        'referenceNumber',
        'referenceDate',
        'userRemark',
        'submitted',
        'cancelled',
      ],
      orderBy: 'name',
    });
    const journalEntryLines = await fyo.db.getAll(
      ModelNameEnum.JournalEntryAccount,
      {
        fields: [
          'parent',
          'account',
          'debit',
          'credit',
          'loanProfile',
          'loanComponent',
        ],
        orderBy: 'parent',
      }
    );

    const linesByParent = new Map<string, Record<string, unknown>[]>();
    for (const raw of journalEntryLines) {
      const parent = String(raw.parent ?? '');
      if (!parent) {
        continue;
      }

      if (!linesByParent.has(parent)) {
        linesByParent.set(parent, []);
      }

      linesByParent.get(parent)!.push({
        account: String(raw.account ?? ''),
        debit: toNumber(raw.debit),
        credit: toNumber(raw.credit),
        loanProfile: String(raw.loanProfile ?? ''),
        loanComponent: String(raw.loanComponent ?? 'None'),
      });
    }

    let eventIndex = 0;
    const getEventId = (prefix: string, name: string) => {
      eventIndex += 1;
      return `bootstrap:${prefix}:${name}:${Date.now()}:${eventIndex}`;
    };

    let pushedAccounts = 0;
    let pushedParties = 0;
    let pushedJournalEntries = 0;
    reportProgress({
      stage: 'pushing_accounts',
      message: `Pushing accounts 0/${accounts.length}`,
      processed: 0,
      total: accounts.length,
    });
    await runWithConcurrency(
      accounts,
      BOOTSTRAP_ACCOUNTS_CONCURRENCY,
      async (account) => {
        const name = String(account.name ?? '');
        if (!name) {
          return;
        }

        await sendApplySyncEvent(
          config.pushApiUrl,
          config.token,
          config.companyId,
          {
            event_id: getEventId('Account', name),
            reference_type: ModelNameEnum.Account,
            document_name: name,
            operation: 'create',
            payload: {
              data: {
                name,
                rootType: String(account.rootType ?? ''),
                parentAccount: String(account.parentAccount ?? ''),
                accountType: String(account.accountType ?? ''),
                isGroup: !!account.isGroup,
                description: String(account.description ?? ''),
              },
            },
          }
        );
        pushedAccounts += 1;
        if (pushedAccounts === accounts.length || pushedAccounts % 10 === 0) {
          reportProgress({
            stage: 'pushing_accounts',
            message: `Pushing accounts ${pushedAccounts}/${accounts.length}`,
            processed: pushedAccounts,
            total: accounts.length,
          });
        }
      }
    );

    reportProgress({
      stage: 'pushing_parties',
      message: `Pushing parties 0/${parties.length}`,
      processed: 0,
      total: parties.length,
    });
    await runWithConcurrency(
      parties,
      BOOTSTRAP_PARTIES_CONCURRENCY,
      async (party) => {
        const name = String(party.name ?? '');
        if (!name) {
          return;
        }

        await sendApplySyncEvent(
          config.pushApiUrl,
          config.token,
          config.companyId,
          {
            event_id: getEventId('Party', name),
            reference_type: ModelNameEnum.Party,
            document_name: name,
            operation: 'create',
            payload: {
              data: {
                name,
                role: String(party.role ?? ''),
                email: String(party.email ?? ''),
                phone: String(party.phone ?? ''),
              },
            },
          }
        );
        pushedParties += 1;
        if (pushedParties === parties.length || pushedParties % 10 === 0) {
          reportProgress({
            stage: 'pushing_parties',
            message: `Pushing parties ${pushedParties}/${parties.length}`,
            processed: pushedParties,
            total: parties.length,
          });
        }
      }
    );

    reportProgress({
      stage: 'pushing_journal_entries',
      message: `Pushing journal entries 0/${journalEntries.length}`,
      processed: 0,
      total: journalEntries.length,
    });
    await runWithConcurrency(
      journalEntries,
      BOOTSTRAP_JOURNAL_ENTRIES_CONCURRENCY,
      async (je) => {
        const name = String(je.name ?? '');
        if (!name) {
          return;
        }

        const lines = linesByParent.get(name) ?? [];
        if (!lines.length) {
          return;
        }

        await sendApplySyncEvent(
          config.pushApiUrl,
          config.token,
          config.companyId,
          {
            event_id: getEventId('JournalEntry', name),
            reference_type: ModelNameEnum.JournalEntry,
            document_name: name,
            operation: 'create',
            payload: normalizeJournalEntryEventPayload({
              data: {
                name,
                entryType: String(je.entryType ?? ''),
                date: String(je.date ?? ''),
                referenceNumber: String(je.referenceNumber ?? ''),
                referenceDate: String(je.referenceDate ?? ''),
                userRemark: String(je.userRemark ?? ''),
                submitted:
                  !!(je as { submitted?: boolean }).submitted &&
                  !(je as { cancelled?: boolean }).cancelled,
                accounts: lines,
              },
            }),
          }
        );
        pushedJournalEntries += 1;
        if (
          pushedJournalEntries === journalEntries.length ||
          pushedJournalEntries % 5 === 0
        ) {
          reportProgress({
            stage: 'pushing_journal_entries',
            message: `Pushing journal entries ${pushedJournalEntries}/${journalEntries.length}`,
            processed: pushedJournalEntries,
            total: journalEntries.length,
          });
        }
      }
    );

    await updateCloudSyncState(fyo, {
      enrollmentStatus: 'enrolling',
      lastPushAt: new Date().toISOString(),
      lastError: '',
    });
    reportProgress({
      stage: 'completed',
      message: `Bootstrap finished. Accounts=${pushedAccounts}, Parties=${pushedParties}, JournalEntries=${pushedJournalEntries}`,
    });

    return {
      accounts: pushedAccounts,
      parties: pushedParties,
      journalEntries: pushedJournalEntries,
      journalEntryLines: journalEntryLines.length,
    };
  } catch (error) {
    await updateCloudSyncState(fyo, {
      enrollmentStatus: 'error',
      lastError: (error as Error).message,
    });
    throw error;
  }
}

export async function runCloudSyncBootstrapDryRun(
  fyo: Fyo,
  options?: { force?: boolean }
): Promise<BootstrapDryRunResult> {
  const config = getWorkerConfig(fyo);
  if (!config.enabled) {
    throw new Error('Cloud sync is not fully configured');
  }

  const [local, remote] = await Promise.all([
    getLocalSyncSnapshot(fyo),
    fetchRemoteSyncSnapshot(config.pullApiUrl, config.token, config.companyId),
  ]);

  const remoteHasData =
    remote.accounts > 0 ||
    remote.parties > 0 ||
    remote.journal_entries > 0 ||
    remote.journal_entry_lines > 0;
  const localBalanced =
    Math.abs(local.debit_total - local.credit_total) <= 0.01;

  const errors: string[] = [];
  const warnings: string[] = [];

  if (!localBalanced) {
    errors.push(
      `Local trial balance mismatch: debit=${local.debit_total.toFixed(
        2
      )} credit=${local.credit_total.toFixed(2)}`
    );
  }

  if (remoteHasData && !options?.force) {
    errors.push(
      'Remote company already has data. Clear remote company data first, or use forced bootstrap.'
    );
  } else if (remoteHasData && options?.force) {
    warnings.push('Force mode enabled: remote company has existing data.');
  }

  const checksum = getSnapshotChecksum(local);
  await updateCloudSyncState(fyo, {
    lastDryRunAt: new Date().toISOString(),
    lastDryRunStatus: errors.length === 0 ? 'passed' : 'failed',
    lastDryRunSummary:
      errors.length === 0 ? 'Dry run passed.' : errors.join('\n'),
    lastDryRunChecksum: checksum,
  });

  return {
    canProceed: errors.length === 0,
    remoteHasData,
    localBalanced,
    local,
    remote,
    errors,
    warnings,
    checksum,
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

export async function clearCloudSyncRemoteCompanyData(fyo: Fyo) {
  const config = getWorkerConfig(fyo);
  if (!config.enabled) {
    throw new Error('Cloud sync is not fully configured');
  }

  const clearApiUrl = getDefaultClearApiUrl(config.pushApiUrl);
  logCloudSync(`clearing remote company data for ${config.companyId}`);

  const response = (await sendAPIRequest(clearApiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: config.token,
    },
    body: JSON.stringify({
      target_company: config.companyId,
    }),
  })) as {
    success?: boolean;
    error?: string;
    deleted?: Record<string, number>;
  } | null;

  if (!response) {
    throw new Error('Empty response from clear remote data API');
  }

  if (response.error) {
    throw new Error(response.error);
  }

  await updateCloudSyncState(fyo, {
    enrollmentStatus: 'not_enrolled',
    lastError: '',
    lastReconciliationStatus: 'unknown',
    lastReconciliationSummary: '',
  });

  return response;
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
  if (!config.enabled || isSyncEnrollmentPaused(fyo)) {
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

  if (isSyncEnrollmentPaused(fyo)) {
    return;
  }

  const config = getWorkerConfig(fyo);
  if (!config.enabled) {
    return;
  }

  syncing = true;
  try {
    await ensureRemoteCompanyExists({
      companiesApiUrl: config.companiesApiUrl,
      token: config.token,
      companyId: config.companyId,
    });

    await reclaimStaleProcessingOutboxRows(fyo);

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

export async function resetCloudSyncOutbox(
  fyo: Fyo
): Promise<{ cleared: number }> {
  const config = getWorkerConfig(fyo);
  if (!config.enabled) {
    throw new Error('Cloud sync is not fully configured');
  }

  const [failed, processing] = await Promise.all([
    fyo.db.getAll(ModelNameEnum.CloudSyncOutbox, {
      filters: { status: 'failed' },
      fields: ['name'],
    }),
    fyo.db.getAll(ModelNameEnum.CloudSyncOutbox, {
      filters: { status: 'processing' },
      fields: ['name'],
    }),
  ]);

  const targets = [...failed, ...processing].filter((row) => row.name);
  for (const row of targets) {
    const name = row.name as string;
    try {
      const doc = (await fyo.doc.getDoc(
        ModelNameEnum.CloudSyncOutbox,
        name
      )) as CloudSyncOutbox;
      await doc.delete().catch(() => undefined);
    } catch {
      await fyo.db.delete(ModelNameEnum.CloudSyncOutbox, name).catch(() => undefined);
    }
  }

  await updateCloudSyncState(fyo, {
    lastError: '',
    enrollmentStatus: 'active',
  });

  return { cleared: targets.length };
}

async function reclaimStaleProcessingOutboxRows(fyo: Fyo) {
  const processing = await fyo.db.getAll(ModelNameEnum.CloudSyncOutbox, {
    fields: ['name', 'modified'],
    filters: { status: 'processing' },
    orderBy: 'modified',
  });

  const now = Date.now();
  for (const row of processing) {
    const name = row.name as string | undefined;
    if (!name) {
      continue;
    }

    const modifiedAt = new Date(String(row.modified ?? '')).getTime();
    if (Number.isNaN(modifiedAt) || now - modifiedAt < PROCESSING_STALE_MS) {
      continue;
    }

    const outboxDoc = (await fyo.doc.getDoc(
      ModelNameEnum.CloudSyncOutbox,
      name
    )) as CloudSyncOutbox;
    await outboxDoc.setAndSync({
      status: 'failed',
      errorMessage:
        'Recovered from stale processing state. Previous sync attempt was interrupted.',
    });
  }
}

export async function runCloudSyncCycle(fyo: Fyo) {
  if (isSyncEnrollmentPaused(fyo)) {
    return;
  }

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

  if (isSyncEnrollmentPaused(fyo)) {
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

export async function resetCloudSyncPullCursorAndRepull(fyo: Fyo) {
  const config = getWorkerConfig(fyo);
  if (!config.enabled) {
    throw new Error('Cloud sync is not fully configured');
  }

  const cursorDoc = await getOrCreateCursor(fyo, config.companyId);
  cursorDoc._addDocToSyncQueue = false;
  await cursorDoc.setAndSync('lastSeq', 0);

  await pullCloudSyncChanges(fyo);
}

export async function exportCloudSyncDiagnostics(
  fyo: Fyo
): Promise<CloudSyncDiagnostics> {
  const config = getWorkerConfig(fyo);
  const stateDoc = getCloudSyncStateDoc(fyo);
  const localSnapshot = await getLocalSyncSnapshot(fyo);
  let remoteSnapshot: SyncSnapshot | undefined;
  let dryRun: BootstrapDryRunResult | undefined;

  if (config.enabled) {
    try {
      remoteSnapshot = await fetchRemoteSyncSnapshot(
        config.pullApiUrl,
        config.token,
        config.companyId
      );
      dryRun = await runCloudSyncBootstrapDryRun(fyo);
    } catch {
      remoteSnapshot = undefined;
    }
  }

  const [queued, processing, failed, sent] = await Promise.all([
    fyo.db.count(ModelNameEnum.CloudSyncOutbox, {
      filters: { status: 'queued' },
    }),
    fyo.db.count(ModelNameEnum.CloudSyncOutbox, {
      filters: { status: 'processing' },
    }),
    fyo.db.count(ModelNameEnum.CloudSyncOutbox, {
      filters: { status: 'failed' },
    }),
    fyo.db.count(ModelNameEnum.CloudSyncOutbox, {
      filters: { status: 'sent' },
    }),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    companyId: config.companyId,
    enrollmentStatus: String(stateDoc?.enrollmentStatus ?? 'not_enrolled'),
    syncMode: String(getSystemSettings(fyo)?.syncMode ?? 'off'),
    localSnapshot,
    remoteSnapshot,
    dryRun,
    outbox: {
      queued,
      processing,
      failed,
      sent,
    },
    lastError: String(stateDoc?.lastError ?? ''),
  };
}

export async function pauseCloudSync(fyo: Fyo) {
  stopCloudSyncWorker();
  await setCloudSyncEnrollmentStatus(fyo, 'paused', '');
}

export async function resumeCloudSync(fyo: Fyo) {
  await setCloudSyncEnrollmentStatus(fyo, 'active', '');
  startCloudSyncWorker(fyo);
}

export async function initializeCloudSyncRemoteSchema(
  fyo: Fyo,
  options: { accessToken: string }
): Promise<RemoteInitializationResult> {
  const settings = getSystemSettings(fyo);
  const projectRef = normalizeProjectRef(
    settings?.syncProjectId || settings?.syncApiUrl
  );
  if (!projectRef) {
    throw new Error('Sync Project ID is required to initialize remote schema');
  }

  const accessToken = String(options.accessToken ?? '').trim();
  if (!accessToken) {
    throw new Error('Supabase admin access token is required');
  }

  const queryApiUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;
  const scripts = await ipc.getSyncInitScripts();

  const appliedScripts: string[] = [];
  for (const script of scripts) {
    const sql = String(script.sql ?? '').trim();
    if (!sql) {
      continue;
    }

    try {
      await sendAPIRequest(queryApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          query: sql,
        }),
      });
      appliedScripts.push(script.name);
    } catch (error) {
      throw new Error(
        `Remote initialization failed at ${script.name}: ${
          (error as Error).message
        }`
      );
    }
  }

  await updateCloudSyncState(fyo, {
    enrollmentStatus: 'not_enrolled',
    lastError: '',
  });

  return {
    projectRef,
    appliedScripts,
  };
}

export async function listCloudSyncCollaborators(
  fyo: Fyo
): Promise<CollaboratorRow[]> {
  const config = getWorkerConfig(fyo);
  const baseUrl = getSupabaseBaseUrl(getSystemSettings(fyo)?.syncProjectId);
  if (!baseUrl || !config.token || !config.companyId) {
    throw new Error('Cloud sync is not fully configured');
  }

  const endpoint = `${baseUrl}/rest/v1/company_users_with_profile?company_id=eq.${encodeURIComponent(
    config.companyId
  )}&select=user_id,role,email,full_name,created_at&order=created_at.asc`;
  const response = (await sendAPIRequest(endpoint, {
    method: 'GET',
    headers: {
      apikey: config.token,
    },
  })) as CollaboratorRow[] | { error?: string } | null;

  if (!response) {
    return [];
  }

  if (!Array.isArray(response)) {
    throw new Error(
      (response as { error?: string }).error ?? 'Invalid response'
    );
  }

  return response;
}

export async function listCloudSyncInvitations(
  fyo: Fyo
): Promise<CollaboratorInviteRow[]> {
  const config = getWorkerConfig(fyo);
  const baseUrl = getSupabaseBaseUrl(getSystemSettings(fyo)?.syncProjectId);
  if (!baseUrl || !config.token || !config.companyId) {
    throw new Error('Cloud sync is not fully configured');
  }

  const endpoint = `${baseUrl}/rest/v1/company_user_invitations?company_id=eq.${encodeURIComponent(
    config.companyId
  )}&select=id,company_id,email,role,created_at&order=created_at.desc`;
  const response = (await sendAPIRequest(endpoint, {
    method: 'GET',
    headers: {
      apikey: config.token,
      Authorization: `Bearer ${config.token}`,
    },
  })) as CollaboratorInviteRow[] | { error?: string } | null;

  if (!response) {
    return [];
  }

  if (!Array.isArray(response)) {
    throw new Error(
      (response as { error?: string }).error ?? 'Invalid response'
    );
  }

  return response;
}

export async function checkInviteFunction(
  fyo: Fyo
): Promise<InviteFunctionStatus> {
  const config = getWorkerConfig(fyo);
  const baseUrl = getSupabaseBaseUrl(getSystemSettings(fyo)?.syncProjectId);
  if (!baseUrl) {
    return { ok: false, status: 0, message: 'Missing Sync Project ID.' };
  }

  const endpoint = `${baseUrl}/functions/v1/invite-user`;
  try {
    await sendAPIRequest(endpoint, {
      method: 'OPTIONS',
      headers: {
        apikey: config.token,
        Authorization: config.token ? `Bearer ${config.token}` : '',
      },
    });
    return { ok: true, status: 200, message: 'invite-user is reachable.' };
  } catch (error) {
    const message = (error as Error)?.message ?? 'Invite function check failed';
    const match = /HTTP\\s+(\\d+)/i.exec(message);
    const status = match ? Number(match[1]) : 0;
    return {
      ok: false,
      status: status || 0,
      message,
    };
  }
}

export async function verifyRemoteSchema(
  projectRef: string,
  accessToken: string
): Promise<RemoteSchemaCheck> {
  const queryApiUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;
  const requiredTables = [
    'companies',
    'company_users',
    'company_user_invitations',
    'profiles',
    'journal_entries',
    'journal_entry_lines',
  ];
  const requiredViews = [
    'company_users_with_profile',
    'journal_entries_with_user',
  ];

  const tablesResult = (await sendAPIRequest(queryApiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      query: `
        select lower(table_name) as name
        from information_schema.tables
        where table_schema = 'public';
      `,
    }),
  })) as Array<{ name: string }>;

  const viewsResult = (await sendAPIRequest(queryApiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      query: `
        select lower(table_name) as name
        from information_schema.views
        where table_schema = 'public';
      `,
    }),
  })) as Array<{ name: string }>;

  const rlsResult = (await sendAPIRequest(queryApiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      query: `
        select lower(relname) as name, relrowsecurity
        from pg_class
        where relname in ('companies','company_users','company_user_invitations','profiles');
      `,
    }),
  })) as Array<{ name: string; relrowsecurity: boolean }>;

  const tableSet = new Set(tablesResult.map((row) => row.name));
  const viewSet = new Set(viewsResult.map((row) => row.name));
  const rlsMap = new Map(
    rlsResult.map((row) => [row.name, row.relrowsecurity])
  );

  const missingTables = requiredTables.filter((name) => !tableSet.has(name));
  const missingViews = requiredViews.filter((name) => !viewSet.has(name));
  const rlsMissing = ['companies','company_users','company_user_invitations','profiles'].filter(
    (name) => !rlsMap.get(name)
  );

  return {
    ok: missingTables.length === 0 && missingViews.length === 0 && rlsMissing.length === 0,
    missingTables,
    missingViews,
    rlsMissing,
  };
}

export async function inviteCloudSyncCollaborator(
  fyo: Fyo,
  email: string,
  role: 'owner' | 'editor' = 'editor'
) {
  const config = getWorkerConfig(fyo);
  const baseUrl = getSupabaseBaseUrl(getSystemSettings(fyo)?.syncProjectId);
  if (!baseUrl || !config.token || !config.companyId) {
    throw new Error('Cloud sync is not fully configured');
  }

  const inviteEmail = String(email ?? '')
    .trim()
    .toLowerCase();
  if (!inviteEmail) {
    throw new Error('Invite email is required');
  }

  const payload = {
    target_company: config.companyId,
    invite_email: inviteEmail,
    invite_role: role,
  };
  const headers = {
    'Content-Type': 'application/json',
    apikey: config.token,
    Authorization: `Bearer ${config.token}`,
  };
  let response: { error?: string } | string | null = null;
  const inviteAuthUserViaServiceToken = async () => {
    try {
      await sendAPIRequest(`${baseUrl}/auth/v1/invite`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          email: inviteEmail,
        }),
      });
      return;
    } catch (inviteError) {
      const inviteMessage = String(
        (inviteError as Error)?.message ?? inviteError ?? ''
      ).toLowerCase();

      // Safe to continue: user may already exist by the time this runs.
      if (
        inviteMessage.includes('already') ||
        inviteMessage.includes('registered')
      ) {
        return;
      }

      throw new Error(
        `Unable to create/invite auth user for ${inviteEmail}. ${
          (inviteError as Error).message
        }`
      );
    }
  };

  // Use edge function which creates pending invitation for two-stage signup flow
  response = (await sendAPIRequest(`${baseUrl}/functions/v1/invite-user`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      companyId: config.companyId,
      email: inviteEmail,
      role,
      accessToken: config.token,
    }),
  })) as { error?: string } | string | null;

  if (response && typeof response === 'object' && 'error' in response) {
    throw new Error(response.error ?? 'Invite failed');
  }

  return response;
}

export async function removeCloudSyncCollaborator(fyo: Fyo, userId: string) {
  const config = getWorkerConfig(fyo);
  const baseUrl = getSupabaseBaseUrl(getSystemSettings(fyo)?.syncProjectId);
  if (!baseUrl || !config.token || !config.companyId) {
    throw new Error('Cloud sync is not fully configured');
  }

  const targetUserId = String(userId ?? '').trim();
  if (!targetUserId) {
    throw new Error('Collaborator user id is required');
  }

  const endpoint = `${baseUrl}/rest/v1/company_users?company_id=eq.${encodeURIComponent(
    config.companyId
  )}&user_id=eq.${encodeURIComponent(targetUserId)}`;
  await sendAPIRequest(endpoint, {
    method: 'DELETE',
    headers: {
      apikey: config.token,
      Prefer: 'return=minimal',
    },
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
  const sanitizedPayload =
    outboxDoc.referenceType === ModelNameEnum.JournalEntry
      ? normalizeJournalEntryEventPayload(payload)
      : payload;

  try {
    const response = (await sendAPIRequest(config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.token,
      },
      body: JSON.stringify({
        event: {
          event_id: outboxDoc.eventId,
          company_id: config.companyId,
          reference_type: outboxDoc.referenceType,
          document_name: outboxDoc.documentName,
          operation: outboxDoc.operation,
          payload: sanitizedPayload,
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
  payload: {
    data?: Record<string, unknown>;
    external_key?: string;
    id?: string;
  },
  operation: string
) {
  const data = payload.data ?? {};
  const name = String(data.name ?? payload.external_key ?? payload.id ?? '');
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
  payload: {
    data?: Record<string, unknown>;
    external_key?: string;
    id?: string;
  },
  operation: string
) {
  const data = payload.data ?? {};
  const name = String(data.name ?? payload.external_key ?? payload.id ?? '');
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
  payload: {
    data?: Record<string, unknown>;
    external_key?: string;
    id?: string;
  },
  operation: string
) {
  const data = payload.data ?? {};
  const name = String(data.name ?? payload.external_key ?? payload.id ?? '');
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
