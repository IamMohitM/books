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
1. **CashReconciliationForm.vue** - Period selection, physical count entry, account selector
2. **CashInHandSummary.vue** (updated) - Add Actual and Variance columns
3. **CashInHandDetail.vue** (updated) - Show reconciliation breakdown

## Key Decisions

1. **Physical Count Storage**: New CashCountRecord schema (structured, auditable)
2. **Account Selection**: User selects at reconciliation time (flexible)
3. **Journal Entry Creation**: Automatic on submit (atomic operation)
4. **Variance Display**: Added to summary view (keeps related data together)

## Files to Create/Modify

### New Files
- `schemas/app/CashCountRecord.json` - Schema definition
- `models/baseModels/CashCountRecord.ts` - Model class
- `src/pages/Dashboard/CashReconciliationForm.vue` - Form component
- `src/pages/Dashboard/CashReconciliationSummary.vue` - Summary view

### Modified Files
- `backend/database/bespoke.ts` - Add getCashReconciliationSummary()
- `fyo/core/dbHandler.ts` - Add client wrapper
- `src/pages/Dashboard/CashInHandSummary.vue` - Add variance columns
- `src/pages/Dashboard/Dashboard.vue` - Integrate reconciliation form
- `utils/db/types.ts` - Add CashReconciliationRow type

## Acceptance Criteria

- ✅ CashCountRecord schema created with all required fields
- ✅ getCashReconciliationSummary() backend query returns expected vs actual
- ✅ CashReconciliationForm allows entering physical count and selecting account
- ✅ Summary view shows Expected | Actual | Variance columns
- ✅ Journal Entry created automatically when reconciliation submitted
- ✅ Account selector filters for appropriate accounts
- ✅ Period selection works correctly
- ✅ Variance calculated as Expected - Actual
- ✅ All tests pass without errors
