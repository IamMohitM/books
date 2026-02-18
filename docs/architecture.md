# Architecture: Loan Profile Duplication and Credit Column

## Overview
This change set extends the Loan Profile data model and reporting logic to support pre-system principal credits, and customizes Loan Profile duplication behavior to clear account fields so new accounts are auto-created on save.

## Technology Stack

### Core Technologies
- **Language:** TypeScript - existing project language
- **Framework:** Vue - existing UI framework
- **Database:** Existing DB layer via FYO schemas and bespoke queries

### Supporting Tools
- **FYO Doc model:** Used for duplication and lifecycle hooks
- **Reports:** LoanLedger and LoanRegister use bespoke queries and computed rows

## System Components

### Component: LoanProfile Model
**Purpose:** Domain model for loan profiles
**Responsibilities:**
- Ensure loan accounts exist before sync
- Provide duplication behavior

**Interfaces:**
- Input: LoanProfile fields
- Output: Validated/synced loan profile doc

### Component: LoanProfileHistoricalPayment
**Purpose:** Store pre-system payment rows
**Responsibilities:**
- Persist date, type, amount, and new credit field

### Component: LoanLedger Report
**Purpose:** Render loan ledger including pre-system rows
**Responsibilities:**
- Incorporate pre-system payments and credits into ledger rows

### Component: Bespoke Queries
**Purpose:** Compute loan snapshots and historical totals
**Responsibilities:**
- Aggregate pre-system principal paid and credited amounts

## Data Models

### LoanProfileHistoricalPayment
```
- date: Date
- paymentType: Select (Principal | Interest)
- amount: Currency
- credit: Currency (new; principal credit)
```

### LoanSnapshot (computed)
```
- preSystemInterestPaid: number
- preSystemPrincipalPaid: number
- preSystemPrincipalCredited: number (new)
- principalOutstanding: number
```

**Data Flow:**
- Pre-system payment rows are read from LoanProfileHistoricalPayment.
- Amounts are aggregated into totals; credits increase principal outstanding.
- Loan Ledger includes pre-system rows with debit/credit values.

## API Design
- No new API endpoints; uses existing doc sync and bespoke query pathways.

## Scalability Considerations
- Changes are bounded to per-loan computations; no new heavy queries.

## Security Considerations
- No new security surface area.

## Development Approach

**Project Structure:**
```
project/
├── models/baseModels/LoanProfile/LoanProfile.ts
├── schemas/app/LoanProfileHistoricalPayment.json
├── reports/LoanLedger/LoanLedger.ts
├── backend/database/bespoke.ts
├── utils/db/types.ts
└── docs/
```

**Testing Strategy:**
- Manual verification of duplication behavior
- Manual verification of pre-system credit display and snapshot
