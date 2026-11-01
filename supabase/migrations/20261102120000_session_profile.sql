-- The signed-in student's profile id and handle travel in their session
-- (app_metadata, which only the server can write), so the app doesn't need to
-- look them up and profiles.user_id stays private.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(new.email);
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_class smallint;
  v_profile uuid;
  v_handle text;
begin
  -- Ignore anything that isn't a plausible year rather than failing the sign-up.
  if (v_meta ->> 'class_of') ~ '^\d{4}$' then
    v_class := (v_meta ->> 'class_of')::smallint;
    if v_class not between 2000 and 2100 then
      v_class := null;
    end if;
  end if;

  -- A shop the team created for this student.
  update public.profiles
  set user_id = new.id, claim_email = null
  where claim_email = v_email and user_id is null
  returning id, handle into v_profile, v_handle;

  if v_profile is null then
    insert into public.profiles (user_id, name, class_of, major)
    values (
      new.id,
      coalesce(
        nullif(left(trim(v_meta ->> 'full_name'), 80), ''),
        initcap(replace(replace(split_part(v_email, '@', 1), '.', ' '), '_', ' '))
      ),
      v_class,
      nullif(left(trim(v_meta ->> 'major'), 80), '')
    )
    returning id, handle into v_profile, v_handle;
  end if;

  -- An admin invite for this email becomes active on first sign-in.
  update public.admin_members
  set profile_id = v_profile, status = 'active', last_active_at = now()
  where email = v_email and profile_id is null;

  -- The app reads the profile from the session instead of looking it up.
  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('profile_id', v_profile, 'handle', v_handle)
  where id = new.id;

  return new;
end;
$$;

-- Accounts created before this.
update auth.users u
set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('profile_id', p.id, 'handle', p.handle)
from public.profiles p
where p.user_id = u.id;
