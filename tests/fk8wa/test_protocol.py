"""Protocolo del FK-8Wa con un panel simulado: ninguna prueba abre red real."""

import struct

import pytest

from ..conftest import fk8wa_module

protocol = fk8wa_module("protocol")


def info_body(width=96, height=16):
    body = bytearray(380)
    body[0:2] = b"\x01\x09"
    struct.pack_into("<H", body, 12, width)
    struct.pack_into("<H", body, 14, height)
    struct.pack_into("<H", body, 34, 5858)
    body[36:40] = bytes([192, 168, 0, 90])
    body[184:192] = b"FK-8Wa-x"   # SSID: nunca debe salir en info()
    return bytes(body)


class FakePanel:
    """Socket simulado que contesta como el panel. `replies` permite cambiar
    la respuesta de un comando; `close_after` corta la conexión."""

    def __init__(self, width=96, height=16, replies=None, close_after=None, recv_chunk=None):
        self.width, self.height = width, height
        self.replies = replies or {}
        self.close_after = close_after
        self.recv_chunk = recv_chunk
        self.sent = []          # (cmd, payload)
        self.outbox = b""
        self.closed = False
        self.timeout = None

    # API de socket
    def settimeout(self, t):
        self.timeout = t

    def sendall(self, data):
        assert data[:2] == b"FK" and data[-2:] == b"KF"
        n = struct.unpack("<H", data[2:4])[0]
        cmd, payload = data[4:6], data[6:4 + n]
        self.sent.append((cmd, payload))
        if self.close_after is not None and len(self.sent) > self.close_after:
            return
        self.outbox += protocol.frame(*self._answer(cmd, payload))

    def recv(self, n):
        if self.recv_chunk:
            n = min(n, self.recv_chunk)
        data, self.outbox = self.outbox[:n], self.outbox[n:]
        return data

    def close(self):
        self.closed = True

    def _answer(self, cmd, payload):
        if cmd in self.replies:
            body = self.replies[cmd](payload) if callable(self.replies[cmd]) else self.replies[cmd]
            return body[:2], body[2:]
        if cmd == protocol.CMD_INFO:
            body = info_body(self.width, self.height)
        elif cmd in (protocol.CMD_BEGIN, protocol.CMD_APPLY):
            body = protocol.OK
        elif cmd == protocol.CMD_CHUNK:
            off = struct.unpack_from("<I", payload, 10)[0]
            body = protocol.CHUNK_ACK + struct.pack("<I", off)
        elif cmd == protocol.CMD_END_DATA:
            total = sum(struct.unpack_from("<I", p, 14)[0] for c, p in self.sent if c == protocol.CMD_CHUNK)
            body = protocol.END_DATA_ACK + struct.pack("<I", total)
        elif cmd == protocol.CMD_BRIGHTNESS:
            body = protocol.BRIGHTNESS_ACK
        else:
            raise AssertionError(f"comando no documentado: {cmd.hex()}")
        return body[:2], body[2:]

    def cmds(self):
        return [c for c, _ in self.sent]


def client_for(panel, **kw):
    calls = []

    def connect(address, timeout):
        calls.append((address, timeout))
        return panel

    c = protocol.Fk8waClient("192.168.0.90", connect=connect, **kw)
    c.calls = calls
    return c


PROGRAM = bytes(range(256)) * 10   # 2560 bytes -> 3 trozos


