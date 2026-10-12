"""Pruebas estáticas (por texto) de la pestaña "Panel LED del taller" (FK-8Wa).

No hay Node ni navegador en CI: se revisa el código fuente para asegurar
que la vista usa las rutas del backend, que dibuja LED por LED con la firma
antes de recargar los cuadros, que existe la tira de prioridad de 7 pasos,
que las claves i18n están en todos los idiomas del plugin y que el CSS
nuevo no trae colores fijos fuera de las variables del LED.
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


def _code_after_i18n():
    return JS[JS.index("\n    };", JS.index("const I18N = {")):]


def _function_source(name):
    start = JS.index(f"function {name}(")
    return JS[start:JS.index("\n    }\n", start)]


def _const_array(name):
    start = JS.index(f"const {name} = [")
    return JS[start:JS.index("\n    ];", start)]


# ── Rutas del backend ──

@pytest.mark.parametrize("route", [
    "/fk8wa/status", "/fk8wa/frames", "/fk8wa/config", "/fk8wa/test", "/fk8wa/message", "/fk8wa/brightness",
])
def test_js_uses_fk8wa_routes(route):
    assert route in JS


def test_frames_with_and_without_params():
    assert "api('/fk8wa/frames')" in JS                       # lo que tiene el panel ahora
    assert "/fk8wa/frames?style=${" in JS                     # mini paneles del reloj
    assert "/fk8wa/frames?screen=${" in JS                    # galería de las 12 pantallas


def test_methods_and_payloads():
    assert re.search(r"'/fk8wa/config',\s*\{\s*method: 'PUT'", JS)
    assert re.search(r"'/fk8wa/brightness',\s*\{\s*method: 'POST'", JS)
    assert re.search(r"'/fk8wa/test',\s*\{\s*method: 'POST'", JS)
    assert re.search(r"'/fk8wa/message',\s*\{\s*method: 'POST'", JS)
    assert re.search(r"'/fk8wa/message',\s*\{\s*method: 'DELETE'", JS)
    assert "announcement_id: announcementId" in JS
    # El estilo del reloj se guarda con la config completa.
    assert "...fk.config, ...overrides" in JS
    assert "timer_style:" in JS


def test_old_gif_preview_is_gone():
    assert "/fk8wa/preview" not in JS
    assert "mled-fk-preview" not in JS


# ── Lo que se dibuja ──

def test_led_by_led_canvas():
    assert "function fkDraw(" in JS and "ctx.arc(" in JS
    assert ">> 3)] >> (x & 7)) & 1" in JS      # 1 bit por LED, bit menos significativo primero
    assert "stay_ms" in JS and "pages" in JS


def test_frames_reload_only_when_signature_changes():
    tick = _function_source("fkTick")
    assert "fkMaybeReloadFrames" not in tick and "api(" not in tick
    reload_ = _function_source("fkMaybeReloadFrames")
    assert re.search(r"!force && sig === fk\.framesSig\) return", reload_)
    signature = _function_source("fkFramesSignature")
    for part in ("views", "current", "last_sent_at"):
        assert part in signature
    # /status se consulta en cada ciclo; /frames solo tras la comparación.
    assert "fkRefreshStatus()" in tick


def test_polling_and_animation_only_while_visible():
    assert "visibilityState" in JS
    assert "getClientRects().length" in JS
    assert "function fkStopPolling" in JS and "fkPauseAnimations()" in _function_source("fkStopPolling")
    assert "prefers-reduced-motion" in JS and "prefers-reduced-motion" in CSS
    unmount = JS[JS.index("function unmount()"):]
    assert "fkStopPolling()" in unmount
    assert "removeEventListener('visibilitychange', fkOnVisibilityChange)" in unmount


def test_priority_strip_has_seven_steps():
    steps = re.findall(r"\['([a-z]+)', '[^']+', 'fkPrio\w+', 'fkPrio\w+Tip'\]", _const_array("FK_PRIORITY"))
    assert steps == ["error", "pause", "offline", "special", "done", "printing", "normal"]
    assert "status?.priority" in JS or "s.priority" in JS
    assert "data-fk-prio" in JS


def test_connection_pill_covers_all_states():
    block = _const_array("FK_CONN") if "const FK_CONN = [" in JS else JS[JS.index("const FK_CONN = {"):JS.index("};", JS.index("const FK_CONN = {"))]
    for state in ("ok", "unreachable", "size_mismatch", "disabled"):
        assert re.search(rf"\b{state}:", block), state


def test_size_mismatch_warning_exists():
    assert "size_mismatch" in JS
    es = _i18n_blocks()["es"]
    assert "fkSizeMismatch:" in es
    assert "FKShow" in es and "96x16" in es


def test_message_countdown_uses_expires_at():
    assert "message.expires_at" in JS
    assert "fkMsgRemovesIn" in JS
    assert "FK_MINUTES = [1, 5, 15, 60]" in JS


# ── Reloj de cada vista ──

EXACT_STYLES = ["contorno", "contorno_encima", "barra", "ninguno", "marco"]
BORDER_STYLES = ["marco_fixed", "marco_random", "marco_cw", "marco_ccw", "marco_flash", "marco_flash_cw",
                 "marco_flash_ccw", "marco_line_cw", "marco_line_ccw", "marco_dline_cw", "marco_dline_ccw"]


def test_style_cards_and_borders():
    assert re.findall(r"\['([a-z_]+)', 'fk", _const_array("FK_STYLE_CARDS")) == EXACT_STYLES
    assert re.findall(r"\['([a-z_]+)', 'fk", _const_array("FK_BORDERS")) == BORDER_STYLES
    patterns = re.findall(r"\['([a-z0-9]+)', 'fk", _const_array("FK_PATTERNS"))
    assert patterns == ["dash", "solid", "dot", "dot1"]
    for field in ("border_pattern:", "border_speed:"):
        assert field in JS
    assert 'min="1" max="60"' in JS


def test_gallery_has_all_twelve_screens():
    line = re.search(r"const FK_SCREENS = \[([^\]]*)\];", JS).group(1)
    screens = re.findall(r"'([a-z0-9]+)'", line)
    assert screens == ["boot", "normal", "print1", "print2", "many", "pause", "error", "offline", "idle", "done", "special", "off"]


def test_operator_is_read_only():
    assert "/api/auth/me" in JS
    assert "data-fk-admin-input" in JS and "data-fk-admin-only" in JS
    assert "if (!fk.isAdmin" in JS or "if (!fk.isAdmin)" in JS


def test_server_text_is_escaped():
    # Mensaje vigente y nombres de máquinas nunca entran crudos al HTML.
    assert "strong').textContent = message.text" in JS
    assert "esc(label)" in JS


# ── i18n ──

def test_fk_i18n_keys_in_every_language():
    blocks = _i18n_blocks()
    assert set(LANGS) <= set(blocks)
    reference = _fk_keys(blocks["es"])
    assert {"fkTab", "fkTitle", "fkSizeMismatch", "fkNowTitle", "fkWhyTitle", "fkMsgTitle", "fkTimerTitle"} <= reference
    for lang in LANGS:
        assert _fk_keys(blocks[lang]) == reference, lang


def test_every_fk_key_used_in_js_is_defined():
    code = _code_after_i18n()
    used = set(re.findall(r"'(fk[A-Z]\w*)'", code)) | set(re.findall(r"tr\(`?(fk[A-Z]\w*)", code))
    blocks = _i18n_blocks()
    for lang in LANGS:
        assert used <= _fk_keys(blocks[lang]), (lang, used - _fk_keys(blocks[lang]))


def test_help_bubble_on_every_section():
    helps = set(re.findall(r"'(fk\w*Help)'", _code_after_i18n()))
    assert len(helps) >= 10, helps
    assert 'role="tooltip"' in JS and 'aria-expanded="false"' in JS


# ── Reglas (casilla "También mostrar en el panel") ──

def test_rules_send_fk8wa_on_save():
    source = _function_source("renderSuggestions")
    posts = re.findall(r"api\('/rules', \{ method: 'POST', body: JSON\.stringify\(\{[^}]*\}\)", source)
    assert len(posts) >= 2
    assert all("fk8wa" in post for post in posts)
    assert re.search(r"method: 'PUT', body: JSON\.stringify\(\{ fk8wa: checkbox\.checked \}\)", source)
    assert "rule.fk8wa" in JS
    assert "tr('fkRuleCheckbox')" in source


def test_rule_checkbox_key_in_every_language():
    blocks = _i18n_blocks()
    for lang in LANGS:
        assert "fkRuleCheckbox:" in blocks[lang], lang
        assert "fkRuleBadgeTitle:" in blocks[lang], lang


# ── CSS ──

def _fk_css_blocks():
    spans = [
        ("/* ── Panel FK-8Wa ──\n", "/* ── fin Panel FK-8Wa ── */"),
        ("/* ── Panel FK-8Wa: casilla y marca en las reglas ── */", "/* ── fin Panel FK-8Wa: reglas ── */"),
    ]
    for start_marker, end_marker in spans:
        start = CSS.index(start_marker)
        yield CSS[start + len(start_marker):CSS.index(end_marker)]


def test_led_colors_declared_once_as_variables():
    for name in ("--mled-fk-led-on", "--mled-fk-led-off", "--mled-fk-led-bg"):
        assert len(re.findall(rf"^\s*{name}:", CSS, re.M)) == 1, name
    assert "255, 255, 255" in CSS     # LED blanco


def test_new_css_has_no_fixed_colors_outside_led_variables():
    for block in _fk_css_blocks():
        block = re.sub(r"/\*.*?\*/", "", block, flags=re.S)
        block = re.sub(r"^\s*--mled-fk-led-(?:on|off|bg):[^;]*;", "", block, flags=re.M)
        assert block.strip()
        assert not re.search(r"#[0-9a-fA-F]{3,8}\b", block)
        assert not re.search(r"\b(?:rgba?|hsla?)\(", block)


def test_css_is_pixelated_responsive_and_accessible():
    assert "image-rendering: pixelated" in CSS
    assert "@media (prefers-reduced-motion: reduce)" in CSS
    assert ":focus-visible" in CSS
