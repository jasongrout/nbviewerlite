/**
 * format/script/: the notebook as a script, which nbviewer serves as plain
 * text. Shown highlighted, with a link to download it.
 */

import {
  CodeMirrorMimeTypeService,
  EditorLanguageRegistry,
  jupyterHighlightStyle
} from '@jupyterlab/codemirror';
import type * as nbformat from '@jupyterlab/nbformat';

import { addHeaderLink, h } from './page.ts';
import { notebookToScript, scriptFilename } from './script.ts';

import '@jupyterlab/theme-light-extension/style/variables.css';
import './script-view.css';

export async function showScript(
  nb: nbformat.INotebookContent,
  root: HTMLElement,
  before: Node[],
  notebookName: string
): Promise<void> {
  const script = notebookToScript(nb);
  const blob = new Blob([script.text], { type: 'text/plain;charset=utf-8' });
  addHeaderLink(
    URL.createObjectURL(blob),
    'Download Script',
    'download',
    scriptFilename(notebookName, script.extension)
  );

  const code = h('code', {}, script.text);
  root.replaceChildren(...before, h('pre', { class: 'nbv-script' }, code));

  // Highlight like JupyterLab's code cells: its CodeMirror languages, theme
  // colors and highlight style, without an editor.
  const languages = new EditorLanguageRegistry();
  for (const language of EditorLanguageRegistry.getDefaultLanguages()) {
    languages.addLanguage(language);
  }
  const mime = new CodeMirrorMimeTypeService(languages).getMimeTypeByLanguage(
    script.python
      ? { name: 'python' }
      : (nb.metadata.language_info ?? { name: '' })
  );
  const styles = jupyterHighlightStyle.module?.getRules();
  if (styles) {
    document.head.append(h('style', {}, styles));
  }
  const highlighted = h('code');
  await languages.highlight(
    script.text,
    languages.findByMIME(mime),
    highlighted
  );
  code.replaceWith(highlighted);
}
