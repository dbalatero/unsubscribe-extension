# Unsubscribe Collector for Fastmail

A local Chrome extension that collects unsubscribe links while you read emails in your Fastmail Inbox. Keep the senders you like, then open the rest in one new window, one tab per sender.

## Install

The extension is already built in `dist/` in this checkout. To build it again:

```sh
devenv shell
npm ci
npm run build
```

If `devenv` is not installed, start it with `nix run nixpkgs#devenv -- shell`. Node.js 22.12+ also works without devenv. The checked-in `devenv.lock` pins the Nix environment; `package-lock.json` pins JavaScript dependencies.

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select this repository's **dist** folder.
4. Pin **Unsubscribe Collector for Fastmail** in Chrome's extensions menu.
5. Reload any already-open Fastmail tabs.

After rebuilding, click the extension's **Reload** button on `chrome://extensions` and reload Fastmail.

## Use

- Read emails at `https://app.fastmail.com/mail/Inbox/<message-id>`. Expanded messages with an unsubscribe link are captured automatically, including navigation within Fastmail without a full page reload.
- Click the extension icon to review captured senders. You can also use the extension's **Options** page for a larger view.
- Click **Keep** for senders you want. They disappear from the review list, remain in **Kept**, and are never recaptured automatically.
- Click **Open all … unsubscribe pages** to open the remaining senders in one new window. Finish each site's unsubscribe flow yourself.
- Successfully opened senders move to **Opened** so they are not offered repeatedly. This records opening a page, not confirmation of unsubscribing. **Review again** puts a kept or opened sender back into the queue.
- Clicking an individual destination link opens just that page without changing its status.

Deduplication uses the exact, case-insensitive sender domain, falling back to the normalized sender name when no email address is exposed. Subdomains are distinct. Different newsletters sharing one sender domain count as the same sender. The database is shared across Fastmail accounts in the same Chrome profile.

## Access and privacy

- The only site matched by the content script is **https://app.fastmail.com/**. No wildcard domain, beta host, other Fastmail host, or unsubscribe destination is granted access.
- The script is registered across that origin so it can detect Fastmail's client-side navigation. It only extracts from **/mail/Inbox/<message-id>**, ignoring other folders, list views, settings, and other routes.
- Only expanded message cards are scanned. Draft cards, quoted messages, and explicitly hidden content are excluded.
- The database uses `chrome.storage.local`. It stores sender name, sender address, unsubscribe URL, capture time, and review status. It does not sync to a server or collect email bodies, subjects, account credentials, or API tokens.
- The extension makes no network requests to capture links and never clicks Fastmail's Unsubscribe button or submits an unsubscribe form. Opening saved URLs is a user action; some providers may unsubscribe immediately when their URL is opened.
- Uninstalling the extension removes its local database. Chrome's storage quota still applies; failures are reported without deliberately clearing saved data.

The committed `test-data/fastmail.html` is a **redacted fixture** based on the supplied page. Message text, addresses, account/message identifiers, tracking links, and tokens were replaced with synthetic values. Scripts, styles, metadata, and external resource sources were removed. The original HTML was not committed or backed up by this project.

## Detection limits

The extension captures HTTP(S) links in the rendered message body, prioritizing “Unsubscribe”/“Opt out,” then unsubscribe URL hints, then clearly labeled preference centers. It does not support mailto-only unsubscribe instructions, hidden raw email headers, or content Fastmail has not rendered yet. It waits for later DOM changes when a body is still loading.

Fastmail's built-in Unsubscribe control performs a server operation and may not expose a URL usable in this workflow. The collector therefore uses body links. Fastmail can change its DOM; the relevant adapter is `src/extract.ts`. The selectors were verified against the supplied HTML and Fastmail's public rendering code.

## Development and verification

```sh
npm run check                 # 100% coverage thresholds, TypeScript, production build
npx playwright install chromium
npm run test:e2e              # build and exercise the actual extension in Chromium
```

`npm run test:watch` runs unit tests while editing. Unit tests cover every TypeScript source file, including extension entry points, and enforce 100% statements, branches, functions, and lines.

The browser test uses a fresh temporary profile and locally intercepts mail pages and serves synthetic unsubscribe destinations on localhost. It does not connect to your mailbox or any real unsubscribe endpoint. It verifies capture from the redacted fixture, SPA navigation, keep decisions, deduplication, one-window bulk opening, and persistence across browser restarts. Its screenshot is saved to `test-results/review.png`.

The production extension uses TypeScript and Vite without a UI framework. A single background service worker serializes all writes, so multiple Fastmail tabs cannot overwrite one another's captures. Chrome messaging accepts capture requests only from top-level Inbox message pages; review actions come only from the extension's own page. The content script is bundled separately as an IIFE for Chrome's isolated world.
