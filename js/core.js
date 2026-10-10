// Trazo — núcleo: base de datos (IndexedDB), ajustes y utilidades de interfaz
'use strict';

const DB = (() => {
  let db;
  const open = () => db ? Promise.resolve(db) : new Promise((res, rej) => {
    const r = indexedDB.open('trazo', 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('meta', { keyPath: 'id' });
      d.createObjectStore('notes', { keyPath: 'id' });
      d.createObjectStore('blobs');
      d.createObjectStore('kv');
      d.createObjectStore('versions', { keyPath: 'vid' }).createIndex('note', 'note');
    };
    r.onsuccess = () => { db = r.result; res(db); };
    r.onerror = () => rej(r.error);
  });
  const tx = (store, mode, fn) => open().then(d => new Promise((res, rej) => {
    const t = d.transaction(store, mode), s = t.objectStore(store);
    const out = fn(s);
    t.oncomplete = () => res(out && 'result' in out ? out.result : out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error || new Error('Transacción cancelada (¿sin espacio?)'));
  }));
  return {
    open,
    get: (st, k) => tx(st, 'readonly', s => s.get(k)),
    put: (st, v, k) => tx(st, 'readwrite', s => k === undefined ? s.put(v) : s.put(v, k)),
    del: (st, k) => tx(st, 'readwrite', s => s.delete(k)),
    all: st => tx(st, 'readonly', s => s.getAll()),
    keys: st => tx(st, 'readonly', s => s.getAllKeys()),
    clear: st => tx(st, 'readwrite', s => s.clear()),
    byIndex: (st, idx, v) => tx(st, 'readonly', s => s.index(idx).getAll(v)),
  };
})();

const KV = { get: k => DB.get('kv', k), set: (k, v) => DB.put('kv', v, k) };

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// Blobs (audio, imágenes, PDF) con caché en memoria de URLs
const Blobs = (() => {
  const urls = new Map(), imgs = new Map();
  return {
    async put(blob, id = uid()) { await DB.put('blobs', blob, id); return id; },
    get: id => DB.get('blobs', id),
    del: id => { urls.delete(id); imgs.delete(id); return DB.del('blobs', id); },
    async url(id) {
      if (urls.has(id)) return urls.get(id);
      const b = await DB.get('blobs', id); if (!b) return null;
      const u = URL.createObjectURL(b); urls.set(id, u); return u;
    },
    // imagen decodificada lista para dibujar en canvas
    img(id, onload) {
      if (imgs.has(id)) { const i = imgs.get(id); return i.complete && i.naturalWidth ? i : null; }
      const i = new Image(); imgs.set(id, i);
      Blobs.url(id).then(u => { if (u) { i.onload = () => onload && onload(); i.src = u; } });
      return null;
    },
  };
})();

// Ajustes persistentes
const Settings = (() => {
  const defaults = {
    theme: 'auto', accent: '#3F66F0', name: '', titleFormat: 'Nota {fecha} {hora}',
    paper: { tpl: 'blank', color: '#FFFFFF' }, size: 'letter', view: 'continuous',
    pencilOnly: 'auto', smoothing: 0.5, pressure: true, shapes: true, holdShapes: true, shapeMode: 'hold', orient: 'portrait', scrollDir: 'v', textItalic: false, textUnder: false,
    textFont: 'system', textSize: 18, mediaCorners: 'square', autoPage: true,
    showHomeRecent: true, showHomePuzzle: true, notesView: 'grid', sort: 'updated',
    pin: '', lockOnLeave: false, lang: 'es-CL', summaryLen: 4, twoFingerUndo: true,
    autoBackup: true, toolbox: null, aiKey: '', aiModel: 'gpt-5-mini', aiTranscribe: 'gpt-4o-mini-transcribe', versionDays: 90, colors: ['#1C1C1E', '#2F5BEA', '#E5383B', '#2BA84A', '#F59F00', '#8E44EC'],
  };
  let s = {};
  try { s = JSON.parse(localStorage.getItem('trazo_settings') || '{}'); } catch (e) {}
  const S = Object.assign({}, defaults, s);
  S.save = () => { try { const o = Object.assign({}, S); delete o.save; localStorage.setItem('trazo_settings', JSON.stringify(o)); } catch (e) {} };
  return S;
})();

