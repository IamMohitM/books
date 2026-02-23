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
