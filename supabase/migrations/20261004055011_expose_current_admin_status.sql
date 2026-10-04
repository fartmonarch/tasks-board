-- Expose only the current caller's administrator status to the client.
-- The private registry remains inaccessible through the Data API.
create function public.current_user_is_system_admin()
returns boolean
language sql stable security invoker set search_path = ''
as $$
  select coalesce(private.is_system_admin(), false);
$$;

revoke all on function public.current_user_is_system_admin()
  from public, anon, authenticated, service_role;
grant execute on function public.current_user_is_system_admin()
  to authenticated;

comment on function public.current_user_is_system_admin() is
  'Returns the current authenticated caller administrator status; it does not list administrators.';
