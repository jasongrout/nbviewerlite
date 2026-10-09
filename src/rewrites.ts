/**
 * Turn what someone pastes into the landing page form into a viewer path.
 * A port of nbviewer's uri_rewrites (providers in nbviewer's order) and
 * transform_ipynb_uri.
 */

type Rewrite = [RegExp, string];

const REWRITES: Rewrite[] = [
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
