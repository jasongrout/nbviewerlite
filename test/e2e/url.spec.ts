/**
 * url/ and urls/: notebooks from any host that allows cross-origin reads,
 * and the errors for the ones that don't.
 */

import {
  code,
  executeResult,
  expect,
  filler,
  headerLinks,
  links,
  markdown,
  notebook,
  PNG,
  startingWith,
  test
} from './fixtures.ts';

const XKCD = notebook(
  [
    markdown('# XKCD plots\n\nPlots that look *hand-drawn*.'),
    code('1 + 1', [executeResult({ 'text/plain': '2' })])
  ],
  { kernelspec: { name: 'python3', display_name: 'Python 3 (ipykernel)' } }
);

test('a notebook over http (url/)', async ({ page, web }) => {
  web.file('http://nb.example/notebooks/xkcd.ipynb', XKCD);
  await page.goto('/url/nb.example/notebooks/xkcd.ipynb');
  await expect(page.getByRole('heading', { name: 'XKCD plots' })).toBeVisible();
  await expect(page).toHaveTitle('xkcd.ipynb - nbviewer lite');
  await expect(page.getByText('1 + 1')).toBeVisible();
  await expect(page.getByText('2', { exact: true })).toBeVisible();
  // the kernel is a label, not a link
  await expect(headerLinks(page)).toContainText('Python 3 (ipykernel) Kernel');
  // among others (other formats of the notebook, say)
  expect(await links(headerLinks(page))).toEqual(
    expect.arrayContaining([
      [
        'View on nbviewer.org',
        'https://nbviewer.org/url/nb.example/notebooks/xkcd.ipynb'
      ],
      ['Download Notebook', 'http://nb.example/notebooks/xkcd.ipynb'],
      // JupyterLite downloads the notebook from the same URL
      [
        'Open in JupyterLab',
        'https://jupyter.org/try-jupyter/lab/index.html?fromURL=http%3A%2F%2Fnb.example%2Fnotebooks%2Fxkcd.ipynb'
      ],
      [
        'Open in Jupyter Notebook',
        'https://jupyter.org/try-jupyter/notebooks/index.html?fromURL=http%3A%2F%2Fnb.example%2Fnotebooks%2Fxkcd.ipynb'
      ]
    ])
  );
});

test('a notebook over https, with a query string (urls/)', async ({
  page,
  web
}) => {
  web.file('https://nb.example/api/notebook?id=7&raw=1', XKCD);
  await page.goto('/urls/nb.example/api/notebook/%3Fid%3D7%26raw%3D1');
  await expect(page.getByRole('heading', { name: 'XKCD plots' })).toBeVisible();
  await expect(
    headerLinks(page).getByRole('link', { name: 'Download Notebook' })
  ).toHaveAttribute('href', 'https://nb.example/api/notebook?id=7&raw=1');
});

test.describe('errors', () => {
  test("a host that doesn't allow cross-origin reads", async ({
    page,
    web
  }) => {
    web.file('https://nocors.example/a.ipynb', XKCD, { cors: false });
    await page.goto('/urls/nocors.example/a.ipynb');
    const alert = page.getByRole('alert');
    await expect(alert).toContainText(
      'Could not fetch https://nocors.example/a.ipynb from your browser.'
    );
    await expect(alert).toContainText('cross-origin requests (CORS)');
    expect(await links(alert)).toEqual([
      ['file itself', 'https://nocors.example/a.ipynb'],
      [
        'view it on nbviewer.org',
        'https://nbviewer.org/urls/nocors.example/a.ipynb'
      ]
    ]);
    // the host answered; the browser kept the response from the page
    expect(web.requests).toEqual(['GET https://nocors.example/a.ipynb']);
  });

  test('an unreachable host', async ({ page, web }) => {
    web.down('https://gone.example');
    await page.goto('/urls/gone.example/a.ipynb');
    await expect(page.getByRole('alert')).toContainText(
      'Could not fetch https://gone.example/a.ipynb from your browser.'
    );
  });

  test('an HTTP error', async ({ page, web }) => {
    web.file('https://nb.example/private.ipynb', 'Forbidden', { status: 403 });
    await page.goto('/urls/nb.example/private.ipynb');
    await expect(page.getByRole('alert')).toContainText(
      '403 Forbidden fetching https://nb.example/private.ipynb'
    );
  });

  test('not JSON', async ({ page, web }) => {
    web.file('https://nb.example/page.ipynb', '<!doctype html><p>Sign in');
    await page.goto('/urls/nb.example/page.ipynb');
    await expect(page.getByRole('alert')).toContainText(
      'page.ipynb is not a valid notebook (invalid JSON).'
    );
  });

  test('JSON without cells', async ({ page, web }) => {
    web.file('https://nb.example/data.ipynb', { nbformat: 4, metadata: {} });
    await page.goto('/urls/nb.example/data.ipynb');
    await expect(page.getByRole('alert')).toContainText(
      'data.ipynb is not a valid notebook (no cells).'
    );
  });
});

