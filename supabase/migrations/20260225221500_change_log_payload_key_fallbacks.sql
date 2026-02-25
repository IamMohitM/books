-- Ensure change-log payloads always include a stable key even when external_key is null.

create or replace function public.build_journal_entry_payload(target_je_id uuid)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', je.id,
    'external_key', coalesce(je.external_key, je.id::text),
    'data', jsonb_build_object(
      'name', coalesce(je.external_key, je.id::text),
      'entry_type', je.entry_type,
      'date', je.date,
      'reference_number', je.reference_number,
      'reference_date', je.reference_date,
      'user_remark', je.user_remark,
      'accounts', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'account', coalesce(a.external_key, a.name, a.id::text),
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

create or replace function public.log_change_accounts()
returns trigger
language plpgsql
as $$
declare
  payload jsonb;
  op text;
begin
  op := lower(tg_op);

  if tg_op = 'DELETE' then
    payload := jsonb_build_object(
      'id', old.id,
      'external_key', coalesce(old.external_key, old.name, old.id::text),
      'data', jsonb_build_object('name', coalesce(old.name, old.external_key, old.id::text))
    );
    insert into public.change_log (company_id, doc_type, operation, payload)
    values (old.company_id, 'Account', op, payload);
    return old;
  end if;

  payload := jsonb_build_object(
    'id', new.id,
    'external_key', coalesce(new.external_key, new.name, new.id::text),
    'data', jsonb_build_object(
      'name', coalesce(new.name, new.external_key, new.id::text),
      'root_type', new.root_type,
      'parent_account', new.parent_account,
      'account_type', new.account_type,
      'is_group', new.is_group,
      'description', new.description
    )
  );

  insert into public.change_log (company_id, doc_type, operation, payload)
  values (new.company_id, 'Account', op, payload);

  return new;
end;
$$;

create or replace function public.log_change_parties()
returns trigger
language plpgsql
as $$
declare
  payload jsonb;
  op text;
begin
  op := lower(tg_op);

  if tg_op = 'DELETE' then
    payload := jsonb_build_object(
      'id', old.id,
      'external_key', coalesce(old.external_key, old.name, old.id::text),
      'data', jsonb_build_object('name', coalesce(old.name, old.external_key, old.id::text))
    );
    insert into public.change_log (company_id, doc_type, operation, payload)
    values (old.company_id, 'Party', op, payload);
    return old;
  end if;

  payload := jsonb_build_object(
    'id', new.id,
    'external_key', coalesce(new.external_key, new.name, new.id::text),
    'data', jsonb_build_object(
      'name', coalesce(new.name, new.external_key, new.id::text),
      'role', new.role,
      'email', new.email,
      'phone', new.phone
    )
  );

  insert into public.change_log (company_id, doc_type, operation, payload)
  values (new.company_id, 'Party', op, payload);

  return new;
end;
$$;

create or replace function public.log_change_journal_entries()
returns trigger
language plpgsql
as $$
declare
  payload jsonb;
  op text;
begin
  op := lower(tg_op);

  if tg_op = 'DELETE' then
    payload := jsonb_build_object(
      'id', old.id,
      'external_key', coalesce(old.external_key, old.id::text),
      'data', jsonb_build_object('name', coalesce(old.external_key, old.id::text))
    );

    insert into public.change_log (company_id, doc_type, operation, payload)
    values (old.company_id, 'JournalEntry', op, payload);

    return old;
  end if;

  payload := public.build_journal_entry_payload(new.id);

  insert into public.change_log (company_id, doc_type, operation, payload)
  values (new.company_id, 'JournalEntry', op, payload);

  return new;
end;
$$;
