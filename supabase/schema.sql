-- ============================================================================
-- PROJECT ZULFIQAR — database schema for Supabase
-- ----------------------------------------------------------------------------
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- It is safe to run once on a fresh project.
--
-- Who can see what (enforced here, not in the browser):
--   • A family sees only its own profile, boys, attendance, homework answers,
--     feedback and payments. It sees published session recaps and all homework.
--   • A coach sees and manages everything.
--   • Nobody can make themselves a coach from the portal, and families cannot
--     record payments — only Stripe (via the webhook) or a coach can.
--
-- To make someone a coach, after they have signed up:
--   update public.profiles set role = 'coach' where email = 'coach@example.com';
-- ============================================================================

-- ---- tables ----------------------------------------------------------------

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  parent_name text,
  phone       text,
  role        text not null default 'family' check (role in ('family', 'coach')),
  created_at  timestamptz not null default now()
);

create table public.students (
  id              uuid primary key default gen_random_uuid(),
  family_id       uuid not null references public.profiles (id) on delete cascade,
  first_name      text not null,
  last_name       text not null,
  year_group      int  not null check (year_group between 7 and 10),
  date_of_birth   date,
  school          text,
  medical_notes   text,
  emergency_name  text,
  emergency_phone text,
  photo_consent   boolean not null default false,
  created_at      timestamptz not null default now()
);

