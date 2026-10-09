import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import {
  apiGet,
  blobUrl,
  contentsPath,
  gistFileAnchor,
  GitHubError,
  parseLinkHeader,
  rawUrl,
  repoFromHtmlUrl,
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
  assert.equal(treeUrl('u', 'r', 'main', ''), 'https://github.com/u/r/tree/main');
  assert.equal(treeUrl('u', 'r', 'main', 'a b'), 'https://github.com/u/r/tree/main/a%20b');
  assert.equal(contentsPath('u', 'r', 'a b/c'), 'repos/u/r/contents/a%20b/c');
  assert.equal(contentsPath('u', 'r', ''), 'repos/u/r/contents/');
});

test('parseLinkHeader extracts page numbers', () => {
  const header =
    '<https://api.github.com/user/123/repos?sort=updated&page=1>; rel="prev", ' +
    '<https://api.github.com/user/123/repos?sort=updated&page=3>; rel="next", ' +
    '<https://api.github.com/user/123/repos?sort=updated&page=9>; rel="last"';
  assert.deepEqual(parseLinkHeader(header), { prev: '1', next: '3', last: '9' });
  assert.deepEqual(parseLinkHeader(''), {});
});

test('repoFromHtmlUrl follows renames', () => {
  assert.deepEqual(
    repoFromHtmlUrl('https://github.com/new-owner/new-name/blob/main/a.ipynb'),
    { user: 'new-owner', repo: 'new-name' }
  );
  assert.equal(repoFromHtmlUrl(null), null);
  assert.equal(repoFromHtmlUrl('https://example.org/x/y'), null);
});

test('sortEntries orders like nbviewer', () => {
  const e = (name: string, type: IContentsEntry['type'], html = true): IContentsEntry => ({
    name,
    path: name,
    type,
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

test('gistFileAnchor matches gist.github.com', () => {
  assert.equal(gistFileAnchor('My Notebook.ipynb'), 'file-My-Notebook-ipynb');
});

function respond(status: number, body: unknown, headers: Record<string, string> = {}) {
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
  assert.deepEqual(result, { data: [{ name: 'a' }], prevPage: null, nextPage: '2' });
});

test('apiGet reports rate limits with their reset time', async () => {
  respond(403, { message: 'API rate limit exceeded for 1.2.3.4.' }, {
    'X-RateLimit-Remaining': '0',
    'X-RateLimit-Reset': '1700000000'
  });
  await assert.rejects(apiGet('repos/u/r'), (err: unknown) => {
    assert.ok(err instanceof GitHubError);
    assert.equal(err.status, 403);
    assert.equal(err.rateLimitReset?.getTime(), 1700000000 * 1000);
    return true;
  });
});

test('apiGet reports other errors with GitHub\'s message', async () => {
  respond(404, { message: 'Not Found' });
  await assert.rejects(apiGet('repos/u/missing'), /404: Not Found/);
});

test('apiGet reports network failures', async () => {
  globalThis.fetch = async () => {
    throw new TypeError('Failed to fetch');
  };
  await assert.rejects(apiGet('repos/u/r'), /Could not reach the GitHub API/);
});
