/**
 * End-to-end test fixtures: notebooks, GitHub API data, and the network that
 * serves them. Every request to a host other than the app's is answered here
 * or aborted, so the tests never touch the network:
 *
 *   test('...', async ({ page, web, github }) => {
 *     web.file('https://nb.example/a.ipynb', notebook([markdown('# A')]));
 *     github.files('user', 'repo', 'main', { 'b.ipynb': notebook([]) });
 *     await page.goto('/urls/nb.example/a.ipynb');
 *   });
 *
 * web.host() answers whole hosts (a CDN, say) and github.on() any API path.
 * A test fails if the page requested anything that has no fixture, or threw
 * an uncaught error.
 */

import { createHash } from 'node:crypto';

import {
  expect,
  type Locator,
  type Page,
  type Request,
  type Route,
  test as base
} from '@playwright/test';

export { expect };

// Notebooks

type Json = Record<string, unknown>;
type Source = string | string[];

/** An nbformat 4.5 notebook; cells get ids. */
export function notebook(cells: Json[], metadata: Json = {}): Json {
  return {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      kernelspec: {
        name: 'python3',
        display_name: 'Python 3',
        language: 'python'
      },
      language_info: { name: 'python' },
      ...metadata
    },
    cells: cells.map((cell, i) => ({ id: `cell-${i}`, ...cell }))
  };
}

export function markdown(source: Source): Json {
  return { cell_type: 'markdown', metadata: {}, source };
}

export function code(source: Source, outputs: Json[] = []): Json {
  return {
    cell_type: 'code',
    metadata: {},
    execution_count: 1,
    source,
    outputs
  };
}

export function rawCell(source: Source): Json {
  return { cell_type: 'raw', metadata: {}, source };
}

/** A display_data output, from a MIME bundle. */
export function displayData(data: Json): Json {
  return { output_type: 'display_data', metadata: {}, data };
}

export function executeResult(data: Json): Json {
  return {
    output_type: 'execute_result',
    execution_count: 1,
    metadata: {},
    data
  };
}

export function stream(text: Source, name = 'stdout'): Json {
  return { output_type: 'stream', name, text };
}

export function errorOutput(
  ename: string,
  evalue: string,
  traceback: string[]
): Json {
  return { output_type: 'error', ename, evalue, traceback };
}

/** Markdown paragraphs that push what follows below the fold. */
export function filler(count: number): Json[] {
  return Array.from({ length: count }, (_, i) =>
    markdown(`Filler paragraph ${i}.\n\n` + 'Lorem ipsum. '.repeat(60))
  );
}

/** An 8x8 orange PNG, base64-encoded as in notebook outputs. */
export const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR42mP4XK6GFTEMLQkARlFkAYQy5GwAAAAASUVORK5CYII=';

// The network

/** Response bodies: text, bytes, or JSON (notebooks, API data). */
export type Body = string | Buffer | object;

export interface IFileOptions {
  status?: number;
  /**
   * Allow cross-origin reads (the default). false: the browser refuses them,
   * as for the many hosts that send no CORS headers.
   */
  cors?: boolean;
  /** Defaults to JSON for objects, plain text for strings. */
  contentType?: string;
  headers?: Record<string, string>;
}

export interface IResponse extends IFileOptions {
  body?: Body;
}

type Handler = (request: Request) => IResponse | null;

/** Text and bytes as they are, anything else as JSON. */
function serialize(body: Body): string | Buffer {
  return typeof body === 'string' || Buffer.isBuffer(body)
    ? body
    : JSON.stringify(body);
}

const IMAGE_TYPES: Record<string, string> = {
  gif: 'image/gif',
  jpg: 'image/jpeg',
  png: 'image/png',
  svg: 'image/svg+xml'
};

function defaultContentType(body: Body, url: URL): string {
  if (typeof body === 'string') {
    return 'text/plain; charset=utf-8';
  }
  if (Buffer.isBuffer(body)) {
    const extension = /\.(\w+)$/.exec(url.pathname)?.[1].toLowerCase() ?? '';
    return IMAGE_TYPES[extension] ?? 'application/octet-stream';
  }
  return 'application/json; charset=utf-8';
}

