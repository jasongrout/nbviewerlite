/**
 * Navigation and listing elements.
 */

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
