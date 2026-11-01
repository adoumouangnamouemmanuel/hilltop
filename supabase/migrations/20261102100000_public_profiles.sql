-- Public seller pages and listing counters.
--
-- * profiles.handle: the readable id in seller URLs (/seller/wellington). Set once
--   from the name when the profile is created; nobody can change it from the app.
-- * profiles.sales: completed sales, kept by the server (see the orders migration).
-- * listing_views: an insert-only door for counting views. The row is never stored;
--   the trigger bumps the listing's counter instead, which owners can't edit.

alter table public.profiles
  add column handle text unique check (handle ~ '^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$'),
  add column sales integer not null default 0 check (sales >= 0);

create or replace function public.set_profile_handle()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_base text;
  v_handle text;
begin
  if new.handle is not null then
    return new;
  end if;
  v_base := left(trim(both '-' from regexp_replace(lower(new.name), '[^a-z0-9]+', '-', 'g')), 40);
  if char_length(v_base) < 2 then
    v_base := 'student';
  end if;
  v_handle := v_base;
  while exists (select 1 from public.profiles where handle = v_handle) loop
    v_handle := v_base || '-' || substr(md5(random()::text), 1, 4);
  end loop;
  new.handle := v_handle;
  return new;
end;
$$;

create trigger profiles_handle before insert on public.profiles
for each row execute function public.set_profile_handle();

-- Existing profiles get one too.
do $$
declare
  r record;
  v_base text;
  v_handle text;
begin
  for r in select id, name from public.profiles where handle is null order by created_at loop
    v_base := left(trim(both '-' from regexp_replace(lower(r.name), '[^a-z0-9]+', '-', 'g')), 40);
    if char_length(v_base) < 2 then
      v_base := 'student';
    end if;
    v_handle := v_base;
    while exists (select 1 from public.profiles where handle = v_handle) loop
      v_handle := v_base || '-' || substr(md5(random()::text), 1, 4);
    end loop;
    update public.profiles set handle = v_handle where id = r.id;
  end loop;
end;
$$;

alter table public.profiles alter column handle set not null;

grant select (handle, sales) on public.profiles to anon, authenticated;

-- Views ----------------------------------------------------------------------------

create table public.listing_views (
  listing_id text not null references public.listings (id) on delete cascade on update cascade
);

comment on table public.listing_views is 'Never holds rows: inserting counts a view on the listing.';

alter table public.listing_views enable row level security;
grant insert (listing_id) on public.listing_views to anon, authenticated;
create policy "Anyone counts a view of a live listing" on public.listing_views
  for insert to anon, authenticated
  with check (exists (select 1 from public.listings l where l.id = listing_id and l.status = 'active'));

create or replace function public.count_listing_view()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.listings set views = views + 1 where id = new.listing_id;
  -- Nothing to keep: the counter is the record.
  return null;
end;
$$;

create trigger listing_views_count before insert on public.listing_views
for each row execute function public.count_listing_view();
