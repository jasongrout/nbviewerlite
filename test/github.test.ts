import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import {
  apiGet,
  blobUrl,
  contentsPath,
  gistFileAnchor,
  gistFileName,
  GitHubError,
  parseLinkHeader,
  rawUrl,
  repoFromApiUrl,
  repoPathOf,
  repoViewerPath,
  sortEntries,
  treeUrl,
  type IContentsEntry
} from '../src/github.ts';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

test('GitHub URLs', () => {
  assert.equal(
    rawUrl('ipython', 'ipython', '6.x', 'examples/IPython Kernel/Index.ipynb'),
    'https://raw.githubusercontent.com/ipython/ipython/6.x/examples/IPython%20Kernel/Index.ipynb'
  );
  assert.equal(
    blobUrl('u', 'r', 'feature/x', 'a#b.ipynb'),
    'https://github.com/u/r/blob/feature/x/a%23b.ipynb'
  );
  assert.equal(
    treeUrl('u', 'r', 'main', ''),
    'https://github.com/u/r/tree/main'
  );
  assert.equal(
    treeUrl('u', 'r', 'main', 'a b'),
    'https://github.com/u/r/tree/main/a%20b'
  );
  assert.equal(contentsPath('u', 'r', 'a b/c'), 'repos/u/r/contents/a%20b/c');
  assert.equal(contentsPath('u', 'r', ''), 'repos/u/r/contents/');
});

test('parseLinkHeader extracts page numbers', () => {
  const header =
    '<https://api.github.com/user/123/repos?sort=updated&page=1>; rel="prev", ' +
    '<https://api.github.com/user/123/repos?sort=updated&page=3>; rel="next", ' +
    '<https://api.github.com/user/123/repos?sort=updated&page=9>; rel="last"';
  assert.deepEqual(parseLinkHeader(header), {
    prev: '1',
    next: '3',
    last: '9'
  });
  assert.deepEqual(parseLinkHeader(''), {});
});

test('repoFromApiUrl follows renames', () => {
  assert.deepEqual(
    repoFromApiUrl(
      'https://api.github.com/repos/new-owner/new-name/contents/a.ipynb?ref=main'
    ),
    { user: 'new-owner', repo: 'new-name' }
  );
  assert.equal(repoFromApiUrl(undefined), null);
  assert.equal(repoFromApiUrl('https://example.org/repos/x/y'), null);
});

test('sortEntries orders like nbviewer', () => {
  const e = (
    name: string,
    type: IContentsEntry['type'],
    html = true
  ): IContentsEntry => ({
    name,
    path: name,
    type,
    url: `https://api.github.com/repos/u/r/contents/${name}?ref=main`,
    html_url: html ? `https://github.com/u/r/blob/main/${name}` : null
  });
  const sorted = sortEntries([
    e('README.md', 'file'),
    e('a.ipynb', 'file'),
    e('docs', 'dir'),
    e('sub', 'file', false),
    e('z.ipynb', 'file'),
    e('src', 'dir'),
    e('setup.py', 'file')
  ]);
  assert.deepEqual(
    sorted.map(({ entry, kind }) => `${kind}:${entry.name}`),
    [
      'dir:docs',
      'dir:src',
      'notebook:a.ipynb',
      'notebook:z.ipynb',
      'file:README.md',
      'submodule:sub',
      'file:setup.py'
    ]
  );
});

test('repoPathOf finds files in the repo at a ref', () => {
  const base = 'https://raw.githubusercontent.com/u/r/feature/x/';
  assert.equal(repoPathOf(base + 'a%20b/c.ipynb', base), 'a b/c.ipynb');
  assert.equal(repoPathOf(base + 'docs/', base), 'docs/');
  assert.equal(repoPathOf(base + 'a.html?x=1#top', base), 'a.html');
  assert.equal(repoPathOf(base, base), '');
  assert.equal(
    repoPathOf('https://raw.githubusercontent.com/u/r/main/a.ipynb', base),
    null
  );
  assert.equal(repoPathOf('https://example.org/u/r/feature/x/a', base), null);
  assert.equal(repoPathOf(base + '%E0%A4%A.ipynb', base), null);
  assert.equal(repoPathOf('not a url', base), null);
});

test('repoViewerPath maps links in the repo to viewer pages', () => {
  const raw = 'https://raw.githubusercontent.com/u/r/feature/x/';
  const link = (url: string) => repoViewerPath(url, 'u', 'r', 'feature/x');
  assert.equal(
    link(raw + 'a%20b/c.ipynb#Some-heading'),
    'github/u/r/blob/feature%2Fx/a%20b/c.ipynb#Some-heading'
  );
  assert.equal(link(raw + 'docs/'), 'github/u/r/tree/feature%2Fx/docs/');
  assert.equal(link(raw + 'docs'), 'github/u/r/blob/feature%2Fx/docs');
  assert.equal(link(raw), 'github/u/r/tree/feature%2Fx/');
  assert.equal(link('https://example.org/a.ipynb'), null);
});

test('gistFileName names files next to a gist file', () => {
  const raw = 'https://gist.githubusercontent.com/u/abc/raw/123/page.html';
  const dir = 'https://gist.githubusercontent.com/u/abc/raw/123/';
  assert.equal(
    gistFileName(dir + 'My%20Notebook.ipynb', raw),
    'My Notebook.ipynb'
  );
  assert.equal(gistFileName(dir + 'style.css?v=2', raw), 'style.css');
  assert.equal(gistFileName(dir + 'sub/style.css', raw), null);
  assert.equal(gistFileName(dir, raw), null);
  assert.equal(gistFileName('https://example.org/style.css', raw), null);
});

test('gistFileAnchor matches gist.github.com', () => {
  assert.equal(gistFileAnchor('My Notebook.ipynb'), 'file-my-notebook-ipynb');
});

function respond(
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
) {
  globalThis.fetch = async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', ...headers }
    });
}

test('apiGet returns data and page links', async () => {
  respond(200, [{ name: 'a' }], {
    Link: '<https://api.github.com/users/u/repos?page=2>; rel="next"'
  });
  const result = await apiGet('users/u/repos', { sort: 'updated' });
  assert.deepEqual(result, {
    data: [{ name: 'a' }],
    prevPage: null,
    nextPage: '2'
  });
});

test('apiGet reports rate limits with their reset time', async () => {
  respond(
    403,
    { message: 'API rate limit exceeded for 1.2.3.4.' },
    {
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': '1700000000'
    }
  );
  await assert.rejects(apiGet('repos/u/r'), (err: unknown) => {
    assert.ok(err instanceof GitHubError);
    assert.equal(err.status, 403);
    assert.equal(err.rateLimitReset?.getTime(), 1700000000 * 1000);
    return true;
  });
});

test("apiGet reports other errors with GitHub's message", async () => {
  respond(404, { message: 'Not Found' });
  await assert.rejects(apiGet('repos/u/missing'), /404: Not Found/);
});

test('apiGet reports network failures', async () => {
  globalThis.fetch = async () => {
    throw new TypeError('Failed to fetch');
  };
  await assert.rejects(apiGet('repos/u/r'), /Could not reach the GitHub API/);
});
