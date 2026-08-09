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
                onToggle: async () => {
                    if (idleRule) {
                        await api(`/rules/${encodeURIComponent(idleRule.id)}`, { method: 'PUT', body: JSON.stringify({ enabled: !idleRule.enabled }) });
                    } else {
                        const announcement = await ensureAnnouncementByName(tr('tplNightMode'), 'tpl-nocturno');
                        await api('/rules', { method: 'POST', body: JSON.stringify({ name: tr('suggestionIdleTitle'), trigger: 'idle_timeout', idle_minutes: 5, announcement_id: announcement.id, enabled: true }) });
                    }
                    await loadRules();
                },
            },
            {
                id: 'material', icon: '🧵', available: true,
                title: tr('suggestionMaterialTitle'),
                detail: tr('suggestionMaterialDetail', { suffix: materialDetected ? tr('detectedNowSuffix') : '' }),
                active: !!materialRule?.enabled,
                onToggle: async () => {
                    if (materialRule) {
                        await api(`/rules/${encodeURIComponent(materialRule.id)}`, { method: 'PUT', body: JSON.stringify({ enabled: !materialRule.enabled }) });
                    } else {
                        const announcement = await ensureAnnouncementByName(tr('tplLowMaterial'), 'tpl-material-bajo');
                        await api('/rules', { method: 'POST', body: JSON.stringify({ name: tr('tplLowMaterial'), trigger: 'material_low', announcement_id: announcement.id, enabled: true }) });
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
                    <strong>${esc(item.title)}</strong>
                    <small>${esc(item.detail)}</small>
                </div>
                ${item.available
                    ? `<button type="button" class="mled-btn mled-btn-small ${item.active ? 'mled-btn-primary' : ''}" data-suggestion="${item.id}" title="${item.active ? tr('clickToDeactivate') : tr('clickToActivate')}">${item.active ? tr('activeBadge') : tr('activateBtn')}</button>`
                    : `<span class="mled-badge mled-badge-estado">${tr('notAvailableBadge')}</span>`}
            </div>
        `).join('');

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
        root.querySelectorAll('.mled-view-tab').forEach((tab) => tab.classList.toggle('is-active', tab.dataset.view === view));
        root.querySelector('#mled-view-dashboard').hidden = view !== 'dashboard';
        root.querySelector('#mled-view-editor').hidden = view !== 'editor';
        const title = root.querySelector('#mled-page-title');
        const sub = root.querySelector('#mled-page-sub');
        if (view === 'dashboard') {
            title.textContent = tr('dashboardTitle');
            sub.textContent = tr('dashboardSub');
        } else {
            title.textContent = tr('editorTitle');
            sub.textContent = tr('editorSub');
        }
        if (view === 'dashboard') updateScenesArrowVisibility();
    }

    async function loadDashboard() {
        await Promise.all([loadDeviceInfo(), loadLastSent(), loadLastError(), loadStats(), loadRules(), loadMaterialAlerts(), loadMachineAlerts()]);
        renderKPIs();
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

                <div class="mled-view-tabs">
                    <button type="button" class="mled-view-tab is-active" data-view="dashboard">${tr('tabMainPanel')}</button>
                    <button type="button" class="mled-view-tab" data-view="editor">${tr('editorTitle')}</button>
                </div>

                <div id="mled-view-dashboard" class="mled-view">
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

                <div id="mled-view-editor" class="mled-view" hidden>
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
        window.applySidebarOrder?.();
    }

    function unmount() {
        if (statusTimer) { window.clearInterval(statusTimer); statusTimer = null; }
        if (machinesTimer) { window.clearInterval(machinesTimer); machinesTimer = null; }
        if (materialsTimer) { window.clearInterval(materialsTimer); materialsTimer = null; }
        if (machineAlertRotationTimer) { window.clearInterval(machineAlertRotationTimer); machineAlertRotationTimer = null; }
        if (scenesResizeObserver) { scenesResizeObserver.disconnect(); scenesResizeObserver = null; }
        document.querySelector(`[data-plugin-nav="${PLUGIN_ID}"]`)?.remove();
        document.getElementById(`${PLUGIN_ID}-section`)?.remove();
        root?.remove();
        root = null;
    }

    window.NopalPluginRegistry = window.NopalPluginRegistry || {};
    window.NopalPluginRegistry[PLUGIN_ID] = { mount, unmount, version: '0.9.0' };
    mount();
})();
