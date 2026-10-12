"""Ciclo de fondo del FK-8Wa con reloj, máquinas y panel simulados (CA3-CA6)."""

import asyncio
from datetime import datetime

import pytest

from ..conftest import fk8wa_module

runner_mod = fk8wa_module("runner")
protocol = fk8wa_module("protocol")
config = fk8wa_module("config")


class Clock:
    def __init__(self):
        self.t = 1000.0

    def __call__(self):
        return self.t


class FakeClient:
    """Panel simulado: registra subidas y brillo; puede fallar a pedido."""

    log = []
    last_program = None
    fail = None          # excepción a lanzar en la próxima operación (o None)
    size = (96, 16)
    active = 0
    max_active = 0
    delay = 0.0

    def __init__(self, ip):
        self.ip = ip

    def _enter(self):
        FakeClient.active += 1
        FakeClient.max_active = max(FakeClient.max_active, FakeClient.active)

    def _exit(self):
        FakeClient.active -= 1

    def _maybe_fail(self):
        if FakeClient.fail is not None:
            raise FakeClient.fail
        if FakeClient.size != (96, 16):
            raise protocol.SizeMismatch(*FakeClient.size)

    def upload(self, data):
        self._enter()
        try:
            if FakeClient.delay:
                import time
                time.sleep(FakeClient.delay)
            self._maybe_fail()
            FakeClient.log.append(("upload", self.ip, len(data)))
            FakeClient.last_program = data
            return {"width": 96, "height": 16, "port": 5858, "ip": self.ip}
        finally:
            self._exit()

    def brightness(self, level):
        self._maybe_fail()
        FakeClient.log.append(("brightness", level))
        return level

    def info(self):
        FakeClient.log.append(("info",))
        w, h = FakeClient.size
        return {"width": w, "height": h, "port": 5858, "ip": self.ip}


@pytest.fixture(autouse=True)
def reset_fake():
    FakeClient.log, FakeClient.fail, FakeClient.size = [], None, (96, 16)
    FakeClient.active = FakeClient.max_active = 0
    FakeClient.delay = 0.0


def make(cfg=None, machines=None, message=None):
    clock = Clock()
    state = {"cfg": {**config.DEFAULTS, "enabled": True, "ip": "192.168.0.90", "brightness": 9, "machines": ["a"],
                     **(cfg or {})},
             "machines": machines if machines is not None else [
                 {"id": "a", "online": True, "status": {"state": "idle", "job": None}}],
             "message": message}

    async def list_machines():
        if isinstance(state["machines"], Exception):
            raise state["machines"]
        return state["machines"]

    async def direct(fn, *args):
        return fn(*args)

    r = runner_mod.Runner(list_machines, client_factory=FakeClient, load_config=lambda: state["cfg"],
                          current_message=lambda: state["message"], clock=clock,
                          now_local=lambda: datetime(2026, 10, 11, 17, 42), to_thread=direct)
    return r, clock, state


def uploads():
    return [e for e in FakeClient.log if e[0] == "upload"]


class TestSending:
    async def test_first_tick_sends_screen_and_brightness(self):
        r, clock, _ = make()
        await r.tick()
        assert FakeClient.log == [("upload", "192.168.0.90", FakeClient.log[0][2]), ("brightness", 9)]
        assert r.status["state"] == "ok" and r.status["screen"] == "normal" and r.status["sends"] == 1

    async def test_unchanged_image_is_not_resent(self):
        r, clock, _ = make()
        for _ in range(10):
            await r.tick()
            clock.t += 60
        assert len(uploads()) == 1

    async def test_rate_limit_ca6(self):
        """Cambios cada segundo durante 60 s con intervalo 15 s: como máximo 4 envíos."""
        r, clock, state = make()
        for second in range(60):
            state["message"] = {"text": f"M{second}"}
            await r.tick()
            clock.t += 1
        assert len(uploads()) == 4

    async def test_latest_state_is_sent_after_interval(self):
        r, clock, state = make()
        await r.tick()
        state["message"] = {"text": "UNO"}
        clock.t += 5
        await r.tick()                     # dentro del intervalo: no se envía
        state["message"] = {"text": "DOS"}
        clock.t += 11
        await r.tick()
        assert len(uploads()) == 2 and r.status["screen"] == "special"

    async def test_disabled_does_nothing(self):
        r, clock, _ = make(cfg={"enabled": False})
        await r.tick()
        assert FakeClient.log == [] and r.status["state"] == "disabled"


