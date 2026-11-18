-- ============================================================================
-- Sons' own logins
-- ----------------------------------------------------------------------------
-- A parent can give a son his own login from Account. The son's profile has
-- role 'son', points at his student row and at his parent's profile. He sees
-- only his own sessions, replies, history and feedback; he can confirm his
-- own attendance and give feedback. He can't see or edit his brothers or the
-- family's details.
-- A son without an email address signs in with a username, stored as
-- <username>@sons.projectdhulfiqar.org (never emailed).
-- ============================================================================

alter table public.profiles add column if not exists student_id uuid references public.students (id) on delete cascade;
alter table public.profiles add column if not exists family_of  uuid references public.profiles (id) on delete cascade;
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('family', 'coach', 'son'));
create unique index if not exists profiles_one_login_per_son on public.profiles (student_id) where student_id is not null;

-- the family this person belongs to: a parent is their own family, a son his parent's
create or replace function public.my_family()
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce((select family_of from public.profiles where id = auth.uid()), auth.uid());
$$;
-- the student row a son's login is for (null for parents and coaches)
create or replace function public.my_student()
returns uuid language sql stable security definer set search_path = public as $$
  select student_id from public.profiles where id = auth.uid();
$$;
-- a parent: any of their boys; a son: only himself
create or replace function public.is_my_student(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case when public.my_student() is not null then sid = public.my_student()
              else exists (select 1 from public.students where id = sid and family_id = auth.uid()) end;
$$;

-- profiles: parents can also see their sons' logins
drop policy if exists "own profile or coach" on public.profiles;
create policy "own profile or coach" on public.profiles for select
  using (id = auth.uid() or family_of = auth.uid() or public.is_coach());

-- students: a son sees only his own row (and can't add or edit boys)
drop policy if exists "see own boys" on public.students;
create policy "see own boys" on public.students for select
  using (family_id = auth.uid() or id = public.my_student() or public.is_coach());

-- replies: a son reads and writes only his own
drop policy if exists "read rsvps"  on public.rsvps;
drop policy if exists "add rsvp"    on public.rsvps;
drop policy if exists "change rsvp" on public.rsvps;
drop policy if exists "remove rsvp" on public.rsvps;
create policy "read rsvps"  on public.rsvps for select
  using ((family_id = public.my_family() and public.is_my_student(student_id)) or public.is_coach());
create policy "add rsvp"    on public.rsvps for insert
  with check ((family_id = public.my_family() and public.is_my_student(student_id)) or public.is_coach());
create policy "change rsvp" on public.rsvps for update
  using ((family_id = public.my_family() and public.is_my_student(student_id)) or public.is_coach())
  with check ((family_id = public.my_family() and public.is_my_student(student_id)) or public.is_coach());
create policy "remove rsvp" on public.rsvps for delete
  using ((family_id = public.my_family() and public.is_my_student(student_id)) or public.is_coach());

-- feedback: a son reads and gives his own; parents still see the family's
drop policy if exists "read feedback" on public.feedback;
drop policy if exists "give feedback" on public.feedback;
create policy "read feedback" on public.feedback for select
  using (family_id = auth.uid() or (public.my_student() is not null and student_id = public.my_student()) or public.is_coach());
create policy "give feedback" on public.feedback for insert
  with check (family_id = public.my_family() and (student_id is null or public.is_my_student(student_id)));

-- a parent creates a login for one of their boys
create or replace function public.create_son_login(p_student uuid, p_login text, p_password text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  boy    public.students;
  login  text := lower(trim(p_login));
  v_email text;
  uid    uuid := gen_random_uuid();
begin
  select * into boy from public.students where id = p_student;
  if boy.id is null or boy.family_id <> auth.uid() then raise exception 'You can only create a login for your own son.'; end if;
  if exists (select 1 from public.profiles where student_id = p_student) then raise exception 'He already has a login.'; end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'Use at least 8 characters for the password.'; end if;
  if login = '' then raise exception 'Enter an email address or a username.'; end if;
  if position('@' in login) = 0 then
    if login !~ '^[a-z0-9._-]{3,30}$' then raise exception 'Usernames can use letters, numbers, dots, dashes and underscores (3 to 30).'; end if;
    v_email := login || '@sons.projectdhulfiqar.org';
  else
    v_email := login;
  end if;
  if exists (select 1 from auth.users u where lower(u.email) = v_email) then raise exception 'That email or username is already taken.'; end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', v_email,
          crypt(p_password, gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}', jsonb_build_object('parent_name', boy.first_name),
          now(), now(), '', '', '', '');
  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (uid::text, uid, jsonb_build_object('sub', uid::text, 'email', v_email, 'email_verified', true), 'email', now(), now(), now());

  -- handle_new_user made a family profile; turn it into the son's
  update public.profiles set role = 'son', student_id = boy.id, family_of = boy.family_id,
         parent_name = boy.first_name || ' ' || coalesce(boy.last_name, '')
   where id = uid;
  return v_email;
end $$;

-- a parent removes a son's login
create or replace function public.remove_son_login(p_student uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not exists (select 1 from public.students where id = p_student and family_id = auth.uid()) then
    raise exception 'You can only remove your own son''s login.';
  end if;
  select id into uid from public.profiles where student_id = p_student;
  if uid is not null then delete from auth.users where id = uid; end if;
end $$;

revoke all on function public.create_son_login(uuid, text, text) from public, anon;
revoke all on function public.remove_son_login(uuid) from public, anon;
grant execute on function public.create_son_login(uuid, text, text) to authenticated;
grant execute on function public.remove_son_login(uuid) to authenticated;
