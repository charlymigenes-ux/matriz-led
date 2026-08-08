"""Puente entre NOPAL y una pantalla LED matriz BLE (tipo iPixel Color).

Esta placa/pantalla no se controla desde acá directo: NOPAL arma los
paquetes reales del protocolo (fuentes, animaciones, GIFs) con la librería
pypixelcolor, y un accesorio ESP32 corriendo el firmware Nopal_FF.ino hace
de relay -- recibe esos bytes por HTTP (POST /api/ble/window, hex) y los
reenvía tal cual por BLE. Ver la sección "PANTALLA LED BLE" de ese .ino
para el porqué de esta división de responsabilidades. Este servicio nunca
habla BLE directo, solo HTTP contra el ESP32.

pypixelcolor no viene con NOPAL (no es una dependencia del core, es
específica de este plugin) -- hay que instalarla a mano en el mismo
entorno donde corre NOPAL: `pip install pypixelcolor`. Ver README.md de
este plugin.
"""

from __future__ import annotations

import json
import logging
import secrets
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests

logger = logging.getLogger(__name__)

CONFIG_PATH = Path("data/plugins/matriz-led/config.json")
ANNOUNCEMENTS_PATH = Path("data/plugins/matriz-led/announcements.json")
LAST_SENT_PATH = Path("data/plugins/matriz-led/last_sent.json")
LAST_SENT_HISTORY_PATH = Path("data/plugins/matriz-led/last_sent_history.json")
LAST_SENT_HISTORY_LIMIT = 15
STATS_PATH = Path("data/plugins/matriz-led/stats.json")
RULES_PATH = Path("data/plugins/matriz-led/rules.json")
MACHINE_ALERTS_PATH = Path("data/plugins/matriz-led/machine_alerts.json")
LAST_ERROR_PATH = Path("data/plugins/matriz-led/last_error.json")
REQUEST_TIMEOUT_SECONDS = 15

# Confirmado en hardware real contra una pantalla iPixel Color 16x32.
DEFAULT_CHAR_HEIGHT = 16

# Las 3 fuentes que trae pypixelcolor (CUSONG, SIMSUN, VCR_OSD_MONO) solo
# definen métricas para estas 3 alturas -- pedir cualquier otro valor cae
# al tamaño definido más cercano (ver FontConfig.get_metrics en la
# librería), nunca falla, pero puede no ser el que uno esperaba. Nuestra
# pantalla mide 16 píxeles de alto: 24 y 32 son MÁS ALTOS que la matriz
# física, así que el texto puede recortarse -- quedan disponibles para
# quien los quiera probar, pero 16 es el único confirmado en hardware.
SUPPORTED_CHAR_HEIGHTS = (16, 24, 32)

MATRIX_ROWS = 16
MATRIX_COLS = 32


def _read_config() -> Dict[str, Any]:
    try:
        data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def _write_config(config: Dict[str, Any]) -> None:
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary = CONFIG_PATH.with_suffix(".tmp")
    temporary.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(CONFIG_PATH)


def get_config() -> Dict[str, Any]:
    config = _read_config()
    return {
        "ip": config.get("ip", ""),
        "username": config.get("username", ""),
        # La contraseña nunca se manda de vuelta al panel -- solo si ya
        # hay una guardada, para que el formulario avise "sin cambios" en
        # vez de mostrarla en claro.
        "has_password": bool(config.get("password")),
        "auto_alerts": bool(config.get("auto_alerts", False)),
    }


def save_config(ip: str, username: str, password: Optional[str], auto_alerts: Optional[bool] = None) -> Dict[str, Any]:
    ip = (ip or "").strip()
    username = (username or "").strip()
    if not ip:
        raise ValueError("Falta la IP del accesorio")
    existing = _read_config()
    config = {
        "ip": ip,
        "username": username,
        # Si no mandan contraseña nueva, conservar la que ya había --
        # el panel nunca la vuelve a mostrar, así que guardar sin tocar
        # ese campo no debe borrarla.
        "password": password if password else existing.get("password", ""),
        "auto_alerts": bool(auto_alerts) if auto_alerts is not None else bool(existing.get("auto_alerts", False)),
    }
    _write_config(config)
    return get_config()


