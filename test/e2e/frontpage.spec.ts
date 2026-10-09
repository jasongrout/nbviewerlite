/**
 * The landing page's examples, as on nbviewer.org's front page, and the
 * FAQ at /faq.
 */

import type { Page } from '@playwright/test';

import {
  expect,
  links,
  markdown,
  notebook,
  sidewaysScroll,
  test,
  topOf
} from './fixtures.ts';

/** A section of examples on the landing page, by its heading. */
function examples(page: Page, header: string) {
  return page
    .locator('section')
    .filter({ has: page.getByRole('heading', { level: 2, name: header }) });
}

test.describe('landing page examples', () => {
  test('cards in sections, linking to pages here', async ({ page }) => {
    await page.goto('/');
    const sections = ['Programming Languages', 'Books', 'Misc'];
    await expect(page.getByRole('heading', { level: 2 })).toHaveText(sections);
    const counts = [3, 3, 5];
    for (const [i, header] of sections.entries()) {
      const cards = examples(page, header).getByRole('link');
      await expect(cards).toHaveCount(counts[i]);
      for (const [name, href] of await links(examples(page, header))) {
        // named by their title alone: the thumbnail is decoration
        expect(name).not.toBe('');
        expect(href, name).toMatch(/^\/(github|gist|url|urls)\//);
      }
    }
    expect(await links(examples(page, 'Programming Languages'))).toEqual([
      [
        'IPython',
        '/github/ipython/ipython/blob/6.x/examples/IPython%20Kernel/Index.ipynb'
      ],
      [
        'IRuby',
        '/github/SciRuby/sciruby-notebooks/blob/master/getting_started.ipynb'
      ],
      ['IJulia', '/github/binder-examples/demo-julia/blob/main/demo.ipynb']
    ]);
  });

  test('thumbnails load from this site', async ({ page, baseURL }) => {
    const thumbnails: string[] = [];
    page.on('response', response => {
      if (response.url().includes('/static/img/example-nb/')) {
        thumbnails.push(
          `${response.status()} ${response.headers()['content-type']} ` +
            new URL(response.url()).origin
        );
      }
    });
    await page.goto('/');
    const images = page.locator('section img');
    await expect(images).toHaveCount(11);
    // they load lazily, as they come into view
    for (const image of await images.all()) {
      await image.scrollIntoViewIfNeeded();
      await expect(image).toBeVisible();
      await expect
        .poll(() =>
          image.evaluate(img => (img as HTMLImageElement).naturalWidth)
        )
        .toBeGreaterThan(100);
    }
    expect(thumbnails).toEqual(
      Array(11).fill(`200 image/png ${new URL(baseURL ?? '').origin}`)
    );
  });

  test.describe('cards open in the viewer', () => {
    const nb = (title: string) => notebook([markdown(`# ${title}`)]);

    test('a notebook on GitHub', async ({ page, github }) => {
      github.files('ipython', 'ipython', '6.x', {
        'examples/IPython Kernel/Index.ipynb': nb('IPython Kernel examples')
      });
      await page.goto('/');
      await page.getByRole('link', { name: 'IPython', exact: true }).click();
      await expect(page).toHaveURL(
        '/github/ipython/ipython/blob/6.x/examples/IPython%20Kernel/Index.ipynb'
      );
      await expect(
        page.getByRole('heading', { name: 'IPython Kernel examples' })
      ).toBeVisible();
    });

    test('a repository', async ({ page, github }) => {
      const repo = ['unpingco', 'Python-for-Signal-Processing'] as const;
      github.repo(...repo, 'master');
      github.files(...repo, 'master', {
        'Sampling_Theorem.ipynb': nb('Sampling')
      });
      await page.goto('/');
      await page
        .getByRole('link', { name: 'Python for Signal Processing' })
        .click();
      await expect(page).toHaveURL(
        '/github/unpingco/Python-for-Signal-Processing/tree/master/'
      );
      await expect(
        page.getByRole('link', { name: 'Sampling_Theorem.ipynb' })
      ).toBeVisible();
    });

    test('a directory', async ({ page, github }) => {
      const repo = ['mikhailklassen', 'Mining-the-Social-Web-3rd-Edition'];
      github.files(repo[0], repo[1], 'master', {
        'notebooks/Chapter 1 - Mining Twitter.ipynb': nb('Twitter')
      });
      await page.goto('/');
      const card = page.getByRole('link', { name: 'Mining the Social Web' });
      const href = await card.getAttribute('href');
      await card.click();
      // straight there, without a redirect
      await expect(page).toHaveURL(href ?? '');
      await expect(
        page.getByRole('link', { name: 'Chapter 1 - Mining Twitter.ipynb' })
      ).toBeVisible();
    });

    test('a notebook at a URL', async ({ page, web }) => {
      web.file(
        'http://jakevdp.github.io/downloads/notebooks/XKCD_plots.ipynb',
        nb('XKCD plots in matplotlib')
      );
      await page.goto('/');
      await page
        .getByRole('link', { name: 'XKCD Plot With Matplotlib' })
        .click();
      await expect(page).toHaveURL(
        '/url/jakevdp.github.io/downloads/notebooks/XKCD_plots.ipynb'
      );
      await expect(
        page.getByRole('heading', { name: 'XKCD plots in matplotlib' })
      ).toBeVisible();
    });

    test('a gist', async ({ page, github }) => {
      github.gist({
        id: '4121857',
        owner: 'darribas',
        files: { 'gaza.ipynb': nb('Gaza') }
      });
      await page.goto('/');
      await page
        .getByRole('link', { name: 'Analysis of current events' })
        .click();
      await expect(page).toHaveURL('/gist/darribas/4121857');
      await expect(page.getByRole('heading', { name: 'Gaza' })).toBeVisible();
    });
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test('one column, without sideways scrolling', async ({ page }) => {
      await page.goto('/');
      const cards = page.locator('section').getByRole('link');
      await expect(cards).toHaveCount(11);
      const [first, second] = [
        await cards.nth(0).boundingBox(),
        await cards.nth(1).boundingBox()
      ];
      expect(second?.x).toBe(first?.x);
      expect(second?.y).toBeGreaterThan((first?.y ?? 0) + (first?.height ?? 0));
      expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0);
    });
  });
});

