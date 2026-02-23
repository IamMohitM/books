-- Phase 3: remote change-log and pull API for desktop inbound sync

create table if not exists public.change_log (
  seq bigserial primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  doc_type text not null,
  operation text not null,
  payload jsonb not null,
  committed_at timestamptz not null default now()
);

create index if not exists change_log_company_seq_idx
  on public.change_log (company_id, seq);

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
      'external_key', old.external_key,
      'data', jsonb_build_object('name', old.name)
    );
    insert into public.change_log (company_id, doc_type, operation, payload)
    values (old.company_id, 'Account', op, payload);
    return old;
  end if;

  payload := jsonb_build_object(
    'id', new.id,
    'external_key', coalesce(new.external_key, new.name),
    'data', jsonb_build_object(
      'name', new.name,
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
      'external_key', old.external_key,
      'data', jsonb_build_object('name', old.name)
    );
    insert into public.change_log (company_id, doc_type, operation, payload)
    values (old.company_id, 'Party', op, payload);
    return old;
  end if;

  payload := jsonb_build_object(
    'id', new.id,
    'external_key', coalesce(new.external_key, new.name),
    'data', jsonb_build_object(
      'name', new.name,
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
      'external_key', old.external_key,
      'data', jsonb_build_object('name', old.external_key)
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

create or replace function public.log_change_journal_entry_lines()
returns trigger
language plpgsql
as $$
declare
  je_id uuid;
  v_company_id uuid;
  payload jsonb;
begin
  je_id := coalesce(new.journal_entry_id, old.journal_entry_id);

  select je.company_id into v_company_id
  from public.journal_entries je
  where je.id = je_id
  limit 1;

  if v_company_id is null then
    return coalesce(new, old);
  end if;

  payload := public.build_journal_entry_payload(je_id);

  insert into public.change_log (company_id, doc_type, operation, payload)
  values (v_company_id, 'JournalEntry', 'update', payload);

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_change_log_accounts on public.accounts;
create trigger trg_change_log_accounts
after insert or update or delete on public.accounts
for each row execute function public.log_change_accounts();

drop trigger if exists trg_change_log_parties on public.parties;
create trigger trg_change_log_parties
after insert or update or delete on public.parties
for each row execute function public.log_change_parties();

drop trigger if exists trg_change_log_journal_entries on public.journal_entries;
create trigger trg_change_log_journal_entries
after insert or update or delete on public.journal_entries
for each row execute function public.log_change_journal_entries();

drop trigger if exists trg_change_log_journal_entry_lines on public.journal_entry_lines;
create trigger trg_change_log_journal_entry_lines
after insert or update or delete on public.journal_entry_lines
for each row execute function public.log_change_journal_entry_lines();

create or replace function public.fetch_sync_changes(
  target_company uuid,
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
      auth.uid() is null
      or public.is_company_member(target_company)
    )
  order by cl.seq asc
  limit greatest(coalesce(max_rows, 100), 1);
$$;

grant execute on function public.fetch_sync_changes(uuid, bigint, integer) to authenticated;
grant execute on function public.fetch_sync_changes(uuid, bigint, integer) to service_role;
