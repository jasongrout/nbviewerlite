/**
 * nbviewer's other formats: format/script/ shows a notebook as the script
 * nbconvert writes, format/slides/ as a reveal.js slideshow, and each
 * format's page links to the others.
 */

import { readFileSync } from 'node:fs';

import type { Locator, Page } from '@playwright/test';

import {
  code,
  displayData,
  expect,
  headerLinks,
  jupyterliteLinks,
  links,
  markdown,
  notebook,
  stream,
  test,
  textColor,
  widgetRef,
  WidgetState,
  widgetView
} from './fixtures.ts';

const BASE = 'https://nb.example';

/** A cell's metadata.slideshow, as JupyterLab's property inspector sets it. */
function slide(
  type: string,
  cell: Record<string, unknown>,
  data?: Record<string, string>
) {
  return {
    ...cell,
    metadata: { slideshow: { slide_type: type, ...(data ? { data } : {}) } }
  };
}

const KERNEL = {
  kernelspec: {
    name: 'python3',
    display_name: 'Python 3 (ipykernel)',
    language: 'python'
  }
};

const PYTHON = {
  ...KERNEL,
  language_info: {
    name: 'python',
    nbconvert_exporter: 'python',
    file_extension: '.py',
    mimetype: 'text/x-python',
    codemirror_mode: { name: 'ipython', version: 3 },
    pygments_lexer: 'ipython3'
  }
};

/** Slides, notes, fragments, a skipped cell and a subslide. */
const deck = notebook(
  [
    slide('slide', markdown('# Deck title')),
    slide('notes', markdown('Speaker notes for the title')),
    slide('fragment', markdown('Fragment one')),
    slide('fragment', markdown('Fragment two')),
    slide('skip', markdown('Skipped cell')),
    slide('subslide', markdown('## Subslide\n\nWith math: $x^2$')),
    slide('slide', markdown('# Second slide'), {
      background_color: '#ffe0b2'
    }),
    code('print("printed")', [stream('printed on slide two\n')])
  ],
  PYTHON
);

/** A Python notebook with IPython syntax, and no slide metadata. */
const analysis = notebook(
  [
    markdown('# Analysis\n\nWith *magics*.'),
    code('%matplotlib inline\nimport numpy as np\n!pip install -q pandas'),
    { ...code('files = !ls *.ipynb\nnp.arange?'), execution_count: 2 },
    { ...code('%%bash\necho "hi"'), execution_count: null }
  ],
  PYTHON
);

/** What nbconvert 7.17's ScriptExporter writes for `analysis`. */
const ANALYSIS_PY = [
  '#!/usr/bin/env python',
  '# coding: utf-8',
  '',
  '# # Analysis',
  // the markdown's empty line, commented, keeps its space
  '# ',
  '# With *magics*.',
  '',
  '# In[1]:',
  '',
  '',
  "get_ipython().run_line_magic('matplotlib', 'inline')",
  'import numpy as np',
  "get_ipython().system('pip install -q pandas')",
  '',
  '',
  '# In[2]:',
  '',
  '',
  "files = get_ipython().getoutput('ls *.ipynb')",
  "get_ipython().run_line_magic('pinfo', 'np.arange')",
  '',
  '',
  '# In[ ]:',
  '',
  '',
  "get_ipython().run_cell_magic('bash', '', 'echo \"hi\"\\n')",
  '',
  ''
].join('\n');

/** An R notebook: nbconvert's generic script template. */
const stats = notebook(
  [
    markdown('# Statistics in R'),
    code('x <- c(1, 2, 3)\nmean(x)'),
    code('plot(x)')
  ],
  {
    kernelspec: { name: 'ir', display_name: 'R', language: 'R' },
    language_info: {
      name: 'R',
      file_extension: '.r',
      mimetype: 'text/x-r-source',
      codemirror_mode: 'r',
      pygments_lexer: 'r'
    }
  }
);

