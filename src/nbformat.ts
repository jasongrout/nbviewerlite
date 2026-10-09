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

function isLines(value: unknown): value is string[] {
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
 * Join multi-line strings stored as lists of lines.
 * A port of nbformat.v4.rwbase.rejoin_lines.
 */
export function rejoinLines(nb: any): any {
  return {
    ...nb,
    cells: nb.cells.map((cell: any) => {
      const result = { ...cell };
      if (isLines(cell.source)) {
        result.source = cell.source.join('');
      }
      if (cell.attachments) {
        result.attachments = Object.fromEntries(
          Object.entries(cell.attachments).map(([name, bundle]) => [
            name,
            rejoinMimeBundle(bundle as MimeBundle)
          ])
        );
      }
      if (cell.cell_type === 'code' && Array.isArray(cell.outputs)) {
        result.outputs = cell.outputs.map((output: any) => {
          if (
            (output.output_type === 'execute_result' ||
              output.output_type === 'display_data') &&
            output.data
          ) {
            return { ...output, data: rejoinMimeBundle(output.data) };
          }
          if (isLines(output.text)) {
            return { ...output, text: output.text.join('') };
          }
          return output;
        });
      }
      return result;
    })
  };
}
