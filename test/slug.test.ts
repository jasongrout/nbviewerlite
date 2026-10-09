import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { slugify, uniqueId } from '../src/slug.ts';

// ids from Python-Markdown 3.11's toc extension (slugify, unique)
test('headings get the ids Python-Markdown gives them', () => {
  const expected: Record<string, string> = {
    'What is nbviewer?': 'what-is-nbviewer',
    'What is nbviewer.org?': 'what-is-nbviewerorg',
    'Can nbviewer run my Python, Julia, R, Scala, etc. notebooks?':
      'can-nbviewer-run-my-python-julia-r-scala-etc-notebooks',
    'Why do I get a 404: Not Found error from nbviewer?':
      'why-do-i-get-a-404-not-found-error-from-nbviewer',
    "Why can't nbviewer lite load a notebook from a URL?":
      'why-cant-nbviewer-lite-load-a-notebook-from-a-url',
    'Why can’t it load?': 'why-cant-it-load',
    'Crème brûlée & Ünïcödé': 'creme-brulee-unicode',
    'a - b -- c': 'a-b-c',
    '  spaced \t out  ': 'spaced-out',
    'snake_case stays': 'snake_case-stays',
    日本語: '',
    '100% (sure)': '100-sure'
  };
  for (const [text, id] of Object.entries(expected)) {
    assert.equal(slugify(text), id, text);
  }
});

test('repeated and empty ids get numbered', () => {
  const ids = new Set<string>();
  assert.deepEqual(
    ['faq', 'faq', 'faq', '', '', 'x_1', 'x_1'].map(id => uniqueId(id, ids)),
    ['faq', 'faq_1', 'faq_2', '_1', '_2', 'x_1', 'x_2']
  );
});

test("the FAQ's fragment links name its headings", () => {
  const faq = readFileSync(new URL('../src/faq.md', import.meta.url), 'utf8');
  const ids = new Set(
    [...faq.matchAll(/^#+ (.*)$/gm)].map(([, text]) => slugify(text))
  );
  const links = [...faq.matchAll(/\]\(#([^)]*)\)/g)].map(([, id]) => id);
  assert.ok(links.length > 0);
  for (const id of links) {
    assert.ok(ids.has(id), id);
  }
});
