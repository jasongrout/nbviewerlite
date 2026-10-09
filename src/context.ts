import { keepsFormat } from './formats.ts';
import { addHeaderLink, link, showError } from './page.ts';
import { type Format, splitFormat } from './route.ts';

export interface IConfig {
  /** Server-rendered nbviewer with the same URL scheme, or null. */
  nbviewerUrl: string | null;
  /** Binder URL base, e.g. "https://mybinder.org/v2", or null for no link. */
  binderUrl: string | null;
  /**
   * JupyterLite site that opens notebooks from a fromURL parameter, e.g.
   * "https://jupyter.org/try-jupyter/", or null for no links.
   */
  jupyterliteUrl: string | null;
}

export function readConfig(): IConfig {
  return {
    nbviewerUrl: BUILD_CONFIG.nbviewerUrl || null,
    binderUrl: BUILD_CONFIG.binderUrl || null,
    jupyterliteUrl: BUILD_CONFIG.jupyterliteUrl || null
  };
}

/** What every view gets. */
export interface IContext {
  root: HTMLElement;
  config: IConfig;
  /** The current viewer path, without the leading slash, still encoded. */
  path: string;
  /** How notebooks are shown: nbviewer's format/{name}/ paths. */
  format: Format;
  /** The viewer path without its format/{name}/ prefix. */
  formatBase: string;
  /** That prefix (e.g. 'format/slides/'), or '' for paths without one. */
  formatPrefix: string;
  /** The same page on the server-rendered nbviewer, if configured. */
  nbviewerPage: { url: string; label: string } | null;
}

export function createContext(root: HTMLElement, config: IConfig): IContext {
  const path = currentPath();
  const { format, base: formatBase } = splitFormat(path) ?? {
    format: 'html',
    base: path
  };
  const formatPrefix = path.slice(0, path.length - formatBase.length);
  let nbviewerPage = null;
  if (config.nbviewerUrl) {
    const base = config.nbviewerUrl.replace(/\/?$/, '/');
    nbviewerPage = { url: base + path, label: new URL(base).host };
  }
  return { root, config, path, format, formatBase, formatPrefix, nbviewerPage };
}

function currentPath(): string {
  return window.location.pathname.replace(/^\//, '');
}

/** The URL of a viewer path (no leading slash). */
export function viewerUrl(path: string): string {
  return '/' + path;
}

/**
 * The URL of a link from a notebook or HTML file to viewer path `path`,
 * which shows the file at `file` (a name or URL path): in the page's
 * format, as on nbviewer.org, if keepsFormat says so.
 */
export function contentLink(ctx: IContext, path: string, file: string): string {
  return viewerUrl((keepsFormat(file) ? ctx.formatPrefix : '') + path);
}

/**
 * Replace the current page with another viewer path, like an HTTP redirect.
 * Like nbviewer's redirects, it stays in the current format.
 */
export function redirect(path: string): void {
  const current = currentPath();
  const base = splitFormat(current)?.base ?? current;
  const prefix = current.slice(0, current.length - base.length);
  window.location.replace(
    viewerUrl(prefix + path) + window.location.search + window.location.hash
  );
}

/** Header link to the same page on the server-rendered nbviewer. */
export function addNbviewerLink(ctx: IContext): void {
  if (ctx.nbviewerPage) {
    addHeaderLink(
      ctx.nbviewerPage.url,
      `View on ${ctx.nbviewerPage.label}`,
      'launch'
    );
  }
}

export function setTitle(title: string): void {
  document.title = `${title} - nbviewer lite`;
}

/**
 * Show an error, with links to where the content can be seen instead:
 * `elsewhere` (e.g. the GitHub page) and the server-rendered nbviewer.
 */
export function showFailure(
  ctx: IContext,
  err: unknown,
  elsewhere: [string, string] | null,
  ...details: (Node | string)[][]
): void {
  const message = err instanceof Error ? err.message : String(err);
  // GitHub API errors say when an exceeded rate limit resets
  const reset = (err as { rateLimitReset?: Date | null } | null)
    ?.rateLimitReset;
  if (reset) {
    details = [[`It resets at ${reset.toLocaleTimeString()}.`], ...details];
  }
  // "See the page on GitHub, or view it on nbviewer.org."
  const alternatives: (Node | string)[] = [];
  if (elsewhere) {
    alternatives.push('See the ', link(elsewhere[0], elsewhere[1]));
  }
  const nbviewer = ctx.nbviewerPage;
  if (nbviewer) {
    alternatives.push(
      ...(alternatives.length
        ? [', or ', link(nbviewer.url, `view it on ${nbviewer.label}`)]
        : [link(nbviewer.url, `View it on ${nbviewer.label}`)])
    );
  }
  if (alternatives.length) {
    details = [...details, [...alternatives, '.']];
  }
  showError(ctx.root, message, ...details);
}
