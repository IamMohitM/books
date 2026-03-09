-- Baseline schema so legacy sync migrations can replay in shadow/local environments.

create extension if not exists pgcrypto;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key,
  email text,
  full_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.company_users (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'editor',
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

create table if not exists public.company_user_invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  email text not null,
  role text not null default 'editor',
  created_at timestamptz not null default now(),
  unique (company_id, email)
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
  default_account_id uuid references public.accounts(id) on delete set null,
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
  submitted boolean not null default false,
  cancelled boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create table if not exists public.journal_entry_lines (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid not null references public.journal_entries(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete restrict,
  debit numeric not null default 0,
  credit numeric not null default 0,
  created_at timestamptz not null default now()
);

alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.company_users enable row level security;
alter table public.company_user_invitations enable row level security;
alter table public.accounts enable row level security;
alter table public.parties enable row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_entry_lines enable row level security;

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
