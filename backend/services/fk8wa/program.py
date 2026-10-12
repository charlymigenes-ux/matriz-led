"""Generador de programas para el panel FK-8Wa (96x16, monocromo).

Copia de reference/dash.py del paquete nopal-fk8wa-panel (build_scroll y sus
piezas), verificada byte a byte contra capturas reales de FKShow. No se
construye un programa desde cero: se parte de una plantilla de "Subtitulos"
capturada y solo se recalculan tablas, tamanos y offsets (little-endian).
Ver docs/PROTOCOL.md §3 de ese paquete; no agregar campos que no esten ahi.

Las pantallas NOPAL usan screen_program(): 1 pagina de 96x16 con efecto
Static (tipo 1, subtipo 0), que muestra las 16 filas. El programa "fijo" de
template.bin de la referencia solo muestra 12 filas y no se usa.
"""

from __future__ import annotations

import struct
from pathlib import Path

from PIL import Image

TEMPLATES_DIR = Path(__file__).resolve().parent / "templates"

W, H = 96, 16
GROUPS_AT = 420                  # tabla de grupos (8 bytes c/u), luego entradas (40 c/u), luego paginas
MAX_PAGES = 40
SPEED_OFFSET = 336               # u16 update_time del efecto (FKShow dejo 10; menor = mas rapido)
BORDER_AT = 240                  # ST_BORDER_ANIMATION: tipo, subtipo, dmy, step, acts_inx, acts_cnt, update_time...

# Estilos de marco (ENUM_BORDER_PLAY_STYLE de FKShow) y patrones de 16 px (bits de menor a mayor peso).
BORDER_STYLES = {
    "fixed": (1, "Fijo"), "random": (2, "Aleatorio"), "cw": (3, "Horario"), "ccw": (4, "Antihorario"),
    "flash": (5, "Parpadeo"), "flash_cw": (6, "Parpadeo horario"), "flash_ccw": (7, "Parpadeo antihorario"),
    "line_cw": (11, "Una linea horario"), "line_ccw": (12, "Una linea antihorario"),
    "dline_cw": (13, "Dos lineas horario"), "dline_ccw": (14, "Dos lineas antihorario"),
}
BORDER_PATTERNS = {
    "dash": ("Guiones 4/4", b"\x3c\x3c", [0, 0, 1, 1, 1, 1, 0, 0] * 2),
    "solid": ("Continuo", b"\xff\xff", [1] * 16),
    "dot": ("Puntos 2/2", b"\x33\x33", [1, 1, 0, 0] * 4),
    "dot1": ("Puntos 1/1", b"\x55\x55", [1, 0] * 8),
}

# Animacion de entrada de una pantalla completa: Static (tipo 1, subtipo 0).
STATIC = (1, 0)


class Layout:
    """Disposicion de un programa de Subtitulos, leida de una captura real de FKShow."""

    def __init__(self, path, page_w, page_h, baseline, bordered):
        tpl = (TEMPLATES_DIR / path).read_bytes()
        u32 = lambda o: struct.unpack_from("<I", tpl, o)[0]  # noqa: E731
        self.pw, self.ph, self.base, self.bordered = page_w, page_h, baseline, bordered
        self.page_bytes = 12 * page_h
        self.head = tpl[:GROUPS_AT]
        e0 = u32(96)
        self.entry0 = tpl[e0:e0 + 40]
        self.aux_entries = [tpl[e0 + 40 * i:e0 + 40 * i + 40] for i in range(4, 8)] if bordered else []
        r = tpl.index(b"{\\rtf1")
        rtf_len = u32(r - 4)
        rtf = tpl[r:r + rtf_len]
        self.rtf_head = rtf[:rtf.index(b"\\lang2058 ") + len(b"\\lang2058 ")]
        self.rtf_tail = b"\\par\r\n}\r\n"
        self.id8 = tpl[r - 12:r - 4]
        self.after = tpl[r + rtf_len:]            # nombres y marcas de tiempo, no dependen del largo
        self.template = tpl


PLAIN = Layout("template_long.bin", 96, 16, 11, False)          # 14 paginas de 96x16, sin marco
BORDERED = Layout("template_border.bin", 94, 14, 10, True)      # 4 paginas de 94x14 + marco


def _rtf(text, L=PLAIN):
    out = bytearray()
    for ch in text:
        if ch in "\\{}":
            out += b"\\" + ch.encode()
        elif ord(ch) < 128:
            out += ch.encode()
        else:
            try:
                out += b"\\'%02x" % ch.encode("cp1252")[0]
            except UnicodeEncodeError:
                out += b"?"
    return L.rtf_head + bytes(out) + L.rtf_tail


