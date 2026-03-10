-- Enable RLS
alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.company_users enable row level security;
alter table public.accounts enable row level security;
alter table public.parties enable row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_entry_lines enable row level security;

-- Profiles: users can read their own profile
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
for update using (auth.uid() = id);

drop policy if exists "profiles_select_company_member" on public.profiles;
create policy "profiles_select_company_member" on public.profiles
for select using (
  exists (
    select 1
    from public.company_users viewer
    join public.company_users member on member.company_id = viewer.company_id
    where viewer.user_id = auth.uid()
      and member.user_id = profiles.id
  )
);

-- Companies: members can read, service_role can create during sync
drop policy if exists "companies_select_member" on public.companies;
create policy "companies_select_member" on public.companies
for select using (public.is_company_member_no_rls(id));

drop policy if exists "companies_insert_service_role" on public.companies;
create policy "companies_insert_service_role" on public.companies
for insert with check (true);

-- Company users: members can read, owners can add
drop policy if exists "company_users_select_member" on public.company_users;
create policy "company_users_select_member" on public.company_users
for select using (public.is_company_member_no_rls(company_id));

drop policy if exists "company_users_insert_owner" on public.company_users;
create policy "company_users_insert_owner" on public.company_users
for insert with check (
  exists (
    select 1 from public.company_users cu
    where cu.company_id = company_id
      and cu.user_id = auth.uid()
      and cu.role = 'owner'
  )
);

-- Accounts: members can read/write
drop policy if exists "accounts_select_member" on public.accounts;
create policy "accounts_select_member" on public.accounts
for select using (public.is_company_member_no_rls(company_id));

drop policy if exists "accounts_insert_member" on public.accounts;
create policy "accounts_insert_member" on public.accounts
for insert with check (public.is_company_member_no_rls(company_id));

drop policy if exists "accounts_update_member" on public.accounts;
create policy "accounts_update_member" on public.accounts
for update using (public.is_company_member_no_rls(company_id));

-- Parties
drop policy if exists "parties_select_member" on public.parties;
create policy "parties_select_member" on public.parties
for select using (public.is_company_member_no_rls(company_id));

drop policy if exists "parties_insert_member" on public.parties;
create policy "parties_insert_member" on public.parties
for insert with check (public.is_company_member_no_rls(company_id));

drop policy if exists "parties_update_member" on public.parties;
create policy "parties_update_member" on public.parties
for update using (public.is_company_member_no_rls(company_id));

-- Journal entries
drop policy if exists "journal_entries_select_member" on public.journal_entries;
create policy "journal_entries_select_member" on public.journal_entries
for select using (public.is_company_member_no_rls(company_id));

drop policy if exists "journal_entries_insert_member" on public.journal_entries;
create policy "journal_entries_insert_member" on public.journal_entries
for insert with check (public.is_company_member_no_rls(company_id));

drop policy if exists "journal_entries_update_member" on public.journal_entries;
create policy "journal_entries_update_member" on public.journal_entries
for update using (public.is_company_member_no_rls(company_id));

-- Journal entry lines: restrict by parent entry company
drop policy if exists "journal_entry_lines_select_member" on public.journal_entry_lines;
create policy "journal_entry_lines_select_member" on public.journal_entry_lines
for select using (
  exists (
    select 1 from public.journal_entries je
    where je.id = journal_entry_id
      and public.is_company_member_no_rls(je.company_id)
  )
);

drop policy if exists "journal_entry_lines_insert_member" on public.journal_entry_lines;
create policy "journal_entry_lines_insert_member" on public.journal_entry_lines
for insert with check (
  exists (
    select 1 from public.journal_entries je
    where je.id = journal_entry_id
      and public.is_company_member_no_rls(je.company_id)
  )
);

drop policy if exists "journal_entry_lines_update_member" on public.journal_entry_lines;
create policy "journal_entry_lines_update_member" on public.journal_entry_lines
for update using (
  exists (
    select 1 from public.journal_entries je
    where je.id = journal_entry_id
      and public.is_company_member_no_rls(je.company_id)
  )
);

drop policy if exists "company_users_select_self" on public.company_users;
create policy "company_users_select_self"
  on public.company_users
  for select
  using (user_id = auth.uid());
