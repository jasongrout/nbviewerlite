/**
 * IPython syntax to plain Python: a port of IPython's TransformerManager
 * (IPython/core/inputtransformer2.py, IPython 9), which nbconvert's
 * ipython2python filter applies to code cells of Python scripts. Magics,
 * shell escapes and help syntax become get_ipython() calls.
 *
 * Special syntax is only recognized where Python's tokenizer sees it, not in
 * strings or comments. Like IPython, this finds the first piece of special
 * syntax, replaces it, and tokenizes again.
 */

// Python's whitespace (str.isspace, \s), which JavaScript's \s doesn't match
// exactly.
const SPACE =
  '\\t\\n\\v\\f\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a' +
  '\\u2028\\u2029\\u202f\\u205f\\u3000';
const IS_SPACE = new RegExp(`^[${SPACE}]+$`);
const TRAILING_SPACE = new RegExp(`[${SPACE}]+$`);
const LEADING_SPACE = new RegExp(`^[${SPACE}]+`);

/** Transform a code cell's IPython syntax to plain Python. */
export function ipython2python(cell: string): string {
  if (!cell.endsWith('\n')) {
    cell += '\n';
  }
  let lines = splitLines(cell);
  for (const transform of [
    leadingEmptyLines,
    leadingIndent,
    classicPrompt,
    ipythonPrompt,
    cellMagic
  ]) {
    lines = transform(lines);
  }
  return tokenTransforms(lines).join('');
}

/** Python's str.splitlines(keepends=True). */
export function splitLines(text: string): string[] {
  const lines: string[] = [];
  const ending = /\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/g;
  let start = 0;
  for (const match of text.matchAll(ending)) {
    const end = match.index + match[0].length;
    lines.push(text.slice(start, end));
    start = end;
  }
  if (start < text.length) {
    lines.push(text.slice(start));
  }
  return lines;
}

function strip(s: string): string {
  return s.replace(LEADING_SPACE, '').replace(TRAILING_SPACE, '');
}

/** Python's str.partition. */
function partition(s: string, sep: string): [string, string] {
  const i = s.indexOf(sep);
  return i === -1 ? [s, ''] : [s.slice(0, i), s.slice(i + sep.length)];
}

const NOT_PRINTABLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}\p{Zs}]/u;

/** Python's repr() of a str. */
export function pyRepr(s: string): string {
  const quote = s.includes("'") && !s.includes('"') ? '"' : "'";
  const hex = (code: number, width: number) =>
    code.toString(16).padStart(width, '0');
  let out = quote;
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === quote || ch === '\\') {
      out += '\\' + ch;
    } else if (ch === '\t') {
      out += '\\t';
    } else if (ch === '\n') {
      out += '\\n';
    } else if (ch === '\r') {
      out += '\\r';
    } else if (code < 0x20 || code === 0x7f) {
      out += '\\x' + hex(code, 2);
    } else if (code < 0x7f || !NOT_PRINTABLE.test(ch)) {
      out += ch;
    } else if (code <= 0xff) {
      out += '\\x' + hex(code, 2);
    } else if (code <= 0xffff) {
      out += '\\u' + hex(code, 4);
    } else {
      out += '\\U' + hex(code, 8);
    }
  }
  return out + quote;
}

// Cleanup transforms

function leadingEmptyLines(lines: string[]): string[] {
  const i = lines.findIndex(line => line && !IS_SPACE.test(line));
  return i === -1 ? lines : lines.slice(i);
}

function leadingIndent(lines: string[]): string[] {
  return lines.length ? splitLines(dedent(lines.join(''))) : lines;
}

/** Python's textwrap.dedent, which also empties whitespace-only lines. */
function dedent(text: string): string {
  text = text.replace(/(?<![^\n])[ \t]+(?![^\n])/g, '');
  let margin: string | null = null;
  for (const [, indent] of text.matchAll(/(?<![^\n])([ \t]*)[^ \t\n]/g)) {
    if (margin === null || margin.startsWith(indent)) {
      margin = indent;
    } else if (!indent.startsWith(margin)) {
      let i = 0;
      while (margin[i] === indent[i]) {
        i++;
      }
      margin = margin.slice(0, i);
    }
  }
  return margin
    ? text.replace(new RegExp(`(?<![^\\n])${margin}`, 'g'), '')
    : text;
}

