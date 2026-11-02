-- One conversation per pair of students.
--
-- Chats used to belong to a listing, so asking the same seller about a second item
-- started a second thread with the same person. Now two students share one thread,
-- and each message can say which item it's about (messages.listing_id); the app shows
-- a small card for the item whenever the conversation moves to a different one. The
-- conversation's listing_id is the item discussed most recently.
--
-- Existing threads between the same two people are merged into the oldest one, with
-- every message keeping its item. Message notifications are pointed at the merged
-- thread. Typing indicators and push notifications are keyed by conversation and
-- need no change.

-- Messages know their item ---------------------------------------------------------------

alter table public.messages
  add column listing_id text references public.listings (id) on delete set null on update cascade;

create index messages_listing_idx on public.messages (listing_id) where listing_id is not null;

update public.messages m set listing_id = c.listing_id
from public.conversations c
where c.id = m.conversation_id and m.listing_id is null and c.listing_id is not null;

grant insert (listing_id) on public.messages to authenticated;

-- Merge threads between the same two people ------------------------------------------------

do $$
declare
  r record;
begin
  for r in
    select c.id, first_value(c.id) over (
      partition by least(c.buyer_id, c.seller_id), greatest(c.buyer_id, c.seller_id)
      order by c.created_at, c.id
    ) as keeper
    from public.conversations c
  loop
    continue when r.id = r.keeper;
    update public.messages set conversation_id = r.keeper where conversation_id = r.id;
    update public.notifications set href = '/inbox?c=' || r.keeper where href = '/inbox?c=' || r.id;
    delete from public.conversations where id = r.id;
  end loop;
end;
$$;

-- The merged thread's latest item and time come from its newest message.
update public.conversations c
set last_message_at = latest.created_at,
    listing_id = coalesce(latest.listing_id, c.listing_id)
from (
  select distinct on (conversation_id) conversation_id, created_at, listing_id
  from public.messages
  order by conversation_id, created_at desc, id desc
) latest
where latest.conversation_id = c.id;

alter table public.conversations drop constraint conversations_listing_id_buyer_id_key;
create unique index conversations_pair_idx
  on public.conversations (least(buyer_id, seller_id), greatest(buyer_id, seller_id));

-- Starting a chat ------------------------------------------------------------------------------

-- Finds the thread with this listing's seller, or starts one, in one step (two taps
-- or two tabs can't create two threads). Returns the conversation's id.
create or replace function public.start_conversation(p_listing text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.my_profile_id();
  v_seller uuid;
  v_id uuid;
begin
  if v_me is null then
    raise exception 'Sign in to message sellers.' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles where id = v_me and status = 'suspended') then
    raise exception 'Your account is suspended. Contact support if you think this is a mistake.' using errcode = '23514';
  end if;
  select seller_id into v_seller from public.listings where id = p_listing and status in ('active', 'sold');
  if v_seller is null then
    raise exception 'This listing is no longer available.' using errcode = '23514';
  end if;
  if v_seller = v_me then
    raise exception 'This is your own listing.' using errcode = '23514';
  end if;
  insert into public.conversations (listing_id, buyer_id, seller_id)
  values (p_listing, v_me, v_seller)
  on conflict ((least(buyer_id, seller_id)), (greatest(buyer_id, seller_id))) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.conversations
    where least(buyer_id, seller_id) = least(v_me, v_seller) and greatest(buyer_id, seller_id) = greatest(v_me, v_seller);
  end if;
  return v_id;
end;
$$;

revoke all on function public.start_conversation(text) from public, anon;
grant execute on function public.start_conversation(text) to authenticated;

-- A message's item must be one of the two people's listings; it becomes the thread's
-- latest item.
create or replace function public.check_message_listing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.listing_id is not null and not exists (
    select 1 from public.listings l join public.conversations c on c.id = new.conversation_id
    where l.id = new.listing_id and l.seller_id in (c.buyer_id, c.seller_id)
  ) then
    raise exception 'That item isn''t part of this conversation.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger messages_listing before insert on public.messages
for each row execute function public.check_message_listing();

create or replace function public.bump_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
  set last_message_at = new.created_at, listing_id = coalesce(new.listing_id, listing_id)
  where id = new.conversation_id;
  return null;
end;
$$;

-- A small card for an item in a chat: title, price, first photo. Read as the viewer,
-- so a listing they can no longer see comes back empty.
create or replace function private.listing_card(p_id text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'id', l.id, 'title', l.title, 'price', l.price, 'status', l.status,
    'seller', (select handle from public.profiles p where p.id = l.seller_id),
    'image', (select url from public.listing_photos p where p.listing_id = l.id order by p.position limit 1)
  )
  from public.listings l
  where l.id = p_id;
$$;

grant execute on function private.listing_card(text) to authenticated;

-- History pages carry each message's item card ------------------------------------------------

