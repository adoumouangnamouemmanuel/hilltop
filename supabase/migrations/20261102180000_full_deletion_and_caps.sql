-- Deleting a student removes them completely, and saved items and searches have caps.
--
-- Deleting a profile already cascades to everything that's theirs: listings and
-- photos, conversations and messages, offers, reviews, reports, saved items and
-- searches, notifications and their email. Orders were the exception (they blocked
-- the delete). They now outlive the student, without them: the other student keeps
-- the item, price and history, shown as from a deleted student.

alter table public.orders alter column buyer_id drop not null;
alter table public.orders alter column seller_id drop not null;
alter table public.orders drop constraint orders_buyer_id_fkey;
alter table public.orders drop constraint orders_seller_id_fkey;
alter table public.orders
  add constraint orders_buyer_id_fkey foreign key (buyer_id) references public.profiles (id) on delete set null;
alter table public.orders
  add constraint orders_seller_id_fkey foreign key (seller_id) references public.profiles (id) on delete set null;

-- Notifications for someone who no longer exists are skipped.
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
  select p_profile, p_kind, left(p_title, 120), left(coalesce(p_body, ''), 500), p_href
  where p_profile is not null;
$$;

-- Caps -------------------------------------------------------------------------------------
--
-- From the published config (Settings → Listings → Saved). Saved searches are the
-- important one: every search with alerts is checked whenever anyone publishes.

create or replace function public.check_saved_cap()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_cap integer;
  v_count integer;
begin
  if private.is_trusted_caller() then
    return new;
  end if;
  if tg_table_name = 'saved_searches' then
    select coalesce((config -> 'saved' ->> 'maxSearches')::integer, 20) into v_cap from public.current_config;
    select count(*) into v_count from public.saved_searches where profile_id = new.profile_id;
    if coalesce(v_cap, 20) > 0 and v_count >= coalesce(v_cap, 20) then
      raise exception 'You can save up to % searches. Remove one to save this.', coalesce(v_cap, 20) using errcode = '23514';
    end if;
  else
    select coalesce((config -> 'saved' ->> 'maxItems')::integer, 200) into v_cap from public.current_config;
    select count(*) into v_count from public.saved_listings where profile_id = new.profile_id;
    if coalesce(v_cap, 200) > 0 and v_count >= coalesce(v_cap, 200) then
      raise exception 'You can save up to % items. Remove some to save more.', coalesce(v_cap, 200) using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger saved_searches_cap before insert on public.saved_searches
for each row execute function public.check_saved_cap();
create trigger saved_listings_cap before insert on public.saved_listings
for each row execute function public.check_saved_cap();

-- Alerts only look at searches with alerts on.
create index saved_searches_alerts_idx on public.saved_searches (profile_id) where alerts;
