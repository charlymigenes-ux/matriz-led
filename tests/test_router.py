from .conftest import screen_service


def test_config_endpoints_require_auth(client):
    assert client.get("/api/plugins/matriz-led/config").status_code == 401
    assert client.post("/api/plugins/matriz-led/config", json={}).status_code == 401
    assert client.get("/api/plugins/matriz-led/status").status_code == 401
    assert client.post("/api/plugins/matriz-led/text", json={"text": "Hola"}).status_code == 401
    assert client.get("/api/plugins/matriz-led/machines").status_code == 401
    assert client.get("/api/plugins/matriz-led/text-sizes").status_code == 401
    assert client.post("/api/plugins/matriz-led/image", json={"matrix": []}).status_code == 401
    assert client.get("/api/plugins/matriz-led/announcements").status_code == 401
    assert client.get("/api/plugins/matriz-led/announcements/x").status_code == 401
    assert client.post("/api/plugins/matriz-led/announcements", json={}).status_code == 401
    assert client.put("/api/plugins/matriz-led/announcements/x", json={}).status_code == 401
    assert client.delete("/api/plugins/matriz-led/announcements/x").status_code == 401
    assert client.post("/api/plugins/matriz-led/announcements/x/send").status_code == 401
    assert client.get("/api/plugins/matriz-led/device-info").status_code == 401
    assert client.get("/api/plugins/matriz-led/last-sent").status_code == 401
    assert client.get("/api/plugins/matriz-led/stats").status_code == 401
    assert client.get("/api/plugins/matriz-led/rules").status_code == 401
    assert client.post("/api/plugins/matriz-led/rules", json={}).status_code == 401
    assert client.put("/api/plugins/matriz-led/rules/x", json={}).status_code == 401
    assert client.delete("/api/plugins/matriz-led/rules/x").status_code == 401
    assert client.post("/api/plugins/matriz-led/rules/x/run").status_code == 401
    assert client.get("/api/plugins/matriz-led/machine-alerts").status_code == 401
    assert client.get("/api/plugins/matriz-led/machine-alerts/x").status_code == 401
    assert client.put("/api/plugins/matriz-led/machine-alerts/x", json={}).status_code == 401


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


def test_send_image_rejects_missing_matrix(client, as_admin):
    response = client.post("/api/plugins/matriz-led/image", json={})
    assert response.status_code == 400


def test_send_image_rejects_bad_matrix_shape(client, as_admin, monkeypatch):
    monkeypatch.setattr(
        screen_service,
        "send_matrix",
        lambda *args, **kwargs: (_ for _ in ()).throw(ValueError("La matriz debe ser de 16x32 píxeles")),
    )
    response = client.post("/api/plugins/matriz-led/image", json={"matrix": [[True]]})
    assert response.status_code == 400


def test_send_image_forwards_matrix(client, as_admin, monkeypatch):
    calls = []
    monkeypatch.setattr(
        screen_service,
        "send_matrix",
        lambda *args, **kwargs: calls.append(args) or {"success": True, "windows_total": 1},
    )
    matrix = [["ff00aa"] * 32 for _ in range(16)]
    response = client.post("/api/plugins/matriz-led/image", json={"matrix": matrix})
    assert response.status_code == 200
    assert calls[0] == (matrix, False, False, 80)


def test_send_image_forwards_animate_flags_and_speed(client, as_admin, monkeypatch):
    calls = []
    monkeypatch.setattr(
        screen_service,
        "send_matrix",
        lambda *args, **kwargs: calls.append(args) or {"success": True, "windows_total": 1},
    )
    matrix = [["ff00aa"] * 32 for _ in range(16)]
    response = client.post(
        "/api/plugins/matriz-led/image",
        json={"matrix": matrix, "animate_col": True, "animate_row": True, "speed": 40},
    )
    assert response.status_code == 200
    assert calls[0] == (matrix, True, True, 40)


def test_send_image_reports_upstream_failure(client, as_admin, monkeypatch):
    monkeypatch.setattr(
        screen_service,
        "send_matrix",
        lambda *args, **kwargs: {"success": False, "window": 0, "windows_total": 1, "detail": "ERR:BLE_NO_ACK"},
    )
    matrix = [[False] * 32 for _ in range(16)]
    response = client.post("/api/plugins/matriz-led/image", json={"matrix": matrix})
    assert response.status_code == 502


def test_announcement_crud_endpoints(client, as_admin):
    created = client.post("/api/plugins/matriz-led/announcements", json={"name": "Bienvenido"})
    assert created.status_code == 200
    announcement_id = created.json()["id"]

    listed = client.get("/api/plugins/matriz-led/announcements")
    assert listed.status_code == 200
    assert len(listed.json()["announcements"]) == 1

    fetched = client.get(f"/api/plugins/matriz-led/announcements/{announcement_id}")
    assert fetched.status_code == 200
    assert fetched.json()["name"] == "Bienvenido"

    updated = client.put(
        f"/api/plugins/matriz-led/announcements/{announcement_id}", json={"priority": "alta"}
    )
    assert updated.status_code == 200
    assert updated.json()["priority"] == "alta"

    deleted = client.delete(f"/api/plugins/matriz-led/announcements/{announcement_id}")
    assert deleted.status_code == 200
    assert client.get(f"/api/plugins/matriz-led/announcements/{announcement_id}").status_code == 404


def test_create_announcement_rejects_missing_name(client, as_admin):
    response = client.post("/api/plugins/matriz-led/announcements", json={})
    assert response.status_code == 400


def test_get_update_delete_missing_announcement_returns_404(client, as_admin):
    assert client.get("/api/plugins/matriz-led/announcements/no-existe").status_code == 404
    assert client.put("/api/plugins/matriz-led/announcements/no-existe", json={"name": "x"}).status_code == 404
    assert client.delete("/api/plugins/matriz-led/announcements/no-existe").status_code == 404


