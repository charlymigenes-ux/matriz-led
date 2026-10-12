"""Elige qué pantalla muestra el panel FK-8Wa a partir del estado de las
máquinas elegidas (spec RF11-RF14). Sin E/S: recibe la lista de máquinas
(el mismo contrato que TUNA-Screen, tunascreen_service.list_machines), los ids
elegidos en orden (P1, P2, ...), la hora y una memoria que guarda lo que
depende del tiempo (alternancia de vistas, aviso de terminado).

Prioridad aprobada: error > pausa > desconectada > mensaje especial >
terminado > impresión > inactivas / normal.

El contrato de máquinas no trae el texto del error (solo el estado), así que
la pantalla de error muestra "ERROR".
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence, Tuple

from . import names as names_mod
from .pixelfont import SMALL as SMALL_FONT, text_width

BOOT_MAX_S = 30.0
HEAT_MARGIN_C = 3          # falta más de esto para el objetivo = sigue calentando
SCROLL_ABOVE_PX = 78       # un mensaje más ancho que esto (letra normal) corre en vez de quedarse quieto
QUIET_STATES = {"idle", "standby", "complete", "cancelled"}
ACTIVE_STATES = {"printing"}

Screen = Tuple[str, Dict[str, Any]]


@dataclass
class Memory:
    """Estado que la máquina de estados guarda entre llamadas."""

    started_at: float
    prev_state: Dict[str, str] = field(default_factory=dict)
    last_job: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    done: Optional[Dict[str, Any]] = None          # {printer, file, until}
    printing_since: Optional[float] = None
    print_views: Optional[Tuple[Dict[str, Any], Dict[str, Any]]] = None   # datos de vista 1 y 2
    many_groups: List[List[Dict[str, Any]]] = field(default_factory=list)  # activas de 3 en 3


def _elapsed(seconds: Any) -> Optional[str]:
    try:
        total = int(seconds)
    except (TypeError, ValueError):
        return None
    if total < 0:
        return None
    hours, minutes = divmod(total // 60, 60)
    return f"{hours:02d}:{minutes:02d}"


def _pct(value: Any) -> int:
    try:
        return max(0, min(100, int(round(float(value)))))
    except (TypeError, ValueError):
        return 0


def _heat(machine: Dict[str, Any], state: str) -> Optional[Tuple[int, int]]:
    """(temperatura actual, objetivo) de una impresora que está calentando
    sin imprimir todavía; None si no. Los láser y CNC no calientan."""
    if machine.get("type") not in (None, "printer") or state not in QUIET_STATES:
        return None
    status = machine.get("status") or {}
    for key in ("hotend", "bed"):
        pair = status.get(key) or {}
        current, target = pair.get("current"), pair.get("target")
        try:
            if target and float(target) > 0 and current is not None and float(current) < float(target) - HEAT_MARGIN_C:
                return int(round(float(current))), int(round(float(target)))
        except (TypeError, ValueError):
            continue
    return None


def _entries(machines: Sequence[Dict[str, Any]], selected_ids: Sequence[str],
             short_names: Optional[Dict[str, str]] = None) -> List[Dict[str, Any]]:
    by_id = {str(m.get("id")): m for m in machines}
    out = []
    for machine_id in selected_ids:
        machine = by_id.get(str(machine_id))
        if machine is None:
            continue  # la máquina se borró o cambió de id: se ignora (la config lo avisa)
        status = machine.get("status") or {}
        state = (status.get("state") if machine.get("online") else "offline") or "idle"
        label = (short_names or {}).get(str(machine_id)) or names_mod.short_name(machine.get("name") or str(machine_id))
        out.append({
            "id": str(machine_id), "label": label, "state": state, "job": status.get("job") or None,
            "kind": machine.get("type") or "printer", "heat": _heat(machine, state),
        })
    return out


def missing_ids(machines: Sequence[Dict[str, Any]], selected_ids: Sequence[str]) -> List[str]:
    known = {str(m.get("id")) for m in machines}
    return [str(i) for i in selected_ids if str(i) not in known]


def _track_done(entries: List[Dict[str, Any]], memory: Memory, now: float, done_seconds: float) -> None:
    """Una impresión que pasa de imprimir (o pausa) a terminada o en reposo
    dispara el aviso de terminado. Cancelada o con error, no."""
    for e in entries:
        before = memory.prev_state.get(e["id"])
        if e["job"]:
            memory.last_job[e["id"]] = e["job"]
        if before in ("printing", "paused") and e["state"] in ("complete", "idle", "standby"):
            job = e["job"] or memory.last_job.get(e["id"]) or {}
            memory.done = {"printer": e["label"], "file": job.get("filename") or "", "until": now + done_seconds}
        memory.prev_state[e["id"]] = e["state"]


def select(machines: Optional[Sequence[Dict[str, Any]]], selected_ids: Sequence[str], now: float,
           memory: Memory, clock: datetime, message: Optional[str] = None,
           view_seconds: float = 15.0, done_seconds: float = 60.0,
           short_names: Optional[Dict[str, str]] = None) -> Screen:
    """Pantalla y datos a mostrar. `machines` es None mientras no haya llegado
    el primer estado (se muestra el arranque, como máximo BOOT_MAX_S)."""
    time_text = clock.strftime("%H:%M")
    if machines is None:
        progress = int(100 * min(1.0, max(0.0, (now - memory.started_at) / BOOT_MAX_S)))
        return "boot", {"progress": progress}

    entries = _entries(machines, selected_ids, short_names)
    _track_done(entries, memory, now, done_seconds)

    for state, screen in (("error", "error"), ("paused", "pause"), ("offline", "offline")):
        hit = next((e for e in entries if e["state"] == state), None)
        if hit:
            data = {"printer": hit["label"]}
            if screen == "error":
                data["error"] = "ERROR"
            return screen, data

    if message:
        return "special", {"msg": message}

    if memory.done and now < memory.done["until"]:
        return "done", {"printer": memory.done["printer"], "file": memory.done["file"]}
    memory.done = None

    active = [e for e in entries if e["state"] in ACTIVE_STATES]
    if not active:
        memory.printing_since = None
    if len(active) == 1:
        e = active[0]
        if memory.printing_since is None:
            memory.printing_since = now
        job = e["job"] or {}
        view = int((now - memory.printing_since) // view_seconds) % 2
        data = {"printer": e["label"], "file": job.get("filename") or "", "pct": _pct(job.get("percent")),
                "kind": e["kind"]}
        memory.print_views = (data, {**data, "elapsed": _elapsed(job.get("elapsed_s")) or "--:--"})
        return ("print1", memory.print_views[0]) if view == 0 else ("print2", memory.print_views[1])
    if len(active) > 1:
        tags = [{"label": e["label"], "state": e["state"]} for e in active]
        memory.many_groups = [tags[i:i + 3] for i in range(0, len(tags), 3)]
        return "many", {"machines": tags[:3]}

    heating = next((e for e in entries if e["heat"]), None)
    if heating:
        temp, target = heating["heat"]
        return "heating", {"printer": heating["label"], "temp": temp, "target": target}
    if entries and all(e["state"] in QUIET_STATES for e in entries):
        return "idle", {"total": len(entries), "time": time_text}
    online = sum(1 for e in entries if e["state"] != "offline")
    return "normal", {"online": online, "time": time_text}


def is_long_message(text: str) -> bool:
    """Un mensaje que no cabe quieto junto al cactus corre por la pantalla."""
    return text_width(text, SMALL_FONT) > SCROLL_ABOVE_PX


def playlist(machines: Optional[Sequence[Dict[str, Any]]], selected_ids: Sequence[str], now: float,
             memory: Memory, clock: datetime, message: Optional[str] = None,
             view_seconds: float = 15.0, done_seconds: float = 60.0,
             message_seconds: Optional[float] = None,
             short_names: Optional[Dict[str, str]] = None) -> List[Tuple[str, Dict[str, Any], Optional[float]]]:
    """Serie de vistas que el panel recorre solo, cada una con su duración
    (None = pantalla fija, sin contador). Misma prioridad que select():
    - trabajando: vista 1 y vista 2 (una máquina) o grupos de 3 (varias);
    - en reposo: "todo normal" y "todas en reposo" se alternan;
    - terminado y mensaje: lo que les falta por mostrarse;
    - un mensaje largo es un texto que corre (pantalla "scroll")."""
    name, data = select(machines, selected_ids, now, memory, clock, message, view_seconds, done_seconds, short_names)
    if name in ("print1", "print2") and memory.print_views:
        return [("print1", memory.print_views[0], view_seconds), ("print2", memory.print_views[1], view_seconds)]
    if name == "many":
        return [("many", {"machines": group}, view_seconds) for group in memory.many_groups]
    if name == "done" and memory.done:
        return [("done", data, max(1.0, memory.done["until"] - now))]
    if name == "special":
        if is_long_message(data["msg"]):
            return [("scroll", {"text": data["msg"]}, message_seconds or None)]
        return [("special", data, message_seconds or None)]
    if name in ("idle", "normal") and selected_ids and machines is not None:
        total = len(_entries(machines, selected_ids, short_names))
        if total:
            time_text = clock.strftime("%H:%M")
            return [("normal", {"online": total, "time": time_text}, view_seconds),
                    ("idle", {"total": total, "time": time_text}, view_seconds)]
    return [(name, data, None)]


def signature(segments: Sequence[Tuple[str, Dict[str, Any], Optional[float]]]) -> Tuple:
    """Lo que cambia lo que se ve, sin el tiempo restante (que avanza solo y
    no debe provocar una nueva subida)."""
    import json

    return tuple((name, json.dumps(data, sort_keys=True, default=str), seconds is not None)
                 for name, data, seconds in segments)