class TestErrors:
    async def test_unreachable_backoff_ca4(self):
        r, clock, _ = make()
        FakeClient.fail = protocol.PanelUnreachable("sin respuesta")
        attempts = []
        for _ in range(400):
            before = r.status.get("last_error")
            await r.tick()
            if r.status.get("last_error") is not before:
                attempts.append(clock.t)
            clock.t += 5
        gaps = [round(b - a) for a, b in zip(attempts, attempts[1:])]
        assert gaps[:5] == [15, 30, 60, 120, 300] and set(gaps[5:]) <= {300}
        assert r.status["state"] == "unreachable" and "sin respuesta" in r.status["last_error"]["message"]

    async def test_recovers_and_resends_brightness(self):
        r, clock, _ = make()
        await r.tick()
        FakeClient.fail = protocol.PanelUnreachable("corte")
        r._last_image = None
        clock.t += 20
        await r.tick()
        FakeClient.fail = None
        clock.t += 20
        await r.tick()
        assert FakeClient.log[-1] == ("brightness", 9) and r.status["state"] == "ok"

    async def test_size_mismatch_stops_everything_ca3(self):
        r, clock, _ = make()
        FakeClient.size = (288, 16)
        await r.tick()
        for _ in range(20):
            clock.t += 30
            await r.tick()
        assert uploads() == [] and r.status["state"] == "size_mismatch"
        assert r.status["panel"] == {"width": 288, "height": 16}

    async def test_test_connection_unblocks_when_fixed(self):
        r, clock, _ = make()
        FakeClient.size = (288, 16)
        await r.tick()
        FakeClient.size = (96, 16)
        assert (await r.test_connection())["width"] == 96
        clock.t += 30
        await r.tick()
        assert len(uploads()) == 1 and r.status["state"] == "ok"

    async def test_machines_failure_keeps_last_snapshot(self):
        r, clock, state = make()
        await r.tick()
        state["machines"] = RuntimeError("tunascreen caído")
        clock.t += 30
        await r.tick()
        assert r.status["state"] == "ok" and len(uploads()) == 1

    async def test_ip_change_resets(self):
        r, clock, state = make()
        await r.tick()
        state["cfg"] = {**state["cfg"], "ip": "192.168.0.91"}
        clock.t += 1
        await r.tick()        # IP nueva: no espera el intervalo de la anterior
        assert uploads()[-1][1] == "192.168.0.91"


class TestConcurrencyAndShutdown:
    async def test_single_session_ca5(self):
        """Envíos concurrentes (ciclo + prueba de conexión + apagado) nunca se solapan."""
        r, clock, _ = make()
        FakeClient.delay = 0.05
        r._to_thread = asyncio.to_thread
        await asyncio.gather(r.tick(), r.test_connection(), r.stop(), r.test_connection())
        assert FakeClient.max_active == 1

    async def test_stop_shows_off_screen(self):
        r, clock, _ = make()
        await r.stop()
        assert len(uploads()) == 1

    async def test_stop_skips_when_disabled_or_blocked(self):
        r, clock, _ = make(cfg={"enabled": False})
        await r.stop()
        assert FakeClient.log == []

    async def test_stop_waits_at_most_for_a_running_upload(self, monkeypatch):
        monkeypatch.setattr(runner_mod, "SHUTDOWN_WAIT_S", 0.05)
        r, clock, _ = make()
        await r._lock.acquire()          # una subida "en curso" que no termina
        await r.stop()
        assert uploads() == []
        r._lock.release()

    async def test_loop_survives_unexpected_errors(self):
        r, clock, _ = make()
        calls = []

        async def boom():
            calls.append(1)
            if len(calls) >= 3:
                r._stopping = True
            raise ValueError("inesperado")

        r.tick = boom

        async def no_sleep(_s):
            return None

        r._sleep = no_sleep
        await r._loop()
        assert len(calls) == 3


