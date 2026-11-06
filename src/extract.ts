import { type Capture, isSupportedMessage, webUrl } from './model';

const unsubscribe = /\bunsubscribe\b|\bopt[\s-]?out\b/i;
const preferences = /\b(?:manage|update|email|subscription)\s+preferences\b|\bmanage\s+(?:your\s+)?subscriptions?\b/i;

// Prefer explicit unsubscribe text; opaque tracking URLs remain usable.
export function unsubscribeLink(body: Element): string | null {
  let best: string | null = null;
  let bestScore = 0;
  for (const anchor of body.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    if (anchor.closest('blockquote, .u-quote, [hidden], [aria-hidden="true"]')) continue;
    const url = webUrl(anchor.getAttribute('href')!);
    if (!url) continue;
    const label = `${anchor.textContent} ${anchor.getAttribute('title') || ''} ${anchor.getAttribute('aria-label') || ''}`;
    const score = unsubscribe.test(label) ? 3 : unsubscribe.test(url) ? 2 : preferences.test(label) ? 1 : 0;
    if (score > bestScore) {
      best = url;
      bestScore = score;
    }
  }
  return best;
}

export function extract(doc: Document, pageUrl: string): Capture[] {
  if (!isSupportedMessage(pageUrl)) return [];
  const captures: Capture[] = [];
  for (const card of doc.querySelectorAll('.v-MessageCard.is-expanded:not(.v-MessageCard--draft)')) {
    if (card.closest('[hidden], [aria-hidden="true"]')) continue;
    const body = card.querySelector('.v-Message-body');
    const from = card.querySelector('.v-MessageCard-header .v-MessageCard-from, .v-MessageCard-header .v-MessageCard-unknownSender');
    if (!body || !from) continue;
    const url = unsubscribeLink(body);
    if (!url) continue;
    const text = from.textContent?.trim() || '';
    const raw = from.getAttribute('title') || text;
    const email = raw.match(/[^\s<>"(),;]+@[^\s<>"(),;]+\.[a-z]{2,}/i)?.[0] || '';
    const name = text.replace(/^[\s<]+|[\s>]+$/g, '') || email;
    if (name) captures.push({ name, email, url });
  }
  return captures;
}
