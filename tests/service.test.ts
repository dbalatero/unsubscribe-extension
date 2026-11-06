import { expect, it, vi } from 'vitest';
import { authorized, createService, type Store } from '../src/service';
import { type Entry, type Reply } from '../src/model';
import { capture, entry, pageUrl } from './fixtures';

function setup(initial: unknown = undefined) {
  let data = initial;
  const store: Store = {
    read: vi.fn(async () => structuredClone(data)),
    write: vi.fn(async entries => { data = structuredClone(entries); }),
    open: vi.fn(async () => {}),
  };
  return { store, send: createService(store) };
}
function entries(reply: Reply): Entry[] { if (!reply.ok) throw new Error(reply.error); return reply.entries; }

it('stores once per domain and remembers decisions across service restarts', async () => {
  const { send, store } = setup();
  expect(entries(await send({ type: 'list' }))).toEqual([]);
  expect(entries(await send({ type: 'capture', capture }))[0]).toMatchObject({ ...entry, capturedAt: expect.any(String) });
  await send({ type: 'status', key: entry.key, status: 'kept' });
  const restarted = createService(store);
  expect(entries(await restarted({ type: 'capture', capture: { ...capture, name: 'Another', email: 'another@EXAMPLE.test' } }))).toHaveLength(1);
  expect(entries(await restarted({ type: 'list' }))[0].status).toBe('kept');
  await restarted({ type: 'status', key: entry.key, status: 'pending' });
  expect(entries(await restarted({ type: 'list' }))[0].status).toBe('pending');
  expect(store.write).toHaveBeenCalledTimes(3);
});
it('serializes concurrent captures and keep decisions', async () => {
  const { send } = setup();
  const requests = Array.from({ length: 10 }, (_, i) => send({ type: 'capture', capture: { ...capture, email: `a@domain${i}.test` } }));
  await Promise.all(requests);
  await Promise.all([send({ type: 'capture', capture }), send({ type: 'status', key: entry.key, status: 'kept' }), send({ type: 'capture', capture })]);
  const result = entries(await send({ type: 'list' }));
  expect(result).toHaveLength(11);
  expect(result.find(e => e.key === entry.key)?.status).toBe('kept');
});
it('opens all pending links in one window, keeps history and supports retry', async () => {
  const kept = { ...entry, name: 'Kept', email: 'a@kept.test', key: 'domain:kept.test', status: 'kept' };
  const other = { ...entry, email: 'a@other.test', key: 'domain:other.test', url: 'https://other.test' };
  const { send, store } = setup([entry, kept, other]);
  expect(await send({ type: 'open' })).toMatchObject({ ok: true, opened: 2 });
  expect(store.open).toHaveBeenCalledExactlyOnceWith([entry.url, other.url]);
  expect(entries(await send({ type: 'list' })).map(e => e.status)).toEqual(['opened', 'kept', 'opened']);
  expect(await send({ type: 'open' })).toMatchObject({ ok: true, opened: 0 });
  await send({ type: 'status', key: entry.key, status: 'pending' });
  await send({ type: 'open' });
  expect(store.open).toHaveBeenCalledTimes(2);
});
it('does not lose entries on window errors and recovers after failed operations', async () => {
  const { send, store } = setup([entry]);
  vi.mocked(store.open).mockRejectedValueOnce(new Error('Cannot open window'));
  expect(await send({ type: 'open' })).toEqual({ ok: false, error: 'Cannot open window' });
  expect(entries(await send({ type: 'list' }))[0].status).toBe('pending');
  vi.mocked(store.write).mockRejectedValueOnce(new Error('Storage full'));
  expect(await send({ type: 'open' })).toMatchObject({ ok: false, error: expect.stringContaining('window opened') });
  expect(entries(await send({ type: 'list' }))[0].status).toBe('pending');
  expect(await send({ type: 'open' })).toMatchObject({ ok: true, opened: 1 });
});
it('rejects malformed requests and corrupt data without overwriting it', async () => {
  const { send } = setup();
  for (const request of [null, 5, { type: 'unknown' }, { type: 'capture', capture: {} }, { type: 'status', status: 'invalid' }, { type: 'status', key: 'missing', status: 'kept' }]) expect(await send(request)).toMatchObject({ ok: false });
  for (const data of [{}, [null], [entry, { ...entry, url: 'javascript:alert(1)' }]]) {
    const { send, store } = setup(data);
    expect(await send({ type: 'capture', capture })).toMatchObject({ ok: false });
    expect(store.write).not.toHaveBeenCalled();
  }
  const { send: failing, store } = setup();
  vi.mocked(store.read).mockRejectedValueOnce('error');
  expect(await failing({ type: 'list' })).toMatchObject({ ok: false, error: expect.stringContaining('Something went wrong') });
});
it('only accepts capture from the Inbox top frame and review actions from the extension UI', () => {
  const ui = 'chrome-extension://test/index.html';
  expect(authorized({ type: 'capture' }, { url: pageUrl, frameId: 0 }, ui)).toBe(true);
  expect(authorized({ type: 'list' }, { url: ui }, ui)).toBe(true);
  for (const [request, sender] of ([[null, {}], [{ type: 'capture' }, {}], [{ type: 'capture' }, { frameId: 0 }], [{ type: 'capture' }, { url: pageUrl, frameId: 1 }], [{ type: 'open' }, { url: pageUrl }], [{ type: 'open' }, { url: 'https://evil.test' }]] as [unknown, chrome.runtime.MessageSender][])) expect(authorized(request, sender!, ui)).toBe(false);
});
