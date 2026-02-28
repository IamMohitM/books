# Cloud Sync Verification Playbook (Desktop + Mobile)

Use this checklist after reset to verify end-to-end behavior.

## Preconditions

- Desktop sync project is configured with:
  - `Sync Project ID`
  - `Sync Company ID`
  - `Sync Auth Token` (`service_role`)
- Mobile uses:
  - same `project ref`
  - **legacy anon key** (not service_role)

## Step 0: Clean start

1. Mobile: tap `Reset Saved Profiles`.
2. Supabase (already done in this run): users and company access reset.

Expected:
- Mobile shows default profile only.
- No stale collaborator access remains.

## Step 1: Validate project profile input guard

1. Mobile: enter random project ref + random key, tap `Add Project Profile`.

Expected:
- Add fails with validation error.
- Profile is **not** added.

2. Mobile: enter correct project ref + correct anon key.

Expected:
- `Project added` success alert.
- Profile chip appears.

## Step 2: Create owner user

1. Mobile: select correct project profile.
2. Sign up owner email/password.

Expected:
- Either `Signed up` or `Check your email for confirmation`.
- If email confirmation is enabled, confirm first.

## Step 3: Owner sign-in and access

1. Mobile: sign in as owner.

Expected:
- Authentication succeeds.
- If no company membership yet, app shows `No company assigned`.

2. Add owner to `company_users` (owner role), then tap `Refresh Access`.

Expected:
- Owner can load company data.

## Step 4: Invite collaborator from desktop

1. Desktop: `Settings -> Cloud Sync -> Collaborators`.
2. Invite collaborator email as `editor` (or `owner`).

Expected:
- `Collaborator invited`.
- Row appears in collaborators list.

## Step 5: Collaborator sign-up/sign-in and access

1. Mobile: collaborator signs up (if new user) or signs in (if existing).
2. Tap `Refresh Access` if needed.

Expected:
- Collaborator sees same company data.
- No `No company assigned` after membership is active.

## Step 6: Multi-project correctness

1. Add/select a different project profile on mobile.

Expected:
- App context changes to selected project.
- Data does not leak across projects.

## Expected failure messages (and meaning)

- `Invalid API key`:
  - wrong key/project pairing; use legacy anon key for that project.
- `No company assigned`:
  - user is authenticated but missing company membership in `company_users`.
- `Access refresh failed: ...`:
  - query error shown explicitly; use it for diagnosis.

