/**
 * The landing page's examples, as on nbviewer.org's front page: sections of
 * cards that link to notebooks here. frontpage.json and the thumbnails in
 * public/static/img/example-nb/ come from nbviewer's frontpage.json and
 * static/img/example-nb/ (see LICENSE), keeping only links nbviewer lite can
 * show, as paths on this site.
 */

import frontpage from './frontpage.json';
import { h } from './page.ts';

export function showcase(): HTMLElement {
  return h(
    'div',
    { class: 'nbv-showcase' },
    ...frontpage.sections.map(section =>
      h(
        'section',
        {},
        h('h2', {}, section.header),
        h(
          'ul',
          {},
          ...section.links.map(example =>
            h(
              'li',
              {},
              h(
                'a',
                { href: example.target },
                // the link's text names it; the thumbnail adds nothing to read
                h('img', {
                  src: example.img,
                  alt: '',
                  loading: 'lazy',
                  decoding: 'async'
                }),
                h('span', {}, example.text)
              )
            )
          )
        )
      )
    )
  );
}
