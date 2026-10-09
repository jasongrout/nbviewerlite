import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  absoluteUrl,
  cssUrls,
  dataUrl,
  inlineStylesheet,
  isHtmlFile,
  MAX_BYTES,
  MAX_FETCHES,
  opensInViewer,
  ResourceLoader,
  rewriteCss
} from '../src/html.ts';

const RAW = 'https://raw.githubusercontent.com/u/r/main/';

/** The text of a base64 data: URL. */
function decode(url: string): string {
  const [head, data] = url.split(',');
  assert.match(head, /^data:[a-z/]+;charset=utf-8;base64$/);
  return Buffer.from(data, 'base64').toString('utf8');
}

test('isHtmlFile', () => {
  assert.ok(isHtmlFile('docs/index.html'));
  assert.ok(isHtmlFile('REPORT.HTM'));
  assert.ok(!isHtmlFile('notebook.ipynb'));
  assert.ok(!isHtmlFile('html/README.md'));
});

test('opensInViewer: notebooks, HTML files and directories', () => {
  assert.ok(opensInViewer(RAW + 'a/b.ipynb'));
  assert.ok(opensInViewer(RAW + 'a/b.ipynb#heading'));
  assert.ok(opensInViewer(RAW + 'other.html'));
  assert.ok(opensInViewer(RAW + 'other.HTM'));
  assert.ok(opensInViewer(RAW + 'docs/'));
  assert.ok(opensInViewer(RAW + 'docs'));
  assert.ok(!opensInViewer(RAW + 'img/plot.png'));
  assert.ok(!opensInViewer(RAW + 'data.csv'));
  assert.ok(!opensInViewer(RAW + 'a.css?next=b.ipynb'));
  assert.ok(!opensInViewer('not a url'));
});

test('absoluteUrl', () => {
  assert.equal(
    absoluteUrl('../css/a b.css', RAW + 'docs/page.html'),
    RAW + 'css/a%20b.css'
  );
  assert.equal(
    absoluteUrl('https://cdn.example/x.js', RAW),
    'https://cdn.example/x.js'
  );
  assert.equal(absoluteUrl('http://[bad', RAW), null);
});

test('dataUrl encodes UTF-8 as base64', () => {
  const text = 'body::after { content: "π ✓ 😀" }';
  const url = dataUrl(text, 'text/css');
  assert.ok(url.startsWith('data:text/css;charset=utf-8;base64,'));
  assert.equal(decode(url), text);
  // longer than one chunk
  const long = 'é'.repeat(100000);
  assert.equal(decode(dataUrl(long, 'text/javascript')), long);
});

test('cssUrls finds url() values and @import targets', () => {
  const css = [
    '@import "a.css";',
    "@import url('b.css') screen;",
    '@import url(c.css) layer(base);',
    '/* url(comment.png) @import "no.css"; */',
    '.x { background: url( img/a.png ) no-repeat; }',
    '.y { background: URL("img/b.png"); content: "url(string.png)"; }',
    '.z { mask: myurl(no.png); filter: url(#blur); }',
    '.e { background: url(img/e\\(1\\).png); }',
    '.f { background: url("img/f\\22.png"); }'
  ].join('\n');
  const found = cssUrls(css).map(({ url, isImport, start, end }) => {
    const written = css.slice(start, end);
    return `${isImport ? 'import ' : ''}${url} = ${written}`;
  });
  assert.deepEqual(found, [
    'import a.css = "a.css"',
    "import b.css = 'b.css'",
    'import c.css = c.css',
    'img/a.png = img/a.png',
    'img/b.png = "img/b.png"',
    '#blur = #blur',
    'img/e(1).png = img/e\\(1\\).png',
    'img/f".png = "img/f\\22.png"'
  ]);
});

test('cssUrls survives unterminated strings, comments and url(', () => {
  assert.deepEqual(cssUrls('a { content: "x'), []);
  assert.deepEqual(cssUrls('/* never closed url(a.png)'), []);
  assert.deepEqual(
    cssUrls('a { b: url(x.png').map(({ url }) => url),
    ['x.png']
  );
});

test('rewriteCss makes relative URLs absolute and inlines imports', () => {
  const sheet = RAW + 'css/main.css';
  const css = [
    '@import "base.css";',
    '@import url(print.css) print;',
    '@import url(https://fonts.example/f.css);',
    '.a { background: url(../img/a.png); }',
    ".b { background: url('//cdn.example/b.png'); }",
    '.c { background: url(data:image/png;base64,AAAA); }',
    '.d { filter: url(#blur); }',
    '.e { background: url("https://example.org/e.png"); }'
  ].join('\n');
  const inlined = new Map([
    [RAW + 'css/base.css', 'data:text/css;base64,QQ==']
  ]);
  assert.equal(
    rewriteCss(css, sheet, inlined),
    [
      '@import "data:text/css;base64,QQ==";',
      `@import url("${RAW}css/print.css") print;`,
      '@import url(https://fonts.example/f.css);',
      `.a { background: url("${RAW}img/a.png"); }`,
      '.b { background: url("https://cdn.example/b.png"); }',
      '.c { background: url(data:image/png;base64,AAAA); }',
      '.d { filter: url(#blur); }',
      '.e { background: url("https://example.org/e.png"); }'
    ].join('\n')
  );
});

test('rewriteCss writes valid strings for odd URLs', () => {
  assert.equal(
    rewriteCss('a { b: url(\'x "y".png\') }', RAW),
    `a { b: url("${RAW}x%20%22y%22.png") }`
  );
});

