-- Adjust RPC to avoid nested membership functions
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
    and exists (
      select 1 from public.company_users cu
      where cu.company_id = target_company
        and cu.user_id = auth.uid()
    );
$$;

alter function public.fetch_accounts_for_company(uuid) owner to postgres;
