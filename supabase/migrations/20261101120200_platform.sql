-- The platform side: published config and its draft, admin roles and team, the
-- audit log, and the helper functions every security policy relies on.

create type public.member_status as enum ('invited', 'active');

-- Platform config ------------------------------------------------------------

-- Every published version is kept, so the admin can show history and roll back.
create table public.config_releases (
  version integer primary key,
  config jsonb not null check (jsonb_typeof(config) = 'object'),
  published_by uuid references public.profiles (id) on delete set null,
  published_by_name text,
  note text not null default '' check (char_length(note) <= 280),
  -- Config paths that changed compared with the previous release.
  changes text[] not null default '{}',
  published_at timestamptz not null default now()
);

-- The config the marketplace runs on: the newest release.
create view public.current_config with (security_invoker = true) as
select version, config, published_at
from public.config_releases
order by version desc
limit 1;

-- Shared unpublished edits. A single row.
create table public.config_draft (
  id boolean primary key default true check (id),
  config jsonb not null check (jsonb_typeof(config) = 'object'),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Admin team -----------------------------------------------------------------

create table public.admin_roles (
  id text primary key check (id ~ '^[a-z0-9-]{1,40}$'),
  name text not null check (char_length(name) between 1 and 30),
  description text not null default '' check (char_length(description) <= 120),
  -- Permission names from packages/shared/src/permissions.ts. The owner role has all of them.
  permissions text[] not null default '{}',
  -- Built-in roles can be renamed but not deleted.
  system boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.admin_members (
  id uuid primary key default gen_random_uuid(),
  -- Invites are by email; the profile is linked when the person first signs in.
  email text not null unique check (email = lower(email)),
  name text not null check (char_length(name) between 1 and 80),
  profile_id uuid unique references public.profiles (id) on delete set null,
  role_id text not null references public.admin_roles (id) on update cascade on delete restrict,
  status public.member_status not null default 'invited',
  invited_by uuid references public.profiles (id) on delete set null,
  invited_at timestamptz not null default now(),
  last_active_at timestamptz
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid references public.profiles (id) on delete set null,
  actor_name text not null,
  -- The permission the action used, or "session" for sign-ins.
  permission text not null,
  action text not null check (char_length(action) <= 200),
  target text check (char_length(target) <= 200)
);

create index audit_log_at_idx on public.audit_log (at desc);

-- Helper functions -----------------------------------------------------------
-- Security definer so policies can call them without granting access to the
-- tables they read. They only ever describe the current user.

create or replace function public.my_profile_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.profiles where user_id = (select auth.uid());
$$;

create or replace function public.has_permission(permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_members m
    join public.admin_roles r on r.id = m.role_id
    join public.profiles p on p.id = m.profile_id
    where p.user_id = (select auth.uid())
      and m.status = 'active'
      and p.status = 'active'
      and (r.id = 'owner' or permission = any (r.permissions))
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_members m
    join public.profiles p on p.id = m.profile_id
    where p.user_id = (select auth.uid()) and m.status = 'active' and p.status = 'active'
  );
$$;

-- The current admin's permissions, for showing and hiding parts of the portal.
create or replace function public.my_permissions()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select case when r.id = 'owner' then array['*'] else r.permissions end
     from public.admin_members m
     join public.admin_roles r on r.id = m.role_id
     join public.profiles p on p.id = m.profile_id
     where p.user_id = (select auth.uid()) and m.status = 'active' and p.status = 'active'),
    '{}'
  );
$$;
