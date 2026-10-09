import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { test } from 'node:test';

import frontpage from '../src/frontpage.json' with { type: 'json' };
import { parseRoute } from '../src/route.ts';

const examples = frontpage.sections.flatMap(section => section.links);
const thumbnails = new URL('../public/static/img/example-nb/', import.meta.url);

test('every example links straight to a view of nbviewer lite', () => {
  assert.ok(examples.length > 0);
  for (const { target } of examples) {
    // a path on this site, not on nbviewer.org
    assert.match(target, /^\/(url|urls|github|gist)\//, target);
    const route = parseRoute(target.slice(1));
    assert.ok(
      !['notfound', 'redirect', 'home', 'faq'].includes(route.kind),
      `${target}: ${route.kind}`
    );
  }
});

test('every thumbnail is in public/, and nothing else is', () => {
  const used = examples.map(({ img }) => {
    const match = /^\/static\/img\/example-nb\/([\w-]+\.png)$/.exec(img);
    assert.ok(match, img);
    assert.ok(statSync(new URL(match[1], thumbnails)).isFile(), img);
    return match[1];
  });
  assert.deepEqual(readdirSync(thumbnails).sort(), [...new Set(used)].sort());
});
