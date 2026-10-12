"""Máquina de estados del FK-8Wa (RF11-RF14) con reloj simulado (CA7)."""

from datetime import datetime

import pytest

from ..conftest import fk8wa_module

sm = fk8wa_module("state_machine")

CLOCK = datetime(2026, 10, 11, 17, 42)


def m(mid, state="idle", online=True, filename=None, percent=None, elapsed=None):
    job = {"filename": filename, "percent": percent, "elapsed_s": elapsed} if filename else None
    return {"id": mid, "name": mid, "online": online, "status": {"state": state, "job": job}}


IDS = ["a", "b", "c"]


def pick(machines, now=100.0, memory=None, message=None, ids=IDS):
    memory = memory or sm.Memory(started_at=0.0)
    return sm.select(machines, ids, now, memory, CLOCK, message)


class TestPriority:
    def test_boot_until_first_snapshot(self):
        mem = sm.Memory(started_at=0.0)
        assert sm.select(None, IDS, 15.0, mem, CLOCK) == ("boot", {"progress": 50})
        assert sm.select(None, IDS, 99.0, mem, CLOCK) == ("boot", {"progress": 100})

    def test_error_wins_over_everything(self):
        ms = [m("a", "paused"), m("b", "error"), m("c", online=False)]
        assert pick(ms, message="hola") == ("error", {"printer": "B", "error": "ERROR"})

    def test_first_error_by_order(self):
        assert pick([m("a", "error"), m("b", "error"), m("c")])[1]["printer"] == "A"

    def test_pause_over_offline_and_message(self):
        assert pick([m("a", online=False), m("b", "paused"), m("c")], message="x") == ("pause", {"printer": "B"})

    def test_message_over_offline(self):
        # la desconectada ya no tapa nada: el mensaje manda y ella entra al ciclo cuando no hay mensaje
        assert pick([m("a"), m("b"), m("c", online=False)], message="x") == ("special", {"msg": "x"})
        assert pick([m("a"), m("b"), m("c", online=False)]) == ("offline", {"printer": "C"})

    def test_message_over_printing(self):
        assert pick([m("a", "printing", filename="x.gcode")], message="TODO BIEN") == ("special", {"msg": "TODO BIEN"})

    def test_idle_when_all_quiet(self):
        assert pick([m("a", "idle"), m("b", "standby"), m("c", "complete")]) == ("idle", {"total": 3, "time": "17:42"})

    def test_normal_otherwise(self):
        assert pick([m("a", "idle"), m("b", "heating"), m("c", "idle")]) == ("normal", {"online": 3, "time": "17:42"})

    def test_no_machines_selected(self):
        assert pick([m("a")], ids=[]) == ("normal", {"online": 0, "time": "17:42"})

    def test_missing_machine_is_ignored(self):
        assert pick([m("a", "printing", filename="x.gc", percent=5)], ids=["zz", "a"])[1]["printer"] == "A"
        assert sm.missing_ids([m("a")], ["zz", "a"]) == ["zz"]


class TestPrinting:
    def test_one_active_alternates_every_15s(self):
        mem = sm.Memory(started_at=0.0)
        ms = [m("a", "printing", filename="CUBO.gcode", percent=72.4, elapsed=5040), m("b"), m("c")]
        seen = [sm.select(ms, IDS, t, mem, CLOCK)[0] for t in (100, 110, 115, 129, 130, 145)]
        assert seen == ["print1", "print1", "print2", "print2", "print1", "print2"]
        assert sm.select(ms, IDS, 116, mem, CLOCK) == (
            "print2", {"printer": "A", "file": "CUBO.gcode", "pct": 72, "kind": "printer", "elapsed": "01:24"})

    def test_missing_progress_data(self):
        mem = sm.Memory(started_at=0.0)
        ms = [m("a", "printing", filename="x.gc")]
        sm.select(ms, ["a"], 0, mem, CLOCK)
        assert sm.select(ms, ["a"], 16, mem, CLOCK)[1] == {"printer": "A", "file": "x.gc", "pct": 0, "kind": "printer", "elapsed": "--:--"}

    def test_many_shows_only_active_up_to_3(self):
        ms = [m(i, "printing", filename="f.gc") for i in "abcd"] + [m("e")]
        name, data = pick(ms, ids=list("eabcd"))
        assert name == "many"
        assert [x["label"] for x in data["machines"]] == ["A", "B", "C"]


