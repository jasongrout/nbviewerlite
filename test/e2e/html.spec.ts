/**
 * HTML files in GitHub repositories and gists: pages in a sandboxed frame,
 * with the repository's stylesheets, scripts and images.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import type { FrameLocator, Page } from '@playwright/test';

import {
  type Body,
  expect,
  gistData,
  type GitHub,
  headerLinks,
  links,
  markdown,
  notebook,
  openInMenu,
  PNG,
  test,
  type Web
} from './fixtures.ts';

const RAW = 'https://raw.githubusercontent.com/fx/demo/main';
const VIEW = '/github/fx/demo/blob/main/docs/report.html';
const JQUERY =
  'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js';

/**
 * What raw.githubusercontent.com sends with every file: browsers neither
 * run nor apply its text/plain stylesheets and scripts, and no page can
 * frame its files.
 */
const RAW_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'deny'
};

const REPORT = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Demo report</title>
<link rel="stylesheet" href="css/style.css">
</head>
<body>
<div class="banner"></div>
<h1>Demo report</h1>
<p id="app">app.js did not run</p>
<p><img src="img/plot.png" alt="plot"></p>
<ul>
<li><a href="../notebooks/analysis.ipynb#Results">the analysis</a></li>
<li><a href="../notebooks/">the notebooks</a></li>
<li><a href="other.html">another page</a></li>
<li><a href="img/plot.png">the image</a></li>
<li><a href="https://example.org/">example.org</a></li>
<li><a href="#section-2">section 2</a></li>
<li><a href="#section-2" target="_top">the second section</a></li>
</ul>
<p id="probe">not probed</p>
<div style="height: 3000px"></div>
<h2 id="section-2">Section 2</h2>
<script src="js/app.js"></script>
<script>
var results = [];
function probe(name, attempt) {
  try {
    attempt();
    results.push(name + ': allowed');
  } catch (e) {
    results.push(name + ': ' + e.name);
  }
}
probe('parent document', function () { parent.document.title = 'hacked'; });
probe('parent storage', function () { return parent.localStorage.length; });
probe('top location', function () { return top.location.href; });
probe('storage', function () { return localStorage.length; });
results.push('origin: ' + window.origin);
// not without a click
probe('navigating the viewer', function () { top.location.href = 'hijacked'; });
document.getElementById('probe').textContent = results.join('; ');
</script>
</body>
</html>`;

/** The repository fx/demo at main. */
const REPO: Record<string, Body> = {
  'docs/report.html': REPORT,
  'docs/css/style.css':
    '@import "base.css";\n' +
    'body { background: rgb(250, 245, 230); }\n' +
    '.banner { background: url(../img/bg.png); height: 24px; }\n',
  'docs/css/base.css': 'h1 { color: rgb(200, 30, 30); }\n',
  'docs/js/app.js':
    // a script that can't go in a <script> element as it is
    "var markup = '</script><!-- <script>';\n" +
    "document.getElementById('app').textContent = 'app.js ran';\n",
  'docs/img/plot.png': Buffer.from(PNG, 'base64'),
  'docs/img/bg.png': Buffer.from(PNG, 'base64'),
  'docs/other.html':
    '<!DOCTYPE html><title>Other</title><h1>Another page</h1>' +
    '<a href="report.html">back to the report</a>',
  'docs/OLD.HTM': '<h1>An old page</h1>',
  // slide decks keep the slide in the fragment
  'docs/deck.html': `<!DOCTYPE html>
<title>Deck</title>
<h1 id="slide">slide 0</h1>
<script>
try {
  history.pushState({}, '', '#/1');
  document.getElementById('slide').textContent = 'slide ' + location.hash;
} catch (e) {
  document.getElementById('slide').textContent = e.name;
}
</script>`,
  // nbconvert's classic template, with the well-known "toggle code" form in
  // an output (and jQuery from cdnjs)
  'docs/export.html': `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>export</title>
