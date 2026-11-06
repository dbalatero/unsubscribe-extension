import { type Entry, type Reply, type Request, isCapture, isEntry, isInboxMessage, isStatus, senderKey } from './model';

export const STORAGE_KEY = 'senders.v1';
export interface Store {
  read(): Promise<unknown>;
  write(entries: Entry[]): Promise<void>;
  open(urls: string[]): Promise<void>;
}

export function createService(store: Store) {
  // One writer for all tabs and popups prevents lost read-modify-write updates.
  let queue: Promise<unknown> = Promise.resolve();
  const handle = async (input: unknown): Promise<Reply> => {
    if (!input || typeof input !== 'object') throw new Error('Invalid request.');
    const request = input as Request;
    const raw = await store.read();
    if (raw !== undefined && (!Array.isArray(raw) || !raw.every(isEntry))) {
      throw new Error('Saved data could not be read. No data has been changed.');
    }
    const entries: Entry[] = raw === undefined ? [] : raw;
    switch (request.type) {
      case 'list': break;
      case 'capture': {
        if (!isCapture(request.capture)) throw new Error('Invalid sender or unsubscribe URL.');
        const { name, email, url } = request.capture;
        const key = senderKey(email, name);
        if (!entries.some(e => e.key === key)) {
          entries.push({ key, name, email, url, status: 'pending', capturedAt: new Date().toISOString() });
          await store.write(entries);
        }
        break;
      }
      case 'status': {
        if (!isStatus(request.status)) throw new Error('Invalid status.');
        const entry = entries.find(e => e.key === request.key);
        if (!entry) throw new Error('Sender not found. Refresh and try again.');
        entry.status = request.status;
        await store.write(entries);
        break;
      }
      case 'open': {
        const pending = entries.filter(e => e.status === 'pending');
        if (pending.length) {
          await store.open(pending.map(e => e.url));
          pending.forEach(e => { e.status = 'opened'; });
          try {
            await store.write(entries);
          } catch {
            throw new Error('The window opened, but history could not be saved. Avoid opening again until you check those tabs.');
          }
        }
        return { ok: true, entries, opened: pending.length };
      }
      default: throw new Error('Unknown request.');
    }
    return { ok: true, entries };
  };
  return (input: unknown): Promise<Reply> => {
    const result = queue.then(() => handle(input)).catch((error: unknown): Reply => ({
      ok: false, error: error instanceof Error ? error.message : 'Something went wrong. Please try again.',
    }));
    queue = result;
    return result;
  };
}

export function authorized(input: unknown, sender: chrome.runtime.MessageSender, extensionUrl: string): boolean {
  if (!input || typeof input !== 'object') return false;
  if ((input as Request).type === 'capture') return sender.frameId === 0 && isInboxMessage(sender.url || '');
  return sender.url === extensionUrl;
}
