/**
 * Turn what someone pastes into the landing page form into a viewer path.
 * A port of nbviewer's uri_rewrites (gist, github, dropbox, huggingface and
 * url providers, in that order) and transform_ipynb_uri in utils.py.
 */

type Rewrite = [RegExp, string];

const REWRITES: Rewrite[] = [
  // gist
  [/^([a-f0-9]+)\/?$/, '{0}'],
  [/^https?:\/\/gist.github.com\/([^/]+\/)?([a-f0-9]+)\/?$/, '{1}'],
  // github: raw views
  [
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/raw\/([^/]+)\/(.*)/,
    'github/{0}/{1}/blob/{2}/{3}'
  ],
  [
    /^https?:\/\/raw\.github\.com\/([^/]+)\/([^/]+)\/(.*)/,
    'github/{0}/{1}/blob/{2}'
  ],
  [
    /^https?:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/(.*)/,
    'github/{0}/{1}/blob/{2}'
  ],
  // github: trees and blobs, user/repo, user
  [
    /^https?:\/\/github.com\/([\w-]+)\/([^/]+)\/(blob|tree)\/(.*)$/,
    'github/{0}/{1}/{2}/{3}'
  ],
  // nbviewer assumes "master" here; the repo page looks up the default branch
  [/^([\w-]+)\/([^/]+)$/, 'github/{0}/{1}/'],
  [/^([\w-]+)$/, 'github/{0}/'],
  // dropbox
  [
    /^http(s?):\/\/www.dropbox.com\/(sh?)\/(.+?)(\?dl=.)*$/,
    'url{0}/dl.dropbox.com/{1}/{2}'
  ],
  // huggingface
  [
    /^https:\/\/huggingface.co\/(.+?)\/blob\/(.+?)$/,
    'urls/huggingface.co/{0}/resolve/{1}'
  ],
  // url
  [/^http(s?):\/\/(.*)$/, 'url{0}/{1}'],
  [/^(.*)$/, 'url/{0}']
];

export function viewerPathForInput(input: string): string | null {
  let uri = input.trim();
  if (!uri) {
    return null;
  }
  for (const [pattern, template] of REWRITES) {
    const match = pattern.exec(uri);
    if (match) {
      uri = template.replace(/\{(\d)\}/g, (_, i) => match[Number(i) + 1] ?? '');
      break;
    }
  }
  // encode the query string as the last path segment
  const q = uri.indexOf('?');
  if (q !== -1) {
    uri = uri.slice(0, q) + '/' + encodeURIComponent(uri.slice(q));
  }
  return uri;
}
