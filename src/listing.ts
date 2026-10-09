/**
 * Navigation and listing elements (nbviewer's treelist.html and
 * tabular.html).
 */

import { icon, type IconName } from './icons.ts';
import { h } from './page.ts';

export interface ILink {
  url: string;
  name: string;
}

export function breadcrumbs(crumbs: ILink[]): HTMLElement {
  return h(
    'nav',
    { class: 'nbv-breadcrumbs', 'aria-label': 'Breadcrumb' },
    h(
      'ol',
      {},
      ...crumbs.map(crumb => h('li', {}, h('a', { href: crumb.url }, crumb.name)))
    )
  );
}

/** A link with an icon, or plain text when there is no URL. */
export function iconLink(
  url: string | null,
  iconName: IconName,
  text: string
): HTMLElement {
  const content = [icon(iconName), h('span', {}, text)];
  return url === null
    ? h('span', { class: 'nbv-icon-link' }, ...content)
    : h('a', { class: 'nbv-icon-link', href: url }, ...content);
}

export function table(
  headers: string[],
  rows: (Node | string)[][],
  pages: { prev: string | null; next: string | null } = {
    prev: null,
    next: null
  }
): HTMLElement {
  const body = rows.map(cells =>
    h('tr', {}, ...cells.map(cell => h('td', {}, cell)))
  );
  if (pages.prev !== null || pages.next !== null) {
    const links: (Node | string)[] = [];
    if (pages.prev !== null) {
      links.push(h('a', { href: pages.prev, rel: 'prev' }, '‹ prev'));
    }
    if (pages.prev !== null && pages.next !== null) {
      links.push(' … ');
    }
    if (pages.next !== null) {
      links.push(h('a', { href: pages.next, rel: 'next' }, 'next ›'));
    }
    body.push(
      h(
        'tr',
        {},
        h(
          'td',
          { class: 'nbv-page-links', colspan: String(headers.length) },
          ...links
        )
      )
    );
  }
  return h(
    'table',
    { class: 'nbv-table' },
    h('thead', {}, h('tr', {}, ...headers.map(name => h('th', {}, name)))),
    h('tbody', {}, ...body)
  );
}

/**
 * The branch/tag menu of a directory listing. Its contents load the first
 * time it opens, which saves two API requests per listing.
 */
export function refMenu(
  current: string,
  load: () => Promise<{ branches: ILink[]; tags: ILink[] }>
): HTMLElement {
  const toggle = h(
    'button',
    {
      type: 'button',
      class: 'nbv-refmenu-toggle',
      'aria-haspopup': 'true',
      'aria-expanded': 'false'
    },
    current,
    icon('caretDown')
  );
  const content = h('div', { class: 'nbv-refmenu-content' }, 'Loading…');
  const menu = h('div', { class: 'nbv-refmenu-popup', hidden: '' }, content);
  const container = h('div', { class: 'nbv-refmenu' }, toggle, menu);

  let loaded = false;
  const setOpen = (open: boolean) => {
    menu.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  };
  toggle.addEventListener('click', () => {
    setOpen(menu.hidden);
    if (loaded) {
      return;
    }
    loaded = true;
    load().then(
      ({ branches, tags }) =>
        content.replaceChildren(
          refList('Branches', branches),
          refList('Tags', tags)
        ),
      (err: Error) => {
        loaded = false;
        content.replaceChildren(err.message);
      }
    );
  });
  document.addEventListener('click', event => {
    if (!container.contains(event.target as Node)) {
      setOpen(false);
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      setOpen(false);
    }
  });
  return container;
}

function refList(label: string, refs: ILink[]): HTMLElement {
  return h(
    'div',
    { class: 'nbv-refmenu-list' },
    h('h2', {}, label),
    h(
      'ul',
      {},
      ...refs.map(ref => h('li', {}, h('a', { href: ref.url }, ref.name)))
    )
  );
}
