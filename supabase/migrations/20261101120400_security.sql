-- Who can read and write what, from the browser.
--
-- anon          logged-out visitors (browsing)
-- authenticated signed-in students and admins
-- The server's secret key (service_role) bypasses all of this; it's used only by
-- trusted server code.
--
-- Pattern: revoke everything, grant the columns a role may touch, then use
-- row-level policies to decide which rows. Admin powers come from has_permission(),
-- which reads the admin team and roles configured in the portal.

revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated, public;

grant usage on schema public to anon, authenticated;

-- Helpers used inside policies must be callable.
grant execute on function public.my_profile_id(), public.has_permission(text), public.is_admin(),
  public.my_permissions(), public.is_trusted_caller() to anon, authenticated;

alter table public.profiles enable row level security;
alter table public.listings enable row level security;
alter table public.listing_photos enable row level security;
alter table public.saved_listings enable row level security;
alter table public.saved_searches enable row level security;
alter table public.offers enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.orders enable row level security;
alter table public.order_events enable row level security;
alter table public.disputes enable row level security;
alter table public.dispute_messages enable row level security;
alter table public.reviews enable row level security;
alter table public.reports enable row level security;
alter table public.notifications enable row level security;
alter table public.config_releases enable row level security;
alter table public.config_draft enable row level security;
alter table public.admin_roles enable row level security;
alter table public.admin_members enable row level security;
alter table public.audit_log enable row level security;

-- Profiles: public cards; owners edit their own; admins verify and suspend -----

grant select (id, name, shop_name, specialty, class_of, major, response_time, status, verified, created_at)
  on public.profiles to anon, authenticated;
grant update (name, shop_name, specialty, class_of, major, response_time, verified, status)
  on public.profiles to authenticated;

create policy "Profiles are public" on public.profiles
  for select to anon, authenticated using (true);
create policy "Students edit their own profile; admins moderate" on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()) or public.has_permission('users.verify') or public.has_permission('users.suspend'))
  with check (user_id = (select auth.uid()) or public.has_permission('users.verify') or public.has_permission('users.suspend'));

-- Admins see claim emails through this function, not the table.
create or replace function public.profile_claim_emails()
returns table (profile_id uuid, claim_email text, linked boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select id, claim_email, user_id is not null from public.profiles where public.has_permission('users.view');
$$;
grant execute on function public.profile_claim_emails() to authenticated;

-- Listings ---------------------------------------------------------------------

grant select on public.listings to anon, authenticated;
grant insert (id, seller_id, title, description, price, original_price, category, condition, attributes, extra,
  pickup, stock, food, move_out, status)
  on public.listings to authenticated;
grant update (title, description, price, original_price, category, condition, attributes, extra, pickup, stock,
  food, move_out, status, posted_at)
  on public.listings to authenticated;
grant delete on public.listings to authenticated;

-- Everyone sees live and sold listings; sellers also see their drafts and hidden ones;
-- moderators see everything. (One policy per action keeps queries fast.)
create policy "Listings are visible by status, owner or moderator" on public.listings
  for select to anon, authenticated
  using (status in ('active', 'sold') or seller_id = public.my_profile_id() or public.has_permission('listings.view'));

create policy "Active students list items as themselves" on public.listings
  for insert to authenticated
  with check (
    seller_id = public.my_profile_id()
    and exists (select 1 from public.profiles p where p.id = seller_id and p.status = 'active')
  );
-- Sellers edit their own; moderators change status. guard_listing_write() keeps each to its lane.
create policy "Sellers edit their listings; moderators change status" on public.listings
  for update to authenticated
  using (seller_id = public.my_profile_id() or public.has_permission('listings.moderate'))
  with check (seller_id = public.my_profile_id() or public.has_permission('listings.moderate'));
create policy "Sellers delete their listings" on public.listings
  for delete to authenticated using (seller_id = public.my_profile_id());

-- Photos follow their listing.
grant select on public.listing_photos to anon, authenticated;
grant insert (listing_id, url, position), update (url, position), delete on public.listing_photos to authenticated;

create policy "Photos are visible with their listing" on public.listing_photos
  for select to anon, authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id));
create policy "Sellers add photos" on public.listing_photos
  for insert to authenticated with check (exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = public.my_profile_id()));
