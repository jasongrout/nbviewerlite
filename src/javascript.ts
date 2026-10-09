import { RenderedJavaScript } from '@jupyterlab/rendermime';
import type { IRenderMime } from '@jupyterlab/rendermime-interfaces';

/**
 * Run JavaScript outputs of trusted cells the way nbconvert's lab template
 * (and so nbviewer.org) does: as an inline script that runs once the output
 * is in the page, in document order with the scripts of HTML outputs, with
 * `element` bound to the output's DOM node.
 *
 * Classic-notebook outputs used `element` as a jQuery object; for them, the
 * node also gets jQuery's methods under names it doesn't already have
 * (`html`, `css`, `width`, ...). DOM names keep their DOM meaning.
 */
class ClassicRenderedJavaScript extends RenderedJavaScript {
  async render(model: IRenderMime.IMimeModel): Promise<void> {
    if (!model.trusted) {
      return super.render(model);
    }
    const code = model.data[this.mimeType];
    if (typeof code !== 'string' || !code) {
      return;
    }
    addJQueryMethods(this.node);
    const script = document.createElement('script');
    script.textContent = `(function (element) {
try {
${code}
} catch (err) {
  var pre = document.createElement('pre');
  pre.textContent = 'Javascript Error: ' + (err && err.message);
  element.appendChild(pre);
  console.error(err);
}
}).call(window, document.currentScript.parentNode);`;
    this.node.appendChild(script);
  }
}

function addJQueryMethods(node: HTMLElement): void {
  const jQuery = (window as any).jQuery;
  if (!jQuery) {
    return;
  }
  const wrapped = jQuery(node);
  for (const name of Object.keys(jQuery.fn)) {
    if (!(name in node) && typeof wrapped[name] === 'function') {
      (node as any)[name] = wrapped[name].bind(wrapped);
    }
  }
}

export const javaScriptRendererFactory: IRenderMime.IRendererFactory = {
  safe: false,
  mimeTypes: ['text/javascript', 'application/javascript'],
  createRenderer: options => new ClassicRenderedJavaScript(options)
};
