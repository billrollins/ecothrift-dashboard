"""Translate the original Illustrator logo (EcoThrift Logo - AI.ai, page 2, a PDF) into plain SVG, keeping every shape
and gradient as vector. Handles exactly the operators the file uses: q Q cm, m l c v y h re, W W* n, f f* B, sh
(axial shading under the current clip), cs/scn/sc/rg/g colour, Do (form XObject), gs, marked content.

Source: design/brand/logo/source/eco-thrift-logo-2021-designer.ai (Bill's OneDrive: Media/Images/Brand/EcoThrift Logo - AI.ai).
Output: workspace/logo-build/mark-and-wordmark.svg in PDF page units (points), y flipped to SVG.
"""
import pathlib
import re

import pymupdf

LOGO = pathlib.Path(__file__).resolve().parents[1]
BUILD = LOGO.parents[2] / 'workspace' / 'logo-build'
SRC, PAGE = LOGO / 'source' / 'eco-thrift-logo-2021-designer.ai', 1
doc = pymupdf.open(SRC)
page = doc[PAGE]
H = page.rect.height


def mul(a, b):
    """PDF matrix multiply a x b, matrices as (a b c d e f)."""
    return (a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
            a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
            a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5])


def apply(m, x, y):
    return (m[0] * x + m[2] * y + m[4], H - (m[1] * x + m[3] * y + m[5]))


def fmt(v):
    s = f'{v:.4f}'.rstrip('0').rstrip('.')
    return '0' if s == '-0' else s


def hexcol(comps):
    if len(comps) == 1:
        comps = comps * 3
    return '#' + ''.join(f'{round(max(0, min(1, c)) * 255):02X}' for c in comps[:3])


TOKEN = re.compile(rb'\s*(\[|\]|<<|>>|/[^\s/\[\]<>()]+|\([^)]*\)|[^\s/\[\]<>()]+)')


def tokens(data: bytes):
    pos = 0
    while True:
        m = TOKEN.match(data, pos)
        if not m:
            return
        pos = m.end()
        yield m.group(1).decode('latin1')


out, defs = [], []
clip_n = grad_n = 0
shadings = {}


def shading_def(name, ctm):
    """An SVG linearGradient for an axial shading, in user space under the CTM at the 'sh'."""
    global grad_n
    xref = int(re.search(rf'/{name} (\d+) 0 R', doc.xref_object(page.xref, compressed=True)).group(1))
    obj = doc.xref_object(xref, compressed=False)
    assert '/ShadingType 2' in obj, obj
    coords = [float(v) for v in re.search(r'/Coords \[([^\]]+)\]', obj).group(1).split()]
    fn = int(re.search(r'/Function (\d+) 0 R', obj).group(1))
    fobj = doc.xref_object(fn, compressed=False)
    if '/FunctionType 3' in fobj:  # stitching with one exponential sub-function here
        fn = int(re.search(r'/Functions \[\s*(\d+) 0 R', fobj).group(1))
        fobj = doc.xref_object(fn, compressed=False)
    c0 = [float(v) for v in re.search(r'/C0 \[([^\]]+)\]', fobj).group(1).split()]
    c1 = [float(v) for v in re.search(r'/C1 \[([^\]]+)\]', fobj).group(1).split()]
    assert re.search(r'/N 1\b', fobj), 'only linear interpolation'
    x1, y1 = apply(ctm, coords[0], coords[1])
    x2, y2 = apply(ctm, coords[2], coords[3])
    grad_n += 1
    gid = f'g{grad_n}'
    defs.append(f'<linearGradient id="{gid}" gradientUnits="userSpaceOnUse" x1="{fmt(x1)}" y1="{fmt(y1)}" x2="{fmt(x2)}" y2="{fmt(y2)}">'
                f'<stop offset="0" stop-color="{hexcol(c0)}"/><stop offset="1" stop-color="{hexcol(c1)}"/></linearGradient>')
    return gid


