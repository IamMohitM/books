-- Ensure records created outside sync also carry deterministic external_key values.
-- This avoids duplicate rows and failed delete/update operations from desktop sync.

update public.accounts
set external_key = id::text
where external_key is null or btrim(external_key) = '';

update public.parties
set external_key = id::text
where external_key is null or btrim(external_key) = '';

update public.journal_entries
set external_key = id::text
where external_key is null or btrim(external_key) = '';

create or replace function public.ensure_external_key()
returns trigger
language plpgsql
as $$
begin
  if new.external_key is null or btrim(new.external_key) = '' then
    new.external_key := new.id::text;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_accounts_ensure_external_key on public.accounts;
create trigger trg_accounts_ensure_external_key
before insert or update on public.accounts
for each row execute function public.ensure_external_key();

drop trigger if exists trg_parties_ensure_external_key on public.parties;
create trigger trg_parties_ensure_external_key
before insert or update on public.parties
for each row execute function public.ensure_external_key();

drop trigger if exists trg_journal_entries_ensure_external_key on public.journal_entries;
create trigger trg_journal_entries_ensure_external_key
before insert or update on public.journal_entries
for each row execute function public.ensure_external_key();