def header(data):
    import struct
    return {"effect": (data[332], data[333]), "pages": struct.unpack_from("<H", data, 330)[0]}


class TestEffectsAndScroll:
    def machines(self, state="idle"):
        return [{"id": "a", "name": "Klipper ET4", "type": "printer", "online": True,
                 "status": {"state": state, "job": None}}]

    async def test_error_screen_uses_its_configured_effect(self):
        r, clock, state = make(cfg={"effects": {**config.DEFAULTS["effects"], "error": "flash_1"}},
                               machines=self.machines("error"))
        await r.tick()
        assert header(FakeClient.last_program)["effect"] == (7, 1)

    async def test_no_effect_configured_keeps_the_verified_static_program(self):
        r, clock, state = make(machines=self.machines("error"))
        await r.tick()
        assert header(FakeClient.last_program)["effect"] == (1, 0)

    async def test_timed_situation_with_contour_clock_gets_no_effect(self):
        r, clock, state = make(cfg={"effects": {**config.DEFAULTS["effects"], "rest": "cover_1"}})
        await r.tick()
        assert header(FakeClient.last_program) == {"effect": (1, 0), "pages": 16}

    async def test_timed_situation_without_clock_uses_the_effect(self):
        r, clock, state = make(cfg={"timer_style": "ninguno", "effects": {**config.DEFAULTS["effects"], "rest": "cover_1"}})
        await r.tick()
        assert header(FakeClient.last_program) == {"effect": (3, 1), "pages": 2}

    async def test_changing_the_effect_resends(self):
        r, clock, state = make(machines=self.machines("error"))
        await r.tick()
        state["cfg"] = {**state["cfg"], "effects": {**config.DEFAULTS["effects"], "error": "movein_3"}}
        clock.t += 30
        await r.tick()
        assert len(uploads()) == 2 and header(FakeClient.last_program)["effect"] == (4, 3)

    async def test_long_message_scrolls_in_the_chosen_direction(self):
        text = "MATERIAL BAJO EN LA ENDER CAMBIA EL CARRETE"
        r, clock, state = make(cfg={"scroll_dir": "r"}, message={"text": text, "expires_at": 10 ** 12})
        await r.tick()
        h = header(FakeClient.last_program)
        assert h["effect"] == (2, 2) and h["pages"] > 2

    async def test_short_message_is_a_screen_with_the_special_effect(self):
        r, clock, state = make(cfg={"timer_style": "ninguno", "effects": {**config.DEFAULTS["effects"], "special": "movein_4"}},
                               message={"text": "TODO BIEN", "expires_at": 10 ** 12})
        await r.tick()
        assert header(FakeClient.last_program)["effect"] == (4, 4) and r.status["screen"] == "special"


class TestDemoEffect:
    async def test_demo_sends_pair_and_marks_tested(self, tmp_path, monkeypatch):
        effects = fk8wa_module("effects")
        monkeypatch.setattr(effects, "TESTED_PATH", tmp_path / "tested.json")
        r, clock, state = make()
        await r.demo_effect("movein_4")
        assert header(FakeClient.last_program) == {"effect": (4, 4), "pages": 2}
        assert "movein_4" in effects.load_tested()

    async def test_demo_holds_the_panel_then_restores(self, tmp_path, monkeypatch):
        effects = fk8wa_module("effects")
        monkeypatch.setattr(effects, "TESTED_PATH", tmp_path / "tested.json")
        r, clock, state = make()
        await r.tick()
        await r.demo_effect("cover_5")
        sent = len(uploads())
        state["message"] = {"text": "HOLA", "expires_at": 10 ** 12}
        clock.t += 5
        await r.tick()
        assert len(uploads()) == sent                      # no se pisa durante la prueba
        clock.t += 20
        await r.tick()
        assert len(uploads()) == sent + 1 and r.status["screen"] == "special"   # restaura

    async def test_demo_rejects_unknown_effect_and_missing_ip(self):
        r, clock, state = make(cfg={"ip": ""})
        with pytest.raises(ValueError):
            await r.demo_effect("nope")
        with pytest.raises(protocol.Fk8waError):
            await r.demo_effect("cover_5")
