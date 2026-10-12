# Spec: panel LED FK-8Wa (96×16) en el plugin Matriz LED

- **Estado:** aprobada el 2026-10-11 (Fase 1). No hay código todavía.
- **Repositorio destino:** `matriz-led` (plugin de NOPAL). Un cambio mínimo en NOPAL core (gancho de ciclo de vida, §5.7).
- **Fuente de verdad del protocolo:** `docs/PROTOCOL.md` y `reference/` de este paquete.
- **Fecha:** 2026-10-11.

## 1. Objetivo

Que NOPAL muestre el estado de las máquinas elegidas en un panel físico FK-8Wa de 96×16 (monocromo, rojo), con las
12 pantallas del mockup (`docs/mockup_pantallas_nopal.webp`). El panel debe actualizarse solo, aunque nadie tenga
NOPAL abierto, sin afectar a NOPAL si el panel no responde.

## 2. Alcance

1. Driver FK-8Wa dentro del plugin: TCP al panel (IP configurable, puerto 5858), lectura de información `01 09`,
   subida de programas, brillo.
2. Generador de programas reutilizado de `reference/dash.py`, verificado byte a byte contra las plantillas.
3. Las 12 pantallas NOPAL dibujadas con una **fuente de píxeles definida en el código** (sin TTF).
4. Máquina de estados que elige la pantalla a partir del estado real de las máquinas elegidas.
5. Proceso de fondo en el backend del plugin, con política de envío limitada.
6. Configuración, estado, errores y vista previa en la interfaz del plugin.
7. Mensaje especial desde: texto libre, anuncios existentes, reglas del plugin y NOPAL Intelligence.
8. Gancho mínimo en NOPAL core para que un plugin arranque y detenga tareas de fondo.
9. Convivencia con la pantalla iPixel actual: las dos funcionan a la vez, sin cambios para la iPixel.

## 3. Fuera de alcance

- Configurar la red o el Wi-Fi del panel (se hace con FKShow). Descubrimiento UDP.
- Cambiar los parámetros de pantalla del panel (tamaño, tipo de módulo).
- Brillo programado por horas (`0x14`) y cualquier comando no verificado en `PROTOCOL.md`.
- El dash HTTP de `reference/dash.py` (servidor, página web, biblioteca, reloj, rotación de mensajes propios).
- Más de un panel FK-8Wa.
- Puente remoto ("panel-gateway"): el panel está en la misma red del taller que NOPAL.
- Quitar la restricción `python_requires >=3.10` del plugin (la impone `pypixelcolor`; ver riesgo R6).

## 4. Decisiones tomadas (Fase 0)

| # | Decisión |
|---|---|
| D1 | NOPAL y el panel están en la misma red: el driver vive dentro del plugin, sin puente. |
| D2 | Se reutiliza la lógica de `reference/` como módulo Python del plugin; no se reescribe el protocolo. |
| D3 | Fuente de píxeles definida en código (5×7 y tamaños necesarios). Las 12 pantallas se **reaprueban**. |
| D4 | Gancho de ciclo de vida en NOPAL core (`on_startup` / `on_shutdown` del plugin). |
| D5 | Las máquinas P1, P2, P3… las elige el admin, en orden, en la configuración del panel. |
| D6 | La pantalla "varias impresoras" muestra **solo las activas** (hasta 3). |
| D7 | Prioridad: error > pausa > desconectada > mensaje especial > terminado > impresión > normal / inactivas. |
| D8 | Vistas de impresión alternan cada 15 s; "terminado" dura 60 s. |
| D9 | Mensaje especial desde texto libre, anuncios, reglas y NOPAL Intelligence. |
| D10 | "Apagado" (HASTA PRONTO) se envía al detener NOPAL. |
| D11 | iPixel y FK-8Wa conviven; cada uno con su configuración y estado. |
| D12 | Configura el admin; el operador ve el estado y puede mandar el mensaje especial. |

## 5. Requisitos funcionales

### 5.1 Conexión y salud
- **RF1.** Toda sesión TCP abre con `01 09` y lee ancho y alto (offsets 12 y 14). **Si no es 96×16, no se envía nada**
  y el estado pasa a `size_mismatch` con el tamaño leído. (La referencia lee la información pero **no** compara el
  tamaño; esta protección es nueva.)
- **RF2.** Secuencia de subida: `01 09` → `01 02` → N × `01 1b` (trozos de 1000 B, checksum `00`) → `01 37` → `01 01`,
  validando que cada respuesta tenga el código esperado de `PROTOCOL.md` §2. Una respuesta inesperada aborta la subida.
- **RF3.** Brillo `01 15` con nivel 1..16 (fuera de rango se recorta).
- **RF4.** "Probar conexión" (admin): solo `01 09`, muestra IP, puerto y tamaño leídos; nunca SSID ni claves.