class TestDone:
    def test_done_shows_60s_then_back(self):
        mem = sm.Memory(started_at=0.0)
        sm.select([m("a", "printing", filename="CUBO.gcode", percent=99)], ["a"], 0, mem, CLOCK)
        assert sm.select([m("a", "complete")], ["a"], 10, mem, CLOCK) == ("done", {"printer": "A", "file": "CUBO.gcode"})
        assert sm.select([m("a", "complete")], ["a"], 69, mem, CLOCK)[0] == "done"
        assert sm.select([m("a", "complete")], ["a"], 71, mem, CLOCK)[0] == "idle"

    def test_cancel_is_not_done(self):
        mem = sm.Memory(started_at=0.0)
        sm.select([m("a", "printing", filename="x.gc")], ["a"], 0, mem, CLOCK)
        assert sm.select([m("a", "cancelled")], ["a"], 5, mem, CLOCK)[0] == "idle"

    def test_done_from_pause_to_idle(self):
        mem = sm.Memory(started_at=0.0)
        sm.select([m("a", "paused", filename="x.gc")], ["a"], 0, mem, CLOCK)
        assert sm.select([m("a", "idle")], ["a"], 5, mem, CLOCK)[0] == "done"

    def test_error_still_wins_during_done(self):
        mem = sm.Memory(started_at=0.0)
        sm.select([m("a", "printing", filename="x.gc"), m("b")], ["a", "b"], 0, mem, CLOCK)
        assert sm.select([m("a", "complete"), m("b", "error")], ["a", "b"], 5, mem, CLOCK)[0] == "error"


@pytest.mark.parametrize("seconds, text", [(0, "00:00"), (5040, "01:24"), (45000, "12:30"), (None, None), (-3, None)])
def test_elapsed_format(seconds, text):
    assert sm._elapsed(seconds) == text


# ── Nombres reales, láser/CNC, calentando, reposo alternando y mensajes largos ──

def mach(mid, name, state="idle", kind="printer", hotend=None, bed=None, **job):
    status = {"state": state, "job": ({"filename": job.get("filename"), "percent": job.get("percent"),
                                       "elapsed_s": job.get("elapsed")} if job else None)}
    if hotend:
        status["hotend"] = {"current": hotend[0], "target": hotend[1]}
    if bed:
        status["bed"] = {"current": bed[0], "target": bed[1]}
    return {"id": mid, "name": name, "type": kind, "online": True, "status": status}


class TestRealNames:
    def test_label_is_the_short_name_of_the_real_name(self):
        ms = [mach("klipper:7125", "Klipper ET4", "error"), mach("laser:x", "TTS 55 PRO")]
        assert pick(ms, ids=["klipper:7125", "laser:x"]) == ("error", {"printer": "ET4", "error": "ERROR"})

    def test_configured_short_name_wins(self):
        ms = [mach("klipper:7125", "Klipper ET4", "paused")]
        memory = sm.Memory(started_at=0.0)
        got = sm.select(ms, ["klipper:7125"], 100.0, memory, CLOCK, short_names={"klipper:7125": "BIGO"})
        assert got == ("pause", {"printer": "BIGO"})

    def test_laser_print2_has_kind_and_no_elapsed(self):
        mem = sm.Memory(started_at=0.0)
        ms = [mach("laser:x", "TTS 55 PRO", "printing", kind="laser", filename="cristo.gc", percent=38)]
        sm.select(ms, ["laser:x"], 0, mem, CLOCK)
        name, data = sm.select(ms, ["laser:x"], 16, mem, CLOCK)
        assert name == "print2" and data["kind"] == "laser" and data["elapsed"] == "--:--"

    def test_mixed_machines_show_names_in_many(self):
        ms = [mach("a", "Klipper ET4", "printing", filename="x.gc"),
              mach("b", "TTS 55 PRO", "printing", kind="laser", filename="y.gc"),
              mach("c", "CNC 3018", "printing", kind="cnc", filename="z.nc")]
        name, data = pick(ms)
        assert name == "many" and [x["label"] for x in data["machines"]] == ["ET4", "TTS", "CNC"]


