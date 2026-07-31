import type { Session } from '@supabase/supabase-js';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import {
  ArrowLeft,
  CalendarDays,
  Bell,
  Check,
  FolderKanban,
  Home as HomeIcon,
  ListTodo,
  LogOut,
  MapPin,
  Pencil,
  Plus,
  Sparkles,
  UserRound,
  WalletCards,
  type LucideIcon,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  Switch,
  View,
} from 'react-native';

import { Button, Card, Field, Pill, SectionTitle, useTextStyles } from './components/ui';
import {
  demoChecklistItems,
  demoTaskCategories,
  demoFolderMembers,
  demoFolderChecklistItems,
  demoFolderChecklists,
  demoFolderComments,
  demoFolderFiles,
  demoFolderSections,
  demoInvitations,
  demoListItems,
  demoLists,
  demoMemberProfiles,
  demoNotes,
  demoReminders,
  demoTasks,
  demoUserId,
  demoWorkspaceMembers,
  demoWorkspaces,
  demoWorkspaceFolders,
} from './data/demo';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import {
  cancelLocalReminder,
  cancelLocalReminders,
  scheduleLocalReminder,
  scheduleTaskDeadlineNotifications,
  type TaskDeadlineNotificationInput,
} from './services/notifications';
import { fontFamily, isThemeKey, radius, spacing, themeOptions, typography, type AppColors, type ThemeKey } from './theme/tokens';
import { ThemeProvider, useTheme } from './theme/theme-context';
import type { ReceivedWorkspaceInvitation } from './types/database';
import type {
  ChecklistItem,
  Priority,
  Reminder,
  SharedList,
  SharedListItem,
  SharedNote,
  Task,
  TaskCategory,
  TaskDeadlineNotificationRule,
  TaskStatus,
  FolderChecklist,
  FolderChecklistItem,
  FolderComment,
  FolderFile,
  FolderMember,
  FolderSection,
  Workspace,
  WorkspaceFolder,
  WorkspaceInvitation,
  WorkspaceMember,
} from './types/domain';

type MainTabKey = 'home' | 'tasks' | 'notes' | 'calendar';
type TabKey = MainTabKey | 'profile';
type UserContext = { id: string; email: string; fullName: string | null };
type MemberProfile = { email: string; full_name: string | null; id: string };
type ReceivedInvitation = ReceivedWorkspaceInvitation;
type TaskCreateInput = {
  categoryId: string | null;
  checklistItems: string[];
  description: string | null;
  dueAt: string | null;
  notificationRule: TaskDeadlineNotificationInput | null;
  priority: Priority;
  title: string;
};
type SmartPlanChecklistItem = {
  assignedLabel: string | null;
  title: string;
};
type SmartPlanSectionDraft = Pick<FolderSection, 'kind' | 'title' | 'body' | 'media_url'>;
type SmartPlanDraft = {
  checklistItems: SmartPlanChecklistItem[];
  checklistTitle: string;
  description: string;
  folderName: string;
  reminders: Array<{ remindAt: string; title: string }>;
  sections: SmartPlanSectionDraft[];
};

type AppStyleBundle = ReturnType<typeof useAppStyles>;

type TaskNotificationOptionKey = 'off' | 'once-30' | 'once-60' | 'once-1440' | 'custom';
type TaskNotificationUnit = 'minutes' | 'hours' | 'days';
type TaskNotificationSelection = {
  customMode: 'once' | 'repeat';
  customUnit: TaskNotificationUnit;
  customValue: string;
  optionKey: TaskNotificationOptionKey;
};

const taskNotificationPresets: Array<{
  description: string;
  key: Exclude<TaskNotificationOptionKey, 'off' | 'custom'>;
  label: string;
  rule: TaskDeadlineNotificationInput;
}> = [
  {
    description: 'Um alerta 30 minutos antes.',
    key: 'once-30',
    label: '30 minutos antes',
    rule: { enabled: true, interval_minutes: null, mode: 'once', start_minutes_before: 30 },
  },
  {
    description: 'Um alerta 1 hora antes.',
    key: 'once-60',
    label: '1 hora antes',
    rule: { enabled: true, interval_minutes: null, mode: 'once', start_minutes_before: 60 },
  },
  {
    description: 'Um alerta 1 dia antes.',
    key: 'once-1440',
    label: '1 dia antes',
    rule: { enabled: true, interval_minutes: null, mode: 'once', start_minutes_before: 1440 },
  },
];

const defaultTaskNotificationSelection: TaskNotificationSelection = {
  customMode: 'once',
  customUnit: 'minutes',
  customValue: '5',
  optionKey: 'off',
};

function getTaskNotificationPresetKey(rule: TaskDeadlineNotificationInput | null | undefined): TaskNotificationOptionKey {
  if (!rule?.enabled) {
    return 'off';
  }

  return (
    taskNotificationPresets.find((preset) => {
      if (!preset.rule) {
        return false;
      }

      return (
        preset.rule.mode === rule.mode &&
        preset.rule.start_minutes_before === rule.start_minutes_before &&
        preset.rule.interval_minutes === rule.interval_minutes
      );
    })?.key ?? 'custom'
  );
}

function convertTaskNotificationValueToMinutes(value: string, unit: TaskNotificationUnit) {
  const trimmedValue = value.trim();
  if (!/^\d+$/.test(trimmedValue)) {
    return null;
  }

  const normalizedValue = Number.parseInt(trimmedValue, 10);
  if (!Number.isFinite(normalizedValue) || normalizedValue <= 0) {
    return null;
  }

  const multiplier = {
    days: 1440,
    hours: 60,
    minutes: 1,
  }[unit];

  return normalizedValue * multiplier;
}

function getLargestExactNotificationUnit(minutes: number): Pick<TaskNotificationSelection, 'customUnit' | 'customValue'> {
  if (minutes % 1440 === 0) {
    return { customUnit: 'days', customValue: String(minutes / 1440) };
  }

  if (minutes % 60 === 0) {
    return { customUnit: 'hours', customValue: String(minutes / 60) };
  }

  return { customUnit: 'minutes', customValue: String(minutes) };
}

function buildTaskNotificationSelectionFromRule(
  rule: TaskDeadlineNotificationInput | null | undefined,
): TaskNotificationSelection {
  const optionKey = getTaskNotificationPresetKey(rule);
  if (optionKey !== 'custom') {
    return { ...defaultTaskNotificationSelection, optionKey };
  }

  const sourceMinutes = rule?.mode === 'repeat'
    ? rule.interval_minutes ?? rule.start_minutes_before
    : rule?.start_minutes_before ?? 5;
  const customValue = getLargestExactNotificationUnit(sourceMinutes);

  return {
    customMode: rule?.mode ?? 'once',
    customUnit: customValue.customUnit,
    customValue: customValue.customValue,
    optionKey: 'custom',
  };
}

function buildTaskNotificationRuleFromSelection(
  selection: TaskNotificationSelection,
): TaskDeadlineNotificationInput | null {
  if (selection.optionKey === 'off') {
    return null;
  }

  if (selection.optionKey !== 'custom') {
    return taskNotificationPresets.find((preset) => preset.key === selection.optionKey)?.rule ?? null;
  }

  const minutes = convertTaskNotificationValueToMinutes(selection.customValue, selection.customUnit);
  if (!minutes) {
    return null;
  }

  return {
    enabled: true,
    interval_minutes: selection.customMode === 'repeat' ? minutes : null,
    mode: selection.customMode,
    start_minutes_before: minutes,
  };
}

function buildTaskNotificationRule(
  task: Task,
  rule: TaskDeadlineNotificationInput | null,
  notificationIds: string[],
): TaskDeadlineNotificationRule {
  const now = new Date().toISOString();
  const normalizedRule = rule ?? {
    enabled: false,
    interval_minutes: null,
    mode: 'once' as const,
    start_minutes_before: 60,
  };

  return {
    id: `task-notification-${task.id}`,
    task_id: task.id,
    owner_id: task.owner_id,
    mode: normalizedRule.mode,
    start_minutes_before: normalizedRule.start_minutes_before,
    interval_minutes: normalizedRule.interval_minutes,
    notification_ids: notificationIds,
    enabled: normalizedRule.enabled,
    updated_at: now,
  };
}

function buildReceivedInvitations(
  invitations: WorkspaceInvitation[],
  workspaces: Workspace[],
  folders: WorkspaceFolder[],
  profiles: MemberProfile[],
  userEmail: string,
): ReceivedInvitation[] {
  return invitations
    .filter((invite) => invite.status === 'pending' && invite.email.trim().toLowerCase() === userEmail.trim().toLowerCase())
    .map((invite) => {
      const workspace = workspaces.find((item) => item.id === invite.workspace_id);
      const folder = folders.find((item) => item.id === invite.folder_id);
      const inviter = profiles.find((profile) => profile.id === invite.invited_by);

      return {
        ...invite,
        folder_name: folder?.name ?? null,
        workspace_name: workspace?.name ?? 'Plano compartilhado',
        invited_by_name: inviter?.full_name ?? null,
        invited_by_email: inviter?.email ?? null,
      };
    });
}

function sortTasks(tasks: Task[]) {
  return [...tasks].sort((a, b) => {
    if (!a.due_at && !b.due_at) {
      return b.updated_at.localeCompare(a.updated_at);
    }
    if (!a.due_at) {
      return 1;
    }
    if (!b.due_at) {
      return -1;
    }
    return dateValue(a.due_at) - dateValue(b.due_at) || b.updated_at.localeCompare(a.updated_at);
  });
}

function mergeTasksById(current: Task[], incoming: Task[]) {
  const byId = new Map(current.map((task) => [task.id, task]));
  incoming.forEach((task) => {
    byId.set(task.id, task);
  });
  return sortTasks(Array.from(byId.values()));
}

function mergeChecklistItemsById(current: ChecklistItem[], incoming: ChecklistItem[]) {
  const byId = new Map(current.map((item) => [item.id, item]));
  incoming.forEach((item) => {
    byId.set(item.id, item);
  });
  return Array.from(byId.values()).sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));
}

const priorityLabels: Record<Priority, string> = {
  low: 'Baixa',
  medium: 'Media',
  high: 'Alta',
  urgent: 'Urgente',
};

const statusLabels: Record<TaskStatus, string> = {
  todo: 'A fazer',
  doing: 'Em andamento',
  done: 'Concluida',
};

function useAppStyles() {
  const { colors } = useTheme();
  const textStyles = useTextStyles();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return { colors, styles, textStyles };
}

export function RootApp() {
  return (
    <ThemeProvider>
      <RootAppContent />
    </ThemeProvider>
  );
}

