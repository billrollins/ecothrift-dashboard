"""Build the Eco-Thrift vector logo set.

Sources:
  source/eco-thrift-logo-2021-designer.ai  the designer's Illustrator file (2021): the mark (leaf, gradient circle, ring and arrow) and the
               stacked ECO-THRIFT wordmark, already outlines. Converted exactly by ai2svg.py -> workspace/logo-build/mark-and-wordmark.svg.
  Bill's 2025 lockup "Logo & Text.xcf" (GIMP, 600 dpi; his OneDrive: Media/Brand): the mark at left, "Eco-Thrift" (Varela Round, GIMP synthetic bold),
               the tagline (Crimson Pro Bold), and the store line block (Montserrat Bold over a green rule).
Text is set in the real Google Fonts (tools/text.html -> Edge -> workspace/logo-build/text.pdf -> glyph outlines); "Eco-Thrift" gets the same
synthetic bold GIMP's text engine applies (FreeType / HarfBuzz embolden, em/24). Every piece is placed by the ink
box it has in the xcf (measured once: tools/xcf-ink.json, xcf pixels at 600 dpi), so the result matches it. All output is filled paths: no fonts, no strokes,
no images.
"""
import json
import pathlib
import re

import pymupdf

import svgpath as sp

HERE = pathlib.Path(__file__).resolve().parent
LOGO = HERE.parent
BUILD = LOGO.parents[2] / 'workspace' / 'logo-build'
OUT = LOGO / 'svg'
OUT.mkdir(exist_ok=True)
INK = json.loads((HERE / 'xcf-ink.json').read_text())
PT_PER_PX = 72 / 600  # update.xcf is 600 dpi

GREEN_LIGHT, GREEN_DEEP = '#8DC63F', '#528540'   # the mark's gradient (from original.ai)
RULE_GREEN = '#6FA641'                           # the rule under THRIFT AND WHOLESALE (update.xcf)
INK_BLACK = '#000000'

# ---- The mark, from the exact conversion of original.ai -------------------------------------------------------
raw = (BUILD / 'mark-and-wordmark.svg').read_text(encoding='utf-8')
clips = dict(re.findall(r'<clipPath id="(c\d)"><path d="([^"]+)"', raw))
grads = {g: (float(x1), float(y1), float(x2), float(y2)) for g, x1, y1, x2, y2 in
         re.findall(r'<linearGradient id="(g\d)" gradientUnits="userSpaceOnUse" x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"', raw)}
body = raw[raw.index('</defs>') + 7:]
form = body[body.index('<g data-form="Fm0">'):body.index('</g>', body.index('<g data-form="Fm0">'))]
wordmark2021 = [sp.parse(d) for d in re.findall(r'<path d="([^"]+)"', form)]
after = body[body.index('</g>', body.index('<g data-form="Fm0">')):]
leaves = [sp.parse(d) for d in re.findall(r'<path d="([^"]+)" fill="#FFFFFF"', after)]
circle = sp.parse(clips['c2'])
ring = sp.parse(clips['c3'])
mark_parts = {'circle': circle, 'ring': ring, 'leaves': leaves}


def all_contours(parts):
    out = list(parts['circle']) + list(parts['ring'])
    for lf in parts['leaves']:
        out += lf
    return out


mb = sp.bbox(all_contours(mark_parts))  # in AI points

# ---- Text outlines from the Edge PDF ---------------------------------------------------------------------------
tdoc = pymupdf.open(BUILD / 'text.pdf')
tsvg = tdoc[0].get_svg_image(text_as_path=True)
glyph_d = dict(re.findall(r'<path id="(font_[\d_]+)" d="([^"]*)"', tsvg))
uses = re.findall(r'<use data-text="([^"]*)" xlink:href="#(font_[\d_]+)" transform="matrix\(([^)]+)\)"', tsvg)


def lines_by_baseline():
    out = {}
    for ch, gid, mat in uses:
        m = tuple(float(v) for v in mat.split(','))
        out.setdefault(round(m[5], 2), []).append((ch, gid, m))
    return [out[k] for k in sorted(out)]


LINES = dict(zip(['eco', 'tag', 'r1', 'r2'], lines_by_baseline()))


def text_contours(key, bold_em=0.0):
    """Glyph outlines in PDF points (y down), each glyph emboldened in font space (y up) when asked."""
    out = []
    for ch, gid, m in LINES[key]:
        if not glyph_d[gid]:
            continue  # a space
        g = sp.parse(glyph_d[gid])  # font units (em = 1), y up
        if bold_em:
            g = sp.embolden(g, bold_em)
        out += sp.transform(g, m)
    return out


def place(contours, ink_box, keep_scale=None):
    """Scale and move contours so their ink box lands on ink_box (xcf px). keep_scale: a fixed px-per-unit scale
    (fonts at their real size); otherwise the scale fits the box height."""
    x0, y0, x1, y1 = sp.bbox(contours)
    tx0, ty0, tx1, ty1 = ink_box
    s = keep_scale or (ty1 - ty0) / (y1 - y0)
    return sp.transform(contours, (s, 0, 0, s, tx0 - x0 * s, ty0 - y0 * s)), s, ((x1 - x0) * s, (y1 - y0) * s)


