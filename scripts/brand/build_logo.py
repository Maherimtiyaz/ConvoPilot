"""Builds the ConvoPilot logo SVGs (public/brand/) from exact geometry.

Not part of the app build. Requirements: Python 3 with `fonttools` and `brotli`, and the
Instrument Sans SemiBold font file (SIL Open Font License) passed as the first argument.
Usage: python scripts/brand/build_logo.py path/to/InstrumentSans-SemiBold.woff2 public/brand

Construction (docs/BRAND.md §5):
- The "Highlight" symbol: a chisel-cut highlighter stroke (a parallelogram whose ends lean at
  the brand angle, tan = 0.36, about 20 degrees) holding a pair of closing quotation marks.
- Each quote form is a circle with a straight, forward-leaning tail (tip 2.3 radii down and
  1.55 radii left of the centre), echoing the chisel's lean.
- The wordmark is lowercase Instrument Sans SemiBold, tracked -1.5%. (A chisel-shaped tittle
  was tried and rejected: it read as an accent, "convopílot".)
"""
import math
import sys
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.ttLib import TTFont

INK = "#17151F"  # v2 Aurora (was #0E1B2C)
MARKER = "url(#cpAurora)"  # v2 Aurora gradient; build output is post-processed with the <defs> (see docs/BRAND.md §17)
PAPER = "#F3F5F7"
WHITE = "#FFFFFF"
LEAN = 0.36  # brand angle: horizontal offset per unit of height (~20 degrees)


def f(n: float) -> str:
    return f"{n:.2f}".rstrip("0").rstrip(".")


# ---------------------------------------------------------------- symbol geometry
def chisel(x: float, y: float, w: float, h: float) -> str:
    s = LEAN * h
    return f"M{f(x + s)} {f(y)}H{f(x + w)}L{f(x + w - s)} {f(y + h)}H{f(x)}Z"


def _tangents(cx, cy, r, px, py):
    d = math.hypot(px - cx, py - cy)
    theta = math.atan2(py - cy, px - cx)
    a = math.acos(r / d)
    return ((cx + r * math.cos(theta + a), cy + r * math.sin(theta + a)),
            (cx + r * math.cos(theta - a), cy + r * math.sin(theta - a)))


TAIL_LENGTH = 2.3   # tip depth below the circle centre, in radii
TAIL_OFFSET = -1.55  # tip offset to the left, in radii (chosen visually from six variants)


def quote_form(cx: float, cy: float, r: float, tail: float = 0.0) -> str:
    """A circle with a straight, forward-leaning tail: one geometric closing-quote form."""
    px, py = cx + TAIL_OFFSET * r, cy + TAIL_LENGTH * r
    t1, t2 = _tangents(cx, cy, r, px, py)
    return (f"M{f(t1[0])} {f(t1[1])}A{f(r)} {f(r)} 0 1 1 {f(t2[0])} {f(t2[1])}"
            f"L{f(px)} {f(py)}Z")


def quotes(cx: float, cy: float, r: float, gap: float) -> str:
    """A pair of closing quotes centred (by their bounding box) on cx, cy."""
    tail = TAIL_LENGTH * r
    probe = _quote_bbox(r, tail)
    w = 2 * (probe[2] - probe[0]) + gap
    h = probe[3] - probe[1]
    ox = cx - w / 2 - probe[0]
    oy = cy - h / 2 - probe[1]
    step = (probe[2] - probe[0]) + gap
    return quote_form(ox, oy, r, tail) + quote_form(ox + step, oy, r, tail)


def _quote_bbox(r, tail):
    """Bounding box of a quote form whose circle is centred at (0, 0)."""
    path = quote_form(0.0, 0.0, r, tail)
    tip_x = float(path.split("L")[1].split(" ")[0])
    return (min(-r, tip_x), -r, r, tail)


# Symbol box 72 x 44 units
SYM_W, SYM_H = 72.0, 44.0


def symbol_paths(x=0.0, y=0.0, scale=1.0):
    k = scale
    hl = chisel(x, y, SYM_W * k, SYM_H * k)
    q = quotes(x + SYM_W * k / 2, y + SYM_H * k / 2, 6.8 * k, 3.2 * k)
    return hl, q


# ---------------------------------------------------------------- wordmark
def glyph_path(font, name, dx, baseline, scale):
    gs = font.getGlyphSet()
    pen = SVGPathPen(gs)
    tp = TransformPen(pen, (scale, 0, 0, -scale, dx, baseline))
    gs[name].draw(tp)
    return pen.getCommands()


def wordmark(font, x, baseline, size):
    """Returns (letters_path, width, ascent, descent) in output units."""
    upm = font["head"].unitsPerEm
    k = size / upm
    cmap = font.getBestCmap()
    hmtx = font["hmtx"]
    track = -0.015 * upm
    gs = font.getGlyphSet()
    bp = BoundsPen(gs)
    gs[cmap[ord("l")]].draw(bp)
    ascent = bp.bounds[3] * k
    parts, cursor = [], x
    for ch in "convopilot":
        name = cmap[ord(ch)]
        parts.append(glyph_path(font, name, cursor, baseline, k))
        cursor += (hmtx[name][0] + track) * k
    width = cursor - x - track * k
    return " ".join(parts), width, ascent, -font["OS/2"].sTypoDescender * k


