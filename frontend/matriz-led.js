// Matriz LED -- panel de configuración y envío de mensajes a una pantalla
// LED BLE (tipo iPixel Color), conectada vía el relay del firmware
// Nopal_FF.ino (ver backend/services/screen_service.py de este plugin).
//
// v0.1: funcional (configurar accesorio, ver estado, mandar texto de
// prueba) -- todavía no incluye el catálogo de animaciones por estado ni
// las automatizaciones (escenas/macros/rutinas), eso llega después.
(() => {
    const PLUGIN_ID = 'matriz-led';

    if (window.NopalPluginRegistry?.[PLUGIN_ID]) {
        return;
    }

    const API_BASE = '/api/plugins/matriz-led';

    const state = {
        config: { ip: '', username: '', has_password: false },
        status: { configured: false, connected: false },
        sending: false,
    };

    let root = null;
    let statusTimer = null;

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
                        <div class="mled-row">
                            <button type="button" class="mled-btn mled-btn-primary" id="mled-save-config-btn">Guardar</button>
                            <span class="mled-inline-msg" id="mled-config-msg"></span>
                        </div>
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
        const passwordInput = root.querySelector('#mled-password');
        passwordInput.value = '';
        passwordInput.placeholder = state.config.has_password ? '••••••••• (sin cambios)' : '•••••••••';
    }

    async function loadConfig() {
        try {
            state.config = await api('/config');
        } catch {
            state.config = { ip: '', username: '', has_password: false };
        }
        fillConfigForm();
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
                }),
            });
            fillConfigForm();
            msg.textContent = 'Guardado';
            msg.classList.add('mled-inline-msg-ok');
            refreshStatus();
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
        try {
            const result = await api('/text', {
                method: 'POST',
                body: JSON.stringify({ text, color }),
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

    function bindEvents() {
        root.querySelector('#mled-save-config-btn').addEventListener('click', saveConfig);
        root.querySelector('#mled-send-btn').addEventListener('click', sendTestMessage);
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
        statusTimer = window.setInterval(refreshStatus, 10000);
        window.applySidebarOrder?.();
    }

    function unmount() {
        if (statusTimer) {
            window.clearInterval(statusTimer);
            statusTimer = null;
        }
        document.querySelector(`[data-plugin-nav="${PLUGIN_ID}"]`)?.remove();
        document.getElementById(`${PLUGIN_ID}-section`)?.remove();
        root = null;
    }

    window.NopalPluginRegistry = window.NopalPluginRegistry || {};
    window.NopalPluginRegistry[PLUGIN_ID] = { mount, unmount, version: '0.1.0' };
    mount();
})();
