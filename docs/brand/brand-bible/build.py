"""Inlines the real logo paths from public/brand into the brand-bible page template."""
import re, sys
from pathlib import Path
brand = Path(sys.argv[1]); tpl = Path(sys.argv[2]).read_text(); out = Path(sys.argv[3])
def paths(name):
    s = (brand / f"{name}.svg").read_text()
    return re.search(r'viewBox="([^"]+)"', s).group(1), re.findall(r' d="([^"]+)"', s)
vb_h, (h_c, h_q, h_w) = paths("logo-horizontal")
vb_v, (v_c, v_q, v_w) = paths("logo-vertical")
vb_s, (s_c, s_q) = paths("symbol")
vb_m, (m_m, m_w) = paths("logo-horizontal-mono-ink")
_, (a_q,) = paths("app-icon")[0], paths("app-icon")[1][1:]
app_vb, app_p = paths("app-icon")
fav_vb, (fav_q,) = paths("favicon")
av_vb, (av_q,) = paths("avatar")
pat_vb, (pat_q,) = paths("pattern-quotes-ink")
C = 'style="fill:var(--lg-c,#FFD23F)"'; Q = 'style="fill:var(--lg-q,#0E1B2C)"'; W = 'style="fill:var(--lg-w,currentColor)"'; M = 'style="fill:var(--lg-m,currentColor)"'
defs = f'''<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>
<symbol id="cp-logo-h" viewBox="{vb_h}"><path {C} d="{h_c}"/><path {Q} d="{h_q}"/><path {W} d="{h_w}"/></symbol>
<symbol id="cp-logo-v" viewBox="{vb_v}"><path {C} d="{v_c}"/><path {Q} d="{v_q}"/><path {W} d="{v_w}"/></symbol>
<symbol id="cp-logo-mono" viewBox="{vb_m}"><path {M} fill-rule="evenodd" d="{m_m}"/><path {M} d="{m_w}"/></symbol>
<symbol id="cp-mark" viewBox="{vb_s}"><path {C} d="{s_c}"/><path {Q} d="{s_q}"/></symbol>
<symbol id="cp-mark-mono" viewBox="{vb_s}"><path {M} fill-rule="evenodd" d="{s_c}{s_q}"/></symbol>
<symbol id="cp-app" viewBox="{app_vb}"><rect width="1024" height="1024" rx="230" fill="#0E1B2C"/><path fill="#FFD23F" d="{app_p[0]}"/><path fill="#0E1B2C" d="{app_p[1]}"/></symbol>
<symbol id="cp-fav" viewBox="{fav_vb}"><rect width="32" height="32" rx="7" fill="#0E1B2C"/><path fill="#FFD23F" d="{fav_q}"/></symbol>
<symbol id="cp-avatar" viewBox="{av_vb}"><rect width="400" height="400" fill="#FFD23F"/><path fill="#0E1B2C" d="{av_q}"/></symbol>
<symbol id="cp-quotes" viewBox="{pat_vb}"><path {Q} d="{pat_q}"/></symbol>
</defs></svg>'''
html = tpl.replace("%%DEFS%%", defs).replace("%%S_CHISEL%%", s_c).replace("%%S_QUOTES%%", s_q).replace("%%S_VB%%", vb_s)
# split the two quote forms for staggered animation
q1, q2 = "M" + s_q.split("ZM")[0][1:] + "Z", "M" + s_q.split("ZM")[1]
html = html.replace("%%S_Q1%%", q1).replace("%%S_Q2%%", q2)
out.write_text(html); print(out, len(html))
