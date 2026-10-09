/**
 * Gist views: one notebook, a gist's files, a user's gists.
 */

import {
  expect,
  gistData,
  type GitHub,
  headerLinks,
  jupyterliteLinks,
  links,
  markdown,
  notebook,
  openInMenu,
  test
} from './fixtures.ts';

const GIST = '0123456789abcdef0123';
const SINGLE = 'aaaaaaaaaaaaaaaaaaaa';

function setUpGists(github: GitHub) {
  const several = github.gist({
    id: GIST,
    owner: 'fperez',
    description: 'Two notebooks and a script',
    files: {
      'analysis.ipynb': notebook([
        markdown(
          '# Analysis\n\n' +
            'See [the other notebook](other.ipynb) and [the script](helper.py).'
        )
      ]),
      'other.ipynb': notebook([markdown('# Other notebook')]),
      'helper.py': 'x = 1\n'
    },
    // large files come without their content
    truncated: ['other.ipynb']
  });
  const single = github.gist({
    id: SINGLE,
    owner: 'fperez',
    files: { 'single.ipynb': notebook([markdown('# Single')]) }
  });
  return { several, single };
}

/** The raw URL of a file in `gist`. */
function rawUrl(gist: Record<string, unknown>, filename: string): string {
  const files = gist.files as Record<string, { raw_url: string }>;
  return files[filename].raw_url;
}

test('a gist with several files lists them', async ({ page, github }) => {
  setUpGists(github);
  await page.goto(`/gist/fperez/${GIST}`);
  await expect(page).toHaveTitle(`gist ${GIST} - nbviewer lite`);
  const listing = page.getByRole('table');
  await expect(listing.getByRole('cell')).toHaveText([
    "fperez's gists",
    'analysis.ipynb',
    'other.ipynb',
    'helper.py'
  ]);
  // notebooks open here, other files on the gist's page
  expect(await links(listing)).toEqual([
    ["fperez's gists", '/gist/fperez/'],
    ['analysis.ipynb', `/gist/fperez/${GIST}/analysis.ipynb`],
    ['other.ipynb', `/gist/fperez/${GIST}/other.ipynb`],
    ['helper.py', `https://gist.github.com/fperez/${GIST}#file-helper-py`]
  ]);
  await openInMenu(page);
  expect(await links(headerLinks(page))).toEqual([
    ['Binder', `https://mybinder.org/v2/gist/fperez/${GIST}/master`],
    ['Gist', `https://gist.github.com/${GIST}`],
    ['nbviewer.org', `https://nbviewer.org/gist/fperez/${GIST}`]
  ]);
  expect(github.requests).toEqual([`/gists/${GIST}`]);
});

test('a notebook in a gist', async ({ page, github, web }) => {
  const { several } = setUpGists(github);
  await page.goto(`/gist/fperez/${GIST}/analysis.ipynb`);
  await expect(page.getByRole('heading', { name: 'Analysis' })).toBeVisible();
  await expect(page).toHaveTitle('analysis.ipynb - nbviewer lite');
  expect(
    await links(page.getByRole('navigation', { name: 'Breadcrumb' }))
  ).toEqual([['analysis.ipynb', `/gist/fperez/${GIST}/analysis.ipynb`]]);
  await expect(headerLinks(page)).toContainText('Python 3 Kernel');
  // among others (other formats of the notebook, say)
  await openInMenu(page);
  expect(await links(headerLinks(page))).toEqual(
    expect.arrayContaining([
      ...jupyterliteLinks(rawUrl(several, 'analysis.ipynb')),
      [
        'Binder',
        `https://mybinder.org/v2/gist/fperez/${GIST}/master?filepath=analysis.ipynb`
      ],
      ['Gist', `https://gist.github.com/${GIST}`],
      [
        'nbviewer.org',
        `https://nbviewer.org/gist/fperez/${GIST}/analysis.ipynb`
      ],
      ['Download Notebook', rawUrl(several, 'analysis.ipynb')]
    ])
  );
  // other notebooks in the gist open here; other files from the gist
  await expect(
    page.getByRole('link', { name: 'the other notebook' })
  ).toHaveAttribute('href', `/gist/fperez/${GIST}/other.ipynb`);
  await expect(page.getByRole('link', { name: 'the script' })).toHaveAttribute(
    'href',
    rawUrl(several, 'helper.py')
  );
  // the API's inline content, without fetching the file
  expect(github.requests).toEqual([`/gists/${GIST}`]);
  expect(web.requests).not.toContain(
    `GET ${rawUrl(several, 'analysis.ipynb')}`
  );

  await page.getByRole('link', { name: 'the other notebook' }).click();
  await expect(page).toHaveURL(`/gist/fperez/${GIST}/other.ipynb`);
  await expect(
    page.getByRole('heading', { name: 'Other notebook' })
  ).toBeVisible();
});

