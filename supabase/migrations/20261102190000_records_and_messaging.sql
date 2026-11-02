-- Record keeping, message editing, account-wide history and push notifications.

-- Orders remember who was involved ----------------------------------------------------------
--
-- The buyer's and seller's names are copied onto the order when it's placed, so the
-- record stays complete even after an account is deleted.

alter table public.orders add column buyer_name text, add column seller_name text;

update public.orders o
set buyer_name = (select name from public.profiles where id = o.buyer_id),
    seller_name = (select name from public.profiles where id = o.seller_id);

create or replace function public.snapshot_order_names()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.buyer_name := coalesce((select name from public.profiles where id = new.buyer_id), new.buyer_name);
  new.seller_name := coalesce((select name from public.profiles where id = new.seller_id), new.seller_name);
  return new;
end;
$$;

-- Named to run after orders_prepare, which fills in the buyer and seller.
create trigger orders_snapshot before insert on public.orders
for each row execute function public.snapshot_order_names();

-- Browsing and search history belong to the account --------------------------------------------
--
-- Like the big shops: what a student viewed and searched follows them to any device,
-- and they can clear it. The newest 12 views and 5 searches are kept.

create table public.browsing_history (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  listing_id text not null references public.listings (id) on delete cascade on update cascade,
  viewed_at timestamptz not null default now(),
  primary key (profile_id, listing_id)
);

create table public.search_history (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  query text not null check (char_length(query) between 1 and 100),
  searched_at timestamptz not null default now(),
  primary key (profile_id, query)
);

alter table public.browsing_history enable row level security;
alter table public.search_history enable row level security;
grant select, insert (profile_id, listing_id, viewed_at), update (viewed_at), delete on public.browsing_history to authenticated;
grant select, insert (profile_id, query, searched_at), update (searched_at), delete on public.search_history to authenticated;
create policy "Own browsing history" on public.browsing_history
  for all to authenticated using (profile_id = private.my_profile_id()) with check (profile_id = private.my_profile_id());
create policy "Own search history" on public.search_history
  for all to authenticated using (profile_id = private.my_profile_id()) with check (profile_id = private.my_profile_id());

create or replace function public.trim_history()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'browsing_history' then
    delete from public.browsing_history
    where profile_id = new.profile_id
      and listing_id not in (
        select listing_id from public.browsing_history where profile_id = new.profile_id order by viewed_at desc limit 12
      );
  else
    delete from public.search_history
    where profile_id = new.profile_id
      and query not in (select query from public.search_history where profile_id = new.profile_id order by searched_at desc limit 5);
  end if;
  return null;
end;
$$;

create trigger browsing_history_trim after insert or update on public.browsing_history
for each row execute function public.trim_history();
create trigger search_history_trim after insert or update on public.search_history
for each row execute function public.trim_history();

-- Editing and deleting messages ---------------------------------------------------------------
--
-- A sender can edit a message for 15 minutes and delete it at any time. The other
-- person sees "edited" or "This message was deleted". What it said before is kept in
-- message_revisions, which only the team can read (for disputes and reports).

alter table public.messages add column edited_at timestamptz, add column deleted_at timestamptz;
alter table public.messages drop constraint messages_body_check;
alter table public.messages add constraint messages_body_check
  check (char_length(body) <= 2000 and (deleted_at is not null or char_length(body) >= 1));

create table public.message_revisions (
  id bigint generated always as identity primary key,
  message_id uuid not null references public.messages (id) on delete cascade,
  body text not null,
  kind text not null check (kind in ('edited', 'deleted')),
  at timestamptz not null default now()
);

create index message_revisions_message_idx on public.message_revisions (message_id);

alter table public.message_revisions enable row level security;
grant select on public.message_revisions to authenticated;
create policy "The team reads message history" on public.message_revisions
  for select to authenticated using (private.has_permission('disputes.view') or private.has_permission('users.view'));

grant update (body, deleted_at) on public.messages to authenticated;
-- One policy for both kinds of change; guard_message_update keeps each person to theirs.
drop policy "Recipients mark messages read" on public.messages;
create policy "Participants update messages" on public.messages
  for update to authenticated
  using (exists (
    select 1 from public.conversations c
    where c.id = conversation_id and private.my_profile_id() in (c.buyer_id, c.seller_id)
  ))
  with check (exists (
    select 1 from public.conversations c
    where c.id = conversation_id and private.my_profile_id() in (c.buyer_id, c.seller_id)
  ));

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
    -- The notification quoted it.
    delete from public.notifications
    where href = '/inbox?c=' || old.conversation_id and body = left(old.body, 500);
    new.body := '';
    new.deleted_at := now();
    new.edited_at := old.edited_at;
  else
    if now() - old.created_at > interval '15 minutes' then
      raise exception 'Messages can be edited for 15 minutes after sending' using errcode = '23514';
    end if;
    insert into public.message_revisions (message_id, body, kind) values (old.id, old.body, 'edited');
    new.edited_at := now();
  end if;
  return new;
end;
$$;

create trigger messages_guard before update on public.messages
for each row execute function public.guard_message_update();

-- Push notifications ---------------------------------------------------------------------------
--
-- Each browser a student allows notifications on is saved here. When the database
-- writes a notification, it asks the marketplace (/api/push) to deliver it to those
-- browsers, so it arrives even when Hilltop is closed. Only the notification's id is
-- sent; the marketplace loads it with the server key and delivers it once.

create extension if not exists pg_net with schema extensions;

create table public.push_subscriptions (
  endpoint text primary key check (endpoint ~ '^https://'),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index push_subscriptions_profile_idx on public.push_subscriptions (profile_id);

alter table public.push_subscriptions enable row level security;
grant select, insert (endpoint, profile_id, p256dh, auth), update (profile_id, p256dh, auth), delete
  on public.push_subscriptions to authenticated;
create policy "Own push subscriptions" on public.push_subscriptions
  for all to authenticated using (profile_id = private.my_profile_id()) with check (profile_id = private.my_profile_id());

alter table public.notifications add column pushed_at timestamptz;

-- Where to ask for delivery. Production's address is set here; local development
-- points it at the dev server (see seed.sql).
create table private.settings (
  key text primary key,
  value text not null
);
insert into private.settings (key, value) values ('push_url', 'https://hilltop.lumavok.com/api/push');

create or replace function public.request_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
begin
  select value into v_url from private.settings where key = 'push_url';
  if v_url is null or not exists (select 1 from public.push_subscriptions where profile_id = new.profile_id) then
    return null;
  end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('id', new.id),
    headers := '{"content-type": "application/json"}'::jsonb,
    timeout_milliseconds := 5000
  );
  return null;
end;
$$;

create trigger notifications_push after insert on public.notifications
for each row execute function public.request_push();
