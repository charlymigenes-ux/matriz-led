---
title: Matriz LED: API
status: draft
verified_against: "matriz-led@e6c62d8 (0.10.0) · nopal@4346f72"
generated: true
---

# Matriz LED: API

> Página **generada** desde el código del plugin. No la edites a mano.

Prefijo(s) de ruta: `/api/plugins` · 40 rutas (Sesión (admin u operador): 35; Solo admin: 5; Pública: 0).

| Método | Ruta | Acceso | Política | Descripción |
|---|---|---|---|---|
| GET | `/api/plugins/matriz-led/announcements` | Sesión (admin u operador) | — | — |
| POST | `/api/plugins/matriz-led/announcements` | Sesión (admin u operador) | — | — |
| GET | `/api/plugins/matriz-led/announcements/{announcement_id}` | Sesión (admin u operador) | — | — |
| PUT | `/api/plugins/matriz-led/announcements/{announcement_id}` | Sesión (admin u operador) | — | — |
| DELETE | `/api/plugins/matriz-led/announcements/{announcement_id}` | Sesión (admin u operador) | — | — |
| POST | `/api/plugins/matriz-led/announcements/{announcement_id}/send` | Sesión (admin u operador) | — | — |
| GET | `/api/plugins/matriz-led/config` | Sesión (admin u operador) | — | — |
| POST | `/api/plugins/matriz-led/config` | Solo admin | — | — |
| GET | `/api/plugins/matriz-led/device-info` | Sesión (admin u operador) | — | — |
| POST | `/api/plugins/matriz-led/fk8wa/brightness` | Solo admin | — | — |
| GET | `/api/plugins/matriz-led/fk8wa/config` | Sesión (admin u operador) | — | — |
| PUT | `/api/plugins/matriz-led/fk8wa/config` | Solo admin | — | — |
| GET | `/api/plugins/matriz-led/fk8wa/effects` | Sesión (admin u operador) | — | Catálogo de efectos de entrada (con cuáles están probados) y las situaciones. |
| POST | `/api/plugins/matriz-led/fk8wa/effects/test` | Solo admin | — | "Probar en mi panel": manda un ejemplo con el efecto unos segundos y luego restaura. |
| GET | `/api/plugins/matriz-led/fk8wa/frames` | Sesión (admin u operador) | — | Páginas del panel como datos (1 bit por LED) para dibujarlas en la pestaña. |
| GET | `/api/plugins/matriz-led/fk8wa/machines` | Sesión (admin u operador) | — | Máquinas conocidas con su nombre corto para el panel. |
| GET | `/api/plugins/matriz-led/fk8wa/message` | Sesión (admin u operador) | — | — |
| POST | `/api/plugins/matriz-led/fk8wa/message` | Sesión (admin u operador) | — | Texto libre o un anuncio (se muestra su nombre). Operador y admin. |
| DELETE | `/api/plugins/matriz-led/fk8wa/message` | Sesión (admin u operador) | — | — |
| GET | `/api/plugins/matriz-led/fk8wa/preview` | Sesión (admin u operador) | — | — |
| GET | `/api/plugins/matriz-led/fk8wa/scroll-preview` | Sesión (admin u operador) | — | Cómo correría un texto, para la prueba de la pestaña (no toca el panel). |
| GET | `/api/plugins/matriz-led/fk8wa/status` | Sesión (admin u operador) | — | — |
| POST | `/api/plugins/matriz-led/fk8wa/test` | Solo admin | — | Solo lectura (01 09): IP, puerto y tamaño. Nunca SSID ni claves. |
| POST | `/api/plugins/matriz-led/image` | Sesión (admin u operador) | — | Manda el patrón dibujado en el editor de píxeles del panel tal cual (ver send_matrix en screen_service.py) -- a diferencia de /text, esto n… |
| GET | `/api/plugins/matriz-led/last-error` | Sesión (admin u operador) | — | — |
| GET | `/api/plugins/matriz-led/last-sent` | Sesión (admin u operador) | — | — |
| GET | `/api/plugins/matriz-led/last-sent-history` | Sesión (admin u operador) | — | Quién mandó los últimos envíos a la pantalla (nombre de máquina o de anuncio) -- para el "ticker" del dock del Panel de Control en el core.… |
| GET | `/api/plugins/matriz-led/machine-alerts` | Sesión (admin u operador) | — | — |
| GET | `/api/plugins/matriz-led/machine-alerts/{machine_id}` | Sesión (admin u operador) | — | — |
| PUT | `/api/plugins/matriz-led/machine-alerts/{machine_id}` | Sesión (admin u operador) | — | — |
| GET | `/api/plugins/matriz-led/machines` | Sesión (admin u operador) | — | Snapshot normalizado de todas las máquinas -- el propio JS del plugin lo consulta para detectar solo, del lado del navegador, cuándo avisar… |
| GET | `/api/plugins/matriz-led/rules` | Sesión (admin u operador) | — | — |
| POST | `/api/plugins/matriz-led/rules` | Sesión (admin u operador) | — | — |
| PUT | `/api/plugins/matriz-led/rules/{rule_id}` | Sesión (admin u operador) | — | — |
| DELETE | `/api/plugins/matriz-led/rules/{rule_id}` | Sesión (admin u operador) | — | — |
| POST | `/api/plugins/matriz-led/rules/{rule_id}/run` | Sesión (admin u operador) | — | — |
| GET | `/api/plugins/matriz-led/stats` | Sesión (admin u operador) | — | — |
| GET | `/api/plugins/matriz-led/status` | Sesión (admin u operador) | — | — |
| POST | `/api/plugins/matriz-led/text` | Sesión (admin u operador) | — | — |
| GET | `/api/plugins/matriz-led/text-sizes` | Sesión (admin u operador) | — | Alturas de carácter soportadas por las fuentes de pypixelcolor, para el selector de tamaño del panel -- ver el comentario de SUPPORTED_CHAR… |

El acceso mostrado es el declarado en cada ruta (`require_auth`, `require_role("admin")`). Una comprobación de rol dentro del cuerpo de la función no se detecta.
