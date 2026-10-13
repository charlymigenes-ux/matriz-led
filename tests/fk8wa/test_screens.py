"""Fuente de píxeles y las 12 pantallas del FK-8Wa (sin panel)."""

import pytest
from PIL import Image

from ..conftest import fk8wa_module

pixelfont = fk8wa_module("pixelfont")
screens = fk8wa_module("screens")

NAMES = ["boot", "normal", "print1", "print2", "many", "pause", "error", "offline", "idle", "done", "special", "off"]

HARD_DATA = {
    "printer": "P2", "file": "carpeta/soporte_motor_nema17_v3_final_de_verdad.gcode", "pct": 100,
    "elapsed": "123:05:33", "error": "MCU 'mcu' shutdown: Timer too close, revisa el cableado",
    "msg": "Recuerda limpiar la boquilla de todas las impresoras antes de irte hoy, gracias",
    "online": 12, "total": 12, "time": "23:59",
    "machines": [{"label": "P1", "state": "error"}, {"label": "P10", "state": "paused"},
                 {"label": "P11", "state": "offline"}, {"label": "P12", "state": "printing"}],
}


def pixels(img):
    return {(x, y) for y in range(img.height) for x in range(img.width) if img.getpixel((x, y))}


class TestPixelFont:
    def test_glyph_tables_are_consistent(self):
        for font in (pixelfont.SMALL, pixelfont.TINY, pixelfont.BIG):
            assert font.has("?") and font.has(" ")

    def test_known_widths(self):
        assert pixelfont.text_width("NOPAL", pixelfont.BIG) == 34
        assert pixelfont.text_width("17:42", pixelfont.SMALL) == 25
        assert pixelfont.text_width("", pixelfont.SMALL) == 0

    def test_lowercase_and_accents(self):
        assert pixelfont.normalize("mañana revisión") == "MAÑANA REVISION"

    def test_deterministic(self):
        a, b = Image.new("1", (96, 16)), Image.new("1", (96, 16))
        pixelfont.draw_text(a, 2, 2, "HOLA 123", pixelfont.SMALL)
        pixelfont.draw_text(b, 2, 2, "HOLA 123", pixelfont.SMALL)
        assert pixels(a) == pixels(b) and pixels(a)

    def test_unknown_char_draws_question_mark(self):
        a, b = Image.new("1", (20, 8)), Image.new("1", (20, 8))
        pixelfont.draw_text(a, 0, 0, "€", pixelfont.SMALL)
        pixelfont.draw_text(b, 0, 0, "?", pixelfont.SMALL)
        assert pixels(a) == pixels(b)

    def test_clipped_at_image_border(self):
        img = Image.new("1", (10, 7))
        pixelfont.draw_text(img, 6, 0, "WWW", pixelfont.SMALL)   # no lanza al salirse
        assert max(x for x, _ in pixels(img)) == 9


class TestScreens:
    @pytest.mark.parametrize("name", NAMES)
    def test_size_and_mode(self, name):
        img = screens.render(name)
        assert img.size == (96, 16) and img.mode == "1" and pixels(img)

    @pytest.mark.parametrize("name", NAMES)
    def test_hard_data_stays_inside(self, name):
        """Textos largos, 100 %, horas de 3 cifras: nada lanza y todo queda en 96x16."""
        img = screens.render(name, HARD_DATA)
        assert img.size == (96, 16)

    def test_unknown_screen(self):
        with pytest.raises(ValueError):
            screens.render("nope")

    @pytest.mark.parametrize("raw, shown", [
        ("CUBO.gcode", "CUBO"), ("carpeta/sub/pieza.GC", "pieza"), ("C:\\a\\b.nc", "b"), ("sin_ext", "sin_ext"),
        (".gcode", ".gcode"), (None, ""),
    ])
    def test_display_file(self, raw, shown):
        assert screens.display_file(raw) == shown

    def test_print1_bar_never_touches_percentage(self):
        for pct in (0, 9, 72, 100):
            img = screens.render("print1", {"pct": pct})
            pct_left = 95 - pixelfont.text_width(f"{pct}%", pixelfont.SMALL) + 1
            gap = pct_left - 1
            assert not {(x, y) for x, y in pixels(img) if x == gap and y >= 9}, pct
            assert (pct_left - 4, 10) in pixels(img), pct  # la barra termina a 3 columnas del número

    def test_offline_shows_the_given_machine(self):
        """La referencia tenía "P2" fijo en el código."""
        a = screens.render("offline", {"printer": "P1"})
        b = screens.render("offline", {"printer": "P3"})
        assert pixels(a) != pixels(b)

    def test_many_draws_only_given_machines(self):
        two = screens.render("many", {"machines": [{"label": "P1", "state": "printing"},
                                                   {"label": "P2", "state": "printing"}]})
        assert not {p for p in pixels(two) if p[0] >= 70}

    def test_special_short_keeps_nopal_layout_long_uses_full_width(self):
        short = screens.render("special", {"msg": "TODO BIEN"})
        long = screens.render("special", {"msg": "Material bajo en la Ender, cambia el carrete"})
        assert (55, 8) in pixels(short)          # separador de la distribución NOPAL | mensaje
        assert (55, 8) not in pixels(long)

    def test_none_values_fall_back_to_defaults(self):
        assert pixels(screens.render("print2", {"pct": None})) == pixels(screens.render("print2"))
