---
title: Matriz LED: visión general
status: draft
verified_against: "matriz-led@e6c62d8 (0.10.0) · nopal@4346f72"
---


# Matriz LED

Conecta NOPAL con pantallas LED tipo matriz y les envía texto y animaciones según el estado de tus máquinas. Soporta dos pantallas, cada una con su propia configuración y estado:

| Pantalla | Conexión | Notas |
|---|---|---|
| **iPixel Color 16×32** (BLE, a color) | Bluetooth, a través de un accesorio ESP32 | El README indica que está **probado contra una iPixel Color 16×32** |
| **FK-8Wa 96×16** (monocromo, 3 módulos P10 de 32×16) | Red, TCP al puerto 5858 | Desde la versión 0.10.0 |

## Qué hace

- **Panel principal** con escenas rápidas, automatizaciones (inactividad, material bajo) y alertas por máquina.
- **Editor de anuncios** para la iPixel: dibujo de 16×32 con **color por píxel**, herramientas (lápiz, borrador, línea, rectángulo, elipse, cubeta, gotero, importar imagen, texto), 9 plantillas del sistema y un selector de color. Los anuncios se guardan y se pueden enviar cuando quieras.
- **Aviso automático** opcional cuando un trabajo termina o falla: compara el estado de las máquinas con el último visto y envía OK o ERR solo en la transición.
- **Saludo automático**: al conectarse la pantalla por BLE muestra «NOPAL» en verde.
- **Panel FK-8Wa**: 12 pantallas (arranque, todo normal, impresión, varias, pausa, error, desconectada, todas detenidas, terminado, mensaje especial, apagado) con un sistema de prioridades.

## Cómo decide qué mostrar el FK-8Wa

De mayor a menor prioridad:

1. **Error y pausa**: una vista por cada máquina afectada; tapan todo lo demás.
2. **Mensaje especial.**
3. **Terminado** (60 s).
4. **Trabajando** (una vista por máquina, con archivo, barra y porcentaje; con dos o más activas, «varias»), junto con una vista por cada máquina que calienta, está en temperatura, enfría o está **desconectada**. Estas últimas no tapan nada: entran en el ciclo.
5. **Todo normal / todas en reposo** (alternan cada 15 s).

«Apagado» se muestra al detener NOPAL. La pantalla de error dice «ERROR»: el estado de las máquinas no trae el texto del error.

## Documentos relacionados

- [Instalación](installation.md) · [Configuración](configuration.md) · [Hardware](hardware.md) · [API](api.md) · [Solución de problemas](troubleshooting.md)
- Especificaciones del panel FK-8Wa en la carpeta `specs/` del repositorio.
