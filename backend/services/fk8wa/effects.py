"""Efectos de entrada del panel FK-8Wa (PROTOCOL.md §3.1) y situaciones.

El panel solo anima la ENTRADA de cada pantalla (tipo y subtipo en @332 del
programa); no hay efectos de salida documentados y aquí no se inventan. Un
programa lleva un solo efecto, así que cada situación (Error, Pausa...) sube
su propio programa con el efecto elegido para ella.

`verified` marca los efectos probados en el panel físico (PROTOCOL.md). El
resto está en la tabla de FKShow pero sin probar; al usar "Probar en mi
panel" con éxito se guardan como probados en esta instalación.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

TESTED_PATH = Path("data/plugins/matriz-led/fk8wa_effects_tested.json")

# id: (tipo, subtipo, nombre, familia, probado en el panel real)
CATALOG: Dict[str, Tuple[int, int, str, str, bool]] = {
    "scroll_l1": (2, 1, "Desplazar ← (entra y avanza)", "Desplazar", True),
    "scroll_r": (2, 2, "Desplazar →", "Desplazar", True),
    "scroll_u": (2, 3, "Desplazar ↑", "Desplazar", True),
    "scroll_d": (2, 4, "Desplazar ↓", "Desplazar", True),
    "scroll_l": (2, 5, "Desplazar ← (continuo)", "Desplazar", True),
    "movein_1": (4, 1, "Entrar desde la izquierda", "Entrar", True),
    "movein_2": (4, 2, "Entrar desde la derecha", "Entrar", False),
    "movein_3": (4, 3, "Entrar desde arriba", "Entrar", True),
    "movein_4": (4, 4, "Entrar desde abajo", "Entrar", False),
    "movein_5": (4, 5, "Entrar por los lados", "Entrar", False),
    "movein_6": (4, 6, "Entrar por arriba y abajo", "Entrar", False),
    "movein_7": (4, 7, "Entrar desde el centro", "Entrar", False),
    "cover_1": (3, 1, "Cubrir de izquierda a derecha", "Cubrir", True),
    "cover_2": (3, 2, "Cubrir de derecha a izquierda", "Cubrir", False),
    "cover_3": (3, 3, "Cubrir de los lados al centro", "Cubrir", False),
    "cover_4": (3, 4, "Cubrir del centro a los lados", "Cubrir", False),
    "cover_5": (3, 5, "Cubrir de arriba a abajo", "Cubrir", True),
    "cover_6": (3, 6, "Cubrir de abajo a arriba", "Cubrir", False),
    "blind_1": (5, 1, "Persiana horizontal", "Persiana", True),
    "blind_2": (5, 2, "Persiana vertical", "Persiana", True),
    "blind_3": (5, 3, "Persiana en cuadros", "Persiana", False),
    "shadow_1": (6, 1, "Sombra izquierda", "Sombra", True),
    "shadow_2": (6, 2, "Sombra derecha", "Sombra", False),
    "shadow_3": (6, 3, "Sombra arriba", "Sombra", False),
    "shadow_4": (6, 4, "Sombra abajo", "Sombra", False),
    "flash_1": (7, 1, "Parpadeo", "Parpadeo", True),
    "flash_2": (7, 2, "Parpadeo invertido", "Parpadeo", True),
    "flash_3": (7, 3, "Neón", "Parpadeo", False),
    "extend_1": (19, 1, "Extender hacia la izquierda", "Extender", True),
    "extend_2": (19, 2, "Extender hacia la derecha", "Extender", False),
    "extend_3": (19, 3, "Extender hacia arriba", "Extender", False),
    "extend_4": (19, 4, "Extender hacia abajo", "Extender", False),
    "sector_1": (21, 1, "Sector horario", "Sector", True),
    "sector_2": (21, 2, "Sector antihorario", "Sector", False),
    "sector_3": (21, 3, "Sector cerrar", "Sector", False),
    "sector_4": (21, 4, "Sector abrir", "Sector", False),
}

# Situación -> (nombre, ¿tiene reloj de cada vista?). Las que tienen reloj usan
# varias páginas con contador (contorno o barra), y un efecto de entrada se
# repetiría en cada una: con esos relojes no llevan efecto.
SITUATIONS: Dict[str, Tuple[str, bool]] = {
    "rest": ("Todo tranquilo", True),
    "heating": ("Calentando", False),
    "printing": ("Trabajando", True),
    "pause": ("Pausa", False),
    "error": ("Error", False),
    "offline": ("Desconectada", False),
    "done": ("Terminó", True),
    "special": ("Mensaje corto", True),
}
# Pantalla -> situación a la que pertenece.
SITUATION_OF = {
    "normal": "rest", "idle": "rest", "heating": "heating", "print1": "printing", "print2": "printing",
    "many": "printing", "pause": "pause", "error": "error", "offline": "offline", "done": "done",
    "special": "special",
}
# Dirección del texto corrido -> efecto de desplazamiento.
SCROLL_DIRS = {"l1": "scroll_l1", "r": "scroll_r", "u": "scroll_u", "d": "scroll_d", "l": "scroll_l"}

DEFAULT_ASSIGN: Dict[str, Optional[str]] = {key: None for key in SITUATIONS}


def effect(effect_id: Optional[str]) -> Optional[Tuple[int, int]]:
    """(tipo, subtipo) del efecto, o None si no hay o no existe."""
    if not effect_id or effect_id not in CATALOG:
        return None
    entry = CATALOG[effect_id]
    return entry[0], entry[1]


def load_tested() -> Set[str]:
    try:
        raw = json.loads(TESTED_PATH.read_text(encoding="utf-8"))
        return {e for e in raw if e in CATALOG} if isinstance(raw, list) else set()
    except (OSError, ValueError):
        return set()


def mark_tested(effect_id: str) -> None:
    if effect_id not in CATALOG:
        raise ValueError("Efecto desconocido")
    tested = load_tested() | {effect_id}
    TESTED_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary = TESTED_PATH.with_suffix(".tmp")
    temporary.write_text(json.dumps(sorted(tested)), encoding="utf-8")
    temporary.replace(TESTED_PATH)


def listing() -> List[Dict[str, Any]]:
    tested = load_tested()
    return [{"id": key, "type": t, "subtype": s, "label": label, "family": family, "tested": ok or key in tested}
            for key, (t, s, label, family, ok) in CATALOG.items()]
