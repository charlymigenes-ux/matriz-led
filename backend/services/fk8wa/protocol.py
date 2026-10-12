"""Protocolo TCP del panel FK-8Wa (puerto 5858). Ver docs/PROTOCOL.md §2 del
paquete nopal-fk8wa-panel; no usar comandos ni offsets que no estén ahí.

Marco, de ida y de vuelta:  'FK' | u16 LE = 2 + len(payload) | cmd (2 B) | payload | 'KF'

Cada método abre su propia sesión, la usa y la cierra: el panel atiende una
sola sesión a la vez. Que no haya dos sesiones simultáneas lo garantiza quien
llama (el runner, con un único Lock); aquí no hay estado compartido.

Diferencias con reference/dash.py, a propósito:
- Toda sesión que envía algo (upload, brightness) abre con 01 09 y NO envía
  nada si el tamaño no es 96x16 (la referencia leía la información en la
  subida pero no comparaba, y el brillo ni la leía).
- Se validan los códigos de respuesta documentados; cualquier otra respuesta
  aborta con los bytes recibidos en el mensaje de error.
- read_frame() no se queda en un bucle si el panel cierra a la mitad.
- Todo tiene timeout, y la subida completa tiene un tope de tiempo.
"""

from __future__ import annotations

import socket
import struct
import time
from typing import Any, Callable, Dict

PORT = 5858
EXPECTED_SIZE = (96, 16)
CHUNK = 1000
CONNECT_TIMEOUT_S = 3.0
READ_TIMEOUT_S = 5.0
UPLOAD_DEADLINE_S = 30.0
MIN_INFO_BYTES = 300

CMD_INFO = b"\x01\x09"
CMD_BEGIN = b"\x01\x02"
CMD_CHUNK = b"\x01\x1b"
CMD_END_DATA = b"\x01\x37"
CMD_APPLY = b"\x01\x01"
CMD_BRIGHTNESS = b"\x01\x15"

OK = b"\x01\x21\x00\x00"           # respuesta a 01 02 y 01 01
CHUNK_ACK = b"\x01\x21\x03\x00"    # + u32 offset
END_DATA_ACK = b"\x01\x38"         # + u32 total
BRIGHTNESS_ACK = b"\x01\x15\x00\x00"


class Fk8waError(Exception):
    """Error al hablar con el panel."""


class PanelUnreachable(Fk8waError):
    """No se pudo conectar o el panel no contestó a tiempo."""


class ProtocolError(Fk8waError):
    """El panel contestó algo que no corresponde al protocolo documentado."""


class SizeMismatch(Fk8waError):
    """El panel reporta un tamaño distinto de 96x16: no se envía nada."""

    def __init__(self, width: int, height: int):
        super().__init__(f"El panel reporta {width}x{height} y se esperaba 96x16; no se envió nada. "
                         "Reconfigúralo con FKShow (¿se usó el botón de prueba de 15 s?).")
        self.width, self.height = width, height


def frame(cmd: bytes, payload: bytes = b"") -> bytes:
    return b"FK" + struct.pack("<H", 2 + len(payload)) + cmd + payload + b"KF"


def _recv_exact(sock, n: int) -> bytes:
    data = b""
    while len(data) < n:
        chunk = sock.recv(n - len(data))
        if not chunk:
            raise PanelUnreachable("El panel cerró la conexión a la mitad de una respuesta")
        data += chunk
    return data


def read_frame(sock) -> bytes:
    """Cuerpo de una respuesta (cmd + payload), sin 'FK', largo ni 'KF'."""
    head = _recv_exact(sock, 4)
    if head[:2] != b"FK":
        raise ProtocolError(f"Respuesta sin cabecera FK: {head.hex(' ')}")
    n = struct.unpack("<H", head[2:4])[0]
    rest = _recv_exact(sock, n + 2)
    if rest[n:] != b"KF":
        raise ProtocolError(f"Respuesta sin cierre KF: {rest[n:].hex(' ')}")
    return rest[:n]


