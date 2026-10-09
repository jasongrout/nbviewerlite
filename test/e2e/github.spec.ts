/**
 * GitHub views: directory listings, notebooks, users and repositories, and
 * what each costs in API requests.
 */

import {
  code,
  executeResult,
  expect,
  type GitHub,
  headerLinks,
  links,
  markdown,
  notebook,
  PNG,
  startingWith,
  SUBMODULE,
  test
} from './fixtures.ts';

const KERNEL = 'examples/IPython Kernel';
const RAW = 'https://raw.githubusercontent.com/ipython/ipython/6.x';

function setUpRepo(github: GitHub) {
  github.repo('ipython', 'ipython', 'main');
  github.refs('ipython', 'ipython', ['main', '6.x', 'feature/x'], ['6.0.0']);
  github.files('ipython', 'ipython', 'main', { 'README.md': '# IPython' });
  github.files('ipython', 'ipython', '6.x', {
    'setup.py': 'from setuptools import setup\n',
    'examples/Index.ipynb': notebook([markdown('# Examples')]),
    [`${KERNEL}/Index.ipynb`]: notebook([
      markdown([
        '# IPython Kernel\n',
        '\n',
        '[Rich output](Rich%20Output.ipynb), ',
        '[all examples](../Index.ipynb), ',
        '[demo script](example-demo.py), ',
        '[data folder](data/), ',
        '[IPython](https://ipython.org).\n',
        '\n',
        '![chart](images/chart.png)'
      ]),
      code('1 + 1', [executeResult({ 'text/plain': '2' })])
    ]),
    [`${KERNEL}/Rich Output.ipynb`]: notebook([markdown('# Rich Output')]),
    [`${KERNEL}/README.md`]: '# Kernel examples',
    [`${KERNEL}/example-demo.py`]: 'print("demo")\n',
    [`${KERNEL}/images/chart.png`]: Buffer.from(PNG, 'base64'),
    [`${KERNEL}/data/values.csv`]: 'a,b\n1,2\n',
    [`${KERNEL}/submod`]: SUBMODULE
  });
}

test.beforeEach(({ github }) => setUpRepo(github));

