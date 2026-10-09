/**
 * Page chrome. Remote strings are only ever inserted as text, never as HTML.
 */

import { icon, type IconName } from './icons.ts';

type Child = Node | string;

export function h(
  tag: string,
  attrs: Record<string, string> = {},
  ...children: Child[]
): HTMLElement {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  el.append(...children);
  return el;
}

export function link(href: string, text: string): HTMLElement {
  return h('a', { href }, text);
}

/**
 * A button that shows `popup` below it. Another click on it, a click
 * elsewhere, Escape, or tabbing out hides it. `onOpen` runs each time it
 * opens.
 */
export function dropdown(
  label: Child[],
  popup: HTMLElement,
  onOpen?: () => void
): HTMLElement {
  const toggle = h(
    'button',
    { type: 'button', class: 'nbv-menu-toggle', 'aria-expanded': 'false' },
    ...label,
    icon('caretDown')
  );
  popup.classList.add('nbv-menu-popup');
  popup.hidden = true;
  const container = h('div', { class: 'nbv-menu' }, toggle, popup);

  const setOpen = (open: boolean) => {
    popup.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) {
      // from the button's left edge, or its right one if that fits better
      popup.classList.remove('nbv-menu-popup-end');
      popup.classList.toggle(
        'nbv-menu-popup-end',
        popup.getBoundingClientRect().right >
          document.documentElement.clientWidth
      );
    }
  };
  toggle.addEventListener('click', () => {
    const open = popup.hidden;
    setOpen(open);
    if (open) {
      onOpen?.();
    }
  });
  document.addEventListener('click', event => {
    if (!container.contains(event.target as Node)) {
      setOpen(false);
    }
  });
  // Focus moving to another element: clicks elsewhere move it to nothing
  // (or, in Safari, a click on the button moves it out of the popup).
  container.addEventListener('focusout', event => {
    const next = event.relatedTarget;
    if (next instanceof Node && !container.contains(next)) {
      setOpen(false);
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !popup.hidden) {
      // not for the page too (reveal.js's slide overview)
      event.preventDefault();
      const focused = container.contains(document.activeElement);
      setOpen(false);
      if (focused) {
        toggle.focus();
      }
    }
  });
  return container;
}

/** The groups of the header's "Open in…" menu, in their order. */
const MENU_GROUPS = ['View as', 'Run in', 'View on'] as const;
export type MenuGroup = (typeof MENU_GROUPS)[number];

/**
 * Add a link to the header's "Open in…" menu (nbviewer's navbar icons for
 * the other formats and other sites), under the heading `group`, which
 * `name` completes: "View on" "GitHub". `title` is its tooltip.
 */
export function addMenuLink(
  group: MenuGroup,
  href: string,
  name: string,
  iconName: IconName,
  title = `${group} ${name}`
): void {
  const bar = document.getElementById('nbv-links');
  if (!bar) {
    return;
  }
  let menu = bar.querySelector('.nbv-open-menu');
  if (!menu) {
    menu = h('div', { class: 'nbv-open-menu' });
    bar.append(dropdown(['Open in…'], menu as HTMLElement));
  }
  const index = MENU_GROUPS.indexOf(group);
  let list = menu.querySelector(`[data-group="${index}"] ul`);
  if (!list) {
    const heading = `nbv-open-menu-${index}`;
    list = h('ul', { 'aria-labelledby': heading });
    const next = [...menu.children].find(
      section => Number((section as HTMLElement).dataset.group) > index
    );
    menu.insertBefore(
      h(
        'div',
        { class: 'nbv-menu-group', 'data-group': String(index) },
        h('div', { class: 'nbv-menu-heading', id: heading }, group),
        list
      ),
      next ?? null
    );
  }
  list.append(
    h(
      'li',
      {},
      h('a', { class: 'nbv-link', href, title }, icon(iconName), name)
    )
  );
}

/**
 * Add an item to the end of the header's link bar (where the "Open in…"
 * menu also goes, with its first link): a label (`href` null) or a link,
 * optionally one that downloads a file with the given name.
 */