create policy "Sellers reorder photos" on public.listing_photos
  for update to authenticated using (exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = public.my_profile_id())) with check (exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = public.my_profile_id()));
create policy "Sellers remove photos" on public.listing_photos
  for delete to authenticated using (exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = public.my_profile_id()));

-- Saved items and searches: private to their owner ------------------------------

grant select, insert (profile_id, listing_id), delete on public.saved_listings to authenticated;
create policy "Own saved listings" on public.saved_listings
  for all to authenticated
  using (profile_id = public.my_profile_id())
  with check (profile_id = public.my_profile_id());

grant select, insert (profile_id, label, query, alerts, seen_ids), update (label, alerts, seen_ids), delete
  on public.saved_searches to authenticated;
create policy "Own saved searches" on public.saved_searches
  for all to authenticated
  using (profile_id = public.my_profile_id())
  with check (profile_id = public.my_profile_id());

-- Offers -----------------------------------------------------------------------

grant select, insert (listing_id, buyer_id, amount), update (status) on public.offers to authenticated;

create policy "Buyers and sellers see their offers" on public.offers
  for select to authenticated
  using (
    buyer_id = public.my_profile_id()
    or exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = public.my_profile_id())
  );
create policy "Buyers offer on live listings they don't own" on public.offers
  for insert to authenticated
  with check (
    buyer_id = public.my_profile_id()
    and exists (
      select 1 from public.listings l
      where l.id = listing_id and l.status = 'active' and l.seller_id <> public.my_profile_id()
    )
  );
-- Which change each side may make is checked by guard_offer_update().
create policy "Buyers and sellers answer offers" on public.offers
  for update to authenticated
  using (
    buyer_id = public.my_profile_id()
    or exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = public.my_profile_id())
  );

-- Conversations and messages: only the two people in them ---------------------

grant select, insert (listing_id, buyer_id, seller_id) on public.conversations to authenticated;

create policy "Participants see their conversations" on public.conversations
  for select to authenticated
  using (public.my_profile_id() in (buyer_id, seller_id));
create policy "Buyers start conversations with the seller" on public.conversations
  for insert to authenticated
  with check (
    buyer_id = public.my_profile_id()
    and exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = conversations.seller_id)
  );

grant select, insert (conversation_id, sender_id, body), update (read_at) on public.messages to authenticated;

create policy "Participants read messages" on public.messages
  for select to authenticated
  using (exists (
    select 1 from public.conversations c
    where c.id = conversation_id and public.my_profile_id() in (c.buyer_id, c.seller_id)
  ));
create policy "Participants send messages as themselves" on public.messages
  for insert to authenticated
  with check (
    sender_id = public.my_profile_id()
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and public.my_profile_id() in (c.buyer_id, c.seller_id)
    )
  );
create policy "Recipients mark messages read" on public.messages
  for update to authenticated
  using (
    sender_id <> public.my_profile_id()
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and public.my_profile_id() in (c.buyer_id, c.seller_id)
    )
  );

-- Orders and disputes: read-only here; changes go through server functions -----

grant select on public.orders, public.order_events, public.disputes, public.dispute_messages to authenticated;

create policy "Buyers, sellers and admins see orders" on public.orders
  for select to authenticated
  using (public.my_profile_id() in (buyer_id, seller_id) or public.has_permission('orders.view'));
create policy "Order history follows the order" on public.order_events
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));
create policy "Buyers, sellers and admins see disputes" on public.disputes
  for select to authenticated
  using (
    exists (select 1 from public.orders o where o.id = order_id and public.my_profile_id() in (o.buyer_id, o.seller_id))
    or public.has_permission('disputes.view')
  );
create policy "Dispute messages follow the dispute" on public.dispute_messages
  for select to authenticated
  using (exists (select 1 from public.disputes d where d.id = dispute_id));

-- Reviews: public; only the buyer of a collected order can write one ----------

grant select on public.reviews to anon, authenticated;
grant insert (order_id, seller_id, author_id, rating, tags, body) on public.reviews to authenticated;

create policy "Reviews are public" on public.reviews
  for select to anon, authenticated using (true);