create or replace function public.account_page(p_kind text,p_cursor jsonb default null,p_limit integer default 50,p_parent uuid default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare rows jsonb; time_key text:='created_at';
begin
  if private.my_profile_id() is null then raise exception 'Sign in to load your history.' using errcode='42501'; end if;
  if p_limit not between 1 and 100 or (p_cursor is not null and jsonb_typeof(p_cursor)<>'object') then
    raise exception 'Invalid history page.' using errcode='22023';
  end if;
  if p_kind='conversations' then
    time_key:='last_message_at';
    with page as (
      select c.* from public.conversations c
      where p_cursor is null or (c.last_message_at,c.id)<((p_cursor->>'at')::timestamptz,(p_cursor->>'id')::uuid)
      order by c.last_message_at desc,c.id desc limit p_limit+1
    ) select jsonb_agg(jsonb_build_object('id',c.id,'listing_id',c.listing_id,'buyer_id',c.buyer_id,'last_message_at',c.last_message_at,
      'buyer',(select jsonb_build_object('handle',p.handle,'name',p.name) from public.profiles p where p.id=c.buyer_id),
      'seller',(select jsonb_build_object('handle',p.handle,'name',p.name) from public.profiles p where p.id=c.seller_id),
      'listing',private.listing_card(c.listing_id),
      'messages',coalesce((select jsonb_agg(to_jsonb(m) || jsonb_build_object('listing',private.listing_card(m.listing_id)) order by m.created_at desc,m.id desc) from (
        select id,sender_id,body,created_at,read_at,edited_at,deleted_at,listing_id from public.messages where conversation_id=c.id
        order by created_at desc,id desc limit 31) m),'[]')) order by c.last_message_at desc,c.id desc) into rows from page c;
  elsif p_kind='messages' then
    if p_parent is null then raise exception 'Choose a conversation.' using errcode='22023'; end if;
    select jsonb_agg(to_jsonb(m) || jsonb_build_object('listing',private.listing_card(m.listing_id)) order by m.created_at desc,m.id desc) into rows from (
      select id,sender_id,body,created_at,read_at,edited_at,deleted_at,listing_id from public.messages where conversation_id=p_parent
        and (p_cursor is null or (created_at,id)<((p_cursor->>'at')::timestamptz,(p_cursor->>'id')::uuid))
      order by created_at desc,id desc limit p_limit+1) m;
  elsif p_kind='notifications' then
    select jsonb_agg(to_jsonb(n) order by n.created_at desc,n.id desc) into rows from (
      select id,kind,title,body,href,read_at,created_at from public.notifications
      where p_cursor is null or (created_at,id)<((p_cursor->>'at')::timestamptz,(p_cursor->>'id')::uuid)
      order by created_at desc,id desc limit p_limit+1) n;
  elsif p_kind in ('offers','incoming') then
    with page as (
      select o.* from public.offers o join public.listings l on l.id=o.listing_id
      where ((p_kind='offers' and o.buyer_id=private.my_profile_id()) or (p_kind='incoming' and l.seller_id=private.my_profile_id()))
        and (p_cursor is null or (o.created_at,o.id)<((p_cursor->>'at')::timestamptz,(p_cursor->>'id')::uuid))
      order by o.created_at desc,o.id desc limit p_limit+1
    ) select jsonb_agg(jsonb_build_object('id',o.id,'listing_id',o.listing_id,'amount',o.amount,'status',o.status,'created_at',o.created_at,
      'buyer',(select jsonb_build_object('name',p.name) from public.profiles p where p.id=o.buyer_id),
      'listing',(select jsonb_build_object('title',l.title) from public.listings l where l.id=o.listing_id)) order by o.created_at desc,o.id desc)
      into rows from page o;
  elsif p_kind='orders' then
    time_key:='placed_at';
    with page as (
      select o.* from public.orders o
      where p_cursor is null or (o.placed_at,o.id)<((p_cursor->>'at')::timestamptz,p_cursor->>'id')
      order by o.placed_at desc,o.id desc limit p_limit+1
    ) select jsonb_agg(jsonb_build_object('id',o.id,'listing_id',o.listing_id,'listing_title',o.listing_title,'pickup',o.pickup,
      'buyer_id',o.buyer_id,'seller_id',o.seller_id,'buyer_name',o.buyer_name,'seller_name',o.seller_name,'quantity',o.quantity,
      'amount',o.amount,'fee',o.fee,'payment_kind',o.payment_kind,'paid_in_app',o.paid_in_app,'due_at_pickup',o.due_at_pickup,
      'slot',o.slot,'status',o.status,'handed_over_at',o.handed_over_at,'auto_released',o.auto_released,'placed_at',o.placed_at,
      'buyer',(select jsonb_build_object('name',p.name) from public.profiles p where p.id=o.buyer_id),
      'seller',(select jsonb_build_object('name',p.name,'handle',p.handle) from public.profiles p where p.id=o.seller_id),
      'order_events',coalesce((select jsonb_agg(jsonb_build_object('status',e.status,'at',e.at) order by e.at) from public.order_events e where e.order_id=o.id),'[]'),
      'disputes',(select jsonb_build_object('id',d.id,'opened_by',d.opened_by,'reason',d.reason,'details',d.details,'state',d.state,'opened_at',d.opened_at) from public.disputes d where d.order_id=o.id),
      'reviews',coalesce((select jsonb_agg(jsonb_build_object('id',r.id)) from public.reviews r where r.order_id=o.id),'[]')) order by o.placed_at desc,o.id desc)
      into rows from page o;
  elsif p_kind='dispute_messages' then
    time_key:='at';
    select jsonb_agg(to_jsonb(m) order by m.at desc,m.id desc) into rows from (
      select id,body,role,at from public.dispute_messages where dispute_id=p_parent
        and (p_cursor is null or (at,id)<((p_cursor->>'at')::timestamptz,(p_cursor->>'id')::uuid))
      order by at desc,id desc limit p_limit+1) m;
  else raise exception 'Unknown history type.' using errcode='22023';
  end if;
  return private.page_envelope(coalesce(rows,'[]'),p_limit,time_key);
end; $$;
grant execute on function public.account_page(text,jsonb,integer,uuid) to authenticated;
