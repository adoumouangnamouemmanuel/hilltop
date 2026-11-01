-- Orders, paid at pickup.
--
-- Until a payment provider is connected (payments.inApp in the config), every order
-- is a reservation: the buyer pays the seller when they meet. Students create and
-- move orders with plain inserts and updates; the triggers here fill in everything
-- they mustn't choose (prices, the seller, stock) and allow only the moves each side
-- may make, keeping a history and telling the other person.

-- Students can place orders and change their status. Everything else is set below.
grant insert (listing_id, quantity, slot, payment_kind) on public.orders to authenticated;
grant update (status) on public.orders to authenticated;

create policy "Students order live listings they don't own" on public.orders
  for insert to authenticated
  with check (buyer_id = private.my_profile_id());
create policy "Buyers and sellers move their orders" on public.orders
  for update to authenticated
  using (private.my_profile_id() in (buyer_id, seller_id))
  with check (private.my_profile_id() in (buyer_id, seller_id));

-- Placing an order ------------------------------------------------------------------------

create or replace function public.prepare_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.my_profile_id();
  v_listing public.listings;
  v_offer numeric;
  v_in_app boolean;
begin
  if private.is_trusted_caller() and v_me is null then
    return new;
  end if;
  select * into v_listing from public.listings where id = new.listing_id for update;
  if v_listing.id is null or v_listing.status <> 'active' then
    raise exception 'This item is no longer available' using errcode = '23514';
  end if;
  if v_listing.seller_id = v_me then
    raise exception 'You can''t buy your own listing' using errcode = '23514';
  end if;
  if v_listing.stock is null then
    new.quantity := 1;
  elsif new.quantity > v_listing.stock then
    raise exception 'Only % left', v_listing.stock using errcode = '23514';
  end if;

  select coalesce((config -> 'payments' ->> 'inApp')::boolean, false) into v_in_app from public.current_config;
  if new.payment_kind <> 'pickup' and not coalesce(v_in_app, false) then
    raise exception 'Paying in the app isn''t available yet. Reserve it and pay at pickup.' using errcode = '23514';
  end if;
  if new.payment_kind <> 'pickup' then
    -- Held payments arrive with the payment provider.
    raise exception 'Paying in the app isn''t available yet' using errcode = '23514';
  end if;

  -- An accepted offer sets the price for this buyer.
  select amount into v_offer from public.offers
  where listing_id = v_listing.id and buyer_id = v_me and status = 'accepted'
  order by answered_at desc limit 1;

  new.buyer_id := v_me;
  new.seller_id := v_listing.seller_id;
  new.listing_title := v_listing.title;
  new.pickup := v_listing.pickup;
  new.unit_price := coalesce(v_offer, v_listing.price);
  new.amount := new.unit_price * new.quantity;
  new.fee := 0;
  new.paid_in_app := 0;
  new.due_at_pickup := new.amount;
  new.status := 'paid';
  new.handed_over_at := null;
  new.auto_released := false;
  new.placed_at := now();

  -- Reserved: one-off items come off the market, batches lose stock.
  if v_listing.stock is null then
    update public.listings set status = 'sold' where id = v_listing.id;
  else
    update public.listings
    set stock = stock - new.quantity, status = case when stock - new.quantity <= 0 then 'sold' else status end
    where id = v_listing.id;
  end if;
  return new;
end;
$$;

create trigger orders_prepare before insert on public.orders
for each row execute function public.prepare_order();

create or replace function public.order_placed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.order_events (order_id, status, actor_id) values (new.id, new.status, new.buyer_id);
  perform private.notify(
    new.seller_id, 'order', 'New order: ' || new.listing_title,
    private.first_name(new.buyer_id) || ' reserved ' || case when new.quantity > 1 then new.quantity || ' for ' else '' end
      || private.cedis(new.amount) || ', paid at pickup' || coalesce(' (' || new.slot || ')', '') || '.',
    '/me?tab=selling'
  );
  return null;
end;
$$;

create trigger orders_placed after insert on public.orders
for each row execute function public.order_placed();

-- Moving an order ----------------------------------------------------------------------------
--
--   paid (reserved) → ready      seller: it's ready for pickup
--   paid/ready → collected       either side: handed over and paid
--   paid/ready → cancelled       either side: the meet-up isn't happening

create or replace function public.move_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.my_profile_id();
  v_seller boolean := v_me = old.seller_id;
begin
  if private.is_trusted_caller() and v_me is null then
    return new;
  end if;
  if new.status = old.status then
    return new;
  end if;
  if not (
    (new.status = 'ready' and old.status = 'paid' and v_seller)
    or (new.status = 'collected' and old.status in ('paid', 'ready') and old.payment_kind = 'pickup')
    or (new.status = 'cancelled' and old.status in ('paid', 'ready') and old.payment_kind = 'pickup')
  ) then
    raise exception 'This order can''t change from % to %', old.status, new.status using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger orders_move before update of status on public.orders
for each row execute function public.move_order();

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
begin
  if new.status = old.status then
    return null;
  end if;
  insert into public.order_events (order_id, status, actor_id) values (new.id, new.status, v_me);
  v_other := case when v_me = new.seller_id then new.buyer_id else new.seller_id end;

  if new.status = 'ready' then
    perform private.notify(new.buyer_id, 'order', 'Ready for pickup',
      new.listing_title || ' is ready. Meet at ' || coalesce(new.pickup, 'the pickup spot') || ' and pay ' || private.cedis(new.due_at_pickup) || '.',
      '/me');
  elsif new.status = 'collected' then
    update public.profiles set sales = sales + 1 where id = new.seller_id;
    perform private.notify(new.seller_id, 'order', 'Order complete', new.listing_title || ' was collected.', '/me?tab=selling');
    perform private.notify(new.buyer_id, 'review', 'How did it go?',
      'Rate ' || private.first_name(new.seller_id) || ' for ' || new.listing_title || '.', '/me');
  elsif new.status = 'cancelled' then
    -- The item goes back on the market.
    select * into v_listing from public.listings where id = new.listing_id;
    if v_listing.id is not null and v_listing.status in ('sold', 'active') then
      update public.listings
      set stock = case when stock is null then null else stock + new.quantity end, status = 'active'
      where id = v_listing.id;
    end if;
    if v_other is not null then
      perform private.notify(v_other, 'order', 'Order cancelled',
        private.first_name(v_me) || ' cancelled the order for ' || new.listing_title || '.',
        case when v_other = new.seller_id then '/me?tab=selling' else '/me' end);
    end if;
  end if;
  return null;
end;
$$;

create trigger orders_moved after update of status on public.orders
for each row execute function public.order_moved();

-- Saved search alerts ------------------------------------------------------------------------

create or replace function public.alert_saved_searches()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_search record;
begin
  -- Only when a listing is first published, not when it comes back after a cancelled order.
  if new.status <> 'active' or (tg_op = 'UPDATE' and old.status <> 'draft') then
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

-- Reviews tell the seller ---------------------------------------------------------------------

create or replace function public.notify_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.notify(new.seller_id, 'review', 'New review: ' || new.rating || ' stars',
    private.first_name(new.author_id) || coalesce(': ' || nullif(new.body, ''), ' rated you.'), '/seller/'
    || (select handle from public.profiles where id = new.seller_id));
  return null;
end;
$$;

create trigger reviews_notify after insert on public.reviews
for each row execute function public.notify_review();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.orders;
  end if;
end;
$$;
