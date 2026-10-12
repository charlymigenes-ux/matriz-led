"""Fachada del panel FK-8Wa para el router, las reglas y NOPAL Intelligence.

Mantiene una única instancia del ciclo de fondo (Runner): la arranca
on_startup() del plugin y la detiene on_shutdown() (gancho de NOPAL core).
"""

from __future__ import annotations

import base64
import io
from typing import Any, Dict, List, Optional, Tuple

from PIL import Image

from .. import screen_service
from . import config, effects, messages, names, scrolltext, timer
from .runner import Runner, effect_for

PREVIEW_SCALE_MAX = 12
_runner: Optional[Runner] = None


def runner() -> Runner:
    global _runner
    if _runner is None:
        _runner = Runner(screen_service.list_machines)
    return _runner


async def start() -> None:
    runner().start()


async def stop() -> None:
    if _runner is not None:
        await _runner.stop()


# Pantalla -> paso de la tira "¿Por qué muestra esto?" (misma prioridad que state_machine).
PRIORITY_OF = {
    "scroll": "special",
    "error": "error", "pause": "pause", "offline": "offline", "special": "special", "done": "done",
    "print1": "printing", "print2": "printing", "many": "printing",
    "heating": "heating", "ready": "ready", "cooling": "cooling",
    "normal": "normal", "idle": "normal", "boot": "normal", "off": "normal",
}

# Ejemplo de trabajo para las tarjetas del "reloj de cada vista".
SAMPLE_PRINTING = [
    ("print1", {"printer": "ET4", "file": "soporte_motor", "pct": 72}, 15.0),
    ("print2", {"printer": "ET4", "file": "soporte_motor", "pct": 72, "elapsed": "01:24"}, 15.0),
]

# Ejemplo para la tarjeta del contorno que sigue la temperatura.
SAMPLE_HEATING = [("heating", {"printer": "ET4", "temp": 165, "target": 200}, None)]

# Datos de ejemplo de la galería de pantallas.
GALLERY_SAMPLE = {
    "boot": {"progress": 45}, "normal": {"online": 3, "time": "17:42"}, "idle": {"total": 3, "time": "17:42"},
    "print1": {"printer": "ET4", "file": "soporte_motor", "pct": 72},
    "print2": {"printer": "ET4", "pct": 72, "elapsed": "01:24"},
    "many": {"machines": [{"label": "ET4", "state": "printing"}, {"label": "TTS", "state": "printing"},
                          {"label": "CNC", "state": "printing"}]},
    "heating": {"printer": "ET4", "temp": 165, "target": 200},
    "ready": {"printer": "ET4", "temp": 200, "target": 200},
    "cooling": {"printer": "ET4", "temp": 120, "peak": 200}, "pause": {"printer": "TTS"},
    "error": {"printer": "ET4", "error": "ERROR"}, "offline": {"printer": "CNC"},
    "done": {"printer": "ET4", "file": "soporte_motor"}, "special": {"msg": "TODO BIEN"}, "off": {},
}


def status() -> Dict[str, Any]:
    cfg = config.load()
    msg = messages.current()
    current = runner().current
    screen = current[0][0] if current else None
    return {**runner().status, "enabled": cfg["enabled"], "ip": cfg["ip"],
            "current": screen, "priority": PRIORITY_OF.get(screen),
            "views": [{"screen": n, "seconds": s} for n, _, s in current] if current else [],
            "message": msg}


