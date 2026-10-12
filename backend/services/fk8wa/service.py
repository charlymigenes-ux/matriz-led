"""Fachada del panel FK-8Wa para el router, las reglas y NOPAL Intelligence.

Mantiene una única instancia del ciclo de fondo (Runner): la arranca
on_startup() del plugin y la detiene on_shutdown() (gancho de NOPAL core).
"""

from __future__ import annotations

import io
from typing import Any, Dict, Optional, Tuple

from PIL import Image

from .. import screen_service
from . import config, messages, timer
from .runner import Runner

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


def status() -> Dict[str, Any]:
    cfg = config.load()
    msg = messages.current()
    current = runner().current
    return {**runner().status, "enabled": cfg["enabled"], "ip": cfg["ip"],
            "current": current[0][0] if current else None,
            "views": [{"screen": n, "seconds": s} for n, _, s in current] if current else [],
            "message": msg}


def preview(screen: Optional[str] = None, scale: int = 6) -> Tuple[bytes, str]:
    """Vista previa sin tocar el panel: GIF animado de la serie actual (con el
    contador avanzando), o PNG de una de las 12 pantallas de ejemplo con el
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
