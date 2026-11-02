-- Fixes from the November 2026 security audit (web/audit.md).
--
-- * Audit log: written by the database for every admin action, never by the
--   browser, and chained with hashes so a missing or edited row shows (SEC-011).
-- * Admin team: only owners hand out the owner role or permissions they don't
--   hold themselves, and nobody changes their own role (SEC-010). Inviting
--   someone who already has an account activates them straight away (SEC-004).
-- * Suspension stops selling, not just new listings (SEC-012).
-- * One accepted offer per one-off item (SEC-021).
-- * Pay-at-pickup orders: the seller records the handover, the buyer confirms
--   collection (SEC-022).
-- * Disputes are real records students open and admins resolve (SEC-023, SEC-024).
-- * Smaller fixes: deduplicated view counts (SEC-025), photo visibility (SEC-026),
--   notification deletion by message (SEC-027), race-free caps (SEC-028), config
--   validated on publish (SEC-020), an authenticated push webhook and known push
--   services only (SEC-030, SEC-031), private typing channels (SEC-032), upload
--   records and quotas (SEC-033) and bounded saved-search alerts (PERF-002).

-- =====================================================================================
-- Audit log
-- =====================================================================================

alter table public.audit_log add column hash text, add column prev_hash text;

-- Students and admins no longer write entries. The triggers below do, as the
-- database, with the permission that the change actually needed.
drop policy "Admins record their actions" on public.audit_log;
revoke insert on public.audit_log from authenticated;
grant insert (permission, action, target, actor_name) on public.audit_log to service_role;

create or replace function public.stamp_audit_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev text;
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
  new.actor_name := coalesce(nullif(new.actor_name, ''), 'System');
  -- Each entry seals the one before it, so deleting or editing a row breaks the chain.
  -- The actor's id isn't sealed: it's cleared when their account is deleted.
  perform pg_advisory_xact_lock(hashtext('audit_log'));
  select hash into v_prev from public.audit_log order by id desc limit 1;
  new.prev_hash := v_prev;
  new.hash := encode(
    extensions.digest(
      concat_ws('|', coalesce(v_prev, ''), new.id::text, new.at::text, new.actor_name,
        new.permission, new.action, coalesce(new.target, '')),
      'sha256'
    ),
    'hex'
  );
  return new;
end;
$$;

-- Seal the entries written before the chain existed, oldest first.
do $$
declare
  r record;
  v_prev text;
begin
  for r in select * from public.audit_log order by id loop
    update public.audit_log
    set prev_hash = v_prev,
        hash = encode(
          extensions.digest(
            concat_ws('|', coalesce(v_prev, ''), r.id::text, r.at::text, r.actor_name,
              r.permission, r.action, coalesce(r.target, '')),
            'sha256'
          ),
          'hex'
        )
    where id = r.id
    returning hash into v_prev;
  end loop;
end;
$$;

