# Loan Tracking Architecture

## Core Principle

Loan tracking is an overlay on top of existing double-entry posting.  
`JournalEntry` remains the source transaction. `AccountingLedgerEntry` remains report source.

## Added Data Model

### Loan Profile

- Schema: `LoanProfile`
- Purpose: store lender, accounts, rate, and opening balances.
- Auto-creates liability and interest expense accounts when missing.

### Journal Metadata

Added to `JournalEntryAccount`:

- `loanProfile`
- `loanComponent` (`Principal`, `Interest`, `None`)

### Ledger Metadata

Added to `AccountingLedgerEntry`:

- `loanProfile`
- `loanComponent`

`LedgerPosting` now accepts optional metadata per debit/credit line and writes it into ledger rows.

## Validation Invariants

In `JournalEntry`:

1. One journal entry can reference only one loan profile for loan-tagged rows.
2. Loan profile must be active.
3. `Principal` rows must use profile `liabilityAccount`.
4. `Interest` rows must use profile `interestExpenseAccount`.
5. Loan-tagged rows cannot keep component as `None`.

In `JournalEntryAccount`:

1. Selecting a Loan Profile + Component auto-maps the `Account`.
2. Loan rows lock the `Account` field to avoid mismatch.

## Query Layer

Bespoke DB methods:

- `getLoanLedger(loanProfile, fromDate?, toDate?)`
- `getLoanSnapshot(loanProfile, asOfDate)`
- `getLoanPortfolioSnapshot(asOfDate)`

## Snapshot Formula

### Principal Outstanding

`openingPrincipal + sum(principal_credits - principal_debits)`

### Interest Paid

`sum(interest_debits - interest_credits)`

### Accrued Interest

ACT/365 simple daily, non-compounding, based on principal timeline:
`principal * rate * days / 365`

### Interest Owed

`openingAccruedInterest + accruedInterest - interestPaid`

### Total Due

`principalOutstanding + interestOwed`

## Presentation Layer

- Report: `LoanRegister`
- Report: `LoanLedger`
- Dashboard card: `LoanSummary`

## UI Focus Changes

Hidden from primary navigation/search/import:

- Sales
- Purchases
- Tax templates
- Party
- Items

Internals are not removed; only surfaced UI paths are reduced.
