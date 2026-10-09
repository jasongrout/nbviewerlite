# Frequently Asked Questions

[TOC]

## What is nbviewer lite?

nbviewer lite is a version of [nbviewer](https://github.com/jupyter/nbviewer)
that runs in your browser. Enter the URL of a Jupyter notebook, and it shows
the notebook as a web page at a stable link that you can share with others.
It also browses the notebooks in GitHub repositories and gists, and shows
notebooks as slides or as scripts.

It has no application server. The site is a set of static files: the same
page answers every notebook URL, then your browser fetches the notebook and
renders it.

## How is it different from nbviewer.org?

Project Jupyter runs [nbviewer.org](https://nbviewer.org), a free, public
nbviewer. It fetches notebooks on its server and renders them with
[nbconvert](https://github.com/jupyter/nbconvert). nbviewer lite does that work
in your browser instead:

- Your browser fetches the notebook, so the site that hosts it has to allow
  that (see [CORS](#why-cant-nbviewer-lite-load-a-notebook-from-a-url)).
- Your browser makes the GitHub API requests, so they count against your own
  [rate limit](#why-do-i-get-a-github-rate-limit-error), not one shared by
  everyone.
- Notebooks are rendered with JupyterLab's own components, so they look as they
  do in JupyterLab.
- Nothing is cached on a server: each visit fetches the notebook again.

Both use the same paths: to see a notebook from nbviewer.org here, replace
`nbviewer.org` in its link with this site's address, and the other way around.
Notebook pages and error messages link to the same page on nbviewer.org.

## How do I link to a notebook?

Paste its URL, a GitHub user or repository name, or a gist ID into the form on
the [front page](/), and share the address of the page you get. Links are paths
on this site, as on nbviewer.org:

- `/urls/{host}/{path}` for a notebook at `https://{host}/{path}`, and
  `/url/{host}/{path}` for one at `http://{host}/{path}` (fetched over https
  anyway, since a secure page can't load insecure content);
- `/github/{user}/{repo}/blob/{branch}/{path}` for a notebook on GitHub,
  `/github/{user}/{repo}/tree/{branch}/{path}/` for a directory,
  `/github/{user}/{repo}/` for a repository and `/github/{user}/` for a user's
  repositories;
- `/gist/{user}/{gist ID}` for a gist, and `/gist/{user}/` for a user's gists.

To show a notebook as slides or as a script, put `/format/slides` or
`/format/script` in front of its path. Links in it to other notebooks keep
the format. To link to a section of a notebook, add
`#` and the section's ID, which the ¶ link next to its heading has.

## Why can't nbviewer lite load a notebook from a URL?

Browsers let a page read a file from another site only if that site allows it,
with [CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)
headers (`Access-Control-Allow-Origin`). GitHub (raw files and gists), GitHub
Pages, GitLab and Hugging Face send them; many other web servers don't.

nbviewer.org fetches notebooks on its server, where CORS doesn't apply, so when
nbviewer lite can't fetch a notebook, its error message links to the same
notebook on nbviewer.org. If you run the web server that hosts the notebook, you
can add the header to its responses: `Access-Control-Allow-Origin: *`.

## Why do I get a GitHub rate limit error?

Directory listings, repository and user pages, and gists come from the GitHub
API, which answers 60 requests per hour per IP address to visitors who aren't
signed in. Here your browser makes those requests, so they count against the
limit of your IP address, which you may share with others on your network. The
error message says when the limit resets.

A directory listing takes one request, a repository's front page two, and a
gist one. Notebooks in GitHub repositories load from raw.githubusercontent.com,
which isn't part of the API and has no such limit.

## Which notebooks can nbviewer lite show?

Notebooks in every version of the notebook format. nbformat 4, which Jupyter
has written since 2015, renders as it is. Older notebooks (nbformat 1, 2 and 3,
from IPython) are first converted to nbformat 4 in your browser, the way
Jupyter's `nbformat` library upgrades them.

Outputs render with JupyterLab's renderers: HTML, Markdown, LaTeX math, images,
SVG, PDF, JSON, Vega and Vega-Lite charts, Mermaid diagrams and JavaScript.

HTML files in GitHub repositories and gists show as web pages, as on
nbviewer.org, with the stylesheets and scripts they load from the same
repository. They run in a sandboxed frame, apart from the rest of the site.

## Can nbviewer lite run my Python, Julia, R, Scala, etc. notebooks?

No. Like nbviewer, it doesn't execute notebooks. It only shows the inputs and
outputs saved in the notebook file.

[mybinder.org](https://mybinder.org/) is a separate web service that lets you
open notebooks in an executable environment, making your code immediately
reproducible by anyone, anywhere. For notebooks in GitHub repositories and in
gists, nbviewer lite shows an _Execute on Binder_ button at the top of the
page.

[Try Jupyter](https://jupyter.org/try-jupyter/) runs JupyterLab and Jupyter
Notebook in your browser, with [JupyterLite](https://jupyterlite.readthedocs.io/)
kernels for Python and a few other languages. For every notebook, nbviewer
lite shows _Open in JupyterLab_ and _Open in Jupyter Notebook_ buttons at the
top of the page, which open a copy of the notebook there. Libraries that the
notebook needs may not be available in the browser, and Try Jupyter keeps your
changes in your browser's storage only.

## Why does the Execute on Binder button lead to a Binder failure?

Binder tries to build a Docker image containing the notebooks and requirements
declared in a git repository. The build will fail if the repository has a
`Dockerfile`, `requirements.txt`, `environment.yml`, etc. with issues. We
suggest letting the repository owner know about the problem or submitting a
pull request to help fix it.

## Why does a notebook not run correctly after I click the Execute on Binder button?

Binder builds a Docker image containing the notebooks in a git repository.
Those notebooks may have requirements to run correctly such as libraries and
data files. Binder can install these prerequisites as part of its build
process, if the git repository [declares them in a supported
manner](https://mybinder.readthedocs.io/en/latest/using.html#preparing-a-repository-for-binder).

If a notebook does not run properly in its Binder environment, we suggest
letting the repository owner know about the problem or submitting a pull
request to help fix it.

## Does JavaScript embedded in notebooks work?

Yes, as on nbviewer.org. This lets plots from Plotly, Bokeh and Altair remain
interactive, for example. It also means that arbitrary JavaScript may execute
when you visit the page, as it would on any page you visit on the Internet. The
site keeps no cookies, accounts or other secrets for that JavaScript to read,
and doesn't let it use your camera, microphone or location.

## Do interactive widgets work?

Widgets (ipywidgets and libraries built on them, such as bqplot) show the state
saved in the notebook, if the notebook was saved with its widget state: in
JupyterLab, turn on _Save Widget State Automatically_ in the _Settings_ menu
before saving. There is no kernel behind them, so changing a widget doesn't run
any code, but widgets linked in the browser (`jslink`) still update each other.
Widget libraries other than ipywidgets' own controls load from the jsDelivr
CDN.

## Can I load a private notebook?

nbviewer lite can only show notebooks that your browser can fetch without
signing in: in public GitHub repositories, in public gists, or at public URLs.
If you are working on a notebook on your local machine, publish it somewhere
with a public URL first (e.g., in a [GitHub repository](https://github.com) or
as a [gist](https://gist.github.com)).

## Why do I get a 404: Not Found error?

The URL you are visiting most likely points to a notebook that was moved or
deleted. If you clicked a link on a site that led to the error, we suggest you
contact the site owner to report the broken link. If a notebook author gave you
the URL, we recommend asking them for an updated link.

If one of the links on nbviewer lite's front page is broken, please report it in
the [issue tracker](https://github.com/jasongrout/nbviewerlite/issues).

## Why do I get an error when I try to view a notebook?

nbviewer lite fetches notebooks from the sites that host them (GitHub, gists,
other web servers). You will see an error if the site doesn't respond, doesn't
let your browser fetch the file (see
[CORS](#why-cant-nbviewer-lite-load-a-notebook-from-a-url)), the file is not
publicly accessible, the file is not a valid notebook, and so on. The error
message links to the same page on nbviewer.org, which may be able to show it.

If you believe nbviewer lite is incorrectly showing an error for a valid
notebook that nbviewer.org shows, please file a bug in the [issue
tracker](https://github.com/jasongrout/nbviewerlite/issues).

## Why is nbviewer lite showing an outdated version of my notebook?

nbviewer lite has no cache of its own (so there is no `?flush_cache=true`):
each visit fetches the notebook again. But raw.githubusercontent.com may serve
a file for up to 5 minutes after it changes, and your browser may keep its own
copy for as long. Try again a few minutes later.

## How do you choose the notebooks featured on the front page?

They are the ones nbviewer.org features on its front page, as far as nbviewer
lite can show them. Suggestions are welcome in the [issue
tracker](https://github.com/jasongrout/nbviewerlite/issues).

## How can I remove a notebook from nbviewer lite?

nbviewer lite does not store any notebooks, it only renders notebooks stored
elsewhere on the web given their URLs. If you've found a notebook that you
think should be removed from the web, you'll need to locate where it is hosted
(e.g., on GitHub) in order to update or remove it.

## Can I use nbviewer lite to convert my notebook to a format other than HTML?

It can show a notebook as slides or as a script, and the script page has a
download link. For other formats, you can [install
nbconvert](https://nbconvert.readthedocs.io/en/stable/install.html) locally and
run `jupyter nbconvert` to convert notebook files to a variety of formats. See
the [nbconvert documentation](https://nbconvert.readthedocs.io/) for details.

## Can I run my own nbviewer lite?

Yes. It is a static site: build it, and serve the files from a static host that
can answer notebook URLs with its `index.html`. Please see the README in the
[nbviewer lite repository on GitHub](https://github.com/jasongrout/nbviewerlite)
for instructions. To run an nbviewer server, which can also render notebooks
from private networks, see the [nbviewer
repository](https://github.com/jupyter/nbviewer).

## How can I report a bug with nbviewer lite or suggest a feature?

Please open an issue in the [nbviewer lite issue tracker on
GitHub](https://github.com/jasongrout/nbviewerlite/issues). If a notebook
renders differently than on nbviewer.org, please include its URL.

## Where can I ask additional questions?

Please post your questions about using Jupyter in the [Jupyter Community
Forum](https://discourse.jupyter.org/). Questions about nbviewer lite itself
are welcome in its [issue
tracker](https://github.com/jasongrout/nbviewerlite/issues).
