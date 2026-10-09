/**
 * HTML files from repos and gists, prepared for a sandboxed frame
 * (html-view.ts): the parts that need no DOM.
 *
 * raw.githubusercontent.com serves stylesheets and scripts as text/plain
 * with `X-Content-Type-Options: nosniff`, so browsers won't apply or run
 * them from there. The ones from the same repo are fetched and inlined as
 * data: URLs, which keeps the elements, their order and attributes (media,
 * defer, async) as they were.
 */

/** At most this many stylesheets and scripts get fetched per page... */
export const MAX_FETCHES = 32;
/** ...together at most this many bytes. */
export const MAX_BYTES = 10 * 1024 * 1024;
/**
 * Inlining them writes at most this many characters of data: URLs per
 * page: one for every element and @import that loads a file, so repeats
 * count again, and stylesheets inlined into others count again as part of
 * those. Imported stylesheets also count their text each time they are
 * inlined, for the work of reading it. Twice MAX_BYTES, since base64 takes
 * a third more, and files repeat.
 */
export const MAX_OUTPUT = 2 * MAX_BYTES;
/**
 * At most this many @imports get inlined per page, counting a stylesheet
 * each time it is inlined into another: imports of imports can repeat
 * exponentially (a imports b and c, which both import d, ...).
 */
export const MAX_IMPORTS = 2 * MAX_FETCHES;

export function isHtmlFile(path: string): boolean {
  return /\.html?$/i.test(path);
}

/**
 * Whether a link from an HTML file to `url` should open in the viewer:
 * notebooks, other HTML files, and what may be a directory (a trailing
 * slash, or no file extension). Links to other files (images, data) stay
 * links to the files themselves.
 */
export function opensInViewer(url: string): boolean {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return false;
  }
  const name = pathname.slice(pathname.lastIndexOf('/') + 1);
  return !name.includes('.') || /\.(ipynb|html?)$/i.test(name);
}

/** `url` resolved against `base`, or null if that isn't a valid URL. */
export function absoluteUrl(url: string, base: string): string | null {
  try {
    return new URL(url, base).href;
  } catch {
    return null;
  }
}

