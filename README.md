# Matriz LED

Plugin de NOPAL para conectar una pantalla LED matriz BLE (probado contra
una **iPixel Color 16x32**) y mandarle texto y animaciones según el estado
de tus máquinas. Desde v0.10.0 maneja además un **panel FK-8Wa de 96x16**
(monocromo, por red), con su propia configuración: ver
["Panel FK-8Wa"](#panel-fk-8wa-v0100).

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

## Panel FK-8Wa (v0.10.0)

Panel LED de **96x16 monocromo (rojo)** con controlador **FK-8Wa** (3 módulos
P10 de 32x16), en la **misma red que NOPAL**, por TCP al puerto 5858. Muestra
el estado de las máquinas que elijas con 12 pantallas (arranque, todo
normal, impresión vista 1 y 2, varias, pausa, error, desconectada, todas
detenidas, terminado, mensaje especial, apagado). Convive con la iPixel:
cada una tiene su configuración y su estado.

**Configurar** (pestaña "Panel FK-8Wa", solo admin):
1. Conecta el panel a la red con **FKShow** (la red y el Wi-Fi del panel no
   se configuran desde NOPAL, a propósito) y anota su IP.
2. Escribe la IP y presiona **Probar conexión**: debe leer 96x16.
3. Elige las máquinas en orden (P1, P2, P3...), el brillo (1-16) y activa
   el panel.

**Cómo decide qué mostrar** (prioridad): error y pausa (una vista por cada
máquina afectada, tapan todo) > mensaje especial > terminado (60 s) > trabajando
(vista 1 y 2 alternan cada 15 s; con dos o más activas, "varias", de 3 en 3),
junto con una vista por cada máquina que calienta / está en temperatura /
enfría o está **desconectada** (no tapan nada, entran al ciclo) > todo
normal / todas en reposo (alternan).
"Apagado" (HASTA PRONTO) se muestra al detener NOPAL. La pantalla de error
dice "ERROR": el estado de las máquinas no trae el texto del error.

**Nombres de las máquinas**: en el panel cada máquina usa un **nombre corto de
hasta 4 caracteres** que sale solo del nombre real (Klipper ET4 → ET4,
TTS 55 PRO → TTS, CNC 3018 → CNC); se puede cambiar en la pestaña. Las
impresoras 3D, los láser y los CNC entran igual. Un láser o CNC no informa
el tiempo transcurrido: en su vista 2 aparece LASER o CNC en lugar de la hora.

**Calentando, en temperatura y enfriando** (solo impresoras 3D que no imprimen;
láser y CNC nunca calientan; va debajo de "trabajando" en la prioridad):
- *Calentando*: tiene temperatura objetivo y aún le faltan más de 3 °C
  (boquilla o cama): muestra temperatura actual/objetivo con una barra.
- *En temperatura*: ya llegó (a menos de 3 °C) y espera. La pantalla **se
  mantiene** hasta que se mande imprimir o se apague el calentador.
- *Enfriando*: el calentador está apagado (objetivo 0) y aún pasa de 50 °C:
  muestra la temperatura bajando; al llegar a 50 °C vuelve a lo normal.
Si otra máquina está trabajando, la que calienta, está en temperatura o se enfría
**no se oculta**: su pantalla entra al ciclo y alterna con las vistas de trabajo
(15 s cada una). Error, pausa, desconectada, mensaje y terminado siguen tapando todo.
Con todo en reposo, "Todo normal" y "Todas en reposo" se alternan cada 15 s.

**Contorno por situación** (`situation_styles`): cada situación puede tener su
propio contorno. Las que tienen reloj (reposo, trabajando, terminó, mensaje)
usan los de siempre (contorno, contorno encima, barra, sin contorno o marco
animado); calentando, en temperatura y enfriando pueden usar además
*contorno según la temperatura* (`temp`: se llena al calentar y se vacía al
enfriar; NOPAL vuelve a subir la pantalla cuando cambia la temperatura, cada
`min_interval_s` como mínimo); pausa, error y desconectada solo marco animado
o ninguno. Lo que no se elige usa `timer_style`. Por omisión: calentando y
enfriando `temp`, en temperatura marco horario.

**Modo mantenimiento** (`maintenance`): en "Máquinas y conexión", cada máquina del panel
tiene un interruptor "En mantenimiento" (lo cambia el admin). Una máquina en
mantenimiento desaparece del panel por completo: no avisa desconectada, error,
calentando ni trabajando. Sirve para equipos desarmados o en reparación.

**Rotación de pantallas**: en el panel real los programas de varias pantallas NO
avanzan solos (probado con efectos de entrada y de desplazamiento). Por eso NOPAL
rota las vistas: sube una pantalla fija por vez, cada `view_seconds` (no menos que
`min_interval_s`). Cada vista usa el efecto y el contorno de su propia situación.
Consecuencia: los contornos que marcan el tiempo (contorno, contorno encima, barra)
ya no avanzan, porque dependían de que el panel pasara páginas; el texto que corre
sí funciona (es un programa del propio panel). El marco animado del panel y el
contorno según la temperatura siguen igual.

**Efectos de entrada**: el panel solo anima cómo APARECE cada pantalla (36
efectos de FKShow en 8 familias: Desplazar, Entrar, Cubrir, Persiana,
Sombra, Parpadeo, Extender y Sector; no hay efectos de salida documentados y
no se inventan). Se elige uno por situación (Error, Pausa, Terminó...). Están
marcados como "probados" los que ya se vieron en el panel real
(`PROTOCOL.md`); el botón "Probar en mi panel" manda un ejemplo unos 12 s y
luego restaura, y anota el efecto como probado en esa instalación
(`data/plugins/matriz-led/fk8wa_effects_tested.json`). Un programa lleva un
solo efecto, así que las situaciones con reloj de cada vista (todo tranquilo,
trabajando, terminó, mensaje corto) no lo usan con el reloj de **contorno,
contorno encima o barra** (son varias imágenes y el efecto se repetiría en
cada una); con "Sin reloj" o "Marco del panel" sí.

**Texto corrido**: un mensaje que no cabe quieto (más de unos 13 caracteres
en letra normal) corre por la pantalla con letra al doble de tamaño: de
derecha a izquierda, de izquierda a derecha, continuo, o por páginas hacia
arriba o hacia abajo. Dirección y velocidad (1 lento a 10 rápido) en la
pestaña; la relación exacta entre la velocidad y los píxeles por segundo no
está medida y se ajusta viendo el panel.

**Mensaje especial**: texto libre o un anuncio (se muestra su nombre) desde
la pestaña (operador y admin), las reglas con la casilla "También mostrar en
el panel FK-8Wa" y NOPAL Intelligence (acción `show_panel_message`, en NOPAL
core). Vence solo (por omisión 5 min).

