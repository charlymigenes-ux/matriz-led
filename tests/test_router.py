from .conftest import screen_service


def test_config_endpoints_require_auth(client):
    assert client.get("/api/plugins/matriz-led/config").status_code == 401
    assert client.post("/api/plugins/matriz-led/config", json={}).status_code == 401
    assert client.get("/api/plugins/matriz-led/status").status_code == 401
    assert client.post("/api/plugins/matriz-led/text", json={"text": "Hola"}).status_code == 401
    assert client.get("/api/plugins/matriz-led/machines").status_code == 401
    assert client.get("/api/plugins/matriz-led/text-sizes").status_code == 401


def test_list_machines(client, as_admin, monkeypatch):
    async def fake_list_machines():
        return [{"id": "klipper:7125", "name": "manchas 1", "status": {"state": "printing"}}]

    monkeypatch.setattr(screen_service, "list_machines", fake_list_machines)
    response = client.get("/api/plugins/matriz-led/machines")
    assert response.status_code == 200
    assert response.json() == {
        "machines": [{"id": "klipper:7125", "name": "manchas 1", "status": {"state": "printing"}}],
    }


def test_save_config_requires_admin(client, as_operator):
    response = client.post(
        "/api/plugins/matriz-led/config",
        json={"ip": "192.168.0.85", "username": "nopal", "password": "x"},
    )
    assert response.status_code == 403


def test_save_and_read_config(client, as_admin):
    saved = client.post(
        "/api/plugins/matriz-led/config",
        json={"ip": "192.168.0.85", "username": "nopal", "password": "clave123"},
    )
    assert saved.status_code == 200
    assert saved.json() == {
        "ip": "192.168.0.85", "username": "nopal", "has_password": True, "auto_alerts": False,
    }

    read_back = client.get("/api/plugins/matriz-led/config")
    assert read_back.status_code == 200
    assert read_back.json() == saved.json()


def test_save_config_rejects_missing_ip(client, as_admin):
    response = client.post("/api/plugins/matriz-led/config", json={"ip": "", "username": "nopal"})
    assert response.status_code == 400


def test_send_text_rejects_empty_text(client, as_admin):
    response = client.post("/api/plugins/matriz-led/text", json={"text": "   "})
    assert response.status_code == 400


def test_send_text_reports_upstream_failure(client, as_admin, monkeypatch):
    monkeypatch.setattr(
        screen_service,
        "send_text",
        lambda *args, **kwargs: {"success": False, "window": 0, "windows_total": 1, "detail": "ERR:BLE_NO_ACK"},
    )
    response = client.post("/api/plugins/matriz-led/text", json={"text": "Hola"})
    assert response.status_code == 502


def test_send_text_success(client, as_admin, monkeypatch):
    monkeypatch.setattr(
        screen_service,
        "send_text",
        lambda *args, **kwargs: {"success": True, "windows_total": 1},
    )
    response = client.post("/api/plugins/matriz-led/text", json={"text": "Hola", "color": "ff0000"})
    assert response.status_code == 200
    assert response.json() == {"success": True, "windows_total": 1}


def test_send_text_defaults_char_height_to_recommended(client, as_admin, monkeypatch):
    calls = []
    monkeypatch.setattr(
        screen_service,
        "send_text",
        lambda *args, **kwargs: calls.append(args) or {"success": True, "windows_total": 1},
    )
    client.post("/api/plugins/matriz-led/text", json={"text": "Hola"})
    assert calls[0][-1] == screen_service.DEFAULT_CHAR_HEIGHT


def test_send_text_forwards_chosen_char_height(client, as_admin, monkeypatch):
    calls = []
    monkeypatch.setattr(
        screen_service,
        "send_text",
        lambda *args, **kwargs: calls.append(args) or {"success": True, "windows_total": 1},
    )
    client.post("/api/plugins/matriz-led/text", json={"text": "Hola", "char_height": 32})
    assert calls[0][-1] == 32


def test_list_text_sizes(client, as_admin):
    response = client.get("/api/plugins/matriz-led/text-sizes")
    assert response.status_code == 200
    assert response.json() == {
        "sizes": list(screen_service.SUPPORTED_CHAR_HEIGHTS),
        "recommended": screen_service.DEFAULT_CHAR_HEIGHT,
    }