<script src="${JQUERY}"></script>
</head>
<body>
<div class="cell border-box-sizing code_cell rendered">
<div class="input"><pre>print("hello")</pre></div>
<div class="output_wrapper"><div class="output_html rendered_html">
<script>
code_show=true;
function code_toggle() {
 if (code_show){
 $('div.input').hide();
 } else {
 $('div.input').show();
 }
 code_show = !code_show
}
$( document ).ready(code_toggle);
</script>
<form action="javascript:code_toggle()"><input type="submit" value="Click here to toggle on/off the raw code."></form>
</div></div>
</div>
<p><a href="javascript:code_toggle()%3B%20void%200">toggle the code</a>
<a href="javascript:code_toggle()" onclick="return false">handled</a>
<a href="javascript:missing()">broken</a></p>
<form action="other.html">
<button formaction="javascript:code_toggle()">toggle it from a button</button>
</form>
</body>
</html>`,
  // a script twice
  'docs/twice.html':
    '<!DOCTYPE html><p id="count">0</p>' +
    '<script src="js/count.js"></script><script src="js/count.js"></script>',
  'docs/js/count.js':
    "var count = document.getElementById('count');\n" +
    'count.textContent = Number(count.textContent) + 1;\n',
  'notebooks/analysis.ipynb': notebook([
    markdown(
      '# Analysis\n\n[the report, section 2](../docs/report.html#section-2)'
    ),
    markdown('Lorem ipsum. '.repeat(400)),
    markdown('## Results\n\nDone.'),
    markdown('Lorem ipsum. '.repeat(400))
  ]),
  'data.csv': 'a,b\n1,2\n'
};

function setUpRepo(github: GitHub, web: Web) {
  github.files('fx', 'demo', 'main', REPO);
  for (const [path, body] of Object.entries(REPO)) {
    web.file(`${RAW}/${path}`, body, { headers: RAW_HEADERS });
  }
}

test.beforeEach(({ github, web }) => setUpRepo(github, web));

/** The frame showing the HTML file `name`, and what's in it. */
function htmlFrame(page: Page, name: string) {
  const element = page.locator(`iframe[title="${name}"]`);
  return { element, frame: element.contentFrame() };
}

/** The page's probes of the viewer, once they ran. */
async function probes(frame: FrameLocator): Promise<string[]> {
  const probe = frame.locator('#probe');
  await expect(probe).not.toHaveText('not probed');
  return ((await probe.textContent()) ?? '').split('; ');
}

test.describe('an HTML file in a repository', () => {
  test('shows as a page in a sandboxed frame', async ({ page }) => {
    await page.goto(VIEW);
    await expect(page).toHaveTitle('report.html - nbviewer lite');
    const { element, frame } = htmlFrame(page, 'report.html');
    await expect(
      frame.getByRole('heading', { name: 'Demo report' })
    ).toBeVisible();
    const sandbox = ((await element.getAttribute('sandbox')) ?? '').split(' ');
    expect(sandbox).toContain('allow-scripts');
    expect(sandbox).not.toContain('allow-same-origin');
    await openInMenu(page);
    expect(await links(headerLinks(page))).toEqual([
      ['GitHub', 'https://github.com/fx/demo/blob/main/docs/report.html'],
      ['nbviewer.org', `https://nbviewer.org${VIEW}`],
      ['Download HTML', `${RAW}/docs/report.html`]
    ]);
    expect(
      await links(page.getByRole('navigation', { name: 'Breadcrumb' }))
    ).toEqual([
      ['demo', '/github/fx/demo/tree/main/'],
      ['docs', '/github/fx/demo/tree/main/docs/']
    ]);
    await expect(
      page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('listitem')
    ).toHaveText(['demo', 'docs', 'report.html']);
  });

  test('fills the window below the header', async ({ page }) => {
    await page.goto(VIEW);
    const { element, frame } = htmlFrame(page, 'report.html');
    await expect(
      frame.getByRole('heading', { name: 'Demo report' })
    ).toBeVisible();
    const breadcrumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
    // as wide as the content, as tall as the window below it
    const fits = async () => {
      const box = (await element.boundingBox())!;
      const content = (await breadcrumbs.boundingBox())!;
      const window = page.viewportSize()!;
      return (
        Math.abs(box.width - content.width) <= 1 &&
        box.y + box.height <= window.height &&
        box.height > window.height / 2
      );
    };
    expect(await fits()).toBe(true);
    // a phone: the header wraps, and nothing scrolls sideways
    await page.setViewportSize({ width: 420, height: 800 });
    await expect.poll(fits).toBe(true);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(420);
  });

  test("with the repository's stylesheets, scripts and images", async ({
    page
  }) => {
    await page.goto(VIEW);
    const { frame } = htmlFrame(page, 'report.html');
    // css/style.css, and base.css that it imports
    await expect(frame.locator('body')).toHaveCSS(
      'background-color',
      'rgb(250, 245, 230)'
    );
    await expect(frame.getByRole('heading', { name: 'Demo report' })).toHaveCSS(
      'color',
      'rgb(200, 30, 30)'
    );
    // url()s in stylesheets point at the repository
    await expect(frame.locator('.banner')).toHaveCSS(
      'background-image',
      `url("${RAW}/docs/img/bg.png")`
    );
    await expect(frame.getByText('app.js ran')).toBeVisible();
    const plot = frame.getByRole('img', { name: 'plot' });
    await expect(plot).toHaveJSProperty(
      'currentSrc',
      `${RAW}/docs/img/plot.png`
    );
    await expect
      .poll(() => plot.evaluate(img => (img as HTMLImageElement).naturalWidth))
      .toBe(8);
  });

  test("its scripts can't reach the viewer", async ({ page }) => {
    await page.goto(VIEW);
    const { frame } = htmlFrame(page, 'report.html');
    // an opaque origin: none of the viewer's, and no storage
    expect(await probes(frame)).toEqual([
      'parent document: SecurityError',
      'parent storage: SecurityError',
      'top location: SecurityError',
      'storage: SecurityError',
      'origin: null',
      'navigating the viewer: SecurityError'
    ]);
    await expect(page).toHaveTitle('report.html - nbviewer lite');
    await expect(page).toHaveURL(VIEW);
  });

  test('links to notebooks, pages and directories open in the viewer', async ({
    page
  }) => {
    await page.goto(VIEW);
    const app = new URL(page.url()).origin;
    const { frame } = htmlFrame(page, 'report.html');
    const link = (name: string) => frame.getByRole('link', { name });
    const notebookLink = link('the analysis');
    await expect(notebookLink).toHaveAttribute(
      'href',
      `${app}/github/fx/demo/blob/main/notebooks/analysis.ipynb#Results`
    );
    await expect(notebookLink).toHaveAttribute('target', '_top');
    await expect(link('the notebooks')).toHaveAttribute(
      'href',
      `${app}/github/fx/demo/tree/main/notebooks/`
    );
    await expect(link('another page')).toHaveAttribute(
      'href',
      `${app}/github/fx/demo/blob/main/docs/other.html`
    );
    // other files and other sites stay as they are
    await expect(link('the image')).toHaveAttribute('href', 'img/plot.png');
    await expect(link('example.org')).toHaveAttribute(
      'href',
      'https://example.org/'
    );

    await notebookLink.click();
    await expect(page).toHaveURL(
      '/github/fx/demo/blob/main/notebooks/analysis.ipynb#Results'
    );
    const results = page.getByRole('heading', { name: 'Results' });
    await expect(results).toBeInViewport();
  });

  test('a link to a directory opens its listing', async ({ page }) => {
    await page.goto(VIEW);
    const { frame } = htmlFrame(page, 'report.html');
    await frame.getByRole('link', { name: 'the notebooks' }).click();
    await expect(page).toHaveURL('/github/fx/demo/tree/main/notebooks/');
    await expect(
      page.getByRole('link', { name: 'analysis.ipynb' })
    ).toBeVisible();
  });

  test("the viewer URL's fragment scrolls the page", async ({ page }) => {
    await page.goto('/github/fx/demo/blob/main/notebooks/analysis.ipynb');
    const link = page.getByRole('link', { name: 'the report, section 2' });
    await expect(link).toHaveAttribute('href', `${VIEW}#section-2`);
    await link.click();
    await expect(page).toHaveURL(`${VIEW}#section-2`);
    const { frame } = htmlFrame(page, 'report.html');
    await expect(
      frame.getByRole('heading', { name: 'Section 2' })
    ).toBeInViewport();
  });

  test('its scripts can change its fragment with the History API', async ({
    page
  }) => {
    await page.goto('/github/fx/demo/blob/main/docs/deck.html');
    const { frame } = htmlFrame(page, 'deck.html');
    await expect(frame.getByRole('heading')).toHaveText('slide #/1');
    await expect(page).toHaveURL('/github/fx/demo/blob/main/docs/deck.html');
  });

  test('a missing file', async ({ page }) => {
    await page.goto('/github/fx/demo/blob/main/docs/missing.html');
    const alert = page.getByRole('alert');
    await expect(alert).toContainText(
      `404 Not Found fetching ${RAW}/docs/missing.html`
    );
    expect(await links(alert)).toEqual([
      [
        'file on GitHub',
        'https://github.com/fx/demo/blob/main/docs/missing.html'
      ],
      [
        'view it on nbviewer.org',
        'https://nbviewer.org/github/fx/demo/blob/main/docs/missing.html'
      ]
    ]);
  });

  test('fragment links scroll within the page', async ({ page }) => {
    await page.goto(VIEW);
    const { frame } = htmlFrame(page, 'report.html');
    const section = frame.getByRole('heading', { name: 'Section 2' });
    await expect(section).not.toBeInViewport();
    await frame.getByRole('link', { name: 'section 2' }).click();
    await expect(section).toBeInViewport();
    await expect(page).toHaveURL(VIEW);
    // also with target=_top, the page itself when nbviewer serves it
    await frame.locator('body').evaluate(() => {
      location.hash = '';
      scrollTo(0, 0);
    });
    await expect(section).not.toBeInViewport();
    await frame.getByRole('link', { name: 'the second section' }).click();
    await expect(section).toBeInViewport();
    await expect(page).toHaveURL(VIEW);
  });

  test('javascript: links and forms run in the page', async ({
    page,
    web,
    pageErrors
  }) => {
    web.file(
      JQUERY,
      readFileSync('node_modules/jquery/dist/jquery.min.js', 'utf8'),
      { contentType: 'text/javascript' }
    );
    await page.goto('/github/fx/demo/blob/main/docs/export.html');
    const { frame } = htmlFrame(page, 'export.html');
    const input = frame.getByText('print("hello")');
    // hidden once the document is ready
    await expect(input).toBeHidden();
    await frame
      .getByRole('button', {
        name: 'Click here to toggle on/off the raw code.'
      })
      .click();
    await expect(input).toBeVisible();
    // percent-decoded, as browsers do
    await frame.getByRole('link', { name: 'toggle the code' }).click();
    await expect(input).toBeHidden();
    // not when the page handles the click itself
    await frame.getByRole('link', { name: 'handled' }).click();
    await frame.getByRole('link', { name: 'toggle the code' }).click();
    await expect(input).toBeVisible();
    // a button's formaction
    await frame
      .getByRole('button', { name: 'toggle it from a button' })
      .click();
    await expect(input).toBeHidden();
    // what fails is reported, as anywhere
    await frame.getByRole('link', { name: 'broken' }).click();
    await expect
      .poll(() => pageErrors.map(String))
      .toEqual(['ReferenceError: missing is not defined']);
    pageErrors.length = 0;
    await expect(page).toHaveURL('/github/fx/demo/blob/main/docs/export.html');
  });

  test('a script used twice runs twice', async ({ page }) => {
    await page.goto('/github/fx/demo/blob/main/docs/twice.html');
    const { frame } = htmlFrame(page, 'twice.html');
    await expect(frame.locator('#count')).toHaveText('2');
  });
});

