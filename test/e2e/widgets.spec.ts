/**
 * ipywidgets, rendered from the widget state saved in the notebook, without
 * a kernel, as nbviewer.org does.
 */

import type { Locator, Page, Request } from '@playwright/test';

import {
  code,
  displayData,
  expect,
  markdown,
  notebook,
  stream,
  test,
  type Web,
  widgetRef,
  WidgetState,
  widgetView
} from './fixtures.ts';

const BASE = 'https://nb.example';
const CDN = 'https://cdn.jsdelivr.net';

/** Serve `nb` and open it. */
async function open(page: Page, web: Web, nb: object) {
  web.file(`${BASE}/widgets.ipynb`, nb);
  await page.goto('/urls/nb.example/widgets.ipynb');
}

/** The control (slider, text box, ...) with this description. */
function control(page: Page, description: string): Locator {
  return page
    .locator('.widget-inline-hbox')
    .filter({ has: page.getByText(description, { exact: true }) });
}

/**
 * A notebook with what most notebooks with widgets have: sliders, one with
 * math in its description, a jslink'ed slider and text box, a button with
 * an icon, an Output widget, and a widget that was closed before the state
 * was saved.
 */
function widgetsNotebook(version: 7 | 8) {
  const widgets = new WidgetState(version);
  const slider = widgets.control(
    'IntSlider',
    { value: 3, max: 10, description: 'Slider' },
    'SliderStyle'
  );
  const a = widgets.control(
    'IntSlider',
    { value: 4, max: 20, description: 'a' },
    'SliderStyle'
  );
  const b = widgets.control(
    'IntText',
    { value: 4, description: 'b' },
    'DescriptionStyle'
  );
  widgets.link([a, 'value'], [b, 'value']);
  const pair = widgets.control('HBox', {
    children: [widgetRef(a), widgetRef(b)]
  });
  const alpha = widgets.control(
    'FloatSlider',
    { value: 0.5, max: 1, description: '$\\alpha$' },
    'SliderStyle'
  );
  const button = widgets.control(
    'Button',
    { description: 'Click me', icon: 'check' },
    'ButtonStyle'
  );
  const progress = widgets.control(
    'IntProgress',
    { value: 6, max: 10, description: 'Nested', _view_name: 'ProgressView' },
    'ProgressStyle'
  );
  const output = widgets.output([
    stream('Printed inside an Output widget\n'),
    displayData({
      'text/html': '<b>Bold HTML</b> inside an Output widget',
      'text/plain': '<IPython.core.display.HTML object>'
    }),
    widgetView(progress, "IntProgress(value=6, description='Nested')")
  ]);
  return notebook(
    [
      markdown('# Widgets'),
      code('slider', [widgetView(slider, 'IntSlider(value=3)')]),
      code('widgets.HBox([a, b])', [widgetView(pair, 'HBox(children=...)')]),
      code('alpha', [widgetView(alpha, 'FloatSlider(value=0.5)')]),
      code('button', [widgetView(button, "Button(description='Click me')")]),
      code('out', [widgetView(output, 'Output()')]),
      // closed widgets are left out of the saved state
      code('gone', [
        widgetView(
          '0123456789abcdef0123456789abcdef',
          "IntSlider(value=7, description='Closed')"
        )
      ]),
      code('print("after the widgets")', [stream('after the widgets\n')])
    ],
    widgets.metadata()
  );
}

/** Math in descriptions is typeset, buttons show their icons. */
async function expectMathAndIcons(page: Page) {
  const alpha = page.locator('.widget-slider').filter({
    has: page.locator('mjx-container')
  });
  await expect(alpha).toBeVisible();
  await expect(
    page.getByText('$\\alpha$').filter({ visible: true })
  ).toHaveCount(0);
  const icon = page.getByRole('button', { name: 'Click me' }).locator('i');
  await expect(icon).toHaveClass(/fa-check/);
  await expect
    .poll(() =>
      icon.evaluate(i => {
        const glyph = getComputedStyle(i, '::before');
        return [glyph.fontFamily, glyph.content !== 'none'];
      })
    )
    .toEqual([expect.stringContaining('Font Awesome 5 Free'), true]);
}