def test_send_announcement_endpoint(client, as_admin, monkeypatch):
    monkeypatch.setattr(screen_service, "send_matrix", lambda matrix, **kwargs: {"success": True, "windows_total": 1})
    created = client.post("/api/plugins/matriz-led/announcements", json={"name": "Bienvenido"})
    announcement_id = created.json()["id"]

    response = client.post(f"/api/plugins/matriz-led/announcements/{announcement_id}/send")
    assert response.status_code == 200
    assert response.json() == {"success": True, "windows_total": 1}


def test_send_announcement_endpoint_missing_id(client, as_admin):
    response = client.post("/api/plugins/matriz-led/announcements/no-existe/send")
    assert response.status_code == 404


def test_send_announcement_endpoint_reports_upstream_failure(client, as_admin, monkeypatch):
    monkeypatch.setattr(
        screen_service,
        "send_matrix",
        lambda matrix, **kwargs: {"success": False, "window": 0, "windows_total": 1, "detail": "ERR:BLE_NO_ACK"},
    )
    created = client.post("/api/plugins/matriz-led/announcements", json={"name": "Bienvenido"})
    announcement_id = created.json()["id"]

    response = client.post(f"/api/plugins/matriz-led/announcements/{announcement_id}/send")
    assert response.status_code == 502


def test_device_info_endpoint(client, as_admin, monkeypatch):
    monkeypatch.setattr(screen_service, "get_device_info", lambda: {"available": False, "reason": "not_configured"})
    response = client.get("/api/plugins/matriz-led/device-info")
    assert response.status_code == 200
    assert response.json() == {"available": False, "reason": "not_configured"}


def test_last_sent_endpoint(client, as_admin, monkeypatch):
    monkeypatch.setattr(screen_service, "get_last_sent", lambda: None)
    response = client.get("/api/plugins/matriz-led/last-sent")
    assert response.status_code == 200
    assert response.json() == {"last_sent": None}


def test_stats_endpoint(client, as_admin):
    response = client.get("/api/plugins/matriz-led/stats")
    assert response.status_code == 200
    assert response.json() == {"sent_ok": 0, "sent_error": 0}


def test_rules_crud_endpoints(client, as_admin):
    announcement = client.post("/api/plugins/matriz-led/announcements", json={"name": "Material bajo"}).json()

    created = client.post(
        "/api/plugins/matriz-led/rules",
        json={"name": "Avisar", "trigger": "material_low", "announcement_id": announcement["id"]},
    )
    assert created.status_code == 200
    rule_id = created.json()["id"]

    listed = client.get("/api/plugins/matriz-led/rules")
    assert listed.status_code == 200
    assert len(listed.json()["rules"]) == 1

    updated = client.put(f"/api/plugins/matriz-led/rules/{rule_id}", json={"enabled": False})
    assert updated.status_code == 200
    assert updated.json()["enabled"] is False

    deleted = client.delete(f"/api/plugins/matriz-led/rules/{rule_id}")
    assert deleted.status_code == 200
    assert client.get("/api/plugins/matriz-led/rules").json()["rules"] == []


def test_create_rule_rejects_bad_payload(client, as_admin):
    response = client.post(
        "/api/plugins/matriz-led/rules",
        json={"name": "x", "trigger": "no-existe", "announcement_id": "no-existe"},
    )
    assert response.status_code == 400


def test_update_delete_missing_rule_returns_404(client, as_admin):
    assert client.put("/api/plugins/matriz-led/rules/no-existe", json={"enabled": False}).status_code == 404
    assert client.delete("/api/plugins/matriz-led/rules/no-existe").status_code == 404


def test_run_rule_endpoint(client, as_admin, monkeypatch):
    announcement = client.post("/api/plugins/matriz-led/announcements", json={"name": "x"}).json()
    rule = client.post(
        "/api/plugins/matriz-led/rules",
        json={"name": "x", "trigger": "material_low", "announcement_id": announcement["id"]},
    ).json()
    monkeypatch.setattr(screen_service, "send_matrix", lambda matrix, **kwargs: {"success": True, "windows_total": 1})

    response = client.post(f"/api/plugins/matriz-led/rules/{rule['id']}/run")
    assert response.status_code == 200
    assert response.json() == {"success": True, "windows_total": 1}


def test_run_rule_endpoint_missing_rule(client, as_admin):
    response = client.post("/api/plugins/matriz-led/rules/no-existe/run")
    assert response.status_code == 404


def test_machine_alerts_endpoints(client, as_admin):
    announcement = client.post("/api/plugins/matriz-led/announcements", json={"name": "Imprimiendo"}).json()

    defaults = client.get("/api/plugins/matriz-led/machine-alerts/klipper:7125")
    assert defaults.status_code == 200
    assert defaults.json()["enabled"] is False

    saved = client.put(
        "/api/plugins/matriz-led/machine-alerts/klipper:7125",
        json={"enabled": True, "state_announcements": {"printing": announcement["id"]}},
    )
    assert saved.status_code == 200
    assert saved.json()["state_announcements"]["printing"] == announcement["id"]

    listed = client.get("/api/plugins/matriz-led/machine-alerts")
    assert listed.status_code == 200
    assert "klipper:7125" in listed.json()["machine_alerts"]


def test_save_machine_alerts_rejects_unknown_announcement(client, as_admin):
    response = client.put(
        "/api/plugins/matriz-led/machine-alerts/klipper:7125",
        json={"enabled": True, "state_announcements": {"printing": "no-existe"}},
    )
    assert response.status_code == 400
