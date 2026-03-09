drop extension if exists "pg_net";

create sequence "public"."change_log_seq_seq";


  create table "public"."accounts" (
    "id" uuid not null default gen_random_uuid(),
    "company_id" uuid not null,
    "name" text not null,
    "root_type" text,
    "parent_account" text,
    "account_type" text,
    "is_group" boolean not null default false,
    "description" text,
    "created_at" timestamp with time zone not null default now(),
    "created_by" uuid default auth.uid(),
    "row_version" integer not null default 1,
    "updated_at" timestamp with time zone not null default now(),
    "external_key" text,
    "device_id" text
      );


alter table "public"."accounts" enable row level security;


  create table "public"."change_log" (
    "seq" bigint not null default nextval('public.change_log_seq_seq'::regclass),
    "company_id" uuid not null,
    "doc_type" text not null,
    "operation" text not null,
    "payload" jsonb not null,
    "committed_at" timestamp with time zone not null default now()
      );


alter table "public"."change_log" enable row level security;


  create table "public"."companies" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."companies" enable row level security;


  create table "public"."company_sync_state" (
    "company_id" uuid not null,
    "sync_enabled" boolean not null default false,
    "migration_version" text,
    "enrolled_at" timestamp with time zone,
    "last_reconciled_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."company_sync_state" enable row level security;


  create table "public"."company_user_invitations" (
    "id" uuid not null default gen_random_uuid(),
    "company_id" uuid not null,
    "email" text not null,
    "role" text not null default 'editor'::text,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."company_user_invitations" enable row level security;


  create table "public"."company_users" (
    "company_id" uuid not null,
    "user_id" uuid not null,
    "role" text not null default 'editor'::text,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."company_users" enable row level security;


  create table "public"."journal_entries" (
    "id" uuid not null default gen_random_uuid(),
    "company_id" uuid not null,
    "entry_type" text,
    "date" date not null,
    "reference_number" text,
    "reference_date" date,
    "user_remark" text,
    "created_at" timestamp with time zone not null default now(),
    "created_by" uuid default auth.uid(),
    "row_version" integer not null default 1,
    "updated_at" timestamp with time zone not null default now(),
    "external_key" text,
    "device_id" text,
    "submitted" boolean not null default false,
    "cancelled" boolean not null default false
      );


alter table "public"."journal_entries" enable row level security;


  create table "public"."journal_entry_lines" (
    "id" uuid not null default gen_random_uuid(),
    "journal_entry_id" uuid not null,
    "account_id" uuid not null,
    "debit" numeric not null default 0,
    "credit" numeric not null default 0,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."journal_entry_lines" enable row level security;


  create table "public"."parties" (
    "id" uuid not null default gen_random_uuid(),
    "company_id" uuid not null,
    "name" text not null,
    "role" text,
    "email" text,
    "phone" text,
    "default_account_id" uuid,
    "created_at" timestamp with time zone not null default now(),
    "created_by" uuid default auth.uid(),
    "row_version" integer not null default 1,
    "updated_at" timestamp with time zone not null default now(),
    "external_key" text,
    "device_id" text
      );


alter table "public"."parties" enable row level security;


  create table "public"."profiles" (
    "id" uuid not null,
    "email" text,
    "full_name" text,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."profiles" enable row level security;


  create table "public"."sync_idempotency_keys" (
    "company_id" uuid not null,
    "request_key" text not null,
    "resource_type" text not null,
    "resource_id" uuid,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."sync_idempotency_keys" enable row level security;

alter sequence "public"."change_log_seq_seq" owned by "public"."change_log"."seq";

CREATE UNIQUE INDEX accounts_company_external_key_uniq ON public.accounts USING btree (company_id, external_key);

CREATE UNIQUE INDEX accounts_pkey ON public.accounts USING btree (id);

CREATE INDEX change_log_company_seq_idx ON public.change_log USING btree (company_id, seq);

CREATE UNIQUE INDEX change_log_pkey ON public.change_log USING btree (seq);

CREATE UNIQUE INDEX companies_pkey ON public.companies USING btree (id);

CREATE UNIQUE INDEX company_sync_state_pkey ON public.company_sync_state USING btree (company_id);

CREATE UNIQUE INDEX company_user_invitations_company_id_email_key ON public.company_user_invitations USING btree (company_id, email);

CREATE UNIQUE INDEX company_user_invitations_pkey ON public.company_user_invitations USING btree (id);

CREATE UNIQUE INDEX company_users_pkey ON public.company_users USING btree (company_id, user_id);

CREATE UNIQUE INDEX journal_entries_company_external_key_uniq ON public.journal_entries USING btree (company_id, external_key);

CREATE UNIQUE INDEX journal_entries_pkey ON public.journal_entries USING btree (id);

CREATE UNIQUE INDEX journal_entry_lines_pkey ON public.journal_entry_lines USING btree (id);

CREATE UNIQUE INDEX parties_company_external_key_uniq ON public.parties USING btree (company_id, external_key);

CREATE UNIQUE INDEX parties_pkey ON public.parties USING btree (id);

CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id);

CREATE UNIQUE INDEX sync_idempotency_keys_pkey ON public.sync_idempotency_keys USING btree (company_id, request_key);

alter table "public"."accounts" add constraint "accounts_pkey" PRIMARY KEY using index "accounts_pkey";

alter table "public"."change_log" add constraint "change_log_pkey" PRIMARY KEY using index "change_log_pkey";

alter table "public"."companies" add constraint "companies_pkey" PRIMARY KEY using index "companies_pkey";

alter table "public"."company_sync_state" add constraint "company_sync_state_pkey" PRIMARY KEY using index "company_sync_state_pkey";

alter table "public"."company_user_invitations" add constraint "company_user_invitations_pkey" PRIMARY KEY using index "company_user_invitations_pkey";

alter table "public"."company_users" add constraint "company_users_pkey" PRIMARY KEY using index "company_users_pkey";

alter table "public"."journal_entries" add constraint "journal_entries_pkey" PRIMARY KEY using index "journal_entries_pkey";

alter table "public"."journal_entry_lines" add constraint "journal_entry_lines_pkey" PRIMARY KEY using index "journal_entry_lines_pkey";

alter table "public"."parties" add constraint "parties_pkey" PRIMARY KEY using index "parties_pkey";

alter table "public"."profiles" add constraint "profiles_pkey" PRIMARY KEY using index "profiles_pkey";

alter table "public"."sync_idempotency_keys" add constraint "sync_idempotency_keys_pkey" PRIMARY KEY using index "sync_idempotency_keys_pkey";

alter table "public"."accounts" add constraint "accounts_company_id_fkey" FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE not valid;

alter table "public"."accounts" validate constraint "accounts_company_id_fkey";

alter table "public"."change_log" add constraint "change_log_company_id_fkey" FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE not valid;

alter table "public"."change_log" validate constraint "change_log_company_id_fkey";

alter table "public"."company_sync_state" add constraint "company_sync_state_company_id_fkey" FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE not valid;

alter table "public"."company_sync_state" validate constraint "company_sync_state_company_id_fkey";

alter table "public"."company_user_invitations" add constraint "company_user_invitations_company_id_email_key" UNIQUE using index "company_user_invitations_company_id_email_key";

alter table "public"."company_user_invitations" add constraint "company_user_invitations_company_id_fkey" FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE not valid;

alter table "public"."company_user_invitations" validate constraint "company_user_invitations_company_id_fkey";

alter table "public"."company_users" add constraint "company_users_company_id_fkey" FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE not valid;

alter table "public"."company_users" validate constraint "company_users_company_id_fkey";

alter table "public"."company_users" add constraint "company_users_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."company_users" validate constraint "company_users_user_id_fkey";

alter table "public"."journal_entries" add constraint "journal_entries_company_id_fkey" FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE not valid;

alter table "public"."journal_entries" validate constraint "journal_entries_company_id_fkey";

alter table "public"."journal_entry_lines" add constraint "journal_entry_lines_account_id_fkey" FOREIGN KEY (account_id) REFERENCES public.accounts(id) not valid;

alter table "public"."journal_entry_lines" validate constraint "journal_entry_lines_account_id_fkey";

alter table "public"."journal_entry_lines" add constraint "journal_entry_lines_journal_entry_id_fkey" FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE CASCADE not valid;

alter table "public"."journal_entry_lines" validate constraint "journal_entry_lines_journal_entry_id_fkey";

alter table "public"."parties" add constraint "parties_company_id_fkey" FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE not valid;

alter table "public"."parties" validate constraint "parties_company_id_fkey";

alter table "public"."parties" add constraint "parties_default_account_id_fkey" FOREIGN KEY (default_account_id) REFERENCES public.accounts(id) not valid;

alter table "public"."parties" validate constraint "parties_default_account_id_fkey";

alter table "public"."profiles" add constraint "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."profiles" validate constraint "profiles_id_fkey";

alter table "public"."sync_idempotency_keys" add constraint "sync_idempotency_keys_company_id_fkey" FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE not valid;

alter table "public"."sync_idempotency_keys" validate constraint "sync_idempotency_keys_company_id_fkey";

set check_function_bodies = off;

create or replace view "public"."account_balances" as  SELECT a.company_id,
    a.id AS account_id,
    a.name AS account_name,
    COALESCE(sum(jel.debit), (0)::numeric) AS total_debit,
    COALESCE(sum(jel.credit), (0)::numeric) AS total_credit,
    COALESCE(sum((jel.debit - jel.credit)), (0)::numeric) AS balance
   FROM ((public.accounts a
     LEFT JOIN public.journal_entry_lines jel ON ((jel.account_id = a.id)))
     LEFT JOIN public.journal_entries je ON (((je.id = jel.journal_entry_id) AND (je.submitted = true) AND (je.cancelled = false))))
  GROUP BY a.company_id, a.id, a.name;


CREATE OR REPLACE FUNCTION public.admin_invite_company_user(target_company uuid, invite_email text, invite_role text DEFAULT 'editor'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  target_user_id uuid;
  normalized_email text;
  normalized_role text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'admin_invite_company_user is restricted to service_role';
  end if;

  if target_company is null then
    raise exception 'target_company is required';
  end if;

  normalized_email := lower(trim(coalesce(invite_email, '')));
  if normalized_email = '' then
    raise exception 'invite_email is required';
  end if;

  normalized_role := lower(trim(coalesce(invite_role, 'editor')));
  if normalized_role not in ('owner', 'editor') then
    raise exception 'invite_role must be owner or editor';
  end if;

  if not exists (
    select 1
    from public.companies c
    where c.id = target_company
  ) then
    raise exception 'Company % not found', target_company;
  end if;

  select id into target_user_id
  from auth.users
  where lower(email) = normalized_email
  limit 1;

  if target_user_id is null then
    raise exception 'User not found for email %', normalized_email;
  end if;

  insert into public.company_users (company_id, user_id, role)
  values (target_company, target_user_id, normalized_role)
  on conflict (company_id, user_id) do update
    set role = excluded.role;

  return target_user_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_sync_event(event jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_cancelled boolean;
begin
  v_event_id := event ->> 'event_id';
  v_company_id := (event ->> 'company_id')::uuid;
  v_reference_type := event ->> 'reference_type';
  v_document_name := event ->> 'document_name';
  v_operation := lower(coalesce(event ->> 'operation', 'update'));
  v_payload := coalesce(event -> 'payload', '{}'::jsonb);
  v_data := coalesce(v_payload -> 'data', '{}'::jsonb);
  v_submitted := coalesce((v_payload ->> 'submitted')::boolean, (v_data ->> 'submitted')::boolean, false);
  v_cancelled := coalesce((v_payload ->> 'cancelled')::boolean, (v_data ->> 'cancelled')::boolean, false);

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
      cancelled,
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
      v_cancelled,
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
      cancelled = excluded.cancelled,
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
$function$
;

CREATE OR REPLACE FUNCTION public.build_journal_entry_payload(target_je_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
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
      'cancelled', je.cancelled,
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
$function$
;

create or replace view "public"."company_users_with_profile" as  SELECT cu.company_id,
    cu.user_id,
    cu.role,
    cu.created_at,
    p.email,
    p.full_name
   FROM (public.company_users cu
     LEFT JOIN public.profiles p ON ((p.id = cu.user_id)));


CREATE OR REPLACE FUNCTION public.create_journal_entry(target_company uuid, entry_type text, entry_date date, reference_number text, reference_date date, user_remark text, lines jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  new_entry_id uuid;
  line jsonb;
  account_id uuid;
  debit numeric;
  credit numeric;
  total_debit numeric := 0;
  total_credit numeric := 0;
  line_count integer := 0;
begin
  if not public.is_company_member(target_company) then
    raise exception 'Not a company member';
  end if;

  if lines is null or jsonb_typeof(lines) <> 'array' then
    raise exception 'Journal entry lines are required';
  end if;

  insert into public.journal_entries (
    company_id,
    entry_type,
    date,
    reference_number,
    reference_date,
    user_remark,
    created_by
  ) values (
    target_company,
    entry_type,
    entry_date,
    reference_number,
    reference_date,
    user_remark,
    auth.uid()
  ) returning id into new_entry_id;

  for line in select * from jsonb_array_elements(lines)
  loop
    account_id := (line ->> 'account_id')::uuid;
    debit := coalesce((line ->> 'debit')::numeric, 0);
    credit := coalesce((line ->> 'credit')::numeric, 0);
    line_count := line_count + 1;
    total_debit := total_debit + debit;
    total_credit := total_credit + credit;

    if debit < 0 or credit < 0 then
      raise exception 'Debit or credit cannot be negative';
    end if;

    insert into public.journal_entry_lines (
      journal_entry_id,
      account_id,
      debit,
      credit
    ) values (
      new_entry_id,
      account_id,
      debit,
      credit
    );
  end loop;

  if line_count < 2 then
    raise exception 'Journal entry must include at least two lines';
  end if;

  if total_debit = 0 or total_credit = 0 then
    raise exception 'Journal entry must include both debits and credits';
  end if;

  if total_debit <> total_credit then
    raise exception 'Journal entry is not balanced';
  end if;

  return new_entry_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fetch_sync_changes(target_company uuid, last_seq bigint DEFAULT 0, max_rows integer DEFAULT 100)
 RETURNS TABLE(seq bigint, doc_type text, operation text, payload jsonb, committed_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.fetch_sync_snapshot(target_company uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;

  -- Auto-add user to companies they were invited to
  insert into public.company_users (company_id, user_id, role)
  select company_id, new.id, role
  from public.company_user_invitations
  where lower(email) = lower(new.email)
  on conflict (company_id, user_id) do update
    set role = excluded.role;

  -- Clean up invitations for this email
  delete from public.company_user_invitations
  where lower(email) = lower(new.email);

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.invite_company_user(target_company uuid, invite_email text, invite_role text DEFAULT 'editor'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  target_user_id uuid;
  normalized_email text;
begin
  if not exists (
    select 1 from public.company_users cu
    where cu.company_id = target_company
      and cu.user_id = auth.uid()
      and cu.role = 'owner'
  ) then
    raise exception 'Only owners can invite collaborators';
  end if;

  normalized_email := lower(trim(invite_email));

  select id into target_user_id
  from auth.users
  where lower(email) = normalized_email
  limit 1;

  if target_user_id is null then
    raise exception 'User not found for email %', normalized_email;
  end if;

  insert into public.company_users (company_id, user_id, role)
  values (target_company, target_user_id, coalesce(invite_role, 'editor'))
  on conflict (company_id, user_id) do update
    set role = excluded.role;

  return target_user_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.is_company_member(target_company uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select exists (
    select 1 from public.company_users cu
    where cu.company_id = target_company
      and cu.user_id = auth.uid()
  );
$function$
;

create or replace view "public"."journal_entries_with_user" as  SELECT je.id,
    je.company_id,
    je.entry_type,
    je.date,
    je.reference_number,
    je.reference_date,
    je.user_remark,
    je.created_at,
    je.created_by,
    p.email AS created_by_email,
    p.full_name AS created_by_name
   FROM (public.journal_entries je
     LEFT JOIN public.profiles p ON ((p.id = je.created_by)));


create or replace view "public"."ledger_entries" as  SELECT jel.id AS line_id,
    je.company_id,
    je.id AS journal_entry_id,
    je.date,
    je.entry_type,
    je.reference_number,
    je.user_remark,
    je.submitted,
    je.cancelled,
    jel.account_id,
    a.name AS account_name,
    jel.debit,
    jel.credit,
    je.created_by,
    je.created_at
   FROM ((public.journal_entry_lines jel
     JOIN public.journal_entries je ON ((je.id = jel.journal_entry_id)))
     JOIN public.accounts a ON ((a.id = jel.account_id)));


CREATE OR REPLACE FUNCTION public.log_change_accounts()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.log_change_journal_entries()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.log_change_journal_entry_lines()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.log_change_parties()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_row_version_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  if tg_op = 'UPDATE' then
    new.row_version = coalesce(old.row_version, 1) + 1;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_sync_state_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

grant delete on table "public"."accounts" to "anon";

grant insert on table "public"."accounts" to "anon";

grant references on table "public"."accounts" to "anon";

grant select on table "public"."accounts" to "anon";

grant trigger on table "public"."accounts" to "anon";

grant truncate on table "public"."accounts" to "anon";

grant update on table "public"."accounts" to "anon";

grant delete on table "public"."accounts" to "authenticated";

grant insert on table "public"."accounts" to "authenticated";

grant references on table "public"."accounts" to "authenticated";

grant select on table "public"."accounts" to "authenticated";

grant trigger on table "public"."accounts" to "authenticated";

grant truncate on table "public"."accounts" to "authenticated";

grant update on table "public"."accounts" to "authenticated";

grant delete on table "public"."accounts" to "service_role";

grant insert on table "public"."accounts" to "service_role";

grant references on table "public"."accounts" to "service_role";

grant select on table "public"."accounts" to "service_role";

grant trigger on table "public"."accounts" to "service_role";

grant truncate on table "public"."accounts" to "service_role";

grant update on table "public"."accounts" to "service_role";

grant delete on table "public"."change_log" to "anon";

grant insert on table "public"."change_log" to "anon";

grant references on table "public"."change_log" to "anon";

grant select on table "public"."change_log" to "anon";

grant trigger on table "public"."change_log" to "anon";

grant truncate on table "public"."change_log" to "anon";

grant update on table "public"."change_log" to "anon";

grant delete on table "public"."change_log" to "authenticated";

grant insert on table "public"."change_log" to "authenticated";

grant references on table "public"."change_log" to "authenticated";

grant select on table "public"."change_log" to "authenticated";

grant trigger on table "public"."change_log" to "authenticated";

grant truncate on table "public"."change_log" to "authenticated";

grant update on table "public"."change_log" to "authenticated";

grant delete on table "public"."change_log" to "service_role";

grant insert on table "public"."change_log" to "service_role";

grant references on table "public"."change_log" to "service_role";

grant select on table "public"."change_log" to "service_role";

grant trigger on table "public"."change_log" to "service_role";

grant truncate on table "public"."change_log" to "service_role";

grant update on table "public"."change_log" to "service_role";

grant delete on table "public"."companies" to "anon";

grant insert on table "public"."companies" to "anon";

grant references on table "public"."companies" to "anon";

grant select on table "public"."companies" to "anon";

grant trigger on table "public"."companies" to "anon";

grant truncate on table "public"."companies" to "anon";

grant update on table "public"."companies" to "anon";

grant delete on table "public"."companies" to "authenticated";

grant insert on table "public"."companies" to "authenticated";

grant references on table "public"."companies" to "authenticated";

grant select on table "public"."companies" to "authenticated";

grant trigger on table "public"."companies" to "authenticated";

grant truncate on table "public"."companies" to "authenticated";

grant update on table "public"."companies" to "authenticated";

grant delete on table "public"."companies" to "service_role";

grant insert on table "public"."companies" to "service_role";

grant references on table "public"."companies" to "service_role";

grant select on table "public"."companies" to "service_role";

grant trigger on table "public"."companies" to "service_role";

grant truncate on table "public"."companies" to "service_role";

grant update on table "public"."companies" to "service_role";

grant delete on table "public"."company_sync_state" to "anon";

grant insert on table "public"."company_sync_state" to "anon";

grant references on table "public"."company_sync_state" to "anon";

grant select on table "public"."company_sync_state" to "anon";

grant trigger on table "public"."company_sync_state" to "anon";

grant truncate on table "public"."company_sync_state" to "anon";

grant update on table "public"."company_sync_state" to "anon";

grant delete on table "public"."company_sync_state" to "authenticated";

grant insert on table "public"."company_sync_state" to "authenticated";

grant references on table "public"."company_sync_state" to "authenticated";

grant select on table "public"."company_sync_state" to "authenticated";

grant trigger on table "public"."company_sync_state" to "authenticated";

grant truncate on table "public"."company_sync_state" to "authenticated";

grant update on table "public"."company_sync_state" to "authenticated";

grant delete on table "public"."company_sync_state" to "service_role";

grant insert on table "public"."company_sync_state" to "service_role";

grant references on table "public"."company_sync_state" to "service_role";

grant select on table "public"."company_sync_state" to "service_role";

grant trigger on table "public"."company_sync_state" to "service_role";

grant truncate on table "public"."company_sync_state" to "service_role";

grant update on table "public"."company_sync_state" to "service_role";

grant delete on table "public"."company_user_invitations" to "anon";

grant insert on table "public"."company_user_invitations" to "anon";

grant references on table "public"."company_user_invitations" to "anon";

grant select on table "public"."company_user_invitations" to "anon";

grant trigger on table "public"."company_user_invitations" to "anon";

grant truncate on table "public"."company_user_invitations" to "anon";

grant update on table "public"."company_user_invitations" to "anon";

grant delete on table "public"."company_user_invitations" to "authenticated";

grant insert on table "public"."company_user_invitations" to "authenticated";

grant references on table "public"."company_user_invitations" to "authenticated";

grant select on table "public"."company_user_invitations" to "authenticated";

grant trigger on table "public"."company_user_invitations" to "authenticated";

grant truncate on table "public"."company_user_invitations" to "authenticated";

grant update on table "public"."company_user_invitations" to "authenticated";

grant delete on table "public"."company_user_invitations" to "service_role";

grant insert on table "public"."company_user_invitations" to "service_role";

grant references on table "public"."company_user_invitations" to "service_role";

grant select on table "public"."company_user_invitations" to "service_role";

grant trigger on table "public"."company_user_invitations" to "service_role";

grant truncate on table "public"."company_user_invitations" to "service_role";

grant update on table "public"."company_user_invitations" to "service_role";

grant delete on table "public"."company_users" to "anon";

grant insert on table "public"."company_users" to "anon";

grant references on table "public"."company_users" to "anon";

grant select on table "public"."company_users" to "anon";

grant trigger on table "public"."company_users" to "anon";

grant truncate on table "public"."company_users" to "anon";

grant update on table "public"."company_users" to "anon";

grant delete on table "public"."company_users" to "authenticated";

grant insert on table "public"."company_users" to "authenticated";

grant references on table "public"."company_users" to "authenticated";

grant select on table "public"."company_users" to "authenticated";

grant trigger on table "public"."company_users" to "authenticated";

grant truncate on table "public"."company_users" to "authenticated";

grant update on table "public"."company_users" to "authenticated";

grant delete on table "public"."company_users" to "service_role";

grant insert on table "public"."company_users" to "service_role";

grant references on table "public"."company_users" to "service_role";

grant select on table "public"."company_users" to "service_role";

grant trigger on table "public"."company_users" to "service_role";

grant truncate on table "public"."company_users" to "service_role";

grant update on table "public"."company_users" to "service_role";

grant delete on table "public"."journal_entries" to "anon";

grant insert on table "public"."journal_entries" to "anon";

grant references on table "public"."journal_entries" to "anon";

grant select on table "public"."journal_entries" to "anon";

grant trigger on table "public"."journal_entries" to "anon";

grant truncate on table "public"."journal_entries" to "anon";

grant update on table "public"."journal_entries" to "anon";

grant delete on table "public"."journal_entries" to "authenticated";

grant insert on table "public"."journal_entries" to "authenticated";

grant references on table "public"."journal_entries" to "authenticated";

grant select on table "public"."journal_entries" to "authenticated";

grant trigger on table "public"."journal_entries" to "authenticated";

grant truncate on table "public"."journal_entries" to "authenticated";

grant update on table "public"."journal_entries" to "authenticated";

grant delete on table "public"."journal_entries" to "service_role";

grant insert on table "public"."journal_entries" to "service_role";

grant references on table "public"."journal_entries" to "service_role";

grant select on table "public"."journal_entries" to "service_role";

grant trigger on table "public"."journal_entries" to "service_role";

grant truncate on table "public"."journal_entries" to "service_role";

grant update on table "public"."journal_entries" to "service_role";

grant delete on table "public"."journal_entry_lines" to "anon";

grant insert on table "public"."journal_entry_lines" to "anon";

grant references on table "public"."journal_entry_lines" to "anon";

grant select on table "public"."journal_entry_lines" to "anon";

grant trigger on table "public"."journal_entry_lines" to "anon";

grant truncate on table "public"."journal_entry_lines" to "anon";

grant update on table "public"."journal_entry_lines" to "anon";

grant delete on table "public"."journal_entry_lines" to "authenticated";

grant insert on table "public"."journal_entry_lines" to "authenticated";

grant references on table "public"."journal_entry_lines" to "authenticated";

grant select on table "public"."journal_entry_lines" to "authenticated";

grant trigger on table "public"."journal_entry_lines" to "authenticated";

grant truncate on table "public"."journal_entry_lines" to "authenticated";

grant update on table "public"."journal_entry_lines" to "authenticated";

grant delete on table "public"."journal_entry_lines" to "service_role";

grant insert on table "public"."journal_entry_lines" to "service_role";

grant references on table "public"."journal_entry_lines" to "service_role";

grant select on table "public"."journal_entry_lines" to "service_role";

grant trigger on table "public"."journal_entry_lines" to "service_role";

grant truncate on table "public"."journal_entry_lines" to "service_role";

grant update on table "public"."journal_entry_lines" to "service_role";

grant delete on table "public"."parties" to "anon";

grant insert on table "public"."parties" to "anon";

grant references on table "public"."parties" to "anon";

grant select on table "public"."parties" to "anon";

grant trigger on table "public"."parties" to "anon";

grant truncate on table "public"."parties" to "anon";

grant update on table "public"."parties" to "anon";

grant delete on table "public"."parties" to "authenticated";

grant insert on table "public"."parties" to "authenticated";

grant references on table "public"."parties" to "authenticated";

grant select on table "public"."parties" to "authenticated";

grant trigger on table "public"."parties" to "authenticated";

grant truncate on table "public"."parties" to "authenticated";

grant update on table "public"."parties" to "authenticated";

grant delete on table "public"."parties" to "service_role";

grant insert on table "public"."parties" to "service_role";

grant references on table "public"."parties" to "service_role";

grant select on table "public"."parties" to "service_role";

grant trigger on table "public"."parties" to "service_role";

grant truncate on table "public"."parties" to "service_role";

grant update on table "public"."parties" to "service_role";

grant delete on table "public"."profiles" to "anon";

grant insert on table "public"."profiles" to "anon";

grant references on table "public"."profiles" to "anon";

grant select on table "public"."profiles" to "anon";

grant trigger on table "public"."profiles" to "anon";

grant truncate on table "public"."profiles" to "anon";

grant update on table "public"."profiles" to "anon";

grant delete on table "public"."profiles" to "authenticated";

grant insert on table "public"."profiles" to "authenticated";

grant references on table "public"."profiles" to "authenticated";

grant select on table "public"."profiles" to "authenticated";

grant trigger on table "public"."profiles" to "authenticated";

grant truncate on table "public"."profiles" to "authenticated";

grant update on table "public"."profiles" to "authenticated";

grant delete on table "public"."profiles" to "service_role";

grant insert on table "public"."profiles" to "service_role";

grant references on table "public"."profiles" to "service_role";

grant select on table "public"."profiles" to "service_role";

grant trigger on table "public"."profiles" to "service_role";

grant truncate on table "public"."profiles" to "service_role";

grant update on table "public"."profiles" to "service_role";

grant delete on table "public"."sync_idempotency_keys" to "anon";

grant insert on table "public"."sync_idempotency_keys" to "anon";

grant references on table "public"."sync_idempotency_keys" to "anon";

grant select on table "public"."sync_idempotency_keys" to "anon";

grant trigger on table "public"."sync_idempotency_keys" to "anon";

grant truncate on table "public"."sync_idempotency_keys" to "anon";

grant update on table "public"."sync_idempotency_keys" to "anon";

grant delete on table "public"."sync_idempotency_keys" to "authenticated";

grant insert on table "public"."sync_idempotency_keys" to "authenticated";

grant references on table "public"."sync_idempotency_keys" to "authenticated";

grant select on table "public"."sync_idempotency_keys" to "authenticated";

grant trigger on table "public"."sync_idempotency_keys" to "authenticated";

grant truncate on table "public"."sync_idempotency_keys" to "authenticated";

grant update on table "public"."sync_idempotency_keys" to "authenticated";

grant delete on table "public"."sync_idempotency_keys" to "service_role";

grant insert on table "public"."sync_idempotency_keys" to "service_role";

grant references on table "public"."sync_idempotency_keys" to "service_role";

grant select on table "public"."sync_idempotency_keys" to "service_role";

grant trigger on table "public"."sync_idempotency_keys" to "service_role";

grant truncate on table "public"."sync_idempotency_keys" to "service_role";

grant update on table "public"."sync_idempotency_keys" to "service_role";


  create policy "accounts_insert_member"
  on "public"."accounts"
  as permissive
  for insert
  to public
with check (public.is_company_member(company_id));



  create policy "accounts_select_member"
  on "public"."accounts"
  as permissive
  for select
  to public
using (public.is_company_member(company_id));



  create policy "accounts_update_member"
  on "public"."accounts"
  as permissive
  for update
  to public
using (public.is_company_member(company_id));



  create policy "companies_insert_service_role"
  on "public"."companies"
  as permissive
  for insert
  to public
with check (true);



  create policy "companies_select_member"
  on "public"."companies"
  as permissive
  for select
  to public
using (public.is_company_member(id));



  create policy "company_user_invitations_delete_owner"
  on "public"."company_user_invitations"
  as permissive
  for delete
  to public
using ((EXISTS ( SELECT 1
   FROM public.company_users cu
  WHERE ((cu.company_id = company_user_invitations.company_id) AND (cu.user_id = auth.uid()) AND (cu.role = 'owner'::text)))));



  create policy "company_user_invitations_insert_owner"
  on "public"."company_user_invitations"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM public.company_users cu
  WHERE ((cu.company_id = company_user_invitations.company_id) AND (cu.user_id = auth.uid()) AND (cu.role = 'owner'::text)))));



  create policy "company_user_invitations_select_owner"
  on "public"."company_user_invitations"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.company_users cu
  WHERE ((cu.company_id = company_user_invitations.company_id) AND (cu.user_id = auth.uid()) AND (cu.role = 'owner'::text)))));



  create policy "company_users_insert_owner"
  on "public"."company_users"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM public.company_users cu
  WHERE ((cu.company_id = cu.company_id) AND (cu.user_id = auth.uid()) AND (cu.role = 'owner'::text)))));



  create policy "company_users_select_member"
  on "public"."company_users"
  as permissive
  for select
  to public
using (public.is_company_member(company_id));



  create policy "company_users_select_self"
  on "public"."company_users"
  as permissive
  for select
  to public
using ((user_id = auth.uid()));



  create policy "journal_entries_insert_member"
  on "public"."journal_entries"
  as permissive
  for insert
  to public
with check (public.is_company_member(company_id));



  create policy "journal_entries_select_member"
  on "public"."journal_entries"
  as permissive
  for select
  to public
using (public.is_company_member(company_id));



  create policy "journal_entries_update_member"
  on "public"."journal_entries"
  as permissive
  for update
  to public
using (public.is_company_member(company_id));



  create policy "journal_entry_lines_insert_member"
  on "public"."journal_entry_lines"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM public.journal_entries je
  WHERE ((je.id = journal_entry_lines.journal_entry_id) AND public.is_company_member(je.company_id)))));



  create policy "journal_entry_lines_select_member"
  on "public"."journal_entry_lines"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.journal_entries je
  WHERE ((je.id = journal_entry_lines.journal_entry_id) AND public.is_company_member(je.company_id)))));



  create policy "journal_entry_lines_update_member"
  on "public"."journal_entry_lines"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM public.journal_entries je
  WHERE ((je.id = journal_entry_lines.journal_entry_id) AND public.is_company_member(je.company_id)))));



  create policy "parties_insert_member"
  on "public"."parties"
  as permissive
  for insert
  to public
