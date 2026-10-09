"""Regenerate the test fixtures with the Python originals of what they test:

- script/*.ipynb, each next to nbconvert's script export of it
  (ScriptExporter, as nbviewer's format/script/ uses it), named with the
  extension nbconvert picks;
- script/ipython2python.json: [cell, output] pairs from IPython's
  TransformerManager, which nbconvert's ipython2python filter uses;
- slides.json: cells' slideshow metadata and the slides that nbconvert's
  SlidesExporter makes of them, read back from its <section>s.

Needs nbformat, nbconvert 7, IPython 9 and beautifulsoup4:

    python test/fixtures/generate.py
"""
import json
import os
import random

import nbformat
from bs4 import BeautifulSoup
from IPython.core.inputtransformer2 import TransformerManager
from nbconvert.exporters import ScriptExporter, SlidesExporter

HERE = os.path.dirname(os.path.abspath(__file__))
v4 = nbformat.v4


def notebook(out_dir, name, cells, language_info=None, kernelspec=None):
    nb = v4.new_notebook()
    if kernelspec:
        nb.metadata.kernelspec = kernelspec
    if language_info:
        nb.metadata.language_info = language_info
    nb.cells = cells
    for i, cell in enumerate(cells):
        cell.id = f'cell-{i}'  # not random, so the files only change with the cells
    path = os.path.join(out_dir, name + '.ipynb')
    nbformat.write(nb, path)
    nb = nbformat.read(path, as_version=4)
    script, resources = ScriptExporter().from_notebook_node(nb)
    with open(os.path.join(out_dir, name + resources['output_extension']), 'w',
              newline='') as f:
        f.write(script)


def write_script_fixtures(out_dir):
    python = {
        'codemirror_mode': {'name': 'ipython', 'version': 3},
        'file_extension': '.py',
        'mimetype': 'text/x-python',
        'name': 'python',
        'nbconvert_exporter': 'python',
        'pygments_lexer': 'ipython3',
        'version': '3.12.4',
    }
    python_kernel = {'display_name': 'Python 3 (ipykernel)', 'language': 'python', 'name': 'python3'}

    notebook(out_dir, 'python', [
        v4.new_markdown_cell('# Magics and shell commands\n\nSome *markdown*, with a [link](https://jupyter.org).'),
        v4.new_code_cell('%matplotlib inline\nimport numpy as np\n!pip install -q pandas', execution_count=1),
        v4.new_code_cell('files = !ls *.ipynb\nt = %timeit -o np.arange(10)\nnp.arange?', execution_count=2),
        v4.new_code_cell('%%bash\necho "hello"\necho \'world\'\n', execution_count=3),
        v4.new_code_cell('', execution_count=None),
        v4.new_code_cell('def f(x):\n    \n    return x  # 100%\n', execution_count=0),
        v4.new_markdown_cell(''),
        v4.new_raw_cell('raw, no mimetype'),
        v4.new_raw_cell('raw python', metadata={'raw_mimetype': 'text/x-python'}),
        v4.new_raw_cell('raw rst', metadata={'raw_mimetype': 'text/restructuredtext'}),
        v4.new_code_cell('hidden = 1', execution_count=7, metadata={'transient': {'remove_source': True}}),
        v4.new_code_cell('    print("caf\u00e9 \u2615")\n    %time 1', execution_count=8),
        v4.new_code_cell('>>> x = 1\n>>> x', execution_count=9),
        v4.new_markdown_cell('Last line\nof markdown'),
    ], python, python_kernel)

    notebook(out_dir, 'python-generic', [
        v4.new_markdown_cell('No nbconvert_exporter: the generic script template.'),
        v4.new_code_cell('%time x = 1\nprint(x)', execution_count=1),
        v4.new_raw_cell('raw python', metadata={'raw_mimetype': 'text/x-python'}),
    ], {'name': 'python', 'file_extension': '.py', 'mimetype': 'text/x-python'}, python_kernel)

    notebook(out_dir, 'r', [
        v4.new_markdown_cell('# R notebook'),
        v4.new_code_cell('library(ggplot2)\nx <- c(1, 2, 3)\nmean(x)', execution_count=1),
        v4.new_code_cell('', execution_count=None),
        v4.new_raw_cell('raw R', metadata={'raw_mimetype': 'text/x-r-source'}),
        v4.new_raw_cell('raw html', metadata={'raw_mimetype': 'text/html'}),
        v4.new_code_cell('%%R not a magic in R\nplot(x)\n', execution_count=2),
    ], {
        'codemirror_mode': 'r',
        'file_extension': '.r',
        'mimetype': 'text/x-r-source',
        'name': 'R',
        'pygments_lexer': 'r',
        'version': '4.3.1',
    }, {'display_name': 'R', 'language': 'R', 'name': 'ir'})

    notebook(out_dir, 'julia', [
        v4.new_markdown_cell('# Julia'),
        v4.new_code_cell('using LinearAlgebra\nA = [1 2; 3 4]\ndet(A)', execution_count=1),
        v4.new_code_cell('f(x) = x^2\n\nf.(1:3)', execution_count=2),
    ], {
        'file_extension': '.jl',
        'mimetype': 'application/julia',
        'name': 'julia',
        'version': '1.10.0',
    }, {'display_name': 'Julia 1.10.0', 'language': 'julia', 'name': 'julia-1.10'})

    notebook(out_dir, 'no-language', [
        v4.new_markdown_cell('Old notebooks have no language_info.'),
        v4.new_code_cell('print "hello"', execution_count=1),
        v4.new_raw_cell('raw text'),
    ])