class TestHeating:
    def test_heating_printer_shows_temperatures(self):
        ms = [mach("a", "Klipper ET4", hotend=(165.4, 200)), mach("b", "Otra")]
        assert pick(ms) == ("heating", {"printer": "ET4", "temp": 165, "target": 200})

    def test_bed_counts_when_nozzle_has_no_target(self):
        ms = [mach("a", "ET4", bed=(40, 60))]
        assert pick(ms, ids=["a"]) == ("heating", {"printer": "ET4", "temp": 40, "target": 60})

    @pytest.mark.parametrize("hotend", [(198, 200), (200, 200), (25, 0), (None, 200)])
    def test_not_heating(self, hotend):
        assert pick([mach("a", "ET4", hotend=hotend)], ids=["a"])[0] != "heating"

    def test_laser_never_heats(self):
        assert pick([mach("a", "TTS", kind="laser", hotend=(20, 200))], ids=["a"])[0] != "heating"

    def test_printing_wins_over_heating_and_error_wins_over_both(self):
        ms = [mach("a", "ET4", hotend=(100, 200)), mach("b", "ET5", "printing", filename="x.gc")]
        assert pick(ms, ids=["a", "b"])[0] in ("print1", "print2")
        ms.append(mach("c", "ET6", "error"))
        assert pick(ms, ids=["a", "b", "c"])[0] == "error"


class TestReadyAndCooling:
    def test_at_temperature_stays_until_something_changes(self):
        ms = [mach("a", "ET4", hotend=(200, 200))]
        assert pick(ms, ids=["a"]) == ("ready", {"printer": "ET4", "temp": 200, "target": 200})
        ms = [mach("a", "ET4", hotend=(198, 200))]       # dentro del margen sigue "en temperatura"
        assert pick(ms, ids=["a"])[0] == "ready"

    def test_heating_then_ready_then_cooling_with_the_peak(self):
        mem = sm.Memory(started_at=0.0)
        assert pick([mach("a", "ET4", hotend=(120, 200))], memory=mem, ids=["a"])[0] == "heating"
        assert pick([mach("a", "ET4", hotend=(201, 200))], memory=mem, ids=["a"])[0] == "ready"
        name, data = pick([mach("a", "ET4", hotend=(150, 0))], memory=mem, ids=["a"])
        assert (name, data) == ("cooling", {"printer": "ET4", "temp": 150, "peak": 201})
        assert pick([mach("a", "ET4", hotend=(51, 0))], memory=mem, ids=["a"])[0] == "cooling"
        assert pick([mach("a", "ET4", hotend=(50, 0))], memory=mem, ids=["a"])[0] == "idle"
        assert mem.peak == {}

    def test_bed_alone_can_keep_ready_or_cool(self):
        assert pick([mach("a", "ET4", hotend=(25, 0), bed=(60, 60))], ids=["a"])[0] == "ready"
        assert pick([mach("a", "ET4", hotend=(25, 0), bed=(80, 0))], ids=["a"])[0] == "cooling"

    def test_heating_beats_ready_and_ready_beats_cooling(self):
        ms = [mach("a", "ET4", hotend=(200, 200)), mach("b", "ET5", hotend=(100, 200)), mach("c", "ET6", hotend=(90, 0))]
        assert pick(ms)[0] == "heating"
        assert pick(ms[:1] + ms[2:], ids=["a", "c"])[0] == "ready"
        assert pick(ms[2:], ids=["c"])[0] == "cooling"

    @pytest.mark.parametrize("kind", ["laser", "cnc"])
    def test_laser_and_cnc_never_ready_or_cooling(self, kind):
        assert pick([mach("a", "TTS", kind=kind, hotend=(200, 200))], ids=["a"])[0] == "idle"
        assert pick([mach("a", "TTS", kind=kind, hotend=(90, 0))], ids=["a"])[0] == "idle"

    def test_printing_and_done_win_over_ready_and_cooling(self):
        ms = [mach("a", "ET4", hotend=(200, 200)), mach("b", "ET5", "printing", filename="x.gc")]
        assert pick(ms, ids=["a", "b"])[0] in ("print1", "print2")

    def test_playlists_are_fixed(self):
        mem = sm.Memory(started_at=0.0)
        segs = sm.playlist([mach("a", "ET4", hotend=(200, 200))], ["a"], 100.0, mem, CLOCK, None, 15.0, 60.0)
        assert segs == [("ready", {"printer": "ET4", "temp": 200, "target": 200}, None)]


