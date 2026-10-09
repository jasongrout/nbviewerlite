import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatLinks, hasSlides, keepsFormat } from '../src/formats.ts';

function notebook(...metadata: object[]): any {
  return {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {},
    cells: metadata.map(m => ({ cell_type: 'code', source: '', metadata: m }))
  };
}

const slide = (type: unknown) => ({ slideshow: { slide_type: type } });

test("slides are offered when a cell's slide type isn't '-' (test_slides)", () => {
  assert.equal(hasSlides(notebook()), false);
  assert.equal(hasSlides(notebook({}, slide('-'), { slideshow: {} })), false);
  assert.equal(hasSlides(notebook({}, slide('subslide'))), true);
  assert.equal(hasSlides(notebook(slide('skip'))), true);
  // nbviewer compares with '-' only, so a null slide type counts
  assert.equal(hasSlides(notebook(slide(null))), true);
  // its test fails on a malformed entry, even before a good one
  assert.equal(hasSlides(notebook({ slideshow: null }, slide('slide'))), false);
});

test('"View as" links go to the other formats, in nbviewer\'s order', () => {
  const base = 'github/u/r/blob/main/a.ipynb';
  const plain = notebook({});
  const slides = notebook(slide('slide'));
  const names = (links: { name: string }[]) => links.map(l => l.name);

  assert.deepEqual(formatLinks(slides, 'html', base), [
    {
      path: 'format/slides/github/u/r/blob/main/a.ipynb',
      name: 'Slides',
      icon: 'run'
    },
    {
      path: 'format/script/github/u/r/blob/main/a.ipynb',
      name: 'Code',
      icon: 'code'
    }
  ]);
  assert.deepEqual(names(formatLinks(plain, 'html', base)), ['Code']);
  assert.deepEqual(formatLinks(slides, 'script', base), [
    { path: base, name: 'Notebook', icon: 'notebook' },
    {
      path: 'format/slides/github/u/r/blob/main/a.ipynb',
      name: 'Slides',
      icon: 'run'
    }
  ]);
  // slides of a notebook without slide metadata, as nbviewer still makes
  assert.deepEqual(names(formatLinks(plain, 'slides', base)), [
    'Notebook',
    'Code'
  ]);
});

test('links to notebooks and HTML files stay in the format', () => {
  for (const path of ['a.ipynb', 'docs/B.IPYNB', 'r.html', '/u/r/main/R.HTM']) {
    assert.equal(keepsFormat(path), true, path);
  }
  // directories and other files
  for (const path of ['docs/', 'data.csv', 'Makefile', 'a.ipynb.bak', '']) {
    assert.equal(keepsFormat(path), false, path);
  }
});
