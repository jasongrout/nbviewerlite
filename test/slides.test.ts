import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import type * as nbformat from '@jupyterlab/nbformat';

import { slideDeck } from '../src/slides.ts';

// Cells' metadata and the slides that nbconvert's SlidesExporter makes of
// them, read back from its <section>s (null where it refuses).
const cases: {
  metadata: nbformat.IBaseCellMetadata[];
  deck: unknown;
}[] = JSON.parse(
  readFileSync(new URL('fixtures/slides.json', import.meta.url), 'utf8')
);

test('slides are grouped like nbconvert groups them', () => {
  for (const { metadata, deck } of cases) {
    const cells = metadata.map(m => ({
      cell_type: 'markdown' as const,
      source: '',
      metadata: m
    }));
    assert.deepEqual(slideDeck(cells), deck, JSON.stringify(metadata));
  }
});

test('malformed slideshow metadata counts as "-"', () => {
  const cells = [
    { cell_type: 'markdown' as const, source: '', metadata: {} },
    {
      cell_type: 'markdown' as const,
      source: '',
      metadata: { slideshow: 'slide' }
    }
  ];
  assert.deepEqual(slideDeck(cells), [
    {
      attributes: {},
      subslides: [
        {
          attributes: {},
          content: [
            { index: 0, notes: false },
            { index: 1, notes: false }
          ]
        }
      ]
    }
  ]);
});
