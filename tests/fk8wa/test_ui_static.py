"""Pruebas estáticas (por texto) de la pestaña "Panel LED del taller" (FK-8Wa)
y de las fichas de pestañas del plugin.

No hay Node ni navegador en CI: se revisa el código fuente para asegurar
que la vista usa las rutas del backend, que dibuja LED por LED con la firma
antes de recargar los cuadros, que existe la tira de prioridad de 8 pasos,
que el reloj de contorno bloquea los efectos, que las claves i18n están en
todos los idiomas del plugin y que el CSS nuevo no trae colores fijos fuera
de las variables del LED.
"""

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
FRONTEND = ROOT / "frontend"
JS = (FRONTEND / "matriz-led.js").read_text(encoding="utf-8")
CSS = (FRONTEND / "matriz-led.css").read_text(encoding="utf-8")
EFFECTS_PY = (ROOT / "backend" / "services" / "fk8wa" / "effects.py").read_text(encoding="utf-8")

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


def _keys(block, prefix="fk"):
    return set(re.findall(rf"^\s*({prefix}[A-Za-z0-9_]*):", block, re.M))


def _code_after_i18n():
    return JS[JS.index("\n    };", JS.index("const I18N = {")):]


def _function_source(name):
    start = JS.index(f"function {name}(")
    return JS[start:JS.index("\n    }\n", start)]


def _const_array(name):
    start = JS.index(f"const {name} = [")
    return JS[start:JS.index("\n    ];", start)]


def _backend_effect_ids():
    ids = re.findall(r'^\s+"(\w+)": \(\d+, \d+, "', EFFECTS_PY, re.M)
    assert len(ids) == 36
    return ids


def _css_rules():
    """[(selector, cuerpo)] de las reglas de primer nivel del CSS, sin comentarios."""
    text = re.sub(r"/\*.*?\*/", "", CSS, flags=re.S)
    return [(m.group(1).strip(), m.group(2)) for m in re.finditer(r"([^{}@]+)\{([^{}]*)\}", text)]


# ── Rutas del backend ──

@pytest.mark.parametrize("route", [
    "/fk8wa/status", "/fk8wa/frames", "/fk8wa/config", "/fk8wa/test", "/fk8wa/message", "/fk8wa/brightness",
    "/fk8wa/effects", "/fk8wa/effects/test", "/fk8wa/machines", "/fk8wa/scroll-preview",
])
def test_js_uses_fk8wa_routes(route):
    assert route in JS


def test_frames_with_and_without_params():
    assert "api('/fk8wa/frames')" in JS                       # lo que tiene el panel ahora
    assert "/fk8wa/frames?style=${" in JS                     # mini paneles del reloj
    assert "/fk8wa/frames?screen=${" in JS                    # galería de las 13 pantallas
    assert "/fk8wa/frames?screen=normal" in JS and "/fk8wa/frames?screen=print1" in JS   # cuadros A y B


def test_methods_and_payloads():
    assert re.search(r"'/fk8wa/config',\s*\{\s*method: 'PUT'", JS)
    assert re.search(r"'/fk8wa/brightness',\s*\{\s*method: 'POST'", JS)
    assert re.search(r"'/fk8wa/test',\s*\{\s*method: 'POST'", JS)
    assert re.search(r"'/fk8wa/effects/test',\s*\{\s*method: 'POST'", JS)
    assert re.search(r"'/fk8wa/message',\s*\{\s*method: 'POST'", JS)
    assert re.search(r"'/fk8wa/message',\s*\{\s*method: 'DELETE'", JS)
    assert "announcement_id: announcementId" in JS
    # La config se guarda completa con los campos cambiados.
    assert "...fk.config, ...overrides" in JS
    for field in ("timer_style:", "short_names:", "effects:", "scroll_dir:", "scroll_speed:", "border_pattern:", "border_speed:"):
        assert field in JS, field