class TestWorkingMixedWithHeat:
    def play(self, ms, ids, mem=None):
        return sm.playlist(ms, ids, 100.0, mem or sm.Memory(started_at=0.0), CLOCK, None, 15.0, 60.0)

    def test_working_machine_alternates_with_the_one_heating(self):
        ms = [mach("a", "TTS 55 PRO", "printing", kind="laser", filename="x.nc", percent=30),
              mach("b", "Klipper ET4", hotend=(120, 200))]
        segs = self.play(ms, ["a", "b"])
        assert [n for n, _, _ in segs] == ["print1", "print2", "heating"]
        assert segs[2] == ("heating", {"printer": "ET4", "temp": 120, "target": 200}, 15.0)

    def test_ready_and_cooling_also_join_in_that_order(self):
        ms = [mach("a", "TTS", "printing", kind="laser", filename="x.nc"), mach("b", "ET4", hotend=(90, 0)),
              mach("c", "ET5", hotend=(200, 200)), mach("d", "ET6", hotend=(50, 200))]
        segs = self.play(ms, list("abcd"))
        assert [n for n, _, _ in segs] == ["print1", "print2", "heating", "ready", "cooling"]

    def test_many_working_keeps_its_groups_and_adds_the_heat(self):
        ms = [mach(c, c.upper(), "printing", filename="x.gc") for c in "abc"] + [mach("d", "ET4", hotend=(100, 200))]
        segs = self.play(ms, list("abcd"))
        assert [n for n, _, _ in segs] == ["many", "heating"]

    def test_cooling_peak_is_tracked_while_another_machine_works(self):
        mem = sm.Memory(started_at=0.0)
        self.play([mach("a", "TTS", "printing", kind="laser", filename="x.nc"), mach("b", "ET4", hotend=(200, 200))],
                  ["a", "b"], mem)
        segs = self.play([mach("a", "TTS", "printing", kind="laser", filename="x.nc"), mach("b", "ET4", hotend=(150, 0))],
                         ["a", "b"], mem)
        assert segs[-1][:2] == ("cooling", {"printer": "ET4", "temp": 150, "peak": 200})

    def test_nothing_extra_when_nobody_is_hot(self):
        segs = self.play([mach("a", "TTS", "printing", kind="laser", filename="x.nc"), mach("b", "ET4")], ["a", "b"])
        assert [n for n, _, _ in segs] == ["print1", "print2"]


