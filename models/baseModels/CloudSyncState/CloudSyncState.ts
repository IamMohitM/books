import { Doc } from 'fyo/model/doc';

export class CloudSyncState extends Doc {
  enrollmentStatus?: string;
  lastPushAt?: string;
  lastPullAt?: string;
  lastError?: string;
  lastWarning?: string;
  lastReconciliationAt?: string;
  lastReconciliationStatus?: string;
  lastReconciliationSummary?: string;
  lastDryRunAt?: string;
  lastDryRunStatus?: string;
  lastDryRunSummary?: string;
  lastDryRunChecksum?: string;
}
