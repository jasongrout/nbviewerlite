import { Sanitizer } from '@jupyterlab/apputils';
import { MarkdownCell } from '@jupyterlab/cells';
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
import { savedWidgetState, withoutMissingWidgetViews } from './widget-state.ts';
import { widgetRendererFactory } from './widgets.ts';

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
 * Mark code cells trusted, so their outputs render as they do on nbviewer.org
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

/** Empty markdown cells show nothing, not JupyterLab's "Type Markdown" box. */
class ContentFactory extends StaticNotebook.ContentFactory {
  createMarkdownCell(options: MarkdownCell.IOptions): MarkdownCell {
    return super.createMarkdownCell({ ...options, emptyPlaceholder: '' });
  }
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

  // Keep id and name attributes in markdown, so links to <a name=...>
  // anchors work as on nbviewer.org (which doesn't sanitize at all).
  const sanitizer = new Sanitizer();
  sanitizer.setAllowNamedProperties(true);

  const rendermime = new RenderMimeRegistry({
    initialFactories: standardRendererFactories,
    latexTypesetter: new MathJaxTypesetter(),
    markdownParser: createMarkdownParser(languages),
    resolver,
    sanitizer,
    linkHandler: {
      // Relative links (other notebooks, files) open in the same tab, as on
      // nbviewer.org; JupyterLab would open them in a new one.
      handleLink(node: HTMLElement) {
        (node as HTMLAnchorElement).target = '_self';
      }
    }
  });
  rendermime.addFactory(javaScriptRendererFactory, 0);
  // ipywidgets, from the state saved in the notebook; preferred over the
  // other MIME types, as in JupyterLab and nbconvert.
  const widgetState = savedWidgetState(nb.metadata);
  if (widgetState) {
    rendermime.addFactory(widgetRendererFactory(widgetState, rendermime), -10);
  }

  const readOnly = { readOnly: true };
  const notebook = new StaticNotebook({
    rendermime,
    contentFactory: new ContentFactory({ editorFactory }),
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
  model.fromJSON(trustCells(withoutMissingWidgetViews(nb, widgetState)));
  notebook.model = model;
  for (const cell of notebook.widgets) {
    cell.readOnly = true;
    if (cell instanceof MarkdownCell) {
      cell.rendered = true;
    }
  }

  Widget.attach(notebook, host);
  return notebook;
}