test('a notebook without cells', async ({ page, web }) => {
  web.file('https://nb.example/empty.ipynb', notebook([]));
  await page.goto('/urls/nb.example/empty.ipynb');
  await expect(page.getByText('This notebook has no cells.')).toBeVisible();
  await expect(
    headerLinks(page).getByRole('link', { name: 'Download Notebook' })
  ).toBeVisible();
});

test.describe('relative links', () => {
  const base = 'https://nb.example/notebooks';

  test.beforeEach(({ web }) => {
    web.file(
      `${base}/index.ipynb`,
      notebook([
        markdown(
          '# Index\n\n' +
            '[next notebook](sub/next.ipynb), [data](data.csv), ' +
            '[results](#Results), [elsewhere](https://example.org/page)\n\n' +
            '![logo](img/logo.png)'
        ),
        ...filler(3),
        markdown('## Results')
      ])
    );
    web.file(`${base}/sub/next.ipynb`, notebook([markdown('# Next')]));
    web.file(`${base}/img/logo.png`, Buffer.from(PNG, 'base64'));
    web.file(`${base}/data.csv`, 'a,b\n1,2\n');
  });

  test("resolve against the notebook's URL", async ({ page }) => {
    await page.goto('/urls/nb.example/notebooks/index.ipynb');
    const link = (name: string) => page.getByRole('link', { name });
    // other notebooks stay in the viewer, in the same tab
    await expect(link('next notebook')).toHaveAttribute(
      'href',
      '/urls/nb.example/notebooks/sub/next.ipynb'
    );
    await expect(link('next notebook')).toHaveAttribute('target', '_self');
    // other files open from their host
    await expect(link('data')).toHaveAttribute('href', `${base}/data.csv`);
    await expect(link('results')).toHaveAttribute('href', '#Results');
    await expect(link('elsewhere')).toHaveAttribute(
      'href',
      'https://example.org/page'
    );
    const logo = page.getByRole('img', { name: 'logo' });
    await expect(logo).toHaveAttribute(
      'src',
      startingWith(`${base}/img/logo.png?`)
    );
    await expect
      .poll(() => logo.evaluate(img => (img as HTMLImageElement).naturalWidth))
      .toBe(8);
  });

  test('to notebooks open them in the viewer', async ({ page }) => {
    await page.goto('/urls/nb.example/notebooks/index.ipynb');
    await page.getByRole('link', { name: 'next notebook' }).click();
    await expect(page).toHaveURL('/urls/nb.example/notebooks/sub/next.ipynb');
    await expect(page.getByRole('heading', { name: 'Next' })).toBeVisible();
  });

  test('to other files, followed from a url/ page, open the file', async ({
    page,
    baseURL
  }) => {
    // as nbviewer does for relative links that it rewrote into url/ paths
    await page.goto('/urls/nb.example/notebooks/data.csv', {
      referer: `${baseURL}/urls/nb.example/notebooks/index.ipynb`
    });
    await expect(page).toHaveURL(`${base}/data.csv`);
    await expect(page.getByText('a,b')).toBeVisible();
  });
});
