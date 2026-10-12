"""Pruebas estáticas (por texto) de la pestaña "Panel FK-8Wa" del frontend.

No hay Node ni navegador en CI: se revisa el código fuente para asegurar
que la vista usa las rutas del backend, que existe el aviso de tamaño
incorrecto, que las claves i18n nuevas están en todos los idiomas del
plugin y que el CSS nuevo no trae colores fijos.
"""

import re
from pathlib import Path

import pytest

FRONTEND = Path(__file__).resolve().parents[2] / "frontend"
JS = (FRONTEND / "matriz-led.js").read_text(encoding="utf-8")
CSS = (FRONTEND / "matriz-led.css").read_text(encoding="utf-8")

LANGS = ["es", "en", "de", "fr", "pt-BR"]


def _i18n_blocks():
    """{idioma: texto de su diccionario} dentro de `const I18N = {...};`."""
    start = JS.index("const I18N = {")
    end = JS.index("\n    };", start)
    body = JS[start:end]
    headers = list(re.finditer(r"^ {8}(?:'([\w-]+)'|(\w+)): \{$", body, re.M))
    blocks = {}
    for index, match in enumerate(headers):
        stop = headers[index + 1].start() if index + 1 < len(headers) else len(body)
        blocks[match.group(1) or match.group(2)] = body[match.end():stop]
    return blocks


def _fk_keys(block):
    return set(re.findall(r"^\s*(fk[A-Z]\w*):", block, re.M))


@pytest.mark.parametrize("route", ["/fk8wa/status", "/fk8wa/preview", "/fk8wa/config", "/fk8wa/test", "/fk8wa/message"])
def test_js_uses_fk8wa_routes(route):
    assert route in JS


def test_js_uses_admin_methods_and_brightness():
    assert re.search(r"'/fk8wa/config',\s*\{\s*method: 'PUT'", JS)
    assert "/fk8wa/brightness" in JS
    assert re.search(r"'/fk8wa/message',\s*\{\s*method: 'DELETE'", JS)


def test_size_mismatch_warning_exists():
    assert "size_mismatch" in JS
    es = _i18n_blocks()["es"]
    assert "fkSizeMismatch:" in es
    assert "FKShow" in es and "96x16" in es


def test_fk_i18n_keys_in_every_language():
    blocks = _i18n_blocks()
    assert set(LANGS) <= set(blocks)
    reference = _fk_keys(blocks["es"])
    assert {"fkTab", "fkSizeMismatch", "fkNote", "fkStateOk"} <= reference
    for lang in LANGS:
        assert _fk_keys(blocks[lang]) == reference, lang


def test_every_fk_key_used_in_js_is_defined():
    used = set(re.findall(r"tr\('(fk[A-Z]\w*)'", JS))
    used |= set(re.findall(r"'(fk(?:Screen|State)[A-Z]\w*)'", JS))
    assert used <= _fk_keys(_i18n_blocks()["es"])


def test_preview_polling_only_while_visible():
    assert "visibilityState" in JS
    assert "fkStopPolling" in JS


@pytest.mark.parametrize("start_marker, end_marker", [
    ("/* ── Panel FK-8Wa ──", "/* ── fin Panel FK-8Wa ── */"),
    ("/* ── Panel FK-8Wa: casilla y marca en las reglas ── */", "/* ── fin Panel FK-8Wa: reglas ── */"),
])
def test_new_css_has_no_fixed_colors(start_marker, end_marker):
    start = CSS.index(start_marker)
    end = CSS.index(end_marker)
    block = re.sub(r"/\*.*?\*/", "", CSS[start + len(start_marker):end], flags=re.S)
    assert block.strip()
    assert not re.search(r"#[0-9a-fA-F]{3,8}\b", block)
    assert not re.search(r"\b(?:rgba?|hsla?)\(", block)


def test_preview_is_pixelated():
    assert "image-rendering: pixelated" in CSS


def _render_suggestions_source():
    start = JS.index("function renderSuggestions()")
    return JS[start:JS.index("\n    }\n", start)]


def test_rules_send_fk8wa_on_save():
    source = _render_suggestions_source()
    # Creación de ambas reglas (POST /rules) con el campo fk8wa.
    posts = re.findall(r"api\('/rules', \{ method: 'POST', body: JSON\.stringify\(\{[^}]*\}\)", source)
    assert len(posts) >= 2
    assert all("fk8wa" in post for post in posts)
    # Edición (PUT /rules/<id>) también lo manda, y la casilla lo refleja.
    assert re.search(r"method: 'PUT', body: JSON\.stringify\(\{ fk8wa: checkbox\.checked \}\)", source)
    assert "rule.fk8wa" in JS
    assert "tr('fkRuleCheckbox')" in source


def test_rule_checkbox_key_in_every_language():
    blocks = _i18n_blocks()
    for lang in LANGS:
        assert "fkRuleCheckbox:" in blocks[lang], lang
        assert "fkRuleBadgeTitle:" in blocks[lang], lang
