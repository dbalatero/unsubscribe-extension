import { extract } from './extract';
import type { Capture } from './model';

export function collect(doc: Document, getUrl: () => string, save: (capture: Capture) => Promise<void>, report: (error: unknown) => void): () => void {
  const saved = new Set<string>();
  const pending = new Set<string>();
  let timer: ReturnType<typeof setTimeout>;
  let stopped = false;
  const scan = () => {
    for (const capture of extract(doc, getUrl())) {
      const key = JSON.stringify(capture);
      if (saved.has(key) || pending.has(key)) continue;
      pending.add(key);
      void save(capture).then(() => { saved.add(key); }).catch(report).finally(() => { pending.delete(key); });
    }
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(scan, 250);
  };
  const observer = new MutationObserver(schedule);
  observer.observe(doc.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'href', 'title', 'hidden', 'aria-hidden'] });
  // Fastmail uses pushState; this also retries transient service-worker failures.
  const poll = setInterval(scan, 2000);
  scan();
  return () => {
    if (stopped) return;
    stopped = true;
    observer.disconnect();
    clearTimeout(timer);
    clearInterval(poll);
  };
}
