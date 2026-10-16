---
title: Matriz LED: hardware
status: draft
verified_against: "matriz-led@e6c62d8 (0.10.0) · nopal@4346f72"
---


# Hardware

## iPixel Color 16×32 (BLE)

La pantalla **no se conecta directo a NOPAL**: el Bluetooth tiene poco alcance y NOPAL puede correr en un servidor sin radio. En su lugar:

1. Un accesorio **ESP32** con el firmware de NOPAL se conecta por BLE a la pantalla y hace de **relé**: recibe bytes ya armados por HTTP (`POST /api/ble/window`, en hexadecimal) y los reenvía tal cual por BLE.
2. Este plugin arma esos bytes con la biblioteca **pypixelcolor** (fuentes, colores, animaciones, GIFs) y se los envía al ESP32 por WiFi.

Ninguna parte de NOPAL habla BLE directamente.

Requisitos del accesorio según el README: protocolo 4, firmware 4.4.0-ff o superior, con `NOPAL_BLE_SCREEN_MAC` configurado en su `secrets.h` con la MAC de tu pantalla.

:::caution Pendiente de confirmar
El README cita el sketch `firmware/nopal_accessory/Nopal_FF/Nopal_FF.ino` del repositorio de NOPAL. Esa ruta **ya no existe en el core**: el firmware se movió al plugin `arduino-accessories` (`firmware/nopal_accessory/`). Hay que confirmar qué sketch actual equivale a `Nopal_FF.ino` y corregir el README.
:::

### Efectos de entrada

Solo se ofrecen **Estático** y **Parpadeo**: son los únicos códigos de animación de `pypixelcolor` validados en hardware real. Enviar un código equivocado puede incluso provocar un *bootloop* en el dispositivo.

## FK-8Wa 96×16

- Panel monocromo (blanco) de **96×16**, con controlador **FK-8Wa** y 3 módulos P10 de 32×16.
- Debe estar en la **misma red** que NOPAL; se controla por **TCP al puerto 5858**.
- La red y el WiFi del panel se configuran con **FKShow**, no desde NOPAL.
- Convive con la iPixel: cada una tiene su configuración y su estado.