function RootAppContent() {
  const { colors, styles, textStyles } = useAppStyles();
  const { isThemeReady } = useTheme();
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(isSupabaseConfigured);
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  useEffect(() => {
    if (!supabase) {
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setBooting(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  if (!isThemeReady || booting || (!fontsLoaded && !fontError)) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
        <Text style={textStyles.muted}>Carregando sessao...</Text>
      </SafeAreaView>
    );
  }

  if (isSupabaseConfigured && !session) {
    return <AuthScreen />;
  }

  const user: UserContext = session?.user
    ? {
        id: session.user.id,
        email: session.user.email ?? 'usuario@local',
        fullName: typeof session.user.user_metadata?.full_name === 'string'
          ? session.user.user_metadata.full_name
          : null,
      }
    : { id: demoUserId, email: 'demo@mytasks.local', fullName: null };

  return <MainApp user={user} />;
}

function AuthScreen() {
  const { colors, styles, textStyles } = useAppStyles();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!supabase || !email.trim() || !password) {
      Alert.alert('Informe email e senha');
      return;
    }

    setLoading(true);
    const normalizedEmail = email.trim().toLowerCase();
    const result =
      mode === 'signIn'
        ? await supabase.auth.signInWithPassword({ email: normalizedEmail, password })
        : await supabase.auth.signUp({
            email: normalizedEmail,
            password,
            options: { data: { full_name: name.trim() || null } },
          });

    setLoading(false);

    if (result.error) {
      Alert.alert('Nao foi possivel continuar', result.error.message);
      return;
    }

    if (mode === 'signUp' && !result.data.session) {
      Alert.alert('Cadastro criado', 'Confira seu email para confirmar a conta antes de entrar.');
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.authContent}>
          <Text style={textStyles.title}>Tasks</Text>
          <Text style={styles.lead}>Organize prioridades, checklists e pastas de planos.</Text>

          <Card>
            <SectionTitle muted="Supabase Auth">Acesso</SectionTitle>
            {mode === 'signUp' ? (
              <Field autoCapitalize="words" onChangeText={setName} placeholder="Nome" value={name} />
            ) : null}
            <Field
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="Email"
              value={email}
            />
            <Field
              autoCapitalize="none"
              onChangeText={setPassword}
              placeholder="Senha"
              secureTextEntry
              value={password}
            />
            <Button disabled={loading} onPress={submit}>
              {loading ? 'Aguarde...' : mode === 'signIn' ? 'Entrar' : 'Criar conta'}
            </Button>
            <Button onPress={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')} variant="secondary">
              {mode === 'signIn' ? 'Criar uma conta' : 'Ja tenho conta'}
            </Button>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function MainApp({ user }: { user: UserContext }) {
  const { colors, styles } = useAppStyles();
  const { setThemeKey, themeKey } = useTheme();
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [lastMainTab, setLastMainTab] = useState<MainTabKey>('home');
  const [isTaskModalVisible, setIsTaskModalVisible] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [plansResetToken, setPlansResetToken] = useState(0);
  const [loading, setLoading] = useState(false);
  const [profileName, setProfileName] = useState(user.fullName);
  const [taskCategories, setTaskCategories] = useState<TaskCategory[]>(
    isSupabaseConfigured ? [] : demoTaskCategories,
  );
  const [tasks, setTasks] = useState<Task[]>(isSupabaseConfigured ? [] : demoTasks);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>(
    isSupabaseConfigured ? [] : demoChecklistItems,
  );
  const [workspaces, setWorkspaces] = useState<Workspace[]>(isSupabaseConfigured ? [] : demoWorkspaces);
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMember[]>(
    isSupabaseConfigured ? [] : demoWorkspaceMembers,
  );
  const [folderMembers, setFolderMembers] = useState<FolderMember[]>(
    isSupabaseConfigured ? [] : demoFolderMembers,
  );
  const [memberProfiles, setMemberProfiles] = useState<MemberProfile[]>(
    isSupabaseConfigured ? [] : demoMemberProfiles,
  );
  const [workspaceFolders, setWorkspaceFolders] = useState<WorkspaceFolder[]>(
    isSupabaseConfigured ? [] : demoWorkspaceFolders,
  );
  const [folderChecklists, setFolderChecklists] = useState<FolderChecklist[]>(
    isSupabaseConfigured ? [] : demoFolderChecklists,
  );
  const [folderChecklistItems, setFolderChecklistItems] = useState<FolderChecklistItem[]>(
    isSupabaseConfigured ? [] : demoFolderChecklistItems,
  );
  const [folderSections, setFolderSections] = useState<FolderSection[]>(
    isSupabaseConfigured ? [] : demoFolderSections,
  );
  const [folderFiles, setFolderFiles] = useState<FolderFile[]>(isSupabaseConfigured ? [] : demoFolderFiles);
  const [folderComments, setFolderComments] = useState<FolderComment[]>(
    isSupabaseConfigured ? [] : demoFolderComments,
  );
  const [invitations, setInvitations] = useState<WorkspaceInvitation[]>(
    isSupabaseConfigured ? [] : demoInvitations,
  );
  const [receivedInvitations, setReceivedInvitations] = useState<ReceivedInvitation[]>(
    isSupabaseConfigured
      ? []
      : buildReceivedInvitations(demoInvitations, demoWorkspaces, demoWorkspaceFolders, demoMemberProfiles, user.email),
  );
  const [notes, setNotes] = useState<SharedNote[]>(isSupabaseConfigured ? [] : demoNotes);
  const [lists, setLists] = useState<SharedList[]>(isSupabaseConfigured ? [] : demoLists);
  const [listItems, setListItems] = useState<SharedListItem[]>(isSupabaseConfigured ? [] : demoListItems);
  const [reminders, setReminders] = useState<Reminder[]>(isSupabaseConfigured ? [] : demoReminders);
  const [taskNotificationRules, setTaskNotificationRules] = useState<TaskDeadlineNotificationRule[]>([]);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  useEffect(() => {
    setProfileName(user.fullName);
  }, [user.id]);

  const effectiveUser = useMemo(
    () => ({ ...user, fullName: profileName }),
    [profileName, user],
  );
  const selectedWorkspace = workspaces[0] ?? null;
  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [selectedTaskId, tasks],
  );
  const selectedTaskChecklistItems = useMemo(
    () =>
      selectedTask
        ? checklistItems
            .filter((item) => item.task_id === selectedTask.id)
            .sort((a, b) => a.position - b.position || a.title.localeCompare(b.title))
        : [],
    [checklistItems, selectedTask],
  );
  const selectedTaskNotificationRule = useMemo(
    () =>
      selectedTask
        ? taskNotificationRules.find((rule) => rule.task_id === selectedTask.id) ?? null
        : null,
    [selectedTask, taskNotificationRules],
  );

  const loadReceivedInvitations = useCallback(async () => {
    if (!supabase) {
      return;
    }

    const { data, error } = await supabase.rpc('list_received_workspace_invitations');
    if (!error) {
      setReceivedInvitations(data ?? []);
    }
  }, []);

  const loadTaskContent = useCallback(async () => {
    if (!supabase) {
      return;
    }

    const [taskResult, checklistResult, taskNotificationResult] = await Promise.all([
      supabase.from('tasks').select('*').order('due_at', { ascending: true, nullsFirst: false }),
      supabase.from('task_checklist_items').select('*').order('position', { ascending: true }),
      supabase.from('task_deadline_notifications').select('*'),
    ]);

    if (!taskResult.error) {
      setTasks(taskResult.data ?? []);
    }
    if (!checklistResult.error) {
      setChecklistItems(checklistResult.data ?? []);
    }
    if (!taskNotificationResult.error) {
      setTaskNotificationRules(taskNotificationResult.data ?? []);
    }
  }, []);

  const loadFolderContent = useCallback(async () => {
    if (!supabase) {
      return;
    }

    const [folderResult, folderChecklistResult, folderCommentResult] = await Promise.all([
      supabase.from('workspace_folders').select('*').order('position', { ascending: true }),
      supabase.from('folder_checklists').select('*').order('position', { ascending: true }),
      supabase.from('folder_comments').select('*').order('created_at', { ascending: false }),
    ]);

    if (!folderResult.error) {
      setWorkspaceFolders(folderResult.data ?? []);
    }
    if (!folderCommentResult.error) {
      setFolderComments(folderCommentResult.data ?? []);
    }
    if (folderChecklistResult.error) {
      return;
    }

    const nextFolderChecklists = folderChecklistResult.data ?? [];
    setFolderChecklists(nextFolderChecklists);

    const checklistIds = nextFolderChecklists.map((checklist) => checklist.id);
    if (!checklistIds.length) {
      setFolderChecklistItems([]);
      return;
    }

    const folderItemResult = await supabase
      .from('folder_checklist_items')
      .select('*')
      .in('checklist_id', checklistIds)
      .order('position', { ascending: true });

    if (!folderItemResult.error) {
      setFolderChecklistItems(folderItemResult.data ?? []);
    }
  }, []);

  const loadData = useCallback(async () => {
    if (!supabase) {
      return;
    }

    setLoading(true);
    const [
      profileResult,
      categoryResult,
      taskResult,
      workspaceResult,
      memberResult,
      folderMemberResult,
      folderResult,
      folderChecklistResult,
      folderSectionResult,
      folderFileResult,
      folderCommentResult,
      invitationResult,
      receivedInvitationResult,
      noteResult,
      listResult,
      reminderResult,
      taskNotificationResult,
    ] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      supabase.from('task_categories').select('*').order('position', { ascending: true }),
      supabase.from('tasks').select('*').order('due_at', { ascending: true, nullsFirst: false }),
      supabase.from('workspaces').select('*').order('updated_at', { ascending: false }),
      supabase.from('workspace_members').select('*').order('created_at', { ascending: true }),
      supabase.from('folder_members').select('*').order('created_at', { ascending: true }),
      supabase.from('workspace_folders').select('*').order('position', { ascending: true }),
      supabase.from('folder_checklists').select('*').order('position', { ascending: true }),
      supabase.from('folder_sections').select('*').order('position', { ascending: true }),
      supabase.from('folder_files').select('*').order('created_at', { ascending: false }),
      supabase.from('folder_comments').select('*').order('created_at', { ascending: false }),
      supabase.from('workspace_invitations').select('*').order('created_at', { ascending: false }),
      supabase.rpc('list_received_workspace_invitations'),
      supabase.from('shared_notes').select('*').order('updated_at', { ascending: false }),
      supabase.from('shared_lists').select('*').order('updated_at', { ascending: false }),
      supabase.from('reminders').select('*').order('remind_at', { ascending: true }),
      supabase.from('task_deadline_notifications').select('*'),
    ]);

    if (profileResult.data) {
      setProfileName(profileResult.data.full_name);
      setNotificationsEnabled(profileResult.data.notifications_enabled);
      if (isThemeKey(profileResult.data.theme_key)) {
        setThemeKey(profileResult.data.theme_key);
      }
    }
    if (categoryResult.error) {
      Alert.alert('Categorias indisponiveis', 'Aplique as migrations pendentes do Supabase.');
    }
    const categories = categoryResult.data ?? [];
    if (categories.length) {
      setTaskCategories(categories);
    } else if (!categoryResult.error) {
      const seedResult = await seedDefaultTaskCategories(user.id);
      setTaskCategories(seedResult);
    }
    setTasks(taskResult.data ?? []);
    setWorkspaces(workspaceResult.data ?? []);
    setWorkspaceMembers(memberResult.data ?? []);
    setFolderMembers(folderMemberResult.data ?? []);
    if (folderResult.error) {
      Alert.alert('Pastas indisponiveis', 'Aplique as migrations pendentes do Supabase.');
    }
    let nextFolders = folderResult.data ?? [];
    let nextFolderChecklists = folderChecklistResult.data ?? [];
    let nextFolderSections = folderSectionResult.data ?? [];
    let nextFolderChecklistItems: FolderChecklistItem[] = [];

    if (nextFolders.length) {
      setWorkspaceFolders(nextFolders);
    } else if (!folderResult.error && (workspaceResult.data ?? []).length) {
      const seeded = await seedDefaultWorkspaceFolder((workspaceResult.data ?? [])[0].id);
      nextFolders = seeded.folders;
      nextFolderChecklists = seeded.checklists;
      nextFolderChecklistItems = seeded.items;
      nextFolderSections = seeded.sections;
    } else {
      nextFolders = [];
    }
    setWorkspaceFolders(nextFolders);
    setFolderChecklists(nextFolderChecklists);
    setFolderSections(nextFolderSections);
    setFolderFiles(folderFileResult.data ?? []);
    setFolderComments(folderCommentResult.data ?? []);
    setInvitations(invitationResult.data ?? []);
    setReceivedInvitations(receivedInvitationResult.data ?? []);
    setNotes(noteResult.data ?? []);
    setLists(listResult.data ?? []);
    setReminders(reminderResult.data ?? []);
    setTaskNotificationRules(taskNotificationResult.data ?? []);

    const memberIds = Array.from(
      new Set([
        ...(memberResult.data ?? []).map((member) => member.user_id),
        ...(folderMemberResult.data ?? []).map((member) => member.user_id),
      ]),
    );
    if (memberIds.length) {
      const profileListResult = await supabase
        .from('profiles')
        .select('id,email,full_name')
        .in('id', memberIds);
      setMemberProfiles(profileListResult.data ?? []);
    } else {
      setMemberProfiles([]);
    }

    const taskIds = (taskResult.data ?? []).map((task) => task.id);
    if (taskIds.length) {
      const checklistResult = await supabase
        .from('task_checklist_items')
        .select('*')
        .in('task_id', taskIds)
        .order('position', { ascending: true });
      setChecklistItems(checklistResult.data ?? []);
    } else {
      setChecklistItems([]);
    }

    const listIds = (listResult.data ?? []).map((list) => list.id);
    if (listIds.length) {
      const itemResult = await supabase
        .from('shared_list_items')
        .select('*')
        .in('list_id', listIds)
        .order('position', { ascending: true });
      setListItems(itemResult.data ?? []);
    } else {
      setListItems([]);
    }

    const checklistIds = nextFolderChecklists.map((checklist) => checklist.id);
    if (checklistIds.length) {
      const folderItemResult = await supabase
        .from('folder_checklist_items')
        .select('*')
        .in('checklist_id', checklistIds)
        .order('position', { ascending: true });
      nextFolderChecklistItems = nextFolderChecklistItems.length ? nextFolderChecklistItems : folderItemResult.data ?? [];
    } else if (!nextFolders.length) {
      nextFolderChecklistItems = [];
    }
    setFolderChecklistItems(nextFolderChecklistItems);

    setLoading(false);
  }, [setThemeKey, user.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (selectedTaskId && !selectedTask) {
      setSelectedTaskId(null);
    }
  }, [selectedTask, selectedTaskId]);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    const client = supabase;
    const refreshInvitations = () => {
      void loadReceivedInvitations();
      void loadData();
    };
    const refreshFolderContent = () => {
      void loadFolderContent();
    };
    const channel = client
      .channel('my-tasks-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, loadTaskContent)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_deadline_notifications' }, loadTaskContent)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_categories' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_checklist_items' }, loadTaskContent)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workspaces' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workspace_members' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'folder_members' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workspace_invitations' }, refreshInvitations)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workspace_folders' }, refreshFolderContent)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'folder_checklists' }, refreshFolderContent)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'folder_checklist_items' }, refreshFolderContent)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'folder_sections' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'folder_files' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'folder_comments' }, refreshFolderContent)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_notes' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_lists' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_list_items' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reminders' }, loadData)
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [loadData, loadFolderContent, loadReceivedInvitations, loadTaskContent]);

  useEffect(() => {
    if (!supabase || activeTab !== 'notes') {
      return;
    }

    void loadReceivedInvitations();
    const intervalId = setInterval(() => {
      void loadReceivedInvitations();
    }, 10000);

    return () => {
      clearInterval(intervalId);
    };
  }, [activeTab, loadReceivedInvitations]);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void loadReceivedInvitations();
        void loadFolderContent();
        void loadData();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [loadData, loadFolderContent, loadReceivedInvitations]);

  const persistTaskNotificationRule = async (
    task: Task,
    rule: TaskDeadlineNotificationInput | null,
    previousRule: TaskDeadlineNotificationRule | null = null,
    areNotificationsEnabled = notificationsEnabled,
  ) => {
    await cancelLocalReminders(previousRule?.notification_ids);

    const shouldSchedule = Boolean(rule?.enabled && areNotificationsEnabled && task.status !== 'done');
    const notificationIds = shouldSchedule
      ? await scheduleTaskDeadlineNotifications(task.title, task.due_at, rule)
      : [];
    const nextRule = buildTaskNotificationRule(task, rule, notificationIds);

    if (!supabase) {
      setTaskNotificationRules((current) => {
        const filtered = current.filter((item) => item.task_id !== task.id);
        return [...filtered, nextRule];
      });
      return true;
    }

    const { data, error } = await supabase
      .from('task_deadline_notifications')
      .upsert(
        {
          task_id: task.id,
          owner_id: task.owner_id,
          mode: nextRule.mode,
          start_minutes_before: nextRule.start_minutes_before,
          interval_minutes: nextRule.interval_minutes,
          notification_ids: nextRule.notification_ids,
          enabled: nextRule.enabled,
        },
        { onConflict: 'task_id' },
      )
      .select('*')
      .single();

    if (error) {
      await cancelLocalReminders(notificationIds);
      Alert.alert('Notificacao nao salva', error.message);
      return false;
    }

    setTaskNotificationRules((current) => {
      const filtered = current.filter((item) => item.task_id !== task.id);
      return data ? [...filtered, data] : [...filtered, nextRule];
    });
    return true;
  };

  const cancelTaskNotificationRule = async (task: Task, rule: TaskDeadlineNotificationRule | null) => {
    if (!rule) {
      return;
    }

    await cancelLocalReminders(rule.notification_ids);
    const nextRule = { ...rule, notification_ids: [], updated_at: new Date().toISOString() };

    if (!supabase) {
      setTaskNotificationRules((current) =>
        current.map((item) => (item.task_id === task.id ? nextRule : item)),
      );
      return;
    }

    const { error } = await supabase
      .from('task_deadline_notifications')
      .update({ notification_ids: [] })
      .eq('task_id', task.id);
    if (error) {
      Alert.alert('Erro ao cancelar notificacoes', error.message);
    }
  };

  const rescheduleTaskNotificationRule = async (task: Task, rule: TaskDeadlineNotificationRule | null) => {
    if (!rule?.enabled) {
      return;
    }

    await persistTaskNotificationRule(task, rule, rule);
  };

  const createTask = async ({ categoryId, checklistItems: initialChecklistItems, description, dueAt, notificationRule, priority, title }: TaskCreateInput) => {
    if (!title.trim()) {
      return false;
    }

    const normalizedChecklistItems = normalizeChecklistItems(initialChecklistItems);

    if (!supabase) {
      const taskId = `task-${Date.now()}`;
      const nextTask: Task = {
        id: taskId,
        title: title.trim(),
        description,
        priority,
        status: 'todo',
        due_at: dueAt,
        owner_id: user.id,
        category_id: categoryId,
        updated_at: new Date().toISOString(),
      };
      setTasks((current) => [nextTask, ...current]);
      if (notificationRule?.enabled) {
        await persistTaskNotificationRule(nextTask, notificationRule);
      }
      if (normalizedChecklistItems.length) {
        setChecklistItems((current) => [
          ...current,
          ...normalizedChecklistItems.map((item, index) => ({
            id: `check-${Date.now()}-${index}`,
            task_id: taskId,
            title: item,
            is_done: false,
            position: index + 1,
          })),
        ]);
      }
      return true;
    }

    const { data, error } = await supabase
      .from('tasks')
      .insert({
        title: title.trim(),
        description,
        priority,
        due_at: dueAt,
        owner_id: user.id,
        category_id: categoryId,
        status: 'todo',
      })
      .select('*')
      .single();

    if (error) {
      Alert.alert('Erro ao criar tarefa', error.message);
      return false;
    }

    if (!data) {
      Alert.alert('Erro ao criar tarefa', 'O Supabase nao retornou a tarefa criada.');
      return false;
    }

    setTasks((current) => mergeTasksById(current, [data]));
    if (notificationRule?.enabled) {
      await persistTaskNotificationRule(data, notificationRule);
    }

    if (normalizedChecklistItems.length) {
      const checklistResult = await supabase
        .from('task_checklist_items')
        .insert(
          normalizedChecklistItems.map((item, index) => ({
            task_id: data.id,
            title: item,
            position: index + 1,
          })),
        )
        .select('*');

      if (!checklistResult.error && checklistResult.data?.length) {
        setChecklistItems((current) => mergeChecklistItemsById(current, checklistResult.data));
      }

      if (checklistResult.error) {
        Alert.alert('Tarefa criada', `A tarefa foi criada, mas o checklist nao foi salvo: ${checklistResult.error.message}`);
      }
    }

    return true;
  };

  const updateTaskStatus = async (task: Task, status: TaskStatus) => {
    const existingRule = taskNotificationRules.find((rule) => rule.task_id === task.id) ?? null;
    const updatedAt = new Date().toISOString();
    const nextTask = { ...task, status, updated_at: updatedAt };
    const updateTaskLocally = () => {
      setTasks((current) =>
        current.map((item) =>
          item.id === task.id ? nextTask : item,
        ),
      );
    };

    if (!supabase) {
      updateTaskLocally();
      if (status === 'done') {
        await cancelTaskNotificationRule(task, existingRule);
      } else {
        await rescheduleTaskNotificationRule(nextTask, existingRule);
      }
      return;
    }

    updateTaskLocally();
    const { error } = await supabase.from('tasks').update({ status }).eq('id', task.id);
    if (error) {
      setTasks((current) =>
        current.map((item) =>
          item.id === task.id ? task : item,
        ),
      );
      Alert.alert('Erro ao atualizar tarefa', error.message);
      return;
    }

    if (status === 'done') {
      await cancelTaskNotificationRule(task, existingRule);
    } else {
      await rescheduleTaskNotificationRule(nextTask, existingRule);
    }
  };

  const toggleTaskDone = async (task: Task) => {
    await updateTaskStatus(task, task.status === 'done' ? 'todo' : 'done');
  };

  const deleteTask = async (task: Task) => {
    const removeTaskLocally = () => {
      setTasks((current) => current.filter((item) => item.id !== task.id));
      setChecklistItems((current) => current.filter((item) => item.task_id !== task.id));
      setTaskNotificationRules((current) => current.filter((item) => item.task_id !== task.id));
    };
    const existingRule = taskNotificationRules.find((rule) => rule.task_id === task.id) ?? null;
    await cancelLocalReminders(existingRule?.notification_ids);

    if (!supabase) {
      removeTaskLocally();
      return;
    }

    const { error } = await supabase.from('tasks').delete().eq('id', task.id);
    if (error) {
      Alert.alert('Erro ao excluir tarefa', error.message);
      return;
    }

    removeTaskLocally();
  };

  const updateTaskNotificationSelection = async (task: Task, selection: TaskNotificationSelection) => {
    const existingRule = taskNotificationRules.find((rule) => rule.task_id === task.id) ?? null;
    const nextRule = buildTaskNotificationRuleFromSelection(selection);
    const didSave = await persistTaskNotificationRule(task, nextRule, existingRule);
    if (didSave && Platform.OS === 'web' && nextRule?.enabled) {
      Alert.alert('Notificacao configurada', 'Os alertas locais sao aplicados em iOS e Android.');
    }
  };

  const addChecklistItem = async (task: Task, title: string) => {
    if (!title.trim()) {
      return;
    }

    const position = checklistItems.filter((item) => item.task_id === task.id).length + 1;

    if (!supabase) {
      setChecklistItems((current) => [
        ...current,
        { id: `check-${Date.now()}`, task_id: task.id, title: title.trim(), is_done: false, position },
      ]);
      return;
    }

    const { error } = await supabase.from('task_checklist_items').insert({
      task_id: task.id,
      title: title.trim(),
      position,
    });
    if (error) {
      Alert.alert('Erro ao adicionar checklist', error.message);
    }
  };

  const toggleChecklistItem = async (item: ChecklistItem) => {
    if (!supabase) {
      setChecklistItems((current) =>
        current.map((entry) => (entry.id === item.id ? { ...entry, is_done: !entry.is_done } : entry)),
      );
      return;
    }

    const { error } = await supabase
      .from('task_checklist_items')
      .update({ is_done: !item.is_done })
      .eq('id', item.id);
    if (error) {
      Alert.alert('Erro ao atualizar item', error.message);
    }
  };

  const inviteMember = async (email: string, folder: WorkspaceFolder | null = null) => {
    const targetWorkspaceId = folder?.workspace_id ?? selectedWorkspace?.id ?? null;
    if (!targetWorkspaceId || !folder || !email.trim()) {
      return false;
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!supabase) {
      const invitedProfile = memberProfiles.find((profile) => profile.email.trim().toLowerCase() === normalizedEmail);
      if (!invitedProfile) {
        Alert.alert('Usuario nao encontrado', 'Este email ainda nao possui conta no app.');
        return false;
      }
      if (folderMembers.some((member) => member.folder_id === folder.id && member.user_id === invitedProfile.id)) {
        Alert.alert('Usuario ja faz parte', 'Este usuario ja e membro desta pasta.');
        return false;
      }

      const nextInvite: WorkspaceInvitation = {
        id: `invite-${Date.now()}`,
        workspace_id: targetWorkspaceId,
        folder_id: folder?.id ?? null,
        email: normalizedEmail,
        role: 'member',
        status: 'pending',
        invited_by: user.id,
      };
      setInvitations((current) =>
        current.some((invite) => invite.workspace_id === targetWorkspaceId && invite.email === normalizedEmail)
          ? current.map((invite) =>
              invite.workspace_id === targetWorkspaceId && invite.email === normalizedEmail ? nextInvite : invite,
            )
          : [nextInvite, ...current],
      );
      return true;
    }

    const { data, error } = await supabase.rpc('create_workspace_invitation', {
      target_workspace_id: targetWorkspaceId,
      invited_email: normalizedEmail,
      target_folder_id: folder?.id ?? null,
    });
    if (error) {
      if (error.message.includes('Usuario nao encontrado')) {
        Alert.alert('Usuario nao encontrado', 'Este email ainda nao possui conta no app.');
        return false;
      }
      if (error.message.includes('Usuario ja faz parte')) {
        Alert.alert('Usuario ja faz parte', 'Este usuario ja e membro desta pasta.');
        return false;
      }
      Alert.alert('Erro ao convidar membro', error.message);
      return false;
    }

    if (data) {
      setInvitations((current) =>
        current.some((invite) => invite.id === data.id)
          ? current.map((invite) => (invite.id === data.id ? data : invite))
          : [data, ...current],
      );
    }

    await loadData();
    return true;
  };

  const acceptWorkspaceInvitation = async (invitation: WorkspaceInvitation) => {
    if (invitation.status !== 'pending') {
      return false;
    }

    if (invitation.email.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
      Alert.alert('Convite indisponivel', 'Este convite pertence a outro email.');
      return false;
    }

    if (!supabase) {
      if (!invitation.folder_id) {
        Alert.alert('Convite antigo', 'Peca para enviarem este convite novamente.');
        return false;
      }
      const folderId = invitation.folder_id;
      setInvitations((current) =>
        current.map((entry) => (entry.id === invitation.id ? { ...entry, status: 'accepted' } : entry)),
      );
      setReceivedInvitations((current) => current.filter((entry) => entry.id !== invitation.id));
      setFolderMembers((current) =>
        current.some((member) => member.folder_id === folderId && member.user_id === user.id)
          ? current
          : [
              ...current,
              {
                folder_id: folderId,
                user_id: user.id,
                role: invitation.role,
                created_at: new Date().toISOString(),
              },
            ],
      );
      return true;
    }

    const { error } = await supabase.rpc('accept_workspace_invitation', { invitation_id: invitation.id });
    if (error) {
      Alert.alert('Erro ao aceitar convite', error.message);
      return false;
    }

    setInvitations((current) =>
      current.map((entry) => (entry.id === invitation.id ? { ...entry, status: 'accepted' } : entry)),
    );
    setReceivedInvitations((current) => current.filter((entry) => entry.id !== invitation.id));
    await loadData();
    return true;
  };

  const rejectWorkspaceInvitation = async (invitation: WorkspaceInvitation) => {
    if (invitation.status !== 'pending') {
      return false;
    }

    if (invitation.email.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
      Alert.alert('Convite indisponivel', 'Este convite pertence a outro email.');
      return false;
    }

    if (!supabase) {
      setInvitations((current) =>
        current.map((entry) => (entry.id === invitation.id ? { ...entry, status: 'revoked' } : entry)),
      );
      setReceivedInvitations((current) => current.filter((entry) => entry.id !== invitation.id));
      return true;
    }

    const { error } = await supabase.rpc('reject_workspace_invitation', { invitation_id: invitation.id });
    if (error) {
      Alert.alert('Erro ao recusar convite', error.message);
      return false;
    }

    setInvitations((current) =>
      current.map((entry) => (entry.id === invitation.id ? { ...entry, status: 'revoked' } : entry)),
    );
    setReceivedInvitations((current) => current.filter((entry) => entry.id !== invitation.id));
    await loadData();
    return true;
  };

  const createNote = async (title: string, body: string) => {
    if (!selectedWorkspace || !title.trim()) {
      return;
    }

    if (!supabase) {
      setNotes((current) => [
        {
          id: `note-${Date.now()}`,
          workspace_id: selectedWorkspace.id,
          title: title.trim(),
          body,
          updated_at: new Date().toISOString(),
        },
        ...current,
      ]);
      return;
    }

    const { error } = await supabase.from('shared_notes').insert({
      workspace_id: selectedWorkspace.id,
      title: title.trim(),
      body,
    });
    if (error) {
      Alert.alert('Erro ao criar nota', error.message);
    }
  };

  const createList = async (title: string) => {
    if (!selectedWorkspace || !title.trim()) {
      return;
    }

    if (!supabase) {
      setLists((current) => [
        { id: `list-${Date.now()}`, workspace_id: selectedWorkspace.id, title: title.trim(), updated_at: new Date().toISOString() },
        ...current,
      ]);
      return;
    }

    const { error } = await supabase.from('shared_lists').insert({
      workspace_id: selectedWorkspace.id,
      title: title.trim(),
    });
    if (error) {
      Alert.alert('Erro ao criar lista', error.message);
    }
  };

  const addListItem = async (list: SharedList, title: string) => {
    if (!title.trim()) {
      return;
    }

    const position = listItems.filter((item) => item.list_id === list.id).length + 1;

    if (!supabase) {
      setListItems((current) => [
        ...current,
        { id: `list-item-${Date.now()}`, list_id: list.id, title: title.trim(), is_done: false, position },
      ]);
      return;
    }

    const { error } = await supabase.from('shared_list_items').insert({
      list_id: list.id,
      title: title.trim(),
      position,
    });
    if (error) {
      Alert.alert('Erro ao adicionar item', error.message);
    }
  };

  const toggleListItem = async (item: SharedListItem) => {
    if (!supabase) {
      setListItems((current) =>
        current.map((entry) => (entry.id === item.id ? { ...entry, is_done: !entry.is_done } : entry)),
      );
      return;
    }

    const { error } = await supabase.from('shared_list_items').update({ is_done: !item.is_done }).eq('id', item.id);
    if (error) {
      Alert.alert('Erro ao atualizar lista', error.message);
    }
  };

  const createReminder = async (title: string, remindAt: string) => {
    if (!title.trim() || !remindAt.trim()) {
      return;
    }

    const notificationId = notificationsEnabled ? await scheduleLocalReminder(title.trim(), remindAt.trim()) : null;

    if (!supabase) {
      setReminders((current) => [
        {
          id: `reminder-${Date.now()}`,
          owner_id: user.id,
          workspace_id: selectedWorkspace?.id ?? null,
          title: title.trim(),
          remind_at: remindAt.trim(),
          notification_id: notificationId,
          is_done: false,
        },
        ...current,
      ]);
      return;
    }

    const { error } = await supabase.from('reminders').insert({
      owner_id: user.id,
      workspace_id: selectedWorkspace?.id ?? null,
      title: title.trim(),
      remind_at: remindAt.trim(),
      notification_id: notificationId,
    });
    if (error) {
      if (notificationId) {
        await cancelLocalReminder(notificationId);
      }
      Alert.alert('Erro ao criar lembrete', error.message);
    }
  };

  const createWorkspaceFolder = async (name: string) => {
    if (!name.trim()) {
      return;
    }

    if (!supabase) {
      const now = Date.now();
      const workspaceId = selectedWorkspace?.id ?? `workspace-${user.id}`;
      const position = workspaceFolders.filter((folder) => folder.workspace_id === workspaceId).length + 1;
      const folder: WorkspaceFolder = {
        id: `folder-${now}`,
        workspace_id: workspaceId,
        name: name.trim(),
        description: null,
        position,
        updated_at: new Date().toISOString(),
      };
      setWorkspaceFolders((current) =>
        [...current, folder].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
      );
      setFolderMembers((current) => [
        ...current,
        {
          folder_id: folder.id,
          user_id: user.id,
          role: 'owner',
          created_at: new Date().toISOString(),
        },
      ]);
      setFolderChecklists((current) => [
        ...current,
        {
          id: `folder-checklist-${now}`,
          folder_id: folder.id,
          title: 'Checklist',
          position: 1,
          updated_at: new Date().toISOString(),
        },
      ]);
      return;
    }

    const { data, error } = await supabase.rpc('create_folder', { folder_name: name.trim() });

    if (error) {
      Alert.alert('Erro ao criar pasta', error.message);
      return;
    }

    if (data) {
      setWorkspaceFolders((current) =>
        current.some((folder) => folder.id === data.id)
          ? current
          : [...current, data].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
      );
      setFolderMembers((current) =>
        current.some((member) => member.folder_id === data.id && member.user_id === user.id)
          ? current
          : [
              ...current,
              {
                folder_id: data.id,
                user_id: user.id,
                role: 'owner',
                created_at: new Date().toISOString(),
              },
            ],
      );
      await loadFolderContent();
    }
  };

  const createSmartPlan = async (prompt: string) => {
    const draft = buildSmartPlanDraft(prompt);
    if (!draft) {
      Alert.alert('Assistente de planejamento', 'Descreva o plano com um pouco mais de contexto.');
      return null;
    }

    if (!supabase) {
      const now = Date.now();
      const workspaceId = selectedWorkspace?.id ?? `workspace-${user.id}`;
      const folder: WorkspaceFolder = {
        id: `folder-smart-${now}`,
        workspace_id: workspaceId,
        name: draft.folderName,
        description: draft.description,
        position: workspaceFolders.filter((item) => item.workspace_id === workspaceId).length + 1,
        updated_at: new Date().toISOString(),
      };
      const checklist: FolderChecklist = {
        id: `folder-checklist-smart-${now}`,
        folder_id: folder.id,
        title: draft.checklistTitle,
        position: 1,
        updated_at: new Date().toISOString(),
      };

      setWorkspaceFolders((current) =>
        [...current, folder].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
      );
      setFolderMembers((current) => [
        ...current,
        {
          folder_id: folder.id,
          user_id: user.id,
          role: 'owner',
          created_at: new Date().toISOString(),
        },
      ]);
      setFolderChecklists((current) => [...current, checklist]);
      setFolderChecklistItems((current) => [
        ...current,
        ...draft.checklistItems.map((item, index) => ({
          id: `folder-item-smart-${now}-${index}`,
          checklist_id: checklist.id,
          title: item.title,
          is_done: false,
          position: index + 1,
          assigned_label: item.assignedLabel,
        })),
      ]);
      setFolderSections((current) => [
        ...current,
        ...draft.sections.map((section, index) => ({
          id: `folder-section-smart-${now}-${index}`,
          folder_id: folder.id,
          kind: section.kind,
          title: section.title,
          body: section.body,
          media_url: section.media_url,
          position: index + 1,
          updated_at: new Date().toISOString(),
        })),
      ]);
      if (draft.reminders.length) {
        setReminders((current) => [
          ...draft.reminders.map((reminder, index) => ({
            id: `reminder-smart-${now}-${index}`,
            owner_id: user.id,
            workspace_id: workspaceId,
            title: reminder.title,
            remind_at: reminder.remindAt,
            notification_id: null,
            is_done: false,
          })),
          ...current,
        ]);
      }

      return folder;
    }

    const { data: folder, error: folderError } = await supabase.rpc('create_folder', {
      folder_name: draft.folderName,
    });

    if (folderError || !folder) {
      Alert.alert('Erro ao criar plano', folderError?.message ?? 'O Supabase nao retornou a pasta criada.');
      return null;
    }

    const { error: folderUpdateError } = await supabase
      .from('workspace_folders')
      .update({ description: draft.description })
      .eq('id', folder.id);
    if (folderUpdateError) {
      Alert.alert('Plano criado', `A pasta foi criada, mas a descricao nao foi salva: ${folderUpdateError.message}`);
    }

    let targetChecklist: FolderChecklist | null = null;
    const checklistResult = await supabase
      .from('folder_checklists')
      .select('*')
      .eq('folder_id', folder.id)
      .order('position', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (checklistResult.data) {
      targetChecklist = checklistResult.data;
      await supabase.from('folder_checklists').update({ title: draft.checklistTitle }).eq('id', targetChecklist.id);
      targetChecklist = { ...targetChecklist, title: draft.checklistTitle };
    } else {
      const createdChecklistResult = await supabase
        .from('folder_checklists')
        .insert({ folder_id: folder.id, title: draft.checklistTitle, position: 1 })
        .select('*')
        .single();

      if (createdChecklistResult.error || !createdChecklistResult.data) {
        Alert.alert('Plano criado', createdChecklistResult.error?.message ?? 'Nao foi possivel criar o checklist.');
      } else {
        targetChecklist = createdChecklistResult.data;
      }
    }

    if (targetChecklist && draft.checklistItems.length) {
      const itemResult = await supabase.from('folder_checklist_items').insert(
        draft.checklistItems.map((item, index) => ({
          checklist_id: targetChecklist.id,
          title: item.title,
          assigned_label: item.assignedLabel,
          position: index + 1,
        })),
      ).select('*');

      if (itemResult.error) {
        Alert.alert('Plano criado', `O checklist inicial nao foi salvo: ${itemResult.error.message}`);
      } else if (itemResult.data?.length) {
        setFolderChecklistItems((current) => [...current, ...(itemResult.data ?? [])]);
      }
    }

    const sectionResult = await supabase.from('folder_sections').insert(
      draft.sections.map((section, index) => ({
        folder_id: folder.id,
        kind: section.kind,
        title: section.title,
        body: section.body,
        media_url: section.media_url,
        position: index + 1,
      })),
    ).select('*');

    if (sectionResult.error) {
      Alert.alert('Plano criado', `As secoes inteligentes nao foram salvas: ${sectionResult.error.message}`);
    } else if (sectionResult.data?.length) {
      setFolderSections((current) => [...current, ...(sectionResult.data ?? [])]);
    }

    if (draft.reminders.length) {
      const reminderResult = await supabase.from('reminders').insert(
        draft.reminders.map((reminder) => ({
          owner_id: user.id,
          workspace_id: folder.workspace_id,
          title: reminder.title,
          remind_at: reminder.remindAt,
          notification_id: null,
        })),
      );

      if (reminderResult.error) {
        Alert.alert('Plano criado', `Os lembretes sugeridos nao foram salvos: ${reminderResult.error.message}`);
      }
    }

    const nextFolder = { ...folder, description: draft.description };
    setWorkspaceFolders((current) =>
      current.some((item) => item.id === nextFolder.id)
        ? current.map((item) => (item.id === nextFolder.id ? nextFolder : item))
        : [...current, nextFolder].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
    );
    if (targetChecklist) {
      const syncedChecklist = targetChecklist;
      setFolderChecklists((current) =>
        current.some((item) => item.id === syncedChecklist.id)
          ? current.map((item) => (item.id === syncedChecklist.id ? syncedChecklist : item))
          : [...current, syncedChecklist],
      );
    }
    await loadData();
    return nextFolder;
  };

  const deleteWorkspaceFolder = async (folder: WorkspaceFolder) => {
    const removeFolderLocally = () => {
      const checklistIds = folderChecklists
        .filter((checklist) => checklist.folder_id === folder.id)
        .map((checklist) => checklist.id);
      setWorkspaceFolders((current) => current.filter((item) => item.id !== folder.id));
      setFolderChecklists((current) => current.filter((item) => item.folder_id !== folder.id));
      setFolderChecklistItems((current) => current.filter((item) => !checklistIds.includes(item.checklist_id)));
      setFolderSections((current) => current.filter((item) => item.folder_id !== folder.id));
      setFolderFiles((current) => current.filter((item) => item.folder_id !== folder.id));
      setFolderComments((current) => current.filter((item) => item.folder_id !== folder.id));
      setFolderMembers((current) => current.filter((item) => item.folder_id !== folder.id));
    };

    if (!supabase) {
      removeFolderLocally();
      return true;
    }

    const { error } = await supabase.from('workspace_folders').delete().eq('id', folder.id);
    if (error) {
      Alert.alert('Erro ao excluir pasta', error.message);
      return false;
    }

    removeFolderLocally();
    return true;
  };

  const addFolderChecklistItem = async (folder: WorkspaceFolder, checklist: FolderChecklist | null, title: string) => {
    if (!title.trim()) {
      return;
    }

    if (!supabase) {
      const now = Date.now();
      const nextChecklist =
        checklist ??
        {
          id: `folder-checklist-${now}`,
          folder_id: folder.id,
          title: 'Checklist',
          position: 1,
          updated_at: new Date().toISOString(),
        };
      if (!checklist) {
        setFolderChecklists((current) => [...current, nextChecklist]);
      }
      const position = folderChecklistItems.filter((item) => item.checklist_id === nextChecklist.id).length + 1;
      setFolderChecklistItems((current) => [
        ...current,
        {
          id: `folder-item-${Date.now()}`,
          checklist_id: nextChecklist.id,
          title: title.trim(),
          is_done: false,
          position,
          assigned_label: null,
        },
      ]);
      return;
    }

    let targetChecklist = checklist;
    if (!targetChecklist) {
      const checklistResult = await supabase
        .from('folder_checklists')
        .insert({ folder_id: folder.id, title: 'Checklist', position: 1 })
        .select('*')
        .single();

      if (checklistResult.error || !checklistResult.data) {
        Alert.alert('Erro ao criar checklist', checklistResult.error?.message ?? 'Sem retorno do Supabase.');
        return;
      }

      targetChecklist = checklistResult.data;
      const createdChecklist = targetChecklist;
      setFolderChecklists((current) =>
        current.some((item) => item.id === createdChecklist.id) ? current : [...current, createdChecklist],
      );
    }

    const position = folderChecklistItems.filter((item) => item.checklist_id === targetChecklist.id).length + 1;
    const { data, error } = await supabase.from('folder_checklist_items').insert({
      checklist_id: targetChecklist.id,
      title: title.trim(),
      position,
    }).select('*').single();

    if (error) {
      Alert.alert('Erro ao adicionar item', error.message);
      return;
    }

    if (data) {
      setFolderChecklistItems((current) =>
        current.some((item) => item.id === data.id) ? current : [...current, data],
      );
    }
  };

  const toggleFolderChecklistItem = async (item: FolderChecklistItem) => {
    if (!supabase) {
      setFolderChecklistItems((current) =>
        current.map((entry) => (entry.id === item.id ? { ...entry, is_done: !entry.is_done } : entry)),
      );
      return;
    }

    const { error } = await supabase
      .from('folder_checklist_items')
      .update({ is_done: !item.is_done })
      .eq('id', item.id);

    if (error) {
      Alert.alert('Erro ao atualizar checklist', error.message);
      return;
    }

    setFolderChecklistItems((current) =>
      current.map((entry) => (entry.id === item.id ? { ...entry, is_done: !item.is_done } : entry)),
    );
  };

  const updateFolderChecklistItem = async (item: FolderChecklistItem, title: string) => {
    const normalizedTitle = normalizeChecklistTitle(title);
    if (!normalizedTitle) {
      Alert.alert('Informe o nome do item');
      return false;
    }

    if (!supabase) {
      setFolderChecklistItems((current) =>
        current.map((entry) => (entry.id === item.id ? { ...entry, title: normalizedTitle } : entry)),
      );
      return true;
    }

    const { error } = await supabase
      .from('folder_checklist_items')
      .update({ title: normalizedTitle })
      .eq('id', item.id);
    if (error) {
      Alert.alert('Erro ao editar item', error.message);
      return false;
    }

    setFolderChecklistItems((current) =>
      current.map((entry) => (entry.id === item.id ? { ...entry, title: normalizedTitle } : entry)),
    );
    return true;
  };

  const deleteFolderChecklistItem = async (item: FolderChecklistItem) => {
    if (!supabase) {
      setFolderChecklistItems((current) => current.filter((entry) => entry.id !== item.id));
      return true;
    }

    const { error } = await supabase.from('folder_checklist_items').delete().eq('id', item.id);
    if (error) {
      Alert.alert('Erro ao excluir item', error.message);
      return false;
    }

    setFolderChecklistItems((current) => current.filter((entry) => entry.id !== item.id));
    return true;
  };

  const addFolderComment = async (folder: WorkspaceFolder, body: string) => {
    if (!body.trim()) {
      return;
    }

    if (!supabase) {
      setFolderComments((current) => [
        {
          id: `comment-${Date.now()}`,
          folder_id: folder.id,
          author_id: user.id,
          author_name: getFirstName(effectiveUser),
          body: body.trim(),
          created_at: new Date().toISOString(),
        },
        ...current,
      ]);
      return;
    }

    const { data, error } = await supabase.from('folder_comments').insert({
      folder_id: folder.id,
      author_id: user.id,
      author_name: getFirstName(effectiveUser),
      body: body.trim(),
    }).select('*').single();

    if (error) {
      Alert.alert('Erro ao salvar nota', error.message);
      return;
    }

    if (data) {
      setFolderComments((current) =>
        current.some((comment) => comment.id === data.id) ? current : [data, ...current],
      );
    }
  };

  const updateFolderNote = async (comment: FolderComment, body: string) => {
    const normalizedBody = body.trim();
    if (!normalizedBody) {
      Alert.alert('Informe o texto da nota');
      return false;
    }

    if (!supabase) {
      setFolderComments((current) =>
        current.map((entry) => (entry.id === comment.id ? { ...entry, body: normalizedBody } : entry)),
      );
      return true;
    }

    const { error } = await supabase.from('folder_comments').update({ body: normalizedBody }).eq('id', comment.id);
    if (error) {
      Alert.alert('Erro ao editar nota', error.message);
      return false;
    }

    setFolderComments((current) =>
      current.map((entry) => (entry.id === comment.id ? { ...entry, body: normalizedBody } : entry)),
    );
    return true;
  };

  const deleteFolderNote = async (comment: FolderComment) => {
    if (!supabase) {
      setFolderComments((current) => current.filter((entry) => entry.id !== comment.id));
      return true;
    }

    const { error } = await supabase.from('folder_comments').delete().eq('id', comment.id);
    if (error) {
      Alert.alert('Erro ao excluir nota', error.message);
      return false;
    }

    setFolderComments((current) => current.filter((entry) => entry.id !== comment.id));
    return true;
  };

  const attachFolderFile = async (folder: WorkspaceFolder) => {
    const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (picked.canceled || !picked.assets.length) {
      return;
    }

    const asset = picked.assets[0];
    const now = Date.now();
    const safeName = asset.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${folder.workspace_id}/${folder.id}/${now}-${safeName}`;

    if (!supabase) {
      setFolderFiles((current) => [
        {
          id: `file-${now}`,
          folder_id: folder.id,
          uploaded_by: user.id,
          name: asset.name,
          storage_path: storagePath,
          mime_type: asset.mimeType ?? null,
          size_bytes: asset.size ?? null,
          created_at: new Date().toISOString(),
        },
        ...current,
      ]);
      return;
    }

    const response = await fetch(asset.uri);
    const body = await response.blob();
    const uploadResult = await supabase.storage.from('workspace-files').upload(storagePath, body, {
      contentType: asset.mimeType ?? 'application/octet-stream',
      upsert: false,
    });

    if (uploadResult.error) {
      Alert.alert('Erro ao anexar arquivo', uploadResult.error.message);
      return;
    }

    const { error } = await supabase.from('folder_files').insert({
      folder_id: folder.id,
      uploaded_by: user.id,
      name: asset.name,
      storage_path: storagePath,
      mime_type: asset.mimeType ?? null,
      size_bytes: asset.size ?? null,
    });

    if (error) {
      Alert.alert('Erro ao salvar arquivo', error.message);
    }
  };

  const toggleNotifications = async (enabled: boolean) => {
    setNotificationsEnabled(enabled);

    if (!enabled) {
      await Promise.all(taskNotificationRules.map((rule) => cancelLocalReminders(rule.notification_ids)));
      setTaskNotificationRules((current) =>
        current.map((rule) => ({ ...rule, notification_ids: [], updated_at: new Date().toISOString() })),
      );
    } else {
      const openTasksById = new Map(tasks.filter((task) => task.status !== 'done').map((task) => [task.id, task]));
      for (const rule of taskNotificationRules) {
        const task = openTasksById.get(rule.task_id);
        if (task && rule.enabled) {
          await persistTaskNotificationRule(task, rule, rule, true);
        }
      }
    }

    if (!supabase) {
      return;
    }

    const { error } = await supabase.from('profiles').update({ notifications_enabled: enabled }).eq('id', user.id);
    if (error) {
      Alert.alert('Erro ao salvar preferencia', error.message);
    }

    if (!enabled) {
      const clearResult = await supabase
        .from('task_deadline_notifications')
        .update({ notification_ids: [] })
        .eq('owner_id', user.id);
      if (clearResult.error) {
        Alert.alert('Notificacoes canceladas neste aparelho', `Nao foi possivel sincronizar os IDs agora: ${clearResult.error.message}`);
      }
    }
  };

  const updateProfileName = async (name: string) => {
    const normalizedName = name.trim().replace(/\s+/g, ' ');
    if (!normalizedName) {
      Alert.alert('Informe seu nome');
      return;
    }

    if (!supabase) {
      setProfileName(normalizedName);
      Alert.alert('Perfil atualizado', 'Seu nome foi salvo neste dispositivo.');
      return;
    }

    setProfileName(normalizedName);

    const { error } = await supabase
      .from('profiles')
      .update({ full_name: normalizedName })
      .eq('id', user.id);
    if (error) {
      setProfileName(user.fullName);
      Alert.alert('Erro ao salvar perfil', error.message);
      return;
    }

    const { error: authError } = await supabase.auth.updateUser({
      data: { full_name: normalizedName },
    });
    if (authError) {
      Alert.alert('Perfil atualizado', `Seu nome foi salvo, mas a sessao sera atualizada no proximo login: ${authError.message}`);
      return;
    }

    Alert.alert('Perfil atualizado', 'Seu nome foi salvo.');
  };

  const updateProfileTheme = async (nextThemeKey: ThemeKey) => {
    await setThemeKey(nextThemeKey);

    if (!supabase) {
      return;
    }

    const { error } = await supabase
      .from('profiles')
      .update({ theme_key: nextThemeKey })
      .eq('id', user.id);
    if (error) {
      Alert.alert('Tema salvo neste aparelho', `Nao foi possivel sincronizar agora: ${error.message}`);
    }
  };

  const signOut = async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
  };

  const openProfile = () => {
    if (activeTab !== 'profile') {
      setLastMainTab(activeTab);
    }
    setActiveTab('profile');
  };

  const changeMainTab = (tab: MainTabKey) => {
    if (tab === 'notes') {
      setPlansResetToken((current) => current + 1);
    }
    setLastMainTab(tab);
    setActiveTab(tab);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? <ActivityIndicator color={colors.primary} style={styles.loadingDot} /> : null}

        {activeTab === 'home' ? (
          <HomeScreen
            reminders={reminders}
            tasks={tasks}
            user={effectiveUser}
            goToTasks={() => {
              setLastMainTab('tasks');
              setActiveTab('tasks');
            }}
            onOpenProfile={openProfile}
          />
        ) : null}

        {activeTab === 'tasks' ? (
          <TasksScreen
            categories={taskCategories}
            createTask={createTask}
            deleteTask={deleteTask}
            isCreateModalVisible={isTaskModalVisible}
            onCloseCreateModal={() => setIsTaskModalVisible(false)}
            onOpenCreateModal={() => setIsTaskModalVisible(true)}
            onOpenTaskDetail={(task) => setSelectedTaskId(task.id)}
            tasks={tasks}
            toggleTaskDone={toggleTaskDone}
            user={effectiveUser}
            onOpenProfile={openProfile}
          />
        ) : null}

        {activeTab === 'notes' ? (
          <CollaborationScreen
            acceptWorkspaceInvitation={acceptWorkspaceInvitation}
            addFolderChecklistItem={addFolderChecklistItem}
            addFolderComment={addFolderComment}
            attachFolderFile={attachFolderFile}
            createWorkspaceFolder={createWorkspaceFolder}
            createSmartPlan={createSmartPlan}
            deleteWorkspaceFolder={deleteWorkspaceFolder}
            folderMembers={folderMembers}
            folderChecklistItems={folderChecklistItems}
            folderChecklists={folderChecklists}
            folderComments={folderComments}
            folderFiles={folderFiles}
            folderSections={folderSections}
            inviteMember={inviteMember}
            invitations={invitations}
            receivedInvitations={receivedInvitations}
            rejectWorkspaceInvitation={rejectWorkspaceInvitation}
            resetToken={plansResetToken}
            selectedWorkspace={selectedWorkspace}
            syncFolderContent={loadFolderContent}
            toggleFolderChecklistItem={toggleFolderChecklistItem}
            updateFolderChecklistItem={updateFolderChecklistItem}
            deleteFolderChecklistItem={deleteFolderChecklistItem}
            updateFolderNote={updateFolderNote}
            deleteFolderNote={deleteFolderNote}
            memberProfiles={memberProfiles}
            workspaces={workspaces}
            workspaceFolders={workspaceFolders}
            workspaceMembers={workspaceMembers}
            user={effectiveUser}
            onOpenProfile={openProfile}
          />
        ) : null}

        {activeTab === 'calendar' ? (
          <CalendarScreen
            reminders={reminders}
            tasks={tasks}
            user={effectiveUser}
            onOpenProfile={openProfile}
          />
        ) : null}

        {activeTab === 'profile' ? (
          <ProfileScreen
            onBack={() => setActiveTab(lastMainTab)}
            onSignOut={signOut}
            themeKey={themeKey}
            notificationsEnabled={notificationsEnabled}
            toggleNotifications={toggleNotifications}
            updateProfileTheme={updateProfileTheme}
            updateProfileName={updateProfileName}
            user={effectiveUser}
          />
        ) : null}
      </ScrollView>

      {activeTab === 'home' || activeTab === 'tasks' ? (
        <Pressable
          accessibilityLabel="Criar item"
          accessibilityRole="button"
          onPress={() => {
            if (activeTab !== 'tasks') {
              setLastMainTab('tasks');
              setActiveTab('tasks');
            }
            setIsTaskModalVisible(true);
          }}
          style={({ pressed }) => [styles.fab, pressed && styles.pressed]}
        >
          <Plus color={colors.surface} size={28} strokeWidth={3} />
        </Pressable>
      ) : null}

      <TaskDetailModal
        addChecklistItem={addChecklistItem}
        checklistItems={selectedTaskChecklistItems}
        deleteTask={deleteTask}
        isVisible={Boolean(selectedTask)}
        onClose={() => setSelectedTaskId(null)}
        notificationRule={selectedTaskNotificationRule}
        task={selectedTask}
        toggleChecklistItem={toggleChecklistItem}
        toggleTaskDone={toggleTaskDone}
        updateTaskNotificationSelection={updateTaskNotificationSelection}
      />

      <TabBar activeTab={activeTab} onChange={changeMainTab} />
    </SafeAreaView>
  );
}

function HomeScreen({
  goToTasks,
  onOpenProfile,
  reminders,
  tasks,
  user,
}: {
  goToTasks: () => void;
  onOpenProfile: () => void;
  reminders: Reminder[];
  tasks: Task[];
  user: UserContext;
}) {
  const { styles } = useAppStyles();
  const todayTasks = tasks.filter((task) => isToday(task.due_at));
  const doneToday = todayTasks.filter((task) => task.status === 'done').length;
  const totalToday = todayTasks.length;
  const progress = totalToday ? Math.round((doneToday / totalToday) * 100) : 0;
  const openToday = todayTasks
    .filter((task) => task.status !== 'done')
    .sort(sortTasksByPriorityAndTime)
    .slice(0, 3);
  const upcomingReminders = reminders.filter((reminder) => !reminder.is_done).filter((reminder) => isFuture(reminder.remind_at));
  const firstName = getFirstName(user);

  return (
    <View style={styles.homeStack}>
      <AppHeader onOpenProfile={onOpenProfile} user={user} />

      <View style={styles.heroBlock}>
        <Text style={styles.heroTitle}>
          {getGreeting()},{'\n'}
          {firstName}!
        </Text>
        <Text style={styles.heroCopy}>
          Voce esta em estado de fluxo. {progress}% das suas tarefas de hoje foram concluidas.
        </Text>
      </View>

      <View style={styles.dashboardCard}>
        <Text style={styles.dashboardTitle}>Progresso de Hoje</Text>
        <View style={styles.progressRing}>
          <View style={styles.progressRingInner}>
            <Text style={styles.progressPercent}>{progress}%</Text>
            <Text style={styles.progressLabel}>COMPLETO</Text>
          </View>
        </View>
        <Text style={styles.progressSummary}>
          {doneToday} de {totalToday} tarefas finalizadas
        </Text>
      </View>

      <View style={styles.dashboardCard}>
        <View style={styles.rowBetween}>
          <Text style={styles.dashboardTitle}>Prioridades de Hoje</Text>
          <Pressable onPress={goToTasks}>
            <Text style={styles.linkText}>VER TODAS</Text>
          </Pressable>
        </View>
        {openToday.length ? (
          openToday.map((task) => <PriorityPreviewCard key={task.id} task={task} />)
        ) : (
          <View style={styles.emptyTodayCard}>
            <Text style={styles.itemTitle}>Nada urgente por aqui</Text>
            <Text style={styles.mutedText}>Crie tarefas com data de hoje para preencher esta lista.</Text>
          </View>
        )}
      </View>

      <View style={styles.insightCard}>
        <Text style={styles.insightTitle}>Insight: Voce e mais produtivo entre 9h e 11h.</Text>
        <Text style={styles.insightCopy}>Agende suas tarefas complexas para amanha cedo.</Text>
        {upcomingReminders.length ? (
          <Text style={styles.mutedText}>{upcomingReminders.length} lembrete(s) futuros no calendario.</Text>
        ) : null}
      </View>
    </View>
  );
}

function PriorityPreviewCard({ task }: { task: Task }) {
  const { styles } = useAppStyles();

  return (
    <View style={styles.priorityCard}>
      <View style={styles.priorityCircle} />
      <View style={styles.flex}>
        <Text style={styles.priorityTitle}>{task.title}</Text>
        <Text style={styles.priorityMeta}>{task.due_at ? `Deadline: ${formatTime(task.due_at)}` : statusLabels[task.status]}</Text>
      </View>
      <PriorityBadge priority={task.priority} />
    </View>
  );
}

function PriorityBadge({ priority }: { priority: Priority }) {
  const { styles } = useAppStyles();

  return (
    <View
      style={[
        styles.priorityBadge,
        priority === 'urgent' || priority === 'high'
          ? styles.priorityBadgeHigh
          : priority === 'medium'
            ? styles.priorityBadgeMedium
            : styles.priorityBadgeLow,
      ]}
    >
      <Text style={styles.priorityBadgeText}>{priorityLabels[priority].toUpperCase()}</Text>
    </View>
  );
}

function AppHeader({ onOpenProfile, user }: { onOpenProfile: () => void; user: UserContext }) {
  const { styles } = useAppStyles();
  const firstName = getFirstName(user);

  return (
    <View style={styles.brandHeader}>
      <View style={styles.brandLeft}>
        <Pressable
          accessibilityLabel="Abrir meu perfil"
          accessibilityRole="button"
          onPress={onOpenProfile}
          style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}
        >
          <Text style={styles.avatarText}>{firstName.slice(0, 1).toUpperCase()}</Text>
        </Pressable>
        <Text style={styles.brandName}>Tasks</Text>
      </View>
    </View>
  );
}

function TabBar({ activeTab, onChange }: { activeTab: TabKey; onChange: (tab: MainTabKey) => void }) {
  const { colors, styles } = useAppStyles();
  const tabs: Array<{ key: MainTabKey; label: string; Icon: LucideIcon }> = [
    { key: 'home', label: 'Home', Icon: HomeIcon },
    { key: 'tasks', label: 'Tarefas', Icon: ListTodo },
    { key: 'notes', label: 'Planos', Icon: FolderKanban },
    { key: 'calendar', label: 'Calendário', Icon: CalendarDays },
  ];

  return (
    <View style={styles.bottomNav}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        const iconColor = isActive ? colors.surface : colors.muted;
        const Icon = tab.Icon;

        return (
          <Pressable
            accessibilityRole="tab"
            key={tab.key}
            onPress={() => onChange(tab.key)}
            style={[styles.navItem, isActive && styles.activeNavItem]}
          >
            <Icon color={iconColor} size={21} strokeWidth={2.5} />
            <Text style={[styles.navLabel, isActive && styles.activeNavText]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function TasksScreen({
  categories,
  createTask,
  deleteTask,
  isCreateModalVisible,
  onCloseCreateModal,
  onOpenCreateModal,
  onOpenTaskDetail,
  onOpenProfile,
  tasks,
  toggleTaskDone,
  user,
}: {
  categories: TaskCategory[];
  createTask: (input: TaskCreateInput) => Promise<boolean>;
  deleteTask: (task: Task) => Promise<void>;
  isCreateModalVisible: boolean;
  onCloseCreateModal: () => void;
  onOpenCreateModal: () => void;
  onOpenTaskDetail: (task: Task) => void;
  onOpenProfile: () => void;
  tasks: Task[];
  toggleTaskDone: (task: Task) => Promise<void>;
  user: UserContext;
}) {
  const { styles } = useAppStyles();
  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
    [categories],
  );
  const todayTasks = tasks.filter((task) => isToday(task.due_at));
  const openTasksToday = todayTasks.filter((task) => task.status !== 'done').length;
  const doneTasksToday = todayTasks.filter((task) => task.status === 'done').length;
  const weekTasks = tasks.filter((task) => isCurrentLocalWeek(task.due_at));
  const doneTasksThisWeek = weekTasks.filter((task) => task.status === 'done').length;
  const productivity = weekTasks.length ? Math.round((doneTasksThisWeek / weekTasks.length) * 100) : 0;
  const uncategorizedTasks = tasks.filter((task) => !task.category_id);

  return (
    <View style={styles.tasksScreen}>
      <AppHeader onOpenProfile={onOpenProfile} user={user} />

      <View style={styles.tasksGreetingCard}>
        <Text style={styles.tasksGreetingTitle}>
          {getGreeting()}, {getFirstName(user)}.
        </Text>
        <Text style={styles.tasksGreetingCopy}>
          Voce tem {openTasksToday} tarefas para concluir hoje. Foque no essencial.
        </Text>
      </View>

      <View style={styles.productivityCard}>
        <View style={styles.rowBetween}>
          <Text style={styles.productivityLabel}>PRODUTIVIDADE</Text>
          <Text style={styles.productivityIcon}>/</Text>
        </View>
        <Text style={styles.productivityValue}>{productivity}%</Text>
        <Text style={styles.productivityCopy}>Score de Flow semanal</Text>
      </View>

      {sortedCategories.map((category) => (
        <TaskCategorySection
          category={category}
          deleteTask={deleteTask}
          key={category.id}
          onOpenTaskDetail={onOpenTaskDetail}
          tasks={tasks.filter((task) => task.category_id === category.id)}
          toggleTaskDone={toggleTaskDone}
        />
      ))}

      {uncategorizedTasks.length ? (
        <TaskCategorySection
          category={null}
          deleteTask={deleteTask}
          onOpenTaskDetail={onOpenTaskDetail}
          tasks={uncategorizedTasks}
          toggleTaskDone={toggleTaskDone}
        />
      ) : null}

      <Pressable onPress={onOpenCreateModal} style={({ pressed }) => [styles.taskInputBar, pressed && styles.pressed]}>
        <Text style={styles.taskInputPlus}>+</Text>
        <Text style={styles.taskInputPlaceholder}>Adicionar Tarefa...</Text>
        <View style={styles.taskSaveButton}>
          <Text style={styles.taskSaveText}>SALVAR</Text>
        </View>
      </Pressable>

      <TaskCreateModal
        categories={sortedCategories}
        createTask={createTask}
        isVisible={isCreateModalVisible}
        onClose={onCloseCreateModal}
      />
    </View>
  );
}

function TaskCategorySection({
  category,
  deleteTask,
  onOpenTaskDetail,
  tasks,
  toggleTaskDone,
}: {
  category: TaskCategory | null;
  deleteTask: (task: Task) => Promise<void>;
  onOpenTaskDetail: (task: Task) => void;
  tasks: Task[];
  toggleTaskDone: (task: Task) => Promise<void>;
}) {
  const { styles } = useAppStyles();
  const sortedTasks = [...tasks].sort(sortTasksByPriorityAndTime);

  return (
    <View style={styles.taskCategoryBlock}>
      <View style={styles.taskCategoryHeader}>
        <View style={styles.taskCategoryTitleWrap}>
          <Text style={styles.taskCategoryIcon}>{category?.icon === 'user' ? 'P' : category?.icon === 'briefcase' ? 'W' : 'L'}</Text>
          <Text style={styles.taskCategoryTitle}>{category?.name ?? 'Sem categoria'}</Text>
        </View>
        <View style={styles.taskCountBadge}>
          <Text style={styles.taskCountText}>{tasks.length} tarefas</Text>
        </View>
      </View>

      {sortedTasks.map((task) => (
        <CompactTaskCard
          deleteTask={deleteTask}
          key={task.id}
          onOpenTaskDetail={onOpenTaskDetail}
          task={task}
          toggleTaskDone={toggleTaskDone}
        />
      ))}
    </View>
  );
}

function CompactTaskCard({
  deleteTask,
  onOpenTaskDetail,
  task,
  toggleTaskDone,
}: {
  deleteTask: (task: Task) => Promise<void>;
  onOpenTaskDetail: (task: Task) => void;
  task: Task;
  toggleTaskDone: (task: Task) => Promise<void>;
}) {
  const { styles } = useAppStyles();
  const isDone = task.status === 'done';

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onOpenTaskDetail(task)}
      style={({ pressed }) => [
        styles.compactTaskCard,
        isDone && styles.compactTaskCardDone,
        pressed && styles.pressed,
      ]}
    >
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isDone }}
        accessibilityLabel={isDone ? 'Reabrir tarefa' : 'Concluir tarefa'}
        onPress={(event) => {
          event.stopPropagation();
          toggleTaskDone(task);
        }}
        style={[styles.compactTaskCircle, isDone && styles.compactTaskCircleDone]}
      >
        <Text style={styles.compactTaskCircleText}>{isDone ? 'x' : ''}</Text>
      </Pressable>
      <View style={styles.flex}>
        <View style={styles.compactTaskMetaRow}>
          <PriorityBadge priority={task.priority} />
          <Text style={styles.compactTaskTime}>{task.due_at ? formatTaskDueLabel(task.due_at) : statusLabels[task.status]}</Text>
        </View>
        <Text style={[styles.compactTaskTitle, isDone && styles.doneText]}>{task.title}</Text>
      </View>
      <Pressable
        accessibilityLabel="Excluir tarefa"
        accessibilityRole="button"
        onPress={(event) => {
          event.stopPropagation();
          confirmDeleteTask(task, deleteTask);
        }}
        style={({ pressed }) => [styles.compactTaskMenuButton, pressed && styles.pressed]}
      >
        <Text style={styles.compactTaskMenu}>x</Text>
      </Pressable>
    </Pressable>
  );
}

function TaskCreateModal({
  categories,
  createTask,
  isVisible,
  onClose,
}: {
  categories: TaskCategory[];
  createTask: (input: TaskCreateInput) => Promise<boolean>;
  isVisible: boolean;
  onClose: () => void;
}) {
  const { styles } = useAppStyles();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedDueDate, setSelectedDueDate] = useState<Date | null>(null);
  const [hasDueTime, setHasDueTime] = useState(false);
  const [visiblePicker, setVisiblePicker] = useState<'date' | 'time' | null>(null);
  const [pickerDraftDate, setPickerDraftDate] = useState(new Date());
  const [priority, setPriority] = useState<Priority>('medium');
  const [categoryId, setCategoryId] = useState<string | null>(categories[0]?.id ?? null);
  const [checklistTitle, setChecklistTitle] = useState('');
  const [draftChecklistItems, setDraftChecklistItems] = useState<string[]>([]);
  const [notificationSelection, setNotificationSelection] = useState<TaskNotificationSelection>(
    defaultTaskNotificationSelection,
  );

  useEffect(() => {
    if (!categoryId && categories.length) {
      setCategoryId(categories[0].id);
    }
  }, [categories, categoryId]);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setSelectedDueDate(null);
    setHasDueTime(false);
    setVisiblePicker(null);
    setPickerDraftDate(new Date());
    setPriority('medium');
    setCategoryId(categories[0]?.id ?? null);
    setChecklistTitle('');
    setDraftChecklistItems([]);
    setNotificationSelection(defaultTaskNotificationSelection);
  };

  const addDraftChecklistItem = () => {
    const normalizedTitle = normalizeChecklistTitle(checklistTitle);
    if (!normalizedTitle) {
      return;
    }

    setDraftChecklistItems((current) =>
      current.some((item) => item.toLocaleLowerCase() === normalizedTitle.toLocaleLowerCase())
        ? current
        : [...current, normalizedTitle],
    );
    setChecklistTitle('');
  };

  const removeDraftChecklistItem = (itemToRemove: string) => {
    setDraftChecklistItems((current) => current.filter((item) => item !== itemToRemove));
  };

  const showDatePicker = () => {
    const nextDraftDate = selectedDueDate ? new Date(selectedDueDate) : new Date();
    setPickerDraftDate(nextDraftDate);
    setVisiblePicker('date');
  };

  const showTimePicker = () => {
    const nextDraftDate = selectedDueDate ? new Date(selectedDueDate) : new Date();
    setPickerDraftDate(nextDraftDate);
    setVisiblePicker('time');
  };

  const clearDueDate = () => {
    setSelectedDueDate(null);
    setHasDueTime(false);
    setVisiblePicker(null);
    setPickerDraftDate(new Date());
  };

  const selectWebDate = (offsetDays: number) => {
    const base = selectedDueDate ? new Date(selectedDueDate) : new Date();
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + offsetDays);
    base.setFullYear(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate());
    setSelectedDueDate(base);
    setVisiblePicker(null);
  };

  const selectWebTime = (hours: number, minutes: number) => {
    const nextDate = selectedDueDate ? new Date(selectedDueDate) : new Date();
    nextDate.setHours(hours, minutes, 0, 0);
    setSelectedDueDate(nextDate);
    setHasDueTime(true);
    setVisiblePicker(null);
  };

  const applyPickerDate = (date: Date, pickerMode: 'date' | 'time') => {
    if (pickerMode === 'date') {
      const nextDate = selectedDueDate ? new Date(selectedDueDate) : new Date(date);
      nextDate.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
      setSelectedDueDate(nextDate);
      return;
    }

    const nextDate = selectedDueDate ? new Date(selectedDueDate) : new Date();
    nextDate.setHours(date.getHours(), date.getMinutes(), 0, 0);
    setSelectedDueDate(nextDate);
    setHasDueTime(true);
  };

  const cancelPicker = () => {
    setVisiblePicker(null);
    setPickerDraftDate(selectedDueDate ? new Date(selectedDueDate) : new Date());
  };

  const commitPickerDraft = () => {
    if (!visiblePicker) {
      return;
    }

    applyPickerDate(pickerDraftDate, visiblePicker);
    setVisiblePicker(null);
  };

  const onPickerChange = (event: DateTimePickerEvent, date?: Date) => {
    if (event.type === 'dismissed') {
      cancelPicker();
      return;
    }
    if (!date || !visiblePicker) {
      return;
    }

    setPickerDraftDate(date);

    if (Platform.OS === 'ios') {
      return;
    }

    applyPickerDate(date, visiblePicker);
    setVisiblePicker(null);
  };

  const closeModal = () => {
    resetForm();
    onClose();
  };

  const submit = async () => {
    if (!title.trim()) {
      Alert.alert('Informe o titulo da tarefa');
      return;
    }

    const normalizedChecklistItems = normalizeChecklistItems([...draftChecklistItems, checklistTitle]);
    const didCreate = await createTask({
      categoryId,
      checklistItems: normalizedChecklistItems,
      description: description.trim() || null,
      dueAt: buildTaskDueAt(selectedDueDate, hasDueTime),
      notificationRule:
        selectedDueDate && hasDueTime
          ? buildTaskNotificationRuleFromSelection(notificationSelection)
          : null,
      priority,
      title: title.trim(),
    });
    if (!didCreate) {
      return;
    }
    resetForm();
    onClose();
  };

  return (
    <Modal animationType="slide" onRequestClose={closeModal} transparent visible={isVisible}>
      <KeyboardAvoidingView
        behavior="height"
        keyboardVerticalOffset={0}
        style={styles.modalKeyboardAvoiding}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <ScrollView contentContainerStyle={styles.modalSheetContent} keyboardShouldPersistTaps="handled">
            <View style={styles.rowBetween}>
              <Text style={styles.modalTitle}>Nova tarefa</Text>
              <Pressable onPress={closeModal}>
                <Text style={styles.modalClose}>x</Text>
              </Pressable>
            </View>
            <Field onChangeText={setTitle} placeholder="Titulo da tarefa" value={title} />
            <Field
              multiline
              onChangeText={setDescription}
              placeholder="Descricao opcional"
              style={[styles.textAreaField]}
              textAlignVertical="top"
              value={description}
            />
            <View style={styles.modalFieldGroup}>
              <Text style={styles.modalLabel}>Prazo</Text>
              <Text style={styles.dueSummary}>
                {selectedDueDate ? formatCreateDueLabel(selectedDueDate, hasDueTime) : 'Sem data definida'}
              </Text>
              <View style={styles.segmented}>
                <Pressable onPress={showDatePicker} style={styles.segment}>
                  <Text style={styles.segmentText}>{selectedDueDate ? 'Alterar data' : 'Escolher data'}</Text>
                </Pressable>
                <Pressable onPress={showTimePicker} style={styles.segment}>
                  <Text style={styles.segmentText}>{hasDueTime ? 'Alterar horario' : 'Adicionar horario'}</Text>
                </Pressable>
                {selectedDueDate ? (
                  <Pressable onPress={clearDueDate} style={styles.segment}>
                    <Text style={styles.segmentText}>Limpar prazo</Text>
                  </Pressable>
                ) : null}
              </View>
              {visiblePicker && Platform.OS === 'web' ? (
                <View style={styles.segmented}>
                  {visiblePicker === 'date' ? (
                    <>
                      <Pressable onPress={() => selectWebDate(0)} style={styles.segment}>
                        <Text style={styles.segmentText}>Hoje</Text>
                      </Pressable>
                      <Pressable onPress={() => selectWebDate(1)} style={styles.segment}>
                        <Text style={styles.segmentText}>Amanha</Text>
                      </Pressable>
                      <Pressable onPress={() => selectWebDate(7)} style={styles.segment}>
                        <Text style={styles.segmentText}>Em 7 dias</Text>
                      </Pressable>
                    </>
                  ) : (
                    <>
                      <Pressable onPress={() => selectWebTime(9, 0)} style={styles.segment}>
                        <Text style={styles.segmentText}>09:00</Text>
                      </Pressable>
                      <Pressable onPress={() => selectWebTime(14, 0)} style={styles.segment}>
                        <Text style={styles.segmentText}>14:00</Text>
                      </Pressable>
                      <Pressable onPress={() => selectWebTime(19, 0)} style={styles.segment}>
                        <Text style={styles.segmentText}>19:00</Text>
                      </Pressable>
                    </>
                  )}
                </View>
              ) : visiblePicker && Platform.OS !== 'ios' ? (
                <View style={styles.duePickerBox}>
                  <View style={styles.duePickerHeader}>
                    <Text style={styles.duePickerTitle}>
                      {visiblePicker === 'date' ? 'Escolher data' : 'Escolher horario'}
                    </Text>
                    <Pressable accessibilityLabel="Fechar seletor de prazo" accessibilityRole="button" onPress={cancelPicker}>
                      <Text style={styles.duePickerClose}>x</Text>
                    </Pressable>
                  </View>
                  <DateTimePicker
                    mode={visiblePicker}
                    onChange={onPickerChange}
                    value={pickerDraftDate}
                  />
                </View>
              ) : null}
            </View>
            {selectedDueDate && hasDueTime ? (
              <View style={styles.modalFieldGroup}>
                <Text style={styles.modalLabel}>Notificacoes do prazo</Text>
                <TaskNotificationPresetPicker
                  onChange={setNotificationSelection}
                  value={notificationSelection}
                />
                {Platform.OS === 'web' ? (
                  <Text style={styles.dueSummary}>Alertas locais aparecem em iOS e Android.</Text>
                ) : null}
              </View>
            ) : null}
            {visiblePicker && Platform.OS === 'ios' ? (
              <Modal animationType="fade" onRequestClose={cancelPicker} transparent visible>
                <Pressable
                  accessibilityLabel="Confirmar prazo selecionado"
                  accessibilityRole="button"
                  onPress={commitPickerDraft}
                  style={styles.duePickerBackdrop}
                >
                  <Pressable onPress={(event) => event.stopPropagation()} style={styles.duePickerFloatingBox}>
                    <View style={styles.duePickerHeader}>
                      <Text style={styles.duePickerTitle}>
                        {visiblePicker === 'date' ? 'Escolher data' : 'Escolher horario'}
                      </Text>
                      <Pressable accessibilityLabel="Fechar seletor de prazo" accessibilityRole="button" onPress={cancelPicker}>
                        <Text style={styles.duePickerClose}>x</Text>
                      </Pressable>
                    </View>
                    <DateTimePicker mode={visiblePicker} onChange={onPickerChange} value={pickerDraftDate} />
                  </Pressable>
                </Pressable>
              </Modal>
            ) : null}
            <Text style={styles.modalLabel}>Categoria</Text>
            <View style={styles.segmented}>
              {categories.map((category) => (
                <Pressable
                  key={category.id}
                  onPress={() => setCategoryId(category.id)}
                  style={[styles.segment, categoryId === category.id && styles.activeSegment]}
                >
                  <Text style={[styles.segmentText, categoryId === category.id && styles.activeSegmentText]}>
                    {category.name}
                  </Text>
                </Pressable>
              ))}
              <Pressable onPress={() => setCategoryId(null)} style={[styles.segment, categoryId === null && styles.activeSegment]}>
                <Text style={[styles.segmentText, categoryId === null && styles.activeSegmentText]}>Sem categoria</Text>
              </Pressable>
            </View>
            <Text style={styles.modalLabel}>Prioridade</Text>
            <SegmentedControl
              options={[
                ['low', 'Baixa'],
                ['medium', 'Media'],
                ['high', 'Alta'],
                ['urgent', 'Urgente'],
              ]}
              value={priority}
              onChange={(value) => setPriority(value as Priority)}
            />
            <View style={styles.modalFieldGroup}>
              <Text style={styles.modalLabel}>Checklist interno</Text>
              {draftChecklistItems.map((item) => (
                <View key={item} style={styles.draftChecklistRow}>
                  <Text style={styles.checkbox} />
                  <Text style={styles.checkText}>{item}</Text>
                  <Pressable onPress={() => removeDraftChecklistItem(item)}>
                    <Text style={styles.removeText}>Remover</Text>
                  </Pressable>
                </View>
              ))}
              <View style={styles.inlineForm}>
                <Field onChangeText={setChecklistTitle} placeholder="Novo item de checklist" value={checklistTitle} />
                <Button onPress={addDraftChecklistItem} variant="secondary">
                  Adicionar
                </Button>
              </View>
            </View>
            <Button onPress={submit}>Salvar tarefa</Button>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function TaskCard({
  addChecklistItem,
  checklistItems,
  task,
  toggleChecklistItem,
  updateTaskStatus,
}: {
  addChecklistItem: (task: Task, title: string) => Promise<void>;
  checklistItems: ChecklistItem[];
  task: Task;
  toggleChecklistItem: (item: ChecklistItem) => Promise<void>;
  updateTaskStatus: (task: Task, status: TaskStatus) => Promise<void>;
}) {
  const { colors, styles, textStyles } = useAppStyles();
  const [checkTitle, setCheckTitle] = useState('');
  const checklistDone = checklistItems.filter((item) => item.is_done).length;

  const submitChecklist = async () => {
    await addChecklistItem(task, checkTitle);
    setCheckTitle('');
  };

  return (
    <View style={styles.itemBlock}>
      <View style={styles.rowBetween}>
        <Text style={styles.itemTitle}>{task.title}</Text>
        <Pill tone={task.priority === 'urgent' || task.priority === 'high' ? 'amber' : 'blue'}>
          {priorityLabels[task.priority]}
        </Pill>
      </View>
      {task.description ? <Text style={textStyles.muted}>{task.description}</Text> : null}
      {task.due_at ? <Text style={textStyles.muted}>Prazo: {formatDate(task.due_at)}</Text> : null}
      <Text style={textStyles.muted}>
        Checklist: {checklistDone}/{checklistItems.length}
      </Text>
      <SegmentedControl
        options={[
          ['todo', 'A fazer'],
          ['doing', 'Andamento'],
          ['done', 'Concluida'],
        ]}
        value={task.status}
        onChange={(value) => updateTaskStatus(task, value as TaskStatus)}
      />
      {checklistItems.map((item) => (
        <Pressable key={item.id} onPress={() => toggleChecklistItem(item)} style={styles.checkRow}>
          <Text style={styles.checkbox}>{item.is_done ? 'x' : ''}</Text>
          <Text style={[styles.checkText, item.is_done && styles.doneText]}>{item.title}</Text>
        </Pressable>
      ))}
      <View style={styles.inlineForm}>
        <Field onChangeText={setCheckTitle} placeholder="Novo item de checklist" value={checkTitle} />
        <Button onPress={submitChecklist} variant="secondary">
          Adicionar
        </Button>
      </View>
    </View>
  );
}

function TaskDetailModal({
  addChecklistItem,
  checklistItems,
  deleteTask,
  isVisible,
  notificationRule,
  onClose,
  task,
  toggleChecklistItem,
  toggleTaskDone,
  updateTaskNotificationSelection,
}: {
  addChecklistItem: (task: Task, title: string) => Promise<void>;
  checklistItems: ChecklistItem[];
  deleteTask: (task: Task) => Promise<void>;
  isVisible: boolean;
  notificationRule: TaskDeadlineNotificationRule | null;
  onClose: () => void;
  task: Task | null;
  toggleChecklistItem: (item: ChecklistItem) => Promise<void>;
  toggleTaskDone: (task: Task) => Promise<void>;
  updateTaskNotificationSelection: (task: Task, selection: TaskNotificationSelection) => Promise<void>;
}) {
  const { colors, styles, textStyles } = useAppStyles();
  const [checkTitle, setCheckTitle] = useState('');
  const [notificationSelection, setNotificationSelection] = useState<TaskNotificationSelection>(
    defaultTaskNotificationSelection,
  );

  useEffect(() => {
    setCheckTitle('');
    setNotificationSelection(buildTaskNotificationSelectionFromRule(notificationRule));
  }, [isVisible, notificationRule?.id, task?.id]);

  if (!task) {
    return null;
  }

  const isDone = task.status === 'done';
  const checklistDone = checklistItems.filter((item) => item.is_done).length;
  const activeNotificationRule = buildTaskNotificationRuleFromSelection(notificationSelection);

  const submitChecklist = async () => {
    if (!checkTitle.trim()) {
      return;
    }

    await addChecklistItem(task, checkTitle);
    setCheckTitle('');
  };

  const changeNotificationSelection = async (selection: TaskNotificationSelection) => {
    setNotificationSelection(selection);
    await updateTaskNotificationSelection(task, selection);
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} visible={isVisible}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? spacing.lg : 0}
        style={styles.taskDetailKeyboardAvoiding}
      >
        <SafeAreaView style={styles.taskDetailSafe}>
          <ScrollView contentContainerStyle={styles.taskDetailContent} keyboardShouldPersistTaps="handled">
            <View style={styles.rowBetween}>
              <Text style={styles.taskDetailEyebrow}>Detalhes da tarefa</Text>
              <Pressable accessibilityLabel="Fechar detalhes" accessibilityRole="button" onPress={onClose}>
                <Text style={styles.modalClose}>x</Text>
              </Pressable>
            </View>

            <View style={styles.taskDetailHeader}>
              <View style={styles.compactTaskMetaRow}>
                <PriorityBadge priority={task.priority} />
                <Pill tone={isDone ? 'green' : 'neutral'}>{statusLabels[task.status]}</Pill>
              </View>
              <Text style={[styles.taskDetailTitle, isDone && styles.doneText]}>{task.title}</Text>
              {task.description ? <Text style={styles.taskDetailDescription}>{task.description}</Text> : null}
              {task.due_at ? <Text style={textStyles.muted}>Prazo: {formatDate(task.due_at)}</Text> : null}
            </View>

            <Button onPress={() => toggleTaskDone(task)} variant={isDone ? 'secondary' : 'primary'}>
              {isDone ? 'Reabrir tarefa' : 'Marcar como concluida'}
            </Button>
            <Button onPress={() => confirmDeleteTask(task, deleteTask)} variant="danger">
              Excluir tarefa
            </Button>

            {task.due_at ? (
              <View style={styles.taskDetailSection}>
                <View style={styles.rowBetween}>
                  <Text style={styles.modalLabel}>Notificacoes do prazo</Text>
                  <Pill tone={activeNotificationRule?.enabled && !isDone ? 'blue' : 'neutral'}>
                    {activeNotificationRule?.enabled && !isDone ? 'Ativo' : 'Desativado'}
                  </Pill>
                </View>
                <TaskNotificationPresetPicker
                  disabled={isDone}
                  onChange={changeNotificationSelection}
                  value={notificationSelection}
                />
                {isDone ? (
                  <Text style={styles.dueSummary}>Tarefas concluidas nao mantem alertas agendados.</Text>
                ) : Platform.OS === 'web' ? (
                  <Text style={styles.dueSummary}>Alertas locais aparecem em iOS e Android.</Text>
                ) : null}
              </View>
            ) : null}

            <View style={styles.taskDetailSection}>
              <View style={styles.rowBetween}>
                <Text style={styles.modalLabel}>Subtarefas</Text>
                <Text style={styles.taskDetailProgress}>
                  {checklistDone}/{checklistItems.length}
                </Text>
              </View>

              {checklistItems.length ? (
                checklistItems.map((item) => (
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: item.is_done }}
                    key={item.id}
                    onPress={() => toggleChecklistItem(item)}
                    style={({ pressed }) => [styles.taskDetailCheckRow, pressed && styles.pressed]}
                  >
                    <Text style={[styles.checkbox, item.is_done && styles.checkboxDone]}>
                      {item.is_done ? 'x' : ''}
                    </Text>
                    <Text style={[styles.checkText, item.is_done && styles.doneText]}>{item.title}</Text>
                  </Pressable>
                ))
              ) : (
                <Text style={textStyles.muted}>Nenhuma subtarefa cadastrada.</Text>
              )}

              <View style={styles.inlineForm}>
                <Field onChangeText={setCheckTitle} placeholder="Nova subtarefa" value={checkTitle} />
                <Button onPress={submitChecklist} variant="secondary">
                  Adicionar subtarefa
                </Button>
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ProfileScreen({
  notificationsEnabled,
  onBack,
  onSignOut,
  themeKey,
  toggleNotifications,
  updateProfileTheme,
  updateProfileName,
  user,
}: {
  notificationsEnabled: boolean;
  onBack: () => void;
  onSignOut: () => Promise<void>;
  themeKey: ThemeKey;
  toggleNotifications: (enabled: boolean) => Promise<void>;
  updateProfileTheme: (themeKey: ThemeKey) => Promise<void>;
  updateProfileName: (name: string) => Promise<void>;
  user: UserContext;
}) {
  const { colors, styles, textStyles } = useAppStyles();
  const [name, setName] = useState(user.fullName ?? getFirstName(user));
  const [isNameModalVisible, setIsNameModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const displayName = user.fullName ?? getFirstName(user);

  useEffect(() => {
    if (!isNameModalVisible) {
      setName(displayName);
    }
  }, [displayName, isNameModalVisible]);

  const openNameModal = () => {
    setName(displayName);
    setIsNameModalVisible(true);
  };

  const closeNameModal = () => {
    if (saving) {
      return;
    }

    setName(displayName);
    setIsNameModalVisible(false);
  };

  const submit = async () => {
    setSaving(true);
    await updateProfileName(name);
    setSaving(false);
    setIsNameModalVisible(false);
  };

  return (
    <View style={styles.profileScreen}>
      <View style={styles.rowBetween}>
        <Pressable accessibilityRole="button" onPress={onBack} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <Text style={styles.linkText}>VOLTAR</Text>
        </Pressable>
        {isSupabaseConfigured ? (
          <Pressable
            accessibilityLabel="Sair da conta"
            accessibilityRole="button"
            onPress={onSignOut}
            style={({ pressed }) => [styles.profileLogoutButton, pressed && styles.pressed]}
          >
            <LogOut color={colors.muted} size={19} strokeWidth={2.4} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.profileHero}>
        <View style={styles.profileAvatar}>
          <UserRound color={colors.primary} size={34} strokeWidth={2.5} />
        </View>
        <Text style={styles.profileTitle}>Meu Perfil</Text>
        <Text style={textStyles.muted}>{user.email}</Text>
      </View>

      <Card>
        <View style={styles.profileNameRow}>
          <View style={styles.flex}>
            <Text style={styles.profileName}>{displayName}</Text>
            <Text style={textStyles.muted}>Toque no lápis para alterar o nome.</Text>
          </View>
          <Pressable
            accessibilityLabel="Alterar nome de usuário"
            accessibilityRole="button"
            onPress={openNameModal}
            style={({ pressed }) => [styles.editNameButton, pressed && styles.pressed]}
          >
            <Pencil color={colors.primary} size={18} strokeWidth={2.5} />
          </Pressable>
        </View>
      </Card>

      <Card>
        <SectionTitle muted="Botões, tabs, links e destaques">Cor de destaque</SectionTitle>
        <View style={styles.themeGrid}>
          {themeOptions.map((option) => {
            const isActive = option.key === themeKey;

            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                key={option.key}
                onPress={() => updateProfileTheme(option.key)}
                style={({ pressed }) => [
                  styles.themeOption,
                  isActive && styles.themeOptionActive,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.themeSwatchWrap}>
                  <View style={[styles.themeSwatch, { backgroundColor: option.swatch }]} />
                  <View style={[styles.themeSoftSwatch, { backgroundColor: option.softSwatch }]} />
                </View>
                <Text style={[styles.themeOptionText, isActive && styles.themeOptionTextActive]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card>
        <View style={styles.profileNameRow}>
          <View style={styles.flex}>
            <Text style={styles.profileName}>Notificacoes</Text>
            <Text style={textStyles.muted}>
              Controla os alertas locais de lembretes e prazos neste dispositivo.
            </Text>
          </View>
          <Switch
            onValueChange={(enabled) => {
              void toggleNotifications(enabled);
            }}
            thumbColor={notificationsEnabled ? colors.primary : colors.surface}
            trackColor={{ false: colors.border, true: colors.primarySoft }}
            value={notificationsEnabled}
          />
        </View>
      </Card>

      <Modal animationType="slide" onRequestClose={closeNameModal} transparent visible={isNameModalVisible}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? spacing.lg : 0}
          style={styles.modalKeyboardAvoiding}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
              <View style={styles.profileNameModalContent}>
                <View style={styles.rowBetween}>
                  <Text style={styles.modalTitle}>Alterar nome</Text>
                  <Pressable accessibilityLabel="Cancelar alteração de nome" accessibilityRole="button" onPress={closeNameModal}>
                    <Text style={styles.modalClose}>x</Text>
                  </Pressable>
                </View>
                <Field autoCapitalize="words" onChangeText={setName} placeholder="Seu nome" value={name} />
                <View style={styles.profileModalActions}>
                  <Button disabled={saving} onPress={closeNameModal} variant="secondary">
                    Cancelar
                  </Button>
                  <Button disabled={saving} onPress={submit}>
                    {saving ? 'Salvando...' : 'Salvar'}
                  </Button>
                </View>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function CollaborationScreen({
  acceptWorkspaceInvitation,
  addFolderChecklistItem,
  addFolderComment,
  attachFolderFile,
  createWorkspaceFolder,
  createSmartPlan,
  deleteWorkspaceFolder,
  deleteFolderChecklistItem,
  deleteFolderNote,
  folderMembers,
  folderChecklistItems,
  folderChecklists,
  folderComments,
  folderFiles,
  folderSections,
  invitations,
  inviteMember,
  memberProfiles,
  onOpenProfile,
  receivedInvitations,
  rejectWorkspaceInvitation,
  resetToken,
  selectedWorkspace,
  syncFolderContent,
  toggleFolderChecklistItem,
  updateFolderChecklistItem,
  updateFolderNote,
  user,
  workspaceFolders,
  workspaceMembers,
  workspaces,
}: {
  acceptWorkspaceInvitation: (invitation: WorkspaceInvitation) => Promise<boolean>;
  addFolderChecklistItem: (folder: WorkspaceFolder, checklist: FolderChecklist | null, title: string) => Promise<void>;
  addFolderComment: (folder: WorkspaceFolder, body: string) => Promise<void>;
  attachFolderFile: (folder: WorkspaceFolder) => Promise<void>;
  createWorkspaceFolder: (name: string) => Promise<void>;
  createSmartPlan: (prompt: string) => Promise<WorkspaceFolder | null>;
  deleteWorkspaceFolder: (folder: WorkspaceFolder) => Promise<boolean>;
  deleteFolderChecklistItem: (item: FolderChecklistItem) => Promise<boolean>;
  deleteFolderNote: (comment: FolderComment) => Promise<boolean>;
  folderMembers: FolderMember[];
  folderChecklistItems: FolderChecklistItem[];
  folderChecklists: FolderChecklist[];
  folderComments: FolderComment[];
  folderFiles: FolderFile[];
  folderSections: FolderSection[];
  invitations: WorkspaceInvitation[];
  inviteMember: (email: string, folder?: WorkspaceFolder | null) => Promise<boolean>;
  memberProfiles: MemberProfile[];
  onOpenProfile: () => void;
  receivedInvitations: ReceivedInvitation[];
  rejectWorkspaceInvitation: (invitation: WorkspaceInvitation) => Promise<boolean>;
  resetToken: number;
  selectedWorkspace: Workspace | null;
  syncFolderContent: () => Promise<void>;
  toggleFolderChecklistItem: (item: FolderChecklistItem) => Promise<void>;
  updateFolderChecklistItem: (item: FolderChecklistItem, title: string) => Promise<boolean>;
  updateFolderNote: (comment: FolderComment, body: string) => Promise<boolean>;
  user: UserContext;
  workspaceFolders: WorkspaceFolder[];
  workspaceMembers: WorkspaceMember[];
  workspaces: Workspace[];
}) {
  const { colors, styles, textStyles } = useAppStyles();
  const [inviteEmail, setInviteEmail] = useState('');
  const [isInviteModalVisible, setIsInviteModalVisible] = useState(false);
  const [isAssistantModalVisible, setIsAssistantModalVisible] = useState(false);
  const [assistantPrompt, setAssistantPrompt] = useState('');
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [isFolderModalVisible, setIsFolderModalVisible] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [checklistTitle, setChecklistTitle] = useState('');
  const [commentBody, setCommentBody] = useState('');
  const [editingChecklistItem, setEditingChecklistItem] = useState<FolderChecklistItem | null>(null);
  const [editingChecklistTitle, setEditingChecklistTitle] = useState('');
  const [editingNote, setEditingNote] = useState<FolderComment | null>(null);
  const [editingNoteBody, setEditingNoteBody] = useState('');
  const [expandedInvitationId, setExpandedInvitationId] = useState<string | null>(null);
  const foldersForWorkspace = workspaceFolders;
  const selectedFolder =
    foldersForWorkspace.find((folder) => folder.id === selectedFolderId) ?? null;
  const selectedChecklists = selectedFolder
    ? folderChecklists.filter((checklist) => checklist.folder_id === selectedFolder.id)
    : [];
  const primaryChecklist = selectedChecklists[0] ?? null;
  const selectedChecklistItems = primaryChecklist
    ? folderChecklistItems.filter((item) => item.checklist_id === primaryChecklist.id)
    : [];
  const selectedFiles = selectedFolder ? folderFiles.filter((file) => file.folder_id === selectedFolder.id) : [];
  const selectedComments = selectedFolder
    ? folderComments.filter((comment) => comment.folder_id === selectedFolder.id)
    : [];
  const selectedSections = selectedFolder
    ? folderSections
        .filter((section) => section.folder_id === selectedFolder.id)
        .sort((a, b) => a.position - b.position || a.title.localeCompare(b.title))
    : [];
  const activeMembers = selectedFolder
    ? folderMembers.filter((member) => member.folder_id === selectedFolder.id)
    : [];
  const pendingInvitations = selectedFolder
    ? invitations.filter((invite) => invite.folder_id === selectedFolder.id && invite.status === 'pending')
    : [];

  const submitFolder = async () => {
    await createWorkspaceFolder(folderName);
    setFolderName('');
    setIsFolderModalVisible(false);
  };

  const closeFolderModal = () => {
    setFolderName('');
    setIsFolderModalVisible(false);
  };

  useEffect(() => {
    setSelectedFolderId(null);
  }, [resetToken]);

  useEffect(() => {
    if (selectedFolderId && !foldersForWorkspace.some((folder) => folder.id === selectedFolderId)) {
      setSelectedFolderId(null);
    }
  }, [foldersForWorkspace, selectedFolderId]);

  useEffect(() => {
    if (!selectedFolder) {
      return;
    }

    void syncFolderContent();
    const intervalId = setInterval(() => {
      void syncFolderContent();
    }, 3000);

    return () => {
      clearInterval(intervalId);
    };
  }, [selectedFolder?.id, syncFolderContent]);

  useEffect(() => {
    if (editingChecklistItem && !folderChecklistItems.some((item) => item.id === editingChecklistItem.id)) {
      setEditingChecklistItem(null);
      setEditingChecklistTitle('');
    }
  }, [editingChecklistItem, folderChecklistItems]);

  useEffect(() => {
    if (editingNote && !folderComments.some((comment) => comment.id === editingNote.id)) {
      setEditingNote(null);
      setEditingNoteBody('');
    }
  }, [editingNote, folderComments]);

  const submitChecklistItem = async () => {
    if (!selectedFolder) {
      return;
    }
    await addFolderChecklistItem(selectedFolder, primaryChecklist, checklistTitle);
    setChecklistTitle('');
  };

  const submitComment = async () => {
    if (!selectedFolder) {
      return;
    }
    await addFolderComment(selectedFolder, commentBody);
    setCommentBody('');
  };

  const openChecklistItemModal = (item: FolderChecklistItem) => {
    setEditingChecklistItem(item);
    setEditingChecklistTitle(item.title);
  };

  const closeChecklistItemModal = () => {
    setEditingChecklistItem(null);
    setEditingChecklistTitle('');
  };

  const submitChecklistItemEdit = async () => {
    if (!editingChecklistItem) {
      return;
    }

    const didUpdate = await updateFolderChecklistItem(editingChecklistItem, editingChecklistTitle);
    if (didUpdate) {
      closeChecklistItemModal();
    }
  };

  const confirmDeleteEditingChecklistItem = () => {
    if (!editingChecklistItem) {
      return;
    }

    Alert.alert('Excluir item?', 'Esta acao remove o item do checklist.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          const didDelete = await deleteFolderChecklistItem(editingChecklistItem);
          if (didDelete) {
            closeChecklistItemModal();
          }
        },
      },
    ]);
  };

  const openNoteModal = (comment: FolderComment) => {
    setEditingNote(comment);
    setEditingNoteBody(comment.body);
  };

  const closeNoteModal = () => {
    setEditingNote(null);
    setEditingNoteBody('');
  };

  const submitNoteEdit = async () => {
    if (!editingNote) {
      return;
    }

    const didUpdate = await updateFolderNote(editingNote, editingNoteBody);
    if (didUpdate) {
      closeNoteModal();
    }
  };

  const confirmDeleteEditingNote = () => {
    if (!editingNote) {
      return;
    }

    Alert.alert('Excluir nota?', 'Esta acao remove a nota desta pasta.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          const didDelete = await deleteFolderNote(editingNote);
          if (didDelete) {
            closeNoteModal();
          }
        },
      },
    ]);
  };

  const closeInviteModal = () => {
    setInviteEmail('');
    setIsInviteModalVisible(false);
  };

  const closeAssistantModal = () => {
    if (assistantBusy) {
      return;
    }

    setAssistantPrompt('');
    setIsAssistantModalVisible(false);
  };

  const submitSmartPlan = async () => {
    if (!assistantPrompt.trim()) {
      Alert.alert('Assistente de planejamento', 'Descreva o plano que voce quer organizar.');
      return;
    }

    setAssistantBusy(true);
    const folder = await createSmartPlan(assistantPrompt);
    setAssistantBusy(false);
    if (folder) {
      setAssistantPrompt('');
      setIsAssistantModalVisible(false);
      setSelectedFolderId(folder.id);
    }
  };

  const submitInvite = async () => {
    if (!inviteEmail.trim()) {
      Alert.alert('Convite', 'Informe um email para enviar o convite.');
      return;
    }

    const didInvite = await inviteMember(inviteEmail, selectedFolder);
    if (didInvite) {
      closeInviteModal();
    }
  };

  return (
    <View style={styles.notesScreen}>
      <AppHeader onOpenProfile={onOpenProfile} user={user} />

      {receivedInvitations.length ? (
        <View style={styles.noteContentCard}>
          <SectionTitle muted={`${receivedInvitations.length} pendente(s)`}>Convites recebidos</SectionTitle>
          {receivedInvitations.map((invite) => {
            const inviterName = invite.invited_by_name?.trim() || invite.invited_by_email || 'Usuario';
            const inviteTitle = invite.folder_name?.trim() || invite.workspace_name;
            const isExpanded = expandedInvitationId === invite.id;

            return (
              <View key={invite.id} style={styles.receivedInviteCard}>
                <Pressable
                  accessibilityLabel={`Abrir convite para ${inviteTitle}`}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isExpanded }}
                  onPress={() => setExpandedInvitationId(isExpanded ? null : invite.id)}
                  style={({ pressed }) => [styles.receivedInviteSummary, pressed && styles.pressed]}
                >
                  <View style={styles.planFolderIcon}>
                    <FolderKanban color={colors.primary} size={20} strokeWidth={2.5} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.planFolderTitle}>{inviteTitle}</Text>
                    <Text style={styles.commentAuthor}>Convidado por {inviterName}</Text>
                    {invite.invited_by_email ? (
                      <Text style={styles.planFolderMeta}>Email: {invite.invited_by_email}</Text>
                    ) : null}
                  </View>
                </Pressable>
                {isExpanded ? (
                  <View style={styles.receivedInviteActions}>
                    <Button onPress={() => acceptWorkspaceInvitation(invite)} variant="secondary">
                      Aceitar
                    </Button>
                    <Button onPress={() => rejectWorkspaceInvitation(invite)} variant="danger">
                      Recusar
                    </Button>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}

      {!selectedFolder ? (
        <>
          <View style={styles.rowBetween}>
            <View style={styles.flex}>
              <Text style={styles.notesTitle}>Planos</Text>
              <Text style={textStyles.muted}>Selecione uma pasta principal para continuar.</Text>
            </View>
            <Pressable
              accessibilityLabel="Criar pasta"
              accessibilityRole="button"
              onPress={() => setIsFolderModalVisible(true)}
              style={({ pressed }) => [styles.addFolderButton, pressed && styles.pressed]}
            >
              <Text style={styles.addFolderText}>+ Pasta</Text>
            </Pressable>
          </View>

          <Pressable
            accessibilityLabel="Criar plano com assistente"
            accessibilityRole="button"
            onPress={() => setIsAssistantModalVisible(true)}
            style={({ pressed }) => [styles.assistantHeroButton, pressed && styles.pressed]}
          >
            <View style={styles.assistantIconWrap}>
              <Sparkles color={colors.surface} size={22} strokeWidth={2.5} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.assistantHeroTitle}>Criar com assistente</Text>
              <Text style={styles.assistantHeroCopy}>
                Descreva uma viagem, evento, compra ou projeto e receba uma pasta pronta.
              </Text>
            </View>
          </Pressable>

          {foldersForWorkspace.length ? (
            <View style={styles.planFolderGrid}>
              {foldersForWorkspace.map((folder) => {
                const checklistCount = folderChecklists.filter((checklist) => checklist.folder_id === folder.id).length;
                const fileCount = folderFiles.filter((file) => file.folder_id === folder.id).length;

                return (
                  <View key={folder.id} style={styles.planFolderCard}>
                    <Pressable
                      accessibilityLabel={`Abrir pasta ${folder.name}`}
                      accessibilityRole="button"
                      onPress={() => setSelectedFolderId(folder.id)}
                      style={({ pressed }) => [styles.planFolderOpenArea, pressed && styles.pressed]}
                    >
                      <View style={styles.planFolderIcon}>
                        <FolderKanban color={colors.primary} size={22} strokeWidth={2.5} />
                      </View>
                      <View style={styles.flex}>
                        <Text style={styles.planFolderTitle}>{folder.name}</Text>
                        {folder.description ? <Text style={styles.planFolderDescription}>{folder.description}</Text> : null}
                        <Text style={styles.planFolderMeta}>
                          {checklistCount} checklist(s) - {fileCount} arquivo(s)
                        </Text>
                      </View>
                    </Pressable>
                    <Pressable
                      accessibilityLabel="Excluir pasta"
                      accessibilityRole="button"
                      onPress={() => confirmDeleteFolder(folder, deleteWorkspaceFolder)}
                      style={({ pressed }) => [styles.planFolderDeleteButton, pressed && styles.pressed]}
                    >
                      <Text style={styles.planFolderDeleteText}>x</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.dashboardCard}>
              <SectionTitle muted="Pastas principais">Nenhuma pasta criada</SectionTitle>
              <Text style={textStyles.muted}>Crie pastas como viagens, compras, filmes e outros planos.</Text>
              <Button onPress={() => setIsFolderModalVisible(true)}>Criar pasta</Button>
            </View>
          )}
        </>
      ) : null}

      {selectedFolder ? (
        <>
          <View style={styles.folderDetailHeader}>
            <Pressable
              accessibilityLabel="Voltar para pastas"
              accessibilityRole="button"
              onPress={() => setSelectedFolderId(null)}
              style={({ pressed }) => [styles.folderBackIconButton, pressed && styles.pressed]}
            >
              <ArrowLeft color={colors.muted} size={20} strokeWidth={2.5} />
            </Pressable>
            <View style={styles.flex}>
              <Text style={styles.notesBreadcrumb}>PLANOS</Text>
              <Text style={styles.notesTitle}>{selectedFolder.name}</Text>
            </View>
          </View>

          <View style={styles.notesActions}>
            <Pressable
              style={[styles.notesActionButton, styles.notesInviteButton]}
              onPress={() => setIsInviteModalVisible(true)}
            >
              <Text style={[styles.notesActionText, styles.notesInviteText]}>Convidar</Text>
            </Pressable>
          </View>

          <View style={styles.noteContentCard}>
            <Text style={styles.noteCardTitle}>{primaryChecklist?.title ?? 'Checklist'}</Text>
            {selectedChecklistItems.map((item) => (
              <View key={item.id} style={styles.folderChecklistRow}>
                <Pressable
                  accessibilityLabel={item.is_done ? 'Desmarcar item' : 'Marcar item'}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: item.is_done }}
                  onPress={() => toggleFolderChecklistItem(item)}
                  style={({ pressed }) => [
                    styles.folderCheckboxButton,
                    item.is_done && styles.folderCheckboxDone,
                    pressed && styles.pressed,
                  ]}
                >
                  {item.is_done ? <Check color={colors.surface} size={13} strokeWidth={3} /> : null}
                </Pressable>
                <Pressable
                  accessibilityLabel={`Editar item ${item.title}`}
                  accessibilityRole="button"
                  onPress={() => openChecklistItemModal(item)}
                  style={({ pressed }) => [styles.folderChecklistEditArea, pressed && styles.pressed]}
                >
                  <Text style={[styles.folderChecklistText, item.is_done && styles.doneText]}>{item.title}</Text>
                  {item.assigned_label ? <Text style={styles.assignedBadge}>{item.assigned_label}</Text> : null}
                </Pressable>
              </View>
            ))}
            <View style={styles.inlineForm}>
              <Field onChangeText={setChecklistTitle} placeholder="Novo item de checklist" value={checklistTitle} />
              <Button onPress={submitChecklistItem} variant="secondary">
                Adicionar
              </Button>
            </View>
          </View>

          {selectedSections.length ? (
            <View style={styles.smartSectionStack}>
              {selectedSections.map((section) => (
                <FolderSectionCard key={section.id} section={section} />
              ))}
            </View>
          ) : null}

          <View style={styles.noteContentCard}>
            <Text style={styles.noteCardTitle}>Notas</Text>
            <Field multiline onChangeText={setCommentBody} placeholder="Escreva uma nota" value={commentBody} />
            <Button onPress={submitComment} variant="secondary">
              Salvar nota
            </Button>
            {selectedComments.slice(0, 5).map((comment) => {
              const authorName = comment.author_name?.trim() || 'Usuario';

              return (
                <Pressable
                  accessibilityLabel="Editar nota"
                  accessibilityRole="button"
                  key={comment.id}
                  onPress={() => openNoteModal(comment)}
                  style={({ pressed }) => [styles.noteEntry, pressed && styles.pressed]}
                >
                  <View style={styles.noteEntryHeader}>
                    <View style={styles.commentAvatar}>
                      <Text style={styles.commentAvatarText}>{authorName.slice(0, 1).toUpperCase()}</Text>
                    </View>
                    <Text style={styles.commentAuthor}>{authorName}</Text>
                  </View>
                  <Text style={styles.noteBody}>{comment.body}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.noteContentCard}>
            <View style={styles.rowBetween}>
              <Text style={styles.noteEyebrow}>ARQUIVOS COMPARTILHADOS</Text>
              <Pressable onPress={() => attachFolderFile(selectedFolder)}>
                <Text style={styles.linkText}>ANEXAR</Text>
              </Pressable>
            </View>
            {selectedFiles.map((file) => (
              <View key={file.id} style={styles.fileRow}>
                <Text style={styles.fileIcon}>{isImageFile(file) ? 'I' : 'F'}</Text>
                <View style={styles.flex}>
                  <Text style={styles.fileName}>{file.name}</Text>
                  <Text style={styles.fileMeta}>{formatBytes(file.size_bytes)} - {file.mime_type ?? 'arquivo'}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={styles.noteContentCard}>
            <SectionTitle muted={`${activeMembers.length} ativo(s), ${pendingInvitations.length} pendente(s)`}>Membros</SectionTitle>
            {activeMembers.map((member) => {
              const profile = memberProfiles.find((item) => item.id === member.user_id);
              const memberName = profile?.full_name?.trim() || profile?.email || (member.user_id === user.id ? getDisplayName(user) : 'Usuario');
              const memberEmail = profile?.email ?? (member.user_id === user.id ? user.email : member.role);

              return (
                <View key={`${member.folder_id}-${member.user_id}`} style={styles.memberRow}>
                  <View style={styles.commentAvatar}>
                    <Text style={styles.commentAvatarText}>{memberName.slice(0, 1).toUpperCase()}</Text>
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.commentAuthor}>{memberName}</Text>
                    <Text style={styles.commentTime}>{memberEmail}</Text>
                  </View>
                  <Pill tone="green">Ativo</Pill>
                </View>
              );
            })}
            {pendingInvitations.map((invite) => (
              <View key={invite.id} style={styles.memberRow}>
                <View style={styles.pendingMemberAvatar}>
                  <Text style={styles.commentAvatarText}>{invite.email.slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.commentAuthor}>{invite.email}</Text>
                  <Text style={styles.commentTime}>Convite enviado</Text>
                </View>
                <Pill tone="amber">Pendente</Pill>
              </View>
            ))}
            {!activeMembers.length && !pendingInvitations.length ? (
              <Text style={textStyles.muted}>Nenhum membro ativo ou convite pendente.</Text>
            ) : null}
          </View>
        </>
      ) : null}

      <Modal animationType="slide" onRequestClose={closeFolderModal} transparent visible={isFolderModalVisible}>
        <KeyboardAvoidingView behavior="height" keyboardVerticalOffset={0} style={styles.modalKeyboardAvoiding}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
              <View style={styles.folderModalContent}>
                <View style={styles.rowBetween}>
                  <Text style={styles.modalTitle}>Nova pasta</Text>
                  <Pressable onPress={closeFolderModal}>
                    <Text style={styles.modalClose}>x</Text>
                  </Pressable>
                </View>
                <Field onChangeText={setFolderName} placeholder="Ex: Planejamento de Viagem" value={folderName} />
                <View style={styles.folderModalActions}>
                  <Button onPress={submitFolder}>Criar pasta</Button>
                </View>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal animationType="slide" onRequestClose={closeInviteModal} transparent visible={isInviteModalVisible}>
        <KeyboardAvoidingView behavior="height" keyboardVerticalOffset={0} style={styles.modalKeyboardAvoiding}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
              <View style={styles.folderModalContent}>
                <View style={styles.rowBetween}>
                  <Text style={styles.modalTitle}>Convidar membro</Text>
                  <Pressable accessibilityLabel="Cancelar convite" accessibilityRole="button" onPress={closeInviteModal}>
                    <Text style={styles.modalClose}>x</Text>
                  </Pressable>
                </View>
                <Field
                  autoCapitalize="none"
                  keyboardType="email-address"
                  onChangeText={setInviteEmail}
                  placeholder="email@exemplo.com"
                  value={inviteEmail}
                />
                <View style={styles.profileModalActions}>
                  <Button onPress={closeInviteModal} variant="secondary">
                    Cancelar
                  </Button>
                  <Button onPress={submitInvite}>Enviar convite</Button>
                </View>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal animationType="slide" onRequestClose={closeAssistantModal} transparent visible={isAssistantModalVisible}>
        <KeyboardAvoidingView behavior="height" keyboardVerticalOffset={0} style={styles.modalKeyboardAvoiding}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
              <ScrollView contentContainerStyle={styles.modalSheetContent} keyboardShouldPersistTaps="handled">
                <View style={styles.rowBetween}>
                  <Text style={styles.modalTitle}>Assistente de planejamento</Text>
                  <Pressable accessibilityLabel="Fechar assistente" accessibilityRole="button" onPress={closeAssistantModal}>
                    <Text style={styles.modalClose}>x</Text>
                  </Pressable>
                </View>
                <View style={styles.assistantPromptCard}>
                  <Sparkles color={colors.primary} size={22} strokeWidth={2.5} />
                  <Text style={styles.assistantPromptTitle}>Transforme uma ideia em plano</Text>
                  <Text style={styles.assistantPromptCopy}>
                    Ex: Planejar viagem para Toquio em outubro com orçamento de R$ 12.000.
                  </Text>
                </View>
                <Field
                  multiline
                  onChangeText={setAssistantPrompt}
                  placeholder="Descreva o que voce quer organizar"
                  style={styles.assistantPromptField}
                  textAlignVertical="top"
                  value={assistantPrompt}
                />
                <View style={styles.profileModalActions}>
                  <Button disabled={assistantBusy} onPress={closeAssistantModal} variant="secondary">
                    Cancelar
                  </Button>
                  <Button disabled={assistantBusy} onPress={submitSmartPlan}>
                    {assistantBusy ? 'Criando...' : 'Gerar plano'}
                  </Button>
                </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        animationType="slide"
        onRequestClose={closeChecklistItemModal}
        transparent
        visible={Boolean(editingChecklistItem)}
      >
        <KeyboardAvoidingView behavior="height" keyboardVerticalOffset={0} style={styles.modalKeyboardAvoiding}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
              <View style={styles.folderModalContent}>
                <View style={styles.rowBetween}>
                  <Text style={styles.modalTitle}>Editar item</Text>
                  <Pressable
                    accessibilityLabel="Fechar edição de item"
                    accessibilityRole="button"
                    onPress={closeChecklistItemModal}
                  >
                    <Text style={styles.modalClose}>x</Text>
                  </Pressable>
                </View>
                <Field onChangeText={setEditingChecklistTitle} placeholder="Nome do item" value={editingChecklistTitle} />
                <View style={styles.profileModalActions}>
                  <Button onPress={confirmDeleteEditingChecklistItem} variant="danger">
                    Excluir
                  </Button>
                  <Button onPress={closeChecklistItemModal} variant="secondary">
                    Cancelar
                  </Button>
                  <Button onPress={submitChecklistItemEdit}>Salvar</Button>
                </View>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal animationType="slide" onRequestClose={closeNoteModal} transparent visible={Boolean(editingNote)}>
        <KeyboardAvoidingView behavior="height" keyboardVerticalOffset={0} style={styles.modalKeyboardAvoiding}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
              <View style={styles.folderModalContent}>
                <View style={styles.rowBetween}>
                  <Text style={styles.modalTitle}>Editar nota</Text>
                  <Pressable
                    accessibilityLabel="Fechar edição de nota"
                    accessibilityRole="button"
                    onPress={closeNoteModal}
                  >
                    <Text style={styles.modalClose}>x</Text>
                  </Pressable>
                </View>
                <Field multiline onChangeText={setEditingNoteBody} placeholder="Escreva uma nota" value={editingNoteBody} />
                <View style={styles.profileModalActions}>
                  <Button onPress={confirmDeleteEditingNote} variant="danger">
                    Excluir
                  </Button>
                  <Button onPress={closeNoteModal} variant="secondary">
                    Cancelar
                  </Button>
                  <Button onPress={submitNoteEdit}>Salvar</Button>
                </View>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function FolderSectionCard({ section }: { section: FolderSection }) {
  const { colors, styles } = useAppStyles();

  if (section.kind === 'budget') {
    const [budgetValue, ...budgetLines] = (section.body ?? '').split('\n').filter(Boolean);

    return (
      <View style={styles.noteContentCard}>
        <View style={styles.sectionTitleRow}>
          <WalletCards color={colors.primary} size={20} strokeWidth={2.5} />
          <Text style={styles.noteCardTitle}>{section.title}</Text>
        </View>
        <View style={styles.budgetPlaceholder}>
          <Text style={styles.budgetValue}>{budgetValue || 'Orcamento a definir'}</Text>
          {budgetLines.map((line) => (
            <Text key={line} style={styles.budgetCopy}>{line}</Text>
          ))}
        </View>
      </View>
    );
  }

  if (section.kind === 'map') {
    return (
      <View style={styles.noteContentCard}>
        <View style={styles.sectionTitleRow}>
          <MapPin color={colors.primary} size={20} strokeWidth={2.5} />
          <Text style={styles.noteCardTitle}>{section.title}</Text>
        </View>
        <View style={styles.mapPlaceholder}>
          <Text style={styles.mapPin}>+</Text>
          <Text style={styles.mapText}>{section.body || 'Defina os principais lugares do plano.'}</Text>
        </View>
      </View>
    );
  }

  if (section.kind === 'image') {
    return (
      <View style={styles.noteContentCard}>
        <Text style={styles.noteEyebrow}>REFERENCIA VISUAL</Text>
        <Text style={styles.noteCardTitle}>{section.title}</Text>
        <Text style={styles.noteBody}>{section.body || section.media_url || 'Adicione uma imagem ou link de referencia.'}</Text>
      </View>
    );
  }

  return (
    <View style={styles.noteContentCard}>
      <Text style={styles.noteEyebrow}>PLANO INTELIGENTE</Text>
      <Text style={styles.noteCardTitle}>{section.title}</Text>
      <Text style={styles.noteBody}>{section.body}</Text>
    </View>
  );
}

function SharedListCard({
  addListItem,
  items,
  list,
  toggleListItem,
}: {
  addListItem: (list: SharedList, title: string) => Promise<void>;
  items: SharedListItem[];
  list: SharedList;
  toggleListItem: (item: SharedListItem) => Promise<void>;
}) {
  const { styles } = useAppStyles();
  const [title, setTitle] = useState('');

  return (
    <View style={styles.itemBlock}>
      <Text style={styles.itemTitle}>{list.title}</Text>
      {items.map((item) => (
        <Pressable key={item.id} onPress={() => toggleListItem(item)} style={styles.checkRow}>
          <Text style={styles.checkbox}>{item.is_done ? 'x' : ''}</Text>
          <Text style={[styles.checkText, item.is_done && styles.doneText]}>{item.title}</Text>
        </Pressable>
      ))}
      <View style={styles.inlineForm}>
        <Field onChangeText={setTitle} placeholder="Novo item" value={title} />
        <Button
          onPress={async () => {
            await addListItem(list, title);
            setTitle('');
          }}
          variant="secondary"
        >
          Adicionar
        </Button>
      </View>
    </View>
  );
}

function CalendarScreen({
  reminders,
  onOpenProfile,
  tasks,
  user,
}: {
  reminders: Reminder[];
  onOpenProfile: () => void;
  tasks: Task[];
  user: UserContext;
}) {
  const { styles } = useAppStyles();
  const today = new Date();
  const [visibleMonth, setVisibleMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(today);
  const monthDays = useMemo(() => buildMonthGrid(visibleMonth), [visibleMonth]);
  const activeItemsToday = getScheduleItemsForDate(tasks, reminders, today).filter((item) => !item.done).length;
  const focusScore = calculateFocusScore(tasks, visibleMonth);
  const streak = calculateStreak(tasks);

  return (
    <View style={styles.calendarScreen}>
      <AppHeader onOpenProfile={onOpenProfile} user={user} />

      <View style={styles.calendarCard}>
        <View style={styles.calendarHeader}>
          <View>
            <Text style={styles.calendarTitle}>{formatMonthYear(visibleMonth)}</Text>
            <Text style={styles.calendarSubtitle}>{activeItemsToday} active schedules today</Text>
          </View>
          <View style={styles.calendarNav}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setVisibleMonth(addMonths(visibleMonth, -1))}
              style={({ pressed }) => [styles.calendarNavButton, pressed && styles.pressed]}
            >
              <Text style={styles.calendarNavText}>{'<'}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setVisibleMonth(addMonths(visibleMonth, 1))}
              style={({ pressed }) => [styles.calendarNavButton, pressed && styles.pressed]}
            >
              <Text style={styles.calendarNavText}>{'>'}</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.weekdayRow}>
          {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((day) => (
            <Text key={day} style={[styles.weekdayText, (day === 'SAT' || day === 'SUN') && styles.weekendText]}>
              {day}
            </Text>
          ))}
        </View>

        <View style={styles.calendarGrid}>
          {monthDays.map((day) => {
            const hasEvents = getScheduleItemsForDate(tasks, reminders, day.date).length > 0;
            const selected = isSameLocalDate(day.date, selectedDate);
            return (
              <Pressable
                key={day.key}
                accessibilityRole="button"
                onPress={() => setSelectedDate(day.date)}
                style={({ pressed }) => [
                  styles.calendarDayCell,
                  selected && styles.selectedCalendarDay,
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[
                    styles.calendarDayText,
                    !day.inMonth && styles.calendarDayMuted,
                    day.isWeekend && styles.weekendText,
                    selected && styles.selectedCalendarDayText,
                  ]}
                >
                  {day.date.getDate()}
                </Text>
                {hasEvents ? <View style={[styles.eventDot, selected && styles.selectedEventDot]} /> : null}
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.metricGrid}>
        <View style={styles.metricCard}>
          <View style={[styles.metricIcon, styles.metricIconGreen]}>
            <Text style={styles.metricIconText}>[]</Text>
          </View>
          <View>
            <Text style={styles.metricTitle}>Focus{'\n'}Score</Text>
            <Text style={styles.metricValue}>{focusScore}%</Text>
          </View>
        </View>
        <View style={styles.metricCard}>
          <View style={[styles.metricIcon, styles.metricIconRed]}>
            <Text style={styles.metricIconText}>@</Text>
          </View>
          <View>
            <Text style={styles.metricTitle}>Streak</Text>
            <Text style={styles.metricValue}>{streak} Days</Text>
          </View>
        </View>
      </View>

    </View>
  );
}

function SegmentedControl({
  disabled,
  onChange,
  options,
  value,
}: {
  disabled?: boolean;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
  value: string;
}) {
  const { styles } = useAppStyles();

  return (
    <View style={styles.segmented}>
      {options.map(([optionValue, label]) => (
        <Pressable
          disabled={disabled}
          key={optionValue}
          onPress={() => onChange(optionValue)}
          style={[styles.segment, value === optionValue && styles.activeSegment, disabled && styles.disabledPanel]}
        >
          <Text style={[styles.segmentText, value === optionValue && styles.activeSegmentText]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function TaskNotificationPresetPicker({
  disabled,
  onChange,
  value,
}: {
  disabled?: boolean;
  onChange: (value: TaskNotificationSelection) => void;
  value: TaskNotificationSelection;
}) {
  const { colors, styles } = useAppStyles();
  const options: Array<{
    description: string;
    key: TaskNotificationOptionKey;
    label: string;
  }> = [
    { description: 'Sem alerta para esta tarefa.', key: 'off', label: 'Desativado' },
    ...taskNotificationPresets.map((preset) => ({
      description: preset.description,
      key: preset.key,
      label: preset.label,
    })),
    { description: 'Escolha valor, unidade e tipo de lembrete.', key: 'custom', label: 'Personalizado' },
  ];

  const updateSelection = (patch: Partial<TaskNotificationSelection>) => {
    onChange({ ...value, ...patch });
  };

  return (
    <View style={styles.notificationPresetGrid}>
      {options.map((option) => {
        const isActive = option.key === value.optionKey;

        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled, selected: isActive }}
            disabled={disabled}
            key={option.key}
            onPress={() => updateSelection({ optionKey: option.key })}
            style={({ pressed }) => [
              styles.notificationPreset,
              isActive && styles.notificationPresetActive,
              disabled && styles.disabledPanel,
              pressed && !disabled && styles.pressed,
            ]}
          >
            <Bell color={isActive ? colors.primary : colors.muted} size={17} strokeWidth={2.4} />
            <View style={styles.flex}>
              <Text style={[styles.notificationPresetTitle, isActive && styles.notificationPresetTitleActive]}>
                {option.label}
              </Text>
              <Text style={styles.notificationPresetDescription}>{option.description}</Text>
            </View>
          </Pressable>
        );
      })}
      {value.optionKey === 'custom' ? (
        <View style={styles.customNotificationPanel}>
          <SegmentedControl
            disabled={disabled}
            options={[
              ['once', 'Unico'],
              ['repeat', 'Repetir'],
            ]}
            value={value.customMode}
            onChange={(mode) => updateSelection({ customMode: mode as TaskNotificationSelection['customMode'] })}
          />
          <View style={styles.customNotificationRow}>
            <Text style={styles.notificationPresetDescription}>
              {value.customMode === 'repeat' ? 'Lembrete a cada' : 'Lembrete'}
            </Text>
            <Field
              editable={!disabled}
              keyboardType="number-pad"
              onChangeText={(customValue) => updateSelection({ customValue })}
              placeholder="5"
              style={styles.customNotificationValueField}
              value={value.customValue}
            />
          </View>
          <SegmentedControl
            disabled={disabled}
            options={[
              ['minutes', 'Minutos'],
              ['hours', 'Horas'],
              ['days', 'Dias'],
            ]}
            value={value.customUnit}
            onChange={(unit) => updateSelection({ customUnit: unit as TaskNotificationUnit })}
          />
          <Text style={styles.dueSummary}>
            {value.customMode === 'repeat'
              ? `Lembrete a cada ${value.customValue || '...'} ${getTaskNotificationUnitLabel(value.customUnit)}.`
              : `Lembrete ${value.customValue || '...'} ${getTaskNotificationUnitLabel(value.customUnit)} antes.`}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function getTaskNotificationUnitLabel(unit: TaskNotificationUnit) {
  return {
    days: 'dias',
    hours: 'horas',
    minutes: 'minutos',
  }[unit];
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatTaskDueLabel(value: string) {
  if (isToday(value)) {
    return formatTime(value);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatCreateDueLabel(date: Date, hasTime: boolean) {
  const options: Intl.DateTimeFormatOptions = hasTime
    ? { dateStyle: 'medium', timeStyle: 'short' }
    : { dateStyle: 'medium' };

  return new Intl.DateTimeFormat('pt-BR', options).format(date);
}

function buildTaskDueAt(date: Date | null, hasTime: boolean) {
  if (!date) {
    return null;
  }

  const dueAt = new Date(date);
  if (!hasTime) {
    dueAt.setHours(12, 0, 0, 0);
  }

  return dueAt.toISOString();
}

function normalizeChecklistTitle(title: string) {
  return title.trim().replace(/\s+/g, ' ');
}

function normalizeChecklistItems(items: string[]) {
  const seen = new Set<string>();
  const normalizedItems: string[] = [];

  items.forEach((item) => {
    const normalized = normalizeChecklistTitle(item);
    const key = normalized.toLocaleLowerCase();

    if (normalized && !seen.has(key)) {
      seen.add(key);
      normalizedItems.push(normalized);
    }
  });

  return normalizedItems;
}

function confirmDeleteTask(task: Task, deleteTask: (task: Task) => Promise<void>) {
  Alert.alert('Excluir tarefa?', 'Esta acao remove a tarefa e suas subtarefas.', [
    { text: 'Cancelar', style: 'cancel' },
    {
      text: 'Excluir',
      style: 'destructive',
      onPress: () => {
        deleteTask(task);
      },
    },
  ]);
}

function confirmDeleteFolder(folder: WorkspaceFolder, deleteWorkspaceFolder: (folder: WorkspaceFolder) => Promise<boolean>) {
  Alert.alert('Excluir pasta?', 'Esta acao remove a pasta, checklists, arquivos e comentarios.', [
    { text: 'Cancelar', style: 'cancel' },
    {
      text: 'Excluir',
      style: 'destructive',
      onPress: async () => {
        await deleteWorkspaceFolder(folder);
      },
    },
  ]);
}

function formatDay(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '--' : String(date.getDate()).padStart(2, '0');
}

function formatMonth(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '---';
  }

  return new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(date).replace('.', '').toUpperCase();
}

function dateValue(value: string | null) {
  if (!value) {
    return Number.MAX_SAFE_INTEGER;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? Number.MAX_SAFE_INTEGER : date.getTime();
}

function isToday(value: string | null) {
  if (!value) {
    return false;
  }

  const date = new Date(value);
  const today = new Date();

  return (
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

function isCurrentLocalWeek(value: string | null) {
  if (!value) {
    return false;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const today = new Date();
  const day = today.getDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - daysSinceMonday);
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  return date >= weekStart && date <= weekEnd;
}

function isSameLocalDate(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function buildMonthGrid(monthDate: Date) {
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - startOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const day = date.getDay();

    return {
      date,
      inMonth: date.getMonth() === monthDate.getMonth(),
      isWeekend: day === 0 || day === 6,
      key: `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
    };
  });
}

