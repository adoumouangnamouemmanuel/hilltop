-- Feedback from students and visitors, and a fix for saving browsing history.
--
-- * Browsing and search history are saved with an upsert, which updates every column
--   it sends. Students could only update the timestamp, so every save after the first
--   failed and history (and the personalised category bar built on it) stayed empty.
-- * feedback: "Report a problem / share an idea" from any page. Anyone can send it,
--   a few times an hour; admins with feedback.view read it and mark it handled.

-- History ----------------------------------------------------------------------------------

grant update (profile_id, listing_id) on public.browsing_history to authenticated;
grant update (profile_id, query) on public.search_history to authenticated;

-- Feedback ----------------------------------------------------------------------------------

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('bug', 'idea', 'other')),
  message text not null check (char_length(trim(message)) between 3 and 2000),
  -- Where it was sent from and on what, to reproduce bugs. Filled in by the browser.
  page text check (char_length(page) <= 300),
  device text check (char_length(device) <= 300),
  -- Set by the database: the student, if signed in.
  profile_id uuid references public.profiles (id) on delete set null,
  -- A hash of the sender's network address, only for the rate limit.
  sender text,
  status text not null default 'new' check (status in ('new', 'seen', 'closed')),
  handled_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index feedback_open_idx on public.feedback (created_at desc) where status <> 'closed';
create index feedback_sender_idx on public.feedback (sender, created_at desc);

alter table public.feedback enable row level security;
grant insert (kind, message, page, device) on public.feedback to anon, authenticated;
grant select, update (status) on public.feedback to authenticated;

create policy "Anyone sends feedback" on public.feedback
  for insert to anon, authenticated with check (true);
create policy "The team reads feedback" on public.feedback
  for select to authenticated using (private.has_permission('feedback.view'));
create policy "The team handles feedback" on public.feedback
  for update to authenticated
  using (private.has_permission('feedback.view'))
  with check (private.has_permission('feedback.view'));

create or replace function public.stamp_feedback()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_headers json := nullif(current_setting('request.headers', true), '')::json;
begin
  if tg_op = 'UPDATE' then
    new.handled_by := private.my_profile_id();
    return new;
  end if;
  new.profile_id := private.my_profile_id();
  new.status := 'new';
  new.created_at := now();
  new.message := trim(new.message);
  new.sender := coalesce(
    new.profile_id::text,
    'ip:' || md5(coalesce(v_headers ->> 'cf-connecting-ip', trim(split_part(v_headers ->> 'x-forwarded-for', ',', 1)), 'unknown'))
  );
  -- Five an hour from one person or network is plenty for real reports.
  if (select count(*) from public.feedback where sender = new.sender and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Thanks! You''ve sent a lot of feedback recently. Try again in a while.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger feedback_stamp before insert or update on public.feedback
for each row execute function public.stamp_feedback();

-- Who can read it: owners always; the built-in Operations and Support roles from now on.
update public.admin_roles
set permissions = array_append(permissions, 'feedback.view')
where id in ('operations', 'support') and not ('feedback.view' = any (permissions));
