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

from . import effects, names, program
from .timer import SITUATION_STYLES, STYLES as TIMER_STYLES, TEMP

CONFIG_PATH = Path("data/plugins/matriz-led/fk8wa.json")
MAX_MACHINES = 20

DEFAULTS: Dict[str, Any] = {
    "enabled": False,
    "ip": "",
    "brightness": 8,
    "machines": [],          # ids de máquina en orden: P1, P2, P3...
    "maintenance": [],       # ids de máquinas en mantenimiento: el panel las ignora por completo
    "min_interval_s": 15,
    "view_seconds": 15,
    "done_seconds": 60,
    "timer_style": "contorno",   # ver timer.STYLES
    # situación -> contorno propio (solo las que difieren de "timer_style"); ver allowed_styles()
    "situation_styles": {"heating": "temp", "ready": "marco_cw", "cooling": "temp"},
    "border_pattern": "dash",    # solo para los marcos del panel (marco_*)
    "border_speed": 10,
    "short_names": {},           # id de máquina -> nombre corto (hasta 4 caracteres); sin él, uno automático
    "effects": dict(effects.DEFAULT_ASSIGN),   # situación -> efecto de entrada (o None)
    "scroll_dir": "l1",          # texto corrido de los mensajes largos: l1, r, u, d, l
    "scroll_speed": 5,           # 1 (lento) a 10 (rápido)
}

RANGES = {"brightness": (1, 16), "min_interval_s": (10, 600), "view_seconds": (5, 300), "done_seconds": (5, 3600),
          "border_speed": (1, 60), "scroll_speed": (1, 10)}


def allowed_styles(situation: str):
    """Contornos que tienen sentido para una situación: las que tienen reloj
    usan cualquiera de los de reloj; calentando, en temperatura y enfriando
    pueden seguir la temperatura; el resto solo marco animado o ninguno."""
    timed = effects.SITUATIONS[situation][1]
    if timed:
        return TIMER_STYLES
    base = ("ninguno",) + tuple(x for x in TIMER_STYLES if x.startswith("marco_"))
    return ((TEMP,) if situation in ("heating", "ready", "cooling") else ()) + base


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


def style_for(situation: str, cfg: Dict[str, Any]) -> str:
    """Contorno de una situación: el suyo, o el general (timer_style)."""
    return (cfg.get("situation_styles") or {}).get(situation) or cfg["timer_style"]


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
    maintenance = merged["maintenance"]
    if not isinstance(maintenance, list) or not all(isinstance(m, str) and m.strip() for m in maintenance):
        raise ConfigError("La lista de máquinas en mantenimiento no es válida")
    maintenance = list(dict.fromkeys(m.strip() for m in maintenance))
    short_names = merged["short_names"]
    if not isinstance(short_names, dict):
        raise ConfigError("Los nombres cortos no son válidos")
    cleaned_names = {}
    for machine_id, value in short_names.items():
        try:
            cleaned_names[str(machine_id)] = names.validate(str(value))
        except ValueError as exc:
            raise ConfigError(f"Nombre corto de {machine_id}: {exc}")
    assigned = merged["effects"]
    if not isinstance(assigned, dict):
        raise ConfigError("Los efectos no son válidos")
    cleaned_effects = dict(effects.DEFAULT_ASSIGN)
    for situation, effect_id in assigned.items():
        if situation not in effects.SITUATIONS:
            raise ConfigError(f"Situación desconocida: {situation}")
        if effect_id in (None, ""):
            continue
        if effect_id not in effects.CATALOG:
            raise ConfigError(f"Efecto desconocido: {effect_id}")
        cleaned_effects[situation] = effect_id
    chosen_styles = merged["situation_styles"]
    if not isinstance(chosen_styles, dict):
        raise ConfigError("Los contornos por situación no son válidos")
    cleaned_styles = dict(DEFAULTS["situation_styles"])
    for situation, style in chosen_styles.items():
        if situation not in effects.SITUATIONS:
            raise ConfigError(f"Situación desconocida: {situation}")
        if style in (None, ""):
            cleaned_styles.pop(situation, None)    # sin contorno propio: usa el general
            continue
        if style not in SITUATION_STYLES or style not in allowed_styles(situation):
            raise ConfigError(f"Contorno no válido para {effects.SITUATIONS[situation][0]}: {style}")
        cleaned_styles[situation] = style
    if merged["scroll_dir"] not in effects.SCROLL_DIRS:
        raise ConfigError("Dirección del texto corrido desconocida")
    if merged["timer_style"] not in TIMER_STYLES:
        raise ConfigError("Estilo de contador desconocido")
    if merged["border_pattern"] not in program.BORDER_PATTERNS:
        raise ConfigError("Patrón de marco desconocido")
    return {
        "enabled": bool(merged["enabled"]),
        "ip": ip,
        "brightness": _int_in(merged["brightness"], "brightness"),
        "machines": machines,
        "maintenance": [m for m in maintenance if m in machines],   # solo de las elegidas para el panel
        "min_interval_s": _int_in(merged["min_interval_s"], "min_interval_s"),
        "view_seconds": _int_in(merged["view_seconds"], "view_seconds"),
        "done_seconds": _int_in(merged["done_seconds"], "done_seconds"),
        "timer_style": merged["timer_style"],
        "situation_styles": cleaned_styles,
        "border_pattern": merged["border_pattern"],
        "border_speed": _int_in(merged["border_speed"], "border_speed"),
        "short_names": cleaned_names,
        "effects": cleaned_effects,
        "scroll_dir": merged["scroll_dir"],
        "scroll_speed": _int_in(merged["scroll_speed"], "scroll_speed"),
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
