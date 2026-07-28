alter table public.profiles
add column if not exists theme_key text not null default 'blue';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_theme_key_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
    add constraint profiles_theme_key_check
    check (theme_key in ('blue', 'lilac', 'amber', 'emerald', 'rose'));
  end if;
end $$;
