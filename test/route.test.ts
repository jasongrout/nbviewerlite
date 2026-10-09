import assert from 'node:assert/strict';
import { test } from 'node:test';

import { encodePath, fetchUrl, parseRoute, viewerPath } from '../src/route.ts';

test('empty path and index.html are the landing page', () => {
  assert.deepEqual(parseRoute(''), { kind: 'home' });
  assert.deepEqual(parseRoute('index.html'), { kind: 'home' });
});

test('unknown paths are not found', () => {
  assert.deepEqual(parseRoute('nonsense/here'), { kind: 'notfound' });
  assert.deepEqual(parseRoute('url/hostonly'), { kind: 'notfound' });
});

test('url and urls map to http and https', () => {
  assert.deepEqual(
    parseRoute('url/jakevdp.github.io/downloads/notebooks/XKCD_plots.ipynb'),
    {
      kind: 'url',
      remoteUrl: 'http://jakevdp.github.io/downloads/notebooks/XKCD_plots.ipynb',
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
    assert.equal(route.remoteUrl, 'https://example.org/My%20Notebooks/A%20B.ipynb');
    assert.equal(route.filename, 'A B.ipynb');
  }
});

test('an encoded trailing ?query segment becomes the query string', () => {
  // as produced by v1's transform_ipynb_uri
  const route = parseRoute('urls/example.org/get/%3Fname%3Dnb.ipynb%26raw%3D1');
  assert.equal(route.kind, 'url');
  if (route.kind === 'url') {
    assert.equal(route.remoteUrl, 'https://example.org/get?name=nb.ipynb&raw=1');
  }
});

test('encodePath encodes each segment', () => {
  assert.equal(encodePath('a b/c#d/e?f'), 'a%20b/c%23d/e%3Ff');
  assert.equal(encodePath(''), '');
});

test('http is upgraded only on https pages', () => {
  assert.equal(fetchUrl('http://example.org/nb.ipynb', 'https:'), 'https://example.org/nb.ipynb');
  assert.equal(fetchUrl('http://example.org/nb.ipynb', 'http:'), 'http://example.org/nb.ipynb');
  assert.equal(fetchUrl('https://example.org/nb.ipynb', 'http:'), 'https://example.org/nb.ipynb');
});

test('url viewer paths round-trip through parseRoute', () => {
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