// Utilidades de interfaz
const UI = (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (n, cls = '') => `<svg class="ic ${cls}"><use href="#i-${n}"/></svg>`;
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const k in attrs || {}) {
      const v = attrs[k];
      if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'class') e.className = v;
      else if (k === 'style' && typeof v === 'object') for (const [sk, sv] of Object.entries(v)) sk.startsWith('--') ? e.style.setProperty(sk, sv) : (e.style[sk] = sv);
      else if (v !== false && v != null) e.setAttribute(k, v);
    }
    for (const c of kids.flat()) if (c != null) e.append(c.nodeType ? c : document.createTextNode(c));
    return e;
  }
  let toastT;
  function toast(msg, ms = 2200) {
    let t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms);
  }
  // capa modal genérica; devuelve {el, close}
  function layer(content, { cls = '', onclose, dismiss = true } = {}) {
    const back = h('div', { class: 'layer ' + cls });
    const box = h('div', { class: 'sheet' });
    box.append(content);
    back.append(box);
    document.body.append(back);
    requestAnimationFrame(() => back.classList.add('in'));
    const close = v => {
      if (!back.isConnected) return;
      back.classList.remove('in');
      setTimeout(() => back.remove(), 180);
      onclose && onclose(v);
    };
    if (dismiss) back.addEventListener('pointerdown', e => { if (e.target === back) close(); });
    back._close = close;
    return { el: box, back, close };
  }
  function dialog({ title, body, buttons = [{ t: 'OK', v: true, primary: true }], cls = '' }) {
    return new Promise(res => {
      const foot = h('div', { class: 'dlg-foot' });
      const content = h('div', { class: 'dlg' }, title ? h('h3', {}, title) : null, body || null, foot);
      const L = layer(content, { cls: 'center ' + cls, onclose: v => res(v) });
      buttons.forEach(b => foot.append(h('button', { class: 'btn ' + (b.primary ? 'primary' : '') + (b.danger ? ' danger' : ''), onclick: () => L.close(b.v) }, b.t)));
      const inp = content.querySelector('input');
      if (inp) { setTimeout(() => { inp.focus(); inp.select && inp.select(); }, 60); inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); L.close(buttons.find(b => b.primary)?.v); } }); }
    });
  }
  const alert = (title, msg) => dialog({ title, body: msg ? h('p', {}, msg) : null });
  const confirm = (title, msg, ok = 'Aceptar', danger) => dialog({ title, body: msg ? h('p', {}, msg) : null, buttons: [{ t: 'Cancelar', v: false }, { t: ok, v: true, primary: !danger, danger }] });
  async function prompt(title, value = '', ph = '') {
    const inp = h('input', { class: 'field', value, placeholder: ph });
    const r = await dialog({ title, body: inp, buttons: [{ t: 'Cancelar', v: false }, { t: 'OK', v: 'ok', primary: true }] });
    return r === 'ok' ? inp.value.trim() : null;
  }
  // menú contextual anclado a un elemento o a coordenadas
  function menu(anchor, items, { align = 'left', cls = '' } = {}) {
    document.querySelectorAll('.pop').forEach(p => p._close && p._close());
    const m = h('div', { class: 'pop ' + cls });
    const close = () => { m.remove(); document.removeEventListener('pointerdown', out, true); };
    const out = e => { if (!m.contains(e.target)) close(); };
    m._close = close;
    for (const it of items) {
      if (!it) continue;
      if (it === '-') { m.append(h('div', { class: 'sep' })); continue; }
      if (it.custom) { m.append(it.custom); continue; }
      const b = h('button', { class: 'mi' + (it.danger ? ' danger' : '') + (it.on ? ' on' : ''), disabled: it.disabled ? '' : false },
        it.check !== undefined ? h('span', { class: 'chk', html: it.check ? icon('check') : '' }) : null,
        h('span', { class: 'mt' }, it.t, it.sub ? h('small', {}, it.sub) : null),
        it.i ? h('span', { class: 'mic', html: icon(it.i) }) : null);
      b.addEventListener('click', e => { e.stopPropagation(); if (!it.keep) close(); it.fn && it.fn(b); });
      m.append(b);
    }
    document.body.append(m);
    const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y };
    const W = innerWidth, H = innerHeight, mw = m.offsetWidth, mh = m.offsetHeight;
    let x = align === 'right' ? r.right - mw : r.left, y = r.bottom + 6;
    if (y + mh > H - 8) y = Math.max(8, r.top - mh - 6);
    m.style.left = Math.max(8, Math.min(W - mw - 8, x)) + 'px';
    m.style.top = Math.max(8, Math.min(H - mh - 8, y)) + 'px';
    setTimeout(() => document.addEventListener('pointerdown', out, true), 0);
    return m;
  }
  function busy(msg) {
    const b = h('div', { class: 'busy' }, h('div', { class: 'spin' }), h('span', {}, msg || 'Procesando…'));
    document.body.append(b);
    return { set: t => (b.lastChild.textContent = t), done: () => b.remove() };
  }
  const date = ts => { const d = new Date(ts); return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }); };
  const datetime = ts => { const d = new Date(ts); return date(ts) + ' · ' + d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }); };
  const rel = ts => {
    const s = (Date.now() - ts) / 1000;
    if (s < 60) return 'Hace un momento'; if (s < 3600) return 'Hace ' + Math.floor(s / 60) + ' min';
    if (s < 86400) return 'Hace ' + Math.floor(s / 3600) + ' h'; if (s < 172800) return 'Ayer';
    return date(ts);
  };
  const dur = s => { s = Math.max(0, Math.floor(s || 0)); const m = Math.floor(s / 60), h = Math.floor(m / 60); return (h ? h + ':' + String(m % 60).padStart(2, '0') : m) + ':' + String(s % 60).padStart(2, '0'); };
  const isPhone = () => Math.min(innerWidth, innerHeight) < 600;
  const native = !!(window.webkit && webkit.messageHandlers && webkit.messageHandlers.trazo);
  const bridge = msg => webkit.messageHandlers.trazo.postMessage(msg);
  const blobB64 = b => new Promise(r => { const f = new FileReader(); f.onload = () => r(String(f.result).split(',')[1]); f.readAsDataURL(b); });
  // guardar o compartir un archivo, según la plataforma
  async function saveBlob(blob, name) {
    if (native) { try { await bridge({ op: 'saveAs', name, data: await blobB64(blob) }); } catch (e) { toast('No se pudo guardar'); } return; }
    const f = new File([blob], name, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [f] }) && /iPad|iPhone|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document) {
      try { await navigator.share({ files: [f], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  function pickFiles(accept, multiple = true, capture) {
    return new Promise(res => {
      const i = h('input', { type: 'file', accept, multiple: multiple ? '' : false, capture: capture || false, style: 'position:fixed;left:-999px' });
      i.onchange = () => { res(Array.from(i.files || [])); i.remove(); };
      document.body.append(i); i.click();
    });
  }
  const loadImage = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const canvasBlob = (c, type = 'image/png', q = 0.92) => new Promise(r => c.toBlob(r, type, q));
  // puntos de presión: pausa breve para no bloquear la interfaz
  const tick = () => new Promise(r => setTimeout(r, 0));
  return { $, $$, esc, icon, h, toast, layer, dialog, alert, confirm, prompt, menu, busy, date, datetime, rel, dur, isPhone, native, bridge, blobB64, saveBlob, pickFiles, loadImage, canvasBlob, tick };
})();

// Tema y color de acento
function applyTheme() {
  const t = Settings.theme, dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.style.setProperty('--accent', Settings.accent);
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = dark ? '#151517' : '#F6F6F8';
}
const themeIcon = () => ({ light: 'sun', dark: 'moon' })[Settings.theme] || 'theme-auto';
function cycleTheme(btn) {
  const o = ['auto', 'light', 'dark'], n = o[(o.indexOf(Settings.theme) + 1) % 3];
  Settings.theme = n; Settings.save(); applyTheme();
  if (btn) btn.innerHTML = UI.icon(themeIcon());
  UI.toast({ auto: 'Automático: sigue al sistema', light: 'Modo día', dark: 'Modo noche' }[n]);
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
applyTheme();
