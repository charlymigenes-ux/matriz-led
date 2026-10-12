# Plan técnico: panel FK-8Wa en el plugin Matriz LED (Fase 2)

- **Spec:** `specs/fk8wa-panel.md` (aprobada 2026-10-11).
- **Estado:** aprobado el 2026-10-11 (Fase 2).

## 1. Dónde se trabaja

| Repositorio | Rama | Qué va ahí |
|---|---|---|
| `matriz-led` (plugin) | `feat/fk8wa-panel`, en un clon de trabajo `~/matriz-led-dev` | Todo el driver, las pantallas, la máquina de estados, la API y la interfaz |
| NOPAL | `dev-main` | Solo el gancho de ciclo de vida (§5) y la acción de IA (§6) |

No se trabaja en `~/nopal/plugins/matriz-led` (es la copia instalada que usa NOPAL en vivo). Para la prueba con el
panel real se instala la rama desde la Galería o se actualiza esa copia, con tu visto bueno.

## 2. Arquitectura en capas (todo dentro del plugin)

```
backend/
  router.py                     + rutas /api/plugins/matriz-led/fk8wa/*  + on_startup / on_shutdown
  services/
    screen_service.py           (iPixel, sin cambios salvo el puente de reglas, §4.8)
    fk8wa/
      __init__.py
      protocol.py               capa 1: marcos FK, lectura, info 01 09, subida, brillo. Sin estado global.
      program.py                capa 2: generador de programas (Subtítulos), plantillas, bits por página
      templates/
        template_long.bin       copiados tal cual de reference/
        template_border.bin
      pixelfont.py              capa 3a: fuentes de píxeles en código, medir y dibujar texto
      screens.py                capa 3b: las 12 pantallas (Pillow modo "1", 96x16)
      state_machine.py          capa 4: elige pantalla y datos a partir de las máquinas (función pura + reloj)
      config.py                 configuración fk8wa.json (validación, escritura atómica)
      messages.py               mensaje especial vigente (texto, origen, vence_a), persistido
      runner.py                 capa 5: ciclo de fondo, política de envío, reintentos, estado
frontend/
  matriz-led.js / .css          + pestaña "Panel FK-8Wa": estado, vista previa, configuración, mensaje
tests/
  fk8wa/                        pruebas sin panel (socket simulado)
  fixtures/fk8wa/               vista previa reaprobada (PNG por pantalla) para comparar píxel a píxel
```

Dependencias entre capas: `runner → state_machine, screens, program, protocol, config, messages`;
`screens → pixelfont`; `program` y `protocol` no conocen a NOPAL. Ninguna capa importa `pypixelcolor`.

## 3. Qué se reutiliza de `reference/` y qué no

| Pieza de la referencia | Destino | Cómo |
|---|---|---|
| `build_scroll`, `Layout`, `PLAIN`, `BORDERED`, `_rtf`, `border_block`, constantes de offsets | `program.py` | **Copia literal** (solo nombres y comentarios en español donde falten). Probado byte a byte. |
| `screen_program` | `program.py` | Copia literal. |
| `fk`, `read_frame`, `panel_info`, `send_program`, `set_brightness` | `protocol.py` | **Se reescriben** para: recibir la conexión inyectada (pruebas), validar códigos de respuesta, timeouts por lectura, `read_frame` sin bucle infinito si el panel cierra a la mitad, y **verificar 96×16** antes de enviar (no existe en la referencia). |
| `screens.py` (cactus, iconos 8×8, distribución) | `screens.py` | Se conservan cactus, iconos y zonas; el texto se dibuja con `pixelfont` en lugar de TTF. |
| `fontpath.py`, fuentes TTF | — | No se usan (decisión D3). |
| `build_program` / `template.bin` (programa fijo de 12 filas) | — | No se usa (RF5). |
| Servidor HTTP, página, biblioteca, reloj, rotación, `scan_panels`, `config.json` | — | Fuera de alcance. |
| `tools/verify_long.py`, `verify_border.py`, `test_effects.py` | `tests/fk8wa/` | Portadas a pytest. |

## 4. Diseño de cada pieza

