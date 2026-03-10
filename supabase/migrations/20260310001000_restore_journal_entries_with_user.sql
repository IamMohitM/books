-- Restore journal_entries_with_user view dropped in submitted-only migration

drop view if exists public.journal_entries_with_user;
create view public.journal_entries_with_user as
select
  je.*,
  p.email as created_by_email,
  p.full_name as created_by_name
from public.journal_entries je
left join public.profiles p on p.id = je.created_by;
