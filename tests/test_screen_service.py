import requests

from .conftest import screen_service


def test_get_config_empty_by_default():
    assert screen_service.get_config() == {
        "ip": "", "username": "", "has_password": False, "auto_alerts": False,
    }


def test_save_config_requires_ip():
    try:
        screen_service.save_config("", "nopal", "clave")
        assert False, "debía rechazar guardar sin IP"
    except ValueError:
        pass


def test_save_config_persists_and_never_returns_password():
    result = screen_service.save_config("192.168.0.85", "nopal", "clave123")
    assert result == {
        "ip": "192.168.0.85", "username": "nopal", "has_password": True, "auto_alerts": False,
    }
    assert screen_service._read_config()["password"] == "clave123"


def test_save_config_sets_auto_alerts():
    result = screen_service.save_config("192.168.0.85", "nopal", "clave123", auto_alerts=True)
    assert result["auto_alerts"] is True
    # Guardar de nuevo sin mandar auto_alerts (None) debe conservar el valor.
    result = screen_service.save_config("192.168.0.85", "nopal", None, auto_alerts=None)
    assert result["auto_alerts"] is True


def test_save_config_keeps_previous_password_when_not_provided():
    screen_service.save_config("192.168.0.85", "nopal", "clave123")
    result = screen_service.save_config("192.168.0.86", "nopal", None)
    assert result["ip"] == "192.168.0.86"
    assert result["has_password"] is True
    assert screen_service._read_config()["password"] == "clave123"


def test_get_status_not_configured():
    assert screen_service.get_status() == {
        "configured": False, "connected": False, "reason": "not_configured",
    }


def test_get_status_reports_connected(monkeypatch):
    screen_service.save_config("192.168.0.85", "nopal", "clave123")

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return {"configured": True, "connected": True}

    monkeypatch.setattr(screen_service.requests, "get", lambda *a, **k: FakeResponse())
    monkeypatch.setattr(screen_service, "send_text", lambda *a, **k: {"success": True})

    assert screen_service.get_status() == {"configured": True, "connected": True}


def test_get_status_greets_only_once_per_connection(monkeypatch):
    """Requisito explícito: la pantalla debe saludar con "NOPAL" apenas
    queda conectada -- pero solo en la transición, no en cada poll
    mientras se mantiene conectada, y debe volver a saludar si se
    desconecta y reconecta."""
    screen_service.save_config("192.168.0.85", "nopal", "clave123")
    greetings = []

    def fake_send_text(text, color="ffffff", **kwargs):
        greetings.append((text, color))
        return {"success": True}

    monkeypatch.setattr(screen_service, "send_text", fake_send_text)

    connected = {"value": True}

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return {"configured": True, "connected": connected["value"]}

    monkeypatch.setattr(screen_service.requests, "get", lambda *a, **k: FakeResponse())

    screen_service.get_status()
    screen_service.get_status()
    screen_service.get_status()
    assert greetings == [("NOPAL", "22c55e")]

    connected["value"] = False
    screen_service.get_status()
    connected["value"] = True
    screen_service.get_status()
    assert greetings == [("NOPAL", "22c55e"), ("NOPAL", "22c55e")]


def test_get_status_handles_unreachable_accessory(monkeypatch):
    screen_service.save_config("192.168.0.85", "nopal", "clave123")

    def fake_get(*args, **kwargs):
        raise requests.exceptions.ConnectionError("no route to host")

    monkeypatch.setattr(screen_service.requests, "get", fake_get)

    result = screen_service.get_status()
    assert result["configured"] is True
    assert result["connected"] is False
    assert result["reason"] == "unreachable"


def test_send_windows_success(monkeypatch):
    screen_service.save_config("192.168.0.85", "nopal", "clave123")
    calls = []

    class FakeResponse:
        text = "OK"

    def fake_post(url, **kwargs):
        calls.append((url, kwargs.get("data")))
        return FakeResponse()

    monkeypatch.setattr(screen_service.requests, "post", fake_post)

    result = screen_service.send_windows([b"\x05\x00\x07\x01\x01", b"\xaa\xbb"])

    assert result == {"success": True, "windows_total": 2}
    assert calls[0][0] == "http://192.168.0.85/api/ble/window"
    assert calls[0][1] == "0500070101"
    assert calls[1][1] == "aabb"


