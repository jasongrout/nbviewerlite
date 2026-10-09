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
  path). Status 200 makes them rewrites, not redirects: the address bar and
  `location.pathname` keep the original path, which the app then reads.
  Cloudflare applies rules "regardless of whether or not an asset matches
  the incoming request"
  ([docs](https://developers.cloudflare.com/pages/configuration/redirects/)),
  which is fine because no files live under these prefixes; a catch-all `/*`
  would also capture the assets (Cloudflare rejects it as an infinite loop,
  as it does any rule pointing at `/index.html`, hence `/`).
- Every other unknown path gets `404.html` (`not_found_handling =
  "404-page"`), which is the app too, with status 404: unknown URLs are real
  404s, and nbviewer's old bare gist-id URLs (`/{id}`, which no rule can match
  without also matching `/favicon.ico`) still work, because the app redirects
  them to `/gist/{id}`.
- Missing `/static/` files get `static/404.html` (status 404), not the app.
- `_headers`: basic security headers, and a `Permissions-Policy` (see Trust
  and security), on every response. Assets keep the default caching
  (revalidated with ETags): not everything under `/static/` is
  content-hashed (RequireJS carries its version instead, and the front-page
  thumbnails aren't), and a year-long `immutable` header would also stick to
  whatever a missing asset path returned.
- `wrangler.toml` names the Worker and its assets directory, and
  `.node-version` pins Node.js for the build. (Cloudflare Pages would serve
  the same files the same way, with `pages_build_output_dir` instead.)

Locally, `npm run preview` (a small Node server) and `npx wrangler dev`
(Cloudflare's emulator) serve the build the same way, headers included.
Netlify reads the same `_redirects`, `_headers` and `404.html`. Other hosts
need the same rewrites, or at least `index.html` for every path that isn't
a file (nginx `try_files $uri /index.html`). GitHub Pages can't rewrite;
its `404.html` workaround answers every viewer URL with HTTP 404.

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
GET /github/u/r/blob/main/a.ipynb  ---->  _redirects rewrite: index.html (200)
GET /static/js/main.<hash>.js      ---->  file
GET /some/other/path               ---->  404.html (the app too; 404)
app reads location.pathname
  -> route: [format/{html,slides,script}/] url | urls | github | gist; faq
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
| Themes | `@jupyterlab/theme-light-extension` and `theme-dark-extension` CSS variables (the dark ones scoped to `:root[data-nbv-theme='dark']` at build time) |
| Icons | `@jupyterlab/ui-components` SVG icons (folder, notebook, file, ...) |
| JSON, PDF, Vega/Vega-Lite outputs | `@jupyterlab/json-extension`, `@jupyterlab/pdf-extension`, `@jupyterlab/vega5-extension` |
| Mermaid (outputs and Markdown) | `@jupyterlab/mermaid` |
| ipywidgets | `@jupyter-widgets/html-manager` (with `base`, `controls`, `output`) |
| Slideshows | reveal.js 6 (theme simple, notes plugin) |
| FAQ Markdown | `marked` (JupyterLab's Markdown parser) |

The page shell (header, link bar, listings) is a small hand-written HTML/CSS
layer in JupyterLab's visual language, colored with its theme variables;
nbviewer's Bootstrap 3 and LESS build are not carried over. jQuery and
RequireJS stay on the page as globals,
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
and can't reach the site's DOM or storage. The site holds no secrets (no
cookies, no tokens), so notebook code can't steal anything from it. Before
anything secret lives on the origin (say, an optional GitHub token for
higher rate limits), rendering must move into a sandboxed, opaque-origin
iframe (phase 4).

Browsers grant permissions per origin, so one that a visitor gives a
notebook (their location, say) would hold for every notebook. `_headers`
sends a `Permissions-Policy` that turns off camera, microphone,
geolocation, screen capture, MIDI, USB, serial, HID and payment requests
for the whole site; fullscreen stays on, for slides and outputs.

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
  fetched and inlined as data: URLs. Per page: at most 32 files and 10 MB
  fetched, 20 MB of data: URLs written (a file used twice counts twice),
  and 64 nested `@import`s; what doesn't fit keeps its URL and doesn't load.
  `javascript:` links and form actions (nbconvert's "toggle code" form, for
  one) run in the frame, as on nbviewer.org. Stylesheets and scripts a page
  adds at run time with relative URLs (`document.write`, RequireJS paths,
  module imports) don't load, nor do frames of other repo files
  (raw.githubusercontent.com forbids framing). The frame has a fixed height,
  the window below the header.

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

- Notebooks render as JupyterLab shows them, where that differs from
  nbviewer.org: JupyterLab's renderers and their ranks, and the view state
  saved in cell metadata (collapsed outputs and hidden inputs as expandable
  placeholders, scrolled outputs). Not yet: collapsed headings
  (`jp-MarkdownHeadingCollapsed`), which JupyterLab applies through its
  table of contents.
- nbformat 1, 2 and 3 notebooks upgrade to nbformat 4 in the browser
  (`src/convert.ts`, chosen by `parseNotebook` in `src/load.ts`): a port of
  Python nbformat's readers (`rejoin_lines`) and upgrades, tested against
  nbformat's own output. nbformat 1 files have no `nbformat` key: Python
  reads every notebook without one as nbformat 1, nbviewer lite only those
  with nbformat 1's text and code cells, so nbformat 4 notebooks that lost
  the key still render. Code in notebooks that don't name their language
  (all nbformat 1 to 3 ones) is highlighted as Python, in the notebook and
  in `format/script/`, like nbconvert's default lexer.
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
  redirects and links in notebooks and HTML files keep the format, listings
  show as usual, and notebook pages link to the formats that apply ("View
  as Slides" only with slide metadata).
  - Script: a port of nbconvert's ScriptExporter: the python template (with
    IPython's transformations of magics, shell escapes and help, as IPython
    9 makes them on Python 3.14, nbviewer.org's version: the tokenizer is a
    port of CPython 3.14's, f-strings and t-strings included) when
    `language_info.nbconvert_exporter` is `python`, otherwise the generic one
    with `language_info.file_extension`. Shown highlighted, with a download
    link: a page, where nbviewer.org answers with `text/plain`.
  - Slides: cells grouped as nbconvert does (slides, subslides, fragments,
    notes, skipped cells). The notebook renders once with JupyterLab and the
    cell nodes move into reveal.js sections, so every output type works.
    The theme's fonts come from the site, not from Google Fonts.
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

Isolating notebook content comes before tokens; the other items are
independent of each other. Suggested order: indexing and analytics
decisions; nbviewer.org's fallback on rate-limit exhaustion; the sandboxed
frame; tokens, then a Content-Security-Policy; GitHub Enterprise on demand.

**Notebook content in a sandboxed iframe, then optional GitHub tokens.**
Notebook HTML and JavaScript run on the site's origin, as on nbviewer.org,
which is acceptable only while the origin holds nothing worth stealing. A
token in localStorage would be readable by any notebook.

- The page around the notebook (header, links, routing, fetching, errors)
  stays on the site's origin. Notebooks render in an iframe with `sandbox`
  but without `allow-same-origin`, an opaque origin like the HTML file
  view's. The page fetches the notebook (with the token, if any) and posts
  the parsed JSON to the frame; the frame never sees the token.
- The frame is its own page (`frame.html`) loading the render bundle; a
  `srcdoc` frame resolves relative asset URLs awkwardly. From an opaque
  origin, every font and script is a cross-origin request, so `/static/`
  needs `Access-Control-Allow-Origin` (in `_headers`). Alternative: serve the
  frame from a second registrable domain (the githubusercontent.com
  pattern) with `allow-same-origin`, which gives it a real origin of its own.
- Across the boundary: the frame reports its height (`ResizeObserver`,
  `postMessage`) so the page doesn't scroll twice; relative links navigate
  the top window (`target=_top` with
  `allow-top-navigation-by-user-activation`, or a message); fragments go
  both ways, since the page owns the URL. `format/slides/` moves into the
  frame with reveal's hash and keyboard focus.
- What notebooks lose: widgets, RequireJS and CDN loads keep working
  (jsDelivr answers `Origin: null`), but localStorage, cookies and
  `window.parent` don't exist for them; Chrome refuses its PDF viewer in
  sandboxed frames (so `application/pdf` needs the second-domain option or
  a link); clipboard and downloads need `clipboard-write` and
  `allow-downloads`.
- Tokens, after that: a read-only fine-grained personal access token that
  the visitor pastes into a settings page, kept in localStorage. It raises
  the API limit from 60 to 5,000 requests per hour, and makes private
  repositories viewable for its holder; raw.githubusercontent.com doesn't
  take an `Authorization` header across origins, so private notebooks load
  through the Contents API (`Accept: application/vnd.github.raw+json`).
  "Sign in with GitHub" needs a token-exchange function (e.g. a Worker
  script), because GitHub's OAuth token endpoints (web and device flow)
  send no CORS headers: it would be the project's first server code. Never
  put tokens in URLs; keep `Referrer-Policy` strict.

**A Content-Security-Policy.** Defense in depth for the page once it holds
a token; before isolation it adds little, since notebook JavaScript runs on
the page by design.

- A strict policy for the page (scripts from `'self'`; connections to
  GitHub and the configured hosts) and a permissive one for the frame
  (inline scripts, `eval` for some widget libraries, `data:`, CDNs), per
  path in `_headers`.
- `srcdoc` frames inherit the page's policy: the HTML file view needs one
  that allows inline and `data:` scripts and styles, or a page and origin of
  its own, as above.
- Most of the work: listing every origin the app talks to (GitHub API, raw,
  gists, jsDelivr) and running the end-to-end tests under the policy.

**GitHub Enterprise hosts as build-time config.** nbviewer supports one
instance through `GITHUB_API_URL`; organizations running nbviewer for
GitHub Enterprise Server could use a static deployment instead.

- Build variables for the API, raw and web URLs replace the constants in
  `src/github.ts`; `/github/` points at the configured instance, one per
  deployment, as in nbviewer. Landing-page examples and the nbviewer.org
  link follow the configuration or turn off.
- What decides feasibility: whether the instance's API and raw endpoints
  send CORS headers to the site (likely an allowlist, or a proxy); most
  instances are private, so tokens (above), and probably OAuth through the
  instance, with the same CORS problem; raw URLs at `/raw/` or on a raw
  subdomain, depending on subdomain isolation.

**Indexing, analytics, and how nbviewer.org uses nbviewer lite.**

- Indexing: pages start as `noindex`. Googlebot runs JavaScript, so it
  could index rendered notebooks (fetching from GitHub from Google's IPs),
  but nbviewer.org's pages are already indexed: stay `noindex`, or point to
  nbviewer.org with `<link rel="canonical">`. Error pages answer 200 under
  viewer prefixes; once indexed, they should add `noindex` at run time.
  Crawlers without JavaScript see an empty page.
- Analytics: failure rates matter most (CORS failures on `/url/`, rate
  limits, rendering failures). Cloudflare's request analytics need no
  client script but see only paths; Cloudflare Web Analytics is a
  cookieless beacon for page views; reporting error kinds without
  identifiers needs a small endpoint (server code again). The FAQ should say
  what's collected.
- Traffic from nbviewer.org, in increasing reach:
  - a "View in nbviewer lite" link on its pages;
  - redirect to the same path here when its GitHub API quota is exhausted,
    instead of an error page: visitors then spend their own quota. Our
    error pages link back to nbviewer.org, so the redirect needs a marker
    (e.g. `?from=nbviewer`) that suppresses the way back;
  - redirect the views that cost it API requests on every uncached visit
    (directory listings, user and repo pages), keeping notebook renders,
    which it caches;
  - bots by user agent: sheds load from scrapers, but crawlers without
    JavaScript get nothing to index;
  - a percentage of visitors, with an opt-out cookie, watching failure
    rates.
- Before redirecting anyone: parity gaps go through the error pages' links
  to nbviewer.org; URLs stay identical; agree with nbviewer.org's
  maintainers on who runs the domain and the hosting account.
