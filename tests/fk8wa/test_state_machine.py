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
        assert pick(ms, message="hola") == ("error", {"printer": "P2", "error": "ERROR"})

    def test_first_error_by_order(self):
        assert pick([m("a", "error"), m("b", "error"), m("c")])[1]["printer"] == "P1"

    def test_pause_over_offline_and_message(self):
        assert pick([m("a", online=False), m("b", "paused"), m("c")], message="x") == ("pause", {"printer": "P2"})

    def test_offline_over_message(self):
        assert pick([m("a"), m("b"), m("c", online=False)], message="x") == ("offline", {"printer": "P3"})

    def test_message_over_printing(self):
        assert pick([m("a", "printing", filename="x.gcode")], message="TODO BIEN") == ("special", {"msg": "TODO BIEN"})

    def test_idle_when_all_quiet(self):
        assert pick([m("a", "idle"), m("b", "standby"), m("c", "complete")]) == ("idle", {"total": 3, "time": "17:42"})

    def test_normal_otherwise(self):
        assert pick([m("a", "idle"), m("b", "heating"), m("c", "idle")]) == ("normal", {"online": 3, "time": "17:42"})

    def test_no_machines_selected(self):
        assert pick([m("a")], ids=[]) == ("normal", {"online": 0, "time": "17:42"})

    def test_missing_machine_is_ignored(self):
        assert pick([m("a", "printing", filename="x.gc", percent=5)], ids=["zz", "a"])[1]["printer"] == "P2"
        assert sm.missing_ids([m("a")], ["zz", "a"]) == ["zz"]


class TestPrinting:
    def test_one_active_alternates_every_15s(self):
        mem = sm.Memory(started_at=0.0)
        ms = [m("a", "printing", filename="CUBO.gcode", percent=72.4, elapsed=5040), m("b"), m("c")]
        seen = [sm.select(ms, IDS, t, mem, CLOCK)[0] for t in (100, 110, 115, 129, 130, 145)]
        assert seen == ["print1", "print1", "print2", "print2", "print1", "print2"]
        assert sm.select(ms, IDS, 116, mem, CLOCK) == (
            "print2", {"printer": "P1", "file": "CUBO.gcode", "pct": 72, "elapsed": "01:24"})

    def test_missing_progress_data(self):
        mem = sm.Memory(started_at=0.0)
        ms = [m("a", "printing", filename="x.gc")]
        sm.select(ms, ["a"], 0, mem, CLOCK)
        assert sm.select(ms, ["a"], 16, mem, CLOCK)[1] == {"printer": "P1", "file": "x.gc", "pct": 0, "elapsed": "--:--"}

    def test_many_shows_only_active_up_to_3(self):
        ms = [m(i, "printing", filename="f.gc") for i in "abcd"] + [m("e")]
        name, data = pick(ms, ids=list("eabcd"))
        assert name == "many"
        assert [x["label"] for x in data["machines"]] == ["P2", "P3", "P4"]


class TestDone:
    def test_done_shows_60s_then_back(self):
        mem = sm.Memory(started_at=0.0)
        sm.select([m("a", "printing", filename="CUBO.gcode", percent=99)], ["a"], 0, mem, CLOCK)
        assert sm.select([m("a", "complete")], ["a"], 10, mem, CLOCK) == ("done", {"printer": "P1", "file": "CUBO.gcode"})
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