### 4.1 `protocol.py`
- `class Fk8waClient(connect=socket.create_connection)` con métodos `info()`, `upload(program)`, `brightness(level)`.
- Cada método abre **su** sesión, la usa y la cierra (el panel atiende una sola). El `Lock` está en el runner (§4.7),
  no aquí, para que las pruebas puedan simular concurrencia.
- `upload()`: `info()` en la misma sesión → si `(width, height) != (96, 16)` lanza `SizeMismatch(width, height)` sin
  haber enviado `01 02`.
- Respuestas validadas contra `PROTOCOL.md` §2 (`01 21 00 00`, `01 21 03 00 + offset`, `01 38 + total`); cualquier otra
  → `ProtocolError`. Timeouts: conexión 3 s, lectura 5 s; la subida completa se corta a los 30 s.
- `info()` devuelve solo `ip, port, width, height` (nunca SSID ni claves).

### 4.2 `program.py`
- API: `screen_program(img) -> bytes` (1 página, Static `(1, 0)`) y `build_scroll(...)` para las pruebas byte a byte.
- Las plantillas se leen una vez con `importlib.resources`/ruta relativa al módulo.

### 4.3 `pixelfont.py`
- Glifos definidos como cadenas de `#`/`.` (mismo estilo que los iconos de la referencia), sin TTF.
- Tres tamaños, a afinar con la vista previa:
  - **pequeña 5×7** (dos renglones caben en 16 filas: 7 + 1 + 7);
  - **mediana** (~6×9) para porcentajes y "3 IDLE";
  - **grande** (~7×12) para "NOPAL" y "P1".
- Juego de caracteres: `A–Z Ñ 0–9 % : . - _ / !` y espacio. Minúsculas se muestran en mayúsculas; un carácter sin glifo
  se reemplaza por `?` y se registra una vez en el log.
- `text_width(text, font)` y `draw_text(img, x, y, text, font)` deterministas (sin suavizado).

### 4.4 `screens.py`
- `render(name, data) -> Image("1", 96x16)`; mismas 12 funciones y `DEFAULTS` que la referencia.
- Acortado predecible (RF9): versión corta definida por pantalla; si aún no cabe, recorte por caracteres (nunca a la
  mitad de un glifo).

### 4.5 `state_machine.py`
- `select(machines, selected_ids, now, memory) -> (name, data)`, **sin E/S**. `memory` guarda: arranque, alternancia
  print1/print2 (15 s), terminado reciente (60 s), mensaje vigente.
- Implementa RF12 tal cual, con la prioridad aprobada.

### 4.6 `config.py` y `messages.py`
- `data/plugins/matriz-led/fk8wa.json`: `enabled, ip, brightness, machines[], min_interval_s (15, ≥10),
  view_seconds (15), done_seconds (60)`. Validación estricta (IP v4, rangos) y escritura atómica, como `screen_service`.
- `data/plugins/matriz-led/fk8wa_message.json`: `{text, source, expires_at}`; si vence, se ignora.

### 4.7 `runner.py`
- Una tarea `asyncio` iniciada por `on_startup()` del plugin y detenida por `on_shutdown()`.
- Cada 5 s: `list_machines()` → `state_machine.select` → `screens.render` (en `to_thread`) → si la imagen cambió y pasó
  el intervalo mínimo → `upload` (en `to_thread`, bajo un `asyncio.Lock` único del driver).
- Errores: `SizeMismatch` → estado `size_mismatch`, sin reintentos automáticos hasta que cambie la configuración o se
  pulse "Probar conexión"; sin respuesta → reintentos 15/30/60/120/300 s; al reconectar reenvía el brillo (R4).
- `on_shutdown()`: si hay una subida en curso, espera hasta 5 s; luego intenta `off` con un tope de 5 s.
- Estado en memoria para `/status`: conexión, pantalla actual, último envío, último error, próximo reintento.

### 4.8 Mensaje especial: fuentes
- **Texto libre:** `POST /fk8wa/message` (`{text, minutes}`), `DELETE /fk8wa/message`.
- **Anuncio:** `POST /fk8wa/message` con `{announcement_id}` → usa el **nombre** del anuncio.
- **Reglas:** campo nuevo `fk8wa: bool` en cada regla; `run_rule` (que ya existe) también publica el nombre del anuncio
  como mensaje. Aviso: hoy las reglas `idle_timeout` y `material_low` las detecta el **navegador**; esta tarea no lo
  cambia.
