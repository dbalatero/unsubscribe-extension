import { afterEach, expect, it, vi } from 'vitest';
import { mount } from '../src/ui';
import { type Entry, type Reply, type Request } from '../src/model';
import { entry } from './fixtures';

afterEach(() => document.body.replaceChildren());
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
function click(text: string) {
  const button = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.startsWith(text));
  expect(button).toBeDefined();
  button!.click();
}
function setup(send = vi.fn<(request: Request) => Promise<Reply>>().mockResolvedValue({ ok: true, entries: [] })) {
  const root = document.createElement('main');
  document.body.append(root);
  return { ...mount(root, send), root, send };
}
it('renders the empty state, filters, and disabled bulk action', async () => {
  const { root } = setup();
  await flush();
  expect(root.textContent).toContain('You’re all caught up');
  expect(root.querySelector<HTMLButtonElement>('button.primary')!.disabled).toBe(true);
  click('Kept');
  expect(root.textContent).toContain('Nothing here yet');
  click('Opened');
  expect(root.textContent).toContain('Opened does not mean unsubscribed');
  click('Refresh');
  await flush();
});
it('keeps, restores and opens senders, showing all three lists', async () => {
  let entries: Entry[] = [structuredClone(entry)];
  const send = vi.fn(async (request: Request): Promise<Reply> => {
    if (request.type === 'status') entries = entries.map(e => ({ ...e, status: request.status }));
    if (request.type === 'open') { entries = entries.map(e => ({ ...e, status: 'opened' })); return { ok: true, entries, opened: 1 }; }
    return { ok: true, entries };
  });
  const { root } = setup(send);
  await flush();
  expect(root.textContent).toContain('Example Shop');
  expect(root.querySelector('a')?.rel).toBe('noopener noreferrer');
  click('Keep');
  await flush();
  expect(send).toHaveBeenLastCalledWith({ type: 'status', key: entry.key, status: 'kept' });
  click('Kept');
  click('Review again');
  await flush();
  click('To review');
  click('Open all');
  expect(root.textContent).toContain('Working…');
  await flush();
  expect(root.textContent).toContain('Opened 1 unsubscribe pages');
  click('Opened');
  expect(root.textContent).toContain('Example Shop');
});
it('renders untrusted sender labels as text and supports name-only senders', async () => {
  const send = vi.fn().mockResolvedValue({ ok: true, entries: [{ ...entry, email: '', key: 'name:shop', name: '<img src=x onerror=alert(1)>' }] });
  const { root } = setup(send);
  await flush();
  expect(root.querySelector('img')).toBeNull();
  expect(root.textContent).toContain('<img src=x onerror=alert(1)>');
  expect(root.textContent).toContain('shop');
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
it('ignores stale successes and failures when a newer refresh has completed', async () => {
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
  reject(new Error('Stale'));
  await stale;
  expect(root.textContent).not.toContain('Stale');
});
