/**
 * How a notebook's cells make up a reveal.js slideshow, following nbconvert:
 * the slide types (_RevealMetadataPreprocessor in exporters/slides.py) and
 * the reveal template's nesting (templates/reveal/base.html.j2):
 *
 *   <section>                    a slide
 *     <section>                  a subslide (reveal.js's vertical slides)
 *       cells
 *       <div class="fragment">   a fragment cell and the cells after it
 *       <aside class="notes">    a notes cell (speaker notes)
 *
 * Skipped cells are left out.
 */

import type * as nbformat from '@jupyterlab/nbformat';

/** Attributes from the starting cell's metadata.slideshow.data. */
export type SlideAttributes = Record<string, string>;

export interface ISlideCell {
  /** The cell's index in the notebook. */
  index: number;
  notes: boolean;
}

export interface IFragment {
  attributes: SlideAttributes;
  cells: ISlideCell[];
}

export interface ISubslide {
  attributes: SlideAttributes;
  content: (ISlideCell | IFragment)[];
}

export interface ISlide {
  attributes: SlideAttributes;
  subslides: ISubslide[];
}

/** metadata.slideshow.slide_type, with nbconvert's default '-'. */
function slideType(cell: nbformat.IBaseCell): unknown {
  const slideshow = cell.metadata?.slideshow;
  if (typeof slideshow !== 'object' || slideshow === null) {
    return '-';
  }
  return 'slide_type' in slideshow ? slideshow.slide_type : '-';
}

/**
 * metadata.slideshow.data as attributes: {background_color: 'red'} becomes
 * data-background-color="red" (the reveal template's cellslidedata).
 */
function slideAttributes(cell: nbformat.IBaseCell): SlideAttributes {
  const data = (cell.metadata?.slideshow as any)?.data;
  const attributes: SlideAttributes = {};
  if (typeof data === 'object' && data !== null) {
    for (const [key, value] of Object.entries(data)) {
      if (/^[\w-]+$/.test(key)) {
        attributes['data-' + key.replace(/_/g, '-')] = String(value);
      }
    }
  }
  return attributes;
}

/**
 * The slides of a notebook, or null if every cell is a notes or skipped
 * cell (nbconvert refuses those: "All cells are hidden").
 */
export function slideDeck(cells: nbformat.ICell[]): ISlide[] | null {
  const types = cells.map(slideType);
  // the first shown cell always starts a slide
  const first = types.findIndex(type => type !== 'notes' && type !== 'skip');
  if (first === -1) {
    return null;
  }
  const slides: ISlide[] = [];
  let subslide: ISubslide = { attributes: {}, content: [] };
  let fragment: IFragment | null = null;
  for (let index = first; index < cells.length; index++) {
    const type = index === first ? 'slide' : types[index];
    const attributes = slideAttributes(cells[index]);
    if (type === 'slide') {
      slides.push({ attributes, subslides: [] });
    }
    if (type === 'slide' || type === 'subslide') {
      subslide = { attributes, content: [] };
      slides[slides.length - 1].subslides.push(subslide);
      fragment = null;
    } else if (type === 'fragment') {
      fragment = { attributes, cells: [] };
      subslide.content.push(fragment);
    }
    if (type !== 'skip') {
      const cell = { index, notes: type === 'notes' };
      (fragment ? fragment.cells : subslide.content).push(cell);
    }
  }
  return slides;
}
