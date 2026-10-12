"""Configuración del panel FK-8Wa: data/plugins/matriz-led/fk8wa.json.

Separada de la de la pantalla iPixel (config.json): cada dispositivo tiene su
configuración y su estado. Escritura atómica, como el resto del plugin.
Nunca guarda claves ni datos de la red del panel (eso se configura con FKShow).
"""

from __future__ import annotations

import ipaddress
import json
from pathlib import Path
from typing import Any, Dict

from . import program
from .timer import STYLES as TIMER_STYLES

CONFIG_PATH = Path("data/plugins/matriz-led/fk8wa.json")
MAX_MACHINES = 20

DEFAULTS: Dict[str, Any] = {
    "enabled": False,
    "ip": "",
    "brightness": 8,
    "machines": [],          # ids de máquina en orden: P1, P2, P3...
    "min_interval_s": 15,
    "view_seconds": 15,
    "done_seconds": 60,
    "timer_style": "contorno",   # ver timer.STYLES
    "border_pattern": "dash",    # solo para los marcos del panel (marco_*)
    "border_speed": 10,
}

RANGES = {"brightness": (1, 16), "min_interval_s": (10, 600), "view_seconds": (5, 300), "done_seconds": (5, 3600),
          "border_speed": (1, 60)}


class ConfigError(ValueError):
    """Configuración inválida; el mensaje se muestra tal cual."""


def _int_in(value: Any, key: str) -> int:
    low, high = RANGES[key]
    try:
        number = int(value)
    except (TypeError, ValueError):
        raise ConfigError(f"{key} debe ser un número entero entre {low} y {high}")
    if not low <= number <= high:
        raise ConfigError(f"{key} debe estar entre {low} y {high}")
    return number


def validate(payload: Any) -> Dict[str, Any]:
    if not isinstance(payload, dict):
        raise ConfigError("La configuración debe ser un objeto")
    merged = {**DEFAULTS, **{k: v for k, v in payload.items() if k in DEFAULTS}}
    ip = str(merged["ip"] or "").strip()
    if ip:
        try:
            ip = str(ipaddress.IPv4Address(ip))
        except ValueError:
            raise ConfigError("La IP del panel no es válida (ejemplo: 192.168.0.90)")
    if merged["enabled"] and not ip:
        raise ConfigError("Para activar el panel hace falta su IP")
    machines = merged["machines"]
    if not isinstance(machines, list) or not all(isinstance(m, str) and m.strip() for m in machines):
        raise ConfigError("La lista de máquinas no es válida")
    machines = [m.strip() for m in machines]
    if len(set(machines)) != len(machines):
        raise ConfigError("Una máquina aparece repetida en la lista")
    if len(machines) > MAX_MACHINES:
        raise ConfigError(f"Se pueden elegir hasta {MAX_MACHINES} máquinas")
    if merged["timer_style"] not in TIMER_STYLES:
        raise ConfigError("Estilo de contador desconocido")
    if merged["border_pattern"] not in program.BORDER_PATTERNS:
        raise ConfigError("Patrón de marco desconocido")
    return {
        "enabled": bool(merged["enabled"]),
        "ip": ip,
        "brightness": _int_in(merged["brightness"], "brightness"),
        "machines": machines,
        "min_interval_s": _int_in(merged["min_interval_s"], "min_interval_s"),
        "view_seconds": _int_in(merged["view_seconds"], "view_seconds"),
        "done_seconds": _int_in(merged["done_seconds"], "done_seconds"),
        "timer_style": merged["timer_style"],
        "border_pattern": merged["border_pattern"],
        "border_speed": _int_in(merged["border_speed"], "border_speed"),
    }


def load() -> Dict[str, Any]:
    """Configuración guardada; si falta o está dañada, valores por omisión (desactivado)."""
    try:
        return validate(json.loads(CONFIG_PATH.read_text(encoding="utf-8")))
    except (OSError, ValueError):
        return dict(DEFAULTS)


def save(payload: Any) -> Dict[str, Any]:
    config = validate(payload)
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary = CONFIG_PATH.with_suffix(".tmp")
    temporary.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(CONFIG_PATH)
    return config
