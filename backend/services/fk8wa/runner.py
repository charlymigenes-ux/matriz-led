"""Ciclo de fondo del panel FK-8Wa (spec RF15-RF20, RNF1-RNF3).

Cada TICK_S segundos: lee la configuración y el estado de las máquinas, elige
la pantalla, la dibuja y, solo si la imagen cambió y ya pasó el intervalo
mínimo, la sube al panel. El trabajo de red y de dibujo corre en un hilo
aparte (asyncio.to_thread) para no frenar el bucle de eventos de NOPAL, y
toda sesión TCP pasa por un único Lock: nunca hay dos a la vez.

Errores:
- Panel sin respuesta o respuesta inesperada: reintentos con espera creciente
  (RETRY_STEPS_S) sin afectar a NOPAL; al reconectar se reenvía el brillo.
- Tamaño distinto de 96x16: no se envía nada más hasta que cambie la
  configuración o se pruebe la conexión a mano (probablemente se usó el botón
  de 15 s de la placa y hay que reconfigurarla con FKShow).
"""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime
from typing import Any, Awaitable, Callable, Dict, List, Optional, Tuple

from . import config as config_mod
from . import messages as messages_mod
from . import effects, scrolltext, state_machine, timer
from .protocol import Fk8waClient, Fk8waError, SizeMismatch

logger = logging.getLogger(__name__)

TICK_S = 5.0
RETRY_STEPS_S = (15, 30, 60, 120, 300)
SHUTDOWN_WAIT_S = 5.0
DEMO_SECONDS = 12.0      # cuánto se queda un efecto de prueba antes de restaurar el panel


def effect_for(segments, cfg: Dict[str, Any]) -> Optional[Tuple[str, int, int]]:
    """(id, tipo, subtipo) del efecto de entrada que corresponde a estas vistas,
    o None. Los programas con reloj de contorno o barra y vistas con tiempo no
    llevan efecto: son varias imágenes y se repetiría en cada una."""
    situation = effects.SITUATION_OF.get(segments[0][0])
    effect_id = (cfg.get("effects") or {}).get(situation) if situation else None
    pair = effects.effect(effect_id)
    if pair is None:
        return None
    if config_mod.style_for(situation, cfg) in timer.PROGRESSIVE and any(seconds for _, _, seconds in segments):
        return None
    return effect_id, pair[0], pair[1]


def make_program(segments, cfg: Dict[str, Any]) -> bytes:
    """Programa del panel para estas vistas con la configuración vigente."""
    if segments[0][0] == "scroll":
        return scrolltext.build_program(segments[0][1]["text"], cfg["scroll_dir"], cfg["scroll_speed"])
    chosen = effect_for(segments, cfg)
    style = config_mod.style_for(effects.SITUATION_OF.get(segments[0][0], ""), cfg)
    return timer.build_program(segments, style, cfg["border_pattern"], cfg["border_speed"],
                               (chosen[1], chosen[2]) if chosen else None)