report = {}
# Mark: fit its ink box (the ring with the arrow) to the xcf's.
mx = INK['mark'][0]
s_mark = ((mx[2] - mx[0]) / (mb[2] - mb[0]) + (mx[3] - mx[1]) / (mb[3] - mb[1])) / 2
mark_m = (s_mark, 0, 0, s_mark, mx[0] - mb[0] * s_mark, mx[1] - mb[1] * s_mark)
mark_xcf = {'circle': sp.transform(circle, mark_m), 'ring': sp.transform(ring, mark_m),
            'leaves': [sp.transform(lf, mark_m) for lf in leaves]}


def grad_xcf(g):
    x1, y1, x2, y2 = grads[g]
    a, _, _, d, e, f = mark_m
    return (a * x1 + e, d * y1 + f, a * x2 + e, d * y2 + f)


report['mark scale px/pt'] = round(s_mark, 4)

# "Eco-Thrift": Varela Round at 180 pt (1500 px at 600 dpi) = 10 px per PDF pt at 150 pt; GIMP synthetic bold em/24.
eco, s, size = place(text_contours('eco', bold_em=1 / 24), INK['eco'][0], keep_scale=1500 / 150)
report['eco ink size vs xcf'] = (round(size[0], 1), round(size[1], 1), INK['eco'][0][2] - INK['eco'][0][0], INK['eco'][0][3] - INK['eco'][0][1])
# Tagline: Crimson Pro Bold 49.8 pt (415 px) from a 50 pt setting.
tag, s, size = place(text_contours('tag'), INK['tag'][0], keep_scale=(50995 / 1024 * 600 / 72) / 50)
report['tag ink size vs xcf'] = (round(size[0], 1), round(size[1], 1), INK['tag'][0][2] - INK['tag'][0][0], INK['tag'][0][3] - INK['tag'][0][1])
# Store lines: Montserrat Bold 60 pt (500 px) from a 50 pt setting; each line centred as in the xcf.
r1, s, size = place(text_contours('r1'), INK['r1'][0], keep_scale=500 / 50)
report['r1 ink size vs xcf'] = (round(size[0], 1), round(size[1], 1), INK['r1'][0][2] - INK['r1'][0][0], INK['r1'][0][3] - INK['r1'][0][1])
r2, s, size = place(text_contours('r2'), INK['r2'][0], keep_scale=500 / 50)
report['r2 ink size vs xcf'] = (round(size[0], 1), round(size[1], 1), INK['r2'][0][2] - INK['r2'][0][0], INK['r2'][0][3] - INK['r2'][0][1])
RULE = INK['line'][0]

# The 2021 stacked wordmark, in the mark's own (AI) frame, for the stacked logo.
print(json.dumps(report, indent=1))


# ---- Writing SVGs --------------------------------------------------------------------------------------------
def d_of(contours, m):
    """Contours in xcf px -> path data in output units (pt), shifted by the output origin m=(ox, oy)."""
    ox, oy = m
    return sp.to_d(sp.transform(contours, (PT_PER_PX, 0, 0, PT_PER_PX, -ox * PT_PER_PX, -oy * PT_PER_PX)))


def mark_elems(parts, origin, colour, gid_prefix='g', grad_px=None):
    """colour='full': the designed mark (two gradients, white leaves). Any hex: one colour, leaves knocked out."""
    ox, oy = origin
    if colour == 'full':
        defs, el = [], []
        for name, gname in (('circle', 'g1'), ('ring', 'g2')):
            x1, y1, x2, y2 = grad_px[gname]
            gid = f'{gid_prefix}{name}'
            defs.append(f'<linearGradient id="{gid}" gradientUnits="userSpaceOnUse" '
                        f'x1="{sp.fmt((x1 - ox) * PT_PER_PX)}" y1="{sp.fmt((y1 - oy) * PT_PER_PX)}" '
                        f'x2="{sp.fmt((x2 - ox) * PT_PER_PX)}" y2="{sp.fmt((y2 - oy) * PT_PER_PX)}">'
                        f'<stop offset="0" stop-color="{GREEN_LIGHT}"/><stop offset="1" stop-color="{GREEN_DEEP}"/></linearGradient>')
            el.append(f'<path d="{d_of(parts[name], origin)}" fill="url(#{gid})"/>')
        for lf in parts['leaves']:
            el.append(f'<path d="{d_of(lf, origin)}" fill="#FFFFFF"/>')
        return defs, el
    # One colour: circle with the leaves as holes (even-odd), and the ring.
    holes = ''.join(d_of(lf, origin) for lf in parts['leaves'])
    return [], [f'<path d="{d_of(parts["circle"], origin)}{holes}" fill="{colour}" fill-rule="evenodd"/>',
                f'<path d="{d_of(parts["ring"], origin)}" fill="{colour}"/>']


