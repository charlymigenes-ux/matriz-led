# Tareas: panel FK-8Wa (Fase 3)

- **Spec:** `specs/fk8wa-panel.md` · **Plan:** `specs/fk8wa-plan.md` (ambos aprobados el 2026-10-11).
- **Estado:** aprobada el 2026-10-11. T1–T16 hechas (sin commits); T17 pendiente (la ejecuta el dueño con `specs/fk8wa-checklist.md`).
- Cada tarea cabe en menos de un día, termina con sus pruebas en verde y no toca el panel real (salvo T17, que la
  ejecutas tú).
- Sin commits ni push hasta que los pidas. Plugin: clon `~/matriz-led-dev`, rama `feat/fk8wa-panel`. NOPAL: `dev-main`.

| # | Tarea | Repo | Verificación |
|---|---|---|---|
| T1 | Clon de trabajo `~/matriz-led-dev` desde `main` del plugin, rama `feat/fk8wa-panel`; confirmar que su suite actual pasa con `NOPAL_CORE_ROOT=~/nopal` | plugin | 85 tests en verde, sin cambios |
| T2 | `fk8wa/program.py` + `templates/`: copia literal de `build_scroll`, `Layout`, `PLAIN`, `BORDERED`, `_rtf`, `border_block`, `screen_program` | plugin | Pruebas portadas de `verify_long.py` y `verify_border.py`: **byte a byte** (CA1); efectos y direcciones de `test_effects.py` |
| T3 | `fk8wa/protocol.py`: marcos, `read_frame` robusto, `info()`, `upload()` con verificación **96×16** y validación de respuestas, `brightness()`; conexión inyectable | plugin | Socket simulado: secuencia exacta, checksum `00`, panel que cierra a la mitad, respuesta inesperada, timeout, **288×16 → ningún `01 02`** (CA3) |
| T4 | `fk8wa/pixelfont.py`: fuentes 5×7, mediana y grande; `text_width` / `draw_text`; caracteres sin glifo | plugin | Pruebas: anchos conocidos, determinismo (mismo PNG dos veces), `?` para caracteres desconocidos |
| T5 | `fk8wa/screens.py`: las 12 pantallas con `pixelfont`, cactus e iconos; acortado predecible; generar vista previa PNG | plugin | Todas a 96×16; textos largos no salen del borde. **Entrega: PNG con las 12 pantallas para tu reaprobación** |
| T6 | Ajustes de T4/T5 según tu revisión y guardar los PNG aprobados en `tests/fixtures/fk8wa/` | plugin | Prueba píxel a píxel contra los PNG aprobados (CA2) |
| T7 | `fk8wa/state_machine.py`: selección de pantalla (RF12) con reloj simulado | plugin | Tabla de casos de RF12 y combinaciones de prioridad; alternancia 15 s; terminado 60 s; sin máquinas elegidas (CA7) |
| T8 | `fk8wa/config.py` y `fk8wa/messages.py` | plugin | Validación (IP, rangos), escritura atómica, mensaje vencido ignorado |
| T9 | Gancho de ciclo de vida en NOPAL core (`plugin_loader_service` + `main.py`) | NOPAL | Tests: llama a los ganchos; uno que falla no rompe el arranque ni a los demás; sin ganchos igual que antes; tope de 5 s. Suite completa de NOPAL en verde |
| T10 | `fk8wa/runner.py`: ciclo de fondo, cambio de imagen, intervalo mínimo, `Lock` único, reintentos, `size_mismatch`, reenviar brillo, `off` al apagar | plugin | Reloj y cliente simulados: CA4, CA5, CA6; apagado con subida en curso |
| T11 | API del plugin (`/fk8wa/status`, `preview`, `config`, `test`, `brightness`, `message`) y `on_startup` / `on_shutdown` en `router.py` | plugin | Tests de rutas y permisos: operador 403 en `config`/`test`/`brightness`, 200 en `message` (CA8); `preview` no abre red |
| T12 | Interfaz: pestaña "Panel FK-8Wa" (estado, vista previa, configuración con selección y orden de máquinas, brillo, probar conexión, mensaje especial); solo variables del tema; es/en | plugin | Revisión estática del JS (balance), textos es/en; prueba en tu servidor |
| T13 | Anuncios y reglas como mensaje especial (nombre del anuncio; campo `fk8wa` en reglas y `run_rule`) | plugin | Tests: anuncio → mensaje con su nombre; regla marcada publica mensaje; regla sin marcar, no; la iPixel sigue igual |
| T14 | Acción de IA `show_panel_message(text, minutes)` en `ai_actions.py` (riesgo bajo, `USE_PLUGIN` sobre `matriz-led`) | NOPAL | Tests: llama al plugin; plugin ausente → error claro; respeta Authorization Policy y `actions_enabled`; suite de NOPAL en verde |
| T15 | Documentación: README del plugin (configurar, probar, aviso del botón de 15 s, reglas duras) y entrada en `docs/SDD.md` de NOPAL | ambos | Revisión |
| T16 | Verificación sin panel completa: suite del plugin y de NOPAL, `git diff --check`, sin secretos ni `fk8wa.json` en el diff | ambos | Todo en verde; lista de lo no verificado |
| T17 | **Checklist con el panel real** (la ejecutas tú): instalar la rama en NOPAL, probar conexión, 12 pantallas, brillo, apagar/encender el panel, apagar NOPAL | — | CA10 y CA11; anotar resultados |

## Puntos de control contigo

- **Después de T5:** reaprobación visual de las 12 pantallas (bloquea T6 y lo que sigue a las pantallas).
- **Después de T16:** revisión del diff completo antes de cualquier commit.
- **T17:** solo cuando tú lo indiques.
