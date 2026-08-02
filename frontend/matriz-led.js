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
// la pantalla física de 16 filas). Pendiente: animaciones GIF y
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

    const ALERT_PRESETS = [
        { id: 'ready', label: 'LISTO', text: 'LISTO', color: '22c55e' },
        { id: 'error', label: 'ERROR', text: 'ERROR', color: 'ef4444' },
        { id: 'warn', label: 'ATENCIÓN', text: 'ATN', color: 'f59e0b' },
        { id: 'emergency', label: 'EMERG.', text: 'EMERG', color: 'ff0000' },
    ];

    const state = {
        config: { ip: '', username: '', has_password: false, auto_alerts: false },
        status: { configured: false, connected: false },
        sending: false,
        textSizes: { sizes: [16], recommended: 16 },
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
                <header class="mled-header">
                    <div class="mled-header-copy">
                        <h1>🖥️ Matriz LED</h1>
                        <span class="mled-header-sub">Pantalla LED BLE conectada por un accesorio ESP32 (relay) · NOPAL Labs</span>
                    </div>
                    <span class="mled-status-pill" id="mled-status-pill">
                        <span class="mled-status-dot"></span>
                        <span id="mled-status-text">Comprobando…</span>
                    </span>
                </header>

                <div class="mled-grid">
                    <article class="mled-card">
                        <h2>Configuración del accesorio</h2>
                        <p class="mled-sub">La IP y credenciales del ESP32 que hace de puente BLE (mismas que usa NOPAL para el resto de los endpoints de ese accesorio).</p>
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
                        <p class="mled-sub">Mensajes cortos listos para usar -- un clic, sin escribir nada.</p>
                        <div class="mled-presets" id="mled-presets"></div>
                        <span class="mled-inline-msg" id="mled-preset-msg"></span>
                    </article>

                    <article class="mled-card">
                        <h2>Mensaje de prueba</h2>
                        <p class="mled-sub">Manda texto directo a la pantalla, con la misma librería (pypixelcolor) que arma el protocolo real.</p>
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
                        <div class="mled-row">
                            <button type="button" class="mled-btn mled-btn-primary" id="mled-send-btn">Enviar a la pantalla</button>
                            <span class="mled-inline-msg" id="mled-send-msg"></span>
                        </div>
                    </article>
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
        try {
            const result = await api('/text', {
                method: 'POST',
                body: JSON.stringify({ text, color, char_height: charHeight }),
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

    // Encola envíos (de presets y de las alertas automáticas) en vez de
    // dispararlos en paralelo -- la pantalla solo puede mostrar un mensaje
    // a la vez, y dos ventanas BLE simultáneas pisándose entre sí es peor
    // que una cola simple FIFO.
    function enqueueSend(text, color) {
        alertQueue = alertQueue
            .catch(() => {}) // un envío fallido no debe frenar la cola
            .then(() => api('/text', { method: 'POST', body: JSON.stringify({ text, color }) }));
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
                enqueueSend('LISTO', '22c55e').catch(() => {});
            } else if (ERROR_STATES.has(currentState)) {
                enqueueSend('ERROR', 'ef4444').catch(() => {});
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
        root.querySelector('#mled-save-config-btn').addEventListener('click', saveConfig);
        root.querySelector('#mled-send-btn').addEventListener('click', sendTestMessage);
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
    window.NopalPluginRegistry[PLUGIN_ID] = { mount, unmount, version: '0.2.1' };
    mount();
})();
