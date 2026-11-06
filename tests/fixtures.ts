export const capture = { name: 'Example Shop', email: 'news@example.test', url: 'https://example.test/unsubscribe?t=abc' };
export const entry = { ...capture, key: 'domain:example.test', status: 'pending' as const, capturedAt: '2026-11-06T12:00:00Z' };

export const pageUrl = 'https://app.fastmail.com/mail/Inbox/message?u=example';
export function card(body = '<a href="https://example.test/opaque">Unsubscribe</a>', from = '<h2 class="v-MessageCard-from" title="news@example.test">Example Shop</h2>', classes = 'is-expanded') {
  return `<div class="v-MessageCard ${classes}"><div class="v-MessageCard-header">${from}</div><div class="v-Message-body">${body}</div></div>`;
}