class TestAlertsAndOffline:
    def play(self, ms, ids, mem=None):
        return sm.playlist(ms, ids, 100.0, mem or sm.Memory(started_at=0.0), CLOCK, None, 15.0, 60.0)

    def test_every_offline_machine_gets_its_view_and_work_is_not_hidden(self):
        ms = [mach("a", "Klipper ET4"), mach("b", "TTS 55 PRO", "printing", kind="laser", filename="x.nc"),
              mach("c", "CNC 3018", kind="cnc")]
        ms[0]["online"] = False
        ms[2]["online"] = False
        segs = self.play(ms, ["a", "b", "c"])
        assert [(n, d.get("printer")) for n, d, _ in segs] == [
            ("print1", "TTS"), ("print2", "TTS"), ("offline", "ET4"), ("offline", "CNC")]

    def test_offline_alone_alternates_between_machines_or_stays_fixed(self):
        ms = [mach("a", "ET4"), mach("b", "CNC 3018", kind="cnc")]
        ms[0]["online"] = False
        assert self.play(ms, ["a", "b"]) == [("offline", {"printer": "ET4"}, None)]
        ms[1]["online"] = False
        assert [(n, d["printer"], s) for n, d, s in self.play(ms, ["a", "b"])] == [("offline", "ET4", 15.0), ("offline", "CNC", 15.0)]

    def test_offline_joins_heat(self):
        ms = [mach("a", "ET4", hotend=(200, 200)), mach("b", "CNC", kind="cnc")]
        ms[1]["online"] = False
        assert [n for n, _, _ in self.play(ms, ["a", "b"])] == ["ready", "offline"]

    def test_all_errors_then_all_pauses_cover_everything(self):
        ms = [mach("a", "ET4", "error"), mach("b", "TTS", "paused", kind="laser"), mach("c", "CNC", "error", kind="cnc"),
              mach("d", "ET5", "printing", filename="x.gc")]
        segs = self.play(ms, list("abcd"))
        assert [(n, d["printer"]) for n, d, _ in segs] == [("error", "ET4"), ("error", "CNC"), ("pause", "TTS")]
        assert all(sec == 15.0 for _, _, sec in segs)

    def test_a_single_alert_stays_fixed(self):
        assert self.play([mach("a", "ET4", "error")], ["a"]) == [("error", {"printer": "ET4", "error": "ERROR"}, None)]


class TestPlaylistRestAndMessages:
    def play(self, ms, ids, message=None, seconds=None):
        return sm.playlist(ms, ids, 100.0, sm.Memory(started_at=0.0), CLOCK, message, 15.0, 60.0, seconds)

    def test_rest_alternates_normal_and_idle(self):
        segs = self.play([mach("a", "ET4"), mach("b", "TTS")], ["a", "b"])
        assert [(n, d["online" if n == "normal" else "total"], s) for n, d, s in segs] == [("normal", 2, 15.0), ("idle", 2, 15.0)]

    def test_no_machines_is_a_fixed_normal(self):
        assert self.play([mach("a", "ET4")], []) == [("normal", {"online": 0, "time": "17:42"}, None)]

    def test_heating_is_fixed(self):
        segs = self.play([mach("a", "ET4", hotend=(100, 200))], ["a"])
        assert segs == [("heating", {"printer": "ET4", "temp": 100, "target": 200}, None)]

    def test_short_message_is_a_screen_and_long_one_scrolls(self):
        short = self.play([mach("a", "ET4")], ["a"], "TODO BIEN", 120.0)
        assert short == [("special", {"msg": "TODO BIEN"}, 120.0)]
        long = self.play([mach("a", "ET4")], ["a"], "MATERIAL BAJO EN LA ENDER CAMBIA EL CARRETE", 120.0)
        assert long == [("scroll", {"text": "MATERIAL BAJO EN LA ENDER CAMBIA EL CARRETE"}, 120.0)]

    def test_error_still_beats_a_long_message(self):
        segs = self.play([mach("a", "ET4", "error")], ["a"], "MATERIAL BAJO EN LA ENDER CAMBIA EL CARRETE")
        assert segs[0][0] == "error"