type ScheduleItem =
  | {
      at: string;
      description: string;
      done: boolean;
      endsAt: string | null;
      featured: boolean;
      id: string;
      priority: Priority;
      task: Task;
      title: string;
      type: 'task';
    }
  | {
      at: string;
      description: string;
      done: boolean;
      endsAt: null;
      featured: boolean;
      id: string;
      priority: Priority;
      title: string;
      type: 'reminder';
    };

function getScheduleItemsForDate(tasks: Task[], reminders: Reminder[], date: Date): ScheduleItem[] {
  const taskItems: ScheduleItem[] = tasks
    .filter((task) => task.due_at && isSameLocalDate(new Date(task.due_at), date))
    .map((task) => ({
      at: task.due_at ?? new Date(date).toISOString(),
      description: task.description || (task.status === 'done' ? 'Concluida' : 'Review backlog and set focus areas.'),
      done: task.status === 'done',
      endsAt: task.due_at ? addMinutes(task.due_at, 90) : null,
      featured: task.priority === 'urgent' || task.priority === 'high',
      id: task.id,
      priority: task.priority,
      task,
      title: task.title,
      type: 'task',
    }));

  const reminderItems: ScheduleItem[] = reminders
    .filter((reminder) => isSameLocalDate(new Date(reminder.remind_at), date))
    .map((reminder) => ({
      at: reminder.remind_at,
      description: reminder.is_done ? 'Lembrete concluido' : 'Alerta local agendado',
      done: reminder.is_done,
      endsAt: null,
      featured: false,
      id: reminder.id,
      priority: 'medium',
      title: reminder.title,
      type: 'reminder',
    }));

  return [...taskItems, ...reminderItems].sort((a, b) => dateValue(a.at) - dateValue(b.at));
}

