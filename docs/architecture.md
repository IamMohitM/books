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
