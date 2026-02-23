-- Phase 4: reconciliation snapshot API for manual drift checks

create or replace function public.fetch_sync_snapshot(target_company uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  account_count integer;
  party_count integer;
  journal_entry_count integer;
  line_count integer;
  debit_total numeric;
  credit_total numeric;
begin
  if target_company is null then
    raise exception 'target_company is required';
  end if;

  if auth.uid() is not null and not public.is_company_member(target_company) then
    raise exception 'Not a company member';
  end if;

  select count(*)::integer
  into account_count
  from public.accounts a
  where a.company_id = target_company;

  select count(*)::integer
  into party_count
  from public.parties p
  where p.company_id = target_company;

  select count(*)::integer
  into journal_entry_count
  from public.journal_entries je
  where je.company_id = target_company;

  select
    count(*)::integer,
    coalesce(sum(jel.debit), 0),
    coalesce(sum(jel.credit), 0)
  into line_count, debit_total, credit_total
  from public.journal_entry_lines jel
  join public.journal_entries je on je.id = jel.journal_entry_id
  where je.company_id = target_company;

  return jsonb_build_object(
    'accounts', coalesce(account_count, 0),
    'parties', coalesce(party_count, 0),
    'journal_entries', coalesce(journal_entry_count, 0),
    'journal_entry_lines', coalesce(line_count, 0),
    'debit_total', coalesce(debit_total, 0),
    'credit_total', coalesce(credit_total, 0)
  );
end;
$$;

grant execute on function public.fetch_sync_snapshot(uuid) to authenticated;
grant execute on function public.fetch_sync_snapshot(uuid) to service_role;
