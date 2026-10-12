"""Las 12 pantallas NOPAL del panel FK-8Wa (96x16, monocromo).

Basadas en reference/screens.py del paquete nopal-fk8wa-panel (zonas, cactus
e iconos 8x8), con el texto dibujado por pixelfont en lugar de fuentes TTF.
Zonas: 0-15 cactus, 18-54 nombre (NOPAL, P1), separador, resto estado/info.

Cada función recibe `data` ya combinado con DEFAULTS y devuelve una imagen
modo "1" de 96x16. Ningún texto se sale del panel ni se encima: lo que no
cabe se acorta con un criterio fijo (otra versión, otra fuente o recorte).
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence, Tuple

from PIL import Image

from .pixelfont import BIG, SMALL, TINY, Font, draw_text, fits, normalize, text_width

W, H = 96, 16

DEFAULTS: Dict[str, Any] = {
    "online": 3, "time": "17:42", "printer": "P1", "file": "CUBO", "pct": 72, "elapsed": "01:24",
    "error": "TEMP HOT", "total": 3, "progress": 45, "msg": "TODO BIEN",
    "machines": [{"label": "P1", "state": "printing"}, {"label": "P2", "state": "printing"},
                 {"label": "P3", "state": "printing"}],
}

THERMO = ["..##..", "..##..", "..##..", "..##..", "..##..", "..##..", ".####.", "######", "######", ".####."]

# Iconos de estado de 5x5 para etiquetas largas (ET4, TTS...) en la pantalla de varias máquinas.
ICONS5 = {
    "online": [".###.", "#####", "#####", "#####", ".###."],
    "offline": [".###.", "#...#", "#.#.#", "#...#", ".###."],
    "ring": [".###.", "#...#", "#.#.#", "#...#", ".###."],
    "pause": ["##.##", "##.##", "##.##", "##.##", "##.##"],
    "warn": ["..#..", ".#.#.", ".#.#.", "#...#", "#####"],
    "check": ["....#", "...##", "#.##.", "###..", ".#..."],
}
NAME_ZONE_MIN = 16      # ancho reservado al nombre (cabe "P1"); con nombres más largos crece
NAME_MAX_CHARS = 4
KIND_TAG = {"laser": "LASER", "cnc": "CNC"}

ICONS = {
    "online": ["..####..", ".######.", "########", "########", "########", "########", ".######.", "..####.."],
    "offline": ["..####..", ".#....#.", "#......#", "#......#", "#......#", "#......#", ".#....#.", "..####.."],
    "ring": ["..####..", ".#....#.", "#..##..#", "#.####.#", "#.####.#", "#..##..#", ".#....#.", "..####.."],
    "pause": ["........", ".##..##.", ".##..##.", ".##..##.", ".##..##.", ".##..##.", ".##..##.", "........"],
    "warn": ["...##...", "...##...", "..#..#..", "..#..#..", ".#.##.#.", ".#.##.#.", "#......#", "########"],
    "check": ["........", ".......#", "......##", "#....##.", "##..##..", ".####...", "..##....", "........"],
}

# Icono de cada estado en la pantalla de varias máquinas.
STATE_ICON = {"printing": "online", "paused": "pause", "error": "warn", "offline": "ring"}


def cactus() -> Image.Image:
    """Saguaro de 14x16 dibujado por columnas (copia de la referencia)."""
    img = Image.new("1", (16, 16), 0)
    px = img.load()

    def col(x, y0, y1):
        for y in range(y0, y1 + 1):
            px[x + 1, y] = 1

    for x in (6, 7):
        col(x, 0, 0)
    for x in range(5, 9):
        col(x, 1, 15)
    for x in (1, 2, 3):
        col(x, 4, 9)
    for x in (10, 11, 12):
        col(x, 4, 9)
    col(2, 3, 3)
    col(11, 3, 3)
    for x in range(1, 13):
        col(x, 9, 10)
    for x in range(3, 11):
        col(x, 15, 15)
    return img


def _icon(img: Image.Image, name: str, x: int, y: int, small: bool = False) -> None:
    px = img.load()
    for j, row in enumerate((ICONS5 if small else ICONS)[name]):
        for i, c in enumerate(row):
            if c == "#" and 0 <= x + i < img.width and 0 <= y + j < img.height:
                px[x + i, y + j] = 1


def _base(logo: bool = True) -> Image.Image:
    img = Image.new("1", (W, H), 0)
    if logo:
        img.paste(cactus(), (0, 0))
    return img


def _sep(img: Image.Image, x: int, dotted: bool = False, y0: int = 2, y1: int = 13) -> None:
    px = img.load()
    for y in range(y0, y1 + 1):
        if not dotted or y % 2 == 0:
            px[x, y] = 1


def _bar(img: Image.Image, x: int, y: int, w: int, pct: float, h: int = 4) -> None:
    px = img.load()
    for i in range(w):
        px[x + i, y] = 1
        px[x + i, y + h - 1] = 1
    for j in range(h):
        px[x, y + j] = 1
        px[x + w - 1, y + j] = 1
    fill = int((w - 2) * max(0.0, min(100.0, float(pct))) / 100)
    for i in range(fill):
        for j in range(1, h - 1):
            px[x + 1 + i, y + j] = 1


def _clip(text: str, font: Font, maxw: int) -> str:
    """Recorta por caracteres (nunca a la mitad de un glifo) hasta que quepa."""
    text = normalize(text)
    while text and text_width(text, font) > maxw:
        text = text[:-1]
    return text.rstrip()


def _fit(alts: Sequence[str], maxw: int, fonts: Sequence[Font] = (SMALL, TINY)) -> Tuple[str, Font]:
    """Primera combinación (texto, fuente) que cabe; si ninguna, la primera
    alternativa recortada en la última fuente."""
    for text in alts:
        for font in fonts:
            if text_width(text, font) <= maxw:
                return normalize(text), font
    return _clip(alts[0], fonts[-1], maxw), fonts[-1]


def _right(img: Image.Image, right: int, y: int, text: str, font: Font) -> None:
    draw_text(img, right - text_width(text, font) + 1, y, text, font)


def _name(img: Image.Image, text: str, x: int = 18, maxw: int = 36) -> int:
    """Nombre grande (NOPAL). Devuelve la x donde termina."""
    text, font = _fit([text], maxw, (BIG, SMALL, TINY))
    y = (img.height - font.height + 1) // 2
    return draw_text(img, x, y, text, font)


def _machine_name(img: Image.Image, text: str, x: int) -> int:
    """Nombre corto de una máquina (hasta 4 caracteres) en letra grande.
    Devuelve la x del separador: deja la zona de siempre (16 px, cabe "P1") y
    solo crece si el nombre es más largo, así lo que sigue se corre lo justo."""
    text = _clip(text, BIG if fits(text, BIG) else SMALL, 4 * 7 - 1)
    font = BIG if fits(text, BIG) else (SMALL if fits(text, SMALL) else TINY)
    zone = max(NAME_ZONE_MIN, text_width(text, font))
    draw_text(img, x, (img.height - font.height + 1) // 2, text, font)
    return x + zone + 2


def _two_lines(text: str, maxw: int, fonts: Sequence[Font] = (SMALL, TINY)) -> Optional[Tuple[List[str], Font]]:
    """Reparte el texto en dos renglones por palabras, en la fuente más grande que quepa."""
    words = normalize(text).split()
    for font in fonts:
        for cut in range(1, len(words)):
            lines = [" ".join(words[:cut]), " ".join(words[cut:])]
            if all(text_width(line, font) <= maxw for line in lines):
                return lines, font
    return None


def _wrap_clip(text: str, font: Font, maxw: int) -> List[str]:
    """Dos renglones por palabras; lo que no cabe en el segundo se recorta."""
    words = normalize(text).split()
    first = ""
    while words and text_width((first + " " + words[0]).strip(), font) <= maxw:
        first = (first + " " + words.pop(0)).strip()
    if not first:  # la primera palabra sola ya no cabe
        first = _clip(words.pop(0) if words else "", font, maxw)
    return [first, _clip(" ".join(words), font, maxw)]


def _wrapped(img: Image.Image, x: int, text: str, maxw: int, font: Font = TINY) -> None:
    """Último recurso: dos renglones en `font`, recortando el final."""
    top, step = _two_line_rows(img, font)
    if step is None:
        font = TINY
        top, step = _two_line_rows(img, font)
    for k, line in enumerate(_wrap_clip(text, font, maxw)):
        draw_text(img, x, top + k * step, line, font)


def _message(img: Image.Image, x: int, text: str, maxw: int) -> bool:
    """Mensaje en un renglón centrado o en dos, prefiriendo la letra normal:
    un renglón normal, dos renglones normales, un renglón diminuto, dos
    diminutos. False si no cabe en ninguna forma."""
    for font in (SMALL, TINY):
        if text_width(text, font) <= maxw:
            draw_text(img, x, (img.height - font.height + 1) // 2, text, font)
            return True
        top, step = _two_line_rows(img, font)
        if step is None:
            continue
        split = _two_lines(text, maxw, (font,))
        if split:
            lines, _ = split
            draw_text(img, x, top, lines[0], font)
            draw_text(img, x, top + step, lines[1], font)
            return True
    return False


def _two_line_rows(img: Image.Image, font: Font) -> Tuple[int, Optional[int]]:
    """Fila del primer renglón y salto al segundo para dos renglones en esta
    imagen; (0, None) si no caben. En 16 filas: los de la vista aprobada."""
    if img.height >= 16:
        return (0, font.height + 2) if font is SMALL else (2, font.height + 2)
    if 2 * font.height + 1 <= img.height:
        return (img.height - 2 * font.height - 1) // 2, font.height + 1
    return 0, None


# ---------------------------------------------------------------- pantallas

def s_boot(data):
    img = _base()
    _name(img, "NOPAL")
    _sep(img, 55)
    text, font = _fit(["INICIANDO", "INICIO"], 38)
    draw_text(img, 58, 1 if font is SMALL else 2, text, font)
    _bar(img, 58, 10, 37, data["progress"])
    return img


def s_normal(data):
    img = _base()
    _name(img, "NOPAL")
    _sep(img, 55)
    _icon(img, "online", 58, 0)
    text, font = _fit([f"{data['online']} ONLINE", f"{data['online']} ON"], 28)
    draw_text(img, 68, 0 if font is SMALL else 1, text, font)
    _right(img, 95, 9, str(data["time"]), SMALL)
    return img


def s_print1(data):
    img = _base()
    sep = _machine_name(img, data["printer"], 19)
    _sep(img, sep)
    ix = sep + 3
    text, font = _fit([data["file"]], 96 - ix)
    draw_text(img, ix, 0 if font is SMALL else 1, text, font)
    pct = f"{int(data['pct'])}%"
    _bar(img, ix, 10, 95 - text_width(pct, SMALL) - 2 - ix, data["pct"])
    _right(img, 95, 9, pct, SMALL)
    return img


def _elapsed_or_kind(data) -> str:
    """Tiempo transcurrido; un láser o CNC no lo informa y muestra su tipo."""
    elapsed = str(data.get("elapsed") or "")
    if elapsed in ("", "--:--") and data.get("kind") in KIND_TAG:
        return KIND_TAG[data["kind"]]
    return elapsed or "--:--"


def s_print2(data):
    img = _base()
    sep = _machine_name(img, data["printer"], 19)
    _sep(img, sep)
    px = sep + 4
    pct = f"{int(data['pct'])}%"
    elapsed, efont = _fit([_elapsed_or_kind(data)], 30)
    room = 95 - text_width(elapsed, efont) - px - 2
    ptext, pfont = _fit([pct], room, (BIG, SMALL, TINY))
    draw_text(img, px, (H - pfont.height + 1) // 2, ptext, pfont)
    _right(img, 95, 9 if efont is SMALL else 11, elapsed, efont)
    return img


def _label_with_icon(img: Image.Image, x: int, y0: int, label: str, state: Optional[str], slot: int,
                     icon_y: int) -> None:
    """Etiqueta + icono de estado dentro de `slot` px: la letra más grande con
    el icono de 8x8 que quepa; si el nombre es largo, icono de 5x5 y letra
    más chica."""
    icon = STATE_ICON.get(state, "online")
    label = normalize(label)
    for font, small in ((BIG, False), (BIG, True), (SMALL, True), (TINY, True)):
        icon_w = 5 if small else 8
        if fits(label, font) and text_width(label, font) + 2 + icon_w <= slot:
            end = draw_text(img, x, (img.height - font.height + 1) // 2, label, font)
            _icon(img, icon, end + 2, icon_y + (1 if small else 0), small)
            return
    end = draw_text(img, x, (img.height - TINY.height + 1) // 2, _clip(label, TINY, slot - 7), TINY)
    _icon(img, icon, end + 2, icon_y + 1, True)


def s_many(data):
    img = _base()
    x = 18
    for machine in list(data["machines"])[:3]:
        _label_with_icon(img, x, 0, machine.get("label", "?"), machine.get("state"), 26, 4)
        x += 26
    return img


def s_pause(data):
    img = _base()
    sep = _machine_name(img, data["printer"], 19)
    _sep(img, sep, dotted=True)
    _icon(img, "pause", sep + 3, 4)
    text, font = _fit(["PAUSA"], 96 - (sep + 13), (BIG, SMALL, TINY))
    draw_text(img, sep + 13, (H - font.height + 1) // 2, text, font)
    return img


def s_error(data):
    img = _base()
    sep = _machine_name(img, data["printer"], 19)
    _sep(img, sep, dotted=True)
    _icon(img, "warn", sep + 3, 4)
    room = 96 - (sep + 13)
    if not _message(img, sep + 13, data["error"], room):
        _wrapped(img, sep + 13, data["error"], room)
    return img


def s_offline(data):
    img = _base()
    sep = _machine_name(img, data["printer"], 19)
    _sep(img, sep, dotted=True)
    _icon(img, "ring", sep + 3, 4)
    text, font = _fit(["OFFLINE", "OFF"], 96 - (sep + 13))
    draw_text(img, sep + 13, (H - font.height + 1) // 2, text, font)
    return img


def s_heating(data):
    """Una máquina calentando antes de imprimir: temperatura actual/objetivo y barra."""
    img = _base()
    sep = _machine_name(img, data["printer"], 19)
    _sep(img, sep)
    px = img.load()
    for j, row in enumerate(THERMO):
        for i, c in enumerate(row):
            if c == "#":
                px[sep + 3 + i, 3 + j] = 1
    now, goal = int(data.get("temp", 0)), max(1, int(data.get("target", 1)))
    text, font = _fit([f"{now}/{goal}"], 96 - (sep + 12))
    draw_text(img, sep + 12, 1 if font is SMALL else 2, text, font)
    _bar(img, sep + 12, 10, 96 - (sep + 12) - 2, 100 * now / goal)
    return img


def _thermo(img, x, y):
    px = img.load()
    for j, row in enumerate(THERMO):
        for i, c in enumerate(row):
            if c == "#":
                px[x + i, y + j] = 1


def s_ready(data):
    """Una máquina que ya llegó a su temperatura y espera (sin imprimir)."""
    img = _base()
    sep = _machine_name(img, data["printer"], 19)
    _sep(img, sep)
    _thermo(img, sep + 3, 3)
    goal = int(data.get("target", data.get("temp", 0)))
    text, font = _fit([f"LISTA {goal}", str(goal)], 96 - (sep + 12))
    draw_text(img, sep + 12, 1 if font is SMALL else 2, text, font)
    _bar(img, sep + 12, 10, 96 - (sep + 12) - 2, 100)
    return img


def cooling_percent(data) -> float:
    """Qué tanto falta para bajar del límite: 100 al inicio del enfriado, 0 en el límite."""
    now, peak = int(data.get("temp", 0)), int(data.get("peak", data.get("temp", 0)))
    limit = int(data.get("limit", 50))
    return max(0.0, min(100.0, 100.0 * (now - limit) / max(1, peak - limit)))


def s_cooling(data):
    """Una máquina enfriándose (calentador apagado y todavía caliente)."""
    img = _base()
    sep = _machine_name(img, data["printer"], 19)
    _sep(img, sep)
    _thermo(img, sep + 3, 3)
    now = int(data.get("temp", 0))
    text, font = _fit([f"ENFRIA {now}", str(now)], 96 - (sep + 12))
    draw_text(img, sep + 12, 1 if font is SMALL else 2, text, font)
    _bar(img, sep + 12, 10, 96 - (sep + 12) - 2, cooling_percent(data))
    return img


def s_idle(data):
    img = _base()
    time_text = str(data["time"])
    room = 95 - text_width(time_text, SMALL) - 18 - 3
    text, font = _fit([f"{data['total']} IDLE"], room, (BIG, SMALL, TINY))
    draw_text(img, 18, (H - font.height + 1) // 2, text, font)
    _right(img, 95, 5, time_text, SMALL)
    return img


def s_done(data):
    img = _base()
    _icon(img, "check", 18, 4)
    draw_text(img, 29, 0, "TERMINADO", SMALL)
    head, tail = f"{data['printer']} ", " 100%"
    for font in (SMALL, TINY):
        room = 66 - text_width(head, font) - text_width(tail, font)
        name = _clip(data["file"], font, room)
        if len(name) >= min(4, len(normalize(data["file"]))):
            break
    draw_text(img, 29, 9 if font is SMALL else 10, f"{head}{name}{tail}" if name else f"{data['printer']}{tail}", font)
    return img


def s_special(data):
    img = _base()
    msg = str(data["msg"])
    # Mensaje corto: como en el mockup (NOPAL | mensaje). Largo: todo el ancho
    # junto al cactus, para no cortar avisos de reglas o de la IA.
    probe = _base()
    _name(probe, "NOPAL")
    if _message(probe, 58, msg, 38):
        _sep(probe, 55)
        return probe
    if not _message(img, 18, msg, 78):
        _wrapped(img, 18, msg, 78)
    return img


def s_off(data):
    img = _base()
    _name(img, "NOPAL")
    _sep(img, 55)
    draw_text(img, 58, 0, "HASTA", SMALL)
    draw_text(img, 58, 9, "PRONTO", SMALL)
    return img


SCREENS = {
    "boot": ("1. Arranque", s_boot), "normal": ("2. Todo normal", s_normal),
    "print1": ("3. Impresion activa (vista 1)", s_print1), "print2": ("4. Impresion activa (vista 2)", s_print2),
    "many": ("5. Varias impresoras", s_many), "pause": ("6. Pausada", s_pause), "error": ("7. Error", s_error),
    "offline": ("8. Desconectada", s_offline), "heating": ("13. Calentando", s_heating),
    "ready": ("14. En temperatura", s_ready), "cooling": ("15. Enfriando", s_cooling),
    "idle": ("9. Todas detenidas", s_idle),
    "done": ("10. Trabajo terminado", s_done), "special": ("11. Mensaje especial", s_special),
    "off": ("12. Apagado", s_off),
}


FILE_EXTENSIONS = (".gcode", ".gco", ".gc", ".nc", ".ngc", ".g", ".3mf", ".bgcode")


def display_file(name: Any) -> str:
    """Nombre de archivo para el panel: sin carpeta ni extensión."""
    base = str(name or "").replace("\\", "/").rsplit("/", 1)[-1]
    lower = base.lower()
    for ext in FILE_EXTENSIONS:
        if lower.endswith(ext) and len(base) > len(ext):
            return base[: -len(ext)]
    return base


def render(name: str, data: Optional[Dict[str, Any]] = None) -> Image.Image:
    if name not in SCREENS:
        raise ValueError(f"pantalla desconocida: {name}")
    merged = {**DEFAULTS, **{k: v for k, v in (data or {}).items() if v is not None}}
    merged["file"] = display_file(merged["file"])
    return SCREENS[name][1](merged)


def preview_sheet(images: Sequence[Tuple[str, Image.Image]], scale: int = 6) -> Image.Image:
    """Hoja de vista previa: cada pantalla ampliada con su nombre, LED rojo sobre negro."""
    label_h = 14
    sheet = Image.new("RGB", (W * scale + 8, (H * scale + label_h + 8) * len(images)), (20, 20, 20))
    for k, (label, img) in enumerate(images):
        top = k * (H * scale + label_h + 8)
        tag = Image.new("1", (W * scale, 7), 0)
        draw_text(tag, 0, 0, label, SMALL)
        sheet.paste(tag.convert("RGB"), (4, top + 3))
        led = img.resize((W * scale, H * scale), Image.NEAREST).convert("RGB")
        red = Image.new("RGB", led.size, (255, 40, 40))
        dark = Image.new("RGB", led.size, (35, 8, 8))
        sheet.paste(Image.composite(red, dark, img.resize((W * scale, H * scale), Image.NEAREST)), (4, top + label_h))
    return sheet