**Cómo envía**: el panel atiende **una sola sesión TCP** y cada subida
recarga el programa completo, así que NOPAL solo envía cuando la imagen
cambia y como mucho cada "intervalo mínimo" (15 s por omisión). Si el panel
no responde, reintenta a los 15, 30, 60, 120 y 300 s sin afectar a NOPAL ni
a la iPixel, y al reconectar reenvía el brillo.

> **Aviso importante: el botón de prueba de la placa.** Mantenerlo 15 s
> restaura el Wi-Fi **y los parámetros de pantalla**: la placa pasa a creer
> que mide 288x16 y dibuja puntitos y texto cortado. NOPAL **lee el tamaño
> antes de cada envío y no envía nada si no es 96x16**; la pestaña lo avisa.
> Reconfigura la placa con FKShow y presiona "Probar conexión".

**Reglas que respeta el código**: no configura la red ni el Wi-Fi del panel
ni guarda claves; no cambia sus parámetros de pantalla; nunca abre dos
sesiones TCP a la vez; solo usa los comandos documentados en el protocolo
(`01 09`, `01 02`, `01 1b`, `01 37`, `01 01`, `01 15`).

**Código**: `backend/services/fk8wa/` (protocolo, generador de programas
copiado de la referencia y verificado byte a byte contra capturas de
FKShow, fuente de píxeles en código, pantallas, máquina de estados, ciclo de
fondo). La spec, el plan y las tareas están en `specs/`. Configuración en
`data/plugins/matriz-led/fk8wa.json` (no se sube a git).

**Probar sin panel**: `pytest tests/fk8wa` (panel y máquinas simulados; nada
abre la red). Las 12 pantallas se comparan píxel a píxel con
`tests/fixtures/fk8wa/`; para actualizarlas tras una nueva aprobación:
`FK8WA_UPDATE_FIXTURES=1 pytest tests/fk8wa/test_screens_approved.py`.

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