def _auth() -> Optional[Tuple[str, str]]:
    config = _read_config()
    username = config.get("username")
    if username:
        return (username, config.get("password") or "")
    return None


def _base_url() -> str:
    config = _read_config()
    ip = config.get("ip")
    if not ip:
        raise ValueError("La pantalla todavía no está configurada")
    return f"http://{ip}"


# Recuerda si la última vez que se consultó el estado la pantalla estaba
# conectada -- para detectar la TRANSICIÓN a "recién conectada" y disparar
# el saludo (ver _greet_if_just_connected). NOPAL no tiene un scheduler de
# fondo para plugins (ver plugin_loader_service.py de NOPAL core), así que
# get_status() -- que ya se sondea solo cada ~10s desde el navegador
# mientras el dashboard esté abierto en cualquier pestaña, sin importar la
# sección -- es el único lugar server-side donde hay chance de enterarse.
_last_known_connected = False


def _greet_if_just_connected(connected: bool) -> None:
    """Requisito explícito, no cosmético: la pantalla SIEMPRE debe mostrar
    el logo/nombre de NOPAL apenas queda conectada por BLE. Nunca debe
    romper una consulta de estado -- si el saludo falla (pypixelcolor no
    instalado, ack perdido), solo se loguea."""
    global _last_known_connected
    if connected and not _last_known_connected:
        try:
            result = send_text("NOPAL", color="22c55e")
            if not result.get("success"):
                logger.warning("Saludo NOPAL no confirmado: %s", result)
        except Exception:
            logger.exception("No se pudo mandar el saludo NOPAL a la pantalla")
    _last_known_connected = connected


def get_status() -> Dict[str, Any]:
    config = _read_config()
    if not config.get("ip"):
        _greet_if_just_connected(False)
        return {"configured": False, "connected": False, "reason": "not_configured"}
    try:
        response = requests.get(f"{_base_url()}/api/ble/status", timeout=REQUEST_TIMEOUT_SECONDS)
        response.raise_for_status()
        data = response.json()
        connected = bool(data.get("connected"))
        _greet_if_just_connected(connected)
        return {"configured": bool(data.get("configured")), "connected": connected}
    except requests.RequestException:
        logger.exception("No se pudo consultar el estado BLE del accesorio")
        _greet_if_just_connected(False)
        return {"configured": True, "connected": False, "reason": "unreachable"}


def _write_json_atomic(path: Path, data: Any) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(".tmp")
        temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.replace(path)
    except OSError:
        logger.exception("No se pudo escribir %s", path)


def _today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _record_stat(success: bool) -> None:
    """Para "Mensajes mostrados hoy" / "Errores" del panel principal --
    cuenta CUALQUIER envío (texto o imagen), se resetea solo al cambiar de
    día (UTC). No hay un endpoint dedicado para leerlo aparte de
    get_stats()."""
    try:
        stats = json.loads(STATS_PATH.read_text(encoding="utf-8"))
        if not isinstance(stats, dict):
            stats = {}
    except (OSError, json.JSONDecodeError):
        stats = {}
    if stats.get("date") != _today():
        stats = {"date": _today(), "sent_ok": 0, "sent_error": 0}
    stats["sent_ok" if success else "sent_error"] = int(stats.get("sent_ok" if success else "sent_error", 0)) + 1
    _write_json_atomic(STATS_PATH, stats)


def get_stats() -> Dict[str, Any]:
    try:
        stats = json.loads(STATS_PATH.read_text(encoding="utf-8"))
        if isinstance(stats, dict) and stats.get("date") == _today():
            return {"sent_ok": int(stats.get("sent_ok", 0)), "sent_error": int(stats.get("sent_error", 0))}
    except (OSError, json.JSONDecodeError):
        pass
    return {"sent_ok": 0, "sent_error": 0}


