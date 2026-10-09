/**
 * ipywidgets' HTML manager, which renders widgets from saved state without a
 * kernel, as the embed script does on nbviewer.org. A separate chunk with
 * the widget libraries and their CSS, loaded for notebooks with widgets.
 */

import * as base from '@jupyter-widgets/base';
import * as controls from '@jupyter-widgets/controls';
import { DescriptionView as DescriptionView7 } from '@jupyter-widgets/controls7';
// Not the package's index, which adds the embed script and its JSON schema
// validator (ajv). The manager loads the controls' CSS with the controls.
import { HTMLManager } from '@jupyter-widgets/html-manager/lib/htmlmanager';
import type { RenderMimeRegistry } from '@jupyterlab/rendermime';
import { Widget } from '@lumino/widgets';

import {
  hasWidgetModel,
  type IWidgetState,
  widgetModuleUrl
} from './widget-state.ts';

// Icons in buttons and other controls ('fa fa-check'), as the embed script
// loads them. JupyterLab's application CSS, already on the page, has them
// too.
import '@fortawesome/fontawesome-free/css/all.min.css';
import '@fortawesome/fontawesome-free/css/v4-shims.min.css';
import './widgets.css';

// Third-party widget modules are AMD modules that require these by name;
// embed-amd.js defines them the same way.
(window as any).define?.('@jupyter-widgets/base', [], () => base);
(window as any).define?.('@jupyter-widgets/controls', [], () => controls);

// ipywidgets 7 controls typeset LaTeX in descriptions with MathJax 2, and
// take the page's MathJax 3 global for it (MathJax.Hub is undefined). Have
// them use the notebook's typesetter, as ipywidgets 8 controls do.
DescriptionView7.prototype.typeset = function (element, text) {
  void this.displayed.then(() => {
    if (text !== undefined) {
      element.textContent = text;
    }
    const manager = this.model.widget_manager as unknown as WidgetManager;
    manager._rendermime.latexTypesetter?.typeset(element);
  });
};

/**
 * Load a third-party widget module (bqplot, ipyleaflet, ...) from the CDN
 * with the page's RequireJS, as embed-amd.js does. Not with html-manager's
 * requireLoader: that first asks for the module next to the page, which our
 * rewrites answer with index.html rather than a 404, so it never gets to the
 * CDN.
 */
function loadModule(moduleName: string, moduleVersion: string): Promise<any> {
  const url = widgetModuleUrl(moduleName, moduleVersion);
  const requirejs = (window as any).requirejs;
  return new Promise((resolve, reject) => {
    requirejs.config({ paths: { [moduleName]: url } });
    requirejs([moduleName], resolve, (error: any) => {
      // Errors thrown by the module itself say more than this would.
      const failedToLoad = ['scripterror', 'timeout', 'nodefine'];
      reject(
        failedToLoad.includes(error?.requireType)
          ? new Error(
              `Could not load ${moduleName} ${moduleVersion} from ${url}.js`
            )
          : error
      );
    });
  });
}

/** Turn a widget view into a message saying why it can't be shown. */
function showError(el: HTMLElement, msg: string, error: unknown): void {
  el.onclick = el.ondblclick = null;
  el.classList.add('nbv-widget-error');
  el.textContent = `${msg}\n${error instanceof Error ? error.message : error}`;
}

/** One per notebook, with the notebook's saved widget state. */
export class WidgetManager extends HTMLManager {
  /**
   * The controls typeset LaTeX in descriptions with this one's typesetter,
   * as in JupyterLab. Without it, they call MathJax 2, which isn't here.
   */
  readonly _rendermime: RenderMimeRegistry;
  private readonly savedState: IWidgetState;

  constructor(state: IWidgetState, rendermime: RenderMimeRegistry) {
    super({ loader: loadModule });
    this.savedState = state;
    // Output widgets render their outputs like the notebook does.
    this.renderMime = rendermime;
    this._rendermime = rendermime;
    // Not awaited: each view waits for its own models (get_model), so the
    // controls don't wait for a third-party module elsewhere to load.
    this.set_state(state as Parameters<HTMLManager['set_state']>[0]).catch(
      error => console.error('Could not load the widget state:', error)
    );
  }

  /** The view for a widget-view output's data, or why there is none. */
  async createWidget(data: unknown): Promise<Widget> {
    if (!hasWidgetModel(this.savedState, data)) {
      // In an Output widget: the notebook's own outputs leave these out.
      const widget = new Widget();
      widget.addClass('nbv-widget-error');
      widget.node.textContent =
        'Could not display this widget: its state was not saved with the ' +
        'notebook.';
      return widget;
    }
    const { model_id } = data as { model_id: string };
    const model = await this.get_model(model_id);
    const view = await this.create_view<base.DOMWidgetView>(
      model as base.DOMWidgetModel
    );
    // ipywidgets 7 views have pWidget
    return view.luminoWidget || view.pWidget;
  }

  /**
   * Widgets that can't be shown (a third-party module that didn't load, a
   * view that threw) say why, where html-manager's error view says "Click
   * to show javascript error". Their error models carry the message and the
   * error.
   */
  async create_view<VT extends base.WidgetView = base.WidgetView>(
    model: base.WidgetModel,
    options?: any
  ): Promise<VT> {
    const view = await super.create_view<VT>(model, options);
    if (view instanceof base.ErrorWidgetView) {
      showError(view.el, view.model.get('msg'), view.model.get('error'));
    }
    return view;
  }

  protected async loadViewClass(
    className: string,
    moduleName: string,
    moduleVersion: string
  ): Promise<typeof base.WidgetView> {
    try {
      return (await this.loadClass(
        className,
        moduleName,
        moduleVersion
      )) as typeof base.WidgetView;
    } catch (error) {
      // The model is fine, so the message goes into the view instead.
      console.error(error);
      const msg = `Failed to load view class '${className}' from module '${moduleName}'`;
      return class extends base.DOMWidgetView {
        render(): void {
          showError(this.el, msg, error);
        }
      };
    }
  }
}
