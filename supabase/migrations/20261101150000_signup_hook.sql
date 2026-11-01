-- Only allowed email domains can create an account.
--
-- Supabase Auth calls this before creating any user (Auth Hooks → "Before User
-- Created"). The allowed domains come from the published platform config, so
-- changing them in the admin portal applies immediately. People with a pending
-- admin invite are always allowed, whatever their domain.

create or replace function private.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(event -> 'user' ->> 'email'));
  v_domain text := split_part(v_email, '@', 2);
  v_allowed jsonb;
begin
  if v_email is null or v_email = '' or v_domain = '' then
    return jsonb_build_object('error', jsonb_build_object('http_code', 400, 'message', 'An email address is required.'));
  end if;

  if exists (select 1 from public.admin_members where email = v_email) then
    return '{}'::jsonb;
  end if;

  select config -> 'access' -> 'allowedEmailDomains' into v_allowed
  from public.config_releases
  order by version desc
  limit 1;

  -- No published config yet: fall back to the default school domain.
  if v_allowed is null or jsonb_typeof(v_allowed) <> 'array' then
    v_allowed := '["ashesi.edu.gh"]'::jsonb;
  end if;

  if exists (select 1 from jsonb_array_elements_text(v_allowed) d where lower(d) = v_domain) then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error',
    jsonb_build_object('http_code', 403, 'message', 'Use your school email address to join.')
  );
end;
$$;

grant usage on schema private to supabase_auth_admin;
grant execute on function private.hook_before_user_created(jsonb) to supabase_auth_admin;
revoke execute on function private.hook_before_user_created(jsonb) from public, anon, authenticated;