IPYTHON_CASES = [
    "x = 1",
    "",
    "\n\n  \nx = 1\n",
    "%matplotlib inline",
    "%time x = 1",
    "%timeit -n 10 f(x)",
    "!ls -l",
    "!!ls",
    "files = !ls *.ipynb",
    "t = %time 1+1",
    "x = %timeit -o f()",
    "a = b = %foo",
    "foo?",
    "foo??",
    "np.linalg.norm?",
    "a[0]?",
    "?foo",
    "??foo",
    "?",
    "%time?",
    "%%time?",
    "x = foo?",
    "foo*?",
    "*foo*?",
    "%%time\nx = 1\ny = 2\n",
    "%%bash\necho hi\necho 'there'\n",
    "%%writefile out.txt\nhello \"world\" and 'you'\n",
    "%%html  \n<b>x</b>",
    "%%capture --no-stderr out\nprint(1)",
    "if x:\n    %time f()\n    !echo hi\nelse:\n    y = !pwd\n",
    "for i in range(3):\n    print(i)\n%who\n",
    "s = '%time not a magic'\n# !not a command\nx = 1",
    "s = '''\n%time inside a string\n!ls\n'''\n%time after",
    "x = (1,\n     2)\n!echo after parens",
    "y = [\n%time\n]",
    "%time x = 1 + \\\n  2",
    "!echo a \\\n  b \\\n  c\nprint(1)",
    "a = !ls \\\n  -l",
    "  %time indented\n  x = 1",
    "    x = 1\n    y = 2\n",
    "\tx = 1\n\t\ty = 2",
    ">>> x = 1\n>>> print(x)\n1",
    ">>> def f():\n...     return 1\n",
    "In [1]: x = 1\n   ...: y = 2",
    "In [12]: %time f()",
    "def f():\n    '''\n    >>> f()\n    1\n    '''\n    return 1",
    ",f a b c",
    ";f a b c",
    "/f a b",
    "/",
    "!echo 'unterminated\nx = 1\n%time x",
    "x = 'it\\'s'\n%time x",
    "!echo \"double\" 'single'",
    "!echo 'single'",
    "!echo caf\u00e9 \u00a0 \u200b \U0001F600",
    "!printf '\\t\\n'",
    "%env A=\u00e9",
    "x = 1 # comment ?\n",
    "print('?')",
    "a = 1; %time b",
    "x==%time",
    "x = {'a': %time}",
    "f(x=%time)",
    "%%timeit\n",
    "%%",
    "%% x",
    "!",
    "%",
    "x = 1\n\n\n%time x\n\n",
    "x = 1\r\n%time x\r\n",
    "lst = [1,\n# c\n2]\n?lst",
    "if True:\n    pass\n%time f\n",
    "x = f'{a}' ; %time\n",
    "x = f'{a=}'\n%time\n",
    "b = 0b12\n%time\n",
    "x = 1abc\n%time 1\n",
    "\u00e9t\u00e9 = %time 1",
    "!ls $HOME {var}",
    "%run -i script.py arg1 'arg 2'",
    "get_ipython().system('ls')",
    "async def f():\n    await x\n%time f()",
    "x = \"\"\"abc\n\"\"\"; !ls",
    "  \n  %time a\n",
    "]\n[{ x?\n",
    "[\nfoo?\n",
    "s = \'\'\'\nfoo?\n",
    "x = 1 \\\n",
    "!echo a; x = 'b\\\nfoo?",
    "%load_ext autoreload\n%autoreload 2\nimport numpy as np\n!pip install -q pandas\n%matplotlib inline",
]


