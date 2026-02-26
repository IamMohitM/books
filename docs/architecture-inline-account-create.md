# Architecture: Inline JE Account Creation

## Scope
Desktop/web journal entry account linking (`JournalEntryAccount.account`) only.

## Design
- Enable inline creation from link dropdown by setting `"create": true` on `schemas/app/JournalEntryAccount.json` field `account`.
- Provide `JournalEntryAccount.createFilters.account` so newly-created `Account` docs receive:
  - `rootType` default:
    - `Income` for credit-only rows.
    - `Expense` otherwise.
  - `parentAccount` selected from preferred group names, with fallback to first matching root-type group.
  - `isGroup: false`.

## Safety
- Ensures newly created account lands under chart-of-accounts group.
- Avoids required parent/root-type failures during account creation.
- Leaves existing JE posting logic unchanged.
