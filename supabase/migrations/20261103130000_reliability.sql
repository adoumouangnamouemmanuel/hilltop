-- Additive reliability changes. Apply before deploying clients that call these RPCs.
alter table public.listings add column revision integer not null default 1;
create function public.increment_listing_revision() returns trigger language plpgsql set search_path = '' as $$
begin new.revision := old.revision + 1; return new; end; $$;
-- Counter updates must not make an open edit form stale. Saves always write these
-- content columns, including when only their accompanying photo set changed.
create trigger listings_revision before update of title,description,price,original_price,category,condition,attributes,extra,pickup,stock,food,move_out,status,posted_at
on public.listings for each row execute function public.increment_listing_revision();

-- Invoker security deliberately preserves existing column grants, RLS and rule triggers.
create function public.save_listing(p_id text, p_fields jsonb, p_photos text[], p_expected_revision integer default null)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_old public.listings; v_new public.listings; v_me uuid := private.my_profile_id(); v_max integer;
begin
  if v_me is null then raise exception 'Sign in to sell.' using errcode = '42501'; end if;
  if jsonb_typeof(p_fields) is distinct from 'object' or p_photos is null then
    raise exception 'Invalid listing details.' using errcode = '23514';
  end if;
  select coalesce((config #>> '{listings,maxPhotos}')::integer, 10) into v_max from public.current_config;
  if cardinality(p_photos) > coalesce(v_max, 10) then raise exception 'Too many photos.' using errcode = '23514'; end if;
  perform pg_advisory_xact_lock(hashtext('save_listing:' || p_id));
  select * into v_old from public.listings where id = p_id for update;
  if v_old.id is not null and v_old.seller_id is distinct from v_me then
    raise exception 'You cannot edit this listing.' using errcode = '42501';
  end if;
  if v_old.id is not null and p_expected_revision is null then
    -- Repeating the exact creation after a lost response is safe.
    if (to_jsonb(v_old) @> p_fields) and
       coalesce((select array_agg(url order by position) from public.listing_photos where listing_id = p_id), '{}'::text[]) = p_photos then
      return v_old.revision;
    end if;
    raise exception 'This listing already exists. Reload it before editing.' using errcode = '23514';
  end if;
  if p_expected_revision is not null and v_old.id is null then
    raise exception 'This listing is unavailable or belongs to another seller.' using errcode='42501';
  end if;
  if p_expected_revision is not null and v_old.revision <> p_expected_revision then
    raise exception 'This listing changed on another device. Reload before saving.' using errcode = '23514';
  end if;
  v_new := jsonb_populate_record(null::public.listings, p_fields);
  if v_old.id is null then
    insert into public.listings(id, seller_id, title, description, price, original_price, category, condition, attributes, extra, pickup, stock, food, move_out, status)
    values(p_id, v_me, v_new.title, v_new.description, v_new.price, v_new.original_price, v_new.category, v_new.condition,
      v_new.attributes, v_new.extra, v_new.pickup, v_new.stock, v_new.food, v_new.move_out, v_new.status);
  else
    update public.listings set title=v_new.title, description=v_new.description, price=v_new.price,
      original_price=v_new.original_price, category=v_new.category, condition=v_new.condition,
      attributes=v_new.attributes, extra=v_new.extra, pickup=v_new.pickup, stock=v_new.stock,
      food=v_new.food, move_out=v_new.move_out, status=v_new.status where id=p_id;
  end if;
  delete from public.listing_photos where listing_id = p_id;
  insert into public.listing_photos(listing_id, url, position)
    select p_id, url, (ordinality-1)::smallint from unnest(p_photos) with ordinality as photos(url, ordinality);
  return (select revision from public.listings where id = p_id);
end; $$;
grant execute on function public.save_listing(text,jsonb,text[],integer) to authenticated;

-- Only the delivery service can read subscription keys or claim delivery jobs.
create table public.push_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  endpoint text not null references public.push_subscriptions(endpoint) on delete cascade,
  attempts integer not null default 0,
  due_at timestamptz not null default now(),
  lease uuid,
  leased_until timestamptz,
  completed_at timestamptz,
  last_status integer,
  unique(notification_id, endpoint)
);
alter table public.push_deliveries enable row level security;
create index push_deliveries_due on public.push_deliveries(due_at) where completed_at is null;

create or replace function public.request_push() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text;
begin
  insert into public.push_deliveries(notification_id,endpoint)
    select new.id, endpoint from public.push_subscriptions where profile_id = new.profile_id;
  if not found then return null; end if;
  select value into v_url from private.settings where key='push_url';
  select value into v_secret from private.settings where key='push_secret';
  if v_url is not null and v_secret is not null then
    -- A webhook failure must not abort the marketplace transaction; the minute scheduler retries.
    begin
      perform net.http_post(url:=v_url,body:=jsonb_build_object('id',new.id),
        headers:=jsonb_build_object('content-type','application/json','x-hilltop-webhook',v_secret),timeout_milliseconds:=5000);
    exception when others then raise warning 'Push wakeup failed; delivery remains queued'; end;
  end if;
  return null;
end; $$;

create function public.claim_push_deliveries(p_notification uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  -- Limit retention and retries rather than silently marking undelivered rows as sent.
  update public.push_deliveries d set completed_at=now(),last_status=408
    from public.notifications n where n.id=d.notification_id and d.completed_at is null
    and (n.created_at < now()-interval '24 hours' or d.attempts >= 8)
    and (d.leased_until is null or d.leased_until < now());
  with candidates as (
    select d.id from public.push_deliveries d
    join public.notifications n on n.id=d.notification_id
    join public.push_subscriptions s on s.endpoint=d.endpoint and s.profile_id=n.profile_id
    where d.completed_at is null and d.due_at <= now() and (d.leased_until is null or d.leased_until < now())
      and (p_notification is null or d.notification_id=p_notification)
    order by d.due_at limit 20 for update of d skip locked
  ), claimed as (
    update public.push_deliveries d set lease=gen_random_uuid(),leased_until=now()+interval '2 minutes',attempts=attempts+1
      from candidates c where d.id=c.id returning d.*
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'lease',d.lease,'endpoint',s.endpoint,'p256dh',s.p256dh,'auth',s.auth,
    'title',n.title,'body',n.body,'href',n.href,'tag',n.id)), '[]'::jsonb) into v_result
    from claimed d join public.notifications n on n.id=d.notification_id
    join public.push_subscriptions s on s.endpoint=d.endpoint;
  return v_result;
