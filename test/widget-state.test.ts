import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  hasWidgetModel,
  savedWidgetState,
  WIDGET_STATE_MIMETYPE,
  WIDGET_VIEW_MIMETYPE,
  widgetModuleUrl,
  withoutMissingWidgetViews
} from '../src/widget-state.ts';

const state = {
  version_major: 2,
  version_minor: 0,
  state: {
    abc: {
      model_name: 'IntSliderModel',
      model_module: '@jupyter-widgets/controls',
      model_module_version: '2.0.0',
      state: { value: 3 }
    }
  }
};

test('savedWidgetState reads version 2 state from notebook metadata', () => {
  const metadata = { widgets: { [WIDGET_STATE_MIMETYPE]: state } };
  assert.equal(savedWidgetState(metadata), state);
  assert.equal(savedWidgetState(undefined), null);
  assert.equal(savedWidgetState({}), null);
  assert.equal(savedWidgetState({ widgets: {} }), null);
  assert.equal(savedWidgetState({ widgets: [] }), null);
  // ipywidgets 6 state needs the old jupyter-js-widgets
  const v1 = { ...state, version_major: 1 };
  assert.equal(
    savedWidgetState({ widgets: { [WIDGET_STATE_MIMETYPE]: v1 } }),
    null
  );
  const noModels = { version_major: 2, version_minor: 0, state: null };
  assert.equal(
    savedWidgetState({ widgets: { [WIDGET_STATE_MIMETYPE]: noModels } }),
    null
  );
});

test('hasWidgetModel looks up a view model id in the state', () => {
  assert.equal(hasWidgetModel(state, { model_id: 'abc' }), true);
  assert.equal(hasWidgetModel(state, { model_id: 'missing' }), false);
  assert.equal(hasWidgetModel(state, { model_id: 'toString' }), false);
  assert.equal(hasWidgetModel(state, {}), false);
  assert.equal(hasWidgetModel(state, 'abc'), false);
  assert.equal(hasWidgetModel(null, { model_id: 'abc' }), false);
});

function notebook(outputs: any[]): any {
  return {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {},
    cells: [
      { cell_type: 'markdown', source: 'text', metadata: {} },
      {
        cell_type: 'code',
        source: 'w',
        metadata: {},
        execution_count: 1,
        outputs
      }
    ]
  };
}

function view(modelId: string): any {
  return {
    output_type: 'display_data',
    metadata: {},
    data: {
      [WIDGET_VIEW_MIMETYPE]: {
        model_id: modelId,
        version_major: 2,
        version_minor: 0
      },
      'text/plain': `IntSlider(${modelId})`
    }
  };
}

test('withoutMissingWidgetViews keeps views whose model is saved', () => {
  const nb = notebook([view('abc')]);
  assert.deepEqual(withoutMissingWidgetViews(nb, state), nb);
});

test('withoutMissingWidgetViews leaves out views of missing models', () => {
  const stream = { output_type: 'stream', name: 'stdout', text: 'hi\n' };
  const nb = notebook([view('abc'), view('gone'), stream]);
  const result = withoutMissingWidgetViews(nb, state);
  const outputs = (result.cells[1] as any).outputs;
  assert.deepEqual(outputs[0], view('abc'));
  assert.deepEqual(outputs[1].data, { 'text/plain': 'IntSlider(gone)' });
  assert.equal(outputs[1].output_type, 'display_data');
  assert.equal(outputs[2], stream);
  assert.equal(result.cells[0], nb.cells[0]);
  // the input is unchanged
  assert.ok(WIDGET_VIEW_MIMETYPE in nb.cells[1].outputs[1].data);
});

test('withoutMissingWidgetViews leaves out every view without state', () => {
  const result = withoutMissingWidgetViews(notebook([view('abc')]), null);
  assert.deepEqual((result.cells[1] as any).outputs[0].data, {
    'text/plain': 'IntSlider(abc)'
  });
});

test('widgetModuleUrl finds modules on the CDN like requireLoader', () => {
  const cdn = 'https://cdn.jsdelivr.net/npm/';
  assert.equal(
    widgetModuleUrl('bqplot', '^0.6.1'),
    `${cdn}bqplot@^0.6.1/dist/index`
  );
  assert.equal(
    widgetModuleUrl('jupyter-leaflet', '^0.19'),
    `${cdn}jupyter-leaflet@^0.19/dist/index`
  );
  assert.equal(
    widgetModuleUrl('pkg/sub/file', '1.0.0'),
    `${cdn}pkg@1.0.0/dist/sub/file`
  );
  assert.equal(
    widgetModuleUrl('@scope/pkg', '~1.2'),
    `${cdn}@scope/pkg@~1.2/dist/index`
  );
  assert.equal(
    widgetModuleUrl('@scope/pkg/file', '1'),
    `${cdn}@scope/pkg@1/dist/file`
  );
});
