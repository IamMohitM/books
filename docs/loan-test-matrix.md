# Loan Test Matrix

## Unit

1. `LoanProfile` rejects negative interest rate.
2. `LoanProfile` rejects non-liability liability account.
3. `LoanProfile` rejects non-expense interest account.
4. `JournalEntry` rejects mixed loan profiles in one entry.
5. `JournalEntry` rejects principal row with wrong account.
6. `JournalEntry` rejects interest row with wrong account.
7. `LoanProfile` auto-creates liability and interest accounts when missing.
8. `JournalEntryAccount` auto-maps account for loan rows.

## Integration

1. Borrow principal only:

- principal outstanding increases
- interest paid remains zero

2. Repay with principal + interest split:

- principal outstanding decreases by principal part
- interest paid increases by interest part

3. Backdated principal adjustment:

- accrued interest recalculates from chronological timeline

4. Cancel tagged journal:

- snapshot excludes reverted effect

## Reporting

1. `LoanRegister` with one loan shows exact snapshot values.
2. `LoanRegister` without loan filter shows portfolio totals.
3. Currency formatting and totals row render correctly.
4. `LoanLedger` shows running principal and interest owed.

## Dashboard

1. `LoanSummary` renders totals when loans exist.
2. `LoanSummary` shows empty state when none exist.
