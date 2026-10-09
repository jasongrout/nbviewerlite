/**
 * Map viewer paths to what they show, following nbviewer's URL scheme and
 * route order (default_handlers in nbviewer/providers/{url,github,gist}):
 *
 *   url/{netloc}/{path}    http://{netloc}/{path}
 *   urls/{netloc}/{path}   https://{netloc}/{path}
 *
 * A query string on the remote URL is carried as a final, percent-encoded
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
      /** The remote URL as written in the viewer path. */
      remoteUrl: string;
      /** The last path segment, for page titles and download names. */
      filename: string;
    };

const ENCODED_QUERY = /\/%3F/i;

type Matcher = [RegExp, (groups: string[], path: string) => Route];

/** Raw (percent-encoded) path pieces get decoded only where they are values. */
const ROUTES: Matcher[] = [
  [/^index\.html$/, () => ({ kind: 'home' })],
  // url provider
  [/^url(s?)\/([^/]+)\/(.*)$/, urlRoute]
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

function dec(s: string): string {
  return decodeURIComponent(s);
}

function urlRoute([secure, netloc, rest]: string[]): Route {
  let urlPath = rest;
  let query = '';
  const q = urlPath.search(ENCODED_QUERY);
  if (q !== -1) {
    query = '?' + dec(urlPath.slice(q + 4));
    urlPath = urlPath.slice(0, q);
  }
  const remoteUrl = `http${secure}://${dec(netloc)}/${urlPath}${query}`;
  const filename = dec(urlPath.split('/').pop() || '');
  return { kind: 'url', remoteUrl, filename };
}

/** Percent-encode each segment of a slash-separated path. */
export function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
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