end; $$;

create function public.finish_push_delivery(p_id uuid,p_lease uuid,p_status integer,p_retry_seconds integer default 0) returns void
language plpgsql security definer set search_path = '' as $$
declare v_job public.push_deliveries; v_terminal boolean;
begin
  select * into v_job from public.push_deliveries where id=p_id and lease=p_lease for update;
  if not found then return; end if;
  v_terminal := (p_status between 200 and 299) or (p_status between 400 and 499 and p_status not in (408,429)) or v_job.attempts >= 8;
  update public.push_deliveries set completed_at=case when v_terminal then now() else null end,
    due_at=now()+make_interval(secs=>greatest(least(p_retry_seconds,86400),least(3600,30*power(2,v_job.attempts)::integer))),
    leased_until=null,lease=null,last_status=p_status where id=p_id;
  if p_status in (404,410) then delete from public.push_subscriptions where endpoint=v_job.endpoint; end if;
  if p_status between 200 and 299 then
    update public.notifications set pushed_at=coalesce(pushed_at,now()) where id=v_job.notification_id;
  end if;
end; $$;
revoke all on function public.claim_push_deliveries(uuid),public.finish_push_delivery(uuid,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.claim_push_deliveries(uuid),public.finish_push_delivery(uuid,uuid,integer,integer) to service_role;

-- New dispute replies reach the other participant; opening/resolution already sends its own alerts.
create function public.notify_dispute_reply() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_order public.orders; v_dispute public.disputes;
begin
  select * into v_dispute from public.disputes where id=new.dispute_id;
  select * into v_order from public.orders where id=v_dispute.order_id;
  if v_dispute.state <> 'open' or (new.body = v_dispute.details and not exists(select 1 from public.dispute_messages where dispute_id=new.dispute_id and id<>new.id)) then return null; end if;
  if v_order.buyer_id is distinct from new.author_id then
    perform private.notify(v_order.buyer_id,'dispute','New dispute reply','There is an update about ' || v_order.listing_title,'/me?tab=purchases&case=' || new.dispute_id);
  end if;
  if v_order.seller_id is distinct from new.author_id then
    perform private.notify(v_order.seller_id,'dispute','New dispute reply','There is an update about ' || v_order.listing_title,'/me?tab=selling&case=' || new.dispute_id);
  end if;
  return null;
end; $$;
create trigger dispute_messages_notify after insert on public.dispute_messages for each row execute function public.notify_dispute_reply();

-- A stable client message ID makes retries safe after a lost response.
grant insert(id) on public.messages to authenticated;

-- Serialize user answers before updating any offer rows; cleanup can then safely close competitors.
create function public.answer_offer(p_offer uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_offer public.offers; v_listing public.listings; v_me uuid := private.my_profile_id();
begin
  if v_me is null or not exists(select 1 from public.profiles where id=v_me and status='active') then
    raise exception 'Sign in with an active account.' using errcode='42501';
  end if;
  select * into v_offer from public.offers where id=p_offer;
  if not found then raise exception 'Offer not found.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtext('offer_answer:' || v_offer.listing_id));
  select * into v_listing from public.listings where id=v_offer.listing_id for update;
  if (p_status in ('accepted','declined') and v_me=v_listing.seller_id)
      or (p_status='withdrawn' and v_me=v_offer.buyer_id) then
    update public.offers set status=p_status::public.offer_status where id=p_offer;
  else raise exception 'You cannot answer this offer.' using errcode='42501'; end if;
end; $$;
-- Keep the existing API usable by already-open tabs during rollout. A statement
-- lock is acquired BEFORE row locks, including for legacy direct table updates.
-- Nested cleanup updates acquire the same transaction lock reentrantly.
create function public.serialize_offer_updates() returns trigger language plpgsql set search_path='' as $$
begin perform pg_advisory_xact_lock(hashtext('offer_status_writes')); return null; end; $$;
create trigger offers_serialize before update on public.offers for each statement execute function public.serialize_offer_updates();
grant update(status) on public.offers to authenticated;
grant execute on function public.answer_offer(uuid,text) to authenticated;

-- A replacement offer must acquire its listing lock before withdrawing an older one.
create or replace function public.check_offer() returns trigger language plpgsql security definer set search_path='' as $$
declare v_me uuid := private.my_profile_id(); v_price numeric; v_min numeric;
begin
  if v_me is null and private.is_trusted_caller() then return new; end if;
  if v_me is distinct from new.buyer_id then raise exception 'Make offers as yourself.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtext('offer_answer:' || new.listing_id));
  select price into v_price from public.listings where id=new.listing_id and status='active' for update;
  if v_price is null then raise exception 'This listing is unavailable.' using errcode='23514'; end if;
  select coalesce((config #>> '{offers,minRatio}')::numeric,0) into v_min from public.current_config;
  if new.amount < v_price*coalesce(v_min,0) then
    raise exception 'Offers start at %',private.cedis(ceil(v_price*v_min)) using errcode='23514';
  end if;
  if new.amount >= v_price then raise exception 'Offer less than the price, or just buy it now' using errcode='23514'; end if;
  update public.offers set status='withdrawn' where listing_id=new.listing_id and buyer_id=new.buyer_id and status='pending';
  return new;
end; $$;

-- Counts are independent of the displayed history window; invoker RLS still applies.
create function public.message_unread_counts() returns jsonb language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_object_agg(conversation_id, unread), '{}'::jsonb) from (
    select conversation_id, count(*)::integer as unread from public.messages
    where read_at is null and sender_id is distinct from private.my_profile_id() group by conversation_id
  ) counts;
$$;
grant execute on function public.message_unread_counts() to authenticated;

create or replace function public.add_dispute_message(p_dispute uuid,p_body text) returns void
language plpgsql security definer set search_path='' as $$
declare v_me uuid := private.my_profile_id(); v_order public.orders; v_dispute public.disputes; v_role text;
begin
  select * into v_dispute from public.disputes where id=p_dispute for update;
  select * into v_order from public.orders where id=v_dispute.order_id;
  v_role := case when v_me=v_order.buyer_id then 'buyer' when v_me=v_order.seller_id then 'seller'
    when private.has_permission('disputes.resolve') then 'admin' end;
  if v_dispute.id is null or v_role is null then raise exception 'You are not part of this dispute.' using errcode='42501'; end if;
  if v_dispute.state <> 'open' then raise exception 'This case is closed.' using errcode='23514'; end if;
  if char_length(trim(coalesce(p_body,''))) not between 1 and 2000 then
    raise exception 'Write a message of up to 2000 characters' using errcode='23514';
  end if;
  if (select count(*) from public.dispute_messages where dispute_id=p_dispute and author_id=v_me and at>now()-interval '1 minute') >= 10 then
    raise exception 'Please wait a minute before replying again.' using errcode='23514';
  end if;
  insert into public.dispute_messages(dispute_id,author_id,role,body) values(p_dispute,v_me,v_role,trim(p_body));
end; $$;