def test_send_windows_stops_on_first_failure(monkeypatch):
    screen_service.save_config("192.168.0.85", "nopal", "clave123")
    calls = []

    class FakeResponse:
        def __init__(self, text):
            self.text = text

    def fake_post(url, **kwargs):
        calls.append(url)
        if len(calls) == 1:
            return FakeResponse("ERR:BLE_NO_ACK")
        return FakeResponse("OK")

    monkeypatch.setattr(screen_service.requests, "post", fake_post)

    result = screen_service.send_windows([b"\x01", b"\x02"])

    assert result["success"] is False
    assert result["window"] == 0
    assert result["detail"] == "ERR:BLE_NO_ACK"
    # No debe intentar la segunda ventana si la primera falló.
    assert len(calls) == 1


def test_get_last_error_none_by_default():
    assert screen_service.get_last_error() is None


def test_send_windows_records_last_error_on_bad_response(monkeypatch):
    screen_service.save_config("192.168.0.85", "nopal", "clave123")

    class FakeResponse:
        text = "ERR:BLE_NO_ACK"

    monkeypatch.setattr(screen_service.requests, "post", lambda *a, **k: FakeResponse())

    screen_service.send_windows([b"\x01"])

    last_error = screen_service.get_last_error()
    assert last_error is not None
    assert last_error["detail"] == "ERR:BLE_NO_ACK"
    assert "at" in last_error


def test_send_windows_records_last_error_on_connection_failure(monkeypatch):
    screen_service.save_config("192.168.0.85", "nopal", "clave123")

    def fake_post(*args, **kwargs):
        raise screen_service.requests.RequestException("timed out")

    monkeypatch.setattr(screen_service.requests, "post", fake_post)

    screen_service.send_windows([b"\x01"])

    last_error = screen_service.get_last_error()
    assert last_error is not None
    assert "timed out" in last_error["detail"]


def test_send_windows_success_does_not_touch_last_error(monkeypatch):
    screen_service.save_config("192.168.0.85", "nopal", "clave123")

    class FakeResponse:
        text = "OK"

    monkeypatch.setattr(screen_service.requests, "post", lambda *a, **k: FakeResponse())
    screen_service.send_windows([b"\x01"])

    assert screen_service.get_last_error() is None


def test_send_matrix_rejects_wrong_shape():
    matrix = [[""] * 32] * 10  # solo 10 filas, faltan 6
    try:
        screen_service.send_matrix(matrix)
        assert False, "debía rechazar una matriz que no sea 16x32"
    except ValueError:
        pass


def test_send_matrix_rejects_bad_cell_color():
    matrix = [["" for _ in range(screen_service.MATRIX_COLS)] for _ in range(screen_service.MATRIX_ROWS)]
    matrix[0][0] = "no-es-un-color"
    try:
        screen_service.send_matrix(matrix)
        assert False, "debía rechazar una celda que no sea hex de 6 dígitos"
    except ValueError:
        pass


def test_send_matrix_builds_one_window_with_per_pixel_color(monkeypatch):
    screen_service.save_config("192.168.0.85", "nopal", "clave123")
    captured = {}

    def fake_send_windows(windows):
        captured["windows"] = windows
        return {"success": True, "windows_total": len(windows)}

    monkeypatch.setattr(screen_service, "send_windows", fake_send_windows)

    # Dos colores distintos en la misma matriz -- esto es justo lo que un
    # solo color global (el modelo viejo) no podía representar.
    matrix = [["" for _ in range(screen_service.MATRIX_COLS)] for _ in range(screen_service.MATRIX_ROWS)]
    for col in range(screen_service.MATRIX_COLS):
        matrix[0][col] = "ff0000"
        matrix[1][col] = "ffff00"
    result = screen_service.send_matrix(matrix)

    assert result == {"success": True, "windows_total": 1}
    assert len(captured["windows"]) == 1
    assert isinstance(captured["windows"][0], bytes)
    assert len(captured["windows"][0]) > 0


def _checkerboard_matrix():
    return [
        ["ff0000" if (row + col) % 3 == 0 else "" for col in range(screen_service.MATRIX_COLS)]
        for row in range(screen_service.MATRIX_ROWS)
    ]


