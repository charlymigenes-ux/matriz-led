"""Mensaje especial del panel FK-8Wa (pantalla 11): data/plugins/matriz-led/fk8wa_message.json.

Un solo mensaje vigente a la vez; uno nuevo reemplaza al anterior. Vence solo.
Orígenes: texto libre (manual), anuncio, regla del plugin o NOPAL Intelligence.
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Dict, Optional

MESSAGE_PATH = Path("data/plugins/matriz-led/fk8wa_message.json")
MAX_CHARS = 200
DEFAULT_MINUTES = 5
MAX_MINUTES = 24 * 60
SOURCES = ("manual", "announcement", "rule", "ai")


class MessageError(ValueError):
    """Mensaje inválido; el texto se muestra tal cual."""


def set_message(text: Any, minutes: Any = DEFAULT_MINUTES, source: str = "manual",
                now: Optional[float] = None) -> Dict[str, Any]:
    text = " ".join(str(text or "").split())
    if not text:
        raise MessageError("El mensaje está vacío")
    if len(text) > MAX_CHARS:
        raise MessageError(f"El mensaje admite hasta {MAX_CHARS} caracteres")
    try:
        minutes = int(minutes if minutes is not None else DEFAULT_MINUTES)
    except (TypeError, ValueError):
        raise MessageError("La duración debe ser un número de minutos")
    if not 1 <= minutes <= MAX_MINUTES:
        raise MessageError(f"La duración debe estar entre 1 y {MAX_MINUTES} minutos")
    if source not in SOURCES:
        raise MessageError("Origen de mensaje desconocido")
    now = time.time() if now is None else now
    message = {"text": text, "source": source, "expires_at": now + minutes * 60}
    MESSAGE_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary = MESSAGE_PATH.with_suffix(".tmp")
    temporary.write_text(json.dumps(message, ensure_ascii=False), encoding="utf-8")
    temporary.replace(MESSAGE_PATH)
    return message


def current(now: Optional[float] = None) -> Optional[Dict[str, Any]]:
    """Mensaje vigente, o None si no hay o ya venció."""
    try:
        message = json.loads(MESSAGE_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    now = time.time() if now is None else now
    if not isinstance(message, dict) or not message.get("text") or float(message.get("expires_at", 0)) <= now:
        return None
    return message


def clear() -> None:
    try:
        MESSAGE_PATH.unlink()
    except FileNotFoundError:
        pass
