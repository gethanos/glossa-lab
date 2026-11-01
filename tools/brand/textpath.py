# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Αθανάσιος-Αντώνιος Γεωργαλάς
# Μετατροπή κειμένου σε SVG paths από τις μεταβλητές γραμματοσειρές του έργου.
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
import functools

import os
FONTS = os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'fonts') + os.sep

@functools.lru_cache(None)
def load(family, subset, wght):
    f = TTFont(f'{FONTS}{family}-{subset}-wght-normal.woff2')
    return instancer.instantiateVariableFont(f, {'wght': wght})

def pick(family, ch, wght):
    for subset in ('latin', 'greek'):
        f = load(family, subset, wght)
        if ord(ch) in f.getBestCmap():
            return f
    raise KeyError(ch)

def text_path(text, x, y, size, family='commissioner', wght=800, tracking=0):
    """Επιστρέφει (d, πλάτος) για το κείμενο με αρχή (x, y) στη γραμμή βάσης."""
    d = []
    cx = x
    for ch in text:
        if ch == ' ':
            f = load(family, 'latin', wght)
            cx += f['hmtx'][f.getBestCmap()[32]][0] * size / f['head'].unitsPerEm + tracking
            continue
        f = pick(family, ch, wght)
        upm = f['head'].unitsPerEm
        s = size / upm
        name = f.getBestCmap()[ord(ch)]
        gs = f.getGlyphSet()
        pen = SVGPathPen(gs)
        gs[name].draw(TransformPen(pen, (s, 0, 0, -s, cx, y)))
        d.append(pen.getCommands())
        cx += f['hmtx'][name][0] * s + tracking
    return ' '.join(d), cx - x - tracking
