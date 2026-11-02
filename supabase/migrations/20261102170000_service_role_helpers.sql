-- The server (the secret key's service_role) writes through the same triggers as
-- students, and those call the helpers in the private schema. It was never given
-- access, so server-side writes to profiles, listings, offers and orders failed with
-- "permission denied for schema private". It's a trusted role, so it gets them all.
grant usage on schema private to service_role;
grant execute on all functions in schema private to service_role;
alter default privileges in schema private grant execute on functions to service_role;