create policy "Buyers review collected orders" on public.reviews
  for insert to authenticated
  with check (
    author_id = public.my_profile_id()
    and exists (
      select 1 from public.orders o
      where o.id = order_id and o.buyer_id = author_id and o.seller_id = reviews.seller_id and o.status = 'collected'
    )
  );

-- Reports: anyone signed in can report; only moderators see and handle them ---

grant select, insert (listing_id, reporter_id, reason, details), update (status, handled_by, handled_at)
  on public.reports to authenticated;

create policy "Reporters see their reports; moderators see all" on public.reports
  for select to authenticated
  using (reporter_id = public.my_profile_id() or public.has_permission('listings.view'));
create policy "Students report listings they don't own" on public.reports
  for insert to authenticated
  with check (
    reporter_id = public.my_profile_id()
    and exists (select 1 from public.listings l where l.id = listing_id and l.seller_id <> public.my_profile_id())
  );
create policy "Moderators handle reports" on public.reports
  for update to authenticated
  using (public.has_permission('listings.moderate'))
  with check (public.has_permission('listings.moderate'));

-- Notifications: private; created by server functions --------------------------

grant select, update (read_at), delete on public.notifications to authenticated;
create policy "Own notifications" on public.notifications
  for all to authenticated
  using (profile_id = public.my_profile_id())
  with check (profile_id = public.my_profile_id());

-- Platform config ----------------------------------------------------------------

grant select on public.config_releases, public.current_config to anon, authenticated;
grant insert (config, note, changes) on public.config_releases to authenticated;

create policy "Published config is public" on public.config_releases
  for select to anon, authenticated using (true);
create policy "Publishers publish" on public.config_releases
  for insert to authenticated with check (public.has_permission('settings.publish'));

grant select, insert (config), update (config), delete on public.config_draft to authenticated;
create policy "Admins read the draft" on public.config_draft
  for select to authenticated using (public.has_permission('settings.view') or public.has_permission('catalog.view'));
create policy "Editors change the draft" on public.config_draft
  for insert to authenticated
  with check (public.has_permission('settings.edit') or public.has_permission('catalog.edit') or public.has_permission('listings.feature'));
create policy "Editors update the draft" on public.config_draft
  for update to authenticated
  using (public.has_permission('settings.edit') or public.has_permission('catalog.edit') or public.has_permission('listings.feature'))
  with check (public.has_permission('settings.edit') or public.has_permission('catalog.edit') or public.has_permission('listings.feature'));
create policy "Editors discard the draft" on public.config_draft
  for delete to authenticated using (public.has_permission('settings.edit'));

-- Admin team -----------------------------------------------------------------------

grant select on public.admin_roles, public.admin_members to authenticated;
grant insert (id, name, description, permissions), update (id, name, description, permissions), delete
  on public.admin_roles to authenticated;
grant insert (email, name, role_id), update (name, role_id), delete on public.admin_members to authenticated;

create policy "Admins see roles" on public.admin_roles
  for select to authenticated using (public.is_admin());
create policy "Team managers add to roles" on public.admin_roles
  for insert to authenticated with check (public.has_permission('team.manage'));
create policy "Team managers edit roles" on public.admin_roles
  for update to authenticated using (public.has_permission('team.manage')) with check (public.has_permission('team.manage'));
create policy "Team managers remove from roles" on public.admin_roles
  for delete to authenticated using (public.has_permission('team.manage'));

create policy "Admins see the team" on public.admin_members
  for select to authenticated using (public.is_admin());
create policy "Team managers add to the team" on public.admin_members
  for insert to authenticated with check (public.has_permission('team.manage'));
create policy "Team managers edit the team" on public.admin_members
  for update to authenticated using (public.has_permission('team.manage')) with check (public.has_permission('team.manage'));
create policy "Team managers remove from the team" on public.admin_members
  for delete to authenticated using (public.has_permission('team.manage'));

-- Audit log: admins write entries attributed to themselves; nobody edits them ----

grant select, insert (permission, action, target, actor_name) on public.audit_log to authenticated;
create policy "Auditors read the log" on public.audit_log
  for select to authenticated using (public.has_permission('audit.view'));
create policy "Admins record their actions" on public.audit_log
  for insert to authenticated with check (public.is_admin());

-- Views ------------------------------------------------------------------------------

grant select on public.seller_ratings to anon, authenticated;
