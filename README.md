# Matriz LED

Plugin de NOPAL para conectar una pantalla LED matriz BLE (probado contra
una **iPixel Color 16x32**) y mandarle texto y animaciones según el estado
de tus máquinas.

## Cómo funciona

La pantalla no se conecta directo a NOPAL ni a esta computadora -- BLE
tiene alcance corto y NOPAL puede correr en un servidor sin radio
Bluetooth. En cambio:

1. Un accesorio **ESP32** corriendo el firmware
   `firmware/nopal_accessory/Nopal_FF/Nopal_FF.ino` del repo de NOPAL (con
   `NOPAL_BLE_SCREEN_MAC` configurado en su `secrets.h`) se conecta por BLE
   a la pantalla y hace de **relay**: recibe bytes ya armados por HTTP
   (`POST /api/ble/window`, en hexadecimal) y los reenvía tal cual por BLE.
2. Este plugin arma esos bytes usando la librería
   [pypixelcolor](https://github.com/lucagoc/pypixelcolor) (fuentes,
   colores, animaciones, GIFs) y se los manda al ESP32 por Wi-Fi.

Ningún lado de NOPAL habla BLE directo -- ver
`backend/services/screen_service.py` y el bloque "PANTALLA LED BLE" del
`.ino` para el detalle completo.

## Instalación

Además de instalar este plugin desde NOPAL, hace falta:

0. **Python 3.10 o superior** en el equipo que corre NOPAL. `pypixelcolor`
   declara soportar 3.9, pero en 3.9 falla al importarse (usa `X | None` en
   firmas que se evalúan al cargar), así que el plugin no puede enviar nada a
   la pantalla. El manifiesto lo declara (`python_requires: ">=3.10"`) y NOPAL
   no instala ni carga el plugin en un Python más viejo.
1. Un accesorio ESP32 con `Nopal_FF.ino` (protocolo 4, firmware ≥4.4.0-ff)
   flasheado, con `NOPAL_BLE_SCREEN_MAC` configurado en su `secrets.h`
   apuntando a la MAC de tu pantalla.
2. La librería `pypixelcolor` instalada **en el mismo entorno Python que
   corre NOPAL** (no hay un mecanismo de dependencias por plugin todavía,
   así que esto es manual):

   ```bash
   pip install pypixelcolor
   ```

3. Configura la IP y credenciales de ese accesorio desde la sección
   "Matriz LED" del panel de NOPAL (mismas credenciales que ya usa NOPAL
   para hablarle a `/api/relay`, `/api/led`, etc. de ese accesorio).

## Panel principal (v0.5.0)

El plugin tiene dos vistas internas (misma idea que ya usa
`arduino-accessories` con sus propias pestañas): **Panel principal**
(dashboard) y **Escenas y Configuración** (el Editor de Anuncios de abajo,
más la configuración del accesorio y las alertas por máquina).

Regla dura seguida en todo el dashboard: **si NOPAL no tiene un sensor
real detrás de un dato, se muestra "No disponible" -- nunca un número
inventado.** Esto descartó varias tarjetas que sí aparecían en el mockup
original (brillo del panel, FPS, voltaje/energía, ventilación, sensor de
humo): ninguna existe en el firmware ni en ningún accesorio de NOPAL hoy.

- **KPIs**: matrices conectadas (siempre 1 -- el plugin es de un solo
  dispositivo por diseño), escenas activas (cuenta real de anuncios
  guardados), automatizaciones (reglas + alertas por máquina activas),
  brillo global (no disponible).
- **Vista en vivo**: muestra el último patrón que NOPAL mandó de verdad
  (`GET /api/plugins/matriz-led/last-sent`, actualizado dentro de
  `send_matrix`) -- **no es una lectura real de la pantalla** (el relay
  BLE es de solo escritura), es lo último que este NOPAL le mandó.
- **Estado del taller**: la única fila real es "Temperatura ambiente",
  vía el sensor TH del propio ESP32 (`GET /api/status` del mismo
  accesorio que ya usa el relay BLE -- no hace falta tocar
  `arduino-accessories`, es el mismo firmware Nopal_FF.ino sirviendo
  ambos roles en un solo HTTP server). El firmware marca ese sensor como
  `calibrated:false` (analógico, sin datasheet) -- se muestra tal cual,
  como estimado.