/**
 * Hosts other than the app's. Requests go to the first of: a file
 * registered for the URL (one registered without a query string answers
 * any query, as static hosts do), a handler for the URL's origin; anything
 * else is aborted and recorded in `unhandled`.
 */
export class Web {
  /** Requests that fixtures answered (or failed, see down()), as "METHOD url". */
  readonly requests: string[] = [];
  /** Requests that had no fixture and were aborted, as "METHOD url". */
  readonly unhandled: string[] = [];
  private readonly files = new Map<string, IResponse>();
  private readonly hosts = new Map<string, Handler>();
  private readonly unreachable = new Set<string>();

  /** Serve `body` at `url`, with CORS unless `options` say otherwise. */
  file(url: string, body: Body, options: IFileOptions = {}): void {
    this.files.set(new URL(url).href, { ...options, body });
  }

  /** Answer requests to `origin` (e.g. "https://api.github.com"). */
  host(origin: string, handler: Handler): void {
    this.hosts.set(new URL(origin).origin, handler);
  }

  /** Make requests to `origin` fail as if its name didn't resolve. */
  down(origin: string): void {
    this.unreachable.add(new URL(origin).origin);
  }

  async handle(route: Route): Promise<void> {
    const request = route.request();
    const url = new URL(request.url());
    url.hash = '';
    const label = `${request.method()} ${url.href}`;
    if (this.unreachable.has(url.origin)) {
      this.requests.push(label);
      return route.abort('namenotresolved');
    }
    const response =
      this.files.get(url.href) ??
      this.files.get(url.origin + url.pathname) ??
      this.hosts.get(url.origin)?.(request);
    if (!response) {
      this.unhandled.push(label);
      return route.abort('blockedbyclient');
    }
    this.requests.push(label);
    // Never a redirect: Playwright wouldn't route the request it leads to.
    const { status = 200, body = '', cors = true, headers = {} } = response;
    return route.fulfill({
      status,
      body: serialize(body),
      contentType: response.contentType ?? defaultContentType(body, url),
      headers: {
        // Without the header, Playwright would add one that allows the page
        // (playwright#12929); allowing another origin is refused the same
        // way as not sending it.
        'Access-Control-Allow-Origin': cors ? '*' : 'https://other.example',
        ...headers
      }
    });
  }
}

// GitHub

const API = 'https://api.github.com';
const RAW = 'https://raw.githubusercontent.com';
const GIST_RAW = 'https://gist.githubusercontent.com';

/** When the fake rate limit resets: 2030-03-17 17:46:40 UTC. */
export const RATE_LIMIT_RESET = 1_900_000_000;

// What api.github.com sends with every response.
const API_CORS_HEADERS = {
  'Access-Control-Expose-Headers':
    'ETag, Link, Location, Retry-After, X-GitHub-OTP, X-RateLimit-Limit, ' +
    'X-RateLimit-Remaining, X-RateLimit-Used, X-RateLimit-Resource, ' +
    'X-RateLimit-Reset, X-OAuth-Scopes, X-Accepted-OAuth-Scopes, ' +
    'X-Poll-Interval, X-GitHub-Media-Type, X-GitHub-SSO, ' +
    'X-GitHub-Request-Id, Deprecation, Sunset'
};

const RAW_NOT_FOUND: IResponse = { status: 404, body: '404: Not Found' };

/** A directory entry for a git submodule hosted outside GitHub. */
export const SUBMODULE = Symbol('submodule');

/** Repository files: notebooks (objects), text, bytes, or SUBMODULE. */
export type RepoFiles = Record<string, Body | typeof SUBMODULE>;

type ApiReply = IResponse | ((query: URLSearchParams) => IResponse | null);

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function fakeSha(...parts: string[]): string {
  return createHash('sha1').update(parts.join('\0')).digest('hex');
}

