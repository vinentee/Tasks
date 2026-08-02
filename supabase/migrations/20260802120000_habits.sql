create type public.habit_frequency as enum ('daily', 'weekdays', 'weekly_goal');

create table public.habits (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  description text,
  frequency public.habit_frequency not null default 'daily',
  weekdays smallint[] not null default '{}',
  weekly_goal integer,
  reminder_time time,
  reminder_notification_ids text[] not null default '{}',
  color text not null default '#2563eb',
  icon text not null default 'sparkles',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint habits_weekly_goal_check check (weekly_goal is null or (weekly_goal between 1 and 7))
);

create table public.habit_check_ins (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references public.habits (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  check_date date not null,
  created_at timestamptz not null default now(),
  unique (habit_id, check_date)
);

create trigger habits_updated_at
before update on public.habits
for each row execute function public.set_updated_at();

alter table public.habits enable row level security;
alter table public.habit_check_ins enable row level security;

create policy "habits_select_own" on public.habits
for select using (owner_id = auth.uid());

create policy "habits_insert_own" on public.habits
for insert with check (owner_id = auth.uid());

create policy "habits_update_own" on public.habits
for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "habits_delete_own" on public.habits
for delete using (owner_id = auth.uid());

create policy "habit_check_ins_select_own" on public.habit_check_ins
for select using (owner_id = auth.uid());

create policy "habit_check_ins_insert_own" on public.habit_check_ins
for insert with check (
  owner_id = auth.uid()
  and exists (
    select 1
    from public.habits h
    where h.id = habit_id
      and h.owner_id = auth.uid()
  )
);

create policy "habit_check_ins_delete_own" on public.habit_check_ins
for delete using (owner_id = auth.uid());
