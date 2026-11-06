import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount } from '../src/ui';
import { createService } from '../src/service';
import { type Entry, type Reply, type Request } from '../src/model';
import { entry, pageUrl } from './fixtures';

let cleanup: Array<() => void> = [];
beforeEach(() => { HTMLElement.prototype.scrollIntoView = vi.fn(); });
afterEach(() => { cleanup.forEach(fn => fn()); cleanup = []; document.body.replaceChildren(); });
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
function click(text: string) {
  const button = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.startsWith(text));
  expect(button).toBeDefined();
  button!.click();
}
function key(value: string, options: KeyboardEventInit = {}, target: EventTarget = document) {
  const event = new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true, ...options });
  target.dispatchEvent(event);
  return event;
}
function setup(send = vi.fn<(request: Request) => Promise<Reply>>().mockResolvedValue({ ok: true, entries: [] })) {
  const root = document.createElement('main');
  document.body.append(root);
  const app = mount(root, send);
  cleanup.push(app.destroy);
  return { ...app, root, send };
}
const second = { ...entry, name: 'Second', key: 'domain:second.test', email: 'news@second.test' };
const third = { ...entry, name: 'Third', key: 'domain:third.test', email: 'news@third.test' };
function live(initial: Entry[]) {
  let data = structuredClone(initial);
  const open = vi.fn(async () => {});
  const service = createService({ read: async () => structuredClone(data), write: async entries => { data = structuredClone(entries); }, open });
  const send = vi.fn(service);
  return { ...setup(send), open, service };
}
const focused = () => document.querySelector<HTMLElement>('li.focused');
const rowNames = () => Array.from(document.querySelectorAll('.senders h2'), e => e.textContent);

it('sorts every list by sender name, keeping marked pending senders in their own alphabetical group', async () => {
  const { resume } = live([
    { ...third, name: 'zebra', toUnsubscribe: true },
    { ...second, name: 'Beta' },
    { ...entry, name: 'alpha' },
    { ...entry, key: 'domain:marked-a.test', email: 'news@marked-a.test', name: 'apple', toUnsubscribe: true },
    { ...third, key: 'domain:kept-z.test', email: 'news@kept-z.test', name: 'Zebra', status: 'kept' },
    { ...entry, key: 'domain:kept-a.test', email: 'news@kept-a.test', name: 'apple', status: 'kept' },
    { ...third, key: 'domain:opened-z.test', email: 'news@opened-z.test', name: 'Zebra', status: 'opened' },
    { ...entry, key: 'domain:opened-a.test', email: 'news@opened-a.test', name: 'apple', status: 'opened' },
  ]);
  await flush();
  expect(rowNames()).toEqual(['alpha', 'Beta', 'apple', 'zebra']);
  key('f'); await flush();
  expect(rowNames()).toEqual(['Beta', 'alpha', 'apple', 'zebra']);
  await resume();
  expect(rowNames()).toEqual(['Beta', 'alpha', 'apple', 'zebra']);
  click('Kept');
  expect(rowNames()).toEqual(['apple', 'Zebra']);
  click('Opened');
  expect(rowNames()).toEqual(['apple', 'Zebra']);
});