test.describe('directory listings', () => {
  const url = '/github/ipython/ipython/tree/6.x/examples/IPython%20Kernel/';

  test('list directories, then notebooks, then other files', async ({
    page,
    github
  }) => {
    await page.goto(url);
    await expect(page).toHaveTitle(
      'ipython/examples/IPython Kernel - nbviewer lite'
    );
    const listing = page.getByRole('table');
    await expect(listing.getByRole('cell')).toHaveText([
      '..',
      'data',
      'images',
      'Index.ipynb',
      'Rich Output.ipynb',
      'README.md',
      'example-demo.py',
      'submod'
    ]);
    const tree = '/github/ipython/ipython/tree/6.x/examples';
    const blob = '/github/ipython/ipython/blob/6.x/examples';
    const onGitHub = 'https://github.com/ipython/ipython/blob/6.x/examples';
    // a submodule outside GitHub has nowhere to link to
    expect(await links(listing)).toEqual([
      ['..', `${tree}/`],
      ['data', `${tree}/IPython%20Kernel/data/`],
      ['images', `${tree}/IPython%20Kernel/images/`],
      ['Index.ipynb', `${blob}/IPython%20Kernel/Index.ipynb`],
      ['Rich Output.ipynb', `${blob}/IPython%20Kernel/Rich%20Output.ipynb`],
      ['README.md', `${onGitHub}/IPython%20Kernel/README.md`],
      ['example-demo.py', `${onGitHub}/IPython%20Kernel/example-demo.py`]
    ]);
    expect(
      await links(page.getByRole('navigation', { name: 'Breadcrumb' }))
    ).toEqual([
      ['ipython', '/github/ipython/ipython/tree/6.x/'],
      ['examples', `${tree}/`],
      ['IPython Kernel', `${tree}/IPython%20Kernel/`]
    ]);
    expect(await links(headerLinks(page))).toEqual([
      [
        'View on GitHub',
        'https://github.com/ipython/ipython/tree/6.x/examples/IPython%20Kernel'
      ],
      ['Execute on Binder', 'https://mybinder.org/v2/gh/ipython/ipython/6.x'],
      ['View on nbviewer.org', `https://nbviewer.org${url}`]
    ]);
    expect(github.requests).toEqual([
      `/repos/ipython/ipython/contents/${KERNEL}?ref=6.x`
    ]);
  });

  test('load branches and tags when the menu first opens', async ({
    page,
    github
  }) => {
    await page.goto(url);
    const toggle = page.getByRole('button', { name: '6.x' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(github.requests).toHaveLength(1);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const feature = page.getByRole('link', { name: 'feature/x' });
    await expect(feature).toHaveAttribute(
      'href',
      '/github/ipython/ipython/tree/feature%2Fx/examples/IPython%20Kernel/'
    );
    await expect(page.getByRole('link', { name: '6.0.0' })).toHaveAttribute(
      'href',
      '/github/ipython/ipython/tree/6.0.0/examples/IPython%20Kernel/'
    );
    expect(github.requests.slice(1).sort()).toEqual([
      '/repos/ipython/ipython/branches?per_page=100',
      '/repos/ipython/ipython/tags?per_page=100'
    ]);

    // closes on a click elsewhere and on Escape; opens again without requests
    await page.getByRole('table').click();
    await expect(feature).toBeHidden();
    await toggle.click();
    await expect(feature).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(feature).toBeHidden();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(github.requests).toHaveLength(3);

    await toggle.click();
    await feature.click();
    await expect(page).toHaveURL(
      '/github/ipython/ipython/tree/feature%2Fx/examples/IPython%20Kernel/'
    );
  });

  test("the repository's root links to the user's repositories", async ({
    page
  }) => {
    await page.goto('/github/ipython/ipython/tree/6.x/');
    await expect(page.getByRole('cell').first()).toHaveText(
      "ipython's repositories"
    );
    expect(await links(page.getByRole('table'))).toContainEqual([
      "ipython's repositories",
      '/github/ipython/'
    ]);
    expect(
      await links(page.getByRole('navigation', { name: 'Breadcrumb' }))
    ).toEqual([['ipython', '/github/ipython/ipython/tree/6.x/']]);
  });

  test('a renamed repository links to its new name', async ({
    page,
    github
  }) => {
    github.rename('oldowner/oldname', 'newowner/newname');
    github.files('newowner', 'newname', 'main', {
      'nb.ipynb': notebook([]),
      'docs/intro.md': '# Intro'
    });
    await page.goto('/github/oldowner/oldname/tree/main/');
    await expect(page.getByRole('link', { name: 'nb.ipynb' })).toHaveAttribute(
      'href',
      '/github/newowner/newname/blob/main/nb.ipynb'
    );
    await expect(page.getByRole('link', { name: 'docs' })).toHaveAttribute(
      'href',
      '/github/newowner/newname/tree/main/docs/'
    );
    await expect(
      headerLinks(page).getByRole('link', { name: 'View on GitHub' })
    ).toHaveAttribute('href', 'https://github.com/newowner/newname/tree/main');
  });

  test('a missing directory', async ({ page }) => {
    await page.goto('/github/ipython/ipython/tree/6.x/nope/');
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('404: Not Found');
    expect(await links(alert)).toEqual([
      [
        'directory on GitHub',
        'https://github.com/ipython/ipython/tree/6.x/nope'
      ],
      [
        'view it on nbviewer.org',
        'https://nbviewer.org/github/ipython/ipython/tree/6.x/nope/'
      ]
    ]);
  });

  test('the tree URL of a file opens the file', async ({ page, web }) => {
    await page.goto('/github/ipython/ipython/tree/6.x/setup.py/');
    await expect(page).toHaveURL(`${RAW}/setup.py`);
    await expect(page.getByText('from setuptools import setup')).toBeVisible();
    expect(web.requests).toContain(`HEAD ${RAW}/setup.py`);
  });
});

test.describe('notebooks', () => {
  const url =
    '/github/ipython/ipython/blob/6.x/examples/IPython%20Kernel/Index.ipynb';

  test('render from raw.githubusercontent.com, without API requests', async ({
    page,
    github
  }) => {
    await page.goto(url);
    await expect(
      page.getByRole('heading', { name: 'IPython Kernel' })
    ).toBeVisible();
    await expect(page).toHaveTitle('Index.ipynb - nbviewer lite');
    await expect(page.getByText('2', { exact: true })).toBeVisible();
    await expect(headerLinks(page)).toContainText('Python 3 Kernel');
    // among others (other formats of the notebook, say)
    expect(await links(headerLinks(page))).toEqual(
      expect.arrayContaining([
        [
          'View on GitHub',
          'https://github.com/ipython/ipython/blob/6.x/examples/IPython%20Kernel/Index.ipynb'
        ],
        [
          'Execute on Binder',
          'https://mybinder.org/v2/gh/ipython/ipython/6.x?filepath=examples/IPython%20Kernel/Index.ipynb'
        ],
        ['View on nbviewer.org', `https://nbviewer.org${url}`],
        ['Download Notebook', `${RAW}/examples/IPython%20Kernel/Index.ipynb`]
      ])
    );
    expect(
      await links(page.getByRole('navigation', { name: 'Breadcrumb' }))
    ).toEqual([
      ['ipython', '/github/ipython/ipython/tree/6.x/'],
      ['examples', '/github/ipython/ipython/tree/6.x/examples/'],
      [
        'IPython Kernel',
        '/github/ipython/ipython/tree/6.x/examples/IPython%20Kernel/'
      ]
    ]);
    expect(github.requests).toEqual([]);
  });

  test('relative links stay in the repository, images load from it', async ({
    page
  }) => {
    await page.goto(url);
    const blob = '/github/ipython/ipython/blob/6.x/examples';
    const link = (name: string) => page.getByRole('link', { name });
    await expect(link('Rich output')).toHaveAttribute(
      'href',
      `${blob}/IPython%20Kernel/Rich%20Output.ipynb`
    );
    await expect(link('all examples')).toHaveAttribute(
      'href',
      `${blob}/Index.ipynb`
    );
    await expect(link('demo script')).toHaveAttribute(
      'href',
      `${blob}/IPython%20Kernel/example-demo.py`
    );
    // (directories: see the next test)
    await expect(
      page.getByRole('link', { name: 'IPython', exact: true })
    ).toHaveAttribute('href', 'https://ipython.org');
    const chart = page.getByRole('img', { name: 'chart' });
    // JupyterLab adds a cache-busting query
    await expect(chart).toHaveAttribute(
      'src',
      startingWith(`${RAW}/examples/IPython%20Kernel/images/chart.png?`)
    );
    await expect
      .poll(() => chart.evaluate(img => (img as HTMLImageElement).naturalWidth))
      .toBe(8);

    await link('Rich output').click();
    await expect(page).toHaveURL(
      `${blob}/IPython%20Kernel/Rich%20Output.ipynb`
    );
    await expect(
      page.getByRole('heading', { name: 'Rich Output' })
    ).toBeVisible();
  });

  test('a relative link to a directory leads to its listing', async ({
    page
  }) => {
    await page.goto(url);
    await page.getByRole('link', { name: 'data folder' }).click();
    await expect(page).toHaveURL(
      '/github/ipython/ipython/tree/6.x/examples/IPython%20Kernel/data/'
    );
    await expect(page.getByRole('link', { name: 'values.csv' })).toBeVisible();
  });

  test('refs/heads/ in raw-style URLs names the branch', async ({ page }) => {
    await page.goto(
      '/github/ipython/ipython/blob/refs/heads/6.x/examples/Index.ipynb'
    );
    await expect(page.getByRole('heading', { name: 'Examples' })).toBeVisible();
    await expect(
      headerLinks(page).getByRole('link', { name: 'Download Notebook' })
    ).toHaveAttribute('href', `${RAW}/examples/Index.ipynb`);
  });

  test('a missing notebook', async ({ page, github }) => {
    await page.goto('/github/ipython/ipython/blob/6.x/missing.ipynb');
    const alert = page.getByRole('alert');
    await expect(alert).toContainText(
      `404 Not Found fetching ${RAW}/missing.ipynb`
    );
    expect(await links(alert)).toEqual([
      [
        'notebook on GitHub',
        'https://github.com/ipython/ipython/blob/6.x/missing.ipynb'
      ],
      [
        'view it on nbviewer.org',
        'https://nbviewer.org/github/ipython/ipython/blob/6.x/missing.ipynb'
      ]
    ]);
    // one request, to see whether it's a directory
    expect(github.requests).toEqual([
      '/repos/ipython/ipython/contents/missing.ipynb?ref=6.x'
    ]);
  });
});

test.describe('other paths under blob/', () => {
  test('a directory redirects to its listing', async ({ page }) => {
    await page.goto('/github/ipython/ipython/blob/6.x/examples');
    await expect(page).toHaveURL('/github/ipython/ipython/tree/6.x/examples/');
    await expect(
      page.getByRole('link', { name: 'IPython Kernel' })
    ).toBeVisible();
  });

  test('other files open from raw.githubusercontent.com', async ({
    page,
    github
  }) => {
    await page.goto(
      '/github/ipython/ipython/blob/6.x/examples/IPython%20Kernel/example-demo.py'
    );
    await expect(page).toHaveURL(
      `${RAW}/examples/IPython%20Kernel/example-demo.py`
    );
    await expect(page.getByText('print("demo")')).toBeVisible();
    expect(github.requests).toEqual([]);
  });

  test('a missing file', async ({ page }) => {
    await page.goto('/github/ipython/ipython/blob/6.x/nope.txt');
    const alert = page.getByRole('alert');
    await expect(alert).toContainText(
      'nope.txt not found in ipython/ipython at 6.x.'
    );
    await expect(
      alert.getByRole('link', { name: 'file on GitHub' })
    ).toHaveAttribute(
      'href',
      'https://github.com/ipython/ipython/blob/6.x/nope.txt'
    );
  });
});

test.describe('users and repositories', () => {
  test("a user's repositories, page by page", async ({ page, github }) => {
    github.userRepos('jupyter', [
      ['notebook', 'nbconvert'],
      ['nbformat'],
      ['jupyter_core']
    ]);
    await page.goto('/github/jupyter/');
    await expect(page).toHaveTitle("jupyter's repositories - nbviewer lite");
    const listing = page.getByRole('table');
    await expect(listing.getByRole('link').first()).toBeVisible();
    expect(await links(listing)).toEqual([
      ['notebook', '/github/jupyter/notebook/'],
      ['nbconvert', '/github/jupyter/nbconvert/'],
      ['next ›', '?page=2']
    ]);
    expect(await links(headerLinks(page))).toEqual([
      ['View on GitHub', 'https://github.com/jupyter'],
      ['View on nbviewer.org', 'https://nbviewer.org/github/jupyter/']
    ]);

    await listing.getByRole('link', { name: 'next ›' }).click();
    await expect(page).toHaveURL('/github/jupyter/?page=2');
    await expect(listing.getByRole('link', { name: 'nbformat' })).toBeVisible();
    expect(await links(listing)).toEqual([
      ['nbformat', '/github/jupyter/nbformat/'],
      ['‹ prev', '?page=1'],
      ['next ›', '?page=3']
    ]);
    expect(github.requests).toEqual([
      '/users/jupyter/repos?sort=updated',
      '/users/jupyter/repos?sort=updated&page=2'
    ]);
  });

  test('a repository opens at its default branch', async ({ page, github }) => {
    await page.goto('/github/ipython/ipython/');
    await expect(page).toHaveURL('/github/ipython/ipython/tree/main/');
    await expect(page.getByRole('link', { name: 'README.md' })).toBeVisible();
    expect(github.requests).toEqual([
      '/repos/ipython/ipython',
      '/repos/ipython/ipython/contents/?ref=main'
    ]);
  });

  test('a missing repository', async ({ page }) => {
    await page.goto('/github/ipython/nope/');
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('404: Not Found');
    await expect(
      alert.getByRole('link', { name: 'repository on GitHub' })
    ).toHaveAttribute('href', 'https://github.com/ipython/nope');
  });
});

test.describe('rate limit', () => {
  test('says when the limit resets', async ({ page, github }) => {
    github.userRepos('jupyter', [['notebook']]);
    github.remaining = 0;
    await page.goto('/github/jupyter/');
    const alert = page.getByRole('alert');
    await expect(alert).toContainText(
      'GitHub API rate limit exceeded for your network.'
    );
    // RATE_LIMIT_RESET, in the tests' time zone (UTC)
    await expect(alert).toContainText('It resets at 5:46:40 PM.');
    expect(await links(alert)).toEqual([
      ['user on GitHub', 'https://github.com/jupyter'],
      ['view it on nbviewer.org', 'https://nbviewer.org/github/jupyter/']
    ]);
  });

  test('in the branch menu', async ({ page, github }) => {
    github.remaining = 1;
    await page.goto('/github/ipython/ipython/tree/6.x/');
    await page.getByRole('button', { name: '6.x' }).click();
    await expect(
      page.getByText('GitHub API rate limit exceeded for your network.')
    ).toBeVisible();
  });

  test("doesn't affect notebooks", async ({ page, github }) => {
    github.remaining = 0;
    await page.goto('/github/ipython/ipython/blob/6.x/examples/Index.ipynb');
    await expect(page.getByRole('heading', { name: 'Examples' })).toBeVisible();
    expect(github.requests).toEqual([]);
  });
});
