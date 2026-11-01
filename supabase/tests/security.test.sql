-- Security rules, checked as each kind of user. Run: npm run db:test
-- Runs inside a transaction that's rolled back, against the seeded local database.

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- People -------------------------------------------------------------------------
-- A seller shop waiting to be claimed, plus four accounts. Creating the auth users
-- fires the sign-up trigger, exactly as a real sign-in would.
update public.profiles set claim_email = 'wellington@ashesi.edu.gh' where id = md5('seller:wellington')::uuid;
insert into public.admin_members (email, name, role_id) values ('mod@ashesi.edu.gh', 'Mo Derator', 'moderator');

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'student@ashesi.edu.gh', '{"full_name": "Stu Dent"}'),
  ('22222222-2222-2222-2222-222222222222', 'emmanuel.adoum@ashesi.edu.gh', '{}'),
  ('33333333-3333-3333-3333-333333333333', 'mod@ashesi.edu.gh', '{}'),
  ('44444444-4444-4444-4444-444444444444', 'wellington@ashesi.edu.gh', '{}');

-- Sign-up linking
select is((select name from public.profiles where user_id = '11111111-1111-1111-1111-111111111111'), 'Stu Dent',
  'a new student gets a profile named from their sign-up');
select is((select id from public.profiles where user_id = '44444444-4444-4444-4444-444444444444'), md5('seller:wellington')::uuid,
  'signing in with a waiting shop''s email claims that shop');
select is((select claim_email from public.profiles where id = md5('seller:wellington')::uuid), null,
  'the claim email is cleared once claimed');
select is((select status::text from public.admin_members where email = 'emmanuel.adoum@ashesi.edu.gh'), 'active',
  'the owner invite becomes active on first sign-in');

-- Logged-out visitors -----------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select is((select count(*)::int from public.listings), 68, 'visitors see live listings');
select ok((select count(*) from public.current_config) = 1, 'visitors can read the published config');
select throws_ok('select claim_email from public.profiles', '42501', null, 'visitors can''t read claim emails');
select throws_ok('select * from public.orders', '42501', null, 'visitors can''t read orders');
select throws_ok('select * from public.admin_members', '42501', null, 'visitors can''t see the admin team');
select throws_ok($$insert into public.listings (seller_id, title, price, category, pickup) values (md5('seller:wellington')::uuid, 'x', 1, 'other', 'Library')$$,
  '42501', null, 'visitors can''t list items');
reset role;

-- A student ------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);

select isnt(private.my_profile_id(), null, 'the student is recognised');
select is(private.has_permission('listings.moderate'), false, 'students have no admin powers');

select lives_ok($$insert into public.listings (id, seller_id, title, price, category, pickup, status)
  values ('student-lamp', private.my_profile_id(), 'Desk lamp', 50, 'hostel', 'Library', 'active')$$,
  'students list items as themselves');
select throws_ok($$insert into public.listings (seller_id, title, price, category, pickup)
  values (md5('seller:wellington')::uuid, 'Fake', 1, 'other', 'Library')$$,
  '42501', null, 'students can''t list as someone else');
select throws_ok($$insert into public.listings (seller_id, title, price, category, pickup, status)
  values (private.my_profile_id(), 'Sneaky', 1, 'other', 'Library', 'hidden')$$,
  '42501', null, 'new listings can''t start in a moderation state');
select throws_ok($$insert into public.listings (seller_id, title, price, category, pickup, views)
  values (private.my_profile_id(), 'Popular', 1, 'other', 'Library', 9999)$$,
  '42501', null, 'students can''t set view counts');

select lives_ok($$update public.listings set title = 'Bright desk lamp' where id = 'student-lamp'$$, 'students edit their listings');
select throws_ok($$update public.listings set status = 'removed' where id = 'student-lamp'$$,
  '42501', null, 'students can''t put their own listing into a moderation state');
update public.listings set title = 'Hacked' where id = 'casio-fx991';
select is((select title from public.listings where id = 'casio-fx991'), 'Casio fx-991ES Plus',
  'students can''t edit other people''s listings');
select throws_ok($$update public.profiles set verified = true where user_id = auth.uid()$$,
  '42501', null, 'students can''t verify themselves');

select lives_ok($$insert into public.saved_listings (profile_id, listing_id) values (private.my_profile_id(), 'casio-fx991')$$, 'students save listings');
select is((select count(*)::int from public.saved_listings), 1, 'students see only their saved listings');

select lives_ok($$insert into public.reports (listing_id, reporter_id, reason) values ('casio-fx991', private.my_profile_id(), 'scam')$$,
  'students report other people''s listings');
select throws_ok($$insert into public.reports (listing_id, reporter_id, reason) values ('student-lamp', private.my_profile_id(), 'scam')$$,
  '42501', null, 'students can''t report their own listing');

