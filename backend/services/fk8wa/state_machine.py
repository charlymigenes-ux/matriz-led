"""Elige qué pantalla muestra el panel FK-8Wa a partir del estado de las
máquinas elegidas (spec RF11-RF14). Sin E/S: recibe la lista de máquinas
(el mismo contrato que TUNA-Screen, tunascreen_service.list_machines), los ids
elegidos en orden (P1, P2, ...), la hora y una memoria que guarda lo que
depende del tiempo (alternancia de vistas, aviso de terminado).

Prioridad aprobada: error > pausa > desconectada > mensaje especial >
terminado > impresión > calentando / en temperatura / enfriando >
inactivas / normal. Una impresora que calentó y no imprime se queda en
"en temperatura" hasta que se imprima o se apague el calentador; luego
"enfriando" hasta bajar de COOL_LIMIT_C.

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
COOL_LIMIT_C = 50          # sin objetivo y por arriba de esto = sigue enfriando
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
    peak: Dict[str, int] = field(default_factory=dict)   # máxima temperatura vista de cada máquina caliente


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


def _thermal(machine: Dict[str, Any], state: str) -> Optional[Tuple[str, int, int]]:
    """(fase, temperatura actual, objetivo) de una impresora que no imprime:
    "heating" (falta para el objetivo), "ready" (ya llegó y espera) o
    "cooling" (sin objetivo pero todavía caliente); None si no aplica.
    Los láser y CNC no calientan."""
    if machine.get("type") not in (None, "printer") or state not in QUIET_STATES:
        return None
    status = machine.get("status") or {}
    heaters = []
    for key in ("hotend", "bed"):
        pair = status.get(key) or {}
        try:
            current = float(pair["current"]) if pair.get("current") is not None else None
            target = float(pair.get("target") or 0)
        except (TypeError, ValueError):
            continue
        if current is not None:
            heaters.append((current, target))
    wanted = [(c, t) for c, t in heaters if t > 0]
    for current, target in wanted:
        if current < target - HEAT_MARGIN_C:
            return "heating", int(round(current)), int(round(target))
    if wanted:
        current, target = wanted[0]
        return "ready", int(round(current)), int(round(target))
    hottest = max((c for c, _ in heaters), default=None)
    if hottest is not None and hottest > COOL_LIMIT_C:
        return "cooling", int(round(hottest)), 0
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
            "kind": machine.get("type") or "printer", "thermal": _thermal(machine, state),
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


def _thermal_data(e: Dict[str, Any], memory: Memory) -> Screen:
    phase, temp, target = e["thermal"]
    if phase == "cooling":
        return phase, {"printer": e["label"], "temp": temp, "peak": max(temp, memory.peak.get(e["id"], temp))}
    return phase, {"printer": e["label"], "temp": temp, "target": target}


def _thermal_segments(entries: List[Dict[str, Any]], memory: Memory, seconds: float):
    """Una vista por máquina que calienta, está en temperatura o se enfría
    (las que imprimen no cuentan: su estado manda)."""
    order = {"heating": 0, "ready": 1, "cooling": 2}
    hot = sorted((e for e in entries if e["thermal"]), key=lambda e: order[e["thermal"][0]])
    return [(*_thermal_data(e, memory), seconds) for e in hot]


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
    for e in entries:       # la máxima de cada máquina, para saber qué tanto falta al enfriar
        if e["thermal"]:
            memory.peak[e["id"]] = max(memory.peak.get(e["id"], 0), e["thermal"][1])
        else:
            memory.peak.pop(e["id"], None)

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

    for phase in ("heating", "ready", "cooling"):
        hit = next((e for e in entries if e["thermal"] and e["thermal"][0] == phase), None)
        if hit:
            return _thermal_data(hit, memory)
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
    - trabajando: vista 1 y vista 2 (una máquina) o grupos de 3 (varias), y
      además una vista por cada máquina que calienta / está en temperatura /
      enfría, para que no se oculten;
    - en reposo: "todo normal" y "todas en reposo" se alternan;
    - terminado y mensaje: lo que les falta por mostrarse;
    - un mensaje largo es un texto que corre (pantalla "scroll")."""
    name, data = select(machines, selected_ids, now, memory, clock, message, view_seconds, done_seconds, short_names)
    if name in ("print1", "print2", "many"):
        # lo que trabaja alterna con lo que calienta, está en temperatura o se enfría
        extra = _thermal_segments(_entries(machines, selected_ids, short_names), memory, view_seconds)
        if name == "many":
            return [("many", {"machines": group}, view_seconds) for group in memory.many_groups] + extra
        return [("print1", memory.print_views[0], view_seconds),
                ("print2", memory.print_views[1], view_seconds)] + extra
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
