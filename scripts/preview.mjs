// Serve dist/ the way Cloudflare (wrangler.toml) or Netlify does with
// public/_redirects and public/_headers: existing files as themselves; viewer
// URLs (url/, urls/, github/, gist/, format/) and the FAQ (/faq, /faq/) as
// index.html with status 200; missing /static/ files as static/404.html and
// every other path as 404.html, with status 404; every response with the
// headers from _headers.
//
//   npm run build && npm run preview    (PORT=8080 by default)

import { createReadStream, readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..', 'dist');
const port = Number(process.env.PORT ?? 8080);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

/** A _headers path pattern: `*` matches anything, `:name` one segment. */
function pathPattern(path) {
  const parts = path
    .split('*')
    .map(part =>
      part
        .replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&')
        .replace(/:[A-Za-z]\w*/g, '[^/]+')
    );
  return new RegExp(`^${parts.join('.*')}$`);
}

/**
 * The rules in a _headers file: a path pattern, then indented `Name: value`
 * lines, or `! Name` to remove a header that an earlier rule set. Rules for
 * full URLs (`https://host/path`) never match here.
 */
function parseHeaders(text) {
  const rules = [];
  const lines = text.split('\n').map(line => line.trim());
  for (const line of lines.filter(line => !line.startsWith('#'))) {
    const rule = rules.at(-1);
    if (/^(\/|https?:\/\/)/.test(line)) {
      const pattern = line.startsWith('/') ? pathPattern(line) : null;
      rules.push({ pattern, set: [], unset: [] });
    } else if (rule && line.startsWith('! ')) {
      rule.unset.push(line.slice(2).trim());
    } else if (rule && line.includes(':')) {
      const i = line.indexOf(':');
      rule.set.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
    }
  }
  return rules;
}

let headerRules = [];
try {
  headerRules = parseHeaders(readFileSync(join(root, '_headers'), 'utf8'));
} catch {
  console.warn(`No ${join(root, '_headers')}: run npm run build first.`);
}

/**
 * Add the headers of every rule that matches the request's (still
 * percent-encoded) path, in file order, as Cloudflare does: the first rule
 * to set a name replaces the response's own header, later ones add values.
 */
function addHeaders(headers, pathname) {
  const fromRules = new Set();
  for (const rule of headerRules.filter(rule => rule.pattern?.test(pathname))) {
    for (const name of rule.unset) {
      headers.delete(name);
    }
    for (const [name, value] of rule.set) {
      if (fromRules.has(name.toLowerCase())) {
        headers.append(name, value);
      } else {
        headers.set(name, value);
        fromRules.add(name.toLowerCase());
      }
    }
  }
}

async function isFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    pathname = '/';
  }
  let file = normalize(join(root, pathname));
  let status = 200;
  if (/^\/(url|urls|github|gist|format)\//.test(pathname)) {
    file = join(root, 'index.html');
  } else if (pathname === '/' || pathname === '') {
    file = join(root, 'index.html');
  } else if (pathname === '/faq' || pathname === '/faq/') {
    // the FAQ, also rewritten to the app by _redirects
    file = join(root, 'index.html');
  } else if (
    !file.startsWith(root + sep) ||
    // the hosts read these, and don't serve them
    pathname === '/_headers' ||
    pathname === '/_redirects' ||
    !(await isFile(file))
  ) {
    status = 404;
    file = pathname.startsWith('/static/')
      ? join(root, 'static', '404.html')
      : join(root, '404.html');
  }
  const headers = new Headers({
    'Content-Type': types[extname(file)] ?? 'application/octet-stream'
  });
  addHeaders(headers, url.pathname);
  res.writeHead(status, Object.fromEntries(headers));
  createReadStream(file).pipe(res);
}).listen(port, () => {
  console.log(`Serving ${root} at http://localhost:${port}/`);
});
