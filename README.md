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

The site runs on Cloudflare Pages. `npm run build` writes a static site to
`dist/`, and Pages serves it like this:

- files as themselves: content-hashed assets under `/static/`, `favicon.ico`,
  `robots.txt`;
- `index.html`, with status 200, for every other path. This is Pages'
  single-page-app mode, which is on because `dist/` has no top-level
  `404.html`. Don't add one. The browser keeps the requested URL, which the
  app reads;
- missing `/static/` files get `static/404.html`, with status 404;
- headers from `_headers`.

The site must be served from the root of its domain.

### Cloudflare Pages

One-time setup, in the Cloudflare dashboard:

1. Create a Pages project connected to this GitHub repository
   (Workers & Pages > Create > Pages > Connect to Git).
2. Project name: `nbviewerlite`, as in `wrangler.toml`.
3. Production branch: `main`. Framework preset: none. Build command:
   `npm run build`. Build output directory: `dist`.
4. Save and deploy.

Node.js comes from `.node-version`. Every push to `main` deploys to
production (`nbviewerlite.pages.dev`). Other branches and pull requests get
preview deployments at `<branch>.nbviewerlite.pages.dev`. To change the build
settings below, add them as environment variables in the project's settings.

To check a build the way Pages serves it, with Cloudflare's local emulator:

```shell
npm run build
npx wrangler pages dev dist
```

A local build can also be uploaded without the Git integration:
`npx wrangler pages deploy dist --project-name nbviewerlite`, after
`npx wrangler login`.

### Other hosts

- **Netlify:** `netlify.toml` has the build settings and the rewrite rules.
- Any host that answers unknown paths with `/index.html` and status 200,
  e.g. nginx with `try_files $uri /index.html;`.

### Build settings

Environment variables read at build time:

| Variable | Default | Purpose |
| --- | --- | --- |
| `NBVIEWER_URL` | `https://nbviewer.org/` | Server-rendered nbviewer that pages and errors link to. Empty to disable. |
| `BINDER_URL` | `https://mybinder.org/v2` | Binder for "Execute on Binder" links. Empty to disable. |

## License

BSD 3-Clause, like nbviewer, which this is derived from.
