-- Development helper: clear all sync-related company data for re-bootstrap.
-- Keep this RPC behind existing auth and only expose UI trigger in desktop dev mode.

create or replace function public.clear_sync_company_data(target_company uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_lines integer := 0;
  v_deleted_journal_entries integer := 0;
  v_deleted_parties integer := 0;
  v_deleted_accounts integer := 0;
  v_deleted_change_log integer := 0;
  v_deleted_idempotency integer := 0;
  v_deleted_sync_state integer := 0;
begin
  if target_company is null then
    raise exception 'target_company is required';
  end if;

  if auth.uid() is not null and not public.is_company_member(target_company) then
    raise exception 'Not a company member';
  end if;

  delete from public.journal_entry_lines jel
  where exists (
    select 1
    from public.journal_entries je
    where je.id = jel.journal_entry_id
      and je.company_id = target_company
  );
  get diagnostics v_deleted_lines = row_count;

  delete from public.journal_entries
  where company_id = target_company;
  get diagnostics v_deleted_journal_entries = row_count;

  delete from public.parties
  where company_id = target_company;
  get diagnostics v_deleted_parties = row_count;

  delete from public.accounts
  where company_id = target_company;
  get diagnostics v_deleted_accounts = row_count;

  delete from public.change_log
  where company_id = target_company;
  get diagnostics v_deleted_change_log = row_count;

  delete from public.sync_idempotency_keys
  where company_id = target_company;
  get diagnostics v_deleted_idempotency = row_count;

  delete from public.company_sync_state
  where company_id = target_company;
  get diagnostics v_deleted_sync_state = row_count;

  return jsonb_build_object(
    'success', true,
    'company_id', target_company,
    'deleted', jsonb_build_object(
      'journal_entry_lines', v_deleted_lines,
      'journal_entries', v_deleted_journal_entries,
      'parties', v_deleted_parties,
      'accounts', v_deleted_accounts,
      'change_log', v_deleted_change_log,
      'sync_idempotency_keys', v_deleted_idempotency,
      'company_sync_state', v_deleted_sync_state
    )
  );
end;
$$;

grant execute on function public.clear_sync_company_data(uuid) to authenticated;
grant execute on function public.clear_sync_company_data(uuid) to service_role;