def _solid_matrix():
    # Sin celdas apagadas -- a diferencia del checkerboard, cada paso de
    # revelado SIEMPRE cambia al menos un píxel visible, así que Pillow
    # nunca fusiona dos cuadros consecutivos por ser idénticos (ver
    # test_matrix_to_image_hex_animated_is_a_multi_frame_gif).
    return [["ff0000" for _ in range(screen_service.MATRIX_COLS)] for _ in range(screen_service.MATRIX_ROWS)]


def test_matrix_to_image_hex_static_is_a_single_png():
    hex_string, extension = screen_service._matrix_to_image_hex(_checkerboard_matrix())
    assert extension == ".png"
    assert bytes.fromhex(hex_string)[:8] == b"\x89PNG\r\n\x1a\n"


def test_matrix_to_image_hex_animated_is_a_multi_frame_gif():
    from PIL import Image
    from io import BytesIO

    hex_string, extension = screen_service._matrix_to_image_hex(
        _solid_matrix(), animate_col=True, animate_row=True, speed=90,
    )
    assert extension == ".gif"
    image = Image.open(BytesIO(bytes.fromhex(hex_string)))
    assert image.n_frames == max(screen_service.MATRIX_ROWS, screen_service.MATRIX_COLS)


def test_matrix_to_image_hex_column_only_animates_columns():
    from PIL import Image
    from io import BytesIO

    hex_string, extension = screen_service._matrix_to_image_hex(_solid_matrix(), animate_col=True)
    assert extension == ".gif"
    image = Image.open(BytesIO(bytes.fromhex(hex_string)))
    assert image.n_frames == screen_service.MATRIX_COLS


def test_send_matrix_forwards_animate_flags(monkeypatch):
    screen_service.save_config("192.168.0.85", "nopal", "clave123")
    captured = {}

    def fake_send_windows(windows):
        captured["windows"] = windows
        return {"success": True, "windows_total": len(windows)}

    monkeypatch.setattr(screen_service, "send_windows", fake_send_windows)

    result = screen_service.send_matrix(_checkerboard_matrix(), animate_row=True, speed=60)
    assert result == {"success": True, "windows_total": 1}
    assert len(captured["windows"]) == 1


def test_announcements_crud_roundtrip():
    assert screen_service.list_announcements() == []

    created = screen_service.create_announcement({
        "name": "Alerta Temperatura Alta",
        "machine_id": "klipper:7125",
        "priority": "alta",
        "tags": ["Alerta", "Temperatura"],
    })
    assert created["name"] == "Alerta Temperatura Alta"
    assert created["priority"] == "alta"
    assert created["mode"] == "manual"
    assert created["animate_col"] is False
    assert created["animate_row"] is False
    assert len(created["matrix"]) == screen_service.MATRIX_ROWS
    assert len(created["matrix"][0]) == screen_service.MATRIX_COLS
    assert created["id"]

    listed = screen_service.list_announcements()
    assert len(listed) == 1
    assert listed[0]["id"] == created["id"]

    fetched = screen_service.get_announcement(created["id"])
    assert fetched == created

    updated = screen_service.update_announcement(created["id"], {"priority": "baja", "name": "Renombrado"})
    assert updated["priority"] == "baja"
    assert updated["name"] == "Renombrado"
    assert updated["tags"] == ["Alerta", "Temperatura"]  # se conserva -- no vino en el payload
    assert updated["id"] == created["id"]
    assert updated["created_at"] == created["created_at"]

    screen_service.delete_announcement(created["id"])
    assert screen_service.list_announcements() == []


def test_create_announcement_requires_name():
    try:
        screen_service.create_announcement({})
        assert False, "debía rechazar un anuncio sin nombre"
    except ValueError:
        pass


def test_create_announcement_rejects_bad_priority():
    try:
        screen_service.create_announcement({"name": "Test", "priority": "urgentísima"})
        assert False, "debía rechazar una prioridad fuera de VALID_PRIORITIES"
    except ValueError:
        pass


def test_get_update_delete_missing_announcement_raise():
    for fn in (
        lambda: screen_service.get_announcement("no-existe"),
        lambda: screen_service.update_announcement("no-existe", {"name": "x"}),
        lambda: screen_service.delete_announcement("no-existe"),
    ):
        try:
            fn()
            assert False, "debía rechazar un id de anuncio inexistente"
        except ValueError:
            pass


