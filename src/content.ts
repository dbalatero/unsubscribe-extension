import { collect } from './collector';
import type { Reply } from './model';

const stop = collect(document, () => location.href, async (capture) => {
  const reply: Reply = await chrome.runtime.sendMessage({ type: 'capture', capture });
  if (!reply.ok) throw new Error(reply.error);
}, () => console.warn('Unsubscribe Collector could not save a link. It will retry; reload Fastmail if the extension was updated.'));
window.addEventListener('pagehide', stop, { once: true });
