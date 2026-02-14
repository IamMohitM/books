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
