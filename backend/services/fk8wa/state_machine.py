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

BOOT_MAX_S = 30.0
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


def _entries(machines: Sequence[Dict[str, Any]], selected_ids: Sequence[str]) -> List[Dict[str, Any]]:
    by_id = {str(m.get("id")): m for m in machines}
    out = []
    for index, machine_id in enumerate(selected_ids):
        machine = by_id.get(str(machine_id))
        if machine is None:
            continue  # la máquina se borró o cambió de id: se ignora (la config lo avisa)
        status = machine.get("status") or {}
        state = status.get("state") if machine.get("online") else "offline"
        out.append({
            "id": str(machine_id), "label": f"P{index + 1}", "state": state or "idle",
            "job": status.get("job") or None,
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
           view_seconds: float = 15.0, done_seconds: float = 60.0) -> Screen:
    """Pantalla y datos a mostrar. `machines` es None mientras no haya llegado
    el primer estado (se muestra el arranque, como máximo BOOT_MAX_S)."""
    time_text = clock.strftime("%H:%M")
    if machines is None:
        progress = int(100 * min(1.0, max(0.0, (now - memory.started_at) / BOOT_MAX_S)))
        return "boot", {"progress": progress}

    entries = _entries(machines, selected_ids)
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
        data = {"printer": e["label"], "file": job.get("filename") or "", "pct": _pct(job.get("percent"))}
        memory.print_views = (data, {**data, "elapsed": _elapsed(job.get("elapsed_s")) or "--:--"})
        return ("print1", memory.print_views[0]) if view == 0 else ("print2", memory.print_views[1])
    if len(active) > 1:
        tags = [{"label": e["label"], "state": e["state"]} for e in active]
        memory.many_groups = [tags[i:i + 3] for i in range(0, len(tags), 3)]
        return "many", {"machines": tags[:3]}

    if entries and all(e["state"] in QUIET_STATES for e in entries):
        return "idle", {"total": len(entries), "time": time_text}
    online = sum(1 for e in entries if e["state"] != "offline")
    return "normal", {"online": online, "time": time_text}


def playlist(machines: Optional[Sequence[Dict[str, Any]]], selected_ids: Sequence[str], now: float,
             memory: Memory, clock: datetime, message: Optional[str] = None,
             view_seconds: float = 15.0, done_seconds: float = 60.0,
             message_seconds: Optional[float] = None) -> List[Tuple[str, Dict[str, Any], Optional[float]]]:
    """Serie de vistas que el panel recorre solo, cada una con su duración
    (None = pantalla fija, sin contador). Misma prioridad que select():
    - impresión: vista 1 y vista 2, `view_seconds` cada una;
    - varias: grupos de 3 activas, `view_seconds` cada grupo;
    - terminado y mensaje especial: lo que les falta por mostrarse."""
    name, data = select(machines, selected_ids, now, memory, clock, message, view_seconds, done_seconds)
    if name in ("print1", "print2") and memory.print_views:
        return [("print1", memory.print_views[0], view_seconds), ("print2", memory.print_views[1], view_seconds)]
    if name == "many":
        return [("many", {"machines": group}, view_seconds) for group in memory.many_groups]
    if name == "done" and memory.done:
        return [("done", data, max(1.0, memory.done["until"] - now))]
    if name == "special":
        return [("special", data, message_seconds or None)]
    return [(name, data, None)]


def signature(segments: Sequence[Tuple[str, Dict[str, Any], Optional[float]]]) -> Tuple:
    """Lo que cambia lo que se ve, sin el tiempo restante (que avanza solo y
    no debe provocar una nueva subida)."""
    import json

    return tuple((name, json.dumps(data, sort_keys=True, default=str), seconds is not None)
                 for name, data, seconds in segments)
