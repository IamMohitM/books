# Sync Settings Guide (Desktop)

This guide explains each Sync option in **Settings -> Sync**, when to use it, and which situations it is best for in production.

## Goals

- Make sync setup safe and simple for live data.
- Keep daily operations minimal.
- Keep advanced tools available for diagnosis and recovery.

## Recommended Daily Flow

1. Configure Sync fields once.
2. Click `Save`.
3. Use `Sync Now` when you want an immediate push/pull cycle.
4. Use `Repair Queue` if sync errors were previously shown.

If setup is complete and there are no failures, background sync should continue without manual intervention.

---

## Primary Sync Controls (Most Important)

These are the controls normal operators should use.

### Quick “Perfect For” Matrix

| Option | Perfect Situation |
|---|---|
| `Enable Cloud Sync` | Turning cloud sync on/off for this desktop/company. |
| `Sync Project ID` | First-time setup or switching Supabase projects. |
| `Sync Company ID` | Ensuring data syncs to the correct company tenant. |
| `Sync Auth Token` | Authenticating sync in production; fixing auth failures. |
| `Save` | Applying any updated sync configuration before actions. |
| `Sync Now` | Immediate push/pull when data must appear now. |
| `Repair Queue` | Recovering from failed/stuck sync queue items. |
| `Status` card | Fast triage of sync health and latest errors. |

### `Enable Cloud Sync`
- **What it does:** Enables or disables cloud sync for this desktop/company.
- **Use when:** Turning sync on for active cloud operation, or turning off to run local-only.
- **Best for:** Normal production operation control.
- **Avoid when:** You only need a one-time retry; use `Sync Now` first.

### `Sync Project ID`
- **What it does:** Identifies which Supabase project to use.
- **Use when:** Initial setup or switching to another project.
- **Best for:** Multi-project setups and first-time onboarding.

### `Sync Company ID`
- **What it does:** Scopes data to a specific remote company tenant.
- **Use when:** Initial setup. Use `Generate` if creating a new company scope.
- **Best for:** Data isolation and correct tenant routing.

### `Sync Auth Token`
- **What it does:** Authenticates sync API calls.
- **Use when:** Initial setup, token rotation, or fixing auth failures.
- **Best for:** Production reliability and secure RPC access.

### `Sync Now`
- **What it does:** Runs one immediate sync cycle (push outbox + pull cloud changes).
- **Use when:** You need immediate consistency, or after fixing setup/network issues.
- **Best for:** Day-to-day recovery and “why is this not visible yet?” moments.

### `Repair Queue`
- **What it does:** Clears blocked sync items (`failed`/stale `processing`) and then runs sync.
- **Use when:** Sync status shows failures or queue looks stuck.
- **Best for:** Fast self-healing without destructive operations.

### `Status` Card
- **What it shows:** `Health`, enrollment, failed count, last push/pull, last error.
- **Use when:** Quick health check before deeper diagnosis.
- **Best for:** First-line triage in production.

---

## Advanced Diagnostics (Troubleshooting / Support)

These are not needed for normal daily use. Use only when investigating issues.

### `Refresh Sync Status`
- Refreshes current status from local sync state and outbox.
- Use after any manual recovery action.

### `Preflight Check`
- Runs bootstrap safety checks (local balance and remote preconditions).
- Best before bootstrap or major migration/reseed.

### `Compare Local vs Cloud Snapshot`
- Runs reconciliation and reports count/amount mismatches.
- Best when users report missing, extra, or stale records.

### `Export Diagnostics`
- Exports a machine-readable diagnostics JSON.
- Best for support tickets and incident investigation.

### `Initialize Remote (Admin)`
- Applies/validates remote schema with admin token.
- Best for first-time project setup or schema drift recovery.

### `Bootstrap To Cloud`
- Uploads local baseline to remote (initial seeding path).
- Best only when remote is empty for that company.

### `Flush Sync Now`
- Forces outbox processing pass.
- Best when queue exists but timed worker is delayed.

### `Re-pull All`
- Resets pull cursor and re-downloads remote changes.
- Best when local seems out-of-date despite successful pushes.

### `Clear Remote Data`
- Destructive remote wipe for selected company scope.
- Protected by typed confirmation + token re-entry.
- Best only for controlled reset/reseed workflows.

### Advanced “Perfect For” Matrix

| Option | Perfect Situation |
|---|---|
| `Refresh Sync Status` | Re-checking state after a recovery action. |
| `Preflight Check` | Validating prerequisites before bootstrap/reseed. |
| `Compare Local vs Cloud Snapshot` | Investigating mismatch/drift incidents. |
| `Export Diagnostics` | Sending complete debug evidence to support/dev. |
| `Initialize Remote (Admin)` | Fixing missing remote schema/functions. |
| `Bootstrap To Cloud` | First-time upload when remote is empty. |
| `Flush Sync Now` | Forcing outbox send during troubleshooting. |
| `Re-pull All` | Rehydrating local from remote when local looks stale. |
| `Clear Remote Data` | Controlled destructive reset before clean reseed. |

---

## Scenarios: Which Option Is Perfect For What?

### Scenario A: “I just need data to appear now”
- Use: `Sync Now`
- If still failing: `Repair Queue`, then `Sync Now`

### Scenario B: “Sync shows failures in status”
- Use: `Repair Queue`
- Then verify with `Status` card
- If still failing: `Export Diagnostics`

### Scenario C: “Local and cloud don’t match”
- Use: `Compare Local vs Cloud Snapshot`
- Then inspect details and run `Re-pull All` (if pull-side drift suspected)

### Scenario D: “New project setup”
- Configure Project ID, Company ID, Auth Token
- `Save`
- If schema missing: `Initialize Remote (Admin)`
- If remote is empty and local has data: `Bootstrap To Cloud`

### Scenario E: “Remote should be reset from scratch”
- Use `Clear Remote Data` only in controlled maintenance window
- Re-seed with `Bootstrap To Cloud`
- Verify with `Compare Local vs Cloud Snapshot`

---

## Production Guardrails

- Keep `Sync Now` and `Repair Queue` as operator-first controls.
- Keep destructive actions in Advanced only.
- Always back up local DB before bootstrap or remote reset.
- Treat local desktop DB as source of truth for desktop-originated operations.
- Prefer non-destructive recovery first: `Sync Now` -> `Repair Queue` -> diagnostics.

---

## What Was Intentionally Simplified

- `Pause Sync` / `Resume Sync` are removed from visible controls to avoid overlap with `Enable Cloud Sync`.
- Queue internals (`queued`, `processing`, `sent`) are not primary UX signals; they remain diagnostic detail.
