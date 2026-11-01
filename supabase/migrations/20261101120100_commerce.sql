-- Buying, selling and talking: saved items, offers, chat, orders, disputes,
-- reviews, reports and notifications. Writes that move money or stock (placing
-- orders, disputes) go through functions added with the order flow, not direct inserts.

create type public.offer_status as enum ('pending', 'accepted', 'declined', 'withdrawn');
create type public.payment_kind as enum ('protected', 'deposit', 'pickup');
create type public.order_status as enum ('paid', 'ready', 'collected', 'disputed', 'refunded', 'cancelled');
create type public.dispute_state as enum ('open', 'withdrawn', 'refunded', 'released');
create type public.report_status as enum ('open', 'dismissed', 'actioned');

-- Saved items and searches ---------------------------------------------------

create table public.saved_listings (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  listing_id text not null references public.listings (id) on delete cascade on update cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, listing_id)
);

create index saved_listings_listing_idx on public.saved_listings (listing_id);

create table public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 80),
  -- Browse query string, e.g. "q=casio&max=150".
  query text not null check (char_length(query) <= 500),
  alerts boolean not null default true,
  -- Listing ids already seen, to count new matches.
  seen_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (profile_id, query)
);

-- Offers ---------------------------------------------------------------------

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  listing_id text not null references public.listings (id) on delete cascade on update cascade,
  buyer_id uuid not null references public.profiles (id) on delete cascade,
  amount numeric(10, 2) not null check (amount > 0),
  status public.offer_status not null default 'pending',
  created_at timestamptz not null default now(),
  answered_at timestamptz
);

-- One open offer per buyer per listing.
create unique index offers_one_pending_idx on public.offers (listing_id, buyer_id) where status = 'pending';
create index offers_buyer_idx on public.offers (buyer_id);

-- Conversations --------------------------------------------------------------

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id text references public.listings (id) on delete set null on update cascade,
  buyer_id uuid not null references public.profiles (id) on delete cascade,
  seller_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  check (buyer_id <> seller_id),
  unique (listing_id, buyer_id)
);

create index conversations_buyer_idx on public.conversations (buyer_id, last_message_at desc);
create index conversations_seller_idx on public.conversations (seller_id, last_message_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index messages_conversation_idx on public.messages (conversation_id, created_at);

-- Orders ---------------------------------------------------------------------

create table public.orders (
  id text primary key default 'ord-' || encode(extensions.gen_random_bytes(5), 'hex'),
  -- Kept if the listing is deleted later; the title and prices are snapshots.
  listing_id text references public.listings (id) on delete set null on update cascade,
  listing_title text not null,
  buyer_id uuid not null references public.profiles (id) on delete restrict,
  seller_id uuid not null references public.profiles (id) on delete restrict,
  quantity integer not null default 1 check (quantity between 1 and 100),
  unit_price numeric(10, 2) not null check (unit_price >= 0),
  amount numeric(10, 2) not null check (amount >= 0),
  -- Buyer protection fee on the part paid in the app.
  fee numeric(10, 2) not null default 0 check (fee >= 0),
  payment_kind public.payment_kind not null,
  paid_in_app numeric(10, 2) not null default 0 check (paid_in_app >= 0),
  due_at_pickup numeric(10, 2) not null default 0 check (due_at_pickup >= 0),
  slot text check (char_length(slot) <= 60),
  pickup text,
  status public.order_status not null default 'paid',
  handed_over_at timestamptz,
  auto_released boolean not null default false,
  placed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (buyer_id <> seller_id)
);

create index orders_buyer_idx on public.orders (buyer_id, placed_at desc);
create index orders_seller_idx on public.orders (seller_id, placed_at desc);
create index orders_open_idx on public.orders (status) where status in ('paid', 'ready', 'disputed');

create trigger orders_touch before update on public.orders
for each row execute function public.touch_updated_at();

create table public.order_events (
  id bigint generated always as identity primary key,
  order_id text not null references public.orders (id) on delete cascade,
  status public.order_status not null,
  actor_id uuid references public.profiles (id) on delete set null,
  note text,
  at timestamptz not null default now()
);

create index order_events_order_idx on public.order_events (order_id, at);

-- Disputes -------------------------------------------------------------------

create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  order_id text not null unique references public.orders (id) on delete cascade,
  -- Reason id from the platform config.
  reason text not null,
  details text not null default '' check (char_length(details) <= 2000),
  state public.dispute_state not null default 'open',
  opened_at timestamptz not null default now(),
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  resolution_note text check (char_length(resolution_note) <= 1000)
);

create table public.dispute_messages (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.disputes (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  role text not null check (role in ('buyer', 'seller', 'admin')),
  body text not null check (char_length(body) between 1 and 2000),
  at timestamptz not null default now()
);

create index dispute_messages_dispute_idx on public.dispute_messages (dispute_id, at);

-- Reviews --------------------------------------------------------------------

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  order_id text not null unique references public.orders (id) on delete cascade,
  seller_id uuid not null references public.profiles (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  tags text[] not null default '{}',
  body text not null default '' check (char_length(body) <= 1000),
  created_at timestamptz not null default now()
);

create index reviews_seller_idx on public.reviews (seller_id, created_at desc);

-- Reports --------------------------------------------------------------------

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  listing_id text not null references public.listings (id) on delete cascade on update cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  -- Reason id from the platform config.
  reason text not null,
  details text not null default '' check (char_length(details) <= 500),
  status public.report_status not null default 'open',
  created_at timestamptz not null default now(),
  handled_by uuid references public.profiles (id) on delete set null,
  handled_at timestamptz,
  unique (listing_id, reporter_id)
);

create index reports_open_idx on public.reports (status, created_at) where status = 'open';

-- Notifications --------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('offer', 'order', 'message', 'payout', 'alert', 'review', 'dispute', 'system')),
  title text not null check (char_length(title) <= 120),
  body text not null default '' check (char_length(body) <= 500),
  href text not null default '/' check (href ~ '^/'),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_profile_idx on public.notifications (profile_id, created_at desc);
