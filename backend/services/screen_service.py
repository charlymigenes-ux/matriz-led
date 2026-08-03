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
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests

logger = logging.getLogger(__name__)

CONFIG_PATH = Path("data/plugins/matriz-led/config.json")
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
            return {
                "success": False,
                "window": index,
                "windows_total": len(windows),
                "detail": f"No se pudo contactar al accesorio: {exc}",
            }
        if response.text.strip() != "OK":
            return {
                "success": False,
                "window": index,
                "windows_total": len(windows),
                "detail": response.text,
            }
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
    color = (color or "").strip().lstrip("#") or "ffffff"
    if len(color) != 6:
        raise ValueError("El color debe ser hexadecimal de 6 dígitos (RRGGBB)")
    try:
        return (int(color[0:2], 16), int(color[2:4], 16), int(color[4:6], 16))
    except ValueError as exc:
        raise ValueError("El color debe ser hexadecimal de 6 dígitos (RRGGBB)") from exc


def send_matrix(matrix: List[List[bool]], color: str = "ffffff") -> Dict[str, Any]:
    """Manda el patrón de píxeles dibujado en el editor de la pantalla tal
    cual -- a diferencia de send_text, esto no pasa por ninguna fuente
    tipográfica. Arma un PNG de exactamente MATRIX_COLS x MATRIX_ROWS en
    memoria (sin tocar disco) y lo manda con pypixelcolor.send_image_hex;
    al ya venir del tamaño exacto del panel, no hace falta un DeviceInfo
    real (que solo existiría si este servicio hablara BLE directo, cosa
    que no hace -- ver el docstring del módulo)."""
    if len(matrix) != MATRIX_ROWS or any(len(row) != MATRIX_COLS for row in matrix):
        raise ValueError(f"La matriz debe ser de {MATRIX_ROWS}x{MATRIX_COLS} píxeles")

    try:
        from PIL import Image
        from pypixelcolor.commands.send_image import send_image_hex as build_send_image_plan
    except ImportError as exc:
        raise ValueError(
            "Falta la librería pypixelcolor en el entorno de NOPAL -- instálala con "
            "'pip install pypixelcolor' (ver README.md de este plugin)"
        ) from exc

    rgb = _hex_to_rgb(color)
    image = Image.new("RGB", (MATRIX_COLS, MATRIX_ROWS), (0, 0, 0))
    pixels = image.load()
    for row_index, row in enumerate(matrix):
        for col_index, is_on in enumerate(row):
            if is_on:
                pixels[col_index, row_index] = rgb

    buffer = BytesIO()
    image.save(buffer, format="PNG")
    plan = build_send_image_plan(buffer.getvalue().hex(), ".png")
    windows = [window.data for window in plan.windows]
    return send_windows(windows)
