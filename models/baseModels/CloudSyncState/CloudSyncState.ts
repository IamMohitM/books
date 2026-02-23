import { Doc } from 'fyo/model/doc';

export class CloudSyncState extends Doc {
  enrollmentStatus?: string;
  lastPushAt?: string;
  lastPullAt?: string;
  lastError?: string;
  lastReconciliationAt?: string;
  lastReconciliationStatus?: string;
  lastReconciliationSummary?: string;
}
