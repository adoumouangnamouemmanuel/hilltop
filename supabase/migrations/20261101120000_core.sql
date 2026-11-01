-- Hilltop core schema: profiles, listings and photos.
--
-- Conventions
-- * Every person is a row in public.profiles. A profile can exist before its owner
--   signs up (the team creates shops for sellers); it's linked to auth.users on the
--   student's first sign-in with the matching email.
-- * Tables are closed by default (see the security migration): nothing is readable
--   or writable from the browser until a grant and a row-level policy allow it.

create extension if not exists pg_trgm with schema extensions;

-- New tables start with no access for browser roles; each one is opened explicitly.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated, public;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

create type public.user_status as enum ('active', 'suspended');
-- "expired" isn't stored: it's an active listing older than the configured window.
create type public.listing_status as enum ('draft', 'active', 'sold', 'hidden', 'removed');

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Profiles -------------------------------------------------------------------

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  -- Email a pre-created shop is waiting for. Private: never exposed to the browser.
  claim_email text unique check (claim_email = lower(claim_email)),
  name text not null check (char_length(name) between 1 and 80),
  shop_name text check (char_length(shop_name) <= 40),
  specialty text check (char_length(specialty) <= 120),
  class_of smallint check (class_of between 2000 and 2100),
  major text check (char_length(major) <= 80),
  response_time text check (char_length(response_time) <= 40),
  status public.user_status not null default 'active',
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Students, sellers and admins. Linked to auth.users once the person signs in.';

create trigger profiles_touch before update on public.profiles
for each row execute function public.touch_updated_at();

-- Listings -------------------------------------------------------------------

create table public.listings (
  -- Text ids keep URLs readable (/listing/casio-fx991); new listings get a random one.
  id text primary key default encode(extensions.gen_random_bytes(6), 'hex')
    check (id ~ '^[a-z0-9-]{3,64}$'),
  seller_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 140),
  description text not null default '' check (char_length(description) <= 5000),
  price numeric(10, 2) not null check (price >= 0 and price <= 1000000),
  original_price numeric(10, 2) check (original_price is null or original_price > price),
  category text not null check (char_length(category) between 1 and 64),
  condition text check (char_length(condition) <= 20),
  attributes jsonb not null default '{}' check (jsonb_typeof(attributes) = 'object'),
  extra jsonb not null default '[]' check (jsonb_typeof(extra) = 'array'),
  pickup text not null check (char_length(pickup) between 1 and 40),
  stock integer check (stock >= 0),
  -- Made-to-order rules: {"cutoff": "10:00", "slots": ["12:30 to 13:30"]}.
  food jsonb check (food is null or jsonb_typeof(food) = 'object'),
  move_out boolean not null default false,
  promoted_until timestamptz,
  status public.listing_status not null default 'draft',
  -- Reset when the seller renews; drives freshness, ranking and expiry.
  posted_at timestamptz not null default now(),
  views integer not null default 0 check (views >= 0),
  saves integer not null default 0 check (saves >= 0),
  search tsvector generated always as (
    setweight(to_tsvector('simple', title), 'A')
    || setweight(to_tsvector('simple', description), 'B')
    || setweight(to_tsvector('simple', category), 'C')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.listings.posted_at is 'Set to now() on publish or renew; a listing older than the configured expiry is shown as expired.';

create index listings_feed_idx on public.listings (status, posted_at desc);
create index listings_seller_idx on public.listings (seller_id);
create index listings_category_idx on public.listings (category, status);
create index listings_search_idx on public.listings using gin (search);
create index listings_title_trgm_idx on public.listings using gin (title extensions.gin_trgm_ops);

create trigger listings_touch before update on public.listings
for each row execute function public.touch_updated_at();

create table public.listing_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id text not null references public.listings (id) on delete cascade on update cascade,
  url text not null check (url ~ '^https://'),
  position smallint not null default 0 check (position between 0 and 19),
  created_at timestamptz not null default now(),
  unique (listing_id, position)
);

create index listing_photos_listing_idx on public.listing_photos (listing_id, position);