/** A fetch for ResourceLoader that serves `files` and logs requests. */
function fakeFetch(files: Record<string, string | number>) {
  const requests: string[] = [];
  const fetchUrl = async (url: string) => {
    requests.push(url);
    const body = files[url];
    if (body === undefined) {
      return new Response('not found', { status: 404 });
    }
    // a number: a body of that many bytes, in 64 KiB chunks
    if (typeof body === 'number') {
      let left = body;
      return new Response(
        new ReadableStream({
          pull(controller) {
            const size = Math.min(left, 65536);
            left -= size;
            if (size) {
              controller.enqueue(new Uint8Array(size).fill(97));
            } else {
              controller.close();
            }
          }
        })
      );
    }
    return new Response(body);
  };
  return { fetchUrl, requests };
}

const inRepo = (url: string) => (url.startsWith(RAW) ? url : null);

test('ResourceLoader fetches only what inlineUrl allows', async () => {
  const { fetchUrl, requests } = fakeFetch({ [RAW + 'a.js']: 'a()' });
  const loader = new ResourceLoader(inRepo, fetchUrl);
  assert.equal(await loader.load(RAW + 'a.js'), 'a()');
  assert.equal(await loader.load('https://cdn.example/b.js'), null);
  assert.equal(await loader.load(RAW + 'missing.js'), null);
  // each URL once
  assert.equal(await loader.load(RAW + 'a.js'), 'a()');
  assert.deepEqual(requests, [RAW + 'a.js', RAW + 'missing.js']);
});

test('ResourceLoader fetches from where inlineUrl says', async () => {
  const { fetchUrl } = fakeFetch({ 'https://gist.example/raw/x.css': 'x' });
  const loader = new ResourceLoader(
    url => (url.endsWith('/x.css') ? 'https://gist.example/raw/x.css' : null),
    fetchUrl
  );
  assert.equal(await loader.load('https://gist.example/raw/123/x.css'), 'x');
});

test('ResourceLoader stops after MAX_FETCHES, in call order', async () => {
  const files: Record<string, string> = {};
  const urls = Array.from({ length: MAX_FETCHES + 3 }, (_, i) => {
    files[`${RAW}${i}.js`] = String(i);
    return `${RAW}${i}.js`;
  });
  const { fetchUrl, requests } = fakeFetch(files);
  const loader = new ResourceLoader(inRepo, fetchUrl);
  const texts = await Promise.all(urls.map(url => loader.load(url)));
  assert.equal(requests.length, MAX_FETCHES);
  assert.deepEqual(
    texts.map(text => text !== null),
    urls.map((_, i) => i < MAX_FETCHES)
  );
});

test('ResourceLoader skips files beyond MAX_BYTES, keeping the rest', async () => {
  const { fetchUrl } = fakeFetch({
    [RAW + 'small.js']: 1000,
    [RAW + 'huge.js']: MAX_BYTES + 1,
    [RAW + 'big.js']: MAX_BYTES - 2000,
    [RAW + 'over.js']: 1001,
    [RAW + 'fits.js']: 1000
  });
  const loader = new ResourceLoader(inRepo, fetchUrl);
  const [small, huge, big] = await Promise.all([
    loader.load(RAW + 'small.js'),
    loader.load(RAW + 'huge.js'),
    loader.load(RAW + 'big.js')
  ]);
  assert.equal(small?.length, 1000);
  assert.equal(huge, null);
  assert.equal(big?.length, MAX_BYTES - 2000);
  // 1000 bytes left
  assert.equal(await loader.load(RAW + 'over.js'), null);
  assert.equal((await loader.load(RAW + 'fits.js'))?.length, 1000);
});

test('ResourceLoader survives failing fetches', async () => {
  const loader = new ResourceLoader(inRepo, async () => {
    throw new TypeError('Failed to fetch');
  });
  assert.equal(await loader.load(RAW + 'a.css'), null);
});

test('inlineStylesheet inlines imports from the repo, recursively', async () => {
  const { fetchUrl, requests } = fakeFetch({
    [RAW + 'css/theme.css']:
      '@import "base.css" screen; @import url(../fonts/f.css); .t { background: url(t.png) }',
    [RAW + 'css/base.css']:
      '@import "theme.css"; .b { background: url(b.png) }',
    [RAW + 'fonts/f.css']: '@font-face { src: url(f.woff2) }'
  });
  const loader = new ResourceLoader(inRepo, fetchUrl);
  const css = await inlineStylesheet(
    '@import url(css/theme.css); @import "https://fonts.example/x.css";',
    RAW + 'page.html',
    loader
  );
  const [, theme] =
    /^@import url\("([^"]+)"\); @import "https:\/\/fonts\.example\/x\.css";$/.exec(
      css
    ) ?? [];
  assert.ok(theme, css);
  const [, base, font] =
    /^@import "([^"]+)" screen; @import url\("([^"]+)"\); \.t \{ background: url\("(.+)"\) \}$/.exec(
      decode(theme)
    ) ?? [];
  assert.ok(base && font, decode(theme));
  // the cycle back to theme.css stays a URL
  assert.equal(
    decode(base),
    `@import "${RAW}css/theme.css"; .b { background: url("${RAW}css/b.png") }`
  );
  assert.equal(decode(font), `@font-face { src: url("${RAW}fonts/f.woff2") }`);
  assert.deepEqual(requests.sort(), [
    RAW + 'css/base.css',
    RAW + 'css/theme.css',
    RAW + 'fonts/f.css'
  ]);
});
