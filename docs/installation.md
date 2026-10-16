---
title: Matriz LED: instalación
status: draft
verified_against: "matriz-led@e6c62d8 (0.10.0) · nopal@4346f72"
---


# Instalación

## Requisitos

| Requisito | Detalle |
|---|---|
| **Python 3.10 o superior** en el equipo que ejecuta NOPAL | El manifiesto declara `python_requires: ">=3.10"`: NOPAL **no instala ni carga** el plugin en un Python más viejo. `pypixelcolor` declara soportar 3.9, pero falla al importarse en esa versión |
| Biblioteca **`pypixelcolor`** | Se instala **a mano** en el mismo entorno Python que ejecuta NOPAL. No hay un mecanismo de dependencias por plugin |
| Un accesorio **ESP32** con el firmware de NOPAL | Solo para la iPixel (BLE). Ver [Hardware](hardware.md) |

## Pasos

1. Instala el plugin desde **Configuración → Galería de plugins → Matriz LED → Instalar**. Si ya tienes Python 3.10 o superior, el instalador lo permite.
2. Instala la biblioteca en el entorno de NOPAL:

```bash
pip install pypixelcolor
```

3. **Reinicia NOPAL.** El backend del plugin solo se carga al arrancar.
4. Para la **iPixel**: configura la IP y las credenciales del accesorio ESP32 desde la sección «Matriz LED» (el ícono ⚙ del encabezado). Son las mismas credenciales que NOPAL ya usa con ese accesorio.
5. Para el **FK-8Wa**: sigue [Configuración](configuration.md).
