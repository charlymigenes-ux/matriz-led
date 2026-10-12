"""Nombre corto de una máquina para el panel (hasta 4 caracteres).

El panel mide 96x16: "Klipper ET4" o "TTS 55 PRO" no caben, así que cada
máquina se muestra con un nombre corto. Por omisión sale del nombre real
(short_name); el usuario puede cambiarlo en la configuración.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Dict, List

from .pixelfont import normalize

MAX_CHARS = 4
# Palabras que describen la marca o el tipo, no qué máquina es.
GENERIC = {"IMPRESORA", "IMPRESORAS", "KLIPPER", "MARLIN", "ELEGOO", "FLASHFORGE", "BAMBU", "BAMBULAB",
           "LASER", "PRINTER", "3D", "MAQUINA"}
ALLOWED = re.compile(r"[^A-Z0-9 .\-]")


def clean(text: str) -> str:
    """Mayúsculas, sin acentos, solo letras, números, punto y guion."""
    text = unicodedata.normalize("NFKD", normalize(text)).encode("ascii", "ignore").decode("ascii").upper()
    return ALLOWED.sub("", text).strip()


def short_name(name: str, max_chars: int = MAX_CHARS) -> str:
    tokens: List[str] = clean(name).split()
    if not tokens:
        return "?"
    useful = [t for t in tokens if t not in GENERIC] or tokens[-1:]
    return useful[0][:max_chars]


def validate(value: str) -> str:
    """Nombre corto escrito por el usuario; ValueError si no sirve."""
    cleaned = clean(value)
    if not cleaned:
        raise ValueError("El nombre corto está vacío")
    if len(cleaned) > MAX_CHARS:
        raise ValueError(f"El nombre corto admite hasta {MAX_CHARS} caracteres")
    return cleaned


def defaults(machines: List[Dict]) -> Dict[str, str]:
    """{id: nombre corto} para una lista de máquinas, sin repetir (ET4, ET4-2...)."""
    seen: Dict[str, int] = {}
    out: Dict[str, str] = {}
    for machine in machines:
        base = short_name(machine.get("name") or str(machine.get("id")))
        seen[base] = seen.get(base, 0) + 1
        out[str(machine["id"])] = base if seen[base] == 1 else f"{base[:MAX_CHARS - 1]}{seen[base]}"
    return out
