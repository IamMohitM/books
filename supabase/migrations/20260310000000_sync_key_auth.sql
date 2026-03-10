-- Sync key authentication for desktop sync (avoid service_role for daily sync)

create extension if not exists pgcrypto;

alter table public.companies
  add column if not exists sync_key_hash text;

alter table public.journal_entries
  add column if not exists last_modified_at timestamptz,
  add column if not exists last_modified_device_id text;

create or replace function public.hash_sync_key(raw_key text)
returns text
language sql
immutable
as $$
  select encode(extensions.digest(convert_to(raw_key, 'utf8'), 'sha256'), 'hex');
$$;

create or replace function public.verify_sync_key(target_company uuid, raw_key text)
returns boolean
language sql
stable
as $$
  select
    raw_key is not null
    and exists (
      select 1
      from public.companies c
      where c.id = target_company
        and c.sync_key_hash = public.hash_sync_key(raw_key)
    );
$$;

create or replace function public.set_company_sync_key(
  target_company uuid,
  raw_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_company is null then
    raise exception 'target_company is required';
  end if;

  if raw_key is null or length(trim(raw_key)) < 16 then
    raise exception 'raw_key is required and must be at least 16 chars';
  end if;

  if auth.role() <> 'service_role' then
    if auth.uid() is null then
      raise exception 'Authentication required';
    end if;

    if not exists (
      select 1
      from public.company_users cu
      where cu.company_id = target_company
        and cu.user_id = auth.uid()
        and cu.role = 'owner'
    ) then
      raise exception 'Only company owner can set sync key';
    end if;
  end if;

  update public.companies
  set sync_key_hash = public.hash_sync_key(raw_key)
  where id = target_company;

  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.apply_sync_event_with_key(
  event jsonb,
  sync_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id text;
  v_company_id uuid;
  v_reference_type text;
  v_document_name text;
  v_operation text;
  v_payload jsonb;
  v_data jsonb;
  v_resource_id uuid;
  v_je_id uuid;
  v_line jsonb;
  v_account_id uuid;
  v_debit numeric;
  v_credit numeric;
  v_inserted_count integer;
  v_submitted boolean;
  v_cancelled_input boolean;
  v_modified_at timestamptz;
  v_device_id text;
begin
  v_event_id := event ->> 'event_id';
  v_company_id := (event ->> 'company_id')::uuid;
  v_reference_type := event ->> 'reference_type';
  v_document_name := event ->> 'document_name';
  v_operation := lower(coalesce(event ->> 'operation', 'update'));
  v_payload := coalesce(event -> 'payload', '{}'::jsonb);
  v_data := coalesce(v_payload -> 'data', '{}'::jsonb);
  v_cancelled_input := coalesce(
    (v_payload ->> 'cancelled')::boolean,
    (v_data ->> 'cancelled')::boolean,
    false
  );
  v_submitted := coalesce(
    (v_payload ->> 'submitted')::boolean,
    (v_data ->> 'submitted')::boolean,
    false
  ) and not v_cancelled_input;
  v_modified_at := nullif(v_payload ->> 'modified', '')::timestamptz;
  v_device_id := nullif(v_payload ->> 'deviceId', '');

  if v_event_id is null or v_company_id is null or v_reference_type is null or v_document_name is null then
    raise exception 'Missing required event fields';
  end if;

  if auth.uid() is null then
    if not public.verify_sync_key(v_company_id, sync_key) then
      raise exception 'Invalid sync key';
    end if;
  elsif not public.is_company_member(v_company_id) then
    raise exception 'Not a company member';
  end if;

  insert into public.sync_idempotency_keys (company_id, request_key, resource_type)
  values (v_company_id, v_event_id, v_reference_type)
  on conflict do nothing;

  get diagnostics v_inserted_count = row_count;
  if v_inserted_count = 0 then
    return jsonb_build_object(
      'success', true,
      'duplicate', true,
      'event_id', v_event_id
    );
  end if;

  if v_reference_type = 'Account' then
    if v_operation = 'delete' then
      delete from public.accounts
      where company_id = v_company_id and external_key = v_document_name;

      return jsonb_build_object('success', true, 'deleted', true, 'event_id', v_event_id);
    end if;

    insert into public.accounts (
      company_id,
      name,
      root_type,
      parent_account,
      account_type,
      is_group,
      description,
      external_key,
      device_id
    ) values (
      v_company_id,
      coalesce(v_data ->> 'name', v_document_name),
      nullif(v_data ->> 'rootType', ''),
      nullif(v_data ->> 'parentAccount', ''),
      nullif(v_data ->> 'accountType', ''),
      coalesce((v_data ->> 'isGroup')::boolean, false),
      nullif(v_data ->> 'description', ''),
      v_document_name,
      v_device_id
    )
    on conflict (company_id, external_key)
    do update set
      name = excluded.name,
      root_type = excluded.root_type,
      parent_account = excluded.parent_account,
      account_type = excluded.account_type,
      is_group = excluded.is_group,
      description = excluded.description,
      device_id = coalesce(excluded.device_id, public.accounts.device_id);

    select id into v_resource_id
    from public.accounts
    where company_id = v_company_id and external_key = v_document_name
    limit 1;

    update public.sync_idempotency_keys
    set resource_id = v_resource_id
    where company_id = v_company_id and request_key = v_event_id;

    return jsonb_build_object('success', true, 'resource_id', v_resource_id, 'event_id', v_event_id);
  end if;

  if v_reference_type = 'Party' then
    if v_operation = 'delete' then
      delete from public.parties
      where company_id = v_company_id and external_key = v_document_name;

      return jsonb_build_object('success', true, 'deleted', true, 'event_id', v_event_id);
    end if;

    insert into public.parties (
      company_id,
      name,
      role,
      email,
      phone,
      external_key,
      device_id
    ) values (
      v_company_id,
      coalesce(v_data ->> 'name', v_document_name),
      nullif(v_data ->> 'role', ''),
      nullif(v_data ->> 'email', ''),
      nullif(v_data ->> 'phone', ''),
      v_document_name,
      v_device_id
    )
    on conflict (company_id, external_key)
    do update set
      name = excluded.name,
      role = excluded.role,
      email = excluded.email,
      phone = excluded.phone,
      device_id = coalesce(excluded.device_id, public.parties.device_id);

    select id into v_resource_id
    from public.parties
    where company_id = v_company_id and external_key = v_document_name
    limit 1;

    update public.sync_idempotency_keys
    set resource_id = v_resource_id
    where company_id = v_company_id and request_key = v_event_id;

    return jsonb_build_object('success', true, 'resource_id', v_resource_id, 'event_id', v_event_id);
  end if;

  if v_reference_type = 'JournalEntry' then
    if v_operation = 'delete' then
      delete from public.journal_entries
      where company_id = v_company_id and external_key = v_document_name;

      return jsonb_build_object('success', true, 'deleted', true, 'event_id', v_event_id);
    end if;

    insert into public.journal_entries (
      company_id,
      entry_type,
      date,
      reference_number,
      reference_date,
      user_remark,
      submitted,
      external_key,
      device_id,
      last_modified_at,
      last_modified_device_id
    ) values (
      v_company_id,
      nullif(v_data ->> 'entryType', ''),
      coalesce((v_data ->> 'date')::date, current_date),
      nullif(v_data ->> 'referenceNumber', ''),
      (v_data ->> 'referenceDate')::date,
      nullif(v_data ->> 'userRemark', ''),
      v_submitted,
      v_document_name,
      v_device_id,
      v_modified_at,
      v_device_id
    )
    on conflict (company_id, external_key)
    do update set
      entry_type = excluded.entry_type,
      date = excluded.date,
      reference_number = excluded.reference_number,
      reference_date = excluded.reference_date,
      user_remark = excluded.user_remark,
      submitted = excluded.submitted,
      device_id = coalesce(excluded.device_id, public.journal_entries.device_id),
      last_modified_at = coalesce(excluded.last_modified_at, public.journal_entries.last_modified_at),
      last_modified_device_id = coalesce(excluded.last_modified_device_id, public.journal_entries.last_modified_device_id)
    returning id into v_je_id;

    if v_je_id is null then
      select id into v_je_id
      from public.journal_entries
      where company_id = v_company_id and external_key = v_document_name
      limit 1;
    end if;

    delete from public.journal_entry_lines where journal_entry_id = v_je_id;

    for v_line in select * from jsonb_array_elements(coalesce(v_data -> 'accounts', '[]'::jsonb))
    loop
      select id into v_account_id
      from public.accounts
      where company_id = v_company_id
        and (external_key = (v_line ->> 'account') or name = (v_line ->> 'account'))
      order by case when external_key = (v_line ->> 'account') then 0 else 1 end
      limit 1;

      if v_account_id is null then
        raise exception 'Account not found for line account %', v_line ->> 'account';
      end if;

      v_debit := coalesce((v_line ->> 'debit')::numeric, 0);
      v_credit := coalesce((v_line ->> 'credit')::numeric, 0);

      insert into public.journal_entry_lines (
        journal_entry_id,
        account_id,
        debit,
        credit
      ) values (
        v_je_id,
        v_account_id,
        v_debit,
        v_credit
      );
    end loop;

    update public.sync_idempotency_keys
    set resource_id = v_je_id
    where company_id = v_company_id and request_key = v_event_id;

    return jsonb_build_object('success', true, 'resource_id', v_je_id, 'event_id', v_event_id);
  end if;

  raise exception 'Unsupported reference_type %', v_reference_type;
end;
$$;

create or replace function public.fetch_sync_changes_with_key(
  target_company uuid,
  sync_key text,
  last_seq bigint default 0,
  max_rows integer default 100
)
returns table (
  seq bigint,
  doc_type text,
  operation text,
  payload jsonb,
  committed_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select cl.seq, cl.doc_type, cl.operation, cl.payload, cl.committed_at
  from public.change_log cl
  where cl.company_id = target_company
    and cl.seq > coalesce(last_seq, 0)
    and (
      auth.uid() is not null
      or public.verify_sync_key(target_company, sync_key)
    )
  order by cl.seq asc
  limit greatest(coalesce(max_rows, 100), 1);
$$;

create or replace function public.clear_sync_company_data_with_key(
  target_company uuid,
  sync_key text
)
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

  if not public.verify_sync_key(target_company, sync_key) then
    raise exception 'Invalid sync key';
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

  delete from public.sync_idempotency_keys
  where company_id = target_company;
  get diagnostics v_deleted_idempotency = row_count;

  delete from public.company_sync_state
  where company_id = target_company;
  get diagnostics v_deleted_sync_state = row_count;

  delete from public.change_log
  where company_id = target_company;
  get diagnostics v_deleted_change_log = row_count;

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

create or replace function public.fetch_sync_snapshot_with_key(target_company uuid, sync_key text)
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

  if auth.uid() is null then
    if not public.verify_sync_key(target_company, sync_key) then
      raise exception 'Invalid sync key';
    end if;
  elsif not public.is_company_member(target_company) then
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

grant execute on function public.set_company_sync_key(uuid, text) to authenticated;
grant execute on function public.set_company_sync_key(uuid, text) to service_role;
grant execute on function public.apply_sync_event_with_key(jsonb, text) to anon;
grant execute on function public.apply_sync_event_with_key(jsonb, text) to authenticated;
grant execute on function public.fetch_sync_changes_with_key(uuid, text, bigint, integer) to anon;
grant execute on function public.fetch_sync_changes_with_key(uuid, text, bigint, integer) to authenticated;
grant execute on function public.clear_sync_company_data_with_key(uuid, text) to anon;
grant execute on function public.clear_sync_company_data_with_key(uuid, text) to authenticated;
grant execute on function public.fetch_sync_snapshot_with_key(uuid, text) to anon;
grant execute on function public.fetch_sync_snapshot_with_key(uuid, text) to authenticated;