/** A Contents API entry (GET /repos/{owner}/{repo}/contents/{path}). */
export function contentsEntry(
  owner: string,
  repo: string,
  ref: string,
  path: string,
  kind: 'file' | 'dir' | 'submodule'
): Json {
  const name = path.split('/').pop() ?? path;
  const sha = fakeSha(owner, repo, ref, path);
  const url = `${API}/repos/${owner}/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`;
  const html =
    kind === 'submodule'
      ? null
      : `https://github.com/${owner}/${repo}/${kind === 'dir' ? 'tree' : 'blob'}/${ref}/${encodePath(path)}`;
  const git = `${API}/repos/${owner}/${repo}/git/${kind === 'dir' ? 'trees' : 'blobs'}/${sha}`;
  return {
    name,
    path,
    sha,
    size: 0,
    url,
    html_url: html,
    git_url: kind === 'submodule' ? null : git,
    download_url:
      kind === 'file'
        ? `${RAW}/${owner}/${repo}/${ref}/${encodePath(path)}`
        : null,
    // the API calls submodules "file" in directory listings
    type: kind === 'dir' ? 'dir' : 'file',
    _links: { self: url, git, html }
  };
}

export interface IGistOptions {
  id: string;
  /** null for anonymous gists. */
  owner: string | null;
  description?: string | null;
  /** File names and contents (notebooks as objects). */
  files: Record<string, Body>;
  /** Files whose inline content the API cuts off. */
  truncated?: string[];
}

/** The gists API's view of a gist (GET /gists/{id}). */
export function gistData(options: IGistOptions): Json {
  const { id, owner, description = null, truncated = [] } = options;
  // raw URLs name the gist's revision
  const revision = `${GIST_RAW}/${owner ?? 'anonymous'}/${id}/raw/${fakeSha(id)}`;
  const files = Object.entries(options.files).map(([filename, content]) => {
    const text = serialize(content).toString();
    const cut = truncated.includes(filename);
    return {
      filename,
      type: 'text/plain',
      language: filename.endsWith('.ipynb') ? 'Jupyter Notebook' : null,
      raw_url: `${revision}/${encodeURIComponent(filename)}`,
      size: text.length,
      truncated: cut,
      content: cut ? text.slice(0, 20) : text
    };
  });
  return {
    id,
    url: `${API}/gists/${id}`,
    html_url: `https://gist.github.com/${id}`,
    description,
    public: true,
    owner: owner === null ? null : { login: owner },
    files: Object.fromEntries(files.map(file => [file.filename, file])),
    truncated: false
  };
}

/** The repos API's view of a repository (GET /repos/{owner}/{repo}). */
export function repoData(owner: string, name: string, defaultBranch = 'main') {
  return {
    id: Number.parseInt(fakeSha(owner, name).slice(0, 8), 16),
    name,
    full_name: `${owner}/${name}`,
    owner: { login: owner },
    html_url: `https://github.com/${owner}/${name}`,
    default_branch: defaultBranch
  };
}

/**
 * api.github.com, raw.githubusercontent.com and gist.githubusercontent.com.
 * API requests count against a rate limit of 60, with GitHub's headers;
 * paths without a fixture get GitHub's 404.
 */
export class GitHub {
  /** API requests, as decoded path and query. */
  readonly requests: string[] = [];
  /** API requests left before GitHub answers 403 (rate limit exceeded). */
  remaining = 60;
  private readonly routes: [string, ApiReply][] = [];
  private readonly repos = new Map<string, Map<string, RepoFiles[string]>>();
  private readonly renamed = new Map<string, string>();
  private readonly web: Web;

  constructor(web: Web) {
    this.web = web;
    web.host(API, request => this.answer(request));
    web.host(RAW, () => RAW_NOT_FOUND);
    web.host(GIST_RAW, () => RAW_NOT_FOUND);
  }

