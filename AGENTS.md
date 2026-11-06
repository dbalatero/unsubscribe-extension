Main prompt of what we are building is in @MAIN_PROMPT.md

# Coding

- Use TypeScript to build
- Prefer tools like Vite as well
- Keep code idiomatic and easy to read
- Prefer simplest solutions
- Write 100% test coverage

# Project constraints

- Site access must remain limited to `https://app.fastmail.com/*`. Capture only on `/mail/Inbox/<message-id>` and `/mail/Archive/<message-id>` (All Mail) routes; ignore other folders and pages.
- Keep captures and review decisions local to the Chrome profile. Unsubscribe pages open only through user action; do not submit unsubscribe forms automatically.
- Redact real email HTML before committing fixtures: addresses, message content, account/message IDs, tracking URLs, and tokens can all be sensitive. Preserve DOM structure with synthetic values.
- Monday reminders are once-per-week catch-up reminders after 9 a.m. local time, with a persisted delivery marker. Preserve that behavior across sleep, restarts, and daylight-saving changes.

# Development

- See README.md for devenv/direnv setup and Chrome installation. Do not hardcode machine-specific Nix store or browser paths.
- Run `npm run check` for code changes; it enforces 100% coverage and builds `dist/`. Keep generated output out of git.
- Run `npm run test:e2e` for changes to capture, Chrome API integration, or review workflows. Use the isolated test profile and synthetic endpoints, not a personal browser profile or real unsubscribe links.
- Preserve the SPA navigation regression test: Chrome's sender URL can be stale after `pushState`, so authorization uses the browser-provided origin and the content script's current route.

# Commits

- Use conventional commit style
- Commit often and early