with check (public.is_company_member(company_id));



  create policy "parties_select_member"
  on "public"."parties"
  as permissive
  for select
  to public
using (public.is_company_member(company_id));



  create policy "parties_update_member"
  on "public"."parties"
  as permissive
  for update
  to public
using (public.is_company_member(company_id));



  create policy "profiles_select_company_member"
  on "public"."profiles"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM (public.company_users viewer
     JOIN public.company_users member ON ((member.company_id = viewer.company_id)))
  WHERE ((viewer.user_id = auth.uid()) AND (member.user_id = profiles.id)))));



  create policy "profiles_select_own"
  on "public"."profiles"
  as permissive
  for select
  to public
using ((auth.uid() = id));



  create policy "profiles_update_own"
  on "public"."profiles"
  as permissive
  for update
  to public
using ((auth.uid() = id));


CREATE TRIGGER trg_accounts_row_version_updated_at BEFORE UPDATE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.set_row_version_updated_at();

CREATE TRIGGER trg_change_log_accounts AFTER INSERT OR DELETE OR UPDATE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.log_change_accounts();

CREATE TRIGGER trg_company_sync_state_updated_at BEFORE UPDATE ON public.company_sync_state FOR EACH ROW EXECUTE FUNCTION public.set_sync_state_updated_at();

CREATE TRIGGER trg_change_log_journal_entries AFTER INSERT OR DELETE OR UPDATE ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.log_change_journal_entries();

CREATE TRIGGER trg_journal_entries_row_version_updated_at BEFORE UPDATE ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.set_row_version_updated_at();

CREATE TRIGGER trg_change_log_journal_entry_lines AFTER INSERT OR DELETE OR UPDATE ON public.journal_entry_lines FOR EACH ROW EXECUTE FUNCTION public.log_change_journal_entry_lines();

CREATE TRIGGER trg_change_log_parties AFTER INSERT OR DELETE OR UPDATE ON public.parties FOR EACH ROW EXECUTE FUNCTION public.log_change_parties();

CREATE TRIGGER trg_parties_row_version_updated_at BEFORE UPDATE ON public.parties FOR EACH ROW EXECUTE FUNCTION public.set_row_version_updated_at();

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