create table public.sessions (
  id         uuid primary key default gen_random_uuid(),
  date       date not null,
  location   text not null,
  title      text not null,
  pillars    text[] not null default '{}',
  recap      text,
  takeaways  text[] not null default '{}',
  timetable  jsonb  not null default '[]',   -- [{ "time": "19:00", "activity": "…" }]
  bring      text[] not null default '{}',   -- what to bring
  register_taken boolean not null default false,
  published  boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.attendance (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  present    boolean not null default true,
  unique (session_id, student_id)
);

create table public.homework (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid references public.sessions (id) on delete set null,
  pillar       text,
  title        text not null,
  instructions text not null,
  due_date     date,
  created_at   timestamptz not null default now()
);

create table public.submissions (
  id            uuid primary key default gen_random_uuid(),
  homework_id   uuid not null references public.homework (id) on delete cascade,
  student_id    uuid not null references public.students (id) on delete cascade,
  answer        text not null,
  status        text not null default 'submitted' check (status in ('submitted', 'reviewed')),
  coach_comment text,
  submitted_at  timestamptz not null default now(),
  reviewed_at   timestamptz,
  unique (homework_id, student_id)
);

create table public.feedback (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references public.profiles (id) on delete cascade,
  student_id uuid references public.students (id) on delete set null,
  session_id uuid references public.sessions (id) on delete set null,
  rating     int not null check (rating between 1 and 5),
  enjoyed    text,
  improve    text,
  anonymous  boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.payments (
  id                uuid primary key default gen_random_uuid(),
  family_id         uuid not null references public.profiles (id) on delete cascade,
  student_id        uuid not null references public.students (id) on delete cascade,
  kind              text not null check (kind in ('session', 'month')),
  period            text not null check (period ~ '^\d{4}-\d{2}$'),  -- 'YYYY-MM'
  amount_pence      int  not null check (amount_pence > 0),
  method            text not null default 'stripe' check (method in ('stripe', 'cash', 'bank')),
  status            text not null default 'paid' check (status in ('paid', 'refunded')),
  stripe_session_id text unique,
  created_at        timestamptz not null default now()
);

create index on public.students (family_id);
create index on public.attendance (student_id);
create index on public.submissions (student_id);
create index on public.payments (student_id, period);

-- ---- helpers ---------------------------------------------------------------

create or replace function public.is_coach()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'coach');
$$;

create or replace function public.is_my_student(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.students where id = sid and family_id = auth.uid());
$$;

-- On sign-up, create the family profile and the boys from the registration
-- form. The role is always 'family' here, whatever the browser sends.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  b jsonb;
begin
  insert into public.profiles (id, email, parent_name, phone, role)
  values (new.id, new.email,
          new.raw_user_meta_data ->> 'parent_name',
          new.raw_user_meta_data ->> 'phone',
          'family');

  -- a family registers a handful of sons at most; stops bulk junk sign-ups
  if jsonb_array_length(coalesce(new.raw_user_meta_data -> 'boys', '[]'::jsonb)) > 6 then
    raise exception 'Too many boys on one registration';
  end if;

  for b in select * from jsonb_array_elements(coalesce(new.raw_user_meta_data -> 'boys', '[]'::jsonb)) loop
    insert into public.students (family_id, first_name, last_name, year_group, date_of_birth,
                                 school, medical_notes, emergency_name, emergency_phone, photo_consent)
    values (new.id,
            b ->> 'first_name',
            b ->> 'last_name',
            (b ->> 'year_group')::int,
            nullif(b ->> 'date_of_birth', '')::date,
            b ->> 'school',
            b ->> 'medical_notes',
            b ->> 'emergency_name',
            b ->> 'emergency_phone',
            coalesce((b ->> 'photo_consent')::boolean, false));
  end loop;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- When a family edits a homework answer, keep the coach's fields untouched
-- and put the answer back into the "submitted" state.
create or replace function public.guard_submission()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_coach() then
    if tg_op = 'UPDATE' then
      new.homework_id := old.homework_id;
      new.student_id  := old.student_id;
    end if;
    new.status        := 'submitted';
    new.coach_comment := case when tg_op = 'UPDATE' then old.coach_comment else null end;
    new.reviewed_at   := null;
    new.submitted_at  := now();
  end if;
  return new;
end $$;

create trigger submissions_guard
  before insert or update on public.submissions
  for each row execute function public.guard_submission();

-- ---- row-level security ----------------------------------------------------

alter table public.profiles    enable row level security;
alter table public.students    enable row level security;
alter table public.sessions    enable row level security;
alter table public.attendance  enable row level security;
alter table public.homework    enable row level security;
alter table public.submissions enable row level security;
alter table public.feedback    enable row level security;
alter table public.payments    enable row level security;

-- profiles: families may only edit their name and phone (never their role)
create policy "own profile or coach" on public.profiles for select using (id = auth.uid() or public.is_coach());
create policy "update own profile"   on public.profiles for update using (id = auth.uid() or public.is_coach());
revoke update on public.profiles from authenticated;
grant update (parent_name, phone) on public.profiles to authenticated;

-- students
create policy "see own boys"    on public.students for select using (family_id = auth.uid() or public.is_coach());
create policy "add own boys"    on public.students for insert with check (family_id = auth.uid() or public.is_coach());
create policy "edit own boys"   on public.students for update using (family_id = auth.uid() or public.is_coach())
                                                          with check (family_id = auth.uid() or public.is_coach());
create policy "coach removes"   on public.students for delete using (public.is_coach());

-- sessions: everyone signed in reads published recaps; coaches write
create policy "read sessions"   on public.sessions for select to authenticated using (published or public.is_coach());
create policy "coach sessions"  on public.sessions for all using (public.is_coach()) with check (public.is_coach());

-- attendance
create policy "read attendance" on public.attendance for select using (public.is_my_student(student_id) or public.is_coach());
create policy "coach attendance" on public.attendance for all using (public.is_coach()) with check (public.is_coach());

-- homework
create policy "read homework"   on public.homework for select to authenticated using (true);
create policy "coach homework"  on public.homework for all using (public.is_coach()) with check (public.is_coach());

-- submissions
create policy "read submissions"   on public.submissions for select using (public.is_my_student(student_id) or public.is_coach());
create policy "submit homework"    on public.submissions for insert with check (public.is_my_student(student_id) or public.is_coach());
create policy "edit submission"    on public.submissions for update using (public.is_my_student(student_id) or public.is_coach())
                                                                  with check (public.is_my_student(student_id) or public.is_coach());
create policy "coach deletes subs" on public.submissions for delete using (public.is_coach());

-- feedback
create policy "read feedback"  on public.feedback for select using (family_id = auth.uid() or public.is_coach());
create policy "give feedback"  on public.feedback for insert with check (
  family_id = auth.uid() and (student_id is null or public.is_my_student(student_id)));
create policy "coach feedback" on public.feedback for delete using (public.is_coach());

-- payments: families read their own; only coaches (cash/bank) and the Stripe
-- webhook (service role, which bypasses RLS) can write
create policy "read payments"  on public.payments for select using (family_id = auth.uid() or public.is_coach());
create policy "coach payments" on public.payments for all using (public.is_coach()) with check (public.is_coach());


-- ---- attendance confirmations (also in updates/001-session-plans-and-attendance.sql) --
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

-- ---- table privileges (also in updates/002-grants.sql) ---------------------
-- Grant the signed-in role access to the tables; row-level security above
-- still decides which rows each person sees. Without this, some projects
-- return "permission denied for table ...".
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
-- a family may change only its name and phone, never its role
revoke update on public.profiles from authenticated;
grant update (parent_name, phone) on public.profiles to authenticated;
