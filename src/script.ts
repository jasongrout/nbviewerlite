/**
 * The notebook as a script, as nbconvert's ScriptExporter writes it, which
 * is what nbviewer serves at format/script/ (nbconvert/exporters/script.py
 * with the python/ and script/ templates).
 */

import type * as nbformat from '@jupyterlab/nbformat';

import { ipython2python } from './ipython.ts';

export interface IScript {
  text: string;
  /** File extension, with the dot. */
  extension: string;
  /** Whether nbconvert's Python exporter wrote it (else the generic one). */
  python: boolean;
}

/** Python's comment_lines filter. */
function commentLines(text: string): string {
  return '# ' + text.split('\n').join('\n# ');
}

export function notebookToScript(nb: nbformat.INotebookContent): IScript {
  const info: Partial<nbformat.ILanguageInfoMetadata> =
    nb.metadata?.language_info ?? {};
  // ScriptExporter hands notebooks that name nbconvert's Python exporter to
  // it. Other exporters named there are left out: the generic template.
  const python = info.nbconvert_exporter === 'python';
  const extension = python ? '.py' : (info.file_extension ?? '.txt');
  const mimetype = python ? 'text/x-python' : (info.mimetype ?? 'text/plain');
  // raw cells for this kind of file (TemplateExporter.raw_mimetypes)
  const rawMimetypes = [mimetype, ''];

  let text = python ? '#!/usr/bin/env python\n# coding: utf-8\n' : '';
  for (const cell of nb.cells) {
    const source = cell.source as string;
    if ((cell.metadata?.transient as any)?.remove_source) {
      continue;
    }
    if (cell.cell_type === 'code') {
      text += python
        ? `\n# In[${cell.execution_count || ' '}]:\n\n\n${ipython2python(source)}\n`
        : `\n${source}\n`;
    } else if (cell.cell_type === 'markdown' && python) {
      text += `\n${commentLines(source)}\n`;
    } else if (cell.cell_type === 'raw') {
      const rawMimetype = String(cell.metadata?.raw_mimetype ?? '');
      if (rawMimetypes.includes(rawMimetype.toLowerCase())) {
        text += source;
      }
    }
  }
  return { text: text.replace(/^[\r\n]+/, ''), extension, python };
}

/** The script's file name: the notebook's, with the script's extension. */
export function scriptFilename(
  notebookName: string,
  extension: string
): string {
  const base = notebookName.replace(/\.ipynb$/i, '') || 'notebook';
  return base + (extension.startsWith('.') ? extension : '.' + extension);
}
