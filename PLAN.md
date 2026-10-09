# nbviewerlite plan

## Problem

nbviewer.org fetches every notebook on the server (GitHub REST API, raw URLs)
and renders it with nbconvert. Bot traffic multiplies both costs: each
uncached request spends nbviewer's shared GitHub API quota and a render slot.

## Goal

A notebook viewer with nbviewer's URL structure, built as a static site:

- the visitor's browser fetches the notebook, and any GitHub API data, so
  requests count against the visitor's own IP and rate limit;
- the browser renders it with JupyterLab's own components;
- there is no application server. A static host serves one `index.html` for
  every viewer URL, plus hashed assets, all cacheable by its CDN.

Paths match nbviewer.org's, so swapping the hostname works:

    nbviewer.org/url/jakevdp.github.io/downloads/notebooks/XKCD_plots.ipynb
    <lite host>/url/jakevdp.github.io/downloads/notebooks/XKCD_plots.ipynb

    nbviewer.org/github/ipython/ipython/blob/6.x/examples/IPython%20Kernel/Index.ipynb
    <lite host>/github/ipython/ipython/blob/6.x/examples/IPython%20Kernel/Index.ipynb

This builds on the client-side viewer prototyped in nbviewer
([jasongrout/nbviewer#1](https://github.com/jasongrout/nbviewer/pull/1),
served there under `/v2/`). Its rendering, routing and GitHub code carries
over; the nbviewer server and its templates do not.

## Hosting

Cloudflare Workers with static assets (no Worker code), built from the GitHub
repository by Workers Builds (`npm run build`, then `npx wrangler deploy`).
`wrangler.toml` serves `dist/`:

- Files as themselves (`/static/...`, `/favicon.ico`).
- Viewer URLs get the app with status 200, through rewrites in `_redirects`:
  `/url/*`, `/urls/*`, `/github/*`, `/gist/*` and `/format/*` to `/`, and the
  FAQ's two exact paths, `/faq` and `/faq/` (a rule without `*` matches one
  path). Status 200 makes them
  rewrites, not redirects: the address bar and `location.pathname` keep the
  original path, which the app then reads. Cloudflare applies rules
  "regardless of whether or not an asset matches the incoming request"
  ([docs](https://developers.cloudflare.com/pages/configuration/redirects/)),
  which is fine because no files live under these prefixes; a catch-all `/*`
  would also capture the assets (Cloudflare rejects it as an infinite loop, as
  it does any rule pointing at `/index.html`, hence `/`).
- Every other unknown path gets `404.html` (`not_found_handling =
  "404-page"`), which is the app too, with status 404: unknown URLs are real
  404s, and nbviewer's old bare gist-id URLs (`/{id}`, which no rule can match
  without also matching `/favicon.ico`) still work, because the app redirects
  them to `/gist/{id}`.
- Missing `/static/` files get `static/404.html` (status 404), not the app.
- `_headers`: basic security headers. Hashed assets keep the default caching
  (revalidated with ETags): a year-long `immutable` header would also stick
  to whatever a missing asset path returned.
- `wrangler.toml` names the Worker and its assets directory, and
  `.node-version` pins Node.js for the build. (Cloudflare Pages would serve
  the same files the same way, with `pages_build_output_dir` instead.)

Locally, `npm run preview` (a small Node server) and `npx wrangler dev`
(Cloudflare's emulator) serve the build the same way. Netlify reads the
same `_redirects` and `404.html`. Other hosts need the same rewrites, or at
least `index.html` for every path that isn't a file (nginx `try_files $uri
/index.html`). GitHub Pages can't rewrite; its `404.html` workaround answers
every viewer URL with HTTP 404.

Consequences of being static:

- **Soft 404s, partly:** unknown paths are real 404s, but any URL under a
  viewer prefix answers 200, even when the notebook doesn't exist; the app
  shows the error, while crawlers see success.
- **No server-side config:** settings are build-time environment variables,
  e.g. the URL of the server-rendered viewer to link to (default
  `https://nbviewer.org/`) and the Binder base URL.
- **Absolute asset URLs:** `index.html` is served at arbitrary depths, so it
  references `/static/...`. The site is deployed at a domain root.

## Architecture

```
browser                                   static host (Cloudflare)
-------                                   ----------------------------------
GET /github/u/r/blob/main/a.ipynb  ---->  no such file: rewrite -> index.html (200)
GET /static/js/main.<hash>.js      ---->  file
app reads location.pathname
  -> route: url | urls | github | gist
fetch(raw.githubusercontent.com/...)  --> GitHub raw CDN (CORS: *; no API quota)
fetch(api.github.com/...)             --> GitHub REST API (CORS: *; 60/h per IP)
fetch(https://host/path.ipynb)        --> any host that sends CORS headers
render with JupyterLab components
```

### Components

| Need | Package |
| --- | --- |
| Notebook model and widget | `@jupyterlab/notebook` (`NotebookModel`, `StaticNotebook`) |
| MIME rendering | `@jupyterlab/rendermime` |
| Markdown | `@jupyterlab/markedparser-extension` |
| Math | `@jupyterlab/mathjax-extension` (MathJax 3 and its fonts) |
| Code display | `@jupyterlab/codemirror` (read-only CodeMirror 6) |
| Theme | `@jupyterlab/theme-light-extension` CSS variables |
| Icons | `@jupyterlab/ui-components` SVG icons (folder, notebook, file, ...) |
| JSON, PDF, Vega/Vega-Lite outputs | `@jupyterlab/json-extension`, `@jupyterlab/pdf-extension`, `@jupyterlab/vega5-extension` |
| Mermaid (outputs and Markdown) | `@jupyterlab/mermaid` |
| ipywidgets | `@jupyter-widgets/html-manager` (with `base`, `controls`, `output`) |
| Slideshows | reveal.js 6 (theme simple, notes plugin) |
| FAQ Markdown | `marked` (JupyterLab's Markdown parser) |

The page shell (header, link bar, listings) is a small hand-written HTML/CSS
layer in JupyterLab's visual language; nbviewer's Bootstrap 3 and LESS build
are not carried over. jQuery and RequireJS stay on the page as globals,
because classic-notebook outputs (older Plotly and Bokeh output, for example)
expect them, as on nbviewer.org.

Bundled with rspack (JupyterLab's bundler from 4.6 on). `@jupyterlab/*` at
the latest stable release; the toolchain at the versions JupyterLab itself
uses (rspack 1.7, TypeScript 5.9, css-loader 6, style-loader 3).
`package-lock.json` is committed. The rendering code is a separate chunk, so
listing pages load only the small main bundle. Heavier libraries load only
for notebooks that need them: vega-embed (with Vega and Vega-Lite), Mermaid,
the JSON tree, the widget manager, reveal.js (slides) and marked (FAQ).

### Trust and security

nbviewer.org runs notebook-supplied HTML and JavaScript on its origin
(nbconvert inlines them). For parity, nbviewerlite renders outputs as trusted.
JavaScript outputs run like in nbconvert's lab template, which nbviewer.org
uses: as inline scripts, in document order with scripts in HTML outputs, with
`element` bound to the output's DOM node (which also gets jQuery's methods
under names the DOM doesn't use, for classic-notebook outputs). Markdown cells
are sanitized, as in JupyterLab, but keep `id` and `name` attributes so
in-page anchors work. ipywidgets render from saved state with
`@jupyter-widgets/html-manager`; like nbconvert's template, it loads
third-party widget libraries named in the notebook from jsDelivr and runs
them on the page, which is no more than a JavaScript output can do. HTML
files from repositories and gists are different: they render in a sandboxed
`<iframe srcdoc>` without `allow-same-origin`, so they get an opaque origin
and can't reach the site's DOM or storage. The site holds no
secrets (no cookies, no tokens), so notebook code can't steal anything from
it. Before anything secret lives on the origin (say, an optional GitHub token
for higher rate limits), rendering must move into a sandboxed, opaque-origin
iframe (phase 4).

### Limits of fetching in the browser

- `/url/` and `/urls/` work only for hosts that send CORS headers (GitHub
  Pages, raw.githubusercontent.com, gist.githubusercontent.com, GitLab,
  Hugging Face do; many personal servers don't). Errors link to the same page
  on nbviewer.org.
- `/url/` (plain http) is upgraded to https, since an https page can't fetch
  http.
- Unauthenticated GitHub API: 60 requests per hour per visitor IP. Notebook
  views use raw.githubusercontent.com instead (no API quota); directory
  listings cost one request, repo pages one more, gists one.
- HTML files: raw.githubusercontent.com serves everything as `text/plain`
  with `nosniff`, so stylesheets and scripts from the same repository are
  fetched and inlined (as data: URLs; at most 32 files and 10 MB per page).
  Ones a page adds at run time with relative URLs (`document.write`,
  RequireJS paths, module imports) don't load, nor do frames of other repo
  files (raw.githubusercontent.com forbids framing). The frame has a fixed
  height, the window below the header.

## Phases

### Phase 1 (minimal): static site, `/url/` and `/urls/` (done)

- Repo setup: rspack build into `dist/`; `index.html` generated with
  absolute, content-hashed asset URLs; `_redirects`, `_headers`,
  `wrangler.toml`; a local preview server that serves the build the same way;
  README with deploy steps.
- Router for `url/{host}/{path}` and `urls/{host}/{path}` (with nbviewer's
  encoding of query strings as a trailing `%3F...` segment).
- Fetch in the browser, with clear errors (CORS, HTTP status, invalid JSON)
  that link to the file and to nbviewer.org.
- Render with `StaticNotebook`: trusted outputs, MathJax, syntax
  highlighting, every cell laid out; notebook JSON normalized as
  jupyter_server does (nbformat's `rejoin_lines`); `#heading` links scroll to
  the heading once rendered.
- Relative links and images resolve against the notebook's URL; links to
  other notebooks stay in the viewer.
- Link bar: kernel, Download, View on nbviewer.org.
- Landing page with a URL form that maps input like nbviewer's front page does.
- Unit tests (node) for routing, rewrites and normalization.

### Phase 2: GitHub and gists (done)

Same behavior as nbviewer's GitHub and gist providers:

- `github/{user}/{repo}/blob/{ref}/{path}`: notebooks from
  raw.githubusercontent.com (no API request); other files open directly;
  directories redirect to their listing.
- Directory listings, `github/{user}/{repo}/tree/{ref}/{path}/`: one Contents
  API request; directories, then notebooks, then other files; breadcrumbs and
  a `..` row; user and repo taken from the API's URLs so renamed repos link
  correctly; the branch/tag menu loads when first opened.
- `github/{user}/` (repositories, paginated) and `github/{user}/{repo}/`
  (default branch lookup).
- `gist/{user}/{id}[/{file}]`, `gist/{user}/`, and bare gist ids.
- nbviewer's redirects: trailing slashes, `url/github.com/...`,
  `url/raw.githubusercontent.com/...`.
- Links: View on GitHub / Gist, Execute on Binder.
- Rate-limit errors say when the limit resets.

### Phase 3: format and output parity (done)

- nbformat 1, 2 and 3 notebooks upgrade to nbformat 4 in the browser
  (`src/convert.ts`): a port of Python nbformat's readers (`rejoin_lines`)
  and upgrades, tested against nbformat's own output. Code in notebooks
  that don't name their language (all nbformat 3 ones) is highlighted as
  Python, like nbconvert's default lexer.
- JupyterLab's other MIME renderers: JSON, PDF, Vega 5 and Vega-Lite 3 to 5,
  Mermaid (outputs and fenced blocks in Markdown), with JupyterLab's ranks.
  These differ from nbviewer.org, whose template shows fallbacks (text or an
  image) for Vega, JSON and PDF.
- ipywidgets 7 and 8 from the notebook's saved widget state, with
  `@jupyter-widgets/html-manager` (one manager per notebook; a lazily loaded
  chunk). Widget views without saved state show their next MIME type, as
  nbconvert does; third-party widget libraries load through RequireJS from
  jsDelivr, and failures show in the output.
- `format/{html,slides,script}/...`: every provider path, as in nbviewer;
  redirects keep the format, listings show as usual, and notebook pages link
  to the formats that apply ("View as Slides" only with slide metadata).
  - Script: a port of nbconvert's ScriptExporter: the python template (with
    IPython's transformations of magics, shell escapes and help) when
    `language_info.nbconvert_exporter` is `python`, otherwise the generic one
    with `language_info.file_extension`. Shown highlighted, with a download
    link: a page, where nbviewer.org answers with `text/plain`.
  - Slides: cells grouped as nbconvert does (slides, subslides, fragments,
    notes, skipped cells). The notebook renders once with JupyterLab and the
    cell nodes move into reveal.js sections, so every output type works.
- HTML files in repositories and gists render in a sandboxed iframe (see
  Trust and security, and Limits of fetching in the browser). Links to
  notebooks, HTML files and directories in the repo open in the viewer.
- The landing page shows nbviewer.org's examples (`src/frontpage.json`,
  thumbnails in `/static/img/example-nb/`); `/faq` is nbviewer's FAQ adapted
  to nbviewer lite (`src/faq.md`).
- Playwright end-to-end tests (`test/e2e/`), with fixtures for every remote
  host. The GitHub Actions workflow that runs them still has to be added by
  someone whose token can change `.github/workflows/`.
- Not done: `metadata._nbviewer.css` themes. nbviewer's template for them is
  broken (it links `css/theme/{{css_theme}}.css` literally), so nbviewer.org
  ignores the setting too.

### Phase 4: hardening and rollout

- Sandboxed, opaque-origin iframe for notebook content; then optional
  user-supplied GitHub tokens.
- A Content-Security-Policy, if it can be made to fit: `srcdoc` frames
  inherit the page's policy, so the HTML file view needs inline and data:
  scripts and styles, or its own origin.
- GitHub Enterprise hosts as build-time config.
- Decide on indexing (pages start as `noindex`), analytics, and whether
  nbviewer.org should send some traffic (bots, say) to nbviewerlite.
