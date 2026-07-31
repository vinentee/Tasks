create table public.task_deadline_notifications (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  mode text not null check (mode in ('once', 'repeat')),
  start_minutes_before integer not null check (start_minutes_before > 0),
  interval_minutes integer check (interval_minutes is null or interval_minutes > 0),
  notification_ids text[] not null default '{}',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (task_id)
);

create trigger task_deadline_notifications_updated_at
before update on public.task_deadline_notifications
for each row execute function public.set_updated_at();

alter table public.task_deadline_notifications enable row level security;

create policy "task_deadline_notifications_owner_all" on public.task_deadline_notifications
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table public.task_deadline_notifications replica identity full;
alter publication supabase_realtime add table public.task_deadline_notifications;