- **Escenas rápidas**: todos los anuncios guardados (no un tope fijo),
  en un carrusel con flechas cuando no caben todos a la vez -- clic en
  cualquier parte de la tarjeta lo manda de inmediato.
- **Diagnóstico** (reemplaza la vieja tarjeta "Información del
  dispositivo"): conexión BLE real, modelo/firmware/memoria del ESP32,
  **último envío** y **último error** -- ambos con marca de tiempo real
  (`GET /api/plugins/matriz-led/last-error`, nuevo, persistido dentro de
  `send_windows` en cuanto falla un envío). Antes "Última sincronización"
  mostraba el texto fijo "Hace un momento" sin medir nada real; ya no.
  El botón "Probar conexión" dispara el mismo chequeo de estado real que
  ya corre cada 10s, pero al toque.
- **Automatizaciones sugeridas**, reales y activables con un clic (no
  decorativas):
  - *Inactividad > 5 min* y *Material bajo detectado* (vía
    `GET /api/spoolman/alerts` si Spoolman está instalado) son **reglas**
    nuevas (`GET/POST/PUT/DELETE /api/plugins/matriz-led/rules`). Activar
    una por primera vez crea también, automáticamente, el anuncio que le
    corresponde ("Modo nocturno"/"Material bajo") a partir de una
    plantilla del sistema.
  - *Trabajo terminado* refleja el aviso automático que ya existía
    (`config.auto_alerts`).
  - *Humo detectado* se muestra siempre como "No disponible" -- no existe
    ningún sensor de humo en NOPAL.
  - Quién evalúa las reglas: el propio navegador (`pollMachines`/
    `pollMaterialAlerts` en el JS del plugin), sondeando cada ~8s
    mientras el dashboard esté abierto -- NOPAL no tiene scheduler de
    fondo para plugins.
- **Alertas por máquina** (en "Escenas y Configuración"): a diferencia
  de la tira LED de `arduino-accessories` (que asigna un color por ZONA
  de píxeles), la Matriz LED es una sola pantalla sin zonas -- así que
  por cada máquina eliges **qué anuncio guardado mostrar por cada
  estado** (en espera/calentando/enfriando/trabajando/pausada/
  finalizada/error/desconectada), reusando el Editor de Anuncios en vez
  de duplicar lógica de texto/color.
  - El estado de cada máquina se normaliza antes de comparar: los
    drivers no usan un vocabulario único ("standby" en vez de "idle"
    para Klipper, "FINISH"→"idle" en vez de "complete" para Bambu, etc.
    -- ver `RAW_STATE_ALIASES` en el JS del plugin) y "calentando"/
    "enfriando" no existen como estado real de ningún driver, así que
    se derivan comparando temperatura actual contra target
    (`deriveMachineVisualState`), igual que hace `app.js` del núcleo
    para la tira LED. "Finalizada"/"Error" solo llegan a dispararse en
    marcas cuyo driver expone esa señal de verdad (Klipper vía
    Moonraker); Marlin standalone nunca la reporta, así que esos dos
    estados no tienen forma de activarse ahí.
  - Si dos o más máquinas configuradas están activas al mismo tiempo,
    la pantalla (un solo dispositivo físico) no puede mostrarlas juntas
    -- se turnan cada 5 segundos en orden, y al llegar a la última
    vuelve a la primera (`tickMachineAlertRotation`).
- **Resumen operativo**: mensajes mostrados hoy y errores son reales
  (`GET /api/plugins/matriz-led/stats`, contados dentro de
  `send_windows`, se resetea solo al cambiar de día). Uso de CPU/RAM no
  se incluye -- no hay ninguna fuente real de esos datos en NOPAL.

## Estado actual (v0.4.0)

- Configuración del accesorio (IP + credenciales), en un modal aparte
  (ícono ⚙ del header) para dejarle el espacio principal al editor.
- Estado de conexión BLE en vivo.
- **Saludo automático**: apenas la pantalla queda conectada por BLE,
  siempre muestra "NOPAL" en verde -- no es opcional, lo dispara el
  backend solo (ver `_greet_if_just_connected` en `screen_service.py`) en
  cuanto detecta la transición de desconectada a conectada. Requiere que
  el dashboard de NOPAL esté abierto en alguna pestaña (sondea el estado
  cada ~10s) -- no hay todavía un scheduler de fondo en NOPAL core que
  permita hacerlo sin depender del navegador.
- **Editor de Anuncios**: cada anuncio es un dibujo de 16x32 **con color
  por píxel** (no un color único global -- `send_matrix` en
  `screen_service.py` arma un PNG en memoria con el color real de cada
  celda y lo manda con `pypixelcolor.send_image_hex`, `POST
  /api/plugins/matriz-led/image`), con nombre, máquina/grupo asignados,
  prioridad y etiquetas. Se guardan como anuncios reutilizables (CRUD
  completo: `GET/POST/PUT/DELETE /api/plugins/matriz-led/announcements`,
  con `.../{id}/send` para mandarlo ahora) y aparecen en una tabla con
  buscador, edición, duplicado y borrado.
- Herramientas de dibujo: lápiz, borrador, línea, rectángulo, elipse
  (hueca), cubeta (flood fill), gotero, importar imagen (se reescala y
  recorta a 32x16 con un `<canvas>` en el navegador, sin backend) y una
  herramienta de texto que "quema" letras a píxeles con una fuente 5x7
  propia del editor (no la de pypixelcolor -- esa solo se resuelve del
  lado del servidor y no sirve para texto editable a mano).
- Selector de color con gama completa (cuadro de saturación/valor +
  barra de matiz, conversión hex/rgb/hsv propia del plugin) en vez del
  popup nativo del navegador -- todo el rango queda visible sin abrir
  nada, con colores guardados aparte (persistidos en `localStorage`, no
  en el servidor, es una preferencia del navegador). Vive en su propia
  columna a la izquierda del editor, simétrica a "Efectos" a la derecha.
- 9 plantillas del sistema (Alerta/Error/Atención/Emergencia/Listo/
  Bienvenida/Mantenimiento/Modo nocturno/Material bajo) que siembran el
  editor con texto y color ya listos -- reemplazan los presets de demo y
  las alertas rápidas de v0.2-0.3. Las dos últimas también las usa el
  panel principal para auto-provisionar el anuncio de una automatización
  sugerida la primera vez que se activa (ver más abajo).
- Aviso automático opcional ("Avisar cuando un trabajo termine o falle"):
  compara el estado normalizado de todas las máquinas
  (`GET /api/plugins/matriz-led/machines`, que reusa `tunascreen_service`
  de NOPAL core) contra el último visto, y manda OK/ERR por texto simple
  (`/text`, sin pasar por el editor) solo en la transición.

### Limitaciones conocidas

- **Efecto de entrada**: solo se ofrecen "Estático" y "Parpadeo" (los
  únicos `animation` ints de pypixelcolor validados en hardware real --
  mandar un código equivocado puede hasta hacer bootloop al dispositivo,
  ver el docstring de `pypixelcolor.commands.send_text`). "Efecto de
  salida" y "Pausa (seg)" se guardan como metadata del anuncio, pero
  pypixelcolor no expone un parámetro de salida independiente todavía,
  así que por ahora no se manda al dispositivo.
- **Programación** (Modo "Programado", fecha de inicio/fin, repetición
  por día): se guarda completa en cada anuncio, pero **no se dispara
  sola todavía** -- NOPAL no tiene un scheduler de fondo para plugins.
  Por ahora solo el envío manual ("Vista previa en vivo" o el aviso
  automático de arriba) llega de verdad a la pantalla.
- **Grupo**: el selector solo deja elegir entre grupos ya usados en
  anuncios existentes -- no hay todavía un flujo para crear un grupo
  nuevo desde cero.

Pendiente: disparar "Programado" solo (requiere scheduler de fondo en
NOPAL core -- las reglas de inactividad/material bajo del panel principal
esquivan esto sondeando desde el navegador, pero un modo "Programado" por
fecha/hora exacta si necesita reloj de fondo), crear grupos desde el
editor, conectar el sensor TH real cuando `arduino-accessories` u otro
plugin lo necesite también (hoy solo lo consume este plugin), y
automatizaciones más finas (escenas/macros/rutinas que crucen relés/tiras
LED/zumbador con esta pantalla -- fusión con `arduino-accessories`,
integración con cámaras).
