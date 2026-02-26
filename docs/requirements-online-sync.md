# Requirements: Desktop-Web-Mobile Online Sync (Production-Safe)

## Overview
Enable always-on data synchronization between desktop (current offline SQLite) and mobile/web (Supabase) while preserving all existing production desktop data and avoiding destructive migration.

## Goals
- Keep desktop and mobile/web data in sync continuously.
- Support existing production users with local offline databases.
- Allow gradual rollout with feature flags and no forced cutover.
- Avoid data loss and minimize conflict risk for accounting records.

## Non-Goals (Initial Release)
- Full bidirectional conflict-free freeform editing of posted accounting entries.
- Replacing local SQLite with online-only mode in phase 1.

## User Stories

### Story 1: Existing desktop customer upgrades without losing data
As a production desktop user
I want my existing local database to remain intact after upgrade
So that I can adopt online sync without risk of data loss.

Acceptance Criteria:
- Upgrade does not alter local DB irreversibly.
- First-time cloud onboarding runs explicit backup + verification.
- User can continue using local DB even if cloud setup fails.

### Story 2: Desktop writes sync to cloud reliably
As a desktop user
I want local changes to sync to cloud automatically
So that mobile/web reflects latest data.

Acceptance Criteria:
- Desktop writes are queued locally and retried until acknowledged.
- Sync is idempotent (safe on retries).
- Sync status is visible to user (in progress/failed/recovered).

### Story 3: Cloud changes sync back to desktop
As a desktop user
I want changes from mobile/web to appear in desktop
So that all devices stay aligned.

Acceptance Criteria:
- Desktop pulls/apply remote changes incrementally via cursor.
- Apply order is deterministic and resumable.
- Drift detection job reports reconciliation mismatch.

### Story 4: Conflict-safe accounting behavior
As a finance user
I want accounting data to remain valid under concurrent usage
So that books remain consistent and auditable.

Acceptance Criteria:
- Submitted journal entries are immutable; cancellation/reversal flow only.
- Mutable masters use optimistic concurrency (`row_version`).
- Stale update attempts return conflict and trigger refresh.

### Story 5: Controlled rollout in development then production
As an operator
I want this feature gated and migratable in phases
So that production remains unaffected until explicitly enabled.

Acceptance Criteria:
- Sync feature is behind flags/config toggle.
- Pilot rollout supports one company subset first.
- Production cutover requires explicit migration completion marker.

## Data Safety Requirements
- Automatic backup before first sync enrollment.
- Migration runbook with dry-run mode and checksum validation.
- Rollback path: disable sync and continue local-only operation.
- No destructive schema migration on production DBs without explicit approval.

## Success Metrics
- 0 data-loss incidents in migration cohort.
- >99.9% successful outbox delivery within retry window.
- <0.1% unresolved conflict events for mutable masters.
- Reconciliation mismatches detected and alertable within one cycle.

## Constraints
- Desktop must continue to work offline.
- Existing production `.books.db` files are source-of-truth at migration start.
- Mobile/web and desktop must converge on the same document identity model.

## Release Safety Gates (Mandatory)
- Gate 1: Code merged to development branch only with sync feature disabled by default.
- Gate 2: Production release ships with `sync.enabled=false` unless operator enables per-company.
- Gate 3: First-time company enrollment requires successful backup + dry-run validation.
- Gate 4: Company marked online only after import + reconciliation pass.
- Gate 5: Rollback switch available: disable sync and continue local-only immediately.

## Migration Acceptance Criteria (Production)
- Existing production users can install upgraded desktop app without any schema/data mutation of active local DB on startup.
- Sync onboarding is explicit user/admin action, not automatic during app upgrade.
- Pre-sync backup is created in a timestamped path and verified readable before upload starts.
- Import process is idempotent and restart-safe; re-running does not duplicate journal entries or accounts.
- If import fails, local desktop data remains fully usable offline and untouched.
- Post-import reconciliation report shows:
  - account master row counts matched,
  - journal entry header/line counts matched,
  - trial balance difference is zero (or within explicitly configured rounding tolerance).

## Operational Requirements
- Provide per-company sync state:
  - `not_enrolled`, `enrolling`, `active`, `paused`, `error`.
- Provide user-visible sync health indicators in desktop:
  - last successful push/pull time,
  - pending outbox count,
  - latest error and retry status.
- Provide admin actions:
  - pause sync,
  - resume sync,
  - rerun reconciliation,
  - export diagnostics bundle.