/** Requests for the widget code, which loads only for saved widgets. */
function widgetChunkRequests(page: Page): Request[] {
  const requests: Request[] = [];
  page.on('request', request => {
    if (/\/static\/js\/widgets\.[^/]*\.js$/.test(request.url())) {
      requests.push(request);
    }
  });
  return requests;
}

test('saved ipywidgets 8 controls render and respond', async ({
  page,
  web
}) => {
  const chunks = widgetChunkRequests(page);
  await open(page, web, widgetsNotebook(8));

  const slider = control(page, 'Slider');
  await expect(slider.locator('.widget-readout')).toHaveText('3');
  await expect(slider.getByRole('slider')).toHaveAttribute(
    'aria-valuenow',
    '3.0'
  );

  // jslink'ed: either one changes the other, without a kernel
  const a = control(page, 'a');
  const b = page.getByRole('spinbutton', { name: 'b' });
  await expect(a.locator('.widget-readout')).toHaveText('4');
  await expect(b).toHaveValue('4');
  await b.fill('15');
  await b.press('Enter');
  await expect(a.locator('.widget-readout')).toHaveText('15');
  await a.getByRole('slider').press('ArrowRight');
  await expect(a.locator('.widget-readout')).toHaveText('16');
  await expect(b).toHaveValue('16');

  // side by side in the HBox
  const [aBox, bBox] = [await a.boundingBox(), await b.boundingBox()];
  expect(bBox!.x).toBeGreaterThanOrEqual(aBox!.x + aBox!.width - 1);

  await expectMathAndIcons(page);
  expect(chunks).toHaveLength(1);
});

test('an Output widget shows its outputs, widgets included', async ({
  page,
  web
}) => {
  await open(page, web, widgetsNotebook(8));
  const output = page.locator('.widget-output');
  await expect(
    output.getByText('Printed inside an Output widget')
  ).toBeVisible();
  await expect(output.locator('b')).toHaveText('Bold HTML');
  await expect(control(page, 'Nested')).toBeVisible();
  await expect(page.getByText('IntProgress(value=6')).toHaveCount(0);
});

test('a widget whose state was not saved shows its text', async ({
  page,
  web
}) => {
  await open(page, web, widgetsNotebook(8));
  await expect(
    page.getByText("IntSlider(value=7, description='Closed')")
  ).toBeVisible();
  await expect(
    page.getByText('after the widgets', { exact: true })
  ).toBeVisible();
  // the others are widgets
  await expect(control(page, 'Slider')).toBeVisible();
  await expect(page.getByText('IntSlider(value=3)')).toHaveCount(0);
});

test('a widget in an Output widget whose state was not saved says so', async ({
  page,
  web
}) => {
  const widgets = new WidgetState(8);
  const output = widgets.output([
    widgetView('fedcba9876543210fedcba9876543210', 'Nope()')
  ]);
  await open(
    page,
    web,
    notebook(
      [code('out', [widgetView(output, 'Output()')])],
      widgets.metadata()
    )
  );
  await expect(
    page.getByText(
      'Could not display this widget: its state was not saved with the notebook.'
    )
  ).toBeVisible();
});

test('without saved state, widgets show their text, and no widget code loads', async ({
  page,
  web
}) => {
  const chunks = widgetChunkRequests(page);
  const nb = widgetsNotebook(8);
  delete (nb.metadata as Record<string, unknown>).widgets;
  await open(page, web, nb);
  await expect(page.getByText('IntSlider(value=3)')).toBeVisible();
  await expect(page.getByText('HBox(children=...)')).toBeVisible();
  await expect(
    page.getByText('after the widgets', { exact: true })
  ).toBeVisible();
  await expect(page.locator('.jupyter-widgets')).toHaveCount(0);
  expect(chunks).toHaveLength(0);
});

