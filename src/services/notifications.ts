import * as Notifications from 'expo-notifications';

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