def test_send_announcement_uses_its_matrix(monkeypatch):
    captured = {}

    def fake_send_matrix(matrix, **kwargs):
        captured["matrix"] = matrix
        return {"success": True, "windows_total": 1}

    monkeypatch.setattr(screen_service, "send_matrix", fake_send_matrix)
    created = screen_service.create_announcement({"name": "Bienvenido"})
    result = screen_service.send_announcement(created["id"])
    assert result == {"success": True, "windows_total": 1}
    assert captured["matrix"] == created["matrix"]


# ── Panel principal: device info / último envío / estadísticas ──

def test_get_device_info_not_configured():
    assert screen_service.get_device_info() == {"available": False, "reason": "not_configured"}


def test_get_device_info_unreachable(monkeypatch):
    screen_service.save_config("192.168.0.85", "nopal", "clave123")

    def fake_get(*args, **kwargs):
        raise requests.exceptions.ConnectionError("no route to host")

    monkeypatch.setattr(screen_service.requests, "get", fake_get)
    assert screen_service.get_device_info() == {"available": False, "reason": "unreachable"}


def test_get_device_info_parses_status_and_th_sensor(monkeypatch):
    screen_service.save_config("192.168.0.85", "nopal", "clave123")

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return {
                "chip": "ESP32-D0WD-V3",
                "firmware": "4.4.0-ff",
                "free_heap": 197000,
                "uptime_ms": 86520000,
                "th_sensor": {"enabled": True, "t_c_est": 24.3, "calibrated": False},
            }

    monkeypatch.setattr(screen_service.requests, "get", lambda *a, **k: FakeResponse())
    info = screen_service.get_device_info()
    assert info == {
        "available": True,
        "chip": "ESP32-D0WD-V3",
        "firmware": "4.4.0-ff",
        "free_heap_bytes": 197000,
        "uptime_ms": 86520000,
        "th_sensor_enabled": True,
        "temperature_c_estimated": 24.3,
    }


def test_get_device_info_th_sensor_disabled_omits_temperature(monkeypatch):
    screen_service.save_config("192.168.0.85", "nopal", "clave123")

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return {"chip": "ESP32-D0WD-V3", "firmware": "4.4.0-ff", "th_sensor": {"enabled": False}}

    monkeypatch.setattr(screen_service.requests, "get", lambda *a, **k: FakeResponse())
    info = screen_service.get_device_info()
    assert info["th_sensor_enabled"] is False
    assert info["temperature_c_estimated"] is None


def test_get_last_sent_none_by_default():
    assert screen_service.get_last_sent() is None


def test_send_matrix_records_last_sent(monkeypatch):
    screen_service.save_config("192.168.0.85", "nopal", "clave123")
    monkeypatch.setattr(screen_service, "send_windows", lambda windows: {"success": True, "windows_total": 1})

    matrix = _solid_matrix()
    screen_service.send_matrix(matrix)
    last_sent = screen_service.get_last_sent()
    assert last_sent is not None
    assert last_sent["matrix"] == matrix
    assert "sent_at" in last_sent


def test_send_matrix_does_not_record_last_sent_on_failure(monkeypatch):
    screen_service.save_config("192.168.0.85", "nopal", "clave123")
    monkeypatch.setattr(
        screen_service, "send_windows",
        lambda windows: {"success": False, "window": 0, "windows_total": 1, "detail": "ERR"},
    )
    screen_service.send_matrix(_solid_matrix())
    assert screen_service.get_last_sent() is None


def test_get_stats_defaults_to_zero():
    assert screen_service.get_stats() == {"sent_ok": 0, "sent_error": 0}


def test_send_windows_records_stats(monkeypatch):
    screen_service.save_config("192.168.0.85", "nopal", "clave123")

    class FakeResponse:
        text = "OK"

    monkeypatch.setattr(screen_service.requests, "post", lambda *a, **k: FakeResponse())
    screen_service.send_windows([b"\x01"])
    screen_service.send_windows([b"\x02"])
    assert screen_service.get_stats() == {"sent_ok": 2, "sent_error": 0}

    class FakeErrorResponse:
        text = "ERR:BLE_NO_ACK"

    monkeypatch.setattr(screen_service.requests, "post", lambda *a, **k: FakeErrorResponse())
    screen_service.send_windows([b"\x03"])
    assert screen_service.get_stats() == {"sent_ok": 2, "sent_error": 1}


