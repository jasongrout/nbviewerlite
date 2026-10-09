/**
 * format/slides/: the notebook as a reveal.js slideshow, like the one
 * nbviewer makes with nbconvert's reveal template.
 *
 * The notebook is rendered once with JupyterLab, as in the notebook view,
 * and each cell's node then moves into its slide. A single notebook widget
 * keeps what outputs share working as in the notebook view (one MathJax and
 * widget manager, JavaScript outputs that set up later ones). Skipped cells
 * stay behind in the hidden notebook, so their outputs still run.
 */

import type * as nbformat from '@jupyterlab/nbformat';
import type { IRenderMime } from '@jupyterlab/rendermime-interfaces';
import { Widget } from '@lumino/widgets';
import Reveal from 'reveal.js';
import RevealNotes from 'reveal.js/plugin/notes';

import { h } from './page.ts';
import { renderNotebook } from './render.ts';
import { type ISlide, type ISlideCell, slideDeck } from './slides.ts';

// after JupyterLab's styles (render.ts), which reveal.js's theme overrides
// as in nbconvert's slides
import 'reveal.js/reveal.css';
import './reveal-simple.css';
import './slides-view.css';
// The theme's fonts, from the site rather than Google Fonts. Every subset,
// as Google Fonts serves them: the browser fetches only those the text uses.
import '@fontsource/lato/400.css';
import '@fontsource/lato/400-italic.css';
import '@fontsource/lato/700.css';
import '@fontsource/lato/700-italic.css';
import '@fontsource/news-cycle/400.css';
import '@fontsource/news-cycle/700.css';

export async function showSlides(
  nb: nbformat.INotebookContent,
  root: HTMLElement,
  before: Node[],
  resolver: IRenderMime.IResolver
): Promise<void> {
  const deck = slideDeck(nb.cells);
  if (deck === null) {
    // nbconvert's error
    throw new Error('All cells are hidden, cannot create slideshow.');
  }
  // the speaker view shows this page in frames, without our header
  if (new URLSearchParams(window.location.search).has('receiver')) {
    document.body.classList.add('nbv-slides-receiver');
  }
  document.body.classList.add('nbv-slides-page');

  // JupyterLab's cell styles apply inside .jp-Notebook (nbconvert's reveal
  // template puts the class on the body)
  const slides = h('div', { class: 'slides jp-Notebook' });
  const reveal = h('div', { class: 'reveal' }, slides);
  const hidden = h('div', { hidden: '' });
  root.replaceChildren(
    ...before,
    h('div', { class: 'nbv-slides' }, reveal),
    hidden
  );
  const notebook = renderNotebook(nb, hidden, resolver);
  // The notebook puts its cells' nodes in place on its first update, which
  // would take them back out of the slides: run it now instead of on the
  // next frame.
  notebook.processMessage(Widget.Msg.UpdateRequest);
  const nodes = notebook.widgets.map(cell => cell.node);

  slides.append(...deckElements(deck, nodes));

  await new Reveal(reveal, {
    embedded: true,
    hash: true,
    slideNumber: 'c/t',
    plugins: [RevealNotes],
    // Lay out every slide, not only nearby ones, so that math and code
    // editors in the others can measure themselves as they render.
    viewDistance: Infinity,
    mobileViewDistance: Infinity,
    // No switch to the scroll view on narrow screens: switching back
    // rebuilds the slides from their HTML, losing the outputs' state.
    scrollActivationWidth: 0
  }).initialize();
}

/** The reveal template's sections, with the cells' nodes in them. */
function deckElements(deck: ISlide[], nodes: HTMLElement[]): HTMLElement[] {
  // The speaker view gets the notes' HTML without our styles, so it needs
  // this to hide the source editor of a rendered markdown cell.
  const notesStyle = '.lm-mod-hidden { display: none !important; }';
  const cell = ({ index, notes }: ISlideCell) =>
    notes
      ? h('aside', { class: 'notes' }, h('style', {}, notesStyle), nodes[index])
      : nodes[index];
  return deck.map(slide =>
    h(
      'section',
      slide.attributes,
      ...slide.subslides.map(subslide =>
        h(
          'section',
          subslide.attributes,
          ...subslide.content.map(item =>
            'cells' in item
              ? h(
                  'div',
                  { ...item.attributes, class: 'fragment' },
                  ...item.cells.map(cell)
                )
              : cell(item)
          )
        )
      )
    )
  );
}
