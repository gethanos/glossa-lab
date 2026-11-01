# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
"""
Παράγει όλα τα στοιχεία ταυτότητας του GlossaLab από ένα σημείο:

  src/ui/brand-mark.js          το εικονίδιο ως SVG για την εφαρμογή (σήμα, favicon)
  docs/brand/icon.svg           εικονίδιο
  docs/brand/logo-light.svg     πλήρες λογότυπο για φωτεινό φόντο
  docs/brand/logo-dark.svg      πλήρες λογότυπο για σκοτεινό φόντο
  docs/brand/icon-512.png       εικονίδιο σε PNG (και icon-192, favicon-32)
  docs/brand/apple-touch-icon.png, icon-maskable-512.png
                                εικονίδια χωρίς διαφάνεια, για iOS και Android
  docs/brand/social-preview.png εικόνα 1280x640 για GitHub / κοινοποιήσεις

Τα κείμενα μετατρέπονται σε καμπύλες από τις γραμματοσειρές του src/fonts,
ώστε τα αρχεία να εμφανίζονται ίδια παντού.

Χρήση:  pip install fonttools brotli cairosvg
        python3 tools/brand/make_brand.py
"""
import os
from textpath import text_path

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
NAVY = '#293E84'
ORANGE = ('#F09127', '#E0601C')


def grad(id_, x1, y1, x2, y2, stops):
    s = ''.join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in stops)
    return (f'<linearGradient id="{id_}" gradientUnits="userSpaceOnUse" '
            f'x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}">{s}</linearGradient>')


def node(x, y, r, stroke, fill):
    return f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.2f}" fill="{fill}" stroke="{stroke}" stroke-width="{r * 0.7:.2f}"/>'


def svg(w, h, defs, body, extra=''):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0f} {h:.0f}" width="{w:.0f}" height="{h:.0f}"{extra}>'
            f'<defs>{defs}</defs>{body}</svg>')


def link(cx, cy, size, gid, w, uid):
    """Αλυσίδα: δύο δεμένοι κρίκοι υπό 45°, όπως στο λογότυπο CITEd.
    Η επικάλυψη γίνεται με mask, ώστε να δείχνει σωστά σε οποιοδήποτε φόντο."""
    L, H = size * 0.62, size * 0.34
    off = size * 0.19

    def ring(dx, stroke, width, extra=''):
        return (f'<rect x="{cx + dx - L / 2:.1f}" y="{cy - H / 2:.1f}" width="{L:.1f}" height="{H:.1f}" rx="{H / 2:.1f}" '
                f'fill="none" stroke="{stroke}" stroke-width="{width:.2f}" transform="rotate(-45 {cx:.1f} {cy:.1f})"{extra}/>')

    m = size * 2
    mask = (f'<mask id="{uid}m" maskUnits="userSpaceOnUse" x="{cx - m:.1f}" y="{cy - m:.1f}" width="{2 * m:.1f}" height="{2 * m:.1f}">'
            f'<rect x="{cx - m:.1f}" y="{cy - m:.1f}" width="{2 * m:.1f}" height="{2 * m:.1f}" fill="#fff"/>'
            + ring(off, '#000', w + w * 0.7) + '</mask>')
    body = ring(-off, f'url(#{gid})', w, f' mask="url(#{uid}m)"') + ring(off, f'url(#{gid})', w)
    return mask, body


def traces(ox, oy, gid, k=1.0):
    """Γραμμές «κυκλώματος» προς τα πάνω-δεξιά, με κόμβους στις άκρες, όπως στο λογότυπο CITEd."""
    lines = [
        [(0, 0), (0, -18), (14, -32), (60, -32)],
        [(12, 0), (12, -10), (30, -28), (30, -44), (40, -54), (78, -54)],
        [(24, 0), (24, -6), (46, -28), (96, -28)],
        [(36, 0), (52, -16), (112, -16), (124, -28)],
        [(48, 6), (128, 6)],
    ]
    out = ''
    for pts in lines:
        pp = [(ox + x * k, oy + y * k) for x, y in pts]
        d = 'M' + ' L'.join(f'{x:.1f} {y:.1f}' for x, y in pp)
        out += (f'<path d="{d}" fill="none" stroke="url(#{gid})" stroke-width="{2.6 * k:.2f}" '
                f'stroke-linecap="round" stroke-linejoin="round"/>')
        ex, ey = pp[-1]
        out += node(ex + 3.4 * k, ey, 3.2 * k, f'url(#{gid})', 'none')
    return out


