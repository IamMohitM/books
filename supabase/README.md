# Supabase Setup

## 1) Create Project
- Create a Supabase project (free tier).
- Copy the project URL and keys.

## 2) Apply Schema and Policies
Run these in the SQL editor in order:
1. `schema.sql`
2. `policies.sql`

## 3) Create Initial User and Import Data
Set environment variables and run the migration script.

```bash
export SQLITE_PATH="/Users/mo/Developer/books/dbs/Vaulta/Pillr Test.books.db"
export SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
export OWNER_EMAIL="you@example.com"
export OWNER_PASSWORD="strong-password"
export COMPANY_NAME="Pillr Test"

./migrate_sqlite_to_supabase.py
```

If you already created a user, set `OWNER_USER_ID` instead of `OWNER_EMAIL` and `OWNER_PASSWORD`.

```bash
export OWNER_USER_ID="uuid-from-auth-users"
```

## 4) Invite Collaborators (Edge Function)
Owners can invite collaborators by email from the mobile app settings screen. The app calls the `invite-user` edge function,
which will create a user (magic link invite) if they do not exist, then adds them to `company_users` with role `editor`.

Deploy the function and set secrets:
```bash
supabase functions deploy invite-user
supabase secrets set SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

## 5) Mobile App Config
Set these in `mobile/.env` (not committed):

```bash
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```
