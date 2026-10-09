import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { ipython2python, pyRepr, splitLines } from '../src/ipython.ts';

// [input, output] pairs from IPython 9's TransformerManager().transform_cell
// on Python 3.14
const readCases = (name: string): [string, string][] =>
  JSON.parse(
    readFileSync(new URL(`fixtures/script/${name}`, import.meta.url), 'utf8')
  );

test('ipython2python matches IPython', () => {
  for (const [input, expected] of readCases('ipython2python.json')) {
    assert.equal(ipython2python(input), expected, JSON.stringify(input));
  }
});

test('ipython2python matches IPython on random cells with f-strings', () => {
  for (const [input, expected] of readCases('ipython2python-random.json')) {
    assert.equal(ipython2python(input), expected, JSON.stringify(input));
  }
});

test('pyRepr quotes and escapes like Python', () => {
  assert.equal(pyRepr(''), "''");
  assert.equal(pyRepr("it's"), '"it\'s"');
  assert.equal(pyRepr('say "hi"'), '\'say "hi"\'');
  assert.equal(pyRepr(`both ' and "`), `'both \\' and "'`);
  assert.equal(pyRepr('a\\b\tc\nd\re'), "'a\\\\b\\tc\\nd\\re'");
  assert.equal(pyRepr('\x00\x1b\x7f'), "'\\x00\\x1b\\x7f'");
  assert.equal(pyRepr('café ☕ 😀'), "'café ☕ 😀'");
  assert.equal(pyRepr('\xa0\xad\u200b\u2028'), "'\\xa0\\xad\\u200b\\u2028'");
  assert.equal(pyRepr('\u{e0001}'), "'\\U000e0001'");
});

test('splitLines splits like str.splitlines(keepends=True)', () => {
  assert.deepEqual(splitLines(''), []);
  assert.deepEqual(splitLines('a\nb'), ['a\n', 'b']);
  assert.deepEqual(splitLines('a\r\nb\rc\n'), ['a\r\n', 'b\r', 'c\n']);
  assert.deepEqual(splitLines('a\fb\u2028'), ['a\f', 'b\u2028']);
});
