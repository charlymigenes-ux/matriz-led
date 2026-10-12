"""Generador de programas del FK-8Wa contra las capturas reales de FKShow.

Portado de reference/tools/verify_long.py, verify_border.py y test_effects.py
del paquete nopal-fk8wa-panel. Además de comparar todo menos los píxeles
(como la referencia), se reconstruyen las páginas desde la propia plantilla
y se compara el archivo completo byte a byte, salvo los restos que FKShow deja
fuera del ancho de la última página (ver _mask_outside_last_page).
"""

import re
import struct

import pytest
from PIL import Image

from ..conftest import fk8wa_module

program = fk8wa_module("program")


def _text_of(template, at, span):
    raw = re.search(rb"lang2058 (.*)\\par", template[at:at + span]).group(1)
    raw = re.sub(rb"\\'([0-9a-f]{2})", lambda m: bytes([int(m.group(1), 16)]), raw)
    return raw.decode("cp1252")


def _image_from_pages(template, layout, n_pages, last_w):
    """Imagen cuyas páginas reproducen exactamente las de la plantilla."""
    data_at = struct.unpack_from("<I", template, 100)[0]
    width = layout.pw * (n_pages - 1) + last_w
    img = Image.new("1", (width, layout.ph), 0)
    for k in range(n_pages):
        base = data_at + layout.page_bytes * k
        for y in range(layout.ph):
            row = template[base + 12 * y: base + 12 * y + 12]
            for x in range(min(layout.pw, width - k * layout.pw)):
                if row[x // 8] >> (x % 8) & 1:
                    img.putpixel((k * layout.pw + x, y), 1)
    return img


def _mask_outside_last_page(template, layout, n_pages, last_w):
    """La captura de FKShow deja en la última página restos del texto más allá
    de su ancho declarado (el panel no los muestra). El generador solo escribe
    dentro del ancho, así que esos bits se ponen en cero para comparar."""
    data_at = struct.unpack_from("<I", template, 100)[0]
    out = bytearray(template)
    base = data_at + layout.page_bytes * (n_pages - 1)
    for y in range(layout.ph):
        for x in range(last_w, 96):
            out[base + 12 * y + x // 8] &= ~(1 << (x % 8)) & 0xFF
    return bytes(out)


def _last_page_width(template):
    e0 = struct.unpack_from("<I", template, 96)[0]
    n = struct.unpack_from("<H", template, 330)[0]
    return n, struct.unpack_from("<H", template, e0 + 40 * (n - 1) + 8)[0]


class TestLongTemplate:
    """14 páginas de 96x16, sin marco, Scroll tipo 2 subtipo 5 (verify_long.py)."""

    def test_same_size_and_bytes_outside_pages(self):
        tpl = program.PLAIN.template
        out = program.build_scroll(Image.new("1", (13 * 96 + 61, 16), 0), 10, _text_of(tpl, 3796, 430))
        assert len(out) == len(tpl) == 4470
        assert [i for i, (a, b) in enumerate(zip(out, tpl)) if a != b and not 1092 <= i < 3780] == []

    def test_whole_file_byte_for_byte(self):
        tpl = program.PLAIN.template
        n, last_w = _last_page_width(tpl)
        img = _image_from_pages(tpl, program.PLAIN, n, last_w)
        expected = _mask_outside_last_page(tpl, program.PLAIN, n, last_w)
        assert expected != tpl  # la captura sí trae esos restos
        assert program.build_scroll(img, 10, _text_of(tpl, 3796, 430)) == expected


class TestBorderTemplate:
    """4 páginas de 94x14 con marco, MoveIn 2, 4000 ms (verify_border.py)."""

    def _build(self, img):
        tpl = program.BORDERED.template
        r = tpl.index(b"{\\rtf1")
        return program.build_scroll(img, 5, _text_of(tpl, r, 260), (4, 2), 4000, program.BORDERED, (1, "dash", 5))

    def test_same_size_and_bytes_outside_pages(self):
        tpl = program.BORDERED.template
        out = self._build(Image.new("1", (3 * 94 + 94, 14), 0))
        assert len(out) == len(tpl) == 2004
        assert [i for i, (a, b) in enumerate(zip(out, tpl)) if a != b and i not in range(780, 1452)] == []

    def test_whole_file_byte_for_byte(self):
        tpl = program.BORDERED.template
        n, last_w = _last_page_width(tpl)
        expected = _mask_outside_last_page(tpl, program.BORDERED, n, last_w)
        assert self._build(_image_from_pages(tpl, program.BORDERED, n, last_w)) == expected


class TestEffectFields:
    """Campos de efecto (PROTOCOL.md §3 y §3.1): tipo, subtipo, permanencia, tamaño total."""

    @pytest.mark.parametrize("effect, stay", [((1, 0), 0), ((2, 1), 0), ((2, 5), 0), ((4, 1), 4000), ((7, 2), 2500)])
    def test_effect_and_stay(self, effect, stay):
        p = program.build_scroll(Image.new("1", (300, 16), 0), 10, "x", effect, stay)
        assert (p[332], p[333]) == effect
        assert struct.unpack_from("<H", p, 338)[0] == stay
        assert struct.unpack_from("<I", p, 40)[0] == len(p)

    @pytest.mark.parametrize("speed, stored", [(0, 1), (10, 10), (99, 60)])
    def test_speed_is_clamped(self, speed, stored):
        p = program.build_scroll(Image.new("1", (96, 16), 0), speed)
        assert struct.unpack_from("<H", p, program.SPEED_OFFSET)[0] == stored

    @pytest.mark.parametrize("style", sorted(program.BORDER_STYLES))
    @pytest.mark.parametrize("pattern", sorted(program.BORDER_PATTERNS))
    def test_borders(self, style, pattern):
        bid = program.BORDER_STYLES[style][0]
        p = program.build_scroll(Image.new("1", (400, 14), 0), 10, "x", (2, 1), 0, program.BORDERED, (bid, pattern, 26))
        e0 = struct.unpack_from("<I", p, 96)[0]
        n = struct.unpack_from("<H", p, 330)[0]
        aux_at = struct.unpack_from("<I", p, e0 + 40 * n + 20)[0]
        assert p[240] == bid
        assert struct.unpack_from("<H", p, 244)[0] == n
        assert struct.unpack_from("<H", p, 248)[0] == 26
        assert p[aux_at:aux_at + 2] == program.BORDER_PATTERNS[pattern][1]


class TestScreenProgram:
    def test_one_static_page_with_the_pixels(self):
        img = Image.new("1", (96, 16), 0)
        img.putpixel((0, 0), 1)
        img.putpixel((95, 15), 1)
        p = program.screen_program(img)
        assert (p[332], p[333]) == program.STATIC
        assert struct.unpack_from("<H", p, 330)[0] == 1
        data_at = struct.unpack_from("<I", p, 100)[0]
        page = p[data_at:data_at + 192]
        assert page[0] == 0b00000001                 # (0,0): bit de menor peso primero
        assert page[15 * 12 + 11] == 0b10000000       # (95,15)
        assert sum(bin(b).count("1") for b in page) == 2

    def test_rejects_other_sizes(self):
        with pytest.raises(ValueError):
            program.screen_program(Image.new("1", (288, 16), 0))
