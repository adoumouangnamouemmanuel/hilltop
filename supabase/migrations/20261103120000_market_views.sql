-- What browsing needs, and nothing more (audit PERF-001).
--
-- Every page carries the public market to the browser. Reading it from listings
-- with the seller embedded repeated each seller's profile on every one of their
-- listings and sent full descriptions and spec tables no card shows. These views
-- return card fields only, photos as a plain list, and each seller once. Listing
-- pages read the full listing on their own. Row-level security still applies
-- (security_invoker), so nothing becomes visible that wasn't.

create view public.market_listings with (security_invoker = true) as
select
  l.id, l.title, left(l.description, 200) as description, l.price, l.original_price, l.category, l.condition,
  l.attributes, l.pickup, l.stock, l.food, l.move_out, l.promoted_until, l.status, l.posted_at, l.updated_at,
  l.views, l.saves, l.seller_id,
  coalesce((select array_agg(p.url order by p.position) from public.listing_photos p where p.listing_id = l.id), '{}') as photos
from public.listings l
where l.status in ('active', 'sold');

create view public.market_sellers with (security_invoker = true) as
select p.id, p.handle, p.name, p.shop_name, p.specialty, p.class_of, p.major, p.response_time, p.sales, p.verified, p.created_at
from public.profiles p
where exists (select 1 from public.listings l where l.seller_id = p.id and l.status in ('active', 'sold'));

grant select on public.market_listings, public.market_sellers to anon, authenticated;

-- Browsers refresh only what changed since they last loaded.
create index listings_changed_idx on public.listings (updated_at desc) where status in ('active', 'sold');
