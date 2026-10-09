/**
 * Loading notebooks and HTML files: fetching them from the browser, the
 * errors that views show for them, and reading notebook JSON of any
 * nbformat. No DOM code, so unit tests can run it.
 */

import type * as nbformat from '@jupyterlab/nbformat';

import { upgradeNotebook } from './convert.ts';
import { normalizeNotebook } from './nbformat.ts';

/** A failure to load a notebook or file. */
export class LoadError extends Error {
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
    throw new LoadError(`Could not fetch ${url} from your browser.`, [
      [
        'The server may not allow cross-origin requests (CORS), or it may be ' +
          'unreachable. Your browser console may have more details.'
      ]
    ]);
  }
  if (!response.ok) {
    throw new LoadError(
      `${response.status} ${response.statusText} fetching ${url}`,
      [],
      response.status
    );
  }
  return response.text();
}

/**
 * Notebook JSON of nbformat 1 to 4, as nbformat 4 with what JupyterLab
 * expects filled in. `name` names the notebook in errors.
 */
export function parseNotebook(
  text: string,
  name: string
): nbformat.INotebookContent {
  let nb: any;
  try {
    nb = JSON.parse(text);
  } catch {
    throw new LoadError(`${name} is not a valid notebook (invalid JSON).`);
  }
  if (typeof nb !== 'object' || nb === null) {
    throw new LoadError(`${name} is not a valid notebook.`);
  }
  if (typeof nb.nbformat === 'number' && nb.nbformat < 4) {
    try {
      nb = upgradeNotebook(nb);
    } catch (err) {
      throw new LoadError(
        `${name} is not a valid notebook (${(err as Error).message}).`
      );
    }
  }
  if (!Array.isArray(nb.cells)) {
    throw new LoadError(`${name} is not a valid notebook (no cells).`);
  }
  return normalizeNotebook(nb);
}