-- For auditors: the first entry whose seal doesn't match, or none.
create or replace function public.verify_audit_chain()
returns table (broken_at bigint, expected_hash text, stored_hash text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r record;
  v_prev text;
  v_hash text;
begin
  if not private.has_permission('audit.view') then
    raise exception 'Only admins with audit.view can check the log' using errcode = '42501';
  end if;
  for r in select * from public.audit_log order by id loop
    v_hash := encode(
      extensions.digest(
        concat_ws('|', coalesce(v_prev, ''), r.id::text, r.at::text, r.actor_name,
          r.permission, r.action, coalesce(r.target, '')),
        'sha256'
      ),
      'hex'
    );
    if r.hash is distinct from v_hash or r.prev_hash is distinct from v_prev then
      broken_at := r.id;
      expected_hash := v_hash;
      stored_hash := r.hash;
      return next;
      return;
    end if;
    v_prev := r.hash;
  end loop;
end;
$$;

revoke all on function public.verify_audit_chain() from public, anon;
grant execute on function public.verify_audit_chain() to authenticated;

create or replace function private.audit(p_permission text, p_action text, p_target text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_log (permission, action, target, actor_name)
  values (p_permission, left(p_action, 200), left(p_target, 200), 'System');
$$;

revoke all on function private.audit(text, text, text) from public, anon, authenticated;

-- Students: verification and suspension.
create or replace function public.audit_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.verified is distinct from old.verified then
    perform private.audit('users.verify', case when new.verified then 'Verified student' else 'Removed verification' end, new.name);
  end if;
  if new.status is distinct from old.status then
    perform private.audit('users.suspend', case when new.status = 'suspended' then 'Suspended user' else 'Reinstated user' end, new.name);
  end if;
  return null;
end;
$$;

create trigger profiles_audit after update of verified, status on public.profiles
for each row execute function public.audit_profile();

-- Listings: moderation, not the seller's own edits.
create or replace function public.audit_listing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.my_profile_id();
begin
  -- Only moderators' changes; a buyer's order marking an item sold isn't moderation.
  if new.status is distinct from old.status and v_me is not null and v_me <> new.seller_id
     and private.has_permission('listings.moderate') then
    perform private.audit('listings.moderate',
      case new.status when 'hidden' then 'Hid listing' when 'removed' then 'Removed listing' when 'sold' then 'Marked sold'
        else 'Restored listing' end,
      new.title);
  end if;
  if new.promoted_until is distinct from old.promoted_until and v_me is not null then
    perform private.audit('listings.feature', case when new.promoted_until is null then 'Stopped promoting' else 'Promoted listing' end, new.title);
  end if;
  return null;
end;
$$;

create trigger listings_audit after update of status, promoted_until on public.listings
for each row execute function public.audit_listing();

create or replace function public.audit_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status and new.status <> 'open' then
    perform private.audit('listings.moderate',
      case new.status when 'dismissed' then 'Dismissed report' else 'Acted on report' end,
      coalesce((select title from public.listings where id = new.listing_id), new.listing_id));
  end if;
  return null;
end;
$$;

create trigger reports_audit after update of status on public.reports
for each row execute function public.audit_report();

-- Reports are handled by whoever is signed in; the browser doesn't name them.
create or replace function public.stamp_report_handler()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    new.handled_by := private.my_profile_id();
    new.handled_at := now();
  end if;
  return new;
end;
$$;

create trigger reports_stamp before update on public.reports
for each row execute function public.stamp_report_handler();

-- Config: every publish, and the draft (at most one "edited" entry per editor every ten minutes).
create or replace function public.audit_config_release()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.audit('settings.publish',
    'Published version ' || new.version || coalesce(': ' || nullif(new.note, ''), ''),
    nullif(array_to_string(new.changes[1:10], ', '), ''));
  return null;
end;
$$;

create trigger config_releases_audit after insert on public.config_releases
for each row execute function public.audit_config_release();

create or replace function public.audit_config_draft()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.my_profile_id();
begin
  if tg_op = 'DELETE' then
    perform private.audit('settings.edit', 'Discarded the draft');
    return null;
  end if;
  if not exists (
    select 1 from public.audit_log
    where actor_id is not distinct from v_me and permission = 'settings.edit' and action = 'Edited the draft'
      and at > now() - interval '10 minutes'
  ) then
    perform private.audit('settings.edit', 'Edited the draft');
  end if;
  return null;
end;
$$;

create trigger config_draft_audit after insert or update or delete on public.config_draft
for each row execute function public.audit_config_draft();

-- Team and roles.
create or replace function public.audit_team()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'admin_members' then
    if tg_op = 'INSERT' then
      perform private.audit('team.manage', 'Invited admin as ' || new.role_id, new.name);
    elsif tg_op = 'DELETE' then
      perform private.audit('team.manage', 'Removed admin', old.name);
    elsif new.role_id is distinct from old.role_id then
      perform private.audit('team.manage', 'Changed role to ' || new.role_id, new.name);
    end if;
  else
    if tg_op = 'INSERT' then
      perform private.audit('team.manage', 'Created role with ' || coalesce(array_to_string(new.permissions, ', '), 'no permissions'), new.name);
    elsif tg_op = 'DELETE' then
      perform private.audit('team.manage', 'Deleted role', old.name);
    elsif new.permissions is distinct from old.permissions then
      perform private.audit('team.manage', 'Set permissions to ' || coalesce(nullif(array_to_string(new.permissions, ', '), ''), 'none'), new.name);
    elsif new.name is distinct from old.name or new.description is distinct from old.description then
      perform private.audit('team.manage', 'Updated role', new.name);
    end if;
  end if;
  return null;
end;
$$;

create trigger admin_members_audit after insert or update or delete on public.admin_members
for each row execute function public.audit_team();
create trigger admin_roles_audit after insert or update or delete on public.admin_roles
for each row execute function public.audit_team();

-- =====================================================================================
-- Admin team: no escalation (SEC-010), invites for existing accounts (SEC-004)
-- =====================================================================================

create or replace function private.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_members m
    join public.profiles p on p.id = m.profile_id
    where p.user_id = (select auth.uid()) and m.status = 'active' and p.status = 'active' and m.role_id = 'owner'
  );
$$;

-- Whether the caller holds every one of these permissions.
create or replace function private.holds_all(p_permissions text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_owner() or not exists (
    select 1 from unnest(coalesce(p_permissions, '{}')) want where not private.has_permission(want)
  );
$$;

grant execute on function private.is_owner(), private.holds_all(text[]) to authenticated, service_role;

create or replace function public.guard_admin_escalation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_me uuid := private.my_profile_id();
begin
  if private.is_trusted_caller() and v_me is null then
    return coalesce(new, old);
  end if;
  if private.is_owner() then
    return coalesce(new, old);
  end if;

  if tg_table_name = 'admin_members' then
    if tg_op <> 'INSERT' and old.profile_id = v_me then
      raise exception 'You can''t change your own role or remove yourself. Ask an owner.' using errcode = '42501';
    end if;
    if (tg_op <> 'DELETE' and new.role_id = 'owner') or (tg_op <> 'INSERT' and old.role_id = 'owner') then
      raise exception 'Only owners can add, change or remove owners' using errcode = '42501';
    end if;
    if tg_op <> 'DELETE' and not private.holds_all((select permissions from public.admin_roles where id = new.role_id)) then
      raise exception 'You can only give a role whose permissions you hold yourself' using errcode = '42501';
    end if;
    if tg_op <> 'INSERT' and not private.holds_all((select permissions from public.admin_roles where id = old.role_id)) then
      raise exception 'You can only manage people whose permissions you hold yourself' using errcode = '42501';
    end if;
  else
    if (tg_op <> 'DELETE' and new.id = 'owner') or (tg_op <> 'INSERT' and old.id = 'owner') then
      raise exception 'Only owners can change the owner role' using errcode = '42501';
    end if;
    if tg_op <> 'DELETE' and not private.holds_all(new.permissions) then
      raise exception 'You can only grant permissions you hold yourself' using errcode = '42501';
    end if;
    if tg_op <> 'INSERT' and not private.holds_all(old.permissions) then
      raise exception 'You can only change roles whose permissions you hold yourself' using errcode = '42501';
    end if;
    if tg_op <> 'INSERT' and exists (select 1 from public.admin_members where role_id = old.id and profile_id = v_me) then
      raise exception 'You can''t change your own role. Ask an owner.' using errcode = '42501';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger admin_members_escalation before insert or update or delete on public.admin_members
for each row execute function public.guard_admin_escalation();
create trigger admin_roles_escalation before insert or update or delete on public.admin_roles
for each row execute function public.guard_admin_escalation();

-- An invite for someone who already has an account links and activates it now;
-- otherwise it waits for their first sign-in (handle_new_user).
create or replace function public.activate_existing_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile uuid;
begin
  if new.profile_id is not null then
    return null;
  end if;
  select pe.profile_id into v_profile
  from public.profile_emails pe
  where pe.email = new.email and not exists (select 1 from public.admin_members m where m.profile_id = pe.profile_id)
  limit 1;
  if v_profile is not null then
    update public.admin_members set profile_id = v_profile, status = 'active' where id = new.id;
  end if;
  return null;
end;
$$;

create trigger admin_members_activate after insert on public.admin_members
for each row execute function public.activate_existing_invite();

-- Invites already stuck waiting for an existing account.
update public.admin_members m
set profile_id = pe.profile_id, status = 'active'
from public.profile_emails pe
where m.profile_id is null and pe.email = m.email
  and not exists (select 1 from public.admin_members x where x.profile_id = pe.profile_id);

-- =====================================================================================
-- Suspension stops selling (SEC-012)
-- =====================================================================================

-- Suspended sellers can't renew, edit or answer offers. Moderators acting on their
-- listings aren't suspended themselves, so they still can.
create trigger listings_active before update on public.listings
for each row execute function public.require_active_student();
create trigger offers_answer_active before update on public.offers
for each row execute function public.require_active_student();

-- Suspending someone takes their live listings down and withdraws their open offers.
create or replace function public.apply_suspension()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'suspended' and old.status <> 'suspended' then
    update public.listings set status = 'hidden' where seller_id = new.id and status = 'active';
    perform set_config('hilltop.offer_cleanup', 'on', true);
    update public.offers set status = 'withdrawn', answered_at = now() where buyer_id = new.id and status = 'pending';
    update public.offers o set status = 'declined', answered_at = now()
    from public.listings l
    where l.id = o.listing_id and l.seller_id = new.id and o.status in ('pending', 'accepted');
    perform set_config('hilltop.offer_cleanup', '', true);
  end if;
  return null;
end;
$$;

create trigger profiles_suspend after update of status on public.profiles
for each row execute function public.apply_suspension();

-- Sellers already suspended before this fix.
update public.listings l set status = 'hidden'
from public.profiles p
where p.id = l.seller_id and p.status = 'suspended' and l.status = 'active';

-- =====================================================================================
-- Offers: one agreed price per one-off item (SEC-021)
-- =====================================================================================

create or replace function public.guard_offer_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_me uuid := private.my_profile_id();
  v_listing public.listings;
begin
  -- Suspensions and accepted offers close other offers as the database.
  if private.is_trusted_caller() and current_setting('hilltop.offer_cleanup', true) = 'on' then
    new.answered_at := coalesce(new.answered_at, now());
    return new;
  end if;
  if old.status <> 'pending' then
    raise exception 'This offer has already been answered' using errcode = '42501';
  end if;
  select * into v_listing from public.listings where id = old.listing_id;
  if new.status = 'withdrawn' and v_me is distinct from old.buyer_id then
    raise exception 'Only the buyer can withdraw an offer' using errcode = '42501';
  end if;
  if new.status in ('accepted', 'declined') and v_me is distinct from v_listing.seller_id then
    raise exception 'Only the seller can answer an offer' using errcode = '42501';
  end if;
  if new.status = 'pending' or new.amount is distinct from old.amount then
    raise exception 'Make a new offer instead' using errcode = '42501';
  end if;
  -- A one-off item has one agreed price. Batches (with stock) can sell to several buyers.
  if new.status = 'accepted' and v_listing.stock is null and exists (
    select 1 from public.offers where listing_id = old.listing_id and status = 'accepted' and id <> old.id
  ) then
    raise exception 'You''ve already accepted an offer on this item' using errcode = '23514';
  end if;
  new.answered_at := now();
  return new;
end;
$$;

create or replace function public.close_other_offers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'accepted' and old.status = 'pending'
     and (select stock from public.listings where id = new.listing_id) is null then
    perform set_config('hilltop.offer_cleanup', 'on', true);
    update public.offers set status = 'declined'
    where listing_id = new.listing_id and status = 'pending' and id <> new.id;
    perform set_config('hilltop.offer_cleanup', '', true);
  end if;
  return null;
end;
$$;

create trigger offers_close_others after update of status on public.offers
for each row execute function public.close_other_offers();

-- Clean up listings that already have several accepted offers: the newest stands.
alter table public.offers disable trigger user;
update public.offers o set status = 'declined'
from public.listings l
where l.id = o.listing_id and l.stock is null and o.status = 'accepted'
  and o.id <> (
    select x.id from public.offers x where x.listing_id = o.listing_id and x.status = 'accepted'
    order by x.answered_at desc nulls last, x.created_at desc limit 1
  );
alter table public.offers enable trigger user;

-- =====================================================================================
-- Orders: handover by the seller, collection by the buyer (SEC-022)
-- =====================================================================================

alter table public.disputes
  add column opened_by uuid references public.profiles (id) on delete set null,
  -- Where the order goes back to if the dispute is withdrawn or settled for the seller.
  add column pre_status public.order_status;

--   paid → ready                    seller: it's ready for pickup
--   paid/ready + handover           seller: mark_handed_over() records the meet-up
--   paid/ready → collected          buyer: confirms they have it (and paid)
--   paid/ready → cancelled          either side: the meet-up isn't happening
--   anything ↔ disputed             only through the dispute functions below
create or replace function public.move_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.my_profile_id();
begin
  if private.is_trusted_caller() and (v_me is null or current_setting('hilltop.order_move', true) = 'dispute') then
    return new;
  end if;
  if new.status = old.status then
    return new;
  end if;
  if not (
    (new.status = 'ready' and old.status = 'paid' and v_me = old.seller_id)
    or (new.status = 'collected' and old.status in ('paid', 'ready') and old.payment_kind = 'pickup' and v_me = old.buyer_id)
    or (new.status = 'cancelled' and old.status in ('paid', 'ready') and old.payment_kind = 'pickup')
  ) then
    if new.status = 'collected' and v_me = old.seller_id then
      raise exception 'The buyer confirms collection. Record the handover instead.' using errcode = '42501';
    end if;
    raise exception 'This order can''t change from % to %', old.status, new.status using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.mark_handed_over(p_order text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.my_profile_id();
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order for update;
  if v_order.id is null or v_order.seller_id is distinct from v_me then
    raise exception 'Only the seller records the handover' using errcode = '42501';
  end if;
  if v_order.status not in ('paid', 'ready') then
    raise exception 'This order is already %', v_order.status using errcode = '23514';
  end if;
  if exists (select 1 from public.profiles where id = v_me and status = 'suspended') then
    raise exception 'Your account is suspended. Contact support if you think this is a mistake.' using errcode = '23514';
  end if;
  if v_order.handed_over_at is not null then
    return;
  end if;
  perform set_config('hilltop.order_move', 'dispute', true);
  update public.orders
  set handed_over_at = now(), status = case when status = 'paid' then 'ready'::public.order_status else status end
  where id = p_order;
  perform set_config('hilltop.order_move', '', true);
  perform private.notify(v_order.buyer_id, 'order', 'Did you get it?',
    private.first_name(v_me) || ' says ' || v_order.listing_title || ' was handed over. Confirm collection, or report a problem.', '/me');
end;
$$;

revoke all on function public.mark_handed_over(text) from public, anon;
grant execute on function public.mark_handed_over(text) to authenticated;

create or replace function public.order_moved()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.my_profile_id();
  v_other uuid;
  v_listing public.listings;
  v_dispute public.disputes;
begin
  if new.status = old.status then
    return null;
  end if;
  insert into public.order_events (order_id, status, actor_id) values (new.id, new.status, v_me);
  v_other := case when v_me = new.seller_id then new.buyer_id else new.seller_id end;
  if old.status = 'disputed' then
    select * into v_dispute from public.disputes where order_id = new.id;
  end if;

  if new.status = 'ready' and old.status = 'paid' then
    perform private.notify(new.buyer_id, 'order', 'Ready for pickup',
      new.listing_title || ' is ready. Meet at ' || coalesce(new.pickup, 'the pickup spot') || ' and pay ' || private.cedis(new.due_at_pickup) || '.',
      '/me');
  elsif new.status = 'collected' and old.status in ('paid', 'ready') then
    update public.profiles set sales = sales + 1 where id = new.seller_id;
    perform private.notify(new.seller_id, 'order', 'Order complete', new.listing_title || ' was collected.', '/me?tab=selling');
    perform private.notify(new.buyer_id, 'review', 'How did it go?',
      'Rate ' || private.first_name(new.seller_id) || ' for ' || new.listing_title || '.', '/me');
  elsif new.status = 'collected' and old.status = 'disputed' and v_dispute.pre_status is distinct from 'collected' then
    -- Settled for the seller after the meet-up: it counts as a sale now.
    update public.profiles set sales = sales + 1 where id = new.seller_id;
  elsif new.status = 'cancelled' then
    -- The item goes back on the market, unless the buyer already had it.
    if v_dispute.id is null or v_dispute.pre_status in ('paid', 'ready') then
      select * into v_listing from public.listings where id = new.listing_id;
      if v_listing.id is not null and v_listing.status in ('sold', 'active') then
        update public.listings
        set stock = case when stock is null then null else stock + new.quantity end, status = 'active'
        where id = v_listing.id;
      end if;
    end if;
    if v_other is not null and old.status <> 'disputed' then
      perform private.notify(v_other, 'order', 'Order cancelled',
        private.first_name(v_me) || ' cancelled the order for ' || new.listing_title || '.',
        case when v_other = new.seller_id then '/me?tab=selling' else '/me' end);
    end if;
  end if;
  return null;
end;
$$;

-- =====================================================================================
-- Disputes (SEC-023, SEC-024)
-- =====================================================================================

-- A buyer or seller reports a problem with an order. The order is frozen as
-- "disputed" until the reporter withdraws it or the team settles it.
create or replace function public.open_dispute(p_order text, p_reason text, p_details text default '')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.my_profile_id();
  v_order public.orders;
  v_role text;
  v_dispute uuid;
  v_reasons jsonb;
  v_last timestamptz;
  v_existing public.disputes;
begin
  select * into v_order from public.orders where id = p_order for update;
  if v_order.id is null or v_me is null or v_me not in (v_order.buyer_id, v_order.seller_id) then
    raise exception 'Only the buyer or seller can report a problem with this order' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles where id = v_me and status = 'suspended') then
    raise exception 'Your account is suspended. Contact support if you think this is a mistake.' using errcode = '23514';
  end if;
  v_role := case when v_me = v_order.buyer_id then 'buyer' else 'seller' end;

  -- One dispute per order; a withdrawn one can be reopened.
  select * into v_existing from public.disputes where order_id = p_order for update;
  if v_existing.id is not null and v_existing.state <> 'withdrawn' then
    raise exception 'A problem was already reported for this order' using errcode = '23505';
  end if;
  select max(at) into v_last from public.order_events where order_id = p_order;
  if not (v_order.status in ('paid', 'ready')
          or (v_order.status = 'collected' and coalesce(v_last, v_order.updated_at) > now() - interval '7 days')) then
    raise exception 'Problems can be reported until a week after collection' using errcode = '23514';
  end if;

  select config -> 'disputes' -> 'reasons' into v_reasons from public.current_config;
  if jsonb_typeof(v_reasons) = 'array' and not exists (select 1 from jsonb_array_elements(v_reasons) r where r ->> 'id' = p_reason) then
    raise exception 'Pick one of the listed reasons' using errcode = '23514';
  end if;
  if char_length(coalesce(p_details, '')) > 2000 then
    raise exception 'Keep the details under 2000 characters' using errcode = '23514';
  end if;

  if v_existing.id is null then
    insert into public.disputes (order_id, reason, details, opened_by, pre_status)
    values (p_order, left(p_reason, 64), coalesce(p_details, ''), v_me, v_order.status)
    returning id into v_dispute;
  else
    update public.disputes
    set reason = left(p_reason, 64), details = coalesce(p_details, ''), opened_by = v_me, pre_status = v_order.status,
        state = 'open', opened_at = now(), resolved_at = null, resolved_by = null, resolution_note = null
    where id = v_existing.id
    returning id into v_dispute;
  end if;
  if coalesce(trim(p_details), '') <> '' then
    insert into public.dispute_messages (dispute_id, author_id, role, body) values (v_dispute, v_me, v_role, trim(p_details));
  end if;

  perform set_config('hilltop.order_move', 'dispute', true);
  update public.orders set status = 'disputed' where id = p_order;
  perform set_config('hilltop.order_move', '', true);

  perform private.notify(case when v_role = 'buyer' then v_order.seller_id else v_order.buyer_id end, 'dispute',
    'Problem reported', private.first_name(v_me) || ' reported a problem with ' || v_order.listing_title
      || '. The Hilltop team will look into it.',
    case when v_role = 'buyer' then '/me?tab=selling' else '/me' end);
  perform private.notify(v_me, 'dispute', 'Problem reported',
    'The Hilltop team will review ' || v_order.listing_title || ' and reply soon.',
    case when v_role = 'buyer' then '/me' else '/me?tab=selling' end);
  return v_dispute;
end;
$$;

create or replace function public.withdraw_dispute(p_order text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.my_profile_id();
  v_dispute public.disputes;
begin
  select * into v_dispute from public.disputes where order_id = p_order for update;
  if v_dispute.id is null or v_dispute.opened_by is distinct from v_me then
    raise exception 'Only the person who reported the problem can withdraw it' using errcode = '42501';
  end if;
  if v_dispute.state <> 'open' then
    raise exception 'This report was already settled' using errcode = '23514';
  end if;
  update public.disputes set state = 'withdrawn', resolved_at = now() where id = v_dispute.id;
  perform set_config('hilltop.order_move', 'dispute', true);
  update public.orders set status = coalesce(v_dispute.pre_status, 'paid') where id = p_order;
  perform set_config('hilltop.order_move', '', true);
end;
$$;

-- Buyer, seller and the team add to the conversation on a dispute.
create or replace function public.add_dispute_message(p_dispute uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.my_profile_id();
  v_order public.orders;
  v_role text;
begin
  select o.* into v_order from public.orders o join public.disputes d on d.order_id = o.id where d.id = p_dispute;
  if v_order.id is null then
    raise exception 'Dispute not found' using errcode = '42501';
  end if;
  v_role := case when v_me = v_order.buyer_id then 'buyer' when v_me = v_order.seller_id then 'seller'
    when private.has_permission('disputes.resolve') then 'admin' end;
  if v_role is null then
    raise exception 'You''re not part of this dispute' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_body, ''))) not between 1 and 2000 then
    raise exception 'Write a message of up to 2000 characters' using errcode = '23514';
  end if;
  insert into public.dispute_messages (dispute_id, author_id, role, body) values (p_dispute, v_me, v_role, trim(p_body));
end;
$$;

-- The team settles a dispute: for the buyer ("refunded") or for the seller ("released").
-- Pay-at-pickup orders hold no money, so settling for the buyer cancels the order.
create or replace function public.resolve_dispute(p_dispute uuid, p_outcome text, p_note text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dispute public.disputes;
  v_order public.orders;
  v_next public.order_status;
begin
  if not private.has_permission('disputes.resolve') then
    raise exception 'Only admins with disputes.resolve can settle disputes' using errcode = '42501';
  end if;
  if p_outcome not in ('refunded', 'released') then
    raise exception 'Settle for the buyer (refunded) or the seller (released)' using errcode = '22023';
  end if;
  select * into v_dispute from public.disputes where id = p_dispute for update;
  if v_dispute.id is null then
    raise exception 'Dispute not found' using errcode = '42501';
  end if;
  if v_dispute.state <> 'open' then
    raise exception 'This dispute is already resolved' using errcode = '23514';
  end if;
  select * into v_order from public.orders where id = v_dispute.order_id for update;

  v_next := case
    when p_outcome = 'released' then coalesce(v_dispute.pre_status, 'ready')
    when v_order.paid_in_app > 0 then 'refunded'
    else 'cancelled'
  end;

  update public.disputes
  set state = p_outcome::public.dispute_state, resolved_by = private.my_profile_id(), resolved_at = now(),
      resolution_note = nullif(left(trim(coalesce(p_note, '')), 1000), '')
  where id = p_dispute;
  if coalesce(trim(p_note), '') <> '' then
    insert into public.dispute_messages (dispute_id, author_id, role, body)
    values (p_dispute, private.my_profile_id(), 'admin', left(trim(p_note), 2000));
  end if;

  perform set_config('hilltop.order_move', 'dispute', true);
  update public.orders set status = v_next where id = v_order.id;
  perform set_config('hilltop.order_move', '', true);

  perform private.notify(v_order.buyer_id, 'dispute',
    case when p_outcome = 'refunded' then 'Decided in your favour' else 'Dispute closed' end,
    'Hilltop reviewed ' || v_order.listing_title || '.' || coalesce(' ' || nullif(trim(p_note), ''), ''), '/me');
  perform private.notify(v_order.seller_id, 'dispute',
    case when p_outcome = 'released' then 'Decided in your favour' else 'Dispute closed' end,
    'Hilltop reviewed ' || v_order.listing_title || '.' || coalesce(' ' || nullif(trim(p_note), ''), ''), '/me?tab=selling');
  perform private.audit('disputes.resolve',
    case when p_outcome = 'refunded' then 'Settled dispute for the buyer' else 'Settled dispute for the seller' end, v_order.id);
end;
$$;

-- Refunds and payout releases move held money, which only exists once in-app
-- payments are live. Until then this refuses, so the portal never shows a refund
-- that didn't happen.
create or replace function public.settle_order(p_order text, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  if not private.has_permission('orders.refund') then
    raise exception 'Only admins with orders.refund can refund or release payments' using errcode = '42501';
  end if;
  if p_action not in ('refund', 'release') then
    raise exception 'Choose refund or release' using errcode = '22023';
  end if;
  select * into v_order from public.orders where id = p_order for update;
  if v_order.id is null then
    raise exception 'Order not found' using errcode = '42501';
  end if;
  if v_order.payment_kind = 'pickup' or v_order.paid_in_app = 0 then
    raise exception 'This order was paid at pickup, so Hilltop holds nothing to %', p_action using errcode = '23514';
  end if;
  if v_order.status in ('refunded', 'collected', 'cancelled') then
    raise exception 'This payment was already settled' using errcode = '23514';
  end if;
  if v_order.status = 'disputed' then
    raise exception 'Settle the dispute instead' using errcode = '23514';
  end if;
  perform set_config('hilltop.order_move', 'dispute', true);
  update public.orders set status = case when p_action = 'refund' then 'refunded'::public.order_status else 'collected'::public.order_status end
  where id = p_order;
  perform set_config('hilltop.order_move', '', true);
  perform private.audit('orders.refund', case when p_action = 'refund' then 'Refunded order' else 'Released payout' end, p_order);
end;
$$;

revoke all on function public.open_dispute(text, text, text), public.withdraw_dispute(text),
  public.add_dispute_message(uuid, text), public.resolve_dispute(uuid, text, text), public.settle_order(text, text)
  from public, anon;
grant execute on function public.open_dispute(text, text, text), public.withdraw_dispute(text),
  public.add_dispute_message(uuid, text), public.resolve_dispute(uuid, text, text), public.settle_order(text, text)
  to authenticated;

grant select (opened_by, pre_status) on public.disputes to authenticated;

-- =====================================================================================
-- Config is validated when it's published (SEC-020)
-- =====================================================================================

create or replace function private.config_number(p_config jsonb, p_path text[], p_min numeric, p_max numeric)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v jsonb := p_config #> p_path;
begin
  if v is null or jsonb_typeof(v) is distinct from 'number' or (v #>> '{}')::numeric not between p_min and p_max then
    raise exception 'Config % must be a number from % to %', array_to_string(p_path, '.'), p_min, p_max using errcode = '23514';
  end if;
end;
$$;

create or replace function public.validate_config_release()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_key text;
  -- Sections the database reads must be there; newer optional ones fall back to the app's defaults.
  v_required text[] := array['brand', 'access', 'payments', 'offers', 'listings', 'saved', 'disputes', 'categories'];
  v_allowed text[] := v_required || array['version', 'publishedAt', 'fees', 'protection', 'boostPlans', 'pickupSpots', 'meetups',
    'conditions', 'events', 'features', 'reports', 'ranking', 'featured', 'search', 'announcement'];
begin
  -- Permission first, so nobody learns the rules without being allowed to publish.
  if not private.is_trusted_caller() and not private.has_permission('settings.publish') then
    raise exception 'Only admins with settings.publish can publish' using errcode = '42501';
  end if;
  for v_key in select jsonb_object_keys(new.config) loop
    if not v_key = any (v_allowed) then
      raise exception 'Config has an unknown section "%"', v_key using errcode = '23514';
    end if;
  end loop;
  foreach v_key in array v_required loop
    if not new.config ? v_key then
      raise exception 'Config is missing the "%" section', v_key using errcode = '23514';
    end if;
  end loop;
  foreach v_key in array array['brand', 'access', 'fees', 'payments', 'protection', 'meetups', 'events', 'features', 'offers',
    'listings', 'saved', 'reports', 'ranking', 'featured', 'disputes', 'search', 'announcement'] loop
    if new.config ? v_key and jsonb_typeof(new.config -> v_key) is distinct from 'object' then
      raise exception 'Config "%" must be an object', v_key using errcode = '23514';
    end if;
  end loop;
  foreach v_key in array array['boostPlans', 'pickupSpots', 'conditions', 'categories'] loop
    if new.config ? v_key and jsonb_typeof(new.config -> v_key) is distinct from 'array' then
      raise exception 'Config "%" must be a list', v_key using errcode = '23514';
    end if;
  end loop;

  -- What the database itself enforces from the config.
  if jsonb_typeof(new.config #> '{access,allowedEmailDomains}') is distinct from 'array'
     or jsonb_array_length(new.config #> '{access,allowedEmailDomains}') = 0
     or exists (select 1 from jsonb_array_elements(new.config #> '{access,allowedEmailDomains}') d
                where jsonb_typeof(d) is distinct from 'string' or (d #>> '{}') !~ '^[a-z0-9.-]+\.[a-z]{2,}$') then
    raise exception 'Config access.allowedEmailDomains must list at least one email domain' using errcode = '23514';
  end if;
  if jsonb_typeof(new.config #> '{payments,inApp}') is distinct from 'boolean' then
    raise exception 'Config payments.inApp must be true or false' using errcode = '23514';
  end if;
  perform private.config_number(new.config, '{listings,maxPrice}', 0, 1000000);
  perform private.config_number(new.config, '{listings,maxActive}', 0, 500);
  perform private.config_number(new.config, '{listings,expiryDays}', 0, 365);
  perform private.config_number(new.config, '{offers,minRatio}', 0, 1);
  perform private.config_number(new.config, '{saved,maxItems}', 0, 5000);
  perform private.config_number(new.config, '{saved,maxSearches}', 0, 200);
  if jsonb_typeof(new.config #> '{listings,bannedWords}') is distinct from 'array' then
    raise exception 'Config listings.bannedWords must be a list' using errcode = '23514';
  end if;
  if jsonb_typeof(new.config #> '{disputes,reasons}') is distinct from 'array' or jsonb_array_length(new.config #> '{disputes,reasons}') = 0 then
    raise exception 'Config disputes.reasons must list at least one reason' using errcode = '23514';
  end if;
  if jsonb_array_length(new.config -> 'categories') = 0 then
    raise exception 'Config needs at least one category' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Named to run before config_releases_stamp, so a bad config never takes a version number.
create trigger config_releases_check before insert on public.config_releases
for each row execute function public.validate_config_release();

-- =====================================================================================
-- Smaller fixes
-- =====================================================================================

-- SEC-025: a view counts once per viewer per listing every six hours.
create table private.listing_view_hits (
  listing_id text not null,
  viewer text not null,
  at timestamptz not null default now(),
  primary key (listing_id, viewer)
);

create or replace function public.count_listing_view()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_headers json := nullif(current_setting('request.headers', true), '')::json;
  v_viewer text;
  v_counted boolean;
begin
  v_viewer := coalesce(
    private.my_profile_id()::text,
    'ip:' || md5(coalesce(
      v_headers ->> 'cf-connecting-ip',
      trim(split_part(v_headers ->> 'x-forwarded-for', ',', 1)),
      v_headers ->> 'x-real-ip',
      'unknown'
    ))
  );
  insert into private.listing_view_hits as h (listing_id, viewer) values (new.listing_id, v_viewer)
  on conflict (listing_id, viewer) do update set at = now() where h.at < now() - interval '6 hours'
  returning true into v_counted;
  if coalesce(v_counted, false) then
    update public.listings set views = views + 1 where id = new.listing_id and status = 'active';
  end if;
  -- Keep the table small.
  if random() < 0.01 then
    delete from private.listing_view_hits where at < now() - interval '1 day';
  end if;
  return null;
end;
$$;

-- SEC-026: photos are visible exactly when their listing is.
drop policy "Photos are visible with their listing" on public.listing_photos;
create policy "Photos are visible with their listing" on public.listing_photos
  for select to anon, authenticated
  using (exists (
    select 1 from public.listings l
    where l.id = listing_id
      and (l.status in ('active', 'sold') or l.seller_id = private.my_profile_id() or private.has_permission('listings.view'))
  ));

-- SEC-027: message notifications know their message, so deleting one removes only its own.
alter table public.notifications add column message_id uuid references public.messages (id) on delete cascade;
create index notifications_message_idx on public.notifications (message_id) where message_id is not null;

create or replace function public.notify_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_to uuid;
begin
  select case when c.buyer_id = new.sender_id then c.seller_id else c.buyer_id end
  into v_to
  from public.conversations c
  where c.id = new.conversation_id;
  if v_to is null then
    return null;
  end if;
  insert into public.notifications (profile_id, kind, title, body, href, message_id)
  values (v_to, 'message', left(coalesce(private.first_name(new.sender_id), 'New message'), 120), left(new.body, 500),
    '/inbox?c=' || new.conversation_id, new.id);
  return null;
end;
$$;

create or replace function public.guard_message_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.my_profile_id();
begin
  if v_me is null then
    return new;
  end if;
  -- Read receipts are for the recipient; the text is the sender's.
  if new.read_at is distinct from old.read_at and v_me = old.sender_id then
    raise exception 'Only the recipient marks a message read' using errcode = '42501';
  end if;
  if new.body is not distinct from old.body and new.deleted_at is not distinct from old.deleted_at then
    return new;
  end if;
  if v_me <> old.sender_id then
    raise exception 'Only the sender can change a message' using errcode = '42501';
  end if;
  if old.deleted_at is not null then
    raise exception 'This message was already deleted' using errcode = '23514';
  end if;

  if new.deleted_at is not null then
    insert into public.message_revisions (message_id, body, kind) values (old.id, old.body, 'deleted');
    -- The notification quoted it. Older ones (from before message_id) still match by text.
    delete from public.notifications
    where message_id = old.id
       or (message_id is null and href = '/inbox?c=' || old.conversation_id and body = left(old.body, 500)
           and created_at between old.created_at - interval '5 seconds' and old.created_at + interval '5 seconds');
    new.body := '';
    new.deleted_at := now();
    new.edited_at := old.edited_at;
  else
    if now() - old.created_at > interval '15 minutes' then
      raise exception 'Messages can be edited for 15 minutes after sending' using errcode = '23514';
    end if;
    insert into public.message_revisions (message_id, body, kind) values (old.id, old.body, 'edited');
    update public.notifications set body = left(new.body, 500) where message_id = old.id;
    new.edited_at := now();
  end if;
  return new;
end;
$$;

-- SEC-028: caps are checked one request at a time per student.
create or replace function public.check_listing_rules()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_rules jsonb;
  v_cap integer;
  v_expiry integer;
  v_active integer;
  v_word text;
  v_text text;
begin
  if private.is_trusted_caller() or private.has_permission('listings.moderate') then
    return new;
  end if;
  select config -> 'listings' into v_rules from public.current_config;
  if v_rules is null then
    return new;
  end if;

  if (v_rules ->> 'maxPrice') is not null and new.price > (v_rules ->> 'maxPrice')::numeric then
    raise exception 'The highest price allowed is GH₵%', v_rules ->> 'maxPrice' using errcode = '23514';
  end if;

  v_text := lower(new.title || ' ' || new.description);
  for v_word in select lower(jsonb_array_elements_text(coalesce(v_rules -> 'bannedWords', '[]'::jsonb))) loop
    if position(v_word in v_text) > 0 then
      raise exception 'This listing contains words that aren''t allowed on Hilltop' using errcode = '23514';
    end if;
  end loop;

  v_cap := coalesce((v_rules ->> 'maxActive')::integer, 0);
  v_expiry := coalesce((v_rules ->> 'expiryDays')::integer, 0);
  if v_cap > 0 and new.status = 'active'
     and (tg_op = 'INSERT' or old.status <> 'active' or new.posted_at is distinct from old.posted_at) then
    perform pg_advisory_xact_lock(hashtext('listing_cap:' || new.seller_id::text));
    select count(*) into v_active
    from public.listings
    where seller_id = new.seller_id and status = 'active' and id <> new.id
      and (v_expiry = 0 or posted_at > now() - make_interval(days => v_expiry));
    if v_active >= v_cap then
      raise exception 'You can have % active listings at a time', v_cap using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.check_saved_cap()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_cap integer;
  v_count integer;
begin
  if private.is_trusted_caller() then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext(tg_table_name || ':' || new.profile_id::text));
  if tg_table_name = 'saved_searches' then
    select coalesce((config -> 'saved' ->> 'maxSearches')::integer, 20) into v_cap from public.current_config;
    select count(*) into v_count from public.saved_searches where profile_id = new.profile_id;
    if coalesce(v_cap, 20) > 0 and v_count >= coalesce(v_cap, 20) then
      raise exception 'You can save up to % searches. Remove one to save this.', coalesce(v_cap, 20) using errcode = '23514';
    end if;
  else
    select coalesce((config -> 'saved' ->> 'maxItems')::integer, 200) into v_cap from public.current_config;
    select count(*) into v_count from public.saved_listings where profile_id = new.profile_id;
    if coalesce(v_cap, 200) > 0 and v_count >= coalesce(v_cap, 200) then
      raise exception 'You can save up to % items. Remove some to save more.', coalesce(v_cap, 200) using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

-- SEC-030: the push webhook proves it's the database with a shared secret. The
-- marketplace Worker needs the same value as its PUSH_WEBHOOK_SECRET secret
-- (read it with: select value from private.settings where key = 'push_secret').
insert into private.settings (key, value) values ('push_secret', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (key) do nothing;

create or replace function public.request_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select value into v_url from private.settings where key = 'push_url';
  select value into v_secret from private.settings where key = 'push_secret';
  if v_url is null or not exists (select 1 from public.push_subscriptions where profile_id = new.profile_id) then
    return null;
  end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('id', new.id),
    headers := jsonb_build_object('content-type', 'application/json', 'x-hilltop-webhook', coalesce(v_secret, '')),
    timeout_milliseconds := 5000
  );
  return null;
end;
$$;

-- SEC-031: subscriptions only point at the browsers' push services, a few per student.
delete from public.push_subscriptions
where endpoint !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com|web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com|android\.googleapis\.com)/';
alter table public.push_subscriptions add constraint push_subscriptions_known_service check (
  endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com|web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com|android\.googleapis\.com)/'
  and char_length(endpoint) <= 1000 and char_length(p256dh) <= 200 and char_length(auth) <= 100
);

create or replace function public.cap_push_subscriptions()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_trusted_caller() and private.my_profile_id() is null then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('push:' || new.profile_id::text));
  if (select count(*) from public.push_subscriptions where profile_id = new.profile_id and endpoint <> new.endpoint) >= 10 then
    raise exception 'Notifications are on for too many browsers. Turn them off on one you don''t use.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger push_subscriptions_cap before insert on public.push_subscriptions
for each row execute function public.cap_push_subscriptions();

-- SEC-032: typing indicators use private Realtime channels named "typing:<conversation>",
-- which only the two people in the conversation can join.
do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute $p$
      create policy "Participants share typing" on realtime.messages
        for select to authenticated
        using (
          realtime.messages.extension = 'broadcast'
          and realtime.topic() like 'typing:%'
          and exists (
            select 1 from public.conversations c
            where c.id::text = substr(realtime.topic(), 8) and private.my_profile_id() in (c.buyer_id, c.seller_id)
          )
        )
    $p$;
    execute $p$
      create policy "Participants send typing" on realtime.messages
        for insert to authenticated
        with check (
          realtime.messages.extension = 'broadcast'
          and realtime.topic() like 'typing:%'
          and exists (
            select 1 from public.conversations c
            where c.id::text = substr(realtime.topic(), 8) and private.my_profile_id() in (c.buyer_id, c.seller_id)
          )
        )
    $p$;
  end if;
end;
$$;

-- SEC-033: every upload is recorded against the student, which caps how many they
-- can make and lets a daily job delete photos no listing uses.
create table public.photo_uploads (
  key text primary key check (key ~ '^listings/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  bytes integer not null check (bytes between 1 and 3145728),
  attached boolean not null default false,
  created_at timestamptz not null default now()
);

create index photo_uploads_profile_idx on public.photo_uploads (profile_id, created_at desc);
create index photo_uploads_orphan_idx on public.photo_uploads (created_at) where not attached;

alter table public.photo_uploads enable row level security;
grant select, insert (key, profile_id, bytes) on public.photo_uploads to authenticated;
create policy "Own uploads" on public.photo_uploads
  for all to authenticated using (profile_id = private.my_profile_id()) with check (profile_id = private.my_profile_id());

create or replace function public.limit_uploads()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_trusted_caller() and private.my_profile_id() is null then
    return new;
  end if;
  if exists (select 1 from public.profiles where id = new.profile_id and status = 'suspended') then
    raise exception 'Your account is suspended. Contact support if you think this is a mistake.' using errcode = '23514';
  end if;
  perform pg_advisory_xact_lock(hashtext('uploads:' || new.profile_id::text));
  if (select count(*) from public.photo_uploads where profile_id = new.profile_id and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'That''s a lot of photos. Wait a while before adding more.' using errcode = '23514';
  end if;
  if (select count(*) from public.photo_uploads where profile_id = new.profile_id and not attached) >= 40 then
    raise exception 'Publish or discard your drafts before adding more photos.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger photo_uploads_limit before insert on public.photo_uploads
for each row execute function public.limit_uploads();

-- A photo on a listing is in use; one taken off a listing (or whose listing was
-- deleted) waits a day, then the cleanup job removes it from storage.
-- The storage key at the end of a photo's public URL.
create or replace function private.photo_key(p_url text)
returns text
language sql
immutable
set search_path = ''
as $$
  select substring(p_url from '(listings/[0-9a-f-]{36}/[0-9a-f-]{36}\.(?:jpg|png|webp))$');
$$;

create or replace function public.track_photo_use()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    update public.photo_uploads set attached = true where key = private.photo_key(new.url);
  end if;
  if tg_op in ('DELETE', 'UPDATE') then
    update public.photo_uploads set attached = false, created_at = now()
    where key = private.photo_key(old.url) and not exists (select 1 from public.listing_photos p where p.url = old.url);
  end if;
  return null;
end;
$$;

create trigger listing_photos_track after insert or update of url or delete on public.listing_photos
for each row execute function public.track_photo_use();

-- PERF-002: a new listing only checks saved searches that could match its category,
-- and sends at most 200 alerts.
create or replace function public.alert_saved_searches()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_search record;
  v_sent integer := 0;
begin
  -- Only when a listing is first published, not when it comes back after a cancelled order.
  if new.status <> 'active' or (tg_op = 'UPDATE' and old.status <> 'draft') then
    return null;
  end if;
  for v_search in
    select s.id, s.profile_id, s.label, s.query
    from public.saved_searches s
    where s.alerts and s.profile_id <> new.seller_id
      and (s.query not like '%category=%' or s.query like '%category=' || new.category || '%')
    order by s.created_at desc
  loop
    if private.matches_search(new, v_search.query) then
      perform private.notify(
        v_search.profile_id, 'alert', 'New match for “' || v_search.label || '”',
        new.title || ', ' || private.cedis(new.price), '/listing/' || new.id
      );
      v_sent := v_sent + 1;
      exit when v_sent >= 200;
    end if;
  end loop;
  return null;
end;
$$;

-- Orders from a suspended seller can't be placed even if a listing slipped through.
create or replace function public.require_active_seller()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.listings l join public.profiles p on p.id = l.seller_id
    where l.id = new.listing_id and p.status = 'suspended'
  ) then
    raise exception 'This item is no longer available' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger orders_seller_active before insert on public.orders
for each row execute function public.require_active_seller();