def _encode(page) -> str:
    """Página de 96x16 (o 94x14 de marco, centrada) a 192 bytes en base64:
    1 bit por LED, bit de menor peso primero, 12 bytes por fila."""
    if page.size == (94, 14):
        full = Image.new("1", (96, 16), 0)
        full.paste(page, (1, 1))
        page = full
    out = bytearray(192)
    for y in range(16):
        for x in range(96):
            if page.getpixel((x, y)):
                out[y * 12 + x // 8] |= 1 << (x % 8)
    return base64.b64encode(bytes(out)).decode("ascii")


def _pack_rows(image) -> str:
    """Tira de 16 filas a bytes (1 bit por LED, bit de menor peso primero, ceil(ancho/8) bytes por fila)."""
    per_row = (image.width + 7) // 8
    out = bytearray(per_row * 16)
    for y in range(16):
        for x in range(image.width):
            if image.getpixel((x, y)):
                out[y * per_row + x // 8] |= 1 << (x % 8)
    return base64.b64encode(bytes(out)).decode("ascii")


def scroll_payload(text: str, direction: str, level: int) -> Dict[str, Any]:
    """Cómo correrá un mensaje largo, para que la pestaña lo dibuje: la tira
    ancha (izquierda, derecha, continuo) o las páginas de dos renglones
    (arriba, abajo)."""
    if direction not in effects.SCROLL_DIRS:
        raise ValueError("Dirección desconocida")
    strip = scrolltext.strip(text)
    return {"text": text, "dir": direction, "level": level, "static": strip.width <= 92,
            "strip": {"width": strip.width, "data": _pack_rows(strip)},
            "pages": [_encode(p) for p in scrolltext.pages(text)],
            "update_time": scrolltext.update_time(level), "hold_ms": scrolltext.hold_ms(level)}


def frames(style: Optional[str] = None, screen: Optional[str] = None) -> Dict[str, Any]:
    """Páginas tal como las mostrará el panel, para dibujarlas LED por LED en
    la pestaña (sin tocar el panel):
    - sin parámetros: lo que tiene ahora, con el contorno y el efecto configurados
      (o, si es un mensaje largo, cómo corre el texto);
    - `style`: un ejemplo de impresión con ese estilo (tarjetas del reloj);
    - `screen`: una de las 13 pantallas de ejemplo (galería)."""
    cfg = config.load()
    if style and style not in timer.SITUATION_STYLES:
        raise ValueError("Estilo de contador desconocido")
    chosen = style or cfg["timer_style"]
    effect = None
    if screen:
        segments: List = [(screen, GALLERY_SAMPLE.get(screen, {}), None)]
    elif style:
        segments = SAMPLE_HEATING if style == timer.TEMP else SAMPLE_PRINTING
    else:
        segments = runner().current or [("boot", {"progress": 0}, None)]
        if segments[0][0] == "scroll":
            return {"style": chosen, "marco": False, "stay_ms": 0, "pages": [], "effect": None,
                    "views": [{"screen": "scroll", "seconds": segments[0][2]}],
                    "scroll": scroll_payload(segments[0][1]["text"], cfg["scroll_dir"], cfg["scroll_speed"])}
        chosen = config.style_for(effects.SITUATION_OF.get(segments[0][0], ""), cfg)
        picked = effect_for(segments, cfg)
        if picked:
            effect = {"id": picked[0], "type": picked[1], "subtype": picked[2]}
    pages, stay = timer.build_pages(segments, chosen)
    return {"style": chosen, "marco": chosen.startswith("marco_"), "stay_ms": stay,
            "border_speed": cfg["border_speed"], "pages": [_encode(p) for p in pages], "effect": effect,
            "views": [{"screen": n, "seconds": sec} for n, _, sec in segments]}


def effects_catalog() -> Dict[str, Any]:
    return {"effects": effects.listing(),
            "situations": [{"id": key, "name": name, "timed": timed, "styles": list(config.allowed_styles(key))}
                          for key, (name, timed) in effects.SITUATIONS.items()],
            "scroll_dirs": list(effects.SCROLL_DIRS)}


async def machine_list() -> List[Dict[str, Any]]:
    """Máquinas que NOPAL conoce, con el nombre corto que se usaría en el panel."""
    machines = await screen_service.list_machines()
    saved = config.load()["short_names"]
    auto = names.defaults(machines)
    return [{"id": str(m["id"]), "name": m.get("name") or str(m["id"]), "kind": m.get("type") or "printer",
             "online": bool(m.get("online")), "short": saved.get(str(m["id"])) or auto[str(m["id"])],
             "short_auto": auto[str(m["id"])]} for m in machines]


async def test_effect(effect_id: str) -> None:
    await runner().demo_effect(effect_id)


def preview(screen: Optional[str] = None, scale: int = 6) -> Tuple[bytes, str]:
    """Vista previa sin tocar el panel: GIF animado de la serie actual (con el
    contador avanzando), o PNG de una de las pantallas de ejemplo con el
    estilo configurado."""
    scale = max(1, min(PREVIEW_SCALE_MAX, int(scale)))
    style = config.load()["timer_style"]
    if screen:
        image = timer.screen_image(screen, {}, "contorno" if style.startswith("marco_") else style)
        big = image.resize((image.width * scale, image.height * scale), Image.NEAREST)
        out = io.BytesIO()
        big.convert("L").save(out, format="PNG")
        return out.getvalue(), "image/png"
    segments = runner().current or [("boot", {"progress": 0}, None)]
    cfg = config.load()
    style = config.style_for(effects.SITUATION_OF.get(segments[0][0], ""), cfg)
    return timer.preview_gif(segments, style, scale), "image/gif"


def save_config(payload: Dict[str, Any]) -> Dict[str, Any]:
    before = config.load()
    saved = config.save(payload)
    if saved["brightness"] != before["brightness"]:
        runner().brightness_changed()
    return saved


async def test_connection() -> Dict[str, Any]:
    return await runner().test_connection()


def show_message(text: Any, minutes: Any = messages.DEFAULT_MINUTES, source: str = "manual") -> Dict[str, Any]:
    return messages.set_message(text, minutes, source)


def show_announcement(announcement_id: str, minutes: Any = messages.DEFAULT_MINUTES,
                      source: str = "announcement") -> Dict[str, Any]:
    """Un anuncio como mensaje especial: se muestra su nombre (spec P1)."""
    announcement = screen_service.get_announcement(announcement_id)   # ValueError si no existe
    return messages.set_message(announcement.get("name") or announcement_id, minutes, source)


def clear_message() -> None:
    messages.clear()