def _ip(b: bytes) -> str:
    return ".".join(str(x) for x in b)


def parse_info(body: bytes) -> Dict[str, Any]:
    """Respuesta de 01 09: solo los campos que se muestran (nunca SSID ni claves)."""
    if len(body) < MIN_INFO_BYTES:
        raise ProtocolError(f"Respuesta de información corta ({len(body)} bytes)")
    return {
        "width": struct.unpack_from("<H", body, 12)[0],
        "height": struct.unpack_from("<H", body, 14)[0],
        "port": struct.unpack_from("<H", body, 34)[0],
        "ip": _ip(body[36:40]),
    }


def _expect(body: bytes, prefix: bytes, what: str) -> None:
    if not body.startswith(prefix):
        raise ProtocolError(f"Respuesta inesperada a {what}: {body[:16].hex(' ')}")


Connect = Callable[..., Any]


class Fk8waClient:
    def __init__(self, host: str, port: int = PORT, connect: Connect = socket.create_connection,
                 clock: Callable[[], float] = time.monotonic):
        self.host, self.port = host, port
        self._connect, self._clock = connect, clock

    def _open(self):
        try:
            sock = self._connect((self.host, self.port), timeout=CONNECT_TIMEOUT_S)
        except OSError as exc:
            raise PanelUnreachable(f"No se pudo conectar con el panel en {self.host}:{self.port} ({exc})") from exc
        sock.settimeout(READ_TIMEOUT_S)
        return sock

    def _call(self, sock, cmd: bytes, payload: bytes = b"") -> bytes:
        try:
            sock.sendall(frame(cmd, payload))
            return read_frame(sock)
        except socket.timeout as exc:
            raise PanelUnreachable("El panel no contestó a tiempo") from exc
        except OSError as exc:
            raise PanelUnreachable(f"Se perdió la conexión con el panel ({exc})") from exc

    def info(self) -> Dict[str, Any]:
        """Solo lectura (01 09)."""
        sock = self._open()
        try:
            return parse_info(self._call(sock, CMD_INFO))
        finally:
            sock.close()

    def upload(self, program: bytes) -> Dict[str, Any]:
        """Sube un programa completo. Antes lee el tamaño y no envía nada si no es 96x16."""
        started = self._clock()
        sock = self._open()
        try:
            info = parse_info(self._call(sock, CMD_INFO))
            if (info["width"], info["height"]) != EXPECTED_SIZE:
                raise SizeMismatch(info["width"], info["height"])
            _expect(self._call(sock, CMD_BEGIN), OK, "01 02")
            total = len(program)
            for idx, off in enumerate(range(0, total, CHUNK)):
                if self._clock() - started > UPLOAD_DEADLINE_S:
                    raise PanelUnreachable(f"La subida tardó más de {UPLOAD_DEADLINE_S:.0f} s")
                part = program[off:off + CHUNK]
                payload = b"\x00\x10" + struct.pack("<IIII", idx, total, off, len(part)) + part + b"\x00"
                _expect(self._call(sock, CMD_CHUNK, payload), CHUNK_ACK + struct.pack("<I", off), "01 1b")
            _expect(self._call(sock, CMD_END_DATA), END_DATA_ACK + struct.pack("<I", total), "01 37")
            _expect(self._call(sock, CMD_APPLY), OK, "01 01")
            return info
        finally:
            sock.close()

    def brightness(self, level: int) -> int:
        """Brillo 1..16 (01 15). Devuelve el nivel aplicado."""
        level = max(1, min(16, int(level)))
        sock = self._open()
        try:
            info = parse_info(self._call(sock, CMD_INFO))
            if (info["width"], info["height"]) != EXPECTED_SIZE:
                raise SizeMismatch(info["width"], info["height"])
            _expect(self._call(sock, CMD_BRIGHTNESS, b"\x00\x00" + struct.pack("<I", level)), BRIGHTNESS_ACK, "01 15")
            return level
        finally:
            sock.close()
