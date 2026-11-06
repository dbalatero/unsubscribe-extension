import { afterEach, expect, it, vi } from 'vitest';
import { installReminders, mondayAtNine, nextReminder, reminderWeek, REMINDER_ALARM, REMINDER_ID, REMINDER_WEEK_KEY } from '../src/reminders';
import { STORAGE_KEY } from '../src/service';
import { entry } from './fixtures';

const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
function setup(entries = [entry]) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 9, 10));
  const stored: Record<string, unknown> = {};
  const alarm = vi.fn();
  const startup = vi.fn();
  const change = vi.fn();
  const clicked = vi.fn();
  const api = {
    alarms: { create: vi.fn().mockResolvedValue(undefined), onAlarm: { addListener: alarm } },
    action: { setBadgeText: vi.fn().mockResolvedValue(undefined), setBadgeBackgroundColor: vi.fn().mockResolvedValue(undefined), setTitle: vi.fn().mockResolvedValue(undefined) },
    notifications: { create: vi.fn().mockResolvedValue(REMINDER_ID), clear: vi.fn().mockResolvedValue(true), onClicked: { addListener: clicked } },
    runtime: { getURL: (path: string) => `chrome-extension://test/${path}`, openOptionsPage: vi.fn().mockResolvedValue(undefined), onStartup: { addListener: startup } },
    storage: { local: { get: vi.fn(async () => ({ ...stored })), set: vi.fn(async values => { Object.assign(stored, values); }) }, onChanged: { addListener: change } },
  };
  vi.stubGlobal('chrome', api);
  const list = vi.fn().mockResolvedValue({ ok: true, entries });
  return { api, list, stored, alarm, startup, change, clicked, start: () => installReminders(list) };
}
it('schedules local Monday at 9, including year and daylight-saving boundaries', () => {
  expect(mondayAtNine(new Date(2026, 10, 11, 14))).toEqual(new Date(2026, 10, 9, 9));
  expect(nextReminder(new Date(2026, 10, 9, 8, 59))).toBe(new Date(2026, 10, 9, 9).getTime());
  expect(nextReminder(new Date(2026, 10, 9, 9))).toBe(new Date(2026, 10, 16, 9).getTime());
  expect(nextReminder(new Date(2026, 11, 31))).toBe(new Date(2027, 0, 4, 9).getTime());
  expect(nextReminder(new Date(2026, 2, 7, 12))).toBe(new Date(2026, 2, 9, 9).getTime());
  expect(nextReminder(new Date(2026, 9, 31, 12))).toBe(new Date(2026, 10, 2, 9).getTime());
  expect(reminderWeek(new Date(2026, 10, 9, 8, 59))).toBe('2026-11-2');
  expect(reminderWeek(new Date(2026, 10, 9, 9))).toBe('2026-11-9');
  expect(reminderWeek(new Date(2027, 0, 1))).toBe('2026-12-28');
});
it('updates the badge and catches up once after Monday, including concurrent startup events', async () => {
  const t = setup();
  t.start();
  t.startup.mock.calls[0][0]();
  t.alarm.mock.calls[0][0]({ name: REMINDER_ALARM });
  await flush();
  expect(t.api.action.setBadgeText).toHaveBeenLastCalledWith({ text: '1' });
  expect(t.api.action.setTitle).toHaveBeenLastCalledWith({ title: 'Unsubscribe Collector: 1 to review' });
  expect(t.api.notifications.create).toHaveBeenCalledExactlyOnceWith(REMINDER_ID, expect.objectContaining({ iconUrl: 'chrome-extension://test/icon.png', message: expect.stringContaining('1 sender waiting') }));
  expect(t.stored[REMINDER_WEEK_KEY]).toBe('2026-11-9');
  // A new worker, after reboot several days later, uses the same persisted marker.
  vi.setSystemTime(new Date(2026, 10, 12, 12));
  t.start();
  await flush();
  expect(t.api.notifications.create).toHaveBeenCalledTimes(1);
  // A delayed alarm after sleeping through the following Monday catches up Tuesday.
  vi.setSystemTime(new Date(2026, 10, 17, 12));
  t.alarm.mock.calls[1][0]({ name: REMINDER_ALARM });
  await flush();
  expect(t.api.notifications.create).toHaveBeenCalledTimes(2);
  expect(t.stored[REMINDER_WEEK_KEY]).toBe('2026-11-16');
  expect(t.api.alarms.create).toHaveBeenLastCalledWith(REMINDER_ALARM, { when: new Date(2026, 10, 23, 9).getTime() });
});
it('counts only pending senders, clears an empty badge and does not consume an empty week', async () => {
  const t = setup([]);
  t.start();
  await flush();
  expect(t.api.action.setBadgeText).toHaveBeenLastCalledWith({ text: '' });
  expect(t.api.notifications.clear).toHaveBeenCalledWith(REMINDER_ID);
  expect(t.stored[REMINDER_WEEK_KEY]).toBeUndefined();
  t.list.mockResolvedValue({ ok: true, entries: [entry, entry, { ...entry, status: 'kept' }, { ...entry, status: 'opened' }] });
  t.change.mock.calls[0][0]({ [STORAGE_KEY]: {} }, 'local');
  await flush();
  expect(t.api.action.setBadgeText).toHaveBeenLastCalledWith({ text: '2' });
  expect(t.api.notifications.create).toHaveBeenCalledWith(REMINDER_ID, expect.objectContaining({ message: expect.stringContaining('2 senders waiting') }));
});
it('ignores unrelated events and opens the review page when its notification is clicked', async () => {
  const t = setup();
  t.start();
  await flush();
  const count = t.list.mock.calls.length;
  t.alarm.mock.calls[0][0]({ name: 'other' });
  t.change.mock.calls[0][0]({ [STORAGE_KEY]: {} }, 'sync');
  t.change.mock.calls[0][0]({ [REMINDER_WEEK_KEY]: {} }, 'local');
  t.clicked.mock.calls[0][0]('other');
  await flush();
  expect(t.list).toHaveBeenCalledTimes(count);
  expect(t.api.runtime.openOptionsPage).not.toHaveBeenCalled();
  t.clicked.mock.calls[0][0](REMINDER_ID);
  await flush();
  expect(t.api.runtime.openOptionsPage).toHaveBeenCalledOnce();
  expect(t.api.notifications.clear).toHaveBeenCalledWith(REMINDER_ID);
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  t.api.runtime.openOptionsPage.mockRejectedValueOnce(new Error('Unavailable'));
  t.clicked.mock.calls[0][0](REMINDER_ID);
  await flush();
  expect(warn).toHaveBeenCalledOnce();
});
it('does not mark failed notifications as delivered and retries after errors', async () => {
  const t = setup();
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  t.list.mockResolvedValueOnce({ ok: false, error: 'Storage unreadable' });
  t.start();
  await flush();
  expect(warn).toHaveBeenCalledOnce();
  t.api.notifications.create.mockRejectedValueOnce(new Error('Notification failed'));
  t.startup.mock.calls[0][0]();
  await flush();
  expect(t.stored[REMINDER_WEEK_KEY]).toBeUndefined();
  t.startup.mock.calls[0][0]();
  await flush();
  expect(t.stored[REMINDER_WEEK_KEY]).toBe('2026-11-9');
});
it('waits until 9 a.m. before starting a new reminder week', async () => {
  const t = setup();
  vi.setSystemTime(new Date(2026, 10, 9, 8));
  t.stored[REMINDER_WEEK_KEY] = '2026-11-2';
  t.start();
  await flush();
  expect(t.api.notifications.create).not.toHaveBeenCalled();
  vi.setSystemTime(new Date(2026, 10, 9, 9));
  t.alarm.mock.calls[0][0]({ name: REMINDER_ALARM });
  await flush();
  expect(t.api.notifications.create).toHaveBeenCalledOnce();
});