class TestUpload:
    def test_exact_sequence_and_chunks(self):
        panel = FakePanel()
        info = client_for(panel).upload(PROGRAM)
        assert info == {"width": 96, "height": 16, "port": 5858, "ip": "192.168.0.90"}
        assert panel.cmds() == [protocol.CMD_INFO, protocol.CMD_BEGIN] + [protocol.CMD_CHUNK] * 3 + [
            protocol.CMD_END_DATA, protocol.CMD_APPLY]
        chunks = [p for c, p in panel.sent if c == protocol.CMD_CHUNK]
        rebuilt = b""
        for idx, p in enumerate(chunks):
            assert p[:2] == b"\x00\x10"
            i, total, off, length = struct.unpack_from("<IIII", p, 2)
            assert (i, total, off) == (idx, len(PROGRAM), idx * 1000)
            assert p[-1:] == b"\x00"                     # el panel no valida el checksum
            rebuilt += p[18:18 + length]
        assert rebuilt == PROGRAM and panel.closed

    def test_wrong_size_sends_nothing(self):
        """El caso del botón de 15 s: el panel cree medir 288x16."""
        panel = FakePanel(width=288)
        with pytest.raises(protocol.SizeMismatch) as err:
            client_for(panel).upload(PROGRAM)
        assert (err.value.width, err.value.height) == (288, 16)
        assert panel.cmds() == [protocol.CMD_INFO] and panel.closed

    @pytest.mark.parametrize("cmd", ["CMD_BEGIN", "CMD_CHUNK", "CMD_END_DATA", "CMD_APPLY"])
    def test_unexpected_reply_aborts(self, cmd):
        panel = FakePanel(replies={getattr(protocol, cmd): b"\x01\x21\x09\x09"})
        with pytest.raises(protocol.ProtocolError, match="inesperada"):
            client_for(panel).upload(PROGRAM)
        assert panel.closed

    def test_chunk_ack_with_wrong_offset_aborts(self):
        panel = FakePanel(replies={protocol.CMD_CHUNK: protocol.CHUNK_ACK + struct.pack("<I", 12345)})
        with pytest.raises(protocol.ProtocolError):
            client_for(panel).upload(PROGRAM)

    def test_panel_closes_midway(self):
        panel = FakePanel(close_after=3)
        with pytest.raises(protocol.PanelUnreachable, match="cerró"):
            client_for(panel).upload(PROGRAM)

    def test_short_reads_are_reassembled(self):
        panel = FakePanel(recv_chunk=3)
        client_for(panel).upload(PROGRAM)

    def test_upload_deadline(self):
        ticks = iter([0, 1, 2, 31, 32, 33])
        panel = FakePanel()
        with pytest.raises(protocol.PanelUnreachable, match="tardó"):
            client_for(panel, clock=lambda: next(ticks)).upload(PROGRAM)

    def test_timeouts_are_set(self):
        panel = FakePanel()
        c = client_for(panel)
        c.upload(PROGRAM)
        assert c.calls == [(("192.168.0.90", 5858), protocol.CONNECT_TIMEOUT_S)]
        assert panel.timeout == protocol.READ_TIMEOUT_S


class TestErrors:
    def test_unreachable(self):
        def refuse(address, timeout):
            raise ConnectionRefusedError("rechazada")

        with pytest.raises(protocol.PanelUnreachable, match="No se pudo conectar"):
            protocol.Fk8waClient("192.168.0.90", connect=refuse).info()

    def test_read_timeout(self):
        import socket

        class Silent(FakePanel):
            def recv(self, n):
                raise socket.timeout()

        with pytest.raises(protocol.PanelUnreachable, match="a tiempo"):
            client_for(Silent()).info()

    def test_bad_framing(self):
        class Garbage(FakePanel):
            def recv(self, n):
                return b"XX\x02\x00"[:n]

        with pytest.raises(protocol.ProtocolError, match="FK"):
            client_for(Garbage()).info()

    def test_short_info(self):
        with pytest.raises(protocol.ProtocolError, match="corta"):
            client_for(FakePanel(replies={protocol.CMD_INFO: b"\x01\x09" + b"\x00" * 20})).info()


class TestInfoAndBrightness:
    def test_info_is_read_only_and_hides_ssid(self):
        panel = FakePanel()
        info = client_for(panel).info()
        assert panel.cmds() == [protocol.CMD_INFO]
        assert set(info) == {"width", "height", "port", "ip"}

    @pytest.mark.parametrize("asked, sent", [(0, 1), (8, 8), (16, 16), (40, 16)])
    def test_brightness_clamped(self, asked, sent):
        panel = FakePanel()
        assert client_for(panel).brightness(asked) == sent
        cmd, payload = panel.sent[-1]
        assert cmd == protocol.CMD_BRIGHTNESS and payload == b"\x00\x00" + struct.pack("<I", sent)

    def test_brightness_checks_size_first(self):
        panel = FakePanel(height=8)
        with pytest.raises(protocol.SizeMismatch):
            client_for(panel).brightness(8)
        assert panel.cmds() == [protocol.CMD_INFO]
