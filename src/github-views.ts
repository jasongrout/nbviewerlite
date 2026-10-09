/**
 * GitHub pages, matching nbviewer's GitHub provider
 * (nbviewer/providers/github/handlers.py).
 */

import {
  addNbviewerLink,
  type IContext,
  redirect,
  setTitle,
  showFailure,
  viewerUrl
} from './context.ts';
import {
  apiGet,
  blobUrl,
  contentsPath,
  GITHUB_URL,
  type IContentsEntry,
  rawUrl,
  repoFromApiUrl,
  sortEntries,
  treeUrl
} from './github.ts';
import {
  breadcrumbs,
  iconLink,
  type ILink,
  refMenu,
  table
} from './listing.ts';
import { showNotebook } from './notebook-view.ts';
import { addHeaderLink, h, showStatus } from './page.ts';
import { encodePath, githubPath } from './route.ts';

interface IRepoPath {
  user: string;
  repo: string;
  ref: string;
  path: string;
}

/** Breadcrumbs from the repo root down to `dir`. */
function repoCrumbs({ user, repo, ref }: IRepoPath, dir: string): ILink[] {
  const crumbs = [
    { url: viewerUrl(githubPath('tree', user, repo, ref, '')), name: repo }
  ];
  const parts = dir ? dir.split('/') : [];
  parts.forEach((name, i) => {
    const sub = parts.slice(0, i + 1).join('/');
    crumbs.push({
      url: viewerUrl(githubPath('tree', user, repo, ref, sub)),
      name
    });
  });
  return crumbs;
}

function binderUrl(
  ctx: IContext,
  { user, repo, ref }: IRepoPath,
  path?: string
) {
  const base = ctx.config.binderUrl;
  if (!base) {
    return null;
  }
  const url = `${base}/gh/${encodeURIComponent(user)}/${encodeURIComponent(repo)}/${encodePath(ref)}`;
  return path ? `${url}?filepath=${encodePath(path)}` : url;
}

function addCommonLinks(
  ctx: IContext,
  githubUrl: string,
  executorUrl: string | null
) {
  addHeaderLink(githubUrl, 'View on GitHub', 'launch');
  if (executorUrl) {
    addHeaderLink(executorUrl, 'Execute on Binder', 'launch');
  }
  addNbviewerLink(ctx);
}

/**
 * Whether `path` is a directory: one Contents API request. Redirects to its
 * listing if so.
 */
async function redirectIfDirectory(
  ctx: IContext,
  loc: IRepoPath
): Promise<boolean> {
  try {
    const { data } = await apiGet(contentsPath(loc.user, loc.repo, loc.path), {
      ref: loc.ref
    });
    if (Array.isArray(data)) {
      redirect(githubPath('tree', loc.user, loc.repo, loc.ref, loc.path));
      return true;
    }
  } catch {
    // report the original failure
  }
  return false;
}

/**
 * github/{user}/{repo}/blob/{ref}/{path}
 *
 * Notebooks are read from raw.githubusercontent.com, which needs no API
 * request. Other files open directly, as nbviewer serves them unchanged;
 * directories redirect to their listing.
 */
export async function showGithubBlob(
  ctx: IContext,
  loc: IRepoPath
): Promise<void> {
  const { user, repo, ref, path } = loc;
  const raw = rawUrl(user, repo, ref, path);
  const filename = path.split('/').pop() ?? path;

  if (!path.endsWith('.ipynb')) {
    setTitle(filename);
    showStatus(ctx.root, 'Loading…');
    const exists = await fetch(raw, {
      method: 'HEAD',
      credentials: 'omit'
    }).then(
      response => response.ok,
      () => false
    );
    if (exists) {
      window.location.replace(raw);
    } else if (!(await redirectIfDirectory(ctx, loc))) {
      showFailure(
        ctx,
        new Error(`${path} not found in ${user}/${repo} at ${ref}.`),
        [blobUrl(user, repo, ref, path), 'file on GitHub']
      );
    }
    return;
  }

  // Relative links: files in the repo open through this view, like in nbviewer.
  const rawBase = rawUrl(user, repo, ref, '');
  const linkFor = (absolute: string) => {
    if (!absolute.startsWith(rawBase)) {
      return absolute;
    }
    const rest = new URL(absolute).pathname.slice(
      new URL(rawBase).pathname.length
    );
    const target = rest
      .replace(/\/+$/, '')
      .split('/')
      .map(decodeURIComponent)
      .join('/');
    return viewerUrl(
      target
        ? githubPath('blob', user, repo, ref, target)
        : githubPath('tree', user, repo, ref, '')
    );
  };

  const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  await showNotebook(ctx, {
    url: raw,
    title: filename,
    linkFor,
    breadcrumbs: repoCrumbs(loc, dir),
    provider: [blobUrl(user, repo, ref, path), 'GitHub'],
    executorUrl: binderUrl(ctx, loc, path),
    onNotFound: () => redirectIfDirectory(ctx, loc)
  });
}

