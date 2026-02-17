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
