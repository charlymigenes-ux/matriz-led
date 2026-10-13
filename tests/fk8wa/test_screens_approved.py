"""Las 12 pantallas deben coincidir píxel a píxel con la vista previa aprobada
(2026-10-11), igual en cualquier sistema operativo (CA2).

Para actualizar las imágenes a propósito, tras una nueva aprobación:
    FK8WA_UPDATE_FIXTURES=1 pytest tests/fk8wa/test_screens_approved.py
"""

import os
from pathlib import Path

import pytest
from PIL import Image

from ..conftest import fk8wa_module

screens = fk8wa_module("screens")
screens_inset = fk8wa_module("screens_inset")

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "fk8wa"
UPDATE = os.environ.get("FK8WA_UPDATE_FIXTURES") == "1"

CASES = {name: {} for name in screens.SCREENS}
CASES.update({
    "print1_largo_100": ("print1", {"printer": "P2", "file": "soporte_motor_nema17_v3_final.gcode", "pct": 100}),
    "print2_100_horas": ("print2", {"pct": 100, "elapsed": "12:05:33"}),
    "error_largo": ("error", {"printer": "P2", "error": "Termistor de cama desconectado"}),
    "special_largo": ("special", {"msg": "Material bajo en la Ender, cambia el carrete"}),
    "done_largo": ("done", {"printer": "P3", "file": "llavero_nopal_doble.gcode"}),
    "many_estados": ("many", {"machines": [{"label": "P1", "state": "error"}, {"label": "P2", "state": "paused"},
                                           {"label": "P3", "state": "offline"}]}),
    "normal_12": ("normal", {"online": 12, "time": "09:05"}),
    "special_acentos": ("special", {"msg": "Mañana revisión"}),
    # Nombres reales de máquina (hasta 4 letras) y láser/CNC.
    "print1_nombre_et4": ("print1", {"printer": "ET4", "file": "soporte_motor", "pct": 72}),
    "print2_laser": ("print2", {"printer": "TTS", "pct": 38, "kind": "laser", "elapsed": "--:--"}),
    "print2_cnc": ("print2", {"printer": "CNC", "pct": 55, "kind": "cnc", "elapsed": "--:--"}),
    "many_nombres": ("many", {"machines": [{"label": "ET4", "state": "printing"}, {"label": "TTS", "state": "printing"},
                                           {"label": "CNC", "state": "printing"}]}),
    "heating_et4": ("heating", {"printer": "ET4", "temp": 165, "target": 200}),
    "ready_et4": ("ready", {"printer": "ET4", "temp": 200, "target": 200}),
    "cooling_et4": ("cooling", {"printer": "ET4", "temp": 120, "peak": 200}),
    "cooling_casi_frio": ("cooling", {"printer": "TTS", "temp": 52, "peak": 210}),
    "error_cnc": ("error", {"printer": "CNC", "error": "ERROR"}),
    "offline_marl": ("offline", {"printer": "MARL"}),
})


def _render(key):
    case = CASES[key]
    return screens.render(key) if case == {} else screens.render(*case)


def _render_inset(key):
    """Versión achicada (92x12), centrada en 96x16 como la sube el panel."""
    case = CASES[key]
    inner = screens_inset.render(key) if case == {} else screens_inset.render(*case)
    full = Image.new("1", (96, 16), 0)
    full.paste(inner, (2, 2))
    return full


@pytest.mark.parametrize("key", sorted(CASES))
def test_matches_approved_preview(key):
    _check(key, _render(key), key)


@pytest.mark.parametrize("key", sorted(CASES))
def test_inset_matches_approved_preview(key):
    _check(key, _render_inset(key), f"inset_{key}")


def _check(key, img, name):
    path = FIXTURES / f"{name}.png"
    if UPDATE:
        FIXTURES.mkdir(parents=True, exist_ok=True)
        img.save(path)
    approved = Image.open(path).convert("1")
    assert approved.size == (96, 16)
    assert img.tobytes() == approved.tobytes(), f"{key} cambió respecto a la vista previa aprobada"
