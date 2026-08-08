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


@router.get("/api/plugins/matriz-led/text-sizes")
async def list_text_sizes_endpoint(user: dict = Depends(require_auth)):
    """Alturas de carácter soportadas por las fuentes de pypixelcolor, para
    el selector de tamaño del panel -- ver el comentario de
    SUPPORTED_CHAR_HEIGHTS en screen_service.py sobre por qué solo 16 está
    confirmado en esta pantalla física."""
    return {
        "sizes": list(screen_service.SUPPORTED_CHAR_HEIGHTS),
        "recommended": screen_service.DEFAULT_CHAR_HEIGHT,
    }


@router.post("/api/plugins/matriz-led/text")
async def send_text_endpoint(payload: Dict[str, Any], user: dict = Depends(require_auth)):
    text = str(payload.get("text") or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Falta el texto a mostrar")

    char_height = int(payload.get("char_height") or screen_service.DEFAULT_CHAR_HEIGHT)
    if char_height <= 0:
        raise HTTPException(status_code=400, detail="Tamaño de texto inválido")

    try:
        result = await asyncio.to_thread(
            screen_service.send_text,
            text,
            str(payload.get("color") or "ffffff"),
            int(payload.get("animation") or 0),
            int(payload.get("speed") or 80),
            int(payload.get("rainbow_mode") or 0),
            char_height,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not result.get("success"):
        raise HTTPException(status_code=502, detail=result)
    return result


@router.post("/api/plugins/matriz-led/image")
async def send_image_endpoint(payload: Dict[str, Any], user: dict = Depends(require_auth)):
    """Manda el patrón dibujado en el editor de píxeles del panel tal cual
    (ver send_matrix en screen_service.py) -- a diferencia de /text, esto
    no pasa por ninguna fuente tipográfica. Cada celda de la matriz trae
    su propio color (o "" si está apagada)."""
    matrix = payload.get("matrix")
    if not isinstance(matrix, list) or not matrix:
        raise HTTPException(status_code=400, detail="Falta la matriz de píxeles")

    try:
        result = await asyncio.to_thread(
            screen_service.send_matrix,
            matrix,
            bool(payload.get("animate_col")),
            bool(payload.get("animate_row")),
            int(payload.get("speed") or 80),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not result.get("success"):
        raise HTTPException(status_code=502, detail=result)
    return result


# ── Anuncios (Editor de Anuncios) ──

@router.get("/api/plugins/matriz-led/announcements")
async def list_announcements_endpoint(user: dict = Depends(require_auth)):
    return {"announcements": screen_service.list_announcements()}


@router.get("/api/plugins/matriz-led/announcements/{announcement_id}")
async def get_announcement_endpoint(announcement_id: str, user: dict = Depends(require_auth)):
    try:
        return screen_service.get_announcement(announcement_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/api/plugins/matriz-led/announcements")
async def create_announcement_endpoint(payload: Dict[str, Any], user: dict = Depends(require_auth)):
    try:
        return screen_service.create_announcement(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.put("/api/plugins/matriz-led/announcements/{announcement_id}")
async def update_announcement_endpoint(
    announcement_id: str, payload: Dict[str, Any], user: dict = Depends(require_auth)
):
    try:
        return screen_service.update_announcement(announcement_id, payload)
    except ValueError as exc:
        status_code = 404 if "no encontrado" in str(exc) else 400
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc


@router.delete("/api/plugins/matriz-led/announcements/{announcement_id}")
async def delete_announcement_endpoint(announcement_id: str, user: dict = Depends(require_auth)):
    try:
        screen_service.delete_announcement(announcement_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"success": True}


@router.post("/api/plugins/matriz-led/announcements/{announcement_id}/send")
async def send_announcement_endpoint(announcement_id: str, source: str = "", user: dict = Depends(require_auth)):
    try:
        result = await asyncio.to_thread(screen_service.send_announcement, announcement_id, source or None)
    except ValueError as exc:
        status_code = 404 if "no encontrado" in str(exc) else 400
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc

    if not result.get("success"):
        raise HTTPException(status_code=502, detail=result)
    return result


# ── Panel principal ──

@router.get("/api/plugins/matriz-led/device-info")
async def get_device_info_endpoint(user: dict = Depends(require_auth)):
    return await asyncio.to_thread(screen_service.get_device_info)


@router.get("/api/plugins/matriz-led/last-sent")
async def get_last_sent_endpoint(user: dict = Depends(require_auth)):
    return {"last_sent": screen_service.get_last_sent()}


@router.get("/api/plugins/matriz-led/last-sent-history")
async def get_last_sent_history_endpoint(user: dict = Depends(require_auth)):
    """Quién mandó los últimos envíos a la pantalla (nombre de máquina o de
    anuncio) -- para el "ticker" del dock del Panel de Control en el core.
    Más reciente primero."""
    return {"history": screen_service.get_last_sent_history()}


@router.get("/api/plugins/matriz-led/last-error")
async def get_last_error_endpoint(user: dict = Depends(require_auth)):
    return {"last_error": screen_service.get_last_error()}


@router.get("/api/plugins/matriz-led/stats")
async def get_stats_endpoint(user: dict = Depends(require_auth)):
    return screen_service.get_stats()


# ── Reglas de automatización ──

@router.get("/api/plugins/matriz-led/rules")
async def list_rules_endpoint(user: dict = Depends(require_auth)):
    return {"rules": screen_service.list_rules()}


@router.post("/api/plugins/matriz-led/rules")
async def create_rule_endpoint(payload: Dict[str, Any], user: dict = Depends(require_auth)):
    try:
        return screen_service.create_rule(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.put("/api/plugins/matriz-led/rules/{rule_id}")
async def update_rule_endpoint(rule_id: str, payload: Dict[str, Any], user: dict = Depends(require_auth)):
    try:
        return screen_service.update_rule(rule_id, payload)
    except ValueError as exc:
        status_code = 404 if "no encontrada" in str(exc) else 400
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc


@router.delete("/api/plugins/matriz-led/rules/{rule_id}")
async def delete_rule_endpoint(rule_id: str, user: dict = Depends(require_auth)):
    try:
        screen_service.delete_rule(rule_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"success": True}


@router.post("/api/plugins/matriz-led/rules/{rule_id}/run")
async def run_rule_endpoint(rule_id: str, user: dict = Depends(require_auth)):
    try:
        result = await asyncio.to_thread(screen_service.run_rule, rule_id)
    except ValueError as exc:
        status_code = 404 if "no encontrad" in str(exc) else 400
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc

    if not result.get("success"):
        raise HTTPException(status_code=502, detail=result)
    return result


# ── Alertas por máquina ──

@router.get("/api/plugins/matriz-led/machine-alerts")
async def list_machine_alerts_endpoint(user: dict = Depends(require_auth)):
    return {"machine_alerts": screen_service.list_machine_alerts()}


@router.get("/api/plugins/matriz-led/machine-alerts/{machine_id}")
async def get_machine_alerts_endpoint(machine_id: str, user: dict = Depends(require_auth)):
    return screen_service.get_machine_alerts(machine_id)


@router.put("/api/plugins/matriz-led/machine-alerts/{machine_id}")
async def save_machine_alerts_endpoint(machine_id: str, payload: Dict[str, Any], user: dict = Depends(require_auth)):
    try:
        return screen_service.save_machine_alerts(machine_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
