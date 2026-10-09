/**
 * How the static host and the app answer URLs: status codes, nbviewer's
 * redirects, and the landing page form.
 */

import type { Page } from '@playwright/test';

import { expect, type GitHub, markdown, notebook, test } from './fixtures.ts';

const GIST = '0123456789abcdef0123';

/** A small repository, a user and a gist that the redirects lead to. */
function setUpGitHub(github: GitHub) {
  github.repo('ipython', 'ipython', 'main');
  github.files('ipython', 'ipython', 'main', {
    'docs/a.ipynb': notebook([markdown('# Notebook A')])
  });
  github.userRepos('ipython', [['ipython'], ['ipykernel']]);
  github.gist({
    id: GIST,
    owner: 'fperez',
    files: { 'analysis.ipynb': notebook([markdown('# Analysis')]) }
  });
}

test.describe('status codes', () => {
  test('the landing page', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle('nbviewer lite');
    await expect(
      page.getByRole('textbox', { name: /Notebook URL/ })
    ).toBeVisible();
  });

  test('unknown paths are 404s, with a page that says so', async ({ page }) => {
    const response = await page.goto('/nonsense/path');
    expect(response?.status()).toBe(404);
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('404: Not Found');
    await expect(
      alert.getByRole('link', { name: 'start page' })
    ).toHaveAttribute('href', '/');
  });

  test('missing static files are 404s, without the app', async ({ page }) => {
    const response = await page.goto('/static/js/missing.js');
    expect(response?.status()).toBe(404);
    await expect(page.getByText('Not found.')).toBeVisible();
    await expect(page.getByRole('banner')).toHaveCount(0);
  });

  test('viewer URLs get the app, even when the notebook is missing', async ({
    page,
    web
  }) => {
    web.file('https://nb.example/missing.ipynb', 'Not Found', { status: 404 });
    const response = await page.goto('/urls/nb.example/missing.ipynb');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('alert')).toContainText(
      'fetching https://nb.example/missing.ipynb'
    );
  });
});

test.describe("nbviewer's redirects", () => {
  test.beforeEach(({ github }) => setUpGitHub(github));

  const redirects: [string, string, string][] = [
    // [from, to, a link or heading on the page it leads to]
    ['/github/ipython', '/github/ipython/', 'ipython'],
    ['/github/ipython/ipython', '/github/ipython/ipython/tree/main/', 'docs'],
    [
      '/github/ipython/ipython/tree/main',
      '/github/ipython/ipython/tree/main/',
      'docs'
    ],
    [
      '/github/ipython/ipython/tree/main/docs',
      '/github/ipython/ipython/tree/main/docs/',
      'a.ipynb'
    ],
    [
      '/github/ipython/ipython/blob/main/docs/a.ipynb/',
      '/github/ipython/ipython/blob/main/docs/a.ipynb',
      'Notebook A'
    ],
    [
      '/url/github.com/ipython/ipython/blob/main/docs/a.ipynb',
      '/github/ipython/ipython/blob/main/docs/a.ipynb',
      'Notebook A'
    ],
    [
      '/urls/raw.githubusercontent.com/ipython/ipython/main/docs/a.ipynb',
      '/github/ipython/ipython/blob/main/docs/a.ipynb',
      'Notebook A'
    ],
    [
      '/url/raw.github.com/ipython/ipython/main/docs/a.ipynb',
      '/github/ipython/ipython/blob/main/docs/a.ipynb',
      'Notebook A'
    ],
    [`/gist/${GIST}`, `/gist/fperez/${GIST}`, 'Analysis']
  ];
  for (const [from, to, content] of redirects) {
    test(`${from} -> ${to}`, async ({ page }) => {
      await page.goto(from);
      await expect(page).toHaveURL(to);
      await expect(
        page
          .getByRole('link', { name: content, exact: true })
          .or(page.getByRole('heading', { name: content }))
      ).toBeVisible();
    });
  }

  test('keep the query string and fragment', async ({ page }) => {
    await page.goto('/github/ipython?page=2');
    await expect(page).toHaveURL('/github/ipython/?page=2');
    // the second page of repositories
    await expect(page.getByRole('link', { name: 'ipykernel' })).toBeVisible();

    await page.goto(
      '/url/github.com/ipython/ipython/blob/main/docs/a.ipynb#Notebook-A'
    );
    await expect(page).toHaveURL(
      '/github/ipython/ipython/blob/main/docs/a.ipynb#Notebook-A'
    );
  });

  test('replace the page in the history, like HTTP redirects', async ({
    page
  }) => {
    await page.goto('/');
    await page.goto('/github/ipython/ipython/tree/main');
    await expect(page.getByRole('link', { name: 'docs' })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL('/');
  });

  test("nbviewer's bare gist ids are 404s that go to the gist", async ({
    page
  }) => {
    const response = await page.goto(`/${GIST}/analysis.ipynb`);
    expect(response?.status()).toBe(404);
    await expect(page).toHaveURL(`/gist/fperez/${GIST}/analysis.ipynb`);
    await expect(page.getByRole('heading', { name: 'Analysis' })).toBeVisible();
  });
});

test.describe('landing page form', () => {
  test.beforeEach(({ github }) => setUpGitHub(github));

  /** Submit `input` from the landing page. */
  async function go(page: Page, input: string) {
    await page.goto('/');
    await page.getByRole('textbox', { name: /Notebook URL/ }).fill(input);
    await page.getByRole('button', { name: 'Go!' }).click();
  }

  test('a GitHub user and repository', async ({ page }) => {
    await go(page, 'ipython/ipython');
    await expect(page).toHaveURL('/github/ipython/ipython/tree/main/');
    await expect(page.getByRole('link', { name: 'docs' })).toBeVisible();
  });

  test('a GitHub user', async ({ page }) => {
    await go(page, 'ipython');
    await expect(page).toHaveURL('/github/ipython/');
  });

  test('a file on github.com', async ({ page }) => {
    await go(page, 'https://github.com/ipython/ipython/blob/main/docs/a.ipynb');
    await expect(page).toHaveURL(
      '/github/ipython/ipython/blob/main/docs/a.ipynb'
    );
    await expect(
      page.getByRole('heading', { name: 'Notebook A' })
    ).toBeVisible();
  });

  test('a gist URL', async ({ page }) => {
    await go(page, `https://gist.github.com/fperez/${GIST}`);
    await expect(page).toHaveURL(`/gist/fperez/${GIST}`);
    await expect(page.getByRole('heading', { name: 'Analysis' })).toBeVisible();
  });

  test('a URL with a query string, submitted with Enter', async ({
    page,
    web
  }) => {
    web.file(
      'https://nb.example/notebook?id=7&raw=1',
      notebook([markdown('# From an endpoint')])
    );
    await page.goto('/');
    const input = page.getByRole('textbox', { name: /Notebook URL/ });
    await input.fill('https://nb.example/notebook?id=7&raw=1');
    await input.press('Enter');
    await expect(page).toHaveURL(
      '/urls/nb.example/notebook/%3Fid%3D7%26raw%3D1'
    );
    await expect(
      page.getByRole('heading', { name: 'From an endpoint' })
    ).toBeVisible();
  });

  test('nothing entered', async ({ page }) => {
    await go(page, '  ');
    await expect(page.getByRole('status')).toHaveText(
      'Enter a URL, a GitHub user or repository, or a Gist ID.'
    );
    await expect(page).toHaveURL('/');
  });
});