def icon():
    """Εικονίδιο: λευκό Γ σε σκούρο μπλε πλακίδιο, ο κρίκος του CITEd και πορτοκαλί βάση."""
    defs = (grad('gll', 70, 108, 112, 70, [('0', '#48AA6C'), ('.5', '#A0CB45'), ('1', '#27A8C9')])
            + '<clipPath id="glclip"><rect width="128" height="128" rx="28"/></clipPath>')
    mask, chain = link(92, 86, 50, 'gll', 7, 'gl')
    glyph = text_path('Γ', 22, 98, 92, wght=800)[0]
    body = ('<rect width="128" height="128" rx="28" fill="' + NAVY + '"/>'
            f'<path d="{glyph}" fill="#FFFFFF"/>' + chain
            + '<rect y="116" width="128" height="12" fill="#F09127" clip-path="url(#glclip)"/>')
    return svg(128, 128, defs + mask, body)


def full_bleed_icon():
    """Εικονίδιο που γεμίζει όλο το τετράγωνο, για iOS και για «maskable» εικονίδια Android:
    το σήμα μένει μέσα στην ασφαλή ζώνη (80% του κέντρου), ώστε να μην κόβεται."""
    band = '<rect y="116" width="128" height="12" fill="#F09127" clip-path="url(#glclip)"/>'
    inner = icon().split('>', 1)[1].rsplit('</svg>', 1)[0].replace(band, '')
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">'
            f'<rect width="128" height="128" fill="{NAVY}"/>'
            f'<g transform="translate(12.8 8) scale(.8)">{inner}</g>'
            '<rect y="118" width="128" height="10" fill="#F09127"/></svg>')


def lockup(dark, scale=1.0, pad=24, uid='lk'):
    """Πλήρες λογότυπο: «ΓΛΩΣΣΑ» + κρίκος + «Lab» + κυκλώματα, υπότιτλος και CITEd.gr."""
    s = scale
    ink = '#FFFFFF' if dark else NAVY
    base = pad * s + 94 * s
    d1, w1 = text_path('ΓΛΩΣΣΑ', pad * s, base, 66 * s, wght=800)
    lx = pad * s + w1 + 34 * s
    d2, w2 = text_path('Lab', lx + 34 * s, base, 66 * s, wght=800)
    end = lx + 34 * s + w2
    tag = 'ΕΡΓΑΣΤΗΡΙΟ ΠΡΟΓΡΑΜΜΑΤΙΣΜΟΥ'
    ty = base + 32 * s
    d3, w3 = text_path(tag, pad * s + 2 * s, ty, 15.5 * s, wght=700, tracking=1.6 * s)
    cx0 = pad * s + 2 * s + w3 + 16 * s
    d4, w4 = text_path('CITEd.gr', cx0, ty, 15.5 * s, wght=800, tracking=0.4 * s)
    W = max(end + 150 * s, cx0 + w4) + pad * s
    H = ty + pad * s
    defs = (grad(f'{uid}lab', lx + 34 * s, 0, end, 0, [('0', ORANGE[0]), ('1', ORANGE[1])])
            + grad(f'{uid}lnk', lx - 24 * s, base - 8 * s, lx + 24 * s, base - 48 * s, [('0', '#48AA6C'), ('.5', '#A0CB45'), ('1', '#2389C1')])
            + grad(f'{uid}trc', end - 30 * s, 0, end + 140 * s, 0,
                   [('0', '#2389C1' if dark else '#245098'), ('.25', '#2389C1'), ('.4', '#27A8C9'), ('.58', '#48AA6C'),
                    ('.7', '#A0CB45'), ('.86', '#F09127'), ('1', '#EB7725')])
            + grad(f'{uid}cit', cx0, 0, cx0 + w4, 0, [('0', '#4FA3DA' if dark else '#245098'), ('.55', '#48AA6C'), ('1', '#F09127')]))
    mask, chain = link(lx, base - 22 * s, 62 * s, f'{uid}lnk', 8 * s, uid)
    body = (f'<path d="{d1}" fill="{ink}"/>' + chain + f'<path d="{d2}" fill="url(#{uid}lab)"/>'
            + traces(end - 26 * s, base - 50 * s, f'{uid}trc', s)
            + f'<path d="{d3}" fill="{ink}"/><path d="{d4}" fill="url(#{uid}cit)"/>')
    return W, H, defs + mask, body


