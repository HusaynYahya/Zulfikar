-- Paid bookings from the Hujjat payment system (hujj.at/ahy).
-- A row means the boy is PAID for that evening. It is separate from rsvps:
-- families still confirm attendance themselves in the portal.
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  date date not null,
  booking_type text not null default 'single' check (booking_type in ('block', 'single')),
  order_ref text,
  created_at timestamptz not null default now(),
  unique (student_id, date)
);
alter table public.bookings enable row level security;

drop policy if exists "read bookings" on public.bookings;
create policy "read bookings" on public.bookings for select
  using ((family_id = my_family() and is_my_student(student_id)) or is_coach());
drop policy if exists "coach bookings" on public.bookings;
create policy "coach bookings" on public.bookings for all
  using (is_coach()) with check (is_coach());