  /**
   * Answer GET `path` (decoded, e.g. "/repos/u/r") with `reply`, or with
   * what `reply` returns for the query (null: not found).
   */
  on(path: string, reply: ApiReply): void {
    this.routes.push([path.replace(/(.)\/$/, '$1'), reply]);
  }

  /** Files of a repository at `ref`, with directory listings for them. */
  files(owner: string, repo: string, ref: string, files: RepoFiles): void {
    const key = `${owner}/${repo}@${ref}`;
    const tree = this.repos.get(key) ?? new Map();
    this.repos.set(key, tree);
    for (const [path, content] of Object.entries(files)) {
      tree.set(path, content);
      if (content !== SUBMODULE) {
        this.web.file(
          `${RAW}/${owner}/${repo}/${encodePath(ref)}/${encodePath(path)}`,
          serialize(content)
        );
      }
    }
  }

  /** GET /repos/{owner}/{repo}, which names the default branch. */
  repo(owner: string, name: string, defaultBranch = 'main'): void {
    this.on(`/repos/${owner}/${name}`, {
      body: repoData(owner, name, defaultBranch)
    });
  }

  /** The repository's branches and tags. */
  refs(owner: string, repo: string, branches: string[], tags: string[]): void {
    const commit = (name: string) => ({
      name,
      commit: { sha: fakeSha(name), url: '' }
    });
    this.on(`/repos/${owner}/${repo}/branches`, {
      body: branches.map(commit)
    });
    this.on(`/repos/${owner}/${repo}/tags`, { body: tags.map(commit) });
  }

  /**
   * A renamed or transferred repository: requests for the old name get the
   * new one's data, which names the new owner and repository.
   */
  rename(from: string, to: string): void {
    this.renamed.set(from, to);
  }

  /** A user's repositories, most recently updated first, page by page. */
  userRepos(user: string, pages: string[][]): void {
    this.paginated(
      `/users/${user}/repos`,
      pages.map(names => names.map(name => repoData(user, name))),
      { sort: 'updated' }
    );
  }

  /** A gist (GET /gists/{id}), its raw files, and its data. */
  gist(options: IGistOptions): Json {
    const data = gistData(options);
    for (const file of Object.values(data.files as Record<string, Json>)) {
      const content = options.files[file.filename as string];
      this.web.file(file.raw_url as string, serialize(content));
    }
    this.on(`/gists/${options.id}`, { body: data });
    return data;
  }

  /** A user's gists, page by page (the list API leaves out file content). */
  userGists(user: string, pages: Json[][]): void {
    const listed = (gist: Json) => ({
      ...gist,
      files: Object.fromEntries(
        Object.entries(gist.files as Record<string, Json>).map(
          ([name, { content: _content, truncated: _truncated, ...file }]) => [
            name,
            file
          ]
        )
      )
    });
    this.paginated(
      `/users/${user}/gists`,
      pages.map(page => page.map(listed))
    );
  }

  /**
   * A paginated list: the `page` query parameter (default 1) picks one of
   * `pages`, and the Link header points to the others, as on GitHub.
   * `params` must be in the query.
   */
  paginated(
    path: string,
    pages: unknown[][],
    params: Record<string, string> = {}
  ) {
    this.on(path, (query): IResponse | null => {
      if (
        Object.entries(params).some(([key, value]) => query.get(key) !== value)
      ) {
        return null;
      }
      const page = Number(query.get('page') ?? '1');
      if (!(page >= 1 && page <= pages.length)) {
        return { body: [] };
      }
      const link = (n: number, rel: string) => {
        const url = new URL(API + path);
        for (const [key, value] of query) {
          url.searchParams.set(key, value);
        }
        url.searchParams.set('page', String(n));
        return `<${url.href}>; rel="${rel}"`;
      };
      const rels = [];
      if (page > 1) {
        rels.push(link(page - 1, 'prev'));
      }
      if (page < pages.length) {
        rels.push(link(page + 1, 'next'), link(pages.length, 'last'));
      }
      if (page > 1) {
        rels.push(link(1, 'first'));
      }
      return {
        body: pages[page - 1],
        headers: rels.length ? { Link: rels.join(', ') } : {}
      };
    });
  }

