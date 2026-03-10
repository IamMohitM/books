# Sync Setup: Where to Get Project ID, Company ID, and Token

Use this guide when setting up cloud sync from desktop to Supabase.

## Required desktop sync fields

In desktop `Settings -> Cloud Sync`, fill:

1. `Sync Project ID`
2. `Sync Company ID`
3. `Sync Access Key`

## 1) Sync Project ID

Where:
- Supabase Dashboard -> `Settings` -> `General` -> `Reference ID`

What to paste:
- The project reference string (example: `abcdxyz123...`)
- You can also derive URL from it as `https://<project-ref>.supabase.co`

## 2) Sync Company ID

What it is:
- UUID that identifies one company ledger inside that Supabase project.

How to set:
- Preferred: click `Generate` next to Company ID in desktop Cloud Sync settings.
- Or use existing `public.companies.id` from remote if you are reconnecting to an existing company.

Important:
- Desktop and mobile must use data tied to the same company.

## 3) Sync Access Key

Where:
- Generate it in Desktop `Settings -> Cloud Sync` using the `Generate` button.
- The desktop uses `service_role` **only** during generation, then switches to the Sync Access Key.

Do not use for mobile:
- Mobile must use only publishable/anon key.

## Mobile setup (separate from desktop token)

Mobile project profile requires:

1. `Project Ref`
2. `Publishable/anon key`

Do not put `service_role` in mobile app.

## Quick verification checklist

1. Save sync settings in desktop.
2. Click `Sync Now`.
3. Confirm no persistent error in `Cloud Sync Status`.
4. Open mobile with same project profile.
5. Ensure mobile user is invited to company (exists in `company_users`).

## Common mistakes

1. Using anon/publishable key as desktop `Sync Access Key`.
2. Using wrong `Sync Company ID`.
3. Using different project on mobile vs desktop.
4. User signed up but not invited (no row in `company_users`).
