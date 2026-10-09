/**
 * HTML files from GitHub and gists, shown as pages in a sandboxed iframe.
 *
 * nbviewer serves them from its own origin as text/html, so they render
 * there; raw.githubusercontent.com serves them as text/plain. Here the file
 * goes into an iframe through srcdoc, with an opaque origin (the sandbox
 * never allows same-origin), so its scripts can't reach this site's DOM or
 * storage, and with a <base> at the file's raw URL, so relative images and
 * data load from the repo. Stylesheets and scripts from the repo are
 * inlined (html.ts); relative links to notebooks and directories open in
 * the viewer.
 */

import {
  addNbviewerLink,
  type IContext,
  setTitle,
  showFailure
} from './context.ts';
import {
  absoluteUrl,
  cssUrls,
  inlineStylesheet,
  opensInViewer,
  ResourceLoader
} from './html.ts';
import { breadcrumbs, type ILink } from './listing.ts';
import { fetchText, NotebookError } from './notebook-view.ts';
import { addHeaderLink, h, link, showStatus } from './page.ts';

export interface IHtmlSource {
  /** The file's raw URL; relative URLs in it resolve against this. */
  url: string;
  /** Page title, usually the file name. */
  title: string;
  /** The file's text. Defaults to fetching `url`. */
  load?: () => Promise<string>;
  /**
   * Where to fetch a stylesheet or script at `url` from to inline it, or
   * null to leave it to the browser (e.g. other hosts).
   */
  inlineUrl: (url: string) => string | null;
  /** The viewer URL for a link to `url`, or null to leave the link alone. */
  linkFor: (url: string) => string | null;
  breadcrumbs?: ILink[];
  /** "View on ..." header link: [url, provider name]. */
  provider: [string, string];
  /** As for notebooks: called on HTTP 404, true if it took over the page. */
  onNotFound?: () => Promise<boolean>;
}

/**
 * Scripts, forms and windows of their own (outside the sandbox), and
 * navigating this window when the user clicks a link; never
 * allow-same-origin.
 */
const SANDBOX = [
  'allow-scripts',
  'allow-popups',
  'allow-forms',
  'allow-popups-to-escape-sandbox',
  'allow-top-navigation-by-user-activation'
].join(' ');

/** Below the frame: the main area's bottom padding. */
const FRAME_MARGIN = 16;
const MIN_FRAME_HEIGHT = 320;

export async function showHtml(
  ctx: IContext,
  source: IHtmlSource
): Promise<void> {
  const { root } = ctx;
  setTitle(source.title);
  showStatus(root, 'Loading ', link(source.url, source.url), '…');
  const elsewhere: [string, string] = [
    source.provider[0],
    `file on ${source.provider[1]}`
  ];

  let srcdoc: string;
  try {
    const text = await (source.load ?? (() => fetchText(source.url)))();
    srcdoc = await frameDocument(text, source);
  } catch (err) {
    if (
      err instanceof NotebookError &&
      err.status === 404 &&
      source.onNotFound &&
      (await source.onNotFound())
    ) {
      return;
    }
    const details = err instanceof NotebookError ? err.details : [];
    showFailure(ctx, err, elsewhere, ...details);
    return;
  }

  const [providerUrl, providerName] = source.provider;
  addHeaderLink(providerUrl, `View on ${providerName}`, 'launch');
  addNbviewerLink(ctx);
  addHeaderLink(source.url, 'Download HTML', 'download');

  const frame = h('iframe', {
    class: 'nbv-html-frame',
    title: source.title,
    sandbox: SANDBOX,
    srcdoc
  });
  const crumbs = source.breadcrumbs?.length
    ? [breadcrumbs(source.breadcrumbs)]
    : [];
  root.replaceChildren(...crumbs, frame);

  // As tall as the rest of the window: the frame can't size itself to its
  // content, which is cross-origin.
  const fit = () => {
    const top = frame.getBoundingClientRect().top + window.scrollY;
    const height = window.innerHeight - top - FRAME_MARGIN;
    frame.style.height = `${Math.max(height, MIN_FRAME_HEIGHT)}px`;
  };
  fit();
  window.addEventListener('resize', fit);
}

/**
 * The file as the frame's document: with its base URL at the raw file,
 * stylesheets and scripts from the repo inlined, and links to notebooks
 * and directories pointing at the viewer.
 */
async function frameDocument(
  html: string,
  source: IHtmlSource
): Promise<string> {
  // Parsing doesn't run scripts or load anything.
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const base = setBase(doc, source.url);
  const baseUrl = base.getAttribute('href') ?? source.url;

  // Start fetches in document order, which is the order fetch slots go in.
  const loader = new ResourceLoader(source.inlineUrl);
  const inlining = Array.from(
    doc.querySelectorAll('link[href], script[src], style'),
    el => inline(el, baseUrl, loader)
  );

  for (const anchor of doc.querySelectorAll('a[href], area[href]')) {
    const href = anchor.getAttribute('href') ?? '';
    const url = href.startsWith('#') ? null : absoluteUrl(href, baseUrl);
    const viewer = url && opensInViewer(url) ? source.linkFor(url) : null;
    if (viewer !== null) {
      // absolute: relative URLs in the frame resolve against the raw file
      anchor.setAttribute('href', new URL(viewer, window.location.href).href);
      if (!anchor.hasAttribute('target')) {
        anchor.setAttribute('target', '_top');
      }
    }
  }

  const script = doc.createElement('script');
  script.textContent = frameScript(window.location.hash);
  base.after(script);

  await Promise.all(inlining);
  const doctype = doc.doctype
    ? new XMLSerializer().serializeToString(doc.doctype)
    : '';
  return doctype + doc.documentElement.outerHTML;
}

