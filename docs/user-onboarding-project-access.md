# User Onboarding and Project Access Guide (Current Implementation)

This guide explains how to onboard users to one or more company projects using the current desktop + mobile implementation.

## Core model

- One Supabase project = one company ledger.
- Access is controlled per company via `company_users` (role: `owner` or `editor`).
- Mobile users sign into a specific project profile (project ref + anon key).
- Desktop manages sync and collaborator invitations for the active project/company.

## Before onboarding users

For each company/project, confirm in desktop `Settings -> Cloud Sync`:

1. `Project ID` is correct.
2. `Company ID` is correct.
3. `Auth Token` is correct.
4. Click `Save`.
5. If this is a new/empty remote, run `Initialize Remote (Admin)` once.

## Recommended onboarding flow (works without web redirect URL)

Use this when you do not have a public web callback URL.

### Step 1: User signs up in mobile first

1. User opens the mobile app.
2. User selects/adds the correct project profile (project ref + publishable/anon key).
3. User enters email + password and taps `Sign Up`.

Notes:
- If email confirmation is enabled in Supabase, user must confirm email.
- If emails are not being delivered in dev, temporarily disable confirm-email in Supabase Auth settings.

### Step 2: Admin invites user from desktop

1. Open desktop app for the same company.
2. Go to `Settings -> Cloud Sync -> Collaborators`.
3. Enter user email, choose role, click `Invite Collaborator`.

Result:
- User is added to that company’s access list.
- User can now sign in on mobile and access synced data for that project.

## Existing user vs new user behavior

- Existing user in that Supabase project:
  - Invite should add membership directly.
- New user not yet present in Auth:
  - Edge function can send invite email, but link redirect depends on Supabase Auth URL config.
  - If redirect is not configured, prefer the signup-first flow above.

## Multi-project access for the same person

If one person should access multiple companies:

1. Repeat onboarding for each company’s Supabase project.
2. On mobile, add each project profile once.
3. User signs in to the selected profile and sees that project’s data.

There is no central global directory across projects; each project controls its own users.

## Roles

- `Owner`: full company access and can invite others.
- `Editor`: operational access without ownership permissions.

## Troubleshooting

### "User not found for email ..."

Cause:
- Email does not yet exist in that Supabase project’s Auth users.

Fix:
1. Have user sign up once in mobile for that project.
2. Invite again from desktop.

### Invite magic link opens `localhost:3000`

Cause:
- Supabase Auth redirect/site URL still points to localhost.

Fix options:
1. Preferred now: use signup-first flow and avoid relying on invite magic link.
2. Or configure proper `Site URL` and `Redirect URLs` in Supabase Auth.

### "Remote schema not initialized"

Fix:
1. Desktop `Settings -> Cloud Sync`.
2. Click `Initialize Remote (Admin)`.
3. Retry `Sync Now`.

### Sync shows enrollment active but no data on mobile

Check:
1. Same project profile on mobile as desktop sync project.
2. Same `Company ID`.
3. `Sync Now` succeeds on desktop and no pending errors.
4. Re-open mobile and refresh.

## Production checklist per project

1. Remote schema initialized.
2. Desktop sync settings saved and validated.
3. At least one owner collaborator exists.
4. SMTP/email configured in Supabase if email confirmation is required.
5. Mobile users onboarded with project profile + company access invite.