def test_machines_use_the_fk8wa_listing_and_short_names():
    assert "short_auto" in JS
    assert "delete next[id]" in JS                  # igual al automático: se quita de short_names
    assert 'maxlength="4"' in JS
    assert "A-Z0-9" in JS
    for kind in ("printer", "laser", "cnc"):
        assert kind in _code_after_i18n()
    assert "P${index + 1}" not in JS                # ya no existen P1, P2...


def test_old_gif_preview_is_gone():
    assert "/fk8wa/preview" not in JS
    assert "mled-fk-preview" not in JS


# ── Lo que se dibuja ──

def test_led_by_led_canvas():
    assert "function fkDraw(" in JS and "ctx.arc(" in JS
    assert ">> 3)] >> (x & 7)) & 1" in JS      # 1 bit por LED, bit menos significativo primero
    assert "stay_ms" in JS and "pages" in JS


def test_effect_engine_covers_every_family():
    engine = _function_source("fkEffectFrame")
    for code in (2, 3, 4, 5, 6, 7, 19, 21):
        assert re.search(rf"case {code}:", engine), code
    assert "FK_EFFECT_MS = 1100" in JS
    assert "fkEffectFrame(effect.type, effect.subtype" in JS      # transición con el efecto del servidor


def test_frames_reload_only_when_signature_changes():
    tick = _function_source("fkTick")
    assert "fkMaybeReloadFrames" not in tick and "api(" not in tick
    reload_ = _function_source("fkMaybeReloadFrames")
    assert re.search(r"!force && sig === fk\.framesSig\) return", reload_)
    assert "fkMainStart(data" in reload_            # transición desde el último cuadro dibujado
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
    assert "fkStopPolling()" in unmount and "stopTabCards()" in unmount
    assert "removeEventListener('visibilitychange', fkOnVisibilityChange)" in unmount
    # Las tarjetas animadas solo dibujan cuando se ven.
    assert "fkOnScreen(card.canvas)" in JS and "fkOnScreen(mini.canvas)" in JS


def test_priority_strip_has_eight_steps():
    steps = re.findall(r"\['([a-z]+)', '[^']+', 'fkPrio\w+', 'fkPrio\w+Tip'\]", _const_array("FK_PRIORITY"))
    assert steps == ["error", "pause", "offline", "special", "done", "printing", "heating", "normal"]
    assert "s.priority" in JS
    assert "data-fk-prio" in JS


def test_connection_pill_covers_all_states():
    block = JS[JS.index("const FK_CONN = {"):JS.index("};", JS.index("const FK_CONN = {"))]
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


# ── Reloj de cada vista y efectos ──

EXACT_STYLES = ["contorno", "contorno_encima", "barra", "ninguno", "marco"]
BORDER_STYLES = ["marco_fixed", "marco_random", "marco_cw", "marco_ccw", "marco_flash", "marco_flash_cw",
                 "marco_flash_ccw", "marco_line_cw", "marco_line_ccw", "marco_dline_cw", "marco_dline_ccw"]


def test_style_cards_and_borders():
    assert re.findall(r"\['([a-z_]+)', 'fk", _const_array("FK_STYLE_CARDS")) == EXACT_STYLES
    assert re.findall(r"\['([a-z_]+)', 'fk", _const_array("FK_BORDERS")) == BORDER_STYLES
    patterns = re.findall(r"\['([a-z0-9]+)', 'fk", _const_array("FK_PATTERNS"))
    assert patterns == ["dash", "solid", "dot", "dot1"]
    assert 'min="1" max="60"' in JS


def test_contorno_encima_blocks_effects_like_the_other_exact_clocks():
    line = re.search(r"const FK_CLOCK_BLOCKS = \[([^\]]*)\];", JS).group(1)
    assert re.findall(r"'([a-z_]+)'", line) == ["contorno", "contorno_encima", "barra"]
    sit = _function_source("fkSyncSit")
    assert "fkClockBlocks()" in sit and "row.dataset.timed === '1'" in sit
    assert "select.disabled = off || !fk.isAdmin" in sit
    assert "fkClockWarn" in JS


