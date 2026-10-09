/**
 * The light and dark themes, and the header button that switches between
 * them and the system's.
 */

import type { Page } from '@playwright/test';

import {
  code,
  displayData,
  expect,
  headerLinks,
  markdown,
  notebook,
  open,
  sidewaysScroll,
  test
} from './fixtures.ts';

const WHITE = 'rgb(255, 255, 255)';
// JupyterLab's dark theme's --jp-layout-color0, and its cell editors'
// background, --jp-layout-color1
const DARK = 'rgb(17, 17, 17)';
const DARK_EDITOR = 'rgb(33, 33, 33)';

function themeButton(page: Page) {
  return page.getByRole('banner').getByRole('button', { name: /^Theme: / });
}

/** The theme the page is in, and its background. */
async function pageTheme(page: Page): Promise<[string | null, string]> {
  return page.evaluate(() => [
    document.documentElement.getAttribute('data-nbv-theme'),
    getComputedStyle(document.body).backgroundColor
  ]);
}

test.describe('following the system', () => {
  test('light', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await expect(themeButton(page)).toHaveAccessibleName(
      'Theme: System (switch to Dark)'
    );
    expect(await pageTheme(page)).toEqual(['light', WHITE]);
    // JupyterLab's attributes, which some outputs read
    await expect(page.locator('body')).toHaveAttribute(
      'data-jp-theme-light',
      'true'
    );
  });

  test('dark', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await expect(themeButton(page)).toHaveAccessibleName(
      'Theme: System (switch to Light)'
    );
    expect(await pageTheme(page)).toEqual(['dark', DARK]);
    await expect(page.locator('body')).toHaveAttribute(
      'data-jp-theme-light',
      'false'
    );
    await expect(page.locator('body')).toHaveAttribute(
      'data-jp-theme-name',
      'JupyterLab Dark'
    );
  });

  test('as the system changes', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await expect(themeButton(page)).toBeVisible();
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(() => pageTheme(page)).toEqual(['dark', DARK]);
    await expect(themeButton(page)).toHaveAccessibleName(
      'Theme: System (switch to Light)'
    );
  });
});

test('the button switches themes, and the choice stays', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const button = themeButton(page);
  // from the system's theme to the other one first, so the page changes
  await button.click();
  await expect(button).toHaveAccessibleName('Theme: Dark (switch to Light)');
  expect(await pageTheme(page)).toEqual(['dark', DARK]);
  await button.click();
  await expect(button).toHaveAccessibleName('Theme: Light (switch to System)');
  expect(await pageTheme(page)).toEqual(['light', WHITE]);
  await button.click();
  await expect(button).toHaveAccessibleName('Theme: System (switch to Dark)');

  // Dark, whatever the system's
  await button.click();
  await page.reload();
  await expect(button).toHaveAccessibleName('Theme: Dark (switch to Light)');
  expect(await pageTheme(page)).toEqual(['dark', DARK]);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.emulateMedia({ colorScheme: 'light' });
  expect(await pageTheme(page)).toEqual(['dark', DARK]);
  await page.goto('/faq');
  expect(await pageTheme(page)).toEqual(['dark', DARK]);
});

test('from the first render, before the app loads', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await themeButton(page).click();
  await page.route('/static/js/*.js', route => route.abort());
  await page.reload();
  await expect(page.getByText('Loading…')).toBeVisible();
  await expect(themeButton(page)).toHaveCount(0);
  expect(await pageTheme(page)).toEqual(['dark', DARK]);
});

test('other tabs switch too', async ({ page, context }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const other = await context.newPage();
  await other.goto('/faq');
  await themeButton(page).click();
  await expect.poll(() => pageTheme(other)).toEqual(['dark', DARK]);
  await expect(themeButton(other)).toHaveAccessibleName(
    'Theme: Dark (switch to Light)'
  );
});

test('notebooks in either theme', async ({ page, web }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await open(
    page,
    web,
    notebook([
      markdown('# Dark'),
      code('Mermaid(...)', [
        displayData({
          'text/vnd.mermaid': 'graph LR\n  accTitle: Flow\n  A --> B\n',
          'text/plain': '<Mermaid object>'
        })
      ])
    ])
  );
  const heading = page.getByRole('heading', { name: 'Dark' });
  const editor = page.locator('.jp-CodeCell .jp-InputArea-editor');
  const background = () =>
    editor.evaluate(element => getComputedStyle(element).backgroundColor);
  await expect(heading).toHaveCSS('color', WHITE);
  expect(await background()).toBe(DARK_EDITOR);
  // Mermaid's dark theme, whose nodes are #1f2020
  const diagram = page.getByRole('img', { name: 'Flow' });
  await expect(diagram).toBeVisible();
  expect(decodeURIComponent((await diagram.getAttribute('src')) ?? '')).toMatch(
    /#1f2020/i
  );

  // the button is last in the header, at its right
  const button = themeButton(page);
  const [bar, header] = [
    await headerLinks(page).boundingBox(),
    await page.getByRole('banner').boundingBox()
  ];
  const box = await button.boundingBox();
  expect(box!.x).toBeGreaterThan(bar!.x + bar!.width);
  expect(header!.x + header!.width - (box!.x + box!.width)).toBeLessThan(20);

  // the rendered notebook switches with the page
  await button.click();
  await expect(heading).not.toHaveCSS('color', WHITE);
  expect(await background()).toBe('rgb(245, 245, 245)');
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('the button stays at the right of the header', async ({
    page,
    web
  }) => {
    await open(page, web, notebook([markdown('# Phone')]));
    await expect(page.getByRole('heading', { name: 'Phone' })).toBeVisible();
    const box = await themeButton(page).boundingBox();
    expect(375 - (box!.x + box!.width)).toBeLessThan(20);
    expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0);
  });
});
