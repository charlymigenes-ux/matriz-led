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

## Estado actual (v0.2.1)

- Configuración del accesorio (IP + credenciales).
- Estado de conexión BLE en vivo.
- **Saludo automático**: apenas la pantalla queda conectada por BLE,
  siempre muestra "NOPAL" en verde -- no es opcional, lo dispara el
  backend solo (ver `_greet_if_just_connected` en `screen_service.py`) en
  cuanto detecta la transición de desconectada a conectada. Requiere que
  el dashboard de NOPAL esté abierto en alguna pestaña (sondea el estado
  cada ~10s) -- no hay todavía un scheduler de fondo en NOPAL core que
  permita hacerlo sin depender del navegador.
- Envío de texto de prueba con color y **tamaño de letra** (16/24/32 px --
  la pantalla mide 16 filas de alto, así que 16 es el único tamaño
  confirmado sin recorte; 24/32 quedan disponibles para quien los quiera
  probar, ver `SUPPORTED_CHAR_HEIGHTS` en `screen_service.py`).
- Catálogo de alertas rápidas (LISTO/ERROR/ATENCIÓN/EMERG.) de un clic.
- Aviso automático opcional ("Avisar cuando un trabajo termine o falle"):
  compara el estado normalizado de todas las máquinas
  (`GET /api/plugins/matriz-led/machines`, que reusa `tunascreen_service`
  de NOPAL core) contra el último visto, y manda LISTO/ERROR solo en la
  transición.

Pendiente: catálogo de alertas con ícono+texto compuesto (imagen, no solo
texto), animaciones (GIF) por estado, y automatizaciones más finas
(escenas/macros/rutinas, por máquina en vez de global, integración con
Spoolman/cámaras).