def border_block(pattern="dash"):
    """40 bytes: patron horizontal (2+2) y vertical (16), repetidos para los dos lados."""
    _, hbits, vbits = BORDER_PATTERNS.get(pattern, BORDER_PATTERNS["dash"])
    one = hbits + b"\x00\x00" + bytes(vbits)
    return one + one


def build_scroll(img, speed=10, text="", effect=(2, 5), stay_ms=0, L=PLAIN, border=None):
    """Programa de Subtitulos. effect = (AnimationType, subtipo); stay_ms = permanencia por pagina.
    border = (id_estilo, patron, velocidad) solo con la disposicion BORDERED."""
    pw, bordered = L.pw, L.bordered
    n = max(1, -(-img.width // pw))
    last_w = img.width - pw * (n - 1)
    n_groups = n + (1 if bordered else 0)
    n_entries = n + (4 if bordered else 0)
    aux = 40 if bordered else 0
    data_at = GROUPS_AT + 8 * n_groups + 40 * n_entries
    pages_end = data_at + L.page_bytes * n + aux
    rtf = _rtf(text, L)
    rtf_end = pages_end + 4 + 8 + 4 + len(rtf)
    total = rtf_end + len(L.after)

    head = bytearray(L.head)
    for off, val in ((40, total), (56, pages_end - 84), (64, pages_end), (72, rtf_end + 24),
                     (80, pages_end - 84), (84, pages_end - 84), (96, GROUPS_AT + 8 * n_groups),
                     (100, data_at), (104, L.page_bytes * n + aux),
                     (204, pages_end - (316 if bordered else 308)), (320, len(rtf) + 36)):
        head[off:off + 4] = struct.pack("<I", val)
    for off, val in ((90, n_groups), (92, n_entries), (330, n)):
        head[off:off + 2] = struct.pack("<H", val)
    head[SPEED_OFFSET:SPEED_OFFSET + 2] = struct.pack("<H", max(1, min(60, int(speed))))
    head[332], head[333] = effect                                    # tipo y subtipo de la animacion de entrada
    head[SPEED_OFFSET + 2:SPEED_OFFSET + 4] = struct.pack("<H", max(0, min(65535, int(stay_ms))))
    if bordered:
        style, _pattern, bspeed = border or (1, "dash", 5)
        head[BORDER_AT] = style
        head[BORDER_AT + 4:BORDER_AT + 6] = struct.pack("<H", n)     # acts_inx: primera entrada del marco
        head[BORDER_AT + 8:BORDER_AT + 10] = struct.pack("<H", max(1, min(60, int(bspeed))))

    groups = b"".join(struct.pack("<HHI", i, 1, 0) for i in range(n))
    if bordered:
        groups += struct.pack("<HHI", n, 4, 0)
    entries = bytearray()
    for i in range(n):
        e = bytearray(L.entry0)
        e[0] = i
        e[8:10] = struct.pack("<H", pw if i < n - 1 else last_w)
        e[20:24] = struct.pack("<I", data_at + L.page_bytes * i)
        entries += e
    for j, tpl_e in enumerate(L.aux_entries):
        e = bytearray(tpl_e)
        e[0] = n + j
        e[20:24] = struct.pack("<I", pages_end - 40 + (0, 4, 20, 24)[j])
        entries += e
    pages = bytearray()
    for k in range(n):
        for y in range(L.ph):
            row = bytearray(12)
            for x in range(min(pw, img.width - k * pw)):
                if img.getpixel((k * pw + x, y)):
                    row[x // 8] |= 1 << (x % 8)
            pages += row
    if bordered:
        pages += border_block((border or (1, "dash", 5))[1])
    tail = struct.pack("<I", pages_end + 4) + L.id8 + struct.pack("<I", len(rtf)) + rtf + L.after
    out = bytes(head) + groups + bytes(entries) + bytes(pages) + tail
    assert len(out) == total, (len(out), total)
    return out


def screen_program(img: Image.Image) -> bytes:
    """Pantalla completa de 96x16 (usa las 16 filas): un programa de Subtitulos de 1 pagina con efecto Static (1, 0)."""
    if img.size != (W, H):
        raise ValueError(f"la pantalla debe medir {W}x{H}, no {img.width}x{img.height}")
    return build_scroll(img, 10, "NOPAL", STATIC, 0, PLAIN)