def test_effect_gallery_and_situations():
    assert len(re.findall(r"\['[A-Z][a-z]+', 'fkFam\w+'\]", _const_array("FK_FAMILIES"))) == 8
    situations = re.findall(r"(\w+): 'fkSit\w+'", JS[JS.index("const FK_SIT_KEYS"):JS.index("};", JS.index("const FK_SIT_KEYS"))])
    assert situations == ["rest", "heating", "printing", "pause", "error", "offline", "done", "special"]
    assert "'/fk8wa/frames?screen=normal'" in JS      # cuadros A y B de la galería
    assert "data-fk-try" in JS and "fkTryEffect" in JS
    assert "fkReplay" in JS and "await fkLoadEffects()" in _function_source("fkTryEffect")


def test_effect_names_in_every_language():
    blocks = _i18n_blocks()
    wanted = {f"fkEffect_{effect_id}" for effect_id in _backend_effect_ids()}
    for lang in LANGS:
        assert wanted <= _keys(blocks[lang]), (lang, sorted(wanted - _keys(blocks[lang]))[:5])
    assert "fkEffect_${id}" in JS                      # con respaldo al nombre del servidor


# ── Texto corrido ──

def test_scroll_text_speed_and_direction():
    assert 'id="mled-fk-scroll-speed" min="1" max="10"' in JS
    assert "8 * Math.max(1, Math.min(10" in JS         # px/s = 8 * nivel
    assert JS.index("\\u{1F422}") < JS.index('id="mled-fk-scroll-speed"') < JS.index("\\u{1F407}")   # tortuga a la izquierda, liebre a la derecha
    dirs = re.findall(r"\['([a-z0-9]+)', 'fkDir\w+'\]", JS[JS.index("const FK_DIRS"):JS.index("];", JS.index("const FK_DIRS"))] + "]")
    assert dirs == ["l1", "r", "u", "d", "l"]
    assert "scroll_dir: fk.scroll.dir" in JS
    assert "scroll_speed: fk.scroll.level" in JS
    assert "window.setTimeout(fkLoadScrollPreview, 300)" in JS      # debounce de 300 ms
    assert "/fk8wa/scroll-preview?" in JS


def test_gallery_has_all_thirteen_screens():
    line = re.search(r"const FK_SCREENS = \[([^\]]*)\];", JS).group(1)
    screens = re.findall(r"'([a-z0-9]+)'", line)
    assert screens == ["boot", "normal", "idle", "print1", "print2", "many", "heating", "pause", "error", "offline", "done", "special", "off"]
    assert "FK_SCREEN_DESC_KEYS" in JS


def test_operator_is_read_only():
    assert "/api/auth/me" in JS
    assert "data-fk-admin-input" in JS and "data-fk-admin-only" in JS
    assert "if (!fk.isAdmin" in JS or "if (!fk.isAdmin)" in JS
    assert "select.disabled = off || !fk.isAdmin" in JS
    assert "fkTryEffect" in JS and "fk.isAdmin ? `<button" in JS      # "Probar en mi panel" solo admin


def test_server_text_is_escaped():
    # Mensaje vigente y nombres de máquinas nunca entran crudos al HTML.
    assert "strong').textContent = message.text" in JS
    assert "esc(label)" in JS


# ── Mosaico ──

def _first_rules():
    """Como dict(_css_rules()) pero conserva la primera regla de cada selector (la de escritorio)."""
    rules = {}
    for selector, body in _css_rules():
        rules.setdefault(selector, body)
    return rules


