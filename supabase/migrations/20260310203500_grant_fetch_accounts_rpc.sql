-- Allow clients to execute account fetch RPC
grant execute on function public.fetch_accounts_for_company(uuid) to anon, authenticated;