# ── Reglas de automatización ──

def test_rules_crud_roundtrip():
    announcement = screen_service.create_announcement({"name": "Material bajo"})
    assert screen_service.list_rules() == []

    created = screen_service.create_rule({
        "name": "Avisar material bajo",
        "trigger": "material_low",
        "announcement_id": announcement["id"],
    })
    assert created["trigger"] == "material_low"
    assert created["enabled"] is True
    assert created["id"]

    listed = screen_service.list_rules()
    assert len(listed) == 1

    updated = screen_service.update_rule(created["id"], {"enabled": False})
    assert updated["enabled"] is False
    assert updated["trigger"] == "material_low"  # se conserva -- no vino en el payload

    screen_service.delete_rule(created["id"])
    assert screen_service.list_rules() == []


def test_create_rule_requires_valid_trigger():
    announcement = screen_service.create_announcement({"name": "x"})
    try:
        screen_service.create_rule({"name": "x", "trigger": "algo_raro", "announcement_id": announcement["id"]})
        assert False, "debía rechazar un trigger fuera de VALID_RULE_TRIGGERS"
    except ValueError:
        pass


def test_create_rule_requires_existing_announcement():
    try:
        screen_service.create_rule({"name": "x", "trigger": "material_low", "announcement_id": "no-existe"})
        assert False, "debía rechazar un announcement_id inexistente"
    except ValueError:
        pass


def test_create_rule_idle_timeout_requires_positive_minutes():
    announcement = screen_service.create_announcement({"name": "x"})
    try:
        screen_service.create_rule({
            "name": "x", "trigger": "idle_timeout", "announcement_id": announcement["id"], "idle_minutes": 0,
        })
        assert False, "debía rechazar idle_minutes <= 0"
    except ValueError:
        pass


def test_run_rule_sends_its_announcement(monkeypatch):
    announcement = screen_service.create_announcement({"name": "Inactivo"})
    rule = screen_service.create_rule({
        "name": "Inactividad", "trigger": "idle_timeout", "announcement_id": announcement["id"], "idle_minutes": 5,
    })
    captured = {}
    monkeypatch.setattr(
        screen_service, "send_matrix",
        lambda matrix, **kwargs: captured.setdefault("called", True) and {"success": True, "windows_total": 1},
    )
    result = screen_service.run_rule(rule["id"])
    assert result == {"success": True, "windows_total": 1}
    assert captured["called"] is True


def test_run_rule_missing_rule_raises():
    try:
        screen_service.run_rule("no-existe")
        assert False, "debía rechazar un id de regla inexistente"
    except ValueError:
        pass


# ── Alertas por máquina ──

def test_get_machine_alerts_defaults_when_unconfigured():
    result = screen_service.get_machine_alerts("klipper:7125")
    assert result["machine_id"] == "klipper:7125"
    assert result["enabled"] is False
    assert set(result["state_announcements"].keys()) == set(screen_service.MACHINE_STATES)
    assert all(value is None for value in result["state_announcements"].values())


def test_save_machine_alerts_roundtrip():
    announcement = screen_service.create_announcement({"name": "Imprimiendo"})
    saved = screen_service.save_machine_alerts("klipper:7125", {
        "enabled": True,
        "state_announcements": {"printing": announcement["id"]},
    })
    assert saved["enabled"] is True
    assert saved["state_announcements"]["printing"] == announcement["id"]
    assert saved["state_announcements"]["idle"] is None

    fetched = screen_service.get_machine_alerts("klipper:7125")
    assert fetched == saved

    listed = screen_service.list_machine_alerts()
    assert "klipper:7125" in listed


def test_save_machine_alerts_rejects_unknown_announcement():
    try:
        screen_service.save_machine_alerts("klipper:7125", {
            "enabled": True,
            "state_announcements": {"printing": "no-existe"},
        })
        assert False, "debía rechazar un announcement_id inexistente"
    except ValueError:
        pass


def test_save_machine_alerts_requires_machine_id():
    try:
        screen_service.save_machine_alerts("", {"enabled": True, "state_announcements": {}})
        assert False, "debía rechazar un machine_id vacío"
    except ValueError:
        pass
