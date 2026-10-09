/**
 * Upgrade of nbformat 1, 2 and 3 notebooks to nbformat 4, ported from Python
 * nbformat: what nbformat.reads(text, as_version=4) does for nbviewer.org
 * (each version's JSON reader, then v1 to v2, v2 to v3 and v3 to v4).
 *
 * Python's converters fail on some malformed notebooks; this port fills in
 * missing fields instead, as normalizeNotebook does for nbformat 4.
 */

import { isLines } from './nbformat.ts';

type Join = (lines: string[]) => string;

/**
 * nbformat 3 stores multi-line strings as lists of lines from
 * splitlines(True), or, in some old files, splitlines() (v3's _join_lines).
 */
const joinV3Lines: Join = lines =>
  lines.length > 0 && /[\n\r]$/.test(lines[0])
    ? lines.join('')
    : lines.join('\n');

/** nbformat 2 always used splitlines(). */
const joinV2Lines: Join = lines => lines.join('\n');

/** Output keys that v2 and v3 store as lists of lines. */
const multilineOutputKeys = [
  'text',
  'html',
  'svg',
  'latex',
  'javascript',
  'json'
];

/** Python's str.splitlines(): lines without their line breaks. */
function splitLines(text: string): string[] {
  const lines = text.split(/\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/);
  if (lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines;
}

function rejoinKeys(obj: any, keys: string[], join: Join): any {
  const result = { ...obj };
  for (const key of keys) {
    if (isLines(obj[key])) {
      result[key] = join(obj[key]);
    }
  }
  return result;
}

/** The v2 and v3 JSON readers' rejoin_lines. */
function rejoinLines(nb: any, join: Join): any {
  if (!Array.isArray(nb.worksheets)) {
    throw new Error('no worksheets');
  }
  return {
    ...nb,
    worksheets: nb.worksheets.map((ws: any) => ({
      ...ws,
      cells: ws.cells.map((cell: any) => {
        if (cell.cell_type !== 'code') {
          return rejoinKeys(cell, ['source', 'rendered'], join);
        }
        const result = rejoinKeys(cell, ['input'], join);
        if (Array.isArray(cell.outputs)) {
          result.outputs = cell.outputs.map((output: any) =>
            rejoinKeys(output, multilineOutputKeys, join)
          );
        }
        return result;
      })
    }))
  };
}

/** nbformat.v2.convert.upgrade */
function v1ToV2(nb: any): any {
  if (!Array.isArray(nb.cells)) {
    throw new Error('no cells');
  }
  const cells = nb.cells.flatMap((cell: any) => {
    if (cell.cell_type === 'code') {
      return [
        {
          cell_type: 'code',
          language: 'python',
          ...(cell.code != null && { input: cell.code }),
          ...(cell.prompt_number != null && {
            prompt_number: cell.prompt_number
          }),
          outputs: [],
          collapsed: false
        }
      ];
    }
    if (cell.cell_type === 'text') {
      return [
        {
          cell_type: 'markdown',
          ...(cell.text != null && { source: cell.text })
        }
      ];
    }
    return [];
  });
  return { nbformat: 2, metadata: {}, worksheets: [{ cells }] };
}

/**
 * nbformat.v3.convert.upgrade, which also gives every cell metadata; v3ToV4
 * does that too.
 */
function v2ToV3(nb: any): any {
  return { ...nb, nbformat: 3, nbformat_minor: 0, orig_nbformat: 2 };
}

/** v3's short output keys and their MIME types (v4's _mime_map). */
const mimeTypes: [string, string][] = [
  ['text', 'text/plain'],
  ['html', 'text/html'],
  ['svg', 'image/svg+xml'],
  ['png', 'image/png'],
  ['jpeg', 'image/jpeg'],
  ['latex', 'text/latex'],
  ['json', 'application/json'],
  ['javascript', 'application/javascript']
];

function toMimeKeys(bundle: Record<string, unknown>): Record<string, unknown> {
  const result = { ...bundle };
  for (const [alias, mime] of mimeTypes) {
    if (alias in result) {
      result[mime] = result[alias];
      delete result[alias];
    }
  }
  return result;
}

/** nbformat.v4.convert.upgrade_output */
function upgradeOutput(output: any): any {
  switch (output.output_type) {
    case 'pyout':
    case 'display_data': {
      const result: any = {
        ...output,
        metadata: toMimeKeys(output.metadata ?? {})
      };
      if (output.output_type === 'pyout') {
        result.output_type = 'execute_result';
        result.execution_count = output.prompt_number ?? null;
        delete result.prompt_number;
      }
      // Every other key is output data.
      const data: Record<string, unknown> = {};
      for (const key of Object.keys(result)) {
        if (!['output_type', 'execution_count', 'metadata'].includes(key)) {
          data[key] = result[key];
          delete result[key];
        }
      }
      result.data = toMimeKeys(data);
      const json = result.data['application/json'];
      if (typeof json === 'string') {
        try {
          result.data['application/json'] = JSON.parse(json);
        } catch {
          // nbformat fails on JSON that doesn't parse; keep the string.
        }
      }
      return result;
    }
    case 'pyerr':
      return { ...output, output_type: 'error' };
    case 'stream': {
      const { stream = 'stdout', ...rest } = output;
      return { ...rest, name: stream };
    }
    default:
      return output;
  }
}

/** nbformat.v4.convert.upgrade_cell */
function upgradeCell(cell: any, id: string): any {
  const result = { ...cell, metadata: cell.metadata ?? {}, id };
  switch (cell.cell_type) {
    case 'code': {
      const {
        language: _language,
        collapsed,
        input = '',
        prompt_number = null,
        ...rest
      } = result;
      return {
        ...rest,
        metadata:
          'collapsed' in cell
            ? { ...result.metadata, collapsed }
            : result.metadata,
        source: input,
        execution_count: prompt_number,
        outputs: (Array.isArray(cell.outputs) ? cell.outputs : []).map(
          upgradeOutput
        )
      };
    }
    case 'heading': {
      // Heading cells become one-line markdown headings.
      const { level = 1, ...rest } = result;
      const hashes = '#'.repeat(Math.max(level, 0));
      const lines =
        typeof cell.source === 'string' ? splitLines(cell.source) : [];
      return {
        ...rest,
        cell_type: 'markdown',
        source: `${hashes} ${lines.join(' ')}`
      };
    }
    case 'html':
      return { ...result, cell_type: 'markdown' };
    default:
      return result;
  }
}

/** Random 8-digit hex cell ids, as nbformat makes them, without repeats. */
function cellIdGenerator(): () => string {
  const used = new Set<string>();
  return () => {
    let id: string;
    do {
      const bytes = crypto.getRandomValues(new Uint8Array(4));
      id = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    } while (used.has(id));
    used.add(id);
    return id;
  };
}

/** nbformat.v4.convert.upgrade, from nbformat 3 */
function v3ToV4(nb: any): any {
  const {
    orig_nbformat: origNbformat,
    orig_nbformat_minor: origNbformatMinor,
    worksheets,
    ...rest
  } = nb;
  const { name: _name, signature: _signature, ...metadata } = nb.metadata ?? {};
  const newId = cellIdGenerator();
  return {
    ...rest,
    // normalizeNotebook drops these again, so JupyterLab doesn't announce
    // the conversion.
    metadata: {
      ...metadata,
      orig_nbformat: origNbformat || 3,
      orig_nbformat_minor: origNbformatMinor || 0
    },
    nbformat: 4,
    nbformat_minor: 5,
    // Worksheets were never more than one in practice; flatten them.
    cells: worksheets.flatMap((ws: any) =>
      ws.cells.map((cell: any) => upgradeCell(cell, newId()))
    )
  };
}

/**
 * Upgrade notebook JSON of nbformat 1, 2 or 3 to nbformat 4.5, without
 * modifying it. Throws an Error with a short reason for notebooks that
 * can't be upgraded.
 */
export function upgradeNotebook(nb: any): any {
  switch (nb.nbformat) {
    case 1:
      return v3ToV4(v2ToV3(v1ToV2(nb)));
    case 2:
      return v3ToV4(v2ToV3(rejoinLines(nb, joinV2Lines)));
    case 3:
      return v3ToV4(rejoinLines(nb, joinV3Lines));
    default:
      throw new Error(`unknown nbformat ${nb.nbformat}`);
  }
}
