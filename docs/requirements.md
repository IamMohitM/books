# Requirements: Loan Profile Duplication and Credit Column

## Overview
Improve Loan Profile duplication behavior and add a credit column for tracking additional principal within the Pre-system Payments table.

## Target Users
- Accounting/finance users managing loan profiles and related payments.

## User Stories

### 1) Duplicate Loan Profile resets account fields
**As a** finance user
**I want** duplicated loan profiles to clear loan and interest account fields
**So that** new accounts are created unless I explicitly select existing ones

**Acceptance Criteria:**
- [ ] Using Cmd+D to duplicate a loan profile clears Loan Account and Interest Account fields.
- [ ] If those fields remain blank on save, the system auto-creates new Loan Account and Interest Account.
- [ ] If the user explicitly selects existing accounts, the duplicate may use those accounts as-is.
- [ ] Existing loan profile data (other than the account fields) is duplicated as it is today.

**Priority:** Must-have

### 2) Credit column in Pre-system Payments
**As a** finance user
**I want** a Credit column in the Pre-system Payments table
**So that** I can record additional principal added to the loan

**Acceptance Criteria:**
- [ ] Pre-system Payments table includes a new column named "Credit".
- [ ] Credit values are persisted with the loan profile.
- [ ] Existing data continues to display correctly (no data loss).

**Priority:** Must-have

## MVP Scope
- Update duplication behavior for Loan Profile with account field clearing and auto-creation on blank.
- Add Credit column to Pre-system Payments and persist it.

## Future Enhancements
- None identified.

## Success Criteria
- Duplicated loan profiles consistently clear account fields and auto-create on save if blank.
- Users can enter and store credit amounts in Pre-system Payments.

## Constraints
- Duplication is triggered via Cmd+D in the Loan Profile UI.
