-- Allow desktop admin token flow to invite collaborators by email.
create or replace function public.admin_invite_company_user(
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
$$;

grant execute on function public.admin_invite_company_user(uuid, text, text)
  to service_role;
