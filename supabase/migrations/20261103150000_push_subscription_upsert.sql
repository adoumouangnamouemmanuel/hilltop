-- Turning on notifications saves the browser's subscription with an upsert, which
-- updates every column it sends, endpoint included. Students could only update the
-- other three, so every save was refused and nobody could turn notifications on.
-- Row-level security still limits them to their own rows, and the push-service check
-- on endpoint still applies.
grant update (endpoint) on public.push_subscriptions to authenticated;
