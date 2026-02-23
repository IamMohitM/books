-- Core schema for mobile + collaboration MVP
-- Run in Supabase SQL editor

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.company_users (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'editor',
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  root_type text,
  parent_account text,
  account_type text,
  is_group boolean not null default false,
  description text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create table if not exists public.parties (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  role text,
  email text,
  phone text,
  default_account_id uuid references public.accounts(id),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  entry_type text,
  date date not null,
  reference_number text,
  reference_date date,
  user_remark text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create table if not exists public.journal_entry_lines (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid not null references public.journal_entries(id) on delete cascade,
  account_id uuid not null references public.accounts(id),
  debit numeric not null default 0,
  credit numeric not null default 0,
  created_at timestamptz not null default now()
);

create or replace view public.ledger_entries as
select
  jel.id as line_id,
  je.company_id,
  je.id as journal_entry_id,
  je.date,
  je.entry_type,
  je.reference_number,
  je.user_remark,
  jel.account_id,
  a.name as account_name,
  jel.debit,
  jel.credit,
  je.created_by,
  je.created_at
from public.journal_entry_lines jel
join public.journal_entries je on je.id = jel.journal_entry_id
join public.accounts a on a.id = jel.account_id;

create or replace view public.account_balances as
select
  a.company_id,
  a.id as account_id,
  a.name as account_name,
  coalesce(sum(jel.debit), 0) as total_debit,
  coalesce(sum(jel.credit), 0) as total_credit,
  coalesce(sum(jel.debit - jel.credit), 0) as balance
from public.accounts a
left join public.journal_entry_lines jel on jel.account_id = a.id
group by a.company_id, a.id, a.name;

create or replace view public.journal_entries_with_user as
select
  je.*,
  p.email as created_by_email,
  p.full_name as created_by_name
from public.journal_entries je
left join public.profiles p on p.id = je.created_by;

create or replace view public.company_users_with_profile as
select
  cu.company_id,
  cu.user_id,
  cu.role,
  cu.created_at,
  p.email,
  p.full_name
from public.company_users cu
left join public.profiles p on p.id = cu.user_id;

create or replace function public.is_company_member(target_company uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.company_users cu
    where cu.company_id = target_company
      and cu.user_id = auth.uid()
  );
$$;

create or replace function public.create_journal_entry(
  target_company uuid,
  entry_type text,
  entry_date date,
  reference_number text,
  reference_date date,
  user_remark text,
  lines jsonb
) returns uuid
language plpgsql
security definer
as $$
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
$$;

create or replace function public.invite_company_user(
  target_company uuid,
  invite_email text,
  invite_role text default 'editor'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
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
$$;

grant execute on function public.invite_company_user(uuid, text, text) to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();
