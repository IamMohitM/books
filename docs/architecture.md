# Architecture: Select Database Folder On New Company

## Overview
Extend the setup wizard UI to capture an optional database folder and pass it to the main process when creating the default database path.

## Components
- **Setup Wizard UI** (`src/pages/SetupWizard/SetupWizard.vue` + `schemas/app/SetupWizard.json`)
  - Add `dbFolder` (read-only text) and `selectDbFolder` (button) fields.
  - Handle button click to open a folder picker dialog and write the selected path to `dbFolder`.
  - Make `email` and `bankName` optional fields.
  - Default country to India and currency to INR via schema defaults.

- **Renderer Utilities** (`src/utils/ui.ts`)
  - Add `getSelectedFolderPath()` helper using an open-directory dialog.

- **IPC API** (`main/preload.ts`, `main/registerIpcMainActionListeners.ts`)
  - Extend `ipc.getDbDefaultPath(companyName, dbFolder?)` to accept an optional folder path.
  - In main process, use the provided folder as the database directory; otherwise keep existing default path logic.

- **Setup Completion** (`src/App.vue`)
  - Pass the optional `dbFolder` from setup wizard options into `ipc.getDbDefaultPath`.
- **Setup Initialization** (`src/setup/setupInstance.ts`)
  - Default `bankName` when missing and allow empty `email`.

## Data Flow
1. User clicks **Choose Folder** in Setup Wizard.
2. Renderer opens directory picker and stores selected path in `dbFolder` field.
3. On submit, `setupComplete` receives `dbFolder` and requests a default DB path from main process.
4. Main process builds file path inside selected folder (or defaults if none).

## Compatibility
- Default path behavior remains unchanged when no folder is selected.
- Existing overwrite/new file handling remains in place.

# Mobile Collaboration Architecture

## Overview
Introduce a hosted backend (Supabase Postgres + Auth + RLS) with an iOS mobile client built on Expo/React Native. Desktop remains local for now, with a one-time data migration into the hosted database.

## Components
- `supabase/schema.sql` defines companies, users, accounts, journal entries, and reporting views.
- `supabase/policies.sql` enforces row-level security by company membership.
- `supabase/functions/invite-user` edge function handles owner-only collaborator invites by email and user creation.
- `supabase/migrate_sqlite_to_supabase.py` performs one-time migration from local SQLite.
- `mobile/` contains the iOS app for authentication, quick add, ledger, and reports.

## Data Flow
- User signs in via Supabase Auth.
- App loads `company_users` to resolve the active company.
- Transactions list reads from `journal_entries_with_user` view.
- Quick add writes via `create_journal_entry` RPC.
- Ledger and report screens read from `ledger_entries` and `account_balances` views.

## Testing Strategy
- Unit/integration tests live in `mobile/__tests__` using Jest + `@testing-library/react-native`.
- Supabase is mocked for list and RPC flows.
- Coverage focuses on transaction list, details modal, and Quick Add validations.

## Security
- RLS ensures company data is only accessible to members.
- `created_by` tracks who added each entry.
- Collaborators are added to `company_users` with role `editor`.
- Profiles can be read by users who share a company for collaborator listing.

## Migration Strategy
- One-time export from SQLite.
- Import accounts, journal entries, and journal entry lines into Supabase.
- Validate counts and balances post-import.
