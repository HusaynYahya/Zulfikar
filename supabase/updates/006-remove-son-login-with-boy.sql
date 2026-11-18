-- When a coach removes a boy, his own login goes too (his profile is deleted
-- with him; this deletes the sign-in account behind it).
create or replace function public.drop_son_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'son' then delete from auth.users where id = old.id; end if;
  return old;
end $$;
drop trigger if exists profiles_drop_son_login on public.profiles;
create trigger profiles_drop_son_login after delete on public.profiles
  for each row execute function public.drop_son_auth_user();