def write(name, title, box_px, pieces, pad_px=0):
    x0, y0, x1, y1 = box_px
    x0, y0, x1, y1 = x0 - pad_px, y0 - pad_px, x1 + pad_px, y1 + pad_px
    w, h = (x1 - x0) * PT_PER_PX, (y1 - y0) * PT_PER_PX
    defs, els = [], []
    for build in pieces:
        dd, ee = build((x0, y0))
        defs += dd
        els += ee
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {sp.fmt(w)} {sp.fmt(h)}" width="{sp.fmt(w)}pt" height="{sp.fmt(h)}pt">'
           f'<title>{title}</title>' + (f'<defs>{"".join(defs)}</defs>' if defs else '') + ''.join(els) + '</svg>\n')
    (OUT / f'{name}.svg').write_text(svg, encoding='utf-8')
    return name, round(w, 1), round(h, 1), len(svg)


GRAD_PX = {g: grad_xcf(g) for g in ('g1', 'g2')}


def union(*boxes):
    return (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))


def text_piece(contours, colour):
    return lambda o: ([], [f'<path d="{d_of(contours, o)}" fill="{colour}"/>'])


def rule_piece(colour):
    x0, y0, x1, y1 = RULE
    r = (y1 - y0) / 2

    def build(o):
        ox, oy = o
        return [], [f'<rect x="{sp.fmt((x0 - ox) * PT_PER_PX)}" y="{sp.fmt((y0 - oy) * PT_PER_PX)}" '
                    f'width="{sp.fmt((x1 - x0) * PT_PER_PX)}" height="{sp.fmt((y1 - y0) * PT_PER_PX)}" '
                    f'rx="{sp.fmt(r * PT_PER_PX)}" fill="{colour}"/>']
    return build


def mark_piece(colour, prefix):
    return lambda o: mark_elems(mark_xcf, o, colour, prefix, GRAD_PX)


mark_box = tuple(INK['mark'][0])
eco_box, tag_box = sp.bbox(eco), sp.bbox(tag)
lock_box = union(mark_box, eco_box, tag_box)
store_box = union(lock_box, sp.bbox(r1), sp.bbox(r2), RULE)

COLOURWAYS = {
    # name: (mark colour, text colour, rule colour)
    'color': ('full', INK_BLACK, RULE_GREEN),
    'color-on-dark': ('full', '#FFFFFF', RULE_GREEN),
    'black': (INK_BLACK, INK_BLACK, INK_BLACK),
    'white': ('#FFFFFF', '#FFFFFF', '#FFFFFF'),
    'forest': ('#1D5424', '#1D5424', '#1D5424'),
}

made = []
for cw, (mc, tc, rc) in COLOURWAYS.items():
    made.append(write(f'eco-thrift-logo-{cw}', f'Eco-Thrift logo ({cw})', lock_box,
                      [mark_piece(mc, f'l{cw}-'), text_piece(eco, tc), text_piece(tag, tc)]))
    made.append(write(f'eco-thrift-logo-store-line-{cw}', f'Eco-Thrift logo with store line ({cw})', store_box,
                      [mark_piece(mc, f's{cw}-'), text_piece(eco, tc), text_piece(tag, tc),
                       text_piece(r1, tc), text_piece(r2, tc), rule_piece(rc)]))
    made.append(write(f'eco-thrift-mark-{cw if cw != "color-on-dark" else "color"}', f'Eco-Thrift leaf mark ({cw})', mark_box,
                      [mark_piece(mc, f'm{cw}-')]))
    made.append(write(f'eco-thrift-wordmark-{cw}', f'Eco-Thrift wordmark and tagline ({cw})', union(eco_box, tag_box),
                      [text_piece(eco, tc), text_piece(tag, tc)]))

# The designer's 2021 stacked logo (mark over ECO-THRIFT), straight from original.ai, in its own frame.
wm = []
for p in wordmark2021:
    wm += p
stack_contours = all_contours(mark_parts) + wm
sb = sp.bbox(stack_contours)
for cw, (mc, tc, _) in COLOURWAYS.items():
    if cw == 'color-on-dark':
        continue
    px = 600 / 72  # put the AI frame on the same px grid so the helpers apply
    m2 = (px, 0, 0, px, 0, 0)
    parts2 = {'circle': sp.transform(circle, m2), 'ring': sp.transform(ring, m2), 'leaves': [sp.transform(lf, m2) for lf in leaves]}
    g2 = {g: tuple(v * px for v in grads[g]) for g in ('g1', 'g2')}
    words = sp.transform(wm, m2)
    box = tuple(v * px for v in sb)
    made.append(write(f'eco-thrift-logo-stacked-2021-{cw}', f'Eco-Thrift stacked logo, 2021 ({cw})', box,
                      [lambda o, parts2=parts2, mc=mc, g2=g2, cw=cw: mark_elems(parts2, o, mc, f'k{cw}-', g2),
                       text_piece(words, tc)]))

for row in made:
    print(row)
(BUILD / 'build-report.json').write_text(json.dumps({'report': report, 'files': made}, indent=1), encoding='utf-8')
