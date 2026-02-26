# Mobile vs Desktop Diff: Journal Entry Account Creation

## Scope
Compare `mobile` branch journal-entry account creation flow with desktop/web (`loan` working tree).

## Mobile (`mobile` branch)
- Account creation is explicit in quick add UI:
  - `mobile/src/components/QuickAddModal.tsx`
  - User types account name, chooses parent group, then taps `Create`.
  - New account insert includes `parent_account`, `root_type`, and `account_type` inherited from parent.
- Journal entry RPC validates line balance and posting constraints:
  - `supabase/migrations/20260222000100_update_create_journal_entry.sql`

## Desktop/Web (`loan` working tree)
- Inline create is enabled from JE account field dropdown (`Create` option) via link control.
- JE account creation now pre-fills safe defaults using model `createFilters`:
  - `schemas/app/JournalEntryAccount.json` (`account.create = true`)
  - `models/baseModels/JournalEntryAccount/JournalEntryAccount.ts`
  - Defaults include `rootType`, `parentAccount`, `isGroup: false`.

## Behavioral Parity Status
- ✅ Both flows allow creating accounts while entering journal entries.
- ✅ Both flows ensure account is attached to chart hierarchy via parent assignment.
- ⚠️ UX differs:
  - Mobile asks user to explicitly pick parent.
  - Desktop uses debit/credit-based defaults + fallback parent selection.

## Dropdown UX Fix Applied (Desktop)
- Fixed blur behavior to close dropdown and preserve typed text instead of auto-selecting first match.
- Fixed typing/deleting race where link display resolution could overwrite in-progress edits.

