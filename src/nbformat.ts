/**
 * Notebook JSON normalization that jupyter_server does before JupyterLab
 * sees a notebook, and that we therefore have to do ourselves.
 */

type MimeBundle = Record<string, unknown>;

function isJsonMime(mime: string): boolean {
  return (
    mime === 'application/json' ||
    (mime.startsWith('application/') && mime.endsWith('+json'))
  );
}

export function isLines(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(line => typeof line === 'string');
}

function rejoinMimeBundle(data: MimeBundle): MimeBundle {
  const result: MimeBundle = {};
  for (const [mime, value] of Object.entries(data)) {
    result[mime] = !isJsonMime(mime) && isLines(value) ? value.join('') : value;
  }
  return result;
}

/**
 * Normalize notebook JSON the way nbformat.reads does for jupyter_server:
 * join multi-line strings stored as lists of lines (rejoin_lines), drop
 * transient metadata (strip_transient; JupyterLab shows a "Notebook
 * converted" dialog when orig_nbformat is set), and fill in fields that
 * JupyterLab expects but sloppy notebooks leave out.
 */
export function normalizeNotebook(nb: any): any {
  const {
    orig_nbformat: _orig,
    orig_nbformat_minor: _origMinor,
    signature: _signature,
    ...metadata
  } = nb.metadata ?? {};
  return {
    ...nb,
    metadata,
    cells: nb.cells.map((cell: any) => {
      const result = { ...cell, metadata: cell.metadata ?? {} };
      if (isLines(cell.source)) {
        result.source = cell.source.join('');
      } else if (typeof cell.source !== 'string') {
        result.source = '';
      }
      if (cell.attachments) {
        result.attachments = Object.fromEntries(
          Object.entries(cell.attachments).map(([name, bundle]) => [
            name,
            rejoinMimeBundle(bundle as MimeBundle)
          ])
        );
      }
      if (cell.cell_type === 'code') {
        result.outputs = (Array.isArray(cell.outputs) ? cell.outputs : []).map(
          (output: any) => {
            if (
              output.output_type === 'execute_result' ||
              output.output_type === 'display_data'
            ) {
              return {
                ...output,
                data: rejoinMimeBundle(output.data ?? {}),
                metadata: output.metadata ?? {}
              };
            }
            if (output.output_type === 'stream') {
              return {
                ...output,
                text: isLines(output.text)
                  ? output.text.join('')
                  : (output.text ?? '')
              };
            }
            return output;
          }
        );
      }
      return result;
    })
  };
}

/**
 * Drop the view state that JupyterLab honors but nbconvert's lab template,
 * and so nbviewer.org, ignores: hidden inputs and outputs (collapsed,
 * jupyter.source_hidden, jupyter.outputs_hidden), scrolled outputs, and
 * collapsed headings. A viewer shows everything.
 */
export function withoutViewState(nb: any): any {
  return {
    ...nb,
    cells: nb.cells.map((cell: any) => {
      const {
        collapsed: _collapsed,
        scrolled: _scrolled,
        heading_collapsed: _headingCollapsed,
        jupyter,
        ...metadata
      } = cell.metadata ?? {};
      if (jupyter && typeof jupyter === 'object') {
        const {
          source_hidden: _sourceHidden,
          outputs_hidden: _outputsHidden,
          ...rest
        } = jupyter;
        if (Object.keys(rest).length) {
          metadata.jupyter = rest;
        }
      }
      return { ...cell, metadata };
    })
  };
}