export function addHeaderLink(
  href: string | null,
  title: string,
  iconName: IconName,
  download?: string
): void {
  const bar = document.getElementById('nbv-links');
  if (!bar) {
    return;
  }
  const content = [
    icon(iconName),
    h('span', { class: 'nbv-link-text' }, title)
  ];
  const attrs: Record<string, string> =
    download === undefined ? {} : { download };
  bar.append(
    href === null
      ? h('span', { class: 'nbv-link', title }, ...content)
      : h('a', { class: 'nbv-link', href, title, ...attrs }, ...content)
  );
}

/** Replace the page content with a status message. */
export function showStatus(root: HTMLElement, ...children: Child[]): void {
  root.replaceChildren(h('div', { class: 'nbv-status' }, ...children));
}

/** Replace the page content with an error message. */
export function showError(
  root: HTMLElement,
  title: string,
  ...details: Child[][]
): void {
  root.replaceChildren(
    h(
      'div',
      { class: 'nbv-error', role: 'alert' },
      h('strong', {}, title),
      ...details.map(line => h('p', {}, ...line))
    )
  );
}

/**
 * The landing page: paste a URL (or GitHub name, gist id), go to its view.
 * `below` follows the form (the examples).
 */
export function showHome(
  root: HTMLElement,
  toPath: (input: string) => string | null,
  ...below: Node[]
): void {
  const input = h('input', {
    type: 'text',
    name: 'url',
    placeholder: 'URL | GitHub username | GitHub username/repo | Gist ID',
    'aria-label': 'Notebook URL, GitHub user or repository, or Gist ID'
  }) as HTMLInputElement;
  const message = h('p', { class: 'nbv-home-message', role: 'status' });
  const form = h(
    'form',
    { class: 'nbv-home-form' },
    input,
    h('button', { type: 'submit' }, 'Go!')
  );
  form.addEventListener('submit', event => {
    event.preventDefault();
    const path = toPath(input.value);
    if (path === null) {
      message.textContent =
        'Enter a URL, a GitHub user or repository, or a Gist ID.';
      return;
    }
    window.location.assign(path);
  });
  root.replaceChildren(
    h(
      'div',
      { class: 'nbv-home' },
      h('h1', {}, 'nbviewer lite'),
      h(
        'p',
        {},
        'A simple way to share Jupyter notebooks. This version of ',
        link('https://nbviewer.org', 'nbviewer'),
        ' fetches and renders notebooks in your browser (',
        link('/faq', 'FAQ'),
        ').'
      ),
      form,
      message
    ),
    ...below
  );
  input.focus();
}

/**
 * Scroll to the element named by the URL fragment, and keep it in place
 * while the cells above it finish rendering (math, images), until the user
 * scrolls. JupyterLab keeps header anchors in data-jupyter-id rather than
 * id, so the browser can't do this itself.
 */
export function scrollToFragment(root: HTMLElement): void {
  const fragment = window.location.hash.slice(1);
  let id = fragment;
  try {
    id = decodeURIComponent(fragment);
  } catch {
    // not percent-encoded UTF-8: use it as it is
  }
  if (!id) {
    return;
  }
  const escaped = CSS.escape(id);
  const selector =
    `[data-jupyter-id="${escaped}"], [id="${escaped}"], ` +
    `a[name="${escaped}"]`;
  // Not scrollIntoView: JupyterLab's nested overflow containers make it
  // ignore scroll margins.
  const scroll = () => {
    const target = root.querySelector(selector);
    if (target) {
      window.scrollTo(
        0,
        target.getBoundingClientRect().top + window.scrollY - 8
      );
    }
  };
  const observer = new ResizeObserver(scroll);
  observer.observe(root);

  const userEvents = ['wheel', 'touchstart', 'keydown', 'mousedown'];
  const stop = () => {
    observer.disconnect();
    for (const name of userEvents) {
      window.removeEventListener(name, stop);
    }
  };
  for (const name of userEvents) {
    window.addEventListener(name, stop, { passive: true });
  }
  setTimeout(stop, 10000);
}
