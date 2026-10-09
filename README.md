# nbviewerlite

A static, client-side version of [nbviewer](https://nbviewer.org). The
visitor's browser fetches the notebook and renders it with JupyterLab's own
notebook components. There is no application server: a static host serves
the same `index.html` for every URL, and the app reads the path.

Paths match nbviewer.org's, so changing the hostname is enough:

    /url/jakevdp.github.io/downloads/notebooks/XKCD_plots.ipynb
    /github/ipython/ipython/blob/6.x/examples/IPython%20Kernel/Index.ipynb
    /github/ipython/ipython/tree/6.x/examples/
    /github/ipython/
    /gist/fperez/<gist id>

- `/url/` and `/urls/` fetch from any host that allows cross-origin requests
  (CORS). When that fails, the page links to the same notebook on nbviewer.org.
- GitHub notebooks load from raw.githubusercontent.com, without GitHub API
  requests. Directory listings, repository and user pages, and gists use the
  GitHub API, which allows 60 requests per hour per visitor IP.

See [PLAN.md](PLAN.md) for the design and the roadmap.

## Development

Requires Node.js 22.6 or later.

```shell
npm ci
npm start            # dev server with live rebuilds, at http://localhost:8080/
npm test             # unit tests
npm run typecheck
npm run build        # production build into dist/
npm run preview      # serve dist/ like the production hosts do
```

## Deployment

The site runs on Cloudflare Workers, as static assets (no Worker code).
`npm run build` writes the site to `dist/`, and `wrangler.toml` serves it:

- files as themselves: content-hashed assets under `/static/`, `favicon.ico`,
  `robots.txt`;
- viewer URLs (`/url/...`, `/urls/...`, `/github/...`, `/gist/...`) get the
  app, with status 200, through the rewrites in `_redirects`
  (`/github/*  /  200`, ...). The browser keeps the requested URL, which the
  app reads. The rules point at `/` rather than `/index.html`, which
  Cloudflare rejects as an infinite loop;
- every other unknown path gets the nearest `404.html` with status 404
  (`not_found_handling = "404-page"`): the top-level one is a copy of the
  app, which shows "not found" or redirects nbviewer's old bare gist-id URLs
  (`/{id}`) to `/gist/{id}`; under `/static/` it's `static/404.html`;
- headers from `_headers`.

New URL prefixes (e.g. `/format/` in phase 3) need a rule in
`public/_redirects`. The site must be served from the root of its domain.

### Cloudflare

One-time setup, in the Cloudflare dashboard: create a Worker from this GitHub
repository (Workers & Pages > Create > Import a repository), named
`nbviewerlite` as in `wrangler.toml`, with build command `npm run build` and
deploy command `npx wrangler deploy`. Node.js comes from `.node-version`.
To change the build settings below, add them as build variables.

To check a build the way Cloudflare serves it, with its local emulator:

```shell
npm run build
npx wrangler dev
```

A local build can also be deployed directly: `npx wrangler deploy`, after
`npx wrangler login`.

### Other hosts

- **Netlify:** reads the same `_redirects` file and `404.html`;
  `netlify.toml` has the build settings.
- Others need the same rewrites, or at least `index.html` (status 200) for
  every path that isn't a file, e.g. nginx with `try_files $uri /index.html;`.

### Build settings

Environment variables read at build time:

| Variable | Default | Purpose |
| --- | --- | --- |
| `NBVIEWER_URL` | `https://nbviewer.org/` | Server-rendered nbviewer that pages and errors link to. Empty to disable. |
| `BINDER_URL` | `https://mybinder.org/v2` | Binder for "Execute on Binder" links. Empty to disable. |

## License

BSD 3-Clause, like nbviewer, which this is derived from.
