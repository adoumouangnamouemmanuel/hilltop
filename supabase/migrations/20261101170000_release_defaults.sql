-- The server numbers every release (stamp_config_release), so clients don't send
-- a version. A default makes that explicit in the generated types.
alter table public.config_releases alter column version set default 0;