  private answer(request: Request): IResponse {
    const url = new URL(request.url());
    this.requests.push(decodeURIComponent(url.pathname + url.search));
    const rateLimit = (remaining: number) => ({
      'X-RateLimit-Limit': '60',
      'X-RateLimit-Remaining': String(remaining),
      'X-RateLimit-Used': String(60 - remaining),
      'X-RateLimit-Reset': String(RATE_LIMIT_RESET),
      'X-RateLimit-Resource': 'core'
    });
    if (this.remaining <= 0) {
      return {
        status: 403,
        body: {
          message:
            "API rate limit exceeded for 203.0.113.7. (But here's the good " +
            'news: Authenticated requests get a higher rate limit. Check out ' +
            'the documentation for more details.)',
          documentation_url:
            'https://docs.github.com/rest/overview/resources-in-the-rest-api#rate-limiting'
        },
        headers: { ...API_CORS_HEADERS, ...rateLimit(0) }
      };
    }
    this.remaining -= 1;
    const reply: IResponse = this.route(url) ?? {
      status: 404,
      body: {
        message: 'Not Found',
        documentation_url: 'https://docs.github.com/rest',
        status: '404'
      }
    };
    return {
      ...reply,
      headers: {
        ...API_CORS_HEADERS,
        ...rateLimit(this.remaining),
        ...reply.headers
      }
    };
  }

  private route(url: URL): IResponse | null {
    let path = decodeURIComponent(url.pathname).replace(/(.)\/$/, '$1');
    // GitHub redirects requests for a renamed repository, and fetch follows
    // the redirect. Playwright wouldn't route the redirected request, so
    // answer as if it had been followed.
    const [, user, repo, rest = ''] =
      /^\/repos\/([^/]+)\/([^/]+)(\/.*)?$/.exec(path) ?? [];
    const newName = this.renamed.get(`${user}/${repo}`);
    if (newName) {
      path = `/repos/${newName}${rest}`;
    }
    return this.match(path, url.searchParams);
  }

  private match(path: string, query: URLSearchParams): IResponse | null {
    for (const [routePath, reply] of this.routes) {
      if (routePath === path) {
        const response = typeof reply === 'function' ? reply(query) : reply;
        if (response) {
          return response;
        }
      }
    }
    // contents of repositories set up with files()
    const [, repo, sub = ''] =
      /^\/repos\/([^/]+\/[^/]+)\/contents(?:\/(.*))?$/.exec(path) ?? [];
    return repo ? this.contents(repo, sub, query) : null;
  }

  /** GET /repos/{owner}/{repo}/contents/{path}?ref=... from files(). */
  private contents(
    ownerRepo: string,
    path: string,
    query: URLSearchParams
  ): IResponse | null {
    const ref = query.get('ref');
    const tree = this.repos.get(`${ownerRepo}@${ref}`);
    if (ref === null || !tree) {
      return null;
    }
    const [owner, repo] = ownerRepo.split('/');
    const file = tree.get(path);
    if (file !== undefined && file !== SUBMODULE) {
      const bytes = Buffer.from(serialize(file));
      return {
        body: {
          ...contentsEntry(owner, repo, ref, path, 'file'),
          size: bytes.length,
          encoding: 'base64',
          content: bytes.toString('base64')
        }
      };
    }
    // a directory: its children, in git's (byte) order
    const prefix = path ? path + '/' : '';
    const children = new Map<string, 'file' | 'dir' | 'submodule'>();
    for (const [filePath, content] of tree) {
      if (filePath.startsWith(prefix)) {
        const [name, ...below] = filePath.slice(prefix.length).split('/');
        children.set(
          name,
          below.length ? 'dir' : content === SUBMODULE ? 'submodule' : 'file'
        );
      }
    }
    if (!children.size) {
      return null;
    }
    return {
      body: [...children]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([name, kind]) =>
          contentsEntry(owner, repo, ref, prefix + name, kind)
        )
    };
  }
}

