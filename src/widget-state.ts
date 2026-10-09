/**
 * ipywidgets in saved notebooks: the widget state that Jupyter stores in the
 * notebook's metadata, and the widget-view outputs that refer to it.
 */

import type * as nbformat from '@jupyterlab/nbformat';

export const WIDGET_VIEW_MIMETYPE = 'application/vnd.jupyter.widget-view+json';
export const WIDGET_STATE_MIMETYPE =
  'application/vnd.jupyter.widget-state+json';

/** Where third-party widget modules load from, as in html-manager. */
const WIDGET_CDN = 'https://cdn.jsdelivr.net/npm/';

/** Saved widget state (application/vnd.jupyter.widget-state+json). */
export interface IWidgetState {
  version_major: number;
  version_minor: number;
  /** Model states by model id. */
  state: Record<string, unknown>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The widget state saved in a notebook's metadata, or null. Only version 2
 * (ipywidgets 7 and 8): version 1 needs the old jupyter-js-widgets, which
 * nbconvert loads for it and we don't have.
 */
export function savedWidgetState(
  metadata: nbformat.INotebookMetadata | undefined
): IWidgetState | null {
  const widgets = metadata?.widgets;
  const state = isObject(widgets) ? widgets[WIDGET_STATE_MIMETYPE] : null;
  return isObject(state) && state.version_major === 2 && isObject(state.state)
    ? (state as unknown as IWidgetState)
    : null;
}

/** Whether `state` has the model a widget-view output refers to. */
export function hasWidgetModel(
  state: IWidgetState | null,
  view: unknown
): boolean {
  const id = isObject(view) ? view.model_id : null;
  return (
    typeof id === 'string' &&
    state !== null &&
    Object.prototype.hasOwnProperty.call(state.state, id)
  );
}

/**
 * Leave out widget views whose model isn't in the saved state (all of them
 * when nothing was saved), so their outputs show the next MIME type, usually
 * text/plain such as "IntSlider(value=3)", as nbconvert (and so nbviewer.org)
 * does. Without a kernel, JupyterLab shows "Loading widget..." instead.
 */
export function withoutMissingWidgetViews(
  nb: nbformat.INotebookContent,
  state: IWidgetState | null
): nbformat.INotebookContent {
  const isMissing = (output: nbformat.IOutput) =>
    isObject(output.data) &&
    WIDGET_VIEW_MIMETYPE in output.data &&
    !hasWidgetModel(state, output.data[WIDGET_VIEW_MIMETYPE]);
  return {
    ...nb,
    cells: nb.cells.map(cell => {
      const outputs = cell.outputs as nbformat.IOutput[] | undefined;
      if (cell.cell_type !== 'code' || !outputs?.some(isMissing)) {
        return cell;
      }
      return {
        ...cell,
        outputs: outputs.map(output => {
          if (!isMissing(output)) {
            return output;
          }
          const { [WIDGET_VIEW_MIMETYPE]: _view, ...data } =
            output.data as nbformat.IMimeBundle;
          return { ...output, data };
        })
      };
    })
  };
}

/**
 * Where html-manager's requireLoader finds a third-party widget module on the
 * CDN: the package's dist/index, or dist/{file} for a module name like
 * 'package/file' or '@scope/package/file'. Without the .js that RequireJS
 * adds.
 */
export function widgetModuleUrl(
  moduleName: string,
  moduleVersion: string
): string {
  const parts = moduleName.split('/');
  const packageLength = moduleName.startsWith('@') ? 2 : 1;
  const packageName = parts.slice(0, packageLength).join('/');
  const file = parts.slice(packageLength).join('/') || 'index';
  return `${WIDGET_CDN}${packageName}@${moduleVersion}/dist/${file}`;
}
