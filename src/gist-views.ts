/**
 * Gist pages, matching nbviewer's gist provider
 * (nbviewer/providers/gist/handlers.py).
 */

import {
  addNbviewerLink,
  type IContext,
  redirect,
  setTitle,
  showFailure,
  viewerUrl
} from './context.ts';
import { apiGet, GIST_URL, gistFileAnchor } from './github.ts';
import { iconLink, table } from './listing.ts';
import { fetchText, showNotebook } from './notebook-view.ts';
import { addHeaderLink, h, showStatus } from './page.ts';
import { gistPath } from './route.ts';

interface IGistFile {
  filename: string;
  raw_url: string;
  /** Inline content, cut off for large files (see `truncated`). */
  content?: string;
  truncated?: boolean;
}

interface IGist {
  id: string;
  html_url: string;
  description: string | null;
  owner?: { login: string } | null;
  files: Record<string, IGistFile>;
}

function binderUrl(ctx: IContext, user: string, id: string, filename?: string) {
  const base = ctx.config.binderUrl;
  if (!base) {
    return null;
  }
  const url = `${base}/gist/${encodeURIComponent(user)}/${id}/master`;
  return filename ? `${url}?filepath=${encodeURIComponent(filename)}` : url;
}

/**
 * gist/{user}/{id}[/{filename}]: one notebook, or the file list of a gist
 * with several files.
 */
export async function showGist(
  ctx: IContext,
  routeUser: string | null,
  id: string,
  filename: string
): Promise<void> {
  setTitle(filename || `gist ${id}`);
  showStatus(ctx.root, 'Loading…');
  let gist: IGist;
  try {
    ({ data: gist } = await apiGet<IGist>(`gists/${id}`));
  } catch (err) {
    showFailure(ctx, err, [GIST_URL + id, 'gist on GitHub']);
    return;
  }

  if (routeUser === null) {
    // like nbviewer: put the owner in the URL
    redirect(gistPath(gist.owner?.login ?? 'anonymous', gist.id, filename));
    return;
  }
  const user = routeUser;
  const names = Object.keys(gist.files);
  const manyFiles = names.length > 1;

  if (manyFiles && !filename) {
    showGistFiles(ctx, user, gist);
    return;
  }

  const name = filename || names[0];
  const file = gist.files[name];
  if (!file) {
    showFailure(ctx, new Error(`No such file in gist: ${name}`), [
      gist.html_url,
      'gist on GitHub'
    ]);
    return;
  }
  if (manyFiles && !name.endsWith('.ipynb')) {
    // nbviewer serves other files of a gist unchanged
    window.location.replace(file.raw_url);
    return;
  }

  await showNotebook(ctx, {
    url: file.raw_url,
    title: name,
    load: async () =>
      file.truncated || file.content === undefined
        ? fetchText(file.raw_url)
        : file.content,
    // gists are flat: a relative link to another notebook names a file in it
    linkFor: absolute => {
      const target = decodeURIComponent(
        new URL(absolute).pathname.split('/').pop() ?? ''
      );
      return target in gist.files && target.endsWith('.ipynb')
        ? viewerUrl(gistPath(user, gist.id, target))
        : absolute;
    },
    provider: [gist.html_url, 'Gist'],
    executorUrl: binderUrl(ctx, user, gist.id, name)
  });
}

function showGistFiles(ctx: IContext, user: string, gist: IGist): void {
  addHeaderLink(gist.html_url, 'View on Gist', 'launch');
  const executorUrl = binderUrl(ctx, user, gist.id);
  if (executorUrl) {
    addHeaderLink(executorUrl, 'Execute on Binder', 'launch');
  }
  addNbviewerLink(ctx);

  // notebooks first, then the other files, which link to the gist page
  const files = Object.values(gist.files);
  const notebooks = files.filter(f => f.filename.endsWith('.ipynb'));
  const others = files.filter(f => !f.filename.endsWith('.ipynb'));
  const rows = [
    [
      iconLink(
        viewerUrl(`gist/${encodeURIComponent(user)}/`),
        'caretUp',
        `${user}'s gists`
      )
    ],
    ...notebooks.map(f => [
      iconLink(
        viewerUrl(gistPath(user, gist.id, f.filename)),
        'notebook',
        f.filename
      )
    ]),
    ...others.map(f => [
      iconLink(
        `${GIST_URL}${encodeURIComponent(user)}/${gist.id}#${gistFileAnchor(f.filename)}`,
        'file',
        f.filename
      )
    ])
  ];
  ctx.root.replaceChildren(table(['Name'], rows));
}

/** gist/{user}/ : the user's gists that contain notebooks. */
export async function showGistUser(ctx: IContext, user: string): Promise<void> {
  setTitle(`${user}'s gists`);
  showStatus(ctx.root, 'Loading…');
  const page = new URLSearchParams(window.location.search).get('page');
  let response;
  try {
    response = await apiGet<IGist[]>(
      `users/${encodeURIComponent(user)}/gists`,
      page ? { page } : {}
    );
  } catch (err) {
    showFailure(ctx, err, [
      GIST_URL + encodeURIComponent(user),
      'gists on GitHub'
    ]);
    return;
  }
  addHeaderLink(GIST_URL + encodeURIComponent(user), 'View on Gist', 'launch');
  addNbviewerLink(ctx);

  const rows = response.data
    .map(gist => ({
      gist,
      notebooks: Object.keys(gist.files).filter(n => n.endsWith('.ipynb'))
    }))
    .filter(({ notebooks }) => notebooks.length)
    .map(({ gist, notebooks }) => [
      h('a', { href: viewerUrl(gistPath(user, gist.id)) }, gist.id),
      h(
        'span',
        {},
        ...notebooks.map(name =>
          iconLink(viewerUrl(gistPath(user, gist.id, name)), 'notebook', name)
        )
      ),
      h('span', { class: 'nbv-gist-description' }, gist.description ?? '')
    ]);
  ctx.root.replaceChildren(
    table(['Name', 'Notebooks', 'Description'], rows, {
      prev: response.prevPage === null ? null : `?page=${response.prevPage}`,
      next: response.nextPage === null ? null : `?page=${response.nextPage}`
    })
  );
}
