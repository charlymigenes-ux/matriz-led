"""Contador visual y programa de varias páginas del FK-8Wa."""

import struct

import pytest

from ..conftest import fk8wa_module

timer = fk8wa_module("timer")
program = fk8wa_module("program")
screens = fk8wa_module("screens")
sm = fk8wa_module("state_machine")
config = fk8wa_module("config")

PRINT = [("print1", {"printer": "P1", "file": "CUBO", "pct": 72}, 15.0),
         ("print2", {"printer": "P1", "file": "CUBO", "pct": 72, "elapsed": "01:24"}, 15.0)]


def lit(img):
    return {(x, y) for y in range(img.height) for x in range(img.width) if img.getpixel((x, y))}


def header(data):
    return {"pages": struct.unpack_from("<H", data, 330)[0], "stay": struct.unpack_from("<H", data, 338)[0],
            "effect": (data[332], data[333]), "border": data[240]}


class TestRing:
    def test_ring_covers_the_whole_edge_once(self):
        path = timer.ring_path()
        assert len(path) == len(set(path)) == 220
        assert path[0] == (0, 0) and path[95] == (95, 0) and (95, 15) in path and path[-1] == (0, 1)

    @pytest.mark.parametrize("style", ["contorno", "barra"])
    def test_progress_grows_and_completes(self, style):
        pages, stay = timer.build_pages(PRINT, style)
        assert len(pages) == 16 and stay == 1875        # 8 páginas por vista, 15 s / 8
        edge = set(timer.bar_path() if style == "barra" else timer.ring_path())
        counts = [len(lit(p) & edge) for p in pages[:8]]
        assert counts == sorted(counts) and counts[-1] == len(edge)

    def test_inset_content_leaves_two_pixel_margin(self):
        img = timer.screen_image("print1", PRINT[0][1], "contorno")
        assert not {(x, y) for x, y in lit(img) if x < 2 or x > 93 or y < 2 or y > 13}

    def test_overlay_style_keeps_full_screens(self):
        img = timer.screen_image("print1", PRINT[0][1], "contorno_encima")
        assert lit(img) == lit(screens.render("print1", PRINT[0][1]))


class TestProgram:
    def test_progressive_program_is_static_multipage(self):
        h = header(timer.build_program(PRINT, "contorno"))
        assert h == {"pages": 16, "stay": 1875, "effect": program.STATIC, "border": h["border"]}

    def test_fixed_screen_uses_the_verified_single_page_program(self):
        image = timer.screen_image("normal", {"online": 3, "time": "17:42"}, "ninguno")
        data = timer.build_program([("normal", {"online": 3, "time": "17:42"}, None)], "ninguno")
        assert data == program.screen_program(image)

    def test_no_timer_one_page_per_view(self):
        h = header(timer.build_program(PRINT, "ninguno"))
        assert h["pages"] == 2 and h["stay"] == 15000

    def test_native_border(self):
        data = timer.build_program(PRINT, "marco_line_cw", "solid", 7)
        h = header(data)
        assert h["pages"] == 2 and h["stay"] == 15000 and h["border"] == program.BORDER_STYLES["line_cw"][0]
        assert struct.unpack_from("<H", data, 248)[0] == 7

    def test_long_message_stay_is_capped(self):
        h = header(timer.build_program([("special", {"msg": "HOLA"}, 24 * 3600.0)], "contorno"))
        assert h["stay"] == timer.MAX_STAY_MS

    def test_many_groups_rotate(self):
        groups = [("many", {"machines": [{"label": f"P{i}", "state": "printing"}]}, 15.0) for i in range(3)]
        h = header(timer.build_program(groups, "contorno"))
        assert h["pages"] == 15 and h["stay"] == 3000   # 5 por grupo

    @pytest.mark.parametrize("style", timer.STYLES)
    def test_every_style_builds_and_previews(self, style):
        assert timer.build_program(PRINT, style)
        assert timer.preview_gif(PRINT, style, scale=2)[:3] == b"GIF"


