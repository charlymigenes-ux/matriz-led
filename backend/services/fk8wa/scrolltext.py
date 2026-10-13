"""Mensajes largos que corren por el panel FK-8Wa (efecto de Desplazar).

El texto se dibuja con las letras de pixelfont a doble tamaño (10x14, cabe en
las 16 filas) en una tira ancha; el panel la desliza solo (PROTOCOL.md §3.1,
Scroll 1-5, probados en el panel real). Hacia arriba o abajo se arman páginas
de dos renglones y el panel las desplaza una a una.

La velocidad se guarda como nivel 1 (lento) a 10 (rápido) y se traduce al
"tiempo de actualización" del panel (menor = más rápido). La relación exacta
entre ese número y los píxeles por segundo no está medida: se ajusta viendo
el panel.
"""

from __future__ import annotations

from typing import List

from PIL import Image

from . import effects, program
from .pixelfont import SMALL, draw_text, normalize, text_width

PAGE_W, PAGE_H = 96, 16
MAX_PAGES = program.MAX_PAGES
MAX_TEXT = 200
LINE_MAX_W = 92


def update_time(level: int) -> int:
    """Nivel de velocidad (1 lento ... 10 rápido) -> tiempo de actualización del panel."""
    level = max(1, min(10, int(level)))
    return max(1, round(60 / level))


def hold_ms(level: int) -> int:
    """Cuánto se queda cada página al desplazar hacia arriba o abajo."""
    level = max(1, min(10, int(level)))
    return 2600 - 150 * level


def strip(text: str, scale: int = 2) -> Image.Image:
    """Texto en una sola tira (16 filas de alto) con letra de `scale` veces el tamaño normal."""
    text = " ".join(str(text).split())[:MAX_TEXT]
    width = max(1, text_width(text, SMALL))
    base = Image.new("1", (width, 7), 0)
    draw_text(base, 0, 0, text, SMALL)
    big = base.resize((width * scale, 7 * scale), Image.NEAREST)
    out = Image.new("1", (big.width, PAGE_H), 0)
    out.paste(big, (0, (PAGE_H - big.height) // 2))
    return out


def lines(text: str) -> List[str]:
    """Renglones de letra normal que caben en el panel (por palabras)."""
    words = normalize(" ".join(str(text).split())[:MAX_TEXT]).split()
    result: List[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if text_width(candidate, SMALL) <= LINE_MAX_W or not current:
            current = candidate
        else:
            result.append(current)
            current = word
    if current:
        result.append(current)
    return result


def pages(text: str) -> List[Image.Image]:
    """Páginas de 96x16 con dos renglones centrados cada una."""
    rows = lines(text)
    out = []
    for i in range(0, len(rows), 2):
        page = Image.new("1", (PAGE_W, PAGE_H), 0)
        for k, row in enumerate(rows[i:i + 2]):
            draw_text(page, (PAGE_W - text_width(row, SMALL)) // 2, 9 * k, row, SMALL)
        out.append(page)
    return out[:MAX_PAGES]


def build_program(text: str, direction: str, level: int) -> bytes:
    """Programa del panel con el texto corriendo en `direction` (l1, r, u, d, l)."""
    if direction not in effects.SCROLL_DIRS:
        raise ValueError("Dirección desconocida")
    kind, sub = effects.effect(effects.SCROLL_DIRS[direction])
    if direction in ("u", "d"):
        sheet = pages(text)
        image = Image.new("1", (PAGE_W * len(sheet), PAGE_H), 0)
        for k, page in enumerate(sheet):
            image.paste(page, (PAGE_W * k, 0))
        return program.build_scroll(image, update_time(level), "NOPAL", (kind, sub), hold_ms(level), program.PLAIN)
    image = strip(text)
    if image.width > PAGE_W * MAX_PAGES:
        image = image.crop((0, 0, PAGE_W * MAX_PAGES, PAGE_H))
    return program.build_scroll(image, update_time(level), "NOPAL", (kind, sub), 0, program.PLAIN)
