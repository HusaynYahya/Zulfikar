-- ============================================================================
-- Noticeboard: announcements coaches post for every family
-- ----------------------------------------------------------------------------
-- A notice shows on each family's home page until the day after expires_on
-- (or for good if that's left empty). Any signed-in member can read notices;
-- only coaches can post, edit or remove them.
--
-- Safe to run once in the SQL Editor on an existing database. (A fresh
-- schema.sql already includes it.)
-- ============================================================================

create table if not exists public.notices (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (char_length(title) between 1 and 120),
  body       text check (char_length(body) <= 2000),
  expires_on date,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists notices_created_at_idx on public.notices (created_at desc);

alter table public.notices enable row level security;

drop policy if exists "read notices"   on public.notices;
drop policy if exists "post notice"    on public.notices;
drop policy if exists "change notice"  on public.notices;
drop policy if exists "remove notice"  on public.notices;
create policy "read notices"  on public.notices for select using (auth.uid() is not null);
create policy "post notice"   on public.notices for insert with check (public.is_coach());
create policy "change notice" on public.notices for update using (public.is_coach()) with check (public.is_coach());
create policy "remove notice" on public.notices for delete using (public.is_coach());

grant select, insert, update, delete on public.notices to authenticated;
