-- ============================================================================
-- Session plans and attendance confirmations
-- ----------------------------------------------------------------------------
-- Sessions can be planned ahead: a theme (the title), a timetable and a
-- what-to-bring list. Before each session, parents say whether their son is
-- coming (rsvps).
-- After it, they confirm or flag what the coach's register says
-- (attendance_reviews). Coaches see both.
--
-- Already ran schema.sql before this existed? Run this file once in the
-- SQL Editor. (A fresh schema.sql already includes it.)
-- ============================================================================

alter table public.sessions
  add column timetable      jsonb   not null default '[]',   -- [{ "time": "19:00", "activity": "…" }]
  add column bring          text[]  not null default '{}',
  add column register_taken boolean not null default false;  -- parents review only once it's taken

update public.sessions s set register_taken = true
  where exists (select 1 from public.attendance a where a.session_id = s.id);

create table public.rsvps (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references public.profiles (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  date       date not null,
  going      boolean not null,
  reason     text,
  updated_at timestamptz not null default now(),
  unique (student_id, date)
);

create table public.attendance_reviews (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references public.profiles (id) on delete cascade,
  session_id   uuid not null references public.sessions (id) on delete cascade,
  student_id   uuid not null references public.students (id) on delete cascade,
  status       text not null check (status in ('confirmed', 'disputed', 'resolved')),
  seen_present boolean not null,  -- what the register said when the parent looked
  note         text,              -- the parent's explanation when flagging
  coach_note   text,              -- the coach's reply when resolving
  reviewed_at  timestamptz not null default now(),
  unique (session_id, student_id)
);

create index on public.rsvps (date);
create index on public.attendance_reviews (session_id);

-- Families can confirm or flag, but only a coach can mark a flag resolved
-- or write the coach's reply.
create or replace function public.guard_attendance_review()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_coach() then
    if new.status not in ('confirmed', 'disputed') then
      raise exception 'Only a coach can resolve an attendance query';
    end if;
    new.coach_note  := case when tg_op = 'UPDATE' then old.coach_note else null end;
    new.reviewed_at := now();
  end if;
  return new;
end $$;

create trigger attendance_reviews_guard
  before insert or update on public.attendance_reviews
  for each row execute function public.guard_attendance_review();

alter table public.rsvps              enable row level security;
alter table public.attendance_reviews enable row level security;

create policy "read rsvps"   on public.rsvps for select using (family_id = auth.uid() or public.is_coach());
create policy "add rsvp"     on public.rsvps for insert with check ((family_id = auth.uid() and public.is_my_student(student_id)) or public.is_coach());
create policy "change rsvp"  on public.rsvps for update using (family_id = auth.uid() or public.is_coach())
                                                    with check ((family_id = auth.uid() and public.is_my_student(student_id)) or public.is_coach());
create policy "remove rsvp"  on public.rsvps for delete using (family_id = auth.uid() or public.is_coach());

create policy "read reviews"   on public.attendance_reviews for select using (family_id = auth.uid() or public.is_coach());
create policy "add review"     on public.attendance_reviews for insert with check ((family_id = auth.uid() and public.is_my_student(student_id)) or public.is_coach());
create policy "change review"  on public.attendance_reviews for update using (family_id = auth.uid() or public.is_coach())
                                                              with check ((family_id = auth.uid() and public.is_my_student(student_id)) or public.is_coach());
create policy "coach removes review" on public.attendance_reviews for delete using (public.is_coach());
