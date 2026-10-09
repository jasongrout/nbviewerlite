import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  encodePath,
  fetchUrl,
  gistPath,
  githubPath,
  parseRoute,
  splitFormat,
  viewerPath
} from '../src/route.ts';

test('empty path and index.html are the landing page', () => {
  assert.deepEqual(parseRoute(''), { kind: 'home' });
  assert.deepEqual(parseRoute('index.html'), { kind: 'home' });
});

test('unknown paths are not found', () => {
  assert.deepEqual(parseRoute('nonsense/here'), { kind: 'notfound' });
  assert.deepEqual(parseRoute('url/hostonly'), { kind: 'notfound' });
  assert.deepEqual(parseRoute('github/u/r/commits/main'), { kind: 'notfound' });
});

test('escapes that decode to invalid UTF-8 are not found', () => {
  assert.deepEqual(parseRoute('github/%E0%A4%A/'), { kind: 'notfound' });
});

test("a '%' that doesn't start an escape is a literal '%', as in Tornado", () => {
  assert.deepEqual(parseRoute('github/u/r/blob/main/100%.ipynb'), {
    kind: 'github-blob',
    user: 'u',
    repo: 'r',
    ref: 'main',
    path: '100%.ipynb'
  });
  assert.deepEqual(parseRoute('urls/example.org/100%.ipynb'), {
    kind: 'url',
    remoteUrl: 'https://example.org/100%25.ipynb',
    filename: '100%.ipynb'
  });
});

test("'.' and '..' segments can't leave the repo in the URL", () => {
  for (const path of [
    'github/u/r/blob/main/..%2F..%2Fx%2Fy%2Fmain%2Fa.ipynb',
    'github/u/r/blob/x%2F..%2F..%2F..%2Fa%2Fb%2Fmain/a.ipynb',
    'github/u/r/tree/main/./',
    'github/u/r/blob/../a.ipynb'
  ]) {
    assert.deepEqual(parseRoute(path), { kind: 'notfound' }, path);
  }
});

test('refs/heads and refs/tags in raw URLs name the ref', () => {
  assert.deepEqual(parseRoute('github/u/r/blob/refs/heads/main/dir/a.ipynb'), {
    kind: 'github-blob',
    user: 'u',
    repo: 'r',
    ref: 'main',
    path: 'dir/a.ipynb'
  });
  assert.deepEqual(
    parseRoute('urls/raw.githubusercontent.com/u/r/refs/tags/v1/a.ipynb'),
    {
      kind: 'redirect',
      path: 'github/u/r/blob/refs/tags/v1/a.ipynb'
    }
  );
  assert.deepEqual(parseRoute('github/u/r/blob/refs/tags/v1/a.ipynb'), {
    kind: 'github-blob',
    user: 'u',
    repo: 'r',
    ref: 'v1',
    path: 'a.ipynb'
  });
});

test('url and urls map to http and https', () => {
  assert.deepEqual(
    parseRoute('url/jakevdp.github.io/downloads/notebooks/XKCD_plots.ipynb'),
    {
      kind: 'url',
      remoteUrl:
        'http://jakevdp.github.io/downloads/notebooks/XKCD_plots.ipynb',
      filename: 'XKCD_plots.ipynb'
    }
  );
  assert.deepEqual(parseRoute('urls/example.org:8443/a/b.ipynb'), {
    kind: 'url',
    remoteUrl: 'https://example.org:8443/a/b.ipynb',
    filename: 'b.ipynb'
  });
});

test('percent-encoding in url paths is kept', () => {
  const route = parseRoute('urls/example.org/My%20Notebooks/A%20B.ipynb');
  assert.equal(route.kind, 'url');
  if (route.kind === 'url') {
    assert.equal(
      route.remoteUrl,
      'https://example.org/My%20Notebooks/A%20B.ipynb'
    );
    assert.equal(route.filename, 'A B.ipynb');
  }
});

test('an encoded trailing ?query segment becomes the query string', () => {
  // as produced by nbviewer's transform_ipynb_uri
  const route = parseRoute('urls/example.org/get/%3Fname%3Dnb.ipynb%26raw%3D1');
  assert.equal(route.kind, 'url');
  if (route.kind === 'url') {
    assert.equal(
      route.remoteUrl,
      'https://example.org/get?name=nb.ipynb&raw=1'
    );
  }
});

test('old GitHub URL forms under url/ redirect to github/', () => {
  assert.deepEqual(
    parseRoute('urls/github.com/ipython/ipython/blob/6.x/a.ipynb'),
    {
      kind: 'redirect',
      path: 'github/ipython/ipython/blob/6.x/a.ipynb'
    }
  );
  for (const host of [
    'raw.github.com',
    'rawgithub.com',
    'raw.githubusercontent.com'
  ]) {
    assert.deepEqual(
      parseRoute(`url/${host}/ipython/ipython/6.x/a%20b.ipynb`),
      {
        kind: 'redirect',
        path: 'github/ipython/ipython/blob/6.x/a%20b.ipynb'
      }
    );
  }
});

