# Requirements: Loan Register Refresh

## Problem Statement
Loan Register does not reflect recent Loan Profile updates without a manual refresh (Cmd+R) in the production app.

## User Story
As a user, when I update a Loan Profile or related ledger data, the Loan Register should reflect the changes when I return to the report without requiring a manual refresh.

## Acceptance Criteria
- When a Loan Profile is updated, the Loan Register refreshes the next time the report view is activated.
- When loan-related ledger entries or historical payments change, the Loan Register refreshes the next time the report view is activated.
- No manual refresh is required to see the updates.

# Requirements: General Ledger Date Filtering

## Problem Statement
General Ledger ignores `From Date` / `To Date` filters and shows entries outside the selected range.

## User Story
As a user, when I set `From Date` and `To Date` in General Ledger, I expect only entries within that range, and the default range should be the current month to date.

## Acceptance Criteria
- General Ledger respects `From Date` and `To Date` filters for the ledger entries shown.
- Default `From Date` is the 1st of the current month.
- Default `To Date` is the current date.

# Requirements: Loan Register Sorting

## Problem Statement
Loan Register needs to support sorting by lender name in addition to existing date ordering.

## User Story
As a user, I want to sort the Loan Register by lender name so I can quickly scan accounts alphabetically.

## Acceptance Criteria
- Loan Register can be sorted by lender name.
- Sorting order supports ascending and descending.

# Requirements: Dropdown Consistency

## Problem Statement
Select dropdowns look and behave inconsistently compared to link dropdowns across multiple pages.

## User Story
As a user, dropdowns should look and behave consistently across the app so filters and selects feel uniform.

## Acceptance Criteria
- Select dropdowns use the same dropdown styling and interaction pattern as link dropdowns.

# Requirements: Loan Register and Loan Ledger Prepaid Handling

## Problem Statement
Loan Register shows pre-system (prepaid) columns, and Loan Ledger should include prepaid and journal entries without separate prepaid columns.

## User Story
As a user, I want Loan Register to fold prepaid amounts into principal and interest, and Loan Ledger to show all entries (including prepaid and journal entries) without separate prepaid columns.

## Acceptance Criteria
- Loan Register removes pre-system columns and integrates prepaid amounts into principal outstanding and interest paid.
- Loan Ledger continues to show all entries, including prepaid and journal entries.
- Loan Ledger totals reflect pre-system principal and interest payments in the final as-of summary.

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
