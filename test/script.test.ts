import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

import { normalizeNotebook } from '../src/nbformat.ts';
import { notebookToScript, scriptFilename } from '../src/script.ts';

// Each fixture notebook sits next to nbconvert's script export of it, named
// with the extension nbconvert chose.
const dir = new URL('fixtures/script/', import.meta.url);
const files = readdirSync(dir);

for (const name of files.filter(f => f.endsWith('.ipynb'))) {
  const base = name.slice(0, -'.ipynb'.length);
  test(`script export of ${name} matches nbconvert`, () => {
    const expected = files.find(f => f !== name && f.startsWith(base + '.'));
    assert.ok(expected, `no expected output for ${name}`);
    const nb = normalizeNotebook(
      JSON.parse(readFileSync(new URL(name, dir), 'utf8'))
    );
    const script = notebookToScript(nb);
    assert.equal(script.text, readFileSync(new URL(expected, dir), 'utf8'));
    assert.equal(script.extension, expected.slice(base.length));
  });
}

test('script file names', () => {
  assert.equal(scriptFilename('Analysis.ipynb', '.py'), 'Analysis.py');
  assert.equal(scriptFilename('notes.IPYNB', '.r'), 'notes.r');
  assert.equal(scriptFilename('gist-file', 'jl'), 'gist-file.jl');
  assert.equal(scriptFilename('', '.txt'), 'notebook.txt');
});
