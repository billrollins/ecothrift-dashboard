"""Tiny SVG path toolkit for the logo build: parse absolute M L H V C Z paths (with implicit repeats), transform,
embolden like FreeType / HarfBuzz synthetic bold, sample for bounding boxes, write back."""
import math
import re

NUM = re.compile(r'[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?')
CMD = re.compile(r'([MLHVCZmlhvcz])([^MLHVCZmlhvcz]*)')


def parse(d):
    """-> list of contours; each contour is a list of segments ('M',[p]) ('L',[p]) ('C',[c1,c2,p]); closed if 'Z'."""
    contours, cur, pos, start = [], None, (0.0, 0.0), (0.0, 0.0)
    for cmd, args in CMD.findall(d):
        nums = [float(n) for n in NUM.findall(args)]
        if cmd.islower() and cmd != 'z':
            raise ValueError('relative path commands not expected here')
        if cmd == 'M':
            pts = [(nums[i], nums[i + 1]) for i in range(0, len(nums), 2)]
            cur = {'segs': [('M', [pts[0]])], 'closed': False}
            contours.append(cur)
            pos = start = pts[0]
            for p in pts[1:]:
                cur['segs'].append(('L', [p])); pos = p
        elif cmd == 'L':
            for i in range(0, len(nums), 2):
                pos = (nums[i], nums[i + 1]); cur['segs'].append(('L', [pos]))
        elif cmd == 'H':
            for x in nums:
                pos = (x, pos[1]); cur['segs'].append(('L', [pos]))
        elif cmd == 'V':
            for y in nums:
                pos = (pos[0], y); cur['segs'].append(('L', [pos]))
        elif cmd == 'C':
            for i in range(0, len(nums), 6):
                c1, c2, p = (nums[i], nums[i + 1]), (nums[i + 2], nums[i + 3]), (nums[i + 4], nums[i + 5])
                cur['segs'].append(('C', [c1, c2, p])); pos = p
        elif cmd in 'Zz':
            cur['closed'] = True
            pos = start
    return contours


def transform(contours, m):
    a, b, c, d, e, f = m
    tp = lambda p: (a * p[0] + c * p[1] + e, b * p[0] + d * p[1] + f)  # noqa: E731
    return [{'segs': [(k, [tp(p) for p in pts]) for k, pts in ct['segs']], 'closed': ct['closed']} for ct in contours]


def fmt(v):
    s = f'{v:.3f}'.rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s


def to_d(contours):
    out = []
    for ct in contours:
        for k, pts in ct['segs']:
            out.append(k + ' '.join(f'{fmt(x)} {fmt(y)}' for x, y in pts))
        if ct['closed']:
            out.append('Z')
    return ''.join(out)


def _bez(p0, c1, c2, p1, t):
    u = 1 - t
    return (u ** 3 * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t ** 3 * p1[0],
            u ** 3 * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t ** 3 * p1[1])


def sample(contours, steps=24):
    """Points along the outline (curves sampled), for a tight bounding box."""
    pts = []
    for ct in contours:
        pos = None
        for k, ps in ct['segs']:
            if k in 'ML':
                pos = ps[0]; pts.append(pos)
            else:
                for i in range(1, steps + 1):
                    pts.append(_bez(pos, ps[0], ps[1], ps[2], i / steps))
                pos = ps[2]
    return pts


def bbox(contours):
    pts = sample(contours)
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)


def _area(points):
    return sum(points[i][0] * points[(i + 1) % len(points)][1] - points[(i + 1) % len(points)][0] * points[i][1]
               for i in range(len(points))) / 2


