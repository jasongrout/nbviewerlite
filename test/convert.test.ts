import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { upgradeNotebook } from '../src/convert.ts';
import { normalizeNotebook } from '../src/nbformat.ts';

function fixture(name: string): any {
  const url = new URL(`fixtures/${name}`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8'));
}

/** Check that cells have valid, unique ids, then drop them. */
function withoutIds(nb: any): any {
  const ids = nb.cells.map((cell: any) => cell.id);
  for (const id of ids) {
    assert.match(id, /^[a-zA-Z0-9_-]{1,64}$/);
  }
  assert.equal(new Set(ids).size, ids.length);
  return { ...nb, cells: nb.cells.map(({ id: _id, ...cell }: any) => cell) };
}

// Each NAME.v4.json is what Python nbformat 5.11 makes of NAME.ipynb, with
// nbformat.reads(text, as_version=4), minus the random cell ids:
//   python -c 'import json, sys, nbformat
//   nb = nbformat.reads(sys.stdin.read(), 4)
//   [cell.pop("id") for cell in nb.cells]
//   print(json.dumps(nb, indent=1, sort_keys=True))' < NAME.ipynb
const converted = {
  'v3-cells': 'every v3 cell and output type, with missing fields',
  'v3-downgraded': 'a v3 notebook that remembers its original version',
  v2: 'an nbformat 2 notebook',
  v1: 'an nbformat 1 notebook'
};

for (const [name, description] of Object.entries(converted)) {
  test(`upgradeNotebook converts ${description} as nbformat does`, () => {
    const nb = fixture(`${name}.ipynb`);
    const original = structuredClone(nb);
    const result = upgradeNotebook(nb);
    assert.deepEqual(withoutIds(result), fixture(`${name}.v4.json`));
    // the input is not modified
    assert.deepEqual(nb, original);
  });
}

test('upgraded notebooks lose orig_nbformat once normalized', () => {
  // JupyterLab shows a "Notebook converted" dialog for orig_nbformat.
  for (const name of ['v3-cells', 'v3-downgraded', 'v2', 'v1']) {
    const { metadata } = normalizeNotebook(
      upgradeNotebook(fixture(name + '.ipynb'))
    );
    assert.equal('orig_nbformat' in metadata, false);
    assert.equal('orig_nbformat_minor' in metadata, false);
  }
});

test('heading cells split lines as Python does', () => {
  const nb = upgradeNotebook({
    nbformat: 3,
    metadata: {},
    worksheets: [
      {
        cells: [
          { cell_type: 'heading', level: 2, source: 'a\vb\fc\x1cd\x85e\r' },
          { cell_type: 'heading', level: 1, source: '\n\nx\n\n' },
          { cell_type: 'heading', level: 0, source: 'zero' },
          { cell_type: 'heading', level: -1, source: 'negative' },
          { cell_type: 'heading', level: 1, source: null }
        ]
      }
    ]
  });
  assert.deepEqual(
    nb.cells.map((cell: any) => cell.source),
    ['## a b c d e', '#   x ', ' zero', ' negative', '# ']
  );
});

test('upgradeNotebook fills in what nbformat would fail on', () => {
  const nb = upgradeNotebook({
    nbformat: 3,
    worksheets: [
      {
        cells: [
          { cell_type: 'code', input: 'x' },
          {
            cell_type: 'code',
            outputs: [
              { output_type: 'display_data', metadata: null, text: 'x' },
              { output_type: 'pyout', json: '{not json' }
            ]
          }
        ]
      }
    ]
  });
  assert.deepEqual(nb.metadata, { orig_nbformat: 3, orig_nbformat_minor: 0 });
  assert.deepEqual(nb.cells[0].outputs, []);
  assert.deepEqual(nb.cells[1].outputs, [
    { output_type: 'display_data', metadata: {}, data: { 'text/plain': 'x' } },
    {
      output_type: 'execute_result',
      metadata: {},
      execution_count: null,
      data: { 'application/json': '{not json' }
    }
  ]);
});

test('upgradeNotebook rejects notebooks it cannot upgrade', () => {
  assert.throws(() => upgradeNotebook({ nbformat: 3 }), {
    message: 'no worksheets'
  });
  assert.throws(() => upgradeNotebook({ nbformat: 2, worksheets: {} }), {
    message: 'no worksheets'
  });
  assert.throws(() => upgradeNotebook({ nbformat: 1 }), {
    message: 'no cells'
  });
  assert.throws(() => upgradeNotebook({ nbformat: 0, worksheets: [] }), {
    message: 'unknown nbformat 0'
  });
});
