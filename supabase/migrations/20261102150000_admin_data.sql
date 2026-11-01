-- What the admin portal needs to run the marketplace on real data.
--
-- Students' email addresses live in Supabase Auth, out of the API's reach. This
-- copies each one next to its profile, readable only by admins with users.view,
-- so the team can find and contact a student.

create table public.profile_emails (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  email text not null
);

comment on table public.profile_emails is 'Sign-in email for each profile. Admins with users.view only.';

alter table public.profile_emails enable row level security;
grant select on public.profile_emails to authenticated;
create policy "Admins see students' emails" on public.profile_emails
  for select to authenticated using (private.has_permission('users.view'));

create or replace function public.copy_profile_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profile_emails (profile_id, email)
  select p.id, lower(new.email) from public.profiles p where p.user_id = new.id and new.email is not null
  on conflict (profile_id) do update set email = excluded.email;
  return null;
end;
$$;

-- Runs after on_auth_user_created (triggers fire in name order), once the profile exists.
create trigger on_auth_user_email after insert or update of email on auth.users
for each row execute function public.copy_profile_email();

insert into public.profile_emails (profile_id, email)
select p.id, lower(u.email) from public.profiles p join auth.users u on u.id = p.user_id where u.email is not null
on conflict (profile_id) do nothing;
