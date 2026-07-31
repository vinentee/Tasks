import * as Notifications from 'expo-notifications';

import type { TaskDeadlineNotificationRule } from '../types/domain';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function ensureNotificationPermission() {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) {
    return true;
  }

  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export async function scheduleLocalReminder(title: string, remindAtIso: string) {
  const remindAt = new Date(remindAtIso);

  if (Number.isNaN(remindAt.getTime()) || remindAt.getTime() <= Date.now()) {
    return null;
  }

  const granted = await ensureNotificationPermission();
  if (!granted) {
    return null;
  }

  return Notifications.scheduleNotificationAsync({
    content: {
      title: 'Lembrete',
      body: title,
      data: { kind: 'reminder' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: remindAt,
    },
  });
}

export async function cancelLocalReminder(notificationId: string | null) {
  if (!notificationId) {
    return;
  }

  await Notifications.cancelScheduledNotificationAsync(notificationId);
}

export type TaskDeadlineNotificationInput = Pick<
  TaskDeadlineNotificationRule,
  'mode' | 'start_minutes_before' | 'interval_minutes' | 'enabled'
>;

export function calculateDeadlineNotificationDates(
  dueAtIso: string | null,
  rule: TaskDeadlineNotificationInput | null,
  now = new Date(),
) {
  if (!dueAtIso || !rule?.enabled) {
    return [];
  }

  const dueAt = new Date(dueAtIso);
  if (Number.isNaN(dueAt.getTime()) || dueAt.getTime() <= now.getTime()) {
    return [];
  }

  if (rule.mode === 'once') {
    const remindAt = new Date(dueAt.getTime() - rule.start_minutes_before * 60 * 1000);
    return remindAt.getTime() > now.getTime() ? [remindAt] : [];
  }

  const intervalMinutes = rule.interval_minutes ?? rule.start_minutes_before;
  if (intervalMinutes <= 0) {
    return [];
  }

  const dates: Date[] = [];
  const firstReminderAt = new Date(dueAt.getTime() - rule.start_minutes_before * 60 * 1000);
  for (
    let reminderTime = firstReminderAt.getTime();
    reminderTime < dueAt.getTime();
    reminderTime += intervalMinutes * 60 * 1000
  ) {
    if (reminderTime > now.getTime()) {
      dates.push(new Date(reminderTime));
    }
  }

  return dates;
}

export async function scheduleTaskDeadlineNotifications(
  taskTitle: string,
  dueAtIso: string | null,
  rule: TaskDeadlineNotificationInput | null,
) {
  const dates = calculateDeadlineNotificationDates(dueAtIso, rule);
  if (!dates.length || !rule?.enabled) {
    return [];
  }

  const granted = await ensureNotificationPermission();
  if (!granted) {
    return [];
  }

  const dueAtLabel = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dueAtIso ?? ''));

  const notificationIds: string[] = [];
  for (const date of dates) {
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Prazo chegando',
        body: `${taskTitle} - prazo as ${dueAtLabel}`,
        data: { kind: 'task-deadline' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date,
      },
    });
    notificationIds.push(notificationId);
  }

  return notificationIds;
}

export async function cancelLocalReminders(notificationIds: string[] | null | undefined) {
  if (!notificationIds?.length) {
    return;
  }

  await Promise.all(
    notificationIds.map((notificationId) =>
      Notifications.cancelScheduledNotificationAsync(notificationId),
    ),
  );
}
