import assert from 'node:assert/strict';
import { test } from 'node:test';

import { rejoinLines } from '../src/nbformat.ts';

test('rejoinLines joins sources, streams, and non-JSON mime data', () => {
  const nb = {
    nbformat: 4,
    nbformat_minor: 0,
    metadata: {},
    cells: [
      {
        cell_type: 'markdown',
        source: ['# Title\n', 'text'],
        metadata: {},
        attachments: { 'a.png': { 'image/png': ['iVBO\n', 'Rw0K'] } }
      },
      {
        cell_type: 'code',
        source: ['x = 1\n', 'x'],
        metadata: {},
        execution_count: 1,
        outputs: [
          { output_type: 'stream', name: 'stdout', text: ['a\n', 'b\n'] },
          {
            output_type: 'display_data',
            metadata: {},
            data: {
              'image/png': ['iVBO\n', 'Rw0K'],
              'text/plain': ['<Figure>'],
              'application/json': ['kept', 'as', 'list'],
              'application/vnd.custom+json': { a: 1 }
            }
          }
        ]
      },
      { cell_type: 'raw', source: 'already a string', metadata: {} }
    ]
  };
  const out = rejoinLines(nb);
  assert.equal(out.cells[0].source, '# Title\ntext');
  assert.equal(out.cells[0].attachments['a.png']['image/png'], 'iVBO\nRw0K');
  assert.equal(out.cells[1].source, 'x = 1\nx');
  assert.equal(out.cells[1].outputs[0].text, 'a\nb\n');
  const data = out.cells[1].outputs[1].data;
  assert.equal(data['image/png'], 'iVBO\nRw0K');
  assert.equal(data['text/plain'], '<Figure>');
  assert.deepEqual(data['application/json'], ['kept', 'as', 'list']);
  assert.deepEqual(data['application/vnd.custom+json'], { a: 1 });
  assert.equal(out.cells[2].source, 'already a string');
  // the input is not modified
  assert.deepEqual(nb.cells[0].source, ['# Title\n', 'text']);
});
