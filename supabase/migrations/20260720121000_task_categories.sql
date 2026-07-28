create table if not exists public.task_categories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  color text not null default '#2563eb',
  icon text not null default 'list',
  position integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name)
);

alter table public.tasks
add column if not exists category_id uuid references public.task_categories (id) on delete set null;

drop trigger if exists task_categories_updated_at on public.task_categories;
create trigger task_categories_updated_at
before update on public.task_categories
for each row execute function public.set_updated_at();

alter table public.task_categories enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'task_categories'
      and policyname = 'task_categories_owner_all'
  ) then
    create policy "task_categories_owner_all" on public.task_categories
    for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'tasks'
      and policyname = 'tasks_category_owner_check'
  ) then
    create policy "tasks_category_owner_check" on public.tasks
    as restrictive
    for insert
    with check (
      category_id is null
      or exists (
        select 1
        from public.task_categories tc
        where tc.id = category_id
          and tc.owner_id = auth.uid()
      )
    );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'tasks'
      and policyname = 'tasks_category_owner_update_check'
  ) then
    create policy "tasks_category_owner_update_check" on public.tasks
    as restrictive
    for update
    with check (
      category_id is null
      or exists (
        select 1
        from public.task_categories tc
        where tc.id = category_id
          and tc.owner_id = auth.uid()
      )
    );
  end if;
end;
$$;

alter table public.task_categories replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.task_categories;
exception
  when duplicate_object then null;
end;
$$;