it('renders empty states, filters, and a disabled bulk action', async () => {
  const { root } = setup();
  await flush();
  expect(root.textContent).toContain('You’re all caught up');
  expect(root.querySelector<HTMLButtonElement>('button.primary')!.disabled).toBe(true);
  key('j');
  key('Enter', { metaKey: true });
  click('Kept');
  expect(root.textContent).toContain('Nothing here yet');
  click('Opened');
  expect(root.textContent).toContain('Opened does not mean unsubscribed');
  click('Refresh');
  await flush();
});
it('shows the source email when available and safely renders legacy/untrusted labels', async () => {
  const { root } = live([{ ...entry, sourceUrl: pageUrl }, { ...second, email: '', key: 'name:shop <img src=x onerror=alert(1)>', name: 'Shop <img src=x onerror=alert(1)>' }]);
  await flush();
  const source = Array.from(root.querySelectorAll('a')).find(a => a.textContent === 'Read newsletter ↗')!;
  expect(source.href).toBe(pageUrl);
  expect(source.target).toBe('_blank');
  expect(source.rel).toBe('noopener noreferrer');
  expect(root.textContent).toContain('Source email not recorded');
  expect(root.querySelector('img')).toBeNull();
  expect(root.textContent).toContain('<img src=x onerror=alert(1)>');
  expect(root.textContent).toContain('shop');
});
it('moves j/k focus without wrapping and allows mouse/native focus selection', async () => {
  const { root } = live([entry, second, third]);
  await flush();
  expect(focused()?.dataset.key).toBe(entry.key);
  expect(key('k').defaultPrevented).toBe(true);
  expect(focused()?.dataset.key).toBe(entry.key);
  key('j'); key('j'); key('j');
  expect(focused()?.dataset.key).toBe(third.key);
  key('k');
  expect(focused()?.dataset.key).toBe(second.key);
  root.querySelector<HTMLElement>('li')!.click();
  expect(focused()?.dataset.key).toBe(entry.key);
  root.querySelectorAll<HTMLElement>('li')[2].focus();
  expect(focused()?.dataset.key).toBe(third.key);
  expect(focused()?.querySelector<HTMLElement>('.shortcuts')?.hidden).toBe(false);
  expect(focused()?.querySelector('.shortcuts')?.textContent).toBe('j ↓   k ↑   Move focus');
  for (const shortcut of ['f', 'd']) {
    const legend = focused()?.querySelector(`button[aria-keyshortcuts="${shortcut}"] kbd`);
    expect(legend?.textContent).toBe(shortcut);
    expect(legend?.getAttribute('aria-hidden')).toBe('true');
  }
});
it('marks with f, immediately moves to Decided and advances focus', async () => {
  const { root, refresh, service, destroy } = live([entry, second, third]);
  await flush();
  key('f');
  await flush();
  expect(root.querySelector('li.marked')?.classList.contains('marked')).toBe(true);
  expect(focused()?.dataset.key).toBe(second.key);
  expect(rowNames()).toEqual(['Second', 'Third', 'Example Shop']);
  await refresh();
  expect(rowNames()).toEqual(['Second', 'Third', 'Example Shop']);
  destroy(); root.remove();
  setup(vi.fn(service));
  await flush();
  expect(rowNames()).toEqual(['Second', 'Third', 'Example Shop']);
  expect(focused()?.dataset.key).toBe(second.key);
  click('Undo mark');
  await flush();
  expect(document.querySelector('.marked')).toBeNull();
  expect(rowNames()).toEqual(['Example Shop', 'Second', 'Third']);
});
it('updates group counts and focuses the first decided sender after the last decision', async () => {
  const { root } = live([entry, second, third]);
  await flush();
  expect(root.querySelectorAll('.group-count')[0].textContent).toBe('3');
  expect(root.querySelectorAll('.group-count')[1].textContent).toBe('0');
  key('j'); key('j'); key('f'); await flush();
  expect(focused()?.dataset.key).toBe(entry.key);
  key('f'); await flush();
  expect(focused()?.dataset.key).toBe(second.key);
  key('d'); await flush();
  expect(focused()?.dataset.key).toBe(entry.key);
  expect(document.activeElement).toBe(focused());
  expect(root.querySelectorAll('.group-count')[0].textContent).toBe('0');
  expect(root.querySelectorAll('.group-count')[1].textContent).toBe('2');
  expect(rowNames()).toEqual(['Example Shop', 'Third']);
});
it('keeps with d, moves the sender to Kept and chooses a neighboring row', async () => {
  const { send } = live([entry, second]);
  await flush();
  key('j'); key('d');
  await flush();
  expect(focused()?.dataset.key).toBe(entry.key);
  expect(send).toHaveBeenCalledWith({ type: 'status', key: second.key, status: 'kept' });
  key('d');
  await flush();
  expect(focused()).toBeNull();
  click('Kept');
  expect(rowNames()).toEqual(['Example Shop', 'Second']);
  const calls = send.mock.calls.length;
  key('f'); key('d'); key('x');
  expect(send).toHaveBeenCalledTimes(calls);
  expect(focused()?.querySelector('kbd')).toBeNull();
  click('Review again');
  await flush();
  click('To review');
  expect(focused()?.dataset.key).toBe(entry.key);
  click('Keep');
  await flush();
  expect(focused()).toBeNull();
});
it('opens only marked senders with cmd-enter, with a live count, and keeps unmarked senders', async () => {
  const { root, open } = live([entry, second]);
  await flush();
  expect(key('Enter', { metaKey: true }).defaultPrevented).toBe(false);
  click('To unsubscribe');
  await flush();
  expect(root.querySelector('.primary')?.firstChild?.textContent).toBe('Open 1 marked unsubscribe pages');
  expect(root.querySelector('.primary kbd')?.textContent).toBe('⌘ Enter');
  expect(root.querySelector('.primary kbd')?.getAttribute('aria-hidden')).toBe('true');
  expect(root.querySelector('.primary')?.getAttribute('aria-keyshortcuts')).toBe('Meta+Enter Control+Enter');
  expect(key('Enter', { metaKey: true }).defaultPrevented).toBe(true);
  expect(root.textContent).toContain('Working… (1 marked)');
  await flush();
  expect(open).toHaveBeenCalledExactlyOnceWith([entry.url]);
  expect(root.textContent).toContain('Opened 1 unsubscribe pages');
  expect(rowNames()).toEqual(['Second']);
  click('Opened');
  expect(rowNames()).toEqual(['Example Shop']);
});
it('supports ctrl-enter and the bulk button, and f on the last row never wraps', async () => {
  const { root, open } = live([entry]);
  await flush();
  key('f');
  await flush();
  expect(focused()?.dataset.key).toBe(entry.key);
  key('Enter', { ctrlKey: true });
  await flush();
  expect(open).toHaveBeenCalledOnce();
  click('Opened'); click('Review again');
  await flush();
  click('To review'); click('To unsubscribe');
  await flush();
  click('Open 1');
  await flush();
  expect(open).toHaveBeenCalledTimes(2);
  expect(root.querySelector<HTMLButtonElement>('.primary')?.disabled).toBe(true);
});
it('does not hijack typing, modifiers, handled events or repeated decision keys', async () => {
  const { root, send } = live([{ ...entry, toUnsubscribe: true }, second]);
  await flush();
  const input = document.createElement('input'); root.append(input);
  key('f', {}, input);
  const handled = new KeyboardEvent('keydown', { key: 'f', cancelable: true });
  handled.preventDefault(); document.dispatchEvent(handled);
  for (const mod of [{ metaKey: true }, { ctrlKey: true }, { altKey: true }, { shiftKey: true }, { repeat: true }]) key('f', mod);
  key('Enter', { metaKey: true, altKey: true });
  key('Enter', { metaKey: true, repeat: true });
  key('x');
  expect(send).toHaveBeenCalledTimes(1);
  key('f');
  key('d'); // Busy until the mark write completes.
  await flush();
  expect(send).toHaveBeenCalledTimes(2);
});
it('shows worker and connection errors, then supports recovery', async () => {
  const send = vi.fn().mockResolvedValueOnce({ ok: false, error: 'Storage full' }).mockRejectedValueOnce('disconnected').mockResolvedValue({ ok: true, entries: [] });
  const { root, refresh } = setup(send);
  await flush();
  expect(root.querySelector('[role="alert"]')?.textContent).toBe('Storage full');
  await refresh();
  expect(root.textContent).toContain('Could not connect');
  await refresh();
  expect(root.querySelector('[role="alert"]')).toBeNull();
});
it('ignores stale refresh results and failures', async () => {
  let resolve!: (reply: Reply) => void;
  let reject!: (error: Error) => void;
  const send = vi.fn().mockImplementationOnce(() => new Promise<Reply>(yes => { resolve = yes; })).mockResolvedValueOnce({ ok: true, entries: [entry] }).mockImplementationOnce(() => new Promise<Reply>((_, no) => { reject = no; })).mockResolvedValue({ ok: true, entries: [entry] });
  const { root, refresh } = setup(send);
  await refresh();
  resolve({ ok: true, entries: [] });
  await flush();
  expect(root.textContent).toContain('Example Shop');
  const stale = refresh();
  await refresh();
  reject(new Error('Stale')); await stale;
  expect(root.textContent).not.toContain('Stale');
});
it('defers storage refresh during a decision and sorts new captures', async () => {
  let resolve!: (reply: Reply) => void;
  const send = vi.fn().mockResolvedValueOnce({ ok: true, entries: [entry, second] }).mockImplementationOnce(() => new Promise<Reply>(yes => { resolve = yes; })).mockResolvedValue({ ok: true, entries: [{ ...entry, toUnsubscribe: true }, second, third] });
  const { refresh } = setup(send);
  await flush();
  key('f');
  await refresh();
  expect(send).toHaveBeenCalledTimes(2);
  resolve({ ok: true, entries: [{ ...entry, toUnsubscribe: true }, second] });
  await flush();
  expect(send).toHaveBeenCalledTimes(3);
  expect(rowNames()).toEqual(['Second', 'Third', 'Example Shop']);
  expect(focused()?.dataset.key).toBe(second.key);
});
it('keeps selection and marking unchanged when a decision fails', async () => {
  const send = vi.fn().mockResolvedValueOnce({ ok: true, entries: [entry, second] }).mockResolvedValue({ ok: false, error: 'Cannot save' });
  const { root } = setup(send);
  await flush();
  key('f');
  await flush();
  expect(focused()?.dataset.key).toBe(entry.key);
  expect(root.querySelector('.marked')).toBeNull();
  expect(root.textContent).toContain('Cannot save');
});

it('reorders and focuses the first unmarked sender when returning to an existing tab', async () => {
  const { resume } = live([entry, second]);
  await flush();
  key('f');
  await flush();
  expect(rowNames()).toEqual(['Second', 'Example Shop']);
  await resume();
  expect(rowNames()).toEqual(['Second', 'Example Shop']);
  expect(focused()?.dataset.key).toBe(second.key);
});
