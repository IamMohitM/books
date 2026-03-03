-- Disable RLS on companies table to avoid stack depth recursion during sync bootstrap
-- The companies table is only used internally for sync initialization and doesn't store user data
-- Service_role key can still access it for initialization

alter table public.companies disable row level security;