test.beforeEach(({ web }) => {
  web.file(`${BASE}/deck.ipynb`, deck);
  web.file(`${BASE}/analysis.ipynb`, analysis);
  web.file(`${BASE}/stats.ipynb`, stats);
});

test.describe('header links', () => {
  const nbviewer = 'https://nbviewer.org';

  test('the notebook view links to slides and code', async ({ page }) => {
    await page.goto('/urls/nb.example/deck.ipynb');
    await expect(
      page.getByRole('heading', { name: 'Deck title' })
    ).toBeVisible();
    expect(await links(headerLinks(page))).toEqual([
      ['View as Slides', '/format/slides/urls/nb.example/deck.ipynb'],
      ['View as Code', '/format/script/urls/nb.example/deck.ipynb'],
      ...jupyterliteLinks(`${BASE}/deck.ipynb`),
      ['View on nbviewer.org', `${nbviewer}/urls/nb.example/deck.ipynb`],
      ['Download Notebook', `${BASE}/deck.ipynb`]
    ]);
    await expect(headerLinks(page)).toContainText(
      'Python 3 (ipykernel) Kernel'
    );
  });

  test('no "View as Slides" without slide metadata', async ({ page }) => {
    await page.goto('/urls/nb.example/analysis.ipynb');
    await expect(page.getByRole('heading', { name: 'Analysis' })).toBeVisible();
    expect(await links(headerLinks(page))).toEqual([
      ['View as Code', '/format/script/urls/nb.example/analysis.ipynb'],
      ...jupyterliteLinks(`${BASE}/analysis.ipynb`),
      ['View on nbviewer.org', `${nbviewer}/urls/nb.example/analysis.ipynb`],
      ['Download Notebook', `${BASE}/analysis.ipynb`]
    ]);
  });

  test('the slides view links to the notebook and code', async ({ page }) => {
    await page.goto('/format/slides/urls/nb.example/deck.ipynb');
    await expect(
      page.getByRole('heading', { name: 'Deck title' })
    ).toBeVisible();
    expect(await links(headerLinks(page))).toEqual([
      ['View as Notebook', '/urls/nb.example/deck.ipynb'],
      ['View as Code', '/format/script/urls/nb.example/deck.ipynb'],
      ...jupyterliteLinks(`${BASE}/deck.ipynb`),
      [
        'View on nbviewer.org',
        `${nbviewer}/format/slides/urls/nb.example/deck.ipynb`
      ],
      ['Download Notebook', `${BASE}/deck.ipynb`]
    ]);

    await page.getByRole('link', { name: 'View as Notebook' }).click();
    await expect(page).toHaveURL('/urls/nb.example/deck.ipynb');
    await expect(
      page.getByRole('heading', { name: 'Deck title' })
    ).toBeVisible();
    await expect(
      page.getByRole('paragraph').filter({ hasText: 'Skipped cell' })
    ).toBeVisible();
  });

  test('the script view links to the notebook and slides', async ({ page }) => {
    await page.goto('/format/script/urls/nb.example/deck.ipynb');
    await expect(page.getByText('# # Deck title')).toBeVisible();
    const found = await links(headerLinks(page));
    expect(found.slice(0, -1)).toEqual([
      ['View as Notebook', '/urls/nb.example/deck.ipynb'],
      ['View as Slides', '/format/slides/urls/nb.example/deck.ipynb'],
      ...jupyterliteLinks(`${BASE}/deck.ipynb`),
      [
        'View on nbviewer.org',
        `${nbviewer}/format/script/urls/nb.example/deck.ipynb`
      ],
      ['Download Notebook', `${BASE}/deck.ipynb`]
    ]);
    expect(found.at(-1)?.[0]).toBe('Download Script');

    await page.getByRole('link', { name: 'View as Slides' }).click();
    await expect(page).toHaveURL('/format/slides/urls/nb.example/deck.ipynb');
    await expect(
      page.getByRole('heading', { name: 'Deck title' })
    ).toBeVisible();
  });
});

