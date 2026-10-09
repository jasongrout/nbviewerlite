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

/** Add a link to the header's link bar (nbviewer's navbar icons). */
export function addHeaderLink(
  href: string | null,
  title: string,
  iconName: IconName
): void {
  const bar = document.getElementById('nbv-links');
  if (!bar) {
    return;
  }
  const content = [
    icon(iconName),
    h('span', { class: 'nbv-link-text' }, title)
  ];
  bar.append(
    href === null
      ? h('span', { class: 'nbv-link', title }, ...content)
      : h('a', { class: 'nbv-link', href, title }, ...content)
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

/** The landing page: paste a URL (or GitHub name, gist id), go to its view. */
export function showHome(
  root: HTMLElement,
  toPath: (input: string) => string | null
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
    )
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
