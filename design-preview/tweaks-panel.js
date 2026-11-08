/**
 * tweaks-panel.js — Universal In-Page Design Tweaks & Iteration Panel
 *
 * Replaces claude.ai's iframe-bound `postMessage({ type: '__edit_mode_available' })`
 * with a standalone, harness-agnostic floating control panel that works in any
 * browser (`http://localhost`, `file://`, Agy preview, or Codex browser).
 *
 * Usage:
 *   <script src="./tweaks-panel.js"></script>
 *   <script>
 *     window.UDTweaks.init({
 *       storageKey: 'my-design-tweaks',
 *       controls: [
 *         { id: 'theme', label: 'Theme Mode', type: 'select', options: ['dark', 'light'], default: 'dark', attr: 'data-theme' },
 *         { id: 'accent', label: 'Primary Accent', type: 'color', default: '#3b82f6', cssVar: '--accent' },
 *         { id: 'density', label: 'Layout Density', type: 'select', options: ['comfortable', 'compact'], default: 'comfortable', attr: 'data-density' },
 *         { id: 'radius', label: 'Corner Radius (px)', type: 'range', min: 0, max: 24, step: 2, default: 10, cssVar: '--radius', unit: 'px' }
 *       ],
 *       onChange(values) { console.log('Tweaks updated:', values); }
 *     });
 *   </script>
 */
