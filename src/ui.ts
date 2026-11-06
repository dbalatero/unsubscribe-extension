import type { Entry, Reply, Request, Status } from './model';

export function mount(root: HTMLElement, send: (request: Request) => Promise<Reply>) {
  let entries: Entry[] = [];
  let order: string[] = [];
  let selected: string | undefined;
  let view: Status = 'pending';
  let busy = false;
  let mutating = false;
  let refreshPending = false;
  let message = '';
  let error = '';
  let revision = 0;
  const shown = () => entries.filter(e => e.status === view).sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  const markedCount = () => entries.filter(e => e.status === 'pending' && e.toUnsubscribe).length;
  const element = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = '') => {
    const node = document.createElement(tag);
    node.textContent = text;
    node.className = className;
    return node;
  };
  const button = (label: string, action: () => void, className = '') => {
    const node = element('button', label, className);
    node.type = 'button';
    node.disabled = busy;
    node.addEventListener('click', action);
    return node;
  };
  const link = (label: string, href: string) => {
    const node = element('a', label, 'destination');
    node.href = href;
    node.target = '_blank';
    node.rel = 'noopener noreferrer';
    return node;
  };
  const paintFocus = (moveFocus = false) => {
    for (const row of root.querySelectorAll<HTMLElement>('[data-key]')) {
      const focused = row.dataset.key === selected;
      row.classList.toggle('focused', focused);
      row.tabIndex = focused ? 0 : -1;
      row.setAttribute('aria-current', String(focused));
      row.querySelector<HTMLElement>('.shortcuts')!.hidden = !focused;
      if (focused && moveFocus) {
        row.focus({ preventScroll: true });
        row.scrollIntoView({ block: 'nearest' });
      }
    }
  };
  const select = (key: string) => { selected = key; paintFocus(); };
  const decide = (entry: Entry, keep: boolean) => {
    const rows = shown();
    const index = rows.findIndex(e => e.key === entry.key);
    const next = rows[index + 1] || rows[keep ? index - 1 : index];
    void run(keep ? { type: 'status', key: entry.key, status: 'kept' } : { type: 'mark', key: entry.key, marked: true }, next?.key, true);
  };
  const render = (moveFocus = false) => {
    root.replaceChildren();
    const header = element('header');
    header.append(element('p', 'FASTMAIL · INBOX & ALL MAIL', 'eyebrow'), element('h1', 'A quieter inbox.'), element('p', 'Read a newsletter. Keep a favorite. Make room for the rest.', 'muted'));
    const nav = element('nav');
    nav.setAttribute('aria-label', 'Sender lists');
    for (const [status, label] of [['pending', 'To review'], ['kept', 'Kept'], ['opened', 'Opened']] as const) {
      const tab = button(`${label} (${entries.filter(e => e.status === status).length})`, () => { view = status; selected = undefined; message = ''; render(); });
      tab.setAttribute('aria-pressed', String(view === status));
      nav.append(tab);
    }
    root.append(header, nav);
    const notices = element('div', error || message, error ? 'notice error' : 'notice');
    notices.setAttribute('role', error ? 'alert' : 'status');
    root.append(notices);
    const rows = shown();
    if (!rows.some(e => e.key === selected)) selected = rows[0]?.key;
    if (!rows.length) {
      const empty = element('section', '', 'empty');
      empty.append(element('h2', view === 'pending' ? 'You’re all caught up.' : 'Nothing here yet.'), element('p', view === 'pending' ? 'Open emails in your Fastmail Inbox or All Mail. Unsubscribe links will appear here automatically.' : 'Your saved decisions will appear here.', 'muted'));
      root.append(empty);
    }
    const list = element('ul', '', 'senders');
    list.setAttribute('aria-label', 'Senders');
    for (const entry of rows) {
      const row = element('li', '', entry.toUnsubscribe ? 'marked' : '');
      row.dataset.key = entry.key;
      row.setAttribute('aria-label', entry.name);
      row.addEventListener('click', () => select(entry.key));
      row.addEventListener('focusin', () => select(entry.key));
      const content = element('div', '', 'row-content');
      const details = element('div', '', 'sender');
      details.append(element('h2', entry.name), element('p', entry.email || entry.key.slice(5), 'muted'));
      const links = element('div', '', 'links');
      if (entry.sourceUrl) links.append(link('Read newsletter ↗', entry.sourceUrl));
      else links.append(element('span', 'Source email not recorded', 'muted fine'));
      const destination = link(new URL(entry.url).hostname, entry.url);
      destination.title = 'Open this unsubscribe page';
      links.append(destination);
      details.append(links);
      const actions = element('div', '', 'row-actions');
      if (view === 'pending') {
        actions.append(entry.toUnsubscribe
          ? button('Undo mark', () => { void run({ type: 'mark', key: entry.key, marked: false }); })
          : button('To unsubscribe', () => decide(entry, false)));
        actions.append(button('Keep', () => decide(entry, true), 'keep'));
      } else {
        actions.append(button('Review again', () => { void run({ type: 'status', key: entry.key, status: 'pending' }); }));
      }
      content.append(details, actions);
      const shortcuts = element('div', '', 'shortcuts');
      shortcuts.append(element('span', 'j ↓   k ↑   Move focus'));
      if (view === 'pending') shortcuts.append(element('span', 'f  To unsubscribe'), element('span', 'd  To keep'));
      if (entry.toUnsubscribe) details.append(element('span', 'To unsubscribe', 'marker'));
      row.append(content, shortcuts);
      list.append(row);
    }
    root.append(list);
    const bulk = element('aside', '', 'bulk');
    bulk.setAttribute('aria-label', 'Bulk unsubscribe');
    const count = markedCount();
    const open = button(busy ? `Working… (${count} marked)` : `Open ${count} marked unsubscribe pages`, () => { void run({ type: 'open' }); }, 'primary');
    open.disabled = busy || count === 0;
    open.setAttribute('aria-keyshortcuts', 'Meta+Enter Control+Enter');
    bulk.append(open, element('p', '⌘ Enter · Ctrl Enter', 'shortcut-label'), element('p', 'Only marked senders. One new window, one tab each.', 'muted fine'));
    root.append(bulk);
    const footer = element('footer');
    if (view === 'opened') footer.append(element('p', 'Opened does not mean unsubscribed. Use “Review again” if you still need to finish.', 'muted fine'));
    footer.append(element('p', 'Saved in this Chrome profile. Marked senders sort to the bottom when you reopen this page.', 'muted fine'), button('Refresh', () => { void refresh(); }, 'refresh'));
    root.append(footer);
    paintFocus(moveFocus);
  };
  const run = async (request: Request, nextFocus?: string, moveFocus = false) => {
    busy = true;
    mutating = request.type !== 'list';
    error = '';
    if (mutating) message = '';
    render();
    const current = ++revision;
    try {
      const reply = await send(request);
      if (current !== revision) return;
      if (!reply.ok) throw new Error(reply.error);
      entries = reply.entries;
      if (!order.length) {
        order = [...entries].sort((a, b) => Number(Boolean(a.toUnsubscribe)) - Number(Boolean(b.toUnsubscribe))).map(e => e.key);
        selected = undefined;
      }
      for (const entry of entries) if (!order.includes(entry.key)) order.push(entry.key);
      if (moveFocus) selected = nextFocus;
      if (reply.opened !== undefined) message = `Opened ${reply.opened} unsubscribe pages. Finish unsubscribing in the new window.`;
    } catch (cause) {
      if (current === revision) error = cause instanceof Error ? cause.message : 'Could not connect. Please try again.';
    } finally {
      if (current === revision) {
        busy = false;
        mutating = false;
        render(moveFocus);
        if (refreshPending) { refreshPending = false; void refresh(); }
      }
    }
  };
  const refresh = async () => {
    if (mutating) { refreshPending = true; return; }
    await run({ type: 'list' });
  };
  const keydown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || busy || (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]'))) return;
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.altKey && !event.repeat && markedCount()) {
      event.preventDefault();
      void run({ type: 'open' });
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const rows = shown();
    const index = rows.findIndex(e => e.key === selected);
    if (index < 0) return;
    if (event.key === 'j' || event.key === 'k') {
      event.preventDefault();
      selected = rows[Math.max(0, Math.min(rows.length - 1, index + (event.key === 'j' ? 1 : -1)))].key;
      paintFocus(true);
    } else if (view === 'pending' && !event.repeat && (event.key === 'f' || event.key === 'd')) {
      event.preventDefault();
      decide(rows[index], event.key === 'd');
    }
  };
  document.addEventListener('keydown', keydown);
  void refresh();
  return {
    refresh,
    resume: () => { order = []; selected = undefined; return refresh(); },
    destroy: () => document.removeEventListener('keydown', keydown),
  };
}