test.describe('format/script/', () => {
  /** Click "Download Script": the file's name and text. */
  async function download(page: Page): Promise<[string, string]> {
    const [file] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name: 'Download Script' }).click()
    ]);
    return [file.suggestedFilename(), readFileSync(await file.path(), 'utf8')];
  }

  test('a Python notebook, with IPython syntax converted', async ({ page }) => {
    await page.goto('/format/script/urls/nb.example/analysis.ipynb');
    const script = page.locator('pre');
    await expect(script).toContainText("get_ipython().system('pip install");
    expect(await script.textContent()).toBe(ANALYSIS_PY);
    // highlighted as Python
    const keyword = script.getByText('import', { exact: true });
    await expect(keyword).toBeVisible();
    expect(await textColor(keyword)).not.toBe(await textColor(script));

    expect(await links(headerLinks(page))).toEqual([
      ['View as Notebook', '/urls/nb.example/analysis.ipynb'],
      ...jupyterliteLinks(`${BASE}/analysis.ipynb`),
      [
        'View on nbviewer.org',
        'https://nbviewer.org/format/script/urls/nb.example/analysis.ipynb'
      ],
      ['Download Notebook', `${BASE}/analysis.ipynb`],
      ['Download Script', expect.stringMatching(/^blob:/)]
    ]);
    expect(await download(page)).toEqual(['analysis.py', ANALYSIS_PY]);
  });

  test('an R notebook: its code cells, with its extension', async ({
    page
  }) => {
    await page.goto('/format/script/urls/nb.example/stats.ipynb');
    const script = page.locator('pre');
    const expected = 'x <- c(1, 2, 3)\nmean(x)\n\nplot(x)\n';
    await expect(script).toContainText('plot(x)');
    expect(await script.textContent()).toBe(expected);
    await expect(headerLinks(page)).toContainText('R Kernel');
    expect(await download(page)).toEqual(['stats.r', expected]);
  });
});

