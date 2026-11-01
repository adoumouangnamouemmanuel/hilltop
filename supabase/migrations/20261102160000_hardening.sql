-- Hardening before the pilot.
--
-- * Suspended students can still sign in and browse, but can't contact anyone,
--   make offers, order, review or report. (Listing was already blocked.)
-- * A cap on how fast anyone can send messages, offers and reports, so one
--   account can't flood others.

create or replace function public.require_active_student()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_trusted_caller() then
    return new;
  end if;
  if exists (select 1 from public.profiles where id = private.my_profile_id() and status = 'suspended') then
    raise exception 'Your account is suspended. Contact support if you think this is a mistake.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger offers_active before insert on public.offers
for each row execute function public.require_active_student();
create trigger conversations_active before insert on public.conversations
for each row execute function public.require_active_student();
create trigger messages_active before insert on public.messages
for each row execute function public.require_active_student();
create trigger orders_active before insert on public.orders
for each row execute function public.require_active_student();
create trigger reviews_active before insert on public.reviews
for each row execute function public.require_active_student();
create trigger reports_active before insert on public.reports
for each row execute function public.require_active_student();

-- Rate limits --------------------------------------------------------------------------

create or replace function public.limit_rate()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_me uuid := private.my_profile_id();
  v_recent integer;
  v_max integer := tg_argv[0]::integer;
begin
  if private.is_trusted_caller() then
    return new;
  end if;
  execute format(
    'select count(*) from public.%I where %I = $1 and %I > now() - interval ''1 minute''',
    tg_table_name, tg_argv[1], tg_argv[2]
  ) into v_recent using v_me;
  if v_recent >= v_max then
    raise exception 'You''re going a bit fast. Wait a minute and try again.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger messages_rate before insert on public.messages
for each row execute function public.limit_rate('20', 'sender_id', 'created_at');
create trigger offers_rate before insert on public.offers
for each row execute function public.limit_rate('10', 'buyer_id', 'created_at');
create trigger reports_rate before insert on public.reports
for each row execute function public.limit_rate('5', 'reporter_id', 'created_at');
create trigger orders_rate before insert on public.orders
for each row execute function public.limit_rate('10', 'buyer_id', 'placed_at');
