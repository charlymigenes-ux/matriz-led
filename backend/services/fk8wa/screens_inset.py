"""Las 12 pantallas en versión achicada (92x12), para dejar 2 píxeles libres
alrededor donde va el contador de tiempo (contorno) o un marco animado del
panel. Mismas zonas que screens.py, con un cactus de 10x12 y texto que cabe
en 12 filas (dos renglones van en la fuente diminuta).
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from PIL import Image

from . import screens
from .pixelfont import BIG, SMALL, TINY, draw_text, fits, normalize, text_width
from .screens import (DEFAULTS, KIND_TAG, NAME_ZONE_MIN, STATE_ICON, THERMO, _bar, _clip, _elapsed_or_kind, _fit,
                      _icon, _message, _name, _right, _sep, _wrapped, display_file)

IW, IH = 92, 12

CACTUS_SMALL = [
    "....##....",
    "...####...",
    ".#.####.#.",
    ".#.####.#.",
    ".#.####.#.",
    ".########.",
    "..######..",
    "...####...",
    "...####...",
    "...####...",
    "...####...",
    ".########.",
]

DOT5 = [".###.", "#####", "#####", "#####", ".###."]


def _base(logo: bool = True) -> Image.Image:
    img = Image.new("1", (IW, IH), 0)
    if logo:
        px = img.load()
        for y, row in enumerate(CACTUS_SMALL):
            for x, c in enumerate(row):
                if c == "#":
                    px[x, y] = 1
    return img


def _sep(img, x, dotted=False):  # noqa: F811 -- versión de 12 filas
    screens._sep(img, x, dotted, y0=1, y1=10)


def _machine_name(img, text, x):
    """Como screens._machine_name, para la versión de 12 filas. Devuelve la x del separador."""
    text = _clip(text, BIG if fits(text, BIG) else SMALL, 4 * 7 - 1)
    font = BIG if fits(text, BIG) else (SMALL if fits(text, SMALL) else TINY)
    zone = max(NAME_ZONE_MIN, text_width(text, font))
    draw_text(img, x, (IH - font.height + 1) // 2, text, font)
    return x + zone + 2


def _dot(img, x, y):
    px = img.load()
    for j, row in enumerate(DOT5):
        for i, c in enumerate(row):
            if c == "#":
                px[x + i, y + j] = 1


def _two_tiny(img, x, top_text, bottom_text, maxw, right=False):
    for y, text in ((1, top_text), (7, bottom_text)):
        text = _clip(text, TINY, maxw)
        if right:
            _right(img, x + maxw - 1, y, text, TINY)
        else:
            draw_text(img, x, y, text, TINY)


def s_boot(data):
    img = _base()
    _name(img, "NOPAL", x=12, maxw=34)
    _sep(img, 48)
    draw_text(img, 51, 0, _fit(["INICIANDO", "INICIO"], 41, (TINY,))[0], TINY)
    _bar(img, 51, 7, 41, data["progress"])
    return img


def s_normal(data):
    img = _base()
    _name(img, "NOPAL", x=12, maxw=34)
    _sep(img, 48)
    _dot(img, 51, 1)
    text, _ = _fit([f"{data['online']} ONLINE", f"{data['online']} ON"], 34, (TINY,))
    draw_text(img, 58, 1, text, TINY)
    _right(img, 91, 7, str(data["time"]), TINY)
    return img


def s_print1(data):
    img = _base()
    sep = _machine_name(img, data["printer"], 12)
    _sep(img, sep)
    ix = sep + 3
    text, font = _fit([data["file"]], 92 - ix)
    draw_text(img, ix, 0 if font is SMALL else 1, text, font)
    pct = f"{int(data['pct'])}%"
    _bar(img, ix, 8, 91 - text_width(pct, TINY) - 2 - ix, data["pct"])
    _right(img, 91, 7, pct, TINY)
    return img


def s_print2(data):
    img = _base()
    sep = _machine_name(img, data["printer"], 12)
    _sep(img, sep)
    px = sep + 3
    elapsed = _clip(_elapsed_or_kind(data), TINY, 30)
    room = 91 - text_width(elapsed, TINY) - px - 2
    ptext, pfont = _fit([f"{int(data['pct'])}%"], room, (BIG, SMALL, TINY))
    draw_text(img, px, (IH - pfont.height + 1) // 2, ptext, pfont)
    _right(img, 91, 7, elapsed, TINY)
    return img


def _label_with_icon(img, x, label, state, slot):
    icon = STATE_ICON.get(state, "online")
    label = normalize(label)
    for font, small in ((BIG, False), (BIG, True), (SMALL, True), (TINY, True)):
        icon_w = 5 if small else 8
        if fits(label, font) and text_width(label, font) + 2 + icon_w <= slot:
            end = draw_text(img, x, (IH - font.height + 1) // 2, label, font)
            _icon(img, icon, end + 2, 3 if small else 2, small)
            return
    end = draw_text(img, x, (IH - TINY.height + 1) // 2, _clip(label, TINY, slot - 7), TINY)
    _icon(img, icon, end + 2, 3, True)


def s_many(data):
    img = _base()
    x = 12
    for machine in list(data["machines"])[:3]:
        _label_with_icon(img, x, machine.get("label", "?"), machine.get("state"), 27)
        x += 27
    return img


def s_pause(data):
    img = _base()
    sep = _machine_name(img, data["printer"], 12)
    _sep(img, sep, dotted=True)
    _icon(img, "pause", sep + 3, 2)
    text, font = _fit(["PAUSA"], 92 - (sep + 13), (BIG, SMALL, TINY))
    draw_text(img, sep + 13, (IH - font.height + 1) // 2, text, font)
    return img


def s_error(data):
    img = _base()
    sep = _machine_name(img, data["printer"], 12)
    _sep(img, sep, dotted=True)
    _icon(img, "warn", sep + 3, 2)
    room = 92 - (sep + 13)
    if not _message(img, sep + 13, data["error"], room):
        _wrapped(img, sep + 13, data["error"], room)
    return img


def s_offline(data):
    img = _base()
    sep = _machine_name(img, data["printer"], 12)
    _sep(img, sep, dotted=True)
    _icon(img, "ring", sep + 3, 2)
    text, font = _fit(["OFFLINE", "OFF"], 92 - (sep + 13))
    draw_text(img, sep + 13, (IH - font.height + 1) // 2, text, font)
    return img


def s_heating(data):
    img = _base()
    sep = _machine_name(img, data["printer"], 12)
    _sep(img, sep)
    px = img.load()
    for j, row in enumerate(THERMO):
        for i, c in enumerate(row):
            if c == "#":
                px[sep + 3 + i, 1 + j] = 1
    now, goal = int(data.get("temp", 0)), max(1, int(data.get("target", 1)))
    text, font = _fit([f"{now}/{goal}"], 92 - (sep + 11), (SMALL, TINY))
    draw_text(img, sep + 11, 0 if font is SMALL else 1, text, font)
    _bar(img, sep + 11, 8, 92 - (sep + 11) - 1, 100 * now / goal)
    return img


def s_idle(data):
    img = _base()
    time_text = str(data["time"])
    room = 91 - text_width(time_text, SMALL) - 12 - 3
    text, font = _fit([f"{data['total']} IDLE"], room, (BIG, SMALL, TINY))
    draw_text(img, 12, (IH - font.height + 1) // 2, text, font)
    _right(img, 91, 3, time_text, SMALL)
    return img


def s_done(data):
    img = _base()
    _icon(img, "check", 12, 2)
    draw_text(img, 22, 1, "TERMINADO", TINY)
    head, tail = f"{data['printer']} ", " 100%"
    room = 70 - text_width(head, TINY) - text_width(tail, TINY)
    name = _clip(data["file"], TINY, room)
    draw_text(img, 22, 7, f"{head}{name}{tail}" if name else f"{data['printer']}{tail}", TINY)
    return img


def s_special(data):
    msg = str(data["msg"])
    probe = _base()
    _name(probe, "NOPAL", x=12, maxw=34)
    if _message(probe, 51, msg, 41):
        _sep(probe, 48)
        return probe
    img = _base()
    if not _message(img, 12, msg, 80):
        _wrapped(img, 12, msg, 80)
    return img


def s_off(data):
    img = _base()
    _name(img, "NOPAL", x=12, maxw=34)
    _sep(img, 48)
    _two_tiny(img, 51, "HASTA", "PRONTO", 41)
    return img


SCREENS = {
    "boot": s_boot, "normal": s_normal, "print1": s_print1, "print2": s_print2, "many": s_many,
    "pause": s_pause, "error": s_error, "offline": s_offline, "heating": s_heating, "idle": s_idle, "done": s_done,
    "special": s_special, "off": s_off,
}


def render(name: str, data: Optional[Dict[str, Any]] = None) -> Image.Image:
    if name not in SCREENS:
        raise ValueError(f"pantalla desconocida: {name}")
    merged = {**DEFAULTS, **{k: v for k, v in (data or {}).items() if v is not None}}
    merged["file"] = display_file(merged["file"])
    return SCREENS[name](merged)
