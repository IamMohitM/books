# Supabase Setup (Per Project)

Use this checklist for **each** Supabase project you want the desktop + mobile apps to work with.

## 1) Create the Supabase Project
- Supabase Dashboard → **New Project**
- Save:
  - **Project URL**
  - **Anon Key**
  - **Service Role Key**
 - Auth settings:
   - Disable **Email Confirmations** (users should not be required to confirm email).

## 2) Apply Database Schema & Policies
Supabase Dashboard → **SQL Editor** → run in order:
1. `supabase/schema.sql`
2. `supabase/policies.sql`
3. **Enable RLS** on all tables (required):
   - Confirm RLS is ON for `companies`, `company_users`, `company_user_invitations`, `profiles`, `journal_entries`, `journal_entry_lines`.
   - If any are OFF, enable RLS for them.

## 3) Deploy the Invite Edge Function
From repo root (be explicit about the project):
```bash
supabase functions deploy invite-user --project-ref YOUR_PROJECT_REF
```
Then set the secret:
```bash
supabase secrets set SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

## 4) Generate a Personal Access Token (PAT)
You need a PAT to run **Init Remote Admin** and **Bootstrap to Claude**.
- Supabase Dashboard → **Account** → **Access Tokens** → **Generate**
- Save the PAT (you’ll paste it in Desktop later).

## 5) Create the Initial Company + Owner
You need at least one company and one owner user in the project.

Option A (script):
```bash
export SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
export OWNER_EMAIL="you@example.com"
export OWNER_PASSWORD="strong-password"
export COMPANY_NAME="Your Company"

./supabase/migrate_sqlite_to_supabase.py
```

Option B (manual):
- Create owner user in Auth
- Insert company + company_users rows for that owner

## 6) Desktop App Setup (Cloud Sync)
In **Desktop → Settings → Cloud Sync** fill:
- **Sync Project ID** = Supabase project ref
- **Sync Company ID** = company UUID for this project
- **Sync Auth Token** = **Service Role Key** for this project
- **Supabase PAT** = the Personal Access Token you generated

Then click:
- **Save**
- **Sync Now**
- **Init Remote Admin**
- **Bootstrap to Claude**

This enables:
- Desktop sync
- Inviting collaborators

## 7) Mobile App Setup
On the mobile sign-in screen, add a project profile:
- **Project ref**
- **Anon Key**
- **Optional label**

## 8) Verify
- Desktop: Invite collaborator works
- Mobile: Sign in and see data
- If user not authorized: “No company assigned” appears but stays signed in

---

### Notes
- The **Service Role Key** is required for desktop invite + sync.
- The **Anon Key** is used by mobile clients.
- The **PAT** is only for admin setup steps (Init Remote Admin, Bootstrap to Claude).
- Repeat this checklist for every Supabase project.
