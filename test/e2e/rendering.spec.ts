/**
 * How notebooks render: outputs, JavaScript as on nbviewer.org, math, and
 * links within the page.
 */

import {
  code,
  displayData,
  errorOutput,
  executeResult,
  expect,
  filler,
  markdown,
  notebook,
  PNG,
  rawCell,
  stream,
  test,
  topOf,
  type Web
} from './fixtures.ts';

const BASE = 'https://nb.example';

/** Serve `nb` and open it. */
async function open(
  page: import('@playwright/test').Page,
  web: Web,
  nb: object,
  fragment = ''
) {
  web.file(`${BASE}/test.ipynb`, nb);
  await page.goto(`/urls/nb.example/test.ipynb${fragment}`);
}

test('outputs, math and attachments', async ({ page, web }) => {
  await open(
    page,
    web,
    notebook([
      // multi-line strings stored as lists of lines, as nbformat writes them
      markdown(['# Rich output\n', '\n', 'Euler: $e^{i\\pi} + 1 = 0$']),
      code(
        ['print("hi")\n', 'warn()'],
        [stream(['hello from stdout\n']), stream('a warning\n', 'stderr')]
      ),
      code('df', [
        executeResult({
          'text/html': [
            '<table><thead><tr><th>col</th></tr></thead>',
            '<tbody><tr><td>42</td></tr></tbody></table>'
          ],
          'text/plain': 'col\n42'
        })
      ]),
      code('plot()', [
        displayData({ 'image/png': PNG, 'text/plain': '<Figure>' })
      ]),
      code('1 / 0', [
        errorOutput('ZeroDivisionError', 'division by zero', [
          '\u001b[0;31mZeroDivisionError\u001b[0m: division by zero'
        ])
      ]),
      code('Latex()', [displayData({ 'text/latex': '$$\\int_0^1 x\\,dx$$' })]),
      {
        ...markdown('![attached](attachment:dot.png)'),
        attachments: { 'dot.png': { 'image/png': PNG } }
      },
      rawCell('raw text stays as it is')
    ])
  );
  await expect(
    page.getByRole('heading', { name: 'Rich output' })
  ).toBeVisible();
  await expect(page.getByText('hello from stdout')).toBeVisible();
  await expect(page.getByText('a warning')).toBeVisible();
  await expect(page.getByRole('cell', { name: '42' })).toBeVisible();
  await expect(
    page.getByText('ZeroDivisionError: division by zero')
  ).toBeVisible();
  await expect(page.getByText('raw text stays as it is')).toBeVisible();
  // MathJax typeset both formulas (the TeX stays in hidden editors)
  await expect(page.locator('mjx-container')).toHaveCount(2);
  await expect(
    page.getByText('$e^{i\\pi}').filter({ visible: true })
  ).toHaveCount(0);
  // images from outputs and from attachments
  const images = page.locator('img[src^="data:image/png"]');
  await expect(images).toHaveCount(2);
  for (const image of await images.all()) {
    await expect
      .poll(() => image.evaluate(img => (img as HTMLImageElement).naturalWidth))
      .toBe(8);
  }
  await expect(page.getByRole('img', { name: 'attached' })).toBeVisible();
});

test.describe('JavaScript', () => {
  const nb = notebook([
    code('HTML(...)', [
      displayData({
        'text/html':
          '<div id="log">log:</div>' +
          '<script>document.getElementById("log").textContent += ' +
          '" html script;"</script>'
      })
    ]),
    code('Javascript(...)', [
      displayData({
        'application/javascript':
          'document.getElementById("log").textContent += ' +
          '" js output, attached: " + element.isConnected + ";";\n' +
          'element.innerHTML = "<b>written with innerHTML</b>";'
      })
    ]),
    code('Javascript(...)', [
      displayData({
        'application/javascript': 'element.html("<i>written with jQuery</i>");'
      })
    ]),
    code('Javascript(...)', [
      displayData({
        'application/javascript':
          'requirejs.config({ paths: {} });\n' +
          'require(["jquery"], function ($) {\n' +
          '  element.textContent = "jQuery from RequireJS: " + typeof $;\n' +
          '});'
      })
    ]),
    code('Javascript(...)', [
      displayData({ 'application/javascript': 'throw new Error("boom");' })
    ])
  ]);

  test('runs in order with scripts in HTML, with `element` bound', async ({
    page,
    web
  }) => {
    await open(page, web, nb);
    await expect(page.locator('#log')).toHaveText(
      'log: html script; js output, attached: true;'
    );
    await expect(page.getByText('written with innerHTML')).toBeVisible();
  });

  test('works for classic-notebook outputs (jQuery, RequireJS)', async ({
    page,
    web
  }) => {
    await open(page, web, nb);
    await expect(page.getByText('written with jQuery')).toBeVisible();
    await expect(
      page.getByText('jQuery from RequireJS: function')
    ).toBeVisible();
  });

  test('shows errors in the output', async ({ page, web }) => {
    await open(page, web, nb);
    await expect(page.getByText('Javascript Error: boom')).toBeVisible();
  });
});