test.describe('format/slides/', () => {
  /** reveal.js's slide number, "current / total". */
  function slideNumber(page: Page): Locator {
    return page.locator('.reveal .slide-number');
  }

  /** A fragment of the current slide, by its text. */
  function fragment(page: Page, text: string): Locator {
    return page.locator('.reveal .fragment', { hasText: text });
  }

  test('slides, fragments and subslides, with the keyboard', async ({
    page
  }) => {
    await page.goto('/format/slides/urls/nb.example/deck.ipynb');
    await expect(
      page.getByRole('heading', { name: 'Deck title' })
    ).toBeVisible();
    await expect(slideNumber(page)).toHaveText('1 / 3');
    // fragments wait for their turn
    await expect(fragment(page, 'Fragment one')).toHaveCSS('opacity', '0');
    await expect(fragment(page, 'Fragment two')).toHaveCSS('opacity', '0');
    await page.keyboard.press('Space');
    await expect(fragment(page, 'Fragment one')).toHaveCSS('opacity', '1');
    await expect(fragment(page, 'Fragment two')).toHaveCSS('opacity', '0');
    await page.keyboard.press('ArrowRight');
    await expect(fragment(page, 'Fragment two')).toHaveCSS('opacity', '1');
    await expect(slideNumber(page)).toHaveText('1 / 3');
    // the whole slide is showing, without the notes and the skipped cell
    await expect(
      page.getByText('Speaker notes for the title').filter({ visible: true })
    ).toHaveCount(0);
    await expect(
      page.getByText('Skipped cell').filter({ visible: true })
    ).toHaveCount(0);

    // down to the subslide, with its math typeset
    await page.keyboard.press('ArrowDown');
    const subslide = page.getByRole('heading', { name: 'Subslide' });
    await expect(subslide).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Deck title' })).toHaveCount(
      0
    );
    await expect(slideNumber(page)).toHaveText('2 / 3');
    await expect(
      page.locator('.reveal section.present mjx-container')
    ).toHaveCount(1);

    // on to the second slide: its code cell and output, and its background
    // from metadata.slideshow.data
    await page.keyboard.press('ArrowRight');
    await expect(
      page.getByRole('heading', { name: 'Second slide' })
    ).toBeVisible();
    await expect(slideNumber(page)).toHaveText('3 / 3');
    await expect(
      page.getByText('printed on slide two', { exact: true })
    ).toBeVisible();
    await expect(
      page.locator('.reveal .backgrounds > .slide-background.present')
    ).toHaveCSS('background-color', 'rgb(255, 224, 178)');
    // the URL names the slide, so a reload stays there
    await expect(page).toHaveURL(/#\/1$/);
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Second slide' })
    ).toBeVisible();
    await expect(slideNumber(page)).toHaveText('3 / 3');

    await page.keyboard.press('ArrowLeft');
    await expect(
      page.getByRole('heading', { name: 'Deck title' })
    ).toBeVisible();
    await expect(slideNumber(page)).toHaveText('1 / 3');
  });

  test("headings in the theme's font, which comes with the site", async ({
    page
  }) => {
    // A request to Google Fonts, where reveal.js's theme gets its fonts,
    // would fail the test: it has no fixture.
    await page.goto('/format/slides/urls/nb.example/deck.ipynb');
    const heading = page.getByRole('heading', { name: 'Deck title' });
    await expect(heading).toBeVisible();
    await expect(heading).toHaveCSS('font-family', /^"News Cycle"/);
    await expect
      .poll(() =>
        page.evaluate(() =>
          [...document.fonts]
            .filter(face => face.status === 'loaded')
            .map(face => face.family)
        )
      )
      .toContain('News Cycle');
  });

  test('the keys still change slides after a click in a code cell', async ({
    page
  }) => {
    // reveal.js ignores keys typed into editable elements, and JupyterLab's
    // read-only editors are still contenteditable unless made otherwise.
    await page.goto('/format/slides/urls/nb.example/deck.ipynb#/1');
    await expect(slideNumber(page)).toHaveText('3 / 3');
    await page.getByText('print("printed")', { exact: true }).click();
    await page.keyboard.press('ArrowLeft');
    await expect(slideNumber(page)).toHaveText('1 / 3', { timeout: 3000 });
  });

  test('keys that widget controls use stay with them', async ({
    page,
    web
  }) => {
    const widgets = new WidgetState();
    const slider = widgets.control(
      'IntSlider',
      { value: 3, max: 10, description: 'Level' },
      'SliderStyle'
    );
    const dropdown = widgets.control(
      'Dropdown',
      {
        _options_labels: ['one', 'two', 'three'],
        index: 1,
        description: 'Pick'
      },
      'DescriptionStyle'
    );
    web.file(
      `${BASE}/controls.ipynb`,
      notebook(
        [
          slide('slide', markdown('# Controls')),
          code('slider', [widgetView(slider, 'IntSlider(value=3)')]),
          code('dropdown', [widgetView(dropdown, 'Dropdown(index=1)')]),
          slide('slide', markdown('# After the controls'))
        ],
        { ...PYTHON, ...widgets.metadata() }
      )
    );
    await page.goto('/format/slides/urls/nb.example/controls.ipynb');
    const level = page.getByRole('slider');
    await expect(level).toHaveAttribute('aria-valuenow', '3.0');
    const pick = page.getByRole('combobox', { name: 'Pick' });
    await expect(pick).toHaveValue('two');

    // the slider takes the arrow keys, and the dropdown too
    await level.press('ArrowRight');
    await expect(slideNumber(page)).toHaveText('1 / 2');
    await expect(level).toHaveAttribute('aria-valuenow', '4.0');
    await pick.press('ArrowDown');
    await expect(pick).toHaveValue('three');
    await expect(slideNumber(page)).toHaveText('1 / 2');

    // elsewhere, they change slides
    await page.getByRole('heading', { name: 'Controls' }).click();
    await page.keyboard.press('ArrowRight');
    await expect(slideNumber(page)).toHaveText('2 / 2');
  });

  test('speaker notes in the speaker view', async ({ page, context }) => {
    await page.goto('/format/slides/urls/nb.example/deck.ipynb');
    await expect(slideNumber(page)).toHaveText('1 / 3');
    const [speakerView] = await Promise.all([
      context.waitForEvent('page'),
      page.keyboard.press('s')
    ]);
    const notes = speakerView
      .getByText('Speaker notes for the title', { exact: true })
      .filter({ visible: true });
    await expect(notes).toBeVisible();
    // it follows the slideshow: past the two fragments to the subslide,
    // which has no notes
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('ArrowDown');
    }
    await expect(slideNumber(page)).toHaveText('2 / 3');
    await expect(notes).toHaveCount(0);
  });

  test('a notebook without slide metadata is one slide', async ({ page }) => {
    await page.goto('/format/slides/urls/nb.example/analysis.ipynb');
    await expect(page.getByRole('heading', { name: 'Analysis' })).toBeVisible();
    await expect(slideNumber(page)).toHaveText('1 / 1');
    // every cell, in the slide
    const current = page.locator('.reveal section.present');
    await expect(current.getByText('import numpy as np')).toBeAttached();
    await expect(current.getByText('echo "hi"')).toBeAttached();
    await page.keyboard.press('ArrowRight');
    await expect(slideNumber(page)).toHaveText('1 / 1');
    expect(await links(headerLinks(page))).toEqual([
      ['View as Notebook', '/urls/nb.example/analysis.ipynb'],
      ['View as Code', '/format/script/urls/nb.example/analysis.ipynb'],
      ...jupyterliteLinks(`${BASE}/analysis.ipynb`),
      [
        'View on nbviewer.org',
        'https://nbviewer.org/format/slides/urls/nb.example/analysis.ipynb'
      ],
      ['Download Notebook', `${BASE}/analysis.ipynb`]
    ]);
  });

  /** A slide with a title, `output`, and another output below it. */
  function tallSlide(
    output: Record<string, unknown>,
    metadata: Record<string, unknown> = {}
  ) {
    return notebook(
      [
        slide('slide', markdown('# Tall slide')),
        code('show()', [output]),
        code('print("last")', [stream('the last output\n')])
      ],
      { ...PYTHON, ...metadata }
    );
  }

  const widgets = new WidgetState();
  const tallSlider = widgets.control(
    'IntSlider',
    {
      value: 3,
      description: 'Tall',
      layout: widgetRef(widgets.layout({ height: '400px' }))
    },
    'SliderStyle'
  );
  const lateOutputs = {
    'a Vega-Lite chart': [
      tallSlide(
        displayData({
          'application/vnd.vegalite.v5+json': {
            $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
            data: { values: [{ a: 'A', b: 28 }] },
            mark: 'bar',
            encoding: {
              x: { field: 'a', type: 'nominal' },
              y: { field: 'b', type: 'quantitative' }
            },
            height: 300
          },
          'text/plain': 'alt.Chart(...)'
        })
      ),
      '.vega-embed canvas'
    ],
    'a widget': [
      tallSlide(
        widgetView(tallSlider, 'IntSlider(value=3)'),
        widgets.metadata()
      ),
      '.widget-slider'
    ]
  } as const;

  for (const [what, [nb, rendered]] of Object.entries(lateOutputs)) {
    test(`the whole slide shows once ${what} has rendered`, async ({
      page,
      web
    }) => {
      web.file(`${BASE}/tall.ipynb`, nb);
      await page.goto('/format/slides/urls/nb.example/tall.ipynb');
      await expect(page.locator(rendered)).toBeVisible();
      // reveal.js centers each slide in the deck, and this one grew after
      // the deck was laid out
      const bottom = async (locator: Locator) => {
        const box = await locator.boundingBox();
        return box ? box.y + box.height : Number.NaN;
      };
      const deckBottom = await bottom(page.locator('.reveal'));
      const last = page.getByText('the last output', { exact: true });
      await expect.poll(() => bottom(last)).toBeLessThanOrEqual(deckBottom);
    });
  }

  test('progress bar widgets show', async ({ page, web }) => {
    // reveal.js's rules for its own progress bar match them too
    const widgets = new WidgetState();
    const progress = (name: string, state: Record<string, unknown>) =>
      widgets.control(
        name,
        { ...state, _view_name: 'ProgressView' },
        'ProgressStyle'
      );
    const across = progress('IntProgress', { value: 6, max: 10 });
    const upright = progress('FloatProgress', {
      value: 0.5,
      max: 1,
      orientation: 'vertical'
    });
    web.file(
      `${BASE}/progress.ipynb`,
      notebook(
        [
          slide('slide', markdown('# Progress')),
          code('across', [widgetView(across, 'IntProgress(value=6)')]),
          code('upright', [widgetView(upright, 'FloatProgress(value=0.5)')])
        ],
        { ...PYTHON, ...widgets.metadata() }
      )
    );
    await page.goto('/format/slides/urls/nb.example/progress.ipynb');
    for (const [orientation, size, filled] of [
      ['h', 'width', 0.6],
      ['v', 'height', 0.5]
    ] as const) {
      const track = page.locator(`.widget-${orientation}progress > .progress`);
      const bar = track.locator('.progress-bar');
      await expect(bar).toBeVisible();
      // JupyterLab's colors, and the bar fills its share of the track
      await expect(track).toHaveCSS('background-color', 'rgb(238, 238, 238)');
      const trackBox = (await track.boundingBox())!;
      const barBox = (await bar.boundingBox())!;
      expect(trackBox.width).toBeGreaterThan(10);
      expect(trackBox.height).toBeGreaterThan(10);
      expect(barBox[size] / trackBox[size]).toBeCloseTo(filled, 2);
    }
  });
});