test('saved ipywidgets 7 state renders too', async ({ page, web }) => {
  await open(page, web, widgetsNotebook(7));
  await expect(control(page, 'Slider').locator('.widget-readout')).toHaveText(
    '3'
  );
  const a = control(page, 'a');
  const b = page.getByRole('spinbutton', { name: 'b' });
  await b.fill('15');
  await b.press('Enter');
  await expect(a.locator('.widget-readout')).toHaveText('15');
  await a.locator('.ui-slider-handle').press('ArrowRight');
  await expect(b).toHaveValue('16');
  await expect(
    page.locator('.widget-output').getByText('Printed inside an Output widget')
  ).toBeVisible();
  await expect(control(page, 'Nested')).toBeVisible();
  await expectMathAndIcons(page);
  await expect(
    page.getByText("IntSlider(value=7, description='Closed')")
  ).toBeVisible();
});

test.describe('widget libraries', () => {
  const MODULE = 'nbv-fake';
  const VERSION = '^1.0.0';

  /** A notebook with a widget from MODULE, then a print. */
  function libraryNotebook() {
    const widgets = new WidgetState(8);
    const fake = widgets.model(
      [MODULE, VERSION],
      'FakeModel',
      [MODULE, VERSION],
      'FakeView',
      { layout: widgetRef(widgets.layout()), value: 42 }
    );
    return notebook(
      [
        code('fake', [widgetView(fake, 'Fake(value=42)')]),
        code('print("after the widget")', [stream('after the widget\n')])
      ],
      widgets.metadata()
    );
  }

  /** Requests for MODULE on jsDelivr, answered by `reply`. */
  function serveModule(
    web: Web,
    reply: { status: number; body: string; contentType: string }
  ): string[] {
    const requested: string[] = [];
    web.host(CDN, request => {
      const path = decodeURIComponent(new URL(request.url()).pathname);
      requested.push(path);
      return path === `/npm/${MODULE}@${VERSION}/dist/index.js` ? reply : null;
    });
    return requested;
  }

  test('load from jsDelivr with RequireJS', async ({ page, web }) => {
    const requested = serveModule(web, {
      status: 200,
      contentType: 'text/javascript',
      body: `define(['@jupyter-widgets/base'], function (base) {
        class FakeModel extends base.DOMWidgetModel {}
        class FakeView extends base.DOMWidgetView {
          render() {
            this.el.textContent = 'Fake widget, value ' + this.model.get('value');
          }
        }
        return { FakeModel: FakeModel, FakeView: FakeView };
      });`
    });
    await open(page, web, libraryNotebook());
    await expect(page.getByText('Fake widget, value 42')).toBeVisible();
    await expect(
      page.getByText('after the widget', { exact: true })
    ).toBeVisible();
    expect(requested).toEqual([`/npm/${MODULE}@${VERSION}/dist/index.js`]);
  });

  test("one that doesn't load says so", async ({ page, web }) => {
    serveModule(web, {
      status: 404,
      contentType: 'text/plain',
      body: `Couldn't find the requested release version ${VERSION}.`
    });
    await open(page, web, libraryNotebook());
    await expect(
      page.getByText(
        `Could not load ${MODULE} ${VERSION} from ` +
          `${CDN}/npm/${MODULE}@${VERSION}/dist/index.js`
      )
    ).toBeVisible();
    await expect(
      page.getByText(
        `Failed to load model class 'FakeModel' from module '${MODULE}'`
      )
    ).toBeVisible();
    // the rest of the notebook renders
    await expect(
      page.getByText('after the widget', { exact: true })
    ).toBeVisible();
    await expect(page.getByText('Fake(value=42)')).toHaveCount(0);
  });
});