test.describe('FAQ', () => {
  const QUESTIONS = 21;

  for (const path of ['/faq', '/faq/']) {
    test(`at ${path}`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page).toHaveTitle('FAQ - nbviewer lite');
      await expect(
        page.getByRole('heading', {
          level: 1,
          name: 'Frequently Asked Questions'
        })
      ).toBeVisible();
      const questions = page.getByRole('navigation', { name: 'Questions' });
      await expect(questions.getByRole('link')).toHaveCount(QUESTIONS);
      await expect(page.getByRole('heading', { level: 2 })).toHaveCount(
        QUESTIONS
      );
      // every link within the page leads to a heading
      const targets = await page
        .getByRole('main')
        .locator('a[href^="#"]')
        .evaluateAll(anchors =>
          anchors.map(a => {
            const id = decodeURIComponent(a.getAttribute('href')!.slice(1));
            return [id, document.getElementById(id)?.tagName ?? null];
          })
        );
      expect(targets.length).toBeGreaterThan(2 * QUESTIONS);
      for (const [id, tag] of targets) {
        expect(tag, `#${id}`).toMatch(/^H[1-3]$/);
      }
    });
  }

  test('links to questions scroll to them', async ({ page }) => {
    await page.goto('/faq');
    await page
      .getByRole('navigation', { name: 'Questions' })
      .getByRole('link', { name: 'Why do I get a GitHub rate limit error?' })
      .click();
    await expect(page).toHaveURL('/faq#why-do-i-get-a-github-rate-limit-error');
    const rateLimit = page.getByRole('heading', {
      name: 'Why do I get a GitHub rate limit error?'
    });
    await expect.poll(() => topOf(rateLimit)).toBeLessThan(20);
    await expect.poll(() => topOf(rateLimit)).toBeGreaterThanOrEqual(0);

    // a link in an answer
    await page.getByRole('link', { name: 'CORS', exact: true }).last().click();
    await expect(page).toHaveURL(
      '/faq#why-cant-nbviewer-lite-load-a-notebook-from-a-url'
    );
    const cors = page.getByRole('heading', {
      name: "Why can't nbviewer lite load a notebook from a URL?"
    });
    await expect.poll(() => topOf(cors)).toBeLessThan(20);

    await page.goBack();
    await expect(page).toHaveURL('/faq#why-do-i-get-a-github-rate-limit-error');
    await expect.poll(() => topOf(rateLimit)).toBeLessThan(20);

    // each question's ¶ link names it
    await expect(
      page.getByRole('link', {
        name: 'Link to "Do interactive widgets work?"'
      })
    ).toHaveAttribute('href', '#do-interactive-widgets-work');
  });

  test('a link to a question opens the FAQ there', async ({ page }) => {
    await page.goto('/faq#do-interactive-widgets-work');
    const question = page.getByRole('heading', {
      name: 'Do interactive widgets work?'
    });
    await expect(question).toBeInViewport();
    await expect.poll(() => topOf(question)).toBeLessThan(20);
    await expect.poll(() => topOf(question)).toBeGreaterThanOrEqual(0);
  });

  test('linked from the landing page and the footer', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('main').getByRole('link', { name: 'FAQ' })
    ).toHaveAttribute('href', '/faq');
    await page.goto('/nonsense/path');
    await page
      .getByRole('contentinfo')
      .getByRole('link', { name: 'FAQ' })
      .click();
    await expect(page).toHaveURL('/faq');
    await expect(
      page.getByRole('heading', { name: 'Frequently Asked Questions' })
    ).toBeVisible();
  });

  test('only at /faq and /faq/', async ({ page }) => {
    // not a notebook path, so there's no format of it
    await page.goto('/format/slides/faq');
    await expect(page.getByRole('alert')).toContainText('404: Not Found');
    for (const path of ['/faq/x', '/faqs', '/faq.html']) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(404);
      await expect(page.getByRole('alert')).toContainText('404: Not Found');
    }
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test('without sideways scrolling', async ({ page }) => {
      await page.goto('/faq');
      await expect(
        page.getByRole('heading', { name: 'Frequently Asked Questions' })
      ).toBeVisible();
      expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0);
    });
  });
});
