import { EditorView } from '@codemirror/view';
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
import jsonExtensions from '@jupyterlab/json-extension';
import { createMarkdownParser } from '@jupyterlab/markedparser-extension';
import { MathJaxTypesetter } from '@jupyterlab/mathjax-extension';
import {
  MermaidManager,
  MermaidMarkdown,
  RenderedMermaid,
  rendererFactory as mermaidRendererFactory
} from '@jupyterlab/mermaid';
import type * as nbformat from '@jupyterlab/nbformat';
import { NotebookModel, StaticNotebook } from '@jupyterlab/notebook';
import pdfExtensions from '@jupyterlab/pdf-extension';
import {
  RenderMimeRegistry,
  standardRendererFactories
} from '@jupyterlab/rendermime';
import type { IRenderMime } from '@jupyterlab/rendermime-interfaces';
import vegaExtension from '@jupyterlab/vega5-extension';
import { Widget } from '@lumino/widgets';

import { javaScriptRendererFactory } from './javascript.ts';
import { withoutViewState } from './nbformat.ts';
import { savedWidgetState, withoutMissingWidgetViews } from './widget-state.ts';
import { widgetRendererFactory } from './widgets.ts';

import '@jupyterlab/theme-light-extension/style/variables.css';
import '@jupyterlab/notebook/style/index.js';
import '@jupyterlab/mathjax-extension/style/index.js';
import '@jupyterlab/json-extension/style/index.js';
import '@jupyterlab/pdf-extension/style/index.js';
import '@jupyterlab/vega5-extension/style/index.js';
import '@jupyterlab/mermaid/style/index.js';
import './style.css';

/**
 * The mime renderers JupyterLab adds through extensions: JSON (and JSON
 * Lines), PDF, Vega 5 and Vega-Lite 3 to 5, and Mermaid. Their libraries
 * (vega-embed, mermaid, the JSON tree) load only when a notebook needs them.
 */
const mimeExtensions: IRenderMime.IExtension[] = [
  // each package exports an extension or a list of them
  jsonExtensions,
  pdfExtensions,
  vegaExtension,
  // What @jupyterlab/mermaid-extension registers ("one more than markdown").
  // That package's other plugins need a JupyterLab application.
  {
    id: '@jupyterlab/mermaid-extension:factory',
    rendererFactory: mermaidRendererFactory,
    rank: 61
  }
].flat();

// One Mermaid manager for text/vnd.mermaid outputs and ```mermaid blocks in
// markdown, as JupyterLab's mermaid-extension sets up. Without a theme
// manager, it uses Mermaid's default (light) theme.
const mermaidManager = new MermaidManager();
RenderedMermaid.manager = mermaidManager;

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
  // Read-only editors are still contenteditable, so a click in code would
  // put the focus there and keys would move a caret instead of scrolling the
  // page or changing slides. Code is static text on nbviewer.org; here it
  // stays selectable, but can't take the focus.
  extensions.addExtension({
    name: 'not-editable',
    factory: () =>
      EditorExtensionRegistry.createImmutableExtension(
        EditorView.editable.of(false)
      )
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
    markdownParser: createMarkdownParser(languages, {
      blocks: [new MermaidMarkdown({ mermaid: mermaidManager })]
    }),
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
  // With the extensions' ranks, or else the factories' own, as JupyterLab does
  for (const { rendererFactory, rank } of mimeExtensions) {
    rendermime.addFactory(rendererFactory, rank);
  }
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
  model.fromJSON(
    trustCells(withoutViewState(withoutMissingWidgetViews(nb, widgetState)))
  );
  if (!model.getMetadata('language_info')?.name) {
    // Highlight code as Python when the notebook doesn't name its language
    // (nbformat 3 notebooks never do; the model then has an empty name), as
    // nbconvert does: its default lexer is ipython3.
    model.setMetadata('language_info', {
      name: 'python',
      codemirror_mode: { name: 'ipython', version: 3 }
    });
  }
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