def _mosaic_sequence():
    """[(tipo, valor)] del mosaico en el orden del HTML: columnas, tarjetas y la pila de máquinas + brillo."""
    html = JS[JS.index("function fkViewHtml"):]
    html = html[html.index('class="mled-fk-mosaic">'):html.index('<details class="mled-fk-details"')]
    tokens = []
    pattern = (r"(mled-fk-col mled-fk-col-[lr])|(mled-fk-stack (mled-fk-o\d))"
               r"|fkCardHtml\('([^']*)', 'mled-fk-t-([\w-]+)'")
    for match in re.finditer(pattern, html):
        if match.group(1):
            tokens.append(("col", match.group(1).split("-")[-1]))
        elif match.group(2):
            tokens.append(("card", "stack", match.group(3)))
        else:
            tokens.append(("card", match.group(5), match.group(4)))
    return tokens


def _order_of(classes):
    found = re.search(r"mled-fk-o(\d)", classes)
    return int(found.group(1)) if found else None


def test_mosaic_two_independent_columns():
    rules = _first_rules()
    assert "repeat(12" in rules[".mled-fk-mosaic"] and "align-items: start" in rules[".mled-fk-mosaic"]
    assert "span 7" in rules[".mled-fk-col-l"] and "span 5" in rules[".mled-fk-col-r"]
    # Cada columna apila sus tarjetas por su cuenta (no comparten filas): sin huecos entre ellas.
    assert "display: grid" in rules[".mled-fk-col"] and "align-content: start" in rules[".mled-fk-col"]
    assert "gap: 12px" in rules[".mled-fk-col"]
    for name, span in (("s6", 6), ("s12", 12)):
        assert f"span {span}" in rules[f".mled-fk-{name}"]
    assert ".mled-fk-s7" not in rules and ".mled-fk-s5" not in rules       # ya no hay filas de 7 + 5


def test_mosaic_columns_content_and_full_width_cards():
    tokens = _mosaic_sequence()
    layout = []
    for token in tokens:
        if token[0] == "col":
            layout.append(f"col-{token[1]}")
        else:
            layout.append(token[1])
    assert layout == ["col-l", "now", "msg", "sit", "col-r", "why", "stack", "timer", "fx", "scroll", "screens"] or layout == [
        "col-l", "now", "msg", "sit", "col-r", "why", "stack", "mach", "bright", "timer", "fx", "scroll", "screens"]
    # Las tarjetas de ancho completo van debajo de las dos columnas.
    wide = {token[1]: token[2] for token in tokens if token[0] == "card" and token[1] in ("fx", "scroll", "screens")}
    assert "mled-fk-s12" in wide["fx"] and "mled-fk-s6" in wide["scroll"] and "mled-fk-s6" in wide["screens"]


def test_mosaic_mobile_order_and_no_duplicated_dom():
    tokens = [t for t in _mosaic_sequence() if t[0] == "card" and t[1] not in ("mach", "bright")]
    ordered = [t[1] for t in sorted(tokens, key=lambda t: _order_of(t[2]))]
    assert ordered == ["now", "why", "msg", "stack", "timer", "sit", "fx", "scroll", "screens"]
    # Dentro de cada columna el orden del HTML coincide con `order` (escritorio y móvil se ven igual).
    for column in ("l", "r"):
        start = [i for i, t in enumerate(_mosaic_sequence()) if t == ("col", column)][0]
        values = []
        for token in _mosaic_sequence()[start + 1:]:
            if token[0] == "col" or token[1] in ("fx", "scroll", "screens"):
                break
            if token[1] in ("mach", "bright"):
                continue
            values.append(_order_of(token[2]))
        assert values == sorted(values) and len(values) == 3, (column, values)
    html = JS[JS.index("function fkViewHtml"):]
    ids = re.findall(r"fkCardHtml\('[^']*', '(mled-fk-t-[\w-]+)'", html)
    assert len(ids) == len(set(ids)) == 10                  # sin ids duplicados: es un solo DOM
    media = re.search(r"@media \(max-width: 980px\) \{(.*?)\n\}\n\n\.mled-fk-mosaic|@media \(max-width: 980px\) \{(.*?)\n\}", CSS[CSS.index(".mled-fk-o9"):], re.S)
    narrow = media.group(1) or media.group(2)
    assert "display: contents" in narrow and "minmax(0, 1fr)" in narrow
    rules = _first_rules()
    for number in range(1, 10):
        assert f"order: {number}" in rules[f".mled-fk-o{number}"]


