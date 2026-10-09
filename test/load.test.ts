import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { LoadError, parseNotebook } from '../src/load.ts';
import { normalizeNotebook } from '../src/nbformat.ts';

function fixtureText(name: string): string {
  return readFileSync(new URL(`fixtures/${name}`, import.meta.url), 'utf8');
}

/** What parseNotebook should make of NAME.ipynb: Python nbformat's output. */
function expected(name: string): any {
  return normalizeNotebook(JSON.parse(fixtureText(`${name}.v4.json`)));
}

/** The notebook without its upgraded cells' (random) ids. */
function withoutIds(nb: any): any {
  return { ...nb, cells: nb.cells.map(({ id: _id, ...cell }: any) => cell) };
}

// Upgraded as Python nbformat does (see convert.test.ts for the fixtures).
const upgraded = {
  v1: 'nbformat 1',
  // written by nbformat.v1.nbjson.writes, which has no nbformat key; Python
  // nbformat reads notebooks without one as nbformat 1
  'v1-nokey': 'nbformat 1 (no nbformat key)',
  v2: 'nbformat 2',
  'v3-cells': 'nbformat 3'
};

for (const [name, version] of Object.entries(upgraded)) {
  test(`parseNotebook upgrades ${version} notebooks`, () => {
    const nb = parseNotebook(fixtureText(`${name}.ipynb`), 'a.ipynb');
    assert.equal(nb.nbformat, 4);
    assert.deepEqual(withoutIds(nb), expected(name));
  });
}

test('parseNotebook normalizes nbformat 4 notebooks', () => {
  const nb = {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: { kernelspec: { name: 'python3', display_name: 'Python 3' } },
    cells: [
      { cell_type: 'markdown', id: 'a', metadata: {}, source: ['# A\n', 'b'] }
    ]
  };
  assert.deepEqual(
    parseNotebook(JSON.stringify(nb), 'a.ipynb'),
    normalizeNotebook(nb)
  );
});

test('parseNotebook reads nbformat 4 cells without an nbformat key', () => {
  // sloppy notebooks, not nbformat 1 (whose cells are text or code)
  const nb = {
    metadata: { kernelspec: { name: 'python3', display_name: 'Python 3' } },
    cells: [
      { cell_type: 'markdown', source: 'Some *text*' },
      { cell_type: 'code', source: ['x = 1\n', 'x'], outputs: [] },
      { cell_type: 'code', source: 'y' }
    ]
  };
  assert.deepEqual(
    parseNotebook(JSON.stringify(nb), 'a.ipynb'),
    normalizeNotebook(nb)
  );
  // nothing that only nbformat 1 has: kept as it is, metadata and all
  const bare = { ...nb, cells: [{ cell_type: 'code' }] };
  assert.deepEqual(
    parseNotebook(JSON.stringify(bare), 'a.ipynb'),
    normalizeNotebook(bare)
  );
});

test('parseNotebook rejects what is not a notebook', () => {
  const invalid: [string, string][] = [
    ['{"cells": [', 'a.ipynb is not a valid notebook (invalid JSON).'],
    ['"text"', 'a.ipynb is not a valid notebook.'],
    ['null', 'a.ipynb is not a valid notebook.'],
    ['{"nbformat": 4}', 'a.ipynb is not a valid notebook (no cells).'],
    ['{"metadata": {}}', 'a.ipynb is not a valid notebook (no cells).'],
    [
      '{"nbformat": 3, "metadata": {}}',
      'a.ipynb is not a valid notebook (no worksheets).'
    ],
    [
      '{"nbformat": 1, "worksheets": []}',
      'a.ipynb is not a valid notebook (no cells).'
    ],
    ['{"nbformat": 0}', 'a.ipynb is not a valid notebook (unknown nbformat 0).']
  ];
  for (const [text, message] of invalid) {
    assert.throws(
      () => parseNotebook(text, 'a.ipynb'),
      (err: unknown) =>
        err instanceof LoadError && err.message === message && !err.status,
      text
    );
  }
});