// Page helpers

/** The header's link bar ("View on GitHub", "Download Notebook", ...). */
export function headerLinks(page: Page): Locator {
  return page.getByRole('navigation', { name: 'Notebook links' });
}

/**
 * Text and href of each link in `scope`, in order. Not retried: use it with
 * expect.poll, or once the page has settled.
 */
export function links(scope: Locator): Promise<[string, string | null][]> {
  return scope
    .getByRole('link')
    .evaluateAll(anchors =>
      anchors.map(a => [
        (a.textContent ?? '').replace(/\s+/g, ' ').trim(),
        a.getAttribute('href')
      ])
    );
}

/** Matches strings that start with `prefix`. */
export function startingWith(prefix: string): RegExp {
  return new RegExp('^' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
}

/** Distance of `locator`'s top edge from the top of the viewport. */
export async function topOf(locator: Locator): Promise<number> {
  return (await locator.boundingBox())?.y ?? Number.NaN;
}

interface IFixtures {
  /** Hosts other than the app's. */
  web: Web;
  /** GitHub's API and raw file hosts. */
  github: GitHub;
  /** Uncaught errors in the page; the test fails unless this ends empty. */
  pageErrors: Error[];
}

export const test = base.extend<IFixtures>({
  web: [
    async ({ context, baseURL }, use) => {
      const web = new Web();
      const app = new URL(baseURL ?? 'http://localhost').origin;
      await context.route(
        url => url.origin !== app,
        route => web.handle(route)
      );
      await use(web);
      await context.unrouteAll({ behavior: 'ignoreErrors' });
      expect(web.unhandled, 'requests without a fixture').toEqual([]);
    },
    { auto: true }
  ],
  github: [async ({ web }, use) => use(new GitHub(web)), { auto: true }],
  pageErrors: [
    async ({ page }, use) => {
      const errors: Error[] = [];
      page.on('pageerror', error => errors.push(error));
      await use(errors);
      expect(errors.map(String), 'uncaught errors in the page').toEqual([]);
    },
    { auto: true }
  ]
});

// ---------------------------------------------------------------------------
// Helpers for the phase 3 specs (nbformat 3, formats, landing page and FAQ)

/** An nbformat 3 notebook (IPython 1 and 2): one worksheet of `cells`. */
export function v3Notebook(cells: Json[], metadata: Json = {}): Json {
  return {
    metadata: { name: '', ...metadata },
    nbformat: 3,
    nbformat_minor: 0,
    worksheets: [{ metadata: {}, cells }]
  };
}

/** The color `locator`'s text is drawn in, as the browser computed it. */
export function textColor(locator: Locator): Promise<string> {
  return locator.evaluate(element => getComputedStyle(element).color);
}

/** How far the page scrolls sideways; 0 or less if it fits the window. */
export function sidewaysScroll(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
}

// ---------------------------------------------------------------------------
// Saved ipywidgets state
// ---------------------------------------------------------------------------

/** Widget-view outputs refer to a model in the notebook's widget state. */
const WIDGET_VIEW = 'application/vnd.jupyter.widget-view+json';
const WIDGET_STATE = 'application/vnd.jupyter.widget-state+json';

/** Module versions in the state that ipywidgets 8 and 7 save. */
const WIDGET_MODULES = {
  8: { base: '2.0.0', controls: '2.0.0', output: '1.0.0' },
  7: { base: '1.2.0', controls: '1.5.0', output: '1.0.0' }
};

type Module = [name: string, version: string];

/** How a model's traits refer to another model. */
export function widgetRef(id: string): string {
  return `IPY_MODEL_${id}`;
}

/** A widget-view output for model `id`, with its text representation. */
export function widgetView(id: string, text: string): Json {
  return displayData({
    [WIDGET_VIEW]: { model_id: id, version_major: 2, version_minor: 0 },
    'text/plain': text
  });
}

/**
 * Widget state as Jupyter saves it in a notebook's metadata ("Save Widget
 * State"), a model at a time. Models get their traits' defaults, so only
 * what matters needs saying:
 *
 *   const widgets = new WidgetState();
 *   const slider = widgets.control('IntSlider', { value: 3 }, 'SliderStyle');
 *   notebook([code('slider', [widgetView(slider, 'IntSlider(value=3)')])],
 *            widgets.metadata());
 */
export class WidgetState {
  /** Model states by id. */
  readonly models: Record<string, Json> = {};
  private readonly base: Module;
  private readonly controls: Module;
  private readonly outputs: Module;

  /** State as ipywidgets `version` (8 or 7) saves it. */
  constructor(version: 7 | 8 = 8) {
    const modules = WIDGET_MODULES[version];
    this.base = ['@jupyter-widgets/base', modules.base];
    this.controls = ['@jupyter-widgets/controls', modules.controls];
    this.outputs = ['@jupyter-widgets/output', modules.output];
  }

  /**
   * Add a model of class `model` from `module`, shown by class `view` from
   * `viewModule` (null: it has no view); returns its id.
   */
  model(
    [module, version]: Module,
    model: string,
    [viewModule, viewVersion]: Module,
    view: string | null,
    state: Json = {}
  ): string {
    const n = Object.keys(this.models).length;
    const id = fakeSha('widget model', String(n)).slice(0, 32);
    this.models[id] = {
      model_module: module,
      model_module_version: version,
      model_name: model,
      state: {
        _model_module: module,
        _model_module_version: version,
        _model_name: model,
        _view_module: viewModule,
        _view_module_version: viewVersion,
        _view_name: view,
        ...state
      }
    };
    return id;
  }

  /** A widget's layout (its CSS: width, border, ...). */
  layout(state: Json = {}): string {
    return this.model(this.base, 'LayoutModel', this.base, 'LayoutView', state);
  }

  /**
   * One of ipywidgets' controls: `name` is its Python class ('IntSlider',
   * 'HBox', ...), shown by `${name}View` unless `state` names another
   * `_view_name` (IntProgress: 'ProgressView'); `style` is its style's
   * class ('SliderStyle'), if it has one.
   */
  control(name: string, state: Json = {}, style?: string): string {
    const styleRef = style
      ? {
          style: widgetRef(
            this.model(this.controls, `${style}Model`, this.base, 'StyleView')
          )
        }
      : {};
    return this.model(
      this.controls,
      `${name}Model`,
      this.controls,
      `${name}View`,
      {
        _dom_classes: [],
        layout: widgetRef(this.layout()),
        ...styleRef,
        ...state
      }
    );
  }

  /** An Output widget showing `outputs` (notebook outputs). */
  output(outputs: Json[]): string {
    return this.model(this.outputs, 'OutputModel', this.outputs, 'OutputView', {
      _dom_classes: [],
      layout: widgetRef(this.layout()),
      msg_id: '',
      outputs
    });
  }

  /** jslink((source, trait), (target, trait)). */
  link(source: [string, string], target: [string, string]): string {
    return this.model(this.controls, 'LinkModel', this.controls, null, {
      source: [widgetRef(source[0]), source[1]],
      target: [widgetRef(target[0]), target[1]]
    });
  }

  /** Notebook metadata with this state. */
  metadata(): Json {
    return {
      widgets: {
        [WIDGET_STATE]: {
          version_major: 2,
          version_minor: 0,
          state: this.models
        }
      }
    };
  }
}

// ---------------------------------------------------------------------------
// Opening a notebook
// ---------------------------------------------------------------------------

/** Serve `nb` as https://nb.example/test.ipynb and open it in the viewer. */
export async function open(
  page: Page,
  web: Web,
  nb: object,
  fragment = ''
): Promise<void> {
  web.file('https://nb.example/test.ipynb', nb);
  await page.goto(`/urls/nb.example/test.ipynb${fragment}`);
}
