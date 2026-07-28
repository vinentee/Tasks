# Tasks

Expo SDK 54 personal organization app with Supabase-backed auth, personal tasks, collaborative notes/lists/reminders, local notifications, and account settings.

## Setup

1. Use Node 20.19 or newer.
2. Copy `.env.example` to `.env` and fill in the Supabase URL/key.
3. Link the Supabase project and apply pending migrations:

```sh
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

If migrations were already applied manually, sync the Supabase CLI history first:

```sh
npx supabase migration repair 20260720120000 --status applied
npx supabase migration repair 20260720121000 --status applied
npx supabase migration list
```

4. Start the app with:

```sh
npx -p node@20 node ./node_modules/expo/bin/cli start --clear --host localhost --port 8081
```

Without Supabase env vars, the app opens in demo mode so the module structure can be reviewed before the backend is connected.

## Current Modules

- `Tarefas`: personal tasks with priority, status, due date/time and checklist items.
- `Colaboracao`: shared workspaces with email invitations, notes, lists, list items and reminders.
- `Ajustes`: account information, notification preference and workspace overview.
