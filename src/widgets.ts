import type { RenderMimeRegistry } from '@jupyterlab/rendermime';
import type { IRenderMime } from '@jupyterlab/rendermime-interfaces';
import { type Message, MessageLoop } from '@lumino/messaging';
import { Panel, Widget } from '@lumino/widgets';

import type { WidgetManager } from './widget-manager.ts';
import { type IWidgetState, WIDGET_VIEW_MIMETYPE } from './widget-state.ts';

/**
 * Renders widget-view outputs from the notebook's saved widget state, like
 * the embed script that nbconvert's lab template loads on nbviewer.org.
 */
class RenderedWidget extends Panel implements IRenderMime.IRenderer {
  readonly mimeType: string;
  private readonly manager: () => Promise<WidgetManager>;

  constructor(
    options: IRenderMime.IRendererOptions,
    manager: () => Promise<WidgetManager>
  ) {
    super();
    this.mimeType = options.mimeType;
    this.manager = manager;
  }

  async renderModel(model: IRenderMime.IMimeModel): Promise<void> {
    const manager = await this.manager();
    this.addWidget(await manager.createWidget(model.data[this.mimeType]));
  }

  handleEvent(): void {
    // Widgets (bqplot, ipyleaflet, ...) relayout on resize messages, which
    // nothing else sends here; html-manager sends them on window resizes.
    MessageLoop.postMessage(this, Widget.ResizeMessage.UnknownSize);
  }

  protected onAfterAttach(msg: Message): void {
    super.onAfterAttach(msg);
    window.addEventListener('resize', this);
  }

  protected onBeforeDetach(msg: Message): void {
    window.removeEventListener('resize', this);
    super.onBeforeDetach(msg);
  }
}

/**
 * A renderer factory for widget-view outputs, with one widget manager for
 * the notebook, holding its saved state. The manager and the widget
 * libraries are a separate chunk, loaded when the first widget renders.
 * Widgets in Output widgets render with `rendermime`, like other outputs.
 */
export function widgetRendererFactory(
  state: IWidgetState,
  rendermime: RenderMimeRegistry
): IRenderMime.IRendererFactory {
  let manager: Promise<WidgetManager> | null = null;
  const getManager = () =>
    (manager ??= import(
      /* webpackChunkName: "widgets" */ './widget-manager.ts'
    ).then(module => new module.WidgetManager(state, rendermime)));
  return {
    safe: false,
    mimeTypes: [WIDGET_VIEW_MIMETYPE],
    createRenderer: options => new RenderedWidget(options, getManager)
  };
}
