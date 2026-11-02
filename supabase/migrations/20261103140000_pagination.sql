-- Database-filtered public browsing. One JSON result avoids PostgREST's row cap;
-- the result itself is bounded, and all source reads retain invoker RLS.
create function private.market_matches(l public.listings, f jsonb, skip text default '')
returns boolean language sql stable security invoker set search_path='' as $$
  select
    (skip='category' or coalesce(f->>'category','')='' or l.category=f->>'category')
    and (not (f ? 'categories') or f->'categories' ? l.category)
    and (not (f ? 'ids') or f->'ids' ? l.id)
    and (coalesce(f->>'sellerId','')='' or exists(select 1 from public.profiles p where p.id=l.seller_id and p.handle=f->>'sellerId'))
    and (skip='conditions' or coalesce(jsonb_array_length(f->'conditions'),0)=0 or f->'conditions' ? l.condition)
    and (skip='pickup' or coalesce(jsonb_array_length(f->'pickup'),0)=0 or f->'pickup' ? l.pickup)
    and (skip='price' or ((f->>'min' is null or l.price >= (f->>'min')::numeric) and (f->>'max' is null or l.price <= (f->>'max')::numeric)))
    and (skip='sale' or not coalesce((f->>'sale')::boolean,false) or l.move_out)
    and (skip='deals' or not coalesce((f->>'deals')::boolean,false) or l.original_price>l.price)
    and (f->>'postedWithinDays' is null or l.posted_at > now()-make_interval(days=>(f->>'postedWithinDays')::integer+1))
    and (skip='category' or not exists (
      select 1 from jsonb_each(coalesce(f->'attrs','{}')) a
      where 'attr:' || a.key <> skip and jsonb_array_length(a.value)>0
        and not coalesce(a.value ? (l.attributes->>a.key),false)
    ));
$$;
grant execute on function private.market_matches(public.listings,jsonb,text) to anon,authenticated;