test.describe('within the page', () => {
  const nb = notebook([
    markdown('[top](#) [to exercise one](#ex1) <a href="#Введение">intro</a>'),
    // empty cells show nothing, not an editor or a placeholder
    markdown(''),
    markdown('<a name="ex1"></a>\n\n## Exercise one'),
    ...filler(30),
    markdown('# Введение\n\nIntroduction.'),
    ...filler(30),
    markdown('## Section two'),
    // enough below it to scroll it to the top
    ...filler(10)
  ]);

  test('fragment links scroll to anchors and headings', async ({
    page,
    web,
    context
  }) => {
    await open(page, web, nb);
    await expect(page.getByText(/Type Markdown/)).toHaveCount(0);

    await page.getByRole('link', { name: 'to exercise one' }).click();
    await expect(page).toHaveURL(/#ex1$/);
    const exercise = page.getByRole('heading', { name: 'Exercise one' });
    await expect.poll(() => topOf(exercise)).toBeLessThan(50);

    await page.getByRole('link', { name: 'intro' }).click();
    const intro = page.getByRole('heading', { name: 'Введение' });
    await expect.poll(() => topOf(intro)).toBeLessThan(20);
    await expect.poll(() => topOf(intro)).toBeGreaterThanOrEqual(0);
    expect(context.pages()).toHaveLength(1);

    await page.getByRole('link', { name: 'top', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  });

  test('a fragment in the URL scrolls there once rendered', async ({
    page,
    web
  }) => {
    await open(page, web, nb, '#Section-two');
    const section = page.getByRole('heading', { name: 'Section two' });
    await expect(section).toBeInViewport();
    await expect.poll(() => topOf(section)).toBeLessThan(20);
  });

  test("a fragment that isn't valid UTF-8 doesn't break the page", async ({
    page,
    web
  }) => {
    await open(page, web, nb, '#%E0%A4%A');
    await expect(
      page.getByRole('heading', { name: 'Exercise one' })
    ).toBeVisible();
  });
});

test('no "converted from an older format" dialog', async ({ page, web }) => {
  await open(
    page,
    web,
    notebook([markdown('# Converted')], { orig_nbformat: 3 })
  );
  await expect(page.getByRole('heading', { name: 'Converted' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('an error if the rendering code fails to load', async ({ page, web }) => {
  await page.route(/\/static\/js\/render\.[^/]*\.js$/, route => route.abort());
  await open(page, web, notebook([markdown('# Never shown')]));
  const alert = page.getByRole('alert');
  await expect(alert).toBeVisible();
  await expect(
    alert.getByRole('link', { name: 'file itself' })
  ).toHaveAttribute('href', `${BASE}/test.ipynb`);
  await expect(page.getByText('Loading notebook')).toHaveCount(0);
});

test('view state saved in the notebook, as JupyterLab shows it', async ({
  page,
  web
}) => {
  const withMetadata = (cell: any, metadata: object) => ({ ...cell, metadata });
  const lines = Array.from({ length: 100 }, (_, i) => `line ${i}\n`).join('');
  await open(
    page,
    web,
    notebook([
      withMetadata(code('print(1)', [stream('collapsed output\n')]), {
        collapsed: true
      }),
      withMetadata(code('secret = 2', [stream('shown output\n')]), {
        jupyter: { source_hidden: true }
      }),
      withMetadata(code('print(3)', [stream(lines)]), { scrolled: true })
    ])
  );
  const cell = (text: string) =>
    page.locator('.jp-Cell').filter({ hasText: text });

  // Collapsed outputs and hidden inputs are placeholders (showing their
  // first line) that expand.
  const outputs = cell('print(1)').locator('.jp-OutputArea');
  await expect(outputs).toBeHidden();
  await cell('print(1)').getByTitle('Click to expand').click();
  await expect(outputs).toHaveText('collapsed output');
  const editor = cell('shown output').locator('.cm-content');
  await expect(editor).toBeHidden();
  await cell('shown output').getByTitle('Click to expand').click();
  await expect(editor).toHaveText('secret = 2');

  // a scrolled output is a box a few lines high
  const long = page.locator('.jp-OutputArea').filter({ hasText: 'line 99' });
  expect((await long.boundingBox())?.height).toBeLessThan(1000);
});