function addMinutes(value: string, minutes: number) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString();
}

function calculateFocusScore(tasks: Task[], visibleMonth: Date) {
  const monthTasks = tasks.filter((task) => {
    if (!task.due_at) {
      return false;
    }
    const date = new Date(task.due_at);
    return date.getFullYear() === visibleMonth.getFullYear() && date.getMonth() === visibleMonth.getMonth();
  });

  if (!monthTasks.length) {
    return 0;
  }

  return Math.round((monthTasks.filter((task) => task.status === 'done').length / monthTasks.length) * 100);
}

function calculateStreak(tasks: Task[]) {
  const doneTaskDates = new Set(
    tasks
      .filter((task) => task.status === 'done' && task.due_at)
      .map((task) => {
        const date = new Date(task.due_at ?? '');
        return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      }),
  );
  let streak = 0;
  const cursor = new Date();

  while (doneTaskDates.has(`${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`)) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function formatMonthYear(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function formatScheduleDate(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function isFuture(value: string) {
  return dateValue(value) > Date.now();
}

function sortTasksByPriorityAndTime(a: Task, b: Task) {
  const priorityWeight: Record<Priority, number> = {
    urgent: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  return priorityWeight[a.priority] - priorityWeight[b.priority] || dateValue(a.due_at) - dateValue(b.due_at);
}

function getFirstName(user: UserContext) {
  const sourceName = getDisplayName(user);
  const normalized = sourceName.split(/\s+/)[0].split(/[._-]/)[0] || sourceName;
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function getDisplayName(user: UserContext) {
  return user.fullName?.trim() || user.email.split('@')[0] || 'Lucas';
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) {
    return 'Bom dia';
  }
  if (hour < 18) {
    return 'Boa tarde';
  }
  return 'Boa noite';
}

function buildSmartPlanDraft(prompt: string): SmartPlanDraft | null {
  const normalizedPrompt = prompt.trim().replace(/\s+/g, ' ');
  if (normalizedPrompt.length < 8) {
    return null;
  }

  const lowerPrompt = normalizeForSearch(normalizedPrompt);
  const kind = inferSmartPlanKind(lowerPrompt);
  const subject = extractSmartPlanSubject(normalizedPrompt, kind);
  const budget = extractBudget(normalizedPrompt);
  const targetDate = extractTargetDate(lowerPrompt);
  const folderName = buildSmartPlanFolderName(kind, subject);
  const budgetLine = budget ? `Orcamento total: ${budget}` : 'Orcamento total: a definir';
  const dateLine = targetDate.label ? `Prazo alvo: ${targetDate.label}` : 'Prazo alvo: a definir';

  const commonSections: SmartPlanSectionDraft[] = [
    {
      kind: 'text',
      title: 'Resumo executivo',
      body: `${normalizedPrompt}\n\n${dateLine}\n${budgetLine}\nPlano criado para transformar a ideia em proximas acoes, decisoes e pontos de colaboracao.`,
      media_url: null,
    },
  ];

  if (kind === 'trip') {
    return {
      folderName,
      description: `Roteiro, documentos, reservas e orcamento para ${subject}.`,
      checklistTitle: 'Checklist da viagem',
      checklistItems: [
        { title: 'Definir datas e quantidade de dias', assignedLabel: 'Voce' },
        { title: 'Pesquisar passagens e hospedagem', assignedLabel: null },
        { title: 'Separar documentos, vistos e seguros', assignedLabel: null },
        { title: 'Montar roteiro por bairro ou cidade', assignedLabel: 'Parceiro' },
        { title: 'Reservar experiencias prioritarias', assignedLabel: null },
        { title: 'Conferir cambio, internet e transporte local', assignedLabel: null },
      ],
      reminders: targetDate.reminderAt
        ? [{ title: `Revisar reservas de ${subject}`, remindAt: targetDate.reminderAt }]
        : [],
      sections: [
        ...commonSections,
        {
          kind: 'map',
          title: 'Roteiro sugerido',
          body: `Base: ${subject}. Organize os pontos por proximidade: chegada e hospedagem, experiencias principais, restaurantes, deslocamentos e tempo livre.`,
          media_url: null,
        },
        {
          kind: 'budget',
          title: 'Orcamento estimado',
          body: [
            budgetLine,
            'Passagens: 35%',
            'Hospedagem: 30%',
            'Alimentacao: 15%',
            'Passeios e transporte: 15%',
            'Reserva de seguranca: 5%',
          ].join('\n'),
          media_url: null,
        },
        {
          kind: 'text',
          title: 'Decisoes pendentes',
          body: 'Fechar periodo da viagem, escolher bairro base, priorizar passeios pagos e combinar responsabilidades entre os membros.',
          media_url: null,
        },
      ],
    };
  }

  if (kind === 'shopping') {
    return {
      folderName,
      description: `Lista inteligente de compras, prioridades e limites para ${subject}.`,
      checklistTitle: 'Lista priorizada',
      checklistItems: [
        { title: 'Separar itens essenciais', assignedLabel: 'Voce' },
        { title: 'Comparar precos antes de comprar', assignedLabel: null },
        { title: 'Definir limite por categoria', assignedLabel: null },
        { title: 'Marcar itens recorrentes', assignedLabel: null },
        { title: 'Conferir estoque antes de sair', assignedLabel: 'Casa' },
      ],
      reminders: [],
      sections: [
        ...commonSections,
        {
          kind: 'budget',
          title: 'Controle de gastos',
          body: [budgetLine, 'Essenciais: 60%', 'Reposicao: 25%', 'Extras: 10%', 'Margem: 5%'].join('\n'),
          media_url: null,
        },
        {
          kind: 'text',
          title: 'Criterios de compra',
          body: 'Priorize o que resolve a semana atual, evite duplicados e registre marcas ou lojas preferidas nas notas.',
          media_url: null,
        },
      ],
    };
  }

  if (kind === 'movie') {
    return {
      folderName,
      description: `Curadoria colaborativa para ${subject}.`,
      checklistTitle: 'Fila para assistir',
      checklistItems: [
        { title: 'Adicionar indicacoes de todos os membros', assignedLabel: null },
        { title: 'Separar por genero ou duracao', assignedLabel: null },
        { title: 'Escolher primeira sessao', assignedLabel: 'Voce' },
        { title: 'Registrar onde assistir', assignedLabel: null },
      ],
      reminders: targetDate.reminderAt
        ? [{ title: `Escolher proximo filme de ${subject}`, remindAt: targetDate.reminderAt }]
        : [],
      sections: [
        ...commonSections,
        {
          kind: 'text',
          title: 'Regras da curadoria',
          body: 'Cada pessoa indica opcoes, o grupo vota nas prioridades e a lista fica organizada por humor: leve, intenso, classico ou serie longa.',
          media_url: null,
        },
      ],
    };
  }

  if (kind === 'event') {
    return {
      folderName,
      description: `Cronograma, convidados e preparacao para ${subject}.`,
      checklistTitle: 'Preparacao do evento',
      checklistItems: [
        { title: 'Definir data, local e horario', assignedLabel: 'Voce' },
        { title: 'Montar lista de convidados', assignedLabel: null },
        { title: 'Confirmar comidas, bebidas e estrutura', assignedLabel: null },
        { title: 'Enviar convites ou lembretes', assignedLabel: null },
        { title: 'Separar plano B para imprevistos', assignedLabel: null },
      ],
      reminders: targetDate.reminderAt
        ? [{ title: `Confirmar preparacao de ${subject}`, remindAt: targetDate.reminderAt }]
        : [],
      sections: [
        ...commonSections,
        {
          kind: 'budget',
          title: 'Orcamento do evento',
          body: [budgetLine, 'Local e estrutura: 35%', 'Comidas e bebidas: 40%', 'Decoracao: 15%', 'Reserva: 10%'].join('\n'),
          media_url: null,
        },
        {
          kind: 'map',
          title: 'Local e logistica',
          body: 'Registre endereco, estacionamento, horario de chegada e responsaveis por levar cada item.',
          media_url: null,
        },
      ],
    };
  }

  return {
    folderName,
    description: `Plano de acao colaborativo para ${subject}.`,
    checklistTitle: 'Proximos passos',
    checklistItems: [
      { title: 'Definir objetivo final', assignedLabel: 'Voce' },
      { title: 'Quebrar o plano em etapas menores', assignedLabel: null },
      { title: 'Separar responsaveis', assignedLabel: null },
      { title: 'Definir primeiro marco de entrega', assignedLabel: null },
      { title: 'Revisar progresso com o grupo', assignedLabel: null },
    ],
    reminders: targetDate.reminderAt
      ? [{ title: `Revisar plano: ${subject}`, remindAt: targetDate.reminderAt }]
      : [],
    sections: [
      ...commonSections,
      {
        kind: 'text',
        title: 'Plano de ataque',
        body: 'Comece pelo resultado esperado, liste restricoes, distribua responsabilidades e mantenha as decisoes importantes nas notas da pasta.',
        media_url: null,
      },
      {
        kind: 'budget',
        title: 'Recursos',
        body: [budgetLine, 'Tempo: estimar por etapa', 'Pessoas: definir responsaveis', 'Riscos: revisar semanalmente'].join('\n'),
        media_url: null,
      },
    ],
  };
}

function inferSmartPlanKind(prompt: string) {
  if (/(viagem|viajar|roteiro|hotel|passagem|turismo|destino)/.test(prompt)) {
    return 'trip';
  }
  if (/(compra|compras|mercado|lista|supermercado)/.test(prompt)) {
    return 'shopping';
  }
  if (/(filme|filmes|serie|series|assistir|cinema)/.test(prompt)) {
    return 'movie';
  }
  if (/(evento|festa|aniversario|casamento|encontro|reuniao)/.test(prompt)) {
    return 'event';
  }
  return 'project';
}

function extractSmartPlanSubject(prompt: string, kind: string) {
  const cleanPrompt = prompt.replace(/\s+com\s+orcamento.*$/i, '').replace(/\s+orçamento.*$/i, '').trim();
  const destinationMatch = cleanPrompt.match(/\b(?:para|pra|em|no|na)\s+([^,.]+?)(?:\s+em\s+|\s+no\s+|\s+na\s+|$)/i);
  const rawSubject = destinationMatch?.[1]?.trim() || cleanPrompt.replace(/^(planejar|organizar|criar|montar)\s+/i, '').trim();
  const subject = rawSubject || {
    trip: 'a proxima viagem',
    shopping: 'as compras',
    movie: 'a lista de filmes',
    event: 'o evento',
    project: 'o projeto',
  }[kind] || 'o plano';

  return subject.charAt(0).toUpperCase() + subject.slice(1);
}

function buildSmartPlanFolderName(kind: string, subject: string) {
  const prefix = {
    trip: 'Viagem',
    shopping: 'Compras',
    movie: 'Filmes',
    event: 'Evento',
    project: 'Projeto',
  }[kind] || 'Plano';

  return `${prefix}: ${subject}`.slice(0, 64);
}

function extractBudget(prompt: string) {
  const explicitBudgetMatch = prompt.match(/(?:orcamento|orçamento|budget)[^\dR$]*(?:R\$\s*)?(\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})?|\d+)(?:\s*(?:reais|brl))?/i);
  const currencyMatch = prompt.match(/R\$\s*(\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})?|\d+)/i);
  const budgetMatch = explicitBudgetMatch ?? currencyMatch;
  if (!budgetMatch) {
    return null;
  }

  const rawValue = budgetMatch[1].replace(/\s/g, '');
  return `R$ ${rawValue}`;
}

