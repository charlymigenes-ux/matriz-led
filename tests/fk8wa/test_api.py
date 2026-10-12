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

    @pytest.mark.parametrize("screen, media", [("", "image/gif"), ("print1", "image/png"), ("off", "image/png")])
    def test_preview(self, client, as_admin, screen, media):
        response = client.get(BASE + "/preview", params={"screen": screen, "scale": 4})
        assert response.status_code == 200 and response.headers["content-type"] == media
        assert Image.open(io.BytesIO(response.content)).size == (96 * 4, 16 * 4)

    def test_preview_unknown_screen(self, client, as_admin):
        assert client.get(BASE + "/preview", params={"screen": "nope"}).status_code == 400


def test_lifecycle_hooks_exist():
    from ..conftest import _ROUTER_MODULE

    assert callable(_ROUTER_MODULE.on_startup) and callable(_ROUTER_MODULE.on_shutdown)


class TestFrames:
    def test_current_frames_and_priority(self, client, as_operator):
        data = client.get(BASE + "/frames").json()
        assert data["style"] == "contorno" and len(data["pages"]) == 1
        import base64
        assert len(base64.b64decode(data["pages"][0])) == 192
        assert client.get(BASE + "/status").json()["priority"] in (None, "normal")

    def test_style_sample_is_the_printing_example(self, client, as_admin):
        data = client.get(BASE + "/frames", params={"style": "barra"}).json()
        assert [v["screen"] for v in data["views"]] == ["print1", "print2"]
        assert len(data["pages"]) == 16 and data["stay_ms"] == 1875

    def test_marco_flag_and_gallery(self, client, as_admin):
        assert client.get(BASE + "/frames", params={"style": "marco_cw"}).json()["marco"] is True
        assert len(client.get(BASE + "/frames", params={"screen": "pause"}).json()["pages"]) == 1

    def test_invalid(self, client, as_admin):
        assert client.get(BASE + "/frames", params={"style": "x"}).status_code == 400
        assert client.get(BASE + "/frames", params={"screen": "x"}).status_code == 400


class TestEffectsAndMachinesApi:
    def test_catalog_for_any_session(self, client, as_operator):
        data = client.get(BASE + "/effects").json()
        assert len(data["effects"]) == 36 and len(data["situations"]) == 8
        assert next(e for e in data["effects"] if e["id"] == "flash_1")["tested"] is True
        assert set(data["scroll_dirs"]) == {"l1", "r", "u", "d", "l"}

    def test_scroll_preview(self, client, as_operator):
        data = client.get(BASE + "/scroll-preview", params={"text": "MATERIAL BAJO EN LA ENDER, CAMBIA EL CARRETE", "dir": "u"}).json()
        assert data["static"] is False and data["strip"]["width"] > 96 and len(data["pages"]) >= 1
        assert client.get(BASE + "/scroll-preview", params={"text": "OK"}).json()["static"] is True
        assert client.get(BASE + "/scroll-preview", params={"dir": "z"}).status_code == 400

    def test_machines_with_short_names(self, client, as_operator, monkeypatch):
        async def fake():
            return [{"id": "klipper:7125", "name": "Klipper ET4", "type": "printer", "online": True},
                    {"id": "laser:x", "name": "TTS 55 PRO", "type": "laser", "online": False}]

        monkeypatch.setattr(screen_service, "list_machines", fake)
        config.save({"short_names": {"laser:x": "TTSX"}})
        machines = client.get(BASE + "/machines").json()["machines"]
        assert [(m["id"], m["kind"], m["short"], m["short_auto"]) for m in machines] == [
            ("klipper:7125", "printer", "ET4", "ET4"), ("laser:x", "laser", "TTSX", "TTS")]

    def test_effect_test_is_admin_only(self, client, as_operator):
        assert client.post(BASE + "/effects/test", json={"effect": "cover_5"}).status_code == 403

    def test_effect_test_unknown_and_unreachable(self, client, as_admin):
        assert client.post(BASE + "/effects/test", json={"effect": "nope"}).status_code == 400
        client.put(BASE + "/config", json={"ip": "192.168.0.90"})
        class Fail:
            def __init__(self, ip): pass
            def upload(self, data): raise protocol.PanelUnreachable("sin respuesta")
        service._runner._client_factory = Fail
        response = client.post(BASE + "/effects/test", json={"effect": "cover_5"})
        assert response.status_code == 502 and "sin respuesta" in response.json()["detail"]

    def test_config_accepts_new_keys_and_rejects_bad_ones(self, client, as_admin):
        ok = client.put(BASE + "/config", json={"scroll_dir": "d", "effects": {"error": "flash_1"}, "short_names": {"a": "ET4"}})
        assert ok.status_code == 200 and ok.json()["effects"]["error"] == "flash_1"
        assert client.put(BASE + "/config", json={"effects": {"error": "arcoiris"}}).status_code == 400
        assert client.put(BASE + "/config", json={"short_names": {"a": "DEMASIADO"}}).status_code == 400

    def test_frames_report_the_effect_of_the_current_situation(self, client, as_operator):
        service._runner.current = [("error", {"printer": "ET4", "error": "ERROR"}, None)]
        config.save({"effects": {"error": "flash_1"}})
        data = client.get(BASE + "/frames").json()
        assert data["effect"] == {"id": "flash_1", "type": 7, "subtype": 1}

    def test_frames_of_a_long_message_describe_the_scroll(self, client, as_operator):
        service._runner.current = [("scroll", {"text": "MATERIAL BAJO EN LA ENDER, CAMBIA EL CARRETE"}, 60.0)]
        data = client.get(BASE + "/frames").json()
        assert data["pages"] == [] and data["scroll"]["dir"] == "l1" and data["scroll"]["strip"]["width"] > 96
        assert client.get(BASE + "/status").json()["priority"] == "special"

    def test_gallery_has_13_screens(self, client, as_operator):
        for name in ["boot", "normal", "idle", "print1", "print2", "many", "heating", "pause", "error", "offline", "done", "special", "off"]:
            assert len(client.get(BASE + "/frames", params={"screen": name}).json()["pages"]) == 1
