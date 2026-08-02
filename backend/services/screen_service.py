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
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests

logger = logging.getLogger(__name__)

CONFIG_PATH = Path("data/plugins/matriz-led/config.json")
REQUEST_TIMEOUT_SECONDS = 15

# Confirmado en hardware real contra una pantalla iPixel Color 16x32 --
# hasta que este plugin sepa leer las dimensiones reales del dispositivo
# (requiere decodificar la respuesta de "device info", que el relay del
# firmware todavía no expone), esta es la única resolución soportada.
DEFAULT_CHAR_HEIGHT = 16


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
    }


def save_config(ip: str, username: str, password: Optional[str]) -> Dict[str, Any]:
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


def get_status() -> Dict[str, Any]:
    config = _read_config()
    if not config.get("ip"):
        return {"configured": False, "connected": False, "reason": "not_configured"}
    try:
        response = requests.get(f"{_base_url()}/api/ble/status", timeout=REQUEST_TIMEOUT_SECONDS)
        response.raise_for_status()
        data = response.json()
        return {"configured": bool(data.get("configured")), "connected": bool(data.get("connected"))}
    except requests.RequestException:
        logger.exception("No se pudo consultar el estado BLE del accesorio")
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


def send_text(
    text: str,
    color: str = "ffffff",
    animation: int = 0,
    speed: int = 80,
    rainbow_mode: int = 0,
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
        char_height=DEFAULT_CHAR_HEIGHT,
        color=color,
        animation=animation,
        speed=speed,
        rainbow_mode=rainbow_mode,
    )
    windows = [window.data for window in plan.windows]
    return send_windows(windows)
