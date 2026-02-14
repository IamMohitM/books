# Requirements

## Context
User needs improvements in Chart of Accounts import/export and editing capabilities for Accounts.

## Goals
- Allow optional export of account descriptions in the Chart of Accounts export that is compatible with Import Wizard.
- Ensure account descriptions are available in Import Wizard (column assignment and values grid), but not shown in Chart of Accounts list.
- Allow editing of account names.
- Allow moving accounts between groups as long as the account remains within the same root category (rootType).
- Ignore current group import error for now.

## Acceptance Criteria
- Export flow prompts for including description; if excluded, CSV has no description column. If included, description column is present with values.
- Import Wizard shows Description field in column assignment (step 2) and data grid (step 3) when provided in data/template.
- Chart of Accounts list does not display description.
- Account name can be edited and persists correctly.
- Changing parent group is allowed only when the parent account has the same rootType as the account.

## Non-Goals
- Fixing the group import error at this time.
