# Checklist manual con el panel real FK-8Wa (T17 / Fase 5)

Ejecútala tú, en orden. Anota ✅ / ❌ y lo que veas. Si algo falla, detente y copia el mensaje de error de la
pestaña "Panel FK-8Wa" (o del visor de logs, componente "Matriz LED").

## 0. Antes de empezar
- [ ] El panel está en la red del taller con IP fija (configurada con FKShow) y FKShow muestra 96x16.
- [ ] NOPAL tiene instalada la rama `feat/fk8wa-panel` del plugin y el NOPAL de `dev-main` con el gancho de
      ciclo de vida; NOPAL se reinició después de instalar.
- [ ] Nadie más está conectado al panel (FKShow cerrado): el panel atiende una sola sesión.

## 1. Conexión
- [ ] Pestaña "Panel FK-8Wa" → escribe la IP → **Probar conexión**: muestra la IP, puerto 5858 y **96x16**.
- [ ] Elige 2 o 3 máquinas (P1, P2, P3), brillo 8, **activa** el panel y guarda.
- [ ] En menos de 10 s el panel muestra una pantalla; el estado dice "Conectado" y "Último envío".
- [ ] **Verificación pendiente del protocolo:** si en este punto aparece "Respuesta inesperada a 01 xx", copia el
      texto completo (incluye los bytes recibidos): significa que la ubicación de los códigos de respuesta no es la
      que supuse y hay que ajustarla.

## 2. Las 12 pantallas (compara con `specs/preview` aprobada)
Para forzar cada una: usa la máquina real o el selector de vista previa como guía visual.
- [ ] **Todo normal** (algunas en línea, sin trabajo): cactus, NOPAL, ● N ON y la hora.
- [ ] **Todas detenidas** (todas en línea y en reposo): "N IDLE" y la hora.
- [ ] **Impresión vista 1**: P#, nombre del archivo (sin extensión), barra y porcentaje.
- [ ] **Impresión vista 2** (15 s después): P#, porcentaje grande y tiempo transcurrido. Alterna cada 15 s.
- [ ] **Varias** (dos o más imprimiendo): hasta 3 etiquetas con su icono.
- [ ] **Pausa**: P# ‖ PAUSA.
- [ ] **Error**: P# ⚠ ERROR.
- [ ] **Desconectada** (apaga una máquina elegida): P# ◎ OFFLINE.
- [ ] **Terminado** (al acabar una impresión): ✓ TERMINADO, P#, archivo, 100%; 60 s y vuelve.
- [ ] **Mensaje especial**: escribe "TODO BIEN" en la pestaña → NOPAL | TODO / BIEN; quítalo → vuelve.
- [ ] **Mensaje largo** ("Material bajo en la Ender, cambia el carrete") → ancho completo, dos renglones.
- [ ] **Apagado**: detén NOPAL (`systemctl stop nopal`) → NOPAL | HASTA PRONTO.
- [ ] **Arranque**: vuelve a arrancar NOPAL → la siguiente pantalla aparece sola (el arranque puede no verse si el
      estado de las máquinas llega enseguida).
- [ ] En todas: **sin puntitos ni texto cortado**, se lee bien de lejos.

## 3. Brillo
- [ ] Cambia el brillo a 2 y luego a 16: el panel cambia en menos de 10 s.

## 4. Fallas y recuperación
- [ ] Desconecta el panel de la corriente: el estado pasa a "Sin respuesta" con "próximo reintento"; NOPAL y la
      iPixel siguen normales.
- [ ] Vuelve a conectarlo: NOPAL reconecta solo (puede tardar hasta 5 min por la espera creciente) y reenvía la
      pantalla y el **brillo**. Anota si el panel conservó el brillo por sí solo (no verificado hasta ahora).
- [ ] **No** pruebes el botón de 15 s a propósito. Si llegara a pasar: la pestaña muestra "Tamaño incorrecto" y no
      se envía nada hasta reconfigurar con FKShow y presionar "Probar conexión".

## 5. Mensaje especial desde otros orígenes
- [ ] Un anuncio elegido en la pestaña → aparece su nombre.
- [ ] Una regla con "También mostrar en el panel FK-8Wa" → al dispararse aparece el nombre de su anuncio (ojo: hoy
      las reglas las detecta el navegador; necesitas NOPAL abierto para que se disparen).
- [ ] NOPAL Intelligence: "muestra 'PAUSA COMIDA' en el panel por 10 minutos" → aparece; vence solo.

## 6. Operador
- [ ] Con una cuenta de operador: ve el estado y la vista previa, la configuración en solo lectura, y **sí** puede
      mandar y quitar el mensaje especial.
