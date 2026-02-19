# Requirements: Select Database Folder On New Company

## Overview
Allow users to choose the folder where the new company database file is created during the new company setup flow.

## Target Users
- Users creating a new company who want control over where the database file is stored.

## User Stories

### Choose Database Folder During Setup
**As a** user creating a new company
**I want** to pick a folder to store the new database
**So that** I can manage where my data files live

**Acceptance Criteria:**
- [ ] The setup flow provides a way to choose a folder for the database location.
- [ ] If a folder is selected, the database file is created inside that folder.
- [ ] If no folder is selected, the existing default location behavior is preserved.
- [ ] Existing filename conflict behavior (overwrite/new) still applies.

**Priority:** Must-have

### Optional Email And Bank Name
**As a** user creating a new company
**I want** email and bank name to be optional
**So that** I can complete setup without those details

**Acceptance Criteria:**
- [ ] Email is optional in the setup wizard and does not block submission.
- [ ] Bank name is optional in the setup wizard and does not block submission.
- [ ] If bank name is missing, a default bank account is created.

**Priority:** Must-have

### Default India And INR
**As a** user creating a new company
**I want** India and INR to be preselected
**So that** I can complete setup faster for the default locale

**Acceptance Criteria:**
- [ ] Country defaults to India in the setup wizard.
- [ ] Currency defaults to INR in the setup wizard.
- [ ] Changing country still updates currency as before.

**Priority:** Must-have

## MVP Scope
- Add a folder selection control to the setup wizard.
- Use the selected folder when generating the database file path.
- Allow setup to proceed without email or bank name.
- Default country to India and currency to INR.

## Future Enhancements
- Remember last selected folder for future setups.
- Validate folder permissions before submitting.
- Prompt for email/bank name later in onboarding.

## Success Criteria
- Users can reliably select a folder and see the database created there.
- No regression for users who leave the folder unselected.
- Users can complete setup without providing email or bank name.
- India/INR are preselected by default in the setup wizard.

## Constraints
- Must work in Electron environment.
- Should not break existing setup wizard validation.
