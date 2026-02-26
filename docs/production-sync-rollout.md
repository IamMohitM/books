# Production Rollout Plan: Offline SQLite to Online Sync

## Objective
Enable desktop/mobile continuous sync without impacting existing production users until explicitly enrolled.

## Phase 0: Development Branch (Now)
- Implement sync feature behind flags only.
- Keep default behavior offline-only.
- Add migration/enrollment UI and diagnostics.
- Add integration tests for idempotent import and resume-on-failure.

Exit criteria:
- Fresh installs unchanged with sync disabled.
- Existing local DB usage unchanged with sync disabled.

## Phase 1: Staging Validation
- Clone representative production `.books.db` snapshots into staging.
- Run enrollment workflow end-to-end:
  - backup,
  - dry-run,
  - import,
  - reconciliation,
  - bidirectional update checks.
- Perform chaos tests:
  - network interruption during import,
  - duplicate retry submissions,
  - app restart mid-sync.

Exit criteria:
- No data loss.
- No duplicated journal entries.
- Reconciliation passes across all staging datasets.

## Phase 2: Production Pilot
- Release app version with sync still default-off.
- Enable only for allowlisted pilot companies.
- Monitor:
  - outbox backlog,
  - conflict rate,
  - reconciliation drift,
  - sync error rate.

Exit criteria:
- Pilot companies stable for agreed observation window.
- Support runbook validated.

## Phase 3: General Availability
- Keep enrollment explicit per company (no forced auto-migration).
- Expand allowlist progressively.
- Maintain rollback path (pause sync, local-only continuity).

## Enrollment Runbook (Per Company)
1. Confirm app version supports sync.
2. Verify cloud company and permissions.
3. Create and verify local DB backup.
4. Execute dry-run and resolve validation issues.
5. Start import (idempotent, resumable).
6. Run reconciliation.
7. Enable live sync for company.
8. Observe health metrics for first 24h.

## Rollback Runbook
1. Pause company sync.
2. Stop desktop outbox/inbox workers.
3. Continue local-only operation immediately.
4. Preserve diagnostic logs + failed checkpoint.
5. Reattempt enrollment or sync after remediation.

## Must-Not Rules
- Do not mutate existing production local DB automatically on app startup.
- Do not enable sync globally by default at release time.
- Do not mark company online until reconciliation succeeds.
