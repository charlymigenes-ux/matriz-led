"""Matriz LED -- configura el accesorio ESP32 (relay BLE) y manda mensajes
a la pantalla. Ver backend/services/screen_service.py para el detalle del
protocolo y por qué las llamadas de red van en un hilo aparte (una ventana
puede tardar hasta unos segundos en confirmar el ack BLE del lado del
firmware, y no queremos bloquear el loop de eventos de NOPAL mientras
tanto)."""

import asyncio
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException

from backend.auth_deps import require_auth, require_role

from .services import screen_service

router = APIRouter()


@router.get("/api/plugins/matriz-led/config")
async def get_config_endpoint(user: dict = Depends(require_auth)):
    return screen_service.get_config()


@router.post("/api/plugins/matriz-led/config")
async def save_config_endpoint(payload: Dict[str, Any], user: dict = Depends(require_role("admin"))):
    try:
        return screen_service.save_config(
            str(payload.get("ip") or ""),
            str(payload.get("username") or ""),
            payload.get("password") or None,
            payload.get("auto_alerts") if "auto_alerts" in payload else None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/api/plugins/matriz-led/status")
async def get_status_endpoint(user: dict = Depends(require_auth)):
    return await asyncio.to_thread(screen_service.get_status)


@router.get("/api/plugins/matriz-led/machines")
async def list_machines_endpoint(user: dict = Depends(require_auth)):
    """Snapshot normalizado de todas las máquinas -- el propio JS del
    plugin lo consulta para detectar solo, del lado del navegador, cuándo
    avisar (trabajo terminado/error). Ver screen_service.list_machines()."""
    return {"machines": await screen_service.list_machines()}


@router.post("/api/plugins/matriz-led/text")
async def send_text_endpoint(payload: Dict[str, Any], user: dict = Depends(require_auth)):
    text = str(payload.get("text") or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Falta el texto a mostrar")

    try:
        result = await asyncio.to_thread(
            screen_service.send_text,
            text,
            str(payload.get("color") or "ffffff"),
            int(payload.get("animation") or 0),
            int(payload.get("speed") or 80),
            int(payload.get("rainbow_mode") or 0),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not result.get("success"):
        raise HTTPException(status_code=502, detail=result)
    return result
