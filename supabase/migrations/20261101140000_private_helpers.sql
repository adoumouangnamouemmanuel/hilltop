-- Move the helpers used by security policies out of the API.
--
-- Functions in the public schema are callable at /rest/v1/rpc/<name>. These only
-- describe the caller, but they don't need to be part of the API, so they move to
-- a "private" schema that the API doesn't expose. Policies keep working: they
-- reference functions by id, not by name. Functions whose bodies call the helpers
-- by name are recreated below.

create schema if not exists private;
grant usage on schema private to anon, authenticated;

alter function public.my_profile_id() set schema private;
alter function public.has_permission(text) set schema private;
alter function public.is_admin() set schema private;
alter function public.is_trusted_caller() set schema private;

-- Admins read claim emails on the server with the secret key instead.
drop function public.profile_claim_emails();

-- The portal's "what can I do" check stays in the API but no longer needs elevated
-- rights: it reads only the caller's own membership, which row-level security allows.
create or replace function public.my_permissions()
returns text[]
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (select case when r.id = 'owner' then array['*'] else r.permissions end
     from public.admin_members m
     join public.admin_roles r on r.id = m.role_id
     where m.profile_id = private.my_profile_id() and m.status = 'active'),
    '{}'
  );
$$;
revoke all on function public.my_permissions() from public, anon;
grant execute on function public.my_permissions() to authenticated;

-- Recreated with the new helper names ----------------------------------------------

create or replace function public.guard_profile_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_trusted_caller() then
    return new;
  end if;
  if new.verified is distinct from old.verified and not private.has_permission('users.verify') then
    raise exception 'Only admins with users.verify can change verification' using errcode = '42501';
  end if;
  if new.status is distinct from old.status and not private.has_permission('users.suspend') then
    raise exception 'Only admins with users.suspend can suspend or reinstate' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.guard_listing_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_trusted_caller() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'active') then
      raise exception 'New listings start as a draft or active' using errcode = '42501';
    end if;
    new.posted_at := now();
    new.views := 0;
    new.saves := 0;
    new.promoted_until := null;
    return new;
  end if;

  if new.seller_id is distinct from old.seller_id then
    raise exception 'A listing can''t change owner' using errcode = '42501';
  end if;
  if new.status is distinct from old.status
     and (new.status in ('hidden', 'removed') or old.status in ('hidden', 'removed'))
     and not private.has_permission('listings.moderate') then
    raise exception 'Only moderators can hide, remove or restore listings' using errcode = '42501';
  end if;
  -- Renewing moves a listing to the top; it can't be backdated or pushed into the future.
  if new.posted_at is distinct from old.posted_at then
    new.posted_at := now();
  end if;
  return new;
end;
$$;

create or replace function public.guard_offer_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_me uuid := private.my_profile_id();
  v_seller uuid;
begin
  if old.status <> 'pending' then
    raise exception 'This offer has already been answered' using errcode = '42501';
  end if;
  select seller_id into v_seller from public.listings where id = old.listing_id;
  if new.status = 'withdrawn' and v_me is distinct from old.buyer_id then
    raise exception 'Only the buyer can withdraw an offer' using errcode = '42501';
  end if;
  if new.status in ('accepted', 'declined') and v_me is distinct from v_seller then
    raise exception 'Only the seller can answer an offer' using errcode = '42501';
  end if;
  if new.status = 'pending' or new.amount is distinct from old.amount then
    raise exception 'Make a new offer instead' using errcode = '42501';
  end if;
  new.answered_at := now();
  return new;
end;
$$;

create or replace function public.stamp_config_release()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('config_releases'));
  select coalesce(max(version), 0) + 1 into new.version from public.config_releases;
  new.published_at := now();
  new.published_by := private.my_profile_id();
  new.published_by_name := coalesce(
    (select coalesce(m.name, p.name)
     from public.profiles p left join public.admin_members m on m.profile_id = p.id
     where p.id = new.published_by),
    new.published_by_name,
    'System'
  );
  return new;
end;
$$;

create or replace function public.stamp_config_draft()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_by := private.my_profile_id();
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.stamp_audit_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.at := now();
  new.actor_id := private.my_profile_id();
  -- The name the team knows them by (from the invite), else their profile name.
  if new.actor_id is not null then
    select coalesce(m.name, p.name) into new.actor_name
    from public.profiles p
    left join public.admin_members m on m.profile_id = p.id
    where p.id = new.actor_id;
  end if;
  return new;
end;
$$;
