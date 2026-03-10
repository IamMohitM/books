-- Add no-RLS membership helper and update policies to use it
create or replace function public.is_company_member_no_rls(target_company uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
  select exists (
    select 1 from public.company_users cu
    where cu.company_id = target_company
      and cu.user_id = auth.uid()
  );
$$;

alter function public.is_company_member_no_rls(uuid) owner to postgres;

-- Companies
DROP POLICY IF EXISTS "companies_select_member" ON public.companies;
CREATE POLICY "companies_select_member" ON public.companies
FOR SELECT USING (public.is_company_member_no_rls(id));

-- Company users
DROP POLICY IF EXISTS "company_users_select_member" ON public.company_users;
CREATE POLICY "company_users_select_member" ON public.company_users
FOR SELECT USING (public.is_company_member_no_rls(company_id));

-- Accounts
DROP POLICY IF EXISTS "accounts_select_member" ON public.accounts;
CREATE POLICY "accounts_select_member" ON public.accounts
FOR SELECT USING (public.is_company_member_no_rls(company_id));

DROP POLICY IF EXISTS "accounts_insert_member" ON public.accounts;
CREATE POLICY "accounts_insert_member" ON public.accounts
FOR INSERT WITH CHECK (public.is_company_member_no_rls(company_id));

DROP POLICY IF EXISTS "accounts_update_member" ON public.accounts;
CREATE POLICY "accounts_update_member" ON public.accounts
FOR UPDATE USING (public.is_company_member_no_rls(company_id));

-- Parties
DROP POLICY IF EXISTS "parties_select_member" ON public.parties;
CREATE POLICY "parties_select_member" ON public.parties
FOR SELECT USING (public.is_company_member_no_rls(company_id));

DROP POLICY IF EXISTS "parties_insert_member" ON public.parties;
CREATE POLICY "parties_insert_member" ON public.parties
FOR INSERT WITH CHECK (public.is_company_member_no_rls(company_id));

DROP POLICY IF EXISTS "parties_update_member" ON public.parties;
CREATE POLICY "parties_update_member" ON public.parties
FOR UPDATE USING (public.is_company_member_no_rls(company_id));

-- Journal entries
DROP POLICY IF EXISTS "journal_entries_select_member" ON public.journal_entries;
CREATE POLICY "journal_entries_select_member" ON public.journal_entries
FOR SELECT USING (public.is_company_member_no_rls(company_id));

DROP POLICY IF EXISTS "journal_entries_insert_member" ON public.journal_entries;
CREATE POLICY "journal_entries_insert_member" ON public.journal_entries
FOR INSERT WITH CHECK (public.is_company_member_no_rls(company_id));

DROP POLICY IF EXISTS "journal_entries_update_member" ON public.journal_entries;
CREATE POLICY "journal_entries_update_member" ON public.journal_entries
FOR UPDATE USING (public.is_company_member_no_rls(company_id));

-- Journal entry lines
DROP POLICY IF EXISTS "journal_entry_lines_select_member" ON public.journal_entry_lines;
CREATE POLICY "journal_entry_lines_select_member" ON public.journal_entry_lines
FOR SELECT USING (
  exists (
    select 1 from public.journal_entries je
    where je.id = journal_entry_id
      and public.is_company_member_no_rls(je.company_id)
  )
);

DROP POLICY IF EXISTS "journal_entry_lines_insert_member" ON public.journal_entry_lines;
CREATE POLICY "journal_entry_lines_insert_member" ON public.journal_entry_lines
FOR INSERT WITH CHECK (
  exists (
    select 1 from public.journal_entries je
    where je.id = journal_entry_id
      and public.is_company_member_no_rls(je.company_id)
  )
);

DROP POLICY IF EXISTS "journal_entry_lines_update_member" ON public.journal_entry_lines;
CREATE POLICY "journal_entry_lines_update_member" ON public.journal_entry_lines
FOR UPDATE USING (
  exists (
    select 1 from public.journal_entries je
    where je.id = journal_entry_id
      and public.is_company_member_no_rls(je.company_id)
  )
);
