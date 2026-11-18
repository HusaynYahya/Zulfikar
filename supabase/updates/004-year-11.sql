-- Allow Year 11 (programme is now Years 7-11)
alter table public.students drop constraint students_year_group_check;
alter table public.students add constraint students_year_group_check check (year_group between 7 and 11);
