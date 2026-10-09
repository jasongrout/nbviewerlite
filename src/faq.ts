/**
 * The FAQ page (nbviewer's /faq), from faq.md. A separate chunk with the
 * Markdown parser, so other pages don't load it.
 */

import { marked } from 'marked';

import { setTitle } from './context.ts';
import source from './faq.md';
import { h, scrollToFragment } from './page.ts';
import { slugify, uniqueId } from './slug.ts';

import './faq.css';

export function showFaq(root: HTMLElement): void {
  setTitle('FAQ');
  const article = h('article', { class: 'nbv-faq' });
  // our own Markdown, not remote content: its HTML goes in as it is
  article.innerHTML = marked.parse(source, { async: false });

  // ids and anchor links for the headings, as nbviewer's FAQ has them
  const ids = new Set<string>();
  const questions: HTMLElement[] = [];
  for (const heading of article.querySelectorAll('h1, h2, h3')) {
    const text = heading.textContent ?? '';
    heading.id = uniqueId(slugify(text), ids);
    if (heading.tagName === 'H2') {
      questions.push(h('li', {}, h('a', { href: `#${heading.id}` }, text)));
    }
    heading.append(
      h(
        'a',
        {
          class: 'nbv-anchor',
          href: `#${heading.id}`,
          'aria-label': `Link to "${text}"`
        },
        '¶'
      )
    );
  }

  // [TOC] stands for the list of questions, as in Python-Markdown
  const toc = [...article.querySelectorAll('p')].find(
    p => p.textContent === '[TOC]'
  );
  toc?.replaceWith(
    h(
      'nav',
      { class: 'nbv-faq-toc', 'aria-label': 'Questions' },
      h('ul', {}, ...questions)
    )
  );

  root.replaceChildren(article);
  // the browser looked for the fragment before the headings existed
  scrollToFragment(root);
}
