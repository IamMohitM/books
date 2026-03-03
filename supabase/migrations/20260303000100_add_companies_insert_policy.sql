-- Add INSERT policy for companies table to allow sync initialization
-- The service_role key can insert companies, which is needed for cloud sync

drop policy if exists "companies_insert_service_role" on public.companies;
create policy "companies_insert_service_role" on public.companies
for insert with check (true);
