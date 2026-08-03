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

5. To enable the Home chatbot, configure the OpenAI key as a Supabase Edge Function secret and deploy the function:

```sh
npx supabase secrets set OPENAI_API_KEY=your-openai-api-key
npx supabase functions deploy task-assistant
```

Without Supabase env vars, the app opens in demo mode so the module structure can be reviewed before the backend is connected.

## Android preview APK

This project is configured for EAS internal Android builds through the `preview` profile in `eas.json`. The preview build generates an installable `.apk` that can be shared with Android testers before publishing to an app store.

1. Install and sign in to EAS CLI:

```sh
npm install -g eas-cli
eas login
```

2. Configure the public Supabase environment variables for cloud builds:

```sh
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value "https://your-project-ref.supabase.co"
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value "your-publishable-or-anon-key"
```

3. Make sure the Supabase backend is deployed:

```sh
npx supabase db push
npx supabase secrets set OPENAI_API_KEY=your-openai-api-key
npx supabase functions deploy task-assistant
```

4. Build the Android APK:

```sh
eas build -p android --profile preview
```

When the build finishes, EAS provides a download/install link that can be sent to Android testers. They may need to allow installation from outside the Play Store.

## Current Modules

- `Tarefas`: personal tasks with priority, status, due date/time and checklist items.
- `Colaboracao`: shared workspaces with email invitations, notes, lists, list items and reminders.
- `Ajustes`: account information, notification preference and workspace overview.