# ── i18n ──

def test_fk_i18n_keys_in_every_language():
    blocks = _i18n_blocks()
    assert set(LANGS) <= set(blocks)
    reference = _keys(blocks["es"])
    assert {"fkTitle", "fkSizeMismatch", "fkNowTitle", "fkWhyTitle", "fkMsgTitle", "fkTimerTitle", "fkSitTitle",
            "fkFxTitle", "fkScrollTitle", "fkGalleryTitle"} <= reference
    for lang in LANGS:
        assert _keys(blocks[lang]) == reference, lang


def test_every_fk_key_used_in_js_is_defined():
    code = _code_after_i18n()
    used = set(re.findall(r"'(fk[A-Z]\w*)'", code)) | set(re.findall(r"tr\(`?(fk[A-Z]\w*)", code))
    blocks = _i18n_blocks()
    for lang in LANGS:
        assert used <= _keys(blocks[lang]), (lang, used - _keys(blocks[lang]))


def test_no_unused_fk_keys_left_behind():
    code = _code_after_i18n()
    used = set(re.findall(r"'(fk[A-Z]\w*)'", code)) | set(re.findall(r"tr\(`?(fk[A-Z]\w*)", code))
    dynamic = {key for key in _keys(_i18n_blocks()["es"]) if key.startswith("fkEffect_")}
    assert _keys(_i18n_blocks()["es"]) - used - dynamic == set()


def test_help_bubble_on_every_section():
    helps = set(re.findall(r"'(fk\w*Help)'", _code_after_i18n()))
    assert len(helps) >= 14, helps
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


# ── Fichas de pestañas ──

def test_three_tab_cards_with_icon_pill_and_subtitle():
    html = _function_source("tabCardsHtml")
    assert 'role="tablist"' in html and 'role="tab"' in html
    assert "aria-selected=" in html and "aria-controls=" in html
    assert "mled-tab-icon" in html and "mled-tab-pill" in html and "mled-tab-sub" in html and "mled-tab-title" in html
    cards = re.findall(r"\['(\w+)', '(tabCard\w+)', '(tabCard\w+Sub)'\]", _const_array("TAB_CARDS"))
    assert [c[0] for c in cards] == ["dashboard", "editor", "fk8wa"]
    icons = JS[JS.index("const TAB_ICONS = {"):JS.index("};", JS.index("const TAB_ICONS = {"))]
    assert icons.count("<svg") + icons.count("TAB_SVG_OPEN}") >= 3
    assert 'width="28" height="28"' in JS
    for view in ("dashboard", "editor", "fk8wa"):
        assert f'id="mled-view-{view}"' in JS
    assert "tab.setAttribute('aria-selected'" in _function_source("switchDashView")


def test_tab_pills_use_real_data_and_refresh_while_visible():
    refresh = _function_source("refreshTabCards")
    assert "state.status.configured" in refresh and "state.status.connected" in refresh   # iPixel
    assert "state.announcements.length" in refresh                                      # anuncios
    assert "FK_CONN[tabFkState]" in refresh                                              # FK-8Wa
    assert "/fk8wa/status" in _function_source("fetchTabFk")
    assert "TAB_REFRESH_MS = 15000" in JS
    tick = _function_source("tabCardsTick")
    assert "visibilityState" in tick and "getClientRects().length" in tick
    keyboard = _function_source("bindTabCards")
    for key in ("ArrowRight", "ArrowLeft", "Home", "End"):
        assert key in keyboard
    assert "startTabCards();" in JS[JS.index("function mount()"):]


def test_tab_card_keys_in_every_language():
    blocks = _i18n_blocks()
    wanted = {"tabsAria", "tabCardMain", "tabCardMainSub", "tabCardScenes", "tabCardScenesSub", "tabCardLed", "tabCardLedSub",
              "tabAnnOne", "tabAnnMany"}
    for lang in LANGS:
        assert wanted <= _keys(blocks[lang], "tab"), lang


