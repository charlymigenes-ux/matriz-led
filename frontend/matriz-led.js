// Matriz LED -- panel de configuración y envío de mensajes a una pantalla
// LED BLE (tipo iPixel Color), conectada vía el relay del firmware
// Nopal_FF.ino (ver backend/services/screen_service.py de este plugin).
//
// El saludo "NOPAL" al conectar NO vive acá -- lo dispara el backend solo
// (ver screen_service._greet_if_just_connected), como efecto de que este
// mismo archivo ya sondea /status cada 10s sin importar qué sección del
// dashboard esté abierta.
//
// v0.2: config + estado + mensaje de prueba + catálogo de alertas rápidas
// + aviso automático cuando un trabajo termina o falla (comparando contra
// /api/plugins/matriz-led/machines, sondeado acá mismo).
// v0.2.1: selector de tamaño de letra en el mensaje de prueba (16/24/32,
// ver SUPPORTED_CHAR_HEIGHTS en screen_service.py -- solo 16 confirmado en
// la pantalla física de 16 filas).
// v0.3.0: rediseño "Animaciones RGB" (tarjetas de demo + controles de
// animación/velocidad/arcoíris) y un editor de píxeles 16x32 con vista
// previa -- el patrón dibujado se manda tal cual con POST /image (ver
// screen_service.send_matrix), no como texto. Pendiente:
// escenas/macros/rutinas completas.
(() => {
    const PLUGIN_ID = 'matriz-led';

    if (window.NopalPluginRegistry?.[PLUGIN_ID]) {
        return;
    }

    const API_BASE = '/api/plugins/matriz-led';
    const MACHINES_POLL_MS = 8000;
    const DONE_STATES = new Set(['complete', 'completed']);
    const ERROR_STATES = new Set(['error']);

    const MATRIX_COLS = 32;
    const MATRIX_ROWS = 16;

    const ALERT_PRESETS = [
        { id: 'ready', label: 'Listo', text: 'OK', color: '22c55e' },
        { id: 'error', label: 'Error', text: 'ERR', color: 'ef4444' },
        { id: 'warn', label: 'Atención', text: 'ATN', color: 'f59e0b' },
        { id: 'emergency', label: 'Emergencia', text: 'EMG', color: 'ff0000' },
    ];

    const DEMO_PRESETS = [
        { id: 'temp-low', text: 'TEMP BAJA', color: '1ec7ff', animation: 0, speed: 70, rainbow_mode: 0 },
        { id: 'temp-mid', text: 'TEMP MEDIA', color: '88ff6b', animation: 0, speed: 80, rainbow_mode: 0 },
        { id: 'temp-high', text: 'TEMP ALTA', color: 'ff5c5c', animation: 1, speed: 90, rainbow_mode: 0 },
        { id: 'idle', text: 'IDLE 5M', color: 'a970ff', animation: 0, speed: 60, rainbow_mode: 0 },
    ];

    const AUTO_ALERTS = {
        done: { text: 'OK', color: '22c55e' },
        error: { text: 'ERR', color: 'ef4444' },
    };

    const state = {
        config: { ip: '', username: '', has_password: false, auto_alerts: false },
        status: { configured: false, connected: false },
        sending: false,
        textSizes: { sizes: [16], recommended: 16 },
        editorPresetId: 'temp-high',
        matrixDraft: [],
        selectedMachineState: 'idle',
    };

    let root = null;
    let statusTimer = null;
    let machinesTimer = null;
    let alertQueue = Promise.resolve();
    // id de máquina -> último estado visto, solo para detectar la
    // TRANSICIÓN hacia "terminado"/"error" (no repetir la alerta en cada
    // sondeo mientras el estado no cambia).
    const lastMachineStates = new Map();

    function esc(value) {
        return String(value ?? '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[char]));
    }

    function createEmptyMatrix() {
        return Array.from({ length: MATRIX_ROWS }, () => Array.from({ length: MATRIX_COLS }, () => false));
    }

    function seedMatrixForPreset(presetId) {
        const matrix = createEmptyMatrix();
        const preset = DEMO_PRESETS.find((item) => item.id === presetId);
        if (!preset) return matrix;
        if (preset.id === 'temp-low') {
            for (let row = 0; row < MATRIX_ROWS; row += 1) {
                for (let col = 0; col < MATRIX_COLS; col += 1) {
                    matrix[row][col] = ((row + col) % 5 === 0) || ((row + col) % 7 === 0);
                }
            }
        } else if (preset.id === 'temp-mid') {
            for (let row = 0; row < MATRIX_ROWS; row += 1) {
                for (let col = 0; col < MATRIX_COLS; col += 1) {
                    matrix[row][col] = row > (MATRIX_ROWS / 2) && col % 3 === 0;
                }
            }
        } else if (preset.id === 'temp-high') {
            for (let row = 0; row < MATRIX_ROWS; row += 1) {
                for (let col = 0; col < MATRIX_COLS; col += 1) {
                    matrix[row][col] = col < 3 || row < 3 || (row > 24 && col > 8) || ((row + col) % 6 === 0);
                }
            }
        } else {
            for (let row = 0; row < MATRIX_ROWS; row += 1) {
                for (let col = 0; col < MATRIX_COLS; col += 1) {
                    matrix[row][col] = (row > 8 && row < 24 && col > 3 && col < 12) || (row % 5 === 0 && col % 4 === 0);
                }
            }
        }
        return matrix;
    }

    function loadDraftFromLocalStorage() {
        const saved = localStorage.getItem(`mled-matrix-${state.editorPresetId}`);
        if (!saved) {
            state.matrixDraft = seedMatrixForPreset(state.editorPresetId);
            return;
        }
        try {
            const parsed = JSON.parse(saved);
            state.matrixDraft = Array.isArray(parsed) && parsed.length === MATRIX_ROWS ? parsed : seedMatrixForPreset(state.editorPresetId);
        } catch {
            state.matrixDraft = seedMatrixForPreset(state.editorPresetId);
        }
    }

    function saveDraftToLocalStorage() {
        localStorage.setItem(`mled-matrix-${state.editorPresetId}`, JSON.stringify(state.matrixDraft));
    }

    function renderMatrixEditor() {
        const matrixWrap = root.querySelector('#mled-matrix-editor');
        if (!matrixWrap) return;
        const cells = state.matrixDraft.flat().map((isOn, index) => {
            const row = Math.floor(index / MATRIX_COLS);
            const col = index % MATRIX_COLS;
            return `<button type="button" class="mled-matrix-cell ${isOn ? 'is-on' : ''}" data-matrix-row="${row}" data-matrix-col="${col}" aria-label="LED fila ${row + 1} columna ${col + 1}"></button>`;
        }).join('');
        matrixWrap.innerHTML = `<div class="mled-matrix-grid">${cells}</div>`;
        matrixWrap.querySelectorAll('[data-matrix-row]').forEach((cell) => {
            cell.addEventListener('click', () => {
                const row = Number(cell.dataset.matrixRow);
                const col = Number(cell.dataset.matrixCol);
                state.matrixDraft[row][col] = !state.matrixDraft[row][col];
                cell.classList.toggle('is-on', state.matrixDraft[row][col]);
            });
        });
    }

    function calculateDraftMetrics() {
        const total = state.matrixDraft.flat().length;
        const active = state.matrixDraft.flat().filter(Boolean).length;
        const density = total ? Math.round((active / total) * 100) : 0;
        const rows = state.matrixDraft.map((row) => row.some(Boolean)).filter(Boolean).length;
        const cols = state.matrixDraft[0]?.map((_, colIndex) => state.matrixDraft.some((row) => row[colIndex])).filter(Boolean).length || 0;
        const severity = density > 55 ? 'alto' : density > 25 ? 'medio' : 'bajo';
        return { total, active, density, rows, cols, severity };
    }

    function renderPreviewMatrix() {
        const preview = root.querySelector('#mled-preview-display');
        const stateLabel = root.querySelector('#mled-preview-state-label');
        const detail = root.querySelector('#mled-preview-detail');
        if (!preview) return;
        const cells = state.matrixDraft.flat().map((isOn) => `<span class="mled-preview-cell ${isOn ? 'is-on' : ''}"></span>`).join('');
        preview.innerHTML = `<div class="mled-preview-grid">${cells}</div>`;
        if (stateLabel) {
            const labels = {
                idle: 'En espera',
                printing: 'Imprimiendo',
                warning: 'Advertencia',
                error: 'Error',
            };
            stateLabel.textContent = labels[state.selectedMachineState] || 'En espera';
        }
        if (detail) {
            const metrics = calculateDraftMetrics();
            detail.textContent = `Patrón ${metrics.severity} · ${metrics.active}/${metrics.total} píxeles activos`;
        }
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

    function moduleHtml() {
        return `
            <section id="${PLUGIN_ID}-section" class="view-section mled-section" style="display:none">
                <div class="mled-shell">
                    <header class="mled-hero">
                        <div class="mled-hero-copy">
                            <h1>Animaciones RGB · Matriz 16×32</h1>
                            <p>Ejemplos de animaciones para representar estados del dispositivo de forma clara y atractiva.</p>
                        </div>
                        <span class="mled-status-pill" id="mled-status-pill">
                            <span class="mled-status-dot"></span>
                            <span id="mled-status-text">Comprobando…</span>
                        </span>
                    </header>

                    <div class="mled-kpi-grid">
                        <article class="mled-kpi-card">
                            <span class="mled-kpi-icon">▣</span>
                            <div>
                                <strong>16 × 32 RGB</strong>
                                <small>512 píxeles totales</small>
                            </div>
                        </article>
                        <article class="mled-kpi-card">
                            <span class="mled-kpi-icon">⏱</span>
                            <div>
                                <strong>Uso recomendado</strong>
                                <small>Estados y notificaciones</small>
                            </div>
                        </article>
                    </div>

                    <div class="mled-main-layout">
                        <div class="mled-primary-column">
                            <div class="mled-demo-grid">
                                <article class="mled-demo-card" data-demo-btn="temp-low">
                                    <div class="mled-demo-number">1</div>
                                    <h2>TEMP BAJA</h2>
                                    <div class="mled-demo-display demo-blue">TEMP BAJA</div>
                                    <div class="mled-demo-meta">
                                        <span>Olas suaves</span>
                                        <small>Temperatura baja · Todo en calma</small>
                                    </div>
                                    <div class="mled-demo-actions">
                                        <button type="button" class="mled-btn mled-btn-small" data-demo-edit="temp-low">Editar</button>
                                        <button type="button" class="mled-btn mled-btn-small" data-demo-send="temp-low">Enviar</button>
                                    </div>
                                </article>

                                <article class="mled-demo-card" data-demo-btn="temp-mid">
                                    <div class="mled-demo-number">2</div>
                                    <h2>TEMP MEDIA</h2>
                                    <div class="mled-demo-display demo-green">TEMP MEDIA</div>
                                    <div class="mled-demo-meta">
                                        <span>Barras por nivel</span>
                                        <small>Temperatura moderada · Estable</small>
                                    </div>
                                    <div class="mled-demo-actions">
                                        <button type="button" class="mled-btn mled-btn-small" data-demo-edit="temp-mid">Editar</button>
                                        <button type="button" class="mled-btn mled-btn-small" data-demo-send="temp-mid">Enviar</button>
                                    </div>
                                </article>

                                <article class="mled-demo-card" data-demo-btn="temp-high">
                                    <div class="mled-demo-number">3</div>
                                    <h2>TEMP ALTA</h2>
                                    <div class="mled-demo-display demo-red">TEMP ALTA</div>
                                    <div class="mled-demo-meta">
                                        <span>Llamas reactivas</span>
                                        <small>Temperatura alta · Atención requerida</small>
                                    </div>
                                    <div class="mled-demo-actions">
                                        <button type="button" class="mled-btn mled-btn-small" data-demo-edit="temp-high">Editar</button>
                                        <button type="button" class="mled-btn mled-btn-small" data-demo-send="temp-high">Enviar</button>
                                    </div>
                                </article>

                                <article class="mled-demo-card" data-demo-btn="idle">
                                    <div class="mled-demo-number">4</div>
                                    <h2>IDLE 5 MIN</h2>
                                    <div class="mled-demo-display demo-purple">IDLE 5M</div>
                                    <div class="mled-demo-meta">
                                        <span>Modo reposivo visual</span>
                                        <small>Sin actividad por 5 minutos · Reposo visual</small>
                                    </div>
                                    <div class="mled-demo-actions">
                                        <button type="button" class="mled-btn mled-btn-small" data-demo-edit="idle">Editar</button>
                                        <button type="button" class="mled-btn mled-btn-small" data-demo-send="idle">Enviar</button>
                                    </div>
                                </article>
                            </div>

                            <div class="mled-lower-grid">
                                <article class="mled-card">
                                    <h2>Configuración del accesorio</h2>
                                    <p class="mled-sub">La IP y credenciales del ESP32 que hace de puente BLE.</p>
                                    <label class="mled-field">
                                        <span>IP del accesorio</span>
                                        <input type="text" id="mled-ip" placeholder="192.168.0.85">
                                    </label>
                                    <label class="mled-field">
                                        <span>Usuario</span>
                                        <input type="text" id="mled-username" placeholder="nopal">
                                    </label>
                                    <label class="mled-field">
                                        <span id="mled-password-label">Contraseña</span>
                                        <input type="password" id="mled-password" placeholder="•••••••••">
                                    </label>
                                    <label class="mled-checkbox">
                                        <input type="checkbox" id="mled-auto-alerts">
                                        <span>Avisar solo cuando un trabajo termine o falle</span>
                                    </label>
                                    <div class="mled-row">
                                        <button type="button" class="mled-btn mled-btn-primary" id="mled-save-config-btn">Guardar</button>
                                        <span class="mled-inline-msg" id="mled-config-msg"></span>
                                    </div>
                                </article>

                                <article class="mled-card">
                                    <h2>Alertas rápidas</h2>
                                    <p class="mled-sub">Mensajes cortos listos para usar — un clic, sin escribir nada.</p>
                                    <div class="mled-presets" id="mled-presets"></div>
                                    <span class="mled-inline-msg" id="mled-preset-msg"></span>
                                </article>

                                <article class="mled-card">
                                    <h2>Mensaje de prueba</h2>
                                    <p class="mled-sub">Manda texto directo a la pantalla con la misma librería que arma el protocolo real.</p>
                                    <label class="mled-field">
                                        <span>Texto (2-6 caracteres se ven mejor)</span>
                                        <input type="text" id="mled-text" placeholder="Hola" maxlength="60">
                                    </label>
                                    <label class="mled-field">
                                        <span>Color</span>
                                        <input type="color" id="mled-color" value="#ffffff">
                                    </label>
                                    <label class="mled-field">
                                        <span>Tamaño de letra</span>
                                        <select id="mled-char-height"></select>
                                    </label>
                                    <label class="mled-field">
                                        <span>Velocidad de animación</span>
                                        <input type="range" id="mled-speed" min="40" max="120" value="80">
                                    </label>
                                    <label class="mled-field">
                                        <span>Modo de animación</span>
                                        <select id="mled-animation">
                                            <option value="0">Estático</option>
                                            <option value="1">Parpadeo</option>
                                        </select>
                                    </label>
                                    <label class="mled-checkbox">
                                        <input type="checkbox" id="mled-rainbow">
                                        <span>Modo arcoíris</span>
                                    </label>
                                    <div class="mled-row">
                                        <button type="button" class="mled-btn mled-btn-primary" id="mled-send-btn">Enviar a la pantalla</button>
                                        <button type="button" class="mled-btn" id="mled-logo-btn">Enviar NOPAL</button>
                                        <span class="mled-inline-msg" id="mled-send-msg"></span>
                                    </div>
                                </article>
                            </div>
                        </div>

                        <aside class="mled-side-column">
                            <article class="mled-side-card mled-editor-card">
                                <div class="mled-preview-header-row">
                                    <div>
                                        <h2>Vista previa</h2>
                                        <div class="mled-preview-label">Pantalla real · 16×32 RGB</div>
                                    </div>
                                    <button type="button" class="mled-btn mled-btn-primary mled-btn-small" id="mled-save-grid-btn">Guardar</button>
                                </div>
                                <div id="mled-preview-display" class="mled-preview-display"></div>
                                <div class="mled-preview-meta">
                                    <div>
                                        <span>Estado asignado</span>
                                        <strong id="mled-preview-state-label">En espera</strong>
                                    </div>
                                    <div>
                                        <span>Detalle visual</span>
                                        <strong id="mled-preview-detail">Patrón sombreado</strong>
                                    </div>
                                </div>
                                <div class="mled-editor-controls">
                                    <label class="mled-field compact">
                                        <span>Asignar a función</span>
                                        <select id="mled-machine-state">
                                            <option value="idle">En espera</option>
                                            <option value="printing">Imprimiendo</option>
                                            <option value="warning">Advertencia</option>
                                            <option value="error">Error</option>
                                        </select>
                                    </label>
                                    <div class="mled-row start">
                                        <button type="button" class="mled-btn" id="mled-clear-grid-btn">Limpiar</button>
                                        <button type="button" class="mled-btn" id="mled-seed-grid-btn">Restaurar</button>
                                        <button type="button" class="mled-btn" id="mled-send-preview-btn">Enviar</button>
                                    </div>
                                    <div id="mled-matrix-editor" class="mled-matrix-editor"></div>
                                </div>
                                <div class="mled-inline-msg" id="mled-editor-msg"></div>
                            </article>

                            <article class="mled-side-card">
                                <h2>¿Cuándo usar 16×32 RGB?</h2>
                                <p>Ideal para mostrar estados del dispositivo con etiquetas cortas y animaciones simples que comuniquen de un vistazo.</p>
                                <ul class="mled-help-list">
                                    <li>Etiquetas cortas</li>
                                    <li>Mensajes breves y fáciles de leer</li>
                                    <li>Contraste RGB</li>
                                </ul>
                            </article>

                            <article class="mled-side-card">
                                <h2>Consejos para mejores resultados</h2>
                                <ul class="mled-help-list">
                                    <li>Usa 2-6 caracteres por mensaje.</li>
                                    <li>Evita texto largo o parpadeo rápido.</li>
                                    <li>Prioriza colores con alto contraste.</li>
                                    <li>Ajusta brillo según el entorno.</li>
                                </ul>
                            </article>
                        </aside>
                    </div>
                </div>
            </section>
        `;
    }

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
            text.textContent = 'Sin configurar';
        } else if (state.status.connected) {
            pill.classList.add('mled-status-ok');
            text.textContent = 'Conectada';
        } else {
            pill.classList.add('mled-status-warn');
            text.textContent = 'Configurada, sin conexión BLE';
        }
    }

    function fillConfigForm() {
        if (!root) return;
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

    async function loadTextSizes() {
        try {
            state.textSizes = await api('/text-sizes');
        } catch {
            state.textSizes = { sizes: [16], recommended: 16 };
        }
        const select = root.querySelector('#mled-char-height');
        select.innerHTML = state.textSizes.sizes.map((size) => (
            `<option value="${esc(size)}">${esc(size)} px${size === state.textSizes.recommended ? ' (recomendado)' : ''}</option>`
        )).join('');
        select.value = String(state.textSizes.recommended);
    }

    async function saveConfig() {
        const msg = root.querySelector('#mled-config-msg');
        msg.textContent = 'Guardando…';
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
            msg.textContent = 'Guardado';
            msg.classList.add('mled-inline-msg-ok');
            refreshStatus();
            syncMachinePolling();
        } catch (error) {
            msg.textContent = error.message || 'Error al guardar';
            msg.classList.add('mled-inline-msg-error');
        }
    }

    async function sendTestMessage() {
        if (state.sending) return;
        const text = root.querySelector('#mled-text').value.trim();
        const msg = root.querySelector('#mled-send-msg');
        if (!text) {
            msg.textContent = 'Escribe un texto primero';
            msg.className = 'mled-inline-msg mled-inline-msg-error';
            return;
        }
        state.sending = true;
        msg.textContent = 'Enviando… (puede tardar unos segundos)';
        msg.className = 'mled-inline-msg';
        const color = root.querySelector('#mled-color').value.replace('#', '');
        const charHeight = Number(root.querySelector('#mled-char-height').value) || state.textSizes.recommended;
        const animation = Number(root.querySelector('#mled-animation').value) || 0;
        const speed = Number(root.querySelector('#mled-speed').value) || 80;
        const rainbowMode = root.querySelector('#mled-rainbow').checked ? 1 : 0;
        try {
            const result = await api('/text', {
                method: 'POST',
                body: JSON.stringify({ text, color, animation, speed, rainbow_mode: rainbowMode, char_height: charHeight }),
            });
            msg.textContent = `Enviado (${result.windows_total ?? 1} ventana${(result.windows_total ?? 1) === 1 ? '' : 's'})`;
            msg.classList.add('mled-inline-msg-ok');
        } catch (error) {
            msg.textContent = error.message || 'Error al enviar';
            msg.classList.add('mled-inline-msg-error');
        } finally {
            state.sending = false;
        }
    }

    async function sendLogoMessage() {
        const msg = root.querySelector('#mled-send-msg');
        try {
            const charHeight = Number(root.querySelector('#mled-char-height').value) || state.textSizes.recommended;
            const result = await api('/text', {
                method: 'POST',
                body: JSON.stringify({ text: 'NOPAL', color: '22c55e', animation: 0, speed: 80, rainbow_mode: 0, char_height: charHeight }),
            });
            msg.textContent = `Logo NOPAL enviado (${result.windows_total ?? 1} ventana${(result.windows_total ?? 1) === 1 ? '' : 's'})`;
            msg.classList.add('mled-inline-msg-ok');
        } catch (error) {
            msg.textContent = error.message || 'Error al enviar';
            msg.classList.add('mled-inline-msg-error');
        }
    }

    // Encola envíos (de presets y de las alertas automáticas) en vez de
    // dispararlos en paralelo -- la pantalla solo puede mostrar un mensaje
    // a la vez, y dos ventanas BLE simultáneas pisándose entre sí es peor
    // que una cola simple FIFO.
    function enqueueSend(text, color, options = {}) {
        alertQueue = alertQueue
            .catch(() => {}) // un envío fallido no debe frenar la cola
            .then(() => api('/text', {
                method: 'POST',
                body: JSON.stringify({ text, color, ...options }),
            }));
        return alertQueue;
    }

    function renderPresets() {
        const container = root.querySelector('#mled-presets');
        container.innerHTML = ALERT_PRESETS.map((preset) => (
            `<button type="button" class="mled-btn mled-preset-btn" data-preset="${esc(preset.id)}" style="border-color:#${esc(preset.color)}">${esc(preset.label)}</button>`
        )).join('');
        container.querySelectorAll('[data-preset]').forEach((button) => {
            button.addEventListener('click', () => sendPreset(button.dataset.preset));
        });
    }

    async function sendPreset(presetId) {
        const preset = ALERT_PRESETS.find((item) => item.id === presetId);
        const msg = root.querySelector('#mled-preset-msg');
        if (!preset || !msg) return;
        msg.textContent = `Enviando "${preset.label}"…`;
        msg.className = 'mled-inline-msg';
        try {
            await enqueueSend(preset.text, preset.color);
            msg.textContent = `"${preset.label}" enviado`;
            msg.classList.add('mled-inline-msg-ok');
        } catch (error) {
            msg.textContent = error.message || 'Error al enviar';
            msg.classList.add('mled-inline-msg-error');
        }
    }

    async function sendDemoPreset(demoId) {
        const preset = DEMO_PRESETS.find((item) => item.id === demoId);
        const msg = root.querySelector('#mled-send-msg');
        if (!preset || !msg) return;
        msg.textContent = `Enviando "${preset.text}"…`;
        msg.className = 'mled-inline-msg';
        try {
            const charHeight = Number(root.querySelector('#mled-char-height').value) || state.textSizes.recommended;
            await enqueueSend(preset.text, preset.color, {
                animation: Number(preset.animation) || 0,
                speed: Number(preset.speed) || 80,
                rainbow_mode: Number(preset.rainbow_mode) || 0,
                char_height: charHeight,
            });
            msg.textContent = `Estado "${preset.text}" enviado`;
            msg.classList.add('mled-inline-msg-ok');
        } catch (error) {
            msg.textContent = error.message || 'Error al enviar';
            msg.classList.add('mled-inline-msg-error');
        }
    }

    async function sendMatrixDraft() {
        const msg = root.querySelector('#mled-editor-msg');
        if (!msg) return;
        msg.textContent = 'Mandando patrón…';
        msg.className = 'mled-inline-msg';
        const stateLabel = root.querySelector('#mled-preview-state-label')?.textContent || 'En espera';
        const color = root.querySelector('#mled-color')?.value?.replace('#', '') || '22c55e';
        try {
            // A diferencia de sendTestMessage/sendDemoPreset (que mandan
            // texto y pasan por una fuente), esto manda el patrón de
            // píxeles dibujado tal cual -- ver POST /image y
            // screen_service.send_matrix.
            alertQueue = alertQueue
                .catch(() => {})
                .then(() => api('/image', {
                    method: 'POST',
                    body: JSON.stringify({ matrix: state.matrixDraft, color }),
                }));
            await alertQueue;
            msg.textContent = `Patrón enviado para ${stateLabel}`;
            msg.classList.add('mled-inline-msg-ok');
        } catch (error) {
            msg.textContent = error.message || 'Error al enviar';
            msg.classList.add('mled-inline-msg-error');
        }
    }

    // Compara el estado de cada máquina contra el último visto y solo
    // avisa en la TRANSICIÓN hacia terminado/error -- si no, cada sondeo
    // (cada MACHINES_POLL_MS) volvería a mandar el mismo aviso mientras el
    // trabajo siga en ese estado.
    async function pollMachines() {
        let machines;
        try {
            ({ machines } = await api('/machines'));
        } catch {
            return;
        }
        const seenIds = new Set();
        for (const machine of machines) {
            const id = machine.id;
            const currentState = machine?.status?.state;
            seenIds.add(id);
            const previousState = lastMachineStates.get(id);
            lastMachineStates.set(id, currentState);
            if (previousState === currentState) continue;
            if (DONE_STATES.has(currentState)) {
                enqueueSend(AUTO_ALERTS.done.text, AUTO_ALERTS.done.color).catch(() => {});
            } else if (ERROR_STATES.has(currentState)) {
                enqueueSend(AUTO_ALERTS.error.text, AUTO_ALERTS.error.color).catch(() => {});
            }
        }
        // Máquinas que desaparecieron del snapshot (desconectadas/borradas)
        // no deben quedar "recordadas" con un estado viejo para siempre.
        for (const id of Array.from(lastMachineStates.keys())) {
            if (!seenIds.has(id)) lastMachineStates.delete(id);
        }
    }

    function syncMachinePolling() {
        const shouldPoll = !!state.config.auto_alerts;
        if (shouldPoll && !machinesTimer) {
            lastMachineStates.clear();
            pollMachines();
            machinesTimer = window.setInterval(pollMachines, MACHINES_POLL_MS);
        } else if (!shouldPoll && machinesTimer) {
            window.clearInterval(machinesTimer);
            machinesTimer = null;
        }
    }

    function bindEvents() {
        root.querySelector('#mled-save-config-btn')?.addEventListener('click', saveConfig);
        root.querySelector('#mled-send-btn')?.addEventListener('click', sendTestMessage);
        root.querySelector('#mled-logo-btn')?.addEventListener('click', sendLogoMessage);
        root.querySelector('#mled-save-grid-btn')?.addEventListener('click', () => {
            saveDraftToLocalStorage();
            const msg = root.querySelector('#mled-editor-msg');
            msg.textContent = `Patrón guardado para ${state.editorPresetId}`;
            msg.className = 'mled-inline-msg mled-inline-msg-ok';
        });
        root.querySelector('#mled-clear-grid-btn')?.addEventListener('click', () => {
            state.matrixDraft = createEmptyMatrix();
            renderMatrixEditor();
            renderPreviewMatrix();
        });
        root.querySelector('#mled-seed-grid-btn')?.addEventListener('click', () => {
            state.matrixDraft = seedMatrixForPreset(state.editorPresetId);
            renderMatrixEditor();
            renderPreviewMatrix();
        });
        root.querySelector('#mled-machine-state')?.addEventListener('change', (event) => {
            state.selectedMachineState = event.target.value;
            renderPreviewMatrix();
            const msg = root.querySelector('#mled-editor-msg');
            msg.textContent = `Función asignada: ${event.target.options[event.target.selectedIndex].text}`;
            msg.className = 'mled-inline-msg mled-inline-msg-ok';
        });
        root.querySelectorAll('[data-demo-edit]').forEach((button) => {
            button.addEventListener('click', () => {
                state.editorPresetId = button.dataset.demoEdit;
                loadDraftFromLocalStorage();
                renderMatrixEditor();
                renderPreviewMatrix();
                const msg = root.querySelector('#mled-editor-msg');
                msg.textContent = `Modo edición: ${state.editorPresetId}`;
                msg.className = 'mled-inline-msg';
            });
        });
        root.querySelectorAll('[data-demo-send]').forEach((button) => {
            button.addEventListener('click', () => sendDemoPreset(button.dataset.demoSend));
        });
        root.querySelector('#mled-send-preview-btn')?.addEventListener('click', sendMatrixDraft);
        renderPresets();
    }

    function mount() {
        if (document.getElementById(`${PLUGIN_ID}-section`)) return;

        const pluginsContainer = document.querySelector('.nav-category[data-group="plugins"] .nav-category-items');
        const navButton = document.createElement('button');
        navButton.className = 'nav-item';
        navButton.dataset.section = PLUGIN_ID;
        navButton.dataset.pluginNav = PLUGIN_ID;
        navButton.innerHTML = '<span>🖥️</span><span>Matriz LED</span>';
        navButton.addEventListener('click', () => window.switchSection?.(PLUGIN_ID));
        pluginsContainer?.appendChild(navButton);

        const wrapper = document.createElement('div');
        wrapper.innerHTML = moduleHtml().trim();
        root = wrapper.firstElementChild;
        document.querySelector('.content')?.appendChild(root);

        loadDraftFromLocalStorage();
        renderMatrixEditor();
        renderPreviewMatrix();
        bindEvents();
        loadConfig().then(refreshStatus);
        loadTextSizes();
        statusTimer = window.setInterval(refreshStatus, 10000);
        window.applySidebarOrder?.();
    }

    function unmount() {
        if (statusTimer) {
            window.clearInterval(statusTimer);
            statusTimer = null;
        }
        if (machinesTimer) {
            window.clearInterval(machinesTimer);
            machinesTimer = null;
        }
        document.querySelector(`[data-plugin-nav="${PLUGIN_ID}"]`)?.remove();
        document.getElementById(`${PLUGIN_ID}-section`)?.remove();
        root = null;
    }

    window.NopalPluginRegistry = window.NopalPluginRegistry || {};
    window.NopalPluginRegistry[PLUGIN_ID] = { mount, unmount, version: '0.3.0' };
    mount();
})();
