-- Normalize Journal Entry status to submitted-only semantics.
-- Any cancelled entry becomes submitted=false, and cancelled flag is dropped.

update public.journal_entries
set submitted = false
where cancelled = true;

drop view if exists public.ledger_entries;
drop view if exists public.account_balances;
drop view if exists public.journal_entries_with_user;
drop function if exists public.build_journal_entry_payload(uuid);

alter table public.journal_entries
  drop column if exists cancelled;

create view public.ledger_entries as
select
  jel.id as line_id,
  je.company_id,
  je.id as journal_entry_id,
  je.date,
  je.entry_type,
  je.reference_number,
  je.user_remark,
  je.submitted,
  jel.account_id,
  a.name as account_name,
  jel.debit,
  jel.credit,
  je.created_by,
  je.created_at
from public.journal_entry_lines jel
join public.journal_entries je on je.id = jel.journal_entry_id
join public.accounts a on a.id = jel.account_id;

create view public.account_balances as
select
  a.company_id,
  a.id as account_id,
  a.name as account_name,
  coalesce(sum(jel.debit), 0) as total_debit,
  coalesce(sum(jel.credit), 0) as total_credit,
  coalesce(sum(jel.debit - jel.credit), 0) as balance
from public.accounts a
left join public.journal_entry_lines jel on jel.account_id = a.id
left join public.journal_entries je
  on je.id = jel.journal_entry_id
  and je.submitted = true
group by a.company_id, a.id, a.name;

create or replace function public.build_journal_entry_payload(target_je_id uuid)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', je.id,
    'external_key', je.external_key,
    'data', jsonb_build_object(
      'name', je.external_key,
      'entry_type', je.entry_type,
      'date', je.date,
      'reference_number', je.reference_number,
      'reference_date', je.reference_date,
      'user_remark', je.user_remark,
      'submitted', je.submitted,
      'accounts', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'account', coalesce(a.external_key, a.name),
            'debit', jel.debit,
            'credit', jel.credit
          )
          order by jel.id
        )
        from public.journal_entry_lines jel
        join public.accounts a on a.id = jel.account_id
        where jel.journal_entry_id = je.id
      ), '[]'::jsonb)
    )
  )
  from public.journal_entries je
  where je.id = target_je_id;
$$;

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
  v_submitted boolean;
  v_cancelled_input boolean;
begin
  v_event_id := event ->> 'event_id';
  v_company_id := (event ->> 'company_id')::uuid;
  v_reference_type := event ->> 'reference_type';
  v_document_name := event ->> 'document_name';
  v_operation := lower(coalesce(event ->> 'operation', 'update'));
  v_payload := coalesce(event -> 'payload', '{}'::jsonb);
  v_data := coalesce(v_payload -> 'data', '{}'::jsonb);
  v_cancelled_input := coalesce((v_payload ->> 'cancelled')::boolean, (v_data ->> 'cancelled')::boolean, false);
  v_submitted := coalesce((v_payload ->> 'submitted')::boolean, (v_data ->> 'submitted')::boolean, false)
                 and not v_cancelled_input;

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
      submitted,
      external_key,
      device_id
    ) values (
      v_company_id,
      nullif(v_data ->> 'entryType', ''),
      coalesce((v_data ->> 'date')::date, current_date),
      nullif(v_data ->> 'referenceNumber', ''),
      (v_data ->> 'referenceDate')::date,
      nullif(v_data ->> 'userRemark', ''),
      v_submitted,
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
      submitted = excluded.submitted,
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

  return jsonb_build_object('success', false, 'error', 'Unsupported reference type', 'event_id', v_event_id);
end;
$$;
