# nbviewerlite

A static, client-side version of [nbviewer](https://nbviewer.org). The
visitor's browser fetches the notebook and renders it with JupyterLab's own
notebook components. There is no application server: a static host serves
the same `index.html` for every URL, and the app reads the path.

Paths match nbviewer.org's, so changing the hostname is enough:

    /url/jakevdp.github.io/downloads/notebooks/XKCD_plots.ipynb
    /urls/raw.githubusercontent.com/ipython/ipython/6.x/examples/IPython%20Kernel/Index.ipynb

Notebooks can only be fetched from hosts that allow cross-origin requests
(CORS); when that fails, the page links to the same notebook on nbviewer.org.
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

`npm run build` writes a static site to `dist/`, including `_redirects` and
`_headers` files that Netlify and Cloudflare Pages read. The important line
is

    /*  /index.html  200

Status 200 makes it a rewrite rather than a redirect: the host answers any
path that isn't a file with `index.html`, and the browser keeps the original
URL. Assets live under `/static/` with content-hashed names, and the site
must be served from the root of its domain.

- **Netlify:** connect the repository. `netlify.toml` sets the build command
  and the `dist` publish directory.
- **Cloudflare Pages:** connect the repository with build command
  `npm run build` and output directory `dist` (as in `wrangler.toml`), or
  upload a local build with `npx wrangler pages deploy dist`.

Other static hosts work if they can rewrite unknown paths to `/index.html`,
e.g. nginx with `try_files $uri /index.html;`.

### Build settings

Environment variables read at build time:

| Variable | Default | Purpose |
| --- | --- | --- |
| `NBVIEWER_URL` | `https://nbviewer.org/` | Server-rendered nbviewer that pages and errors link to. Empty to disable. |
| `BINDER_URL` | `https://mybinder.org/v2` | Binder for "Execute on Binder" links. Empty to disable. |

## License

BSD 3-Clause, like nbviewer, which this is derived from.
