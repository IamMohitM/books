-- Fix ON CONFLICT target inference for sync external keys
-- Partial unique indexes cannot be inferred by ON CONFLICT (company_id, external_key)
-- used by apply_sync_event; switch to full unique indexes.

drop index if exists public.accounts_company_external_key_uniq;
create unique index if not exists accounts_company_external_key_uniq
  on public.accounts (company_id, external_key);

drop index if exists public.parties_company_external_key_uniq;
create unique index if not exists parties_company_external_key_uniq
  on public.parties (company_id, external_key);

drop index if exists public.journal_entries_company_external_key_uniq;
create unique index if not exists journal_entries_company_external_key_uniq
  on public.journal_entries (company_id, external_key);
