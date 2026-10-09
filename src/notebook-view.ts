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
import { fetchText, LoadError, parseNotebook } from './load.ts';
import {
  addHeaderLink,
  h,
  link,
  scrollToFragment,
  showStatus
} from './page.ts';
import { SourceResolver } from './resolver.ts';

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
      err instanceof LoadError &&
      err.status === 404 &&
      source.onNotFound &&
      (await source.onNotFound())
    ) {
      return;
    }
    const details = err instanceof LoadError ? err.details : [];
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