def write_ipython_cases(path):
    pairs = [[case, TransformerManager().transform_cell(case)] for case in IPYTHON_CASES]
    with open(path, 'w') as f:
        json.dump(pairs, f, indent=1, ensure_ascii=False)
        f.write('\n')


TYPES = ['-', 'slide', 'subslide', 'fragment', 'notes', 'skip']


def deck_from_html(html):
    soup = BeautifulSoup(html, 'html.parser')
    slides_el = soup.select_one('div.slides')

    def attrs(el):
        return {k: v for k, v in el.attrs.items() if k.startswith('data-')}

    def cell_index(el):
        return int(el.get_text().strip()[1:])

    def item(el):
        if el.name == 'aside':
            return {'index': cell_index(el), 'notes': True}
        if 'fragment' in el.get('class', []):
            return {'attributes': attrs(el), 'cells': [item(c) for c in children(el)]}
        return {'index': cell_index(el), 'notes': False}

    def children(el):
        return [c for c in el.children if getattr(c, 'name', None)]

    return [
        {'attributes': attrs(s), 'subslides': [
            {'attributes': attrs(sub), 'content': [item(c) for c in children(sub)]}
            for sub in children(s)
        ]}
        for s in children(slides_el) if s.name == 'section'
    ]


def case(metadatas):
    nb = v4.new_notebook()
    nb.cells = [v4.new_markdown_cell(f'c{i}', metadata=m) for i, m in enumerate(metadatas)]
    try:
        html, _ = SlidesExporter().from_notebook_node(nb)
        deck = deck_from_html(html)
    except ValueError:
        deck = None
    return {'metadata': metadatas, 'deck': deck}


def slideshow(t, data=None):
    m = {'slideshow': {'slide_type': t}}
    if data:
        m['slideshow']['data'] = data
    return m


def write_slides_cases(path):
    cases = [
        case([slideshow('slide'), {}, slideshow('fragment'), {}, slideshow('fragment'),
              slideshow('subslide'), slideshow('notes'), slideshow('skip'), {},
              slideshow('slide'), slideshow('fragment'), slideshow('notes')]),
        case([{}, {}, {}]),
        case([slideshow('notes'), slideshow('skip'), {}, slideshow('subslide')]),
        case([slideshow('notes'), slideshow('skip')]),
        case([slideshow('fragment'), slideshow('fragment')]),
        case([slideshow('slide', {'background_color': 'lightblue', 'transition': 'zoom'}),
              slideshow('fragment', {'fragment_index': 2}), slideshow('subslide', {'state': 'x'})]),
        case([{'slideshow': {}}, {'slideshow': {'slide_type': None}}, slideshow('slide')]),
    ]
    random.seed(1)
    for _ in range(40):
        cases.append(case([slideshow(random.choice(TYPES)) if random.random() < 0.8 else {}
                           for _ in range(random.randint(1, 12))]))
    with open(path, 'w') as f:
        f.write('[\n' + ',\n'.join(json.dumps(c, separators=(',', ':')) for c in cases) + '\n]\n')


if __name__ == '__main__':
    write_script_fixtures(os.path.join(HERE, 'script'))
    write_ipython_cases(os.path.join(HERE, 'script', 'ipython2python.json'))
    write_slides_cases(os.path.join(HERE, 'slides.json'))
