-- RPC to fetch accounts without RLS recursion
create or replace function public.fetch_accounts_for_company(target_company uuid)
returns setof public.accounts
language sql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
  select a.*
  from public.accounts a
  where a.company_id = target_company
    and public.is_company_member_no_rls(target_company);
$$;

alter function public.fetch_accounts_for_company(uuid) owner to postgres;
