/**
 * Notebooks in nbformat 3 (IPython 1 and 2) and older, which the browser
 * upgrades to nbformat 4 as nbviewer.org does with
 * nbformat.reads(..., as_version=4).
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import {
  expect,
  type GitHub,
  headerLinks,
  links,
  openInMenu,
  PNG,
  test,
  textColor,
  v3Notebook
} from './fixtures.ts';

// An nbformat 3 notebook as IPython 2 saved them: heading cells, math,
// prompts, outputs and plots (like the front page's nbformat 3 examples).
const HEAT_EQUATION = 'github/jovyan/notebooks/blob/master/heat-equation.ipynb';

function serveHeatEquation(github: GitHub) {
  github.files('jovyan', 'notebooks', 'master', {
    'heat-equation.ipynb': readFileSync(
      'test/fixtures/heat-equation.ipynb',
      'utf8'
    )
  });
}

test('an nbformat 3 notebook from GitHub', async ({ page, github }) => {
  serveHeatEquation(github);
  await page.goto(`/${HEAT_EQUATION}`);

  // heading cells, at their levels
  await expect(
    page.getByRole('heading', { level: 1, name: 'The Heat Equation' })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 2, name: 'Finite Differences' })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 3, name: 'Time Stepping' })
  ).toBeVisible();
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(2);
  await expect(page.getByRole('heading', { level: 3 })).toHaveCount(2);

  // math is typeset, and no TeX is left showing
  await expect.poll(() => page.locator('mjx-container').count()).toBe(10);
  await expect(
    page.getByText('\\frac{D \\Delta t}').filter({ visible: true })
  ).toHaveCount(0);

  // code, highlighted as Python, with its prompt and outputs
  const firstCell = page
    .locator('.jp-CodeCell')
    .filter({ hasText: 'import numpy' })
    .first();
  await expect(firstCell.getByText('[1]:')).toBeVisible();
  const keyword = firstCell.getByText('import', { exact: true }).first();
  await expect(keyword).toBeVisible();
  expect(await textColor(keyword)).not.toBe(
    await textColor(firstCell.locator('.cm-line').first())
  );
  await expect(page.getByText('sigma = 0.4')).toBeVisible();
  await expect(page.getByText('1.22464680e-16')).toBeVisible();

  // the three plots
  const plots = page.locator('img[src^="data:image/png"]');
  await expect(plots).toHaveCount(3);
  for (const plot of await plots.all()) {
    await plot.scrollIntoViewIfNeeded();
    await expect
      .poll(() => plot.evaluate(img => (img as HTMLImageElement).naturalWidth))
      .toBe(400);
  }

  // shown as it is, without JupyterLab's "converted" dialog or an error
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await openInMenu(page);
  expect(await links(headerLinks(page))).toContainEqual([
    'Code',
    `/format/script/${HEAT_EQUATION}`
  ]);
});

test("an nbformat 3 notebook's script", async ({ page, github }) => {
  serveHeatEquation(github);
  await page.goto(`/format/script/${HEAT_EQUATION}`);
  const script = page.locator('pre');
  await expect(script).toContainText('def step(u, sigma):');
  // what nbconvert 7.17 writes: nbformat 3 has no language_info, so the
  // generic template, as plain text
  const text = (await script.textContent()) ?? '';
  expect(text).toMatch(
    /^import numpy as np\nfrom matplotlib import pyplot as plt\n%matplotlib inline\n\nL, D/
  );
  expect(createHash('sha256').update(text).digest('hex')).toBe(
    'cc361b25df367fd52eb5fc86055a9ca00ca7069302d0791056aaf447beb91cc2'
  );
  // highlighted as Python, like the notebook's code cells
  const keyword = script.getByText('import', { exact: true }).first();
  await expect(keyword).toBeVisible();
  expect(await textColor(keyword)).not.toBe(await textColor(script));
  await expect(
    page.getByRole('link', { name: 'Download Script' })
  ).toHaveAttribute('download', 'heat-equation.txt');
});

test('heading cells, outputs and a traceback in nbformat 3', async ({
  page,
  web
}) => {
  web.file(
    'https://nb.example/old.ipynb',
    v3Notebook([
      { cell_type: 'heading', level: 1, metadata: {}, source: ['Old title'] },
      {
        cell_type: 'heading',
        level: 2,
        metadata: {},
        source: ['A two-line\n', 'heading']
      },
      { cell_type: 'heading', level: 4, metadata: {}, source: 'Level four' },
      {
        cell_type: 'markdown',
        metadata: {},
        source: ['Inline math: $e^{i\\pi} + 1 = 0$']
      },
      { cell_type: 'html', metadata: {}, source: '<b>An HTML cell</b>' },
      {
        cell_type: 'code',
        collapsed: false,
        input: ['print "hello"\n', 'import sys; sys.stderr.write("careful")'],
        language: 'python',
        metadata: {},
        outputs: [
          { output_type: 'stream', stream: 'stdout', text: ['hello\n'] },
          { output_type: 'stream', stream: 'stderr', text: 'careful' }
        ],
        prompt_number: 1
      },
      {
        cell_type: 'code',
        collapsed: false,
        input: 'df',
        language: 'python',
        metadata: {},
        outputs: [
          {
            output_type: 'pyout',
            prompt_number: 2,
            metadata: {},
            html: [
              '<table><tr><th>col</th></tr>',
              '<tr><td>17</td></tr></table>'
            ],
            text: ['col\n', '17']
          }
        ],
        prompt_number: 2
      },
      {
        cell_type: 'code',
        collapsed: false,
        input: 'plot()',
        language: 'python',
        metadata: {},
        outputs: [
          {
            output_type: 'display_data',
            metadata: {},
            png: PNG,
            text: '<matplotlib.figure.Figure at 0x10>'
          }
        ],
        prompt_number: 3
      },
      {
        cell_type: 'code',
        collapsed: false,
        input: '1/0',
        language: 'python',
        metadata: {},
        outputs: [
          {
            output_type: 'pyerr',
            ename: 'ZeroDivisionError',
            evalue: 'integer division or modulo by zero',
            traceback: [
              '\u001b[1;31m------------------------------------------------\u001b[0m',
              '\u001b[1;31mZeroDivisionError\u001b[0m    Traceback (most recent call last)',
              '\u001b[1;32m<ipython-input-4>\u001b[0m in \u001b[0;36m<module>\u001b[1;34m()\u001b[0m',
              '\u001b[1;31mZeroDivisionError\u001b[0m: integer division or modulo by zero'
            ]
          }
        ],
        prompt_number: 4
      }
    ])
  );
  await page.goto('/urls/nb.example/old.ipynb');

  await expect(
    page.getByRole('heading', { level: 1, name: 'Old title' })
  ).toBeVisible();
  // nbformat joins a heading's lines with spaces
  await expect(
    page.getByRole('heading', { level: 2, name: 'A two-line heading' })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 4, name: 'Level four' })
  ).toBeVisible();
  await expect(page.locator('mjx-container')).toHaveCount(1);
  await expect(page.getByText('An HTML cell', { exact: true })).toBeVisible();

  // streams, the HTML result and the image
  await expect(page.getByText('hello', { exact: true })).toBeVisible();
  await expect(page.getByText('careful', { exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '17' })).toBeVisible();
  await expect(page.getByText('[2]:')).toHaveCount(2);
  const image = page.locator('img[src^="data:image/png"]');
  await expect
    .poll(() => image.evaluate(img => (img as HTMLImageElement).naturalWidth))
    .toBe(8);

  // the traceback, with its ANSI colors
  const traceback = page.getByText('Traceback (most recent call last)');
  await expect(traceback).toBeVisible();
  const error = page
    .getByText('ZeroDivisionError', { exact: true })
    .filter({ visible: true });
  await expect(error).toHaveCount(2);
  await expect(
    page.getByText(': integer division or modulo by zero')
  ).toBeVisible();
  expect(await textColor(error.first())).not.toBe(
    await textColor(page.getByText('<module>'))
  );

  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('an nbformat 1 notebook, which has no nbformat key', async ({
  page,
  web
}) => {
  // as nbformat's v1 writer saved them: text and code cells
  web.file(
    'https://nb.example/v1.ipynb',
    readFileSync('test/fixtures/v1-nokey.ipynb', 'utf8')
  );
  await page.goto('/urls/nb.example/v1.ipynb');

  await expect(
    page.getByRole('heading', { level: 1, name: 'nbformat 1' })
  ).toBeVisible();
  await expect(page.getByText('v1', { exact: true })).toBeVisible();
  const cells = page.locator('.jp-CodeCell');
  await expect(cells).toHaveCount(2);
  await expect(cells.first().getByText('[3]:')).toBeVisible();
  await expect(cells.first()).toContainText('x = 1');
  await expect(cells.last()).toContainText('print(x)');
  await expect(page.locator('.jp-RawCell')).toHaveCount(0);
});
