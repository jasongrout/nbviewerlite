import {
  addNbviewerLink,
  type IContext,
  setTitle,
  showFailure,
  viewerUrl
} from './context.ts';
import { fileCrumbs, type IFileSource, loadFile } from './file-view.ts';
import { formatLinks } from './formats.ts';
import { parseNotebook } from './load.ts';
import {
  addHeaderLink,
  addMenuLink,
  h,
  link,
  scrollToFragment,
  showStatus
} from './page.ts';
import { SourceResolver } from './resolver.ts';

export interface INotebookSource extends IFileSource {
  /** Where the notebook lives; relative links and images resolve against it. */
  url: string;
  /** Where relative links in the notebook go; gets absolute URLs. */
  linkFor: (absoluteUrl: string) => string;
  /** "View on ..." header link: [url, provider name]. */
  provider?: [string, string];
  executorUrl?: string | null;
}

/**
 * Links that open the notebook in a JupyterLite site's JupyterLab and
 * Notebook apps, which download it from `url` in the browser
 * (jupyterlab-open-url-parameter's fromURL parameter), as this page did:
 * [url, app name].
 */
function jupyterliteLinks(site: string, url: string): [string, string][] {
  const base = site.replace(/\/?$/, '/');
  return [
    ['lab', 'JupyterLab'],
    ['notebooks', 'Jupyter Notebook']
  ].map(([app, name]) => {
    const link = new URL(`${app}/index.html`, base);
    link.searchParams.set('fromURL', url);
    return [link.href, name];
  });
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

  const nb = await loadFile(ctx, source, elsewhere, text =>
    parseNotebook(text, source.title)
  );
  if (nb === null) {
    return;
  }

  // Header: the kernel, the "Open in…" menu, the download link.
  const kernel = nb.metadata?.kernelspec?.display_name;
  if (kernel) {
    addHeaderLink(null, `${kernel} Kernel`, 'kernel');
  }
  for (const { path, name, icon } of formatLinks(
    nb,
    ctx.format,
    ctx.formatBase
  )) {
    addMenuLink('View as', viewerUrl(path), name, icon);
  }
  if (ctx.config.jupyterliteUrl) {
    for (const [url, name] of jupyterliteLinks(
      ctx.config.jupyterliteUrl,
      source.url
    )) {
      addMenuLink(
        'Run in',
        url,
        name,
        'launch',
        `Run in ${name}, in your browser (JupyterLite)`
      );
    }
  }
  if (source.executorUrl) {
    addMenuLink(
      'Run in',
      source.executorUrl,
      'Binder',
      'launch',
      'Execute on Binder'
    );
  }
  if (source.provider) {
    const [url, name] = source.provider;
    addMenuLink('View on', url, name, 'launch');
  }
  addNbviewerLink(ctx);
  addHeaderLink(source.url, 'Download Notebook', 'download');

  const crumbs = fileCrumbs(source);
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
