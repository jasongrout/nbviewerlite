import {
  CodeMirrorEditorFactory,
  CodeMirrorMimeTypeService,
  EditorExtensionRegistry,
  EditorLanguageRegistry,
  EditorThemeRegistry,
  ybinding
} from '@jupyterlab/codemirror';
import { createMarkdownParser } from '@jupyterlab/markedparser-extension';
import { MathJaxTypesetter } from '@jupyterlab/mathjax-extension';
import type * as nbformat from '@jupyterlab/nbformat';
import { NotebookModel, StaticNotebook } from '@jupyterlab/notebook';
import {
  RenderMimeRegistry,
  standardRendererFactories
} from '@jupyterlab/rendermime';
import type { IRenderMime } from '@jupyterlab/rendermime-interfaces';
import { Widget } from '@lumino/widgets';

import { javaScriptRendererFactory } from './javascript.ts';

import '@jupyterlab/theme-light-extension/style/variables.css';
import '@jupyterlab/notebook/style/index.js';
import '@jupyterlab/mathjax-extension/style/index.js';
import './style.css';

function createEditorServices() {
  const languages = new EditorLanguageRegistry();
  for (const language of EditorLanguageRegistry.getDefaultLanguages()) {
    languages.addLanguage(language);
  }

  const themes = new EditorThemeRegistry();
  for (const theme of EditorThemeRegistry.getDefaultThemes()) {
    themes.addTheme(theme);
  }
  const extensions = new EditorExtensionRegistry();
  for (const factory of EditorExtensionRegistry.getDefaultExtensions({
    themes
  })) {
    extensions.addExtension(factory);
  }
  // Bind each editor to its cell's shared model, as JupyterLab does
  // (without undo: everything is read-only).
  extensions.addExtension({
    name: 'shared-model-binding',
    factory: options => {
      const sharedModel = options.model.sharedModel as any;
      return EditorExtensionRegistry.createImmutableExtension(
        ybinding({ ytext: sharedModel.ysource })
      );
    }
  });

  const factory = new CodeMirrorEditorFactory({ extensions, languages });
  return {
    languages,
    editorFactory: factory.newInlineEditor,
    mimeTypeService: new CodeMirrorMimeTypeService(languages)
  };
}

/**
 * Mark code cells trusted, so their outputs render as they do in v1
 * (nbconvert passes HTML and JavaScript outputs through unchanged).
 */
function trustCells(nb: nbformat.INotebookContent): nbformat.INotebookContent {
  return {
    ...nb,
    cells: nb.cells.map(cell =>
      cell.cell_type === 'code'
        ? { ...cell, metadata: { ...cell.metadata, trusted: true } }
        : cell
    )
  };
}

/**
 * Render a notebook into `host` with JupyterLab's notebook widget.
 */
export function renderNotebook(
  nb: nbformat.INotebookContent,
  host: HTMLElement,
  resolver: IRenderMime.IResolver
): StaticNotebook {
  const { languages, editorFactory, mimeTypeService } = createEditorServices();

  const rendermime = new RenderMimeRegistry({
    initialFactories: standardRendererFactories,
    latexTypesetter: new MathJaxTypesetter(),
    markdownParser: createMarkdownParser(languages),
    resolver
  });
  rendermime.addFactory(javaScriptRendererFactory, 0);

  const readOnly = { readOnly: true };
  const notebook = new StaticNotebook({
    rendermime,
    contentFactory: new StaticNotebook.ContentFactory({ editorFactory }),
    mimeTypeService,
    editorConfig: {
      code: { ...StaticNotebook.defaultEditorConfig.code, ...readOnly },
      markdown: { ...StaticNotebook.defaultEditorConfig.markdown, ...readOnly },
      raw: { ...StaticNotebook.defaultEditorConfig.raw, ...readOnly }
    },
    notebookConfig: {
      ...StaticNotebook.defaultNotebookConfig,
      maxNumberOutputs: Infinity,
      scrollPastEnd: false,
      showEditorForReadOnlyMarkdown: false,
      // lay out every cell, so fragment links land where they should
      windowingMode: 'none'
    }
  });

  // One undo manager for the document instead of one per cell: yjs warns
  // about the per-cell ones while cells are created from JSON.
  const model = new NotebookModel({ disableDocumentWideUndoRedo: false });
  model.fromJSON(trustCells(nb));
  notebook.model = model;
  for (const cell of notebook.widgets) {
    cell.readOnly = true;
  }

  Widget.attach(notebook, host);
  return notebook;
}
