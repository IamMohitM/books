-- Add DELETE policy for company_users to allow owners to remove collaborators

drop policy if exists "company_users_delete_owner" on public.company_users;
create policy "company_users_delete_owner" on public.company_users
for delete using (
  exists (
    select 1 from public.company_users cu
    where cu.company_id = company_users.company_id
      and cu.user_id = auth.uid()
      and cu.role = 'owner'
  )
);