- **IA:** acción nueva en NOPAL core (§6, opción a).

## 5. Gancho en NOPAL core

- `plugin_loader_service.load_installed_plugin_routers`: además del `router`, guarda `on_startup` / `on_shutdown` si el
  módulo de entrada los define.
- `main.py`: tras cargar los routers, `await` de cada `on_startup` (con try/except y log); en el `shutdown` existente,
  `await` de cada `on_shutdown` con tope de 5 s cada uno.
- Tests en `backend/tests/test_plugin_loader.py`: llama a los ganchos, un gancho que falla no rompe el arranque ni a
  los demás, un plugin sin ganchos sigue igual, los tiempos máximos se respetan.
- Entrada en `docs/SDD.md` de NOPAL.

## 6. Mensaje desde NOPAL Intelligence (decidido: opción a)

Las acciones de IA de la Matriz LED viven en NOPAL core (`backend/services/ai_actions.py`) y llaman al plugin con
`get_loaded_plugin_module`. Opciones:

- **(a) Acción nueva en core** `show_panel_message(text, minutes)`, riesgo bajo, `USE_PLUGIN` sobre `matriz-led`, con
  tests. Permite texto libre.
- **(b) Sin cambio en core:** cuando la IA envía un anuncio con la acción existente `send_matrix_announcement`, el
  plugin también muestra su nombre en el FK-8Wa (si se marca en la configuración). Solo anuncios ya creados.

## 7. API nueva del plugin

| Método y ruta | Rol | Qué hace |
|---|---|---|
| `GET /api/plugins/matriz-led/fk8wa/status` | sesión | Estado del panel y pantalla actual |
| `GET /api/plugins/matriz-led/fk8wa/preview?screen=<nombre>` | sesión | PNG 96×16 escalado (actual o de ejemplo); no toca el panel |
| `GET/PUT /api/plugins/matriz-led/fk8wa/config` | GET sesión, PUT admin | Configuración |
| `POST /api/plugins/matriz-led/fk8wa/test` | admin | Solo `01 09`: IP, puerto, tamaño |
| `POST /api/plugins/matriz-led/fk8wa/brightness` | admin | Brillo 1..16 |
| `POST/DELETE /api/plugins/matriz-led/fk8wa/message` | sesión (operador) | Mensaje especial |

## 8. Dependencias nuevas

Ninguna. Pillow ya está en NOPAL. El FK-8Wa no usa `pypixelcolor`.

## 9. Estrategia de pruebas (sin panel)

1. **Byte a byte:** `build_scroll` reproduce `template_long.bin` y `template_border.bin` (portado de `verify_*.py`).
2. **Protocolo con socket simulado:** secuencia correcta, checksum `00`, respuestas inesperadas → error, panel que
   cierra a la mitad, timeouts, **tamaño 288×16 → ningún `01 02` enviado**.
3. **Pantallas:** las 12 a 96×16 iguales píxel a píxel a `tests/fixtures/fk8wa/*.png` (reaprobadas); textos largos no
   se salen; caracteres sin glifo.
4. **Máquina de estados:** tabla con cada fila de RF12 y combinaciones de prioridad; alternancia de 15 s y terminado de
   60 s con reloj simulado.
5. **Runner:** límite de envíos (CA6), una sola sesión con envíos concurrentes (CA5), reintentos con espera (CA4),
   `size_mismatch` detiene envíos (CA3), apagado.
6. **API y permisos:** operador 403 en configuración y brillo; operador puede mandar y borrar el mensaje (CA8).
7. **Gancho de core:** tests en NOPAL (§5).
8. Ninguna prueba abre red real (los tests del plugin corren con el sandbox de NOPAL vía `NOPAL_CORE_ROOT`).

## 10. Orden de trabajo (detalle en la Fase 3)

`program` (byte a byte) → `protocol` (socket simulado) → `pixelfont` + `screens` (**vista previa para tu
reaprobación**) → `state_machine` → `config` / `messages` → gancho en NOPAL → `runner` → API → interfaz → reglas /
anuncios / IA → checklist con el panel real.
