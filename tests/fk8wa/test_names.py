"""Nombre corto de las máquinas para el panel (hasta 4 caracteres)."""

import pytest

from ..conftest import fk8wa_module

names = fk8wa_module("names")


@pytest.mark.parametrize("real, short", [
    ("Klipper ET4", "ET4"), ("TTS 55 PRO", "TTS"), ("CNC 3018", "CNC"), ("Impresora Marlin", "MARL"),
    ("Ender 3 V2", "ENDE"), ("Bambu A1", "A1"), ("Sculpfun S9", "SCUL"), ("Máquina láser Ñandú", "NAND"),
    ("   ", "?"), ("ñ", "N"),
])
def test_short_name_from_real_name(real, short):
    assert names.short_name(real) == short


def test_defaults_do_not_repeat():
    result = names.defaults([{"id": "a", "name": "Klipper ET4"}, {"id": "b", "name": "Bambu ET4"}, {"id": "c", "name": "TTS"}])
    assert result == {"a": "ET4", "b": "ET42", "c": "TTS"}


@pytest.mark.parametrize("value, ok", [("et4", "ET4"), (" tts ", "TTS"), ("A-1", "A-1"), ("ñan", "NAN")])
def test_validate_accepts(value, ok):
    assert names.validate(value) == ok


@pytest.mark.parametrize("value", ["", "   ", "###", "ABCDE", "ñandú"])
def test_validate_rejects(value):
    with pytest.raises(ValueError):
        names.validate(value)
