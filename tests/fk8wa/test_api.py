"""Rutas /api/plugins/matriz-led/fk8wa/* y permisos (CA8). Sin red: el
cliente del panel es simulado y la vista previa no abre conexiones."""

import io

import pytest
from PIL import Image

from ..conftest import fk8wa_module, screen_service

service = fk8wa_module("service")
config = fk8wa_module("config")
messages = fk8wa_module("messages")
runner_mod = fk8wa_module("runner")
protocol = fk8wa_module("protocol")

BASE = "/api/plugins/matriz-led/fk8wa"


class InfoOnly:
    calls = []
    size = (96, 16)

    def __init__(self, ip):
        self.ip = ip

    def info(self):
        InfoOnly.calls.append(self.ip)
        w, h = InfoOnly.size
        return {"width": w, "height": h, "port": 5858, "ip": self.ip}

    def upload(self, data):
        raise AssertionError("la API no debe subir programas")


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "CONFIG_PATH", tmp_path / "fk8wa.json")
    monkeypatch.setattr(messages, "MESSAGE_PATH", tmp_path / "fk8wa_message.json")

    async def no_machines():
        return []

    monkeypatch.setattr(service, "_runner", runner_mod.Runner(no_machines, client_factory=InfoOnly))
    InfoOnly.calls, InfoOnly.size = [], (96, 16)


class TestPermissions:
    @pytest.mark.parametrize("method, path, body", [
        ("put", "/config", {"ip": "192.168.0.90"}),
        ("post", "/test", None),
        ("post", "/brightness", {"level": 5}),
    ])
    def test_operator_cannot_configure(self, client, as_operator, method, path, body):
        response = getattr(client, method)(BASE + path, json=body) if body else getattr(client, method)(BASE + path)
        assert response.status_code == 403

    def test_operator_can_send_and_clear_message(self, client, as_operator):
        assert client.post(BASE + "/message", json={"text": "TODO BIEN"}).status_code == 200
        assert client.get(BASE + "/message").json()["message"]["text"] == "TODO BIEN"
        assert client.delete(BASE + "/message").status_code == 200
        assert client.get(BASE + "/message").json()["message"] is None

    def test_operator_can_read_status_and_preview(self, client, as_operator):
        assert client.get(BASE + "/status").status_code == 200
        assert client.get(BASE + "/preview").status_code == 200

    def test_anonymous(self, client):
        assert client.get(BASE + "/status").status_code == 401


class TestConfigAndTest:
    def test_save_and_read(self, client, as_admin):
        saved = client.put(BASE + "/config", json={"enabled": True, "ip": "192.168.0.90", "machines": ["klipper:7125"]})
        assert saved.status_code == 200 and saved.json()["ip"] == "192.168.0.90"
        assert client.get(BASE + "/config").json()["machines"] == ["klipper:7125"]

    def test_invalid_config_400(self, client, as_admin):
        response = client.put(BASE + "/config", json={"ip": "no-ip"})
        assert response.status_code == 400 and "IP" in response.json()["detail"]

    def test_brightness_marks_pending(self, client, as_admin):
        service._runner._brightness_pending = False
        assert client.post(BASE + "/brightness", json={"level": 12}).json()["brightness"] == 12
        assert service._runner._brightness_pending is True
        assert client.post(BASE + "/brightness", json={"level": 30}).status_code == 400

    def test_connection_reads_info_only(self, client, as_admin):
        client.put(BASE + "/config", json={"ip": "192.168.0.90"})
        response = client.post(BASE + "/test")
        assert response.status_code == 200 and response.json()["width"] == 96
        assert InfoOnly.calls == ["192.168.0.90"]

    def test_connection_without_ip(self, client, as_admin):
        assert client.post(BASE + "/test").status_code == 502


class TestMessageAndPreview:
    def test_announcement_shows_its_name(self, client, as_admin):
        created = screen_service.create_announcement({"name": "Cambio de turno"})
        response = client.post(BASE + "/message", json={"announcement_id": created["id"], "minutes": 2})
        assert response.status_code == 200
        assert response.json()["message"]["text"] == "Cambio de turno"
        assert response.json()["message"]["source"] == "announcement"

    def test_unknown_announcement_404(self, client, as_admin):
        assert client.post(BASE + "/message", json={"announcement_id": "nope"}).status_code == 404

    def test_invalid_message_400(self, client, as_admin):
        assert client.post(BASE + "/message", json={"text": ""}).status_code == 400

    @pytest.mark.parametrize("screen", ["", "print1", "off"])
    def test_preview_png(self, client, as_admin, screen):
        response = client.get(BASE + "/preview", params={"screen": screen, "scale": 4})
        assert response.status_code == 200 and response.headers["content-type"] == "image/png"
        assert Image.open(io.BytesIO(response.content)).size == (96 * 4, 16 * 4)

    def test_preview_unknown_screen(self, client, as_admin):
        assert client.get(BASE + "/preview", params={"screen": "nope"}).status_code == 400


def test_lifecycle_hooks_exist():
    from ..conftest import _ROUTER_MODULE

    assert callable(_ROUTER_MODULE.on_startup) and callable(_ROUTER_MODULE.on_shutdown)
