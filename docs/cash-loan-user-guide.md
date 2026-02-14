# Cash and Loan Tracking Guide

## Goal
Use Frappe Books as a cash-first ledger with clear loan principal and interest tracking.

## Setup
1. Go to `Common -> Loan Profiles`.
2. Create one `Loan Profile` per lender.
3. Fill:
- `Lender Name`
- `Start Date`
- `Annual Interest Rate (%)`
- Optional opening balances: `Opening Principal`, `Opening Accrued Interest`
4. Liability and Interest Expense accounts are created automatically.
5. If you want to override them, select different accounts in the profile.

## Recording Transactions
Use `Common -> Journal Entry`.
In each loan row, select:
- `Loan Account`
- `Loan Component` (`Principal` or `Interest`)
The `Account` field is auto-set based on the loan component.

Rules:
- `Principal` rows post to the loan’s liability account.
- `Interest` rows post to the loan’s interest expense account.
- Loan rows in one Journal Entry must use one loan profile.

## Borrowing Example
- Debit `Cash`
- Credit `Lender Liability Account`
- On the liability row:
  - `Loan Profile = L-001`
  - `Loan Component = Principal`

## Repayment Example (split principal + interest)
- Debit `Lender Liability Account` (principal repayment)
- Debit `Interest Expense Account` (interest payment)
- Credit `Cash`
- Tag principal and interest rows with same `Loan Profile`, respective `Loan Component`.

## Monitoring
1. Open `Reports -> Loan Register` for summary totals by loan account.
2. Open `Reports -> Loan Ledger` to see each loan transaction and interest owed.

## Interest Method
Phase 1 uses simple daily accrual:

`interest = principal * annual_rate * days / 365`

No compounding in phase 1. The day the principal is received does not accrue interest; accrual starts the next day.

## Reconciling Opening Principal in the General Ledger
If you already have an Opening Principal and want it to appear in the General Ledger:
1. Open the Loan Profile.
2. Use `Actions -> Record Opening Principal`.
3. Select the cash/bank account and save the Opening Entry.

This creates an Opening Entry and resets `Opening Principal` to 0 so Loan Register stays accurate.