/** `text` as a base64 data: URL of MIME type `type`, in UTF-8. */
export function dataUrl(text: string, type: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  // in chunks: fromCharCode takes its arguments on the stack
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${type};charset=utf-8;base64,${btoa(binary)}`;
}

/** A URL in a stylesheet. */
export interface ICssUrl {
  /**
   * Where it is written, [start, end): a string with its quotes, or the
   * unquoted value inside url(). A quoted string can replace either.
   */
  start: number;
  end: number;
  /** The URL, unescaped. */
  url: string;
  /** Whether it is what an @import rule imports. */
  isImport: boolean;
}

/**
 * The URLs in a stylesheet: url() values and @import strings, but not
 * comments or other strings. A small part of CSS tokenization (CSS Syntax
 * Level 3), enough to rewrite URLs without touching anything else.
 */
export function cssUrls(css: string): ICssUrl[] {
  const urls: ICssUrl[] = [];
  // after @import, the next token is what it imports
  let importing = false;
  let i = 0;
  while (i < css.length) {
    const c = css[i];
    if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      i = end === -1 ? css.length : end + 2;
    } else if (c === '"' || c === "'") {
      const end = stringEnd(css, i);
      if (importing) {
        urls.push({
          start: i,
          end,
          url: unescapeCss(css.slice(i + 1, end - 1)),
          isImport: true
        });
      }
      importing = false;
      i = end;
    } else if (/\s/.test(c)) {
      i++;
    } else if (c === '@' && /^@import(?![\w-])/i.test(css.slice(i, i + 8))) {
      importing = true;
      i += '@import'.length;
    } else if (
      (c === 'u' || c === 'U') &&
      /^url\(/i.test(css.slice(i, i + 4)) &&
      !/[\w\\-]/.test(css[i - 1] ?? '')
    ) {
      i = urlToken(css, i + 4, importing, urls);
      importing = false;
    } else {
      importing = false;
      i++;
    }
  }
  return urls;
}

/** The end of the string starting at `start` (after its closing quote). */
function stringEnd(css: string, start: number): number {
  const quote = css[start];
  let i = start + 1;
  while (i < css.length) {
    const c = css[i];
    if (c === '\\') {
      i += 2;
    } else if (c === quote) {
      return i + 1;
    } else if (c === '\n') {
      // unterminated: the string ends at the line break
      return i;
    } else {
      i++;
    }
  }
  return css.length;
}

/** Read the rest of a url( token from `i`; returns where it ends. */
function urlToken(
  css: string,
  i: number,
  isImport: boolean,
  urls: ICssUrl[]
): number {
  while (/\s/.test(css[i] ?? '')) {
    i++;
  }
  if (css[i] === '"' || css[i] === "'") {
    // url("...") is a function holding a string
    const end = stringEnd(css, i);
    urls.push({
      start: i,
      end,
      url: unescapeCss(css.slice(i + 1, end - 1)),
      isImport
    });
    return end;
  }
  const start = i;
  while (i < css.length && css[i] !== ')' && !/\s/.test(css[i])) {
    i += css[i] === '\\' ? 2 : 1;
  }
  const end = Math.min(i, css.length);
  if (end > start) {
    urls.push({
      start,
      end,
      url: unescapeCss(css.slice(start, end)),
      isImport
    });
  }
  return end;
}

/** Resolve CSS escapes: \" for ", \26 for &, backslash-newline for nothing. */
function unescapeCss(s: string): string {
  return s.replace(
    /\\(?:([0-9a-fA-F]{1,6})\s?|(\n)|([\s\S]))/g,
    (_, hex: string, newline: string, char: string) => {
      if (!hex) {
        return newline ? '' : char;
      }
      const code = parseInt(hex, 16);
      const valid =
        code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff);
      return valid ? String.fromCodePoint(code) : '\ufffd';
    }
  );
}

/**
 * A stylesheet from `sheetUrl`, rewritten to work from elsewhere (a data:
 * URL, a <style>): relative URLs become absolute, and @imports of URLs in
 * `inlined` become its values (data: URLs). Fragment-only URLs (url(#id),
 * for SVG) point into the document and stay.
 */
export function rewriteCss(
  css: string,
  sheetUrl: string,
  inlined: ReadonlyMap<string, string> = new Map()
): string {
  let out = '';
  let last = 0;
  for (const { start, end, url, isImport } of cssUrls(css)) {
    const absolute = url.startsWith('#') ? null : absoluteUrl(url, sheetUrl);
    if (absolute === null) {
      continue;
    }
    const replacement =
      (isImport && inlined.get(absolute)) ||
      // URLs with a scheme stay as written (data: URLs may hold quotes)
      (/^[a-z][a-z\d+.-]*:/i.test(url) ? null : absolute);
    if (replacement) {
      // URL serialization escapes quotes and drops line breaks, and data:
      // URLs here are base64, so this makes a valid string
      out += `${css.slice(last, start)}"${replacement}"`;
      last = end;
    }
  }
  return out + css.slice(last);
}

/** What a stylesheet or a script gets inlined as. */
export type InlineType = 'text/css' | 'text/javascript';

/**
 * Fetches the stylesheets and scripts to inline, and makes data: URLs of
 * them: those for which `inlineUrl` gives a URL to fetch from (null leaves
 * a URL to the browser), within the limits above.
 */
export class ResourceLoader {
  private readonly inlineUrl: (url: string) => string | null;
  private readonly fetchUrl: (url: string) => Promise<Response>;
  private readonly cache = new Map<string, Promise<string | null>>();
  private readonly dataUrls = new Map<string, Promise<string | null>>();
  private fetchesLeft = MAX_FETCHES;
  private bytesLeft = MAX_BYTES;
  private outputLeft = MAX_OUTPUT;
  private importsLeft = MAX_IMPORTS;

  constructor(
    inlineUrl: (url: string) => string | null,
    fetchUrl: (url: string) => Promise<Response> = url =>
      fetch(url, { credentials: 'omit' })
  ) {
    this.inlineUrl = inlineUrl;
    this.fetchUrl = fetchUrl;
  }

  /**
   * The text at `url`, or null if it isn't to be inlined, fails to load or
   * doesn't fit the limits. Fetch slots go in call order.
   */
  load(url: string): Promise<string | null> {
    let text = this.cache.get(url);
    if (!text) {
      text = this.fetchText(url);
      this.cache.set(url, text);
    }
    return text;
  }

  /**
   * The stylesheet or script at `url` as a data: URL, for one element that
   * loads it, or null to leave the element as it is: the file isn't to be
   * inlined, fails to load or doesn't fit the limits. Each file is fetched
   * and encoded once, but every element counts against MAX_OUTPUT.
   */
  async inline(url: string, type: InlineType): Promise<string | null> {
    const key = `${type} ${url}`;
    let data = this.dataUrls.get(key);
    if (!data) {
      data = this.encode(url, type);
      this.dataUrls.set(key, data);
    }
    const text = await data;
    return text !== null && this.charge(text.length) ? text : null;
  }

  /**
   * Count `size` characters against MAX_OUTPUT; false, counting nothing, if
   * they don't fit.
   */
  charge(size: number): boolean {
    if (size > this.outputLeft) {
      return false;
    }
    this.outputLeft -= size;
    return true;
  }

  /**
   * Count an imported stylesheet with `size` characters of text about to be
   * inlined; false, counting nothing, if that's over MAX_IMPORTS or
   * MAX_OUTPUT.
   */
  chargeImport(size: number): boolean {
    if (this.importsLeft <= 0 || !this.charge(size)) {
      return false;
    }
    this.importsLeft--;
    return true;
  }

  private async encode(url: string, type: InlineType): Promise<string | null> {
    const text = await this.load(url);
    if (text === null) {
      return null;
    }
    return dataUrl(
      type === 'text/css' ? await inlineStylesheet(text, url, this) : text,
      type
    );
  }

  private async fetchText(url: string): Promise<string | null> {
    const from = this.inlineUrl(url);
    if (from === null || this.fetchesLeft <= 0) {
      return null;
    }
    this.fetchesLeft--;
    try {
      const response = await this.fetchUrl(from);
      return response.ok && response.body
        ? await this.read(response.body)
        : null;
    } catch {
      return null;
    }
  }

  /**
   * Read a body as UTF-8, if it fits the bytes left. Files count once
   * complete, so that a huge one doesn't crowd out others loading with it.
   */
  private async read(body: ReadableStream<Uint8Array>): Promise<string | null> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      size += value.length;
      if (size > this.bytesLeft) {
        void reader.cancel();
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
    // others may have used up the bytes in the meantime
    if (size > this.bytesLeft) {
      return null;
    }
    this.bytesLeft -= size;
    return text + decoder.decode();
  }
}

/**
 * A stylesheet from `sheetUrl`, ready to load from a data: URL: relative
 * URLs made absolute, and the stylesheets it @imports inlined if `loader`
 * gets them and they fit the limits (recursively, but not in cycles).
 */
export async function inlineStylesheet(
  css: string,
  sheetUrl: string,
  loader: ResourceLoader,
  importedBy: readonly string[] = []
): Promise<string> {
  const seen = [...importedBy, sheetUrl];
  // each stylesheet once, with how often rewriteCss will write it
  const imports = new Map<string, number>();
  for (const { url, isImport } of cssUrls(css)) {
    const absolute = isImport ? absoluteUrl(url, sheetUrl) : null;
    if (absolute !== null && !seen.includes(absolute)) {
      imports.set(absolute, (imports.get(absolute) ?? 0) + 1);
    }
  }
  const inlined = new Map<string, string>();
  await Promise.all(
    Array.from(imports, async ([url, count]) => {
      const text = await loader.load(url);
      // counted before going deeper, so that the recursion ends even when
      // no output fits any more
      if (text === null || !loader.chargeImport(text.length)) {
        return;
      }
      const sheet = await inlineStylesheet(text, url, loader, seen);
      const data = dataUrl(sheet, 'text/css');
      if (loader.charge(data.length * count)) {
        inlined.set(url, data);
      }
    })
  );
  return rewriteCss(css, sheetUrl, inlined);
}
