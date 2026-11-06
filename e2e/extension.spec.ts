import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

test('built extension captures scoped mail, remembers keep decisions, and opens one window', async () => {
  const hits = new Set<string>();
  const server = createServer((request, response) => {
    hits.add(request.url!);
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end('<h1>Synthetic unsubscribe page</h1>');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const local = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const fixture = await readFile('test-data/fastmail.html', 'utf8');
  const allMailFixture = await readFile('test-data/allmail.html', 'utf8');
  const profile = await mkdtemp(join(tmpdir(), 'unsubscribe-e2e-'));
  const extension = resolve('dist');
  const launch = () => chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  let context: BrowserContext | undefined;
  try {
    context = await launch();
    // Mail pages are intercepted; unsubscribe destinations use a local server so
    // even the first navigation of a new Chrome window cannot race interception.
    await context.route(/^https?:\/\//, route => {
      const url = new URL(route.request().url());
      if (url.hostname === '127.0.0.1') return route.continue();
      const source = url.pathname.startsWith('/mail/Archive') ? allMailFixture : fixture;
      let html = source;
      if (url.pathname.endsWith('/second')) html = source.replaceAll('newsletter@example.test', 'news@second.test').replaceAll('Example Newsletter', 'Second Newsletter').replaceAll('https://links.example.test', `${local}/second`);
      if (url.pathname.endsWith('/third')) html = source.replaceAll('newsletter@example.test', 'news@third.test').replaceAll('Example Newsletter', 'Third Newsletter').replaceAll('https://links.example.test', `${local}/third`);
      return route.fulfill({ contentType: 'text/html', body: html });
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).host;
    // Exercise real alarms/badges, but do not show OS notifications during tests.
    await worker.evaluate(() => {
      chrome.notifications.create = (async () => 'unsubscribe-review') as typeof chrome.notifications.create;
    });
    await expect.poll(() => worker.evaluate(async () => (await chrome.alarms.get('monday-review'))?.name)).toBe('monday-review');
    const review = await context.newPage();
    await review.goto(`chrome-extension://${extensionId}/index.html`);
    await expect(review.getByRole('button', { name: 'To review (0)' })).toBeVisible();
    const mail = await context.newPage();
    await mail.goto('https://other.test/mail/Inbox/first');
    await expect(review.getByRole('button', { name: 'To review (0)' })).toBeVisible();
    await mail.goto('https://app.fastmail.com/mail/Sent/first');
    await expect(review.getByRole('button', { name: 'To review (0)' })).toBeVisible();
    await mail.goto('https://app.fastmail.com/mail/Inbox');
    // The content script must survive SPA navigation from the Inbox list.
    await mail.evaluate(() => history.pushState({}, '', '/mail/Inbox/first?u=test-account'));
    await expect(review.getByRole('button', { name: 'To review (1)' })).toBeVisible();
    await expect(review.getByRole('heading', { name: 'Example Newsletter' })).toBeVisible();
    await expect.poll(() => worker.evaluate(() => chrome.action.getBadgeText({}))).toBe('1');
    await review.getByRole('button', { name: 'Keep', exact: true }).click();
    await expect(review.getByRole('button', { name: 'Kept (1)' })).toBeVisible();
    await expect.poll(() => worker.evaluate(() => chrome.action.getBadgeText({}))).toBe('');
    await mail.reload();
    await mail.goto('https://app.fastmail.com/mail/Archive');
    await expect(review.getByRole('button', { name: 'To review (0)' })).toBeVisible();
    await mail.evaluate(() => history.pushState({}, '', '/mail/Archive/first?u=test-account'));
    // Same sender remains kept across Inbox and All Mail.
    await mail.reload();
    await expect(review.getByRole('button', { name: 'Kept (1)' })).toBeVisible();
    await mail.goto('https://app.fastmail.com/mail/Archive/second');
    await expect(review.getByRole('heading', { name: 'Second Newsletter' })).toBeVisible();
    await mail.goto('https://app.fastmail.com/mail/Inbox/third');
    await expect(review.getByRole('button', { name: 'To review (2)' })).toBeVisible();
    await expect.poll(() => worker.evaluate(() => chrome.action.getBadgeText({}))).toBe('2');
    await review.screenshot({ path: 'test-results/review.png', fullPage: true });
    const before = await worker.evaluate(async () => (await chrome.windows.getAll()).map(window => window.id));
    await review.getByRole('button', { name: 'Open all 2 unsubscribe pages' }).click();
    await expect.poll(async () => (await worker.evaluate(async () => (await chrome.windows.getAll()).length))).toBe(before.length + 1);
    const windows = await worker.evaluate(async () => await chrome.windows.getAll({ populate: true }));
    const opened = windows.find(window => !before.includes(window.id))!;
    expect(opened.tabs).toHaveLength(2);
    await expect.poll(() => context!.pages().filter(page => page.url().startsWith(local)).length).toBe(2);
    expect([...hits].some(url => url.startsWith('/second/unsubscribe/'))).toBe(true);
    expect([...hits].some(url => url.startsWith('/third/unsubscribe/'))).toBe(true);
    await expect(review.getByRole('button', { name: 'Opened (2)' })).toBeVisible();
    await expect.poll(() => worker.evaluate(() => chrome.action.getBadgeText({}))).toBe('');
    await expect(review.getByRole('button', { name: 'To review (0)' })).toBeVisible();
    await review.getByRole('button', { name: 'Kept (1)' }).click();
    await expect(review.getByRole('heading', { name: 'Example Newsletter' })).toBeVisible();
    await context.close();
    context = await launch();
    const restarted = await context.newPage();
    await restarted.goto(`chrome-extension://${extensionId}/index.html`);
    await expect(restarted.getByRole('button', { name: 'Kept (1)' })).toBeVisible();
    await expect(restarted.getByRole('button', { name: 'Opened (2)' })).toBeVisible();
    await restarted.getByRole('button', { name: 'Opened (2)' }).click();
    await restarted.getByRole('button', { name: 'Review again' }).first().click();
    await expect(restarted.getByRole('button', { name: 'To review (1)' })).toBeVisible();
  } finally {
    await context?.close();
    await rm(profile, { recursive: true, force: true });
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