### 5.2 Programas
- **RF5.** Pantallas completas de 16 filas como programa de Subtítulos de 1 página con efecto Static `(1, 0)`
  (`screen_program` de la referencia). No se usa `template.bin` (solo 12 filas útiles).
- **RF6.** El generador reproduce byte a byte `template_long.bin` y `template_border.bin` (pruebas de
  `verify_long.py` / `verify_border.py` portadas al plugin).

### 5.3 Pantallas
- **RF7.** 12 pantallas: `boot, normal, print1, print2, many, pause, error, offline, idle, done, special, off`, con
  los datos `printer, file, pct, elapsed, time, online, total, error, msg, progress`, siguiendo la distribución del
  mockup (logo 0–15, nombre, separador, estado/info).
- **RF8.** Fuente de píxeles en código: el resultado es idéntico en cualquier sistema operativo.
- **RF9.** Textos que no caben se acortan de forma predecible (versión corta o recorte con criterio fijo); nunca se
  enciman ni se salen de 96×16.
- **RF10.** Vista previa: la interfaz muestra la imagen de 96×16 de la pantalla actual (y de cualquiera de las 12 con
  datos de ejemplo) sin necesidad del panel.

### 5.4 Máquina de estados
- **RF11.** Entradas: el estado de las máquinas elegidas (P1..Pn, en orden) del mismo origen que ya usa el plugin
  (`tunascreen_service.list_machines()`): `idle, heating, cooling, printing, paused, complete, error, offline`, archivo,
  porcentaje y tiempo transcurrido.
- **RF12.** Selección de pantalla, de mayor a menor prioridad:
  1. `boot` al arrancar, hasta tener el primer estado de máquinas (máximo 30 s).
  2. `error`: alguna elegida en error (la primera según el orden P).
  3. `pause`: alguna en pausa.
  4. `offline`: alguna desconectada.
  5. `special`: hay un mensaje especial vigente.
  6. `done`: una impresión acaba de terminar (transición a `complete` o fin del trabajo); 60 s y sigue.
  7. Impresión: una sola activa → alterna `print1` / `print2` cada 15 s; dos o más → `many` con hasta 3 activas.
  8. `idle`: todas las elegidas en línea y sin actividad.
  9. `normal`: el resto (por ejemplo calentando o enfriando).
- **RF13.** `off` (HASTA PRONTO) se envía al detener NOPAL, si da tiempo (máximo 5 s; no retrasa el apagado).
- **RF14.** Sin máquinas elegidas: `normal` con 0 en línea.

### 5.5 Política de envío
- **RF15.** Solo se envía si la imagen de 96×16 resultante **cambió** respecto a la última enviada con éxito.
- **RF16.** Intervalo mínimo entre envíos configurable (por omisión 15 s; mínimo permitido 10 s). Cambios dentro del
  intervalo se acumulan y se envía solo el último.
- **RF17.** El porcentaje de impresión puede avanzar sin provocar más de un envío por intervalo; la hora (minuto) de
  `normal` / `idle` provoca como máximo un envío por minuto.

### 5.6 Configuración, estado y errores
- **RF18.** Configuración (admin): activar/desactivar, IP, brillo, máquinas P1..Pn en orden, intervalo mínimo,
  duración de vistas (15 s) y de terminado (60 s). Guardada en `data/plugins/matriz-led/fk8wa.json`, escritura
  atómica.
- **RF19.** Estado visible (admin y operador): conectado / sin respuesta / tamaño incorrecto / desactivado, pantalla
  actual, último envío correcto, último error, próximo reintento.
- **RF20.** Sin respuesta del panel: reintentos con espera creciente (15 s, 30 s, 60 s… hasta 5 min), sin afectar a
  NOPAL ni a la iPixel.
- **RF21.** Mensaje especial: texto, duración (por omisión 5 min) y origen. Fuentes:
  - texto libre desde la interfaz (operador y admin);
  - anuncio existente (se muestra su **nombre** como texto);
  - regla del plugin cuando se dispara (`idle_timeout`, `material_low`), si se marca "también en el FK-8Wa";
  - NOPAL Intelligence: acción nueva "mostrar mensaje en el panel", sujeta a la Authorization Policy y a
    `actions_enabled`.
  - Un mensaje nuevo reemplaza al vigente; se puede borrar.

### 5.7 Gancho en NOPAL core
- **RF22.** Al cargar un plugin, si su módulo de entrada define `on_startup()` / `on_shutdown()` (async), NOPAL los llama
  al arrancar y al detenerse. Un error en el gancho se registra y no impide arrancar NOPAL ni los demás plugins.

## 6. Requisitos no funcionales

