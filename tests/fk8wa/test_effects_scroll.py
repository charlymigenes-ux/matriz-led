"""Catálogo de efectos, configuración nueva y texto corrido del FK-8Wa."""

import struct

import pytest

from ..conftest import fk8wa_module

effects = fk8wa_module("effects")
config = fk8wa_module("config")
scrolltext = fk8wa_module("scrolltext")
program = fk8wa_module("program")


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    monkeypatch.setattr(effects, "TESTED_PATH", tmp_path / "tested.json")
    monkeypatch.setattr(config, "CONFIG_PATH", tmp_path / "fk8wa.json")


class TestCatalog:
    def test_36_effects_in_8_families(self):
        assert len(effects.CATALOG) == 36
        assert {v[3] for v in effects.CATALOG.values()} == {"Desplazar", "Entrar", "Cubrir", "Persiana", "Sombra",
                                                            "Parpadeo", "Extender", "Sector"}

    def test_types_and_subtypes_follow_the_protocol(self):
        pairs = {(v[0], v[1]) for v in effects.CATALOG.values()}
        assert len(pairs) == 36 and {t for t, _ in pairs} == {2, 3, 4, 5, 6, 7, 19, 21}
        assert effects.effect("scroll_l") == (2, 5) and effects.effect("sector_4") == (21, 4)

    def test_verified_ones_match_protocol_md(self):
        verified = {k for k, v in effects.CATALOG.items() if v[4]}
        assert verified == {"scroll_l1", "scroll_r", "scroll_u", "scroll_d", "scroll_l", "movein_1", "movein_3",
                            "cover_1", "cover_5", "blind_1", "blind_2", "shadow_1", "flash_1", "flash_2",
                            "extend_1", "sector_1"}

    def test_unknown_effect_is_none(self):
        assert effects.effect("nope") is None and effects.effect(None) is None and effects.effect("") is None

    def test_every_screen_belongs_to_a_situation(self):
        screens = fk8wa_module("screens")
        assert {n for n in screens.SCREENS} - {"boot", "off"} <= set(effects.SITUATION_OF)

    def test_marking_tested_persists(self):
        assert not effects.listing()[effects.listing().index(next(e for e in effects.listing() if e["id"] == "movein_4"))]["tested"]
        effects.mark_tested("movein_4")
        assert next(e for e in effects.listing() if e["id"] == "movein_4")["tested"] is True
        with pytest.raises(ValueError):
            effects.mark_tested("nope")


class TestConfigNewKeys:
    def test_defaults(self):
        cfg = config.validate({})
        assert cfg["short_names"] == {} and cfg["scroll_dir"] == "l1" and cfg["scroll_speed"] == 5
        assert set(cfg["effects"]) == set(effects.SITUATIONS) and not any(cfg["effects"].values())

    def test_valid_values_roundtrip(self):
        saved = config.save({"short_names": {"klipper:7125": "et4"}, "scroll_dir": "u", "scroll_speed": 8,
                             "effects": {"error": "flash_1", "special": "movein_4", "pause": None}})
        assert saved["short_names"] == {"klipper:7125": "ET4"} and saved["effects"]["error"] == "flash_1"
        assert config.load() == saved

    @pytest.mark.parametrize("payload, message", [
        ({"short_names": {"a": "DEMASIADO"}}, "hasta 4"),
        ({"short_names": {"a": ""}}, "vacío"),
        ({"short_names": []}, "no son válidos"),
        ({"effects": {"error": "arcoiris"}}, "desconocido"),
        ({"effects": {"inventada": "flash_1"}}, "Situación"),
        ({"effects": []}, "no son válidos"),
        ({"scroll_dir": "x"}, "Dirección"),
        ({"scroll_speed": 11}, "scroll_speed"),
    ])
    def test_invalid(self, payload, message):
        with pytest.raises(config.ConfigError, match=message):
            config.validate(payload)


def header(data):
    return {"pages": struct.unpack_from("<H", data, 330)[0], "effect": (data[332], data[333]),
            "speed": struct.unpack_from("<H", data, program.SPEED_OFFSET)[0],
            "stay": struct.unpack_from("<H", data, 338)[0]}


