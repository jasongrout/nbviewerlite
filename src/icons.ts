/**
 * JupyterLab's icon artwork, inlined as SVG (without pulling in
 * @jupyterlab/ui-components' React-based code).
 */

import caretDown from '@jupyterlab/ui-components/style/icons/arrow/caret-down.svg';
import caretUp from '@jupyterlab/ui-components/style/icons/arrow/caret-up.svg';
import file from '@jupyterlab/ui-components/style/icons/filetype/file.svg';
import folder from '@jupyterlab/ui-components/style/icons/filetype/folder.svg';
import notebook from '@jupyterlab/ui-components/style/icons/filetype/notebook.svg';
import kernel from '@jupyterlab/ui-components/style/icons/statusbar/kernel.svg';
import code from '@jupyterlab/ui-components/style/icons/toolbar/code.svg';
import download from '@jupyterlab/ui-components/style/icons/toolbar/download.svg';
import launch from '@jupyterlab/ui-components/style/icons/toolbar/launch.svg';
import run from '@jupyterlab/ui-components/style/icons/toolbar/run.svg';

const ICONS = {
  caretDown,
  caretUp,
  code,
  download,
  file,
  folder,
  kernel,
  launch,
  notebook,
  run
};

export type IconName = keyof typeof ICONS;

export function icon(name: IconName): HTMLElement {
  const span = document.createElement('span');
  span.className = 'nbv-icon';
  span.setAttribute('aria-hidden', 'true');
  // our own bundled SVG files, not remote content
  span.innerHTML = ICONS[name];
  return span;
}
