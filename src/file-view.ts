/**
 * What the views of a single file, a notebook (notebook-view.ts) or an HTML
 * file (html-view.ts), share: loading it, or showing why that failed, and
 * the breadcrumbs above it.
 */

import { type IContext, showFailure } from './context.ts';
import { breadcrumbs, type ILink } from './listing.ts';
import { fetchText, LoadError } from './load.ts';

export interface IFileSource {
  /** Where the file lives. */
  url: string;
  /** The file name: the page title, and the last breadcrumb. */
  title: string;
  /** The file's text. Defaults to fetching `url`. */
  load?: () => Promise<string>;
  /** Links to the directories above the file, from the top. */
  breadcrumbs?: ILink[];
  /**
   * Called when loading fails with HTTP 404, before showing the error.
   * Returns true if it took over the page (e.g. redirected).
   */
  onNotFound?: () => Promise<boolean>;
}

/**
 * Load the file and `parse` it, or show why that failed, with a link to
 * `elsewhere`. Null after a failure, or when onNotFound took over.
 */
export async function loadFile<T>(
  ctx: IContext,
  source: IFileSource,
  elsewhere: [string, string],
  parse: (text: string) => T | Promise<T>
): Promise<T | null> {
  try {
    const text = await (source.load ?? (() => fetchText(source.url)))();
    return await parse(text);
  } catch (err) {
    if (
      err instanceof LoadError &&
      err.status === 404 &&
      source.onNotFound &&
      (await source.onNotFound())
    ) {
      return null;
    }
    const details = err instanceof LoadError ? err.details : [];
    showFailure(ctx, err, elsewhere, ...details);
    return null;
  }
}

/**
 * The breadcrumbs above the file: its directories, if it has any, and its
 * name.
 */
export function fileCrumbs(source: IFileSource): HTMLElement[] {
  const dirs = source.breadcrumbs ?? [];
  return dirs.length || source.title ? [breadcrumbs(dirs, source.title)] : [];
}
