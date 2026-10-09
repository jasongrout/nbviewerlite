import assert from 'node:assert/strict';
import { test } from 'node:test';

import { normalizeNotebook } from '../src/nbformat.ts';

// The data shapes JupyterLab's JSON, PDF, Vega and Mermaid renderers read,
// checked against what nbformat.reads gives for the same output.
test('normalizeNotebook keeps specs as JSON and joins text data', () => {
  const vegaLite = { mark: 'bar', data: { values: [{ a: 1 }] } };
  const vega = { marks: [] };
  const nb = {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {},
    cells: [
      {
        cell_type: 'code',
        metadata: {},
        source: 'x',
        execution_count: 1,
        outputs: [
          {
            output_type: 'display_data',
            metadata: {},
            data: {
              'application/vnd.vegalite.v5+json': vegaLite,
              'application/vnd.vega.v5+json': vega,
              'application/pdf': ['JVBERi0x\n', 'LjQK\n'],
              'text/vnd.mermaid': ['graph LR\n', '  A --> B\n'],
              // not a JSON type: its renderer splits the text into lines
              'application/jsonl': ['{"a": 1}\n', '{"a": 2}\n'],
              'application/json': ['a', 'b']
            }
          }
        ]
      }
    ]
  };
  const data = normalizeNotebook(nb).cells[0].outputs[0].data;
  assert.deepEqual(data, {
    'application/vnd.vegalite.v5+json': vegaLite,
    'application/vnd.vega.v5+json': vega,
    'application/pdf': 'JVBERi0x\nLjQK\n',
    'text/vnd.mermaid': 'graph LR\n  A --> B\n',
    'application/jsonl': '{"a": 1}\n{"a": 2}\n',
    'application/json': ['a', 'b']
  });
});