function extractTargetDate(prompt: string) {
  const monthNames = [
    'janeiro',
    'fevereiro',
    'marco',
    'abril',
    'maio',
    'junho',
    'julho',
    'agosto',
    'setembro',
    'outubro',
    'novembro',
    'dezembro',
  ];
  const monthIndex = monthNames.findIndex((month) => prompt.includes(month));
  if (monthIndex === -1) {
    return { label: null, reminderAt: null };
  }

  const today = new Date();
  const target = new Date(today.getFullYear(), monthIndex, 1, 9, 0, 0, 0);
  if (target < today) {
    target.setFullYear(target.getFullYear() + 1);
  }
  const reminder = new Date(target);
  reminder.setDate(Math.max(1, target.getDate() - 14));

  return {
    label: monthNames[monthIndex].charAt(0).toUpperCase() + monthNames[monthIndex].slice(1),
    reminderAt: reminder.toISOString(),
  };
}

function normalizeForSearch(value: string) {
  return value
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

async function seedDefaultTaskCategories(ownerId: string) {
  if (!supabase) {
    return demoTaskCategories;
  }

  const defaults = [
    { owner_id: ownerId, name: 'Trabalho', color: '#2563eb', icon: 'briefcase', position: 1 },
    { owner_id: ownerId, name: 'Pessoal', color: '#0f8f62', icon: 'user', position: 2 },
  ];
  const { data, error } = await supabase.from('task_categories').upsert(defaults, {
    onConflict: 'owner_id,name',
  }).select('*').order('position', { ascending: true });

  if (error) {
    Alert.alert('Erro ao criar categorias', error.message);
    return [];
  }

  return data ?? [];
}

async function seedDefaultWorkspaceFolder(workspaceId: string) {
  if (!supabase) {
    return {
      folders: demoWorkspaceFolders,
      checklists: demoFolderChecklists,
      items: demoFolderChecklistItems,
      sections: [],
    };
  }

  const folderResult = await supabase
    .from('workspace_folders')
    .upsert(
      [
        {
          workspace_id: workspaceId,
          name: 'Planejamento de Viagem',
          description: 'Programacao de viagem, destinos e arquivos compartilhados.',
          position: 1,
        },
        {
          workspace_id: workspaceId,
          name: 'Filmes para assistir',
          description: 'Lista colaborativa de filmes e series.',
          position: 2,
        },
        {
          workspace_id: workspaceId,
          name: 'Lista de Compras',
          description: 'Itens de mercado, casa e compras recorrentes.',
          position: 3,
        },
      ],
      { onConflict: 'workspace_id,name' },
    )
    .select('*');

  if (folderResult.error || !folderResult.data?.length) {
    Alert.alert('Erro ao criar pastas iniciais', folderResult.error?.message ?? 'Sem retorno do Supabase.');
    return { folders: [], checklists: [], items: [], sections: [] };
  }

  await Promise.all(folderResult.data.map((folder) => createStarterFolderContent(folder)));

  const folderIds = folderResult.data.map((folder) => folder.id);
  const checklistResult = await supabase
    .from('folder_checklists')
    .select('*')
    .in('folder_id', folderIds)
    .order('position');

  const checklistIds = (checklistResult.data ?? []).map((checklist) => checklist.id);
  const itemResult = checklistIds.length
    ? await supabase.from('folder_checklist_items').select('*').in('checklist_id', checklistIds).order('position')
    : { data: [] as FolderChecklistItem[] };

  return {
    folders: folderResult.data,
    checklists: checklistResult.data ?? [],
    items: itemResult.data ?? [],
    sections: [],
  };
}

async function createStarterFolderContent(folder: WorkspaceFolder) {
  if (!supabase) {
    return;
  }

  const checklistResult = await supabase
    .from('folder_checklists')
    .upsert(
      {
        folder_id: folder.id,
        title: getStarterChecklistTitle(folder.name),
        position: 1,
      },
      { onConflict: 'folder_id,title' },
    )
    .select('*')
    .single();

  if (!checklistResult.error && checklistResult.data) {
    const starterItems = getStarterChecklistItems(folder.name);
    if (starterItems.length) {
      await supabase.from('folder_checklist_items').upsert(
        starterItems.map((title, index) => ({
          checklist_id: checklistResult.data.id,
          title,
          is_done: false,
          position: index + 1,
        })),
        { onConflict: 'checklist_id,title' },
      );
    }
  }
}

function getStarterChecklistTitle(folderName: string) {
  return 'Checklist';
}

function getStarterChecklistItems(folderName: string) {
  const normalizedName = folderName.toLocaleLowerCase();
  if (normalizedName.includes('filme')) {
    return ['Assistir Interestelar'];
  }
  if (normalizedName.includes('compra')) {
    return ['Cafe', 'Frutas'];
  }
  if (normalizedName.includes('viagem')) {
    return ['Reservar passagens para Toquio', 'Definir roteiro em Quioto'];
  }
  return [];
}

function isImageFile(file: FolderFile) {
  return file.mime_type?.startsWith('image/') ?? /\.(png|jpg|jpeg|webp)$/i.test(file.name);
}

function formatBytes(value: number | null) {
  if (!value) {
    return 'Tamanho desconhecido';
  }
  if (value < 1024 * 1024) {
    return `${Math.round(value / 1024)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRelativeTime(value: string) {
  const diffMinutes = Math.max(0, Math.round((Date.now() - dateValue(value)) / 60000));
  if (diffMinutes < 1) {
    return 'Agora';
  }
  if (diffMinutes < 60) {
    return `Ha ${diffMinutes} min`;
  }
  return `Ha ${Math.round(diffMinutes / 60)} h`;
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
  safe: {
    backgroundColor: colors.background,
    flex: 1,
  },
  centered: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
  },
  flex: {
    flex: 1,
  },
  authContent: {
    gap: spacing.xl,
    padding: spacing.xl,
  },
  loadingDot: {
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  homeStack: {
    gap: spacing.xl,
  },
  tasksScreen: {
    gap: spacing.xl,
  },
  profileScreen: {
    gap: spacing.xl,
  },
  brandHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  brandLeft: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  avatarText: {
    color: colors.primary,
    fontFamily: fontFamily.black,
    fontSize: typography.body,
    fontWeight: '900',
  },
  brandName: {
    color: colors.primary,
    fontFamily: fontFamily.black,
    fontSize: 18,
    fontWeight: '900',
  },
  profileHero: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  profileAvatar: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
    borderRadius: 32,
    borderWidth: 1,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  profileTitle: {
    color: colors.text,
    fontFamily: fontFamily.black,
    fontSize: typography.title,
    fontWeight: '900',
  },
  profileNameRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  profileName: {
    color: colors.text,
    fontFamily: fontFamily.extraBold,
    fontSize: typography.subtitle,
    fontWeight: '800',
  },
  editNameButton: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  profileLogoutButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  profileModalActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'flex-end',
    marginTop: spacing.sm,
  },
  profileNameModalContent: {
    gap: spacing.xl,
  },
  folderModalActions: {
    marginTop: spacing.sm,
  },
  folderModalContent: {
    gap: spacing.xl,
  },
  themeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  themeOption: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    minHeight: 86,
    padding: spacing.md,
    width: 104,
  },
  themeOptionActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  themeSwatchWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 30,
    justifyContent: 'center',
    width: 48,
  },
  themeSwatch: {
    borderColor: colors.surface,
    borderRadius: 15,
    borderWidth: 2,
    height: 30,
    width: 30,
    zIndex: 2,
  },
  themeSoftSwatch: {
    borderColor: colors.surface,
    borderRadius: 12,
    borderWidth: 2,
    height: 24,
    marginLeft: -8,
    width: 24,
  },
  themeOptionText: {
    color: colors.muted,
    fontFamily: fontFamily.bold,
    fontSize: typography.small,
    fontWeight: '700',
    textAlign: 'center',
  },
  themeOptionTextActive: {
    color: colors.primary,
  },
  backButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  heroBlock: {
    gap: spacing.md,
    paddingTop: spacing.xl,
  },
  heroTitle: {
    color: colors.text,
    fontFamily: fontFamily.black,
    fontSize: typography.hero,
    fontWeight: '900',
    lineHeight: 46,
  },
  heroCopy: {
    color: colors.muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.body,
    lineHeight: 23,
  },
  tasksGreetingCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.xl,
  },
  tasksGreetingTitle: {
    color: colors.text,
    fontFamily: fontFamily.black,
    fontSize: 36,
    fontWeight: '900',
    lineHeight: 42,
  },
  tasksGreetingCopy: {
    color: colors.muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.body,
    lineHeight: 23,
  },
  productivityCard: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    gap: spacing.xs,
    padding: spacing.xl,
  },
  productivityLabel: {
    color: colors.surface,
    fontFamily: fontFamily.black,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0,
    opacity: 0.88,
  },
  productivityIcon: {
    color: colors.surface,
    fontFamily: fontFamily.black,
    fontSize: 24,
    fontWeight: '900',
  },
  productivityValue: {
    color: colors.surface,
    fontFamily: fontFamily.black,
    fontSize: 40,
    fontWeight: '900',
  },
  productivityCopy: {
    color: colors.surface,
    fontFamily: fontFamily.bold,
    fontSize: 12,
    fontWeight: '700',
    opacity: 0.82,
  },
  taskCategoryBlock: {
    gap: spacing.md,
  },
  taskCategoryHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  taskCategoryTitleWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  taskCategoryIcon: {
    color: colors.primary,
    fontFamily: fontFamily.black,
    fontSize: typography.body,
    fontWeight: '900',
    width: 22,
  },
  taskCategoryTitle: {
    color: colors.text,
    fontFamily: fontFamily.black,
    fontSize: 22,
    fontWeight: '900',
  },
  taskCountBadge: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  taskCountText: {
    color: colors.muted,
    fontFamily: fontFamily.extraBold,
    fontSize: typography.small,
    fontWeight: '800',
  },
  compactTaskCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 78,
    padding: spacing.lg,
  },
  compactTaskCardDone: {
    opacity: 0.72,
  },
  compactTaskCircle: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 2,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  compactTaskCircleDone: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  compactTaskCircleText: {
    color: colors.surface,
    fontFamily: fontFamily.black,
    fontSize: typography.small,
    fontWeight: '900',
  },
  compactTaskMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  compactTaskTime: {
    color: colors.muted,
    fontFamily: fontFamily.extraBold,
    fontSize: typography.small,
    fontWeight: '800',
  },
  compactTaskTitle: {
    color: colors.text,
    fontFamily: fontFamily.bold,
    fontSize: typography.body,
    fontWeight: '700',
  },
  compactTaskMenu: {
    color: colors.muted,
    fontFamily: fontFamily.black,
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 26,
  },
  compactTaskMenuButton: {
    alignItems: 'center',
    borderRadius: 18,
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
    width: 36,
  },
  taskInputBar: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 28,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 58,
    paddingHorizontal: spacing.lg,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  taskInputPlus: {
    color: colors.text,
    fontFamily: fontFamily.regular,
    fontSize: 26,
    lineHeight: 28,
  },
  taskInputPlaceholder: {
    color: colors.muted,
    fontFamily: fontFamily.regular,
    flex: 1,
    fontSize: typography.body,
  },
  taskInputIcon: {
    color: colors.muted,
    fontFamily: fontFamily.black,
    fontSize: 18,
    fontWeight: '900',
  },
  taskSaveButton: {
    backgroundColor: colors.primary,
    borderRadius: 22,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  taskSaveText: {
    color: colors.surface,
    fontFamily: fontFamily.black,
    fontSize: typography.small,
    fontWeight: '900',
  },
  notesScreen: {
    gap: spacing.xl,
  },
  notesBreadcrumb: {
    color: colors.muted,
    fontFamily: fontFamily.black,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0,
    marginBottom: spacing.xs,
  },
  notesTitle: {
    color: colors.text,
    fontFamily: fontFamily.black,
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 36,
  },
  folderDetailHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
  },
  folderBackIconButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 17,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    marginTop: spacing.xs,
    width: 34,
  },
  presenceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  presenceAvatar: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
    borderRadius: 14,
    borderWidth: 1,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  presenceAvatarAlt: {
    alignItems: 'center',
    backgroundColor: colors.successSoft,
    borderColor: colors.success,
    borderRadius: 14,
    borderWidth: 1,
    height: 28,
    justifyContent: 'center',
    marginLeft: -8,
    width: 28,
  },
  presenceAvatarText: {
    color: colors.text,
    fontFamily: fontFamily.black,
    fontSize: 11,
    fontWeight: '900',
  },
  presenceMore: {
    color: colors.text,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 12,
    fontFamily: fontFamily.black,
    fontSize: 11,
    fontWeight: '900',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  editingText: {
    color: colors.success,
    fontFamily: fontFamily.extraBold,
    fontSize: typography.small,
    fontWeight: '800',
  },
  memberRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 48,
  },
  pendingMemberAvatar: {
    alignItems: 'center',
    backgroundColor: colors.warningSoft,
    borderColor: colors.warning,
    borderRadius: 15,
    borderWidth: 1,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  notesActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  assistantHeroButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 104,
    padding: spacing.xl,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
  },
  assistantIconWrap: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderColor: 'rgba(255,255,255,0.34)',
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  assistantHeroTitle: {
    color: colors.surface,
    fontFamily: fontFamily.black,
    fontSize: 20,
    fontWeight: '900',
  },
  assistantHeroCopy: {
    color: colors.surface,
    fontFamily: fontFamily.medium,
    fontSize: typography.small,
    fontWeight: '500',
    lineHeight: 18,
    marginTop: spacing.xs,
    opacity: 0.88,
  },
  assistantPromptCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  assistantPromptTitle: {
    color: colors.text,
    fontFamily: fontFamily.black,
    fontSize: 18,
    fontWeight: '900',
  },
  assistantPromptCopy: {
    color: colors.muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.small,
    lineHeight: 18,
  },
  assistantPromptField: {
    minHeight: 132,
  },
  notesActionButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 22,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  notesInviteButton: {
    backgroundColor: colors.primary,
  },
  notesActionText: {
    color: colors.primary,
    fontFamily: fontFamily.black,
    fontSize: typography.small,
    fontWeight: '900',
  },
  notesInviteText: {
    color: colors.surface,
  },
  folderTabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  folderTab: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 18,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  activeFolderTab: {
    backgroundColor: colors.primary,
  },
  folderTabText: {
    color: colors.muted,
    fontFamily: fontFamily.extraBold,
    fontSize: typography.small,
    fontWeight: '800',
  },
  activeFolderTabText: {
    color: colors.surface,
  },
  addFolderButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySoft,
    borderRadius: 18,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  addFolderText: {
    color: colors.primary,
    fontFamily: fontFamily.black,
    fontSize: typography.small,
    fontWeight: '900',
  },
  planFolderGrid: {
    gap: spacing.md,
  },
  planFolderCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 104,
    overflow: 'hidden',
    padding: spacing.lg,
  },
  receivedInviteCard: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.md,
    minHeight: 72,
    padding: spacing.md,
  },
  receivedInviteSummary: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 48,
  },
  receivedInviteActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'flex-end',
  },
  planFolderOpenArea: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 72,
  },
  planFolderIcon: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
    borderRadius: 20,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  planFolderTitle: {
    color: colors.text,
    fontFamily: fontFamily.black,
    fontSize: typography.body,
    fontWeight: '900',
  },
  planFolderDescription: {
    color: colors.muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.small,
    lineHeight: 18,
    marginTop: spacing.xs,
  },
  planFolderMeta: {
    color: colors.primary,
    fontFamily: fontFamily.extraBold,
    fontSize: typography.small,
    fontWeight: '800',
    marginTop: spacing.sm,
  },
  planFolderDeleteButton: {
    alignItems: 'center',
    backgroundColor: colors.dangerSoft,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  planFolderDeleteText: {
    color: colors.danger,
    fontFamily: fontFamily.black,
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 20,
  },
  noteContentCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.xl,
  },
  smartSectionStack: {
    gap: spacing.md,
  },
  sectionTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  noteMediaCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    overflow: 'hidden',
    padding: spacing.lg,
  },
  noteCardTitle: {
    color: colors.text,
    fontFamily: fontFamily.black,
    fontSize: 18,
    fontWeight: '900',
  },
  noteEyebrow: {
    color: colors.muted,
    fontFamily: fontFamily.black,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0,
  },
  folderChecklistRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 40,
  },
  folderCheckboxButton: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 3,
    borderWidth: 2,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  folderCheckbox: {
    color: colors.primary,
    borderColor: colors.border,
    borderRadius: 3,
    borderWidth: 2,
    fontFamily: fontFamily.black,
    fontSize: 11,
    fontWeight: '900',
    height: 18,
    lineHeight: 15,
    textAlign: 'center',
    width: 18,
  },
  folderCheckboxDone: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  folderChecklistEditArea: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 40,
  },
  folderChecklistText: {
    color: colors.text,
    fontFamily: fontFamily.regular,
    flex: 1,
    fontSize: typography.body,
  },
  assignedBadge: {
    color: colors.surface,
    backgroundColor: colors.success,
    borderRadius: 4,
    fontFamily: fontFamily.black,
    fontSize: 10,
    fontWeight: '900',
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  mapPlaceholder: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    gap: spacing.sm,
    minHeight: 128,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  mapPin: {
    color: colors.primary,
    fontFamily: fontFamily.black,
    fontSize: 42,
    fontWeight: '900',
    lineHeight: 44,
  },
  mapText: {
    color: colors.text,
    fontFamily: fontFamily.semiBold,
    fontSize: typography.small,
    fontWeight: '600',
    lineHeight: 19,
    textAlign: 'center',
  },
  budgetPlaceholder: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 120,
  },
  budgetValue: {
    color: colors.primary,
    fontFamily: fontFamily.black,
    fontSize: 24,
    fontWeight: '900',
  },
  budgetCopy: {
    color: colors.muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.small,
  },
  noteBody: {
    color: colors.text,
    fontFamily: fontFamily.regular,
    fontSize: typography.body,
    lineHeight: 23,
  },
  noteEntry: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  noteEntryHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  fileRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 40,
  },
  fileIcon: {
    color: colors.primary,
    fontFamily: fontFamily.black,
    fontSize: typography.body,
    fontWeight: '900',
    width: 22,
  },
  fileName: {
    color: colors.text,
    fontFamily: fontFamily.extraBold,
    fontSize: typography.body,
    fontWeight: '800',
  },
  fileMeta: {
    color: colors.muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.small,
  },
  commentRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  commentAvatar: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  commentAvatarText: {
    color: colors.text,
    fontFamily: fontFamily.black,
    fontSize: 11,
    fontWeight: '900',
  },
  commentAuthor: {
    color: colors.text,
    fontFamily: fontFamily.black,
    fontSize: typography.small,
    fontWeight: '900',
  },
  commentBody: {
    color: colors.text,
    fontFamily: fontFamily.regular,
    fontSize: typography.small,
    lineHeight: 18,
  },
  commentTime: {
    color: colors.muted,
    fontFamily: fontFamily.regular,
    fontSize: 11,
    marginTop: spacing.xs,
  },
  dashboardCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.xl,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
  },
  dashboardTitle: {
    color: colors.text,
    fontFamily: fontFamily.black,
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
  },
  progressRing: {
    alignItems: 'center',
    alignSelf: 'center',
    borderColor: colors.primary,
    borderRadius: 72,
    borderWidth: 10,
    height: 144,
    justifyContent: 'center',
    width: 144,
  },
  progressRingInner: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.surfaceMuted,
    borderRadius: 54,
    borderWidth: 1,
    height: 108,
    justifyContent: 'center',
    width: 108,
  },
  progressPercent: {
    color: colors.primary,
    fontFamily: fontFamily.black,
    fontSize: 36,
    fontWeight: '900',
  },
  progressLabel: {
    color: colors.muted,
    fontFamily: fontFamily.black,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0,
  },
  progressSummary: {
    color: colors.muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.small,
    textAlign: 'center',
  },
  linkText: {
    color: colors.primary,
    fontFamily: fontFamily.black,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0,
  },
  emptyTodayCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    gap: spacing.xs,
    padding: spacing.lg,
  },
  priorityCard: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 78,
    padding: spacing.md,
  },
  priorityCircle: {
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 2,
    height: 20,
    width: 20,
  },
  priorityTitle: {
    color: colors.text,
    fontFamily: fontFamily.semiBold,
    fontSize: typography.body,
    fontWeight: '600',
  },
  priorityMeta: {
    color: colors.muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.small,
    marginTop: spacing.xs,
  },
  priorityBadge: {
    borderRadius: 14,
    minWidth: 58,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  priorityBadgeHigh: {
    backgroundColor: colors.dangerSoft,
  },
  priorityBadgeMedium: {
    backgroundColor: colors.primarySoft,
  },
  priorityBadgeLow: {
    backgroundColor: colors.successSoft,
  },
  priorityBadgeText: {
    color: colors.text,
    fontFamily: fontFamily.black,
    fontSize: 10,
    fontWeight: '900',
    textAlign: 'center',
  },
  insightCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.xl,
  },
  insightTitle: {
    color: colors.text,
    fontFamily: fontFamily.black,
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 34,
  },
  insightCopy: {
    color: colors.muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.body,
    lineHeight: 23,
  },
  mutedText: {
    color: colors.muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.small,
  },
  lead: {
    color: colors.muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.body,
    lineHeight: 22,
    marginTop: spacing.xs,
  },
  bottomNav: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'space-between',
    minHeight: 78,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  navItem: {
    alignItems: 'center',
    borderRadius: 24,
    flex: 1,
    gap: spacing.xs,
    minHeight: 56,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  activeNavItem: {
    backgroundColor: colors.primary,
  },
  navLabel: {
    color: colors.muted,
    fontFamily: fontFamily.bold,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  activeNavText: {
    color: colors.surface,
  },
  fab: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 24,
    bottom: 98,
    elevation: 4,
    height: 48,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.xl,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    width: 48,
    zIndex: 5,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 132,
  },
  stack: {
    gap: spacing.lg,
  },
  segmented: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  segment: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  activeSegment: {
    backgroundColor: colors.primarySoft,
  },
  segmentText: {
    color: colors.muted,
    fontFamily: fontFamily.bold,
    fontSize: typography.small,
    fontWeight: '700',
  },
  activeSegmentText: {
    color: colors.primary,
  },
  notificationPresetGrid: {
    gap: spacing.sm,
  },
  notificationPreset: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 62,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  notificationPresetActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  notificationPresetTitle: {
    color: colors.text,
    fontFamily: fontFamily.extraBold,
    fontSize: typography.small,
    fontWeight: '800',
  },
  notificationPresetTitleActive: {
    color: colors.primary,
  },
  notificationPresetDescription: {
    color: colors.muted,
    fontFamily: fontFamily.regular,
    fontSize: 11,
    lineHeight: 15,
    marginTop: spacing.xs,
  },
  customNotificationPanel: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  customNotificationRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  customNotificationValueField: {
    flex: 1,
    minWidth: 90,
  },
  disabledPanel: {
    opacity: 0.55,
  },
  itemBlock: {
    borderColor: colors.border,
    borderTopWidth: 1,
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  itemTitle: {
    color: colors.text,
    fontFamily: fontFamily.extraBold,
    flexShrink: 1,
    fontSize: typography.body,
    fontWeight: '800',
  },
  rowBetween: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  checkRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 34,
  },
  checkbox: {
    color: colors.primary,
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    fontFamily: fontFamily.black,
    fontSize: typography.body,
    fontWeight: '900',
    height: 24,
    lineHeight: 22,
    textAlign: 'center',
    width: 24,
  },
  checkboxDone: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    color: colors.surface,
  },
  checkText: {
    color: colors.text,
    fontFamily: fontFamily.regular,
    flex: 1,
    fontSize: typography.body,
  },
  doneText: {
    color: colors.muted,
    textDecorationLine: 'line-through',
  },
  inlineForm: {
    gap: spacing.sm,
  },
  modalOverlay: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    flex: 1,
    justifyContent: 'flex-end',
    paddingTop: spacing.xl,
  },
  modalKeyboardAvoiding: {
    flex: 1,
  },
  modalSheet: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    maxHeight: '88%',
    padding: spacing.xl,
  },
  modalSheetContent: {
    gap: spacing.lg,
    paddingBottom: spacing.xl * 4,
  },
  modalTitle: {
    color: colors.text,
    fontFamily: fontFamily.black,
    fontSize: typography.subtitle,
    fontWeight: '900',
  },
  modalClose: {
    color: colors.muted,
    fontFamily: fontFamily.black,
    fontSize: 24,
    fontWeight: '900',
    paddingHorizontal: spacing.sm,
  },
  modalLabel: {
    color: colors.text,
    fontFamily: fontFamily.black,
    fontSize: typography.small,
    fontWeight: '900',
  },
  modalFieldGroup: {
    gap: spacing.sm,
  },
  duePickerBox: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    marginTop: spacing.sm,
    padding: spacing.md,
  },
  duePickerBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  duePickerFloatingBox: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    maxWidth: 360,
    padding: spacing.md,
    width: '100%',
  },
  duePickerHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  duePickerTitle: {
    color: colors.text,
    fontFamily: fontFamily.extraBold,
    fontSize: typography.small,
    fontWeight: '800',
  },
  duePickerClose: {
    color: colors.muted,
    fontFamily: fontFamily.black,
    fontSize: 20,
    fontWeight: '900',
    paddingHorizontal: spacing.xs,
  },
  taskDetailKeyboardAvoiding: {
    flex: 1,
  },
  taskDetailSafe: {
    backgroundColor: colors.background,
    flex: 1,
  },
  taskDetailContent: {
    gap: spacing.xl,
    padding: spacing.xl,
    paddingBottom: spacing.xl * 5,
  },
  taskDetailEyebrow: {
    color: colors.muted,
    fontFamily: fontFamily.black,
    fontSize: typography.small,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  taskDetailHeader: {
    gap: spacing.md,
  },
  taskDetailTitle: {
    color: colors.text,
    fontFamily: fontFamily.black,
    fontSize: 32,
    fontWeight: '900',
    lineHeight: 38,
  },
  taskDetailDescription: {
    color: colors.text,
    fontFamily: fontFamily.regular,
    fontSize: typography.body,
    lineHeight: 23,
  },
  taskDetailSection: {
    borderColor: colors.border,
    borderTopWidth: 1,
    gap: spacing.md,
    paddingTop: spacing.lg,
  },
  taskDetailProgress: {
    color: colors.primary,
    fontFamily: fontFamily.black,
    fontSize: typography.small,
    fontWeight: '900',
  },
  taskDetailCheckRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  textAreaField: {
    minHeight: 92,
  },
  dueSummary: {
    color: colors.muted,
    fontFamily: fontFamily.bold,
    fontSize: typography.small,
    fontWeight: '700',
  },
  draftChecklistRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  removeText: {
    color: colors.danger,
    fontFamily: fontFamily.extraBold,
    fontSize: typography.small,
    fontWeight: '800',
  },
  calendarScreen: {
    gap: spacing.xl,
  },
  calendarCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.xl,
  },
  calendarHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  calendarTitle: {
    color: colors.text,
    fontFamily: fontFamily.black,
    fontSize: 24,
    fontWeight: '900',
  },
  calendarSubtitle: {
    color: colors.muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.small,
    marginTop: spacing.xs,
  },
  calendarNav: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  calendarNavButton: {
    alignItems: 'center',
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  calendarNavText: {
    color: colors.primary,
    fontFamily: fontFamily.black,
    fontSize: 24,
    fontWeight: '900',
  },
  weekdayRow: {
    flexDirection: 'row',
  },
  weekdayText: {
    color: colors.muted,
    fontFamily: fontFamily.black,
    flex: 1,
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'center',
  },
  weekendText: {
    color: colors.danger,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: spacing.sm,
  },
  calendarDayCell: {
    alignItems: 'center',
    borderRadius: radius.md,
    height: 44,
    justifyContent: 'center',
    width: `${100 / 7}%`,
  },
  selectedCalendarDay: {
    backgroundColor: colors.primary,
  },
  calendarDayText: {
    color: colors.text,
    fontFamily: fontFamily.extraBold,
    fontSize: typography.body,
    fontWeight: '800',
  },
  calendarDayMuted: {
    color: colors.border,
  },
  selectedCalendarDayText: {
    color: colors.surface,
  },
  eventDot: {
    backgroundColor: colors.primary,
    borderRadius: 2,
    height: 4,
    marginTop: 3,
    width: 4,
  },
  selectedEventDot: {
    backgroundColor: colors.surface,
  },
  metricGrid: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  metricCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 96,
    padding: spacing.lg,
  },
  metricIcon: {
    alignItems: 'center',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  metricIconGreen: {
    backgroundColor: colors.successSoft,
  },
  metricIconRed: {
    backgroundColor: colors.dangerSoft,
  },
  metricIconText: {
    color: colors.surface,
    fontFamily: fontFamily.black,
    fontSize: typography.small,
    fontWeight: '900',
  },
  metricTitle: {
    color: colors.text,
    fontFamily: fontFamily.extraBold,
    fontSize: typography.small,
    fontWeight: '800',
    lineHeight: 16,
  },
  metricValue: {
    color: colors.text,
    fontFamily: fontFamily.black,
    fontSize: 22,
    fontWeight: '900',
  },
  scheduleHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  scheduleTitle: {
    color: colors.text,
    fontFamily: fontFamily.black,
    fontSize: 22,
    fontWeight: '900',
  },
  scheduleDateBadge: {
    color: colors.primary,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 6,
    fontFamily: fontFamily.black,
    fontSize: typography.small,
    fontWeight: '900',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  timeline: {
    gap: spacing.md,
  },
  timelineRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  timelineTime: {
    color: colors.muted,
    fontFamily: fontFamily.extraBold,
    fontSize: typography.small,
    fontWeight: '800',
    paddingTop: spacing.lg,
    width: 48,
  },
  timelineCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flex: 1,
    gap: spacing.sm,
    minHeight: 104,
    padding: spacing.lg,
  },
  timelineCardActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  timelineCardDone: {
    opacity: 0.68,
  },
  timelineCardTitle: {
    color: colors.text,
    fontFamily: fontFamily.black,
    fontSize: typography.body,
    fontWeight: '900',
  },
  timelineCardText: {
    color: colors.muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.small,
    lineHeight: 18,
  },
  timelineCardActiveText: {
    color: colors.surface,
  },
  timelineMeta: {
    color: colors.muted,
    fontFamily: fontFamily.black,
    fontSize: 12,
    fontWeight: '900',
  },
  reminderBanner: {
    alignItems: 'center',
    backgroundColor: colors.dangerSoft,
    borderColor: colors.danger,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
  },
  reminderIcon: {
    color: colors.danger,
    fontFamily: fontFamily.black,
    fontSize: 22,
    fontWeight: '900',
    width: 28,
  },
  reminderTitle: {
    color: colors.text,
    fontFamily: fontFamily.black,
    fontSize: typography.body,
    fontWeight: '900',
  },
  reminderText: {
    color: colors.muted,
    fontFamily: fontFamily.extraBold,
    fontSize: typography.small,
    fontWeight: '800',
  },
  reminderCheck: {
    color: colors.danger,
    fontFamily: fontFamily.black,
    fontSize: 18,
    fontWeight: '900',
  },
  calendarAccountCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
  },
  pressed: {
    opacity: 0.78,
  },
  });
}
