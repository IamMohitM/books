# Loan Migration Playbook

## Purpose

Move from manual account-only loan tracking to `LoanProfile + loan-tagged Journal Entry rows`.

## Strategy

Use opening snapshots, then track forward.

## Steps

1. For each existing lender, create one `LoanProfile`.
2. Set:

- `openingPrincipal` = current principal outstanding as of migration date.
- `openingAccruedInterest` = unpaid accrued interest as of migration date.

3. Set `startDate` to migration baseline date.
4. For all new loan transactions, use Journal Entry row tags:

- `loanProfile`
- `loanComponent`

## Verification Checklist

1. `Loan Register` principal matches previous manual ledger total.
2. Opening owed interest matches previous manual calculation.
3. First repayment after migration correctly reduces principal and/or owed interest.
4. General Ledger remains balanced and unchanged in accounting integrity.
