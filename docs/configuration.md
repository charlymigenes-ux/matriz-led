---
title: Matriz LED: configuración
status: draft
verified_against: "matriz-led@e6c62d8 (0.10.0) · nopal@4346f72"
---


# Configuración

## Panel FK-8Wa (solo administradores)

Pestaña **Panel FK-8Wa**:

1. Conecta el panel a tu red con la aplicación **FKShow**. NOPAL **no** configura la red ni el WiFi del panel, a propósito. Anota su IP.
2. Escribe la IP y pulsa **Probar conexión**: debe leer **96×16**.
3. Elige las máquinas **en orden** (P1, P2, P3…), el **brillo** (1 a 16) y activa el panel.

### Nombres cortos

En el panel, cada máquina usa un nombre corto de **hasta 4 caracteres**, que sale solo del nombre real (por ejemplo, «Klipper ET4» → «ET4», «TTS 55 PRO» → «TTS», «CNC 3018» → «CNC»). Se puede cambiar en la pestaña. Entran impresoras 3D, láseres y CNC.

### Calentando, en temperatura y enfriando

Solo para impresoras 3D que no imprimen (los láseres y las CNC no calientan):

- **Calentando:** hay temperatura objetivo y faltan más de 3 °C. Muestra temperatura actual/objetivo con una barra.
- **En temperatura:** llegó a menos de 3 °C y espera. La pantalla se mantiene hasta que se mande imprimir o se apague el calentador.
- **Enfriando:** el calentador está apagado (objetivo 0) y aún pasa de 50 °C. Al llegar a 50 °C vuelve a lo normal.

## iPixel Color (BLE)

La IP y las credenciales del accesorio ESP32 se configuran desde el ícono ⚙ de la sección **Matriz LED**. Los colores guardados del editor se guardan en el **navegador** (`localStorage`), no en el servidor.

## Archivos que crea el plugin

Bajo `data/plugins/matriz-led/`:

| Archivo | Contenido |
|---|---|
| `config.json` | Configuración de la iPixel |
| `announcements.json` | Anuncios guardados |
| `last_sent.json`, `last_sent_history.json` | Último envío e historial |
| `machine_alerts.json` | Alertas por máquina |
| `fk8wa.json` | Configuración del FK-8Wa |
| `fk8wa_message.json` | Mensaje especial del FK-8Wa |
| `fk8wa_effects_tested.json` | Efectos probados del FK-8Wa |
