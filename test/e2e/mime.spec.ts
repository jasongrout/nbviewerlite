/**
 * Outputs that JupyterLab renders through extensions: Vega and Vega-Lite
 * charts, JSON trees, PDFs and Mermaid diagrams.
 */

import type { Locator } from '@playwright/test';

import {
  code,
  displayData,
  expect,
  markdown,
  notebook,
  open,
  test
} from './fixtures.ts';

const BASE = 'https://nb.example';

/** How many of the canvas's pixels are about [r, g, b]. */
function pixelsOf(canvas: Locator, [r, g, b]: number[]): Promise<number> {
  return canvas.evaluate(
    (element, color) => {
      const node = element as HTMLCanvasElement;
      const { data } = node
        .getContext('2d')!
        .getImageData(0, 0, node.width, node.height);
      let count = 0;
      for (let i = 0; i < data.length; i += 4) {
        const near = (j: number) => Math.abs(data[i + j] - color[j]) < 8;
        if (near(0) && near(1) && near(2) && data[i + 3] > 200) {
          count++;
        }
      }
      return count;
    },
    [r, g, b]
  );
}

/** A one-page PDF that says `text`, with a correct cross-reference table. */
function pdf(text: string): Buffer {
  const content = `BT /F1 24 Tf 40 100 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] ' +
      '/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  let out = '%PDF-1.4\n';
  const offsets = objects.map((object, i) => {
    const offset = out.length;
    out += `${i + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    out += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  out += `startxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

test.describe('Vega', () => {
  const nb = notebook([
    code('alt.Chart(df).mark_bar()', [
      displayData({
        'application/vnd.vegalite.v5+json': {
          $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
          description: 'A bar chart',
          data: {
            values: [
              { a: 'A', b: 28 },
              { a: 'B', b: 55 },
              { a: 'C', b: 43 }
            ]
          },
          mark: 'bar',
          encoding: {
            x: { field: 'a', type: 'nominal' },
            y: { field: 'b', type: 'quantitative' }
          }
        },
        'text/plain': 'alt.Chart(...)'
      })
    ]),
    code('vega_spec', [
      displayData({
        'application/vnd.vega.v5+json': {
          $schema: 'https://vega.github.io/schema/vega/v5.json',
          description: 'A line chart',
          width: 300,
          height: 120,
          data: [
            {
              name: 'table',
              values: [
                { x: 0, y: 10 },
                { x: 1, y: 40 },
                { x: 2, y: 25 }
              ]
            }
          ],
          scales: [
            {
              name: 'x',
              type: 'linear',
              range: 'width',
              domain: { data: 'table', field: 'x' }
            },
            {
              name: 'y',
              type: 'linear',
              range: 'height',
              domain: { data: 'table', field: 'y' }
            }
          ],
          marks: [
            {
              type: 'line',
              from: { data: 'table' },
              encode: {
                enter: {
                  x: { scale: 'x', field: 'x' },
                  y: { scale: 'y', field: 'y' },
                  stroke: { value: '#d62728' },
                  strokeWidth: { value: 4 }
                }
              }
            }
          ]
        },
        'text/plain': '<Vega object>'
      })
    ])
  ]);

  test('Vega-Lite and Vega specs draw charts', async ({ page, web }) => {
    await open(page, web, nb);
    // Vega-Lite's default bar color, and the spec's line color
    const bars = page.getByLabel('A bar chart').locator('canvas');
    await expect
      .poll(() => pixelsOf(bars, [76, 120, 168]))
      .toBeGreaterThan(500);
    const line = page.getByLabel('A line chart').locator('canvas');
    await expect.poll(() => pixelsOf(line, [214, 39, 40])).toBeGreaterThan(200);
    // instead of the text representation
    await expect(page.getByText('alt.Chart(...)')).toHaveCount(0);
    await expect(page.getByText('<Vega object>')).toHaveCount(0);
  });

  test("data files load relative to the notebook's URL", async ({
    page,
    web
  }) => {
    web.file(`${BASE}/data/values.json`, [
      { a: 1, b: 2 },
      { a: 2, b: 5 },
      { a: 3, b: 3 }
    ]);
    await open(
      page,
      web,
      notebook([
        code('alt.Chart("data/values.json").mark_circle(size=400)', [
          displayData({
            'application/vnd.vegalite.v4+json': {
              description: 'A chart of a data file',
              data: { url: 'data/values.json' },
              mark: { type: 'circle', size: 400, opacity: 1 },
              encoding: {
                x: { field: 'a', type: 'quantitative' },
                y: { field: 'b', type: 'quantitative' }
              }
            },
            'text/plain': 'alt.Chart(...)'
          })
        ])
      ])
    );
    const chart = page.getByLabel('A chart of a data file').locator('canvas');
    await expect
      .poll(() => pixelsOf(chart, [76, 120, 168]))
      .toBeGreaterThan(300);
    expect(web.requests).toContain(`GET ${BASE}/data/values.json`);
  });

  test('charts have the actions menu', async ({ page, web }) => {
    await open(page, web, nb);
    const menu = page.getByRole('group', { name: 'Click to view actions' });
    await expect(menu).toHaveCount(2);
    await menu.first().locator('summary').click();
    await expect(
      menu.first().getByRole('link', { name: 'Save as PNG' })
    ).toBeVisible();
    await expect(
      menu.first().getByRole('link', { name: 'View Source' })
    ).toBeVisible();
  });
});

test('application/json shows a tree to explore', async ({ page, web }) => {
  await open(
    page,
    web,
    notebook([
      code('JSON(data)', [
        displayData({
          'application/json': {
            name: 'nbviewer lite',
            renderers: ['json', 'pdf'],
            nested: { answer: 42 }
          },
          'text/plain': '<IPython.core.display.JSON object>'
        })
      ])
    ])
  );
  const tree = page.locator('.jp-RenderedJSON');
  await expect(tree.getByText('name', { exact: true })).toBeVisible();
  await expect(tree.getByText('"nbviewer lite"')).toBeVisible();
  await expect(tree.getByText('renderers', { exact: true })).toBeVisible();
  // nested values start collapsed
  await expect(tree.getByText('answer')).toHaveCount(0);
  await tree.getByText('nested', { exact: true }).click();
  await expect(tree.getByText('answer')).toBeVisible();
  await expect(tree.getByText('42', { exact: true })).toBeVisible();
  // and there's a search box
  await tree.getByRole('textbox', { name: 'Find…' }).fill('lite');
  await expect(tree.locator('mark')).toHaveText('lite');
  await expect(
    page.getByText('<IPython.core.display.JSON object>')
  ).toHaveCount(0);
});

test('application/pdf shows the PDF', async ({ page, web }) => {
  const bytes = pdf('Hello from a PDF');
  await open(
    page,
    web,
    notebook([
      code('PDF("hello.pdf")', [
        displayData({
          'application/pdf': bytes.toString('base64'),
          'text/plain': '<PDF object>'
        })
      ])
    ])
  );
  const frame = page.locator('.jp-PDFContainer iframe');
  await expect(frame).toBeVisible();
  expect((await frame.boundingBox())!.height).toBeGreaterThan(300);
  // in the browser's PDF viewer, from the notebook's bytes
  const object = page
    .frameLocator('.jp-PDFContainer iframe')
    .locator('object[type="application/pdf"]');
  await expect(object).toHaveAttribute('data', /^blob:/);
  const url = await object.getAttribute('data');
  const served = await page.evaluate(
    async blob => (await fetch(blob)).text(),
    url!
  );
  expect(served).toBe(bytes.toString('latin1'));
  await expect(page.getByText('<PDF object>')).toHaveCount(0);
});

test('Mermaid diagrams in markdown and outputs', async ({ page, web }) => {
  await open(
    page,
    web,
    notebook([
      markdown([
        '## Mermaid in markdown\n',
        '\n',
        '```mermaid\n',
        'graph LR\n',
        '  accTitle: Notebook flow\n',
        '  A[Notebook] --> B[Rendered page]\n',
        '```\n'
      ]),
      code('Mermaid(...)', [
        displayData({
          'text/vnd.mermaid': [
            'sequenceDiagram\n',
            '  accTitle: Fetching a notebook\n',
            '  Browser->>GitHub: fetch notebook\n',
            '  GitHub-->>Browser: ipynb JSON\n'
          ],
          'text/plain': '<Mermaid object>'
        })
      ])
    ])
  );
  for (const [name, label] of [
    ['Notebook flow', 'Rendered page'],
    ['Fetching a notebook', 'ipynb JSON']
  ]) {
    const diagram = page.getByRole('img', { name });
    await expect(diagram).toBeVisible();
    await expect
      .poll(() =>
        diagram.evaluate(img => (img as HTMLImageElement).naturalWidth)
      )
      .toBeGreaterThan(100);
    // an SVG drawing of the diagram
    const src = (await diagram.getAttribute('src')) ?? '';
    expect(src).toMatch(/^data:image\/svg\+xml,/);
    expect(decodeURIComponent(src)).toContain(label);
  }
  await expect(page.getByText('<Mermaid object>')).toHaveCount(0);
  // the source stays out of sight
  await expect(
    page.getByText('A[Notebook] --> B[Rendered page]').filter({ visible: true })
  ).toHaveCount(0);
});