(function () {
  if (window.UDTweaks) return;

  function init(config = {}) {
    const storageKey = config.storageKey || 'ud-tweaks:' + location.pathname;
    const controls = Array.isArray(config.controls) ? config.controls : [];
    const rootEl = config.root || document.documentElement;

    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
    } catch {
      saved = {};
    }

    const state = {};
    for (const c of controls) {
      state[c.id] = saved[c.id] !== undefined ? saved[c.id] : c.default;
    }

    function applyState() {
      for (const c of controls) {
        const val = state[c.id];
        if (c.cssVar) {
          rootEl.style.setProperty(c.cssVar, c.unit ? `${val}${c.unit}` : String(val));
        }
        if (c.attr) {
          rootEl.setAttribute(c.attr, String(val));
        }
      }
      try {
        localStorage.setItem(storageKey, JSON.stringify(state));
      } catch {}
      if (typeof config.onChange === 'function') {
        config.onChange({ ...state });
      }
      window.dispatchEvent(new CustomEvent('ud:tweaks-change', { detail: { ...state } }));
    }

    function mountUI() {
      const existing = document.getElementById('ud-tweaks-host');
      if (existing) existing.remove();

      const host = document.createElement('div');
      host.id = 'ud-tweaks-host';
      const shadow = host.attachShadow({ mode: 'open' });

      shadow.innerHTML = `
        <style>
          :host { all: initial; position: fixed; right: 16px; bottom: 16px; z-index: 99999; font-family: system-ui, -apple-system, sans-serif; }
          .fab {
            display: inline-flex; align-items: center; gap: 8px;
            background: #0f172a; color: #f8fafc; border: 1px solid rgba(255,255,255,0.16);
            padding: 8px 14px; border-radius: 999px; font-size: 12px; font-weight: 600;
            cursor: pointer; box-shadow: 0 10px 25px rgba(0,0,0,0.35);
            transition: transform 0.15s ease, background 0.15s ease;
          }
          .fab:hover { transform: translateY(-1px); background: #1e293b; }
          .panel {
            display: none; width: 290px; background: rgba(15, 23, 42, 0.96);
            backdrop-filter: blur(12px); color: #f8fafc;
            border: 1px solid rgba(255,255,255,0.14); border-radius: 14px;
            padding: 14px; margin-bottom: 10px; box-shadow: 0 20px 40px rgba(0,0,0,0.45);
          }
          .panel.open { display: block; }
          .hdr { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.1); }
          .title { font-size: 13px; font-weight: 700; letter-spacing: 0.02em; }
          .actions { display: flex; gap: 6px; }
          .mini-btn {
            background: rgba(255,255,255,0.08); color: #cbd5e1; border: none;
            border-radius: 6px; padding: 4px 8px; font-size: 11px; cursor: pointer;
          }
          .mini-btn:hover { background: rgba(255,255,255,0.16); color: #fff; }
          .row { margin-bottom: 10px; display: flex; flex-direction: column; gap: 4px; }
          label { font-size: 11px; color: #94a3b8; display: flex; justify-content: space-between; }
          select, input[type="text"], input[type="range"] {
            width: 100%; box-sizing: border-box; background: #1e293b; color: #f8fafc;
            border: 1px solid rgba(255,255,255,0.14); border-radius: 6px; padding: 5px 8px; font-size: 12px;
          }
          input[type="color"] { width: 100%; height: 28px; border: none; border-radius: 6px; background: transparent; cursor: pointer; }
          @media print { :host { display: none !important; } }
        </style>
        <div class="panel" id="panel" role="dialog" aria-label="Design Tweaks">
          <div class="hdr">
            <span class="title">Design Tweaks</span>
            <div class="actions">
              <button class="mini-btn" id="copy-btn" title="Copy JSON state">Copy</button>
              <button class="mini-btn" id="reset-btn" title="Reset defaults">Reset</button>
            </div>
          </div>
          <div id="controls-body"></div>
        </div>
        <button class="fab" id="toggle-btn" aria-expanded="false">
          <span>⚙ Tweaks</span>
        </button>
      `;

      const body = shadow.getElementById('controls-body');
      const inputsMap = new Map();

      for (const c of controls) {
        const row = document.createElement('div');
        row.className = 'row';
        const lbl = document.createElement('label');
        const valSpan = document.createElement('span');
        valSpan.textContent = String(state[c.id]);
        lbl.innerHTML = `<span>${c.label || c.id}</span>`;
        lbl.appendChild(valSpan);
        row.appendChild(lbl);

        let input;
        if (c.type === 'select') {
          input = document.createElement('select');
          for (const opt of c.options || []) {
            const o = document.createElement('option');
            o.value = opt;
            o.textContent = opt;
            if (String(state[c.id]) === String(opt)) o.selected = true;
            input.appendChild(o);
          }
        } else {
          input = document.createElement('input');
          input.type = c.type || 'text';
          if (c.min !== undefined) input.min = c.min;
          if (c.max !== undefined) input.max = c.max;
          if (c.step !== undefined) input.step = c.step;
          input.value = state[c.id];
        }

        input.addEventListener('input', (e) => {
          const v = c.type === 'range' ? Number(e.target.value) : e.target.value;
          state[c.id] = v;
          valSpan.textContent = String(v);
          applyState();
        });

        inputsMap.set(c.id, { input, valSpan });
        row.appendChild(input);
        body.appendChild(row);
      }

      const panel = shadow.getElementById('panel');
      const toggleBtn = shadow.getElementById('toggle-btn');
      toggleBtn.addEventListener('click', () => {
        const open = panel.classList.toggle('open');
        toggleBtn.setAttribute('aria-expanded', String(open));
      });

      shadow.getElementById('reset-btn').addEventListener('click', () => {
        for (const c of controls) {
          state[c.id] = c.default;
          const entry = inputsMap.get(c.id);
          if (entry) {
            entry.input.value = c.default;
            entry.valSpan.textContent = String(c.default);
          }
        }
        applyState();
      });

      const copyBtn = shadow.getElementById('copy-btn');
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(JSON.stringify(state, null, 2));
          copyBtn.textContent = 'Copied!';
          setTimeout(() => (copyBtn.textContent = 'Copy'), 1200);
        } catch {}
      });

      document.body.appendChild(host);
    }

    applyState();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mountUI);
    } else {
      mountUI();
    }

    return {
      getState: () => ({ ...state }),
      set: (id, value) => {
        state[id] = value;
        applyState();
      },
    };
  }

  window.UDTweaks = { init };
})();