/** github/{user}/{repo}/tree/{ref}/{path}/ */
export async function showGithubTree(
  ctx: IContext,
  loc: IRepoPath
): Promise<void> {
  const { ref, path } = loc;
  setTitle(path ? `${loc.repo}/${path}` : `${loc.user}/${loc.repo}`);
  showStatus(ctx.root, 'Loading…');

  let contents: IContentsEntry[] | IContentsEntry;
  try {
    ({ data: contents } = await apiGet(contentsPath(loc.user, loc.repo, path), {
      ref
    }));
  } catch (err) {
    showFailure(ctx, err, [
      treeUrl(loc.user, loc.repo, ref, path),
      'directory on GitHub'
    ]);
    return;
  }
  if (!Array.isArray(contents)) {
    redirect(githubPath('blob', loc.user, loc.repo, ref, path));
    return;
  }

  // As in nbviewer, take user and repo from the API's URLs, which follow
  // renames.
  const { user, repo } = repoFromApiUrl(contents[0]?.url) ?? loc;
  const here: IRepoPath = { user, repo, ref, path };

  addCommonLinks(ctx, treeUrl(user, repo, ref, path), binderUrl(ctx, here));

  const parent = path
    ? iconLink(
        viewerUrl(
          githubPath(
            'tree',
            user,
            repo,
            ref,
            path.split('/').slice(0, -1).join('/')
          )
        ),
        'caretUp',
        '..'
      )
    : iconLink(
        viewerUrl(`github/${encodeURIComponent(user)}/`),
        'caretUp',
        `${user}'s repositories`
      );

  const icons = {
    dir: 'folder',
    notebook: 'notebook',
    file: 'file',
    submodule: 'folder'
  } as const;
  const rows = sortEntries(contents).map(({ entry, kind }) => {
    const url =
      kind === 'dir'
        ? viewerUrl(githubPath('tree', user, repo, ref, entry.path))
        : kind === 'notebook'
          ? viewerUrl(githubPath('blob', user, repo, ref, entry.path))
          : entry.html_url;
    return [iconLink(url, icons[kind], entry.name)];
  });

  const loadRefs = async () => {
    const repoApi = `repos/${encodeURIComponent(user)}/${encodeURIComponent(repo)}`;
    const [branches, tags] = await Promise.all([
      apiGet<{ name: string }[]>(`${repoApi}/branches`, { per_page: '100' }),
      apiGet<{ name: string }[]>(`${repoApi}/tags`, { per_page: '100' })
    ]);
    const toLinks = (refs: { name: string }[]) =>
      refs.map(({ name }) => ({
        name,
        url: viewerUrl(githubPath('tree', user, repo, name, path))
      }));
    return { branches: toLinks(branches.data), tags: toLinks(tags.data) };
  };

  ctx.root.replaceChildren(
    h(
      'div',
      { class: 'nbv-listing-header' },
      breadcrumbs(repoCrumbs(here, path)),
      refMenu(ref, loadRefs)
    ),
    table(['Name'], [[parent], ...rows])
  );
}

/** github/{user}/ : the user's repositories, most recently updated first. */
export async function showGithubUser(
  ctx: IContext,
  user: string
): Promise<void> {
  setTitle(`${user}'s repositories`);
  showStatus(ctx.root, 'Loading…');
  const page = new URLSearchParams(window.location.search).get('page');
  let response;
  try {
    response = await apiGet<{ name: string }[]>(
      `users/${encodeURIComponent(user)}/repos`,
      {
        sort: 'updated',
        ...(page ? { page } : {})
      }
    );
  } catch (err) {
    showFailure(ctx, err, [
      GITHUB_URL + encodeURIComponent(user),
      'user on GitHub'
    ]);
    return;
  }
  addHeaderLink(
    GITHUB_URL + encodeURIComponent(user),
    'View on GitHub',
    'launch'
  );
  addNbviewerLink(ctx);
  const rows = response.data.map(({ name }) => [
    iconLink(
      viewerUrl(
        `github/${encodeURIComponent(user)}/${encodeURIComponent(name)}/`
      ),
      'notebook',
      name
    )
  ]);
  ctx.root.replaceChildren(
    table(['Name'], rows, {
      prev: response.prevPage === null ? null : `?page=${response.prevPage}`,
      next: response.nextPage === null ? null : `?page=${response.nextPage}`
    })
  );
}

/** github/{user}/{repo}/ : redirect to the default branch's listing. */
export async function showGithubRepo(
  ctx: IContext,
  user: string,
  repo: string
): Promise<void> {
  setTitle(`${user}/${repo}`);
  showStatus(ctx.root, 'Loading…');
  try {
    const { data } = await apiGet<{
      name: string;
      owner: { login: string };
      default_branch: string;
    }>(`repos/${encodeURIComponent(user)}/${encodeURIComponent(repo)}`);
    redirect(
      githubPath('tree', data.owner.login, data.name, data.default_branch, '')
    );
  } catch (err) {
    showFailure(ctx, err, [
      `${GITHUB_URL}${encodeURIComponent(user)}/${encodeURIComponent(repo)}`,
      'repository on GitHub'
    ]);
  }
}
