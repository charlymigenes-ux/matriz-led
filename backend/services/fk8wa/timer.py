"""Contador visual y armado del programa de varias páginas del panel FK-8Wa.

En vez de recargar el panel para cambiar de vista, NOPAL sube UN programa con
varias páginas y el panel las va mostrando solo, cada una el mismo tiempo
(PROTOCOL.md §3: @338 = permanencia por página en ms, una para todo el
programa). Las vistas de una serie duran lo mismo (impresión vista 1 y 2,
grupos de "varias"), así que eso alcanza.

Estilos de contador (configurables):
- "contorno": las pantallas se achican 2 px y una línea va encendiendo el
  contorno; cuando lo completa, cambia de vista. Es un contador exacto: lo
  dibuja NOPAL, página por página.
- "contorno_encima": igual, pero sobre las pantallas de tamaño completo.
- "barra": pantallas achicadas y una barra que avanza en la fila de abajo.
- "ninguno": sin contador (una página por vista).
- "temp": contorno que sigue la temperatura (solo calentando, en temperatura y
  enfriando): se llena al calentar y se vacía al enfriar. Una sola página que
  NOPAL vuelve a subir cuando cambia la temperatura.
- "marco_<estilo>": un marco que anima el propio panel (los de FKShow:
  horario, una línea, parpadeo...). Decorativo: el panel lo mueve a su
  ritmo, no marca el tiempo exacto. Usa la disposición con marco (94x14).
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence, Tuple

from PIL import Image

from . import program, screens, screens_inset

PROGRESSIVE = ("contorno", "contorno_encima", "barra")
STYLES = PROGRESSIVE + ("ninguno",) + tuple(f"marco_{k}" for k in program.BORDER_STYLES)
TEMP = "temp"
INSET_STYLES = ("contorno", "barra", TEMP)
# Estilos que se pueden elegir por situación: los de reloj (STYLES) y el de temperatura.
SITUATION_STYLES = STYLES + (TEMP,)
# Con varias pantallas y sin efecto elegido, el panel no avanza solo con el efecto
# Estático (visto en el panel real): se pasa de una a otra con "Entrar desde la
# izquierda" (MoveIn 1, probado en el panel).
PAGE_TRANSITION = (4, 1)
# Páginas por programa: 16 es lo verificado en el panel real (texto largo).
MAX_PAGES = 16
MAX_STAY_MS = 65535

Segment = Tuple[str, Dict[str, Any], Optional[float]]   # (pantalla, datos, segundos o None = fija)


def ring_path(w: int = 96, h: int = 16) -> List[Tuple[int, int]]:
    """Píxeles del contorno en sentido horario desde la esquina superior izquierda (220 en 96x16)."""
    path = [(x, 0) for x in range(w)]
    path += [(w - 1, y) for y in range(1, h)]
    path += [(x, h - 1) for x in range(w - 2, -1, -1)]
    path += [(0, y) for y in range(h - 2, 0, -1)]
    return path


def bar_path(w: int = 96, h: int = 16) -> List[Tuple[int, int]]:
    return [(x, h - 1) for x in range(w)]


def _overlay(img: Image.Image, fraction: float, style: str) -> Image.Image:
    path = bar_path() if style == "barra" else ring_path()
    lit = round(len(path) * max(0.0, min(1.0, fraction)))
    out = img.copy()
    px = out.load()
    for x, y in path[:lit]:
        px[x, y] = 1
    return out


def screen_image(name: str, data: Dict[str, Any], style: str) -> Image.Image:
    """Pantalla de 96x16 tal como va en el panel (achicada si el estilo lo pide)."""
    if style in INSET_STYLES:
        full = Image.new("1", (96, 16), 0)
        full.paste(screens_inset.render(name, data), (2, 2))
        return full
    return screens.render(name, data)


def _border_page(name: str, data: Dict[str, Any]) -> Image.Image:
    """Página de 94x14 para la disposición con marco del panel."""
    page = Image.new("1", (94, 14), 0)
    page.paste(screens_inset.render(name, data), (1, 1))
    return page


def temp_fraction(name: str, data: Dict[str, Any]) -> float:
    """Qué tanto del contorno se enciende en el estilo "temp": lo que lleva de
    la temperatura objetivo al calentar, todo en temperatura y lo que falta
    para bajar del límite al enfriar."""
    if name == "ready":
        return 1.0
    if name == "cooling":
        return screens.cooling_percent(data) / 100.0
    target = max(1, int(data.get("target", 1)))
    return max(0.0, min(1.0, int(data.get("temp", 0)) / target))


def build_pages(segments: Sequence[Segment], style: str) -> Tuple[List[Image.Image], int]:
    """Páginas del programa y permanencia por página en ms."""
    if style == TEMP:
        return [_overlay(screen_image(name, data, style), temp_fraction(name, data), "contorno")
                for name, data, _ in segments], 0
    timed = [s for s in segments if s[2]]
    seconds = timed[0][2] if timed else None
    if style.startswith("marco_"):
        pages = [_border_page(name, data) for name, data, _ in segments]
        return pages, _stay(seconds, 1)
    if style in PROGRESSIVE and timed:
        per = max(1, MAX_PAGES // len(segments))
        pages = []
        for name, data, _ in segments:
            base = screen_image(name, data, style)
            pages += [_overlay(base, (k + 1) / per, style) for k in range(per)]
        return pages, _stay(seconds, per)
    return [screen_image(name, data, style) for name, data, _ in segments], _stay(seconds, 1)


def _stay(seconds: Optional[float], pages_per_segment: int) -> int:
    if not seconds:
        return 0
    return max(1, min(MAX_STAY_MS, int(round(seconds * 1000 / pages_per_segment))))


def build_program(segments: Sequence[Segment], style: str, border_pattern: str = "dash",
                  border_speed: int = 10, effect: Optional[Tuple[int, int]] = None) -> bytes:
    """Programa listo para subir. `effect` = (tipo, subtipo) de entrada de cada
    página. Con el reloj de contorno o barra y vistas con tiempo no se usa:
    esas vistas son varias imágenes y el efecto se repetiría en cada una.
    Una sola página fija sin efecto usa el programa verificado de pantalla
    completa (screen_program)."""
    pages, stay = build_pages(segments, style)
    clock_pages = style in PROGRESSIVE and any(s[2] for s in segments)
    if effect and clock_pages:
        effect = None
    if effect is None and len(pages) > 1 and not clock_pages:
        effect = PAGE_TRANSITION
    entry = effect or program.STATIC
    if style.startswith("marco_"):
        strip = Image.new("1", (94 * len(pages), 14), 0)
        for k, page in enumerate(pages):
            strip.paste(page, (94 * k, 0))
        style_id = program.BORDER_STYLES[style[len("marco_"):]][0]
        return program.build_scroll(strip, 10, "NOPAL", entry, stay, program.BORDERED,
                                    (style_id, border_pattern, border_speed))
    if len(pages) == 1 and not effect:
        return program.screen_program(pages[0])
    strip = Image.new("1", (96 * len(pages), 16), 0)
    for k, page in enumerate(pages):
        strip.paste(page, (96 * k, 0))
    return program.build_scroll(strip, 10, "NOPAL", entry, stay, program.PLAIN)


def preview_gif(segments: Sequence[Segment], style: str, scale: int = 6) -> bytes:
    """GIF animado aproximado de lo que hará el panel (el marco nativo se
    dibuja fijo: su animación la hace el panel)."""
    import io

    pages, stay = build_pages(segments, style)
    frames = []
    for page in pages:
        if style.startswith("marco_"):
            full = Image.new("1", (96, 16), 0)
            full.paste(page, (1, 1))
            px = full.load()
            for x, y in ring_path():
                if (x + y) % 4 < 2:
                    px[x, y] = 1
            page = full
        frames.append(page.resize((96 * scale, 16 * scale), Image.NEAREST).convert("L"))
    out = io.BytesIO()
    if len(frames) == 1:
        frames[0].save(out, format="GIF")
    else:
        frames[0].save(out, format="GIF", save_all=True, append_images=frames[1:], loop=0,
                       duration=max(20, stay))
    return out.getvalue()
