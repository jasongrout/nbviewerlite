/**
 * Code highlighting that the notebook view (render.ts) and the script view
 * share; a module of its own, so neither view's chunk includes the other.
 */

import { EditorLanguageRegistry } from '@jupyterlab/codemirror';
import type * as nbformat from '@jupyterlab/nbformat';

/** JupyterLab's CodeMirror languages. */
export function defaultLanguages(): EditorLanguageRegistry {
  const languages = new EditorLanguageRegistry();
  for (const language of EditorLanguageRegistry.getDefaultLanguages()) {
    languages.addLanguage(language);
  }
  return languages;
}

/**
 * The language to highlight a notebook's code as: its own, or Python when
 * it doesn't name one (nbformat 3 notebooks never do), as nbconvert does:
 * its default lexer is ipython3.
 */
export function codeLanguage(
  info: nbformat.ILanguageInfoMetadata | undefined
): nbformat.ILanguageInfoMetadata {
  return info?.name
    ? info
    : { name: 'python', codemirror_mode: { name: 'ipython', version: 3 } };
}
