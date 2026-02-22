# Loan Tracking Enhancements Architecture

## Summary
Loan tracking stays as metadata on Journal Entries and Accounting Ledger Entries. Enhancements add a DB patch for missing columns, auto account creation on Loan Profiles, and a Loan Ledger report with running balances.

## Data Model
- `LoanProfile` remains the lender setup.
- `JournalEntryAccount` tags loan rows with `loanProfile` and `loanComponent`.
- `AccountingLedgerEntry` stores `loanProfile` and `loanComponent` for reporting.

## DB Patch
- Add `loanProfile` and `loanComponent` columns to `AccountingLedgerEntry` if missing.
- Patch is idempotent and safe for existing databases.

## Account Automation
- `LoanProfile.beforeSync` creates missing accounts.
- Liability account: root type `Liability`, account type `Payable`.
- Interest account: root type `Expense`, account type `Expense Account`.
- Parent account chosen from existing group accounts by preference or fallback.

## Journal Entry Mapping
- Loan rows auto map `account` from the selected Loan Profile and Component.
- `Account` field is read-only for loan rows to avoid mismatches.

## Reporting
- `LoanRegister` shows liability account and summary snapshot.
- `LoanLedger` shows running principal and interest owed with an as-of date.
- Interest accrual uses ACT/365 simple daily accrual.
 - Accrual excludes the receipt day; it starts from the next day after principal events.

## Journal Entry Remarks Update
- `JournalEntry.userRemark` should be editable even when the entry is submitted.
- Implement by keeping submission guardrails while allowing `userRemark` as an exception.
- Update Journal Entry list view columns to include `userRemark` adjacent to `referenceNumber`.

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

## Security
- RLS ensures company data is only accessible to members.
- `created_by` tracks who added each entry.
- Collaborators are added to `company_users` with role `editor`.
- Profiles can be read by users who share a company for collaborator listing.

## Migration Strategy
- One-time export from SQLite.
- Import accounts, journal entries, and journal entry lines into Supabase.
- Validate counts and balances post-import.
