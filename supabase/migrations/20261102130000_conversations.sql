-- Messages, offers and notifications between students.
--
-- Notifications are written by the database when something happens to someone
-- (a message, an offer, an answer, a new listing matching a saved search), so the
-- recipient gets them whatever app the sender used. Students can only read, mark
-- read and delete their own.

create or replace function private.notify(
  p_profile uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_href text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (profile_id, kind, title, body, href)
  values (p_profile, p_kind, left(p_title, 120), left(coalesce(p_body, ''), 500), p_href);
$$;

revoke all on function private.notify(uuid, text, text, text, text) from public, anon, authenticated;

create or replace function private.first_name(p_profile uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select split_part(name, ' ', 1) from public.profiles where id = p_profile;
$$;

revoke all on function private.first_name(uuid) from public, anon, authenticated;

create or replace function private.cedis(p_amount numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'GH₵' || case when p_amount = trunc(p_amount) then trunc(p_amount)::text else to_char(p_amount, 'FM999999990.00') end;
$$;

-- Messages -----------------------------------------------------------------------

create or replace function public.notify_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_to uuid;
  v_listing text;
begin
  select case when c.buyer_id = new.sender_id then c.seller_id else c.buyer_id end, c.listing_id
  into v_to, v_listing
  from public.conversations c
  where c.id = new.conversation_id;

  perform private.notify(v_to, 'message', private.first_name(new.sender_id), new.body, '/inbox?c=' || new.conversation_id);
  return null;
end;
$$;

create trigger messages_notify after insert on public.messages
for each row execute function public.notify_message();

-- Offers -----------------------------------------------------------------------------

-- Offers below the configured share of the price are refused, and a buyer's new
-- offer replaces their pending one.
create or replace function public.check_offer()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_price numeric;
  v_min numeric;
begin
  select price into v_price from public.listings where id = new.listing_id;
  select coalesce((config -> 'offers' ->> 'minRatio')::numeric, 0) into v_min from public.current_config;
  if v_price is not null and new.amount < v_price * coalesce(v_min, 0) then
    raise exception 'Offers start at %', private.cedis(ceil(v_price * v_min)) using errcode = '23514';
  end if;
  if v_price is not null and new.amount >= v_price then
    raise exception 'Offer less than the price, or just buy it now' using errcode = '23514';
  end if;
  -- The update guard stamps answered_at.
  update public.offers set status = 'withdrawn'
  where listing_id = new.listing_id and buyer_id = new.buyer_id and status = 'pending';
  return new;
end;
$$;

create trigger offers_check before insert on public.offers
for each row execute function public.check_offer();

create or replace function public.notify_offer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_listing record;
begin
  select id, title, seller_id into v_listing from public.listings where id = new.listing_id;
  if tg_op = 'INSERT' then
    perform private.notify(
      v_listing.seller_id, 'offer', 'New offer on ' || v_listing.title,
      private.first_name(new.buyer_id) || ' offered ' || private.cedis(new.amount) || '.',
      '/listing/' || v_listing.id
    );
  elsif new.status in ('accepted', 'declined') and old.status = 'pending' then
    perform private.notify(
      new.buyer_id, 'offer',
      case new.status when 'accepted' then 'Offer accepted' else 'Offer declined' end,
      case new.status
        when 'accepted' then private.first_name(v_listing.seller_id) || ' accepted ' || private.cedis(new.amount)
          || ' for ' || v_listing.title || '. Buy now at that price.'
        else private.first_name(v_listing.seller_id) || ' declined your offer on ' || v_listing.title || '.'
      end,
      '/listing/' || v_listing.id
    );
  end if;
  return null;
end;
$$;

create trigger offers_notify after insert or update of status on public.offers
for each row execute function public.notify_offer();

-- Saved search alerts ------------------------------------------------------------------

-- Whether a listing matches a saved browse query ("q=casio&category=calculators&max=150").
-- Covers the search words, category and price range; finer filters only narrow the
-- browse page, so an alert may include a few extra matches.
create or replace function private.matches_search(p_listing public.listings, p_query text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_param text;
  v_key text;
  v_value text;
  v_word text;
  v_text text := lower(p_listing.title || ' ' || p_listing.description);
begin
  foreach v_param in array string_to_array(p_query, '&') loop
    v_key := split_part(v_param, '=', 1);
    v_value := lower(replace(split_part(v_param, '=', 2), '+', ' '));
    -- Percent-encoded spaces are the common case in words.
    v_value := replace(v_value, '%20', ' ');
    if v_key = 'q' then
      foreach v_word in array regexp_split_to_array(trim(v_value), '\s+') loop
        if v_word <> '' and position(v_word in v_text) = 0 then
          return false;
        end if;
      end loop;
    elsif v_key = 'category' and v_value <> '' and p_listing.category <> v_value then
      return false;
    elsif v_key = 'min' and v_value ~ '^\d+(\.\d+)?$' and p_listing.price < v_value::numeric then
      return false;
    elsif v_key = 'max' and v_value ~ '^\d+(\.\d+)?$' and p_listing.price > v_value::numeric then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

create or replace function public.alert_saved_searches()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_search record;
begin
  if new.status <> 'active' or (tg_op = 'UPDATE' and old.status = 'active') then
    return null;
  end if;
  for v_search in
    select s.id, s.profile_id, s.label, s.query
    from public.saved_searches s
    where s.alerts and s.profile_id <> new.seller_id
  loop
    if private.matches_search(new, v_search.query) then
      perform private.notify(
        v_search.profile_id, 'alert', 'New match for “' || v_search.label || '”',
        new.title || ', ' || private.cedis(new.price), '/listing/' || new.id
      );
    end if;
  end loop;
  return null;
end;
$$;

create trigger listings_alert after insert or update of status on public.listings
for each row execute function public.alert_saved_searches();

-- Live updates ---------------------------------------------------------------------------

-- Supabase Realtime streams changes to these tables, filtered by the same row-level
-- security. The app also polls, so it works where Realtime isn't running.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages, public.notifications, public.offers;
  end if;
end;
$$;
