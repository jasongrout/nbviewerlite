/**
 * nbviewer's formats (nbviewer/formats.py): a notebook can be shown as a
 * notebook, as slides when it has slide metadata, and as a script; each
 * format's page links to the others.
 */

import type * as nbformat from '@jupyterlab/nbformat';

import type { IconName } from './icons.ts';
import { type Format, FORMATS } from './route.ts';

const LABELS: Record<Format, [string, IconName]> = {
  html: ['Notebook', 'notebook'],
  // JupyterLab has no slideshow icon; its run icon is a play button
  slides: ['Slides', 'run'],
  script: ['Code', 'code']
};

/**
 * nbviewer's test_slides: whether some cell has a slide type other than
 * '-'. A malformed slideshow entry fails the test, as nbviewer's exception
 * does.
 */
export function hasSlides(nb: nbformat.INotebookContent): boolean {
  for (const cell of nb.cells) {
    const metadata = cell.metadata ?? {};
    if (!('slideshow' in metadata)) {
      continue;
    }
    const slideshow = metadata.slideshow;
    if (typeof slideshow !== 'object' || slideshow === null) {
      return false;
    }
    if (('slide_type' in slideshow ? slideshow.slide_type : '-') !== '-') {
      return true;
    }
  }
  return false;
}

/**
 * Whether a link from a notebook or HTML file on a format/{name}/ page to
 * the file at `path` (a name or URL path) stays in the format. nbviewer.org
 * leaves these links relative, so notebooks open in the page's format, and
 * HTML files pass it on to their own links; nbviewer redirects directories
 * to their listing without it, and serves other files as they are.
 */
export function keepsFormat(path: string): boolean {
  return /\.(ipynb|html?)$/i.test(path);
}

export interface IFormatLink {
  /** Viewer path. */
  path: string;
  title: string;
  icon: IconName;
}

/**
 * "View as ..." links to the formats this notebook can be shown in, other
 * than the current one, in nbviewer's order (its notebook.html). `base` is
 * the viewer path without a format prefix.
 */
export function formatLinks(
  nb: nbformat.INotebookContent,
  current: Format,
  base: string
): IFormatLink[] {
  return FORMATS.filter(
    format => format !== current && (format !== 'slides' || hasSlides(nb))
  ).map(format => ({
    path: format === 'html' ? base : `format/${format}/${base}`,
    title: `View as ${LABELS[format][0]}`,
    icon: LABELS[format][1]
  }));
}