- **RNF1.** Una sola sesión TCP a la vez (un `Lock` del driver para envíos, brillo y prueba de conexión).
- **RNF2.** Timeouts en todo: conexión 3 s, cada lectura 5 s, subida completa 30 s.
- **RNF3.** El trabajo de red y de render corre fuera del bucle de eventos de NOPAL (`asyncio.to_thread`).
- **RNF4.** Logs en español, en el logger `nopal_plugins.matriz_led` (ya en el componente "Matriz LED" de
  Configuración → Registro). Sin SSID, claves ni contenido de capturas.
- **RNF5.** Sin dependencias nuevas: solo Pillow (ya está en NOPAL).
- **RNF6.** Pruebas sin panel: socket simulado para todo el protocolo; ninguna prueba abre red real.
- **RNF7.** Convenciones del plugin y de NOPAL: español de México, escritura atómica, permisos por rol en el backend.

## 7. Reglas duras

1. **No** enviar ni guardar claves de Wi-Fi ni configurar la red del panel desde código.
2. **No** cambiar los parámetros de pantalla del panel. Antes de cualquier envío, leer el tamaño; si no es 96×16,
   abortar y avisar.
3. **No** abrir dos sesiones TCP a la vez.
4. **No** usar comandos, campos ni offsets que no estén en `docs/PROTOCOL.md`.
5. **No** tocar el panel físico hasta que pasen las pruebas sin panel; no usar `tools/*_demo.py` ni pruebas de "panel
   real" sin pedirlo.
6. **No** subir capturas de red, configuraciones locales (`config.json`, `fk8wa.json`) ni claves.
7. **No** refactorizar código de NOPAL ajeno al gancho de §5.7.

## 8. Casos límite

- Panel apagado o fuera de la red al arrancar NOPAL: estado "sin respuesta", reintentos, NOPAL arranca normal.
- Panel restaurado con el botón de 15 s (reporta 288×16): `size_mismatch`, no se envía nada, aviso claro.
- Una máquina elegida se borra o cambia de id: se ignora y se avisa en la configuración.
- Nombre de máquina o archivo muy largo, porcentaje fuera de 0–100, tiempo ausente: se acorta o se omite sin romper la
  pantalla.
- Varias máquinas en error a la vez: se muestra la primera según el orden P.
- Cambios de estado más rápidos que el intervalo: solo se envía el último.
- NOPAL se detiene durante una subida: se espera a que termine (máx. 5 s) antes de intentar `off`.
- La IP cambia en la configuración: se cancela la sesión en curso y se vuelve a comprobar el tamaño.

## 9. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | La fuente nueva cambia el aspecto aprobado | Vista previa y reaprobación de las 12 pantallas antes de probar en el panel |
| R2 | Textos reales más largos que el mockup | RF9 y pruebas con nombres y archivos largos |
| R3 | Corte de energía: el panel dejó de responder ~15 min una vez | Reintentos con espera; estado visible |
| R4 | Brillo tras un corte: no verificado | Reenviar el brillo al recuperar la conexión |
| R5 | Parpadeo al recargar el programa | Política de envío (RF15–RF17) |
| R6 | El plugin pide Python ≥3.10 por `pypixelcolor`, aunque el FK-8Wa solo necesita Pillow | Fuera de alcance; se anota para el futuro |
| R7 | El gancho toca NOPAL core | Cambio mínimo, con tests, documentado en el SDD de NOPAL |

## 10. Criterios de aceptación

**Sin panel (automáticos):**
- CA1. El generador reproduce `template_long.bin` y `template_border.bin` byte a byte.
- CA2. Las 12 pantallas se renderizan a 96×16 y coinciden píxel a píxel con la vista previa **reaprobada**, en Linux y
  en Windows.
- CA3. Con un panel simulado que reporta 288×16, no se envía ningún trozo y el estado es `size_mismatch`.
- CA4. Con un panel simulado que no responde, NOPAL y la iPixel siguen funcionando y los reintentos siguen la espera
  creciente.
- CA5. Nunca hay dos sesiones TCP simultáneas (prueba con envíos concurrentes).
- CA6. Con cambios de estado cada segundo durante 60 s y un intervalo de 15 s, hay como máximo 4 envíos.
- CA7. Cada caso de RF12 elige la pantalla esperada (una prueba por fila y por combinación de prioridades).
- CA8. Permisos: el operador no puede cambiar la configuración (403) y sí puede mandar y borrar el mensaje especial.
- CA9. Ninguna prueba abre red real; cero secretos en el repo.

**Con el panel real (checklist manual, Fase 5):**
- CA10. Cada una de las 12 pantallas se ve como la vista previa reaprobada, sin cortes ni puntitos.
- CA11. Al apagar el panel y volver a encenderlo, NOPAL se reconecta solo y reenvía la pantalla y el brillo.

## 11. Confirmado en la revisión (2026-10-11)

- **P1.** Un anuncio enviado como mensaje especial muestra solo su **nombre** como texto.
- **P2.** `idle` = todas las elegidas en línea y sin actividad; `normal` = el resto.
- **P3.** La hora del panel es la hora local del servidor NOPAL.