test.describe('format URLs', () => {
  test('redirects keep the format', async ({ page, github }) => {
    github.files('u', 'r', 'main', { 'docs/deck.ipynb': deck });
    await page.goto(
      '/format/slides/url/github.com/u/r/blob/main/docs/deck.ipynb'
    );
    await expect(page).toHaveURL(
      '/format/slides/github/u/r/blob/main/docs/deck.ipynb'
    );
    await expect(
      page.getByRole('heading', { name: 'Deck title' })
    ).toBeVisible();
    await expect(page.locator('.reveal .slide-number')).toHaveText('1 / 3');
    // the provider's links, and the same format on nbviewer.org
    expect(await links(headerLinks(page))).toEqual([
      ['View as Notebook', '/github/u/r/blob/main/docs/deck.ipynb'],
      ['View as Code', '/format/script/github/u/r/blob/main/docs/deck.ipynb'],
      ['View on GitHub', 'https://github.com/u/r/blob/main/docs/deck.ipynb'],
      [
        'Execute on Binder',
        'https://mybinder.org/v2/gh/u/r/main?filepath=docs/deck.ipynb'
      ],
      ...jupyterliteLinks(
        'https://raw.githubusercontent.com/u/r/main/docs/deck.ipynb'
      ),
      [
        'View on nbviewer.org',
        'https://nbviewer.org/format/slides/github/u/r/blob/main/docs/deck.ipynb'
      ],
      [
        'Download Notebook',
        'https://raw.githubusercontent.com/u/r/main/docs/deck.ipynb'
      ]
    ]);
  });

  test('to the default branch, and to listings', async ({ page, github }) => {
    github.repo('u', 'r', 'main');
    github.files('u', 'r', 'main', { 'docs/deck.ipynb': deck });
    await page.goto('/format/script/github/u/r');
    await expect(page).toHaveURL('/format/script/github/u/r/tree/main/');
    await expect(page.getByRole('link', { name: 'docs' })).toBeVisible();
  });

  test('to the owner of a gist', async ({ page, github }) => {
    const id = '0123456789abcdef0123';
    github.gist({ id, owner: 'fperez', files: { 'deck.ipynb': deck } });
    await page.goto(`/format/script/gist/${id}`);
    await expect(page).toHaveURL(`/format/script/gist/fperez/${id}`);
    await expect(page.getByText('# # Deck title')).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'View on nbviewer.org' })
    ).toHaveAttribute(
      'href',
      `https://nbviewer.org/format/script/gist/fperez/${id}`
    );
  });

  for (const path of [
    '/format/pdf/urls/nb.example/deck.ipynb',
    '/format/slides/',
    '/format/slides',
    '/format/script/format/slides/urls/nb.example/deck.ipynb'
  ]) {
    test(`${path} is not found`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('alert')).toContainText('404: Not Found');
    });
  }
});