const DOCTEST_INITIAL = new RegExp(`^[${SPACE}]*>>>`);
const DOCTEST_PS1 = new RegExp(`^[${SPACE}]*>>>[ \\t]?`);
const DOCTEST_PS2 = new RegExp(`^[${SPACE}]*\\.\\.\\.[ \\t]?`);

/**
 * Which lines are inside a triple-quoted string that a doctest prompt
 * should be kept in (PromptStripper._triple_quote_mask; a heuristic).
 */
function tripleQuoteMask(lines: string[]): boolean[] {
  const mask: boolean[] = [];
  let inTriple: string | null = null;
  let preservePrompt = false;
  let seenPrompt = false;
  for (const line of lines) {
    mask.push(inTriple !== null && preservePrompt);
    for (const match of line.matchAll(/(?<!\\)("""|''')/g)) {
      const quote = match[1];
      if (inTriple === null) {
        inTriple = quote;
        const before = line.slice(0, match.index);
        const stripped = before
          .replace(DOCTEST_PS1, '')
          .replace(DOCTEST_PS2, '');
        const promptedCode = stripped !== before && seenPrompt;
        preservePrompt = !promptedCode && /^[rubf]*$/i.test(strip(stripped));
        mask[mask.length - 1] = preservePrompt;
      } else if (inTriple === quote) {
        inTriple = null;
        preservePrompt = false;
      }
    }
    seenPrompt ||= DOCTEST_INITIAL.test(line);
  }
  return mask;
}

/** Strip doctest prompts (>>> and ...) pasted with the code. */
function classicPrompt(lines: string[]): string[] {
  const mask = tripleQuoteMask(lines);
  if (!lines.some((line, i) => !mask[i] && DOCTEST_INITIAL.test(line))) {
    return lines;
  }
  const out = lines.map((line, i) => {
    if (mask[i]) {
      return line;
    }
    return DOCTEST_PS1.test(line)
      ? line.replace(DOCTEST_PS1, '')
      : line.replace(DOCTEST_PS2, '');
  });
  // dedent runs of lines outside strings where prompts were stripped
  const result: string[] = [];
  for (let i = 0; i < out.length; ) {
    let j = i;
    while (j < out.length && mask[j] === mask[i]) {
      j++;
    }
    const segment = out.slice(i, j);
    const stripped = segment.some((line, k) => line !== lines[i + k]);
    result.push(
      ...(!mask[i] && stripped ? splitLines(dedent(segment.join(''))) : segment)
    );
    i = j;
  }
  return result;
}

const IPYTHON_PROMPT = new RegExp(
  `^((?:(?:\\[nav\\]|\\[ins\\])? )?In \\[\\p{Nd}+\\]: |[${SPACE}]*\\.{3,}: ?)`,
  'u'
);

/** Strip IPython prompts (In [1]: and ...:) pasted with the code. */
function ipythonPrompt(lines: string[]): string[] {
  if (
    lines.length &&
    (IPYTHON_PROMPT.test(lines[0]) ||
      (lines.length > 1 && IPYTHON_PROMPT.test(lines[1])))
  ) {
    return lines.map(line => line.replace(IPYTHON_PROMPT, ''));
  }
  return lines;
}

function cellMagic(lines: string[]): string[] {
  if (!lines.length || !lines[0].startsWith('%%')) {
    return lines;
  }
  if (/^%%[\p{L}\p{N}_]+\?/u.test(lines[0])) {
    // %%magic? is help, handled by the token transforms
    return lines;
  }
  const [name, firstLine] = partition(
    lines[0].slice(2).replace(TRAILING_SPACE, ''),
    ' '
  );
  const body = lines.slice(1).join('');
  return [
    `get_ipython().run_cell_magic(${pyRepr(name)}, ${pyRepr(firstLine)}, ${pyRepr(body)})\n`
  ];
}

// Tokenizing, as far as the token transforms need it

interface IToken {
  type:
    | 'NAME'
    | 'NUMBER'
    | 'STRING'
    | 'OP'
    | 'COMMENT'
    | 'NEWLINE'
    | 'NL'
    | 'ERRORTOKEN';
  string: string;
  /** Start position: line index and column (UTF-16 units) in the lines. */
  row: number;
  col: number;
}

const NUMBER =
  /0[xX](?:_?[\da-fA-F])+|0[bB](?:_?[01])+|0[oO](?:_?[0-7])+|(?:\d(?:_?\d)*(?:\.(?:\d(?:_?\d)*)?)?|\.\d(?:_?\d)*)(?:[eE][+-]?\d(?:_?\d)*)?[jJ]?/y;
// Python's tokenize module takes any non-ASCII character as part of a name.
const NAME = /[a-zA-Z_\u0080-\uffff][\w\u0080-\uffff]*/y;
const STRING_START = /(?:[rR][bBfF]?|[bBfF][rR]?|[uU])?('''|"""|'|")/y;
const OPERATOR =
  /\*\*=|\/\/=|>>=|<<=|\.\.\.|!=|%=|&=|\*\*|\*=|\+=|-=|->|\/\/|\/=|:=|<<|<=|==|>=|>>|@=|\^=|\|=|[^\s\w]/y;
const LINE_END = /\r\n|\n|\r/y;

function matchAt(pattern: RegExp, s: string, pos: number): string | null {
  pattern.lastIndex = pos;
  return pattern.exec(s)?.[0] ?? null;
}

/**
 * The end of a string literal that started before `pos`, or -1 if it goes
 * on past this line, or null if it's unterminated.
 */
function stringEnd(line: string, pos: number, quote: string): number | null {
  for (let i = pos; i < line.length; i++) {
    if (line[i] === '\\') {
      if (matchAt(LINE_END, line, i + 1) !== null) {
        return -1; // a backslash continues the string on the next line
      }
      i++;
    } else if (line.startsWith(quote, i)) {
      return i + quote.length;
    } else if (quote.length === 1 && matchAt(LINE_END, line, i) !== null) {
      return null;
    }
  }
  return -1;
}

/**
 * Tokenize like Python's tokenize module, grouped into logical lines
 * (make_tokens_by_line). Like IPython, keep the tokens before an error.
 * INDENT and DEDENT tokens, which the transforms skip, are left out.
 */
function tokensByLine(lines: string[]): IToken[][] {
  const tokens: IToken[] = [];
  let parenlev = 0;
  let continued = false;
  let open: IToken | null = null; // a string that spans lines
  let quote = '';
  // IPython marks where most tokenize errors stopped it with an error token
  let failed = false;

  scan: for (let row = 0; row < lines.length; row++) {
    const line = lines[row];
    let pos = 0;
    if (open) {
      const end = stringEnd(line, 0, quote);
      if (end === null) {
        failed = true;
        break;
      } else if (end === -1) {
        continue;
      }
      tokens.push(open);
      open = null;
      pos = end;
    } else if (parenlev === 0 && !continued) {
      // a new statement: blank and comment-only lines have no NEWLINE
      pos = /^[ \t\f]*/.exec(line)?.[0].length ?? 0;
      if (
        line[pos] === '#' ||
        pos === line.length ||
        matchAt(LINE_END, line, pos)
      ) {
        if (line[pos] === '#') {
          const comment = /^#[^\r\n]*/.exec(line.slice(pos))?.[0] ?? '#';
          tokens.push({ type: 'COMMENT', string: comment, row, col: pos });
          pos += comment.length;
        }
        tokens.push({ type: 'NL', string: line.slice(pos), row, col: pos });
        continue;
      }
    } else {
      continued = false;
    }

    while (pos < line.length) {
      const ch = line[pos];
      if (ch === ' ' || ch === '\t' || ch === '\f') {
        pos++;
        continue;
      }
      const token = (type: IToken['type'], string: string) => {
        tokens.push({ type, string, row, col: pos });
        pos += string.length;
      };
      const ending = matchAt(LINE_END, line, pos);
      if (ending !== null) {
        token(parenlev > 0 ? 'NL' : 'NEWLINE', ending);
        continue scan;
      }
      if (ch === '#') {
        token('COMMENT', /^#[^\r\n]*/.exec(line.slice(pos))?.[0] ?? '#');
        continue;
      }
      if (ch === '\\') {
        if (matchAt(LINE_END, line, pos + 1) === null) {
          failed = true; // "unexpected character after line continuation"
          break scan;
        }
        continued = true;
        continue scan;
      }
      const start = matchAt(STRING_START, line, pos);
      if (start !== null) {
        quote = start.slice(/['"]/.exec(start)?.index);
        const end = stringEnd(line, pos + start.length, quote);
        if (end === null) {
          failed = true; // unterminated string literal
          break scan;
        } else if (end === -1) {
          open = { type: 'STRING', string: '', row, col: pos };
          continue scan;
        }
        token('STRING', line.slice(pos, end));
        continue;
      }
      const number = matchAt(NUMBER, line, pos);
      if (number !== null) {
        const next = line.slice(pos + number.length);
        if (/^[\d_]/.test(next) || (number === '0' && /^[xXbBoO]/.test(next))) {
          failed = true; // a malformed literal such as 0b12, 1_ or 0x
          break scan;
        }
        token('NUMBER', number);
        continue;
      }
      const name = matchAt(NAME, line, pos);
      if (name !== null) {
        token('NAME', name);
        continue;
      }
      const op = matchAt(OPERATOR, line, pos) ?? ch;
      if ('([{'.includes(op)) {
        parenlev++;
      } else if (')]}'.includes(op)) {
        parenlev = Math.max(0, parenlev - 1);
      }
      token('OP', op);
    }
    // the last line, without a line ending
    if (!open && !continued) {
      tokens.push({
        type: parenlev > 0 ? 'NL' : 'NEWLINE',
        string: '',
        row,
        col: pos
      });
    }
  }

  if (failed || (open ? quote.length === 1 : parenlev > 0 || continued)) {
    const last = tokens[tokens.length - 1];
    tokens.push({
      type: 'ERRORTOKEN',
      string: '',
      row: last?.row ?? 0,
      col: last?.col ?? 0
    });
  }

  const groups: IToken[][] = [[]];
  let level = 0;
  for (const token of tokens) {
    groups[groups.length - 1].push(token);
    if (token.type === 'NEWLINE' || (token.type === 'NL' && level <= 0)) {
      groups.push([]);
    } else if (token.type === 'OP' && '([{'.includes(token.string)) {
      level++;
    } else if (token.type === 'OP' && ')]}'.includes(token.string)) {
      level = Math.max(0, level - 1);
    }
  }
  if (!groups[groups.length - 1].length) {
    groups.pop();
  }
  return groups;
}

// Token transforms

interface ITransform {
  row: number;
  col: number;
  /** Lower numbers win among transforms found at the same position. */
  priority: number;
  /** Returns null where IPython raises SyntaxError. */
  apply: (lines: string[]) => string[] | null;
}

/** The index of the first '=' outside brackets. */
function findAssignOp(line: IToken[]): number | null {
  let level = 0;
  for (let i = 0; i < line.length; i++) {
    const s = line[i].string;
    if (s === '=' && level === 0) {
      return i;
    }
    if ('([{'.includes(s) && s.length === 1) {
      level++;
    } else if (')]}'.includes(s) && s.length === 1 && level > 0) {
      level--;
    }
  }
  return null;
}

/** The last line of a statement continued with backslashes. */
function endOfContinuedLine(lines: string[], start: number): number {
  let end = start;
  while (lines[end].endsWith('\\\n')) {
    end++;
    if (end >= lines.length) {
      break;
    }
  }
  return end;
}

/** Join backslash-continued lines from (row, col), without the newline. */
function assembleContinuedLine(
  lines: string[],
  row: number,
  col: number,
  end: number
): string {
  const parts = [lines[row].slice(col), ...lines.slice(row + 1, end + 1)];
  return [
    ...parts.slice(0, -1).map(p => p.replace(TRAILING_SPACE, '').slice(0, -1)),
    parts[parts.length - 1].replace(TRAILING_SPACE, '')
  ].join(' ');
}

/** Replace the special syntax at (row, col) with `call(rest of line)`. */
function replaceAt(
  lines: string[],
  row: number,
  col: number,
  call: (rest: string) => string | null
): string[] | null {
  const end = endOfContinuedLine(lines, row);
  const replacement = call(assembleContinuedLine(lines, row, col, end));
  if (replacement === null) {
    return null;
  }
  return [
    ...lines.slice(0, row),
    lines[row].slice(0, col) + replacement + '\n',
    ...lines.slice(end + 1)
  ];
}

const lineMagic = (name: string, args: string) =>
  `get_ipython().run_line_magic(${pyRepr(name)}, ${pyRepr(args)})`;

function helpCall(target: string, esc: string): string {
  const method =
    esc === '??' ? 'pinfo2' : target.includes('*') ? 'psearch' : 'pinfo';
  return lineMagic(method, target);
}

/** What an escape character at the start of a line does with the rest. */
const ESCAPES: Record<string, (content: string) => string | null> = {
  '!': content => `get_ipython().system(${pyRepr(content)})`,
  '!!': content => `get_ipython().getoutput(${pyRepr(content)})`,
  '?': content =>
    content ? helpCall(content, '?') : 'get_ipython().show_usage()',
  '??': content =>
    content ? helpCall(content, '??') : 'get_ipython().show_usage()',
  '%': content => lineMagic(...partition(content, ' ')),
  ',': content => {
    const [name, args] = partition(content, ' ');
    return `${name}("${splitWords(args).join('", "')}")`;
  },
  ';': content => {
    const [name, args] = partition(content, ' ');
    return `${name}("${args}")`;
  },
  '/': content => {
    const [name, args] = partition(content, ' ');
    return name === '' ? null : `${name}(${splitWords(args).join(', ')})`;
  }
};

const ESCAPE_SINGLES = new Set(['!', '?', '%', ',', ';', '/']);

/** Python's str.split() without arguments. */
function splitWords(s: string): string[] {
  return s.split(new RegExp(`[${SPACE}]+`)).filter(word => word);
}

const HELP_END =
  /(%{0,2}(?!\p{Nd})[\p{L}\p{N}_*]+(?:\.(?!\p{Nd})[\p{L}\p{N}_*]+|\[-?[0-9]+\])*)(\?\??)(?=\n?$)/u;

/** The first instance of each kind of special syntax in the cell. */
function findTransforms(lines: string[], tokens: IToken[][]): ITransform[] {
  const found: ITransform[] = [];
  // a = %magic
  for (const line of tokens) {
    const i = findAssignOp(line);
    if (
      i !== null &&
      line[i + 1]?.string === '%' &&
      line[i + 2]?.type === 'NAME'
    ) {
      const { row, col } = line[i + 1];
      found.push({
        row,
        col,
        priority: 10,
        apply: lines =>
          replaceAt(lines, row, col, rhs =>
            lineMagic(...partition(rhs.slice(1), ' '))
          )
      });
      break;
    }
  }
  // a = !command
  for (const line of tokens) {
    const i = findAssignOp(line);
    if (
      i !== null &&
      !strip(lines[line[i].row]).startsWith('=') &&
      line[i + 1]?.type === 'OP' &&
      line[i + 1].string === '!'
    ) {
      const { row, col } = line[i + 1];
      found.push({
        row,
        col,
        priority: 10,
        apply: lines =>
          replaceAt(
            lines,
            row,
            col,
            rhs => `get_ipython().getoutput(${pyRepr(rhs.slice(1))})`
          )
      });
      break;
    }
  }
  // %magic, !command, ?help, ... at the start of a line
  for (const line of tokens) {
    if (line.length && ESCAPE_SINGLES.has(line[0].string)) {
      const { row, col } = line[0];
      found.push({
        row,
        col,
        priority: 10,
        apply: lines =>
          replaceAt(lines, row, col, rest => {
            const double = rest.slice(0, 2);
            return double === '!!' || double === '??'
              ? ESCAPES[double](rest.slice(2))
              : ESCAPES[rest[0]](rest.slice(1));
          })
      });
      break;
    }
  }
  // object? and object??
  for (const line of tokens) {
    if (line.length > 2 && line[line.length - 2].string === '?') {
      const { row, col } = line[0];
      const qRow = line[line.length - 2].row;
      found.push({
        row,
        col,
        priority: 5,
        apply: lines => {
          const piece = lines.slice(row, qRow + 1).join('');
          const match = HELP_END.exec(piece.slice(col));
          if (!match) {
            return null;
          }
          return [
            ...lines.slice(0, row),
            piece.slice(0, col) + helpCall(match[1], match[2]) + '\n',
            ...lines.slice(qRow + 1)
          ];
        }
      });
      break;
    }
  }
  return found;
}

function tokenTransforms(lines: string[]): string[] {
  // IPython gives up after this many transforms
  for (let i = 0; i < 500; i++) {
    const candidates = findTransforms(lines, tokensByLine(lines)).sort(
      (a, b) => a.row - b.row || a.col - b.col || a.priority - b.priority
    );
    let changed: string[] | null = null;
    for (const candidate of candidates) {
      changed = candidate.apply(lines);
      if (changed) {
        break;
      }
    }
    if (!changed) {
      return lines;
    }
    lines = changed;
  }
  return lines;
}