/**
 * Make the raw file the document's base URL, or the file's own <base>,
 * made absolute; first in <head>, so that it applies to everything. Links
 * without a target open in the top window, as when nbviewer serves the
 * file: in the frame, raw files and most sites would refuse to load
 * (X-Frame-Options).
 */
function setBase(doc: Document, rawUrl: string): Element {
  const own = doc.querySelector('base[href]');
  const ownUrl = own
    ? absoluteUrl(own.getAttribute('href') ?? '', rawUrl)
    : null;
  const base = own ?? doc.createElement('base');
  base.setAttribute(
    'href',
    ownUrl && /^https?:/.test(ownUrl) ? ownUrl : rawUrl
  );
  if (!doc.querySelector('base[target]')) {
    base.setAttribute('target', '_top');
  }
  doc.head.prepend(base);
  return base;
}

/** Inline a stylesheet or script element's target, if the loader gets it. */
async function inline(
  el: Element,
  baseUrl: string,
  loader: ResourceLoader
): Promise<void> {
  if (el.localName === 'style') {
    const css = el.textContent ?? '';
    if (cssUrls(css).some(({ isImport }) => isImport)) {
      el.textContent = await inlineStylesheet(css, baseUrl, loader);
    }
    return;
  }
  const isLink = el.localName === 'link';
  const rel = (el.getAttribute('rel') ?? '').toLowerCase().split(/\s+/);
  if (isLink && !rel.includes('stylesheet')) {
    return;
  }
  const attr = isLink ? 'href' : 'src';
  const url = absoluteUrl(el.getAttribute(attr) ?? '', baseUrl);
  const data =
    url === null
      ? null
      : await loader.inline(url, isLink ? 'text/css' : 'text/javascript');
  if (data === null) {
    return;
  }
  el.setAttribute(attr, data);
  // the copy needn't match the original's bytes, and isn't cross-origin
  el.removeAttribute('integrity');
  el.removeAttribute('crossorigin');
}

/**
 * Runs first in the frame, and makes up for its document URL (about:srcdoc)
 * not being its base URL (the raw file), and for the sandbox:
 * - fragment links (#id) would leave the page for the raw file: they
 *   scroll within the page instead, unless the page's scripts handle them;
 * - javascript: URLs don't run in a sandboxed frame: those of links and
 *   forms run here instead (nbconvert's "toggle code" form, say), in the
 *   page's global scope, and what they throw is reported as uncaught;
 * - history.pushState and replaceState resolve URLs against the base, on
 *   another origin, and throw: they get to change the fragment, which is
 *   what pages change in place (slide decks keep the slide there).
 * Links and forms that target _top or _parent count as in the page, which
 * they are when nbviewer serves it.
 */
const FRAME_SCRIPT = `(function () {
  function inPlace(target) {
    return !target || /^_(self|top|parent)$/i.test(target);
  }
  // the code a javascript: URL runs, percent-decoded, or null
  function javascript(url) {
    try { url = new URL(url, document.baseURI); } catch (e) { return null; }
    if (url.protocol !== 'javascript:') { return null; }
    var code = url.href.slice(url.protocol.length);
    return code.replace(/(%[0-9a-f]{2})+/gi, function (bytes) {
      try { return decodeURIComponent(bytes); } catch (e) { return bytes; }
    });
  }
  var run = eval; // indirect: global scope
  addEventListener('click', function (event) {
    var target = event.target;
    var link = target.closest && target.closest('a[href], area[href]');
    var href = link && link.getAttribute('href');
    if (!href || event.defaultPrevented ||
        !inPlace(link.getAttribute('target'))) {
      return;
    }
    if (href.charAt(0) === '#') {
      event.preventDefault();
      location.hash = href;
      return;
    }
    var code = javascript(href);
    if (code !== null) {
      event.preventDefault();
      run(code);
    }
  });
  addEventListener('submit', function (event) {
    var form = event.target;
    var button = event.submitter;
    // a button's formaction and formtarget override the form's
    function get(name) {
      return button && button.hasAttribute('form' + name) ?
        button.getAttribute('form' + name) : form.getAttribute(name);
    }
    var code = javascript(get('action') || '');
    if (code !== null && !event.defaultPrevented && inPlace(get('target'))) {
      event.preventDefault();
      run(code);
    }
  });
  ['pushState', 'replaceState'].forEach(function (name) {
    var original = history[name];
    history[name] = function (state, title, url) {
      if (url === undefined || url === null) {
        return original.call(history, state, title);
      }
      var hash = '';
      try { hash = new URL(url, document.baseURI).hash; } catch (e) {}
      return original.call(history, state, title, 'about:srcdoc' + hash);
    };
  });
})();`;

/** FRAME_SCRIPT, and scrolling to the viewer URL's fragment, if any. */
function frameScript(hash: string): string {
  if (!hash) {
    return FRAME_SCRIPT;
  }
  // '<' can't end the script: JSON escapes it here
  const fragment = JSON.stringify(hash.slice(1)).replace(/</g, '\\u003c');
  return `${FRAME_SCRIPT}
addEventListener('DOMContentLoaded', function () {
  var id = ${fragment};
  try { id = decodeURIComponent(id); } catch (e) {}
  var target = document.getElementById(id) || document.getElementsByName(id)[0];
  if (target) { target.scrollIntoView(); }
});`;
}