test('github user and repo pages, with slashes added', () => {
  assert.deepEqual(parseRoute('github/ipython'), {
    kind: 'redirect',
    path: 'github/ipython/'
  });
  assert.deepEqual(parseRoute('github/ipython/'), {
    kind: 'github-user',
    user: 'ipython'
  });
  assert.deepEqual(parseRoute('github/ipython/ipython'), {
    kind: 'redirect',
    path: 'github/ipython/ipython/'
  });
  assert.deepEqual(parseRoute('github/ipython/ipython/'), {
    kind: 'github-repo',
    user: 'ipython',
    repo: 'ipython'
  });
});

test('github trees', () => {
  assert.deepEqual(parseRoute('github/ipython/ipython/tree/6.x'), {
    kind: 'redirect',
    path: 'github/ipython/ipython/tree/6.x/'
  });
  assert.deepEqual(parseRoute('github/ipython/ipython/tree/6.x/'), {
    kind: 'github-tree',
    user: 'ipython',
    repo: 'ipython',
    ref: '6.x',
    path: ''
  });
  assert.deepEqual(
    parseRoute('github/ipython/ipython/tree/6.x/examples/IPython%20Kernel'),
    {
      kind: 'redirect',
      path: 'github/ipython/ipython/tree/6.x/examples/IPython%20Kernel/'
    }
  );
  assert.deepEqual(
    parseRoute('github/ipython/ipython/tree/6.x/examples/IPython%20Kernel/'),
    {
      kind: 'github-tree',
      user: 'ipython',
      repo: 'ipython',
      ref: '6.x',
      path: 'examples/IPython Kernel'
    }
  );
  // a ref containing a slash, escaped as one segment
  assert.deepEqual(parseRoute('github/u/r/tree/feature%2Fx/docs/'), {
    kind: 'github-tree',
    user: 'u',
    repo: 'r',
    ref: 'feature/x',
    path: 'docs'
  });
});

test('github blobs', () => {
  const blob = {
    kind: 'github-blob',
    user: 'ipython',
    repo: 'ipython',
    ref: '6.x',
    path: 'examples/IPython Kernel/Index.ipynb'
  };
  assert.deepEqual(
    parseRoute(
      'github/ipython/ipython/blob/6.x/examples/IPython%20Kernel/Index.ipynb'
    ),
    blob
  );
  assert.deepEqual(
    parseRoute(
      'github/ipython/ipython/raw/6.x/examples/IPython%20Kernel/Index.ipynb'
    ),
    blob
  );
  assert.deepEqual(parseRoute('github/ipython/ipython/blob/6.x/examples/'), {
    kind: 'redirect',
    path: 'github/ipython/ipython/blob/6.x/examples'
  });
});

test('gists', () => {
  const id = '0123456789abcdef0123';
  assert.deepEqual(parseRoute(`gist/fperez/${id}`), {
    kind: 'gist',
    user: 'fperez',
    id,
    filename: ''
  });
  assert.deepEqual(parseRoute(`gist/${id}`), {
    kind: 'gist',
    user: null,
    id,
    filename: ''
  });
  assert.deepEqual(parseRoute(`gist/fperez/${id}/My%20Notebook.ipynb`), {
    kind: 'gist',
    user: 'fperez',
    id,
    filename: 'My Notebook.ipynb'
  });
  assert.deepEqual(parseRoute(`gist/fperez/${id}/files/a.ipynb`), {
    kind: 'gist',
    user: 'fperez',
    id,
    filename: 'a.ipynb'
  });
  assert.deepEqual(parseRoute('gist/12345'), {
    kind: 'gist',
    user: null,
    id: '12345',
    filename: ''
  });
  assert.deepEqual(parseRoute('gist/fperez/'), {
    kind: 'gist-user',
    user: 'fperez'
  });
  assert.deepEqual(parseRoute('gist/fperez'), {
    kind: 'gist-user',
    user: 'fperez'
  });
});

test('bare gist ids redirect to gist/', () => {
  const id = '0123456789abcdef0123';
  assert.deepEqual(parseRoute(id), { kind: 'redirect', path: `gist/${id}` });
  assert.deepEqual(parseRoute(`${id}/a.ipynb`), {
    kind: 'redirect',
    path: `gist/${id}/a.ipynb`
  });
  assert.deepEqual(parseRoute('12345'), {
    kind: 'redirect',
    path: 'gist/12345'
  });
});

