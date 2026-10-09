/**
 * IPython syntax to plain Python: a port of IPython's TransformerManager
 * (IPython/core/inputtransformer2.py, IPython 9), which nbconvert's
 * ipython2python filter applies to code cells of Python scripts. Magics,
 * shell escapes and help syntax become get_ipython() calls.
 *
 * Special syntax is only recognized where Python's tokenizer sees it, not in
 * strings or comments, and IPython's output depends on Python's version: this
 * follows Python 3.14, which nbviewer.org runs. Like IPython, this finds the
 * first piece of special syntax, replaces it, and tokenizes again.
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

/**
 * Python 3.14's textwrap.dedent, which also empties whitespace-only lines,
 * splitting at \n only: a blank line ending in \r\n loses its \r.
 */
function dedent(text: string): string {
  const lines = text.split('\n');
  const indents = lines
    .filter(line => line && !IS_SPACE.test(line))
    .map(line => /^[ \t]*/.exec(line)?.[0] ?? '');
  let margin = indents[0] ?? '';
  for (const indent of indents) {
    while (!indent.startsWith(margin)) {
      margin = margin.slice(0, -1);
    }
  }
  return lines
    .map(line => (IS_SPACE.test(line) ? '' : line.slice(margin.length)))
    .join('\n');
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

// Tokenizing, as far as the token transforms need it: a port of the C
// tokenizer behind Python 3.14's tokenize module (Parser/lexer/lexer.c),
// which nbviewer.org runs. F-strings and t-strings tokenize as PEP 701 and
// PEP 750 have them: replacement fields hold expressions, which can contain
// strings with any quotes, comments and line breaks.

interface IToken {
  type:
    | 'NAME'
    | 'NUMBER'
    | 'STRING'
    | 'FSTRING_START' // or TSTRING_START, and so on: the transforms don't care
    | 'FSTRING_MIDDLE'
    | 'FSTRING_END'
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

/** An f-string or t-string being tokenized (lexer.c's tokenizer_mode). */
interface IFString {
  /** The quotes that end it: ', ", ''' or """. */
  quote: string;
  raw: boolean;
  /** In literal text or a format spec, rather than in an expression. */
  literal: boolean;
  formatSpec: boolean;
  /** Brackets open in its replacement fields. */
  depth: number;
  /** The depth at which the innermost replacement field opened, or -1. */
  field: number;
}

const NUMBER =
  /0[xX](?:_?[\da-fA-F])+|0[bB](?:_?[01])+|0[oO](?:_?[0-7])+|(?:\d(?:_?\d)*(?:\.(?:\d(?:_?\d)*)?)?|\.\d(?:_?\d)*)(?:[eE][+-]?\d(?:_?\d)*)?[jJ]?/y;
const OPERATOR =
  /\*\*=|\/\/=|>>=|<<=|\.\.\.|!=|%=|&=|\*\*|\*=|\+=|-=|->|\/\/|\/=|:=|<<|<=|<>|==|>=|>>|@=|\^=|\|=/y;
// The string prefixes that go together (other mixes of the letters are errors)
const PREFIX = /^(?:[bfrtu]|r[bft]|[bft]r)$/i;
// How deep replacement fields can nest in format specs
const MAX_FIELD_NESTING = 3;

function matchAt(pattern: RegExp, s: string, pos: number): string | null {
  pattern.lastIndex = pos;
  return pattern.exec(s)?.[0] ?? null;
}

const isSpace = (c: string) => c === ' ' || c === '\t' || c === '\f';
const isDigit = (c: string) => c >= '0' && c <= '9';
// Python's tokenize module takes any non-ASCII character as part of a name.
const isNameStart = (c: string) =>
  (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_' || c >= '\x80';

/**
 * The letters before a quote at `pos`, if they can be a string prefix: each
 * of b, f, r, t and u at most once.
 */
function stringPrefix(text: string, pos: number): string | null {
  let seen = '';
  for (let j = pos; j < text.length && 'bBfFrRtTuU'.includes(text[j]); j++) {
    const letter = text[j].toLowerCase();
    if (seen.includes(letter)) {
      return null;
    }
    seen += letter;
    if (text[j + 1] === "'" || text[j + 1] === '"') {
      return text.slice(pos, j + 1);
    }
  }
  return null;
}

/**
 * Whether the tokenizer rejects a number, given the characters after it: a
 * digit or underscore after its last digit (0b12, 1_), a base prefix without
 * digits (0x), or an exponent sign without digits (1e+).
 */
function badNumber(number: string, next: string): boolean {
  return (
    (/[\da-fA-F]$/.test(number) && /^[\d_]/.test(next)) ||
    (number === '0' && /^[xXoObB]/.test(next)) ||
    (!/[eEjJxXoObB]/.test(number) && /^[eE][+-](?!\d)/.test(next))
  );
}

/**
 * Tokenize like Python's tokenize module. Like IPython, keep the tokens before
 * an error, and end them with an error token for the errors IPython expects;
 * other errors just end tokenizing. INDENT, DEDENT and ENDMARKER tokens, which
 * the transforms skip, are left out.
 */
function tokenize(lines: string[]): IToken[] {
  // The tokenizer reads line by line, adding a missing line break
  const starts: number[] = [];
  let text = '';
  for (const line of lines) {
    starts.push(text.length);
    text += line.endsWith('\n') ? line : line + '\n';
  }
  const tokens: IToken[] = [];
  const fstrings: IFString[] = [];
  // (reading past the end of an array is slow)
  const innermost = () =>
    fstrings.length ? fstrings[fstrings.length - 1] : undefined;
  let i = 0;
  let level = 0; // open brackets
  let lineStart = true;
  let commentLine = false; // a comment alone on its line
  let errorToken = false;

  let row = 0;
  const token = (
    type: IToken['type'],
    start: number,
    end: number,
    next = end
  ) => {
    while (row + 1 < starts.length && starts[row + 1] <= start) {
      row++;
    }
    const string = text.slice(start, end);
    tokens.push({ type, string, row, col: start - starts[row] });
    i = next;
    return true;
  };
  const stop = (expected: boolean) => {
    errorToken = expected;
    return false;
  };

  /** Skip a backslash and the line break after it, unless the input ends. */
  function continueLine(): boolean {
    const length = text.startsWith('\\\r\n', i)
      ? 3
      : text.startsWith('\\\n', i)
        ? 2
        : 0;
    if (!length || i + length >= text.length) {
      return false;
    }
    i += length;
    return true;
  }

  /** A string literal after a prefix of `skip` letters. */
  function string(skip: number): boolean {
    const start = i;
    let j = start + skip;
    const q = text[j];
    const quote = text.startsWith(q + q + q, j) ? q + q + q : q;
    j += quote.length;
    for (let quotes = 0; quotes < quote.length; ) {
      if (j >= text.length || (quote.length === 1 && text[j] === '\n')) {
        // IPython expects "unterminated string literal", but not "EOF in
        // multi-line string", or "f-string: expecting '}'" for the quotes of
        // the f-string whose replacement field this is in
        return stop(quote.length === 1 && innermost()?.quote !== quote);
      }
      const c = text[j++];
      if (c === q) {
        quotes++;
      } else {
        quotes = 0;
        if (c === '\\') {
          j += text.startsWith('\r\n', j) ? 2 : 1;
        }
      }
    }
    return token('STRING', start, j);
  }

  function startFString(prefix: string): boolean {
    const start = i;
    const j = start + prefix.length;
    const q = text[j];
    const quote = text.startsWith(q + q + q, j) ? q + q + q : q;
    fstrings.push({
      quote,
      raw: /r/i.test(prefix),
      literal: true,
      formatSpec: false,
      depth: 0,
      field: -1
    });
    return token('FSTRING_START', start, j + quote.length);
  }

  /** The next token outside f-strings' literal text (tok_get_normal_mode). */
  function normal(): boolean {
    // the f-string whose replacement field this is in
    const fstring = innermost();
    let blankLine = false;
    if (lineStart) {
      lineStart = false;
      for (;;) {
        if (isSpace(text[i])) {
          i++;
        } else if (text[i] !== '\\') {
          break;
        } else if (!continueLine()) {
          return stop(true);
        }
      }
      blankLine = text[i] === '#' || text[i] === '\n' || text[i] === '\r';
    }
    for (;;) {
      while (isSpace(text[i])) {
        i++;
      }
      const start = i;
      const c = text[i];
      if (c === '#') {
        while (i < text.length && text[i] !== '\n' && text[i] !== '\r') {
          i++;
        }
        commentLine = blankLine;
        return token('COMMENT', start, i);
      }
      if (i >= text.length) {
        // "unexpected EOF in multi-line statement"
        return level > 0 ? stop(true) : false;
      }
      if (isNameStart(c)) {
        const prefix = stringPrefix(text, i);
        if (prefix === null) {
          let end = i + 1;
          while (isNameStart(text[end]) || isDigit(text[end])) {
            end++;
          }
          return token('NAME', start, end);
        } else if (!PREFIX.test(prefix)) {
          return stop(false); // "'u' and 'b' prefixes are incompatible"
        }
        return /[ft]/i.test(prefix)
          ? startFString(prefix)
          : string(prefix.length);
      }
      if (c === '\n' || c === '\r') {
        // a line break inside brackets, or ending a blank or comment line
        const nl = blankLine || level > 0 || commentLine;
        lineStart = true;
        commentLine = false;
        return token(nl ? 'NL' : 'NEWLINE', start, i + (c === '\r' ? 2 : 1));
      }
      const number =
        isDigit(c) || (c === '.' && isDigit(text[i + 1]))
          ? matchAt(NUMBER, text, i)
          : null;
      if (number !== null) {
        const end = i + number.length;
        if (badNumber(number, text.slice(end, end + 3))) {
          return stop(true); // "invalid decimal literal" and the like
        }
        return token('NUMBER', start, end);
      }
      if (c === '"' || c === "'") {
        return string(0);
      }
      if (c === '\\') {
        // "unexpected character after line continuation character"
        if (!continueLine()) {
          return stop(true);
        }
        continue;
      }
      if (
        c === ':' &&
        fstring &&
        fstring.field >= 0 &&
        fstring.depth - 1 === fstring.field
      ) {
        // a format spec
        fstring.literal = fstring.formatSpec = true;
        return token('OP', start, i + 1);
      }
      const op =
        ('!%&*+-./:<=>@^|'.includes(c) && matchAt(OPERATOR, text, i)) || c;
      if ('([{'.includes(op)) {
        level++;
        if (fstring) {
          fstring.depth++;
        }
      } else if (')]}'.includes(op)) {
        if (fstring && !fstring.depth && op === '}') {
          return stop(false); // "f-string: single '}' is not allowed"
        }
        level = Math.max(0, level - 1);
        if (fstring) {
          if (--fstring.depth < 0) {
            return stop(false); // "f-string: unmatched ')'"
          }
          if (op === '}' && fstring.depth === fstring.field) {
            // the end of the replacement field
            fstring.field--;
            fstring.literal = true;
            fstring.formatSpec = false;
          }
        }
      } else if (c < ' ' || c === '\x7f') {
        return stop(true); // "invalid non-printable character"
      }
      return token('OP', start, i + op.length);
    }
  }

  /** The next token in an f-string's literal text (tok_get_fstring_mode). */
  function literal(fstring: IFString): boolean {
    const start = i;
    /** Enter a replacement field, unless they nest too deeply. */
    const field = () => {
      fstring.literal = fstring.formatSpec = false;
      return ++fstring.field < MAX_FIELD_NESTING;
    };
    if (text[i] === '{' && text[i + 1] !== '{') {
      return field() ? normal() : stop(false);
    }
    if (text.startsWith(fstring.quote, i)) {
      fstrings.pop();
      return token('FSTRING_END', start, i + fstring.quote.length);
    }
    // FSTRING_MIDDLE, up to a replacement field, the end or an escaped brace
    const middle = (end: number, next = end) =>
      token('FSTRING_MIDDLE', start, end, next);
    const q = fstring.quote[0];
    let unicodeEscape = false;
    let j = i;
    for (let quotes = 0; quotes < fstring.quote.length; ) {
      if (
        j >= text.length ||
        (fstring.quote.length === 1 && text[j] === '\n')
      ) {
        // "unterminated f-string literal", or a line break in a format spec:
        // "f-string: newlines are not allowed in format specifiers..."
        return stop(false);
      }
      const formatSpec = fstring.formatSpec && fstring.field >= 0;
      const c = text[j++];
      if (c === q) {
        quotes++;
        continue;
      }
      quotes = 0;
      if (c === '{') {
        if (text[j] === '{' && !formatSpec) {
          return middle(j, j + 1); // {{ ends the token after one brace
        }
        return field() ? middle(j - 1) : stop(false);
      } else if (c === '}') {
        if (unicodeEscape) {
          return middle(j); // the end of a \N{...} escape
        } else if (text[j] === '}' && !formatSpec && !fstring.depth) {
          return middle(j, j + 1);
        }
        fstring.literal = fstring.formatSpec = false;
        return middle(j - 1);
      } else if (c === '\\') {
        if (text[j] === '\r') {
          j++;
        }
        const escaped = text[j];
        if (escaped !== '{' && escaped !== '}' && j < text.length) {
          j++;
          if (escaped === 'N' && !fstring.raw && text[j] === '{') {
            unicodeEscape = true;
            j++;
          }
        }
      }
    }
    return middle(j - fstring.quote.length);
  }

  for (;;) {
    const fstring = innermost();
    if (!(fstring?.literal ? literal(fstring) : normal())) {
      break;
    }
  }
  if (errorToken) {
    const last = tokens[tokens.length - 1];
    tokens.push({
      type: 'ERRORTOKEN',
      string: '',
      row: last?.row ?? 0,
      col: last?.col ?? 0
    });
  }
  return tokens;
}

/**
 * Group tokens into logical lines, as IPython's make_tokens_by_line does. It
 * counts brackets by their text, also in FSTRING_MIDDLE tokens, such as the
 * "(" of f"({x}", where Python's tokenizer doesn't.
 */
function tokensByLine(lines: string[]): IToken[][] {
  const groups: IToken[][] = [[]];
  let level = 0;
  for (const token of tokenize(lines)) {
    groups[groups.length - 1].push(token);
    const s = token.string;
    if (token.type === 'NEWLINE' || (token.type === 'NL' && level <= 0)) {
      groups.push([]);
    } else if (s === '(' || s === '[' || s === '{') {
      level++;
    } else if ((s === ')' || s === ']' || s === '}') && level > 0) {
      level--;
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
