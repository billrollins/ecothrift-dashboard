"""Write a vector EPS (PostScript level 3, so gradients stay smooth shading, not pictures) from one of the logo SVGs.
The SVGs here use only: <path d fill [fill-rule]>, fill="url(#gradient)" with a userSpace linearGradient of two
stops, and one <rect rx> (the store-line rule). Called by make.py for every file in svg/."""
import pathlib
import re
import sys

import svgpath as sp


def rgb(hexcol):
    h = hexcol.lstrip('#')
    return ' '.join(f'{int(h[i:i + 2], 16) / 255:.4f}' for i in (0, 2, 4))


def convert(svg_path: pathlib.Path, out_dir: pathlib.Path):
    svg = svg_path.read_text(encoding='utf-8')
    w, h = [float(v) for v in re.search(r'viewBox="0 0 ([^ ]+) ([^"]+)"', svg).groups()]
    title = re.search(r'<title>([^<]*)</title>', svg).group(1)
    grads = {}
    for gid, x1, y1, x2, y2, c0, c1 in re.findall(
            r'<linearGradient id="([^"]+)" gradientUnits="userSpaceOnUse" x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)">'
            r'<stop offset="0" stop-color="([^"]+)"/><stop offset="1" stop-color="([^"]+)"/>', svg):
        grads[gid] = (float(x1), float(y1), float(x2), float(y2), c0, c1)

    def ps_path(d):
        out = []
        for ct in sp.parse(d):
            for k, pts in ct['segs']:
                xy = ' '.join(f'{sp.fmt(x)} {sp.fmt(h - y)}' for x, y in pts)
                out.append(f'{xy} {"moveto" if k == "M" else "lineto" if k == "L" else "curveto"}')
            if ct['closed']:
                out.append('closepath')
        return '\n'.join(out)

    body = []
    for el in re.findall(r'<(?:path|rect)\b[^>]*/>', svg):
        fill = re.search(r'fill="([^"]+)"', el).group(1)
        eo = 'fill-rule="evenodd"' in el
        if el.startswith('<rect'):
            x, y, rw, rh, rx = (float(re.search(fr' {k}="([^"]+)"', el).group(1)) for k in ('x', 'y', 'width', 'height', 'rx'))
            yb = h - y - rh
            path = (f'{sp.fmt(x + rx)} {sp.fmt(yb)} moveto {sp.fmt(x + rw - rx)} {sp.fmt(yb)} lineto '
                    f'{sp.fmt(x + rw - rx)} {sp.fmt(yb + rx)} {sp.fmt(rx)} 270 90 arc '
                    f'{sp.fmt(x + rx)} {sp.fmt(yb + rh)} lineto {sp.fmt(x + rx)} {sp.fmt(yb + rx)} {sp.fmt(rx)} 90 270 arc closepath')
        else:
            path = ps_path(re.search(r' d="([^"]+)"', el).group(1))
        m = re.match(r'url\(#([^)]+)\)', fill)
        if m:
            x1, y1, x2, y2, c0, c1 = grads[m.group(1)]
            body.append(f'gsave newpath\n{path}\n{"eoclip" if eo else "clip"} newpath\n'
                        f'<< /ShadingType 2 /ColorSpace /DeviceRGB /Coords [{sp.fmt(x1)} {sp.fmt(h - y1)} {sp.fmt(x2)} {sp.fmt(h - y2)}] '
                        f'/Extend [true true] /Function << /FunctionType 2 /Domain [0 1] /C0 [{rgb(c0)}] /C1 [{rgb(c1)}] /N 1 >> >> shfill\ngrestore')
        else:
            body.append(f'newpath\n{path}\n{rgb(fill)} setrgbcolor {"eofill" if eo else "fill"}')
    bw, bh = int(-(-w // 1)), int(-(-h // 1))
    eps = (f'%!PS-Adobe-3.0 EPSF-3.0\n%%Title: {title}\n%%Creator: Eco-Thrift logo build (workspace/logo)\n'
           f'%%BoundingBox: 0 0 {bw} {bh}\n%%HiResBoundingBox: 0 0 {w:.3f} {h:.3f}\n%%LanguageLevel: 3\n%%Pages: 1\n%%EndComments\n'
           f'%%Page: 1 1\nsave\n' + '\n'.join(body) + '\nrestore\nshowpage\n%%EOF\n')
    dst = out_dir / (svg_path.stem + '.eps')
    dst.write_text(eps, encoding='ascii')
    return dst


if __name__ == '__main__':
    out = pathlib.Path(__file__).resolve().parents[1] / 'eps'
    out.mkdir(exist_ok=True)
    for f in sys.argv[1:]:
        print(convert(pathlib.Path(f), out))
