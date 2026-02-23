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

# Requirements: Mobile Collaboration And Migration

## Problem Statement
The desktop app is not accessible on mobile and collaboration requires file sharing, which is unreliable and insecure for multi-user access.

## Target Users
- Company owners and collaborators who need to add and review transactions from multiple locations.

## User Stories

### Mobile App For Collaboration
**As a** user managing cash transactions across cities
**I want** a mobile app to view and add transactions
**So that** I can collaborate with others without maintaining books myself

**Acceptance Criteria:**
- iOS users can sign in.
- Users can view journal entries.
- Users can add journal entries via a quick add flow.
- Ledger and account balance reports are viewable.
- Each entry shows who created it.

**Priority:** Must-have

### Invite Collaborators By Email
**As a** company owner
**I want** to invite collaborators by email
**So that** they can edit the shared books

**Acceptance Criteria:**
- Owner can add a collaborator by email.
- Collaborators can view and edit entries.
- Access is limited to invited users.
- Invites are initiated from the mobile app settings screen.
- Owner-only permission is enforced for invites.
- Invites send a magic link if the user does not already exist.

**Priority:** Must-have

### Preserve Existing Data
**As a** current desktop user
**I want** my existing data migrated to the hosted database
**So that** I do not lose history when using mobile

**Acceptance Criteria:**
- A one-time migration imports existing accounts and journal entries.
- Ledger totals match after migration.

**Priority:** Must-have

## MVP Scope
- iOS app with login, journal entries, quick add, ledger, reports, and collaborator invites.
- Hosted database with multi-user access and audit attribution.
- One-time migration from local SQLite.

## Future Enhancements
- Android app.
- Offline-first sync with conflict resolution.
- Role-based read-only users.

## Success Criteria
- iOS users can view and add entries securely.
- Migration preserves existing data accurately.
- Owners can invite collaborators from the mobile app.

# Requirements: Mobile Quick Add Button

## Problem Statement
Quick Add is currently a header button; it should be promoted to a central plus button for faster access.

## User Story
As a mobile user, I want quick add in a center plus button at the bottom so I can add transactions faster from any tab.

## Acceptance Criteria
- A floating plus button sits centered in the bottom navigation.
- Tapping the plus button opens Quick Add from any tab.

# Requirements: Mobile Account Search and Create

## Problem Statement
Selecting accounts on mobile is slow without search, and users need a way to add missing accounts inline.

## User Story
As a mobile user, I want to search accounts and create a missing account while adding a journal entry so I can complete entries without switching contexts.

## Acceptance Criteria
- Account selector supports search with live filtering.
- If no exact match exists, user can create a new account inline.
- Newly created account is selected after creation.
- New accounts must choose a parent group account and inherit its root type/account type.

# Requirements: Mobile Test Suite

## Problem Statement
Mobile changes are hard to validate without automated tests, slowing down QA and increasing regressions.

## User Story
As a developer, I want automated mobile tests so I can validate critical flows quickly and consistently.

## Acceptance Criteria
- Transactions list renders from Supabase data.
- Tapping a transaction opens a details view with debit/credit lines.
- Quick Add validates required fields and submits balanced entries.
