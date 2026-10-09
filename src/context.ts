import { link, showError } from './page.ts';

export interface IConfig {
  /** Server-rendered nbviewer with the same URL scheme, or null. */
  nbviewerUrl: string | null;
  /** Binder URL base, e.g. "https://mybinder.org/v2", or null for no link. */
  binderUrl: string | null;
}

export function readConfig(): IConfig {
  return {
    nbviewerUrl: BUILD_CONFIG.nbviewerUrl || null,
    binderUrl: BUILD_CONFIG.binderUrl || null
  };
}

/** What every view gets. */
export interface IContext {
  root: HTMLElement;
  config: IConfig;
  /** The current viewer path, without the leading slash, still encoded. */
  path: string;
  /** The same page on the server-rendered nbviewer, if configured. */
  nbviewerPage: { url: string; label: string } | null;
}

export function createContext(root: HTMLElement, config: IConfig): IContext {
  const path = window.location.pathname.replace(/^\//, '');
  let nbviewerPage = null;
  if (config.nbviewerUrl) {
    const base = config.nbviewerUrl.replace(/\/?$/, '/');
    nbviewerPage = { url: base + path, label: new URL(base).host };
  }
  return { root, config, path, nbviewerPage };
}

/** The URL of a viewer path (no leading slash). */
export function viewerUrl(path: string): string {
  return '/' + path;
}

/** Replace the current page with another viewer path, like an HTTP redirect. */
export function redirect(path: string): void {
  window.location.replace(
    viewerUrl(path) + window.location.search + window.location.hash
  );
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
  const reset = (err as { rateLimitReset?: Date | null } | null)?.rateLimitReset;
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
