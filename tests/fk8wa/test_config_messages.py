"""Configuración y mensaje especial del FK-8Wa."""

import json

import pytest

from ..conftest import fk8wa_module

config = fk8wa_module("config")
messages = fk8wa_module("messages")


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "CONFIG_PATH", tmp_path / "fk8wa.json")
    monkeypatch.setattr(messages, "MESSAGE_PATH", tmp_path / "fk8wa_message.json")


class TestConfig:
    def test_defaults_when_missing_or_corrupt(self, tmp_path):
        assert config.load() == config.DEFAULTS
        (tmp_path / "fk8wa.json").write_text("{roto", encoding="utf-8")
        assert config.load() == config.DEFAULTS

    def test_save_roundtrip_normalizes(self):
        saved = config.save({"enabled": True, "ip": " 192.168.0.90 ", "brightness": "12",
                             "machines": [" klipper:7125 ", "marlin:mch_1"]})
        assert saved["ip"] == "192.168.0.90" and saved["brightness"] == 12
        assert saved["machines"] == ["klipper:7125", "marlin:mch_1"]
        assert config.load() == saved

    @pytest.mark.parametrize("payload, message", [
        ({"ip": "999.1.1.1"}, "IP"),
        ({"enabled": True, "ip": ""}, "IP"),
        ({"brightness": 0}, "brightness"),
        ({"brightness": 17}, "brightness"),
        ({"min_interval_s": 5}, "min_interval_s"),
        ({"machines": ["a", "a"]}, "repetida"),
        ({"machines": "a"}, "máquinas"),
        ({"machines": [f"m{i}" for i in range(21)]}, "hasta"),
        ([], "objeto"),
    ])
    def test_invalid(self, payload, message):
        with pytest.raises(config.ConfigError, match=message):
            config.validate(payload)

    def test_ignores_unknown_keys(self):
        assert "password" not in config.validate({"password": "x"})

    def test_atomic_write_leaves_no_tmp(self, tmp_path):
        config.save({})
        assert [p.name for p in tmp_path.iterdir()] == ["fk8wa.json"]


class TestMessages:
    def test_set_and_expire(self):
        msg = messages.set_message("  TODO   BIEN ", 5, "manual", now=1000)
        assert msg == {"text": "TODO BIEN", "source": "manual", "expires_at": 1300}
        assert messages.current(now=1299)["text"] == "TODO BIEN"
        assert messages.current(now=1300) is None

    def test_new_replaces_old_and_clear(self):
        messages.set_message("uno", now=0)
        messages.set_message("dos", source="ai", now=0)
        assert messages.current(now=1)["text"] == "dos"
        messages.clear()
        messages.clear()   # sin error si ya no existe
        assert messages.current(now=1) is None

    @pytest.mark.parametrize("args, match", [
        (("",), "vacío"), (("x" * 201,), "200"), (("x", 0), "duración"), (("x", "a"), "minutos"),
        (("x", 5, "otro"), "Origen"),
    ])
    def test_invalid(self, args, match):
        with pytest.raises(messages.MessageError, match=match):
            messages.set_message(*args)

    def test_corrupt_file_is_no_message(self, tmp_path):
        (tmp_path / "fk8wa_message.json").write_text(json.dumps(["x"]), encoding="utf-8")
        assert messages.current() is None