test('truncated files load from their raw URL', async ({
  page,
  github,
  web
}) => {
  const { several } = setUpGists(github);
  await page.goto(`/gist/fperez/${GIST}/other.ipynb`);
  await expect(
    page.getByRole('heading', { name: 'Other notebook' })
  ).toBeVisible();
  expect(web.requests).toContain(`GET ${rawUrl(several, 'other.ipynb')}`);
});

test('a gist with one file shows it', async ({ page, github }) => {
  setUpGists(github);
  await page.goto(`/gist/fperez/${SINGLE}`);
  await expect(page.getByRole('heading', { name: 'Single' })).toBeVisible();
  await expect(page).toHaveTitle('single.ipynb - nbviewer lite');
});

test('URLs without a user go to the owner', async ({ page, github }) => {
  setUpGists(github);
  github.gist({
    id: 'bbbbbbbbbbbbbbbbbbbb',
    owner: null,
    files: { 'anon.ipynb': notebook([markdown('# Anonymous')]) }
  });
  await page.goto(`/gist/${SINGLE}`);
  await expect(page).toHaveURL(`/gist/fperez/${SINGLE}`);
  await expect(page.getByRole('heading', { name: 'Single' })).toBeVisible();

  await page.goto('/gist/bbbbbbbbbbbbbbbbbbbb');
  await expect(page).toHaveURL('/gist/anonymous/bbbbbbbbbbbbbbbbbbbb');
  await expect(page.getByRole('heading', { name: 'Anonymous' })).toBeVisible();
});

test('other files open from their raw URL', async ({ page, github }) => {
  const { several } = setUpGists(github);
  await page.goto(`/gist/fperez/${GIST}/helper.py`);
  await expect(page).toHaveURL(rawUrl(several, 'helper.py'));
  await expect(page.getByText('x = 1')).toBeVisible();
});

test('a missing file', async ({ page, github }) => {
  setUpGists(github);
  await page.goto(`/gist/fperez/${GIST}/nope.ipynb`);
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('No such file in gist: nope.ipynb');
  await expect(
    alert.getByRole('link', { name: 'gist on GitHub' })
  ).toHaveAttribute('href', `https://gist.github.com/${GIST}`);
});

test('a missing gist', async ({ page }) => {
  await page.goto('/gist/fperez/cccccccccccccccccccc');
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('404: Not Found');
  expect(await links(alert)).toEqual([
    ['gist on GitHub', 'https://gist.github.com/cccccccccccccccccccc'],
    [
      'view it on nbviewer.org',
      'https://nbviewer.org/gist/fperez/cccccccccccccccccccc'
    ]
  ]);
});

test("a user's gists that have notebooks, page by page", async ({
  page,
  github
}) => {
  const { several, single } = setUpGists(github);
  const scripts = gistData({
    id: 'dddddddddddddddddddd',
    owner: 'fperez',
    description: 'No notebooks here',
    files: { 'a.py': 'pass\n' }
  });
  const older = gistData({
    id: 'eeeeeeeeeeeeeeeeeeee',
    owner: 'fperez',
    description: 'An older one',
    files: { 'old.ipynb': notebook([]) }
  });
  github.userGists('fperez', [[several, scripts, single], [older]]);

  await page.goto('/gist/fperez/');
  await expect(page).toHaveTitle("fperez's gists - nbviewer lite");
  const listing = page.getByRole('table');
  await expect(listing.getByRole('columnheader')).toHaveText([
    'Name',
    'Notebooks',
    'Description'
  ]);
  await expect(listing.getByRole('row')).toHaveCount(4);
  await expect(listing.getByRole('row').nth(1)).toContainText(
    'Two notebooks and a script'
  );
  expect(await links(listing)).toEqual([
    [GIST, `/gist/fperez/${GIST}`],
    ['analysis.ipynb', `/gist/fperez/${GIST}/analysis.ipynb`],
    ['other.ipynb', `/gist/fperez/${GIST}/other.ipynb`],
    [SINGLE, `/gist/fperez/${SINGLE}`],
    ['single.ipynb', `/gist/fperez/${SINGLE}/single.ipynb`],
    ['next ›', '?page=2']
  ]);
  await openInMenu(page);
  expect(await links(headerLinks(page))).toEqual([
    ['Gist', 'https://gist.github.com/fperez'],
    ['nbviewer.org', 'https://nbviewer.org/gist/fperez/']
  ]);

  await listing.getByRole('link', { name: 'next ›' }).click();
  await expect(page).toHaveURL('/gist/fperez/?page=2');
  await expect(listing.getByRole('link', { name: 'old.ipynb' })).toBeVisible();
  expect(github.requests).toEqual([
    '/users/fperez/gists',
    '/users/fperez/gists?page=2'
  ]);
});
