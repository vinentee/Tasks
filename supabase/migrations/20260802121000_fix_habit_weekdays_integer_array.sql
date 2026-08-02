alter table public.habits
alter column weekdays type integer[]
using weekdays::integer[];
