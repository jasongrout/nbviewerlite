import type * as nbformat from '@jupyterlab/nbformat';

import {
  addNbviewerLink,
  type IContext,
  setTitle,
  showFailure,
  viewerUrl
} from './context.ts';
import { formatLinks } from './formats.ts';
import { breadcrumbs, type ILink } from './listing.ts';
import { normalizeNotebook } from './nbformat.ts';
import {
  addHeaderLink,
  h,
  link,
  scrollToFragment,
  showStatus
} from './page.ts';
import { SourceResolver } from './resolver.ts';

/** A failure to load a notebook. */
export class NotebookError extends Error {
  readonly details: (Node | string)[][];
  /** HTTP status, when the fetch got a response. */
  readonly status: number | null;

  constructor(
    message: string,
    details: (Node | string)[][] = [],
    status: number | null = null
  ) {
    super(message);
    this.details = details;
    this.status = status;
  }
}

export async function fetchText(url: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, { credentials: 'omit' });
  } catch {
    throw new NotebookError(`Could not fetch ${url} from your browser.`, [
      [
        'The server may not allow cross-origin requests (CORS), or it may be ' +
          'unreachable. Your browser console may have more details.'
      ]
    ]);
  }
  if (!response.ok) {
    throw new NotebookError(
      `${response.status} ${response.statusText} fetching ${url}`,
      [],
      response.status
    );
  }
  return response.text();
}

export function parseNotebook(
  text: string,
  name: string
): nbformat.INotebookContent {
  let nb: any;
  try {
    nb = JSON.parse(text);
  } catch {
    throw new NotebookError(`${name} is not a valid notebook (invalid JSON).`);
  }
  if (typeof nb !== 'object' || nb === null) {
    throw new NotebookError(`${name} is not a valid notebook.`);
  }
  if (typeof nb.nbformat === 'number' && nb.nbformat < 4) {
    throw new NotebookError(
      `This notebook uses nbformat ${nb.nbformat}, which nbviewer lite does not render yet.`
    );
  }
  if (!Array.isArray(nb.cells)) {
    throw new NotebookError(`${name} is not a valid notebook (no cells).`);
  }
  return normalizeNotebook(nb);
}

export interface INotebookSource {
  /** Where the notebook lives; relative links and images resolve against it. */
  url: string;
  /** Page title, usually the file name. */
  title: string;
  /** The notebook's JSON text. Defaults to fetching `url`. */
  load?: () => Promise<string>;
  /** Where relative links in the notebook go; gets absolute URLs. */
  linkFor: (absoluteUrl: string) => string;
  breadcrumbs?: ILink[];
  /** "View on ..." header link: [url, provider name]. */
  provider?: [string, string];
  executorUrl?: string | null;
  /**
   * Called when loading fails with HTTP 404, before showing the error.
   * Returns true if it took over the page (e.g. redirected).
   */
  onNotFound?: () => Promise<boolean>;
}

export async function showNotebook(
  ctx: IContext,
  source: INotebookSource
): Promise<void> {
  const { root } = ctx;
  setTitle(source.title);
  showStatus(root, 'Loading notebook from ', link(source.url, source.url), '…');

  const elsewhere: [string, string] = source.provider
    ? [source.provider[0], `notebook on ${source.provider[1]}`]
    : [source.url, 'file itself'];

  let nb: nbformat.INotebookContent;
  try {
    const text = await (source.load ?? (() => fetchText(source.url)))();
    nb = parseNotebook(text, source.title);
  } catch (err) {
    if (
      err instanceof NotebookError &&
      err.status === 404 &&
      source.onNotFound &&
      (await source.onNotFound())
    ) {
      return;
    }
    const details = err instanceof NotebookError ? err.details : [];
    showFailure(ctx, err, elsewhere, ...details);
    return;
  }

  // Header links, in nbviewer's order.
  const otherFormats = formatLinks(nb, ctx.format, ctx.formatBase);
  for (const { path, title, icon } of otherFormats) {
    addHeaderLink(viewerUrl(path), title, icon);
  }
  const kernel = nb.metadata?.kernelspec?.display_name;
  if (kernel) {
    addHeaderLink(null, `${kernel} Kernel`, 'kernel');
  }
  if (source.provider) {
    const [url, name] = source.provider;
    addHeaderLink(url, `View on ${name}`, 'launch');
  }
  if (source.executorUrl) {
    addHeaderLink(source.executorUrl, 'Execute on Binder', 'launch');
  }
  addNbviewerLink(ctx);
  addHeaderLink(source.url, 'Download Notebook', 'download');

  const crumbs = source.breadcrumbs?.length
    ? [breadcrumbs(source.breadcrumbs)]
    : [];
  if (nb.cells.length === 0) {
    root.replaceChildren(
      ...crumbs,
      h('div', { class: 'nbv-status' }, 'This notebook has no cells.')
    );
    return;
  }

  const resolver = new SourceResolver(source.url, source.linkFor);
  try {
    // Rendering code is a separate chunk, so listing, landing and error
    // pages stay light; the other formats have their own.
    if (ctx.format === 'script') {
      const { showScript } = await import(
        /* webpackChunkName: "script" */ './script-view.ts'
      );
      await showScript(nb, root, crumbs, source.title);
      return;
    }
    if (ctx.format === 'slides') {
      const { showSlides } = await import(
        /* webpackChunkName: "slides" */ './slides-view.ts'
      );
      await showSlides(nb, root, crumbs, resolver);
      return;
    }
    const { renderNotebook } = await import(
      /* webpackChunkName: "render" */ './render.ts'
    );
    const host = h('div');
    root.replaceChildren(...crumbs, host);
    renderNotebook(nb, host, resolver);
  } catch (err) {
    showFailure(ctx, err, elsewhere);
    return;
  }

  // Fragment links, including ones JupyterLab leaves alone (bare '#',
  // non-ASCII ids) or marks to open in a new tab, scroll within the page.
  root.addEventListener('click', event => {
    const anchor = (event.target as Element | null)?.closest?.('a');
    const href = anchor?.getAttribute('href');
    if (!href?.startsWith('#') || event.defaultPrevented) {
      return;
    }
    event.preventDefault();
    history.pushState(null, '', href);
    if (href === '#') {
      window.scrollTo(0, 0);
    } else {
      scrollToFragment(root);
    }
  });
  scrollToFragment(root);
  window.addEventListener('hashchange', () => scrollToFragment(root));
}
