"""Write an nbformat 3 notebook, as IPython 2 saved them, for the tests:
heading cells, Markdown with math, code with prompts, stream and pyout
outputs, and three PNG plots.

    python test/fixtures/make-heat-equation.py > test/fixtures/heat-equation.ipynb

test/convert.test.ts has the command that makes heat-equation.v4.json.
"""
import base64, json, struct, sys, zlib

def png(width, height, color):
    """A small PNG: a light background with a colored diagonal band."""
    rows = []
    for y in range(height):
        row = bytearray([0])
        for x in range(width):
            band = abs(x * height / width - y) < 12
            row += bytes(color if band else (245, 245, 245))
        rows.append(bytes(row))
    def chunk(kind, data):
        return (struct.pack('>I', len(data)) + kind + data +
                struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff))
    raw = (b'\x89PNG\r\n\x1a\n' +
           chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)) +
           chunk(b'IDAT', zlib.compress(b''.join(rows), 9)) +
           chunk(b'IEND', b''))
    return base64.b64encode(raw).decode() + '\n'

def lines(text):
    return text.splitlines(True)

def heading(level, text):
    return {'cell_type': 'heading', 'level': level, 'metadata': {}, 'source': lines(text)}

def markdown(text):
    return {'cell_type': 'markdown', 'metadata': {}, 'source': lines(text)}

def code(n, source, outputs=()):
    return {'cell_type': 'code', 'collapsed': False, 'input': lines(source),
            'language': 'python', 'metadata': {}, 'outputs': list(outputs),
            'prompt_number': n}

def stream(text):
    return {'output_type': 'stream', 'stream': 'stdout', 'text': lines(text)}

def pyout(n, text):
    return {'metadata': {}, 'output_type': 'pyout', 'prompt_number': n, 'text': lines(text)}

def plot(color):
    return {'metadata': {}, 'output_type': 'display_data', 'png': png(400, 240, color),
            'text': ['<matplotlib.figure.Figure at 0x10b2f6d10>']}

cells = [
    heading(1, 'The Heat Equation'),
    markdown('We solve the one-dimensional heat equation\n\n'
             '$$\\frac{\\partial u}{\\partial t} = D \\frac{\\partial^2 u}{\\partial x^2}$$\n\n'
             'on $0 \\le x \\le L$ with $u(0, t) = u(L, t) = 0$, using explicit finite\n'
             'differences on a grid $x_j = j \\Delta x$, $t_n = n \\Delta t$.'),
    heading(2, 'Finite Differences'),
    markdown('With $u_j^n \\approx u(x_j, t_n)$, the forward difference in time and the\n'
             'central difference in space give\n\n'
             '$$u_j^{n+1} = u_j^n + \\sigma \\left(u_{j+1}^n - 2 u_j^n + u_{j-1}^n\\right),\n'
             '\\qquad \\sigma = \\frac{D \\Delta t}{\\Delta x^2}.$$\n\n'
             'The scheme is stable for $\\sigma \\le \\frac{1}{2}$.'),
    code(1, 'import numpy as np\nfrom matplotlib import pyplot as plt\n%matplotlib inline'),
    heading(3, 'Grid and Initial Condition'),
    code(2, 'L, D = 1.0, 0.1\nJ, N = 50, 400\ndx = L / J\ndt = 0.4 * dx**2 / D\nsigma = D * dt / dx**2\nprint("sigma =", sigma)',
         [stream('sigma = 0.4\n')]),
    code(3, 'x = np.linspace(0, L, J + 1)\nu = np.sin(np.pi * x)\nu[[0, -1]]',
         [pyout(3, 'array([ 0.00000000e+00,   1.22464680e-16])')]),
    heading(3, 'Time Stepping'),
    code(4, 'def step(u, sigma):\n    v = u.copy()\n    v[1:-1] = u[1:-1] + sigma * (u[2:] - 2 * u[1:-1] + u[:-2])\n    return v\n\nfor n in range(N):\n    u = step(u, sigma)'),
    heading(2, 'Results'),
    markdown('The exact solution is $u(x, t) = e^{-D \\pi^2 t} \\sin(\\pi x)$.'),
    code(5, 'plt.plot(x, u)', [plot((31, 119, 180))]),
    code(6, 'exact = np.exp(-D * np.pi**2 * N * dt) * np.sin(np.pi * x)\nplt.plot(x, u - exact)',
         [plot((255, 127, 14))]),
    code(7, 'plt.semilogy(x[1:-1], abs(u - exact)[1:-1])', [plot((44, 160, 44))]),
    markdown('The error is of order $\\Delta t + \\Delta x^2$.'),
]

nb = {'metadata': {'name': ''}, 'nbformat': 3, 'nbformat_minor': 0,
      'worksheets': [{'cells': cells, 'metadata': {}}]}
json.dump(nb, sys.stdout, indent=1, sort_keys=True)
sys.stdout.write('\n')
