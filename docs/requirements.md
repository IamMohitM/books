# Loan Tracking Enhancements Requirements

## Goal
Make loan tracking easier by showing user friendly loan account names, auto creating required accounts, and providing a loan ledger with interest owed.

## In Scope
- Fix Loan Register "Database error" when loan columns are missing in existing databases.
- Show liability account name instead of loan ID in Loan Register.
- Auto create liability and interest expense accounts when creating a Loan Profile.
- Auto map loan rows in Journal Entry: user selects Loan Account + Component, account is set automatically.
- Add Loan Ledger report with running principal and interest owed.

## Out of Scope
- Sales and Purchase flows.
- Tax templates.
- Party and Item specific features beyond current scope.

## Acceptance Criteria
- Loan Register opens without database errors on existing databases.
- Loan Register displays liability account name for each loan row.
- New Loan Profiles can be created without manually creating accounts.
- Journal Entry loan rows only require Loan Account + Component; account is auto set and validated.
- Loan Ledger shows transactions in chronological order and includes current interest owed as of a selected date.
