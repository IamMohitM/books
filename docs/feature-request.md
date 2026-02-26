# Feature Request: Inline Account Creation in Journal Entry

## Goal
Allow users to create missing `Account` records directly while entering a `Journal Entry` row, without leaving the form.

## Why
- Mobile branch already supports on-the-fly account creation.
- Desktop/web should match this behavior to avoid workflow divergence.
- Account creation must place the account inside the chart of accounts tree so accounting validation does not fail.

## Acceptance Criteria
- The `account` field in `JournalEntryAccount` shows an inline `Create` option.
- Creating from journal entry opens account quick edit prefilled with valid COA defaults.
- New account creation does not require navigating to Chart of Accounts.
- Default parent account and root type are selected with fallback logic to avoid validation errors.
- Existing loan-profile behavior for `JournalEntryAccount.account` remains unchanged.
