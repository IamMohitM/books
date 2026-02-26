# Architecture: Production-Safe Desktop ↔ Supabase Sync

## Current Baseline
- Mobile/web is Supabase-first.
- Desktop is SQLite-first.
- Existing script is one-time import only.

## Target Model
- Supabase becomes shared cloud source of truth.
- Desktop remains local-first with sync engine (outbox + inbox).
- Sync is opt-in per company/environment via feature flag.

## Core Components

### 1) Identity and Metadata
- Add stable IDs for synced docs (`uuid`), separate from local display names where needed.
- Add metadata fields:
  - `row_version` (int)
  - `updated_at` (server timestamp)
  - `deleted_at` (soft delete where applicable)
  - `client_request_id` (idempotency)
  - `device_id`

### 2) Desktop Outbox
- Local table `CloudSyncOutbox`:
  - `event_id`, `doc_type`, `doc_id`, `op`, `payload`, `status`, `attempts`, `last_error`, `created_at`
- Hook into desktop doc lifecycle (`sync/submit/cancel/delete`) for sync-enabled doctypes.
- Retry with backoff; idempotent push by `event_id` / `client_request_id`.

### 3) Server Apply API (Supabase)
- Use RPC/edge endpoint for atomic validation + upsert + version checks.
- Rules:
  - reject stale writes on mutable masters (`row_version` mismatch).
  - submitted JEs immutable except cancel/reversal operations.

### 4) Server Change Log
- Append-only `change_log` table via DB triggers for synced entities:
  - `seq`, `company_id`, `doc_type`, `doc_id`, `op`, `payload`, `committed_at`
- Guarantees deterministic order for clients.

### 5) Desktop Inbox
- Local cursor table `CloudSyncCursor` with `last_seq` per company.
- Pull `change_log` deltas, apply transactionally to SQLite.
- Persist cursor only after successful apply.

### 6) Reconciliation
- Background reconciler computes per-company hashes/checksums:
  - key ledgers, JE counts, account balances.
- On mismatch: alert + guided repair.

## Conflict Strategy
- Accounting transactional docs:
  - `JournalEntry` submitted: immutable, no direct edit sync.
  - cancellation/reversal represented as explicit operations.
- Master docs (`Account`, `Party`, etc.):
  - optimistic concurrency with `row_version`.
  - stale write returns conflict (client refresh + reapply).

## Migration Strategy (No Data Loss)

### Phase A: Preparation (Dev)
- Introduce schema additions and sync tables behind flags.
- Build migration verifier tools.

### Phase B: Production Readiness
- On first enrollment:
  1. create local backup copy.
  2. run dry-run migration report.
  3. execute import with idempotency markers.
  4. run post-import reconciliation.
- Mark company as `sync_enabled=true` only after pass.

### Phase C: Dual Operation
- Keep desktop fully usable offline.
- Outbox flushes when network available.
- Inbox continuously applies remote changes.

### Phase D: General Availability
- Gradual percentage rollout.
- Per-company enablement gates.
- Monitoring and automatic rollback switch.

## Compatibility with Existing Production
- Existing `.books.db` remains intact and authoritative pre-enrollment.
- No forced cloud migration on upgrade.
- If sync onboarding fails, app continues local-only mode.

## Environment and Rollout Controls
- `SYNC_FEATURE_ENABLED` (build/runtime): enables sync code paths.
- `SYNC_DEFAULT_MODE` (default `off`): `off | pilot | on`.
- `SYNC_ALLOWED_COMPANIES`: allowlist for pilot rollout.
- `company_sync_state` table/field in cloud:
  - `sync_enabled` boolean
  - `enrolled_at`
  - `migration_version`
  - `last_reconciled_at`

Desktop behavior contract:
- If `SYNC_FEATURE_ENABLED=false`: desktop behaves exactly as today (offline-only).
- If enabled but company not enrolled: desktop remains offline-only, shows onboarding CTA.
- If enrolled: outbox/inbox workers run in background with retry/backoff.

## Non-Destructive Migration Design
1. Local backup creation
- Create a full copy of `.books.db` before any sync enrollment step.
- Store metadata: app version, db checksum, timestamp.

2. Dry-run analyzer
- Scan local DB and produce import plan/counts and validation errors.
- No cloud writes in dry-run.

3. Idempotent bootstrap import
- Upload in dependency order (`Account`/masters → `JournalEntry` headers → lines).
- Every uploaded record carries deterministic external key (`desktop_company_id + local_name/uuid`).
- Server enforces uniqueness on external keys to prevent duplicates.

4. Reconciliation gate
- Compare row counts and trial-balance checksum.
- Set `company_sync_state.sync_enabled=true` only on successful reconciliation.

5. Failure semantics
- If any phase fails, set enrollment status to `error`, keep desktop local-only, and preserve outbox paused.
- User can retry enrollment from failed checkpoint.

## Risks and Mitigations
- Duplicate event on retries:
  - mitigate with idempotency keys and unique constraints.
- Concurrent edits on masters:
  - mitigate with `row_version` conflicts.
- Hidden drift:
  - mitigate with scheduled reconciliation + alerting.

## Implementation Order
1. Metadata + sync tables + flags
2. Outbox write path on desktop
3. Server apply endpoints with idempotency
4. Change log triggers + inbox pull
5. Reconciliation and operational dashboards
6. Pilot migration tool and runbook

## Merge-to-Production Safety Rule
- Code can be merged to production branch before rollout, but sync must remain opt-in and disabled by default.
- Existing production users are unaffected until explicit company enrollment is executed.