def run(data: bytes, ctm0, resources_xref=None):
    global clip_n
    state = {'ctm': ctm0, 'fill': '#000000', 'clips': []}
    stack = []
    path = []
    operands = []
    pending_clip = None

    def wrap(el, clips):
        for c in reversed(clips):
            el = f'<g clip-path="url(#{c})">{el}</g>'
        return el

    for tok in tokens(data):
        if tok[0] in '-.0123456789' or tok[0] in '/[]' or tok.startswith('('):
            operands.append(tok)
            continue
        op, args = tok, operands
        operands = []
        num = lambda i: float(args[i])  # noqa: E731
        m = state['ctm']
        if op == 'q':
            stack.append(dict(state, clips=list(state['clips'])))
        elif op == 'Q':
            state = stack.pop()
        elif op == 'cm':
            state['ctm'] = mul(tuple(float(a) for a in args[:6]), m)
        elif op == 'm':
            x, y = apply(m, num(0), num(1)); path.append(f'M{fmt(x)} {fmt(y)}')
        elif op == 'l':
            x, y = apply(m, num(0), num(1)); path.append(f'L{fmt(x)} {fmt(y)}')
        elif op == 'c':
            pts = [apply(m, num(i), num(i + 1)) for i in (0, 2, 4)]
            path.append('C' + ' '.join(f'{fmt(a)} {fmt(b)}' for a, b in pts))
        elif op in ('v', 'y'):
            raise SystemExit(f'operator {op} not handled')
        elif op == 're':
            x, y, w, h = (num(i) for i in range(4))
            pts = [apply(m, x, y), apply(m, x + w, y), apply(m, x + w, y + h), apply(m, x, y + h)]
            path.append('M' + ' L'.join(f'{fmt(a)} {fmt(b)}' for a, b in pts) + ' Z')
        elif op == 'h':
            path.append('Z')
        elif op in ('W', 'W*'):
            pending_clip = (' '.join(path), 'evenodd' if op == 'W*' else 'nonzero')
        elif op in ('n', 'f', 'f*', 'F', 'B', 'B*'):
            d = ' '.join(path)
            if op in ('f', 'f*', 'F', 'B', 'B*') and d:
                rule = ' fill-rule="evenodd"' if op.endswith('*') else ''
                out.append(wrap(f'<path d="{d}" fill="{state["fill"]}"{rule}/>', state['clips']))
            if pending_clip:
                clip_n += 1
                cid = f'c{clip_n}'
                defs.append(f'<clipPath id="{cid}"><path d="{pending_clip[0]}" clip-rule="{pending_clip[1]}"/></clipPath>')
                state['clips'].append(cid)
                pending_clip = None
            path = []
        elif op == 'sh':
            gid = shading_def(args[0][1:], m)
            out.append(wrap(f'<rect x="0" y="0" width="{fmt(page.rect.width)}" height="{fmt(H)}" fill="url(#{gid})"/>', state['clips']))
        elif op in ('scn', 'sc', 'rg', 'g'):
            state['fill'] = hexcol([float(a) for a in args if a[0] not in '/'])
        elif op == 'Do':
            name = args[0][1:]
            xref = int(re.search(rf'/{name} (\d+) 0 R', doc.xref_object(page.xref, compressed=True)).group(1))
            xo = doc.xref_object(xref, compressed=False)
            mm = re.search(r'/Matrix \[([^\]]+)\]', xo)
            fm = tuple(float(v) for v in mm.group(1).split()) if mm else (1, 0, 0, 1, 0, 0)
            out.append('<g data-form="%s">' % name)
            run(doc.xref_stream(xref), mul(fm, m))
            out.append('</g>')
        elif op in ('cs', 'CS', 'gs', 'BDC', 'BMC', 'EMC', 'BX', 'EX', 'TL', 'w', 'J', 'j', 'M', 'd', 'i', 'ri'):
            pass
        else:
            raise SystemExit(f'unhandled operator {op} {args}')


run(page.read_contents(), (1, 0, 0, 1, 0, 0))
svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {fmt(page.rect.width)} {fmt(H)}">'
       f'<defs>{"".join(defs)}</defs>{"".join(out)}</svg>')
BUILD.mkdir(parents=True, exist_ok=True)
(BUILD / 'mark-and-wordmark.svg').write_text(svg, encoding='utf-8')
print('paths', svg.count('<path'), 'gradients', len([d for d in defs if 'Gradient' in d]), 'clips', clip_n, 'bytes', len(svg))
