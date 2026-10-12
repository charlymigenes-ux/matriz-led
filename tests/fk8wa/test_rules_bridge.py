"""Reglas del plugin -> mensaje especial del FK-8Wa (T13). La iPixel sigue igual."""

import pytest

from ..conftest import fk8wa_module, screen_service

messages = fk8wa_module("messages")


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    monkeypatch.setattr(messages, "MESSAGE_PATH", tmp_path / "fk8wa_message.json")
    sent = []
    monkeypatch.setattr(screen_service, "send_announcement",
                        lambda announcement_id, source=None: sent.append(announcement_id) or {"success": True})
    return sent


def _rule(fk8wa=None):
    announcement = screen_service.create_announcement({"name": "Material bajo"})
    payload = {"name": "Filamento", "trigger": "material_low", "announcement_id": announcement["id"]}
    if fk8wa is not None:
        payload["fk8wa"] = fk8wa
    return screen_service.create_rule(payload)


def test_marked_rule_shows_announcement_name(isolated):
    rule = _rule(fk8wa=True)
    result = screen_service.run_rule(rule["id"])
    assert result == {"success": True, "fk8wa": True}
    assert isolated == [rule["announcement_id"]]           # la iPixel sigue recibiendo su anuncio
    current = messages.current()
    assert current["text"] == "Material bajo" and current["source"] == "rule"


def test_unmarked_rule_does_not_touch_fk8wa(isolated):
    rule = _rule()
    assert rule["fk8wa"] is False
    assert screen_service.run_rule(rule["id"]) == {"success": True}
    assert messages.current() is None


def test_update_keeps_or_changes_the_flag():
    rule = _rule(fk8wa=True)
    assert screen_service.update_rule(rule["id"], {"name": "Otro"})["fk8wa"] is True
    assert screen_service.update_rule(rule["id"], {"fk8wa": False})["fk8wa"] is False


def test_old_rules_without_flag_still_load(tmp_path):
    rule = _rule()
    stored = screen_service._read_rules()
    for r in stored:
        r.pop("fk8wa", None)
    screen_service._write_rules(stored)
    assert screen_service.update_rule(rule["id"], {"name": "Renombrada"})["fk8wa"] is False