test.describe('an HTML file in a gist', () => {
  const ID = 'abcdefabcdefabcdef12';

  /**
   * A gist with a page, its stylesheet and a notebook. Each file's raw URL
   * has a hash of its own, as on GitHub, so files aren't next to each other
   * there.
   */
  function setUpGist(github: GitHub, web: Web) {
    const gist = gistData({
      id: ID,
      owner: 'fx',
      files: {
        'page.html':
          '<!DOCTYPE html><link rel="stylesheet" href="style.css">' +
          '<h1>Gist page</h1><a href="nb.ipynb#Results">the notebook</a>',
        'style.css': 'h1 { color: rgb(10, 100, 10); }',
        'nb.ipynb': notebook([markdown('# Gist notebook')])
      }
    });
    const files = gist.files as Record<
      string,
      { raw_url: string; content: string }
    >;
    for (const [name, file] of Object.entries(files)) {
      const hash = createHash('sha1').update(file.content).digest('hex');
      file.raw_url = `https://gist.githubusercontent.com/fx/${ID}/raw/${hash}/${name}`;
      web.file(file.raw_url, file.content, { headers: RAW_HEADERS });
    }
    github.on(`/gists/${ID}`, { body: gist });
    return files;
  }

  test('shows as a page, with the stylesheets in the gist', async ({
    page,
    github,
    web
  }) => {
    const files = setUpGist(github, web);
    await page.goto(`/gist/fx/${ID}/page.html`);
    await expect(page).toHaveTitle('page.html - nbviewer lite');
    const { element, frame } = htmlFrame(page, 'page.html');
    const heading = frame.getByRole('heading', { name: 'Gist page' });
    await expect(heading).toHaveCSS('color', 'rgb(10, 100, 10)');
    expect(await element.getAttribute('sandbox')).not.toContain(
      'allow-same-origin'
    );
    await openInMenu(page);
    expect(await links(headerLinks(page))).toEqual([
      ['Gist', `https://gist.github.com/${ID}`],
      ['nbviewer.org', `https://nbviewer.org/gist/fx/${ID}/page.html`],
      ['Download HTML', files['page.html'].raw_url]
    ]);

    const notebookLink = frame.getByRole('link', { name: 'the notebook' });
    await expect(notebookLink).toHaveAttribute('target', '_top');
    await notebookLink.click();
    await expect(page).toHaveURL(`/gist/fx/${ID}/nb.ipynb#Results`);
    await expect(
      page.getByRole('heading', { name: 'Gist notebook' })
    ).toBeVisible();
  });

  test('a gist of just an HTML file shows it', async ({ page, github }) => {
    const single = 'cdcdcdcdcdcdcdcdcdcd';
    github.gist({
      id: single,
      owner: 'fx',
      files: { 'only.html': '<h1>The only page</h1>' }
    });
    await page.goto(`/gist/fx/${single}`);
    const { frame } = htmlFrame(page, 'only.html');
    await expect(
      frame.getByRole('heading', { name: 'The only page' })
    ).toBeVisible();
  });

  test('other files in it open from their raw URL', async ({
    page,
    github,
    web
  }) => {
    const files = setUpGist(github, web);
    await page.goto(`/gist/fx/${ID}/style.css`);
    await expect(page).toHaveURL(files['style.css'].raw_url);
    await expect(
      page.getByText('h1 { color: rgb(10, 100, 10); }')
    ).toBeVisible();
  });
});

test.describe('other files in a repository', () => {
  test('open from raw.githubusercontent.com', async ({ page }) => {
    await page.goto('/github/fx/demo/blob/main/data.csv');
    await expect(page).toHaveURL(`${RAW}/data.csv`);
    await page.goto('/github/fx/demo/blob/main/docs/css/style.css');
    await expect(page).toHaveURL(`${RAW}/docs/css/style.css`);
  });

  test('.htm files and capitals count as HTML', async ({ page }) => {
    await page.goto('/github/fx/demo/blob/main/docs/OLD.HTM');
    const { frame } = htmlFrame(page, 'OLD.HTM');
    await expect(
      frame.getByRole('heading', { name: 'An old page' })
    ).toBeVisible();
  });
});
