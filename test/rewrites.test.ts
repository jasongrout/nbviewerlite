import assert from 'node:assert/strict';
import { test } from 'node:test';

import { viewerPathForInput } from '../src/rewrites.ts';

// Expected values follow nbviewer's uri_rewrites.
const cases: [string, string][] = [
  [
    'https://www.dropbox.com/s/abc/notebook.ipynb?dl=0',
    'urls/dl.dropbox.com/s/abc/notebook.ipynb'
  ],
  [
    'https://huggingface.co/org/model/blob/main/nb.ipynb',
    'urls/huggingface.co/org/model/resolve/main/nb.ipynb'
  ],
  [
    'https://jakevdp.github.io/downloads/notebooks/XKCD_plots.ipynb',
    'urls/jakevdp.github.io/downloads/notebooks/XKCD_plots.ipynb'
  ],
  ['http://example.org/nb.ipynb', 'url/example.org/nb.ipynb'],
  ['example.org/nb.ipynb', 'url/example.org/nb.ipynb'],
  ['https://example.org/get?name=nb.ipynb&raw=1', 'urls/example.org/get/%3Fname%3Dnb.ipynb%26raw%3D1']
];

test('landing page input follows nbviewer rewrites', () => {
  for (const [input, expected] of cases) {
    assert.equal(viewerPathForInput(input), expected, input);
  }
});

test('whitespace and empty input', () => {
  assert.equal(viewerPathForInput('  example.org/a.ipynb  '), 'url/example.org/a.ipynb');
  assert.equal(viewerPathForInput('   '), null);
});
