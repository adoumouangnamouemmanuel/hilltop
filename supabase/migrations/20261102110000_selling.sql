-- Selling: the listing rules from the platform config, enforced by the database too.
--
-- The sell form already checks these, but a student could call the API directly.
-- Limits come from the published config (Settings → Listings in the admin), so
-- changing them there applies here at once.

-- Photos are served from R2 in production. Local development serves them from the
-- app itself over http://localhost.
alter table public.listing_photos drop constraint listing_photos_url_check;
alter table public.listing_photos add constraint listing_photos_url_check
  check (url ~ '^https://' or url ~ '^http://(localhost|127\.0\.0\.1)(:[0-9]+)?/');

create or replace function public.check_listing_rules()
returns trigger
language plpgsql
-- Runs as the student: it only reads the published config and their own listings.
security invoker
set search_path = ''
as $$
declare
  v_rules jsonb;
  v_cap integer;
  v_expiry integer;
  v_active integer;
  v_word text;
  v_text text;
begin
  if private.is_trusted_caller() or private.has_permission('listings.moderate') then
    return new;
  end if;
  select config -> 'listings' into v_rules from public.current_config;
  if v_rules is null then
    return new;
  end if;

  if (v_rules ->> 'maxPrice') is not null and new.price > (v_rules ->> 'maxPrice')::numeric then
    raise exception 'The highest price allowed is GH₵%', v_rules ->> 'maxPrice' using errcode = '23514';
  end if;

  v_text := lower(new.title || ' ' || new.description);
  for v_word in select lower(jsonb_array_elements_text(coalesce(v_rules -> 'bannedWords', '[]'::jsonb))) loop
    if position(v_word in v_text) > 0 then
      raise exception 'This listing contains words that aren''t allowed on Hilltop' using errcode = '23514';
    end if;
  end loop;

  -- The cap counts live listings; drafts, sold and expired ones don't. Renewing an
  -- expired listing (a new posted_at) counts as making it live again.
  v_cap := coalesce((v_rules ->> 'maxActive')::integer, 0);
  v_expiry := coalesce((v_rules ->> 'expiryDays')::integer, 0);
  if v_cap > 0 and new.status = 'active'
     and (tg_op = 'INSERT' or old.status <> 'active' or new.posted_at is distinct from old.posted_at) then
    select count(*) into v_active
    from public.listings
    where seller_id = new.seller_id and status = 'active' and id <> new.id
      and (v_expiry = 0 or posted_at > now() - make_interval(days => v_expiry));
    if v_active >= v_cap then
      raise exception 'You can have % active listings at a time', v_cap using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger listings_rules before insert or update of title, description, price, status, posted_at on public.listings
for each row execute function public.check_listing_rules();

-- Drafts can be saved before a category is picked; live listings need one.
alter table public.listings drop constraint listings_category_check;
alter table public.listings add constraint listings_category_check
  check (char_length(category) <= 64 and (status = 'draft' or char_length(category) >= 1));

-- Counting a view discards the row, so the insert policy (live listings only) never
-- runs. Check the status in the trigger instead.
create or replace function public.count_listing_view()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.listings set views = views + 1 where id = new.listing_id and status = 'active';
  -- Nothing to keep: the counter is the record.
  return null;
end;
$$;