def svg(w, h, body, title):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {f(w)} {f(h)}" '
            f'role="img" aria-label="{title}"><title>{title}</title>{body}</svg>\n')


def main(font_path: str, out: str) -> None:
    font = TTFont(font_path)
    outdir = Path(out)
    outdir.mkdir(parents=True, exist_ok=True)

    def write(name, content):
        (outdir / name).write_text(content)

    # Symbol: full colour, mono ink, mono white
    hl, q = symbol_paths()
    write("symbol.svg", svg(SYM_W, SYM_H, f'<path fill="{MARKER}" d="{hl}"/><path fill="{INK}" d="{q}"/>', "ConvoPilot"))
    write("symbol-mono-ink.svg", svg(SYM_W, SYM_H, f'<path fill="{INK}" fill-rule="evenodd" d="{hl}{q}"/>', "ConvoPilot"))
    write("symbol-mono-white.svg", svg(SYM_W, SYM_H, f'<path fill="{WHITE}" fill-rule="evenodd" d="{hl}{q}"/>', "ConvoPilot"))

    # Wordmark at size 100 (x-height ~ 52)
    size = 100.0
    _, ww, asc, desc = wordmark(font, 0, 0, size)
    asc_pad = asc * 0.14
    top = asc + asc_pad
    wm_h = top + desc
    def wm(color, _unused=None, ox=0.0, oy=0.0):
        l2, _, _, _ = wordmark(font, ox, oy + top, size)
        return f'<path fill="{color}" d="{l2}"/>'
    write("wordmark-ink.svg", svg(ww, wm_h, wm(INK, INK), "ConvoPilot"))
    write("wordmark-white.svg", svg(ww, wm_h, wm(WHITE, WHITE), "ConvoPilot"))

    # Horizontal lockup: symbol height = ascender height of the wordmark
    sym_h = asc * 1.12  # symbol sits on the baseline, slightly taller than the ascender
    k = sym_h / SYM_H
    sym_w = SYM_W * k
    gap = sym_h * 0.42
    total_w = sym_w + gap + ww
    total_h = max(sym_h, wm_h)
    sym_y = top - sym_h
    hl2, q2 = symbol_paths(0, sym_y, k)
    def horiz(word_color, sym_fill, quote_fill, mono=False):
        if mono:
            s = f'<path fill="{sym_fill}" fill-rule="evenodd" d="{hl2}{q2}"/>'
        else:
            s = f'<path fill="{sym_fill}" d="{hl2}"/><path fill="{quote_fill}" d="{q2}"/>'
        return s + wm(word_color, word_color, sym_w + gap, 0)
    write("logo-horizontal.svg", svg(total_w, total_h, horiz(INK, MARKER, INK), "ConvoPilot"))
    write("logo-horizontal-on-dark.svg", svg(total_w, total_h, horiz(WHITE, MARKER, INK), "ConvoPilot"))
    write("logo-horizontal-mono-ink.svg", svg(total_w, total_h, horiz(INK, INK, None, True), "ConvoPilot"))
    write("logo-horizontal-mono-white.svg", svg(total_w, total_h, horiz(WHITE, WHITE, None, True), "ConvoPilot"))

    # Vertical lockup: symbol 1.6x larger, centred above the wordmark
    vk = (sym_h * 1.6) / SYM_H
    vw, vh = SYM_W * vk, SYM_H * vk
    vgap = vh * 0.38
    V_W = max(vw, ww)
    hl3, q3 = symbol_paths((V_W - vw) / 2, 0, vk)
    vbody = (f'<path fill="{MARKER}" d="{hl3}"/><path fill="{INK}" d="{q3}"/>'
             + wm(INK, INK, (V_W - ww) / 2, vh + vgap))
    write("logo-vertical.svg", svg(V_W, vh + vgap + wm_h, vbody, "ConvoPilot"))

    # App icon 1024: ink squircle-ish rounded square, symbol 62% wide
    A = 1024.0
    ak = (A * 0.62) / SYM_W
    ax, ay = (A - SYM_W * ak) / 2, (A - SYM_H * ak) / 2
    hl4, q4 = symbol_paths(ax, ay, ak)
    write("app-icon.svg", svg(A, A, f'<rect width="{f(A)}" height="{f(A)}" rx="230" fill="{INK}"/>'
                              f'<path fill="{MARKER}" d="{hl4}"/><path fill="{INK}" d="{q4}"/>', "ConvoPilot"))

    # Favicon 32: ink tile with marker quotes only (the chisel is too fine below 32 px)
    F = 32.0
    fq = quotes(F / 2, F / 2, 4.4, 2.0)
    write("favicon.svg", svg(F, F, f'<rect width="32" height="32" rx="7" fill="{INK}"/><path fill="{MARKER}" d="{fq}"/>', "ConvoPilot"))

    # Quote pair alone (pattern element for the "quote field"; not a logo on its own)
    qp = quotes(30, 20, 6.8, 3.2)
    write("pattern-quotes-ink.svg", svg(60, 40, f'<path fill="{INK}" d="{qp}"/>', "Quote pattern element"))

    # Social avatar 400: full-bleed marker, ink quotes, safe inside a circle crop
    S = 400.0
    sq = quotes(S / 2, S / 2, 40, 20)
    write("avatar.svg", svg(S, S, f'<rect width="400" height="400" fill="{MARKER}"/><path fill="{INK}" d="{sq}"/>', "ConvoPilot"))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
