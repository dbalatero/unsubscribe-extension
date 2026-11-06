# Unsubscribe Collector for Fastmail

A local Chrome extension that collects unsubscribe links while you read emails in your Fastmail Inbox or All Mail. Keep the senders you like, then open the rest in one new window, one tab per sender.

## Install

Build the extension into `dist/` (generated files are not committed, so fresh checkouts need this step):

```sh
devenv shell
npm ci
npm run build
```

If `devenv` is not installed, start it with `nix run nixpkgs#devenv -- shell`. Node.js 22.12+ also works without devenv. The checked-in `devenv.lock` pins the Nix environment; `package-lock.json` pins JavaScript dependencies.

### Automatic shell setup with direnv

Install `pkgs.devenv` in your system Nix configuration or Home Manager's `home.packages`, rebuild, and ensure `devenv` is on your shell's `PATH`. With direnv hooked into your shell, run `direnv allow` in this repository. Node and npm will then load automatically when you enter it.

The repository's `.envrc` loads the integration explicitly:

```sh
eval "$(devenv direnvrc)"
use devenv
```

`use_devenv: command not found` means the helper was not loaded; installing the binary alone does not define that shell function. After changing `.envrc`, run `direnv allow` again. Verify activation with `direnv exec . node --version`.

### Load in Chrome

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select this repository's **dist** folder.
4. Pin **Unsubscribe Collector for Fastmail** in Chrome's extensions menu.
5. Reload any already-open Fastmail tabs.

After rebuilding, click the extension's **Reload** button on `chrome://extensions` and reload Fastmail.

## Use

- Read emails in Inbox (`https://app.fastmail.com/mail/Inbox/<message-id>`) or All Mail (`https://app.fastmail.com/mail/Archive/<message-id>`). Expanded messages with an unsubscribe link are captured automatically, including navigation within Fastmail without a full page reload.
- The extension icon shows the number of senders waiting for review; the badge disappears when there are none. Pin it to the toolbar to keep the count visible.
- Click the extension icon to open the full review tab. Chrome reuses the existing review tab when one is already open.
- **Read newsletter ↗** opens the email where that sender was first captured. The first source URL is never replaced by later messages. Older entries show **Source email not recorded**, since their original email cannot be reconstructed.
- Click **Keep** or press **d** for senders you want. They disappear from the review list, remain in **Kept**, and are never recaptured automatically.
- Click **To unsubscribe** or press **f** to mark a sender and dim its row. **Undo mark** removes the marker. Marks persist across browser restarts, but do not open links or change the pending status.
- The button fixed on the right shows the marked count. Click **Open N marked unsubscribe pages** or press **⌘ Enter** (**Ctrl Enter** also works) to open only marked senders in one new window. Unmarked senders remain for later. Finish each site's unsubscribe flow yourself.
- Successfully opened senders move to **Opened** so they are not offered repeatedly. This records opening a page, not confirmation of unsubscribing. **Review again** puts a kept or opened sender back into the queue with its marker cleared.
- Clicking an individual destination link opens just that page without changing its status.

Use **j** to move focus down and **k** to move it up; navigation stops at either end. The focused row shows shortcut hints. Marking or keeping a sender advances focus. Rows stay in place as you mark them; reopening or returning to the review tab sorts marked senders below unmarked ones. Shortcuts do not intercept typing in editable fields.

Deduplication uses the exact, case-insensitive sender domain, falling back to the normalized sender name when no email address is exposed. Subdomains are distinct. Different newsletters sharing one sender domain count as the same sender. The database is shared across Fastmail accounts in the same Chrome profile.

## Weekly reminder

A Chrome notification reminds you once per week, starting **Monday at 9 a.m. in your computer's local timezone**. If Chrome is closed or your computer is asleep then, it catches up when Chrome next starts or the missed alarm fires on wake. It checks the most recent Monday, so several missed weeks produce one reminder, not a backlog.

The delivery marker is saved locally and survives browser restarts and extension updates. An empty queue produces no reminder; adding pending senders later can trigger that week's reminder if it has not been delivered. A notification click opens the review page. Keeping or opening all pending senders clears the badge and any outstanding reminder.

Chrome notifications must be enabled in your operating system; Focus/Do Not Disturb can suppress them. The extension records successful creation of a notification, not whether you read it. It uses the `alarms` and `notifications` permissions; neither grants access to additional websites.

After updating, reload the extension at `chrome://extensions` and accept the additional permissions if Chrome prompts you.

## Access and privacy

- The only site matched by the content script is **https://app.fastmail.com/**. No wildcard domain, beta host, other Fastmail host, or unsubscribe destination is granted access.
- The script is registered across that origin so it can detect Fastmail's client-side navigation. It only extracts from **/mail/Inbox/<message-id>** and **/mail/Archive/<message-id>**, ignoring other folders, list views, settings, and other routes.
- Only expanded message cards are scanned. Draft cards, quoted messages, and explicitly hidden content are excluded.
- The database uses `chrome.storage.local`. It stores sender name, sender address, unsubscribe URL, first source-email URL, capture time, review status, and unsubscribe marker. The source URL retains only the Fastmail account selector (`u`) from its query string. It does not sync to a server or collect email bodies, subjects, account credentials, or API tokens.
- The extension makes no network requests to capture links and never clicks Fastmail's Unsubscribe button or submits an unsubscribe form. Opening saved URLs is a user action; some providers may unsubscribe immediately when their URL is opened.
- Uninstalling the extension removes its local database. Chrome's storage quota still applies; failures are reported without deliberately clearing saved data.

The committed `test-data/fastmail.html` and `test-data/allmail.html` are **redacted fixtures** based on the supplied pages. Message text, addresses, account/message identifiers, tracking links, and tokens were replaced with synthetic values. Scripts, styles, metadata, and external resource sources were removed. The original HTML was not committed or backed up by this project.

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

The browser test uses a fresh temporary profile, intercepts mail pages, and serves synthetic unsubscribe destinations on localhost. It does not connect to your mailbox or any real unsubscribe endpoint. It verifies capture from the redacted fixture, SPA navigation, keep decisions, deduplication, source-email links, keyboard triage, marked-only bulk opening, persistence across browser restarts, badge updates, and reminder alarm creation. OS notification delivery is stubbed to avoid alerting you during tests; reminder timing and delivery markers are covered by unit tests. Its screenshot is saved to `test-results/review.png`.

Use Playwright's bundled Chromium for extension tests. If you set `PLAYWRIGHT_BROWSERS_PATH`, use the same value for both browser installation and test execution. The local unsubscribe server is intentional: the initial navigation of a tab created through `chrome.windows.create` can race Playwright's request interception.

The browser test explicitly dispatches the tab-return focus event because Playwright emulates every page as focused. Unit tests also cover visibility changes and returning to an existing review session.

The production extension uses TypeScript and Vite without a UI framework. A single background service worker serializes all writes, so multiple Fastmail tabs cannot overwrite one another's captures. Chrome messaging accepts capture requests only from top-level Inbox or All Mail message pages; review actions come only from the extension's own page. The content script is bundled separately as an IIFE for Chrome's isolated world.

Chrome's `MessageSender.url` can retain the original document URL after Fastmail navigates with `history.pushState`. Capture authorization therefore checks Chrome's sender origin and top-frame identity together with the current Inbox or All Mail route supplied by the isolated content script. Keep the SPA browser regression test when changing this code.
