/**
 * GitHub API requests and URLs, made from the visitor's browser.
 *
 * Requests are plain GETs with no custom headers, so they need no CORS
 * preflight and the browser's HTTP cache revalidates them with ETags.
 * Unauthenticated, GitHub allows 60 API requests per hour per IP.
 */

import { encodePath } from './route.ts';

export const GITHUB_URL = 'https://github.com/';
export const GITHUB_API_URL = 'https://api.github.com/';
export const GIST_URL = 'https://gist.github.com/';
const RAW_URL = 'https://raw.githubusercontent.com/';

export class GitHubError extends Error {
  readonly status: number;
  /** When the rate limit resets, if it was exceeded. */
  readonly rateLimitReset: Date | null;

  constructor(message: string, status: number, rateLimitReset: Date | null = null) {
    super(message);
    this.status = status;
    this.rateLimitReset = rateLimitReset;
  }
}

export interface IApiResponse<T> {
  data: T;
  /** `page` query values of the previous and next pages, if any. */
  prevPage: string | null;
  nextPage: string | null;
}

/**
 * GET an API path (e.g. "repos/{user}/{repo}"), already percent-encoded.
 */
export async function apiGet<T = any>(
  path: string,
  params: Record<string, string> = {}
): Promise<IApiResponse<T>> {
  const url = new URL(path, GITHUB_API_URL);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  let response: Response;
  try {
    response = await fetch(url.href, { credentials: 'omit' });
  } catch {
    throw new GitHubError('Could not reach the GitHub API.', 0);
  }
  if (!response.ok) {
    throw await apiError(response);
  }
  const links = parseLinkHeader(response.headers.get('Link') ?? '');
  return {
    data: await response.json(),
    prevPage: links.prev ?? null,
    nextPage: links.next ?? null
  };
}

async function apiError(response: Response): Promise<GitHubError> {
  let message = `${response.status} ${response.statusText}`;
  try {
    const body = await response.json();
    if (body?.message) {
      message = `${response.status}: ${body.message}`;
    }
  } catch {
    // keep the status line
  }
  const remaining = response.headers.get('X-RateLimit-Remaining');
  const reset = response.headers.get('X-RateLimit-Reset');
  if ((response.status === 403 || response.status === 429) && remaining === '0') {
    const resetDate = reset ? new Date(Number(reset) * 1000) : null;
    return new GitHubError(
      'GitHub API rate limit exceeded for your network.',
      response.status,
      resetDate
    );
  }
  return new GitHubError(message, response.status);
}

/** Map rel names to `page` values from a GitHub Link header. */
export function parseLinkHeader(header: string): Record<string, string> {
  const pages: Record<string, string> = {};
  for (const part of header.split(',')) {
    const match = /<([^>]*)>\s*;\s*rel="?([^";]+)"?/.exec(part);
    if (!match) {
      continue;
    }
    try {
      const page = new URL(match[1]).searchParams.get('page');
      if (page) {
        pages[match[2]] = page;
      }
    } catch {
      // ignore malformed links
    }
  }
  return pages;
}

// GitHub's own URLs take refs that contain slashes (feature/x) unescaped.

export function rawUrl(user: string, repo: string, ref: string, path: string) {
  return `${RAW_URL}${enc(user)}/${enc(repo)}/${encodePath(ref)}/${encodePath(path)}`;
}

export function blobUrl(user: string, repo: string, ref: string, path: string) {
  return `${GITHUB_URL}${enc(user)}/${enc(repo)}/blob/${encodePath(ref)}/${encodePath(path)}`;
}

export function treeUrl(user: string, repo: string, ref: string, path: string) {
  const url = `${GITHUB_URL}${enc(user)}/${enc(repo)}/tree/${encodePath(ref)}`;
  return path ? `${url}/${encodePath(path)}` : url;
}

/** Contents API path for a file or directory. */
export function contentsPath(user: string, repo: string, path: string) {
  return `repos/${enc(user)}/${enc(repo)}/contents/${encodePath(path)}`;
}

/**
 * Owner and repo from an entry's html_url. The API follows renames, so
 * these can differ from the names in the viewer URL.
 */
export function repoFromHtmlUrl(
  htmlUrl: string | null | undefined
): { user: string; repo: string } | null {
  if (!htmlUrl?.startsWith(GITHUB_URL)) {
    return null;
  }
  const [user, repo] = htmlUrl.slice(GITHUB_URL.length).split('/');
  if (!user || !repo) {
    return null;
  }
  return { user: decodeURIComponent(user), repo: decodeURIComponent(repo) };
}

/** A Contents API directory entry, as far as we use it. */
export interface IContentsEntry {
  name: string;
  path: string;
  type: 'file' | 'dir' | 'symlink' | 'submodule';
  html_url: string | null;
}

export type EntryKind = 'dir' | 'notebook' | 'file' | 'submodule';

/**
 * Sort a directory listing like nbviewer: directories, then notebooks, then
 * everything else (files, and submodules, which have no html_url), each in
 * the API's alphabetical order.
 */
export function sortEntries(
  entries: IContentsEntry[]
): { entry: IContentsEntry; kind: EntryKind }[] {
  const rank: Record<EntryKind, number> = {
    dir: 0,
    notebook: 1,
    file: 2,
    submodule: 2
  };
  return entries
    .map(entry => ({ entry, kind: entryKind(entry) }))
    .sort((a, b) => rank[a.kind] - rank[b.kind]);
}

function entryKind(entry: IContentsEntry): EntryKind {
  if (entry.type === 'dir') {
    return 'dir';
  }
  if (entry.name.endsWith('.ipynb')) {
    return 'notebook';
  }
  return entry.html_url ? 'file' : 'submodule';
}

/** nbviewer's clean_filename: how gist.github.com anchors a file. */
export function gistFileAnchor(filename: string): string {
  return 'file-' + filename.replace(/[^0-9a-zA-Z]+/g, '-');
}

function enc(s: string): string {
  return encodeURIComponent(s);
}