test('every viewer path is also served under format/{name}/', () => {
  const id = '0123456789abcdef0123';
  for (const path of [
    'github/ipython/ipython/blob/6.x/examples/IPython%20Kernel/Index.ipynb',
    'github/ipython/ipython/tree/6.x/examples/',
    'github/ipython/',
    'urls/example.org/a/b.ipynb',
    `gist/fperez/${id}/a.ipynb`,
    'gist/fperez/'
  ]) {
    for (const format of ['html', 'slides', 'script']) {
      assert.deepEqual(
        parseRoute(`format/${format}/${path}`),
        parseRoute(path),
        path
      );
    }
  }
});

test('redirects under format/{name}/ stay in the format', () => {
  // the paths are relative to the format; redirect() keeps the prefix
  assert.deepEqual(parseRoute('format/slides/github/ipython'), {
    kind: 'redirect',
    path: 'github/ipython/'
  });
  assert.deepEqual(
    parseRoute('format/script/url/github.com/u/r/blob/main/a.ipynb'),
    { kind: 'redirect', path: 'github/u/r/blob/main/a.ipynb' }
  );
  assert.deepEqual(parseRoute('format/slides/0123456789abcdef0123'), {
    kind: 'redirect',
    path: 'gist/0123456789abcdef0123'
  });
});

test('unknown formats and the landing page under format/ are not found', () => {
  for (const path of [
    'format/pdf/github/ipython/',
    'format/Slides/github/ipython/',
    'format/slides/',
    'format/slides/index.html',
    'format/slides',
    'format/',
    'format/slides/format/script/github/ipython/'
  ]) {
    assert.deepEqual(parseRoute(path), { kind: 'notfound' }, path);
  }
});

test('splitFormat separates the format from the viewer path', () => {
  assert.deepEqual(splitFormat('format/slides/github/u/r/blob/m/a.ipynb'), {
    format: 'slides',
    base: 'github/u/r/blob/m/a.ipynb'
  });
  assert.deepEqual(splitFormat('format/html/urls/example.org/a.ipynb'), {
    format: 'html',
    base: 'urls/example.org/a.ipynb'
  });
  assert.deepEqual(splitFormat('github/u/'), {
    format: 'html',
    base: 'github/u/'
  });
  assert.equal(splitFormat('format/pdf/github/u/'), null);
});

test('viewer paths round-trip through parseRoute', () => {
  const tree = githubPath('tree', 'u', 'r', 'feature/x', 'a dir/sub');
  assert.equal(tree, 'github/u/r/tree/feature%2Fx/a%20dir/sub/');
  assert.deepEqual(parseRoute(tree), {
    kind: 'github-tree',
    user: 'u',
    repo: 'r',
    ref: 'feature/x',
    path: 'a dir/sub'
  });
  assert.equal(
    githubPath('tree', 'u', 'r', 'main', ''),
    'github/u/r/tree/main/'
  );
  const blob = githubPath('blob', 'u', 'r', 'main', 'a dir/n#1.ipynb');
  assert.deepEqual(parseRoute(blob), {
    kind: 'github-blob',
    user: 'u',
    repo: 'r',
    ref: 'main',
    path: 'a dir/n#1.ipynb'
  });
  const gist = gistPath('fperez', '0123456789abcdef0123', 'a b.ipynb');
  assert.deepEqual(parseRoute(gist), {
    kind: 'gist',
    user: 'fperez',
    id: '0123456789abcdef0123',
    filename: 'a b.ipynb'
  });
  for (const url of [
    'https://example.org/a/b.ipynb',
    'http://example.org:8080/My%20Notebook.ipynb',
    'https://example.org/get?name=nb.ipynb&x=a%20b'
  ]) {
    const path = viewerPath(url);
    assert.ok(path);
    const route = parseRoute(path);
    assert.equal(route.kind, 'url');
    if (route.kind === 'url') {
      assert.equal(route.remoteUrl, url);
    }
  }
  assert.equal(viewerPath('mailto:someone@example.org'), null);
  assert.equal(viewerPath('not a url'), null);
});

test('encodePath encodes each segment', () => {
  assert.equal(encodePath('a b/c#d/e?f'), 'a%20b/c%23d/e%3Ff');
  assert.equal(encodePath(''), '');
});

test('http is upgraded only on https pages', () => {
  assert.equal(
    fetchUrl('http://example.org/nb.ipynb', 'https:'),
    'https://example.org/nb.ipynb'
  );
  assert.equal(
    fetchUrl('http://example.org/nb.ipynb', 'http:'),
    'http://example.org/nb.ipynb'
  );
  assert.equal(
    fetchUrl('https://example.org/nb.ipynb', 'http:'),
    'https://example.org/nb.ipynb'
  );
});