class TestScroll:
    LONG = "MATERIAL BAJO EN LA ENDER, CAMBIA EL CARRETE"

    def test_strip_is_16_rows_with_double_size_letters(self):
        image = scrolltext.strip("AB")
        assert image.height == 16 and image.width == 2 * (5 + 1 + 5)

    @pytest.mark.parametrize("direction, effect", [("l1", (2, 1)), ("r", (2, 2)), ("u", (2, 3)), ("d", (2, 4)), ("l", (2, 5))])
    def test_each_direction_uses_its_scroll_effect(self, direction, effect):
        assert header(scrolltext.build_program(self.LONG, direction, 5))["effect"] == effect

    def test_horizontal_is_one_wide_strip_in_pages(self):
        h = header(scrolltext.build_program(self.LONG, "l1", 5))
        assert h["pages"] == -(-scrolltext.strip(self.LONG).width // 96) and h["stay"] == 0

    def test_vertical_uses_pages_of_two_lines(self):
        h = header(scrolltext.build_program(self.LONG, "u", 5))
        assert h["pages"] == len(scrolltext.pages(self.LONG)) and h["stay"] == scrolltext.hold_ms(5)
        for page in scrolltext.pages(self.LONG):
            assert page.size == (96, 16)

    def test_speed_levels(self):
        assert scrolltext.update_time(1) > scrolltext.update_time(5) > scrolltext.update_time(10)
        assert scrolltext.update_time(0) == scrolltext.update_time(1) and scrolltext.update_time(99) == scrolltext.update_time(10)
        assert header(scrolltext.build_program(self.LONG, "l1", 10))["speed"] == scrolltext.update_time(10)

    def test_lines_never_exceed_the_panel(self):
        from ..conftest import fk8wa_module as mod
        pf = mod("pixelfont")
        for row in scrolltext.lines("ESTO ES UN MENSAJE MUY LARGO " * 6):
            assert pf.text_width(row, pf.SMALL) <= 92

    def test_text_is_capped_and_accents_are_handled(self):
        assert scrolltext.build_program("á" * 500, "l1", 5)
        assert scrolltext.build_program("mañana revisión", "d", 5)

    def test_unknown_direction(self):
        with pytest.raises(ValueError):
            scrolltext.build_program("x", "z", 5)


class TestEveryEffectBuilds:
    SEGMENTS = {
        "fija": [("error", {"printer": "ET4", "error": "ERROR"}, None)],
        "con_tiempo": [("print1", {"printer": "ET4", "file": "soporte", "pct": 72}, 15.0),
                       ("print2", {"printer": "ET4", "pct": 72, "elapsed": "01:24"}, 15.0)],
    }

    @pytest.mark.parametrize("effect_id", sorted(effects.CATALOG))
    @pytest.mark.parametrize("style", ["ninguno", "marco_cw", "contorno", "barra", "contorno_encima"])
    @pytest.mark.parametrize("which", ["fija", "con_tiempo"])
    def test_program_is_consistent(self, effect_id, style, which):
        runner = fk8wa_module("runner")
        cfg = {**config.DEFAULTS, "timer_style": style, "effects": {**config.DEFAULTS["effects"],
                                                                    "error": effect_id, "printing": effect_id}}
        data = runner.make_program(self.SEGMENTS[which], cfg)
        assert struct.unpack_from("<I", data, 40)[0] == len(data)
        chosen = runner.effect_for(self.SEGMENTS[which], cfg)
        blocked = style in ("contorno", "barra", "contorno_encima") and which == "con_tiempo"
        assert (chosen is None) == blocked
        expected = (data[332], data[333])
        if blocked:
            assert expected == program.STATIC
        elif which == "fija" or chosen:
            assert expected == effects.effect(effect_id)

    def test_effect_is_only_the_entry_one(self):
        """Nada de efectos de salida: el programa solo trae tipo y subtipo de entrada."""
        runner = fk8wa_module("runner")
        data = runner.make_program(self.SEGMENTS["fija"], {**config.DEFAULTS, "effects": {**config.DEFAULTS["effects"], "error": "cover_5"}})
        assert (data[332], data[333]) == (3, 5)
