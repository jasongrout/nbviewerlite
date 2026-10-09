import type * as nbformat from '@jupyterlab/nbformat';

import { type IContext, setTitle, showFailure } from './context.ts';
import { breadcrumbs, type ILink } from './listing.ts';
import { rejoinLines } from './nbformat.ts';
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
      `This notebook uses nbformat ${nb.nbformat}, which v2 does not render yet.`
    );
  }
  if (!Array.isArray(nb.cells)) {
    throw new NotebookError(`${name} is not a valid notebook (no cells).`);
  }
  return rejoinLines(nb);
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
    const elsewhere: [string, string] = source.provider
      ? [source.provider[0], `notebook on ${source.provider[1]}`]
      : [source.url, 'file itself'];
    showFailure(ctx, err, elsewhere, ...details);
    return;
  }

  // Header links, in nbviewer's order.
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
  if (ctx.nbviewerPage) {
    addHeaderLink(ctx.nbviewerPage.url, `View on ${ctx.nbviewerPage.label}`, 'launch');
  }
  addHeaderLink(source.url, 'Download Notebook', 'download');

  // Rendering code is a separate chunk, so listing, landing and error pages
  // stay light.
  const { renderNotebook } = await import(
    /* webpackChunkName: "render" */ './render.ts'
  );
  const host = h('div');
  root.replaceChildren(
    ...(source.breadcrumbs?.length ? [breadcrumbs(source.breadcrumbs)] : []),
    host
  );
  renderNotebook(nb, host, new SourceResolver(source.url, source.linkFor));
  scrollToFragment(root);
  window.addEventListener('hashchange', () => scrollToFragment(root));
}
