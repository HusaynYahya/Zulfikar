-- ============================================================================
-- Fix: "permission denied for table profiles" (and the other tables)
-- ----------------------------------------------------------------------------
-- Some Supabase projects don't auto-grant table privileges to the signed-in
-- role, so even with the right row-level security the app gets a flat
-- "permission denied". This grants the privileges; row-level security still
-- decides which rows each person actually sees.
--
-- Safe to run once in the SQL Editor. (A fresh schema.sql now includes this.)
-- ============================================================================

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on all tables in schema public to authenticated;

-- new tables added later get the same treatment automatically
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

-- keep the profiles rule: a family may only change its name and phone,
-- never its role (re-assert, since the blanket grant above touched profiles)
revoke update on public.profiles from authenticated;
grant update (parent_name, phone) on public.profiles to authenticated;
