// Matriz LED -- Panel principal + Editor de Anuncios para una pantalla LED
// BLE (tipo iPixel Color), conectada vía el relay del firmware
// Nopal_FF.ino (ver backend/services/screen_service.py de este plugin).
//
// El saludo "NOPAL" al conectar NO vive acá -- lo dispara el backend solo
// (ver screen_service._greet_if_just_connected), como efecto de que este
// mismo archivo ya sondea /status cada 10s sin importar qué sección del
// dashboard esté abierta.
//
// v0.4.0: reemplaza el layout de tarjetas de "Animaciones RGB" (v0.2-0.3)
// por un Editor de Anuncios real: cada anuncio es un dibujo de 16x32 CON
// COLOR POR PÍXEL (no un color único global, ver send_matrix en
// screen_service.py), con nombre, máquina/grupo asignados, prioridad,
// programación (guardada como metadata -- ver la nota de "Modo de
// reproducción" más abajo) y una tabla de anuncios guardados.
//
// v0.5.0: el plugin pasa a tener DOS vistas internas (#mled-view-tabs,
// mismo patrón que ya usa arduino-accessories con su state.view): "Panel
// principal" (dashboard con KPIs, vista en vivo, escenas rápidas,
// automatizaciones sugeridas -- todo con datos reales, "No disponible"
// donde NOPAL no tiene sensor real, nunca inventado) y "Escenas y
// Configuración" (el Editor de Anuncios de v0.4, más la tabla nueva de
// "Alertas por máquina"). Automatizaciones reales (inactividad > N
// minutos, material bajo vía Spoolman) se activan con un clic desde el
// panel -- ver loadRules/renderSuggestions y el bloque de polling
// extendido en pollMachines/pollMaterialAlerts.
(() => {
    const PLUGIN_ID = 'matriz-led';

    if (window.NopalPluginRegistry?.[PLUGIN_ID]) {
        return;
    }

    // Mismo patrón que font-library.js/svg-toolkit.js/spoolman.js (plugins/
    // font-library, plugins/svg-toolkit, plugins/spoolman): diccionario
    // propio del plugin, sin un t()/i18n global del core (no existe uno
    // expuesto a plugins) -- lee el idioma ya elegido en Configuración
    // (localStorage.language). Va primero en el archivo porque ENTRY_EFFECTS/
    // EXIT_EFFECTS/PRIORITIES/SYSTEM_TEMPLATES (más abajo) llaman tr() al
    // definirse.
    const I18N = {
        es: {
            effectStatic: 'Estático', effectBlink: 'Parpadeo',
            exitNone: 'Ninguno', exitFade: 'Desvanecer', exitOff: 'Apagar',
            priorityHigh: 'Alta', priorityMedium: 'Media', priorityLow: 'Baja',
            tplAlert: 'Alerta', tplError: 'Error', tplAttention: 'Atención', tplEmergency: 'Emergencia',
            tplReady: 'Listo', tplWelcome: 'Bienvenida', tplMaintenance: 'Mantenimiento',
            tplNightMode: 'Modo nocturno', tplLowMaterial: 'Material bajo',
            stateIdle: 'En espera', stateHeating: 'Calentando', stateCooling: 'Enfriando', statePrinting: 'Trabajando',
            statePaused: 'Pausada', stateComplete: 'Finalizada', stateError: 'Error', stateOffline: 'Desconectada',
            noSavedColorsYet: 'Sin colores guardados todavía',
            noAnnouncementsYet: 'Sin anuncios guardados todavía.',
            secondsSuffix: 'seg', scheduledBadge: 'Programado', activeStateBadge: 'Activo',
            editTitle: 'Editar', duplicateTitle: 'Duplicar', deleteTitle: 'Eliminar',
            confirmDeleteAnnouncement: 'Vas a eliminar el anuncio "{name}". Esta acción no se puede deshacer.',
            deleteAnnouncementTitle: 'Eliminar anuncio',
            sendToScreenTitle: 'Enviar "{name}" a la pantalla',
            errorSending: 'Error al enviar',
            allUnassigned: 'Todas / sin asignar', noGroup: 'Sin grupo', allMachines: 'Todas',
            missingAnnouncementName: 'Falta el nombre del anuncio',
            saving: 'Guardando…', announcementSaved: 'Anuncio guardado', errorSaving: 'Error al guardar',
            savedGeneric: 'Guardado', copySuffix: '(copia)',
            sendingToScreen: 'Enviando a la pantalla… (puede tardar unos segundos)',
            sentWindows: 'Enviado ({count} {word})', windowSingular: 'ventana', windowPlural: 'ventanas',
            notConfigured: 'Sin configurar', statusConnected: 'Conectada', diagConnected: 'Conectado',
            configuredNoBle: 'Configurada, sin conexión BLE', noBle: 'Sin conexión BLE',
            never: 'Nunca', noErrorsLogged: 'Sin errores registrados', estimatedTemp: '{value}°C (estimado)',
            justNow: 'justo ahora', secondsAgo: 'hace {n} s', minutesAgo: 'hace {n} min', hoursAgo: 'hace {n} h', daysAgo: 'hace {n} d',
            currentScene: 'Escena actual: {name}', custom: 'Personalizado', currentSceneNoSends: 'Escena actual: Sin envíos todavía',
            operational: 'Operativa', readyToUse: 'Listas para usar', createFirstAnnouncement: 'Crea tu primer anuncio',
            rulesAndMachines: '{rules} reglas · {machines} máquinas',
            noAnnouncementsCreateHint: 'Todavía no tienes anuncios guardados -- créalos en "Escenas y Configuración".',
            activeBadge: 'Activa', readyBadge: 'Lista',
            suggestionIdleTitle: 'Inactividad > 5 min', suggestionIdleDetail: 'Mostrar "Modo nocturno"{suffix}',
            detectedNowSuffix: ' -- detectado ahora',
            suggestionMaterialTitle: 'Material bajo detectado', suggestionMaterialDetail: 'Mostrar "Material bajo"{suffix}',
            suggestionJobDoneTitle: 'Trabajo terminado', suggestionJobDoneDetail: 'Avisar OK/ERR cuando una máquina termine o falle',
            suggestionSmokeTitle: 'Humo detectado', suggestionSmokeDetail: 'No hay sensor de humo instalado todavía',
            clickToDeactivate: 'Clic para desactivar', clickToActivate: 'Clic para activar', activateBtn: 'Activar',
            notAvailableBadge: 'No disponible', genericError: 'Error',
            noMachinesDetected: 'No hay máquinas detectadas todavía.',
            activeAlertsBadge: 'Activas', inactiveAlertsBadge: 'Inactivas', configureBtn: 'Configurar',
            unassignedOption: 'Sin asignar',
            dashboardTitle: 'Panel principal · Matriz LED',
            dashboardSub: 'Controla tu matriz LED, escenas, alertas y automatizaciones del taller en tiempo real.',
            editorTitle: 'Escenas y Configuración',
            editorSub: 'Crea anuncios, configura alertas por máquina y el accesorio ESP32.',
            checking: 'Comprobando…', accessoryConfigTitle: 'Configuración del accesorio',
            tabMainPanel: 'Panel principal',
            kpiMatricesConnected: 'Matrices conectadas', kpiActiveScenes: 'Escenas activas', kpiAutomations: 'Automatizaciones',
            kpiGlobalBrightness: 'Brillo global', noFirmwareSensor: 'Sin sensor en el firmware',
            liveView: 'Vista en vivo', selectMatrix: 'Seleccionar matriz', mainMatrixLabel: 'Matriz principal · 16×32',
            currentSceneDash: 'Escena actual: —', brightnessLabel: 'Brillo:', fpsLabel: 'FPS:', panelTempLabel: 'Temp. panel:',
            registeredResolutions: 'Resoluciones registradas', rgbResolution: '16 × 32 RGB', defaultBadge: 'Predeterminada',
            workshopStatus: 'Estado del taller', criticalSensors: 'Sensores críticos', ventilation: 'Ventilación',
            stablePower: 'Energía estable', ambientTemp: 'Temperatura ambiente',
            quickScenes: 'Escenas rápidas', previousTitle: 'Anteriores', previousAria: 'Escenas anteriores',
            nextTitle: 'Siguientes', nextAria: 'Escenas siguientes',
            suggestedAutomations: 'Automatizaciones sugeridas', operationalSummary: 'Resumen operativo',
            uptimeLabel: 'Tiempo en línea', messagesToday: 'Mensajes mostrados hoy', successfulUpdates: 'Actualizaciones exitosas',
            errorsLabel: 'Errores', diagnosticsTitle: 'Diagnóstico', testConnectionBtn: 'Probar conexión',
            bleConnection: 'Conexión BLE', modelLabel: 'Modelo', firmwareLabel: 'Firmware', freeMemory: 'Memoria libre',
            matrixType: 'Tipo de matriz', lastSentLabel: 'Último envío', lastErrorLabel: 'Último error',
            goodPractices: 'Buenas prácticas', tipShortMessages: 'Usa mensajes cortos y claros.',
            tipAvoidBlinking: 'Evita parpadeos excesivos.', tipPrioritizeColors: 'Prioriza colores por nivel de urgencia.',
            colorPriorities: 'Prioridades por color', greenPriority: 'Verde -- estado normal / OK',
            amberPriority: 'Ámbar -- advertencia / atención', redPriority: 'Rojo -- alerta / peligro', bluePriority: 'Azul -- información / proceso',
            colorsTitle: 'Colores', quickPalette: 'Paleta rápida', colorPicker: 'Selector de color',
            savedColors: 'Colores guardados', saveColorTitle: 'Guardar el color actual',
            announcementNameLabel: 'Nombre del anuncio', announcementNamePlaceholder: 'Alerta Temperatura Alta',
            assignMachineLabel: 'Asignar a máquina', priorityLabel: 'Prioridad',
            editor1632: 'Editor 16x32', pixels1632: '16 x 32 píxeles',
            pencilTitle: 'Lápiz', eraserTitle: 'Borrador', lineTitle: 'Línea', rectTitle: 'Rectángulo', ellipseTitle: 'Elipse',
            bucketTitle: 'Cubeta', eyedropperTitle: 'Gotero', importImageTitle: 'Importar imagen', textTitle: 'Texto', clearAllTitle: 'Borrar todo',
            textPlaceholder: 'TEXTO', rowLabel: 'Fila', rowTitle: 'Fila inicial', columnLabel: 'Columna', columnTitle: 'Columna inicial',
            placeBtn: 'Colocar', livePreviewBtn: 'Vista previa en vivo', templatesTitle: 'Marcos / Plantillas',
            schedulingTitle: 'Programación', playbackModeLabel: 'Modo de reproducción', manualOption: 'Manual', scheduledOption: 'Programado',
            startDateLabel: 'Fecha de inicio', endDateLabel: 'Fecha de fin (opcional)', repeatLabel: 'Repetir',
            durationTitle: 'Duración del anuncio', screenTimeLabel: 'Tiempo en pantalla (seg)', transitionLabel: 'Transición (seg)',
            assignmentTitle: 'Asignación', groupLabel: 'Grupo (opcional)', tagsLabel: 'Etiquetas', addTagPlaceholder: 'Agregar etiqueta',
            saveAnnouncementBtn: 'Guardar Anuncio', cancelBtn: 'Cancelar',
            savedAnnouncementsTitle: 'Anuncios guardados', searchAnnouncementsPlaceholder: 'Buscar anuncios…',
            colName: 'Nombre', colMachine: 'Máquina', colResolution: 'Resolución', colDuration: 'Duración',
            colPriority: 'Prioridad', colStatus: 'Estado', colActions: 'Acciones',
            machineAlertsTitle: 'Alertas por máquina',
            machineAlertsHint: 'Para cada máquina, elige qué anuncio mostrar cuando cambie a cada estado -- reusa los anuncios de arriba en vez de un color fijo por estado.',
            previewTitle: 'Vista previa', effectsTitle: 'Efectos', entryEffectLabel: 'Efecto de entrada',
            sendAnimationLabel: 'Animación al enviar (combinables)', animateColumnLabel: 'Animar por columna', animateRowLabel: 'Animar por fila',
            speedLabel: 'Velocidad', exitEffectLabel: 'Efecto de salida', pauseLabel: 'Pausa (seg)',
            accessoryConfigModalDesc: 'La IP y credenciales del ESP32 que hace de puente BLE.',
            accessoryIpLabel: 'IP del accesorio', usernameLabel: 'Usuario', passwordLabel: 'Contraseña',
            jobDoneOnlyAlert: 'Avisar solo cuando un trabajo termine o falle', saveBtn: 'Guardar',
            machineAlertsEyebrow: 'ALERTAS POR MÁQUINA', visualAlertsTitle: 'Alertas visuales',
            machineAlertsCheckboxLabel: 'Esta máquina mandará sus cambios de estado a la Matriz LED.',
            announcementPerState: 'Anuncio para cada estado',
            confirmClearAll: 'Vas a borrar todo el dibujo actual. Esta acción no se puede deshacer.', clearAllConfirmTitle: 'Borrar todo',
            testing: 'Probando…', matrixLedNavLabel: 'Matriz LED',
            dayInitials: 'L,M,M,J,V,S,D',
            // Panel LED del taller (FK-8Wa) y fichas de pestañas -- ver las secciones fk y tab más abajo.
            fkAnnChoose: 'Elige un anuncio…',
            fkAnnLabel: 'O muestra un anuncio guardado',
            fkAnnMissing: 'Elige un anuncio primero',
            fkAnnShow: 'Mostrar',
            fkAppearsAtOnce: 'Aparece de golpe',
            fkBorderCcw: 'Antihorario',
            fkBorderCw: 'Horario',
            fkBorderDlineCcw: 'Dos líneas antihorario',
            fkBorderDlineCw: 'Dos líneas horario',
            fkBorderFixed: 'Fijo',
            fkBorderFlash: 'Parpadeo',
            fkBorderFlashCcw: 'Parpadeo antihorario',
            fkBorderFlashCw: 'Parpadeo horario',
            fkBorderLineCcw: 'Una línea antihorario',
            fkBorderLineCw: 'Una línea horario',
            fkBorderRandom: 'Aleatorio',
            fkBrightHelp: 'Qué tan fuerte encienden los LEDs. De día súbelo; de noche bájalo para que no deslumbre.',
            fkBrightNote: 'Se aplica en el panel en unos segundos.',
            fkBrightTitle: 'Brillo',
            fkClockBarra: '; la barra marca cuánto falta',
            fkClockContorno: '; el contorno marca cuánto falta',
            fkClockMarco: '; el marco se mueve mientras tanto',
            fkConnChecking: 'Comprobando…',
            fkConnDisabled: 'Apagado',
            fkConnOk: 'Conectado',
            fkConnSizeMismatch: 'Panel desconfigurado',
            fkConnTitle: 'Conexión y tiempos',
            fkConnUnreachable: 'Sin conexión',
            fkDirAria: 'Dirección',
            fkDirD: '↓ Hacia abajo',
            fkDirL: '⟲ Continuo',
            fkDirL1: '← Entra y avanza',
            fkDirR: '→ De izquierda a derecha',
            fkDirU: '↑ Hacia arriba',
            fkDoneHelp: 'Cuánto se queda el aviso cuando acaba una impresión, antes de volver a lo normal.',
            fkDoneLabel: 'Aviso de "terminó"',
            fkEffect_blind_1: 'Persiana horizontal',
            fkEffect_blind_2: 'Persiana vertical',
            fkEffect_blind_3: 'Persiana en cuadros',
            fkEffect_cover_1: 'Cubrir de izquierda a derecha',
            fkEffect_cover_2: 'Cubrir de derecha a izquierda',
            fkEffect_cover_3: 'Cubrir de los lados al centro',
            fkEffect_cover_4: 'Cubrir del centro a los lados',
            fkEffect_cover_5: 'Cubrir de arriba a abajo',
            fkEffect_cover_6: 'Cubrir de abajo a arriba',
            fkEffect_extend_1: 'Extender hacia la izquierda',
            fkEffect_extend_2: 'Extender hacia la derecha',
            fkEffect_extend_3: 'Extender hacia arriba',
            fkEffect_extend_4: 'Extender hacia abajo',
            fkEffect_flash_1: 'Parpadeo',
            fkEffect_flash_2: 'Parpadeo invertido',
            fkEffect_flash_3: 'Neón',
            fkEffect_movein_1: 'Entrar desde la izquierda',
            fkEffect_movein_2: 'Entrar desde la derecha',
            fkEffect_movein_3: 'Entrar desde arriba',
            fkEffect_movein_4: 'Entrar desde abajo',
            fkEffect_movein_5: 'Entrar por los lados',
            fkEffect_movein_6: 'Entrar por arriba y abajo',
            fkEffect_movein_7: 'Entrar desde el centro',
            fkEffect_scroll_d: 'Desplazar ↓',
            fkEffect_scroll_l: 'Desplazar ← (continuo)',
            fkEffect_scroll_l1: 'Desplazar ← (entra y avanza)',
            fkEffect_scroll_r: 'Desplazar →',
            fkEffect_scroll_u: 'Desplazar ↑',
            fkEffect_sector_1: 'Sector horario',
            fkEffect_sector_2: 'Sector antihorario',
            fkEffect_sector_3: 'Sector cerrar',
            fkEffect_sector_4: 'Sector abrir',
            fkEffect_shadow_1: 'Sombra izquierda',
            fkEffect_shadow_2: 'Sombra derecha',
            fkEffect_shadow_3: 'Sombra arriba',
            fkEffect_shadow_4: 'Sombra abajo',
            fkEnabledLabel: 'Panel encendido desde NOPAL',
            fkFamAll: 'Todos',
            fkFamAria: 'Familias de efectos',
            fkFamBlind: 'Persiana',
            fkFamCover: 'Cubrir',
            fkFamEnter: 'Entrar',
            fkFamExtend: 'Extender',
            fkFamFlash: 'Parpadeo',
            fkFamScroll: 'Desplazar',
            fkFamSector: 'Sector',
            fkFamShadow: 'Sombra',
            fkFxAll: 'Todas las pantallas',
            fkFxHelp: 'Así aparece una pantalla nueva: entrando, cubriendo, con persiana, con parpadeo... Cada recuadro repite el efecto. Toca uno para usarlo; "Probar en mi panel" lo manda un momento al panel real para que lo veas de verdad.',
            fkFxReset: 'Quitar todos los efectos',
            fkFxTarget: 'Usar el efecto elegido en:',
            fkFxTitle: 'Galería de efectos',
            fkGalleryHelp: 'Cada pantalla que puede mostrar el panel, con datos de ejemplo.',
            fkGalleryNote: 'Ejemplos con datos inventados, para saber qué puede aparecer y cuándo sale cada una.',
            fkGalleryTitle: 'Ver las 15 pantallas posibles',
            fkHelp: 'Ayuda',
            fkIpHelp: 'La IP que le diste al panel con FKShow. Solo se cambia si mueves el panel a otra red.',
            fkIpLabel: 'Dirección del panel en la red',
            fkKind3d: '3D',
            fkKindCnc: 'CNC',
            fkKindLaser: 'Láser',
            fkLegendNote: 'Aquí se dibujan aproximados; el panel real los anima él mismo.',
            fkLegendTested: 'Probado en tu panel',
            fkLegendUntested: 'Sin probar todavía',
            fkLoadError: 'No se pudo consultar el panel. Se vuelve a intentar solo.',
            fkMachAdd: 'Agregar',
            fkMachAddAria: 'Agregar máquina',
            fkMachDown: 'Bajar {name}',
            fkMachEmpty: 'Todavía no hay máquinas elegidas.',
            fkMachHelp: 'Las máquinas que aparecen en el panel: impresoras 3D, láser o CNC. Como la pantalla es chica, cada una usa un nombre corto de hasta 4 letras; cámbialo si no te gusta. Arrástralas para ordenarlas.',
            fkMachHint: 'El nombre corto de cada máquina es el que se ve en el LED (hasta 4 letras o números).',
            fkMachMissing: '{id} (ya no existe)',
            fkMachNoMore: 'No hay más para agregar',
            fkMachRemove: 'Quitar {name}',
            fkMachTitle: 'Máquinas en el panel',
            fkMachUp: 'Subir {name}',
            fkMarcoAnim: 'Animación del marco',
            fkMarcoPattern: 'Forma de la línea',
            fkMarcoShared: 'Estos dos ajustes valen para todos los marcos animados.',
            fkMarcoSpeed: 'Velocidad del marco',
            fkMinHelp: 'El panel parpadea un instante cada vez que NOPAL le manda algo nuevo. Esto evita mandarle cosas demasiado seguido.',
            fkMinLabel: 'Pausa mínima entre cambios',
            fkMinutesAria: 'Minutos que se muestra',
            fkMinutesShort: '{n} min',
            fkMissingMachines: 'Estas máquinas ya no existen en NOPAL; quítalas de la lista: {ids}',
            fkMsgAria: 'Mensaje',
            fkMsgClear: 'Quitar',
            fkMsgCleared: 'Mensaje quitado',
            fkMsgFail: 'No se pudo: {detail}',
            fkMsgHelp: 'Escribe algo y elige cuánto tiempo se muestra. Si es largo, corre por la pantalla (puedes elegir cómo, más abajo). Después se quita solo. No tapa errores ni pausas.',
            fkMsgMissing: 'Escribe un mensaje primero',
            fkMsgOnPanel: 'En el panel:',
            fkMsgPlaceholder: 'Ejemplo: JUNTA A LAS 5',
            fkMsgRemovesIn: 'se quita en {time}',
            fkMsgSend: 'Mostrar en el panel',
            fkMsgSent: 'Listo, ya está en el panel',
            fkMsgTitle: 'Mandar un mensaje al panel',
            fkNoEffect: 'Sin efecto',
            fkNowBootText: 'En unos segundos mostrará lo de tus máquinas.',
            fkNowBootTitle: 'El panel está arrancando.',
            fkNowCoolingText: 'Muestra la temperatura bajando y se quita al llegar a 50 °C.',
            fkNowCoolingTitle: 'Una máquina se está enfriando.',
            fkNowDoneText: 'El aviso se queda un rato y luego vuelve a lo normal{clock}.',
            fkNowDoneTitle: 'Una impresión terminó.',
            fkNowErrorText: 'Es lo más importante, así que tapa todo lo demás.',
            fkNowErrorTitle: 'Una máquina tiene un error.',
            fkNowHeatingText: 'El panel muestra la temperatura que lleva y la que falta, y cambia a "Trabajando" cuando empiece el trabajo.',
            fkNowHeatingTitle: 'Una máquina está calentando.',
            fkNowHelp: 'Es una copia en vivo de lo que tiene encendido el panel. Cambia sola cuando algo pasa en tus máquinas; no tienes que hacer nada.',
            fkNowIdleText: 'Ninguna máquina está trabajando.',
            fkNowIdleTitle: 'Todas en reposo.',
            fkNowManyText: 'El panel las muestra de 3 en 3{clock}.',
            fkNowManyTitle: 'Hay varias máquinas trabajando.',
            fkNowNormalText: 'Tus máquinas están en línea; el panel muestra cuántas y la hora.',
            fkNowNormalTitle: 'Todo normal.',
            fkNowOffText: 'NOPAL no le está mandando nada.',
            fkNowOffTitle: 'El panel está apagado.',
            fkNowOfflineText: 'Revisa que esté prendida y conectada.',
            fkNowOfflineTitle: 'Una máquina no responde.',
            fkNowPauseText: 'Se queda así hasta que la reanudes.',
            fkNowPauseTitle: 'Hay una máquina en pausa.',
            fkNowPrintingText: 'El panel alterna dos vistas solo{clock}.',
            fkNowPrintingTitle: 'Hay una impresión en marcha.',
            fkNowReadyText: 'El panel se queda así hasta que mandes imprimir o apagues el calentador.',
            fkNowReadyTitle: 'Una máquina ya está en temperatura.',
            fkNowScrollText: 'Corre por la pantalla y se quita solo al terminar el tiempo.',
            fkNowScrollTitle: 'Mostrando tu mensaje largo.',
            fkNowSpecialText: 'Se quita solo al terminar el tiempo{clock}.',
            fkNowSpecialTitle: 'Mostrando tu mensaje.',
            fkNowTitle: 'Así se ve tu panel ahora',
            fkNowWaitingTitle: 'Esperando información del panel…',
            fkPanelAria: 'Copia del panel LED',
            fkPatternDash: 'Guiones',
            fkPatternDot: 'Puntos',
            fkPatternDot1: 'Puntos finos',
            fkPatternSolid: 'Línea continua',
            fkPrioCooling: 'Enfriando',
            fkPrioCoolingTip: 'Una máquina con el calentador apagado que aún pasa de 50 °C.',
            fkPrioDone: 'Terminó',
            fkPrioDoneTip: 'Una impresión acaba de terminar.',
            fkPrioError: 'Error',
            fkPrioErrorTip: 'Una máquina reporta un error.',
            fkPrioHeating: 'Calentando',
            fkPrioHeatingTip: 'Una máquina calentando antes de imprimir.',
            fkPrioNormal: 'Normal',
            fkPrioNormalTip: 'Todo en línea y sin pendientes.',
            fkPrioNow: 'ahora',
            fkPrioOffline: 'Desconectada',
            fkPrioOfflineTip: 'Una máquina de tu lista no responde.',
            fkPrioPause: 'Pausa',
            fkPrioPauseTip: 'Una impresión quedó en pausa.',
            fkPrioPrinting: 'Trabajando',
            fkPrioPrintingTip: 'Una o varias máquinas trabajando.',
            fkPrioReady: 'En temperatura',
            fkPrioReadyTip: 'Una máquina ya llegó a su temperatura y espera.',
            fkPrioSpecial: 'Mensaje',
            fkPrioSpecialTip: 'Un mensaje que mandaste, mientras dure.',
            fkReadOnly: 'Solo un administrador puede cambiar los ajustes de abajo. Tú sí puedes mandar y quitar mensajes.',
            fkSave: 'Guardar',
            fkSaveFail: 'No se pudo guardar: {detail}',
            fkSaved: 'Guardado',
            fkSaving: 'Guardando…',
            fkScreenBoot: 'Arranque',
            fkScreenBootDesc: 'Al encender NOPAL, unos segundos, mientras llega el estado de las máquinas.',
            fkScreenCooling: 'Enfriando',
            fkScreenCoolingDesc: 'Se apagó el calentador y la máquina aún pasa de 50 °C: muestra la temperatura bajando.',
            fkScreenDone: 'Terminó',
            fkScreenDoneDesc: 'Acaba de terminar una impresión. Dura 60 s y vuelve a lo normal.',
            fkScreenError: 'Error',
            fkScreenErrorDesc: 'Una máquina tiene un error. Es lo más importante: tapa todo lo demás.',
            fkScreenHeating: 'Calentando',
            fkScreenHeatingDesc: 'Una máquina tiene temperatura objetivo y todavía no la alcanza: muestra lo que lleva y lo que falta.',
            fkScreenIdle: 'Todas en reposo',
            fkScreenIdleDesc: 'Lo mismo que "Todo normal": alternan cada 15 s mientras no pase nada.',
            fkScreenMany: 'Varias trabajando',
            fkScreenManyDesc: 'Dos o más máquinas trabajando a la vez. Si son más de 3, las muestra de 3 en 3.',
            fkScreenNormal: 'Todo normal',
            fkScreenNormalDesc: 'Tus máquinas están en línea y sin trabajo. Alterna con "Todas en reposo" cada 15 s.',
            fkScreenOff: 'NOPAL apagado',
            fkScreenOffDesc: 'Al apagar o reiniciar NOPAL, para que el panel no se quede con datos viejos.',
            fkScreenOffline: 'Desconectada',
            fkScreenOfflineDesc: 'Una máquina de tu lista no responde (apagada o sin red).',
            fkScreenPause: 'Pausa',
            fkScreenPauseDesc: 'Una impresión quedó en pausa. Se queda hasta que la reanudes.',
            fkScreenPrint1: 'Trabajando (vista 1)',
            fkScreenPrint1Desc: 'Una máquina trabajando: nombre, archivo y barra de avance. Alterna con la vista 2 cada 15 s.',
            fkScreenPrint2: 'Trabajando (vista 2)',
            fkScreenPrint2Desc: 'La misma: porcentaje y tiempo que lleva (un láser o CNC muestra su tipo en lugar del tiempo).',
            fkScreenReady: 'En temperatura',
            fkScreenReadyDesc: 'Una máquina ya llegó a su temperatura y espera. Se queda hasta que se mande imprimir o se apague el calentador.',
            fkScreenScroll: 'Mensaje largo',
            fkScreenSpecial: 'Mensaje',
            fkScreenSpecialDesc: 'Tu mensaje (o un aviso de una regla o de la IA) mientras dure su tiempo.',
            fkScrollAria: 'Texto corrido',
            fkScrollHelp: 'Los mensajes largos no caben quietos: corren por la pantalla. Elige hacia dónde y qué tan rápido. Escribe tu texto para probarlo.',
            fkScrollNote: 'Los mensajes cortos se quedan quietos con el efecto de la situación "Mensaje corto".',
            fkScrollSample: 'MATERIAL BAJO EN LA ENDER, CAMBIA EL CARRETE',
            fkScrollSpeedAria: 'Velocidad del texto',
            fkScrollTextLabel: 'Texto de prueba',
            fkScrollTitle: 'Texto corrido en mensajes',
            fkSecondsShort: '{n} s',
            fkSecondsUnit: 'segundos',
            fkSending: 'Enviando…',
            fkShortAria: 'Nombre en el panel de {name}',
            fkSitAria: 'Efecto para {name}',
            fkSitBlocked: 'Con este contorno la pantalla cambia sin efecto de entrada.',
            fkSitCooling: 'Enfriando',
            fkSitDone: 'Terminó',
            fkSitError: 'Error',
            fkSitFxLabel: 'Cómo aparece',
            fkSitHeating: 'Calentando',
            fkSitHelp: 'Cada situación del panel tiene su propia ficha. Elige su contorno (la orilla del panel) y cómo aparece. El dibujo de cada ficha se mueve como lo hará el panel.',
            fkSitIntro: 'Si calientas y no mandas imprimir, el panel se queda en "En temperatura" hasta que empiece la impresión o apagues el calentador; luego muestra "Enfriando" hasta que baje de 50 °C.',
            fkSitMarcoAria: 'Animación del marco de {name}',
            fkSitNew: 'NUEVA',
            fkSitOffline: 'Desconectada',
            fkSitPause: 'Pausa',
            fkSitPrinting: 'Trabajando',
            fkSitReady: 'En temperatura',
            fkSitRest: 'Todo tranquilo',
            fkSitSpecial: 'Mensaje corto',
            fkSitStyleAria: 'Contorno de {name}',
            fkSitStyleLabel: 'Contorno',
            fkSitTempDrain: 'El contorno se vacía con la temperatura; el panel parpadea un instante al actualizar (cada 15 s).',
            fkSitTempFill: 'El contorno se llena con la temperatura; el panel parpadea un instante al actualizar (cada 15 s).',
            fkSitTitle: 'Cómo se ve cada situación',
            fkSitWhenCooling: 'Se apagó el calentador y aún pasa de 50 °C.',
            fkSitWhenDone: 'Terminó una impresión (dura 60 s).',
            fkSitWhenError: 'Una máquina reporta un error.',
            fkSitWhenHeating: 'Una máquina sube a su temperatura y aún no imprime.',
            fkSitWhenOffline: 'Una máquina de tu lista no responde.',
            fkSitWhenPause: 'Una impresión en pausa.',
            fkSitWhenPrinting: 'Una o varias máquinas trabajando.',
            fkSitWhenReady: 'Ya llegó a la temperatura y espera. Se queda hasta imprimir o apagar el calentador.',
            fkSitWhenRest: 'Todo en línea y sin trabajo. Alterna dos pantallas.',
            fkSitWhenSpecial: 'Tu mensaje, mientras dure.',
            fkSizeMismatch: 'El panel está mal configurado: se ve de {size} en vez de 96x16. Pasa cuando se deja presionado 15 segundos el botón de prueba de su tarjeta. Configúralo otra vez con FKShow y luego presiona "Probar" en "Conexión y tiempos".',
            fkStyleBarra: 'Barra abajo',
            fkStyleBarraDesc: 'Una barrita avanza por la fila de abajo.',
            fkStyleContorno: 'Contorno',
            fkStyleContornoDesc: 'Una línea enciende la orilla; al completarse, cambia.',
            fkStyleEncima: 'Contorno encima',
            fkStyleEncimaDesc: 'Igual, pero con las letras a tamaño completo.',
            fkStyleGeneral: 'General ({name})',
            fkGeneralStyleLabel: 'Contorno general',
            fkGeneralStyleHelp: 'Lo usan las situaciones que dejes en "General".',
            fkStyleMarco: 'Marco del panel',
            fkStyleMarcoDesc: 'Animación decorativa del propio panel; no marca el tiempo.',
            fkStyleNinguno: 'Sin contorno',
            fkStyleNingunoDesc: 'La pantalla cambia de vista sin marcar el tiempo.',
            fkStyleTemp: 'Según la temperatura',
            fkSub: 'Pantalla FK-8Wa de 96×16 · muestra solo lo que pasa en tus máquinas',
            fkTagTested: '● Probado en tu panel',
            fkTagUntested: '○ Sin probar',
            fkTest: 'Probar',
            fkTestFail: 'No encuentro el panel. Revisa que esté prendido y que la dirección sea correcta.',
            fkTestOk: 'Encontrado: panel de 96×16, listo.',
            fkTestWrongSize: 'Encontré un panel de {width}×{height}, pero debe ser de 96×16. Revisa su configuración con FKShow.',
            fkTesting: 'Buscando el panel…',
            fkTabsAria: 'Secciones del panel LED',
            fkTabPanel: 'Panel',
            fkTabMach: 'Máquinas y conexión',
            fkTabClock: 'Reloj y texto',
            fkTabFx: 'Efectos',
            fkTabScreens: 'Las 15 pantallas',
            fkTitle: 'Panel LED del taller',
            fkTryBtn: 'Probar en mi panel',
            fkTryFail: 'No se pudo probar: {detail}',
            fkTryOk: 'Listo: el panel mostró "{name}" unos segundos y volvió a lo de antes.',
            fkTrying: 'Mandando "{name}" al panel…',
            fkUntested: ' (sin probar)',
            fkViewFixed: 'Fija',
            fkViewHelp: 'Al imprimir, el panel alterna dos vistas (archivo y porcentaje). Esto es lo que dura cada una.',
            fkViewLabel: 'Cada vista dura',
            fkWhyHelp: 'Si pasan varias cosas a la vez, el panel muestra la de más arriba a la izquierda: un error siempre gana a una impresión.',
            fkWhyTitle: '¿Por qué muestra esto?',
            tabAnnMany: '{n} anuncios',
            tabAnnOne: '1 anuncio',
            tabCardLed: 'Panel LED',
            tabCardLedSub: 'FK-8Wa 96×16',
            tabCardMain: 'Panel principal',
            tabCardMainSub: 'Pantalla BLE iPixel',
            tabCardScenes: 'Escenas y configuración',
            tabCardScenesSub: 'Anuncios, reglas y alertas',
            tabsAria: 'Secciones de Matriz LED',
            fkRuleCheckbox: 'También mostrar en el panel FK-8Wa',
            fkRuleBadgeTitle: 'Esta regla también se muestra en el panel FK-8Wa',
        },
        en: {
            effectStatic: 'Static', effectBlink: 'Blink',
            exitNone: 'None', exitFade: 'Fade', exitOff: 'Turn off',
            priorityHigh: 'High', priorityMedium: 'Medium', priorityLow: 'Low',
            tplAlert: 'Alert', tplError: 'Error', tplAttention: 'Attention', tplEmergency: 'Emergency',
            tplReady: 'Ready', tplWelcome: 'Welcome', tplMaintenance: 'Maintenance',
            tplNightMode: 'Night mode', tplLowMaterial: 'Low material',
            stateIdle: 'Idle', stateHeating: 'Heating', stateCooling: 'Cooling', statePrinting: 'Printing',
            statePaused: 'Paused', stateComplete: 'Completed', stateError: 'Error', stateOffline: 'Offline',
            noSavedColorsYet: 'No saved colors yet',
            noAnnouncementsYet: 'No saved announcements yet.',
            secondsSuffix: 'sec', scheduledBadge: 'Scheduled', activeStateBadge: 'Active',
            editTitle: 'Edit', duplicateTitle: 'Duplicate', deleteTitle: 'Delete',
            confirmDeleteAnnouncement: 'You are about to delete the announcement "{name}". This action cannot be undone.',
            deleteAnnouncementTitle: 'Delete announcement',
            sendToScreenTitle: 'Send "{name}" to the screen',
            errorSending: 'Error sending',
            allUnassigned: 'All / unassigned', noGroup: 'No group', allMachines: 'All',
            missingAnnouncementName: 'Missing the announcement name',
            saving: 'Saving…', announcementSaved: 'Announcement saved', errorSaving: 'Error saving',
            savedGeneric: 'Saved', copySuffix: '(copy)',
            sendingToScreen: 'Sending to the screen… (may take a few seconds)',
            sentWindows: 'Sent ({count} {word})', windowSingular: 'window', windowPlural: 'windows',
            notConfigured: 'Not configured', statusConnected: 'Connected', diagConnected: 'Connected',
            configuredNoBle: 'Configured, no BLE connection', noBle: 'No BLE connection',
            never: 'Never', noErrorsLogged: 'No errors logged', estimatedTemp: '{value}°C (estimated)',
            justNow: 'just now', secondsAgo: '{n} s ago', minutesAgo: '{n} min ago', hoursAgo: '{n} h ago', daysAgo: '{n} d ago',
            currentScene: 'Current scene: {name}', custom: 'Custom', currentSceneNoSends: 'Current scene: No sends yet',
            operational: 'Operational', readyToUse: 'Ready to use', createFirstAnnouncement: 'Create your first announcement',
            rulesAndMachines: '{rules} rules · {machines} machines',
            noAnnouncementsCreateHint: 'You don\'t have any saved announcements yet -- create them in "Scenes and Settings".',
            activeBadge: 'Active', readyBadge: 'Ready',
            suggestionIdleTitle: 'Idle > 5 min', suggestionIdleDetail: 'Show "Night mode"{suffix}',
            detectedNowSuffix: ' -- detected now',
            suggestionMaterialTitle: 'Low material detected', suggestionMaterialDetail: 'Show "Low material"{suffix}',
            suggestionJobDoneTitle: 'Job finished', suggestionJobDoneDetail: 'Notify OK/ERR when a machine finishes or fails',
            suggestionSmokeTitle: 'Smoke detected', suggestionSmokeDetail: 'No smoke sensor installed yet',
            clickToDeactivate: 'Click to deactivate', clickToActivate: 'Click to activate', activateBtn: 'Activate',
            notAvailableBadge: 'Not available', genericError: 'Error',
            noMachinesDetected: 'No machines detected yet.',
            activeAlertsBadge: 'Active', inactiveAlertsBadge: 'Inactive', configureBtn: 'Configure',
            unassignedOption: 'Unassigned',
            dashboardTitle: 'Main panel · LED Matrix',
            dashboardSub: 'Control your LED matrix, scenes, alerts, and workshop automations in real time.',
            editorTitle: 'Scenes and Settings',
            editorSub: 'Create announcements, configure machine alerts, and the ESP32 accessory.',
            checking: 'Checking…', accessoryConfigTitle: 'Accessory settings',
            tabMainPanel: 'Main panel',
            kpiMatricesConnected: 'Connected matrices', kpiActiveScenes: 'Active scenes', kpiAutomations: 'Automations',
            kpiGlobalBrightness: 'Global brightness', noFirmwareSensor: 'No sensor in the firmware',
            liveView: 'Live view', selectMatrix: 'Select matrix', mainMatrixLabel: 'Main matrix · 16×32',
            currentSceneDash: 'Current scene: —', brightnessLabel: 'Brightness:', fpsLabel: 'FPS:', panelTempLabel: 'Panel temp.:',
            registeredResolutions: 'Registered resolutions', rgbResolution: '16 × 32 RGB', defaultBadge: 'Default',
            workshopStatus: 'Workshop status', criticalSensors: 'Critical sensors', ventilation: 'Ventilation',
            stablePower: 'Stable power', ambientTemp: 'Ambient temperature',
            quickScenes: 'Quick scenes', previousTitle: 'Previous', previousAria: 'Previous scenes',
            nextTitle: 'Next', nextAria: 'Next scenes',
            suggestedAutomations: 'Suggested automations', operationalSummary: 'Operational summary',
            uptimeLabel: 'Uptime', messagesToday: 'Messages shown today', successfulUpdates: 'Successful updates',
            errorsLabel: 'Errors', diagnosticsTitle: 'Diagnostics', testConnectionBtn: 'Test connection',
            bleConnection: 'BLE connection', modelLabel: 'Model', firmwareLabel: 'Firmware', freeMemory: 'Free memory',
            matrixType: 'Matrix type', lastSentLabel: 'Last sent', lastErrorLabel: 'Last error',
            goodPractices: 'Best practices', tipShortMessages: 'Use short, clear messages.',
            tipAvoidBlinking: 'Avoid excessive blinking.', tipPrioritizeColors: 'Prioritize colors by urgency level.',
            colorPriorities: 'Color priorities', greenPriority: 'Green -- normal status / OK',
            amberPriority: 'Amber -- warning / attention', redPriority: 'Red -- alert / danger', bluePriority: 'Blue -- information / process',
            colorsTitle: 'Colors', quickPalette: 'Quick palette', colorPicker: 'Color picker',
            savedColors: 'Saved colors', saveColorTitle: 'Save the current color',
            announcementNameLabel: 'Announcement name', announcementNamePlaceholder: 'High Temperature Alert',
            assignMachineLabel: 'Assign to machine', priorityLabel: 'Priority',
            editor1632: '16x32 editor', pixels1632: '16 x 32 pixels',
            pencilTitle: 'Pencil', eraserTitle: 'Eraser', lineTitle: 'Line', rectTitle: 'Rectangle', ellipseTitle: 'Ellipse',
            bucketTitle: 'Bucket', eyedropperTitle: 'Eyedropper', importImageTitle: 'Import image', textTitle: 'Text', clearAllTitle: 'Clear all',
            textPlaceholder: 'TEXT', rowLabel: 'Row', rowTitle: 'Starting row', columnLabel: 'Column', columnTitle: 'Starting column',
            placeBtn: 'Place', livePreviewBtn: 'Live preview', templatesTitle: 'Frames / Templates',
            schedulingTitle: 'Scheduling', playbackModeLabel: 'Playback mode', manualOption: 'Manual', scheduledOption: 'Scheduled',
            startDateLabel: 'Start date', endDateLabel: 'End date (optional)', repeatLabel: 'Repeat',
            durationTitle: 'Announcement duration', screenTimeLabel: 'Time on screen (sec)', transitionLabel: 'Transition (sec)',
            assignmentTitle: 'Assignment', groupLabel: 'Group (optional)', tagsLabel: 'Tags', addTagPlaceholder: 'Add tag',
            saveAnnouncementBtn: 'Save Announcement', cancelBtn: 'Cancel',
            savedAnnouncementsTitle: 'Saved announcements', searchAnnouncementsPlaceholder: 'Search announcements…',
            colName: 'Name', colMachine: 'Machine', colResolution: 'Resolution', colDuration: 'Duration',
            colPriority: 'Priority', colStatus: 'Status', colActions: 'Actions',
            machineAlertsTitle: 'Machine alerts',
            machineAlertsHint: 'For each machine, choose which announcement to show when it changes to each state -- reuses the announcements above instead of a fixed color per state.',
            previewTitle: 'Preview', effectsTitle: 'Effects', entryEffectLabel: 'Entry effect',
            sendAnimationLabel: 'Animation on send (combinable)', animateColumnLabel: 'Animate by column', animateRowLabel: 'Animate by row',
            speedLabel: 'Speed', exitEffectLabel: 'Exit effect', pauseLabel: 'Pause (sec)',
            accessoryConfigModalDesc: 'The IP and credentials of the ESP32 acting as the BLE bridge.',
            accessoryIpLabel: 'Accessory IP', usernameLabel: 'Username', passwordLabel: 'Password',
            jobDoneOnlyAlert: 'Only notify when a job finishes or fails', saveBtn: 'Save',
            machineAlertsEyebrow: 'MACHINE ALERTS', visualAlertsTitle: 'Visual alerts',
            machineAlertsCheckboxLabel: 'This machine will send its state changes to the LED Matrix.',
            announcementPerState: 'Announcement for each state',
            confirmClearAll: 'You are about to clear the entire current drawing. This action cannot be undone.', clearAllConfirmTitle: 'Clear all',
            testing: 'Testing…', matrixLedNavLabel: 'LED Matrix',
            dayInitials: 'M,T,W,T,F,S,S',
            // Panel LED del taller (FK-8Wa) y fichas de pestañas -- ver las secciones fk y tab más abajo.
            fkAnnChoose: 'Choose an announcement…',
            fkAnnLabel: 'Or show a saved announcement',
            fkAnnMissing: 'Choose an announcement first',
            fkAnnShow: 'Show',
            fkAppearsAtOnce: 'Appears at once',
            fkBorderCcw: 'Counterclockwise',
            fkBorderCw: 'Clockwise',
            fkBorderDlineCcw: 'Two lines counterclockwise',
            fkBorderDlineCw: 'Two lines clockwise',
            fkBorderFixed: 'Fixed',
            fkBorderFlash: 'Blink',
            fkBorderFlashCcw: 'Blink counterclockwise',
            fkBorderFlashCw: 'Blink clockwise',
            fkBorderLineCcw: 'One line counterclockwise',
            fkBorderLineCw: 'One line clockwise',
            fkBorderRandom: 'Random',
            fkBrightHelp: 'How brightly the LEDs light up. Turn it up by day; turn it down at night so it does not dazzle.',
            fkBrightNote: 'It is applied on the panel in a few seconds.',
            fkBrightTitle: 'Brightness',
            fkClockBarra: '; the bar shows how much time is left',
            fkClockContorno: '; the outline shows how much time is left',
            fkClockMarco: '; the frame keeps moving meanwhile',
            fkConnChecking: 'Checking…',
            fkConnDisabled: 'Off',
            fkConnOk: 'Connected',
            fkConnSizeMismatch: 'Panel misconfigured',
            fkConnTitle: 'Connection and timing',
            fkConnUnreachable: 'No connection',
            fkDirAria: 'Direction',
            fkDirD: '↓ Downward',
            fkDirL: '⟲ Continuous',
            fkDirL1: '← Enters and moves on',
            fkDirR: '→ Left to right',
            fkDirU: '↑ Upward',
            fkDoneHelp: 'How long the notice stays when a print ends, before going back to normal.',
            fkDoneLabel: '"Finished" notice',
            fkEffect_blind_1: 'Horizontal blinds',
            fkEffect_blind_2: 'Vertical blinds',
            fkEffect_blind_3: 'Checkered blinds',
            fkEffect_cover_1: 'Cover left to right',
            fkEffect_cover_2: 'Cover right to left',
            fkEffect_cover_3: 'Cover sides to center',
            fkEffect_cover_4: 'Cover center to sides',
            fkEffect_cover_5: 'Cover top to bottom',
            fkEffect_cover_6: 'Cover bottom to top',
            fkEffect_extend_1: 'Extend to the left',
            fkEffect_extend_2: 'Extend to the right',
            fkEffect_extend_3: 'Extend upward',
            fkEffect_extend_4: 'Extend downward',
            fkEffect_flash_1: 'Blink',
            fkEffect_flash_2: 'Inverted blink',
            fkEffect_flash_3: 'Neon',
            fkEffect_movein_1: 'Move in from the left',
            fkEffect_movein_2: 'Move in from the right',
            fkEffect_movein_3: 'Move in from the top',
            fkEffect_movein_4: 'Move in from the bottom',
            fkEffect_movein_5: 'Move in from the sides',
            fkEffect_movein_6: 'Move in from top and bottom',
            fkEffect_movein_7: 'Move in from the center',
            fkEffect_scroll_d: 'Scroll ↓',
            fkEffect_scroll_l: 'Scroll ← (continuous)',
            fkEffect_scroll_l1: 'Scroll ← (enters and moves on)',
            fkEffect_scroll_r: 'Scroll →',
            fkEffect_scroll_u: 'Scroll ↑',
            fkEffect_sector_1: 'Clockwise sector',
            fkEffect_sector_2: 'Counterclockwise sector',
            fkEffect_sector_3: 'Sector close',
            fkEffect_sector_4: 'Sector open',
            fkEffect_shadow_1: 'Shadow left',
            fkEffect_shadow_2: 'Shadow right',
            fkEffect_shadow_3: 'Shadow top',
            fkEffect_shadow_4: 'Shadow bottom',
            fkEnabledLabel: 'Panel turned on from NOPAL',
            fkFamAll: 'All',
            fkFamAria: 'Effect families',
            fkFamBlind: 'Blinds',
            fkFamCover: 'Cover',
            fkFamEnter: 'Move in',
            fkFamExtend: 'Extend',
            fkFamFlash: 'Blink',
            fkFamScroll: 'Scroll',
            fkFamSector: 'Sector',
            fkFamShadow: 'Shadow',
            fkFxAll: 'All screens',
            fkFxHelp: 'This is how a new screen appears: sliding in, covering, with blinds, blinking... Each box repeats the effect. Tap one to use it; "Try on my panel" sends it to the real panel for a moment so you can see it for real.',
            fkFxReset: 'Remove all effects',
            fkFxTarget: 'Use the chosen effect on:',
            fkFxTitle: 'Effects gallery',
            fkGalleryHelp: 'Every screen the panel can show, with sample data.',
            fkGalleryNote: 'Examples with made-up data, to know what can appear and when each one shows up.',
            fkGalleryTitle: 'See the 15 possible screens',
            fkHelp: 'Help',
            fkIpHelp: 'The IP you gave the panel with FKShow. Only change it if you move the panel to another network.',
            fkIpLabel: 'Panel address on the network',
            fkKind3d: '3D',
            fkKindCnc: 'CNC',
            fkKindLaser: 'Laser',
            fkLegendNote: 'Here they are drawn approximately; the real panel animates them itself.',
            fkLegendTested: 'Tested on your panel',
            fkLegendUntested: 'Not tested yet',
            fkLoadError: 'Could not check the panel. It will try again on its own.',
            fkMachAdd: 'Add',
            fkMachAddAria: 'Add machine',
            fkMachDown: 'Move {name} down',
            fkMachEmpty: 'No machines chosen yet.',
            fkMachHelp: 'The machines that appear on the panel: 3D printers, laser or CNC. Because the screen is small, each one uses a short name of up to 4 letters; change it if you do not like it. Drag them to reorder.',
            fkMachHint: 'Each machine\'s short name is what shows on the LED (up to 4 letters or numbers).',
            fkMachMissing: '{id} (no longer exists)',
            fkMachNoMore: 'No more to add',
            fkMachRemove: 'Remove {name}',
            fkMachTitle: 'Machines on the panel',
            fkMachUp: 'Move {name} up',
            fkMarcoAnim: 'Frame animation',
            fkMarcoPattern: 'Line style',
            fkMarcoShared: 'These two settings apply to every animated frame.',
            fkMarcoSpeed: 'Frame speed',
            fkMinHelp: 'The panel blinks for a moment each time NOPAL sends it something new. This avoids sending things too often.',
            fkMinLabel: 'Minimum pause between changes',
            fkMinutesAria: 'Minutes it is shown',
            fkMinutesShort: '{n} min',
            fkMissingMachines: 'These machines no longer exist in NOPAL; remove them from the list: {ids}',
            fkMsgAria: 'Message',
            fkMsgClear: 'Remove',
            fkMsgCleared: 'Message removed',
            fkMsgFail: 'It did not work: {detail}',
            fkMsgHelp: 'Write something and choose how long it is shown. If it is long, it scrolls across the screen (you can choose how, further down). Afterwards it goes away by itself. It does not cover errors or pauses.',
            fkMsgMissing: 'Type a message first',
            fkMsgOnPanel: 'On the panel:',
            fkMsgPlaceholder: 'Example: MEETING AT 5',
            fkMsgRemovesIn: 'goes away in {time}',
            fkMsgSend: 'Show on the panel',
            fkMsgSent: 'Done, it is on the panel',
            fkMsgTitle: 'Send a message to the panel',
            fkNoEffect: 'No effect',
            fkNowBootText: 'In a few seconds it will show your machines.',
            fkNowBootTitle: 'The panel is starting up.',
            fkNowCoolingText: 'It shows the temperature dropping and goes away at 50 °C.',
            fkNowCoolingTitle: 'A machine is cooling down.',
            fkNowDoneText: 'The notice stays for a while and then goes back to normal{clock}.',
            fkNowDoneTitle: 'A print has finished.',
            fkNowErrorText: 'It is the most important thing, so it covers everything else.',
            fkNowErrorTitle: 'A machine has an error.',
            fkNowHeatingText: 'The panel shows the temperature it has reached and what is missing, and switches to "Working" when the job starts.',
            fkNowHeatingTitle: 'A machine is heating up.',
            fkNowHelp: 'A live copy of what the panel is showing. It changes by itself when something happens on your machines; you do not have to do anything.',
            fkNowIdleText: 'No machine is working.',
            fkNowIdleTitle: 'All idle.',
            fkNowManyText: 'The panel shows them 3 at a time{clock}.',
            fkNowManyTitle: 'Several machines are working.',
            fkNowNormalText: 'Your machines are online; the panel shows how many and the time.',
            fkNowNormalTitle: 'All normal.',
            fkNowOffText: 'NOPAL is not sending anything to it.',
            fkNowOffTitle: 'The panel is off.',
            fkNowOfflineText: 'Check that it is on and connected.',
            fkNowOfflineTitle: 'A machine is not responding.',
            fkNowPauseText: 'It stays like this until you resume it.',
            fkNowPauseTitle: 'A machine is paused.',
            fkNowPrintingText: 'The panel switches between two views by itself{clock}.',
            fkNowPrintingTitle: 'A print is in progress.',
            fkNowReadyText: 'The panel stays like this until you start a print or turn the heater off.',
            fkNowReadyTitle: 'A machine has reached its temperature.',
            fkNowScrollText: 'It scrolls across the screen and goes away by itself when the time is up.',
            fkNowScrollTitle: 'Showing your long message.',
            fkNowSpecialText: 'It goes away by itself when the time is up{clock}.',
            fkNowSpecialTitle: 'Showing your message.',
            fkNowTitle: 'This is your panel right now',
            fkNowWaitingTitle: 'Waiting for information from the panel…',
            fkPanelAria: 'Copy of the LED panel',
            fkPatternDash: 'Dashes',
            fkPatternDot: 'Dots',
            fkPatternDot1: 'Fine dots',
            fkPatternSolid: 'Solid line',
            fkPrioCooling: 'Cooling',
            fkPrioCoolingTip: 'A machine with the heater off that is still above 50 °C.',
            fkPrioDone: 'Finished',
            fkPrioDoneTip: 'A print has just finished.',
            fkPrioError: 'Error',
            fkPrioErrorTip: 'A machine reports an error.',
            fkPrioHeating: 'Heating',
            fkPrioHeatingTip: 'A machine heating up before printing.',
            fkPrioNormal: 'Normal',
            fkPrioNormalTip: 'Everything online and nothing pending.',
            fkPrioNow: 'now',
            fkPrioOffline: 'Disconnected',
            fkPrioOfflineTip: 'A machine on your list is not responding.',
            fkPrioPause: 'Pause',
            fkPrioPauseTip: 'A print was paused.',
            fkPrioPrinting: 'Working',
            fkPrioPrintingTip: 'One or more machines working.',
            fkPrioReady: 'At temperature',
            fkPrioReadyTip: 'A machine has reached its temperature and is waiting.',
            fkPrioSpecial: 'Message',
            fkPrioSpecialTip: 'A message you sent, for as long as it lasts.',
            fkReadOnly: 'Only an administrator can change the settings below. You can still send and remove messages.',
            fkSave: 'Save',
            fkSaveFail: 'Could not save: {detail}',
            fkSaved: 'Saved',
            fkSaving: 'Saving…',
            fkScreenBoot: 'Startup',
            fkScreenBootDesc: 'When NOPAL starts, for a few seconds, while the status of the machines arrives.',
            fkScreenCooling: 'Cooling',
            fkScreenCoolingDesc: 'The heater is off and the machine is still above 50 °C: it shows the temperature dropping.',
            fkScreenDone: 'Finished',
            fkScreenDoneDesc: 'A print has just finished. It lasts 60 s and goes back to normal.',
            fkScreenError: 'Error',
            fkScreenErrorDesc: 'A machine has an error. It is the most important thing: it covers everything else.',
            fkScreenHeating: 'Heating',
            fkScreenHeatingDesc: 'A machine has a target temperature and has not reached it yet: it shows what it has and what is missing.',
            fkScreenIdle: 'All idle',
            fkScreenIdleDesc: 'The same as "All normal": they alternate every 15 s while nothing happens.',
            fkScreenMany: 'Several working',
            fkScreenManyDesc: 'Two or more machines working at once. If there are more than 3, it shows them 3 at a time.',
            fkScreenNormal: 'All normal',
            fkScreenNormalDesc: 'Your machines are online and idle. It alternates with "All idle" every 15 s.',
            fkScreenOff: 'NOPAL off',
            fkScreenOffDesc: 'When NOPAL is turned off or restarted, so the panel does not keep old data.',
            fkScreenOffline: 'Disconnected',
            fkScreenOfflineDesc: 'A machine on your list is not responding (off or without network).',
            fkScreenPause: 'Pause',
            fkScreenPauseDesc: 'A print was paused. It stays like this until you resume it.',
            fkScreenPrint1: 'Working (view 1)',
            fkScreenPrint1Desc: 'One machine working: name, file and progress bar. It alternates with view 2 every 15 s.',
            fkScreenPrint2: 'Working (view 2)',
            fkScreenPrint2Desc: 'The same one: percentage and elapsed time (a laser or CNC shows its type instead of the time).',
            fkScreenReady: 'At temperature',
            fkScreenReadyDesc: 'A machine has reached its temperature and is waiting. It stays until a print starts or the heater is turned off.',
            fkScreenScroll: 'Long message',
            fkScreenSpecial: 'Message',
            fkScreenSpecialDesc: 'Your message (or a notice from a rule or from the AI) for as long as its time lasts.',
            fkScrollAria: 'Scrolling text',
            fkScrollHelp: 'Long messages do not fit standing still: they scroll across the screen. Choose which way and how fast. Type your text to try it.',
            fkScrollNote: 'Short messages stay still, with the effect of the "Short message" situation.',
            fkScrollSample: 'LOW FILAMENT ON THE ENDER, CHANGE THE SPOOL',
            fkScrollSpeedAria: 'Text speed',
            fkScrollTextLabel: 'Test text',
            fkScrollTitle: 'Scrolling text in messages',
            fkSecondsShort: '{n} s',
            fkSecondsUnit: 'seconds',
            fkSending: 'Sending…',
            fkShortAria: 'Name on the panel for {name}',
            fkSitAria: 'Effect for {name}',
            fkSitBlocked: 'With this outline the screen changes without an entrance effect.',
            fkSitCooling: 'Cooling',
            fkSitDone: 'Finished',
            fkSitError: 'Error',
            fkSitFxLabel: 'How it appears',
            fkSitHeating: 'Heating',
            fkSitHelp: 'Each panel situation has its own card. Choose its outline (the edge of the panel) and how it appears. The drawing on each card moves the way the panel will.',
            fkSitIntro: 'If you heat up and do not start a print, the panel stays on "At temperature" until the print starts or you turn the heater off; then it shows "Cooling" until it drops below 50 °C.',
            fkSitMarcoAria: 'Frame animation for {name}',
            fkSitNew: 'NEW',
            fkSitOffline: 'Disconnected',
            fkSitPause: 'Pause',
            fkSitPrinting: 'Working',
            fkSitReady: 'At temperature',
            fkSitRest: 'All quiet',
            fkSitSpecial: 'Short message',
            fkSitStyleAria: 'Outline for {name}',
            fkSitStyleLabel: 'Outline',
            fkSitTempDrain: 'The outline empties with the temperature; the panel flickers for a moment on each update (every 15 s).',
            fkSitTempFill: 'The outline fills with the temperature; the panel flickers for a moment on each update (every 15 s).',
            fkSitTitle: 'How each situation looks',
            fkSitWhenCooling: 'The heater is off and it is still above 50 °C.',
            fkSitWhenDone: 'A print has finished (lasts 60 s).',
            fkSitWhenError: 'A machine reports an error.',
            fkSitWhenHeating: 'A machine is heating up and is not printing yet.',
            fkSitWhenOffline: 'A machine on your list does not respond.',
            fkSitWhenPause: 'A print is paused.',
            fkSitWhenPrinting: 'One or several machines working.',
            fkSitWhenReady: 'It has reached its temperature and waits. It stays until a print starts or the heater is turned off.',
            fkSitWhenRest: 'Everything online and idle. Alternates two screens.',
            fkSitWhenSpecial: 'Your message, for as long as it lasts.',
            fkSizeMismatch: 'The panel is misconfigured: it reports {size} instead of 96x16. This happens when the test button on its board is held down for 15 seconds. Set it up again with FKShow, then press "Test" under "Connection and timing".',
            fkStyleBarra: 'Bar at the bottom',
            fkStyleBarraDesc: 'A small bar moves along the bottom row.',
            fkStyleContorno: 'Outline',
            fkStyleContornoDesc: 'A line lights up the edge; when it is complete, the view changes.',
            fkStyleEncima: 'Outline on top',
            fkStyleEncimaDesc: 'Same, but with the letters at full size.',
            fkStyleGeneral: 'General ({name})',
            fkGeneralStyleLabel: 'General outline',
            fkGeneralStyleHelp: 'Used by the situations you leave on "General".',
            fkStyleMarco: 'Panel frame',
            fkStyleMarcoDesc: 'Decorative animation done by the panel itself; it does not show the time.',
            fkStyleNinguno: 'No outline',
            fkStyleNingunoDesc: 'The screen changes view without showing the time.',
            fkStyleTemp: 'Follows the temperature',
            fkSub: 'FK-8Wa 96×16 display · shows only what is happening on your machines',
            fkTagTested: '● Tested on your panel',
            fkTagUntested: '○ Not tested',
            fkTest: 'Test',
            fkTestFail: 'I cannot find the panel. Check that it is on and that the address is correct.',
            fkTestOk: 'Found: 96×16 panel, ready.',
            fkTestWrongSize: 'I found a {width}×{height} panel, but it must be 96×16. Check its setup with FKShow.',
            fkTesting: 'Looking for the panel…',
            fkTabsAria: 'LED panel sections',
            fkTabPanel: 'Panel',
            fkTabMach: 'Machines and connection',
            fkTabClock: 'Clock and text',
            fkTabFx: 'Effects',
            fkTabScreens: 'The 15 screens',
            fkTitle: 'Workshop LED panel',
            fkTryBtn: 'Try on my panel',
            fkTryFail: 'Could not test: {detail}',
            fkTryOk: 'Done: the panel showed "{name}" for a few seconds and went back to what it was showing.',
            fkTrying: 'Sending "{name}" to the panel…',
            fkUntested: ' (untested)',
            fkViewFixed: 'Fixed',
            fkViewHelp: 'While printing, the panel switches between two views (file and percentage). This is how long each one lasts.',
            fkViewLabel: 'Each view lasts',
            fkWhyHelp: 'If several things happen at once, the panel shows the one at the top left: an error always wins over a print.',
            fkWhyTitle: 'Why is it showing this?',
            tabAnnMany: '{n} announcements',
            tabAnnOne: '1 announcement',
            tabCardLed: 'LED panel',
            tabCardLedSub: 'FK-8Wa 96×16',
            tabCardMain: 'Main panel',
            tabCardMainSub: 'iPixel BLE display',
            tabCardScenes: 'Scenes and settings',
            tabCardScenesSub: 'Announcements, rules and alerts',
            tabsAria: 'LED Matrix sections',
            fkRuleCheckbox: 'Also show on the FK-8Wa panel',
            fkRuleBadgeTitle: 'This rule is also shown on the FK-8Wa panel',
        },
        de: {
            effectStatic: 'Statisch', effectBlink: 'Blinken',
            exitNone: 'Keiner', exitFade: 'Ausblenden', exitOff: 'Ausschalten',
            priorityHigh: 'Hoch', priorityMedium: 'Mittel', priorityLow: 'Niedrig',
            tplAlert: 'Alarm', tplError: 'Fehler', tplAttention: 'Achtung', tplEmergency: 'Notfall',
            tplReady: 'Bereit', tplWelcome: 'Willkommen', tplMaintenance: 'Wartung',
            tplNightMode: 'Nachtmodus', tplLowMaterial: 'Material niedrig',
            stateIdle: 'Bereit', stateHeating: 'Heizt auf', stateCooling: 'Kühlt ab', statePrinting: 'Druckt',
            statePaused: 'Pausiert', stateComplete: 'Abgeschlossen', stateError: 'Fehler', stateOffline: 'Offline',
            noSavedColorsYet: 'Noch keine gespeicherten Farben',
            noAnnouncementsYet: 'Noch keine gespeicherten Anzeigen.',
            secondsSuffix: 'Sek.', scheduledBadge: 'Geplant', activeStateBadge: 'Aktiv',
            editTitle: 'Bearbeiten', duplicateTitle: 'Duplizieren', deleteTitle: 'Löschen',
            confirmDeleteAnnouncement: 'Du wirst die Anzeige "{name}" löschen. Diese Aktion kann nicht rückgängig gemacht werden.',
            deleteAnnouncementTitle: 'Anzeige löschen',
            sendToScreenTitle: '"{name}" an den Bildschirm senden',
            errorSending: 'Fehler beim Senden',
            allUnassigned: 'Alle / nicht zugewiesen', noGroup: 'Keine Gruppe', allMachines: 'Alle',
            missingAnnouncementName: 'Der Name der Anzeige fehlt',
            saving: 'Wird gespeichert…', announcementSaved: 'Anzeige gespeichert', errorSaving: 'Fehler beim Speichern',
            savedGeneric: 'Gespeichert', copySuffix: '(Kopie)',
            sendingToScreen: 'Wird an den Bildschirm gesendet… (kann ein paar Sekunden dauern)',
            sentWindows: 'Gesendet ({count} {word})', windowSingular: 'Fenster', windowPlural: 'Fenster',
            notConfigured: 'Nicht konfiguriert', statusConnected: 'Verbunden', diagConnected: 'Verbunden',
            configuredNoBle: 'Konfiguriert, keine BLE-Verbindung', noBle: 'Keine BLE-Verbindung',
            never: 'Nie', noErrorsLogged: 'Keine Fehler protokolliert', estimatedTemp: '{value}°C (geschätzt)',
            justNow: 'gerade eben', secondsAgo: 'vor {n} s', minutesAgo: 'vor {n} Min.', hoursAgo: 'vor {n} Std.', daysAgo: 'vor {n} T.',
            currentScene: 'Aktuelle Szene: {name}', custom: 'Benutzerdefiniert', currentSceneNoSends: 'Aktuelle Szene: Noch nichts gesendet',
            operational: 'Betriebsbereit', readyToUse: 'Einsatzbereit', createFirstAnnouncement: 'Erstelle deine erste Anzeige',
            rulesAndMachines: '{rules} Regeln · {machines} Maschinen',
            noAnnouncementsCreateHint: 'Du hast noch keine gespeicherten Anzeigen -- erstelle sie unter "Szenen und Konfiguration".',
            activeBadge: 'Aktiv', readyBadge: 'Bereit',
            suggestionIdleTitle: 'Inaktivität > 5 Min.', suggestionIdleDetail: '"Nachtmodus" anzeigen{suffix}',
            detectedNowSuffix: ' -- gerade erkannt',
            suggestionMaterialTitle: 'Niedriger Materialstand erkannt', suggestionMaterialDetail: '"Material niedrig" anzeigen{suffix}',
            suggestionJobDoneTitle: 'Auftrag beendet', suggestionJobDoneDetail: 'OK/ERR melden, wenn eine Maschine fertig ist oder fehlschlägt',
            suggestionSmokeTitle: 'Rauch erkannt', suggestionSmokeDetail: 'Noch kein Rauchmelder installiert',
            clickToDeactivate: 'Klicken zum Deaktivieren', clickToActivate: 'Klicken zum Aktivieren', activateBtn: 'Aktivieren',
            notAvailableBadge: 'Nicht verfügbar', genericError: 'Fehler',
            noMachinesDetected: 'Noch keine Maschinen erkannt.',
            activeAlertsBadge: 'Aktiv', inactiveAlertsBadge: 'Inaktiv', configureBtn: 'Konfigurieren',
            unassignedOption: 'Nicht zugewiesen',
            dashboardTitle: 'Hauptpanel · LED-Matrix',
            dashboardSub: 'Steuere deine LED-Matrix, Szenen, Warnungen und Werkstattautomatisierungen in Echtzeit.',
            editorTitle: 'Szenen und Konfiguration',
            editorSub: 'Erstelle Anzeigen, konfiguriere Maschinenwarnungen und das ESP32-Zubehör.',
            checking: 'Wird geprüft…', accessoryConfigTitle: 'Zubehör-Konfiguration',
            tabMainPanel: 'Hauptpanel',
            kpiMatricesConnected: 'Verbundene Matrizen', kpiActiveScenes: 'Aktive Szenen', kpiAutomations: 'Automatisierungen',
            kpiGlobalBrightness: 'Globale Helligkeit', noFirmwareSensor: 'Kein Sensor in der Firmware',
            liveView: 'Live-Ansicht', selectMatrix: 'Matrix auswählen', mainMatrixLabel: 'Hauptmatrix · 16×32',
            currentSceneDash: 'Aktuelle Szene: —', brightnessLabel: 'Helligkeit:', fpsLabel: 'FPS:', panelTempLabel: 'Panel-Temp.:',
            registeredResolutions: 'Registrierte Auflösungen', rgbResolution: '16 × 32 RGB', defaultBadge: 'Standard',
            workshopStatus: 'Werkstattstatus', criticalSensors: 'Kritische Sensoren', ventilation: 'Belüftung',
            stablePower: 'Stabile Stromversorgung', ambientTemp: 'Umgebungstemperatur',
            quickScenes: 'Schnellszenen', previousTitle: 'Vorherige', previousAria: 'Vorherige Szenen',
            nextTitle: 'Nächste', nextAria: 'Nächste Szenen',
            suggestedAutomations: 'Vorgeschlagene Automatisierungen', operationalSummary: 'Betriebsübersicht',
            uptimeLabel: 'Betriebszeit', messagesToday: 'Heute angezeigte Nachrichten', successfulUpdates: 'Erfolgreiche Updates',
            errorsLabel: 'Fehler', diagnosticsTitle: 'Diagnose', testConnectionBtn: 'Verbindung testen',
            bleConnection: 'BLE-Verbindung', modelLabel: 'Modell', firmwareLabel: 'Firmware', freeMemory: 'Freier Speicher',
            matrixType: 'Matrixtyp', lastSentLabel: 'Letzte Sendung', lastErrorLabel: 'Letzter Fehler',
            goodPractices: 'Bewährte Praktiken', tipShortMessages: 'Verwende kurze, klare Nachrichten.',
            tipAvoidBlinking: 'Vermeide übermäßiges Blinken.', tipPrioritizeColors: 'Priorisiere Farben nach Dringlichkeit.',
            colorPriorities: 'Farbprioritäten', greenPriority: 'Grün -- normaler Status / OK',
            amberPriority: 'Bernstein -- Warnung / Achtung', redPriority: 'Rot -- Alarm / Gefahr', bluePriority: 'Blau -- Information / Vorgang',
            colorsTitle: 'Farben', quickPalette: 'Schnellpalette', colorPicker: 'Farbwähler',
            savedColors: 'Gespeicherte Farben', saveColorTitle: 'Aktuelle Farbe speichern',
            announcementNameLabel: 'Name der Anzeige', announcementNamePlaceholder: 'Hohe Temperatur Warnung',
            assignMachineLabel: 'Maschine zuweisen', priorityLabel: 'Priorität',
            editor1632: '16x32-Editor', pixels1632: '16 x 32 Pixel',
            pencilTitle: 'Stift', eraserTitle: 'Radierer', lineTitle: 'Linie', rectTitle: 'Rechteck', ellipseTitle: 'Ellipse',
            bucketTitle: 'Eimer', eyedropperTitle: 'Pipette', importImageTitle: 'Bild importieren', textTitle: 'Text', clearAllTitle: 'Alles löschen',
            textPlaceholder: 'TEXT', rowLabel: 'Zeile', rowTitle: 'Startzeile', columnLabel: 'Spalte', columnTitle: 'Startspalte',
            placeBtn: 'Platzieren', livePreviewBtn: 'Live-Vorschau', templatesTitle: 'Rahmen / Vorlagen',
            schedulingTitle: 'Zeitplanung', playbackModeLabel: 'Wiedergabemodus', manualOption: 'Manuell', scheduledOption: 'Geplant',
            startDateLabel: 'Startdatum', endDateLabel: 'Enddatum (optional)', repeatLabel: 'Wiederholen',
            durationTitle: 'Anzeigedauer', screenTimeLabel: 'Zeit auf dem Bildschirm (Sek.)', transitionLabel: 'Übergang (Sek.)',
            assignmentTitle: 'Zuweisung', groupLabel: 'Gruppe (optional)', tagsLabel: 'Tags', addTagPlaceholder: 'Tag hinzufügen',
            saveAnnouncementBtn: 'Anzeige speichern', cancelBtn: 'Abbrechen',
            savedAnnouncementsTitle: 'Gespeicherte Anzeigen', searchAnnouncementsPlaceholder: 'Anzeigen suchen…',
            colName: 'Name', colMachine: 'Maschine', colResolution: 'Auflösung', colDuration: 'Dauer',
            colPriority: 'Priorität', colStatus: 'Status', colActions: 'Aktionen',
            machineAlertsTitle: 'Maschinenwarnungen',
            machineAlertsHint: 'Wähle für jede Maschine, welche Anzeige bei jedem Statuswechsel gezeigt wird -- nutzt die Anzeigen von oben statt einer festen Farbe pro Status.',
            previewTitle: 'Vorschau', effectsTitle: 'Effekte', entryEffectLabel: 'Eingangseffekt',
            sendAnimationLabel: 'Animation beim Senden (kombinierbar)', animateColumnLabel: 'Nach Spalte animieren', animateRowLabel: 'Nach Zeile animieren',
            speedLabel: 'Geschwindigkeit', exitEffectLabel: 'Ausgangseffekt', pauseLabel: 'Pause (Sek.)',
            accessoryConfigModalDesc: 'Die IP und Zugangsdaten des ESP32, der als BLE-Brücke dient.',
            accessoryIpLabel: 'Zubehör-IP', usernameLabel: 'Benutzername', passwordLabel: 'Passwort',
            jobDoneOnlyAlert: 'Nur benachrichtigen, wenn ein Auftrag beendet ist oder fehlschlägt', saveBtn: 'Speichern',
            machineAlertsEyebrow: 'MASCHINENWARNUNGEN', visualAlertsTitle: 'Visuelle Warnungen',
            machineAlertsCheckboxLabel: 'Diese Maschine sendet ihre Statusänderungen an die LED-Matrix.',
            announcementPerState: 'Anzeige für jeden Status',
            confirmClearAll: 'Du wirst die gesamte aktuelle Zeichnung löschen. Diese Aktion kann nicht rückgängig gemacht werden.', clearAllConfirmTitle: 'Alles löschen',
            testing: 'Wird getestet…', matrixLedNavLabel: 'LED-Matrix',
            dayInitials: 'M,D,M,D,F,S,S',
            // Panel LED del taller (FK-8Wa) y fichas de pestañas -- ver las secciones fk y tab más abajo.
            fkAnnChoose: 'Anzeige auswählen…',
            fkAnnLabel: 'Oder eine gespeicherte Anzeige zeigen',
            fkAnnMissing: 'Wähle zuerst eine Anzeige aus',
            fkAnnShow: 'Anzeigen',
            fkAppearsAtOnce: 'Erscheint sofort',
            fkBorderCcw: 'Gegen den Uhrzeigersinn',
            fkBorderCw: 'Im Uhrzeigersinn',
            fkBorderDlineCcw: 'Zwei Linien gegen den Uhrzeigersinn',
            fkBorderDlineCw: 'Zwei Linien im Uhrzeigersinn',
            fkBorderFixed: 'Fest',
            fkBorderFlash: 'Blinken',
            fkBorderFlashCcw: 'Blinken gegen den Uhrzeigersinn',
            fkBorderFlashCw: 'Blinken im Uhrzeigersinn',
            fkBorderLineCcw: 'Eine Linie gegen den Uhrzeigersinn',
            fkBorderLineCw: 'Eine Linie im Uhrzeigersinn',
            fkBorderRandom: 'Zufällig',
            fkBrightHelp: 'Wie hell die LEDs leuchten. Tagsüber hoch, nachts herunter, damit es nicht blendet.',
            fkBrightNote: 'Wird in ein paar Sekunden am Panel übernommen.',
            fkBrightTitle: 'Helligkeit',
            fkClockBarra: '; der Balken zeigt, wie viel Zeit bleibt',
            fkClockContorno: '; der Umriss zeigt, wie viel Zeit bleibt',
            fkClockMarco: '; der Rahmen bewegt sich in der Zwischenzeit',
            fkConnChecking: 'Wird geprüft…',
            fkConnDisabled: 'Aus',
            fkConnOk: 'Verbunden',
            fkConnSizeMismatch: 'Panel falsch eingestellt',
            fkConnTitle: 'Verbindung und Zeiten',
            fkConnUnreachable: 'Keine Verbindung',
            fkDirAria: 'Richtung',
            fkDirD: '↓ Nach unten',
            fkDirL: '⟲ Endlos',
            fkDirL1: '← Kommt herein und läuft weiter',
            fkDirR: '→ Von links nach rechts',
            fkDirU: '↑ Nach oben',
            fkDoneHelp: 'Wie lange die Meldung bleibt, wenn ein Druck endet, bevor wieder der Normalzustand kommt.',
            fkDoneLabel: '„Fertig“-Meldung',
            fkEffect_blind_1: 'Waagerechte Jalousie',
            fkEffect_blind_2: 'Senkrechte Jalousie',
            fkEffect_blind_3: 'Jalousie in Kästchen',
            fkEffect_cover_1: 'Von links nach rechts überdecken',
            fkEffect_cover_2: 'Von rechts nach links überdecken',
            fkEffect_cover_3: 'Von den Seiten zur Mitte überdecken',
            fkEffect_cover_4: 'Von der Mitte zu den Seiten überdecken',
            fkEffect_cover_5: 'Von oben nach unten überdecken',
            fkEffect_cover_6: 'Von unten nach oben überdecken',
            fkEffect_extend_1: 'Nach links ausdehnen',
            fkEffect_extend_2: 'Nach rechts ausdehnen',
            fkEffect_extend_3: 'Nach oben ausdehnen',
            fkEffect_extend_4: 'Nach unten ausdehnen',
            fkEffect_flash_1: 'Blinken',
            fkEffect_flash_2: 'Invertiertes Blinken',
            fkEffect_flash_3: 'Neon',
            fkEffect_movein_1: 'Von links hereinfahren',
            fkEffect_movein_2: 'Von rechts hereinfahren',
            fkEffect_movein_3: 'Von oben hereinfahren',
            fkEffect_movein_4: 'Von unten hereinfahren',
            fkEffect_movein_5: 'Von den Seiten hereinfahren',
            fkEffect_movein_6: 'Von oben und unten hereinfahren',
            fkEffect_movein_7: 'Aus der Mitte hereinfahren',
            fkEffect_scroll_d: 'Scrollen ↓',
            fkEffect_scroll_l: 'Scrollen ← (endlos)',
            fkEffect_scroll_l1: 'Scrollen ← (kommt und läuft weiter)',
            fkEffect_scroll_r: 'Scrollen →',
            fkEffect_scroll_u: 'Scrollen ↑',
            fkEffect_sector_1: 'Sektor im Uhrzeigersinn',
            fkEffect_sector_2: 'Sektor gegen den Uhrzeigersinn',
            fkEffect_sector_3: 'Sektor schließen',
            fkEffect_sector_4: 'Sektor öffnen',
            fkEffect_shadow_1: 'Schatten links',
            fkEffect_shadow_2: 'Schatten rechts',
            fkEffect_shadow_3: 'Schatten oben',
            fkEffect_shadow_4: 'Schatten unten',
            fkEnabledLabel: 'Panel von NOPAL aus eingeschaltet',
            fkFamAll: 'Alle',
            fkFamAria: 'Effektfamilien',
            fkFamBlind: 'Jalousie',
            fkFamCover: 'Überdecken',
            fkFamEnter: 'Hereinfahren',
            fkFamExtend: 'Ausdehnen',
            fkFamFlash: 'Blinken',
            fkFamScroll: 'Scrollen',
            fkFamSector: 'Sektor',
            fkFamShadow: 'Schatten',
            fkFxAll: 'Alle Bildschirme',
            fkFxHelp: 'So erscheint ein neuer Bildschirm: hereinfahrend, überdeckend, mit Jalousie, mit Blinken... Jedes Kästchen wiederholt den Effekt. Tippe auf eines, um es zu verwenden; „Auf meinem Panel testen“ sendet es kurz an das echte Panel, damit du es richtig siehst.',
            fkFxReset: 'Alle Effekte entfernen',
            fkFxTarget: 'Gewählten Effekt verwenden für:',
            fkFxTitle: 'Effektgalerie',
            fkGalleryHelp: 'Jeder Bildschirm, den das Panel zeigen kann, mit Beispieldaten.',
            fkGalleryNote: 'Beispiele mit erfundenen Daten, damit du weißt, was erscheinen kann und wann.',
            fkGalleryTitle: 'Die 15 möglichen Bildschirme ansehen',
            fkHelp: 'Hilfe',
            fkIpHelp: 'Die IP, die du dem Panel mit FKShow gegeben hast. Ändere sie nur, wenn du das Panel in ein anderes Netzwerk umsetzt.',
            fkIpLabel: 'Adresse des Panels im Netzwerk',
            fkKind3d: '3D',
            fkKindCnc: 'CNC',
            fkKindLaser: 'Laser',
            fkLegendNote: 'Hier nur ungefähr gezeichnet; das echte Panel animiert sie selbst.',
            fkLegendTested: 'Auf deinem Panel getestet',
            fkLegendUntested: 'Noch nicht getestet',
            fkLoadError: 'Das Panel konnte nicht abgefragt werden. Es wird automatisch erneut versucht.',
            fkMachAdd: 'Hinzufügen',
            fkMachAddAria: 'Maschine hinzufügen',
            fkMachDown: '{name} nach unten',
            fkMachEmpty: 'Noch keine Maschinen ausgewählt.',
            fkMachHelp: 'Die Maschinen, die auf dem Panel erscheinen: 3D-Drucker, Laser oder CNC. Weil das Display klein ist, hat jede einen Kurznamen mit bis zu 4 Zeichen; ändere ihn, wenn er dir nicht gefällt. Ziehe sie, um die Reihenfolge zu ändern.',
            fkMachHint: 'Der Kurzname jeder Maschine erscheint auf der LED (bis zu 4 Buchstaben oder Ziffern).',
            fkMachMissing: '{id} (existiert nicht mehr)',
            fkMachNoMore: 'Keine weiteren verfügbar',
            fkMachRemove: '{name} entfernen',
            fkMachTitle: 'Maschinen auf dem Panel',
            fkMachUp: '{name} nach oben',
            fkMarcoAnim: 'Rahmenanimation',
            fkMarcoPattern: 'Linienform',
            fkMarcoShared: 'Diese beiden Einstellungen gelten für alle animierten Rahmen.',
            fkMarcoSpeed: 'Geschwindigkeit des Rahmens',
            fkMinHelp: 'Das Panel flackert kurz, wenn NOPAL ihm etwas Neues sendet. So wird verhindert, dass zu oft etwas gesendet wird.',
            fkMinLabel: 'Mindestpause zwischen Wechseln',
            fkMinutesAria: 'Minuten Anzeigedauer',
            fkMinutesShort: '{n} Min.',
            fkMissingMachines: 'Diese Maschinen gibt es in NOPAL nicht mehr; entferne sie aus der Liste: {ids}',
            fkMsgAria: 'Nachricht',
            fkMsgClear: 'Entfernen',
            fkMsgCleared: 'Nachricht entfernt',
            fkMsgFail: 'Das hat nicht geklappt: {detail}',
            fkMsgHelp: 'Schreibe etwas und wähle, wie lange es angezeigt wird. Ist es lang, läuft es über das Display (wie, kannst du weiter unten wählen). Danach verschwindet es von selbst. Fehler und Pausen werden nicht überdeckt.',
            fkMsgMissing: 'Gib zuerst eine Nachricht ein',
            fkMsgOnPanel: 'Auf dem Panel:',
            fkMsgPlaceholder: 'Beispiel: BESPRECHUNG UM 5',
            fkMsgRemovesIn: 'verschwindet in {time}',
            fkMsgSend: 'Auf dem Panel anzeigen',
            fkMsgSent: 'Fertig, es ist auf dem Panel',
            fkMsgTitle: 'Nachricht an das Panel senden',
            fkNoEffect: 'Kein Effekt',
            fkNowBootText: 'In ein paar Sekunden zeigt es deine Maschinen an.',
            fkNowBootTitle: 'Das Panel startet.',
            fkNowCoolingText: 'Es zeigt die sinkende Temperatur und verschwindet bei 50 °C.',
            fkNowCoolingTitle: 'Eine Maschine kühlt ab.',
            fkNowDoneText: 'Die Meldung bleibt eine Weile und kehrt dann zum Normalzustand zurück{clock}.',
            fkNowDoneTitle: 'Ein Druck ist fertig.',
            fkNowErrorText: 'Das ist am wichtigsten und überdeckt deshalb alles andere.',
            fkNowErrorTitle: 'Eine Maschine hat einen Fehler.',
            fkNowHeatingText: 'Das Panel zeigt die erreichte und die fehlende Temperatur und wechselt zu „Arbeitet“, sobald der Auftrag beginnt.',
            fkNowHeatingTitle: 'Eine Maschine heizt auf.',
            fkNowHelp: 'Eine Live-Kopie dessen, was das Panel gerade anzeigt. Sie ändert sich von selbst, wenn an deinen Maschinen etwas passiert; du musst nichts tun.',
            fkNowIdleText: 'Keine Maschine arbeitet.',
            fkNowIdleTitle: 'Alle im Leerlauf.',
            fkNowManyText: 'Das Panel zeigt sie je 3 auf einmal{clock}.',
            fkNowManyTitle: 'Mehrere Maschinen arbeiten.',
            fkNowNormalText: 'Deine Maschinen sind online; das Panel zeigt, wie viele es sind, und die Uhrzeit.',
            fkNowNormalTitle: 'Alles normal.',
            fkNowOffText: 'NOPAL sendet ihm nichts.',
            fkNowOffTitle: 'Das Panel ist aus.',
            fkNowOfflineText: 'Prüfe, ob sie eingeschaltet und verbunden ist.',
            fkNowOfflineTitle: 'Eine Maschine antwortet nicht.',
            fkNowPauseText: 'Das bleibt so, bis du sie fortsetzt.',
            fkNowPauseTitle: 'Eine Maschine ist pausiert.',
            fkNowPrintingText: 'Das Panel wechselt von selbst zwischen zwei Ansichten{clock}.',
            fkNowPrintingTitle: 'Ein Druck läuft.',
            fkNowReadyText: 'Das Panel bleibt so, bis du einen Druck startest oder die Heizung ausschaltest.',
            fkNowReadyTitle: 'Eine Maschine hat ihre Temperatur erreicht.',
            fkNowScrollText: 'Sie läuft über das Display und verschwindet von selbst, wenn die Zeit um ist.',
            fkNowScrollTitle: 'Deine lange Nachricht wird angezeigt.',
            fkNowSpecialText: 'Sie verschwindet von selbst, wenn die Zeit um ist{clock}.',
            fkNowSpecialTitle: 'Deine Nachricht wird angezeigt.',
            fkNowTitle: 'So sieht dein Panel gerade aus',
            fkNowWaitingTitle: 'Warte auf Informationen vom Panel…',
            fkPanelAria: 'Kopie des LED-Panels',
            fkPatternDash: 'Striche',
            fkPatternDot: 'Punkte',
            fkPatternDot1: 'Feine Punkte',
            fkPatternSolid: 'Durchgehende Linie',
            fkPrioCooling: 'Kühlt ab',
            fkPrioCoolingTip: 'Eine Maschine mit ausgeschalteter Heizung, die noch über 50 °C hat.',
            fkPrioDone: 'Fertig',
            fkPrioDoneTip: 'Ein Druck ist gerade fertig geworden.',
            fkPrioError: 'Fehler',
            fkPrioErrorTip: 'Eine Maschine meldet einen Fehler.',
            fkPrioHeating: 'Heizt auf',
            fkPrioHeatingTip: 'Eine Maschine heizt vor dem Druck auf.',
            fkPrioNormal: 'Normal',
            fkPrioNormalTip: 'Alles online und nichts offen.',
            fkPrioNow: 'jetzt',
            fkPrioOffline: 'Getrennt',
            fkPrioOfflineTip: 'Eine Maschine auf deiner Liste antwortet nicht.',
            fkPrioPause: 'Pause',
            fkPrioPauseTip: 'Ein Druck wurde pausiert.',
            fkPrioPrinting: 'Arbeitet',
            fkPrioPrintingTip: 'Eine oder mehrere Maschinen arbeiten.',
            fkPrioReady: 'Auf Temperatur',
            fkPrioReadyTip: 'Eine Maschine hat ihre Temperatur erreicht und wartet.',
            fkPrioSpecial: 'Nachricht',
            fkPrioSpecialTip: 'Eine Nachricht von dir, solange sie läuft.',
            fkReadOnly: 'Nur ein Administrator kann die Einstellungen unten ändern. Nachrichten senden und entfernen kannst du trotzdem.',
            fkSave: 'Speichern',
            fkSaveFail: 'Speichern fehlgeschlagen: {detail}',
            fkSaved: 'Gespeichert',
            fkSaving: 'Wird gespeichert…',
            fkScreenBoot: 'Start',
            fkScreenBootDesc: 'Beim Start von NOPAL, einige Sekunden lang, bis der Status der Maschinen eintrifft.',
            fkScreenCooling: 'Kühlt ab',
            fkScreenCoolingDesc: 'Die Heizung ist aus und die Maschine hat noch über 50 °C: Es zeigt die sinkende Temperatur.',
            fkScreenDone: 'Fertig',
            fkScreenDoneDesc: 'Ein Druck ist gerade fertig geworden. Dauert 60 s und kehrt dann zum Normalzustand zurück.',
            fkScreenError: 'Fehler',
            fkScreenErrorDesc: 'Eine Maschine hat einen Fehler. Das ist am wichtigsten: Es überdeckt alles andere.',
            fkScreenHeating: 'Heizt auf',
            fkScreenHeatingDesc: 'Eine Maschine hat eine Zieltemperatur und hat sie noch nicht erreicht: Es zeigt, was sie hat und was fehlt.',
            fkScreenIdle: 'Alle im Leerlauf',
            fkScreenIdleDesc: 'Dasselbe wie „Alles normal“: Beide wechseln alle 15 s, solange nichts passiert.',
            fkScreenMany: 'Mehrere arbeiten',
            fkScreenManyDesc: 'Zwei oder mehr Maschinen arbeiten gleichzeitig. Bei mehr als 3 werden sie je 3 gezeigt.',
            fkScreenNormal: 'Alles normal',
            fkScreenNormalDesc: 'Deine Maschinen sind online und ohne Arbeit. Wechselt alle 15 s mit „Alle im Leerlauf“.',
            fkScreenOff: 'NOPAL aus',
            fkScreenOffDesc: 'Beim Ausschalten oder Neustart von NOPAL, damit das Panel keine alten Daten behält.',
            fkScreenOffline: 'Getrennt',
            fkScreenOfflineDesc: 'Eine Maschine auf deiner Liste antwortet nicht (aus oder ohne Netz).',
            fkScreenPause: 'Pause',
            fkScreenPauseDesc: 'Ein Druck wurde pausiert. Das bleibt so, bis du ihn fortsetzt.',
            fkScreenPrint1: 'Arbeitet (Ansicht 1)',
            fkScreenPrint1Desc: 'Eine Maschine arbeitet: Name, Datei und Fortschrittsbalken. Wechselt alle 15 s mit Ansicht 2.',
            fkScreenPrint2: 'Arbeitet (Ansicht 2)',
            fkScreenPrint2Desc: 'Dieselbe Maschine: Prozent und bisherige Zeit (Laser oder CNC zeigen statt der Zeit ihren Typ).',
            fkScreenReady: 'Auf Temperatur',
            fkScreenReadyDesc: 'Eine Maschine hat ihre Temperatur erreicht und wartet. Bleibt, bis ein Druck startet oder die Heizung ausgeschaltet wird.',
            fkScreenScroll: 'Lange Nachricht',
            fkScreenSpecial: 'Nachricht',
            fkScreenSpecialDesc: 'Deine Nachricht (oder ein Hinweis einer Regel oder der KI), solange ihre Zeit läuft.',
            fkScrollAria: 'Laufschrift',
            fkScrollHelp: 'Lange Nachrichten passen nicht still hin: Sie laufen über das Display. Wähle Richtung und Tempo. Schreibe deinen Text, um es auszuprobieren.',
            fkScrollNote: 'Kurze Nachrichten bleiben stehen, mit dem Effekt der Situation „Kurze Nachricht“.',
            fkScrollSample: 'FILAMENT AN DER ENDER FAST LEER, SPULE WECHSELN',
            fkScrollSpeedAria: 'Textgeschwindigkeit',
            fkScrollTextLabel: 'Testtext',
            fkScrollTitle: 'Laufschrift in Nachrichten',
            fkSecondsShort: '{n} s',
            fkSecondsUnit: 'Sekunden',
            fkSending: 'Wird gesendet…',
            fkShortAria: 'Name von {name} auf dem Panel',
            fkSitAria: 'Effekt für {name}',
            fkSitBlocked: 'Mit diesem Umriss wechselt der Bildschirm ohne Eingangseffekt.',
            fkSitCooling: 'Kühlt ab',
            fkSitDone: 'Fertig',
            fkSitError: 'Fehler',
            fkSitFxLabel: 'Wie sie erscheint',
            fkSitHeating: 'Heizt auf',
            fkSitHelp: 'Jede Situation des Panels hat ihre eigene Karte. Wähle ihren Umriss (den Rand des Panels) und wie sie erscheint. Die Zeichnung jeder Karte bewegt sich so, wie es das Panel tun wird.',
            fkSitIntro: 'Wenn du aufheizt und keinen Druck startest, bleibt das Panel auf „Auf Temperatur“, bis der Druck beginnt oder du die Heizung ausschaltest; danach zeigt es „Kühlt ab“, bis es unter 50 °C fällt.',
            fkSitMarcoAria: 'Rahmenanimation für {name}',
            fkSitNew: 'NEU',
            fkSitOffline: 'Getrennt',
            fkSitPause: 'Pause',
            fkSitPrinting: 'Arbeitet',
            fkSitReady: 'Auf Temperatur',
            fkSitRest: 'Alles ruhig',
            fkSitSpecial: 'Kurze Nachricht',
            fkSitStyleAria: 'Umriss für {name}',
            fkSitStyleLabel: 'Umriss',
            fkSitTempDrain: 'Der Umriss leert sich mit der Temperatur; das Panel flackert beim Aktualisieren kurz (alle 15 s).',
            fkSitTempFill: 'Der Umriss füllt sich mit der Temperatur; das Panel flackert beim Aktualisieren kurz (alle 15 s).',
            fkSitTitle: 'So sieht jede Situation aus',
            fkSitWhenCooling: 'Die Heizung ist aus und es hat noch über 50 °C.',
            fkSitWhenDone: 'Ein Druck ist fertig (dauert 60 s).',
            fkSitWhenError: 'Eine Maschine meldet einen Fehler.',
            fkSitWhenHeating: 'Eine Maschine heizt auf und druckt noch nicht.',
            fkSitWhenOffline: 'Eine Maschine auf deiner Liste antwortet nicht.',
            fkSitWhenPause: 'Ein Druck ist pausiert.',
            fkSitWhenPrinting: 'Eine oder mehrere Maschinen arbeiten.',
            fkSitWhenReady: 'Hat die Temperatur erreicht und wartet. Bleibt, bis ein Druck startet oder die Heizung ausgeht.',
            fkSitWhenRest: 'Alles online und ohne Arbeit. Wechselt zwischen zwei Bildschirmen.',
            fkSitWhenSpecial: 'Deine Nachricht, solange sie läuft.',
            fkSizeMismatch: 'Das Panel ist falsch eingestellt: Es meldet {size} statt 96x16. Das passiert, wenn die Testtaste auf der Platine 15 Sekunden lang gedrückt wurde. Stelle es mit FKShow neu ein und drücke dann unter „Verbindung und Zeiten“ auf „Testen“.',
            fkStyleBarra: 'Balken unten',
            fkStyleBarraDesc: 'Ein kleiner Balken wandert über die untere Zeile.',
            fkStyleContorno: 'Umriss',
            fkStyleContornoDesc: 'Eine Linie leuchtet am Rand entlang; ist sie fertig, wechselt die Ansicht.',
            fkStyleEncima: 'Umriss darüber',
            fkStyleEncimaDesc: 'Genauso, aber mit Buchstaben in voller Größe.',
            fkStyleGeneral: 'Allgemein ({name})',
            fkGeneralStyleLabel: 'Allgemeiner Umriss',
            fkGeneralStyleHelp: 'Ihn nutzen die Situationen, die du auf „Allgemein“ lässt.',
            fkStyleMarco: 'Rahmen des Panels',
            fkStyleMarcoDesc: 'Dekorative Animation des Panels selbst; sie zeigt die Zeit nicht an.',
            fkStyleNinguno: 'Kein Umriss',
            fkStyleNingunoDesc: 'Der Bildschirm wechselt die Ansicht, ohne die Zeit anzuzeigen.',
            fkStyleTemp: 'Nach Temperatur',
            fkSub: 'FK-8Wa-Anzeige mit 96×16 · zeigt nur, was an deinen Maschinen passiert',
            fkTagTested: '● Auf deinem Panel getestet',
            fkTagUntested: '○ Nicht getestet',
            fkTest: 'Testen',
            fkTestFail: 'Ich finde das Panel nicht. Prüfe, ob es eingeschaltet ist und die Adresse stimmt.',
            fkTestOk: 'Gefunden: Panel mit 96×16, bereit.',
            fkTestWrongSize: 'Ich habe ein Panel mit {width}×{height} gefunden, es muss aber 96×16 sein. Prüfe die Einstellung mit FKShow.',
            fkTesting: 'Panel wird gesucht…',
            fkTabsAria: 'Bereiche des LED-Panels',
            fkTabPanel: 'Panel',
            fkTabMach: 'Maschinen und Verbindung',
            fkTabClock: 'Uhr und Text',
            fkTabFx: 'Effekte',
            fkTabScreens: 'Die 15 Bildschirme',
            fkTitle: 'LED-Panel der Werkstatt',
            fkTryBtn: 'Auf meinem Panel testen',
            fkTryFail: 'Test fehlgeschlagen: {detail}',
            fkTryOk: 'Fertig: Das Panel hat „{name}“ ein paar Sekunden gezeigt und ist zum vorherigen Stand zurückgekehrt.',
            fkTrying: '„{name}“ wird an das Panel gesendet…',
            fkUntested: ' (ungetestet)',
            fkViewFixed: 'Fest',
            fkViewHelp: 'Beim Drucken wechselt das Panel zwischen zwei Ansichten (Datei und Prozent). So lange dauert jede.',
            fkViewLabel: 'Jede Ansicht dauert',
            fkWhyHelp: 'Wenn mehrere Dinge gleichzeitig passieren, zeigt das Panel das oben links: Ein Fehler hat immer Vorrang vor einem Druck.',
            fkWhyTitle: 'Warum zeigt es das?',
            tabAnnMany: '{n} Anzeigen',
            tabAnnOne: '1 Anzeige',
            tabCardLed: 'LED-Panel',
            tabCardLedSub: 'FK-8Wa 96×16',
            tabCardMain: 'Hauptpanel',
            tabCardMainSub: 'iPixel-BLE-Anzeige',
            tabCardScenes: 'Szenen und Konfiguration',
            tabCardScenesSub: 'Anzeigen, Regeln und Warnungen',
            tabsAria: 'Bereiche der LED-Matrix',
            fkRuleCheckbox: 'Auch auf dem FK-8Wa-Panel anzeigen',
            fkRuleBadgeTitle: 'Diese Regel wird auch auf dem FK-8Wa-Panel angezeigt',
        },
        fr: {
            effectStatic: 'Statique', effectBlink: 'Clignotement',
            exitNone: 'Aucun', exitFade: 'Fondu', exitOff: 'Éteindre',
            priorityHigh: 'Haute', priorityMedium: 'Moyenne', priorityLow: 'Basse',
            tplAlert: 'Alerte', tplError: 'Erreur', tplAttention: 'Attention', tplEmergency: 'Urgence',
            tplReady: 'Prêt', tplWelcome: 'Bienvenue', tplMaintenance: 'Maintenance',
            tplNightMode: 'Mode nuit', tplLowMaterial: 'Matériau faible',
            stateIdle: 'En attente', stateHeating: 'Chauffe', stateCooling: 'Refroidit', statePrinting: 'Impression',
            statePaused: 'En pause', stateComplete: 'Terminée', stateError: 'Erreur', stateOffline: 'Déconnectée',
            noSavedColorsYet: 'Pas encore de couleurs enregistrées',
            noAnnouncementsYet: 'Pas encore d\'annonces enregistrées.',
            secondsSuffix: 'sec', scheduledBadge: 'Programmé', activeStateBadge: 'Actif',
            editTitle: 'Modifier', duplicateTitle: 'Dupliquer', deleteTitle: 'Supprimer',
            confirmDeleteAnnouncement: 'Vous allez supprimer l\'annonce "{name}". Cette action est irréversible.',
            deleteAnnouncementTitle: 'Supprimer l\'annonce',
            sendToScreenTitle: 'Envoyer "{name}" à l\'écran',
            errorSending: 'Erreur lors de l\'envoi',
            allUnassigned: 'Toutes / non assigné', noGroup: 'Aucun groupe', allMachines: 'Toutes',
            missingAnnouncementName: 'Le nom de l\'annonce est manquant',
            saving: 'Enregistrement…', announcementSaved: 'Annonce enregistrée', errorSaving: 'Erreur lors de l\'enregistrement',
            savedGeneric: 'Enregistré', copySuffix: '(copie)',
            sendingToScreen: 'Envoi à l\'écran… (peut prendre quelques secondes)',
            sentWindows: 'Envoyé ({count} {word})', windowSingular: 'fenêtre', windowPlural: 'fenêtres',
            notConfigured: 'Non configuré', statusConnected: 'Connectée', diagConnected: 'Connecté',
            configuredNoBle: 'Configuré, sans connexion BLE', noBle: 'Sans connexion BLE',
            never: 'Jamais', noErrorsLogged: 'Aucune erreur enregistrée', estimatedTemp: '{value}°C (estimé)',
            justNow: 'à l\'instant', secondsAgo: 'il y a {n} s', minutesAgo: 'il y a {n} min', hoursAgo: 'il y a {n} h', daysAgo: 'il y a {n} j',
            currentScene: 'Scène actuelle : {name}', custom: 'Personnalisé', currentSceneNoSends: 'Scène actuelle : Aucun envoi pour le moment',
            operational: 'Opérationnelle', readyToUse: 'Prêtes à l\'emploi', createFirstAnnouncement: 'Créez votre première annonce',
            rulesAndMachines: '{rules} règles · {machines} machines',
            noAnnouncementsCreateHint: 'Vous n\'avez pas encore d\'annonces enregistrées -- créez-les dans "Scènes et Configuration".',
            activeBadge: 'Active', readyBadge: 'Prête',
            suggestionIdleTitle: 'Inactivité > 5 min', suggestionIdleDetail: 'Afficher "Mode nuit"{suffix}',
            detectedNowSuffix: ' -- détecté maintenant',
            suggestionMaterialTitle: 'Matériau faible détecté', suggestionMaterialDetail: 'Afficher "Matériau faible"{suffix}',
            suggestionJobDoneTitle: 'Travail terminé', suggestionJobDoneDetail: 'Avertir OK/ERR quand une machine termine ou échoue',
            suggestionSmokeTitle: 'Fumée détectée', suggestionSmokeDetail: 'Aucun capteur de fumée installé pour le moment',
            clickToDeactivate: 'Cliquer pour désactiver', clickToActivate: 'Cliquer pour activer', activateBtn: 'Activer',
            notAvailableBadge: 'Non disponible', genericError: 'Erreur',
            noMachinesDetected: 'Aucune machine détectée pour le moment.',
            activeAlertsBadge: 'Actives', inactiveAlertsBadge: 'Inactives', configureBtn: 'Configurer',
            unassignedOption: 'Non assigné',
            dashboardTitle: 'Panneau principal · Matrice LED',
            dashboardSub: 'Contrôlez votre matrice LED, vos scènes, alertes et automatisations d\'atelier en temps réel.',
            editorTitle: 'Scènes et Configuration',
            editorSub: 'Créez des annonces, configurez les alertes machine et l\'accessoire ESP32.',
            checking: 'Vérification…', accessoryConfigTitle: 'Configuration de l\'accessoire',
            tabMainPanel: 'Panneau principal',
            kpiMatricesConnected: 'Matrices connectées', kpiActiveScenes: 'Scènes actives', kpiAutomations: 'Automatisations',
            kpiGlobalBrightness: 'Luminosité globale', noFirmwareSensor: 'Aucun capteur dans le firmware',
            liveView: 'Vue en direct', selectMatrix: 'Sélectionner la matrice', mainMatrixLabel: 'Matrice principale · 16×32',
            currentSceneDash: 'Scène actuelle : —', brightnessLabel: 'Luminosité :', fpsLabel: 'FPS :', panelTempLabel: 'Temp. panneau :',
            registeredResolutions: 'Résolutions enregistrées', rgbResolution: '16 × 32 RGB', defaultBadge: 'Par défaut',
            workshopStatus: 'État de l\'atelier', criticalSensors: 'Capteurs critiques', ventilation: 'Ventilation',
            stablePower: 'Alimentation stable', ambientTemp: 'Température ambiante',
            quickScenes: 'Scènes rapides', previousTitle: 'Précédentes', previousAria: 'Scènes précédentes',
            nextTitle: 'Suivantes', nextAria: 'Scènes suivantes',
            suggestedAutomations: 'Automatisations suggérées', operationalSummary: 'Résumé opérationnel',
            uptimeLabel: 'Temps de fonctionnement', messagesToday: 'Messages affichés aujourd\'hui', successfulUpdates: 'Mises à jour réussies',
            errorsLabel: 'Erreurs', diagnosticsTitle: 'Diagnostic', testConnectionBtn: 'Tester la connexion',
            bleConnection: 'Connexion BLE', modelLabel: 'Modèle', firmwareLabel: 'Firmware', freeMemory: 'Mémoire libre',
            matrixType: 'Type de matrice', lastSentLabel: 'Dernier envoi', lastErrorLabel: 'Dernière erreur',
            goodPractices: 'Bonnes pratiques', tipShortMessages: 'Utilisez des messages courts et clairs.',
            tipAvoidBlinking: 'Évitez les clignotements excessifs.', tipPrioritizeColors: 'Priorisez les couleurs selon l\'urgence.',
            colorPriorities: 'Priorités par couleur', greenPriority: 'Vert -- état normal / OK',
            amberPriority: 'Ambre -- avertissement / attention', redPriority: 'Rouge -- alerte / danger', bluePriority: 'Bleu -- information / processus',
            colorsTitle: 'Couleurs', quickPalette: 'Palette rapide', colorPicker: 'Sélecteur de couleur',
            savedColors: 'Couleurs enregistrées', saveColorTitle: 'Enregistrer la couleur actuelle',
            announcementNameLabel: 'Nom de l\'annonce', announcementNamePlaceholder: 'Alerte Température Élevée',
            assignMachineLabel: 'Assigner à une machine', priorityLabel: 'Priorité',
            editor1632: 'Éditeur 16x32', pixels1632: '16 x 32 pixels',
            pencilTitle: 'Crayon', eraserTitle: 'Gomme', lineTitle: 'Ligne', rectTitle: 'Rectangle', ellipseTitle: 'Ellipse',
            bucketTitle: 'Pot de peinture', eyedropperTitle: 'Pipette', importImageTitle: 'Importer une image', textTitle: 'Texte', clearAllTitle: 'Tout effacer',
            textPlaceholder: 'TEXTE', rowLabel: 'Ligne', rowTitle: 'Ligne de départ', columnLabel: 'Colonne', columnTitle: 'Colonne de départ',
            placeBtn: 'Placer', livePreviewBtn: 'Aperçu en direct', templatesTitle: 'Cadres / Modèles',
            schedulingTitle: 'Programmation', playbackModeLabel: 'Mode de lecture', manualOption: 'Manuel', scheduledOption: 'Programmé',
            startDateLabel: 'Date de début', endDateLabel: 'Date de fin (optionnel)', repeatLabel: 'Répéter',
            durationTitle: 'Durée de l\'annonce', screenTimeLabel: 'Temps à l\'écran (sec)', transitionLabel: 'Transition (sec)',
            assignmentTitle: 'Assignation', groupLabel: 'Groupe (optionnel)', tagsLabel: 'Étiquettes', addTagPlaceholder: 'Ajouter une étiquette',
            saveAnnouncementBtn: 'Enregistrer l\'annonce', cancelBtn: 'Annuler',
            savedAnnouncementsTitle: 'Annonces enregistrées', searchAnnouncementsPlaceholder: 'Rechercher des annonces…',
            colName: 'Nom', colMachine: 'Machine', colResolution: 'Résolution', colDuration: 'Durée',
            colPriority: 'Priorité', colStatus: 'Statut', colActions: 'Actions',
            machineAlertsTitle: 'Alertes par machine',
            machineAlertsHint: 'Pour chaque machine, choisissez quelle annonce afficher lorsqu\'elle change d\'état -- réutilise les annonces ci-dessus au lieu d\'une couleur fixe par état.',
            previewTitle: 'Aperçu', effectsTitle: 'Effets', entryEffectLabel: 'Effet d\'entrée',
            sendAnimationLabel: 'Animation à l\'envoi (combinables)', animateColumnLabel: 'Animer par colonne', animateRowLabel: 'Animer par ligne',
            speedLabel: 'Vitesse', exitEffectLabel: 'Effet de sortie', pauseLabel: 'Pause (sec)',
            accessoryConfigModalDesc: 'L\'IP et les identifiants de l\'ESP32 qui fait office de pont BLE.',
            accessoryIpLabel: 'IP de l\'accessoire', usernameLabel: 'Utilisateur', passwordLabel: 'Mot de passe',
            jobDoneOnlyAlert: 'Avertir uniquement quand un travail se termine ou échoue', saveBtn: 'Enregistrer',
            machineAlertsEyebrow: 'ALERTES PAR MACHINE', visualAlertsTitle: 'Alertes visuelles',
            machineAlertsCheckboxLabel: 'Cette machine enverra ses changements d\'état à la Matrice LED.',
            announcementPerState: 'Annonce pour chaque état',
            confirmClearAll: 'Vous allez effacer tout le dessin actuel. Cette action est irréversible.', clearAllConfirmTitle: 'Tout effacer',
            testing: 'Test en cours…', matrixLedNavLabel: 'Matrice LED',
            dayInitials: 'L,M,M,J,V,S,D',
            // Panel LED del taller (FK-8Wa) y fichas de pestañas -- ver las secciones fk y tab más abajo.
            fkAnnChoose: 'Choisissez une annonce…',
            fkAnnLabel: 'Ou afficher une annonce enregistrée',
            fkAnnMissing: 'Choisissez d\'abord une annonce',
            fkAnnShow: 'Afficher',
            fkAppearsAtOnce: 'Apparaît d\'un coup',
            fkBorderCcw: 'Sens antihoraire',
            fkBorderCw: 'Sens horaire',
            fkBorderDlineCcw: 'Deux lignes antihoraires',
            fkBorderDlineCw: 'Deux lignes horaires',
            fkBorderFixed: 'Fixe',
            fkBorderFlash: 'Clignotement',
            fkBorderFlashCcw: 'Clignotement antihoraire',
            fkBorderFlashCw: 'Clignotement horaire',
            fkBorderLineCcw: 'Une ligne antihoraire',
            fkBorderLineCw: 'Une ligne horaire',
            fkBorderRandom: 'Aléatoire',
            fkBrightHelp: 'L\'intensité des LED. Montez-la le jour ; baissez-la la nuit pour ne pas éblouir.',
            fkBrightNote: 'Appliqué sur le panneau en quelques secondes.',
            fkBrightTitle: 'Luminosité',
            fkClockBarra: ' ; la barre montre le temps restant',
            fkClockContorno: ' ; le contour montre le temps restant',
            fkClockMarco: ' ; le cadre bouge pendant ce temps',
            fkConnChecking: 'Vérification…',
            fkConnDisabled: 'Éteint',
            fkConnOk: 'Connecté',
            fkConnSizeMismatch: 'Panneau mal configuré',
            fkConnTitle: 'Connexion et durées',
            fkConnUnreachable: 'Sans connexion',
            fkDirAria: 'Direction',
            fkDirD: '↓ Vers le bas',
            fkDirL: '⟲ Continu',
            fkDirL1: '← Entre et avance',
            fkDirR: '→ De gauche à droite',
            fkDirU: '↑ Vers le haut',
            fkDoneHelp: 'Combien de temps l\'avis reste quand une impression se termine, avant de revenir à la normale.',
            fkDoneLabel: 'Avis « terminé »',
            fkEffect_blind_1: 'Store horizontal',
            fkEffect_blind_2: 'Store vertical',
            fkEffect_blind_3: 'Store en carreaux',
            fkEffect_cover_1: 'Couvrir de gauche à droite',
            fkEffect_cover_2: 'Couvrir de droite à gauche',
            fkEffect_cover_3: 'Couvrir des côtés vers le centre',
            fkEffect_cover_4: 'Couvrir du centre vers les côtés',
            fkEffect_cover_5: 'Couvrir de haut en bas',
            fkEffect_cover_6: 'Couvrir de bas en haut',
            fkEffect_extend_1: 'Étendre vers la gauche',
            fkEffect_extend_2: 'Étendre vers la droite',
            fkEffect_extend_3: 'Étendre vers le haut',
            fkEffect_extend_4: 'Étendre vers le bas',
            fkEffect_flash_1: 'Clignotement',
            fkEffect_flash_2: 'Clignotement inversé',
            fkEffect_flash_3: 'Néon',
            fkEffect_movein_1: 'Entrer par la gauche',
            fkEffect_movein_2: 'Entrer par la droite',
            fkEffect_movein_3: 'Entrer par le haut',
            fkEffect_movein_4: 'Entrer par le bas',
            fkEffect_movein_5: 'Entrer par les côtés',
            fkEffect_movein_6: 'Entrer par le haut et le bas',
            fkEffect_movein_7: 'Entrer par le centre',
            fkEffect_scroll_d: 'Défiler ↓',
            fkEffect_scroll_l: 'Défiler ← (continu)',
            fkEffect_scroll_l1: 'Défiler ← (entre et avance)',
            fkEffect_scroll_r: 'Défiler →',
            fkEffect_scroll_u: 'Défiler ↑',
            fkEffect_sector_1: 'Secteur horaire',
            fkEffect_sector_2: 'Secteur antihoraire',
            fkEffect_sector_3: 'Secteur fermer',
            fkEffect_sector_4: 'Secteur ouvrir',
            fkEffect_shadow_1: 'Ombre à gauche',
            fkEffect_shadow_2: 'Ombre à droite',
            fkEffect_shadow_3: 'Ombre en haut',
            fkEffect_shadow_4: 'Ombre en bas',
            fkEnabledLabel: 'Panneau allumé depuis NOPAL',
            fkFamAll: 'Tous',
            fkFamAria: 'Familles d\'effets',
            fkFamBlind: 'Store',
            fkFamCover: 'Couvrir',
            fkFamEnter: 'Entrer',
            fkFamExtend: 'Étendre',
            fkFamFlash: 'Clignotement',
            fkFamScroll: 'Défiler',
            fkFamSector: 'Secteur',
            fkFamShadow: 'Ombre',
            fkFxAll: 'Tous les écrans',
            fkFxHelp: 'Voici comment apparaît un nouvel écran : en entrant, en couvrant, en store, en clignotant... Chaque case répète l\'effet. Touchez-en une pour l\'utiliser ; « Essayer sur mon panneau » l\'envoie un instant au vrai panneau pour le voir en vrai.',
            fkFxReset: 'Retirer tous les effets',
            fkFxTarget: 'Utiliser l\'effet choisi pour :',
            fkFxTitle: 'Galerie d\'effets',
            fkGalleryHelp: 'Chaque écran que le panneau peut afficher, avec des données d\'exemple.',
            fkGalleryNote: 'Exemples avec des données inventées, pour savoir ce qui peut apparaître et quand.',
            fkGalleryTitle: 'Voir les 15 écrans possibles',
            fkHelp: 'Aide',
            fkIpHelp: 'L\'IP que vous avez donnée au panneau avec FKShow. Ne la changez que si vous déplacez le panneau vers un autre réseau.',
            fkIpLabel: 'Adresse du panneau sur le réseau',
            fkKind3d: '3D',
            fkKindCnc: 'CNC',
            fkKindLaser: 'Laser',
            fkLegendNote: 'Ici ils sont dessinés approximativement ; le vrai panneau les anime lui-même.',
            fkLegendTested: 'Testé sur votre panneau',
            fkLegendUntested: 'Pas encore testé',
            fkLoadError: 'Impossible de consulter le panneau. Une nouvelle tentative aura lieu automatiquement.',
            fkMachAdd: 'Ajouter',
            fkMachAddAria: 'Ajouter une machine',
            fkMachDown: 'Descendre {name}',
            fkMachEmpty: 'Aucune machine choisie pour le moment.',
            fkMachHelp: 'Les machines qui apparaissent sur le panneau : imprimantes 3D, laser ou CNC. L\'écran étant petit, chacune utilise un nom court de 4 lettres maximum ; changez-le s\'il ne vous plaît pas. Faites-les glisser pour les ordonner.',
            fkMachHint: 'Le nom court de chaque machine est celui qui s\'affiche sur la LED (4 lettres ou chiffres au maximum).',
            fkMachMissing: '{id} (n\'existe plus)',
            fkMachNoMore: 'Plus rien à ajouter',
            fkMachRemove: 'Retirer {name}',
            fkMachTitle: 'Machines sur le panneau',
            fkMachUp: 'Monter {name}',
            fkMarcoAnim: 'Animation du cadre',
            fkMarcoPattern: 'Forme du trait',
            fkMarcoShared: 'Ces deux réglages valent pour tous les cadres animés.',
            fkMarcoSpeed: 'Vitesse du cadre',
            fkMinHelp: 'Le panneau clignote un instant chaque fois que NOPAL lui envoie quelque chose de nouveau. Cela évite de lui envoyer des choses trop souvent.',
            fkMinLabel: 'Pause minimale entre les changements',
            fkMinutesAria: 'Minutes d\'affichage',
            fkMinutesShort: '{n} min',
            fkMissingMachines: 'Ces machines n\'existent plus dans NOPAL ; retirez-les de la liste : {ids}',
            fkMsgAria: 'Message',
            fkMsgClear: 'Retirer',
            fkMsgCleared: 'Message retiré',
            fkMsgFail: 'Cela n\'a pas fonctionné : {detail}',
            fkMsgHelp: 'Écrivez quelque chose et choisissez combien de temps il s\'affiche. S\'il est long, il défile sur l\'écran (vous pouvez choisir comment, plus bas). Ensuite il disparaît tout seul. Il ne masque ni les erreurs ni les pauses.',
            fkMsgMissing: 'Saisissez d\'abord un message',
            fkMsgOnPanel: 'Sur le panneau :',
            fkMsgPlaceholder: 'Exemple : RÉUNION À 17 H',
            fkMsgRemovesIn: 'disparaît dans {time}',
            fkMsgSend: 'Afficher sur le panneau',
            fkMsgSent: 'C\'est fait, c\'est sur le panneau',
            fkMsgTitle: 'Envoyer un message au panneau',
            fkNoEffect: 'Sans effet',
            fkNowBootText: 'Dans quelques secondes, il affichera vos machines.',
            fkNowBootTitle: 'Le panneau démarre.',
            fkNowCoolingText: 'Il affiche la température qui baisse et disparaît à 50 °C.',
            fkNowCoolingTitle: 'Une machine refroidit.',
            fkNowDoneText: 'L\'avis reste un moment puis revient à la normale{clock}.',
            fkNowDoneTitle: 'Une impression est terminée.',
            fkNowErrorText: 'C\'est le plus important, donc cela masque tout le reste.',
            fkNowErrorTitle: 'Une machine a une erreur.',
            fkNowHeatingText: 'Le panneau affiche la température atteinte et celle qui manque, puis passe à « Au travail » quand le travail commence.',
            fkNowHeatingTitle: 'Une machine chauffe.',
            fkNowHelp: 'Une copie en direct de ce qu\'affiche le panneau. Elle change toute seule quand il se passe quelque chose sur vos machines ; vous n\'avez rien à faire.',
            fkNowIdleText: 'Aucune machine n\'est en train de travailler.',
            fkNowIdleTitle: 'Toutes au repos.',
            fkNowManyText: 'Le panneau les affiche 3 par 3{clock}.',
            fkNowManyTitle: 'Plusieurs machines travaillent.',
            fkNowNormalText: 'Vos machines sont en ligne ; le panneau affiche leur nombre et l\'heure.',
            fkNowNormalTitle: 'Tout est normal.',
            fkNowOffText: 'NOPAL ne lui envoie rien.',
            fkNowOffTitle: 'Le panneau est éteint.',
            fkNowOfflineText: 'Vérifiez qu\'elle est allumée et connectée.',
            fkNowOfflineTitle: 'Une machine ne répond pas.',
            fkNowPauseText: 'Cela reste ainsi jusqu\'à ce que vous la repreniez.',
            fkNowPauseTitle: 'Une machine est en pause.',
            fkNowPrintingText: 'Le panneau alterne tout seul deux vues{clock}.',
            fkNowPrintingTitle: 'Une impression est en cours.',
            fkNowReadyText: 'Le panneau reste ainsi jusqu\'à ce que vous lanciez une impression ou éteigniez le chauffage.',
            fkNowReadyTitle: 'Une machine est à température.',
            fkNowScrollText: 'Il défile sur l\'écran et disparaît tout seul à la fin du temps.',
            fkNowScrollTitle: 'Votre long message est affiché.',
            fkNowSpecialText: 'Il disparaît tout seul à la fin du temps{clock}.',
            fkNowSpecialTitle: 'Votre message est affiché.',
            fkNowTitle: 'Voici votre panneau en ce moment',
            fkNowWaitingTitle: 'En attente des informations du panneau…',
            fkPanelAria: 'Copie du panneau LED',
            fkPatternDash: 'Tirets',
            fkPatternDot: 'Points',
            fkPatternDot1: 'Points fins',
            fkPatternSolid: 'Trait continu',
            fkPrioCooling: 'Refroidit',
            fkPrioCoolingTip: 'Une machine au chauffage éteint qui dépasse encore 50 °C.',
            fkPrioDone: 'Terminée',
            fkPrioDoneTip: 'Une impression vient de se terminer.',
            fkPrioError: 'Erreur',
            fkPrioErrorTip: 'Une machine signale une erreur.',
            fkPrioHeating: 'Chauffe',
            fkPrioHeatingTip: 'Une machine chauffe avant d\'imprimer.',
            fkPrioNormal: 'Normal',
            fkPrioNormalTip: 'Tout est en ligne et rien en attente.',
            fkPrioNow: 'maintenant',
            fkPrioOffline: 'Déconnectée',
            fkPrioOfflineTip: 'Une machine de votre liste ne répond pas.',
            fkPrioPause: 'Pause',
            fkPrioPauseTip: 'Une impression a été mise en pause.',
            fkPrioPrinting: 'Au travail',
            fkPrioPrintingTip: 'Une ou plusieurs machines en train de travailler.',
            fkPrioReady: 'À température',
            fkPrioReadyTip: 'Une machine a atteint sa température et attend.',
            fkPrioSpecial: 'Message',
            fkPrioSpecialTip: 'Un message que vous avez envoyé, tant qu\'il dure.',
            fkReadOnly: 'Seul un administrateur peut modifier les réglages ci-dessous. Vous pouvez quand même envoyer et retirer des messages.',
            fkSave: 'Enregistrer',
            fkSaveFail: 'Impossible d\'enregistrer : {detail}',
            fkSaved: 'Enregistré',
            fkSaving: 'Enregistrement…',
            fkScreenBoot: 'Démarrage',
            fkScreenBootDesc: 'Au démarrage de NOPAL, quelques secondes, le temps que l\'état des machines arrive.',
            fkScreenCooling: 'Refroidit',
            fkScreenCoolingDesc: 'Le chauffage est éteint et la machine dépasse encore 50 °C : le panneau affiche la température qui baisse.',
            fkScreenDone: 'Terminée',
            fkScreenDoneDesc: 'Une impression vient de se terminer. Dure 60 s puis revient à la normale.',
            fkScreenError: 'Erreur',
            fkScreenErrorDesc: 'Une machine a une erreur. C\'est le plus important : cela masque tout le reste.',
            fkScreenHeating: 'Chauffe',
            fkScreenHeatingDesc: 'Une machine a une température cible et ne l\'a pas encore atteinte : le panneau montre ce qu\'elle a et ce qu\'il manque.',
            fkScreenIdle: 'Toutes au repos',
            fkScreenIdleDesc: 'Comme « Tout est normal » : les deux alternent toutes les 15 s tant qu\'il ne se passe rien.',
            fkScreenMany: 'Plusieurs au travail',
            fkScreenManyDesc: 'Deux machines ou plus travaillent en même temps. Au-delà de 3, elles sont affichées 3 par 3.',
            fkScreenNormal: 'Tout est normal',
            fkScreenNormalDesc: 'Vos machines sont en ligne et sans travail. Alterne avec « Toutes au repos » toutes les 15 s.',
            fkScreenOff: 'NOPAL éteint',
            fkScreenOffDesc: 'À l\'arrêt ou au redémarrage de NOPAL, pour que le panneau ne garde pas de données périmées.',
            fkScreenOffline: 'Déconnectée',
            fkScreenOfflineDesc: 'Une machine de votre liste ne répond pas (éteinte ou sans réseau).',
            fkScreenPause: 'Pause',
            fkScreenPauseDesc: 'Une impression a été mise en pause. Elle reste ainsi jusqu\'à ce que vous la repreniez.',
            fkScreenPrint1: 'Au travail (vue 1)',
            fkScreenPrint1Desc: 'Une machine au travail : nom, fichier et barre de progression. Alterne avec la vue 2 toutes les 15 s.',
            fkScreenPrint2: 'Au travail (vue 2)',
            fkScreenPrint2Desc: 'La même : pourcentage et temps écoulé (un laser ou une CNC affiche son type au lieu du temps).',
            fkScreenReady: 'À température',
            fkScreenReadyDesc: 'Une machine a atteint sa température et attend. Reste jusqu\'au lancement d\'une impression ou à l\'arrêt du chauffage.',
            fkScreenScroll: 'Message long',
            fkScreenSpecial: 'Message',
            fkScreenSpecialDesc: 'Votre message (ou un avis d\'une règle ou de l\'IA) pendant la durée prévue.',
            fkScrollAria: 'Texte défilant',
            fkScrollHelp: 'Les messages longs ne tiennent pas à l\'arrêt : ils défilent sur l\'écran. Choisissez le sens et la vitesse. Écrivez votre texte pour l\'essayer.',
            fkScrollNote: 'Les messages courts restent fixes, avec l\'effet de la situation « Message court ».',
            fkScrollSample: 'PEU DE FILAMENT SUR LA ENDER, CHANGEZ LA BOBINE',
            fkScrollSpeedAria: 'Vitesse du texte',
            fkScrollTextLabel: 'Texte d\'essai',
            fkScrollTitle: 'Texte défilant dans les messages',
            fkSecondsShort: '{n} s',
            fkSecondsUnit: 'secondes',
            fkSending: 'Envoi…',
            fkShortAria: 'Nom de {name} sur le panneau',
            fkSitAria: 'Effet pour {name}',
            fkSitBlocked: 'Avec ce contour, l\'écran change sans effet d\'entrée.',
            fkSitCooling: 'Refroidit',
            fkSitDone: 'Terminée',
            fkSitError: 'Erreur',
            fkSitFxLabel: 'Comment elle apparaît',
            fkSitHeating: 'Chauffe',
            fkSitHelp: 'Chaque situation du panneau a sa propre fiche. Choisissez son contour (le bord du panneau) et la façon dont elle apparaît. Le dessin de chaque fiche bouge comme le fera le panneau.',
            fkSitIntro: 'Si vous chauffez sans lancer d\'impression, le panneau reste sur « À température » jusqu\'au début de l\'impression ou à l\'arrêt du chauffage ; il affiche ensuite « Refroidit » jusqu\'à passer sous 50 °C.',
            fkSitMarcoAria: 'Animation du cadre pour {name}',
            fkSitNew: 'NOUVEAU',
            fkSitOffline: 'Déconnectée',
            fkSitPause: 'Pause',
            fkSitPrinting: 'Au travail',
            fkSitReady: 'À température',
            fkSitRest: 'Tout est calme',
            fkSitSpecial: 'Message court',
            fkSitStyleAria: 'Contour pour {name}',
            fkSitStyleLabel: 'Contour',
            fkSitTempDrain: 'Le contour se vide avec la température ; le panneau clignote un instant à chaque mise à jour (toutes les 15 s).',
            fkSitTempFill: 'Le contour se remplit avec la température ; le panneau clignote un instant à chaque mise à jour (toutes les 15 s).',
            fkSitTitle: 'Aspect de chaque situation',
            fkSitWhenCooling: 'Le chauffage est éteint et elle dépasse encore 50 °C.',
            fkSitWhenDone: 'Une impression est terminée (dure 60 s).',
            fkSitWhenError: 'Une machine signale une erreur.',
            fkSitWhenHeating: 'Une machine monte en température et n\'imprime pas encore.',
            fkSitWhenOffline: 'Une machine de votre liste ne répond pas.',
            fkSitWhenPause: 'Une impression en pause.',
            fkSitWhenPrinting: 'Une ou plusieurs machines au travail.',
            fkSitWhenReady: 'Elle a atteint sa température et attend. Reste jusqu\'à l\'impression ou l\'arrêt du chauffage.',
            fkSitWhenRest: 'Tout est en ligne et au repos. Alterne deux écrans.',
            fkSitWhenSpecial: 'Votre message, tant qu\'il dure.',
            fkSizeMismatch: 'Le panneau est mal configuré : il indique {size} au lieu de 96x16. Cela arrive quand le bouton de test de sa carte reste enfoncé 15 secondes. Reconfigurez-le avec FKShow, puis appuyez sur « Tester » dans « Connexion et durées ».',
            fkStyleBarra: 'Barre en bas',
            fkStyleBarraDesc: 'Une petite barre avance sur la rangée du bas.',
            fkStyleContorno: 'Contour',
            fkStyleContornoDesc: 'Une ligne allume le bord ; une fois complète, la vue change.',
            fkStyleEncima: 'Contour par-dessus',
            fkStyleEncimaDesc: 'Pareil, mais avec les lettres en pleine taille.',
            fkStyleGeneral: 'Général ({name})',
            fkGeneralStyleLabel: 'Contour général',
            fkGeneralStyleHelp: 'Utilisé par les situations que tu laisses sur « Général ».',
            fkStyleMarco: 'Cadre du panneau',
            fkStyleMarcoDesc: 'Animation décorative du panneau lui-même ; elle n\'indique pas le temps.',
            fkStyleNinguno: 'Sans contour',
            fkStyleNingunoDesc: 'L\'écran change de vue sans indiquer le temps.',
            fkStyleTemp: 'Selon la température',
            fkSub: 'Écran FK-8Wa de 96×16 · affiche seulement ce qui se passe sur vos machines',
            fkTagTested: '● Testé sur votre panneau',
            fkTagUntested: '○ Non testé',
            fkTest: 'Tester',
            fkTestFail: 'Je ne trouve pas le panneau. Vérifiez qu\'il est allumé et que l\'adresse est correcte.',
            fkTestOk: 'Trouvé : panneau de 96×16, prêt.',
            fkTestWrongSize: 'J\'ai trouvé un panneau de {width}×{height}, mais il doit être de 96×16. Vérifiez sa configuration avec FKShow.',
            fkTesting: 'Recherche du panneau…',
            fkTabsAria: 'Sections du panneau LED',
            fkTabPanel: 'Panneau',
            fkTabMach: 'Machines et connexion',
            fkTabClock: 'Horloge et texte',
            fkTabFx: 'Effets',
            fkTabScreens: 'Les 15 écrans',
            fkTitle: 'Panneau LED de l\'atelier',
            fkTryBtn: 'Essayer sur mon panneau',
            fkTryFail: 'Impossible d\'essayer : {detail}',
            fkTryOk: 'Terminé : le panneau a affiché « {name} » quelques secondes puis est revenu à l\'état précédent.',
            fkTrying: 'Envoi de « {name} » au panneau…',
            fkUntested: ' (non testé)',
            fkViewFixed: 'Fixe',
            fkViewHelp: 'Pendant l\'impression, le panneau alterne deux vues (fichier et pourcentage). Voici la durée de chacune.',
            fkViewLabel: 'Chaque vue dure',
            fkWhyHelp: 'Si plusieurs choses se produisent en même temps, le panneau affiche celle qui est en haut à gauche : une erreur l\'emporte toujours sur une impression.',
            fkWhyTitle: 'Pourquoi affiche-t-il cela ?',
            tabAnnMany: '{n} annonces',
            tabAnnOne: '1 annonce',
            tabCardLed: 'Panneau LED',
            tabCardLedSub: 'FK-8Wa 96×16',
            tabCardMain: 'Panneau principal',
            tabCardMainSub: 'Écran BLE iPixel',
            tabCardScenes: 'Scènes et configuration',
            tabCardScenesSub: 'Annonces, règles et alertes',
            tabsAria: 'Sections de la matrice LED',
            fkRuleCheckbox: 'Afficher aussi sur le panneau FK-8Wa',
            fkRuleBadgeTitle: 'Cette règle s\'affiche aussi sur le panneau FK-8Wa',
        },
        'pt-BR': {
            effectStatic: 'Estático', effectBlink: 'Piscar',
            exitNone: 'Nenhum', exitFade: 'Desvanecer', exitOff: 'Desligar',
            priorityHigh: 'Alta', priorityMedium: 'Média', priorityLow: 'Baixa',
            tplAlert: 'Alerta', tplError: 'Erro', tplAttention: 'Atenção', tplEmergency: 'Emergência',
            tplReady: 'Pronto', tplWelcome: 'Bem-vindo', tplMaintenance: 'Manutenção',
            tplNightMode: 'Modo noturno', tplLowMaterial: 'Material baixo',
            stateIdle: 'Em espera', stateHeating: 'Aquecendo', stateCooling: 'Esfriando', statePrinting: 'Imprimindo',
            statePaused: 'Pausada', stateComplete: 'Concluída', stateError: 'Erro', stateOffline: 'Desconectada',
            noSavedColorsYet: 'Ainda sem cores salvas',
            noAnnouncementsYet: 'Ainda sem anúncios salvos.',
            secondsSuffix: 'seg', scheduledBadge: 'Programado', activeStateBadge: 'Ativo',
            editTitle: 'Editar', duplicateTitle: 'Duplicar', deleteTitle: 'Excluir',
            confirmDeleteAnnouncement: 'Você vai excluir o anúncio "{name}". Esta ação não pode ser desfeita.',
            deleteAnnouncementTitle: 'Excluir anúncio',
            sendToScreenTitle: 'Enviar "{name}" para a tela',
            errorSending: 'Erro ao enviar',
            allUnassigned: 'Todas / não atribuído', noGroup: 'Sem grupo', allMachines: 'Todas',
            missingAnnouncementName: 'Falta o nome do anúncio',
            saving: 'Salvando…', announcementSaved: 'Anúncio salvo', errorSaving: 'Erro ao salvar',
            savedGeneric: 'Salvo', copySuffix: '(cópia)',
            sendingToScreen: 'Enviando para a tela… (pode levar alguns segundos)',
            sentWindows: 'Enviado ({count} {word})', windowSingular: 'janela', windowPlural: 'janelas',
            notConfigured: 'Não configurado', statusConnected: 'Conectada', diagConnected: 'Conectado',
            configuredNoBle: 'Configurada, sem conexão BLE', noBle: 'Sem conexão BLE',
            never: 'Nunca', noErrorsLogged: 'Nenhum erro registrado', estimatedTemp: '{value}°C (estimado)',
            justNow: 'agora mesmo', secondsAgo: 'há {n} s', minutesAgo: 'há {n} min', hoursAgo: 'há {n} h', daysAgo: 'há {n} d',
            currentScene: 'Cena atual: {name}', custom: 'Personalizado', currentSceneNoSends: 'Cena atual: Ainda sem envios',
            operational: 'Operacional', readyToUse: 'Prontas para usar', createFirstAnnouncement: 'Crie seu primeiro anúncio',
            rulesAndMachines: '{rules} regras · {machines} máquinas',
            noAnnouncementsCreateHint: 'Você ainda não tem anúncios salvos -- crie-os em "Cenas e Configuração".',
            activeBadge: 'Ativa', readyBadge: 'Pronta',
            suggestionIdleTitle: 'Inatividade > 5 min', suggestionIdleDetail: 'Mostrar "Modo noturno"{suffix}',
            detectedNowSuffix: ' -- detectado agora',
            suggestionMaterialTitle: 'Material baixo detectado', suggestionMaterialDetail: 'Mostrar "Material baixo"{suffix}',
            suggestionJobDoneTitle: 'Trabalho concluído', suggestionJobDoneDetail: 'Avisar OK/ERR quando uma máquina terminar ou falhar',
            suggestionSmokeTitle: 'Fumaça detectada', suggestionSmokeDetail: 'Ainda não há sensor de fumaça instalado',
            clickToDeactivate: 'Clique para desativar', clickToActivate: 'Clique para ativar', activateBtn: 'Ativar',
            notAvailableBadge: 'Não disponível', genericError: 'Erro',
            noMachinesDetected: 'Ainda não há máquinas detectadas.',
            activeAlertsBadge: 'Ativas', inactiveAlertsBadge: 'Inativas', configureBtn: 'Configurar',
            unassignedOption: 'Não atribuído',
            dashboardTitle: 'Painel principal · Matriz LED',
            dashboardSub: 'Controle sua matriz LED, cenas, alertas e automações da oficina em tempo real.',
            editorTitle: 'Cenas e Configuração',
            editorSub: 'Crie anúncios, configure alertas por máquina e o acessório ESP32.',
            checking: 'Verificando…', accessoryConfigTitle: 'Configuração do acessório',
            tabMainPanel: 'Painel principal',
            kpiMatricesConnected: 'Matrizes conectadas', kpiActiveScenes: 'Cenas ativas', kpiAutomations: 'Automações',
            kpiGlobalBrightness: 'Brilho global', noFirmwareSensor: 'Sem sensor no firmware',
            liveView: 'Visualização ao vivo', selectMatrix: 'Selecionar matriz', mainMatrixLabel: 'Matriz principal · 16×32',
            currentSceneDash: 'Cena atual: —', brightnessLabel: 'Brilho:', fpsLabel: 'FPS:', panelTempLabel: 'Temp. painel:',
            registeredResolutions: 'Resoluções registradas', rgbResolution: '16 × 32 RGB', defaultBadge: 'Padrão',
            workshopStatus: 'Status da oficina', criticalSensors: 'Sensores críticos', ventilation: 'Ventilação',
            stablePower: 'Energia estável', ambientTemp: 'Temperatura ambiente',
            quickScenes: 'Cenas rápidas', previousTitle: 'Anteriores', previousAria: 'Cenas anteriores',
            nextTitle: 'Próximas', nextAria: 'Próximas cenas',
            suggestedAutomations: 'Automações sugeridas', operationalSummary: 'Resumo operacional',
            uptimeLabel: 'Tempo online', messagesToday: 'Mensagens exibidas hoje', successfulUpdates: 'Atualizações bem-sucedidas',
            errorsLabel: 'Erros', diagnosticsTitle: 'Diagnóstico', testConnectionBtn: 'Testar conexão',
            bleConnection: 'Conexão BLE', modelLabel: 'Modelo', firmwareLabel: 'Firmware', freeMemory: 'Memória livre',
            matrixType: 'Tipo de matriz', lastSentLabel: 'Último envio', lastErrorLabel: 'Último erro',
            goodPractices: 'Boas práticas', tipShortMessages: 'Use mensagens curtas e claras.',
            tipAvoidBlinking: 'Evite piscadas excessivas.', tipPrioritizeColors: 'Priorize cores por nível de urgência.',
            colorPriorities: 'Prioridades por cor', greenPriority: 'Verde -- estado normal / OK',
            amberPriority: 'Âmbar -- aviso / atenção', redPriority: 'Vermelho -- alerta / perigo', bluePriority: 'Azul -- informação / processo',
            colorsTitle: 'Cores', quickPalette: 'Paleta rápida', colorPicker: 'Seletor de cor',
            savedColors: 'Cores salvas', saveColorTitle: 'Salvar a cor atual',
            announcementNameLabel: 'Nome do anúncio', announcementNamePlaceholder: 'Alerta de Temperatura Alta',
            assignMachineLabel: 'Atribuir a máquina', priorityLabel: 'Prioridade',
            editor1632: 'Editor 16x32', pixels1632: '16 x 32 pixels',
            pencilTitle: 'Lápis', eraserTitle: 'Borracha', lineTitle: 'Linha', rectTitle: 'Retângulo', ellipseTitle: 'Elipse',
            bucketTitle: 'Balde', eyedropperTitle: 'Conta-gotas', importImageTitle: 'Importar imagem', textTitle: 'Texto', clearAllTitle: 'Limpar tudo',
            textPlaceholder: 'TEXTO', rowLabel: 'Linha', rowTitle: 'Linha inicial', columnLabel: 'Coluna', columnTitle: 'Coluna inicial',
            placeBtn: 'Colocar', livePreviewBtn: 'Pré-visualização ao vivo', templatesTitle: 'Molduras / Modelos',
            schedulingTitle: 'Programação', playbackModeLabel: 'Modo de reprodução', manualOption: 'Manual', scheduledOption: 'Programado',
            startDateLabel: 'Data de início', endDateLabel: 'Data de término (opcional)', repeatLabel: 'Repetir',
            durationTitle: 'Duração do anúncio', screenTimeLabel: 'Tempo na tela (seg)', transitionLabel: 'Transição (seg)',
            assignmentTitle: 'Atribuição', groupLabel: 'Grupo (opcional)', tagsLabel: 'Etiquetas', addTagPlaceholder: 'Adicionar etiqueta',
            saveAnnouncementBtn: 'Salvar Anúncio', cancelBtn: 'Cancelar',
            savedAnnouncementsTitle: 'Anúncios salvos', searchAnnouncementsPlaceholder: 'Buscar anúncios…',
            colName: 'Nome', colMachine: 'Máquina', colResolution: 'Resolução', colDuration: 'Duração',
            colPriority: 'Prioridade', colStatus: 'Status', colActions: 'Ações',
            machineAlertsTitle: 'Alertas por máquina',
            machineAlertsHint: 'Para cada máquina, escolha qual anúncio mostrar quando ela mudar para cada estado -- reutiliza os anúncios acima em vez de uma cor fixa por estado.',
            previewTitle: 'Pré-visualização', effectsTitle: 'Efeitos', entryEffectLabel: 'Efeito de entrada',
            sendAnimationLabel: 'Animação ao enviar (combináveis)', animateColumnLabel: 'Animar por coluna', animateRowLabel: 'Animar por linha',
            speedLabel: 'Velocidade', exitEffectLabel: 'Efeito de saída', pauseLabel: 'Pausa (seg)',
            accessoryConfigModalDesc: 'O IP e as credenciais do ESP32 que faz a ponte BLE.',
            accessoryIpLabel: 'IP do acessório', usernameLabel: 'Usuário', passwordLabel: 'Senha',
            jobDoneOnlyAlert: 'Avisar somente quando um trabalho terminar ou falhar', saveBtn: 'Salvar',
            machineAlertsEyebrow: 'ALERTAS POR MÁQUINA', visualAlertsTitle: 'Alertas visuais',
            machineAlertsCheckboxLabel: 'Esta máquina enviará suas mudanças de estado para a Matriz LED.',
            announcementPerState: 'Anúncio para cada estado',
            confirmClearAll: 'Você vai apagar todo o desenho atual. Esta ação não pode ser desfeita.', clearAllConfirmTitle: 'Limpar tudo',
            testing: 'Testando…', matrixLedNavLabel: 'Matriz LED',
            dayInitials: 'S,T,Q,Q,S,S,D',
            // Panel LED del taller (FK-8Wa) y fichas de pestañas -- ver las secciones fk y tab más abajo.
            fkAnnChoose: 'Escolha um anúncio…',
            fkAnnLabel: 'Ou mostre um anúncio salvo',
            fkAnnMissing: 'Escolha um anúncio primeiro',
            fkAnnShow: 'Mostrar',
            fkAppearsAtOnce: 'Aparece de uma vez',
            fkBorderCcw: 'Anti-horário',
            fkBorderCw: 'Horário',
            fkBorderDlineCcw: 'Duas linhas anti-horário',
            fkBorderDlineCw: 'Duas linhas horário',
            fkBorderFixed: 'Fixa',
            fkBorderFlash: 'Piscar',
            fkBorderFlashCcw: 'Piscar anti-horário',
            fkBorderFlashCw: 'Piscar horário',
            fkBorderLineCcw: 'Uma linha anti-horário',
            fkBorderLineCw: 'Uma linha horário',
            fkBorderRandom: 'Aleatória',
            fkBrightHelp: 'Quão forte os LEDs acendem. De dia aumente; à noite diminua para não ofuscar.',
            fkBrightNote: 'É aplicado no painel em alguns segundos.',
            fkBrightTitle: 'Brilho',
            fkClockBarra: '; a barra mostra quanto falta',
            fkClockContorno: '; o contorno mostra quanto falta',
            fkClockMarco: '; a moldura se mexe enquanto isso',
            fkConnChecking: 'Verificando…',
            fkConnDisabled: 'Desligado',
            fkConnOk: 'Conectado',
            fkConnSizeMismatch: 'Painel desconfigurado',
            fkConnTitle: 'Conexão e tempos',
            fkConnUnreachable: 'Sem conexão',
            fkDirAria: 'Direção',
            fkDirD: '↓ Para baixo',
            fkDirL: '⟲ Contínuo',
            fkDirL1: '← Entra e avança',
            fkDirR: '→ Da esquerda para a direita',
            fkDirU: '↑ Para cima',
            fkDoneHelp: 'Quanto tempo o aviso fica quando uma impressão termina, antes de voltar ao normal.',
            fkDoneLabel: 'Aviso de "terminou"',
            fkEffect_blind_1: 'Persiana horizontal',
            fkEffect_blind_2: 'Persiana vertical',
            fkEffect_blind_3: 'Persiana em quadros',
            fkEffect_cover_1: 'Cobrir da esquerda para a direita',
            fkEffect_cover_2: 'Cobrir da direita para a esquerda',
            fkEffect_cover_3: 'Cobrir dos lados para o centro',
            fkEffect_cover_4: 'Cobrir do centro para os lados',
            fkEffect_cover_5: 'Cobrir de cima para baixo',
            fkEffect_cover_6: 'Cobrir de baixo para cima',
            fkEffect_extend_1: 'Estender para a esquerda',
            fkEffect_extend_2: 'Estender para a direita',
            fkEffect_extend_3: 'Estender para cima',
            fkEffect_extend_4: 'Estender para baixo',
            fkEffect_flash_1: 'Piscar',
            fkEffect_flash_2: 'Piscar invertido',
            fkEffect_flash_3: 'Neon',
            fkEffect_movein_1: 'Entrar pela esquerda',
            fkEffect_movein_2: 'Entrar pela direita',
            fkEffect_movein_3: 'Entrar por cima',
            fkEffect_movein_4: 'Entrar por baixo',
            fkEffect_movein_5: 'Entrar pelos lados',
            fkEffect_movein_6: 'Entrar por cima e por baixo',
            fkEffect_movein_7: 'Entrar pelo centro',
            fkEffect_scroll_d: 'Rolar ↓',
            fkEffect_scroll_l: 'Rolar ← (contínuo)',
            fkEffect_scroll_l1: 'Rolar ← (entra e avança)',
            fkEffect_scroll_r: 'Rolar →',
            fkEffect_scroll_u: 'Rolar ↑',
            fkEffect_sector_1: 'Setor horário',
            fkEffect_sector_2: 'Setor anti-horário',
            fkEffect_sector_3: 'Setor fechar',
            fkEffect_sector_4: 'Setor abrir',
            fkEffect_shadow_1: 'Sombra à esquerda',
            fkEffect_shadow_2: 'Sombra à direita',
            fkEffect_shadow_3: 'Sombra em cima',
            fkEffect_shadow_4: 'Sombra embaixo',
            fkEnabledLabel: 'Painel ligado pelo NOPAL',
            fkFamAll: 'Todos',
            fkFamAria: 'Famílias de efeitos',
            fkFamBlind: 'Persiana',
            fkFamCover: 'Cobrir',
            fkFamEnter: 'Entrar',
            fkFamExtend: 'Estender',
            fkFamFlash: 'Piscar',
            fkFamScroll: 'Rolar',
            fkFamSector: 'Setor',
            fkFamShadow: 'Sombra',
            fkFxAll: 'Todas as telas',
            fkFxHelp: 'Assim aparece uma tela nova: entrando, cobrindo, com persiana, piscando... Cada quadro repete o efeito. Toque em um para usá-lo; "Testar no meu painel" o envia por um momento ao painel real para você ver de verdade.',
            fkFxReset: 'Remover todos os efeitos',
            fkFxTarget: 'Usar o efeito escolhido em:',
            fkFxTitle: 'Galeria de efeitos',
            fkGalleryHelp: 'Cada tela que o painel pode mostrar, com dados de exemplo.',
            fkGalleryNote: 'Exemplos com dados inventados, para saber o que pode aparecer e quando cada uma sai.',
            fkGalleryTitle: 'Ver as 15 telas possíveis',
            fkHelp: 'Ajuda',
            fkIpHelp: 'O IP que você deu ao painel com o FKShow. Só mude se levar o painel para outra rede.',
            fkIpLabel: 'Endereço do painel na rede',
            fkKind3d: '3D',
            fkKindCnc: 'CNC',
            fkKindLaser: 'Laser',
            fkLegendNote: 'Aqui são desenhados de forma aproximada; o painel real os anima sozinho.',
            fkLegendTested: 'Testado no seu painel',
            fkLegendUntested: 'Ainda sem testar',
            fkLoadError: 'Não foi possível consultar o painel. Ele tenta de novo sozinho.',
            fkMachAdd: 'Adicionar',
            fkMachAddAria: 'Adicionar máquina',
            fkMachDown: 'Descer {name}',
            fkMachEmpty: 'Nenhuma máquina escolhida ainda.',
            fkMachHelp: 'As máquinas que aparecem no painel: impressoras 3D, laser ou CNC. Como a tela é pequena, cada uma usa um nome curto de até 4 letras; mude-o se não gostar. Arraste-as para ordenar.',
            fkMachHint: 'O nome curto de cada máquina é o que aparece no LED (até 4 letras ou números).',
            fkMachMissing: '{id} (não existe mais)',
            fkMachNoMore: 'Não há mais para adicionar',
            fkMachRemove: 'Remover {name}',
            fkMachTitle: 'Máquinas no painel',
            fkMachUp: 'Subir {name}',
            fkMarcoAnim: 'Animação da moldura',
            fkMarcoPattern: 'Forma da linha',
            fkMarcoShared: 'Estes dois ajustes valem para todas as molduras animadas.',
            fkMarcoSpeed: 'Velocidade da moldura',
            fkMinHelp: 'O painel pisca por um instante cada vez que o NOPAL envia algo novo. Isso evita enviar coisas com muita frequência.',
            fkMinLabel: 'Pausa mínima entre mudanças',
            fkMinutesAria: 'Minutos de exibição',
            fkMinutesShort: '{n} min',
            fkMissingMachines: 'Estas máquinas não existem mais no NOPAL; remova-as da lista: {ids}',
            fkMsgAria: 'Mensagem',
            fkMsgClear: 'Remover',
            fkMsgCleared: 'Mensagem removida',
            fkMsgFail: 'Não deu certo: {detail}',
            fkMsgHelp: 'Escreva algo e escolha por quanto tempo aparece. Se for longo, corre pela tela (você pode escolher como, mais abaixo). Depois some sozinho. Não cobre erros nem pausas.',
            fkMsgMissing: 'Digite uma mensagem primeiro',
            fkMsgOnPanel: 'No painel:',
            fkMsgPlaceholder: 'Exemplo: REUNIÃO ÀS 5',
            fkMsgRemovesIn: 'some em {time}',
            fkMsgSend: 'Mostrar no painel',
            fkMsgSent: 'Pronto, já está no painel',
            fkMsgTitle: 'Enviar uma mensagem ao painel',
            fkNoEffect: 'Sem efeito',
            fkNowBootText: 'Em alguns segundos ele mostrará suas máquinas.',
            fkNowBootTitle: 'O painel está iniciando.',
            fkNowCoolingText: 'Mostra a temperatura baixando e some ao chegar a 50 °C.',
            fkNowCoolingTitle: 'Uma máquina está esfriando.',
            fkNowDoneText: 'O aviso fica um tempo e depois volta ao normal{clock}.',
            fkNowDoneTitle: 'Uma impressão terminou.',
            fkNowErrorText: 'É o mais importante, por isso cobre todo o resto.',
            fkNowErrorTitle: 'Uma máquina está com erro.',
            fkNowHeatingText: 'O painel mostra a temperatura atual e a que falta, e muda para "Trabalhando" quando o trabalho começar.',
            fkNowHeatingTitle: 'Uma máquina está aquecendo.',
            fkNowHelp: 'Uma cópia ao vivo do que o painel está mostrando. Muda sozinha quando algo acontece nas suas máquinas; você não precisa fazer nada.',
            fkNowIdleText: 'Nenhuma máquina está trabalhando.',
            fkNowIdleTitle: 'Todas em repouso.',
            fkNowManyText: 'O painel as mostra de 3 em 3{clock}.',
            fkNowManyTitle: 'Várias máquinas estão trabalhando.',
            fkNowNormalText: 'Suas máquinas estão online; o painel mostra quantas são e a hora.',
            fkNowNormalTitle: 'Tudo normal.',
            fkNowOffText: 'O NOPAL não está enviando nada para ele.',
            fkNowOffTitle: 'O painel está desligado.',
            fkNowOfflineText: 'Verifique se está ligada e conectada.',
            fkNowOfflineTitle: 'Uma máquina não responde.',
            fkNowPauseText: 'Fica assim até você retomá-la.',
            fkNowPauseTitle: 'Há uma máquina em pausa.',
            fkNowPrintingText: 'O painel alterna sozinho entre duas vistas{clock}.',
            fkNowPrintingTitle: 'Há uma impressão em andamento.',
            fkNowReadyText: 'O painel fica assim até você mandar imprimir ou desligar o aquecedor.',
            fkNowReadyTitle: 'Uma máquina já está na temperatura.',
            fkNowScrollText: 'Ela corre pela tela e some sozinha quando o tempo acaba.',
            fkNowScrollTitle: 'Mostrando a sua mensagem longa.',
            fkNowSpecialText: 'Ela some sozinha quando o tempo acaba{clock}.',
            fkNowSpecialTitle: 'Mostrando a sua mensagem.',
            fkNowTitle: 'Assim está o seu painel agora',
            fkNowWaitingTitle: 'Aguardando informações do painel…',
            fkPanelAria: 'Cópia do painel LED',
            fkPatternDash: 'Traços',
            fkPatternDot: 'Pontos',
            fkPatternDot1: 'Pontos finos',
            fkPatternSolid: 'Linha contínua',
            fkPrioCooling: 'Esfriando',
            fkPrioCoolingTip: 'Uma máquina com o aquecedor desligado que ainda passa de 50 °C.',
            fkPrioDone: 'Terminou',
            fkPrioDoneTip: 'Uma impressão acabou de terminar.',
            fkPrioError: 'Erro',
            fkPrioErrorTip: 'Uma máquina informa um erro.',
            fkPrioHeating: 'Aquecendo',
            fkPrioHeatingTip: 'Uma máquina aquecendo antes de imprimir.',
            fkPrioNormal: 'Normal',
            fkPrioNormalTip: 'Tudo online e sem pendências.',
            fkPrioNow: 'agora',
            fkPrioOffline: 'Desconectada',
            fkPrioOfflineTip: 'Uma máquina da sua lista não responde.',
            fkPrioPause: 'Pausa',
            fkPrioPauseTip: 'Uma impressão foi pausada.',
            fkPrioPrinting: 'Trabalhando',
            fkPrioPrintingTip: 'Uma ou várias máquinas trabalhando.',
            fkPrioReady: 'Na temperatura',
            fkPrioReadyTip: 'Uma máquina já chegou à temperatura e espera.',
            fkPrioSpecial: 'Mensagem',
            fkPrioSpecialTip: 'Uma mensagem que você enviou, enquanto durar.',
            fkReadOnly: 'Só um administrador pode alterar as configurações abaixo. Você pode enviar e remover mensagens normalmente.',
            fkSave: 'Salvar',
            fkSaveFail: 'Não foi possível salvar: {detail}',
            fkSaved: 'Salvo',
            fkSaving: 'Salvando…',
            fkScreenBoot: 'Inicialização',
            fkScreenBootDesc: 'Ao ligar o NOPAL, por alguns segundos, enquanto chega o estado das máquinas.',
            fkScreenCooling: 'Esfriando',
            fkScreenCoolingDesc: 'O aquecedor foi desligado e a máquina ainda passa de 50 °C: mostra a temperatura baixando.',
            fkScreenDone: 'Terminou',
            fkScreenDoneDesc: 'Uma impressão acabou de terminar. Dura 60 s e volta ao normal.',
            fkScreenError: 'Erro',
            fkScreenErrorDesc: 'Uma máquina está com erro. É o mais importante: cobre todo o resto.',
            fkScreenHeating: 'Aquecendo',
            fkScreenHeatingDesc: 'Uma máquina tem temperatura-alvo e ainda não a alcançou: mostra o que já tem e o que falta.',
            fkScreenIdle: 'Todas em repouso',
            fkScreenIdleDesc: 'O mesmo que "Tudo normal": alternam a cada 15 s enquanto nada acontece.',
            fkScreenMany: 'Várias trabalhando',
            fkScreenManyDesc: 'Duas ou mais máquinas trabalhando ao mesmo tempo. Se forem mais de 3, mostra de 3 em 3.',
            fkScreenNormal: 'Tudo normal',
            fkScreenNormalDesc: 'Suas máquinas estão online e sem trabalho. Alterna com "Todas em repouso" a cada 15 s.',
            fkScreenOff: 'NOPAL desligado',
            fkScreenOffDesc: 'Ao desligar ou reiniciar o NOPAL, para que o painel não fique com dados antigos.',
            fkScreenOffline: 'Desconectada',
            fkScreenOfflineDesc: 'Uma máquina da sua lista não responde (desligada ou sem rede).',
            fkScreenPause: 'Pausa',
            fkScreenPauseDesc: 'Uma impressão foi pausada. Fica assim até você retomá-la.',
            fkScreenPrint1: 'Trabalhando (vista 1)',
            fkScreenPrint1Desc: 'Uma máquina trabalhando: nome, arquivo e barra de progresso. Alterna com a vista 2 a cada 15 s.',
            fkScreenPrint2: 'Trabalhando (vista 2)',
            fkScreenPrint2Desc: 'A mesma: porcentagem e tempo decorrido (um laser ou CNC mostra seu tipo no lugar do tempo).',
            fkScreenReady: 'Na temperatura',
            fkScreenReadyDesc: 'Uma máquina já chegou à temperatura e espera. Fica até mandar imprimir ou desligar o aquecedor.',
            fkScreenScroll: 'Mensagem longa',
            fkScreenSpecial: 'Mensagem',
            fkScreenSpecialDesc: 'Sua mensagem (ou um aviso de uma regra ou da IA) enquanto durar o tempo dela.',
            fkScrollAria: 'Texto em rolagem',
            fkScrollHelp: 'Mensagens longas não cabem paradas: elas correm pela tela. Escolha para onde e com que velocidade. Escreva seu texto para testar.',
            fkScrollNote: 'Mensagens curtas ficam paradas, com o efeito da situação "Mensagem curta".',
            fkScrollSample: 'POUCO MATERIAL NA ENDER, TROQUE O CARRETEL',
            fkScrollSpeedAria: 'Velocidade do texto',
            fkScrollTextLabel: 'Texto de teste',
            fkScrollTitle: 'Texto em rolagem nas mensagens',
            fkSecondsShort: '{n} s',
            fkSecondsUnit: 'segundos',
            fkSending: 'Enviando…',
            fkShortAria: 'Nome de {name} no painel',
            fkSitAria: 'Efeito para {name}',
            fkSitBlocked: 'Com este contorno a tela muda sem efeito de entrada.',
            fkSitCooling: 'Esfriando',
            fkSitDone: 'Terminou',
            fkSitError: 'Erro',
            fkSitFxLabel: 'Como aparece',
            fkSitHeating: 'Aquecendo',
            fkSitHelp: 'Cada situação do painel tem a sua própria ficha. Escolha o contorno (a borda do painel) e como ela aparece. O desenho de cada ficha se move como o painel vai fazer.',
            fkSitIntro: 'Se você aquecer e não mandar imprimir, o painel fica em "Na temperatura" até a impressão começar ou você desligar o aquecedor; depois mostra "Esfriando" até baixar de 50 °C.',
            fkSitMarcoAria: 'Animação da moldura de {name}',
            fkSitNew: 'NOVA',
            fkSitOffline: 'Desconectada',
            fkSitPause: 'Pausa',
            fkSitPrinting: 'Trabalhando',
            fkSitReady: 'Na temperatura',
            fkSitRest: 'Tudo tranquilo',
            fkSitSpecial: 'Mensagem curta',
            fkSitStyleAria: 'Contorno de {name}',
            fkSitStyleLabel: 'Contorno',
            fkSitTempDrain: 'O contorno se esvazia com a temperatura; o painel pisca um instante ao atualizar (a cada 15 s).',
            fkSitTempFill: 'O contorno se enche com a temperatura; o painel pisca um instante ao atualizar (a cada 15 s).',
            fkSitTitle: 'Como fica cada situação',
            fkSitWhenCooling: 'O aquecedor foi desligado e ainda passa de 50 °C.',
            fkSitWhenDone: 'Terminou uma impressão (dura 60 s).',
            fkSitWhenError: 'Uma máquina reporta um erro.',
            fkSitWhenHeating: 'Uma máquina está subindo de temperatura e ainda não imprime.',
            fkSitWhenOffline: 'Uma máquina da sua lista não responde.',
            fkSitWhenPause: 'Uma impressão em pausa.',
            fkSitWhenPrinting: 'Uma ou várias máquinas trabalhando.',
            fkSitWhenReady: 'Já chegou à temperatura e espera. Fica até imprimir ou desligar o aquecedor.',
            fkSitWhenRest: 'Tudo online e sem trabalho. Alterna duas telas.',
            fkSitWhenSpecial: 'Sua mensagem, enquanto durar.',
            fkSizeMismatch: 'O painel está mal configurado: ele informa {size} em vez de 96x16. Isso acontece quando o botão de teste da placa fica pressionado por 15 segundos. Configure-o de novo com o FKShow e depois clique em "Testar" em "Conexão e tempos".',
            fkStyleBarra: 'Barra embaixo',
            fkStyleBarraDesc: 'Uma barrinha avança pela linha de baixo.',
            fkStyleContorno: 'Contorno',
            fkStyleContornoDesc: 'Uma linha acende a borda; ao completar, a vista muda.',
            fkStyleEncima: 'Contorno por cima',
            fkStyleEncimaDesc: 'Igual, mas com as letras em tamanho total.',
            fkStyleGeneral: 'Geral ({name})',
            fkGeneralStyleLabel: 'Contorno geral',
            fkGeneralStyleHelp: 'Usado pelas situações que você deixar em "Geral".',
            fkStyleMarco: 'Moldura do painel',
            fkStyleMarcoDesc: 'Animação decorativa do próprio painel; não mostra o tempo.',
            fkStyleNinguno: 'Sem contorno',
            fkStyleNingunoDesc: 'A tela muda de vista sem marcar o tempo.',
            fkStyleTemp: 'Conforme a temperatura',
            fkSub: 'Tela FK-8Wa de 96×16 · mostra só o que acontece nas suas máquinas',
            fkTagTested: '● Testado no seu painel',
            fkTagUntested: '○ Sem testar',
            fkTest: 'Testar',
            fkTestFail: 'Não encontro o painel. Verifique se está ligado e se o endereço está correto.',
            fkTestOk: 'Encontrado: painel de 96×16, pronto.',
            fkTestWrongSize: 'Encontrei um painel de {width}×{height}, mas deve ser de 96×16. Confira a configuração dele com o FKShow.',
            fkTesting: 'Procurando o painel…',
            fkTabsAria: 'Seções do painel LED',
            fkTabPanel: 'Painel',
            fkTabMach: 'Máquinas e conexão',
            fkTabClock: 'Relógio e texto',
            fkTabFx: 'Efeitos',
            fkTabScreens: 'As 15 telas',
            fkTitle: 'Painel LED da oficina',
            fkTryBtn: 'Testar no meu painel',
            fkTryFail: 'Não foi possível testar: {detail}',
            fkTryOk: 'Pronto: o painel mostrou "{name}" por alguns segundos e voltou ao que estava.',
            fkTrying: 'Enviando "{name}" ao painel…',
            fkUntested: ' (sem testar)',
            fkViewFixed: 'Fixa',
            fkViewHelp: 'Ao imprimir, o painel alterna duas vistas (arquivo e porcentagem). Isto é quanto dura cada uma.',
            fkViewLabel: 'Cada vista dura',
            fkWhyHelp: 'Se várias coisas acontecem ao mesmo tempo, o painel mostra a que está no alto à esquerda: um erro sempre vence uma impressão.',
            fkWhyTitle: 'Por que está mostrando isso?',
            tabAnnMany: '{n} anúncios',
            tabAnnOne: '1 anúncio',
            tabCardLed: 'Painel LED',
            tabCardLedSub: 'FK-8Wa 96×16',
            tabCardMain: 'Painel principal',
            tabCardMainSub: 'Tela BLE iPixel',
            tabCardScenes: 'Cenas e configuração',
            tabCardScenesSub: 'Anúncios, regras e alertas',
            tabsAria: 'Seções da matriz LED',
            fkRuleCheckbox: 'Mostrar também no painel FK-8Wa',
            fkRuleBadgeTitle: 'Esta regra também é mostrada no painel FK-8Wa',
        },
    };

    function lang() {
        const raw = document.documentElement.lang || localStorage.getItem('language') || 'es';
        if (raw.toLowerCase().startsWith('pt')) return 'pt-BR';
        const short = raw.slice(0, 2).toLowerCase();
        return ['es', 'en', 'de', 'fr'].includes(short) ? short : 'en';
    }

    function tr(key, vars) {
        let text = I18N[lang()]?.[key] || I18N.en[key] || key;
        if (vars) Object.entries(vars).forEach(([name, value]) => { text = text.replace(`{${name}}`, value); });
        return text;
    }

    const MACHINE_STATE_TR_KEYS = {
        idle: 'stateIdle', heating: 'stateHeating', cooling: 'stateCooling', printing: 'statePrinting',
        paused: 'statePaused', complete: 'stateComplete', error: 'stateError', offline: 'stateOffline',
    };
    function machineStateLabel(key) { return tr(MACHINE_STATE_TR_KEYS[key] || key); }

    const API_BASE = '/api/plugins/matriz-led';
    const MACHINES_POLL_MS = 8000;
    const DONE_STATES = new Set(['complete', 'completed']);
    const ERROR_STATES = new Set(['error']);

    // "Calentando"/"Enfriando" no son estados reales que reporten los
    // drivers (Marlin solo manda idle/printing/paused/offline -- ver
    // marlin_printer_service.get_status(); Klipper/Bambu tampoco los usan)
    // -- por eso las Alertas por máquina para esos dos estados nunca
    // disparaban. El core de NOPAL resuelve esto mismo para la tira LED de
    // arduino-accessories mirando temperatura real vs. target
    // (machineLedCardState/computeHeatProgress en app.js); acá se replica
    // con los mismos datos (machine.status.hotend/bed) que ya trae
    // tunascreen_service.list_machines().
    const COOL_TEMP_THRESHOLD_C = 40;
    const coolingTracked = new Set();

    // El "state" crudo NO es un vocabulario único entre marcas -- Klipper
    // pasa tal cual el print_stats.state de Moonraker ("standby", no
    // "idle"; "cancelled" en vez de "error" o "complete"), Bambu/Elegoo/
    // FlashForge normalizan por su cuenta a un vocabulario parcial propio
    // (ver _JOB_STATE_MAP en bambu_service.py: p.ej. "FINISH" -> "idle",
    // nunca "complete"). Sin este mapeo, "En espera"/"Finalizada"/etc.
    // nunca calzaban contra el vocabulario de MACHINE_STATES de este
    // plugin para máquinas que no fueran Marlin.
    const RAW_STATE_ALIASES = {
        standby: 'idle',
        ready: 'idle',
        cancelled: 'idle',
        unknown: 'idle',
        preparing: 'printing',
    };

    function deriveMachineVisualState(machine) {
        const raw = RAW_STATE_ALIASES[machine?.status?.state] || machine?.status?.state;
        if (!machine?.online || raw === 'offline') { coolingTracked.delete(machine.id); return 'offline'; }
        const hotend = machine?.status?.hotend;
        const bed = machine?.status?.bed;
        const bedTarget = typeof bed?.target === 'number' ? bed.target : 0;
        const extruderTarget = typeof hotend?.target === 'number' ? hotend.target : 0;
        const bedTemp = typeof bed?.current === 'number' ? bed.current : null;
        const extruderTemp = typeof hotend?.current === 'number' ? hotend.current : null;
        const isWarm = (bedTemp != null && bedTemp > COOL_TEMP_THRESHOLD_C) || (extruderTemp != null && extruderTemp > COOL_TEMP_THRESHOLD_C);

        if (raw === 'printing' || raw === 'paused') { coolingTracked.add(machine.id); return raw; }
        if (raw === 'idle') {
            // Un calentador con target > 0 sigue "trabajando" aunque el
            // driver diga idle (precalentando fuera de un trabajo activo).
            if (bedTarget > 0 || extruderTarget > 0) { coolingTracked.delete(machine.id); return 'heating'; }
            if (coolingTracked.has(machine.id)) {
                if (isWarm) return 'cooling';
                coolingTracked.delete(machine.id);
            }
            return 'idle';
        }
        coolingTracked.delete(machine.id);
        return raw || 'idle';
    }

    const MATRIX_ROWS = 16;
    const MATRIX_COLS = 32;

    // "Desplazar izquierda"/"Desvanecer" del mockup original no tienen
    // hoy un valor de pypixelcolor validado en hardware real -- mandar el
    // código equivocado puede hasta hacer bootloop al dispositivo (ver el
    // docstring de pypixelcolor.commands.send_text). Por ahora solo se
    // ofrecen los dos animation ints que sí se probaron en pantalla física.
    const ENTRY_EFFECTS = [
        { value: 'estatico', label: tr('effectStatic'), animation: 0 },
        { value: 'parpadeo', label: tr('effectBlink'), animation: 1 },
    ];
    // Persistido como metadata -- pypixelcolor no expone un parámetro de
    // "efecto de salida" independiente todavía (ver README.md, Pendiente).
    const EXIT_EFFECTS = [
        { value: 'ninguno', label: tr('exitNone') },
        { value: 'desvanecer', label: tr('exitFade') },
        { value: 'apagar', label: tr('exitOff') },
    ];

    const PRIORITIES = [
        { value: 'alta', label: tr('priorityHigh') },
        { value: 'media', label: tr('priorityMedium') },
        { value: 'baja', label: tr('priorityLow') },
    ];

    function dayLabels() { return tr('dayInitials').split(','); }

    const QUICK_PALETTE = ['ff0000', 'ff8c00', 'ffd400', '22c55e', '14b8a6', '3b82f6', '8b5cf6', 'ec4899'];
    const SAVED_COLORS_KEY = 'nopal.matriz-led.savedColors';

    // Plantillas del sistema: no se pueden borrar, siembran el editor con
    // un patrón + texto ya "quemado" a píxeles. Absorbe lo que antes eran
    // los presets de demo (temperatura/idle) y las alertas rápidas
    // (Listo/Error/Atención/Emergencia) de v0.2-0.3 en un solo concepto.
    // El "name" (etiqueta del botón) sí se traduce; "text" (lo que de
    // verdad se quema a píxeles en la pantalla física) NO -- FONT_5X7 solo
    // define glifos A-Z/0-9, y el firmware muestra ese texto tal cual sin
    // importar el idioma de la UI (una realidad de hardware, no una
    // elección de idioma).
    const SYSTEM_TEMPLATES = [
        { id: 'tpl-alerta', name: tr('tplAlert'), color: 'ff0000', text: ['ALERTA'], icon: '▲' },
        { id: 'tpl-error', name: tr('tplError'), color: 'ef4444', text: ['ERROR'], icon: '✕' },
        { id: 'tpl-atencion', name: tr('tplAttention'), color: 'f59e0b', text: ['ATN'], icon: '!' },
        { id: 'tpl-emergencia', name: tr('tplEmergency'), color: 'ff0000', text: ['EMERG'], icon: '⚠' },
        { id: 'tpl-listo', name: tr('tplReady'), color: '22c55e', text: ['LISTO'], icon: '✓' },
        { id: 'tpl-bienvenida', name: tr('tplWelcome'), color: '22c55e', text: ['HOLA'], icon: '✦' },
        { id: 'tpl-mantenimiento', name: tr('tplMaintenance'), color: '3b82f6', text: ['MANT'], icon: '⚙' },
        { id: 'tpl-nocturno', name: tr('tplNightMode'), color: '8b5cf6', text: ['ZZZ'], icon: '☾' },
        { id: 'tpl-material-bajo', name: tr('tplLowMaterial'), color: 'f59e0b', text: ['MATERIAL'], icon: '◔' },
    ];

    // ── Fuente de píxeles 5x7 para la herramienta de texto (T) ──
    // Cada carácter: 5 columnas, cada número son los bits de esa columna
    // (bit 0 = fila de arriba). No hay forma de reusar la fuente que
    // pypixelcolor usa server-side para /text -- esa solo se resuelve del
    // lado del backend (ver screen_service.send_text) y no sirve para
    // "quemar" texto editable a mano en el lienzo. Cubre A-Z, 0-9 y
    // signos básicos; cualquier otro carácter se normaliza (sin acentos,
    // mayúsculas) o se salta.
    const FONT_5X7 = {
        A: [0x7e, 0x11, 0x11, 0x7e], B: [0x7f, 0x49, 0x49, 0x36], C: [0x3e, 0x41, 0x41, 0x22],
        D: [0x7f, 0x41, 0x41, 0x3e], E: [0x7f, 0x49, 0x49, 0x41], F: [0x7f, 0x09, 0x09, 0x01],
        G: [0x3e, 0x41, 0x49, 0x7a], H: [0x7f, 0x08, 0x08, 0x7f], I: [0x41, 0x7f, 0x41],
        J: [0x30, 0x40, 0x41, 0x3f], K: [0x7f, 0x08, 0x14, 0x63], L: [0x7f, 0x40, 0x40, 0x40],
        M: [0x7f, 0x02, 0x0c, 0x02, 0x7f], N: [0x7f, 0x04, 0x08, 0x10, 0x7f], O: [0x3e, 0x41, 0x41, 0x3e],
        P: [0x7f, 0x09, 0x09, 0x06], Q: [0x3e, 0x41, 0x21, 0x5e], R: [0x7f, 0x09, 0x19, 0x66],
        S: [0x26, 0x49, 0x49, 0x32], T: [0x01, 0x01, 0x7f, 0x01, 0x01], U: [0x3f, 0x40, 0x40, 0x3f],
        V: [0x1f, 0x20, 0x40, 0x20, 0x1f], W: [0x3f, 0x40, 0x38, 0x40, 0x3f], X: [0x63, 0x14, 0x08, 0x14, 0x63],
        Y: [0x07, 0x08, 0x70, 0x08, 0x07], Z: [0x61, 0x51, 0x49, 0x45, 0x43],
        0: [0x3e, 0x51, 0x49, 0x45, 0x3e], 1: [0x44, 0x42, 0x7f, 0x40, 0x40], 2: [0x62, 0x51, 0x49, 0x49, 0x46],
        3: [0x22, 0x41, 0x49, 0x49, 0x36], 4: [0x18, 0x14, 0x12, 0x7f, 0x10], 5: [0x2f, 0x49, 0x49, 0x49, 0x31],
        6: [0x3c, 0x4a, 0x49, 0x49, 0x30], 7: [0x01, 0x71, 0x09, 0x05, 0x03], 8: [0x36, 0x49, 0x49, 0x49, 0x36],
        9: [0x06, 0x49, 0x49, 0x29, 0x1e],
        ' ': [0x00, 0x00, 0x00], '!': [0x5f], '?': [0x02, 0x01, 0x51, 0x09, 0x06], '.': [0x40],
        ',': [0x80, 0x40], '-': [0x08, 0x08, 0x08], ':': [0x36],
    };

    const state = {
        config: { ip: '', username: '', has_password: false, auto_alerts: false },
        status: { configured: false, connected: false },
        machines: [],
        announcements: [],
        editingId: null,
        activeTool: 'pencil',
        drawColor: 'ff0000',
        pickerHsv: { h: 0, s: 1, v: 1 },
        tags: [],
        dragStart: null,
        searchQuery: '',
        sending: false,
        view: 'dashboard',
        deviceInfo: { available: false },
        lastSent: null,
        lastError: null,
        stats: { sent_ok: 0, sent_error: 0 },
        rules: [],
        machineAlerts: {},
        machineAlertsTarget: null,
        materialAlerts: [],
    };

    // Estados de máquina que ofrece el modal "Alertas por máquina" -- deben
    // coincidir con MACHINE_STATES de screen_service.py. Las etiquetas
    // ahora se resuelven con machineStateLabel() (ver el bloque I18N al
    // principio del archivo), no con un objeto fijo acá.
    const MACHINE_STATES = ['idle', 'heating', 'cooling', 'printing', 'paused', 'complete', 'error', 'offline'];

    let root = null;
    let statusTimer = null;
    let machinesTimer = null;
    let scenesResizeObserver = null;
    let alertQueue = Promise.resolve();
    const lastMachineStates = new Map();
    // machine_id -> timestamp (ms) desde que esa máquina quedó "idle" sin
    // interrupción -- para la sugerencia "Inactividad > 5 min" (ver
    // pollMachines). Se borra en cuanto el estado deja de ser idle.
    const idleSince = new Map();

    function esc(value) {
        return String(value ?? '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[char]));
    }

    async function api(path, options = {}) {
        const response = await fetch(`${API_BASE}${path}`, {
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            ...options,
        });
        const text = await response.text();
        let data;
        try { data = text ? JSON.parse(text) : {}; } catch { data = { detail: text }; }
        if (!response.ok) {
            throw new Error(data?.detail ? JSON.stringify(data.detail) : `HTTP ${response.status}`);
        }
        return data;
    }

    // ── Matriz de dibujo (color por celda, "" = apagado) ──
    function emptyMatrix() {
        return Array.from({ length: MATRIX_ROWS }, () => Array.from({ length: MATRIX_COLS }, () => ''));
    }

    function cloneMatrix(matrix) {
        return matrix.map((row) => row.slice());
    }

    function stampText(matrix, lines, color, startRow, startCol = 0) {
        lines.forEach((line, lineIndex) => {
            const chars = line.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split('');
            let col = startCol;
            const row0 = startRow + lineIndex * 8;
            for (const char of chars) {
                const glyph = FONT_5X7[char];
                if (!glyph) { col += 2; continue; }
                for (let glyphCol = 0; glyphCol < glyph.length; glyphCol += 1) {
                    if (col >= MATRIX_COLS) break;
                    const columnBits = glyph[glyphCol];
                    for (let bit = 0; bit < 7; bit += 1) {
                        const row = row0 + bit;
                        if (row < 0 || row >= MATRIX_ROWS) continue;
                        if (columnBits & (1 << bit)) matrix[row][col] = color;
                    }
                    col += 1;
                }
                col += 1; // espacio entre caracteres
                if (col >= MATRIX_COLS) break;
            }
        });
        return matrix;
    }

    function templateMatrix(template) {
        const matrix = emptyMatrix();
        const startRow = template.text.length > 1 ? 1 : 4;
        stampText(matrix, template.text, template.color, startRow);
        return matrix;
    }

    // ── Draft (anuncio en edición) ──
    function newDraft() {
        return {
            id: null,
            name: '',
            machine_id: '',
            group: '',
            priority: 'media',
            matrix: emptyMatrix(),
            entry_effect: 'estatico',
            exit_effect: 'ninguno',
            animate_col: false,
            animate_row: false,
            speed: 80,
            pause_seconds: 2,
            duration_seconds: 5,
            transition_seconds: 1,
            mode: 'manual',
            start_at: '',
            end_at: '',
            repeat_days: [],
            tags: [],
        };
    }

    let draft = newDraft();

    function loadDraft(announcement) {
        draft = {
            id: announcement.id,
            name: announcement.name,
            machine_id: announcement.machine_id || '',
            group: announcement.group || '',
            priority: announcement.priority,
            matrix: cloneMatrix(announcement.matrix),
            entry_effect: announcement.entry_effect,
            exit_effect: announcement.exit_effect,
            animate_col: !!announcement.animate_col,
            animate_row: !!announcement.animate_row,
            speed: announcement.speed,
            pause_seconds: announcement.pause_seconds,
            duration_seconds: announcement.duration_seconds,
            transition_seconds: announcement.transition_seconds,
            mode: announcement.mode,
            start_at: announcement.start_at || '',
            end_at: announcement.end_at || '',
            repeat_days: announcement.repeat_days.slice(),
            tags: announcement.tags.slice(),
        };
        state.editingId = announcement.id;
        fillDraftForm();
        renderEditor();
    }

    // ── Toolbar / dibujo ──
    function cellsForLine(row0, col0, row1, col1) {
        const cells = [];
        let x0 = col0, y0 = row0, x1 = col1, y1 = row1;
        const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
        let err = dx + dy;
        for (let guard = 0; guard < 1000; guard += 1) {
            cells.push([y0, x0]);
            if (x0 === x1 && y0 === y1) break;
            const e2 = 2 * err;
            if (e2 >= dy) { err += dy; x0 += sx; }
            if (e2 <= dx) { err += dx; y0 += sy; }
        }
        return cells;
    }

    function cellsForRect(row0, col0, row1, col1) {
        const top = Math.min(row0, row1), bottom = Math.max(row0, row1);
        const left = Math.min(col0, col1), right = Math.max(col0, col1);
        const cells = [];
        for (let col = left; col <= right; col += 1) { cells.push([top, col]); cells.push([bottom, col]); }
        for (let row = top; row <= bottom; row += 1) { cells.push([row, left]); cells.push([row, right]); }
        return cells;
    }

    function cellsForEllipse(row0, col0, row1, col1) {
        const centerRow = (row0 + row1) / 2, centerCol = (col0 + col1) / 2;
        const radiusRow = Math.max(1, Math.abs(row1 - row0) / 2), radiusCol = Math.max(1, Math.abs(col1 - col0) / 2);
        const top = Math.max(0, Math.floor(centerRow - radiusRow)), bottom = Math.min(MATRIX_ROWS - 1, Math.ceil(centerRow + radiusRow));
        const left = Math.max(0, Math.floor(centerCol - radiusCol)), right = Math.min(MATRIX_COLS - 1, Math.ceil(centerCol + radiusCol));
        const cells = [];
        for (let row = top; row <= bottom; row += 1) {
            for (let col = left; col <= right; col += 1) {
                const normRow = (row - centerRow) / radiusRow, normCol = (col - centerCol) / radiusCol;
                const distance = normRow * normRow + normCol * normCol;
                if (distance <= 1 && distance > 0.55) cells.push([row, col]); // solo el borde -- elipse hueca
            }
        }
        return cells;
    }

    function floodFill(matrix, row, col, newColor) {
        const targetColor = matrix[row][col];
        if (targetColor === newColor) return;
        const stack = [[row, col]];
        const visited = new Set();
        while (stack.length) {
            const [r, c] = stack.pop();
            const key = `${r}:${c}`;
            if (r < 0 || r >= MATRIX_ROWS || c < 0 || c >= MATRIX_COLS || visited.has(key)) continue;
            if (matrix[r][c] !== targetColor) continue;
            visited.add(key);
            matrix[r][c] = newColor;
            stack.push([r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]);
        }
    }

    function applyToolAt(row, col) {
        const tool = state.activeTool;
        if (tool === 'pencil') draft.matrix[row][col] = state.drawColor;
        else if (tool === 'eraser') draft.matrix[row][col] = '';
        else if (tool === 'bucket') floodFill(draft.matrix, row, col, state.drawColor);
        else if (tool === 'eyedropper') {
            state.drawColor = draft.matrix[row][col] || state.drawColor;
            syncColorInputs();
        }
    }

    function paintCell(row, col, color) {
        const button = root.querySelector(`[data-cell-row="${row}"][data-cell-col="${col}"]`);
        if (button) button.style.background = color ? `#${color}` : '';
    }

    function renderEditor() {
        const grid = root.querySelector('#mled-editor-grid');
        if (!grid) return;
        const cells = [];
        for (let row = 0; row < MATRIX_ROWS; row += 1) {
            for (let col = 0; col < MATRIX_COLS; col += 1) {
                const color = draft.matrix[row][col];
                cells.push(`<button type="button" class="mled-cell" data-cell-row="${row}" data-cell-col="${col}" style="${color ? `background:#${color}` : ''}"></button>`);
            }
        }
        grid.innerHTML = cells.join('');
        renderPreview();
    }

    // Se llama UNA sola vez al montar (no en cada renderEditor): el grid
    // usa delegación de eventos sobre el contenedor #mled-editor-grid, que
    // persiste entre renders (solo su innerHTML cambia) -- volver a
    // engancharlos en cada render acumularía listeners duplicados en
    // window para siempre.
    function wireGridPointerEvents(grid) {
        let isPointerDown = false;
        grid.addEventListener('pointerdown', (event) => {
            const cellButton = event.target.closest('[data-cell-row]');
            if (!cellButton) return;
            isPointerDown = true;
            const row = Number(cellButton.dataset.cellRow), col = Number(cellButton.dataset.cellCol);
            if (['line', 'rect', 'ellipse'].includes(state.activeTool)) {
                state.dragStart = [row, col];
            } else {
                applyToolAt(row, col);
                paintCell(row, col, draft.matrix[row][col]);
                renderPreview();
            }
        });
        grid.addEventListener('pointerover', (event) => {
            if (!isPointerDown) return;
            if (!['pencil', 'eraser'].includes(state.activeTool)) return;
            const cellButton = event.target.closest('[data-cell-row]');
            if (!cellButton) return;
            const row = Number(cellButton.dataset.cellRow), col = Number(cellButton.dataset.cellCol);
            applyToolAt(row, col);
            paintCell(row, col, draft.matrix[row][col]);
        });
        window.addEventListener('pointerup', (event) => {
            if (!isPointerDown) return;
            isPointerDown = false;
            if (!state.dragStart) { renderPreview(); return; }
            const cellButton = event.target.closest?.('[data-cell-row]');
            const end = cellButton ? [Number(cellButton.dataset.cellRow), Number(cellButton.dataset.cellCol)] : state.dragStart;
            const [row0, col0] = state.dragStart;
            const [row1, col1] = end;
            let cells = [];
            if (state.activeTool === 'line') cells = cellsForLine(row0, col0, row1, col1);
            else if (state.activeTool === 'rect') cells = cellsForRect(row0, col0, row1, col1);
            else if (state.activeTool === 'ellipse') cells = cellsForEllipse(row0, col0, row1, col1);
            cells.forEach(([row, col]) => { draft.matrix[row][col] = state.drawColor; });
            state.dragStart = null;
            renderEditor();
        });
    }

    // ── Conversión de color (hex <-> rgb <-> hsv) para el selector con
    // gama completa (gamut) -- sin esto, el único selector era el popup
    // nativo del navegador (<input type="color">), justo lo que se quería
    // evitar. h en grados [0,360), s/v en [0,1].
    function hexToRgb(hex) {
        const n = parseInt(hex, 16);
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }

    function rgbToHex(r, g, b) {
        return [r, g, b].map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')).join('');
    }

    function rgbToHsv(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
        let h = 0;
        if (d !== 0) {
            if (max === r) h = ((g - b) / d) % 6;
            else if (max === g) h = (b - r) / d + 2;
            else h = (r - g) / d + 4;
            h *= 60;
            if (h < 0) h += 360;
        }
        return { h, s: max === 0 ? 0 : d / max, v: max };
    }

    function hsvToRgb(h, s, v) {
        const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
        const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
            : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
        return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
    }

    // Solo mueve los indicadores según el state.pickerHsv actual -- no
    // recalcula nada, para no perder precisión de matiz a mitad de un
    // arrastre continuo (ver bindColorGamutPointer).
    function updateColorPickerCursors() {
        const gamut = root.querySelector('#mled-color-gamut');
        const gamutCursor = root.querySelector('#mled-color-gamut-cursor');
        const hueCursor = root.querySelector('#mled-color-hue-cursor');
        const { h, s, v } = state.pickerHsv;
        if (gamut) gamut.style.setProperty('--hue', h);
        if (gamutCursor) { gamutCursor.style.left = `${s * 100}%`; gamutCursor.style.top = `${(1 - v) * 100}%`; }
        if (hueCursor) hueCursor.style.left = `${(h / 360) * 100}%`;
    }

    // Fuente de verdad = state.drawColor (hex) -- para selección de paleta,
    // gotero, plantillas, texto de hex a mano. Recalcula el matiz desde el
    // hex; en blanco/negro puro el matiz queda indefinido y se reinicia a 0,
    // aceptable acá porque no es un arrastre continuo.
    function syncColorInputs() {
        const swatch = root.querySelector('#mled-color-swatch');
        const hexInput = root.querySelector('#mled-color-hex');
        if (swatch) swatch.style.background = `#${state.drawColor}`;
        if (hexInput) hexInput.value = `#${state.drawColor}`;
        const { r, g, b } = hexToRgb(state.drawColor);
        state.pickerHsv = rgbToHsv(r, g, b);
        updateColorPickerCursors();
    }

    // Fuente de verdad = h/s/v en vivo, para el arrastre del gamut/matiz --
    // no pasa por syncColorInputs (evitaría el redondeo hex->hsv a mitad de
    // arrastre) pero mantiene swatch/hex/cursores sincronizados igual.
    function setColorFromHsv(h, s, v) {
        state.pickerHsv = { h, s, v };
        const { r, g, b } = hsvToRgb(h, s, v);
        state.drawColor = rgbToHex(r, g, b);
        const swatch = root.querySelector('#mled-color-swatch');
        const hexInput = root.querySelector('#mled-color-hex');
        if (swatch) swatch.style.background = `#${state.drawColor}`;
        if (hexInput) hexInput.value = `#${state.drawColor}`;
        updateColorPickerCursors();
    }

    function bindColorGamutPointer() {
        const gamut = root.querySelector('#mled-color-gamut');
        const hueTrack = root.querySelector('#mled-color-hue');
        if (!gamut || !hueTrack) return;

        const fromGamut = (event) => {
            const rect = gamut.getBoundingClientRect();
            const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
            const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
            setColorFromHsv(state.pickerHsv.h, x, 1 - y);
        };
        const fromHue = (event) => {
            const rect = hueTrack.getBoundingClientRect();
            const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
            setColorFromHsv(x * 360, state.pickerHsv.s, state.pickerHsv.v);
        };

        let draggingGamut = false, draggingHue = false;
        gamut.addEventListener('pointerdown', (event) => { draggingGamut = true; gamut.setPointerCapture(event.pointerId); fromGamut(event); });
        gamut.addEventListener('pointermove', (event) => { if (draggingGamut) fromGamut(event); });
        gamut.addEventListener('pointerup', () => { draggingGamut = false; });
        hueTrack.addEventListener('pointerdown', (event) => { draggingHue = true; hueTrack.setPointerCapture(event.pointerId); fromHue(event); });
        hueTrack.addEventListener('pointermove', (event) => { if (draggingHue) fromHue(event); });
        hueTrack.addEventListener('pointerup', () => { draggingHue = false; });
    }

    function readSavedColors() {
        try { return JSON.parse(localStorage.getItem(SAVED_COLORS_KEY)) || []; } catch { return []; }
    }

    function writeSavedColors(colors) {
        try { localStorage.setItem(SAVED_COLORS_KEY, JSON.stringify(colors.slice(0, 24))); } catch { /* localStorage no disponible -- no es crítico */ }
    }

    function renderSavedColors() {
        const container = root.querySelector('#mled-color-saved-list');
        if (!container) return;
        const saved = readSavedColors();
        if (!saved.length) {
            container.innerHTML = `<span class="mled-color-saved-empty">${tr('noSavedColorsYet')}</span>`;
            return;
        }
        container.innerHTML = saved.map((color) => (
            `<button type="button" class="mled-swatch" data-saved-color="${color}" style="background:#${color}" title="#${color}"></button>`
        )).join('');
        container.querySelectorAll('[data-saved-color]').forEach((button) => {
            button.addEventListener('click', () => {
                state.drawColor = button.dataset.savedColor;
                syncColorInputs();
            });
        });
    }

    function renderPalette() {
        const container = root.querySelector('#mled-palette');
        if (!container) return;
        container.innerHTML = QUICK_PALETTE.map((color) => (
            `<button type="button" class="mled-swatch" data-palette-color="${color}" style="background:#${color}" title="#${color}"></button>`
        )).join('');
        container.querySelectorAll('[data-palette-color]').forEach((button) => {
            button.addEventListener('click', () => {
                state.drawColor = button.dataset.paletteColor;
                syncColorInputs();
            });
        });
    }

    function renderPreview() {
        const preview = root.querySelector('#mled-preview-grid');
        if (!preview) return;
        preview.innerHTML = draft.matrix.flat().map((color) => (
            `<span class="mled-preview-cell" style="${color ? `background:#${color}` : ''}"></span>`
        )).join('');
    }

    async function importImageFile(file) {
        const bitmap = await createImageBitmap(file);
        const canvas = document.createElement('canvas');
        canvas.width = MATRIX_COLS;
        canvas.height = MATRIX_ROWS;
        const context = canvas.getContext('2d');
        const scale = Math.max(MATRIX_COLS / bitmap.width, MATRIX_ROWS / bitmap.height);
        const drawWidth = bitmap.width * scale, drawHeight = bitmap.height * scale;
        context.drawImage(bitmap, (MATRIX_COLS - drawWidth) / 2, (MATRIX_ROWS - drawHeight) / 2, drawWidth, drawHeight);
        const { data } = context.getImageData(0, 0, MATRIX_COLS, MATRIX_ROWS);
        const matrix = emptyMatrix();
        for (let row = 0; row < MATRIX_ROWS; row += 1) {
            for (let col = 0; col < MATRIX_COLS; col += 1) {
                const index = (row * MATRIX_COLS + col) * 4;
                const [r, g, b, a] = [data[index], data[index + 1], data[index + 2], data[index + 3]];
                if (a < 128 || (r < 24 && g < 24 && b < 24)) continue;
                matrix[row][col] = [r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('');
            }
        }
        draft.matrix = matrix;
        renderEditor();
    }

    // ── Formulario / campos del draft ──
    function fillDraftForm() {
        root.querySelector('#mled-name').value = draft.name;
        root.querySelector('#mled-priority').value = draft.priority;
        root.querySelector('#mled-machine').value = draft.machine_id;
        root.querySelector('#mled-mode').value = draft.mode;
        root.querySelector('#mled-start-at').value = draft.start_at;
        root.querySelector('#mled-end-at').value = draft.end_at;
        root.querySelector('#mled-duration').value = draft.duration_seconds;
        root.querySelector('#mled-duration-range').value = draft.duration_seconds;
        root.querySelector('#mled-transition').value = draft.transition_seconds;
        root.querySelector('#mled-transition-range').value = draft.transition_seconds;
        root.querySelector('#mled-group').value = draft.group;
        root.querySelector('#mled-entry-effect').value = draft.entry_effect;
        root.querySelector('#mled-exit-effect').value = draft.exit_effect;
        root.querySelector('#mled-animate-col').checked = draft.animate_col;
        root.querySelector('#mled-animate-row').checked = draft.animate_row;
        root.querySelector('#mled-speed').value = draft.speed;
        root.querySelector('#mled-pause').value = draft.pause_seconds;
        state.tags = draft.tags.slice();
        renderTags();
        renderRepeatDays();
        refreshGroupOptions();
        syncModeFieldsDisabled();
        renderEditor();
    }

    function readDraftForm() {
        draft.name = root.querySelector('#mled-name').value.trim();
        draft.priority = root.querySelector('#mled-priority').value;
        draft.machine_id = root.querySelector('#mled-machine').value;
        draft.mode = root.querySelector('#mled-mode').value;
        draft.start_at = root.querySelector('#mled-start-at').value;
        draft.end_at = root.querySelector('#mled-end-at').value;
        draft.duration_seconds = Number(root.querySelector('#mled-duration').value) || 5;
        draft.transition_seconds = Number(root.querySelector('#mled-transition').value) || 1;
        draft.group = root.querySelector('#mled-group').value.trim();
        draft.entry_effect = root.querySelector('#mled-entry-effect').value;
        draft.exit_effect = root.querySelector('#mled-exit-effect').value;
        draft.animate_col = root.querySelector('#mled-animate-col').checked;
        draft.animate_row = root.querySelector('#mled-animate-row').checked;
        draft.speed = Number(root.querySelector('#mled-speed').value) || 80;
        draft.pause_seconds = Number(root.querySelector('#mled-pause').value) || 2;
        draft.tags = state.tags.slice();
    }

    function syncModeFieldsDisabled() {
        const disabled = draft.mode !== 'programado';
        ['#mled-start-at', '#mled-end-at'].forEach((selector) => {
            const field = root.querySelector(selector);
            if (field) field.disabled = disabled;
        });
        root.querySelectorAll('[data-repeat-day]').forEach((button) => { button.disabled = disabled; });
    }

    function renderTags() {
        const container = root.querySelector('#mled-tags-list');
        if (!container) return;
        container.innerHTML = state.tags.map((tag, index) => (
            `<span class="mled-tag">${esc(tag)}<button type="button" data-remove-tag="${index}" aria-label="Quitar etiqueta">×</button></span>`
        )).join('');
        container.querySelectorAll('[data-remove-tag]').forEach((button) => {
            button.addEventListener('click', () => {
                state.tags.splice(Number(button.dataset.removeTag), 1);
                renderTags();
            });
        });
    }

    function renderRepeatDays() {
        const container = root.querySelector('#mled-repeat-days');
        if (!container) return;
        container.innerHTML = dayLabels().map((label, index) => (
            `<button type="button" class="mled-day-btn ${draft.repeat_days.includes(index) ? 'is-active' : ''}" data-repeat-day="${index}">${esc(label)}</button>`
        )).join('');
        container.querySelectorAll('[data-repeat-day]').forEach((button) => {
            button.addEventListener('click', () => {
                const day = Number(button.dataset.repeatDay);
                const index = draft.repeat_days.indexOf(day);
                if (index === -1) draft.repeat_days.push(day); else draft.repeat_days.splice(index, 1);
                renderRepeatDays();
                syncModeFieldsDisabled();
            });
        });
        syncModeFieldsDisabled();
    }

    function machineOptionsHtml(selected) {
        const options = state.machines.map((machine) => (
            `<option value="${esc(machine.id)}" ${machine.id === selected ? 'selected' : ''}>${esc(machine.name || machine.id)}</option>`
        )).join('');
        return `<option value="" ${!selected ? 'selected' : ''}>${tr('allUnassigned')}</option>${options}`;
    }

    function groupOptionsHtml(selected) {
        const groups = Array.from(new Set(state.announcements.map((item) => item.group).filter(Boolean)));
        const options = groups.map((group) => (
            `<option value="${esc(group)}" ${group === selected ? 'selected' : ''}>${esc(group)}</option>`
        )).join('');
        return `<option value="" ${!selected ? 'selected' : ''}>${tr('noGroup')}</option>${options}`;
    }

    // ── Plantillas ──
    function renderTemplates() {
        const container = root.querySelector('#mled-templates');
        if (!container) return;
        container.innerHTML = SYSTEM_TEMPLATES.map((template) => (
            `<button type="button" class="mled-template" data-template="${esc(template.id)}" title="${esc(template.name)}">
                <span class="mled-template-icon" style="color:#${esc(template.color)}">${esc(template.icon)}</span>
                <small>${esc(template.name)}</small>
            </button>`
        )).join('');
        container.querySelectorAll('[data-template]').forEach((button) => {
            button.addEventListener('click', () => {
                const template = SYSTEM_TEMPLATES.find((item) => item.id === button.dataset.template);
                if (!template) return;
                draft.matrix = templateMatrix(template);
                state.drawColor = template.color;
                syncColorInputs();
                if (!draft.name) { root.querySelector('#mled-name').value = template.name; draft.name = template.name; }
                renderEditor();
            });
        });
    }

    // ── Tabla de anuncios guardados ──
    function priorityBadgeHtml(priority) {
        const label = PRIORITIES.find((item) => item.value === priority)?.label || priority;
        return `<span class="mled-badge mled-badge-${esc(priority)}">${esc(label)}</span>`;
    }

    function machineName(machineId) {
        if (!machineId) return tr('allMachines');
        return state.machines.find((machine) => machine.id === machineId)?.name || machineId;
    }

    function renderAnnouncementsTable() {
        const body = root.querySelector('#mled-announcements-body');
        if (!body) return;
        const query = state.searchQuery.trim().toLowerCase();
        const rows = state.announcements.filter((item) => !query || item.name.toLowerCase().includes(query));
        if (!rows.length) {
            body.innerHTML = `<tr><td colspan="7" class="mled-empty-row">${tr('noAnnouncementsYet')}</td></tr>`;
            return;
        }
        body.innerHTML = rows.map((item) => `
            <tr>
                <td>${esc(item.name)}</td>
                <td>${esc(machineName(item.machine_id))}</td>
                <td>${MATRIX_ROWS}x${MATRIX_COLS}</td>
                <td>${esc(item.duration_seconds)} ${tr('secondsSuffix')}</td>
                <td>${priorityBadgeHtml(item.priority)}</td>
                <td><span class="mled-badge mled-badge-estado">${item.mode === 'programado' ? tr('scheduledBadge') : tr('activeStateBadge')}</span></td>
                <td class="mled-table-actions">
                    <button type="button" data-edit-announcement="${esc(item.id)}" title="${tr('editTitle')}">✎</button>
                    <button type="button" data-duplicate-announcement="${esc(item.id)}" title="${tr('duplicateTitle')}">⧉</button>
                    <button type="button" data-delete-announcement="${esc(item.id)}" title="${tr('deleteTitle')}" class="mled-btn-icon-danger">🗑</button>
                </td>
            </tr>`).join('');
        body.querySelectorAll('[data-edit-announcement]').forEach((button) => {
            button.addEventListener('click', () => {
                const item = state.announcements.find((a) => a.id === button.dataset.editAnnouncement);
                if (item) loadDraft(item);
            });
        });
        body.querySelectorAll('[data-duplicate-announcement]').forEach((button) => {
            button.addEventListener('click', async () => {
                const item = state.announcements.find((a) => a.id === button.dataset.duplicateAnnouncement);
                if (!item) return;
                const { id, created_at, updated_at, ...rest } = item;
                await api('/announcements', { method: 'POST', body: JSON.stringify({ ...rest, name: `${item.name} ${tr('copySuffix')}` }) });
                await loadAnnouncements();
            });
        });
        body.querySelectorAll('[data-delete-announcement]').forEach((button) => {
            button.addEventListener('click', async () => {
                const id = button.dataset.deleteAnnouncement;
                const item = state.announcements.find((a) => a.id === id);
                const message = tr('confirmDeleteAnnouncement', { name: item?.name || id });
                const confirmed = window.appConfirm ? await window.appConfirm(message, tr('deleteAnnouncementTitle'), 'danger') : window.confirm(message);
                if (!confirmed) return;
                await api(`/announcements/${encodeURIComponent(id)}`, { method: 'DELETE' });
                if (state.editingId === id) resetDraft();
                await loadAnnouncements();
            });
        });
    }

    // Lista compacta debajo de "Vista previa" en el editor -- mismo patrón
    // de tarjeta-completa-clicable que renderQuickScenes() del Panel
    // principal (misma acción, /announcements/{id}/send), pero apilada
    // vertical en vez de carrusel horizontal porque acá vive en la
    // columna angosta del sidebar, no en una tarjeta ancha del dashboard.
    function renderSidebarAnnouncements() {
        const container = root.querySelector('#mled-sidebar-announcements');
        if (!container) return;
        const items = state.announcements;
        if (!items.length) {
            container.innerHTML = `<p class="mled-empty-row">${tr('noAnnouncementsYet')}</p>`;
            return;
        }
        container.innerHTML = items.map((item) => `
            <article class="mled-sidebar-scene" data-scene-id="${esc(item.id)}" role="button" tabindex="0" title="${esc(tr('sendToScreenTitle', { name: item.name }))}">
                <div class="mled-scene-preview mled-scene-preview-small">${item.matrix.flat().map((color) => `<span style="${color ? `background:#${color}` : ''}"></span>`).join('')}</div>
                <span class="mled-sidebar-scene-name">${esc(item.name)}</span>
                <span class="mled-btn-icon-play" aria-hidden="true">▶</span>
            </article>`).join('');

        async function sendSidebarScene(card) {
            if (card.classList.contains('is-sending')) return;
            card.classList.add('is-sending');
            try {
                await api(`/announcements/${encodeURIComponent(card.dataset.sceneId)}/send`, { method: 'POST' });
                await loadLastSent();
            } catch (error) {
                root.querySelector('#mled-save-msg').textContent = error.message || tr('errorSending');
            } finally {
                card.classList.remove('is-sending');
            }
        }
        container.querySelectorAll('.mled-sidebar-scene').forEach((card) => {
            card.addEventListener('click', () => sendSidebarScene(card));
            card.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); sendSidebarScene(card); }
            });
        });
    }

    async function loadAnnouncements() {
        try {
            ({ announcements: state.announcements } = await api('/announcements'));
        } catch {
            state.announcements = [];
        }
        refreshGroupOptions();
        renderAnnouncementsTable();
        renderSidebarAnnouncements();
        renderKPIs();
        renderQuickScenes();
        refreshTabCards();
    }

    async function loadMachinesForForm() {
        try {
            ({ machines: state.machines } = await api('/machines'));
        } catch {
            state.machines = [];
        }
        const machineSelect = root.querySelector('#mled-machine');
        if (machineSelect) machineSelect.innerHTML = machineOptionsHtml(draft.machine_id);
        refreshGroupOptions();
        renderMachineAlertsTable();
    }

    // El <select> de grupo se arma con los grupos ya usados en
    // state.announcements -- hay que reconstruirlo (y volver a marcar el
    // seleccionado) cada vez que cambia el draft (editar/duplicar/cancelar)
    // o la lista de anuncios, si no el grupo guardado en el draft se
    // desincroniza de lo que se ve marcado en el <select>.
    function refreshGroupOptions() {
        const groupSelect = root.querySelector('#mled-group-select');
        if (!groupSelect) return;
        groupSelect.innerHTML = groupOptionsHtml(draft.group);
    }

    // ── Guardar / enviar / cancelar ──
    function resetDraft() {
        draft = newDraft();
        state.editingId = null;
        fillDraftForm();
        const machineSelect = root.querySelector('#mled-machine');
        if (machineSelect) machineSelect.value = '';
    }

    async function saveAnnouncement() {
        readDraftForm();
        const msg = root.querySelector('#mled-save-msg');
        if (!draft.name) {
            msg.textContent = tr('missingAnnouncementName');
            msg.className = 'mled-inline-msg mled-inline-msg-error';
            return;
        }
        msg.textContent = tr('saving');
        msg.className = 'mled-inline-msg';
        try {
            const payload = { ...draft };
            delete payload.id;
            const saved = state.editingId
                ? await api(`/announcements/${encodeURIComponent(state.editingId)}`, { method: 'PUT', body: JSON.stringify(payload) })
                : await api('/announcements', { method: 'POST', body: JSON.stringify(payload) });
            state.editingId = saved.id;
            msg.textContent = tr('announcementSaved');
            msg.classList.add('mled-inline-msg-ok');
            await loadAnnouncements();
        } catch (error) {
            msg.textContent = error.message || tr('errorSaving');
            msg.classList.add('mled-inline-msg-error');
        }
    }

    async function sendDraftNow() {
        const msg = root.querySelector('#mled-save-msg');
        msg.textContent = tr('sendingToScreen');
        msg.className = 'mled-inline-msg';
        const animateCol = root.querySelector('#mled-animate-col').checked;
        const animateRow = root.querySelector('#mled-animate-row').checked;
        const speed = Number(root.querySelector('#mled-speed').value) || 80;
        try {
            const result = await api('/image', {
                method: 'POST',
                body: JSON.stringify({ matrix: draft.matrix, animate_col: animateCol, animate_row: animateRow, speed }),
            });
            const windowsTotal = result.windows_total ?? 1;
            msg.textContent = tr('sentWindows', { count: windowsTotal, word: tr(windowsTotal === 1 ? 'windowSingular' : 'windowPlural') });
            msg.classList.add('mled-inline-msg-ok');
        } catch (error) {
            msg.textContent = error.message || tr('errorSending');
            msg.classList.add('mled-inline-msg-error');
        }
    }

    // ── Estado / conexión ──
    async function refreshStatus() {
        try {
            state.status = await api('/status');
        } catch {
            state.status = { configured: state.config.has_password || !!state.config.ip, connected: false, reason: 'error' };
        }
        renderStatus();
    }

    function renderStatus() {
        if (!root) return;
        const pill = root.querySelector('#mled-status-pill');
        const text = root.querySelector('#mled-status-text');
        if (!pill || !text) return;
        pill.classList.remove('mled-status-ok', 'mled-status-warn', 'mled-status-off');
        if (!state.status.configured) {
            pill.classList.add('mled-status-off');
            text.textContent = tr('notConfigured');
        } else if (state.status.connected) {
            pill.classList.add('mled-status-ok');
            text.textContent = tr('statusConnected');
        } else {
            pill.classList.add('mled-status-warn');
            text.textContent = tr('configuredNoBle');
        }
        renderKPIs();
        renderDiagnostics();
        refreshTabCards();
    }

    // ── Modal de configuración del accesorio ──
    function fillConfigForm() {
        root.querySelector('#mled-ip').value = state.config.ip || '';
        root.querySelector('#mled-username').value = state.config.username || '';
        root.querySelector('#mled-auto-alerts').checked = !!state.config.auto_alerts;
        const passwordInput = root.querySelector('#mled-password');
        passwordInput.value = '';
        passwordInput.placeholder = state.config.has_password ? '••••••••• (sin cambios)' : '•••••••••';
    }

    async function loadConfig() {
        try {
            state.config = await api('/config');
        } catch {
            state.config = { ip: '', username: '', has_password: false, auto_alerts: false };
        }
        fillConfigForm();
        syncMachinePolling();
    }

    async function saveConfig() {
        const msg = root.querySelector('#mled-config-msg');
        msg.textContent = tr('saving');
        msg.className = 'mled-inline-msg';
        try {
            state.config = await api('/config', {
                method: 'POST',
                body: JSON.stringify({
                    ip: root.querySelector('#mled-ip').value.trim(),
                    username: root.querySelector('#mled-username').value.trim(),
                    password: root.querySelector('#mled-password').value || null,
                    auto_alerts: root.querySelector('#mled-auto-alerts').checked,
                }),
            });
            fillConfigForm();
            msg.textContent = tr('savedGeneric');
            msg.classList.add('mled-inline-msg-ok');
            refreshStatus();
            syncMachinePolling();
        } catch (error) {
            msg.textContent = error.message || tr('errorSaving');
            msg.classList.add('mled-inline-msg-error');
        }
    }

    // ── Aviso automático (sin cambios respecto a v0.3.0: sigue mandando
    // texto simple vía /text, independiente del editor de anuncios) ──
    function enqueueSend(text, color) {
        alertQueue = alertQueue
            .catch(() => {})
            .then(() => api('/text', { method: 'POST', body: JSON.stringify({ text, color }) }));
        return alertQueue;
    }

    function findRuleByTrigger(trigger) {
        return state.rules.find((rule) => rule.trigger === trigger);
    }

    // machine_id -> ya se disparó la regla de inactividad para ESTE tramo
    // continuo de "idle" (se limpia cuando la máquina deja de estar idle,
    // ver pollMachines) -- sin esto, cada poll de MACHINES_POLL_MS después
    // de cruzar el umbral volvería a disparar la regla.
    const idleRuleFired = new Set();
    let materialAlertActive = false;
    let materialsTimer = null;

    async function pollMachines() {
        let machines;
        try {
            ({ machines } = await api('/machines'));
        } catch {
            return;
        }
        const seenIds = new Set();
        const idleRule = findRuleByTrigger('idle_timeout');
        for (const machine of machines) {
            const id = machine.id;
            const currentState = deriveMachineVisualState(machine);
            seenIds.add(id);
            const previousState = lastMachineStates.get(id);
            lastMachineStates.set(id, currentState);

            // Alertas por máquina: a diferencia de v0.5.0 (que mandaba el
            // anuncio solo en la TRANSICIÓN de estado), ahora es
            // tickMachineAlertRotation() quien decide qué mostrar -- una
            // sola pantalla física no puede reflejar dos máquinas activas
            // a la vez, así que se turnan cada MACHINE_ALERT_ROTATION_MS
            // (ver más abajo) en vez de pisarse entre sí.

            if (currentState === 'idle') {
                if (!idleSince.has(id)) idleSince.set(id, Date.now());
            } else {
                idleSince.delete(id);
                idleRuleFired.delete(id);
            }

            if (previousState === currentState) continue;
            if (DONE_STATES.has(currentState)) enqueueSend('OK', '22c55e').catch(() => {});
            else if (ERROR_STATES.has(currentState)) enqueueSend('ERR', 'ef4444').catch(() => {});
        }
        for (const id of Array.from(lastMachineStates.keys())) {
            if (!seenIds.has(id)) { lastMachineStates.delete(id); idleSince.delete(id); idleRuleFired.delete(id); coolingTracked.delete(id); }
        }

        // Regla global "Inactividad > 5 min" (ver Automatizaciones
        // sugeridas del panel principal): se dispara UNA vez por cada
        // tramo continuo de inactividad que cruza el umbral, no en cada
        // sondeo mientras la máquina se mantenga idle.
        if (idleRule?.enabled) {
            for (const [id, since] of idleSince.entries()) {
                const minutes = (Date.now() - since) / 60000;
                if (minutes >= (idleRule.idle_minutes || 5) && !idleRuleFired.has(id)) {
                    idleRuleFired.add(id);
                    api(`/rules/${encodeURIComponent(idleRule.id)}/run`, { method: 'POST' }).catch(() => {});
                }
            }
        }
    }

    // Carrusel de "Alertas por máquina": la pantalla es un solo dispositivo
    // físico, así que si dos o más máquinas configuradas están activas a
    // la vez (por ejemplo una calentando y otra imprimiendo), se turnan en
    // vez de pisarse entre sí -- cada MACHINE_ALERT_ROTATION_MS se manda
    // el anuncio de la siguiente máquina activa de la lista, y al llegar
    // al final vuelve a la primera. Con una sola máquina activa, sigue
    // reenviando ese mismo anuncio cada tanto (barato para el accesorio,
    // y mantiene la pantalla mostrando el estado real aunque algo más
    // la haya sobrescrito mientras tanto).
    const MACHINE_ALERT_ROTATION_MS = 5000;
    let machineAlertRotationTimer = null;
    let machineAlertRotationIndex = 0;

    function activeMachineAlertEntries() {
        const active = [];
        for (const [id, currentState] of lastMachineStates.entries()) {
            const machineConfig = state.machineAlerts[id];
            if (!machineConfig?.enabled) continue;
            const announcementId = machineConfig.state_announcements?.[currentState];
            if (announcementId) active.push({ id, announcementId });
        }
        return active;
    }

    function tickMachineAlertRotation() {
        const active = activeMachineAlertEntries();
        if (!active.length) return;
        machineAlertRotationIndex = machineAlertRotationIndex % active.length;
        const entry = active[machineAlertRotationIndex];
        machineAlertRotationIndex = (machineAlertRotationIndex + 1) % active.length;
        // El nombre de la máquina (no el del anuncio) es lo que queda
        // registrado como "source" -- así el ticker del dock en el core
        // muestra de qué máquina viene cada envío automático.
        const machine = state.machines.find((item) => item.id === entry.id);
        const source = encodeURIComponent(machine?.name || entry.id);
        api(`/announcements/${encodeURIComponent(entry.announcementId)}/send?source=${source}`, { method: 'POST' }).catch(() => {});
    }

    // Sondea Spoolman (si el plugin está instalado -- si no, falla en
    // silencio) para la sugerencia "Material bajo" y su regla asociada.
    // Import HTTP directo al endpoint del plugin, no a su servicio Python
    // -- mismo criterio que list_machines() del lado del backend: un
    // plugin nunca importa código de otro, solo consume su API pública.
    async function loadMaterialAlerts() {
        try {
            const response = await fetch('/api/spoolman/alerts', { credentials: 'same-origin' });
            if (!response.ok) { state.materialAlerts = []; }
            else {
                const data = await response.json();
                state.materialAlerts = Array.isArray(data) ? data : (data.alerts || []);
            }
        } catch {
            state.materialAlerts = [];
        }
        renderSuggestions();
    }

    async function pollMaterialAlerts() {
        await loadMaterialAlerts();
        const hasAlerts = state.materialAlerts.length > 0;
        const materialRule = findRuleByTrigger('material_low');
        if (materialRule?.enabled && hasAlerts && !materialAlertActive) {
            api(`/rules/${encodeURIComponent(materialRule.id)}/run`, { method: 'POST' }).catch(() => {});
        }
        materialAlertActive = hasAlerts;
    }

    function syncMachinePolling() {
        const anyMachineAlertEnabled = Object.values(state.machineAlerts).some((entry) => entry.enabled);
        const idleRuleEnabled = state.rules.some((rule) => rule.trigger === 'idle_timeout' && rule.enabled);
        const shouldPoll = !!state.config.auto_alerts || anyMachineAlertEnabled || idleRuleEnabled;
        if (shouldPoll && !machinesTimer) {
            lastMachineStates.clear();
            pollMachines();
            machinesTimer = window.setInterval(pollMachines, MACHINES_POLL_MS);
        } else if (!shouldPoll && machinesTimer) {
            window.clearInterval(machinesTimer);
            machinesTimer = null;
        }

        if (anyMachineAlertEnabled && !machineAlertRotationTimer) {
            machineAlertRotationIndex = 0;
            machineAlertRotationTimer = window.setInterval(tickMachineAlertRotation, MACHINE_ALERT_ROTATION_MS);
        } else if (!anyMachineAlertEnabled && machineAlertRotationTimer) {
            window.clearInterval(machineAlertRotationTimer);
            machineAlertRotationTimer = null;
        }

        const materialRuleEnabled = state.rules.some((rule) => rule.trigger === 'material_low' && rule.enabled);
        if (materialRuleEnabled && !materialsTimer) {
            materialAlertActive = state.materialAlerts.length > 0;
            materialsTimer = window.setInterval(pollMaterialAlerts, MACHINES_POLL_MS);
        } else if (!materialRuleEnabled && materialsTimer) {
            window.clearInterval(materialsTimer);
            materialsTimer = null;
        }
    }

    // ── Panel principal ──
    function formatUptime(ms) {
        if (ms == null) return '—';
        const totalSeconds = Math.floor(ms / 1000);
        const days = Math.floor(totalSeconds / 86400);
        const hours = Math.floor((totalSeconds % 86400) / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        return `${days}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`;
    }

    function formatBytes(bytes) {
        if (bytes == null) return '—';
        return bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`;
    }

    // Reemplaza el "Hace un momento" fijo que había antes (no medía nada
    // real, solo aparecía si device-info respondía) -- esto sí calcula
    // contra una marca de tiempo real del backend (sent_at/at).
    function formatRelativeTime(isoString) {
        if (!isoString) return null;
        const then = new Date(isoString).getTime();
        if (Number.isNaN(then)) return null;
        const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
        if (seconds < 5) return tr('justNow');
        if (seconds < 60) return tr('secondsAgo', { n: seconds });
        const minutes = Math.round(seconds / 60);
        if (minutes < 60) return tr('minutesAgo', { n: minutes });
        const hours = Math.round(minutes / 60);
        if (hours < 24) return tr('hoursAgo', { n: hours });
        const days = Math.round(hours / 24);
        return tr('daysAgo', { n: days });
    }

    async function loadDeviceInfo() {
        try {
            state.deviceInfo = await api('/device-info');
        } catch {
            state.deviceInfo = { available: false };
        }
        renderDiagnostics();
        renderEstadoTaller();
        renderSummary();
    }

    // Diagnóstico real: todo lo que se muestra acá viene de datos que el
    // backend de verdad rastrea (get_status/get_device_info/get_last_sent/
    // get_last_error) -- nada de "reintentos" (no hay lógica de reintento
    // en send_windows) ni "hora de última conexión" separada (no se
    // rastrea aparte de last_sent/last_error, que sí son reales).
    function renderDiagnostics() {
        if (!root) return;
        const info = state.deviceInfo;
        const set = (id, value) => { const el = root.querySelector(id); if (el) el.textContent = value; };
        set('#mled-info-model', info.available ? (info.chip || '—') : tr('notAvailableBadge'));
        set('#mled-info-firmware', info.available ? (info.firmware || '—') : tr('notAvailableBadge'));
        set('#mled-info-heap', info.available ? formatBytes(info.free_heap_bytes) : tr('notAvailableBadge'));

        const connEl = root.querySelector('#mled-diag-connection');
        if (connEl) {
            connEl.classList.remove('mled-diag-ok', 'mled-diag-warn', 'mled-diag-off');
            if (!state.status.configured) { connEl.textContent = tr('notConfigured'); connEl.classList.add('mled-diag-off'); }
            else if (state.status.connected) { connEl.textContent = tr('diagConnected'); connEl.classList.add('mled-diag-ok'); }
            else { connEl.textContent = tr('noBle'); connEl.classList.add('mled-diag-warn'); }
        }

        const lastSentEl = root.querySelector('#mled-diag-last-sent');
        if (lastSentEl) lastSentEl.textContent = state.lastSent?.sent_at ? (formatRelativeTime(state.lastSent.sent_at) || '—') : tr('never');

        const lastErrorEl = root.querySelector('#mled-diag-last-error');
        if (lastErrorEl) {
            lastErrorEl.classList.toggle('mled-diag-warn', !!state.lastError);
            lastErrorEl.textContent = state.lastError
                ? `${state.lastError.detail} (${formatRelativeTime(state.lastError.at) || '—'})`
                : tr('noErrorsLogged');
        }
    }

    function renderEstadoTaller() {
        const el = root.querySelector('#mled-th-temp');
        if (!el) return;
        const info = state.deviceInfo;
        if (info.available && info.th_sensor_enabled && info.temperature_c_estimated != null) {
            el.textContent = tr('estimatedTemp', { value: info.temperature_c_estimated.toFixed(1) });
            el.classList.remove('mled-unavailable');
        } else {
            el.textContent = tr('notAvailableBadge');
            el.classList.add('mled-unavailable');
        }
    }

    function findMatchingAnnouncementName(matrix) {
        if (!matrix) return null;
        const serialized = JSON.stringify(matrix);
        return state.announcements.find((item) => JSON.stringify(item.matrix) === serialized)?.name || null;
    }

    async function loadLastSent() {
        try {
            ({ last_sent: state.lastSent } = await api('/last-sent'));
        } catch {
            state.lastSent = null;
        }
        renderLiveView();
        renderQuickScenes();
        renderDiagnostics();
    }

    async function loadLastError() {
        try {
            ({ last_error: state.lastError } = await api('/last-error'));
        } catch {
            state.lastError = null;
        }
        renderDiagnostics();
    }

    function renderLiveView() {
        const grid = root.querySelector('#mled-live-grid');
        if (!grid) return;
        const matrix = state.lastSent?.matrix;
        grid.innerHTML = matrix
            ? matrix.flat().map((color) => `<span class="mled-preview-cell" style="${color ? `background:#${color}` : ''}"></span>`).join('')
            : '';
        const sceneLabel = root.querySelector('#mled-live-scene');
        if (sceneLabel) {
            const name = findMatchingAnnouncementName(matrix);
            sceneLabel.textContent = matrix ? tr('currentScene', { name: name || tr('custom') }) : tr('currentSceneNoSends');
        }
    }

    async function loadStats() {
        try {
            state.stats = await api('/stats');
        } catch {
            state.stats = { sent_ok: 0, sent_error: 0 };
        }
        renderSummary();
    }

    function renderSummary() {
        const uptimeEl = root.querySelector('#mled-sum-uptime');
        if (uptimeEl) uptimeEl.textContent = state.deviceInfo.available ? formatUptime(state.deviceInfo.uptime_ms) : tr('notAvailableBadge');
        const total = state.stats.sent_ok + state.stats.sent_error;
        const set = (id, value) => { const el = root.querySelector(id); if (el) el.textContent = value; };
        set('#mled-sum-sent', String(total));
        set('#mled-sum-success', total ? `${Math.round((state.stats.sent_ok / total) * 100)}%` : '—');
        set('#mled-sum-errors', String(state.stats.sent_error));
    }

    function renderKPIs() {
        const set = (id, value) => { const el = root.querySelector(id); if (el) el.textContent = value; };
        set('#mled-kpi-matrices', '1');
        set('#mled-kpi-matrices-sub', state.status.connected ? tr('operational') : (state.status.configured ? tr('noBle') : tr('notConfigured')));
        set('#mled-kpi-scenes', String(state.announcements.length));
        set('#mled-kpi-scenes-sub', state.announcements.length ? tr('readyToUse') : tr('createFirstAnnouncement'));

        const enabledRules = state.rules.filter((rule) => rule.enabled).length;
        const enabledMachines = Object.values(state.machineAlerts).filter((entry) => entry.enabled).length;
        set('#mled-kpi-automations', String(enabledRules + enabledMachines + (state.config.auto_alerts ? 1 : 0)));
        set('#mled-kpi-automations-sub', tr('rulesAndMachines', { rules: enabledRules, machines: enabledMachines }));
    }

    function renderQuickScenes() {
        const container = root.querySelector('#mled-quick-scenes');
        if (!container) return;
        const items = state.announcements;
        const prevBtn = root.querySelector('#mled-scenes-prev');
        const nextBtn = root.querySelector('#mled-scenes-next');
        if (!items.length) {
            container.innerHTML = `<p class="mled-empty-row">${tr('noAnnouncementsCreateHint')}</p>`;
            if (prevBtn) prevBtn.hidden = true;
            if (nextBtn) nextBtn.hidden = true;
            return;
        }
        const lastSentSerialized = state.lastSent?.matrix ? JSON.stringify(state.lastSent.matrix) : null;
        container.innerHTML = items.map((item) => {
            const isActive = lastSentSerialized && JSON.stringify(item.matrix) === lastSentSerialized;
            return `
                <article class="mled-scene-card" data-scene-id="${esc(item.id)}" role="button" tabindex="0" title="${esc(tr('sendToScreenTitle', { name: item.name }))}">
                    <div class="mled-scene-preview">${item.matrix.flat().map((color) => `<span style="${color ? `background:#${color}` : ''}"></span>`).join('')}</div>
                    <strong>${esc(item.name)}</strong>
                    <div class="mled-scene-footer">
                        <span class="mled-badge ${isActive ? 'mled-badge-alta' : 'mled-badge-baja'}">${isActive ? tr('activeBadge') : tr('readyBadge')}</span>
                        <span class="mled-btn-icon-play" aria-hidden="true">▶</span>
                    </div>
                </article>`;
        }).join('');
        // Toda la tarjeta manda el anuncio, no solo el botón ▶ (que ahora
        // es solo un ícono decorativo dentro de la misma tarjeta) --
        // ver bindEvents para el resto de acciones del panel que sí usan
        // un botón chico en vez de esto.
        async function sendQuickScene(card) {
            if (card.classList.contains('is-sending')) return;
            card.classList.add('is-sending');
            try {
                await api(`/announcements/${encodeURIComponent(card.dataset.sceneId)}/send`, { method: 'POST' });
                await loadLastSent();
            } catch (error) {
                root.querySelector('#mled-save-msg').textContent = error.message || tr('errorSending');
            } finally {
                card.classList.remove('is-sending');
            }
        }
        container.querySelectorAll('.mled-scene-card').forEach((card) => {
            card.addEventListener('click', () => sendQuickScene(card));
            card.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); sendQuickScene(card); }
            });
        });
        // Las flechas solo hacen falta si de verdad hay más tarjetas de
        // las que caben visibles a la vez -- si todo cabe, no hay nada
        // que desplazar.
        updateScenesArrowVisibility();
    }

    // Aparte de renderQuickScenes() (que puede correr con el contenedor
    // todavía en display:none -- el plugin monta y hace sus primeras
    // cargas de datos ANTES de que el usuario navegue a esta sección, así
    // que scrollWidth/clientWidth miden 0 en ese momento), un
    // ResizeObserver recalcula solo apenas el contenedor de verdad tenga
    // tamaño real (al cambiar de pestaña interna, al redimensionar la
    // ventana, etc.) -- sin esto las flechas podían quedar escondidas
    // para siempre aunque sí sobraran tarjetas.
    function updateScenesArrowVisibility() {
        const container = root.querySelector('#mled-quick-scenes');
        const prevBtn = root.querySelector('#mled-scenes-prev');
        const nextBtn = root.querySelector('#mled-scenes-next');
        if (!container || !prevBtn || !nextBtn) return;
        if (!container.children.length) { prevBtn.hidden = true; nextBtn.hidden = true; return; }
        const needsArrows = container.scrollWidth > container.clientWidth + 4;
        prevBtn.hidden = !needsArrows;
        nextBtn.hidden = !needsArrows;
    }

    // Carrusel infinito: al llegar a una punta, la siguiente flecha
    // "envuelve" al otro extremo en vez de quedarse sin efecto -- así
    // nunca hay un tope duro en cuántos anuncios se pueden hojear.
    function scrollQuickScenes(direction) {
        const container = root.querySelector('#mled-quick-scenes');
        if (!container) return;
        const cardWidth = container.querySelector('.mled-scene-card')?.offsetWidth || 150;
        const step = cardWidth + 12;
        const maxScroll = container.scrollWidth - container.clientWidth;
        if (direction > 0 && container.scrollLeft >= maxScroll - 4) {
            container.scrollTo({ left: 0, behavior: 'smooth' });
        } else if (direction < 0 && container.scrollLeft <= 4) {
            container.scrollTo({ left: maxScroll, behavior: 'smooth' });
        } else {
            container.scrollBy({ left: direction * step, behavior: 'smooth' });
        }
    }

    async function ensureAnnouncementByName(name, templateId) {
        const existing = state.announcements.find((item) => item.name === name);
        if (existing) return existing;
        const template = SYSTEM_TEMPLATES.find((item) => item.id === templateId);
        const created = await api('/announcements', {
            method: 'POST',
            body: JSON.stringify({ name, matrix: templateMatrix(template), priority: 'media' }),
        });
        state.announcements.push(created);
        return created;
    }

    async function loadRules() {
        try {
            ({ rules: state.rules } = await api('/rules'));
        } catch {
            state.rules = [];
        }
        renderKPIs();
        renderSuggestions();
        syncMachinePolling();
    }

    // Casilla "También mostrar en el panel FK-8Wa" de las reglas
    // (campo booleano `fk8wa`; las reglas viejas sin el campo valen false).
    // Si la regla todavía no existe, la elección se guarda aquí y viaja en
    // el POST que la crea al pulsar "Activar".
    const fkRulePending = { idle_timeout: false, material_low: false };

    function ruleFk8wa(rule, trigger) {
        return rule ? !!rule.fk8wa : !!fkRulePending[trigger];
    }

    function renderSuggestions() {
        const container = root.querySelector('#mled-suggestions');
        if (!container) return;

        const idleRule = findRuleByTrigger('idle_timeout');
        const materialRule = findRuleByTrigger('material_low');
        const materialDetected = state.materialAlerts.length > 0;
        const anyIdleMachine = idleSince.size > 0;

        const items = [
            {
                id: 'idle', icon: '💤', available: true,
                title: tr('suggestionIdleTitle'),
                detail: tr('suggestionIdleDetail', { suffix: anyIdleMachine ? tr('detectedNowSuffix') : '' }),
                active: !!idleRule?.enabled,
                rule: idleRule, trigger: 'idle_timeout',
                onToggle: async () => {
                    const fk8wa = ruleFk8wa(idleRule, 'idle_timeout');
                    if (idleRule) {
                        await api(`/rules/${encodeURIComponent(idleRule.id)}`, { method: 'PUT', body: JSON.stringify({ enabled: !idleRule.enabled, fk8wa }) });
                    } else {
                        const announcement = await ensureAnnouncementByName(tr('tplNightMode'), 'tpl-nocturno');
                        await api('/rules', { method: 'POST', body: JSON.stringify({ name: tr('suggestionIdleTitle'), trigger: 'idle_timeout', idle_minutes: 5, announcement_id: announcement.id, enabled: true, fk8wa }) });
                    }
                    await loadRules();
                },
            },
            {
                id: 'material', icon: '🧵', available: true,
                title: tr('suggestionMaterialTitle'),
                detail: tr('suggestionMaterialDetail', { suffix: materialDetected ? tr('detectedNowSuffix') : '' }),
                active: !!materialRule?.enabled,
                rule: materialRule, trigger: 'material_low',
                onToggle: async () => {
                    const fk8wa = ruleFk8wa(materialRule, 'material_low');
                    if (materialRule) {
                        await api(`/rules/${encodeURIComponent(materialRule.id)}`, { method: 'PUT', body: JSON.stringify({ enabled: !materialRule.enabled, fk8wa }) });
                    } else {
                        const announcement = await ensureAnnouncementByName(tr('tplLowMaterial'), 'tpl-material-bajo');
                        await api('/rules', { method: 'POST', body: JSON.stringify({ name: tr('tplLowMaterial'), trigger: 'material_low', announcement_id: announcement.id, enabled: true, fk8wa }) });
                    }
                    await loadRules();
                },
            },
            {
                id: 'job-done', icon: '✅', available: true,
                title: tr('suggestionJobDoneTitle'),
                detail: tr('suggestionJobDoneDetail'),
                active: !!state.config.auto_alerts,
                onToggle: async () => {
                    state.config = await api('/config', {
                        method: 'POST',
                        body: JSON.stringify({ ip: state.config.ip, username: state.config.username, password: null, auto_alerts: !state.config.auto_alerts }),
                    });
                    syncMachinePolling();
                    renderKPIs();
                },
            },
            {
                id: 'smoke', icon: '🔥', available: false,
                title: tr('suggestionSmokeTitle'),
                detail: tr('suggestionSmokeDetail'),
                active: false,
                onToggle: null,
            },
        ];

        container.innerHTML = items.map((item) => `
            <div class="mled-suggestion ${item.available ? '' : 'mled-suggestion-unavailable'}">
                <span class="mled-suggestion-icon">${item.icon}</span>
                <div class="mled-suggestion-copy">
                    <strong>${esc(item.title)}${item.trigger && item.active && ruleFk8wa(item.rule, item.trigger) ? ` <span class="mled-fk-rule-badge" title="${esc(tr('fkRuleBadgeTitle'))}">FK-8Wa</span>` : ''}</strong>
                    <small>${esc(item.detail)}</small>
                    ${item.trigger ? `<label class="mled-checkbox mled-fk-rule-check"><input type="checkbox" data-fk-rule="${item.trigger}" ${ruleFk8wa(item.rule, item.trigger) ? 'checked' : ''}><span>${esc(tr('fkRuleCheckbox'))}</span></label>` : ''}
                </div>
                ${item.available
                    ? `<button type="button" class="mled-btn mled-btn-small ${item.active ? 'mled-btn-primary' : ''}" data-suggestion="${item.id}" title="${item.active ? tr('clickToDeactivate') : tr('clickToActivate')}">${item.active ? tr('activeBadge') : tr('activateBtn')}</button>`
                    : `<span class="mled-badge mled-badge-estado">${tr('notAvailableBadge')}</span>`}
            </div>
        `).join('');

        container.querySelectorAll('[data-fk-rule]').forEach((checkbox) => {
            checkbox.addEventListener('change', async () => {
                const item = items.find((entry) => entry.trigger === checkbox.dataset.fkRule);
                if (!item) return;
                if (!item.rule) {
                    fkRulePending[item.trigger] = checkbox.checked;
                    return;
                }
                checkbox.disabled = true;
                try {
                    await api(`/rules/${encodeURIComponent(item.rule.id)}`, { method: 'PUT', body: JSON.stringify({ fk8wa: checkbox.checked }) });
                    await loadRules();
                } catch (error) {
                    checkbox.checked = !checkbox.checked;
                    checkbox.disabled = false;
                    root.querySelector('#mled-save-msg').textContent = error.message || tr('genericError');
                }
            });
        });

        container.querySelectorAll('[data-suggestion]').forEach((button) => {
            button.addEventListener('click', async () => {
                const item = items.find((entry) => entry.id === button.dataset.suggestion);
                if (!item?.onToggle) return;
                button.disabled = true;
                try {
                    await item.onToggle();
                } catch (error) {
                    root.querySelector('#mled-save-msg').textContent = error.message || tr('genericError');
                } finally {
                    button.disabled = false;
                }
            });
        });
    }

    // ── Alertas por máquina ──
    async function loadMachineAlerts() {
        try {
            ({ machine_alerts: state.machineAlerts } = await api('/machine-alerts'));
        } catch {
            state.machineAlerts = {};
        }
        renderMachineAlertsTable();
        renderKPIs();
        syncMachinePolling();
    }

    function renderMachineAlertsTable() {
        const body = root.querySelector('#mled-machine-alerts-body');
        if (!body) return;
        if (!state.machines.length) {
            body.innerHTML = `<tr><td colspan="3" class="mled-empty-row">${tr('noMachinesDetected')}</td></tr>`;
            return;
        }
        body.innerHTML = state.machines.map((machine) => {
            const entry = state.machineAlerts[machine.id];
            const enabled = !!entry?.enabled;
            return `
                <tr>
                    <td>${esc(machine.name || machine.id)}</td>
                    <td><span class="mled-badge ${enabled ? 'mled-badge-baja' : 'mled-badge-estado'}">${enabled ? tr('activeAlertsBadge') : tr('inactiveAlertsBadge')}</span></td>
                    <td><button type="button" class="mled-btn mled-btn-small" data-configure-machine="${esc(machine.id)}">${tr('configureBtn')}</button></td>
                </tr>`;
        }).join('');
        body.querySelectorAll('[data-configure-machine]').forEach((button) => {
            button.addEventListener('click', () => openMachineAlertsModal(button.dataset.configureMachine));
        });
    }

    async function openMachineAlertsModal(machineId) {
        state.machineAlertsTarget = machineId;
        const machine = state.machines.find((item) => item.id === machineId);
        root.querySelector('#mled-machine-alerts-title').textContent = machine?.name || machineId;
        let config;
        try {
            config = await api(`/machine-alerts/${encodeURIComponent(machineId)}`);
        } catch {
            config = { enabled: false, state_announcements: {} };
        }
        root.querySelector('#mled-machine-alerts-enabled').checked = !!config.enabled;
        const statesContainer = root.querySelector('#mled-machine-alerts-states');
        statesContainer.innerHTML = MACHINE_STATES.map((stateKey) => `
            <label class="mled-field compact">
                <span>${esc(machineStateLabel(stateKey))}</span>
                <select data-machine-state="${stateKey}">
                    <option value="">${tr('unassignedOption')}</option>
                    ${state.announcements.map((item) => `<option value="${esc(item.id)}" ${config.state_announcements[stateKey] === item.id ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}
                </select>
            </label>
        `).join('');
        root.querySelector('#mled-machine-alerts-msg').textContent = '';
        root.querySelector('#mled-machine-alerts-modal').hidden = false;
    }

    async function saveMachineAlertsModal() {
        const machineId = state.machineAlertsTarget;
        if (!machineId) return;
        const msg = root.querySelector('#mled-machine-alerts-msg');
        msg.textContent = tr('saving');
        msg.className = 'mled-inline-msg';
        const stateAnnouncements = {};
        root.querySelectorAll('[data-machine-state]').forEach((select) => {
            stateAnnouncements[select.dataset.machineState] = select.value || null;
        });
        try {
            await api(`/machine-alerts/${encodeURIComponent(machineId)}`, {
                method: 'PUT',
                body: JSON.stringify({
                    enabled: root.querySelector('#mled-machine-alerts-enabled').checked,
                    state_announcements: stateAnnouncements,
                }),
            });
            msg.textContent = tr('savedGeneric');
            msg.classList.add('mled-inline-msg-ok');
            await loadMachineAlerts();
        } catch (error) {
            msg.textContent = error.message || tr('errorSaving');
            msg.classList.add('mled-inline-msg-error');
        }
    }

    function switchDashView(view) {
        state.view = view;
        root.querySelectorAll('.mled-view-tab').forEach((tab) => {
            const active = tab.dataset.view === view;
            tab.classList.toggle('is-active', active);
            tab.setAttribute('aria-selected', String(active));
            tab.tabIndex = active ? 0 : -1;
        });
        root.querySelector('#mled-view-dashboard').hidden = view !== 'dashboard';
        root.querySelector('#mled-view-editor').hidden = view !== 'editor';
        root.querySelector('#mled-view-fk8wa').hidden = view !== 'fk8wa';
        const title = root.querySelector('#mled-page-title');
        const sub = root.querySelector('#mled-page-sub');
        if (view === 'dashboard') {
            title.textContent = tr('dashboardTitle');
            sub.textContent = tr('dashboardSub');
        } else if (view === 'fk8wa') {
            title.textContent = tr('fkTitle');
            sub.textContent = tr('fkSub');
        } else {
            title.textContent = tr('editorTitle');
            sub.textContent = tr('editorSub');
        }
        if (view === 'dashboard') updateScenesArrowVisibility();
        // El sondeo del panel FK-8Wa solo corre con su pestaña abierta.
        if (view === 'fk8wa') fkEnter();
        else fkStopPolling();
        refreshTabCards();
        if (view !== 'fk8wa') fetchTabFk();
    }

    async function loadDashboard() {
        await Promise.all([loadDeviceInfo(), loadLastSent(), loadLastError(), loadStats(), loadRules(), loadMaterialAlerts(), loadMachineAlerts()]);
        renderKPIs();
    }

    // ── Panel LED del taller (FK-8Wa, 96x16) ──
    // Panel LED físico por WiFi, independiente de la matriz iPixel BLE de
    // arriba. El backend (backend/services/fk8wa/) decide qué mostrar y lo
    // manda solo; esta pestaña lo dibuja LED por LED con las páginas de
    // GET /fk8wa/frames (1 bit por LED) y deja cambiar lo poco que el taller
    // necesita. Diseño: maqueta aprobada "Panel LED del taller" (lenguaje
    // simple, globo "?" en cada cosa, nada técnico a la vista). El motor de
    // efectos de entrada (fkEffectFrame) y el texto corrido se portan de esa
    // maqueta: aproximan lo que el panel hace solo.
    // PUT /fk8wa/config, /fk8wa/test, /fk8wa/brightness y /fk8wa/effects/test
    // son solo admin: el operador lo ve todo en solo lectura y sí puede
    // mandar o quitar mensajes (igual criterio que updateTopbarUser() del
    // core).
    const FK_W = 96;
    const FK_H = 16;
    const FK_POLL_MS = 5000;
    const FK_EFFECT_MS = 1100;
    const FK_SCREENS = ['boot', 'normal', 'idle', 'print1', 'print2', 'many', 'heating', 'ready', 'cooling', 'pause', 'error', 'offline', 'done', 'special', 'off'];
    const FK_SCREEN_KEYS = {
        boot: 'fkScreenBoot', normal: 'fkScreenNormal', idle: 'fkScreenIdle', print1: 'fkScreenPrint1', print2: 'fkScreenPrint2',
        many: 'fkScreenMany', heating: 'fkScreenHeating', ready: 'fkScreenReady', cooling: 'fkScreenCooling', pause: 'fkScreenPause', error: 'fkScreenError', offline: 'fkScreenOffline',
        done: 'fkScreenDone', special: 'fkScreenSpecial', off: 'fkScreenOff', scroll: 'fkScreenScroll',
    };
    // Cuándo sale cada una de las 15 pantallas (galería "Ver las 15 pantallas").
    const FK_SCREEN_DESC_KEYS = {
        boot: 'fkScreenBootDesc', normal: 'fkScreenNormalDesc', idle: 'fkScreenIdleDesc', print1: 'fkScreenPrint1Desc',
        print2: 'fkScreenPrint2Desc', many: 'fkScreenManyDesc', heating: 'fkScreenHeatingDesc', ready: 'fkScreenReadyDesc', cooling: 'fkScreenCoolingDesc', pause: 'fkScreenPauseDesc',
        error: 'fkScreenErrorDesc', offline: 'fkScreenOfflineDesc', done: 'fkScreenDoneDesc', special: 'fkScreenSpecialDesc',
        off: 'fkScreenOffDesc',
    };
    // Frase de "Así se ve tu panel ahora" por pantalla: [título, detalle].
    // Sin datos inventados: no se nombra la máquina porque status no la trae.
    const FK_NOW_KEYS = {
        boot: ['fkNowBootTitle', 'fkNowBootText'],
        normal: ['fkNowNormalTitle', 'fkNowNormalText'],
        idle: ['fkNowIdleTitle', 'fkNowIdleText'],
        print1: ['fkNowPrintingTitle', 'fkNowPrintingText'],
        print2: ['fkNowPrintingTitle', 'fkNowPrintingText'],
        many: ['fkNowManyTitle', 'fkNowManyText'],
        heating: ['fkNowHeatingTitle', 'fkNowHeatingText'],
        ready: ['fkNowReadyTitle', 'fkNowReadyText'],
        cooling: ['fkNowCoolingTitle', 'fkNowCoolingText'],
        pause: ['fkNowPauseTitle', 'fkNowPauseText'],
        error: ['fkNowErrorTitle', 'fkNowErrorText'],
        offline: ['fkNowOfflineTitle', 'fkNowOfflineText'],
        special: ['fkNowSpecialTitle', 'fkNowSpecialText'],
        scroll: ['fkNowScrollTitle', 'fkNowScrollText'],
        done: ['fkNowDoneTitle', 'fkNowDoneText'],
        off: ['fkNowOffTitle', 'fkNowOffText'],
    };
    // Pestañas internas de la ficha del panel (no confundir con las fichas
    // del plugin): [clave, texto]. La clave arma los ids mled-fk-tab-<clave>
    // y mled-fk-pn-<clave>.
    const FK_TABS = [
        ['panel', 'fkTabPanel'],
        ['mach', 'fkTabMach'],
        ['clock', 'fkTabClock'],
        ['fx', 'fkTabFx'],
        ['screens', 'fkTabScreens'],
    ];
    const FK_TAB_KEY = 'nopal.matriz-led.fkTab';

    // Tira "¿Por qué muestra esto?", de más a menos importante (mismo orden
    // que PRIORITY_OF de service.py y la máquina de estados).
    const FK_PRIORITY = [
        ['error', '⚠', 'fkPrioError', 'fkPrioErrorTip'],
        ['pause', '‖', 'fkPrioPause', 'fkPrioPauseTip'],
        ['offline', '◎', 'fkPrioOffline', 'fkPrioOfflineTip'],
        ['special', '✉', 'fkPrioSpecial', 'fkPrioSpecialTip'],
        ['done', '✓', 'fkPrioDone', 'fkPrioDoneTip'],
        ['printing', '▶', 'fkPrioPrinting', 'fkPrioPrintingTip'],
        ['heating', '♨', 'fkPrioHeating', 'fkPrioHeatingTip'],
        ['ready', '◉', 'fkPrioReady', 'fkPrioReadyTip'],
        ['cooling', '❄', 'fkPrioCooling', 'fkPrioCoolingTip'],
        ['normal', '●', 'fkPrioNormal', 'fkPrioNormalTip'],
    ];
    // Nombres de los contornos (config.timer_style y situation_styles).
    // "marco" agrupa los 11 marco_* que anima el propio panel.
    const FK_STYLE_CARDS = [
        ['contorno', 'fkStyleContorno', 'fkStyleContornoDesc'],
        ['contorno_encima', 'fkStyleEncima', 'fkStyleEncimaDesc'],
        ['barra', 'fkStyleBarra', 'fkStyleBarraDesc'],
        ['ninguno', 'fkStyleNinguno', 'fkStyleNingunoDesc'],
        ['marco', 'fkStyleMarco', 'fkStyleMarcoDesc'],
    ];
    // Con estos relojes las situaciones "con reloj" (timed) no admiten
    // efecto de entrada: un efecto se repetiría en cada página del contador.
    const FK_CLOCK_BLOCKS = ['contorno', 'contorno_encima', 'barra'];
    const FK_BORDERS = [
        ['marco_fixed', 'fkBorderFixed'], ['marco_random', 'fkBorderRandom'], ['marco_cw', 'fkBorderCw'], ['marco_ccw', 'fkBorderCcw'],
        ['marco_flash', 'fkBorderFlash'], ['marco_flash_cw', 'fkBorderFlashCw'], ['marco_flash_ccw', 'fkBorderFlashCcw'],
        ['marco_line_cw', 'fkBorderLineCw'], ['marco_line_ccw', 'fkBorderLineCcw'],
        ['marco_dline_cw', 'fkBorderDlineCw'], ['marco_dline_ccw', 'fkBorderDlineCcw'],
    ];
    const FK_PATTERNS = [
        ['dash', 'fkPatternDash', [1, 1, 1, 1, 0, 0, 0, 0]],
        ['solid', 'fkPatternSolid', [1]],
        ['dot', 'fkPatternDot', [1, 1, 0, 0]],
        ['dot1', 'fkPatternDot1', [1, 0]],
    ];
    const FK_DIRS = [['l1', 'fkDirL1'], ['r', 'fkDirR'], ['u', 'fkDirU'], ['d', 'fkDirD'], ['l', 'fkDirL']];
    const FK_SIT_KEYS = {
        rest: 'fkSitRest', heating: 'fkSitHeating', ready: 'fkSitReady', cooling: 'fkSitCooling', printing: 'fkSitPrinting',
        pause: 'fkSitPause', error: 'fkSitError', offline: 'fkSitOffline', done: 'fkSitDone', special: 'fkSitSpecial',
    };
    // "Cuándo sale" de cada situación y la pantalla de ejemplo que dibuja su
    // ficha (printing no lleva: usa el ejemplo de impresión de dos vistas).
    const FK_SIT_WHEN = {
        rest: 'fkSitWhenRest', heating: 'fkSitWhenHeating', ready: 'fkSitWhenReady', cooling: 'fkSitWhenCooling', printing: 'fkSitWhenPrinting',
        pause: 'fkSitWhenPause', error: 'fkSitWhenError', offline: 'fkSitWhenOffline', done: 'fkSitWhenDone', special: 'fkSitWhenSpecial',
    };
    const FK_SIT_SCREEN = {
        rest: 'normal', heating: 'heating', ready: 'ready', cooling: 'cooling', pause: 'pause', error: 'error', offline: 'offline', done: 'done', special: 'special',
    };
    const FK_SIT_NEW = ['ready', 'cooling'];
    // Situación a la que pertenece cada pantalla de la galería (como SITUATION_OF).
    const FK_SCREEN_SIT = {
        normal: 'rest', idle: 'rest', heating: 'heating', ready: 'ready', cooling: 'cooling', print1: 'printing', print2: 'printing',
        many: 'printing', pause: 'pause', error: 'error', offline: 'offline', done: 'done', special: 'special',
    };
    // Familias de efectos: nombre que manda el servidor -> clave i18n.
    const FK_FAMILIES = [
        ['Desplazar', 'fkFamScroll'], ['Entrar', 'fkFamEnter'], ['Cubrir', 'fkFamCover'], ['Persiana', 'fkFamBlind'],
        ['Sombra', 'fkFamShadow'], ['Parpadeo', 'fkFamFlash'], ['Extender', 'fkFamExtend'], ['Sector', 'fkFamSector'],
    ];
    const FK_KIND = { printer: ['fkKind3d', 'k3d'], laser: ['fkKindLaser', 'klaser'], cnc: ['fkKindCnc', 'kcnc'] };
    const FK_MINUTES = [1, 5, 15, 60];
    // Pastilla de conexión del encabezado: [clave, clase del pill del plugin].
    const FK_CONN = {
        ok: ['fkConnOk', 'mled-status-ok'],
        unreachable: ['fkConnUnreachable', 'mled-status-warn'],
        size_mismatch: ['fkConnSizeMismatch', 'mled-status-warn'],
        disabled: ['fkConnDisabled', 'mled-status-off'],
    };
    // Ciclo de las tarjetas de efecto: pausa, entra, se queda, vuelve (ms).
    const FK_FX_CYCLE = [700, 1200, 1300, 1200];
    const FK_BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
    // Orilla del panel en sentido horario (220 LEDs), para dibujar el marco.
    const FK_RING = [];
    for (let x = 0; x < FK_W; x += 1) FK_RING.push([x, 0]);
    for (let y = 1; y < FK_H; y += 1) FK_RING.push([FK_W - 1, y]);
    for (let x = FK_W - 2; x >= 0; x -= 1) FK_RING.push([x, FK_H - 1]);
    for (let y = FK_H - 2; y > 0; y -= 1) FK_RING.push([0, y]);

    const fk = {
        status: null,
        statusError: false,
        config: null,
        known: [],              // máquinas conocidas (GET /fk8wa/machines)
        machinesDraft: [],
        effects: null,          // catálogo (GET /fk8wa/effects)
        isAdmin: false,
        roleLoaded: false,
        timer: null,
        // Firma de lo que muestra el panel: /frames (sin parámetros) solo se
        // vuelve a pedir cuando cambia, no en cada consulta de /status.
        framesSig: null,
        framesData: null,
        minutes: 5,
        msgTimer: null,
        msgExpiredAt: null,
        brightness: 8,
        led: null,
        fxFamily: 'all',
        fxTarget: 'all',
        fxFrames: null,         // cuadros A y B de la galería de efectos
        fxCards: [],
        minis: [],
        sitFrames: {},          // dibujos de las fichas por situación, por URL
        gallery: [],
        galleryStale: true,
        minisStale: true,
        paused: true,
        raf: null,
        lastTick: 0,
        dragFrom: null,
        mp: { token: 0, raf: null, timer: null, ringTimer: null, tick: 0, cur: null, marco: null, pattern: 'dash', data: null, scroll: null, canvas: null, index: 0, count: 0 },
        scroll: { payload: null, dir: 'l1', level: 5, timer: null, player: null },
    };

    let fkHelpSeq = 0;

    function fkScreenLabel(name) { return FK_SCREEN_KEYS[name] ? tr(FK_SCREEN_KEYS[name]) : String(name ?? '—'); }

    function fkReduceMotion() {
        return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    }

    // Nombre del efecto: el diccionario del idioma (fkEffect_<id>) y, si
    // falta, el que manda el servidor (en español).
    function fkEffectLabel(id, fallback) {
        const dict = I18N[lang()] || {};
        return dict[`fkEffect_${id}`] || fallback || String(id);
    }

    function fkFamilyLabel(family) {
        const found = FK_FAMILIES.find(([name]) => name === family);
        return found ? tr(found[1]) : String(family);
    }

    // api() lanza Error(JSON.stringify(detail)): se quita el entrecomillado
    // de JSON cuando el detail es un string simple.
    function fkErrorText(error) {
        const raw = error?.message || '';
        try {
            const parsed = JSON.parse(raw);
            return typeof parsed === 'string' ? parsed : raw;
        } catch {
            return raw || tr('genericError');
        }
    }

    function fkSetMsg(selector, text, kind) {
        const el = root?.querySelector(selector);
        if (!el) return;
        el.textContent = text || '';
        el.className = 'mled-inline-msg';
        if (kind === 'ok') el.classList.add('mled-inline-msg-ok');
        if (kind === 'error') el.classList.add('mled-inline-msg-error');
    }

    // Solo hay red y animación mientras esta pestaña está elegida, la
    // sección del plugin está en pantalla (el core la oculta con
    // display:none al cambiar de sección) y la pestaña del navegador se ve.
    function fkIsVisible() {
        return !!root && state.view === 'fk8wa' && document.visibilityState !== 'hidden' && root.getClientRects().length > 0;
    }

    function fkOnScreen(canvas) {
        if (!canvas) return false;
        const rect = canvas.getBoundingClientRect();
        return rect.width > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
    }

    // ── Dibujo LED por LED ──
    function fkDecode(b64) {
        try {
            return Uint8Array.from(atob(b64 || ''), (char) => char.charCodeAt(0));
        } catch {
            return new Uint8Array(FK_W * FK_H / 8);
        }
    }

    const fkBlank = () => new Uint8Array(FK_W * FK_H / 8);

    // 1 bit por LED, bit de menor peso primero, 12 bytes por fila.
    function fkPx(bytes, x, y) {
        if (!bytes || x < 0 || x >= FK_W || y < 0 || y >= FK_H) return 0;
        return (bytes[y * 12 + (x >> 3)] >> (x & 7)) & 1;
    }

    function fkBuild(fn) {
        const out = new Uint8Array(FK_W * FK_H / 8);
        for (let y = 0; y < FK_H; y += 1) {
            for (let x = 0; x < FK_W; x += 1) {
                if (fn(x, y)) out[y * 12 + (x >> 3)] |= 1 << (x & 7);
            }
        }
        return out;
    }

    function fkSameBytes(a, b) {
        if (!a || !b || a.length !== b.length) return false;
        for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
        return true;
    }

    // Colores del LED físico (blanco sobre negro): vienen de las variables
    // --mled-fk-led-* del CSS, no del tema.
    function fkLedColors() {
        if (!fk.led) {
            const view = root?.querySelector('#mled-view-fk8wa');
            const styles = view ? getComputedStyle(view) : null;
            fk.led = {
                on: styles?.getPropertyValue('--mled-fk-led-on').trim() || '255, 255, 255',
                off: styles?.getPropertyValue('--mled-fk-led-off').trim() || '38, 40, 44',
            };
        }
        return fk.led;
    }

    function fkPatternBits(name) {
        return (FK_PATTERNS.find(([key]) => key === name) || FK_PATTERNS[0])[2];
    }

    // Aproximación del marco que anima el panel (marco_*): el panel lo hace
    // solo; aquí basta con que se parezca.
    function fkBorderOverlay(style, patternName, tick) {
        const bits = fkPatternBits(patternName);
        const total = FK_RING.length;
        const kind = String(style || '').replace(/^marco_/, '');
        const dir = kind.endsWith('ccw') ? -1 : 1;
        const pat = (i, shift) => bits[(((i - shift) % bits.length) + bits.length) % bits.length];
        const lit = new Uint8Array(total);
        if (kind === 'fixed') {
            for (let i = 0; i < total; i += 1) lit[i] = pat(i, 0);
        } else if (kind === 'random') {
            for (let i = 0; i < total; i += 1) lit[i] = Math.random() < 0.5 ? 1 : 0;
        } else if (kind === 'cw' || kind === 'ccw') {
            for (let i = 0; i < total; i += 1) lit[i] = pat(i, dir * tick);
        } else if (kind === 'flash') {
            if (tick % 2 === 0) for (let i = 0; i < total; i += 1) lit[i] = pat(i, 0);
        } else if (kind === 'flash_cw' || kind === 'flash_ccw') {
            if (Math.floor(tick / 6) % 2 === 0) for (let i = 0; i < total; i += 1) lit[i] = pat(i, dir * tick);
        } else if (kind.startsWith('line') || kind.startsWith('dline')) {
            const heads = kind.startsWith('dline') ? [0, total / 2] : [0];
            heads.forEach((head) => {
                const start = (((head + dir * tick * 2) % total) + total) % total;
                for (let k = 0; k < 24; k += 1) lit[(start - dir * k + total * 2) % total] = pat(k, 0);
            });
        }
        const overlay = new Uint8Array(FK_W * FK_H);
        lit.forEach((value, i) => {
            if (value) {
                const [x, y] = FK_RING[i];
                overlay[y * FK_W + x] = 1;
            }
        });
        return overlay;
    }

    function fkDraw(canvas, bytes, overlay, square) {
        const ctx = canvas?.getContext('2d');
        if (!ctx) return;
        const { on, off } = fkLedColors();
        const cell = canvas.width / FK_W;
        const alpha = 0.35 + 0.65 * (fk.brightness / 16);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (let y = 0; y < FK_H; y += 1) {
            for (let x = 0; x < FK_W; x += 1) {
                const isOn = fkPx(bytes, x, y) || (overlay && overlay[y * FK_W + x]);
                if (square) {
                    const size = cell - (cell > 2 ? 0.6 : 0);
                    ctx.fillStyle = isOn ? `rgba(${on}, ${alpha})` : `rgba(${off}, 0.55)`;
                    ctx.fillRect(x * cell, y * cell, size, size);
                } else {
                    ctx.beginPath();
                    ctx.arc(x * cell + cell / 2, y * cell + cell / 2, cell * 0.38, 0, Math.PI * 2);
                    ctx.fillStyle = isOn ? `rgba(${on}, ${alpha})` : `rgba(${off}, 0.6)`;
                    ctx.shadowBlur = isOn ? cell * 0.9 : 0;
                    ctx.shadowColor = `rgba(${on}, ${alpha * 0.8})`;
                    ctx.fill();
                }
            }
        }
        ctx.shadowBlur = 0;
    }

    // border_speed 1..60: menor = más rápido (igual que el panel). La barra de la pestaña lo muestra al revés
    // (derecha = más rápido), por eso este cambio de sentido de ida y vuelta.
    function fkBorderSpeedFlip(value) { return 61 - Math.max(1, Math.min(60, Number(value) || 10)); }
    function fkRingInterval(speed) {
        return Math.max(60, 20 + (Number(speed) || 10) * 15);
    }

    // ── Efectos de entrada (aproximados; el panel real los anima él solo) ──
    // type/sub son los números de la tabla de FKShow que manda /effects:
    // 2 desplazar, 3 cubrir, 4 entrar, 5 persiana, 6 sombra, 7 parpadeo,
    // 19 extender, 21 sector. t va de 0 a 1.
    function fkEffectFrame(type, sub, a, b, t) {
        const W = FK_W;
        const H = FK_H;
        const W2 = W / 2;
        const H2 = H / 2;
        t = Math.max(0, Math.min(1, t));
        if (t >= 1 && type !== 7) return b;
        switch (type) {
            case 2: {
                const ox = Math.round(t * W);
                const oy = Math.round(t * H);
                if (sub === 1) return fkBuild((x, y) => (x < W - ox ? fkPx(a, x + ox, y) : fkPx(b, x - (W - ox), y)));
                if (sub === 2) return fkBuild((x, y) => (x >= ox ? fkPx(a, x - ox, y) : fkPx(b, x + (W - ox), y)));
                if (sub === 3) return fkBuild((x, y) => (y < H - oy ? fkPx(a, x, y + oy) : fkPx(b, x, y - (H - oy))));
                if (sub === 4) return fkBuild((x, y) => (y >= oy ? fkPx(a, x, y - oy) : fkPx(b, x, y + (H - oy))));
                return fkBuild((x, y) => fkPx(b, (x + ox) % W, y));
            }
            case 3:
                if (sub === 1) return fkBuild((x, y) => (x < t * W ? fkPx(b, x, y) : fkPx(a, x, y)));
                if (sub === 2) return fkBuild((x, y) => (x >= W - t * W ? fkPx(b, x, y) : fkPx(a, x, y)));
                if (sub === 3) return fkBuild((x, y) => ((x < t * W2 || x >= W - t * W2) ? fkPx(b, x, y) : fkPx(a, x, y)));
                if (sub === 4) return fkBuild((x, y) => (Math.abs(x + 0.5 - W2) < t * W2 ? fkPx(b, x, y) : fkPx(a, x, y)));
                if (sub === 5) return fkBuild((x, y) => (y < t * H ? fkPx(b, x, y) : fkPx(a, x, y)));
                return fkBuild((x, y) => (y >= H - t * H ? fkPx(b, x, y) : fkPx(a, x, y)));
            case 4: {
                const s = Math.round(t * W);
                const v = Math.round(t * H);
                if (sub === 1) return fkBuild((x, y) => (x < s ? fkPx(b, x + (W - s), y) : fkPx(a, x, y)));
                if (sub === 2) return fkBuild((x, y) => (x >= W - s ? fkPx(b, x - (W - s), y) : fkPx(a, x, y)));
                if (sub === 3) return fkBuild((x, y) => (y < v ? fkPx(b, x, y + (H - v)) : fkPx(a, x, y)));
                if (sub === 4) return fkBuild((x, y) => (y >= H - v ? fkPx(b, x, y - (H - v)) : fkPx(a, x, y)));
                if (sub === 5) {
                    const h = Math.round(t * W2);
                    return fkBuild((x, y) => (x < h ? fkPx(b, x + (W2 - h), y) : x >= W - h ? fkPx(b, x - (W - h) + W2, y) : fkPx(a, x, y)));
                }
                if (sub === 6) {
                    const h = Math.round(t * H2);
                    return fkBuild((x, y) => (y < h ? fkPx(b, x, y + (H2 - h)) : y >= H - h ? fkPx(b, x, y - (H - h) + H2) : fkPx(a, x, y)));
                }
                return fkBuild((x, y) => ((Math.abs(x + 0.5 - W2) < t * W2 && Math.abs(y + 0.5 - H2) < t * H2) ? fkPx(b, x, y) : fkPx(a, x, y)));
            }
            case 5:
                if (sub === 1) return fkBuild((x, y) => ((y % 4) < t * 4 ? fkPx(b, x, y) : fkPx(a, x, y)));
                if (sub === 2) return fkBuild((x, y) => ((x % 8) < t * 8 ? fkPx(b, x, y) : fkPx(a, x, y)));
                return fkBuild((x, y) => (((y % 4) < t * 4 && (x % 8) < t * 8) ? fkPx(b, x, y) : fkPx(a, x, y)));
            case 6: {
                const g = (x, y) => (sub === 1 ? x / W : sub === 2 ? 1 - x / W : sub === 3 ? y / H : 1 - y / H);
                return fkBuild((x, y) => ((t * 1.6 - g(x, y) * 0.6) > (FK_BAYER[y & 3][x & 3] + 0.5) / 16 ? fkPx(b, x, y) : fkPx(a, x, y)));
            }
            case 7: {
                const k = Math.floor(t * 8);
                if (t >= 1 || k % 2 === 1) return b;
                if (sub === 1) return fkBlank();
                if (sub === 2) return fkBuild((x, y) => !fkPx(b, x, y));
                return fkBuild((x, y) => fkPx(b, x, y) && !(fkPx(b, x - 1, y) && fkPx(b, x + 1, y) && fkPx(b, x, y - 1) && fkPx(b, x, y + 1)));
            }
            case 19: {
                const s = Math.max(0.04, t);
                if (sub === 1) return fkBuild((x, y) => (x >= W - W * s ? fkPx(b, Math.floor((x - (W - W * s)) / s), y) : fkPx(a, x, y)));
                if (sub === 2) return fkBuild((x, y) => (x < W * s ? fkPx(b, Math.floor(x / s), y) : fkPx(a, x, y)));
                if (sub === 3) return fkBuild((x, y) => (y >= H - H * s ? fkPx(b, x, Math.floor((y - (H - H * s)) / s)) : fkPx(a, x, y)));
                return fkBuild((x, y) => (y < H * s ? fkPx(b, x, Math.floor(y / s)) : fkPx(a, x, y)));
            }
            case 21:
                return fkBuild((x, y) => {
                    const dx = (x + 0.5 - W2) / W2;
                    const dy = (y + 0.5 - H2) / H2;
                    const d = Math.hypot(dx, dy) / Math.SQRT2;
                    let ang = Math.atan2(dx, -dy);
                    if (ang < 0) ang += 2 * Math.PI;
                    const f = ang / (2 * Math.PI);
                    const show = sub === 1 ? f < t : sub === 2 ? (1 - f) < t : sub === 3 ? d >= 1 - t : d < t;
                    return show ? fkPx(b, x, y) : fkPx(a, x, y);
                });
            default:
                return b;
        }
    }

    // ── Texto corrido (mensajes largos) ──
    // El servidor manda la tira ya dibujada (strip: 16 filas, bit de menor
    // peso primero, ceil(width/8) bytes por fila) y las páginas de dos
    // renglones para subir o bajar. Velocidad: 8 píxeles por segundo por
    // nivel (1 lento ... 10 rápido).
    function fkStripOf(payload) {
        if (!payload) return null;
        if (!payload.stripCache) {
            const width = Math.max(1, Number(payload.strip?.width) || 1);
            payload.stripCache = { w: width, stride: Math.ceil(width / 8), data: fkDecode(payload.strip?.data) };
        }
        return payload.stripCache;
    }

    function fkPagesOf(payload) {
        if (!payload.pagesCache) payload.pagesCache = (payload.pages || []).map(fkDecode);
        return payload.pagesCache;
    }

    function fkStripBit(strip, sx, y) {
        if (sx < 0 || sx >= strip.w) return 0;
        return (strip.data[y * strip.stride + (sx >> 3)] >> (sx & 7)) & 1;
    }

    function fkStripFrame(strip, ox) {
        return fkBuild((x, y) => fkStripBit(strip, x - ox, y));
    }

    function fkScrollFrame(payload, level, dir, seconds, still) {
        const strip = fkStripOf(payload);
        const speed = 8 * Math.max(1, Math.min(10, Number(level) || 5));
        if (dir === 'u' || dir === 'd') {
            const pages = fkPagesOf(payload);
            if (!pages.length) return fkBlank();
            if (pages.length === 1 || still) return pages[0];
            const hold = Math.max(0.8, (2600 - 150 * Math.max(1, Math.min(10, Number(level) || 5))) / 1000);
            const move = 0.7;
            const per = hold + move;
            const index = Math.floor(seconds / per) % pages.length;
            const within = seconds % per;
            const from = pages[index];
            const to = pages[(index + 1) % pages.length];
            return within < hold ? from : fkEffectFrame(2, dir === 'u' ? 3 : 4, from, to, (within - hold) / move);
        }
        if (!strip) return fkBlank();
        if (payload.static || strip.w <= 92) return fkStripFrame(strip, Math.floor((FK_W - strip.w) / 2));
        if (still) return fkStripFrame(strip, 1);
        if (dir === 'l') {
            const period = strip.w + 40;
            const offset = Math.floor(seconds * speed) % period;
            return fkBuild((x, y) => fkStripBit(strip, (x + offset) % period, y));
        }
        const travel = (FK_W + strip.w) / speed;
        const cycle = travel + 0.8;
        const within = seconds % cycle;
        if (within > travel) return fkBlank();
        const moved = within * speed;
        return fkStripFrame(strip, dir === 'r' ? Math.round(moved - strip.w) : Math.round(FK_W - moved));
    }

    // Reproductor del texto corrido: getState() -> {payload, level, dir}.
    // Solo dibuja cuando el canvas se ve en pantalla.
    function fkScroller(canvas, getState) {
        let raf = null;
        let t0 = 0;
        const frameOf = (seconds, still) => {
            const current = getState();
            return current?.payload ? fkScrollFrame(current.payload, current.level, current.dir, seconds, still) : fkBlank();
        };
        const player = {
            paintStill() { fkDraw(canvas, frameOf(0, true), null, false); },
            start() {
                player.stop();
                if (fkReduceMotion()) { player.paintStill(); return; }
                t0 = performance.now();
                const loop = (now) => {
                    raf = window.requestAnimationFrame(loop);
                    if (fkOnScreen(canvas)) fkDraw(canvas, frameOf((now - t0) / 1000, false), null, false);
                };
                raf = window.requestAnimationFrame(loop);
            },
            stop() {
                if (raf) window.cancelAnimationFrame(raf);
                raf = null;
            },
        };
        return player;
    }

    // ── Vista principal ("Así se ve tu panel ahora") ──
    function fkMainPaint(bytes) {
        const mp = fk.mp;
        mp.cur = bytes;
        const overlay = mp.marco ? fkBorderOverlay(mp.marco, mp.pattern, mp.tick) : null;
        fkDraw(mp.canvas, bytes, overlay, false);
    }

    function fkMainStop() {
        const mp = fk.mp;
        mp.token += 1;
        if (mp.raf) window.cancelAnimationFrame(mp.raf);
        window.clearTimeout(mp.timer);
        window.clearInterval(mp.ringTimer);
        mp.scroll?.stop();
        mp.raf = null;
        mp.timer = null;
        mp.ringTimer = null;
        mp.scroll = null;
    }

    function fkTransition(effect, from, to, ms, done, token) {
        const mp = fk.mp;
        const t0 = performance.now();
        const step = (now) => {
            if (token !== mp.token) return;
            const t = (now - t0) / ms;
            if (t >= 1) { fkMainPaint(to); done(); return; }
            fkMainPaint(fkEffectFrame(effect.type, effect.subtype, from, to, t));
            mp.raf = window.requestAnimationFrame(step);
        };
        step(t0);
    }

    // Reproduce lo que manda /frames: páginas en ciclo con stay_ms y, si hay
    // efecto, primero la transición desde el último cuadro dibujado (from).
    function fkMainStart(data, from) {
        fkMainStop();
        const mp = fk.mp;
        mp.data = data;
        if (!data || !mp.canvas) return;
        const token = mp.token;
        const still = fk.paused || fkReduceMotion();
        mp.tick = 0;
        mp.pattern = fk.config?.border_pattern || 'dash';
        if (data.scroll) {
            mp.marco = null;
            const scroller = fkScroller(mp.canvas, () => ({ payload: data.scroll, level: data.scroll.level, dir: data.scroll.dir }));
            mp.scroll = scroller;
            if (fk.paused) return;
            scroller.start();
            return;
        }
        mp.marco = data.marco ? String(data.style || 'marco_cw') : null;
        const pages = (data.pages || []).map(fkDecode);
        if (!pages.length) { fkMainPaint(fkBlank()); return; }
        if (mp.marco && !still) {
            mp.ringTimer = window.setInterval(() => { mp.tick += 1; fkMainPaint(mp.cur); }, fkRingInterval(data.border_speed));
        }
        let index = 0;
        const cycle = () => {
            if (token !== mp.token) return;
            fkMainPaint(pages[index]);
            mp.index = index;
            mp.count = pages.length;
            fkHighlightView(index, pages.length);
            if (!still && pages.length > 1 && Number(data.stay_ms) > 0) {
                mp.timer = window.setTimeout(() => { index = (index + 1) % pages.length; cycle(); }, Number(data.stay_ms));
            }
        };
        if (data.effect && !still && from) fkTransition(data.effect, from, pages[0], FK_EFFECT_MS, cycle, token);
        else cycle();
    }

    // ── Rol ──
    async function fkLoadRole() {
        try {
            const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
            const user = response.ok ? await response.json() : null;
            fk.isAdmin = user?.role === 'admin';
        } catch {
            fk.isAdmin = false;
        }
        fk.roleLoaded = true;
        fkApplyRole();
    }

    function fkApplyRole() {
        if (!root) return;
        root.querySelectorAll('[data-fk-admin-input]').forEach((el) => { el.disabled = !fk.isAdmin; });
        root.querySelectorAll('[data-fk-admin-only]').forEach((el) => { el.hidden = !fk.isAdmin; });
        const note = root.querySelector('#mled-fk-readonly');
        if (note) note.hidden = fk.isAdmin || !fk.roleLoaded;
        fkRenderMachines();
        fkRenderSit();
        fkRenderFx();
    }

    // ── Estado ──
    function fkFramesSignature(status) {
        return JSON.stringify([status?.views || [], status?.current || null, status?.last_sent_at || null]);
    }

    async function fkRefreshStatus({ forceFrames = false } = {}) {
        try {
            fk.status = await api('/fk8wa/status');
            fk.statusError = false;
        } catch {
            fk.statusError = true;
        }
        tabFkState = fk.statusError ? 'error' : fk.status?.state;
        fkRenderStatus();
        fkRenderMessage();
        refreshTabCards();
        if (!fk.statusError) fkMaybeReloadFrames(forceFrames);
    }

    async function fkMaybeReloadFrames(force = false, from = null) {
        const sig = fkFramesSignature(fk.status);
        if (!force && sig === fk.framesSig) return;
        fk.framesSig = sig;
        let data;
        try {
            data = await api('/fk8wa/frames');
        } catch {
            fk.framesSig = null;   // se reintenta en la siguiente consulta
            return;
        }
        fk.framesData = data;
        fkRenderNow();
        fkMainStart(data, from || fk.mp.cur);
    }

    function fkRenderStatus() {
        if (!root) return;
        const s = fk.status || {};
        const conn = root.querySelector('#mled-fk-conn');
        const [connKey, connClass] = fk.statusError ? ['fkConnChecking', 'mled-status-off'] : (FK_CONN[s.state] || ['fkConnChecking', 'mled-status-off']);
        conn.classList.remove('mled-status-ok', 'mled-status-warn', 'mled-status-off');
        conn.classList.add(connClass);
        root.querySelector('#mled-fk-conn-text').textContent = tr(connKey);

        const alert = root.querySelector('#mled-fk-alert');
        if (fk.statusError) {
            alert.textContent = tr('fkLoadError');
            alert.hidden = false;
        } else if (s.state === 'size_mismatch') {
            const size = s.panel ? `${s.panel.width}×${s.panel.height}` : '?';
            alert.textContent = tr('fkSizeMismatch', { size });
            alert.hidden = false;
        } else {
            alert.hidden = true;
        }

        const missing = Array.isArray(s.missing_machines) ? s.missing_machines : [];
        const missingEl = root.querySelector('#mled-fk-missing');
        missingEl.textContent = missing.length ? tr('fkMissingMachines', { ids: missing.join(', ') }) : '';
        missingEl.hidden = !missing.length;

        root.querySelectorAll('[data-fk-prio]').forEach((el) => {
            const isOn = el.dataset.fkPrio === s.priority;
            el.classList.toggle('is-on', isOn);
            if (isOn) el.setAttribute('aria-current', 'step');
            else el.removeAttribute('aria-current');
        });
        fkSyncSitNow();
        fkRenderNow();
    }

    function fkDuration(seconds) {
        const value = Math.round(Number(seconds));
        if (value >= 60 && value % 60 === 0) return tr('fkMinutesShort', { n: value / 60 });
        return tr('fkSecondsShort', { n: value });
    }

    function fkViewText(view) {
        const seconds = view?.seconds == null ? null : Number(view.seconds);
        const duration = seconds == null || !Number.isFinite(seconds) ? tr('fkViewFixed') : fkDuration(seconds);
        return `${fkScreenLabel(view?.screen)} · ${duration}`;
    }

    function fkClockNote(views) {
        if (!views.some((view) => view?.seconds)) return '';
        const style = fk.framesData?.style || fk.config?.timer_style || 'contorno';
        if (style === 'ninguno') return '';
        if (style.startsWith('marco_')) return tr('fkClockMarco');
        return style === 'barra' ? tr('fkClockBarra') : tr('fkClockContorno');
    }

    function fkCurrentViews() {
        const views = fk.status?.views;
        return Array.isArray(views) && views.length ? views : (Array.isArray(fk.framesData?.views) ? fk.framesData.views : []);
    }

    function fkRenderNow() {
        const nowEl = root?.querySelector('#mled-fk-now');
        if (!nowEl) return;
        const views = fkCurrentViews();
        const keys = FK_NOW_KEYS[fk.status?.current];
        nowEl.innerHTML = keys
            ? `<strong>${esc(tr(keys[0]))}</strong> ${esc(tr(keys[1], { clock: fkClockNote(views) }))}`
            : `<strong>${esc(tr('fkNowWaitingTitle'))}</strong>`;
        root.querySelector('#mled-fk-views').innerHTML = views
            .map((view, index) => `<span class="mled-fk-view-chip${views.length === 1 ? ' is-on' : ''}" data-fk-view="${index}">${esc(fkViewText(view))}</span>`)
            .join('');
        fkHighlightView(fk.mp.index, fk.mp.count);
    }

    // Las páginas se reparten parejo entre las vistas (timer.build_pages):
    // se ilumina la vista a la que pertenece la página que se ve ahora.
    function fkHighlightView(pageIndex, pageCount) {
        const chips = root?.querySelectorAll('[data-fk-view]') || [];
        if (chips.length < 2) return;
        const perView = Math.max(1, (pageCount || 1) / chips.length);
        const active = Math.min(chips.length - 1, Math.floor((pageIndex || 0) / perView));
        chips.forEach((chip, i) => chip.classList.toggle('is-on', i === active));
    }

    // ── Mensaje ──
    function fkRenderAnnouncementOptions() {
        const select = root?.querySelector('#mled-fk-ann');
        if (!select) return;
        const selected = select.value;
        select.innerHTML = `<option value="">${esc(tr('fkAnnChoose'))}</option>`
            + state.announcements.map((item) => `<option value="${esc(item.id)}">${esc(item.name || item.id)}</option>`).join('');
        if (state.announcements.some((item) => item.id === selected)) select.value = selected;
    }

    function fkStopMessageTimer() {
        if (fk.msgTimer) { window.clearInterval(fk.msgTimer); fk.msgTimer = null; }
    }

    function fkRenderMessage() {
        const box = root?.querySelector('#mled-fk-current');
        if (!box) return;
        fkStopMessageTimer();
        const message = fk.status?.message;
        if (!message?.text) {
            box.hidden = true;
            box.innerHTML = '';
            return;
        }
        box.hidden = false;
        box.innerHTML = `<span>${esc(tr('fkMsgOnPanel'))} <strong class="mled-fk-mono"></strong></span>`
            + '<span class="mled-fk-muted" data-fk-countdown></span>'
            + `<button type="button" class="mled-btn mled-btn-small" data-fk-msg-clear>${esc(tr('fkMsgClear'))}</button>`;
        box.querySelector('strong').textContent = message.text;
        box.querySelector('[data-fk-msg-clear]').addEventListener('click', fkClearMessage);
        const expiresAt = Number(message.expires_at);
        const countdown = box.querySelector('[data-fk-countdown]');
        const paint = () => {
            if (!Number.isFinite(expiresAt)) { countdown.textContent = ''; return false; }
            const left = Math.max(0, Math.round(expiresAt - Date.now() / 1000));
            const minutes = Math.floor(left / 60);
            const seconds = String(left % 60).padStart(2, '0');
            countdown.textContent = tr('fkMsgRemovesIn', { time: `${minutes}:${seconds}` });
            if (left === 0) {
                fkStopMessageTimer();
                // Una sola consulta por mensaje vencido (por si el reloj del
                // navegador y el del servidor no coinciden).
                if (fk.msgExpiredAt !== expiresAt) { fk.msgExpiredAt = expiresAt; fkRefreshStatus(); }
                return false;
            }
            return true;
        };
        if (paint()) fk.msgTimer = window.setInterval(paint, 1000);
    }

    function fkSyncMinutes() {
        root.querySelectorAll('[data-fk-minutes]').forEach((button) => {
            button.setAttribute('aria-pressed', String(Number(button.dataset.fkMinutes) === fk.minutes));
        });
    }

    async function fkSendMessage(useAnnouncement) {
        let body;
        if (useAnnouncement) {
            const announcementId = root.querySelector('#mled-fk-ann').value;
            if (!announcementId) { fkSetMsg('#mled-fk-msg-status', tr('fkAnnMissing'), 'error'); return; }
            body = { announcement_id: announcementId, minutes: fk.minutes };
        } else {
            const text = root.querySelector('#mled-fk-msg-text').value.trim();
            if (!text) { fkSetMsg('#mled-fk-msg-status', tr('fkMsgMissing'), 'error'); return; }
            body = { text, minutes: fk.minutes };
        }
        fkSetMsg('#mled-fk-msg-status', tr('fkSending'));
        try {
            const result = await api('/fk8wa/message', { method: 'POST', body: JSON.stringify(body) });
            fk.status = { ...(fk.status || {}), message: result.message };
            fkRenderMessage();
            if (!useAnnouncement) root.querySelector('#mled-fk-msg-text').value = '';
            fkSetMsg('#mled-fk-msg-status', tr('fkMsgSent'), 'ok');
            fkRefreshStatus();
        } catch (error) {
            fkSetMsg('#mled-fk-msg-status', tr('fkMsgFail', { detail: fkErrorText(error) }), 'error');
        }
    }

    async function fkClearMessage() {
        try {
            await api('/fk8wa/message', { method: 'DELETE' });
            fk.status = { ...(fk.status || {}), message: null };
            fkRenderMessage();
            fkSetMsg('#mled-fk-msg-status', tr('fkMsgCleared'), 'ok');
            fkRefreshStatus();
        } catch (error) {
            fkSetMsg('#mled-fk-msg-status', tr('fkMsgFail', { detail: fkErrorText(error) }), 'error');
        }
    }

    // ── Configuración ──
    // Guarda la config completa con algunos campos cambiados (PUT pide el
    // objeto entero). Solo admin; el backend valida y responde 400 si no.
    async function fkSavePartial(overrides, msgSelector) {
        if (!fk.isAdmin || !fk.config) return false;
        fkSetMsg(msgSelector, tr('fkSaving'));
        try {
            fk.config = await api('/fk8wa/config', { method: 'PUT', body: JSON.stringify({ ...fk.config, ...overrides }) });
            fkSetMsg(msgSelector, tr('fkSaved'), 'ok');
            return true;
        } catch (error) {
            fkSetMsg(msgSelector, tr('fkSaveFail', { detail: fkErrorText(error) }), 'error');
            return false;
        }
    }

    function fkNumber(selector) {
        const raw = root.querySelector(selector).value.trim();
        return raw === '' ? null : Number(raw);
    }

    async function fkLoadConfig() {
        try {
            fk.config = await api('/fk8wa/config');
        } catch (error) {
            fkSetMsg('#mled-fk-conn-msg', tr('fkSaveFail', { detail: fkErrorText(error) }), 'error');
            return;
        }
        fk.machinesDraft = Array.isArray(fk.config.machines) ? [...fk.config.machines] : [];
        fk.brightness = Number(fk.config.brightness) || 8;
        fk.scroll.dir = fk.config.scroll_dir || 'l1';
        fk.scroll.level = Number(fk.config.scroll_speed) || 5;
        fk.mp.pattern = fk.config.border_pattern || 'dash';
        fkFillConnForm();
        fkFillBrightness();
        fkSyncScrollControls();
        fkRenderMachines();
        fkRenderSit();
        fkRepaintAll();
    }

    function fkFillConnForm() {
        const c = fk.config;
        if (!c || !root) return;
        root.querySelector('#mled-fk-ip').value = c.ip || '';
        root.querySelector('#mled-fk-view-seconds').value = c.view_seconds ?? '';
        root.querySelector('#mled-fk-done-seconds').value = c.done_seconds ?? '';
        root.querySelector('#mled-fk-min-interval').value = c.min_interval_s ?? '';
        root.querySelector('#mled-fk-enabled').checked = !!c.enabled;
    }

    function fkFillBrightness() {
        root.querySelector('#mled-fk-bright').value = fk.brightness;
        root.querySelector('#mled-fk-bright-val').textContent = String(fk.brightness);
    }

    async function fkSaveConnection() {
        const button = root.querySelector('#mled-fk-save-btn');
        button.disabled = true;
        const saved = await fkSavePartial({
            ip: root.querySelector('#mled-fk-ip').value.trim(),
            view_seconds: fkNumber('#mled-fk-view-seconds'),
            done_seconds: fkNumber('#mled-fk-done-seconds'),
            min_interval_s: fkNumber('#mled-fk-min-interval'),
            enabled: root.querySelector('#mled-fk-enabled').checked,
        }, '#mled-fk-conn-msg');
        button.disabled = false;
        if (saved) {
            fkFillConnForm();
            fkRefreshStatus({ forceFrames: true });
        }
    }

    async function fkTestConnection() {
        const button = root.querySelector('#mled-fk-test-btn');
        const out = root.querySelector('#mled-fk-test-msg');
        button.disabled = true;
        fkSetMsg('#mled-fk-test-msg', tr('fkTesting'));
        out.removeAttribute('title');
        try {
            const result = await api('/fk8wa/test', { method: 'POST' });
            const rightSize = Number(result.width) === FK_W && Number(result.height) === FK_H;
            fkSetMsg('#mled-fk-test-msg', tr(rightSize ? 'fkTestOk' : 'fkTestWrongSize', {
                width: result.width ?? '?', height: result.height ?? '?',
            }), rightSize ? 'ok' : 'error');
        } catch (error) {
            fkSetMsg('#mled-fk-test-msg', tr('fkTestFail'), 'error');
            out.title = fkErrorText(error);   // el detalle técnico queda en el globo del navegador
        } finally {
            button.disabled = false;
            fkRefreshStatus();
        }
    }

    // El deslizador aclara/oscurece el dibujo mientras se mueve; al soltarlo
    // se aplica al panel (POST /fk8wa/brightness, que también lo guarda).
    async function fkApplyBrightness() {
        if (!fk.isAdmin) return;
        const level = Number(root.querySelector('#mled-fk-bright').value);
        fkSetMsg('#mled-fk-bright-msg', tr('fkSaving'));
        try {
            fk.config = await api('/fk8wa/brightness', { method: 'POST', body: JSON.stringify({ level }) });
            fkSetMsg('#mled-fk-bright-msg', tr('fkBrightNote'), 'ok');
        } catch (error) {
            fkSetMsg('#mled-fk-bright-msg', tr('fkSaveFail', { detail: fkErrorText(error) }), 'error');
        }
    }

    // ── Máquinas en el panel ──
    async function fkReloadMachines() {
        try {
            ({ machines: fk.known } = await api('/fk8wa/machines'));
        } catch {
            fk.known = [];
        }
    }

    function fkRenderMachines() {
        const list = root?.querySelector('#mled-fk-machines');
        if (!list) return;
        if (!fk.machinesDraft.length) {
            list.innerHTML = `<li class="mled-fk-empty">${esc(tr('fkMachEmpty'))}</li>`;
        } else {
            const last = fk.machinesDraft.length - 1;
            list.innerHTML = fk.machinesDraft.map((id, index) => {
                const machine = fk.known.find((item) => item.id === id);
                const label = machine ? machine.name : tr('fkMachMissing', { id });
                const kind = FK_KIND[machine?.kind] || null;
                const short = machine ? machine.short : (fk.config?.short_names?.[id] || '');
                const controls = fk.isAdmin ? `
                    <span class="mled-fk-machine-actions">
                        <button type="button" data-fk-move="-1" data-fk-index="${index}" ${index === 0 ? 'disabled' : ''} aria-label="${esc(tr('fkMachUp', { name: label }))}">↑</button>
                        <button type="button" data-fk-move="1" data-fk-index="${index}" ${index === last ? 'disabled' : ''} aria-label="${esc(tr('fkMachDown', { name: label }))}">↓</button>
                        <button type="button" data-fk-remove="${index}" aria-label="${esc(tr('fkMachRemove', { name: label }))}">×</button>
                    </span>` : '';
                return `<li class="mled-fk-machine${machine ? '' : ' is-missing'}" data-fk-index="${index}" ${fk.isAdmin ? 'draggable="true"' : ''}>`
                    + `<span class="mled-fk-grip" aria-hidden="true">${fk.isAdmin ? '⋮⋮' : ''}</span>`
                    + (kind ? `<span class="mled-fk-badge ${kind[1]}">${esc(tr(kind[0]))}</span>` : '')
                    + `<span class="mled-fk-machine-name">${esc(label)}</span>`
                    + `<input type="text" class="mled-fk-short" maxlength="4" value="${esc(short)}" data-fk-short="${esc(id)}" aria-label="${esc(tr('fkShortAria', { name: label }))}" autocomplete="off" ${fk.isAdmin && machine ? '' : 'disabled'}>`
                    + `${controls}</li>`;
            }).join('');
        }
        const select = root.querySelector('#mled-fk-add-machine');
        const available = fk.known.filter((machine) => !fk.machinesDraft.includes(machine.id));
        select.innerHTML = available.length
            ? available.map((machine) => `<option value="${esc(machine.id)}">${esc(machine.name)}</option>`).join('')
            : `<option value="">${esc(fk.known.length ? tr('fkMachNoMore') : tr('noMachinesDetected'))}</option>`;
        select.disabled = !fk.isAdmin || !available.length;
        root.querySelector('#mled-fk-add-machine-btn').disabled = !fk.isAdmin || !available.length;
    }

    async function fkSaveMachines() {
        fkRenderMachines();
        const saved = await fkSavePartial({ machines: [...fk.machinesDraft] }, '#mled-fk-mach-msg');
        fk.machinesDraft = Array.isArray(fk.config?.machines) ? [...fk.config.machines] : [];
        await fkReloadMachines();
        fkRenderMachines();
        if (saved) fkRefreshStatus({ forceFrames: true });
    }

    function fkMoveMachine(from, to) {
        if (from === to || from < 0 || to < 0 || from >= fk.machinesDraft.length || to >= fk.machinesDraft.length) return;
        const [moved] = fk.machinesDraft.splice(from, 1);
        fk.machinesDraft.splice(to, 0, moved);
        fkSaveMachines();
    }

    // Nombre corto del panel (máx. 4: A-Z 0-9 . -). Si queda igual al
    // automático, se quita de short_names para que siga al nombre real.
    async function fkSaveShort(id, value) {
        const machine = fk.known.find((item) => item.id === id);
        const clean = String(value || '').trim().toUpperCase();
        const next = { ...(fk.config?.short_names || {}) };
        if (!clean || (machine && clean === machine.short_auto)) delete next[id];
        else next[id] = clean;
        const saved = await fkSavePartial({ short_names: next }, '#mled-fk-mach-msg');
        await fkReloadMachines();
        fkRenderMachines();
        if (saved) fkRefreshStatus({ forceFrames: true });
    }

    function fkBindMachines() {
        const list = root.querySelector('#mled-fk-machines');
        list.addEventListener('click', (event) => {
            if (!fk.isAdmin) return;
            const moveBtn = event.target.closest('[data-fk-move]');
            const removeBtn = event.target.closest('[data-fk-remove]');
            if (moveBtn) {
                const index = Number(moveBtn.dataset.fkIndex);
                fkMoveMachine(index, index + Number(moveBtn.dataset.fkMove));
            } else if (removeBtn) {
                fk.machinesDraft.splice(Number(removeBtn.dataset.fkRemove), 1);
                fkSaveMachines();
            }
        });
        list.addEventListener('input', (event) => {
            const input = event.target.closest('[data-fk-short]');
            if (input) input.value = input.value.toUpperCase().replace(/[^A-Z0-9.-]/g, '');
        });
        list.addEventListener('change', (event) => {
            const input = event.target.closest('[data-fk-short]');
            if (input && fk.isAdmin) fkSaveShort(input.dataset.fkShort, input.value);
        });
        list.addEventListener('dragstart', (event) => {
            const item = event.target.closest('[data-fk-index]');
            if (!fk.isAdmin || !item || event.target.closest('input')) return;
            fk.dragFrom = Number(item.dataset.fkIndex);
            item.classList.add('is-dragging');
            event.dataTransfer?.setData('text/plain', String(fk.dragFrom));
        });
        list.addEventListener('dragover', (event) => { if (fk.dragFrom != null) event.preventDefault(); });
        list.addEventListener('drop', (event) => {
            event.preventDefault();
            const item = event.target.closest('[data-fk-index]');
            const from = fk.dragFrom;
            fk.dragFrom = null;
            if (item && from != null) fkMoveMachine(from, Number(item.dataset.fkIndex));
        });
        list.addEventListener('dragend', () => {
            fk.dragFrom = null;
            list.querySelectorAll('.is-dragging').forEach((el) => el.classList.remove('is-dragging'));
        });
        root.querySelector('#mled-fk-add-machine-btn').addEventListener('click', () => {
            const id = root.querySelector('#mled-fk-add-machine').value;
            if (!fk.isAdmin || !id || fk.machinesDraft.includes(id)) return;
            fk.machinesDraft.push(id);
            fkSaveMachines();
        });
    }

    // ── Cómo se ve cada situación ──
    // Una ficha por situación (GET /fk8wa/effects): dibujo animado con su
    // contorno, cuándo sale, contorno propio (config.situation_styles; vacío =
    // el general, timer_style), efecto de entrada y, si es marco, su animación.
    function fkOwnStyle(sitId) { return fk.config?.situation_styles?.[sitId] || ''; }

    // Contorno vigente de la situación: el suyo o el general.
    function fkStyleOf(sitId) { return fkOwnStyle(sitId) || fk.config?.timer_style || 'contorno'; }

    function fkStyleGroup(style) { return style.startsWith('marco_') ? 'marco' : style; }

    function fkClockBlocks(sitId) { return FK_CLOCK_BLOCKS.includes(fkStyleOf(sitId)); }

    function fkStyleName(group) {
        const card = FK_STYLE_CARDS.find((item) => item[0] === group);
        return tr(card ? card[1] : 'fkStyleTemp');
    }

    function fkStyleOptionsHtml(sit) {
        const groups = [];
        (sit.styles || []).forEach((style) => {
            const group = fkStyleGroup(style);
            if (!groups.includes(group)) groups.push(group);
        });
        const own = fkStyleGroup(fkOwnStyle(sit.id));
        const general = fkStyleName(fkStyleGroup(fk.config?.timer_style || 'contorno'));
        return `<option value=""${own === '' ? ' selected' : ''}>${esc(tr('fkStyleGeneral', { name: general }))}</option>`
            + groups.map((group) => {
                const card = FK_STYLE_CARDS.find((item) => item[0] === group);
                return `<option value="${group}"${group === own ? ' selected' : ''}${card ? ` title="${esc(tr(card[2]))}"` : ''}>${esc(fkStyleName(group))}</option>`;
            }).join('');
    }

    // Guarda situation_styles completo: las demás tal como están y la que
    // cambió con su nuevo valor ('' = usar el general).
    async function fkSetSitStyle(sitId, value) {
        if (!fk.isAdmin || !fk.config) return;
        const next = {};
        (fk.effects?.situations || []).forEach((sit) => { next[sit.id] = fkOwnStyle(sit.id); });
        next[sitId] = value;
        if (await fkSavePartial({ situation_styles: next }, '#mled-fk-sit-msg')) fkAfterStyleSaved(sitId);
        else fkSyncSit();
    }

    function fkMiniPaint(mini) {
        const overlay = mini.marco ? fkBorderOverlay(mini.marco, fk.config?.border_pattern || 'dash', mini.tick) : null;
        fkDraw(mini.canvas, mini.pages[mini.idx], overlay, true);
    }

    function fkMiniLoad(mini, data) {
        mini.pages = (data?.pages || []).map(fkDecode);
        mini.stay = Math.max(60, Number(data?.stay_ms || 0) / 4);
        mini.marco = data?.marco ? String(data.style || 'marco_cw') : null;
        mini.idx = 0;
        mini.tick = 0;
        mini.last = performance.now();
        if (mini.pages.length) fkMiniPaint(mini);
    }

    // Dibujo de cada ficha: GET /fk8wa/frames?style=<contorno>&screen=<ejemplo>
    // (la impresión usa el ejemplo de dos vistas). Con "temp" el servidor
    // devuelve la secuencia de temperaturas. Se guarda por URL para no pedir
    // lo mismo cada vez que se vuelve a dibujar la ficha.
    function fkLoadStyleCards(only) {
        fk.minisStale = false;
        fk.minis.forEach((mini) => {
            if (only && mini.key !== only) return;
            const screen = FK_SIT_SCREEN[mini.key];
            const url = `/fk8wa/frames?style=${encodeURIComponent(fkStyleOf(mini.key))}${screen ? `&screen=${screen}` : ''}`;
            const cached = fk.sitFrames[url];
            mini.url = url;
            if (cached) { fkMiniLoad(mini, cached); return; }
            api(url)
                .then((data) => {
                    fk.sitFrames[url] = data;
                    if (mini.url === url) fkMiniLoad(mini, data);
                })
                .catch(() => {});
        });
    }

    // Cambió un contorno: se redibuja lo que depende de él.
    function fkAfterStyleSaved(only) {
        fkSyncSit();
        fkLoadStyleCards(only);
        fkRefreshStatus({ forceFrames: true });
        fkLoadGallery();
    }

    // Contorno general (timer_style): lo usan las situaciones en "General".
    async function fkSetGeneralStyle(group) {
        if (!fk.isAdmin || !fk.config) return;
        const current = fk.config.timer_style || 'contorno';
        const value = group === 'marco' ? (fkStyleGroup(current) === 'marco' ? current : 'marco_cw') : group;
        if (await fkSavePartial({ situation_styles: fk.config.situation_styles || {}, timer_style: value }, '#mled-fk-sit-msg')) fkAfterStyleSaved();
        else fkSyncSit();
    }

    function fkBindStyles() {
        root.querySelector('#mled-fk-timer-style').addEventListener('change', (event) => fkSetGeneralStyle(event.target.value));
        const box = root.querySelector('#mled-fk-sit');
        box.addEventListener('change', (event) => {
            const card = event.target.closest('[data-fk-sit]');
            if (!card || !fk.isAdmin) return;
            const id = card.dataset.fkSit;
            if (event.target.matches('[data-fk-sit-style]')) {
                const value = event.target.value;
                // Marco: conserva su animación si ya la tenía; si no, horario.
                fkSetSitStyle(id, value === 'marco' ? (fkStyleGroup(fkOwnStyle(id)) === 'marco' ? fkOwnStyle(id) : 'marco_cw') : value);
            } else if (event.target.matches('[data-fk-sit-anim]')) {
                fkSetSitStyle(id, event.target.value);
            } else if (event.target.matches('[data-fk-sit-fx]')) {
                fkSetEffect(id, event.target.value || null, '#mled-fk-sit-msg');
            }
        });
        root.querySelector('#mled-fk-marco-pattern').addEventListener('change', async (event) => {
            if (await fkSavePartial({ border_pattern: event.target.value }, '#mled-fk-sit-msg')) {
                fk.mp.pattern = fk.config.border_pattern;
                fkAfterStyleSaved();
            }
        });
        const speed = root.querySelector('#mled-fk-marco-speed');
        // La barra va de lento (izquierda) a rápido (derecha); el panel guarda lo contrario (menor = más rápido).
        speed.addEventListener('input', () => { root.querySelector('#mled-fk-marco-speed-val').textContent = speed.value; });
        speed.addEventListener('change', async () => {
            if (await fkSavePartial({ border_speed: fkBorderSpeedFlip(Number(speed.value)) }, '#mled-fk-sit-msg')) fkAfterStyleSaved();
        });
        root.querySelector('#mled-fk-fx-reset').addEventListener('click', () => fkSetEffect('all', null, '#mled-fk-sit-msg'));
    }

    // ── Efecto por situación ──
    async function fkLoadEffects() {
        try {
            fk.effects = await api('/fk8wa/effects');
        } catch {
            fk.effects = null;
        }
    }

    function fkEffectById(id) {
        return fk.effects?.effects.find((effect) => effect.id === id) || null;
    }

    function fkEffectOptionsHtml(selected) {
        const list = fk.effects?.effects || [];
        let html = `<option value="">${esc(tr('fkNoEffect'))}</option>`;
        FK_FAMILIES.forEach(([family]) => {
            const items = list.filter((effect) => effect.family === family);
            if (!items.length) return;
            html += `<optgroup label="${esc(fkFamilyLabel(family))}">`
                + items.map((effect) => `<option value="${esc(effect.id)}"${effect.id === selected ? ' selected' : ''}>${esc(fkEffectLabel(effect.id, effect.label))}${effect.tested ? '' : esc(tr('fkUntested'))}</option>`).join('')
                + '</optgroup>';
        });
        return html;
    }

    function fkSitName(sit) {
        return FK_SIT_KEYS[sit.id] ? tr(FK_SIT_KEYS[sit.id]) : String(sit.name || sit.id);
    }

    function fkRenderSit() {
        const box = root?.querySelector('#mled-fk-sit');
        if (!box) return;
        const sits = fk.effects?.situations || [];
        const assigned = fk.config?.effects || {};
        const borders = FK_BORDERS.map(([value, key]) => `<option value="${value}">${esc(tr(key))}</option>`).join('');
        box.innerHTML = sits.map((sit) => {
            const name = fkSitName(sit);
            return `
                        <div class="mled-fk-sitcard" data-fk-sit="${esc(sit.id)}" data-timed="${sit.timed ? '1' : '0'}">
                            <span class="mled-fk-mini"><canvas width="288" height="48" role="img" aria-label="${esc(name)}"></canvas></span>
                            <h4>${esc(name)}${FK_SIT_NEW.includes(sit.id) ? ` <span class="mled-fk-new">${esc(tr('fkSitNew'))}</span>` : ''}</h4>
                            <p class="mled-fk-muted">${esc(FK_SIT_WHEN[sit.id] ? tr(FK_SIT_WHEN[sit.id]) : '')}</p>
                            <div class="mled-fk-sitsels">
                                <div class="mled-fk-field"><label>${esc(tr('fkSitStyleLabel'))}</label><select data-fk-sit-style aria-label="${esc(tr('fkSitStyleAria', { name }))}">${fkStyleOptionsHtml(sit)}</select></div>
                                <div class="mled-fk-field"><label>${esc(tr('fkSitFxLabel'))}</label><select data-fk-sit-fx aria-label="${esc(tr('fkSitAria', { name }))}">${fkEffectOptionsHtml(assigned[sit.id] || '')}</select></div>
                            </div>
                            <div class="mled-fk-field" data-fk-sit-marco hidden><label>${esc(tr('fkMarcoAnim'))}</label><select data-fk-sit-anim aria-label="${esc(tr('fkSitMarcoAria', { name }))}">${borders}</select></div>
                            <small class="mled-fk-sitnote"></small>
                        </div>`;
        }).join('');
        fk.minis = [...box.querySelectorAll('[data-fk-sit]')].map((card) => ({
            key: card.dataset.fkSit, canvas: card.querySelector('canvas'), pages: [], stay: 0, idx: 0, last: 0, tick: 0, marco: null, url: '',
        }));
        fkSyncSit();
        if (fk.config && sits.length) fkLoadStyleCards();
    }

    // Ficha de la situación que se ve ahora en el panel.
    function fkSyncSitNow() {
        const current = FK_SCREEN_SIT[fk.status?.current];
        root?.querySelectorAll('[data-fk-sit]').forEach((card) => card.classList.toggle('is-on', card.dataset.fkSit === current));
    }

    // Con el contorno de reloj progresivo (contorno, contorno encima, barra)
    // las situaciones "con reloj" no admiten efecto: select deshabilitado y
    // un aviso en su ficha.
    function fkSyncSit() {
        if (!root) return;
        const assigned = fk.config?.effects || {};
        let anyMarco = false;
        const generalSelect = root.querySelector('#mled-fk-timer-style');
        if (generalSelect) generalSelect.value = fkStyleGroup(fk.config?.timer_style || 'contorno');
        const generalName = fkStyleName(fkStyleGroup(fk.config?.timer_style || 'contorno'));
        root.querySelectorAll('[data-fk-sit]').forEach((row) => {
            const generalOption = row.querySelector('[data-fk-sit-style] option[value=""]');
            if (generalOption) generalOption.textContent = tr('fkStyleGeneral', { name: generalName });
            const id = row.dataset.fkSit;
            const style = fkStyleOf(id);
            const off = fkClockBlocks(id) && row.dataset.timed === '1';
            const select = row.querySelector('[data-fk-sit-fx]');
            const styleSelect = row.querySelector('[data-fk-sit-style]');
            const marco = style.startsWith('marco_');
            anyMarco = anyMarco || marco;
            row.classList.toggle('is-off', off);
            select.value = assigned[id] || '';
            select.disabled = off || !fk.isAdmin;
            styleSelect.value = fkStyleGroup(fkOwnStyle(id));
            styleSelect.disabled = !fk.isAdmin;
            row.querySelector('[data-fk-sit-marco]').hidden = !marco;
            const anim = row.querySelector('[data-fk-sit-anim]');
            if (marco) anim.value = style;
            anim.disabled = !fk.isAdmin;
            let note = '';
            if (off) note = tr('fkSitBlocked');
            else if (style === 'temp' && (id === 'heating' || id === 'cooling')) note = tr(id === 'heating' ? 'fkSitTempFill' : 'fkSitTempDrain');
            row.querySelector('small').textContent = note;
        });
        const opts = root.querySelector('#mled-fk-marco-opts');
        opts.hidden = !anyMarco;
        root.querySelector('#mled-fk-marco-pattern').value = fk.config?.border_pattern || 'dash';
        const slider = fkBorderSpeedFlip(fk.config?.border_speed ?? 10);
        root.querySelector('#mled-fk-marco-speed').value = slider;
        root.querySelector('#mled-fk-marco-speed-val').textContent = String(slider);
        const reset = root.querySelector('#mled-fk-fx-reset');
        if (reset) reset.disabled = !fk.isAdmin;
        fkSyncSitNow();
    }

    async function fkSetEffect(target, id, msgSelector) {
        if (!fk.isAdmin || !fk.config) return;
        const next = { ...(fk.config.effects || {}) };
        const ids = (fk.effects?.situations || []).map((sit) => sit.id);
        if (target === 'all') ids.forEach((key) => { next[key] = id; });
        else next[target] = id;
        if (await fkSavePartial({ effects: next }, msgSelector)) {
            fkSyncSit();
            fkSyncFx();
            fkReplay();
        }
    }

    // Repite la entrada con el efecto elegido para verlo aunque ya estés en
    // esa situación: trae el cuadro vigente (ya con el efecto) y lo anima
    // desde otro cuadro distinto.
    async function fkReplay() {
        let data;
        try {
            data = await api('/fk8wa/frames');
        } catch {
            return;
        }
        fk.framesData = data;
        fkRenderNow();
        const first = data.pages?.length ? fkDecode(data.pages[0]) : null;
        const { A, B } = fk.fxFrames || {};
        const from = (A && first && !fkSameBytes(A, first)) ? A : (B || fk.mp.cur);
        fkMainStart(data, from);
    }

    // ── Galería de efectos ──
    async function fkLoadFxFrames() {
        try {
            const [a, b] = await Promise.all([api('/fk8wa/frames?screen=normal'), api('/fk8wa/frames?screen=print1')]);
            fk.fxFrames = { A: fkDecode(a.pages?.[0]), B: fkDecode(b.pages?.[0]) };
        } catch {
            fk.fxFrames = null;
        }
    }

    function fkRenderFamilies() {
        const box = root?.querySelector('#mled-fk-fam');
        if (!box) return;
        const chips = [['all', tr('fkFamAll')]].concat(FK_FAMILIES.map(([name, key]) => [name, tr(key)]));
        box.innerHTML = chips.map(([key, label]) => `<button type="button" data-fk-fam="${esc(key)}" aria-pressed="${key === fk.fxFamily}">${esc(label)}</button>`).join('');
    }

    function fkRenderFxTargets() {
        const select = root?.querySelector('#mled-fk-fx-target');
        if (!select) return;
        const sits = fk.effects?.situations || [];
        select.innerHTML = `<option value="all">${esc(tr('fkFxAll'))}</option>`
            + sits.map((sit) => `<option value="${esc(sit.id)}">${esc(fkSitName(sit))}</option>`).join('');
        select.value = fk.fxTarget;
    }

    function fkRenderFx() {
        const grid = root?.querySelector('#mled-fk-fxgrid');
        if (!grid) return;
        fk.fxCards = [];
        if (!fk.effects) { grid.innerHTML = ''; return; }
        const list = [{ id: '', label: tr('fkNoEffect'), tested: true }]
            .concat(fk.effects.effects.filter((effect) => fk.fxFamily === 'all' || effect.family === fk.fxFamily));
        grid.innerHTML = list.map((effect) => {
            const label = effect.id ? fkEffectLabel(effect.id, effect.label) : effect.label;
            const tag = effect.id ? (effect.tested ? tr('fkTagTested') : tr('fkTagUntested')) : tr('fkAppearsAtOnce');
            const aria = fk.isAdmin ? 'false' : 'true';
            return `<div class="mled-fk-fx" role="button" tabindex="0" data-fk-fx="${esc(effect.id)}" aria-pressed="false" aria-disabled="${aria}">`
                + '<span class="mled-fk-mini"><canvas width="288" height="48" aria-hidden="true"></canvas></span>'
                + `<strong>${esc(label)}</strong>`
                + `<span class="mled-fk-fx-meta"><span class="mled-fk-tag${effect.id && effect.tested ? ' is-ok' : ''}">${esc(tag)}</span>`
                + (effect.id && fk.isAdmin ? `<button type="button" class="mled-fk-try" data-fk-try="${esc(effect.id)}">${esc(tr('fkTryBtn'))}</button>` : '')
                + '</span></div>';
        }).join('');
        const cards = [...grid.querySelectorAll('.mled-fk-fx')];
        fk.fxCards = cards.map((el, index) => ({
            el,
            canvas: el.querySelector('canvas'),
            effect: list[index].id ? { type: fkEffectById(list[index].id)?.type, subtype: fkEffectById(list[index].id)?.subtype } : null,
        }));
        fkSyncFx();
        if (fkReduceMotion() || fk.paused) fkPaintStaticCards();
    }

    function fkSyncFx() {
        if (!root || !fk.config) return;
        const assigned = fk.config.effects || {};
        const sits = (fk.effects?.situations || []).map((sit) => sit.id);
        root.querySelectorAll('[data-fk-fx]').forEach((el) => {
            const id = el.dataset.fkFx || null;
            const on = fk.fxTarget === 'all'
                ? sits.length > 0 && sits.every((key) => (assigned[key] || null) === id)
                : (assigned[fk.fxTarget] || null) === id;
            el.setAttribute('aria-pressed', String(on));
        });
    }

    function fkEffectCardFrame(effect, t) {
        const { A, B } = fk.fxFrames;
        const [c0, c1, c2, c3] = FK_FX_CYCLE;
        let a = A;
        let b = B;
        let p;
        if (t < c0) p = 0;
        else if (t < c0 + c1) p = (t - c0) / c1;
        else if (t < c0 + c1 + c2) p = 1;
        else { a = B; b = A; p = (t - c0 - c1 - c2) / c3; }
        const back = t >= c0 + c1 + c2;
        const bytes = !effect ? ((p >= 1 || back) ? b : a) : fkEffectFrame(effect.type, effect.subtype, a, b, p);
        return back && p >= 1 ? B : bytes;
    }

    // Una sola animación para todas las tarjetas (efectos y relojes); solo
    // dibuja las que se ven en pantalla.
    function fkCardsLoop(now) {
        fk.raf = window.requestAnimationFrame(fkCardsLoop);
        if (now - fk.lastTick <= 55) return;
        fk.lastTick = now;
        if (fk.fxFrames) {
            const t = now % FK_FX_CYCLE.reduce((sum, n) => sum + n, 0);
            fk.fxCards.forEach((card) => {
                if (fkOnScreen(card.canvas)) fkDraw(card.canvas, fkEffectCardFrame(card.effect, t), null, true);
            });
        }
        fk.minis.forEach((mini) => {
            if (!mini.pages.length || !fkOnScreen(mini.canvas)) return;
            if (now - mini.last > mini.stay) {
                mini.idx = (mini.idx + 1) % mini.pages.length;
                mini.last = now;
                if (mini.marco) mini.tick += 1;
            }
            fkMiniPaint(mini);
        });
    }

    // Sin animación (prefers-reduced-motion o pestaña en segundo plano):
    // cuadro final del efecto y primera página del reloj.
    function fkPaintStaticCards() {
        if (fk.fxFrames) fk.fxCards.forEach((card) => fkDraw(card.canvas, fk.fxFrames.B, null, true));
        fk.minis.forEach((mini) => { if (mini.pages.length) fkMiniPaint(mini); });
    }

    async function fkTryEffect(id) {
        if (!fk.isAdmin) return;
        const label = fkEffectLabel(id, fkEffectById(id)?.label);
        fkSetMsg('#mled-fk-fx-msg', tr('fkTrying', { name: label }));
        try {
            await api('/fk8wa/effects/test', { method: 'POST', body: JSON.stringify({ effect: id }) });
            fkSetMsg('#mled-fk-fx-msg', tr('fkTryOk', { name: label }), 'ok');
            await fkLoadEffects();     // ahora figura como "Probado en tu panel"
            fkRenderSit();
            fkRenderFx();
        } catch (error) {
            fkSetMsg('#mled-fk-fx-msg', tr('fkTryFail', { detail: fkErrorText(error) }), 'error');
        }
    }

    function fkBindFx() {
        const grid = root.querySelector('#mled-fk-fxgrid');
        grid.addEventListener('click', (event) => {
            const tryBtn = event.target.closest('[data-fk-try]');
            if (tryBtn) { fkTryEffect(tryBtn.dataset.fkTry); return; }
            const card = event.target.closest('[data-fk-fx]');
            if (card && fk.isAdmin) fkSetEffect(fk.fxTarget, card.dataset.fkFx || null, '#mled-fk-fx-msg');
        });
        grid.addEventListener('keydown', (event) => {
            if ((event.key === 'Enter' || event.key === ' ') && event.target.classList.contains('mled-fk-fx')) {
                event.preventDefault();
                event.target.click();
            }
        });
        root.querySelector('#mled-fk-fam').addEventListener('click', (event) => {
            const chip = event.target.closest('[data-fk-fam]');
            if (!chip) return;
            fk.fxFamily = chip.dataset.fkFam;
            fkRenderFamilies();
            fkRenderFx();
        });
        root.querySelector('#mled-fk-fx-target').addEventListener('change', (event) => {
            fk.fxTarget = event.target.value;
            fkSyncFx();
        });
    }

    // ── Texto corrido en mensajes ──
    function fkSyncScrollControls() {
        if (!root) return;
        root.querySelectorAll('[data-fk-dir]').forEach((button) => {
            button.setAttribute('aria-pressed', String(button.dataset.fkDir === fk.scroll.dir));
        });
        root.querySelector('#mled-fk-scroll-speed').value = fk.scroll.level;
    }

    let fkScrollSeq = 0;

    async function fkLoadScrollPreview() {
        const text = root.querySelector('#mled-fk-scroll-text').value.trim() || ' ';
        fkScrollSeq += 1;
        const mine = fkScrollSeq;
        try {
            const query = `text=${encodeURIComponent(text)}&dir=${encodeURIComponent(fk.scroll.dir)}&level=${fk.scroll.level}`;
            const payload = await api(`/fk8wa/scroll-preview?${query}`);
            if (mine !== fkScrollSeq) return;     // llegó otra respuesta más nueva
            fk.scroll.payload = payload;
            fkSetMsg('#mled-fk-scroll-msg', '');
            if (!fk.paused) fk.scroll.player?.start();
            else fk.scroll.player?.paintStill();
        } catch (error) {
            fkSetMsg('#mled-fk-scroll-msg', fkErrorText(error), 'error');
        }
    }

    function fkBindScroll() {
        fk.scroll.player = fkScroller(root.querySelector('#mled-fk-led-scroll'), () => ({ payload: fk.scroll.payload, level: fk.scroll.level, dir: fk.scroll.dir }));
        root.querySelector('#mled-fk-scroll-text').addEventListener('input', () => {
            window.clearTimeout(fk.scroll.timer);
            fk.scroll.timer = window.setTimeout(fkLoadScrollPreview, 300);
        });
        root.querySelector('#mled-fk-dirs').addEventListener('click', async (event) => {
            const button = event.target.closest('[data-fk-dir]');
            if (!button || !fk.isAdmin) return;
            fk.scroll.dir = button.dataset.fkDir;
            fkSyncScrollControls();
            if (!fk.paused) fk.scroll.player?.start();
            await fkSavePartial({ scroll_dir: fk.scroll.dir }, '#mled-fk-scroll-msg');
            if (fk.mp.data?.scroll) fkMaybeReloadFrames(true);
        });
        const speed = root.querySelector('#mled-fk-scroll-speed');
        speed.addEventListener('input', () => { fk.scroll.level = Number(speed.value); });
        speed.addEventListener('change', async () => {
            fk.scroll.level = Number(speed.value);
            await fkSavePartial({ scroll_speed: fk.scroll.level }, '#mled-fk-scroll-msg');
            if (fk.mp.data?.scroll) fkMaybeReloadFrames(true);
        });
    }

    // ── Las 15 pantallas posibles ──
    // GET /fk8wa/frames?screen=<nombre>, con el contorno de su situación
    // (tamaño reducido o completo según el estilo).
    function fkLoadGallery() {
        fk.galleryStale = false;
        fk.gallery.forEach((item) => {
            const sit = FK_SCREEN_SIT[item.name];
            api(`/fk8wa/frames?screen=${encodeURIComponent(item.name)}${sit ? `&style=${encodeURIComponent(fkStyleOf(sit))}` : ''}`)
                .then((data) => {
                    item.page = fkDecode(data.pages?.[0]);
                    fkDraw(item.canvas, item.page, null, true);
                })
                .catch(() => {});
        });
    }

    // ── Redibujo, pausa y reanudación ──
    function fkRepaintAll() {
        if (fk.mp.cur) fkMainPaint(fk.mp.cur);
        fk.gallery.forEach((item) => { if (item.page) fkDraw(item.canvas, item.page, null, true); });
        if (fkReduceMotion() || fk.paused) fkPaintStaticCards();
        fk.scroll.player?.paintStill();
    }

    function fkPauseAnimations() {
        fk.paused = true;
        fkMainStop();
        fk.scroll.player?.stop();
        if (fk.raf) window.cancelAnimationFrame(fk.raf);
        fk.raf = null;
    }

    function fkResumeAnimations() {
        if (!fk.paused) return;
        fk.paused = false;
        if (fk.mp.data) fkMainStart(fk.mp.data, null);
        fk.scroll.player?.start();
        if (fkReduceMotion()) fkPaintStaticCards();
        else fk.raf = window.requestAnimationFrame(fkCardsLoop);
    }

    // ── Sondeo y ciclo de vida de la pestaña ──
    function fkTick() {
        if (!fkIsVisible()) { fkPauseAnimations(); return; }
        fkResumeAnimations();
        fkRefreshStatus();
    }

    function fkStopPolling() {
        if (fk.timer) { window.clearInterval(fk.timer); fk.timer = null; }
        window.clearTimeout(fk.scroll.timer);
        fkStopMessageTimer();
        fkPauseAnimations();
    }

    function fkStartPolling() {
        if (fk.timer) window.clearInterval(fk.timer);
        fk.timer = window.setInterval(fkTick, FK_POLL_MS);
    }

    function fkOnVisibilityChange() {
        if (state.view !== 'fk8wa') return;
        if (document.visibilityState === 'hidden') fkPauseAnimations();
        else fkTick();
    }

    async function fkEnter() {
        fk.led = null;   // por si cambió el tema
        fkStartPolling();
        fkResumeAnimations();
        fkRenderAnnouncementOptions();
        fkRefreshStatus({ forceFrames: true });
        if (!fk.roleLoaded) await fkLoadRole();
        await Promise.all([fkReloadMachines(), fkLoadConfig(), fkLoadEffects()]);
        fkRenderMachines();
        fkRenderSit();
        fkRenderFamilies();
        fkRenderFxTargets();
        fkRenderFx();
        if (fk.minisStale) fkLoadStyleCards();
        if (fk.galleryStale) fkLoadGallery();
        if (!fk.fxFrames) { await fkLoadFxFrames(); fkRenderFx(); }
        fkLoadScrollPreview();
        fkRenderAnnouncementOptions();
    }

    // Pestañas internas (patrón ARIA): clic, flechas izquierda/derecha, Inicio
    // y Fin. La última elegida se recuerda en este navegador.
    function fkShowTab(key, focus = false) {
        const view = root.querySelector('#mled-view-fk8wa');
        view.querySelectorAll('[data-fk-tab]').forEach((tab) => {
            const on = tab.dataset.fkTab === key;
            tab.setAttribute('aria-selected', String(on));
            tab.tabIndex = on ? 0 : -1;
            view.querySelector(`#${tab.getAttribute('aria-controls')}`).hidden = !on;
            if (on && focus) tab.focus();
        });
        try { localStorage.setItem(FK_TAB_KEY, key); } catch { /* sin localStorage: no es crítico */ }
    }

    function fkBindTabs() {
        const list = root.querySelector('#mled-view-fk8wa .mled-fk-tabs');
        const tabs = [...list.querySelectorAll('[data-fk-tab]')];
        list.addEventListener('click', (event) => {
            const tab = event.target.closest('[data-fk-tab]');
            if (tab) fkShowTab(tab.dataset.fkTab);
        });
        list.addEventListener('keydown', (event) => {
            const index = tabs.indexOf(document.activeElement);
            if (index < 0) return;
            let next = null;
            if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
            else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
            else if (event.key === 'Home') next = 0;
            else if (event.key === 'End') next = tabs.length - 1;
            if (next === null) return;
            event.preventDefault();
            event.stopPropagation();
            fkShowTab(tabs[next].dataset.fkTab, true);
        });
        try {
            const saved = localStorage.getItem(FK_TAB_KEY);
            if (saved && tabs.some((tab) => tab.dataset.fkTab === saved)) fkShowTab(saved);
        } catch { /* sin localStorage: se queda en Panel */ }
    }

    function fkBindHelp() {
        const view = root.querySelector('#mled-view-fk8wa');
        const closeAll = (except) => {
            view.querySelectorAll('.mled-fk-help.is-open').forEach((help) => {
                if (help === except) return;
                help.classList.remove('is-open');
                help.querySelector('button')?.setAttribute('aria-expanded', 'false');
            });
        };
        view.addEventListener('click', (event) => {
            const help = event.target.closest('.mled-fk-help');
            closeAll(help);
            if (help && event.target.closest('button')) {
                const open = help.classList.toggle('is-open');
                help.querySelector('button').setAttribute('aria-expanded', String(open));
            }
        });
        view.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeAll(null); });
    }

    function fkBindEvents() {
        fk.mp.canvas = root.querySelector('#mled-fk-led-main');
        fk.gallery = [...root.querySelectorAll('[data-fk-gallery]')].map((figure) => ({
            name: figure.dataset.fkGallery, canvas: figure.querySelector('canvas'), page: null,
        }));
        fkBindHelp();
        fkBindTabs();

        root.querySelector('#mled-fk-mins').addEventListener('click', (event) => {
            const button = event.target.closest('[data-fk-minutes]');
            if (!button) return;
            fk.minutes = Number(button.dataset.fkMinutes);
            fkSyncMinutes();
        });
        fkSyncMinutes();
        root.querySelector('#mled-fk-msg-send').addEventListener('click', () => fkSendMessage(false));
        root.querySelector('#mled-fk-msg-text').addEventListener('keydown', (event) => {
            if (event.key === 'Enter') { event.preventDefault(); fkSendMessage(false); }
        });
        root.querySelector('#mled-fk-ann-send').addEventListener('click', () => fkSendMessage(true));

        fkBindMachines();

        const bright = root.querySelector('#mled-fk-bright');
        bright.addEventListener('input', () => {
            fk.brightness = Number(bright.value);
            root.querySelector('#mled-fk-bright-val').textContent = bright.value;
            fkRepaintAll();
        });
        bright.addEventListener('change', fkApplyBrightness);

        fkBindStyles();
        fkBindFx();
        fkBindScroll();
        fkRenderFamilies();

        root.querySelector('#mled-fk-test-btn').addEventListener('click', fkTestConnection);
        root.querySelector('#mled-fk-save-btn').addEventListener('click', fkSaveConnection);
        document.addEventListener('visibilitychange', fkOnVisibilityChange);
        fkApplyRole();
    }

    // ── HTML ──
    // Globo "?": se abre al pasar el mouse, con el teclado o con un toque.
    function fkHelp(key, end = false) {
        fkHelpSeq += 1;
        const id = `mled-fk-tip-${fkHelpSeq}`;
        return `<span class="mled-fk-help${end ? ' mled-fk-help-end' : ''}"><button type="button" aria-label="${esc(tr('fkHelp'))}" aria-describedby="${id}" aria-expanded="false">?</button><span class="mled-fk-tip" id="${id}" role="tooltip">${esc(tr(key))}</span></span>`;
    }

    function fkConnPillHtml() {
        return `<span class="mled-status-pill mled-status-off mled-fk-conn" id="mled-fk-conn" role="status" aria-live="polite">
                            <span class="mled-status-dot"></span>
                            <span id="mled-fk-conn-text">${esc(tr('fkConnChecking'))}</span>
                        </span>`;
    }

    // Tarjeta de la cuadrícula de 12 columnas: span = clases como
    // `mled-fk-s7` (columnas que ocupa) y, si hace falta, `mled-fk-fill` o
    // `mled-fk-side`. Sin helpKey no lleva globo "?".
    function fkCardHtml(span, id, tag, titleKey, helpKey, body, headExtra = '') {
        const head = tag === 'h2' ? 'mled-fk-head' : 'mled-fk-title';
        const help = helpKey ? fkHelp(helpKey, tag === 'h2') : '';
        const end = headExtra ? `<span class="mled-fk-head-end">${headExtra}${help}</span>` : help;
        return `
                    <section class="mled-fk-card ${span}" aria-labelledby="${id}">
                        <div class="${head}"><${tag} id="${id}">${esc(tr(titleKey))}</${tag}>${end}</div>
                        ${body}
                    </section>`;
    }

    function fkField(id, labelKey, helpKey, control) {
        return `<div class="mled-fk-field"><div class="mled-fk-field-label"><label for="${id}">${esc(tr(labelKey))}</label>${fkHelp(helpKey)}</div>${control}</div>`;
    }

    function fkSecondsInput(id, min, max) {
        return `<div class="mled-fk-unit"><input type="number" id="${id}" min="${min}" max="${max}" step="1" data-fk-admin-input disabled><span class="mled-fk-muted">${esc(tr('fkSecondsUnit'))}</span></div>`;
    }

    function fkViewHtml() {
        const prio = FK_PRIORITY.map(([key, icon, labelKey, tipKey]) => `
                            <li class="mled-fk-step" data-fk-prio="${key}" data-now="${esc(tr('fkPrioNow'))}" title="${esc(tr(tipKey))}">
                                <i aria-hidden="true">${icon}</i><span>${esc(tr(labelKey))}</span>
                                <span class="mled-fk-sr">${esc(tr(tipKey))}</span>
                            </li>`).join('');
        const minutes = FK_MINUTES.map((n) => `<button type="button" data-fk-minutes="${n}" aria-pressed="false">${esc(tr('fkMinutesShort', { n }))}</button>`).join('');
        const patterns = FK_PATTERNS.map(([value, key]) => `<option value="${value}">${esc(tr(key))}</option>`).join('');
        const dirs = FK_DIRS.map(([value, key]) => `<button type="button" data-fk-dir="${value}" aria-pressed="false" data-fk-admin-input disabled>${esc(tr(key))}</button>`).join('');
        const gallery = FK_SCREENS.map((name) => `
                            <figure data-fk-gallery="${name}">
                                <span class="mled-fk-mini"><canvas width="288" height="48" role="img" aria-label="${esc(fkScreenLabel(name))}"></canvas></span>
                                <figcaption><strong>${esc(fkScreenLabel(name))}</strong><span>${esc(tr(FK_SCREEN_DESC_KEYS[name]))}</span></figcaption>
                            </figure>`).join('');

        const now = `
                        <div class="mled-fk-led"><canvas id="mled-fk-led-main" width="960" height="160" role="img" aria-label="${esc(tr('fkPanelAria'))}"></canvas></div>
                        <p class="mled-fk-now" id="mled-fk-now" aria-live="polite"></p>
                        <div class="mled-fk-views" id="mled-fk-views"></div>`;
        const why = `
                        <ol class="mled-fk-prio" id="mled-fk-prio">${prio}
                        </ol>`;
        const message = `
                        <div class="mled-fk-msg">
                            <input type="text" id="mled-fk-msg-text" maxlength="200" placeholder="${esc(tr('fkMsgPlaceholder'))}" aria-label="${esc(tr('fkMsgAria'))}" autocomplete="off">
                            <div class="mled-fk-mins" id="mled-fk-mins" role="group" aria-label="${esc(tr('fkMinutesAria'))}">${minutes}</div>
                            <button type="button" class="mled-btn mled-btn-primary" id="mled-fk-msg-send">${esc(tr('fkMsgSend'))}</button>
                        </div>
                        <div class="mled-fk-ann">
                            <label for="mled-fk-ann" class="mled-fk-muted">${esc(tr('fkAnnLabel'))}</label>
                            <select id="mled-fk-ann"></select>
                            <button type="button" class="mled-btn mled-btn-small" id="mled-fk-ann-send">${esc(tr('fkAnnShow'))}</button>
                        </div>
                        <div class="mled-fk-current" id="mled-fk-current" aria-live="polite" hidden></div>
                        <span class="mled-inline-msg" id="mled-fk-msg-status" role="status" aria-live="polite"></span>`;
        const machines = `
                        <ol class="mled-fk-machines" id="mled-fk-machines" aria-labelledby="mled-fk-t-mach"></ol>
                        <div class="mled-fk-add" data-fk-admin-only hidden>
                            <select id="mled-fk-add-machine" aria-label="${esc(tr('fkMachAddAria'))}" disabled></select>
                            <button type="button" class="mled-btn" id="mled-fk-add-machine-btn" disabled>${esc(tr('fkMachAdd'))}</button>
                        </div>
                        <div class="mled-fk-hint">${esc(tr('fkMachHint'))}</div>
                        <span class="mled-inline-msg" id="mled-fk-mach-msg" role="status" aria-live="polite"></span>`;
        const brightness = `
                        <div class="mled-fk-bright">
                            <span aria-hidden="true">☾</span>
                            <input type="range" id="mled-fk-bright" min="1" max="16" step="1" value="8" aria-label="${esc(tr('fkBrightTitle'))}" data-fk-admin-input disabled>
                            <span class="mled-fk-mono" id="mled-fk-bright-val">8</span>
                        </div>
                        <span class="mled-inline-msg" id="mled-fk-bright-msg" role="status" aria-live="polite">${esc(tr('fkBrightNote'))}</span>`;
        const situations = `
                        <p class="mled-fk-muted">${esc(tr('fkSitIntro'))}</p>
                        <div class="mled-fk-generalstyle">
                            <div class="mled-fk-field-label"><label for="mled-fk-timer-style">${esc(tr('fkGeneralStyleLabel'))}</label>${fkHelp('fkGeneralStyleHelp')}</div>
                            <select id="mled-fk-timer-style" data-fk-admin-input disabled>${FK_STYLE_CARDS.map((card) => `<option value="${card[0]}">${esc(tr(card[1]))}</option>`).join('')}</select>
                        </div>
                        <div class="mled-fk-sitcards" id="mled-fk-sit"></div>
                        <div class="mled-fk-marco-opts" id="mled-fk-marco-opts" hidden>
                            <div class="mled-fk-field"><label for="mled-fk-marco-pattern">${esc(tr('fkMarcoPattern'))}</label><select id="mled-fk-marco-pattern" data-fk-admin-input disabled>${patterns}</select></div>
                            <div class="mled-fk-field"><label for="mled-fk-marco-speed">${esc(tr('fkMarcoSpeed'))}</label>
                                <div class="mled-fk-bright"><span aria-hidden="true">🐢</span><input type="range" id="mled-fk-marco-speed" min="1" max="60" step="1" value="51" aria-label="${esc(tr('fkMarcoSpeed'))}" data-fk-admin-input disabled><span aria-hidden="true">🐇</span><span class="mled-fk-mono" id="mled-fk-marco-speed-val">51</span></div>
                            </div>
                            <div class="mled-fk-hint">${esc(tr('fkMarcoShared'))}</div>
                        </div>
                        <div><button type="button" class="mled-btn mled-btn-small" id="mled-fk-fx-reset" disabled>${esc(tr('fkFxReset'))}</button></div>
                        <span class="mled-inline-msg" id="mled-fk-sit-msg" role="status" aria-live="polite"></span>`;
        const effects = `
                        <div class="mled-fk-fxbar">
                            <label for="mled-fk-fx-target">${esc(tr('fkFxTarget'))}</label>
                            <select id="mled-fk-fx-target"></select>
                            <div class="mled-fk-fam" id="mled-fk-fam" role="group" aria-label="${esc(tr('fkFamAria'))}"></div>
                        </div>
                        <div class="mled-fk-legend"><span><i>●</i> ${esc(tr('fkLegendTested'))}</span><span>○ ${esc(tr('fkLegendUntested'))}</span><span>${esc(tr('fkLegendNote'))}</span></div>
                        <div class="mled-fk-fxgrid" id="mled-fk-fxgrid"></div>
                        <span class="mled-inline-msg" id="mled-fk-fx-msg" role="status" aria-live="polite"></span>`;
        const scroll = `
                        <div class="mled-fk-field"><label for="mled-fk-scroll-text">${esc(tr('fkScrollTextLabel'))}</label><input type="text" id="mled-fk-scroll-text" maxlength="200" value="${esc(tr('fkScrollSample'))}" autocomplete="off"></div>
                        <div class="mled-fk-led"><canvas id="mled-fk-led-scroll" width="960" height="160" role="img" aria-label="${esc(tr('fkScrollAria'))}"></canvas></div>
                        <div class="mled-fk-dirs" id="mled-fk-dirs" role="group" aria-label="${esc(tr('fkDirAria'))}">${dirs}</div>
                        <div class="mled-fk-bright"><span aria-hidden="true">\u{1F422}</span><input type="range" id="mled-fk-scroll-speed" min="1" max="10" step="1" value="5" aria-label="${esc(tr('fkScrollSpeedAria'))}" data-fk-admin-input disabled><span aria-hidden="true">\u{1F407}</span></div>
                        <div class="mled-fk-muted">${esc(tr('fkScrollNote'))}</div>
                        <span class="mled-inline-msg" id="mled-fk-scroll-msg" role="status" aria-live="polite"></span>`;
        const screens = `
                        <div class="mled-fk-muted">${esc(tr('fkGalleryNote'))}</div>
                        <div class="mled-fk-gallery" id="mled-fk-gallery">${gallery}
                        </div>`;

        const connection = `
                        <div class="mled-fk-inner">
                            <div class="mled-fk-fields">
                                ${fkField('mled-fk-ip', 'fkIpLabel', 'fkIpHelp', `<div class="mled-fk-row"><input type="text" id="mled-fk-ip" inputmode="decimal" autocomplete="off" data-fk-admin-input disabled><button type="button" class="mled-btn" id="mled-fk-test-btn" data-fk-admin-only hidden>${esc(tr('fkTest'))}</button></div><span class="mled-inline-msg" id="mled-fk-test-msg" role="status" aria-live="polite"></span>`)}
                                ${fkField('mled-fk-view-seconds', 'fkViewLabel', 'fkViewHelp', fkSecondsInput('mled-fk-view-seconds', 5, 300))}
                                ${fkField('mled-fk-done-seconds', 'fkDoneLabel', 'fkDoneHelp', fkSecondsInput('mled-fk-done-seconds', 5, 3600))}
                                ${fkField('mled-fk-min-interval', 'fkMinLabel', 'fkMinHelp', fkSecondsInput('mled-fk-min-interval', 10, 600))}
                            </div>
                            <label class="mled-fk-check"><input type="checkbox" id="mled-fk-enabled" data-fk-admin-input disabled><span>${esc(tr('fkEnabledLabel'))}</span></label>
                            <div class="mled-fk-row" data-fk-admin-only hidden>
                                <button type="button" class="mled-btn mled-btn-primary" id="mled-fk-save-btn">${esc(tr('fkSave'))}</button>
                                <span class="mled-inline-msg" id="mled-fk-conn-msg" role="status" aria-live="polite"></span>
                            </div>
                        </div>`;

        return `
                <div id="mled-view-fk8wa" class="mled-fk-view" role="tabpanel" aria-labelledby="mled-tab-fk8wa" hidden>
                    <p class="mled-fk-alert" id="mled-fk-alert" role="alert" hidden></p>
                    <p class="mled-fk-alert" id="mled-fk-missing" hidden></p>
                    <p class="mled-fk-readonly" id="mled-fk-readonly" hidden>${esc(tr('fkReadOnly'))}</p>

                    <div class="mled-fk-tabs" role="tablist" aria-label="${esc(tr('fkTabsAria'))}">${FK_TABS.map(([key, labelKey], index) => `
                        <button type="button" class="mled-fk-tab" role="tab" id="mled-fk-tab-${key}" data-fk-tab="${key}" aria-selected="${index === 0}" aria-controls="mled-fk-pn-${key}" tabindex="${index === 0 ? 0 : -1}">${esc(tr(labelKey))}</button>`).join('')}
                    </div>

                    <div class="mled-fk-grid" role="tabpanel" id="mled-fk-pn-panel" aria-labelledby="mled-fk-tab-panel">${fkCardHtml('mled-fk-s7', 'mled-fk-t-now', 'h2', 'fkNowTitle', 'fkNowHelp', now, fkConnPillHtml())}${fkCardHtml('mled-fk-s5 mled-fk-fill', 'mled-fk-t-why', 'h2', 'fkWhyTitle', 'fkWhyHelp', why)}${fkCardHtml('mled-fk-s7', 'mled-fk-t-msg', 'h2', 'fkMsgTitle', 'fkMsgHelp', message)}${fkCardHtml('mled-fk-s5', 'mled-fk-t-bright', 'h3', 'fkBrightTitle', 'fkBrightHelp', brightness)}
                    </div>

                    <div class="mled-fk-grid" role="tabpanel" id="mled-fk-pn-mach" aria-labelledby="mled-fk-tab-mach" hidden>${fkCardHtml('mled-fk-s6', 'mled-fk-t-mach', 'h3', 'fkMachTitle', 'fkMachHelp', machines)}${fkCardHtml('mled-fk-s6', 'mled-fk-t-conn', 'h3', 'fkConnTitle', '', connection)}
                    </div>

                    <div class="mled-fk-grid" role="tabpanel" id="mled-fk-pn-clock" aria-labelledby="mled-fk-tab-clock" hidden>${fkCardHtml('mled-fk-s12', 'mled-fk-t-sit', 'h3', 'fkSitTitle', 'fkSitHelp', situations)}${fkCardHtml('mled-fk-s12', 'mled-fk-t-scroll', 'h3', 'fkScrollTitle', 'fkScrollHelp', scroll)}
                    </div>

                    <div class="mled-fk-grid" role="tabpanel" id="mled-fk-pn-fx" aria-labelledby="mled-fk-tab-fx" hidden>${fkCardHtml('mled-fk-s12', 'mled-fk-t-fx', 'h2', 'fkFxTitle', 'fkFxHelp', effects)}
                    </div>

                    <div class="mled-fk-grid" role="tabpanel" id="mled-fk-pn-screens" aria-labelledby="mled-fk-tab-screens" hidden>${fkCardHtml('mled-fk-s12', 'mled-fk-t-screens', 'h3', 'fkGalleryTitle', 'fkGalleryHelp', screens)}
                    </div>
                </div>`;
    }

    // ── Fichas de las pestañas ──
    // Tres fichas como las de máquinas del dashboard de NOPAL: ícono en un
    // recuadro, título, pastilla de estado y subtítulo. Las pastillas se
    // refrescan al montar, al cambiar de pestaña y cada 15 s mientras la
    // sección del plugin se ve en pantalla.
    const TAB_REFRESH_MS = 15000;
    let tabFkState = null;
    let tabCardsTimer = null;

    const TAB_SVG_OPEN = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">';
    const TAB_ICONS = {
        dashboard: `${TAB_SVG_OPEN}<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4M6 9h4M6 12h8"/></svg>`,
        editor: `${TAB_SVG_OPEN}<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/></svg>`,
        fk8wa: `${TAB_SVG_OPEN}<g fill="currentColor" stroke="none"><circle cx="6" cy="6" r="1.6"/><circle cx="12" cy="6" r="1.6"/><circle cx="18" cy="6" r="1.6"/><circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/><circle cx="6" cy="18" r="1.6"/><circle cx="12" cy="18" r="1.6"/><circle cx="18" cy="18" r="1.6"/></g></svg>`,
    };
    const TAB_CARDS = [
        ['dashboard', 'tabCardMain', 'tabCardMainSub'],
        ['editor', 'tabCardScenes', 'tabCardScenesSub'],
        ['fk8wa', 'tabCardLed', 'tabCardLedSub'],
    ];

    function tabCardsHtml() {
        return `<div class="mled-view-tabs" role="tablist" aria-label="${esc(tr('tabsAria'))}">${TAB_CARDS.map(([view, titleKey, subKey], index) => `
                    <button type="button" class="mled-view-tab${index === 0 ? ' is-active' : ''}" role="tab" id="mled-tab-${view}" data-view="${view}" aria-selected="${index === 0}" aria-controls="mled-view-${view}" tabindex="${index === 0 ? 0 : -1}">
                        <span class="mled-tab-icon">${TAB_ICONS[view]}</span>
                        <span class="mled-tab-copy">
                            <strong class="mled-tab-title">${esc(tr(titleKey))}</strong>
                            <span class="mled-tab-pill mled-status-off" id="mled-tab-pill-${view}"><span class="mled-status-dot"></span><span class="mled-tab-pill-text">${esc(tr('checking'))}</span></span>
                            <small class="mled-tab-sub">${esc(tr(subKey))}</small>
                        </span>
                    </button>`).join('')}
                </div>`;
    }

    function setTabPill(view, cssClass, text) {
        const pill = root?.querySelector(`#mled-tab-pill-${view}`);
        if (!pill) return;
        pill.classList.remove('mled-status-ok', 'mled-status-warn', 'mled-status-off');
        pill.classList.add(cssClass);
        pill.querySelector('.mled-tab-pill-text').textContent = text;
    }

    function refreshTabCards() {
        if (!root) return;
        // 1) Pantalla BLE iPixel: los datos que el plugin ya tiene.
        if (!state.status.configured) setTabPill('dashboard', 'mled-status-off', tr('notConfigured'));
        else if (state.status.connected) setTabPill('dashboard', 'mled-status-ok', tr('statusConnected'));
        else setTabPill('dashboard', 'mled-status-warn', tr('fkConnUnreachable'));
        // 2) Anuncios guardados.
        const count = state.announcements.length;
        setTabPill('editor', count ? 'mled-status-ok' : 'mled-status-off', count === 1 ? tr('tabAnnOne') : tr('tabAnnMany', { n: count }));
        // 3) Panel LED FK-8Wa: mismos textos y colores que la pastilla de su pestaña.
        const conn = FK_CONN[tabFkState] || (tabFkState === 'error' ? FK_CONN.unreachable : ['fkConnChecking', 'mled-status-off']);
        setTabPill('fk8wa', conn[1], tr(conn[0]));
    }

    async function fetchTabFk() {
        try {
            tabFkState = (await api('/fk8wa/status')).state;
        } catch {
            tabFkState = 'error';
        }
        refreshTabCards();
    }

    // Solo mientras la sección se ve; con la pestaña Panel LED abierta ya la
    // refresca su propio sondeo de 5 s.
    function tabCardsTick() {
        if (!root || document.visibilityState === 'hidden' || root.getClientRects().length === 0) return;
        if (state.view !== 'fk8wa') fetchTabFk();
        else refreshTabCards();
    }

    function startTabCards() {
        stopTabCards();
        tabCardsTimer = window.setInterval(tabCardsTick, TAB_REFRESH_MS);
        refreshTabCards();
        fetchTabFk();
    }

    function stopTabCards() {
        if (tabCardsTimer) { window.clearInterval(tabCardsTimer); tabCardsTimer = null; }
    }

    // Flechas, Inicio y Fin cambian de ficha (patrón de pestañas de ARIA).
    function bindTabCards() {
        const list = root.querySelector('.mled-view-tabs');
        list.addEventListener('keydown', (event) => {
            const tabs = [...list.querySelectorAll('[role="tab"]')];
            const index = tabs.indexOf(document.activeElement);
            if (index < 0) return;
            let next = null;
            if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % tabs.length;
            else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + tabs.length) % tabs.length;
            else if (event.key === 'Home') next = 0;
            else if (event.key === 'End') next = tabs.length - 1;
            if (next === null) return;
            event.preventDefault();
            tabs[next].focus();
            switchDashView(tabs[next].dataset.view);
        });
    }

    // ── Layout ──
    function moduleHtml() {
        return `
            <section id="${PLUGIN_ID}-section" class="view-section mled-section" style="display:none">
                <header class="mled-header">
                    <div>
                        <h1 id="mled-page-title">${tr('dashboardTitle')}</h1>
                        <p class="mled-sub" id="mled-page-sub">${tr('dashboardSub')}</p>
                    </div>
                    <div class="mled-header-actions">
                        <span class="mled-status-pill" id="mled-status-pill">
                            <span class="mled-status-dot"></span>
                            <span id="mled-status-text">${tr('checking')}</span>
                        </span>
                        <button type="button" class="mled-btn mled-btn-icon" id="mled-config-open-btn" title="${tr('accessoryConfigTitle')}">⚙</button>
                    </div>
                </header>

                ${tabCardsHtml()}

                <div id="mled-view-dashboard" class="mled-view" role="tabpanel" aria-labelledby="mled-tab-dashboard">
                    <div class="mled-shell">
                        <div class="mled-kpi-row">
                            <article class="mled-kpi-card">
                                <span class="mled-kpi-icon">▦</span>
                                <div>
                                    <span class="mled-kpi-label">${tr('kpiMatricesConnected')}</span>
                                    <strong id="mled-kpi-matrices">—</strong>
                                    <small id="mled-kpi-matrices-sub">${tr('checking')}</small>
                                </div>
                            </article>
                            <article class="mled-kpi-card">
                                <span class="mled-kpi-icon">▤</span>
                                <div>
                                    <span class="mled-kpi-label">${tr('kpiActiveScenes')}</span>
                                    <strong id="mled-kpi-scenes">—</strong>
                                    <small id="mled-kpi-scenes-sub"></small>
                                </div>
                            </article>
                            <article class="mled-kpi-card">
                                <span class="mled-kpi-icon">⚡</span>
                                <div>
                                    <span class="mled-kpi-label">${tr('kpiAutomations')}</span>
                                    <strong id="mled-kpi-automations">—</strong>
                                    <small id="mled-kpi-automations-sub"></small>
                                </div>
                            </article>
                            <article class="mled-kpi-card mled-kpi-unavailable">
                                <span class="mled-kpi-icon">☀</span>
                                <div>
                                    <span class="mled-kpi-label">${tr('kpiGlobalBrightness')}</span>
                                    <strong>${tr('notAvailableBadge')}</strong>
                                    <small>${tr('noFirmwareSensor')}</small>
                                </div>
                            </article>
                        </div>

                        <div class="mled-dash-row">
                            <article class="mled-dash-card mled-live-card">
                                <h2>${tr('liveView')}</h2>
                                <label class="mled-field compact"><span>${tr('selectMatrix')}</span><select id="mled-live-select"><option>${tr('mainMatrixLabel')}</option></select></label>
                                <div class="mled-preview-display mled-live-display"><div class="mled-preview-grid" id="mled-live-grid"></div></div>
                                <div class="mled-live-footer">
                                    <span id="mled-live-scene">${tr('currentSceneDash')}</span>
                                    <span>${tr('brightnessLabel')} <em>${tr('notAvailableBadge')}</em></span>
                                    <span>${tr('fpsLabel')} <em>${tr('notAvailableBadge')}</em></span>
                                    <span>${tr('panelTempLabel')} <em>${tr('notAvailableBadge')}</em></span>
                                </div>
                            </article>

                            <div class="mled-dash-col">
                                <article class="mled-dash-card">
                                    <h2>${tr('registeredResolutions')}</h2>
                                    <div class="mled-res-row">
                                        <span>${tr('rgbResolution')}</span>
                                        <span class="mled-badge mled-badge-baja">${tr('defaultBadge')}</span>
                                    </div>
                                </article>
                                <article class="mled-dash-card">
                                    <h2>${tr('workshopStatus')}</h2>
                                    <div class="mled-status-row"><span>${tr('criticalSensors')}</span><strong class="mled-unavailable">${tr('notAvailableBadge')}</strong></div>
                                    <div class="mled-status-row"><span>${tr('ventilation')}</span><strong class="mled-unavailable">${tr('notAvailableBadge')}</strong></div>
                                    <div class="mled-status-row"><span>${tr('stablePower')}</span><strong class="mled-unavailable">${tr('notAvailableBadge')}</strong></div>
                                    <div class="mled-status-row"><span>${tr('ambientTemp')}</span><strong id="mled-th-temp" class="mled-unavailable">${tr('notAvailableBadge')}</strong></div>
                                </article>
                            </div>
                        </div>

                        <div class="mled-dash-row">
                            <article class="mled-dash-card">
                                <h2>${tr('quickScenes')}</h2>
                                <div class="mled-scenes-carousel">
                                    <button type="button" class="mled-scenes-arrow" id="mled-scenes-prev" title="${tr('previousTitle')}" aria-label="${tr('previousAria')}">‹</button>
                                    <div class="mled-scenes-grid" id="mled-quick-scenes"></div>
                                    <button type="button" class="mled-scenes-arrow" id="mled-scenes-next" title="${tr('nextTitle')}" aria-label="${tr('nextAria')}">›</button>
                                </div>
                            </article>
                            <article class="mled-dash-card">
                                <h2>${tr('suggestedAutomations')}</h2>
                                <div class="mled-suggestions" id="mled-suggestions"></div>
                            </article>
                        </div>

                        <article class="mled-dash-card">
                            <h2>${tr('operationalSummary')}</h2>
                            <div class="mled-summary-row">
                                <div><span>${tr('uptimeLabel')}</span><strong id="mled-sum-uptime">—</strong></div>
                                <div><span>${tr('messagesToday')}</span><strong id="mled-sum-sent">—</strong></div>
                                <div><span>${tr('successfulUpdates')}</span><strong id="mled-sum-success">—</strong></div>
                                <div><span>${tr('errorsLabel')}</span><strong id="mled-sum-errors">—</strong></div>
                            </div>
                        </article>
                    </div>

                    <aside class="mled-sidebar">
                        <article class="mled-card">
                            <div class="mled-card-head-row"><h2>${tr('diagnosticsTitle')}</h2><button type="button" class="mled-btn mled-btn-small" id="mled-diag-test-btn">${tr('testConnectionBtn')}</button></div>
                            <div class="mled-info-row"><span>${tr('bleConnection')}</span><strong id="mled-diag-connection">—</strong></div>
                            <div class="mled-info-row"><span>${tr('modelLabel')}</span><strong id="mled-info-model">—</strong></div>
                            <div class="mled-info-row"><span>${tr('firmwareLabel')}</span><strong id="mled-info-firmware">—</strong></div>
                            <div class="mled-info-row"><span>${tr('freeMemory')}</span><strong id="mled-info-heap">—</strong></div>
                            <div class="mled-info-row"><span>${tr('matrixType')}</span><strong>RGB 16×32</strong></div>
                            <div class="mled-info-row"><span>${tr('lastSentLabel')}</span><strong id="mled-diag-last-sent">—</strong></div>
                            <div class="mled-info-row"><span>${tr('lastErrorLabel')}</span><strong id="mled-diag-last-error">—</strong></div>
                        </article>
                        <article class="mled-card">
                            <h2>${tr('goodPractices')}</h2>
                            <ul class="mled-tips-list">
                                <li>${tr('tipShortMessages')}</li>
                                <li>${tr('tipAvoidBlinking')}</li>
                                <li>${tr('tipPrioritizeColors')}</li>
                            </ul>
                        </article>
                        <article class="mled-card">
                            <h2>${tr('colorPriorities')}</h2>
                            <div class="mled-priority-row"><span class="mled-dot" style="background:#22c55e"></span>${tr('greenPriority')}</div>
                            <div class="mled-priority-row"><span class="mled-dot" style="background:#f59e0b"></span>${tr('amberPriority')}</div>
                            <div class="mled-priority-row"><span class="mled-dot" style="background:#ef4444"></span>${tr('redPriority')}</div>
                            <div class="mled-priority-row"><span class="mled-dot" style="background:#3b82f6"></span>${tr('bluePriority')}</div>
                        </article>
                    </aside>
                </div>

                <div id="mled-view-editor" class="mled-view" role="tabpanel" aria-labelledby="mled-tab-editor" hidden>
                <aside class="mled-sidebar mled-sidebar-left">
                    <article class="mled-card mled-colors-card">
                        <h2>${tr('colorsTitle')}</h2>
                        <span class="mled-field-label">${tr('quickPalette')}</span>
                        <div class="mled-palette" id="mled-palette"></div>

                        <span class="mled-field-label">${tr('colorPicker')}</span>
                        <div class="mled-color-gamut" id="mled-color-gamut"><div class="mled-color-gamut-cursor" id="mled-color-gamut-cursor"></div></div>
                        <div class="mled-color-hue" id="mled-color-hue"><div class="mled-color-hue-cursor" id="mled-color-hue-cursor"></div></div>
                        <div class="mled-color-custom">
                            <span class="mled-color-current-swatch" id="mled-color-swatch"></span>
                            <input type="text" id="mled-color-hex" value="#ff0000">
                        </div>

                        <div class="mled-color-saved-head">
                            <span class="mled-field-label">${tr('savedColors')}</span>
                            <button type="button" class="mled-btn mled-btn-small" id="mled-color-save-btn" title="${tr('saveColorTitle')}">+</button>
                        </div>
                        <div class="mled-palette mled-color-saved" id="mled-color-saved-list"></div>
                    </article>
                </aside>
                <div class="mled-shell">
                    <div class="mled-top-fields">
                        <label class="mled-field"><span>${tr('announcementNameLabel')}</span><input type="text" id="mled-name" placeholder="${tr('announcementNamePlaceholder')}"></label>
                        <label class="mled-field"><span>${tr('assignMachineLabel')}</span><select id="mled-machine"></select></label>
                        <label class="mled-field"><span>${tr('priorityLabel')}</span><select id="mled-priority">${PRIORITIES.map((item) => `<option value="${item.value}">${item.label}</option>`).join('')}</select></label>
                    </div>

                    <div class="mled-editor-card">
                        <div class="mled-editor-card-head">
                            <h2>${tr('editor1632')}</h2>
                            <small>${tr('pixels1632')}</small>
                        </div>
                        <div class="mled-toolbar" id="mled-toolbar">
                            <button type="button" class="mled-tool" data-tool="pencil" title="${tr('pencilTitle')}">✏</button>
                            <button type="button" class="mled-tool" data-tool="eraser" title="${tr('eraserTitle')}">⌫</button>
                            <button type="button" class="mled-tool" data-tool="line" title="${tr('lineTitle')}">╱</button>
                            <button type="button" class="mled-tool" data-tool="rect" title="${tr('rectTitle')}">▭</button>
                            <button type="button" class="mled-tool" data-tool="ellipse" title="${tr('ellipseTitle')}">◯</button>
                            <button type="button" class="mled-tool" data-tool="bucket" title="${tr('bucketTitle')}">▨</button>
                            <button type="button" class="mled-tool" data-tool="eyedropper" title="${tr('eyedropperTitle')}">✒</button>
                            <label class="mled-tool mled-tool-file" title="${tr('importImageTitle')}">🖼<input type="file" id="mled-import-input" accept="image/*" hidden></label>
                            <button type="button" class="mled-tool" data-tool="text" title="${tr('textTitle')}">T</button>
                            <button type="button" class="mled-tool mled-tool-danger" id="mled-clear-all-btn" title="${tr('clearAllTitle')}">🗑</button>
                        </div>
                        <div class="mled-text-tool" id="mled-text-tool" hidden>
                            <input type="text" id="mled-text-tool-input" placeholder="${tr('textPlaceholder')}" maxlength="20">
                            <label class="mled-text-tool-num"><span>${tr('rowLabel')}</span><input type="number" id="mled-text-tool-row" min="0" max="15" value="1" title="${tr('rowTitle')}"></label>
                            <label class="mled-text-tool-num"><span>${tr('columnLabel')}</span><input type="number" id="mled-text-tool-col" min="0" max="31" value="0" title="${tr('columnTitle')}"></label>
                            <button type="button" class="mled-btn mled-btn-small" id="mled-text-tool-place">${tr('placeBtn')}</button>
                        </div>
                        <div class="mled-grid" id="mled-editor-grid"></div>
                        <button type="button" class="mled-btn mled-btn-primary mled-btn-large" id="mled-send-btn">▷ ${tr('livePreviewBtn')}</button>
                    </div>

                    <div class="mled-templates-card">
                        <h2>${tr('templatesTitle')}</h2>
                        <div class="mled-templates" id="mled-templates"></div>
                    </div>

                    <div class="mled-main-columns">
                        <article class="mled-card">
                            <h2>${tr('schedulingTitle')}</h2>
                            <label class="mled-field"><span>${tr('playbackModeLabel')}</span><select id="mled-mode"><option value="manual">${tr('manualOption')}</option><option value="programado">${tr('scheduledOption')}</option></select></label>
                            <label class="mled-field"><span>${tr('startDateLabel')}</span><input type="datetime-local" id="mled-start-at"></label>
                            <label class="mled-field"><span>${tr('endDateLabel')}</span><input type="datetime-local" id="mled-end-at"></label>
                            <span class="mled-field-label">${tr('repeatLabel')}</span>
                            <div class="mled-repeat-days" id="mled-repeat-days"></div>
                        </article>

                        <article class="mled-card">
                            <h2>${tr('durationTitle')}</h2>
                            <label class="mled-field"><span>${tr('screenTimeLabel')}</span><input type="range" id="mled-duration-range" min="1" max="30" value="5"><input type="number" id="mled-duration" min="1" max="60" value="5"></label>
                            <label class="mled-field"><span>${tr('transitionLabel')}</span><input type="range" id="mled-transition-range" min="0" max="5" value="1"><input type="number" id="mled-transition" min="0" max="10" value="1"></label>
                        </article>

                        <article class="mled-card">
                            <h2>${tr('assignmentTitle')}</h2>
                            <label class="mled-field"><span>${tr('groupLabel')}</span><select id="mled-group-select"></select><input type="hidden" id="mled-group"></label>
                            <span class="mled-field-label">${tr('tagsLabel')}</span>
                            <div class="mled-tags" id="mled-tags-list"></div>
                            <div class="mled-tag-add">
                                <input type="text" id="mled-tag-input" placeholder="${tr('addTagPlaceholder')}" maxlength="24">
                                <button type="button" class="mled-btn mled-btn-small" id="mled-tag-add-btn">+</button>
                            </div>
                        </article>
                    </div>

                    <div class="mled-actions-row">
                        <button type="button" class="mled-btn mled-btn-primary" id="mled-save-btn">${tr('saveAnnouncementBtn')}</button>
                        <button type="button" class="mled-btn" id="mled-cancel-btn">${tr('cancelBtn')}</button>
                        <span class="mled-inline-msg" id="mled-save-msg"></span>
                    </div>

                    <div class="mled-table-card">
                        <div class="mled-table-head">
                            <h2>${tr('savedAnnouncementsTitle')}</h2>
                            <input type="search" id="mled-search" placeholder="${tr('searchAnnouncementsPlaceholder')}">
                        </div>
                        <div class="mled-table-scroll">
                            <table class="mled-table">
                                <thead><tr><th>${tr('colName')}</th><th>${tr('colMachine')}</th><th>${tr('colResolution')}</th><th>${tr('colDuration')}</th><th>${tr('colPriority')}</th><th>${tr('colStatus')}</th><th>${tr('colActions')}</th></tr></thead>
                                <tbody id="mled-announcements-body"></tbody>
                            </table>
                        </div>
                    </div>

                    <div class="mled-table-card">
                        <div class="mled-table-head">
                            <h2>${tr('machineAlertsTitle')}</h2>
                        </div>
                        <p class="mled-sub">${tr('machineAlertsHint')}</p>
                        <div class="mled-table-scroll">
                            <table class="mled-table">
                                <thead><tr><th>${tr('colMachine')}</th><th>${tr('colStatus')}</th><th>${tr('colActions')}</th></tr></thead>
                                <tbody id="mled-machine-alerts-body"></tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <aside class="mled-sidebar">
                    <article class="mled-card">
                        <h2>${tr('previewTitle')}</h2>
                        <div class="mled-preview-display"><div class="mled-preview-grid" id="mled-preview-grid"></div></div>
                        <small class="mled-preview-caption">${tr('pixels1632')}</small>
                    </article>

                    <article class="mled-card">
                        <h2>${tr('savedAnnouncementsTitle')}</h2>
                        <div class="mled-sidebar-scenes" id="mled-sidebar-announcements"></div>
                    </article>

                    <article class="mled-card">
                        <h2>${tr('effectsTitle')}</h2>
                        <label class="mled-field"><span>${tr('entryEffectLabel')}</span><select id="mled-entry-effect">${ENTRY_EFFECTS.map((item) => `<option value="${item.value}">${item.label}</option>`).join('')}</select></label>
                        <span class="mled-field-label">${tr('sendAnimationLabel')}</span>
                        <label class="mled-checkbox"><input type="checkbox" id="mled-animate-col"><span>${tr('animateColumnLabel')}</span></label>
                        <label class="mled-checkbox"><input type="checkbox" id="mled-animate-row"><span>${tr('animateRowLabel')}</span></label>
                        <label class="mled-field"><span>${tr('speedLabel')}</span><input type="range" id="mled-speed" min="0" max="100" value="80"></label>
                        <label class="mled-field"><span>${tr('exitEffectLabel')}</span><select id="mled-exit-effect">${EXIT_EFFECTS.map((item) => `<option value="${item.value}">${item.label}</option>`).join('')}</select></label>
                        <label class="mled-field"><span>${tr('pauseLabel')}</span><input type="number" id="mled-pause" min="0" max="30" value="2"></label>
                    </article>
                </aside>
                </div>
${fkViewHtml()}

                <div class="mled-modal" id="mled-config-modal" hidden>
                    <div class="mled-modal-backdrop" data-mled-config-close></div>
                    <div class="mled-modal-dialog">
                        <div class="mled-modal-head"><strong>${tr('accessoryConfigTitle')}</strong><button type="button" data-mled-config-close>×</button></div>
                        <p class="mled-sub">${tr('accessoryConfigModalDesc')}</p>
                        <label class="mled-field"><span>${tr('accessoryIpLabel')}</span><input type="text" id="mled-ip" placeholder="192.168.0.85"></label>
                        <label class="mled-field"><span>${tr('usernameLabel')}</span><input type="text" id="mled-username" placeholder="nopal"></label>
                        <label class="mled-field"><span id="mled-password-label">${tr('passwordLabel')}</span><input type="password" id="mled-password" placeholder="•••••••••"></label>
                        <label class="mled-checkbox"><input type="checkbox" id="mled-auto-alerts"><span>${tr('jobDoneOnlyAlert')}</span></label>
                        <div class="mled-row">
                            <button type="button" class="mled-btn mled-btn-primary" id="mled-save-config-btn">${tr('saveBtn')}</button>
                            <span class="mled-inline-msg" id="mled-config-msg"></span>
                        </div>
                    </div>
                </div>

                <div class="mled-modal" id="mled-machine-alerts-modal" hidden>
                    <div class="mled-modal-backdrop" data-mled-machine-alerts-close></div>
                    <div class="mled-modal-dialog">
                        <div class="mled-modal-head">
                            <div>
                                <small class="mled-modal-eyebrow">${tr('machineAlertsEyebrow')}</small>
                                <strong id="mled-machine-alerts-title">${tr('visualAlertsTitle')}</strong>
                            </div>
                            <button type="button" data-mled-machine-alerts-close>×</button>
                        </div>
                        <label class="mled-checkbox">
                            <input type="checkbox" id="mled-machine-alerts-enabled">
                            <span>${tr('machineAlertsCheckboxLabel')}</span>
                        </label>
                        <span class="mled-field-label">${tr('announcementPerState')}</span>
                        <div id="mled-machine-alerts-states"></div>
                        <div class="mled-row">
                            <button type="button" class="mled-btn mled-btn-primary" id="mled-machine-alerts-save-btn">${tr('saveBtn')}</button>
                            <span class="mled-inline-msg" id="mled-machine-alerts-msg"></span>
                        </div>
                    </div>
                </div>
            </section>
        `;
    }

    function bindEvents() {
        wireGridPointerEvents(root.querySelector('#mled-editor-grid'));

        root.querySelectorAll('[data-tool]').forEach((button) => {
            button.addEventListener('click', () => {
                state.activeTool = button.dataset.tool;
                root.querySelectorAll('[data-tool]').forEach((btn) => btn.classList.toggle('is-active', btn === button));
                root.querySelector('#mled-text-tool').hidden = state.activeTool !== 'text';
            });
        });
        root.querySelector('[data-tool="pencil"]')?.classList.add('is-active');

        root.querySelector('#mled-clear-all-btn').addEventListener('click', async () => {
            const message = tr('confirmClearAll');
            const confirmed = window.appConfirm ? await window.appConfirm(message, tr('clearAllConfirmTitle'), 'danger') : window.confirm(message);
            if (!confirmed) return;
            draft.matrix = emptyMatrix();
            renderEditor();
        });

        root.querySelector('#mled-import-input').addEventListener('change', async (event) => {
            const file = event.target.files?.[0];
            if (file) await importImageFile(file);
            event.target.value = '';
        });

        root.querySelector('#mled-text-tool-place').addEventListener('click', () => {
            const text = root.querySelector('#mled-text-tool-input').value.trim();
            if (!text) return;
            const row = Number(root.querySelector('#mled-text-tool-row').value) || 0;
            const col = Number(root.querySelector('#mled-text-tool-col').value) || 0;
            stampText(draft.matrix, [text], state.drawColor, row, col);
            renderEditor();
        });

        root.querySelector('#mled-color-hex').addEventListener('change', (event) => {
            const value = event.target.value.replace('#', '');
            if (/^[0-9a-fA-F]{6}$/.test(value)) { state.drawColor = value; syncColorInputs(); }
        });
        root.querySelector('#mled-color-save-btn').addEventListener('click', () => {
            const saved = readSavedColors();
            if (!saved.includes(state.drawColor)) {
                saved.unshift(state.drawColor);
                writeSavedColors(saved);
                renderSavedColors();
            }
        });
        bindColorGamutPointer();

        root.querySelector('#mled-mode').addEventListener('change', () => { draft.mode = root.querySelector('#mled-mode').value; syncModeFieldsDisabled(); });

        root.querySelectorAll('input[type="range"]').forEach((range) => {
            const pairedId = range.id.replace('-range', '');
            const numberInput = root.querySelector(`#${pairedId}`);
            if (!numberInput || numberInput === range) return;
            range.addEventListener('input', () => { numberInput.value = range.value; });
            numberInput.addEventListener('input', () => { range.value = numberInput.value; });
        });

        root.querySelector('#mled-tag-add-btn').addEventListener('click', () => {
            const input = root.querySelector('#mled-tag-input');
            const value = input.value.trim();
            if (value && !state.tags.includes(value)) { state.tags.push(value); renderTags(); }
            input.value = '';
        });
        root.querySelector('#mled-tag-input').addEventListener('keydown', (event) => {
            if (event.key === 'Enter') { event.preventDefault(); root.querySelector('#mled-tag-add-btn').click(); }
        });

        root.querySelector('#mled-group-select').addEventListener('change', (event) => {
            draft.group = event.target.value;
            root.querySelector('#mled-group').value = event.target.value;
        });

        root.querySelector('#mled-save-btn').addEventListener('click', saveAnnouncement);
        root.querySelector('#mled-send-btn').addEventListener('click', sendDraftNow);
        root.querySelector('#mled-cancel-btn').addEventListener('click', resetDraft);

        root.querySelector('#mled-search').addEventListener('input', (event) => {
            state.searchQuery = event.target.value;
            renderAnnouncementsTable();
        });

        root.querySelector('#mled-config-open-btn').addEventListener('click', () => {
            root.querySelector('#mled-config-modal').hidden = false;
        });
        root.querySelectorAll('[data-mled-config-close]').forEach((el) => {
            el.addEventListener('click', () => { root.querySelector('#mled-config-modal').hidden = true; });
        });
        root.querySelector('#mled-save-config-btn').addEventListener('click', saveConfig);

        root.querySelectorAll('.mled-view-tab').forEach((tab) => {
            tab.addEventListener('click', () => switchDashView(tab.dataset.view));
        });
        bindTabCards();

        root.querySelectorAll('[data-mled-machine-alerts-close]').forEach((el) => {
            el.addEventListener('click', () => { root.querySelector('#mled-machine-alerts-modal').hidden = true; });
        });
        root.querySelector('#mled-machine-alerts-save-btn').addEventListener('click', saveMachineAlertsModal);

        root.querySelector('#mled-diag-test-btn').addEventListener('click', async (event) => {
            const button = event.currentTarget;
            button.disabled = true;
            button.textContent = tr('testing');
            await refreshStatus();
            await loadLastError();
            button.disabled = false;
            button.textContent = tr('testConnectionBtn');
        });

        root.querySelector('#mled-scenes-prev').addEventListener('click', () => scrollQuickScenes(-1));
        root.querySelector('#mled-scenes-next').addEventListener('click', () => scrollQuickScenes(1));
        if (window.ResizeObserver) {
            scenesResizeObserver = new ResizeObserver(() => updateScenesArrowVisibility());
            scenesResizeObserver.observe(root.querySelector('#mled-quick-scenes'));
        }

        fkBindEvents();

        renderTemplates();
        renderPalette();
        renderSavedColors();
        syncColorInputs();
    }

    function mount() {
        if (document.getElementById(`${PLUGIN_ID}-section`)) return;

        const pluginsContainer = document.querySelector('.nav-category[data-group="plugins"] .nav-category-items');
        const navButton = document.createElement('button');
        navButton.className = 'nav-item';
        navButton.dataset.section = PLUGIN_ID;
        navButton.dataset.pluginNav = PLUGIN_ID;
        // SVG real, no un emoji en <span> -- el CSS del sidebar contraído
        // oculta TODOS los <span> del botón (ver .sidebar-collapsed
        // .nav-item span en style.css), así que un ícono envuelto en
        // <span> desaparecía entero al contraer. El resto de los plugins
        // ya usa <svg> (inmune a esa regla) por esta misma razón.
        navButton.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg><span>${esc(tr('matrixLedNavLabel'))}</span>`;
        navButton.addEventListener('click', () => window.switchSection?.(PLUGIN_ID));
        pluginsContainer?.appendChild(navButton);

        const wrapper = document.createElement('div');
        wrapper.innerHTML = moduleHtml().trim();
        root = wrapper.firstElementChild;
        document.querySelector('.content')?.appendChild(root);

        bindEvents();
        fillDraftForm();
        switchDashView('dashboard');
        loadConfig().then(() => { refreshStatus(); syncMachinePolling(); });
        loadMachinesForForm().then(() => loadDashboard());
        loadAnnouncements();
        statusTimer = window.setInterval(refreshStatus, 10000);
        startTabCards();
        window.applySidebarOrder?.();
    }

    function unmount() {
        if (statusTimer) { window.clearInterval(statusTimer); statusTimer = null; }
        if (machinesTimer) { window.clearInterval(machinesTimer); machinesTimer = null; }
        if (materialsTimer) { window.clearInterval(materialsTimer); materialsTimer = null; }
        if (machineAlertRotationTimer) { window.clearInterval(machineAlertRotationTimer); machineAlertRotationTimer = null; }
        if (scenesResizeObserver) { scenesResizeObserver.disconnect(); scenesResizeObserver = null; }
        fkStopPolling();
        stopTabCards();
        document.removeEventListener('visibilitychange', fkOnVisibilityChange);
        document.querySelector(`[data-plugin-nav="${PLUGIN_ID}"]`)?.remove();
        document.getElementById(`${PLUGIN_ID}-section`)?.remove();
        root?.remove();
        root = null;
    }

    window.NopalPluginRegistry = window.NopalPluginRegistry || {};
    window.NopalPluginRegistry[PLUGIN_ID] = { mount, unmount, version: '0.9.0' };
    mount();
})();
