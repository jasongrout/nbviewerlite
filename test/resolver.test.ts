import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SourceResolver } from '../src/resolver.ts';

const resolver = new SourceResolver(
  'https://raw.githubusercontent.com/u/r/main/dir/nb.ipynb',
  absolute => `link:${absolute}`
);

test('relative URLs are local; absolute ones are not', () => {
  assert.equal(resolver.isLocal('img/a.png'), true);
  assert.equal(resolver.isLocal('../other.ipynb'), true);
  assert.equal(resolver.isLocal('/root.png'), true);
  assert.equal(resolver.isLocal('https://example.org/a.png'), false);
  assert.equal(resolver.isLocal('//cdn.example.org/a.js'), false);
  assert.equal(resolver.isLocal('data:image/png;base64,AAAA'), false);
  assert.equal(resolver.isLocal('mailto:a@example.org'), false);
  assert.equal(resolver.isLocal('#'), false);
  assert.equal(resolver.isLocal('#Введение'), false);
});

test('images resolve against the source', async () => {
  assert.equal(
    await resolver.resolveUrl('img/a b.png', { attribute: 'src', tag: 'img' }),
    'https://raw.githubusercontent.com/u/r/main/dir/img/a%20b.png'
  );
  assert.equal(
    await resolver.resolveUrl('/root.png', { attribute: 'src', tag: 'img' }),
    'https://raw.githubusercontent.com/root.png'
  );
});

test('links go through the provider', async () => {
  assert.equal(
    await resolver.resolveUrl('../other.ipynb', {
      attribute: 'href',
      tag: 'a'
    }),
    'link:https://raw.githubusercontent.com/u/r/main/other.ipynb'
  );
  assert.equal(await resolver.getDownloadUrl('x'), 'x');
});
