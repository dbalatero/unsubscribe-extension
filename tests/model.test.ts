import { describe, expect, it } from 'vitest';
import { isSupportedMessage, webUrl, senderKey, isCapture, isEntry, isStatus } from '../src/model';

import { capture, entry } from './fixtures';

describe('scope and URL validation', () => {
  it.each(['https://app.fastmail.com/mail/Inbox/abc.def?u=account', 'https://app.fastmail.com/mail/Inbox/abc/', 'https://app.fastmail.com/mail/Archive/abc.def?u=account', 'https://app.fastmail.com/mail/Archive/abc/'])('allows a supported message: %s', url => expect(isSupportedMessage(url)).toBe(true));
  it.each(['', 'invalid', 'http://app.fastmail.com/mail/Inbox/a', 'https://betaapp.fastmail.com/mail/Inbox/a', 'https://app.fastmail.com.evil.test/mail/Inbox/a', 'https://app.fastmail.com/mail/Inbox', 'https://app.fastmail.com/mail/Inbox/', 'https://app.fastmail.com/mail/Inbox/a/b', 'https://app.fastmail.com/mail/Sent/a', 'https://app.fastmail.com/settings', 'https://app.fastmail.com/mail/Archive', 'https://app.fastmail.com/mail/Archive/', 'https://app.fastmail.com/mail/Archive/a/b', 'https://app.fastmail.com/mail/archive/a', 'https://other.test/mail/Archive/a'])('ignores %s', url => expect(isSupportedMessage(url)).toBe(false));
  it.each(['javascript:alert(1)', 'mailto:a@b.test', 'data:text/html,abc', 'file:///tmp/a', '/relative', 'https://user:pass@example.test', 'https://:pass@example.test'])('rejects non-web URLs: %s', url => expect(webUrl(url)).toBeNull());
  it('accepts HTTP and HTTPS and normalizes', () => {
    expect(webUrl('https://example.test')).toBe('https://example.test/');
    expect(webUrl('http://example.test/a')).toBe('http://example.test/a');
  });
});

it('deduplicates exact sender domains, with name fallback', () => {
  expect(senderKey(' NEWS@Shop.Example.COM ', 'Shop')).toBe('domain:shop.example.com');
  expect(senderKey('', '  Example   Shop  ')).toBe('name:example shop');
  expect(senderKey('not an email', 'Shop')).toBe('name:shop');
});
it('validates all data crossing extension boundaries', () => {
  expect(isCapture(capture)).toBe(true);
  for (const value of [null, false, 'a', {}, { ...capture, name: '' }, { ...capture, name: ' '.repeat(4) }, { ...capture, name: 'a'.repeat(301) }, { ...capture, email: 5 }, { ...capture, email: 'a'.repeat(321) }, { ...capture, url: 5 }, { ...capture, url: 'a'.repeat(16001) }, { ...capture, url: 'javascript:alert(1)' }]) expect(isCapture(value)).toBe(false);
  expect(isEntry(entry)).toBe(true);
  for (const value of [null, { ...entry, key: 'bad' }, { ...entry, status: 'bad' }, { ...entry, capturedAt: 3 }, { ...entry, capturedAt: 'bad' }]) expect(isEntry(value)).toBe(false);
  for (const status of ['pending', 'kept', 'opened']) expect(isStatus(status)).toBe(true);
  expect(isStatus('bad')).toBe(false);
});