test.describe('links on format/slides/ pages', () => {
  // nbviewer.org leaves relative links in notebooks and HTML files as they
  // are, so they resolve against the page's format/{name}/ URL.

  /** The deck the others link to. */
  const part2 = notebook([slide('slide', markdown('# Part two'))]);

  /** A deck whose first slide has the links in `text`. */
  function linking(title: string, text: string) {
    return notebook([slide('slide', markdown(`# ${title}\n\n${text}`))]);
  }

  /** The link named `name`. */
  function link(page: Page, name: string): Locator {
    return page.getByRole('link', { name, exact: true });
  }

  test('to notebooks and HTML files in a repository keep the format', async ({
    page,
    github
  }) => {
    github.files('u', 'r', 'main', {
      'deck.ipynb': linking(
        'Repository deck',
        '[next deck](part2.ipynb), [the report](docs/report.html), ' +
          '[the docs](docs/), [the data](data.csv)'
      ),
      'part2.ipynb': part2,
      'docs/report.html': '<h1>Report</h1>',
      'data.csv': 'a,b\n1,2\n'
    });
    await page.goto('/format/slides/github/u/r/blob/main/deck.ipynb');
    const blob = '/github/u/r/blob/main';
    await expect(link(page, 'next deck')).toHaveAttribute(
      'href',
      `/format/slides${blob}/part2.ipynb`
    );
    // HTML files pass the format on to their own links
    await expect(link(page, 'the report')).toHaveAttribute(
      'href',
      `/format/slides${blob}/docs/report.html`
    );
    // nbviewer redirects directories to their listing without the format,
    // and serves other files as they are; breadcrumbs leave it out too
    await expect(link(page, 'the docs')).toHaveAttribute(
      'href',
      '/github/u/r/tree/main/docs/'
    );
    await expect(link(page, 'the data')).toHaveAttribute(
      'href',
      `${blob}/data.csv`
    );
    await expect(
      page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link')
    ).toHaveAttribute('href', '/github/u/r/tree/main/');

    await link(page, 'next deck').click();
    await expect(page).toHaveURL(`/format/slides${blob}/part2.ipynb`);
    await expect(page.getByRole('heading', { name: 'Part two' })).toBeVisible();
    await expect(page.locator('.reveal .slide-number')).toHaveText('1 / 1');
  });

  test('to notebooks in an HTML file keep the format', async ({
    page,
    github
  }) => {
    github.files('u', 'r', 'main', {
      'docs/report.html':
        '<!DOCTYPE html><title>Report</title><h1>Report</h1>' +
        '<a href="../deck.ipynb">the deck</a> ' +
        '<a href="../">the repository</a>',
      'deck.ipynb': part2
    });
    await page.goto('/format/slides/github/u/r/blob/main/docs/report.html');
    const app = new URL(page.url()).origin;
    const frame = page.locator('iframe[title="report.html"]').contentFrame();
    await expect(frame.getByRole('link', { name: 'the deck' })).toHaveAttribute(
      'href',
      `${app}/format/slides/github/u/r/blob/main/deck.ipynb`
    );
    await expect(
      frame.getByRole('link', { name: 'the repository' })
    ).toHaveAttribute('href', `${app}/github/u/r/tree/main/`);

    await frame.getByRole('link', { name: 'the deck' }).click();
    await expect(page).toHaveURL(
      '/format/slides/github/u/r/blob/main/deck.ipynb'
    );
    await expect(page.getByRole('heading', { name: 'Part two' })).toBeVisible();
    await expect(page.locator('.reveal .slide-number')).toHaveText('1 / 1');
  });

  test('to notebooks and HTML files in a gist keep the format', async ({
    page,
    github
  }) => {
    const id = '0123456789abcdef0123';
    const gist = github.gist({
      id,
      owner: 'fperez',
      files: {
        'deck.ipynb': linking(
          'Gist deck',
          '[next deck](part2.ipynb), [the page](page.html), ' +
            '[the script](helper.py)'
        ),
        'part2.ipynb': part2,
        'page.html': '<h1>Page</h1>',
        'helper.py': 'x = 1\n'
      }
    });
    await page.goto(`/format/slides/gist/fperez/${id}/deck.ipynb`);
    await expect(link(page, 'next deck')).toHaveAttribute(
      'href',
      `/format/slides/gist/fperez/${id}/part2.ipynb`
    );
    await expect(link(page, 'the page')).toHaveAttribute(
      'href',
      `/format/slides/gist/fperez/${id}/page.html`
    );
    const files = gist.files as Record<string, { raw_url: string }>;
    await expect(link(page, 'the script')).toHaveAttribute(
      'href',
      files['helper.py'].raw_url
    );

    await link(page, 'next deck').click();
    await expect(page).toHaveURL(
      `/format/slides/gist/fperez/${id}/part2.ipynb`
    );
    await expect(page.getByRole('heading', { name: 'Part two' })).toBeVisible();
  });

  test('to notebooks on a url/ page keep the format', async ({ page, web }) => {
    web.file(
      `${BASE}/decks/deck.ipynb`,
      linking(
        'Remote deck',
        '[next deck](sub/part2.ipynb), [the folder](sub/), ' +
          '[the data](data.csv)'
      )
    );
    web.file(`${BASE}/decks/sub/part2.ipynb`, part2);
    await page.goto('/format/slides/urls/nb.example/decks/deck.ipynb');
    await expect(link(page, 'next deck')).toHaveAttribute(
      'href',
      '/format/slides/urls/nb.example/decks/sub/part2.ipynb'
    );
    await expect(link(page, 'the folder')).toHaveAttribute(
      'href',
      `${BASE}/decks/sub/`
    );
    await expect(link(page, 'the data')).toHaveAttribute(
      'href',
      `${BASE}/decks/data.csv`
    );

    await link(page, 'next deck').click();
    await expect(page).toHaveURL(
      '/format/slides/urls/nb.example/decks/sub/part2.ipynb'
    );
    await expect(page.getByRole('heading', { name: 'Part two' })).toBeVisible();
  });

  test('to other files, followed from a url/ page, open the file', async ({
    page,
    web,
    baseURL
  }) => {
    // as relative links that the viewer can't rewrite (in a widget, say)
    // resolve against the page
    web.file(`${BASE}/decks/data.csv`, 'a,b\n1,2\n');
    await page.goto('/format/slides/urls/nb.example/decks/data.csv', {
      referer: `${baseURL}/format/slides/urls/nb.example/decks/deck.ipynb`
    });
    await expect(page).toHaveURL(`${BASE}/decks/data.csv`);
    await expect(page.getByText('a,b')).toBeVisible();
  });
});