def logo(dark):
    W, H, defs, body = lockup(dark)
    return svg(W, H, defs, body)


def social_preview():
    """1280x640: λογότυπο στο κέντρο, σύντομη περιγραφή και διεύθυνση."""
    W, H = 1280, 640
    lw, lh, defs, body = lockup(False, scale=1.75, pad=0)
    ox, oy = (W - lw) / 2, 150
    line1 = 'Βηματική εκτέλεση, απεικόνιση μνήμης, εξήγηση κάθε λάθους'
    w5 = text_path(line1, 0, 0, 30, wght=500)[1]
    d5 = text_path(line1, (W - w5) / 2, 470, 30, wght=500)[0]
    url = 'vle.cited.gr/apps/glossa-lab'
    w6 = text_path(url, 0, 0, 24, wght=700)[1]
    d6 = text_path(url, (W - w6) / 2, 520, 24, wght=700)[0]
    content = (f'<rect width="{W}" height="{H}" fill="#FFFFFF"/>'
               f'<rect y="{H - 14}" width="{W}" height="14" fill="url(#bar)"/>'
               f'<g transform="translate({ox:.1f} {oy})">{body}</g>'
               f'<path d="{d5}" fill="#3A4870"/><path d="{d6}" fill="{NAVY}"/>')
    defs += grad('bar', 0, 0, W, 0, [('0', '#245098'), ('.3', '#27A8C9'), ('.5', '#48AA6C'), ('.7', '#A0CB45'), ('1', '#F09127')])
    return svg(W, H, defs, content)


def write(path, content):
    full = os.path.join(ROOT, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    mode = 'wb' if isinstance(content, bytes) else 'w'
    with open(full, mode) as f:
        f.write(content)
    print(path)


def main():
    import cairosvg
    ic = icon()
    write('docs/brand/icon.svg', ic)
    write('docs/brand/logo-light.svg', logo(False))
    write('docs/brand/logo-dark.svg', logo(True))
    for size, name in ((512, 'icon-512.png'), (192, 'icon-192.png'), (32, 'favicon-32.png')):
        write(f'docs/brand/{name}', cairosvg.svg2png(bytestring=ic.encode(), output_width=size, output_height=size))
    full = full_bleed_icon().encode()
    write('docs/brand/apple-touch-icon.png', cairosvg.svg2png(bytestring=full, output_width=180, output_height=180))
    write('docs/brand/icon-maskable-512.png', cairosvg.svg2png(bytestring=full, output_width=512, output_height=512))
    write('docs/brand/social-preview.png', cairosvg.svg2png(bytestring=social_preview().encode()))
    js = ('// SPDX-License-Identifier: MIT\n'
          '// Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς\n'
          '// ΠΑΡΑΓΕΤΑΙ ΑΥΤΟΜΑΤΑ από το tools/brand/make_brand.py. Μην το αλλάζεις με το χέρι.\n'
          '// Το εικονίδιο της εφαρμογής (σήμα στην μπάρα τίτλου, «Σχετικά», favicon).\n\n'
          f'export const ICON_SVG = {ic!r};\n\n'
          '/**\n'
          ' * Το εικονίδιο με μοναδικά id (gradient, clipPath), ώστε να μπορεί να υπάρχει\n'
          ' * περισσότερες από μία φορές στην ίδια σελίδα.\n'
          ' * @param {string} uid πρόθεμα για τα id\n'
          ' */\n'
          'export function iconSvg(uid) {\n'
          '  return ICON_SVG.replaceAll(\'id="gl\', `id="${uid}`).replaceAll(\'url(#gl\', `url(#${uid}`);\n'
          '}\n')
    write('src/ui/brand-mark.js', js)


if __name__ == '__main__':
    main()
