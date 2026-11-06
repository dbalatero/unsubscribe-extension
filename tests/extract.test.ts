import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extract, unsubscribeLink } from '../src/extract';

import { pageUrl, card } from './fixtures';
function doc(html: string) { return new DOMParser().parseFromString(html, 'text/html'); }
function link(html: string) { return unsubscribeLink(doc(html).body); }

it.each([['fastmail.html', pageUrl], ['allmail.html', 'https://app.fastmail.com/mail/Archive/message?u=example']])('extracts the actual, redacted Fastmail fixture %s', (file, url) => {
  const html = readFileSync(`test-data/${file}`, 'utf8');
  const parsed = doc(html);
  const found = extract(parsed, url);
  expect(found).toHaveLength(1);
  expect(found[0]).toMatchObject({ name: 'Example Newsletter', email: 'newsletter@example.test' });
  expect(found[0].url).toMatch(/^https:\/\/links\.example\.test\/unsubscribe\/\d+\?token=REDACTED$/);
  expect(parsed.querySelectorAll('script, style, meta, link, [src], [style]')).toHaveLength(0);
  expect(html).not.toMatch(/access_token|tracking-us\.|fastmailusercontent/i);
  expect(html.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi)?.every(email => email.endsWith('@example.test'))).toBe(true);
});

it('requires both the allowed URL and an expanded message, matching each sender to its own body', () => {
  expect(extract(doc(card()), 'https://app.fastmail.com/mail/Sent/message')).toEqual([]);
  expect(extract(doc(card('', '', 'is-collapsed')), pageUrl)).toEqual([]);
  expect(extract(doc(card(undefined, undefined, 'is-expanded v-MessageCard--draft')), pageUrl)).toEqual([]);
  expect(extract(doc(`<div hidden>${card()}</div>`), pageUrl)).toEqual([]);
  expect(extract(doc('<div class="v-MessageCard is-expanded"></div>'), pageUrl)).toEqual([]);
  expect(extract(doc(card('', '')), pageUrl)).toEqual([]);
  expect(extract(doc(card('<a href="https://example.test">Shop</a>')), pageUrl)).toEqual([]);
  const two = doc(card() + card('<a href="https://second.test/unsubscribe">Stop</a>', '<h2 class="v-MessageCard-unknownSender">second@second.test</h2>'));
  expect(extract(two, pageUrl)).toEqual([
    { name: 'Example Shop', email: 'news@example.test', url: 'https://example.test/opaque' },
    { name: 'second@second.test', email: 'second@second.test', url: 'https://second.test/unsubscribe' },
  ]);
});
it('supports name-only senders, unnamed senders and delayed text', () => {
  expect(extract(doc(card(undefined, '<h2 class="v-MessageCard-from">Name only</h2>')), pageUrl)[0].email).toBe('');
  expect(extract(doc(card(undefined, '<h2 class="v-MessageCard-from" title="a@example.test"></h2>')), pageUrl)[0].name).toBe('a@example.test');
  expect(extract(doc(card(undefined, '<h2 class="v-MessageCard-from"></h2>')), pageUrl)).toEqual([]);
  const d = doc(card());
  Object.defineProperty(d.querySelector('.v-MessageCard-from'), 'textContent', { value: null });
  expect(extract(d, pageUrl)[0].name).toBe('news@example.test');
});
describe('unsubscribe links', () => {
  it('recognizes the redacted missed footer even with an opaque tracking URL', () => {
    const html = readFileSync('test-data/missed1.redacted.html', 'utf8');
    expect(extract(doc(html), pageUrl)).toEqual([{ name: 'Example Newsletter', email: 'newsletter@example.test', url: 'https://links.example.test/v2/c/REDACTED' }]);
  });
  it('recognizes a nearby unsubscribe instruction through inline formatting', () => {
    expect(link('<p>To <b>opt out</b> <span><a href="https://a.test/opaque">click here</a></span></p>')).toBe('https://a.test/opaque');
    expect(link('<p>Unsubscribe <a href="https://a.test/opaque">here</a></p><a href="https://b.test">Unsubscribe</a>')).toBe('https://b.test/');
  });
  it.each([
    '<a href="https://a.test">here</a>',
    '<p>Unsubscribe</p><p><a href="https://a.test">here</a></p>',
    '<p>Update your email preferences <a href="https://a.test">here</a></p>',
    '<p>Unsubscribe instructions. Read our article <a href="https://a.test">here</a></p>',
    '<p>Unsubscribe <a href="https://a.test">here</a> or shop <a href="https://b.test">here</a></p>',
    `<p>${'x'.repeat(250)} unsubscribe <a href="https://a.test">here</a></p>`,
    '<p><span hidden>Unsubscribe</span> <a href="https://a.test">here</a></p>',
  ])('avoids ambiguous or unrelated contextual links: %s', html => {
    expect(link(html)).toBeNull();
  });
  it('does not borrow unsubscribe context from outside the email body', () => {
    const parsed = doc('<div>Unsubscribe <span id="body"><a href="https://a.test">here</a></span></div>');
    expect(unsubscribeLink(parsed.querySelector('#body')!)).toBeNull();
  });
  it('ranks explicit labels above URL hints and preference centers', () => {
    expect(link('<a href="https://a.test">Manage preferences</a><a href="https://b.test/unsubscribe">Click</a><a href="https://c.test/opaque">Unsubscribe</a><a href="https://d.test">Opt out</a>')).toBe('https://c.test/opaque');
    expect(link('<a href="https://a.test">Update preferences</a>')).toBe('https://a.test/');
    expect(link('<a href="https://a.test" aria-label="Opt-out">X</a>')).toBe('https://a.test/');
    expect(link('<a href="https://a.test" title="Unsubscribe">X</a>')).toBe('https://a.test/');
    expect(link('<a href="https://a.test">Manage your subscriptions</a>')).toBe('https://a.test/');
  });
  it('ignores quoted messages, hidden links, unsafe URLs, relative links and unrelated anchors', () => {
    expect(link('<blockquote><a href="https://a.test">Unsubscribe</a></blockquote><div class="u-quote"><a href="https://a.test">Unsubscribe</a></div><a hidden href="https://a.test">Unsubscribe</a><a href="mailto:a@example.test">Unsubscribe</a><a href="/unsubscribe">Unsubscribe</a><a href="javascript:alert(1)">Unsubscribe</a><a href="https://a.test">Shop now</a>')).toBeNull();
  });
});
