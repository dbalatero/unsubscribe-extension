import { installReminders } from './reminders';
import { authorized, createService, STORAGE_KEY } from './service';

const handle = createService({
  read: async () => (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY],
  write: async (entries) => { await chrome.storage.local.set({ [STORAGE_KEY]: entries }); },
  open: async (urls) => { await chrome.windows.create({ url: urls, type: 'normal', focused: true }); },
});
chrome.runtime.onMessage.addListener((request: unknown, sender, respond) => {
  if (!authorized(request, sender, chrome.runtime.getURL('index.html'))) {
    respond({ ok: false, error: 'This request is not allowed.' });
    return false;
  }
  void handle(request).then(respond);
  return true;
});

installReminders(() => handle({ type: 'list' }));