create function public.market_page(p_filters jsonb default '{}',p_cursor jsonb default null,p_limit integer default 24)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare cfg jsonb; result jsonb; expiry integer; sort text; cutoff timestamptz;
begin
  if p_limit not between 1 and 100 or jsonb_typeof(p_filters) is distinct from 'object'
     or length(coalesce(p_filters->>'q',''))>160 or pg_column_size(p_filters)>32768
     or (p_cursor is not null and jsonb_typeof(p_cursor)<>'object') then
    raise exception 'Invalid browse request.' using errcode='22023';
  end if;
  select config into cfg from public.current_config;
  expiry:=coalesce((cfg #>> '{listings,expiryDays}')::integer,0);
  sort:=coalesce(p_filters->>'sort','relevance');
  if sort not in ('relevance','newest','popular','price-asc','price-desc','deals') then raise exception 'Invalid sort.' using errcode='22023'; end if;
  cutoff:=coalesce((p_cursor->>'asOf')::timestamptz,now());
  with base as materialized (
    select l.* from public.listings l
    where (l.status='active' or (coalesce((p_filters->>'includeSold')::boolean,false) and l.status='sold'))
      and (l.status='sold' or expiry=0 or l.posted_at>now()-make_interval(days=>expiry))
      and l.created_at<=cutoff
      and (coalesce(p_filters->>'q','')='' or l.search @@ websearch_to_tsquery('simple',p_filters->>'q')
        or position(lower(p_filters->>'q') in lower(l.title || ' ' || l.category || ' ' || l.attributes::text))>0
        or exists(select 1 from jsonb_array_elements(coalesce(cfg->'categories','[]')) c
          where c->>'id'=l.category and position(lower(p_filters->>'q') in lower(c->>'label'))>0))
  ), matching as materialized (
    select b.* from base b where private.market_matches(b::public.listings,p_filters)
  ), photo_counts as (
    select p.listing_id,count(*) as n from public.listing_photos p join matching m on m.id=p.listing_id group by p.listing_id
  ), scored as (
    select m.id, case sort
      when 'newest' then extract(epoch from m.posted_at)
      when 'price-asc' then -m.price when 'price-desc' then m.price
      when 'popular' then m.saves::numeric when 'deals' then coalesce(m.original_price-m.price,0)
      else
        (case when coalesce(p_filters->>'q','')='' then 0 else
          10000 * (case when lower(m.title)=lower(p_filters->>'q') then 3
            when position(lower(p_filters->>'q') in lower(m.title))>0 then 2 else 1 end) end)
        + greatest(0,1-floor(extract(epoch from (now()-m.posted_at))/86400)/(case when expiry>0 then expiry else 30 end))*coalesce((cfg #>> '{ranking,freshness}')::numeric,0)
        + least(1,coalesce(photos.n,0)::numeric/4)*coalesce((cfg #>> '{ranking,photos}')::numeric,0)
        + least(1,ln(1+m.saves*3+m.views::numeric/10)/ln(151))*coalesce((cfg #>> '{ranking,popularity}')::numeric,0)
        + case when rating.rating is null then 0.5 else greatest(0,least(1,(rating.rating-3)/2)) end*coalesce((cfg #>> '{ranking,sellerRating}')::numeric,0)
        + (case when m.promoted_until>now() then 1 else 0 end)*coalesce((cfg #>> '{ranking,promoted}')::numeric,0)
        + (case when coalesce(cfg #> '{featured,listingIds}','[]') ? m.id then 1 else 0 end)*coalesce((cfg #>> '{ranking,featured}')::numeric,0)
      end as score from matching m left join photo_counts photos on photos.listing_id=m.id left join public.seller_ratings rating on rating.seller_id=m.seller_id
  ), slice as materialized (
    select s.* from scored s where p_cursor is null or (s.score,s.id)<((p_cursor->>'score')::numeric,p_cursor->>'id')
    order by score desc,id desc limit p_limit+1
  ), page as materialized (
    select * from slice order by score desc,id desc limit p_limit
  ), prices as (
    select b.price from base b where private.market_matches(b::public.listings,p_filters,'price')
  ), price_top as (
    select greatest(100,coalesce(max(price),100)) as top from prices
  ), price_ceiling as (
    select ceil(top/(case when top>2000 then 500 when top>500 then 100 else 10 end))*(case when top>2000 then 500 when top>500 then 100 else 10 end) as ceiling from price_top
  ), attribute_keys as (
    select a->>'key' as key from jsonb_array_elements(coalesce(cfg->'categories','[]')) c
      cross join lateral jsonb_array_elements(coalesce(c->'attributes','[]')) a
    where c->>'id'=p_filters->>'category' and coalesce((a->>'filter')::boolean,false)
  )
  select jsonb_build_object(
    'items',coalesce((select jsonb_agg(to_jsonb(card) || jsonb_build_object('seller',
      (select jsonb_build_object('id',s.id,'handle',s.handle,'name',s.name,'shop_name',s.shop_name,'specialty',s.specialty,'class_of',s.class_of,'major',s.major,'response_time',s.response_time,'sales',s.sales,'verified',s.verified,'created_at',s.created_at)
        from public.profiles s where s.id=card.seller_id),
      'rating',(select to_jsonb(r) from public.seller_ratings r where r.seller_id=card.seller_id)) order by page.score desc,page.id desc)
      from page join public.market_listings card on card.id=page.id),'[]'),
    'total',(select count(*) from matching),
    'next',case when (select count(*) from slice)>p_limit then (select jsonb_build_object('score',score::text,'id',id,'asOf',cutoff)
      from page order by score,id limit 1) else null end,
    'facets',jsonb_build_object(
      'all',(select count(*) from base b where private.market_matches(b::public.listings,p_filters,'category')),
      'categories',coalesce((select jsonb_object_agg(category,n) from (select category,count(*) n from base b where private.market_matches(b::public.listings,p_filters,'category') group by category) x),'{}'),
      'conditions',coalesce((select jsonb_object_agg(condition,n) from (select condition,count(*) n from base b where condition is not null and private.market_matches(b::public.listings,p_filters,'conditions') group by condition) x),'{}'),
      'pickup',coalesce((select jsonb_object_agg(pickup,n) from (select pickup,count(*) n from base b where private.market_matches(b::public.listings,p_filters,'pickup') group by pickup) x),'{}'),
      'sale',(select count(*) from base b where b.move_out and private.market_matches(b::public.listings,p_filters,'sale')),
      'deals',(select count(*) from base b where b.original_price>b.price and private.market_matches(b::public.listings,p_filters,'deals')),
      'attrs',coalesce((select jsonb_object_agg(k.key,coalesce((select jsonb_object_agg(value,n) from (
        select b.attributes->>k.key as value,count(*) n from base b
          where b.attributes ? k.key and private.market_matches(b::public.listings,p_filters,'attr:' || k.key)
          group by b.attributes->>k.key) x),'{}')) from attribute_keys k),'{}'),
      'price',jsonb_build_object('ceiling',(select ceiling from price_ceiling),'bins',
        (select jsonb_agg((select count(*) from prices p cross join price_ceiling c where least(23,floor(p.price/c.ceiling*24))=bin) order by bin) from generate_series(0,23) bin))
    )
  ) into result;
  return result;
end; $$;
grant execute on function public.market_page(jsonb,jsonb,integer) to anon,authenticated;

create function private.page_envelope(rows jsonb, page_size integer, time_key text) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('items',coalesce((select jsonb_agg(value order by ord) from jsonb_array_elements(coalesce(rows,'[]')) with ordinality a(value,ord) where ord<=page_size),'[]'),
   'next',case when jsonb_array_length(coalesce(rows,'[]'))>page_size then
     jsonb_build_object('at',rows->(page_size-1)->time_key,'id',rows->(page_size-1)->'id') else null end);
$$;
grant execute on function private.page_envelope(jsonb,integer,text) to authenticated;

-- Every branch uses a deterministic timestamp/id cursor, bounded rows and RLS.
-- A single JSON envelope prevents nested messages/joins from being clipped by the
-- HTTP API's global max_rows setting. No email or private profile fields are read.
create function public.account_page(p_kind text,p_cursor jsonb default null,p_limit integer default 50,p_parent uuid default null)
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
      'messages',coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at desc,m.id desc) from (
        select id,sender_id,body,created_at,read_at,edited_at,deleted_at from public.messages where conversation_id=c.id
        order by created_at desc,id desc limit 31) m),'[]')) order by c.last_message_at desc,c.id desc) into rows from page c;
  elsif p_kind='messages' then
    if p_parent is null then raise exception 'Choose a conversation.' using errcode='22023'; end if;
    select jsonb_agg(to_jsonb(m) order by m.created_at desc,m.id desc) into rows from (
      select id,sender_id,body,created_at,read_at,edited_at,deleted_at from public.messages where conversation_id=p_parent
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

create function public.latest_offers(p_listings text[]) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
  if cardinality(p_listings)>100 then raise exception 'Too many listings.' using errcode='22023'; end if;
  select coalesce(jsonb_agg(to_jsonb(o)),'[]') into result from (
    select distinct on (listing_id) id,listing_id,amount,status,created_at from public.offers
    where buyer_id=private.my_profile_id() and listing_id=any(p_listings)
    order by listing_id,created_at desc,id desc
  ) o;
  return result;
end; $$;
grant execute on function public.latest_offers(text[]) to authenticated;