def _record_error(message: str) -> None:
    """Último error real de un envío (texto o imagen) -- separado de
    get_stats() (que solo cuenta cuántos, sin el detalle) para que el
    panel de diagnóstico pueda mostrar qué pasó la última vez, no solo
    que pasó. No se limpia al tener éxito de nuevo -- es un registro del
    último error visto, no un semáforo de salud actual (eso ya lo cubre
    get_status())."""
    _write_json_atomic(LAST_ERROR_PATH, {"detail": message, "at": datetime.now(timezone.utc).isoformat()})


def get_last_error() -> Optional[Dict[str, Any]]:
    try:
        data = json.loads(LAST_ERROR_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else None
    except (OSError, json.JSONDecodeError):
        return None


def send_windows(windows: List[bytes]) -> Dict[str, Any]:
    """Manda cada ventana ya armada (por pypixelcolor) al relay BLE del
    ESP32, en orden. Corta en el primer error -- las ventanas de un mismo
    mensaje no tienen sentido sueltas."""
    base_url = _base_url()
    auth = _auth()
    for index, window in enumerate(windows):
        try:
            response = requests.post(
                f"{base_url}/api/ble/window",
                data=window.hex(),
                headers={"Content-Type": "text/plain"},
                auth=auth,
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
        except requests.RequestException as exc:
            _record_stat(False)
            detail = f"No se pudo contactar al accesorio: {exc}"
            _record_error(detail)
            return {
                "success": False,
                "window": index,
                "windows_total": len(windows),
                "detail": detail,
            }
        if response.text.strip() != "OK":
            _record_stat(False)
            _record_error(response.text.strip() or "El accesorio respondió con un error sin detalle")
            return {
                "success": False,
                "window": index,
                "windows_total": len(windows),
                "detail": response.text,
            }
    _record_stat(True)
    return {"success": True, "windows_total": len(windows)}


async def list_machines() -> List[Dict[str, Any]]:
    """Snapshot normalizado de todas las máquinas (cualquier marca), para
    que el propio JS del plugin detecte transiciones de estado (trabajo
    terminado, error) sin que NOPAL core necesite saber que esta pantalla
    existe. Reusa tunascreen_service -- el mismo contrato que ya consume
    TUNA-Screen -- en vez de duplicar el polling por marca; import
    absoluto porque este plugin corre en proceso con NOPAL core (mismo
    criterio que backend.auth_deps en router.py)."""
    from backend.services import tunascreen_service

    return await tunascreen_service.list_machines()


def send_text(
    text: str,
    color: str = "ffffff",
    animation: int = 0,
    speed: int = 80,
    rainbow_mode: int = 0,
    char_height: int = DEFAULT_CHAR_HEIGHT,
) -> Dict[str, Any]:
    # Import perezoso: pypixelcolor es una dependencia del plugin, no del
    # core de NOPAL -- así un NOPAL sin este plugin instalado (o sin la
    # librería) no falla al arrancar, solo al usar esta función puntual.
    try:
        from pypixelcolor.commands.send_text import send_text as build_send_text_plan
    except ImportError as exc:
        raise ValueError(
            "Falta la librería pypixelcolor en el entorno de NOPAL -- instálala con "
            "'pip install pypixelcolor' (ver README.md de este plugin)"
        ) from exc

    plan = build_send_text_plan(
        text=text,
        char_height=char_height,
        color=color,
        animation=animation,
        speed=speed,
        rainbow_mode=rainbow_mode,
    )
    windows = [window.data for window in plan.windows]
    return send_windows(windows)


def _hex_to_rgb(color: str) -> tuple[int, int, int]:
    color = (color or "").strip().lstrip("#")
    if len(color) != 6:
        raise ValueError("El color debe ser hexadecimal de 6 dígitos (RRGGBB)")
    try:
        return (int(color[0:2], 16), int(color[2:4], 16), int(color[4:6], 16))
    except ValueError as exc:
        raise ValueError("El color debe ser hexadecimal de 6 dígitos (RRGGBB)") from exc


def _validate_matrix_shape(matrix: List[List[str]]) -> None:
    if len(matrix) != MATRIX_ROWS or any(len(row) != MATRIX_COLS for row in matrix):
        raise ValueError(f"La matriz debe ser de {MATRIX_ROWS}x{MATRIX_COLS} píxeles")


def _frame_from_matrix(matrix: List[List[str]], row_limit: int, col_limit: int) -> "Image.Image":
    from PIL import Image

    frame = Image.new("RGB", (MATRIX_COLS, MATRIX_ROWS), (0, 0, 0))
    pixels = frame.load()
    for row_index in range(min(row_limit, MATRIX_ROWS)):
        for col_index in range(min(col_limit, MATRIX_COLS)):
            cell = matrix[row_index][col_index]
            if cell:
                pixels[col_index, row_index] = _hex_to_rgb(cell)
    return frame


def _reveal_frame_duration_ms(speed: int) -> int:
    """A mayor `speed` (0-100, mismo campo que ya usa send_text), cuadros
    más cortos. Rango elegido a ojo -- no hay un "correcto" objetivo, solo
    que se sienta progresivamente más rápido."""
    speed = max(0, min(100, int(speed or 0)))
    return max(30, 400 - round(speed * 3.5))


def _matrix_to_image_hex(
    matrix: List[List[str]], animate_col: bool = False, animate_row: bool = False, speed: int = 80,
) -> Tuple[str, str]:
    """Arma la imagen a mandar -- un PNG estático de exactamente
    MATRIX_COLS x MATRIX_ROWS si no se pide animación, o un GIF animado
    (mismo mecanismo ya validado en hardware real para animaciones, ver
    README) si se pide "animar por columna" y/o "por fila". Ambas son
    COMBINABLES: si se piden las dos a la vez, el cuadro crece como un
    rectángulo desde la esquina superior izquierda (ni es puramente
    columna ni puramente fila, es la composición de las dos). Cada celda
    es "" (apagado, negro) o un hex de 6 dígitos -- a diferencia de
    send_text, esto no pasa por ninguna fuente tipográfica ni queda
    limitado a un solo color por envío.

    Devuelve (hex_string, extensión) porque pypixelcolor.send_image_hex
    necesita saber la extensión para decidir si decodifica como imagen
    estática o como animación."""
    _validate_matrix_shape(matrix)

    try:
        from PIL import Image  # noqa: F401  (solo para validar que está instalado antes de usarla en los helpers)
    except ImportError as exc:
        raise ValueError(
            "Falta la librería pypixelcolor en el entorno de NOPAL -- instálala con "
            "'pip install pypixelcolor' (ver README.md de este plugin)"
        ) from exc

    if not animate_col and not animate_row:
        image = _frame_from_matrix(matrix, MATRIX_ROWS, MATRIX_COLS)
        buffer = BytesIO()
        image.save(buffer, format="PNG")
        return buffer.getvalue().hex(), ".png"

    steps = max(MATRIX_ROWS, MATRIX_COLS) if (animate_col and animate_row) else (
        MATRIX_COLS if animate_col else MATRIX_ROWS
    )
    frames = []
    for step in range(1, steps + 1):
        col_limit = MATRIX_COLS if not animate_col else round(MATRIX_COLS * step / steps)
        row_limit = MATRIX_ROWS if not animate_row else round(MATRIX_ROWS * step / steps)
        frames.append(_frame_from_matrix(matrix, row_limit, col_limit))

    buffer = BytesIO()
    frames[0].save(
        buffer, format="GIF", save_all=True, append_images=frames[1:],
        duration=_reveal_frame_duration_ms(speed), loop=0, disposal=2,
    )
    return buffer.getvalue().hex(), ".gif"


def send_matrix(
    matrix: List[List[str]], animate_col: bool = False, animate_row: bool = False, speed: int = 80,
    source: Optional[str] = None,
) -> Dict[str, Any]:
    """Manda el patrón de píxeles (color por celda) al relay BLE, estático
    o animado (ver _matrix_to_image_hex). Al ya venir del tamaño exacto
    del panel, no hace falta un DeviceInfo real (que solo existiría si
    este servicio hablara BLE directo, cosa que no hace -- ver el
    docstring del módulo)."""
    try:
        from pypixelcolor.commands.send_image import send_image_hex as build_send_image_plan
    except ImportError as exc:
        raise ValueError(
            "Falta la librería pypixelcolor en el entorno de NOPAL -- instálala con "
            "'pip install pypixelcolor' (ver README.md de este plugin)"
        ) from exc

    image_hex, extension = _matrix_to_image_hex(matrix, animate_col, animate_row, speed)
    plan = build_send_image_plan(image_hex, extension)
    windows = [window.data for window in plan.windows]
    result = send_windows(windows)
    if result.get("success"):
        # A diferencia de send_text (el dispositivo arma el texto solo,
        # nunca vemos esos píxeles), acá SÍ armamos la imagen nosotros --
        # así que "Vista en vivo" del panel puede mostrar de verdad lo
        # último que se mandó. No es una lectura real de la pantalla (el
        # relay BLE es de solo escritura, ver el docstring del módulo),
        # es lo último que NOPAL le mandó.
        sent_at = datetime.now(timezone.utc).isoformat()
        _write_json_atomic(LAST_SENT_PATH, {"matrix": matrix, "sent_at": sent_at})
        _record_sent_history(source or "Manual", sent_at)
    return result


def get_last_sent() -> Optional[Dict[str, Any]]:
    try:
        data = json.loads(LAST_SENT_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else None
    except (OSError, json.JSONDecodeError):
        return None


def _record_sent_history(source: str, sent_at: str) -> None:
    """Historial liviano (solo texto: quién mandó qué y cuándo, sin la
    matriz de píxeles) para el "ticker" del dock del Panel de Control en el
    core -- ver #dashboard-dock-matrix-ticker en app.js. Separado de
    LAST_SENT_PATH (que sí guarda la matriz completa, para "Vista en
    vivo") porque el ticker necesita varias entradas, no solo la última."""
    try:
        history = json.loads(LAST_SENT_HISTORY_PATH.read_text(encoding="utf-8"))
        if not isinstance(history, list):
            history = []
    except (OSError, json.JSONDecodeError):
        history = []
    history.append({"source": source, "sent_at": sent_at})
    history = history[-LAST_SENT_HISTORY_LIMIT:]
    _write_json_atomic(LAST_SENT_HISTORY_PATH, history)


def get_last_sent_history(limit: int = 10) -> List[Dict[str, Any]]:
    try:
        history = json.loads(LAST_SENT_HISTORY_PATH.read_text(encoding="utf-8"))
        if not isinstance(history, list):
            return []
    except (OSError, json.JSONDecodeError):
        return []
    return history[-limit:][::-1]


def get_device_info() -> Dict[str, Any]:
    """Info del propio accesorio ESP32 -- mismo IP que ya usa el relay BLE
    (ver _base_url), consultando /api/status en vez de /api/ble/status.
    Es el mismo firmware (Nopal_FF.ino) sirviendo ambos roles en un solo
    HTTP server, así que no hace falta tocar arduino-accessories ni saber
    nada de su registro de accesorios -- este plugin ya tiene el IP en su
    propio config.json. th_sensor.calibrated siempre viene en false desde
    el firmware (sensor analógico sin datasheet, estimación a ojo) -- se
    expone tal cual, sin inventar precisión que no existe."""
    config = _read_config()
    if not config.get("ip"):
        return {"available": False, "reason": "not_configured"}
    try:
        response = requests.get(f"{_base_url()}/api/status", timeout=REQUEST_TIMEOUT_SECONDS)
        response.raise_for_status()
        data = response.json()
    except requests.RequestException:
        logger.exception("No se pudo consultar /api/status del accesorio")
        return {"available": False, "reason": "unreachable"}

    th_sensor = data.get("th_sensor") or {}
    temperature_c = th_sensor.get("t_c_est") if th_sensor.get("enabled") else None
    return {
        "available": True,
        "chip": data.get("chip", ""),
        "firmware": data.get("firmware", ""),
        "free_heap_bytes": data.get("free_heap"),
        "uptime_ms": data.get("uptime_ms"),
        "th_sensor_enabled": bool(th_sensor.get("enabled")),
        "temperature_c_estimated": temperature_c,
    }


# ── Anuncios (Editor de Anuncios) ──
# Un "anuncio" es un dibujo guardado con metadata (a qué máquina/grupo se
# asigna, prioridad, cuándo se reproduce). Vive en su propio JSON, aparte
# de config.json, porque crece con el uso (uno por alerta que el taller
# quiera reutilizar) mientras que config.json es un solo registro fijo.
VALID_PRIORITIES = ("alta", "media", "baja")
VALID_MODES = ("manual", "programado")


def _read_announcements() -> List[Dict[str, Any]]:
    try:
        data = json.loads(ANNOUNCEMENTS_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except (OSError, json.JSONDecodeError):
        return []


def _write_announcements(announcements: List[Dict[str, Any]]) -> None:
    ANNOUNCEMENTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary = ANNOUNCEMENTS_PATH.with_suffix(".tmp")
    temporary.write_text(json.dumps(announcements, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(ANNOUNCEMENTS_PATH)


def _empty_matrix() -> List[List[str]]:
    return [["" for _ in range(MATRIX_COLS)] for _ in range(MATRIX_ROWS)]


def _validate_matrix(matrix: Any) -> List[List[str]]:
    if (
        not isinstance(matrix, list)
        or len(matrix) != MATRIX_ROWS
        or any(not isinstance(row, list) or len(row) != MATRIX_COLS for row in matrix)
    ):
        raise ValueError(f"La matriz debe ser de {MATRIX_ROWS}x{MATRIX_COLS} celdas")
    normalized = []
    for row in matrix:
        normalized_row = []
        for cell in row:
            cell = str(cell or "").strip().lstrip("#")
            if cell:
                _hex_to_rgb(cell)  # valida formato -- lanza ValueError si no es hex de 6 dígitos
            normalized_row.append(cell)
        normalized.append(normalized_row)
    return normalized


def _build_announcement(payload: Dict[str, Any], base: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Arma (o actualiza) un registro de anuncio. Con `base` (edición),
    cualquier campo ausente en el payload conserva su valor anterior; sin
    él (creación), usa defaults razonables."""

    def field(key: str, default: Any) -> Any:
        if key in payload:
            return payload[key]
        return base[key] if base else default

    name = str(field("name", "")).strip()
    if not name:
        raise ValueError("Falta el nombre del anuncio")

    priority = str(field("priority", "media")).strip().lower()
    if priority not in VALID_PRIORITIES:
        raise ValueError(f"Prioridad inválida: {priority}")

    mode = str(field("mode", "manual")).strip().lower()
    if mode not in VALID_MODES:
        raise ValueError(f"Modo de reproducción inválido: {mode}")

    repeat_days = field("repeat_days", [])
    if not isinstance(repeat_days, list) or any(
        not isinstance(day, int) or not (0 <= day <= 6) for day in repeat_days
    ):
        raise ValueError("repeat_days debe ser una lista de enteros 0-6 (lunes a domingo)")

    tags = field("tags", [])
    if not isinstance(tags, list) or any(not isinstance(tag, str) for tag in tags):
        raise ValueError("tags debe ser una lista de texto")

    now = datetime.now(timezone.utc).isoformat()
    return {
        "id": base["id"] if base else secrets.token_hex(6),
        "name": name,
        "machine_id": field("machine_id", None) or None,
        "group": field("group", None) or None,
        "priority": priority,
        "matrix": _validate_matrix(field("matrix", _empty_matrix())),
        # entry_effect solo admite valores validados en hardware real (ver
        # SUPPORTED_ENTRY_EFFECTS más abajo) -- exit_effect/pause_seconds
        # quedan como metadata por ahora: pypixelcolor no expone un
        # parámetro de "efecto de salida" independiente, así que aún no
        # hay forma de mandarlo al dispositivo (ver README.md).
        "entry_effect": str(field("entry_effect", "estatico")),
        "exit_effect": str(field("exit_effect", "ninguno")),
        # Combinables entre sí (ver _matrix_to_image_hex): si se piden las
        # dos, el editor manda un GIF cuyo cuadro crece en rectángulo desde
        # la esquina superior izquierda, no dos animaciones separadas.
        "animate_col": bool(field("animate_col", False)),
        "animate_row": bool(field("animate_row", False)),
        "speed": int(field("speed", 80)),
        "pause_seconds": int(field("pause_seconds", 2)),
        "duration_seconds": max(1, int(field("duration_seconds", 5))),
        "transition_seconds": int(field("transition_seconds", 1)),
        "mode": mode,
        "start_at": field("start_at", None) or None,
        "end_at": field("end_at", None) or None,
        "repeat_days": repeat_days,
        "tags": tags,
        "created_at": base["created_at"] if base else now,
        "updated_at": now,
    }


def list_announcements() -> List[Dict[str, Any]]:
    return _read_announcements()


def get_announcement(announcement_id: str) -> Dict[str, Any]:
    for item in _read_announcements():
        if item["id"] == announcement_id:
            return item
    raise ValueError("Anuncio no encontrado")


def create_announcement(payload: Dict[str, Any]) -> Dict[str, Any]:
    announcements = _read_announcements()
    record = _build_announcement(payload)
    announcements.append(record)
    _write_announcements(announcements)
    return record


def update_announcement(announcement_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    announcements = _read_announcements()
    for index, item in enumerate(announcements):
        if item["id"] == announcement_id:
            record = _build_announcement(payload, base=item)
            announcements[index] = record
            _write_announcements(announcements)
            return record
    raise ValueError("Anuncio no encontrado")


def delete_announcement(announcement_id: str) -> None:
    announcements = _read_announcements()
    remaining = [item for item in announcements if item["id"] != announcement_id]
    if len(remaining) == len(announcements):
        raise ValueError("Anuncio no encontrado")
    _write_announcements(remaining)


def send_announcement(announcement_id: str, source: Optional[str] = None) -> Dict[str, Any]:
    """Manda un anuncio guardado a la pantalla ahora mismo -- el botón
    "Enviar"/"Vista previa en vivo" del editor. El modo "programado" guarda
    fecha/repetición como metadata (ver _build_announcement) pero todavía
    no se dispara solo: NOPAL no tiene un scheduler de fondo para plugins
    (ver el comentario de _last_known_connected más arriba). `source` es
    quién lo disparó para el ticker del dock (ver _record_sent_history) --
    si no viene (envío manual desde el editor/escenas), se usa el nombre
    del propio anuncio."""
    announcement = get_announcement(announcement_id)
    return send_matrix(
        announcement["matrix"],
        animate_col=announcement.get("animate_col", False),
        animate_row=announcement.get("animate_row", False),
        speed=announcement.get("speed", 80),
        source=source or announcement.get("name"),
    )


# ── Reglas de automatización (dashboard "Automatizaciones sugeridas") ──
# NOPAL no tiene scheduler de fondo para plugins (ver el comentario de
# _last_known_connected más arriba) -- estas reglas se guardan acá, pero
# quien las EVALÚA es el propio navegador: el JS del plugin ya sondea
# /machines (y ahora también /api/spoolman/alerts) cada pocos segundos
# mientras el dashboard esté abierto, y llama a .../rules/{id}/run cuando
# detecta que una condición se cumple. Sin eso abierto en algún tab, una
# regla activa simplemente no se dispara -- mismo límite que ya tenía el
# aviso automático de trabajo terminado/error.
VALID_RULE_TRIGGERS = ("idle_timeout", "material_low")


def _read_rules() -> List[Dict[str, Any]]:
    try:
        data = json.loads(RULES_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except (OSError, json.JSONDecodeError):
        return []


def _write_rules(rules: List[Dict[str, Any]]) -> None:
    _write_json_atomic(RULES_PATH, rules)


def _build_rule(payload: Dict[str, Any], base: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    def field(key: str, default: Any) -> Any:
        if key in payload:
            return payload[key]
        return base[key] if base else default

    name = str(field("name", "")).strip()
    if not name:
        raise ValueError("Falta el nombre de la regla")

    trigger = str(field("trigger", "")).strip().lower()
    if trigger not in VALID_RULE_TRIGGERS:
        raise ValueError(f"Disparador inválido: {trigger}")

    announcement_id = str(field("announcement_id", "")).strip()
    get_announcement(announcement_id)  # lanza ValueError si no existe -- una regla sin anuncio real no sirve

    idle_minutes = int(field("idle_minutes", 5))
    if trigger == "idle_timeout" and idle_minutes <= 0:
        raise ValueError("idle_minutes debe ser mayor a 0")

    now = datetime.now(timezone.utc).isoformat()
    return {
        "id": base["id"] if base else secrets.token_hex(6),
        "name": name,
        "trigger": trigger,
        "idle_minutes": idle_minutes,
        "announcement_id": announcement_id,
        "enabled": bool(field("enabled", True)),
        "created_at": base["created_at"] if base else now,
        "updated_at": now,
    }


def list_rules() -> List[Dict[str, Any]]:
    return _read_rules()


def get_rule(rule_id: str) -> Dict[str, Any]:
    for item in _read_rules():
        if item["id"] == rule_id:
            return item
    raise ValueError("Regla no encontrada")


def create_rule(payload: Dict[str, Any]) -> Dict[str, Any]:
    rules = _read_rules()
    record = _build_rule(payload)
    rules.append(record)
    _write_rules(rules)
    return record


def update_rule(rule_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    rules = _read_rules()
    for index, item in enumerate(rules):
        if item["id"] == rule_id:
            record = _build_rule(payload, base=item)
            rules[index] = record
            _write_rules(rules)
            return record
    raise ValueError("Regla no encontrada")


def delete_rule(rule_id: str) -> None:
    rules = _read_rules()
    remaining = [item for item in rules if item["id"] != rule_id]
    if len(remaining) == len(rules):
        raise ValueError("Regla no encontrada")
    _write_rules(remaining)


def run_rule(rule_id: str) -> Dict[str, Any]:
    """Dispara una regla ahora mismo -- llamado por el JS del plugin
    cuando detecta, del lado del navegador, que la condición ya se
    cumplió (ver el comentario grande arriba de VALID_RULE_TRIGGERS)."""
    rule = get_rule(rule_id)
    return send_announcement(rule["announcement_id"])


# ── Alertas por máquina (modal "Alertas visuales" de Matriz LED) ──
# A diferencia de la tira LED de arduino-accessories (que asigna un COLOR
# por estado a una ZONA de píxeles), acá no hay zonas -- una sola pantalla
# para todas las máquinas. Así que en vez de color, cada estado de
# máquina elige QUÉ ANUNCIO guardado mostrar (reusa el Editor de Anuncios
# en vez de duplicar lógica de texto/color).
MACHINE_STATES = ("idle", "heating", "cooling", "printing", "paused", "complete", "error", "offline")


def _read_machine_alerts() -> Dict[str, Any]:
    try:
        data = json.loads(MACHINE_ALERTS_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def _write_machine_alerts(config: Dict[str, Any]) -> None:
    _write_json_atomic(MACHINE_ALERTS_PATH, config)


def list_machine_alerts() -> Dict[str, Any]:
    return _read_machine_alerts()


def get_machine_alerts(machine_id: str) -> Dict[str, Any]:
    config = _read_machine_alerts()
    entry = config.get(machine_id) or {}
    return {
        "machine_id": machine_id,
        "enabled": bool(entry.get("enabled", False)),
        "state_announcements": {
            state: entry.get("state_announcements", {}).get(state) for state in MACHINE_STATES
        },
    }


def save_machine_alerts(machine_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    machine_id = (machine_id or "").strip()
    if not machine_id:
        raise ValueError("Falta el id de la máquina")

    state_announcements_in = payload.get("state_announcements") or {}
    if not isinstance(state_announcements_in, dict):
        raise ValueError("state_announcements debe ser un objeto {estado: id_de_anuncio}")

    state_announcements: Dict[str, Optional[str]] = {}
    for state in MACHINE_STATES:
        announcement_id = state_announcements_in.get(state) or None
        if announcement_id:
            get_announcement(announcement_id)  # lanza ValueError si no existe
        state_announcements[state] = announcement_id

    config = _read_machine_alerts()
    config[machine_id] = {
        "enabled": bool(payload.get("enabled", False)),
        "state_announcements": state_announcements,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    _write_machine_alerts(config)
    return get_machine_alerts(machine_id)
