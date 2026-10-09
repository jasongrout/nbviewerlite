// Serve dist/ the way Netlify does with public/_redirects (and Cloudflare
// Pages with its SPA fallback): existing files as themselves, missing
// /static/ files as 404s, every other path as index.html with status 200.
//
//   npm run build && npm run preview    (PORT=8080 by default)

import { createReadStream } from 'node:fs';
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

async function isFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

createServer(async (req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(
      new URL(req.url, 'http://localhost').pathname
    );
  } catch {
    pathname = '/';
  }
  let file = normalize(join(root, pathname));
  let status = 200;
  if (!file.startsWith(root + sep) || !(await isFile(file))) {
    // like public/_redirects: missing assets are 404s, anything else the app
    if (pathname.startsWith('/static/')) {
      file = join(root, 'static', '404.html');
      status = 404;
    } else {
      file = join(root, 'index.html');
    }
  }
  res.writeHead(status, {
    'Content-Type': types[extname(file)] ?? 'application/octet-stream'
  });
  createReadStream(file).pipe(res);
}).listen(port, () => {
  console.log(`Serving ${root} at http://localhost:${port}/`);
});
