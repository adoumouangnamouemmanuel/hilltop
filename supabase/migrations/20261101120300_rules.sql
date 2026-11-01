-- Rules enforced by the database, whatever the client sends.

-- Trusted callers: migrations and seeds (postgres), the server's secret key
-- (service_role) and security-definer functions, which run as their owner.
create or replace function public.is_trusted_caller()
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_user in ('postgres', 'supabase_admin', 'service_role');
$$;

-- Sign-up: link to a waiting shop or admin invite, or create a profile ----------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(new.email);
  v_profile uuid;
begin
  -- A shop the team created for this student.
  update public.profiles
  set user_id = new.id, claim_email = null
  where claim_email = v_email and user_id is null
  returning id into v_profile;

  if v_profile is null then
    insert into public.profiles (user_id, name)
    values (
      new.id,
      coalesce(
        nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
        initcap(replace(replace(split_part(v_email, '@', 1), '.', ' '), '_', ' '))
      )
    )
    returning id into v_profile;
  end if;

  -- An admin invite for this email becomes active on first sign-in.
  update public.admin_members
  set profile_id = v_profile, status = 'active', last_active_at = now()
  where email = v_email and profile_id is null;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Profiles: verification and suspension are admin-only ----------------------

create or replace function public.guard_profile_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_trusted_caller() then
    return new;
  end if;
  if new.verified is distinct from old.verified and not public.has_permission('users.verify') then
    raise exception 'Only admins with users.verify can change verification' using errcode = '42501';
  end if;
  if new.status is distinct from old.status and not public.has_permission('users.suspend') then
    raise exception 'Only admins with users.suspend can suspend or reinstate' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_guard before update on public.profiles
for each row execute function public.guard_profile_update();

-- Listings: owners can't touch moderation states or counters -----------------

create or replace function public.guard_listing_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_trusted_caller() then
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
     and not public.has_permission('listings.moderate') then
    raise exception 'Only moderators can hide, remove or restore listings' using errcode = '42501';
  end if;
  -- Renewing moves a listing to the top; it can't be backdated or pushed into the future.
  if new.posted_at is distinct from old.posted_at then
    new.posted_at := now();
  end if;
  return new;
end;
$$;

create trigger listings_guard before insert or update on public.listings
for each row execute function public.guard_listing_write();

-- Saves counter ----------------------------------------------------------------

create or replace function public.count_saves()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.listings set saves = saves + 1 where id = new.listing_id;
  else
    update public.listings set saves = greatest(saves - 1, 0) where id = old.listing_id;
  end if;
  return null;
end;
$$;

create trigger saved_listings_count after insert or delete on public.saved_listings
for each row execute function public.count_saves();

-- Offers: buyers withdraw, sellers accept or decline, once --------------------

create or replace function public.guard_offer_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_me uuid := public.my_profile_id();
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

create trigger offers_guard before update on public.offers
for each row execute function public.guard_offer_update();

-- Conversations stay sorted by their latest message ---------------------------

create or replace function public.bump_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  return null;
end;
$$;

create trigger messages_bump after insert on public.messages
for each row execute function public.bump_conversation();

-- Config releases are numbered and signed by the server -----------------------

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
  new.published_by := public.my_profile_id();
  new.published_by_name := coalesce((select name from public.profiles where id = new.published_by), new.published_by_name, 'System');
  return new;
end;
$$;

create trigger config_releases_stamp before insert on public.config_releases
for each row execute function public.stamp_config_release();

create or replace function public.stamp_config_draft()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_by := public.my_profile_id();
  new.updated_at := now();
  return new;
end;
$$;

create trigger config_draft_stamp before insert or update on public.config_draft
for each row execute function public.stamp_config_draft();

-- Audit entries are attributed by the server and can't be changed -------------

create or replace function public.stamp_audit_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.at := now();
  new.actor_id := public.my_profile_id();
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

create trigger audit_log_stamp before insert on public.audit_log
for each row execute function public.stamp_audit_entry();

-- Admin team safeguards ----------------------------------------------------------

create or replace function public.guard_admin_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.system then
      raise exception 'Built-in roles can''t be deleted' using errcode = '42501';
    end if;
    return old;
  end if;
  if new.id is distinct from old.id and old.system then
    raise exception 'Built-in roles keep their id' using errcode = '42501';
  end if;
  new.system := old.system;
  return new;
end;
$$;

create trigger admin_roles_guard before update or delete on public.admin_roles
for each row execute function public.guard_admin_role();

-- The team always keeps at least one active owner.
create or replace function public.keep_an_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.admin_members where role_id = 'owner' and status = 'active')
     and exists (select 1 from public.admin_members) then
    raise exception 'The team needs at least one active owner' using errcode = '42501';
  end if;
  return null;
end;
$$;

create constraint trigger admin_members_keep_owner
after update or delete on public.admin_members
deferrable initially deferred
for each row execute function public.keep_an_owner();

-- Seller ratings, from public reviews ------------------------------------------

create view public.seller_ratings with (security_invoker = true) as
select seller_id, round(avg(rating)::numeric, 1) as rating, count(*)::integer as reviews
from public.reviews
group by seller_id;
