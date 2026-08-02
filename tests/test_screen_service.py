import requests

from .conftest import screen_service


def test_get_config_empty_by_default():
    assert screen_service.get_config() == {"ip": "", "username": "", "has_password": False}


def test_save_config_requires_ip():
    try:
        screen_service.save_config("", "nopal", "clave")
        assert False, "debía rechazar guardar sin IP"
    except ValueError:
        pass


def test_save_config_persists_and_never_returns_password():
    result = screen_service.save_config("192.168.0.85", "nopal", "clave123")
    assert result == {"ip": "192.168.0.85", "username": "nopal", "has_password": True}
    assert screen_service._read_config()["password"] == "clave123"


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

    assert screen_service.get_status() == {"configured": True, "connected": True}


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
