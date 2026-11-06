import type { Entry, Reply, Request, Status } from './model';

export function mount(root: HTMLElement, send: (request: Request) => Promise<Reply>): { refresh: () => Promise<void> } {
  let entries: Entry[] = [];
  let view: Status = 'pending';
  let busy = false;
  let message = '';
  let error = '';
  let revision = 0;
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
  const render = () => {
    root.replaceChildren();
    const header = element('header');
    header.append(element('p', 'FASTMAIL · INBOX', 'eyebrow'), element('h1', 'A quieter inbox.'), element('p', 'Keep the senders you like. Take care of the rest.', 'muted'));
    const nav = element('nav');
    nav.setAttribute('aria-label', 'Sender lists');
    for (const [status, label] of [['pending', 'To review'], ['kept', 'Kept'], ['opened', 'Opened']] as const) {
      const tab = button(`${label} (${entries.filter(e => e.status === status).length})`, () => { view = status; message = ''; render(); });
      tab.setAttribute('aria-pressed', String(view === status));
      nav.append(tab);
    }
    root.append(header, nav);
    const notices = element('div', error || message);
    notices.setAttribute('role', error ? 'alert' : 'status');
    notices.className = error ? 'notice error' : 'notice';
    root.append(notices);
    const shown = entries.filter(e => e.status === view);
    if (!shown.length) {
      const empty = element('section', '', 'empty');
      empty.append(element('h2', view === 'pending' ? 'You’re all caught up.' : 'Nothing here yet.'), element('p', view === 'pending' ? 'Open emails in your Fastmail Inbox. Unsubscribe links will appear here automatically.' : 'Your saved decisions will appear here.', 'muted'));
      root.append(empty);
    }
    const list = element('ul', '', 'senders');
    for (const entry of shown) {
      const row = element('li');
      const details = element('div', '', 'sender');
      details.append(element('h2', entry.name), element('p', entry.email || entry.key.slice(5), 'muted'));
      const link = element('a', new URL(entry.url).hostname, 'destination');
      link.href = entry.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.title = 'Open this unsubscribe page';
      details.append(link);
      const action = view === 'pending'
        ? button('Keep', () => { void run({ type: 'status', key: entry.key, status: 'kept' }); }, 'keep')
        : button('Review again', () => { void run({ type: 'status', key: entry.key, status: 'pending' }); });
      row.append(details, action);
      list.append(row);
    }
    root.append(list);
    const footer = element('footer');
    if (view === 'pending') {
      const open = button(busy ? 'Working…' : `Open all ${shown.length} unsubscribe pages`, () => { void run({ type: 'open' }); }, 'primary');
      open.disabled = busy || shown.length === 0;
      footer.append(open, element('p', 'Opens one new window, one tab per sender. Complete each unsubscribe yourself.', 'muted fine'));
    } else if (view === 'opened') {
      footer.append(element('p', 'Opened does not mean unsubscribed. Use “Review again” if you still need to finish.', 'muted fine'));
    }
    footer.append(element('p', 'Saved only in this Chrome profile. Kept senders stay remembered.', 'muted fine'), button('Refresh', () => { void refresh(); }, 'refresh'));
    root.append(footer);
  };
  const run = async (request: Request) => {
    busy = true;
    error = '';
    message = '';
    render();
    const current = ++revision;
    try {
      const reply = await send(request);
      if (current !== revision) return;
      if (!reply.ok) throw new Error(reply.error);
      entries = reply.entries;
      if (reply.opened !== undefined) message = `Opened ${reply.opened} unsubscribe pages. Finish unsubscribing in the new window.`;
    } catch (cause) {
      if (current === revision) error = cause instanceof Error ? cause.message : 'Could not connect. Please try again.';
    } finally {
      if (current === revision) { busy = false; render(); }
    }
  };
  const refresh = () => run({ type: 'list' });
  void refresh();
  return { refresh };
}
