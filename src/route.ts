/**
 * Map viewer paths to what they show, following nbviewer's URL scheme and
 * route order (default_handlers in nbviewer/providers/{url,github,gist}):
 *
 *   url/{netloc}/{path}                      http://{netloc}/{path}
 *   urls/{netloc}/{path}                     https://{netloc}/{path}
 *   github/{user}/                           a user's repositories
 *   github/{user}/{repo}/                    the repo's default branch
 *   github/{user}/{repo}/tree/{ref}/{path}/  a directory listing
 *   github/{user}/{repo}/blob/{ref}/{path}   a notebook (or file)
 *   gist/{user}/{id}[/{file}]                a gist, or one of its files
 *   gist/{user}/                             a user's gists
 *
 * plus nbviewer's redirects (trailing slashes, old URL forms). For url/urls,
 * a query string on the remote URL is carried as a final, percent-encoded
 * path segment starting with "?" (see transform_ipynb_uri in nbviewer's
 * utils.py).
 */

export type Route =
  | { kind: 'home' }
  | { kind: 'notfound' }
  /** Go to another viewer path, keeping query string and fragment. */
  | { kind: 'redirect'; path: string }
  | {
      kind: 'url';
      /** The remote URL as written in the nbviewer path. */
      remoteUrl: string;
      /** The last path segment, for page titles and download names. */
      filename: string;
    }
  | { kind: 'github-user'; user: string }
  | { kind: 'github-repo'; user: string; repo: string }
  | {
      kind: 'github-tree' | 'github-blob';
      user: string;
      repo: string;
      ref: string;
      /** Path in the repo, decoded, without leading or trailing slash. */
      path: string;
    }
  | {
      kind: 'gist';
      /** null when the URL has no user; nbviewer then redirects to the owner. */
      user: string | null;
      id: string;
      /** Decoded file name, or '' for the whole gist. */
      filename: string;
    }
  | { kind: 'gist-user'; user: string };

const ENCODED_QUERY = /\/%3F/i;
const GIST_ID = '([0-9]+|[0-9a-f]{20,})';

type Matcher = [RegExp, (groups: string[], path: string) => Route];

const addSlash = (_: string[], path: string) => redirect(path + '/');
const removeSlash = (_: string[], path: string) =>
  redirect(path.replace(/\/+$/, ''));

/** Raw (percent-encoded) path pieces get decoded only where they are values. */
const ROUTES: Matcher[] = [
  [/^index\.html$/, () => ({ kind: 'home' })],
  // github provider: old URL forms caught under url/
  [/^urls?\/github\.com\/(.*)$/, ([rest]) => redirect(`github/${rest}`)],
  [
    /^urls?\/raw\.?github(?:usercontent)?\.com\/([^/]+)\/([^/]+)\/(.*)$/,
    ([user, repo, rest]) => redirect(`github/${user}/${repo}/blob/${rest}`)
  ],
  // url provider
  [/^url(s?)\/([^/]+)\/(.*)$/, urlRoute],
  // github provider
  [/^github\/([^/]+)$/, addSlash],
  [
    /^github\/([^/]+)\/$/,
    ([user]) => ({ kind: 'github-user', user: dec(user) })
  ],
  [/^github\/([^/]+)\/([^/]+)$/, addSlash],
  [
    /^github\/([^/]+)\/([^/]+)\/$/,
    ([user, repo]) => ({
      kind: 'github-repo',
      user: dec(user),
      repo: dec(repo)
    })
  ],
  [/^github\/([^/]+)\/([^/]+)\/(?:blob|raw)\/([^/]+)\/(.*)\/$/, removeSlash],
  [/^github\/([^/]+)\/([^/]+)\/tree\/([^/]+)$/, addSlash],
  [
    /^github\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.*)$/,
    (groups, path) =>
      path.endsWith('/')
        ? repoRoute('github-tree', groups)
        : redirect(path + '/')
  ],
  [
    /^github\/([^/]+)\/([^/]+)\/(?:blob|raw)\/([^/]+)\/(.*)$/,
    groups => repoRoute('github-blob', groups)
  ],
  // gist provider
  [
    new RegExp(`^gist\\/([^/]+\\/)?${GIST_ID}$`),
    ([user, id]) => gistRoute(user, id, '')
  ],
  [
    new RegExp(`^gist\\/([^/]+\\/)?${GIST_ID}\\/(?:files\\/)?(.*)$`),
    ([user, id, file]) => gistRoute(user, id, file)
  ],
  [new RegExp(`^${GIST_ID}$`), ([id]) => redirect(`gist/${id}`)],
  [
    new RegExp(`^${GIST_ID}\\/(.*)$`),
    ([id, file]) => redirect(`gist/${id}/${file}`)
  ],
  [/^gist\/([^/]+)\/?$/, ([user]) => ({ kind: 'gist-user', user: dec(user) })]
];