def embolden(contours, strength):
    """FreeType FT_Outline_EmboldenXY (also HarfBuzz synthetic bold, which Pango/GIMP use): every outline point,
    on-curve and control alike, moves out along the bisector of its two edges so the outline grows by strength/2 on
    each side. Coordinates must be y-up (font space). Returns new contours with the same segments."""
    xs = ys = strength / 2
    # Orientation from the whole outline (TrueType outlines are clockwise in y-up space).
    allpts = [p for ct in contours for _, ps in ct['segs'] for p in ps]
    total = sum(_area([p for _, ps in ct['segs'] for p in ps]) for ct in contours)
    truetype = total < 0  # clockwise
    out = []
    for ct0 in contours:
        # TrueType fonts are quadratic; a PDF stores each quadratic as a cubic (controls at 2/3 of the way to the
        # quadratic control). FreeType emboldens the quadratic points, so rebuild them first and convert back after.
        ct = {'segs': [], 'closed': ct0['closed'], 'quad': []}
        pos = None
        for k, ps in ct0['segs']:
            if k == 'C':
                q1 = (pos[0] + 1.5 * (ps[0][0] - pos[0]), pos[1] + 1.5 * (ps[0][1] - pos[1]))
                q2 = (ps[2][0] + 1.5 * (ps[1][0] - ps[2][0]), ps[2][1] + 1.5 * (ps[1][1] - ps[2][1]))
                if math.dist(q1, q2) < 1e-3:
                    ct['segs'].append(('Q', [q1, ps[2]]))
                    pos = ps[2]
                    continue
            ct['segs'].append((k, list(ps)))
            pos = ps[-1]
        flat = []  # (segment index, point index) for every point
        for si, (k, ps) in enumerate(ct['segs']):
            for pi in range(len(ps)):
                flat.append((si, pi))
        pts = [ct['segs'][si][1][pi] for si, pi in flat]
        # A closed contour whose last point repeats the first: drop the duplicate for the neighbour search.
        n = len(pts)
        if n > 1 and math.dist(pts[0], pts[-1]) < 1e-9:
            ring = list(range(n - 1)); dup_last = True
        else:
            ring = list(range(n)); dup_last = False
        m = len(ring)
        shifts = [(0.0, 0.0)] * n

        def neighbour(i, step):
            j = (i + step) % m
            while j != i and math.dist(pts[ring[j]], pts[ring[i]]) < 1e-9:
                j = (j + step) % m
            return j

        for i in range(m):
            p = pts[ring[i]]
            pp = pts[ring[neighbour(i, -1)]]
            pn = pts[ring[neighbour(i, 1)]]
            ix, iy = p[0] - pp[0], p[1] - pp[1]
            ox, oy = pn[0] - p[0], pn[1] - p[1]
            li, lo = math.hypot(ix, iy), math.hypot(ox, oy)
            if li == 0 or lo == 0:
                continue
            ix, iy, ox, oy = ix / li, iy / li, ox / lo, oy / lo
            d = ix * ox + iy * oy
            if d <= -0.9375:  # nearly a reversal: leave the point
                continue
            d += 1
            sx, sy = iy + oy, ix + ox
            if truetype:
                sx = -sx
            else:
                sy = -sy
            q = ox * iy - oy * ix
            if truetype:
                q = -q
            # Restrict the shift on short edges (FreeType: l = the shorter of the two edge lengths).
            l = min(li, lo)
            sx = sx * xs / d if xs * q <= l * d else sx * l / q
            sy = sy * ys / d if ys * q <= l * d else sy * l / q
            shifts[ring[i]] = (sx, sy)
        if dup_last:
            shifts[-1] = shifts[0]
        newsegs = [(k, list(ps)) for k, ps in ct['segs']]
        for idx, (si, pi) in enumerate(flat):
            x, y = newsegs[si][1][pi]
            newsegs[si][1][pi] = (x + shifts[idx][0], y + shifts[idx][1])
        # Quadratics back to cubics.
        cubic, pos = [], None
        for k, ps in newsegs:
            if k == 'Q':
                q, p = ps
                cubic.append(('C', [(pos[0] + 2 / 3 * (q[0] - pos[0]), pos[1] + 2 / 3 * (q[1] - pos[1])),
                                    (p[0] + 2 / 3 * (q[0] - p[0]), p[1] + 2 / 3 * (q[1] - p[1])), p]))
            else:
                cubic.append((k, ps))
            pos = ps[-1]
        out.append({'segs': cubic, 'closed': ct['closed']})
    return out
