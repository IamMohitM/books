-- Phase 1 sync foundation (additive, non-destructive)

alter table if exists public.accounts
  add column if not exists row_version integer not null default 1,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists external_key text,
  add column if not exists device_id text;

alter table if exists public.parties
  add column if not exists row_version integer not null default 1,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists external_key text,
  add column if not exists device_id text;

alter table if exists public.journal_entries
  add column if not exists row_version integer not null default 1,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists external_key text,
  add column if not exists device_id text;

create unique index if not exists accounts_company_external_key_uniq
  on public.accounts (company_id, external_key);

create unique index if not exists parties_company_external_key_uniq
  on public.parties (company_id, external_key);

create unique index if not exists journal_entries_company_external_key_uniq
  on public.journal_entries (company_id, external_key);

create table if not exists public.sync_idempotency_keys (
  company_id uuid not null references public.companies(id) on delete cascade,
  request_key text not null,
  resource_type text not null,
  resource_id uuid,
  created_at timestamptz not null default now(),
  primary key (company_id, request_key)
);

create table if not exists public.company_sync_state (
  company_id uuid primary key references public.companies(id) on delete cascade,
  sync_enabled boolean not null default false,
  migration_version text,
  enrolled_at timestamptz,
  last_reconciled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_row_version_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  if tg_op = 'UPDATE' then
    new.row_version = coalesce(old.row_version, 1) + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_accounts_row_version_updated_at on public.accounts;
create trigger trg_accounts_row_version_updated_at
before update on public.accounts
for each row execute function public.set_row_version_updated_at();

drop trigger if exists trg_parties_row_version_updated_at on public.parties;
create trigger trg_parties_row_version_updated_at
before update on public.parties
for each row execute function public.set_row_version_updated_at();

drop trigger if exists trg_journal_entries_row_version_updated_at on public.journal_entries;
create trigger trg_journal_entries_row_version_updated_at
before update on public.journal_entries
for each row execute function public.set_row_version_updated_at();

create or replace function public.set_sync_state_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_company_sync_state_updated_at on public.company_sync_state;
create trigger trg_company_sync_state_updated_at
before update on public.company_sync_state
for each row execute function public.set_sync_state_updated_at();
