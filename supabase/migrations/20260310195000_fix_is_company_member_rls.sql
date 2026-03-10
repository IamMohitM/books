-- Avoid RLS recursion for is_company_member
create or replace function public.is_company_member(target_company uuid)
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
