import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatLinks, hasSlides } from '../src/formats.ts';

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
  const titles = (links: { title: string }[]) => links.map(l => l.title);

  assert.deepEqual(formatLinks(slides, 'html', base), [
    {
      path: 'format/slides/github/u/r/blob/main/a.ipynb',
      title: 'View as Slides',
      icon: 'run'
    },
    {
      path: 'format/script/github/u/r/blob/main/a.ipynb',
      title: 'View as Code',
      icon: 'code'
    }
  ]);
  assert.deepEqual(titles(formatLinks(plain, 'html', base)), ['View as Code']);
  assert.deepEqual(formatLinks(slides, 'script', base), [
    { path: base, title: 'View as Notebook', icon: 'notebook' },
    {
      path: 'format/slides/github/u/r/blob/main/a.ipynb',
      title: 'View as Slides',
      icon: 'run'
    }
  ]);
  // slides of a notebook without slide metadata, as nbviewer still makes
  assert.deepEqual(titles(formatLinks(plain, 'slides', base)), [
    'View as Notebook',
    'View as Code'
  ]);
});
