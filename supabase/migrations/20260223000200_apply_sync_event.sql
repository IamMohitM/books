-- Phase 2: apply desktop outbox events idempotently

create or replace function public.apply_sync_event(event jsonb)
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
begin
  v_event_id := event ->> 'event_id';
  v_company_id := (event ->> 'company_id')::uuid;
  v_reference_type := event ->> 'reference_type';
  v_document_name := event ->> 'document_name';
  v_operation := lower(coalesce(event ->> 'operation', 'update'));
  v_payload := coalesce(event -> 'payload', '{}'::jsonb);
  v_data := coalesce(v_payload -> 'data', '{}'::jsonb);

  if v_event_id is null or v_company_id is null or v_reference_type is null or v_document_name is null then
    raise exception 'Missing required event fields';
  end if;

  if auth.uid() is not null and not public.is_company_member(v_company_id) then
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
      nullif(v_payload ->> 'deviceId', '')
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
      nullif(v_payload ->> 'deviceId', '')
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
      external_key,
      device_id
    ) values (
      v_company_id,
      nullif(v_data ->> 'entryType', ''),
      coalesce((v_data ->> 'date')::date, current_date),
      nullif(v_data ->> 'referenceNumber', ''),
      (v_data ->> 'referenceDate')::date,
      nullif(v_data ->> 'userRemark', ''),
      v_document_name,
      nullif(v_payload ->> 'deviceId', '')
    )
    on conflict (company_id, external_key)
    do update set
      entry_type = excluded.entry_type,
      date = excluded.date,
      reference_number = excluded.reference_number,
      reference_date = excluded.reference_date,
      user_remark = excluded.user_remark,
      device_id = coalesce(excluded.device_id, public.journal_entries.device_id)
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

grant execute on function public.apply_sync_event(jsonb) to authenticated;
grant execute on function public.apply_sync_event(jsonb) to service_role;