class Runner:
    def __init__(
        self,
        list_machines: Callable[[], Awaitable[List[Dict[str, Any]]]],
        client_factory: Callable[[str], Any] = Fk8waClient,
        load_config: Callable[[], Dict[str, Any]] = config_mod.load,
        current_message: Callable[[], Optional[Dict[str, Any]]] = messages_mod.current,
        clock: Callable[[], float] = time.monotonic,
        wall: Callable[[], float] = time.time,
        now_local: Callable[[], datetime] = datetime.now,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        to_thread: Callable[..., Awaitable[Any]] = asyncio.to_thread,
    ):
        self._list_machines = list_machines
        self._client_factory = client_factory
        self._load_config = load_config
        self._current_message = current_message
        self._clock, self._now_local, self._sleep, self._to_thread = clock, now_local, sleep, to_thread
        self._wall = wall
        self._lock = asyncio.Lock()
        self._task: Optional[asyncio.Task] = None
        self._stopping = False
        self._reset_panel(None)
        self.memory = state_machine.Memory(started_at=self._clock())
        self._machines: Optional[List[Dict[str, Any]]] = None
        self._demo_until: Optional[float] = None
        self.current: Optional[list] = None       # serie de vistas de la última selección
        self.status: Dict[str, Any] = {
            "state": "disabled", "screen": None, "last_sent_at": None, "last_error": None,
            "next_retry_in_s": None, "panel": None, "missing_machines": [], "sends": 0,
        }

    # ------------------------------------------------------------ estado interno
    def _reset_panel(self, ip: Optional[str]) -> None:
        self._ip = ip
        self._last_image: Optional[Any] = None    # firma de lo último que se subió
        self._last_send: Optional[float] = None
        self._retry_step = 0
        self._retry_at: Optional[float] = None
        self._size_blocked = False
        self._brightness_pending = True

    def _set_error(self, state: str, message: str) -> None:
        self.status["state"] = state
        self.status["last_error"] = {"message": message, "at": self._now_local().isoformat(timespec="seconds")}

    # ------------------------------------------------------------ ciclo
    def start(self) -> None:
        if self._task is None or self._task.done():
            self._stopping = False
            self._task = asyncio.get_running_loop().create_task(self._loop())

    async def _loop(self) -> None:
        while not self._stopping:
            try:
                await self.tick()
            except Exception:  # nunca debe morir el ciclo por un error inesperado
                logger.exception("Panel FK-8Wa: error inesperado en el ciclo")
            await self._sleep(TICK_S)

    async def tick(self) -> None:
        cfg = self._load_config()
        if not cfg["enabled"] or not cfg["ip"]:
            self.status.update(state="disabled", next_retry_in_s=None)
            return
        if cfg["ip"] != self._ip:
            self._reset_panel(cfg["ip"])
        if self._size_blocked:
            return
        now = self._clock()
        if self._retry_at is not None and now < self._retry_at:
            self.status["next_retry_in_s"] = round(self._retry_at - now)
            return

        try:
            self._machines = await self._list_machines()
        except Exception as exc:  # sin estado nuevo: se queda con el último
            logger.warning(f"Panel FK-8Wa: no se pudo leer el estado de las máquinas ({exc})")
        message = self._current_message()
        remaining = None
        if message:
            remaining = max(1.0, float(message.get("expires_at", 0)) - self._wall())
        segments = state_machine.playlist(
            self._machines, cfg["machines"], now, self.memory, self._now_local(),
            message["text"] if message else None, cfg["view_seconds"], cfg["done_seconds"], remaining,
            cfg["short_names"])
        self.current = segments
        self.status["missing_machines"] = state_machine.missing_ids(self._machines or [], cfg["machines"])
        if self._demo_until is not None:
            if now < self._demo_until:
                return          # un efecto de prueba está en el panel: no se pisa todavía
            self._demo_until = None
            self._last_image, self._last_send = None, None     # restaura lo que corresponde
        sig = (cfg["timer_style"], repr(sorted(cfg["situation_styles"].items())), cfg["border_pattern"], cfg["border_speed"], repr(sorted(cfg["effects"].items())),
               cfg["scroll_dir"], cfg["scroll_speed"], state_machine.signature(segments))

        if sig == self._last_image and not self._brightness_pending:
            return
        if self._last_send is not None and now - self._last_send < cfg["min_interval_s"]:
            return  # se enviará en un tick posterior, ya con el estado más reciente
        data = None
        if sig != self._last_image:
            data = await self._to_thread(make_program, segments, cfg)
        await self._send(data, sig, segments[0][0], cfg)

    async def _send(self, data: Optional[bytes], payload: Any, name: str, cfg: Dict[str, Any]) -> None:
        """Sube `data` (si no es None) y, si hace falta, el brillo. `payload` es
        la firma de lo que se ve, para no volver a subir lo mismo."""
        client = self._client_factory(cfg["ip"])
        self._last_send = self._clock()
        try:
            async with self._lock:
                if data is not None:
                    info = await self._to_thread(client.upload, data)
                    self.status["panel"] = info
                if self._brightness_pending:
                    await self._to_thread(client.brightness, cfg["brightness"])
        except SizeMismatch as exc:
            self._size_blocked = True
            self.status["panel"] = {"width": exc.width, "height": exc.height}
            self._set_error("size_mismatch", str(exc))
            logger.error(f"Panel FK-8Wa: {exc}")
            return
        except Fk8waError as exc:
            delay = RETRY_STEPS_S[min(self._retry_step, len(RETRY_STEPS_S) - 1)]
            self._retry_step += 1
            self._retry_at = self._clock() + delay
            self._brightness_pending = True   # tras un corte, el brillo pudo no conservarse
            self._set_error("unreachable", str(exc))
            self.status["next_retry_in_s"] = delay
            logger.warning(f"Panel FK-8Wa: {exc}; reintento en {delay} s")
            return
        self._last_image = payload
        self._brightness_pending = False
        self._retry_step, self._retry_at = 0, None
        self.status.update(state="ok", screen=name, next_retry_in_s=None,
                           last_sent_at=self._now_local().isoformat(timespec="seconds"))
        self.status["sends"] += 1

    # ------------------------------------------------------------ acciones manuales
    async def test_connection(self) -> Dict[str, Any]:
        """Solo 01 09. Quita el bloqueo por tamaño si ahora sí es 96x16."""
        cfg = self._load_config()
        if not cfg["ip"]:
            raise Fk8waError("Falta la IP del panel")
        async with self._lock:
            info = await self._to_thread(self._client_factory(cfg["ip"]).info)
        self.status["panel"] = info
        if (info["width"], info["height"]) == (96, 16):
            self._reset_panel(cfg["ip"])
        else:
            self._size_blocked = True
            self._set_error("size_mismatch", str(SizeMismatch(info["width"], info["height"])))
        return info

    async def demo_effect(self, effect_id: str) -> None:
        """"Probar en mi panel": sube un ejemplo de dos pantallas con el efecto
        elegido y lo deja unos segundos; después el ciclo restaura el panel.
        Si sale bien, el efecto queda anotado como probado en esta instalación."""
        pair = effects.effect(effect_id)
        if pair is None:
            raise ValueError("Efecto desconocido")
        cfg = self._load_config()
        if not cfg["ip"]:
            raise Fk8waError("Falta la IP del panel")
        sample = [("normal", {"online": 3, "time": "17:42"}, 3.0),
                  ("print1", {"printer": "ET4", "file": "soporte_motor", "pct": 72}, 3.0)]
        data = timer.build_program(sample, "ninguno", effect=pair)
        client = self._client_factory(cfg["ip"])
        async with self._lock:
            await self._to_thread(client.upload, data)
        self._demo_until = self._clock() + DEMO_SECONDS
        effects.mark_tested(effect_id)

    def brightness_changed(self) -> None:
        """La configuración cambió el brillo: se envía en el próximo tick."""
        self._brightness_pending = True

    # ------------------------------------------------------------ apagado
    async def stop(self) -> None:
        """Detiene el ciclo y, si el panel estaba activo, muestra HASTA PRONTO."""
        self._stopping = True
        if self._task is not None:
            self._task.cancel()
        cfg = self._load_config()
        if not cfg["enabled"] or not cfg["ip"] or self._size_blocked:
            return
        try:
            await asyncio.wait_for(self._lock.acquire(), timeout=SHUTDOWN_WAIT_S)
        except asyncio.TimeoutError:
            logger.warning("Panel FK-8Wa: la subida en curso no terminó a tiempo; no se envía HASTA PRONTO")
            return
        try:
            data = timer.build_program([("off", {}, None)], cfg["timer_style"], cfg["border_pattern"],
                                       cfg["border_speed"])
            await asyncio.wait_for(
                self._to_thread(self._client_factory(cfg["ip"]).upload, data), timeout=SHUTDOWN_WAIT_S)
        except (Fk8waError, asyncio.TimeoutError) as exc:
            logger.warning(f"Panel FK-8Wa: no se pudo mostrar HASTA PRONTO ({exc})")
        finally:
            self._lock.release()