/**
 * Parse a viewer path (location.pathname without the leading slash),
 * still percent-encoded.
 */
export function parseRoute(path: string): Route {
  if (path === '') {
    return { kind: 'home' };
  }
  for (const [pattern, toRoute] of ROUTES) {
    const match = pattern.exec(path);
    if (match) {
      try {
        // groups that didn't participate are undefined; treat them as ''
        return toRoute(
          match.slice(1).map(g => g ?? ''),
          path
        );
      } catch {
        // malformed percent-encoding
        return { kind: 'notfound' };
      }
    }
  }
  return { kind: 'notfound' };
}

/**
 * Decode like Tornado's url_unescape: valid escapes are decoded, and a '%'
 * that doesn't start one stays a literal '%'. Throws (giving notfound) only
 * for escapes that decode to invalid UTF-8.
 */
function dec(s: string): string {
  return s.replace(/(%[0-9A-Fa-f]{2})+/g, decodeURIComponent);
}

function redirect(path: string): Route {
  return { kind: 'redirect', path };
}

function urlRoute([secure, netloc, rest]: string[]): Route {
  let urlPath = rest;
  let query = '';
  const q = urlPath.search(ENCODED_QUERY);
  if (q !== -1) {
    query = '?' + dec(urlPath.slice(q + 4));
    urlPath = urlPath.slice(0, q);
  }
  // a literal '%' (see dec) has to be escaped in the URL we fetch
  urlPath = urlPath.replace(/%(?![0-9A-Fa-f]{2})/g, '%25');
  const remoteUrl = `http${secure}://${dec(netloc)}/${urlPath}${query}`;
  const filename = dec(urlPath.split('/').pop() || '');
  return { kind: 'url', remoteUrl, filename };
}

function repoRoute(
  kind: 'github-tree' | 'github-blob',
  [user, repo, ref, path]: string[]
): Route {
  let decodedRef = dec(ref);
  let segments = path.replace(/\/+$/, '').split('/');
  // GitHub's raw URLs now name branches as refs/heads/{branch}
  if (
    decodedRef === 'refs' &&
    (segments[0] === 'heads' || segments[0] === 'tags') &&
    segments.length >= 2
  ) {
    decodedRef = dec(segments[1]);
    segments = segments.slice(2);
  }
  const decodedPath = segments.map(dec).join('/');
  // '..' would step out of the repo named in the URL once a URL is built
  if (hasDotSegment(decodedRef) || hasDotSegment(decodedPath)) {
    return { kind: 'notfound' };
  }
  return {
    kind,
    user: dec(user),
    repo: dec(repo),
    ref: decodedRef,
    path: decodedPath
  };
}

function hasDotSegment(s: string): boolean {
  return s.split('/').some(segment => segment === '.' || segment === '..');
}

function gistRoute(user: string, id: string, file: string): Route {
  return {
    kind: 'gist',
    user: user ? dec(user.replace(/\/$/, '')) : null,
    id,
    filename: dec(file)
  };
}

/** Percent-encode each segment of a slash-separated path. */
export function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

/** Viewer path of a GitHub directory listing or file. */
export function githubPath(
  view: 'tree' | 'blob',
  user: string,
  repo: string,
  ref: string,
  path: string
): string {
  const base = `github/${enc(user)}/${enc(repo)}/${view}/${enc(ref)}/`;
  if (view === 'tree') {
    return path ? `${base}${encodePath(path)}/` : base;
  }
  return base + encodePath(path);
}

/** Viewer path of a gist, or of one file in it. */
export function gistPath(user: string, id: string, filename = ''): string {
  const base = `gist/${enc(user)}/${id}`;
  return filename ? `${base}/${enc(filename)}` : base;
}

function enc(s: string): string {
  return encodeURIComponent(s);
}

/**
 * The url/urls viewer path for a remote URL, or null if it isn't http(s).
 */
export function viewerPath(remoteUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(remoteUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }
  const prefix = url.protocol === 'https:' ? 'urls' : 'url';
  let path = `${prefix}/${url.host}${url.pathname}`;
  if (url.search) {
    path += '/' + encodeURIComponent(url.search);
  }
  return path;
}

/**
 * The URL to fetch from the browser. A page served over https can't fetch
 * plain http (mixed content), so upgrade it.
 */
export function fetchUrl(remoteUrl: string, pageProtocol: string): string {
  if (pageProtocol === 'https:' && remoteUrl.startsWith('http://')) {
    return 'https://' + remoteUrl.slice('http://'.length);
  }
  return remoteUrl;
}
