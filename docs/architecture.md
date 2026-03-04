# Architecture: Cash in Hand Reconciliation Refactoring

## Overview

The Cash in Hand system currently calculates monthly accounting data (opening/closing balances, debits/credits). The refactoring introduces a **Physical Count Reconciliation** feature that enables users to:

1. Record physical cash counts for a period
2. Compare expected balance (from accounting) vs actual physical count
3. Calculate variance
4. Record adjustments via a selectable "Cash Over and Short" account

This follows the standard accounting reconciliation pattern: Expected (Ledger) vs Actual (Physical Count).

## Technology Stack

- **Vue 3 (TypeScript)** - Component framework
- **SQLite/Knex.js** - Database layer
- **IPC (Electron)** - Client-server communication

## Compatibility
- Default path behavior remains unchanged when no folder is selected.
- Existing overwrite/new file handling remains in place.

## Data Model

### CashCountRecord Schema
```
{
  name: string (auto-generated)
  period: string
  periodStart: date
  periodEnd: date
  expectedBalance: number (read-only, from accounting)
  physicalCount: number (user input)
  variance: number (expectedBalance - physicalCount)
  varianceAccount: string (Link to Account)
  journalEntryName: string (Link to JournalEntry)
  status: string (Draft, Reconciled)
  notes: string (optional)
  createdDate: date
  submittedDate: date
}
```

### Query Result: CashReconciliationRow
```
{
  period: string
  periodStart: string
  periodEnd: string
  expectedBalance: number
  physicalCount: number | null
  variance: number | null
  reconciliationStatus: "pending" | "reconciled" | "none"
  recordName: string | null
}
```

## API Design

### Backend Query: getCashReconciliationSummary
- **Input**: fromDate, toDate (ISO strings)
- **Output**: CashReconciliationRow[]
- **Logic**: Join expected balance (from accounting) with actual (from CashCountRecord)

### Components
1. **CashInHand.vue** - Daily cash balance widget with date picker
2. **CashInHandSummary.vue** - Monthly cash flow (Opening | Debits | Credits | Closing)

## Key Decisions

1. **Simplified Cash Tracking**: Monthly cash flow calculation (Opening + Debits - Credits = Closing)
2. **Daily Balance Widget**: Separate component showing current cash as of selected date
3. **Reconciliation Infrastructure**: Backend support available for future physical count features
4. **Database**: SQLite for desktop, Supabase Postgres for mobile collaboration

## Files Created/Modified

### New Components
- `src/pages/Dashboard/CashInHand.vue` - Daily cash balance widget
- `src/pages/Dashboard/CashInHandSummary.vue` - Monthly cash flow summary

### Backend Infrastructure
- `backend/database/bespoke.ts` - getCashInHandSummary() and getCashReconciliationSummary()
- `fyo/core/dbHandler.ts` - Client wrappers for cash queries
- `utils/db/types.ts` - CashInHandSummaryRow and CashReconciliationRow types
- `models/index.ts` - CashCountRecord model registration
- `models/types.ts` - CashCountRecord in ModelNameEnum
- `schemas/schemas.ts` - CashCountRecord schema registration

### Updated Components
- `src/pages/Dashboard/Dashboard.vue` - Integrated CashInHand widget

# Mobile Collaboration Architecture

## Overview
Introduce a hosted backend (Supabase Postgres + Auth + RLS) with an iOS mobile client built on Expo/React Native. Desktop remains local for now, with a one-time data migration into the hosted database.

## Components
- `supabase/schema.sql` defines companies, users, accounts, journal entries, and reporting views.
- `supabase/policies.sql` enforces row-level security by company membership.
- `supabase/functions/invite-user` edge function handles owner-only collaborator invites by email and user creation.
- `supabase/migrate_sqlite_to_supabase.py` performs one-time migration from local SQLite.
- `mobile/` contains the iOS app for authentication, quick add, ledger, and reports.

## Data Flow
- User signs in via Supabase Auth.
- App loads `company_users` to resolve the active company.
- Transactions list reads from `journal_entries_with_user` view.
- Quick add writes via `create_journal_entry` RPC.
- Ledger and report screens read from `ledger_entries` and `account_balances` views.

## Testing Strategy
- Unit/integration tests live in `mobile/__tests__` using Jest + `@testing-library/react-native`.
- Supabase is mocked for list and RPC flows.
- Coverage focuses on transaction list, details modal, and Quick Add validations.

## Security
- RLS ensures company data is only accessible to members.
- `created_by` tracks who added each entry.
- Collaborators are added to `company_users` with role `editor`.
- Profiles can be read by users who share a company for collaborator listing.

## Migration Strategy
- One-time export from SQLite.
- Import accounts, journal entries, and journal entry lines into Supabase.
- Validate counts and balances post-import.
