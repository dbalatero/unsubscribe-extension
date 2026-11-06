import type { Reply } from './model';
import { STORAGE_KEY } from './service';

export const REMINDER_ALARM = 'monday-review';
export const REMINDER_ID = 'unsubscribe-review';
export const REMINDER_WEEK_KEY = 'reminder.lastWeek';

// Use calendar arithmetic so 9 a.m. remains local across daylight-saving changes.
export function mondayAtNine(now: Date): Date {
  const monday = new Date(now);
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  monday.setHours(9, 0, 0, 0);
  return monday;
}

export function reminderWeek(now: Date): string {
  const monday = mondayAtNine(now);
  if (monday > now) monday.setDate(monday.getDate() - 7);
  return `${monday.getFullYear()}-${monday.getMonth() + 1}-${monday.getDate()}`;
}

export function nextReminder(now: Date): number {
  const monday = mondayAtNine(now);
  if (monday <= now) monday.setDate(monday.getDate() + 7);
  return monday.getTime();
}

export function installReminders(list: () => Promise<Reply>): void {
  // Startup, storage and alarm events may arrive together. Serialize them so only
  // one notification can be created before this week's marker is persisted.
  let queue = Promise.resolve();
  const refresh = () => {
    queue = queue.then(async () => {
      const now = new Date();
      // Recreate on worker startup: Chrome may clear alarms on browser updates.
      await chrome.alarms.create(REMINDER_ALARM, { when: nextReminder(now) });
      const reply = await list();
      if (!reply.ok) throw new Error(reply.error);
      const count = reply.entries.filter(entry => entry.status === 'pending').length;
      await chrome.action.setBadgeBackgroundColor({ color: '#284d36' });
      await chrome.action.setBadgeText({ text: count ? String(count) : '' });
      await chrome.action.setTitle({ title: `Unsubscribe Collector: ${count} to review` });
      if (!count) {
        await chrome.notifications.clear(REMINDER_ID);
        return;
      }
      const week = reminderWeek(now);
      const stored = await chrome.storage.local.get(REMINDER_WEEK_KEY);
      if (stored[REMINDER_WEEK_KEY] === week) return;
      await chrome.notifications.create(REMINDER_ID, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icon.png'),
        title: 'Time to clear out your unsubscribe list',
        message: `${count} sender${count === 1 ? '' : 's'} waiting for review. Click to keep your favorites and clear out the rest.`,
      });
      await chrome.storage.local.set({ [REMINDER_WEEK_KEY]: week });
    }).catch(() => console.warn('Unsubscribe Collector could not update its badge or reminder. It will retry on the next wake or queue change.'));
  };
  chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === REMINDER_ALARM) refresh();
  });
  chrome.runtime.onStartup.addListener(refresh);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && STORAGE_KEY in changes) refresh();
  });
  chrome.notifications.onClicked.addListener(id => {
    if (id === REMINDER_ID) {
      void chrome.runtime.openOptionsPage().then(() => chrome.notifications.clear(id)).catch(() => {
        console.warn('Unsubscribe Collector could not open review. Click the extension icon to review senders.');
      });
    }
  });
  refresh();
}