class TestPlaylist:
    def machine(self, mid, state, **job):
        return {"id": mid, "online": True, "status": {"state": state, "job": job or None}}

    def test_print_gives_both_views(self):
        from datetime import datetime

        mem = sm.Memory(started_at=0.0)
        segs = sm.playlist([self.machine("a", "printing", filename="CUBO.gcode", percent=50, elapsed_s=60)],
                           ["a"], 10.0, mem, datetime(2026, 1, 1, 9, 0))
        assert [(n, s) for n, _, s in segs] == [("print1", 15.0), ("print2", 15.0)]

    def test_many_more_than_three_rotates_in_groups(self):
        from datetime import datetime

        mem = sm.Memory(started_at=0.0)
        ms = [self.machine(c, "printing", filename="x.gc") for c in "abcde"]
        segs = sm.playlist(ms, list("abcde"), 10.0, mem, datetime(2026, 1, 1, 9, 0))
        assert [len(d["machines"]) for _, d, _ in segs] == [3, 2]

    def test_signature_ignores_remaining_time(self):
        a = [("special", {"msg": "X"}, 100.0)]
        b = [("special", {"msg": "X"}, 40.0)]
        assert sm.signature(a) == sm.signature(b)

    def test_config_validates_styles(self):
        assert config.validate({"timer_style": "marco_cw"})["timer_style"] == "marco_cw"
        with pytest.raises(config.ConfigError):
            config.validate({"timer_style": "arcoiris"})
        with pytest.raises(config.ConfigError):
            config.validate({"border_pattern": "zigzag"})


class TestTemperatureContour:
    def test_fraction_follows_the_phase(self):
        assert timer.temp_fraction("heating", {"temp": 100, "target": 200}) == 0.5
        assert timer.temp_fraction("ready", {"temp": 200, "target": 200}) == 1.0
        assert timer.temp_fraction("cooling", {"temp": 125, "peak": 200}) == 0.5
        assert timer.temp_fraction("cooling", {"temp": 40, "peak": 200}) == 0.0

    def test_one_page_that_changes_with_the_temperature(self):
        low = timer.build_pages([("heating", {"printer": "ET4", "temp": 50, "target": 200}, None)], "temp")
        high = timer.build_pages([("heating", {"printer": "ET4", "temp": 190, "target": 200}, None)], "temp")
        assert len(low[0]) == 1 and low[1] == 0
        assert sum(map(sum, [list(low[0][0].getdata())])) < sum(map(sum, [list(high[0][0].getdata())]))

    def test_program_is_the_verified_static_one_without_effect(self):
        seg = [("ready", {"printer": "ET4", "temp": 200, "target": 200}, None)]
        data = timer.build_program(seg, "temp")
        assert header(data)["effect"] == (1, 0)

    def test_temp_is_not_a_general_clock_style(self):
        assert "temp" not in timer.STYLES and "temp" in timer.SITUATION_STYLES
        with pytest.raises(config.ConfigError):
            config.validate({"timer_style": "temp"})


class TestSituationStyles:
    def test_defaults_for_the_new_situations(self):
        saved = config.validate({})["situation_styles"]
        assert saved == {"heating": "temp", "ready": "marco_cw", "cooling": "temp"}

    def test_each_situation_accepts_only_its_own_styles(self):
        ok = config.validate({"situation_styles": {"error": "marco_ccw", "printing": "barra", "ready": "ninguno"}})
        assert ok["situation_styles"]["error"] == "marco_ccw" and ok["situation_styles"]["printing"] == "barra"
        for situation, style in (("error", "barra"), ("pause", "temp"), ("printing", "temp"), ("heating", "contorno"),
                                 ("cooling", "arcoiris")):
            with pytest.raises(config.ConfigError):
                config.validate({"situation_styles": {situation: style}})
        with pytest.raises(config.ConfigError):
            config.validate({"situation_styles": {"marte": "ninguno"}})

    def test_empty_value_goes_back_to_the_general_style(self):
        saved = config.validate({"timer_style": "barra", "situation_styles": {"heating": ""}})
        assert "heating" not in saved["situation_styles"]
        assert config.style_for("heating", saved) == "barra" and config.style_for("ready", saved) == "marco_cw"