def test_tab_card_css_is_themed_and_responsive():
    rules = _css_rules()
    tab_rules = [(sel, body) for sel, body in rules if ".mled-view-tab" in sel or ".mled-tab-" in sel]
    assert len(tab_rules) >= 8
    for selector, body in tab_rules:
        assert not re.search(r"#[0-9a-fA-F]{3,8}\b", body), selector
        assert not re.search(r"\b(?:rgba?|hsla?)\(", body), selector
    by_selector = dict(rules)
    assert "18px" in by_selector[".mled-view-tab"] and "1px solid var(--border)" in by_selector[".mled-view-tab"]
    assert "var(--accent)" in by_selector[".mled-view-tab.is-active"]
    assert "auto-fit" in by_selector[".mled-view-tabs"] and "min(100%" in by_selector[".mled-view-tabs"]
    assert ".mled-view-tab:focus-visible" in by_selector


# ── Encabezado del plugin ──

def test_plugin_header_is_transparent():
    headers = [body for sel, body in _css_rules() if sel == ".mled-header"]
    assert headers
    assert any(re.search(r"background:\s*(?:transparent|none)\s*;", body) for body in headers)
    assert any("border-bottom: 1px solid var(--border)" in body for body in headers)   # la línea que lo separa de las fichas
    for body in headers:    # ninguna regla (ni la de pantallas angostas) le devuelve un fondo sólido
        assert not re.search(r"background(?:-color)?:\s*(?!\s|transparent|none)", body)
    shadow = next(body for sel, body in _css_rules() if ".mled-header h1" in sel and "text-shadow" in body)
    assert not re.search(r"#[0-9a-fA-F]{3,8}\b", shadow) and not re.search(r"\brgba?\(", shadow)
    assert ".mled-header .mled-sub" in next(sel for sel, body in _css_rules() if "text-shadow" in body)
    # Las pastillas y botones de la derecha conservan su propio fondo.
    pill = next(body for sel, body in _css_rules() if sel == ".mled-status-pill")
    assert "background: var(--panel-bg)" in pill
    assert any("background: var(--panel-bg)" in body for sel, body in _css_rules() if sel == ".mled-btn")


# ── CSS ──

def _fk_css_block():
    start_marker, end_marker = "/* ── Panel FK-8Wa ──\n", "/* ── fin Panel FK-8Wa ── */"
    start = CSS.index(start_marker)
    return CSS[start + len(start_marker):CSS.index(end_marker)]


def test_led_colors_declared_once_as_variables():
    for name in ("--mled-fk-led-on", "--mled-fk-led-off", "--mled-fk-led-bg"):
        assert len(re.findall(rf"^\s*{name}:", CSS, re.M)) == 1, name
    assert "255, 255, 255" in CSS     # LED blanco


def test_new_css_has_no_fixed_colors_outside_led_variables():
    blocks = [_fk_css_block()]
    reglas = CSS[CSS.index("/* ── Panel FK-8Wa: casilla y marca en las reglas ── */"):CSS.index("/* ── fin Panel FK-8Wa: reglas ── */")]
    blocks.append(reglas)
    for block in blocks:
        block = re.sub(r"/\*.*?\*/", "", block, flags=re.S)
        block = re.sub(r"^\s*--mled-fk-led-(?:on|off|bg):[^;]*;", "", block, flags=re.M)
        assert block.strip()
        assert not re.search(r"#[0-9a-fA-F]{3,8}\b", block)
        assert not re.search(r"\b(?:rgba?|hsla?)\(", block)


def test_css_is_pixelated_responsive_and_accessible():
    assert "image-rendering: pixelated" in CSS
    assert "@media (prefers-reduced-motion: reduce)" in CSS
    assert ":focus-visible" in CSS
    assert "overflow-x" not in _fk_css_block()