select lives_ok($$insert into public.offers (listing_id, buyer_id, amount) values ('casio-fx991', private.my_profile_id(), 120)$$,
  'students make offers');
select throws_ok($$update public.offers set status = 'accepted' where listing_id = 'casio-fx991'$$,
  '42501', null, 'buyers can''t accept their own offer');

select lives_ok($$insert into public.conversations (listing_id, buyer_id, seller_id)
  values ('casio-fx991', private.my_profile_id(), md5('seller:wellington')::uuid)$$, 'students message sellers');
select lives_ok($$insert into public.messages (conversation_id, sender_id, body)
  select id, private.my_profile_id(), 'Is it still available?' from public.conversations where listing_id = 'casio-fx991'$$,
  'students send messages');
select throws_ok($$insert into public.conversations (listing_id, buyer_id, seller_id)
  values ('casio-fx991', private.my_profile_id(), md5('seller:petra')::uuid)$$,
  '42501', null, 'conversations must be with the listing''s actual seller');

select is((select count(*)::int from public.config_draft), 0, 'students can''t see the config draft');
select is((select count(*)::int from public.admin_members), 0, 'students can''t see the admin team');
select throws_ok($$insert into public.config_releases (config) values ('{}')$$, '42501', null, 'students can''t publish config');
select throws_ok($$insert into public.audit_log (permission, action, actor_name) values ('x', 'y', 'z')$$, '42501', null,
  'students can''t write to the audit log');
reset role;

select is((select saves from public.listings where id = 'casio-fx991'), 39, 'saving a listing updates its counter (seeded at 38)');

-- The seller (Wellington, after claiming his shop) ----------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "44444444-4444-4444-4444-444444444444", "role": "authenticated"}', true);

select is((select count(*)::int from public.messages), 1, 'sellers read messages sent to them');
select is((select count(*)::int from public.reports), 0, 'sellers can''t see who reported them');
select lives_ok($$update public.offers set status = 'accepted' where listing_id = 'casio-fx991'$$, 'sellers accept offers');
select throws_ok($$update public.offers set status = 'declined' where listing_id = 'casio-fx991'$$,
  '42501', null, 'an answered offer can''t be changed');
select lives_ok($$update public.listings set posted_at = '2000-01-01' where id = 'casio-fx991'$$, 'sellers renew listings');
reset role;
select ok((select posted_at > now() - interval '1 minute' from public.listings where id = 'casio-fx991'),
  'renewing sets the date to now, whatever was sent');

-- A moderator --------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}', true);

select is(private.has_permission('listings.moderate'), true, 'the moderator role grants moderation');
select lives_ok($$update public.listings set status = 'hidden' where id = 'student-lamp'$$, 'moderators hide listings');
select is((select count(*)::int from public.reports), 1, 'moderators see reports');
select lives_ok($$update public.reports set status = 'actioned', handled_by = private.my_profile_id(), handled_at = now()$$,
  'moderators handle reports');
select throws_ok($$insert into public.config_releases (config) values ('{}')$$, '42501', null, 'moderators can''t publish config');
select throws_ok($$insert into public.admin_roles (id, name) values ('rogue', 'Rogue')$$, '42501', null, 'moderators can''t create roles');
select lives_ok($$insert into public.audit_log (permission, action, target, actor_name) values ('listings.moderate', 'Hid listing', 'student-lamp', 'anyone')$$,
  'admins record their actions');
reset role;
select is((select actor_name from public.audit_log order by id desc limit 1), 'Mo Derator', 'audit entries are attributed by the server, not the client');

-- The student again: their hidden listing stays hidden --------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
select throws_ok($$update public.listings set status = 'active' where id = 'student-lamp'$$,
  '42501', null, 'students can''t restore a listing a moderator hid');
select is((select status::text from public.listings where id = 'student-lamp'), 'hidden', 'owners still see their hidden listing');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select is((select count(*)::int from public.listings where id = 'student-lamp'), 0, 'hidden listings disappear for visitors');
reset role;

-- The owner --------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);
select is(public.my_permissions(), array['*'], 'the owner has every permission');
select lives_ok($$insert into public.config_releases (config, note) values ((select config from public.current_config), 'Test release')$$,
  'owners publish config');
select is((select version from public.current_config), 2, 'releases are numbered by the server');
select lives_ok($$insert into public.admin_roles (id, name, permissions) values ('interns', 'Interns', array['dashboard.view'])$$,
  'owners create roles');
select throws_ok($$delete from public.admin_roles where id = 'owner'$$, '42501', null, 'the owner role can''t be deleted');
reset role;

-- The team always keeps an active owner (checked at commit, forced here).
select throws_ok($$update public.admin_members set role_id = 'viewer' where email = 'emmanuel.adoum@ashesi.edu.gh'; set constraints all immediate$$,
  '42501', null, 'the last owner can''t be demoted');

select * from finish();
rollback;
