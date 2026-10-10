// Trazo — editor de notas: páginas, herramientas, Apple Pencil, selección, grabación sincronizada
'use strict';

const DEFAULT_TOOLS = [
  { id: 'pen', k: 'pen', n: 'Bolígrafo', c: '#1C1C1E', w: 2.4 },
  { id: 'pencil', k: 'pencil', n: 'Lápiz', c: '#3A3A3C', w: 2.2 },
  { id: 'marker', k: 'marker', n: 'Marcador', c: '#FFD43B', w: 18 },
  { id: 'eraser', k: 'eraser', n: 'Borrador', mode: 'stroke', w: 14 },
  { id: 'text', k: 'text', n: 'Texto' },
  { id: 'lasso', k: 'lasso', n: 'Seleccionar', what: 'all' },
  { id: 'media', k: 'media', n: 'Multimedia' },
  { id: 'hand', k: 'hand', n: 'Navegar' },
  { id: 'zoom', k: 'zoom', n: 'Zoom' },
  { id: 'tape', k: 'tape', n: 'Cinta', c: '#7CC8C3' },
  { id: 'ruler', k: 'ruler', n: 'Regla' },
  { id: 'shape', k: 'shape', n: 'Figuras', c: '#1C1C1E', w: 2.4, s: 'rect', fill: '', ds: 0 },
  { id: 'laser', k: 'laser', n: 'Láser', c: '#FF2D2D', tail: true },
  { id: 'rec', k: 'rec', n: 'Grabar' },
];
const TOOL_ICON = { pen: 'pen', pencil: 'pencil', marker: 'marker', eraser: 'eraser', text: 'text', lasso: 'lasso', media: 'plus-circle', hand: 'hand', zoom: 'zoom', tape: 'tape', ruler: 'ruler', shape: 'shapes', laser: 'laser', rec: 'mic' };
const DUPLICABLE = ['pen', 'pencil', 'marker', 'eraser', 'lasso', 'shape'];
const PEN_STYLES = [['ball', 'Bolígrafo', 'Trazo con presión natural'], ['fountain', 'Pluma estilográfica', 'Grosor según la dirección'], ['calli', 'Caligrafía', 'Punta biselada a 45°'], ['brush', 'Pincel', 'Muy sensible a la presión'], ['fine', 'Punta fina', 'Grosor constante, ideal para diagramas']];
const SHAPE_MODES = [['off', 'Garabato libre', 'Nunca convierte tus trazos'], ['hold', 'Mantener = figura', 'Dibuja y deja el lápiz quieto medio segundo'], ['auto', 'Auto-perfecto', 'Convierte al soltar si reconoce la figura'], ['smart', 'Auto-perfecto + dibujos (IA)', 'También reconoce objetos: árbol, auto, persona…']];
const shapeMode = () => Settings.shapeMode || (Settings.shapes === false ? 'off' : 'hold');
const SIZES_OF = { pen: [1.2, 2.4, 4, 7], pencil: [1.5, 2.2, 3.5, 6], marker: [10, 18, 28, 40], eraser: [6, 14, 28, 56], shape: [1.5, 2.4, 4, 7] };

function toolbox() {
  if (!Array.isArray(Settings.toolbox) || !Settings.toolbox.length) Settings.toolbox = JSON.parse(JSON.stringify(DEFAULT_TOOLS));
  // agrega herramientas nuevas de versiones futuras
  for (const t of DEFAULT_TOOLS) if (!Settings.toolbox.some(x => x.k === t.k)) Settings.toolbox.push(JSON.parse(JSON.stringify(t)));
  return Settings.toolbox;
}

const Editor = (() => {
  const { $, h, icon, toast, menu } = UI;
  let note = null, meta = null, root = null, scroller, pagesEl, live, lctx, body, sub;
  let z = 1, fitZ = 1, dpr = Math.min(3, window.devicePixelRatio || 1);
  let tool = null, penSeen = false, rulerOn = false, ruler = { x: 120, y: 300, a: 0, len: 620 };
  let pageEls = [], visible = new Set(), io = null;
  let hist = { u: [], r: [] }, dirty = false, saveT = null, thumbDirty = false;
  let sel = null, clip = null, editingText = null;
  let rec = null, player = null, replay = true, laserPts = [], laserRAF = 0;
  let onClose = null;

  const pencilMode = () => Settings.pencilOnly === 'on' || (Settings.pencilOnly === 'auto' && penSeen);
  const cur = () => tool;
  const findTool = id => toolbox().find(t => t.id === id);

  // ---------- abrir / cerrar ----------
  async function open(id, cb) {
    onClose = cb;
    note = await DB.get('notes', id); meta = await DB.get('meta', id);
    if (!note) { toast('No se encontró la nota'); return; }
    note.recs = note.recs || [];
    hist = { u: [], r: [] }; sel = null; editingText = null; player = null;
    meta.opened = Date.now(); DB.put('meta', meta);
    build();
    tool = toolbox().find(t => t.id === (Settings.lastTool || 'pen')) || toolbox()[0];
    if (['rec', 'media', 'ruler'].includes(tool.k)) tool = toolbox()[0];
    renderToolbar();
    layoutPages(true);
    if (note.recs.length) showPlayer(note.recs[note.recs.length - 1]);
    updateEmpty();
    document.body.classList.add('editing');
    if (note.lastPage) setTimeout(() => goPage(note.lastPage, false), 50);
  }
  async function close() {
    if (lblDone) lblDone();
    zw = null;
    if (rec) await stopRec();
    commitText();
    if (player) { player.audio.pause(); }
    note.lastPage = currentPage();
    await saveNow(true);
    io && io.disconnect();
    root.remove(); root = null; note = null;
    document.body.classList.remove('editing');
    removeEventListener('resize', onResize); removeEventListener('keydown', onKey); document.removeEventListener('paste', onPaste); document.removeEventListener('trazo-seek', onSeek);
    onClose && onClose();
  }

  // ---------- estructura ----------
  function build() {
    root = h('div', { id: 'ed', class: (Settings.view === 'paged' ? 'paged' : '') + (Settings.scrollDir === 'h' ? ' hscroll' : '') });
    const top = h('header', { class: 'ed-top' },
      h('div', { class: 'ed-left' },
        h('button', { class: 'ib round', title: 'Volver', onclick: close, html: icon('back') }),
        h('div', { class: 'ed-title', contenteditable: 'true', spellcheck: 'false', onblur: e => rename(e.target.textContent), onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } } }, note.title)),
      h('div', { class: 'tb-wrap' }, h('div', { class: 'toolbar' }), sub = h('div', { class: 'subbar' })),
      h('div', { class: 'ed-right' },
        h('button', { class: 'ib', id: 'bUndo', title: 'Deshacer', onclick: undo, html: icon('undo') }),
        h('button', { class: 'ib', id: 'bRedo', title: 'Rehacer', onclick: redo, html: icon('redo') }),
        h('button', { class: 'ib', title: 'Ayuda', onclick: () => App.help({ pen: 'pen', pencil: 'pen', marker: 'pen', shape: 'shape', text: 'text', lasso: 'lasso', eraser: 'eraser', tape: 'tape', media: 'media', zoom: 'zoom', rec: 'rec' }[tool && tool.k] || (shapeMode() === 'smart' ? 'smart' : '')), html: icon('help') }),
        h('button', { class: 'ib', title: 'Modo día / noche / automático', onclick: e => cycleTheme(e.currentTarget), html: icon(themeIcon()) }),
        h('button', { class: 'ib', title: 'Más', onclick: e => moreMenu(e.currentTarget), html: icon('more') }),
        h('button', { class: 'ib', title: 'Escribir con teclado', onclick: typeMode, html: icon('keyboard') }),
        h('button', { class: 'ib', id: 'bPages', title: 'Páginas', onclick: togglePages, html: icon('pages') })));
    body = h('div', { class: 'ed-body' });
    scroller = h('div', { class: 'scroller' });
    pagesEl = h('div', { class: 'pages' });
    scroller.append(pagesEl);
    live = h('canvas', { class: 'live' });
    body.append(scroller, live,
      h('aside', { class: 'thumbs' }),
      h('div', { class: 'pageind' }, h('button', { class: 'ib sm', onclick: () => goPage(currentPage() - 1), html: icon('chev-up') }), h('span', { class: 'pn' }), h('button', { class: 'ib sm', onclick: () => goPage(currentPage() + 1), html: icon('chev-down') })),
      h('div', { class: 'emptybar' },
        h('button', { onclick: () => setPaperAll('ruled') }, h('span', { html: icon('ruled') }), 'Rayado'),
        h('button', { onclick: () => setPaperAll('grid') }, h('span', { html: icon('grid') }), 'Cuadrícula'),
        h('button', { onclick: () => setPaperAll('dot') }, h('span', { html: icon('dots') }), 'Puntos'),
        h('i', { class: 'vsep' }),
        h('button', { onclick: () => importInto() }, h('span', { html: icon('import') }), 'Importar'),
        h('button', { onclick: () => scanInto() }, h('span', { html: icon('scan') }), 'Escanear'),
        h('button', { onclick: () => App.templatePicker(t => applyTpl(t, true)) }, h('span', { html: icon('template') }), 'Plantillas')),
      h('div', { class: 'player hidden' }),
      h('div', { class: 'recpill hidden' }),
      h('div', { class: 'rulerEl hidden' }, h('div', { class: 'rl-ang' }), h('div', { class: 'rl-rot', html: icon('rotate') })));
    root.append(top, body);
    document.body.append(root);
    lctx = live.getContext('2d');
    bindPointer();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onResize); addEventListener('keydown', onKey); document.addEventListener('paste', onPaste); document.addEventListener('trazo-seek', onSeek);
    bindRuler(); requestAnimationFrame(sizeLive);
    setPencilClass();
  }
  async function onSeek(e) {
    const r = note.recs.find(x => x.id === e.detail.id); if (!r) return;
    if (!player || player.rec !== r) await showPlayer(r);
    player.audio.currentTime = e.detail.t; player.audio.play();
  }
  function rename(t) {
    t = (t || '').trim() || 'Sin título';
    if (t === note.title) return;
    note.title = t; markDirty();
  }

  // ---------- barra de herramientas ----------
  function renderToolbar() {
    const tb = $('.toolbar', root); tb.innerHTML = '';
    for (const t of toolbox()) {
      if (t.hidden) continue;
      if (t.k === 'rec') tb.append(h('i', { class: 'vsep' }));
      const on = t === tool || (t.k === 'ruler' && rulerOn) || (t.k === 'rec' && rec);
      const b = h('button', { class: 'tool' + (on ? ' on' : '') + (t.k === 'rec' && rec ? ' recording' : ''), title: t.n, 'data-k': t.k },
        h('span', { html: icon(TOOL_ICON[t.k]) }));
      if (t.c && ['pen', 'pencil', 'marker', 'shape', 'tape', 'laser'].includes(t.k)) b.append(h('i', { class: 'tdot', style: { background: t.c } }));
      b.onclick = () => selectTool(t, b);
      tb.append(b);
    }
    tb.append(h('button', { class: 'tool', title: 'Personalizar herramientas', onclick: customizeTools, html: icon('chev-right') }));
    renderSub();
  }
  function selectTool(t, btn) {
    if (t.k === 'ruler') { rulerOn = !rulerOn; showRuler(); renderToolbar(); return; }
    if (t.k === 'rec') { rec ? stopRec() : startRec(); return; }
    if (t.k === 'media') { mediaMenu(btn); return; }
    commitText();
    if (tool !== t) clearSel();
    tool = t; Settings.lastTool = t.id; Settings.save();
    stopLaser();
    renderToolbar();
  }
  function renderSub() {
    sub.innerHTML = '';
    const t = tool; if (!t) return;
    const sw = (colors, val, set) => colors.map(c => h('button', { class: 'sw' + (c.toLowerCase() === (val || '').toLowerCase() ? ' on' : ''), style: { '--c': c }, title: c, onclick: () => { set(c); renderToolbar(); } }));
    const custom = set => { const inp = h('input', { type: 'color', class: 'cpick', title: 'Otro color', oninput: e => { set(e.target.value); }, onchange: () => renderToolbar() }); return h('label', { class: 'sw add', html: icon('plus') }, inp); };
    const sizes = (k, val, set) => h('div', { class: 'sizes' }, SIZES_OF[k].map(s => h('button', { class: 'sz' + (Math.abs(s - val) < 0.01 ? ' on' : ''), onclick: () => { set(s); renderSub(); } }, h('i', { style: { width: Math.min(22, 3 + s * (k === 'marker' || k === 'eraser' ? 0.4 : 1.6)) + 'px', height: Math.min(22, 3 + s * (k === 'marker' || k === 'eraser' ? 0.4 : 1.6)) + 'px' } }))),
      h('input', { type: 'range', class: 'rng', min: SIZES_OF[k][0] / 2, max: SIZES_OF[k][3] * 1.5, step: 0.1, value: val, oninput: e => set(+e.target.value), onchange: () => renderSub() }));
    const chip = (label, on, fn, ic) => h('button', { class: 'chip' + (on ? ' on' : ''), onclick: () => { fn(); renderSub(); } }, ic ? h('span', { html: icon(ic) }) : null, label);
    const sep = () => h('i', { class: 'vsep' });
    const save = () => Settings.save();
    const k = t.k;
    if (k === 'pen' || k === 'pencil' || k === 'marker' || k === 'shape') {
      const pal = k === 'marker' ? ['#FFD43B', '#8CE99A', '#74C0FC', '#FFA8A8', '#E599F7', '#FFC078'] : Settings.colors;
      sub.append(...sw(pal, t.c, c => { t.c = c; save(); applySelColor(c); }), custom(c => { t.c = c; save(); }), sep(), sizes(k, t.w, s => { t.w = s; save(); }));
      if (k === 'marker') sub.append(sep(), chip('Recto', t.straight, () => { t.straight = !t.straight; save(); }, 'line'));
      if (k === 'shape') sub.append(sep(), h('button', { class: 'chip shbtn', onclick: e => shapePicker(e.currentTarget) }, Shapes.preview(t.s, 22, t.c), Shapes.NAMES[t.s] || 'Figura', h('span', { html: icon('chev-down') })),
        chip('Sin relleno', !t.fill, () => { t.fill = ''; save(); }), chip('Suave', t.fill === 'soft', () => { t.fill = 'soft'; save(); }, 'fill'), chip('Sólido', t.fill === 'solid', () => { t.fill = 'solid'; save(); }),
        chip('Discontinua', t.ds, () => { t.ds = !t.ds; save(); }), sep(),
        h('button', { class: 'chip', onclick: () => insertTemplate('mind') }, h('span', { html: icon('brain') }), 'Lluvia de ideas'),
        h('button', { class: 'chip', onclick: () => insertTemplate('flow') }, h('span', { html: icon('flow') }), 'Diagrama de flujo'));
      if (k === 'pen') { const ps = PEN_STYLES.find(x => x[0] === (t.st || 'ball')); sub.append(sep(), h('button', { class: 'chip', onclick: e => menu(e.currentTarget, PEN_STYLES.map(([v, n, d]) => ({ t: n, sub: d, check: (t.st || 'ball') === v, fn: () => { t.st = v; save(); renderSub(); } }))) }, ps[1], h('span', { html: icon('chev-down') }))); }
      if (k === 'pen' || k === 'pencil') { const m = SHAPE_MODES.find(x => x[0] === shapeMode()); sub.append(sep(), h('button', { class: 'chip' + (m[0] !== 'off' ? ' on' : ''), onclick: e => menu(e.currentTarget, SHAPE_MODES.map(([v, n, d]) => ({ t: n, sub: d, check: shapeMode() === v, fn: () => { Settings.shapeMode = v; save(); renderSub(); if (v === 'smart' && !AI.available()) UI.alert('Falta configurar la IA', 'Para reconocer dibujos agrega tu clave en Ajustes › Inteligencia artificial (en el Mac también sirven tus cuentas de Codex, Claude o Gemini).'); else if (v === 'smart') toast('Dibuja un objeto y espera un momento'); } }))) }, h('span', { html: icon('shapes') }), m[1], h('span', { html: icon('chev-down') }))); }
    } else if (k === 'eraser') {
      sub.append(chip('Trazo completo', t.mode === 'stroke', () => { t.mode = 'stroke'; save(); }), chip('Parcial', t.mode === 'partial', () => { t.mode = 'partial'; save(); }), chip('Solo marcador', t.mode === 'marker', () => { t.mode = 'marker'; save(); }), sep(), sizes('eraser', t.w, s => { t.w = s; save(); }), sep(),
        h('button', { class: 'chip danger', onclick: clearPage }, 'Borrar página'));
    } else if (k === 'lasso') {
      sub.append(chip('Forma libre', !t.box, () => { t.box = false; save(); }, 'freesel'), chip('En caja', !!t.box, () => { t.box = true; save(); }, 'boxsel'), sep(), chip('Todo', t.what === 'all', () => { t.what = 'all'; save(); }), chip('Solo tinta', t.what === 'ink', () => { t.what = 'ink'; save(); }), chip('Solo texto e imágenes', t.what === 'media', () => { t.what = 'media'; save(); }), sep(), h('span', { class: 'hint' }, 'Rodea lo que quieras mover, copiar o cambiar de color'));
    } else if (k === 'text') {
      const T = Settings;
      const apply = () => { if (editingText) { Object.assign(editingText.it, { z: T.textSize, c: T.textColor || '#1C1C1E', f: T.textFont, b: T.textBold, it: T.textItalic ? 1 : 0, u: T.textUnder ? 1 : 0, bg: T.textBg || '', al: T.textAlign || 'left' }); styleTextarea(); } save(); };
      sub.append(
        h('button', { class: 'chip', style: { fontFamily: Items.FONTS[T.textFont] || Items.FONTS.system, fontSize: '15px' }, onclick: e => fontPicker(e.currentTarget, T.textFont, f => { T.textFont = f; apply(); renderSub(); }) }, fontName(T.textFont), h('span', { html: icon('chev-down') })),
        h('button', { class: 'chip', onclick: () => { T.textSize = Math.max(10, T.textSize - 2); apply(); renderSub(); } }, 'A−'),
        h('span', { class: 'hint num' }, T.textSize + ' pt'),
        h('button', { class: 'chip', onclick: () => { T.textSize = Math.min(96, T.textSize + 2); apply(); renderSub(); } }, 'A+'),
        chip('Negrita', T.textBold, () => { T.textBold = !T.textBold; apply(); }, 'bold'),
        chip('Cursiva', T.textItalic, () => { T.textItalic = !T.textItalic; apply(); }, 'italic'),
        chip('Subrayado', T.textUnder, () => { T.textUnder = !T.textUnder; apply(); }, 'underline'),
        chip('Centrado', T.textAlign === 'center', () => { T.textAlign = T.textAlign === 'center' ? 'left' : 'center'; apply(); }, 'center'),
        sep(), ...sw(Settings.colors, T.textColor || '#1C1C1E', c => { T.textColor = c; apply(); }), sep(),
        h('span', { class: 'hint' }, 'Adhesiva'), ...['', '#FFF3A3', '#FFD6E0', '#CDE7FF', '#D3F5D3'].map(c => h('button', { class: 'sw' + ((T.textBg || '') === c ? ' on' : '') + (c ? '' : ' none'), style: { '--c': c || 'transparent' }, onclick: () => { T.textBg = c; apply(); renderSub(); } })));
    } else if (k === 'tape') {
      sub.append(...sw(['#7CC8C3', '#F7B0BE', '#FFD98E', '#A9B8F5', '#B5E48C', '#CDB4DB'], t.c, c => { t.c = c; Settings.save(); }), sep(),
        chip('A mano alzada', t.free !== false, () => { t.free = true; Settings.save(); }, 'pen'), chip('Recta', t.free === false, () => { t.free = false; Settings.save(); }, 'line'),
        chip('Delgada', (t.tw || 28) < 24, () => { t.tw = 18; Settings.save(); }), chip('Gruesa', (t.tw || 28) >= 24, () => { t.tw = 32; Settings.save(); }), sep(),
        h('button', { class: 'chip', onclick: () => setTapes(true) }, 'Ocultar todas'), h('button', { class: 'chip', onclick: () => setTapes(false) }, 'Mostrar todas'),
        h('span', { class: 'hint' }, 'Tapa respuestas y tócalas para revelar'));
    } else if (k === 'laser') {
      sub.append(...sw(['#FF2D2D', '#2F5BEA', '#20C040', '#F2D20C'], t.c, c => { t.c = c; Settings.save(); }), sep(),
        chip('Cola', t.tail, () => { t.tail = true; Settings.save(); }, 'tail'), chip('Sin cola', !t.tail, () => { t.tail = false; Settings.save(); }, 'dot'),
        sep(), h('button', { class: 'chip', onclick: present }, h('span', { html: icon('present') }), 'Presentar'));
    } else if (k === 'zoom') {
      sub.append(h('button', { class: 'chip', onclick: () => setZoom(z / 1.25) }, '−'), h('span', { class: 'hint num' }, Math.round(z / fitZ * 100) + '%'), h('button', { class: 'chip', onclick: () => setZoom(z * 1.25) }, '+'),
        h('button', { class: 'chip', onclick: () => setZoom(fitZ) }, 'Ajustar al ancho'), h('button', { class: 'chip', onclick: () => zoomWindow(true) }, h('span', { html: icon('zoom') }), 'Ventana de zoom'), h('span', { class: 'hint' }, 'Arrastra sobre un área para acercarla'));
    } else if (k === 'hand') {
      sub.append(h('span', { class: 'hint' }, 'Desplázate y toca cintas o textos sin escribir por accidente'));
    }
  }
  function applySelColor(c) {
    if (!sel) return;
    snap(sel.pi); sel.items.forEach(it => { if (it.t === 's' || it.t === 'x') it.c = c; if (it.t === 'tp') it.c = c; if (it.t === 'g') { if (it.fl && it.fl === it.c) it.fl = c; it.c = c; if (it.tc) it.tc = c; } });
    paintInk(sel.pi); markDirty();
  }

  // ---------- personalizar caja de herramientas ----------
  function customizeTools() {
    const work = JSON.parse(JSON.stringify(toolbox()));
    const list = h('div', { class: 'tlist' });
    const draw = () => {
      list.innerHTML = '';
      work.forEach((t, i) => {
        const row = h('div', { class: 'trow' + (t.hidden ? ' off' : '') },
          h('button', { class: 'ib sm', title: t.hidden ? 'Mostrar' : 'Ocultar', onclick: () => { t.hidden = !t.hidden; draw(); }, html: icon(t.hidden ? 'eye-off' : 'eye') }),
          h('span', { class: 'tic', html: icon(TOOL_ICON[t.k]) }), t.c ? h('i', { class: 'tdot', style: { background: t.c } }) : null,
          h('span', { class: 'tn' }, t.n),
          DUPLICABLE.includes(t.k) ? h('button', { class: 'ib sm', title: 'Duplicar herramienta', onclick: () => { const c = JSON.parse(JSON.stringify(t)); c.id = t.k + uid(); c.n = t.n.replace(/ \d+$/, '') + ' ' + (work.filter(x => x.k === t.k).length + 1); work.splice(i + 1, 0, c); draw(); }, html: icon('dup') }) : null,
          !DEFAULT_TOOLS.some(d => d.id === t.id) ? h('button', { class: 'ib sm', title: 'Quitar', onclick: () => { work.splice(i, 1); draw(); }, html: icon('trash') }) : null,
          h('span', { class: 'grip', html: icon('grip') }));
        // arrastrar para reordenar (dedo, lápiz o mouse)
        const grip = row.querySelector('.grip');
        grip.addEventListener('pointerdown', e => {
          e.preventDefault(); grip.setPointerCapture(e.pointerId);
          const rows = Array.from(list.children), hgt = row.offsetHeight, y0 = e.clientY; let idx = i;
          row.classList.add('drag');
          const mv = ev => { const dy = ev.clientY - y0; row.style.transform = `translateY(${dy}px)`; idx = Math.max(0, Math.min(work.length - 1, i + Math.round(dy / hgt))); rows.forEach((r, j) => r !== row && (r.style.transform = (j > i && j <= idx) ? `translateY(${-hgt}px)` : (j < i && j >= idx) ? `translateY(${hgt}px)` : '')); };
          const up = () => { grip.removeEventListener('pointermove', mv); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', up); const [m] = work.splice(i, 1); work.splice(idx, 0, m); draw(); };
          grip.addEventListener('pointermove', mv); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
        });
        list.append(row);
      });
    };
    draw();
    const L = UI.layer(h('div', { class: 'dlg tbx' },
      h('div', { class: 'dlg-head' }, h('button', { class: 'link', onclick: () => L.close() }, 'Cancelar'), h('h3', {}, 'Caja de herramientas'),
        h('button', { class: 'link b', onclick: () => { Settings.toolbox = work; Settings.save(); if (!work.includes(tool)) tool = work.find(t => t.id === tool.id) || work[0]; renderToolbar(); L.close(); } }, 'OK')),
      h('p', { class: 'muted' }, 'Reordena u oculta herramientas. Duplica bolígrafos, lápices o marcadores para cambiar de estilo con un toque.'),
      list,
      h('button', { class: 'link danger center', onclick: () => { work.splice(0, work.length, ...JSON.parse(JSON.stringify(DEFAULT_TOOLS))); draw(); } }, 'Restablecer valores predeterminados')), { cls: 'center' });
  }

  // ---------- páginas ----------
  function pageSize(p) { return [p.w, p.h]; }
  function layoutPages(first) {
    fitZ = calcFit();
    if (first) z = fitZ;
    pagesEl.innerHTML = ''; pageEls = []; visible.clear();
    io && io.disconnect();
    io = new IntersectionObserver(ents => {
      for (const e of ents) {
        const i = pageEls.indexOf(e.target); if (i < 0) continue;
        if (e.isIntersecting) { visible.add(i); paint(i); } else { visible.delete(i); release(i); }
      }
    }, { root: scroller, rootMargin: '150% 0px' });
    note.pages.forEach((p, i) => {
      const el = h('div', { class: 'pg' }, h('canvas', { class: 'bg' }), h('canvas', { class: 'ink' }));
      if (p.mark) el.append(h('span', { class: 'pmark', html: icon('bookmark-f') }));
      pagesEl.append(el); pageEls.push(el); io.observe(el);
    });
    sizePages();
    // pintado inmediato de las páginas visibles (el observador puede tardar)
    const R = scroller.getBoundingClientRect();
    pageEls.forEach((el, i) => { const b = el.getBoundingClientRect(); if (b.bottom > R.top - R.height && b.top < R.bottom + R.height) { visible.add(i); paint(i); } });
    updateInd(); renderThumbs();
  }
  function sizePages() {
    note.pages.forEach((p, i) => { const el = pageEls[i]; if (!el) return; el.style.width = p.w * z + 'px'; el.style.height = p.h * z + 'px'; });
  }
  const resScale = p => { let k = z * dpr; const max = 16e6; if (p.w * k * p.h * k > max) k = Math.sqrt(max / (p.w * p.h)); return k; };
  function paint(i) { paintBg(i); paintInk(i); }
  function release(i) { const el = pageEls[i]; if (!el) return; el.querySelectorAll('canvas').forEach(c => { c.width = 0; c.height = 0; c._k = 0; }); }
  function prep(c, p) {
    const k = resScale(p), W = Math.round(p.w * k), H = Math.round(p.h * k);
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const x = c.getContext('2d'); x.setTransform(k, 0, 0, k, 0, 0); c._k = k; return x;
  }
  function paintBg(i) {
    const p = note.pages[i], el = pageEls[i]; if (!p || !el || !visible.has(i)) return;
    const c = el.querySelector('.bg'), x = prep(c, p);
    Paper.draw(x, p.w, p.h, p.paper);
    if (p.bg) {
      if (p.bg.kind === 'pdf') { const cv = PDFs.get(p.bg, p.w, c._k, () => paintBg(i)); if (cv) x.drawImage(cv, 0, 0, p.w, p.h); else { x.fillStyle = '#fff'; x.fillRect(0, 0, p.w, p.h); } }
      else if (p.bg.kind === 'image') { const img = Blobs.img(p.bg.blob, () => paintBg(i)); if (img) x.drawImage(img, 0, 0, p.w, p.h); }
    }
  }
  function paintInk(i, skip) {
    const p = note.pages[i], el = pageEls[i]; if (!p || !el || !visible.has(i)) return;
    const c = el.querySelector('.ink'), x = prep(c, p);
    x.clearRect(0, 0, p.w, p.h);
    const A = player && player.audio, D = A && isFinite(A.duration) ? A.duration : (player ? player.rec.dur : 0);
    const recOpt = A && replay && (A.currentTime > 0 || !A.paused) && A.currentTime < D - 0.2 ? { id: player.rec.id, ms: A.currentTime * 1000 } : null;
    Items.drawAll(x, p.items, { skip, editing: editingText && editingText.it, redraw: () => paintInk(i), corners: Settings.mediaCorners, rec: recOpt });
    if (zw && zw.pi === i && !act) drawZW();
  }
  function repaintAll() { visible.forEach(i => paint(i)); }
  function newPage(tplFrom) {
    const ref = tplFrom || note.pages[note.pages.length - 1];
    const [w, h0] = SIZES[Settings.size] || SIZES.letter;
    return { id: uid(), w: ref && !ref.bg ? ref.w : w, h: ref && !ref.bg ? ref.h : h0, paper: JSON.parse(JSON.stringify((ref && ref.paper) || note.paper || Settings.paper)), items: [] };
  }
  function addPage(at = note.pages.length, page) {
    snapAll();
    note.pages.splice(at, 0, page || newPage(note.pages[Math.max(0, at - 1)]));
    layoutPages(); markDirty(); updateEmpty();
  }
  function currentPage() {
    const r = scroller.getBoundingClientRect(), mid = r.top + r.height * 0.4, H = Settings.scrollDir === 'h', midX = r.left + r.width * 0.4;
    let best = 0, bd = Infinity;
    if (H) { pageEls.forEach((el, i) => { const b = el.getBoundingClientRect(); const d = b.left <= midX && b.right >= midX ? 0 : Math.min(Math.abs(b.left - midX), Math.abs(b.right - midX)); if (d < bd) { bd = d; best = i; } }); return best; }
    pageEls.forEach((el, i) => { const b = el.getBoundingClientRect(); const d = b.top <= mid && b.bottom >= mid ? 0 : Math.min(Math.abs(b.top - mid), Math.abs(b.bottom - mid)); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  function calcFit() {
    const W = scroller.clientWidth || innerWidth, H = scroller.clientHeight || innerHeight, maxW = Math.max(...note.pages.map(p => p.w)), maxH = Math.max(...note.pages.map(p => p.h));
    let k = (W - (UI.isPhone() ? 16 : 48)) / maxW;
    if (Settings.scrollDir === 'h') k = Math.min(k, (H - 40) / maxH);
    return Math.max(0.2, Math.min(k, 2.2));
  }
  function goPage(i, smooth = true) {
    i = Math.max(0, Math.min(note.pages.length - 1, i));
    const el = pageEls[i]; if (!el) return;
    if (Settings.scrollDir === 'h') scroller.scrollTo({ left: el.offsetLeft - 16, behavior: smooth ? 'smooth' : 'auto' });
    else scroller.scrollTo({ top: el.offsetTop - 16, behavior: smooth ? 'smooth' : 'auto' });
  }
  let scrollT;
  function onScroll() { cancelAnimationFrame(scrollT); scrollT = requestAnimationFrame(() => { updateInd(); if (sel) drawSel(); posTextarea(); }); }
  function updateInd() {
    const pn = $('.pageind .pn', root); if (!pn) return;
    const c = currentPage() + 1, n = note.pages.length;
    pn.innerHTML = `${c}<i></i>${n}`;
    $('.pageind', root).classList.toggle('hidden', n < 2);
    $$thumbs().forEach((t, i) => t.classList.toggle('cur', i === c - 1));
  }
  const $$thumbs = () => Array.from(root ? root.querySelectorAll('.thumbs .th') : []);
  function onResize() {
    if (!root) return;
    const oldFit = fitZ, rel = z / oldFit;
    fitZ = calcFit();
    setZoom(fitZ * rel);
    sizeLive();
  }
  function sizeLive() {
    const r = body.getBoundingClientRect();
    live.width = Math.round(r.width * dpr); live.height = Math.round(r.height * dpr);
    live.style.width = r.width + 'px'; live.style.height = r.height + 'px';
  }
  let zoomT;
  function setZoom(nz, ax, ay) {
    nz = Math.max(fitZ * 0.4, Math.min(fitZ * 6, nz));
    const r = scroller.getBoundingClientRect();
    ax = ax == null ? r.left + r.width / 2 : ax; ay = ay == null ? r.top + r.height / 2 : ay;
    const cx = (scroller.scrollLeft + ax - r.left) / z, cy = (scroller.scrollTop + ay - r.top) / z;
    // cálculo con offset de las páginas (padding) aproximado por proporción
    z = nz; sizePages();
    scroller.scrollLeft = cx * z - (ax - r.left); scroller.scrollTop = cy * z - (ay - r.top);
    clearTimeout(zoomT); zoomT = setTimeout(() => { repaintAll(); if (sel) drawSel(); posTextarea(); if (tool && tool.k === 'zoom') renderSub(); }, 120);
    if (sel) drawSel(); posTextarea();
  }
  function setPencilClass() { scroller.classList.toggle('pencil', pencilMode()); }
  function updateEmpty() {
    const empty = note.pages.length === 1 && !note.pages[0].items.length && !note.pages[0].bg;
    const eb = $('.emptybar', root); if (eb) eb.classList.toggle('hidden', !empty);
  }
  function setPaperAll(tpl, param) {
    snapAll();
    note.pages.forEach(p => { if (!p.bg) { p.paper = Object.assign({}, p.paper, { tpl, p: param || (Paper.T[tpl] && Paper.T[tpl].param ? Paper.T[tpl].param() : undefined) }); } });
    note.paper = Object.assign({}, note.paper, { tpl });
    repaintAll(); renderThumbs(); markDirty();
  }
  function setTapes(hid) { note.pages.forEach((p, i) => { let ch = false; p.items.forEach(it => { if (it.t === 'tp' && it.hid !== hid) { it.hid = hid; ch = true; } }); if (ch) paintInk(i); }); markDirty(); }
  function clearPage() {
    const i = currentPage();
    UI.confirm('¿Borrar todo el contenido de esta página?', 'Puedes deshacerlo.', 'Borrar', true).then(ok => { if (!ok) return; snap(i); note.pages[i].items = []; clearSel(); paintInk(i); markDirty(); updateEmpty(); });
  }

  // ---------- coordenadas ----------
  function pageAt(cx, cy, slack = 0) {
    for (let i = 0; i < pageEls.length; i++) {
      const b = pageEls[i].getBoundingClientRect();
      if (cx >= b.left - slack && cx <= b.right + slack && cy >= b.top - slack && cy <= b.bottom + slack) return i;
    }
    return -1;
  }
  function toPage(i, cx, cy) { const b = pageEls[i].getBoundingClientRect(); return [(cx - b.left) / z, (cy - b.top) / z]; }
  function liveTransform(i) {
    const b = pageEls[i].getBoundingClientRect(), L = live.getBoundingClientRect();
    lctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (b.left - L.left), dpr * (b.top - L.top));
  }
  function clearLive() { lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.clearRect(0, 0, live.width, live.height); }

  // ---------- historial ----------
  const ser = v => JSON.stringify(v, (k, x) => k === '_bb' ? undefined : x);
  function snap(pi) { hist.u.push({ pi, d: ser(note.pages[pi].items) }); if (hist.u.length > 100) hist.u.shift(); hist.r = []; updUndo(); }
  function snapAll() { hist.u.push({ all: true, d: ser(note.pages) }); if (hist.u.length > 100) hist.u.shift(); hist.r = []; updUndo(); }
  function swap(from, to) {
    const e = from.pop(); if (!e) return;
    commitText(); clearSel();
    if (e.all) { to.push({ all: true, d: ser(note.pages) }); note.pages = JSON.parse(e.d); layoutPages(); }
    else { if (!note.pages[e.pi]) return; to.push({ pi: e.pi, d: ser(note.pages[e.pi].items) }); note.pages[e.pi].items = JSON.parse(e.d); paintInk(e.pi); }
    markDirty(); updUndo(); updateEmpty();
  }
  const undo = () => swap(hist.u, hist.r), redo = () => swap(hist.r, hist.u);
  function updUndo() { const u = $('#bUndo', root), r = $('#bRedo', root); if (u) u.disabled = !hist.u.length; if (r) r.disabled = !hist.r.length; }

  // ---------- guardado ----------
  function markDirty() { dirty = true; thumbDirty = true; clearTimeout(saveT); saveT = setTimeout(() => saveNow(), 900); }
  async function saveNow(withThumb) {
    if (!note) return;
    clearTimeout(saveT);
    if (dirty) {
      note.updated = Date.now();
      try {
        await DB.put('notes', JSON.parse(ser(note)));
        Object.assign(meta, { title: note.title, updated: note.updated, pages: note.pages.length, audio: note.recs.length, text: searchText() });
        await DB.put('meta', meta);
        Versions.maybe(note);
        dirty = false;
      } catch (e) { toast('No se pudo guardar: ' + e.message); }
    }
    if (withThumb && (thumbDirty || !meta.thumb)) { meta.thumb = await makeThumb(note); thumbDirty = false; await DB.put('meta', meta); }
  }
  function searchText() {
    const parts = [note.title];
    note.pages.forEach(p => p.items.forEach(it => { if (it.t === 'x') parts.push(it.s); }));
    note.recs.forEach(r => (r.tr || []).forEach(s => parts.push(s.s)));
    if (note.pdfText) parts.push(note.pdfText);
    if (note.hw) parts.push(Object.values(note.hw).join(' '));
    return parts.join(' ').slice(0, 60000);
  }

  // ---------- puntero: Apple Pencil, dedo, mouse ----------
  const ptrs = new Map();
  let act = null, gesture = null, lastTap = 0;
  function bindPointer() {
    const el = scroller;
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch' && !act) clearHover(); });
    // con Apple Pencil, evita que el lápiz desplace la página; los dedos siguen desplazando
    el.addEventListener('touchstart', e => { if (e.target.closest('textarea, .selbox')) return; for (const t of e.touches) if (t.touchType === 'stylus') { e.preventDefault(); return; } if (!pencilMode() && tool && !['hand'].includes(tool.k)) e.preventDefault(); }, { passive: false });
    el.addEventListener('touchmove', e => { for (const t of e.touches) if (t.touchType === 'stylus') { e.preventDefault(); return; } }, { passive: false });
    // pellizco de Safari (iPad y trackpad del Mac)
    let g0 = 1;
    el.addEventListener('gesturestart', e => { e.preventDefault(); g0 = z; });
    el.addEventListener('gesturechange', e => { e.preventDefault(); setZoom(g0 * e.scale, e.clientX, e.clientY); });
    el.addEventListener('gestureend', e => e.preventDefault());
    el.addEventListener('wheel', e => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoom(z * Math.exp(-e.deltaY / 120), e.clientX, e.clientY); } }, { passive: false });
    el.addEventListener('dblclick', e => { if (tool && tool.k === 'hand') setZoom(Math.abs(z - fitZ) < 0.01 ? fitZ * 2 : fitZ, e.clientX, e.clientY); });
    el.addEventListener('contextmenu', e => e.preventDefault());
  }
  function pressureOf(e) {
    if (e.pointerType === 'pen') {
      let p = e.pressure || 0.5;
      if (!Settings.pressure) p = 0.5;
      // inclinación del Apple Pencil: sombreado más ancho con el lápiz
      if (tool && tool.k === 'pencil') {
        let alt = e.altitudeAngle;
        if (alt == null && (e.tiltX || e.tiltY)) alt = Math.PI / 2 - Math.min(Math.PI / 2, Math.hypot(e.tiltX, e.tiltY) * Math.PI / 180);
        if (alt != null && alt < 0.75) p *= 1 + (0.75 - alt) * 3.2;
      }
      return Math.min(3, p);
    }
    return 0.5;
  }
  function down(e) {
    if (e.target.closest('.selbox, .seltools, textarea.tx')) return;
    if (e.pointerType === 'pen' && !penSeen) { penSeen = true; setPencilClass(); if (Settings.pencilOnly === 'auto') toast('Apple Pencil detectado: el dedo ahora desplaza y hace zoom'); }
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType, t: Date.now() });
    // gestos de dos dedos: desplazamiento, zoom y deshacer
    if (e.pointerType === 'touch') {
      const touches = [...ptrs.values()].filter(p => p.type === 'touch');
      if (touches.length === 2 && !pencilMode()) {
        if (act && act.kind === 'draw' && Date.now() - act.t0 < 250) { act = null; clearLive(); }
        else if (act) finish(e, true);
        const [a, b] = touches;
        gesture = { d0: Math.hypot(a.x - b.x, a.y - b.y), z0: z, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, t0: Date.now(), moved: false };
        return;
      }
      if (touches.length > 2) return;
      if (pencilMode() && !['hand'].includes(tool.k)) { act = { kind: 'tap', x: e.clientX, y: e.clientY, t0: Date.now() }; return; }
    }
    if (e.button === 2) return;
    try { scroller.setPointerCapture(e.pointerId); } catch (x) {}
    start(e);
  }
  function start(e) {
    const k = tool.k, i = pageAt(e.clientX, e.clientY, 0);
    commitTextIfOutside(e);
    if (lblDone) lblDone();
    if (player && replay && player.rec && k !== 'eraser' && k !== 'lasso' && i >= 0 && (e.pointerType !== 'pen' || k === 'hand')) {
      // tocar un trazo grabado salta al momento en que se escribió
      const [x, y] = toPage(i, e.clientX, e.clientY);
      const hitS = note.pages[i].items.find(it => it.t === 's' && it.r && it.r[0] === player.rec.id && Ink.hit(it, x, y, 6 / z));
      if (hitS && (k === 'hand' || e.pointerType !== 'pen')) { act = { kind: 'seek', s: hitS, x: e.clientX, y: e.clientY, t0: Date.now() }; return; }
    }
    if (k === 'hand') { act = { kind: 'pan', x: e.clientX, y: e.clientY, sl: scroller.scrollLeft, st: scroller.scrollTop, t0: Date.now(), moved: false }; return; }
    if (k === 'laser') { act = { kind: 'laser' }; laserAdd(e); return; }
    if (i < 0) { if (k === 'lasso') clearSel(); return; }
    const [x, y] = toPage(i, e.clientX, e.clientY);
    const page = note.pages[i];
    // tocar una cinta la revela u oculta (con cualquier herramienta de escritura, al levantar sin mover)
    const tapeHit = page.items.find(it => it.t === 'tp' && Items.hit(it, x, y, 2));
    if (k === 'pen' || k === 'pencil' || k === 'marker') {
      smartHold();
      const pr = pressureOf(e);
      const s = { t: 's', id: uid(), k, c: tool.c, w: tool.w, p: [x, y, pr] };
      if (k === 'marker' && tool.straight) s.flat = 1;
      if (k === 'pen' && tool.st && tool.st !== 'ball') s.st = tool.st;
      const snapLine = rulerOn ? rulerSnap(i) : null;
      act = { kind: 'draw', pi: i, s, t0: Date.now(), last: Date.now(), lx: e.clientX, ly: e.clientY, tape: tapeHit, snapLine, straight: k === 'marker' && tool.straight };
      if (snapLine) projectLast(s.p, snapLine);
      drawLive(); armHold(); return;
    }
    if (k === 'shape' || k === 'text') {
      const g = [...page.items].reverse().find(it => it.t === 'g' && Items.hit(it, x, y, 4 / z));
      if (g) {
        const now = Date.now(), dbl = shapeTap && shapeTap.it === g && now - shapeTap.t < 420; shapeTap = { it: g, t: now };
        if (dbl || k === 'text') { editLabel(i, g); return; }
        setSel(i, [g]); beginMove(e, i, x, y); return;
      }
    }
    if (k === 'shape') { clearSel(); act = { kind: 'shape', pi: i, x0: x, y0: y, x, y }; return; }
    if (k === 'eraser') { snap(i); act = { kind: 'erase', pi: i, changed: false }; erase(e); return; }
    if (k === 'tape') { act = { kind: 'tape', pi: i, x0: x, y0: y, x, y, hit: tapeHit, pts: [x, y, 0.5] }; return; }
    if (k === 'zoom') { act = { kind: 'zoomrect', pi: i, cx0: e.clientX, cy0: e.clientY, cx: e.clientX, cy: e.clientY }; return; }
    if (k === 'text') { act = { kind: 'textTap', pi: i, x, y, cx: e.clientX, cy: e.clientY }; return; }
    if (k === 'lasso') {
      if (sel && sel.pi === i) {
        const b = sel.box;
        if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { beginMove(e, i, x, y); return; }
      }
      clearSel();
      act = { kind: 'lasso', pi: i, pts: [[x, y]], cx: e.clientX, cy: e.clientY, box: tool.box, x0: x, y0: y };
    }
  }
  function move(e) {
    const p = ptrs.get(e.pointerId);
    // vista previa del Apple Pencil al acercarlo (iPad con hover) o del mouse
    if (!act && !gesture && (e.pointerType === 'pen' || e.pointerType === 'mouse') && e.buttons === 0) { hover(e); return; }
    if (p) { p.x = e.clientX; p.y = e.clientY; }
    if (gesture) {
      const touches = [...ptrs.values()].filter(q => q.type === 'touch');
      if (touches.length < 2) return;
      const [a, b] = touches, d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      if (Math.abs(d - gesture.d0) > 8 || Math.hypot(mx - gesture.mx, my - gesture.my) > 8) gesture.moved = true;
      scroller.scrollLeft -= mx - gesture.mx; scroller.scrollTop -= my - gesture.my;
      gesture.mx = mx; gesture.my = my;
      if (gesture.moved) setZoom(gesture.z0 * d / gesture.d0, mx, my);
      return;
    }
    if (!act) return;
    if (act.kind === 'tap') return;
    if (act.kind === 'laser') { laserAdd(e); return; }
    if (act.kind === 'seek') return;
    if (act.kind === 'pan') { const dx = e.clientX - act.x, dy = e.clientY - act.y; if (Math.hypot(dx, dy) > 4) act.moved = true; scroller.scrollLeft = act.sl - dx; scroller.scrollTop = act.st - dy; return; }
    if (act.kind === 'draw') {
      if (act.shaped) return;
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of (evs.length ? evs : [e])) {
        const [x, y] = toPage(act.pi, ev.clientX, ev.clientY), pp = act.s.p, n = pp.length;
        if (Math.hypot(x - pp[n - 3], y - pp[n - 2]) < 0.35 / z) continue;
        pp.push(x, y, pressureOf(ev.pointerType ? ev : e));
        if (act.snapLine) projectLast(pp, act.snapLine);
      }
      if (act.straight) { const pp = act.s.p; act.s.p = [pp[0], pp[1], pp[2], pp[pp.length - 3], pp[1], pp[pp.length - 1]]; }
      if (Math.hypot(e.clientX - act.lx, e.clientY - act.ly) > 3) { act.last = Date.now(); act.lx = e.clientX; act.ly = e.clientY; armHold(); }
      reqLive(); return;
    }
    if (act.kind === 'shape' || act.kind === 'tape') { const [x, y] = toPage(act.pi, e.clientX, e.clientY); act.x = x; act.y = y; if (act.kind === 'tape') { const q = act.pts; if (Math.hypot(x - q[q.length - 3], y - q[q.length - 2]) > 2 / z) q.push(x, y, 0.5); } reqLive(); return; }
    if (act.kind === 'zoomrect') { act.cx = e.clientX; act.cy = e.clientY; reqLive(); return; }
    if (act.kind === 'erase') { erase(e); return; }
    if (act.kind === 'lasso' && act.box) { const [x, y] = toPage(act.pi, e.clientX, e.clientY); act.pts = Math.abs(x - act.x0) + Math.abs(y - act.y0) < 6 ? [[act.x0, act.y0]] : [[act.x0, act.y0], [x, act.y0], [x, y], [act.x0, y]]; reqLive(); return; }
    if (act.kind === 'lasso') { const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e]; for (const ev of (evs.length ? evs : [e])) act.pts.push(toPage(act.pi, ev.clientX, ev.clientY)); reqLive(); return; }
    if (act.kind === 'move') { moveSel(e); return; }
    if (act.kind === 'textTap') { if (Math.hypot(e.clientX - act.cx, e.clientY - act.cy) > 10) act.moved = true; }
  }
  function up(e) {
    const p = ptrs.get(e.pointerId); ptrs.delete(e.pointerId);
    if (gesture) {
      if ([...ptrs.values()].filter(q => q.type === 'touch').length === 0) {
        if (!gesture.moved && Date.now() - gesture.t0 < 300 && Settings.twoFingerUndo) { undo(); toast('Deshacer'); }
        gesture = null;
      }
      return;
    }
    finish(e);
  }
  function cancel(e) { ptrs.delete(e.pointerId); if (gesture && ptrs.size < 2) gesture = null; if (act && act.kind === 'draw') { act = null; clearLive(); } else if (act) finish(e); }
  function finish(e, aborted) {
    const a = act; act = null; clearTimeout(holdT);
    if (!a) return;
    if (a.kind === 'tap') {
      // toque con el dedo en modo Apple Pencil: revelar cintas, editar textos, saltar en la grabación
      if (Math.hypot(e.clientX - a.x, e.clientY - a.y) < 10 && Date.now() - a.t0 < 400) tapAt(e.clientX, e.clientY);
      return;
    }
    if (a.kind === 'seek') { if (Math.hypot(e.clientX - a.x, e.clientY - a.y) < 10) { player.audio.currentTime = Math.max(0, a.s.r[1] / 1000 - 1.5); player.audio.play(); } return; }
    if (a.kind === 'pan') { if (!a.moved) tapAt(e.clientX, e.clientY); return; }
    if (a.kind === 'laser') { if (!tool.tail) { laserPts = []; clearLive(); } return; }
    if (a.kind === 'draw') {
      clearLive();
      const s = a.s, page = note.pages[a.pi];
      // toque corto sobre una cinta: alternar
      if (a.tape && s.p.length <= 9 && Date.now() - a.t0 < 350) { snap(a.pi); a.tape.hid = !a.tape.hid; paintInk(a.pi); markDirty(); return; }
      if (aborted) return;
      const g = a.g || (shapeMode() === 'auto' && !a.shaped && !a.straight && !a.snapLine ? Shapes.fromStroke(s, true) : null);
      if (g) {
        if (rec) g.r = [rec.id, Date.now() - rec.t0 - rec.paused];
        if (Shapes.isLine(g)) { const A = Shapes.anchorAt(page.items, g.x1, g.y1), B = Shapes.anchorAt(page.items, g.x2, g.y2); if (A) g.a = A.id; if (B && B !== A) g.b = B.id; if (g.a || g.b) Shapes.attach(page.items.concat(g), new Set([g])); }
        snap(a.pi); page.items.push(g); paintInk(a.pi); markDirty(); updateEmpty(); thumbsDirty(a.pi); smartQueue(a.pi, g); return;
      }
      if (!a.shaped && !a.straight && s.p.length > 9) s.p = Ink.smooth(s.p, Settings.smoothing);
      if (rec) s.r = [rec.id, Date.now() - rec.t0 - rec.paused];
      snap(a.pi); page.items.push(s); s._bb = null;
      paintInk(a.pi); markDirty(); updateEmpty();
      // página nueva automática al escribir al final
      const b = Ink.bbox(s);
      if (Settings.autoPage && a.pi === note.pages.length - 1 && b.y + b.h > page.h - 90 && !page.bg) { note.pages.push(newPage(page)); layoutPages(); toast('Página nueva agregada'); }
      thumbsDirty(a.pi); smartQueue(a.pi, s);
      return;
    }
    if (a.kind === 'shape') {
      clearLive();
      const items = note.pages[a.pi].items;
      const g = Math.hypot(a.x - a.x0, a.y - a.y0) < 4 ? Shapes.makeAt(tool.s, a.x0, a.y0, shapeStyle()) : shapeItem(a);
      if (Shapes.isLine(g)) { const A = Shapes.anchorAt(items, g.x1, g.y1), B = Shapes.anchorAt(items, g.x2, g.y2); if (A) g.a = A.id; if (B && B !== A) g.b = B.id; }
      snap(a.pi); items.push(g); if (g.a || g.b) Shapes.attach(items, new Set([g]));
      paintInk(a.pi); markDirty(); updateEmpty(); thumbsDirty(a.pi); setSel(a.pi, [g]); return;
    }
    if (a.kind === 'tape') {
      clearLive();
      if (Math.hypot(a.x - a.x0, a.y - a.y0) < 8) { if (a.hit) { snap(a.pi); a.hit.hid = !a.hit.hid; paintInk(a.pi); markDirty(); } return; }
      snap(a.pi); note.pages[a.pi].items.push(tapeItem(a)); paintInk(a.pi); markDirty(); return;
    }
    if (a.kind === 'zoomrect') {
      clearLive();
      const w = Math.abs(a.cx - a.cx0), hh = Math.abs(a.cy - a.cy0);
      if (w < 20 || hh < 20) { setZoom(Math.abs(z - fitZ) < 0.01 ? fitZ * 2 : fitZ, a.cx, a.cy); return; }
      const r = scroller.getBoundingClientRect(), k = Math.min(r.width / w, r.height / hh) * 0.9;
      const cx = (Math.min(a.cx, a.cx0) + w / 2), cy = (Math.min(a.cy, a.cy0) + hh / 2);
      const ox = scroller.scrollLeft + cx - r.left, oy = scroller.scrollTop + cy - r.top, nz = Math.min(fitZ * 6, z * k), ratio = nz / z;
      z = nz; sizePages();
      scroller.scrollLeft = ox * ratio - r.width / 2; scroller.scrollTop = oy * ratio - r.height / 2;
      setTimeout(repaintAll, 60); renderSub(); return;
    }
    if (a.kind === 'erase') { clearLive(); if (!a.changed) hist.u.pop(); else { markDirty(); thumbsDirty(a.pi); } updUndo(); updateEmpty(); return; }
    if (a.kind === 'textTap') { if (!a.moved) textAt(a.pi, a.x, a.y); return; }
    if (a.kind === 'lasso') { clearLive(); finishLasso(a); return; }
    if (a.kind === 'move') { endMove(); return; }
  }
  function tapAt(cx, cy) {
    const i = pageAt(cx, cy); if (i < 0) return;
    const [x, y] = toPage(i, cx, cy), items = note.pages[i].items;
    const t = items.find(it => it.t === 'tp' && Items.hit(it, x, y, 4 / z));
    if (t) { snap(i); t.hid = !t.hid; paintInk(i); markDirty(); return; }
    if (player && player.rec) { const s = items.find(it => it.t === 's' && it.r && it.r[0] === player.rec.id && Ink.hit(it, x, y, 8 / z)); if (s) { player.audio.currentTime = Math.max(0, s.r[1] / 1000 - 1.5); player.audio.play(); return; } }
    const tx = [...items].reverse().find(it => it.t === 'x' && Items.hit(it, x, y));
    if (tx && tool.k === 'text') textAt(i, x, y);
  }

  // ---------- trazo en vivo ----------
  let liveReq = 0;
  function reqLive() { if (!liveReq) liveReq = requestAnimationFrame(() => { liveReq = 0; drawLive(); }); }
  function drawLive() {
    const a = act; clearLive(); if (!a) return;
    if (a.kind === 'draw') { liveTransform(a.pi); a.g ? Shapes.draw(lctx, a.g) : Ink.draw(lctx, a.s); }
    else if (a.kind === 'shape') { liveTransform(a.pi); Shapes.draw(lctx, shapeItem(a)); }
    else if (a.kind === 'tape') { liveTransform(a.pi); Items.drawAll(lctx, [tapeItem(a)]); }
    else if (a.kind === 'zoomrect') {
      const L = live.getBoundingClientRect(); lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent'); lctx.lineWidth = 2; lctx.setLineDash([6, 4]);
      lctx.strokeRect(Math.min(a.cx, a.cx0) - L.left, Math.min(a.cy, a.cy0) - L.top, Math.abs(a.cx - a.cx0), Math.abs(a.cy - a.cy0)); lctx.setLineDash([]);
    } else if (a.kind === 'lasso') {
      liveTransform(a.pi);
      lctx.strokeStyle = 'rgba(63,102,240,0.9)'; lctx.lineWidth = 1.5 / z; lctx.setLineDash([6 / z, 5 / z]); lctx.fillStyle = 'rgba(63,102,240,0.07)';
      lctx.beginPath(); a.pts.forEach((p, k) => k ? lctx.lineTo(p[0], p[1]) : lctx.moveTo(p[0], p[1])); lctx.closePath(); lctx.fill(); lctx.stroke(); lctx.setLineDash([]);
    } else if (a.kind === 'move') {
      liveTransform(sel.pi); Items.drawAll(lctx, sel.items.concat(a.links || []), { corners: Settings.mediaCorners });
    }
  }
  function hover(e) {
    if (!tool || !['pen', 'pencil', 'marker', 'eraser'].includes(tool.k)) return;
    const i = pageAt(e.clientX, e.clientY); clearLive(); if (i < 0) return;
    const [x, y] = toPage(i, e.clientX, e.clientY);
    liveTransform(i);
    if (tool.k === 'eraser') { lctx.strokeStyle = 'rgba(120,120,120,0.8)'; lctx.lineWidth = 1 / z; lctx.beginPath(); lctx.arc(x, y, tool.w / 2, 0, 7); lctx.stroke(); }
    else { lctx.globalAlpha = tool.k === 'marker' ? 0.35 : 0.6; lctx.fillStyle = tool.c; lctx.beginPath(); lctx.arc(x, y, Math.max(1.5, tool.w / 2), 0, 7); lctx.fill(); lctx.globalAlpha = 1; }
  }
  const clearHover = () => { if (!act) clearLive(); };

  // mantener quieto el trazo convierte el dibujo en figura perfecta
  let holdT;
  function armHold() {
    clearTimeout(holdT);
    if (shapeMode() === 'off' || !act || act.kind !== 'draw' || act.straight || act.s.k === 'marker') return;
    holdT = setTimeout(() => {
      if (!act || act.kind !== 'draw' || act.shaped) return;
      const g = Shapes.fromStroke(act.s, false);
      if (g) { act.g = g; act.shaped = true; reqLive(); if (navigator.vibrate) navigator.vibrate(10); return; }
      const r = Ink.recognize(act.s);
      if (r) { act.s = r; act.shaped = true; reqLive(); if (navigator.vibrate) navigator.vibrate(10); }
    }, 550);
  }
  const tapeItem = a => tool.free === false ? { t: 'tp', id: uid(), x1: a.x0, y1: a.y0, x2: a.x, y2: a.y, w: 30, c: tool.c, hid: true } : { t: 'tp', id: uid(), p: a.pts.length > 9 ? Ink.smooth(a.pts, 0.6) : a.pts.slice(), w: tool.tw || 28, c: tool.c, hid: true };
  // ---------- auto-dibujo: la IA reconoce bocetos (árbol, auto, persona…) y propone una versión limpia ----------
  let smart = null, smartBar = null;
  function smartQueue(pi, it) {
    if (shapeMode() !== 'smart' || (it.t === 's' && it.k === 'marker') || !AI.available()) return;
    const b = Items.bbox(it);
    if (smart && (smart.pi !== pi || !near(smart.box, b))) smart = null;
    if (!smart) smart = { pi, ids: [], box: b };
    smart.ids.push(it.id); const o = smart.box, x0 = Math.min(o.x, b.x), y0 = Math.min(o.y, b.y); smart.box = { x: x0, y: y0, w: Math.max(o.x + o.w, b.x + b.w) - x0, h: Math.max(o.y + o.h, b.y + b.h) - y0 };
    clearTimeout(smart.t); const cur = smart;
    smart.t = setTimeout(() => { if (smart === cur) { smart = null; smartRun(cur.pi, cur.ids); } }, cur.ids.length > 1 ? 1700 : 900);
  }
  const near = (a, b) => b.x < a.x + a.w + 140 && b.x + b.w > a.x - 140 && b.y < a.y + a.h + 140 && b.y + b.h > a.y - 140;
  function smartHold() { if (smart) clearTimeout(smart.t); closeSmartBar(); }
  function closeSmartBar() { if (smartBar) { smartBar.remove(); smartBar = null; } }
  function cleanSVG(txt, color) {
    const m = String(txt || '').match(/<svg[\s\S]*<\/svg>/i); if (!m) return null;
    const doc = new DOMParser().parseFromString(m[0], 'image/svg+xml'), svg = doc.documentElement;
    if (!svg || svg.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) return null;
    const ok = new Set(['svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'defs', 'lineargradient', 'radialgradient', 'stop']);
    [...svg.querySelectorAll('*')].forEach(n => { if (!ok.has(n.nodeName.toLowerCase())) n.remove(); });
    [svg, ...svg.querySelectorAll('*')].forEach(n => [...n.attributes].forEach(a => { const k = a.name.toLowerCase(); if (k.startsWith('on') || k.includes('href') || k === 'style') n.removeAttribute(a.name); else if (/^(stroke|fill)$/.test(k) && /^(#000(000)?|black|currentcolor)$/i.test(a.value.trim())) n.setAttribute(a.name, color); }));
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    return new XMLSerializer().serializeToString(svg);
  }
  async function svgToBlob(svg, w, h) {
    const k = Math.min(4, 1600 / Math.max(w, h)), img = await UI.loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
    const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return UI.canvasBlob(c, 'image/png');
  }
  async function smartRun(pi, ids, manual) {
    const page = note.pages[pi], items = page.items.filter(i => ids.includes(i.id) && (i.t === 's' || i.t === 'g'));
    if (!items.length) return;
    // un solo trazo: primero intenta la figura geométrica perfecta
    if (!manual && items.length === 1 && items[0].t === 's') {
      const g = Shapes.fromStroke(items[0], true);
      if (g) { g.r = items[0].r; snap(pi); page.items[page.items.indexOf(items[0])] = g; paintInk(pi); markDirty(); return; }
    }
    const b0 = selBox(items), b = { x: b0.x + 4, y: b0.y + 4, w: b0.w - 8, h: b0.h - 8 };
    // descarta escritura en renglón y trazos muy pequeños
    if (!manual && (b.w < 50 || b.h < 50 || (b.w / b.h > 4 && b.h < 70))) return;
    const k = 512 / Math.max(b.w, b.h), c = document.createElement('canvas'); c.width = Math.max(64, Math.round(b.w * k)); c.height = Math.max(64, Math.round(b.h * k));
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.setTransform(k, 0, 0, k, -b.x * k, -b.y * k);
    Items.drawAll(x, items.map(i => Object.assign({}, i, { c: '#000', fl: i.fl ? '#888' : '' })));
    const W = 400, H = Math.round(400 * b.h / b.w), color = items[0].c || '#1C1C1E';
    const pill = h('div', { class: 'smartbar busy' }, h('span', { html: icon('sparkle') }), 'Interpretando dibujo…');
    if (manual) { root.append(pill); posSmart(pill, pi, b); }
    let r;
    try {
      r = await AI.ask(`La imagen es un boceto a mano alzada hecho en una nota. Si representa algo reconocible (objeto, animal, persona, vehículo, planta, edificio, comida, órgano o instrumento médico, símbolo…) y NO es texto manuscrito ni un garabato sin sentido, identifícalo y redibújalo como lo haría un ilustrador profesional: anatomía y proporciones reales, formas naturales, detalles y textura (corteza, hojas, pliegues, reflejos, ruedas con llantas, rasgos faciales, etc.). Nada de estilo infantil ni figuras de palitos.
Responde JSON: {"obj": "nombre corto en español" o null, "emoji": ["hasta 3 emojis parecidos"], "linea": "<svg…>", "color": "<svg…>"}.
- "linea": ilustración a tinta detallada (estilo grabado o lámina de libro): contornos con grosores variados (1–4), sombreado con tramado o trazos paralelos, muchos detalles; stroke="#000", fill="none" salvo zonas de sombra sólidas en "#000".
- "color": la misma ilustración a todo color, realista, con degradados (linearGradient/radialGradient en <defs>), luces y sombras, colores naturales.
Ambos SVG: viewBox="0 0 ${W} ${H}", conserva la composición, orientación, tamaño relativo y encuadre del boceto; usa solo g, path, circle, ellipse, rect, line, polyline, polygon, defs, linearGradient, radialGradient y stop; atributos de presentación (fill, stroke, stroke-width, opacity, stop-color, offset), sin atributo style, sin texto, sin imágenes, sin scripts. Usa entre 40 y 250 elementos.`, { image: c.toDataURL('image/png'), json: true });
    } catch (e) { pill.remove(); if (manual) toast('No se pudo interpretar: ' + e.message); return; }
    pill.remove();
    if (!r || !r.obj) { if (manual) toast('No reconocí un objeto en el dibujo'); return; }
    if (ids.some(id => !page.items.some(i => i.id === id))) return; // el dibujo cambió mientras tanto
    const opts = [];
    for (const [k, col, t] of [['linea', color, 'Ilustración a tinta'], ['color', null, 'Ilustración a color'], ['svg', color, 'Versión limpia']]) {
      const svg = r[k] && cleanSVG(r[k], col || '#000'); if (!svg) continue;
      try { const blob = await svgToBlob(svg, b.w, b.h); opts.push({ blob, url: URL.createObjectURL(blob), t }); } catch (e) {}
    }
    for (const em of (r.emoji || []).slice(0, 2)) { const cv = Stickers.render({ k: 'e', v: em }, 240), blob = await UI.canvasBlob(cv, 'image/png'); opts.push({ blob, url: URL.createObjectURL(blob), emoji: true }); }
    if (!opts.length) return;
    closeSmartBar();
    const replace = async o => {
      closeSmartBar(); const id = await Blobs.put(o.blob);
      let w = b.w, hh = b.h; if (o.emoji) { w = hh = Math.max(b.w, b.h); }
      snap(pi); page.items = page.items.filter(i => !ids.includes(i.id));
      page.items.push({ t: 'i', id: uid(), b: id, x: b.x + (b.w - w) / 2, y: b.y + (b.h - hh) / 2, w, h: hh }); paintInk(pi); markDirty(); thumbsDirty(pi);
    };
    smartBar = h('div', { class: 'smartbar' }, h('span', { class: 'sq' }, '¿' + r.obj.charAt(0).toUpperCase() + r.obj.slice(1) + '?'),
      ...opts.map(o => h('button', { class: 'sopt' + (o.emoji ? ' emo' : ''), title: o.t || 'Usar emoji', onclick: () => replace(o) }, h('img', { src: o.url }))),
      AI.keys().openai ? h('button', { class: 'sopt real', title: 'Ilustración realista (OpenAI)', onclick: async e => {
        const btn = e.currentTarget; btn.classList.add('wait'); btn.textContent = '…';
        try { const blob = await AI.sketchToImage(c.toDataURL('image/png'), r.obj); replace({ blob }); }
        catch (x) { btn.classList.remove('wait'); btn.textContent = 'Realista'; toast(x.message); }
      } }, 'Realista') : null,
      h('button', { class: 'skeep', onclick: closeSmartBar }, 'Mantener'));
    root.append(smartBar); posSmart(smartBar, pi, b);
    clearTimeout(closeSmartBar.t); closeSmartBar.t = setTimeout(() => { if (smartBar && !smartBar.matches(':hover')) closeSmartBar(); }, 15000);
  }
  function posSmart(el, pi, b) {
    const r = pageEls[pi].getBoundingClientRect(), w = el.offsetWidth;
    let x = r.left + (b.x + b.w / 2) * z - w / 2, y = r.top + b.y * z - el.offsetHeight - 10;
    if (y < 120) y = r.top + (b.y + b.h) * z + 10;
    el.style.left = Math.max(8, Math.min(innerWidth - w - 8, x)) + 'px'; el.style.top = Math.max(70, Math.min(innerHeight - 70, y)) + 'px';
  }
  const shapeStyle = () => ({ c: tool.c, lw: tool.w, fl: tool.fill ? tool.c : '', fo: tool.fill === 'soft' ? 0.18 : 1, ds: tool.ds });
  const shapeItem = a => Shapes.make(tool.s, a.x0, a.y0, a.x, a.y, shapeStyle());
  let shapeTap = null;
  function shapePicker(anchor) {
    const wrap = h('div', { class: 'shp' }, ...Shapes.CATS.map(([cat, list]) => h('div', {}, h('h5', {}, cat), h('div', { class: 'shp-g' }, ...list.map(sh => h('button', { class: tool.s === sh ? 'on' : '', title: Shapes.NAMES[sh], onclick: () => { tool.s = sh; Settings.save(); document.querySelectorAll('.pop').forEach(p => p._close()); renderSub(); } }, Shapes.preview(sh, 40)))))));
    menu(anchor, [{ custom: wrap }], { cls: 'wide' });
  }
  function insertTemplate(kind) {
    const pi = currentPage(), page = note.pages[pi];
    const items = kind === 'mind' ? Shapes.mindmap(page.w / 2, Math.min(page.h / 2, 420)) : Shapes.flowchart(page.w / 2, 70);
    const b = selBox(items), k = Math.min(1, (page.w - 40) / b.w, (page.h - 40) / b.h);
    if (k < 1) items.forEach(it => Items.scale(it, page.w / 2, b.y, k));
    const b2 = selBox(items); items.forEach(it => Items.translate(it, (page.w - b2.w) / 2 - b2.x, b2.y < 20 ? 20 - b2.y : 0));
    Shapes.attach(items);
    snap(pi); page.items.push(...items); paintInk(pi); markDirty(); updateEmpty();
    if (tool.k !== 'shape') { tool = toolbox().find(t => t.k === 'shape') || tool; renderToolbar(); }
    setSel(pi, items); toast('Toca dos veces una figura para escribir · «Conectar» agrega ramas');
  }
  // texto dentro de una figura
  let lblDone = null;
  function editLabel(pi, it) {
    if (lblDone) lblDone();
    commitText(); clearSel(); snap(pi);
    it._edit = 1; paintInk(pi);
    const b = Shapes.textBox(it), fz = it.tz || 16;
    const t = h('textarea', { class: 'tx lbl', spellcheck: 'true', autocapitalize: 'sentences', placeholder: 'Escribe…' });
    t.value = it.tx || '';
    Object.assign(t.style, { left: b.x * z + 'px', width: Math.max(80, b.w) * z + 'px', font: `${it.tb ? 700 : 500} ${fz * z}px ${Items.FONTS[it.f] || Items.FONTS.system}`, color: it.tc || it.c, lineHeight: 1.25, padding: '2px' });
    pageEls[pi].append(t);
    const fit = () => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; t.style.top = (b.y + b.h / 2) * z - t.offsetHeight / 2 + 'px'; };
    fit();
    const done = lblDone = () => { lblDone = null; if (!t.isConnected) return; it.tx = t.value.trim(); delete it._edit; t.remove(); paintInk(pi); markDirty(); thumbsDirty(pi); };
    t.addEventListener('input', fit); t.addEventListener('blur', done);
    t.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); t.blur(); } });
    t.addEventListener('pointerdown', e => e.stopPropagation());
    setTimeout(() => { t.focus(); t.select(); }, 30);
  }
  function fontPicker(anchor, cur, set) {
    const wrap = h('div', { class: 'fontlist' }, ...Items.FONT_GROUPS.map(([g, list]) => h('div', {}, h('h5', {}, g), ...list.map(([v, n]) => h('button', { class: cur === v ? 'on' : '', style: { fontFamily: Items.FONTS[v] }, onclick: () => { set(v); document.querySelectorAll('.pop').forEach(p => p._close()); } }, n)))));
    menu(anchor, [{ custom: wrap }]);
  }
  const fontName = f => { for (const [, list] of Items.FONT_GROUPS) for (const [v, n] of list) if (v === f) return n; return 'Sistema'; };

  // ---------- borrador ----------
  function erase(e) {
    const a = act, i = a.pi; if (pageAt(e.clientX, e.clientY, 40) !== i) return;
    const [x, y] = toPage(i, e.clientX, e.clientY), r = tool.w / 2, page = note.pages[i];
    let changed = false; const out = [];
    for (const it of page.items) {
      const target = tool.mode === 'marker' ? it.t === 's' && it.k === 'marker' : true;
      if (target && it.t === 's' && Ink.hit(it, x, y, r)) {
        changed = true;
        if (tool.mode === 'partial') out.push(...Ink.split(it, x, y, r));
        continue;
      }
      if (target && tool.mode === 'stroke' && it.t === 'tp' && Items.hit(it, x, y, r)) { changed = true; continue; }
      if (tool.mode !== 'marker' && it.t === 'g' && Items.hit(it, x, y, r)) { changed = true; continue; }
      out.push(it);
    }
    if (changed) { page.items = out; a.changed = true; paintInk(i); }
    clearLive(); liveTransform(i); lctx.strokeStyle = 'rgba(120,120,120,0.85)'; lctx.lineWidth = 1 / z; lctx.fillStyle = 'rgba(255,255,255,0.35)';
    lctx.beginPath(); lctx.arc(x, y, r, 0, 7); lctx.fill(); lctx.stroke();
  }

  // ---------- regla ----------
  function bindRuler() {
    const el = $('.rulerEl', root), rot = $('.rl-rot', el);
    let d = null;
    el.addEventListener('pointerdown', e => {
      e.stopPropagation(); el.setPointerCapture(e.pointerId);
      const r = body.getBoundingClientRect();
      d = { rot: e.target.closest('.rl-rot'), x: e.clientX, y: e.clientY, rx: ruler.x, ry: ruler.y, a: ruler.a, ox: r.left, oy: r.top };
    });
    el.addEventListener('pointermove', e => {
      if (!d) return;
      if (d.rot) {
        const cx = d.ox + ruler.x, cy = d.oy + ruler.y;
        let a = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
        for (const sn of [0, 45, 90, 135, 180, -45, -90, -135, -180]) if (Math.abs(a - sn) < 3) a = sn;
        ruler.a = a;
      } else { ruler.x = d.rx + e.clientX - d.x; ruler.y = d.ry + e.clientY - d.y; }
      showRuler();
    });
    el.addEventListener('pointerup', () => (d = null));
  }
  function showRuler() {
    const el = $('.rulerEl', root); el.classList.toggle('hidden', !rulerOn);
    ruler.len = Math.min(body.clientWidth * 0.8, 760);
    el.style.width = ruler.len + 'px';
    el.style.transform = `translate(${ruler.x}px, ${ruler.y}px) rotate(${ruler.a}deg)`;
    $('.rl-ang', el).textContent = Math.round(((ruler.a % 180) + 180) % 180) + '°';
  }
  // devuelve la recta del borde de la regla en coordenadas de página si el trazo empieza cerca
  function rulerSnap(i) {
    const B = body.getBoundingClientRect(), a = ruler.a * Math.PI / 180;
    const ox = B.left + ruler.x, oy = B.top + ruler.y, dx = Math.cos(a), dy = Math.sin(a);
    return { ox, oy, dx, dy, i, near: true, check: true };
  }
  function projectLast(p, L) {
    const n = p.length - 3, b = pageEls[L.i].getBoundingClientRect();
    const cx = b.left + p[n] * z, cy = b.top + p[n + 1] * z;
    // dos bordes: superior (0) e inferior (alto de la regla)
    const nx = -L.dy, ny = L.dx, H = 64;
    const dist = (cx - L.ox) * nx + (cy - L.oy) * ny;
    if (L.check) { L.check = false; L.edge = Math.abs(dist) < 34 ? 0 : Math.abs(dist - H) < 34 ? H : null; if (L.edge === null) { L.off = true; return; } }
    if (L.off) return;
    const t = (cx - L.ox) * L.dx + (cy - L.oy) * L.dy, off = L.edge === 0 ? -2 : H + 2;
    const qx = L.ox + L.dx * t + nx * off, qy = L.oy + L.dy * t + ny * off;
    p[n] = (qx - b.left) / z; p[n + 1] = (qy - b.top) / z;
  }

  // ---------- láser ----------
  function laserAdd(e) {
    const L = live.getBoundingClientRect();
    laserPts.push({ x: e.clientX - L.left, y: e.clientY - L.top, t: performance.now() });
    if (!tool.tail) laserPts = laserPts.slice(-1);
    if (!laserRAF) laserRAF = requestAnimationFrame(laserLoop);
  }
  function laserLoop() {
    laserRAF = 0; const now = performance.now();
    laserPts = laserPts.filter(p => now - p.t < (tool.tail ? 700 : 100000));
    lctx.setTransform(dpr, 0, 0, dpr, 0, 0); lctx.clearRect(0, 0, live.width, live.height);
    if (!laserPts.length) return;
    const c = tool.c;
    lctx.lineCap = 'round'; lctx.lineJoin = 'round';
    for (let k = 1; k < laserPts.length; k++) {
      const a = laserPts[k - 1], b = laserPts[k], f = 1 - (now - b.t) / 700;
      lctx.strokeStyle = c; lctx.globalAlpha = Math.max(0, f) * 0.9; lctx.lineWidth = 5 * Math.max(0.3, f); lctx.shadowColor = c; lctx.shadowBlur = 12;
      lctx.beginPath(); lctx.moveTo(a.x, a.y); lctx.lineTo(b.x, b.y); lctx.stroke();
    }
    const p = laserPts[laserPts.length - 1];
    lctx.globalAlpha = 1; lctx.fillStyle = c; lctx.shadowColor = c; lctx.shadowBlur = 16;
    lctx.beginPath(); lctx.arc(p.x, p.y, 6, 0, 7); lctx.fill(); lctx.fillStyle = '#fff'; lctx.beginPath(); lctx.arc(p.x, p.y, 2.2, 0, 7); lctx.fill();
    lctx.shadowBlur = 0;
    if (tool.tail || act) laserRAF = requestAnimationFrame(laserLoop);
  }
  function stopLaser() { laserPts = []; cancelAnimationFrame(laserRAF); laserRAF = 0; clearLive(); }
  function present() {
    const el = document.documentElement;
    (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el);
    root.classList.add('presenting'); setZoom(fitZ);
    toast('Modo presentación: usa el láser. Esc para salir');
    const exit = () => { if (!document.fullscreenElement && !document.webkitFullscreenElement) { root && root.classList.remove('presenting'); document.removeEventListener('fullscreenchange', exit); document.removeEventListener('webkitfullscreenchange', exit); } };
    document.addEventListener('fullscreenchange', exit); document.addEventListener('webkitfullscreenchange', exit);
    if (!el.requestFullscreen && !el.webkitRequestFullscreen) { root.classList.add('presenting'); }
  }

  // ---------- selección (lazo) ----------
  function pointInPoly(x, y, poly) {
    let ins = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins;
    }
    return ins;
  }
  function finishLasso(a) {
    const page = note.pages[a.pi], poly = a.pts, what = tool.what || 'all';
    let items;
    if (poly.length < 4) {
      // toque: seleccionar el elemento bajo el dedo
      const [x, y] = poly[0];
      const it = [...page.items].reverse().find(it => Items.hit(it, x, y, 6 / z));
      items = it ? [it] : [];
    } else {
      items = page.items.filter(it => {
        if (what === 'ink' && it.t !== 's') return false;
        if (what === 'media' && it.t === 's') return false;
        if (it.t === 's') { let inside = 0; const n = it.p.length / 3, step = Math.max(1, Math.floor(n / 24)); let tot = 0; for (let k = 0; k < n; k += step) { tot++; if (pointInPoly(it.p[k * 3], it.p[k * 3 + 1], poly)) inside++; } return inside / tot > 0.5; }
        const b = Items.bbox(it); return pointInPoly(b.x + b.w / 2, b.y + b.h / 2, poly);
      });
    }
    if (!items.length) return;
    setSel(a.pi, items);
  }
  function selBox(items) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    items.forEach(it => { const b = Items.bbox(it); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); });
    return { x: x0 - 6, y: y0 - 6, w: x1 - x0 + 12, h: y1 - y0 + 12 };
  }
  function setSel(pi, items) {
    clearSel();
    sel = { pi, items, box: selBox(items) };
    drawSel(); selTools();
  }
  function drawSel() {
    if (!sel) return;
    const el = pageEls[sel.pi]; if (!el) return;
    let b = el.querySelector('.selbox');
    if (!b) {
      b = h('div', { class: 'selbox' }, h('i', { class: 'hnd' }));
      el.append(b);
      b.addEventListener('pointerdown', e => {
        e.stopPropagation(); e.preventDefault();
        const one = sel.items.length === 1 ? sel.items[0] : null, gh = e.target.dataset && e.target.dataset.h;
        if (one && (one.t === 'g' || one.t === 'x') && !gh && Date.now() - (b._t || 0) < 400) { const pi = sel.pi; one.t === 'g' ? editLabel(pi, one) : (clearSel(), editText(pi, one)); return; }
        b._t = Date.now(); b.setPointerCapture(e.pointerId);
        const [x, y] = toPage(sel.pi, e.clientX, e.clientY);
        beginMove(e, sel.pi, x, y, !!e.target.closest('.hnd'), gh);
        const mv = ev => moveSel(ev), upf = () => { b.removeEventListener('pointermove', mv); b.removeEventListener('pointerup', upf); b.removeEventListener('pointercancel', upf); act = null; endMove(); };
        b.addEventListener('pointermove', mv); b.addEventListener('pointerup', upf); b.addEventListener('pointercancel', upf);
      });
    }
    const bx = sel.box;
    Object.assign(b.style, { left: bx.x * z + 'px', top: bx.y * z + 'px', width: bx.w * z + 'px', height: bx.h * z + 'px' });
    // puntos de control para estirar figuras y mover los extremos de flechas
    const g = sel.items.length === 1 && sel.items[0].t === 'g' ? sel.items[0] : null;
    b.classList.toggle('shape', !!g && Shapes.isLine(g)); b.querySelector('.hnd').style.display = g ? 'none' : '';
    b.querySelectorAll('.gh').forEach(n => n.remove());
    if (g) for (const [id, hx, hy] of Shapes.handles(g)) { const n = h('i', { class: 'gh' + (id === 'bd' ? ' bd' : '') }); n.dataset.h = id; n.style.left = (hx - bx.x) * z + 'px'; n.style.top = (hy - bx.y) * z + 'px'; b.append(n); }
    posSelTools();
  }
  function selTools() {
    const st = h('div', { class: 'seltools' });
    const one = sel.items.length === 1 ? sel.items[0] : null;
    const btn = (t, fn, ic) => h('button', { onclick: e => { e.stopPropagation(); fn(); } }, ic ? h('span', { html: icon(ic) }) : null, t);
    st.append(...[
      btn('Copiar', copySel, 'copy'), btn('Cortar', () => { copySel(); delSel(); }, 'cut'), btn('Duplicar', dupSel, 'dup'), btn('Eliminar', delSel, 'trash'),
      sel.items.some(i => i.t === 's' || i.t === 'x' || i.t === 'g') ? btn('Color', () => colorSel(st), 'palette') : null,
      one && one.t === 'g' ? btn('Texto', () => editLabel(sel.pi, one), 'text') : null,
      sel.items.some(i => i.t === 'g' && !Shapes.isLine(i)) ? btn('Relleno', () => fillSel(st), 'fill') : null,
      sel.items.some(i => i.t === 'g') ? btn('Línea', () => lineSel(st), 'sh-line') : null,
      one && one.t === 'g' && Shapes.isLine(one) ? btn('Puntas', () => headsSel(one), 'sh-arrow') : null,
      one && Shapes.anchorable(one) ? btn('Conectar', () => childSel(one), 'link') : null,
      sel.items.some(i => i.t === 's') ? btn('Perfeccionar', perfectSel, 'shapes') : null,
      btn('Pegatina', stickerSel, 'sticker'),
      one && one.t === 'x' ? btn('Editar', () => { const s = sel; clearSel(); editText(s.pi, one); }, 'text') : null,
      sel.items.some(i => i.t === 's') && Settings.aiKey ? btn('Interpretar', () => { const s = sel; clearSel(); smartRun(s.pi, s.items.map(i => i.id), true); }, 'sparkle') : null,
      sel.items.some(i => i.t === 's') && Settings.aiKey ? btn('A texto', () => Smart.inkToText(note, sel.pi, sel.box), 'sparkle') : null,
      btn('Al frente', () => { snap(sel.pi); const p = note.pages[sel.pi]; p.items = p.items.filter(i => !sel.items.includes(i)).concat(sel.items); paintInk(sel.pi); markDirty(); }, 'front')].filter(Boolean));
    root.append(st); sel.tools = st; posSelTools();
  }
  function mutSel(fn) { if (!sel) return; snap(sel.pi); sel.items.filter(i => i.t === 'g').forEach(fn); sel.box = selBox(sel.items); paintInk(sel.pi); drawSel(); markDirty(); }
  function fillSel(anchor) {
    const set = (fl, fo) => { mutSel(i => { if (Shapes.isLine(i)) return; i.fl = fl; if (fo != null) i.fo = fo; }); };
    const wrap = h('div', { class: 'swrow' }, h('button', { class: 'sw none', title: 'Sin relleno', style: { '--c': 'transparent' }, onclick: () => set('') }),
      ...Settings.colors.concat(['#FFFFFF', '#FFF3A3', '#CDE7FF', '#D3F5D3', '#FFD6E0']).map(c => h('button', { class: 'sw', style: { '--c': c }, onclick: () => set(c, c === '#FFFFFF' || /^#(FFF3A3|CDE7FF|D3F5D3|FFD6E0)$/.test(c) ? 1 : undefined) })));
    const first = sel.items.find(i => i.t === 'g');
    menu(anchor, [{ custom: wrap }, '-', { t: 'Relleno suave', i: 'fill', fn: () => set(first.fl || first.c, 0.18) }, { t: 'Relleno sólido', fn: () => set(first.fl || first.c, 1) }, { t: 'Quitar relleno', fn: () => set('') }]);
  }
  function lineSel(anchor) {
    const g = sel.items.find(i => i.t === 'g');
    menu(anchor, [{ t: 'Continua', check: !g.ds, fn: () => mutSel(i => { i.ds = 0; }) }, { t: 'Discontinua', check: !!g.ds, fn: () => mutSel(i => { i.ds = 1; }) }, '-',
      ...[['Fina', 1.5], ['Media', 2.4], ['Gruesa', 4], ['Muy gruesa', 7]].map(([n, w]) => ({ t: n, check: Math.abs((g.lw || 2.4) - w) < 0.3, fn: () => mutSel(i => { i.lw = w; }) }))]);
  }
  function headsSel(g) {
    const st = [[false, false], [false, true], [true, true], [true, false]], cur = [g.hs != null ? g.hs : g.sh === 'darrow', g.he != null ? g.he : g.sh === 'arrow' || g.sh === 'darrow'];
    const k = (st.findIndex(s => s[0] === cur[0] && s[1] === cur[1]) + 1) % 4;
    mutSel(i => { i.hs = st[k][0]; i.he = st[k][1]; });
  }
  function childSel(g) {
    const pi = sel.pi, page = note.pages[pi], [n, ln] = Shapes.child(page.items, g, page.w, page.h);
    snap(pi); page.items.push(ln, n); paintInk(pi); markDirty(); editLabel(pi, n);
  }
  function perfectSel() {
    const pi = sel.pi, page = note.pages[pi]; snap(pi); let n = 0;
    const out = sel.items.map(it => { if (it.t !== 's') return it; const g = Shapes.fromStroke(it, false); if (!g) return it; n++; page.items[page.items.indexOf(it)] = g; return g; });
    paintInk(pi); markDirty(); setSel(pi, out);
    toast(n ? `${n} ${n === 1 ? 'figura perfeccionada' : 'figuras perfeccionadas'}` : 'No reconocí figuras en la selección');
  }
  async function stickerSel() {
    const b = sel.box, k = 2, c = document.createElement('canvas'); c.width = Math.ceil(b.w * k); c.height = Math.ceil(b.h * k);
    const x = c.getContext('2d'); x.setTransform(k, 0, 0, k, -b.x * k, -b.y * k);
    Items.drawAll(x, sel.items, { corners: Settings.mediaCorners });
    Stickers.addMine(await UI.canvasBlob(c, 'image/png'));
  }
  function posSelTools() {
    if (!sel || !sel.tools) return;
    const el = pageEls[sel.pi], b = el.getBoundingClientRect(), R = root.getBoundingClientRect();
    const st = sel.tools, w = st.offsetWidth;
    let x = b.left + (sel.box.x + sel.box.w / 2) * z - w / 2, y = b.top + sel.box.y * z - st.offsetHeight - 12;
    if (y < R.top + 120) y = b.top + (sel.box.y + sel.box.h) * z + 12;
    st.style.left = Math.max(8, Math.min(innerWidth - w - 8, x)) + 'px'; st.style.top = Math.max(70, Math.min(innerHeight - 60, y)) + 'px';
  }
  function clearSel() {
    if (!sel) return;
    const el = pageEls[sel.pi]; el && el.querySelector('.selbox') && el.querySelector('.selbox').remove();
    sel.tools && sel.tools.remove(); sel = null;
  }
  function beginMove(e, pi, x, y, resize, gh) {
    snap(pi);
    const items = note.pages[pi].items, one = sel.items[0];
    act = { kind: 'move', pi, x0: x, y0: y, resize, gh, orig: gh ? JSON.parse(JSON.stringify(one)) : null, box0: Object.assign({}, sel.box), last: [x, y], k: 1 };
    // un conector movido solo se suelta de sus figuras; uno arrastrado por su extremo se reengancha al soltar
    if (gh === 'p1') delete one.a; if (gh === 'p2') delete one.b;
    if (!gh && !resize && sel.items.every(i => i.t === 'g' && Shapes.isLine(i))) sel.items.forEach(i => { delete i.a; delete i.b; });
    act.links = Shapes.linksOf(items, sel.items);
    sel.mv = act;
    paintInk(pi, new Set(sel.items.concat(act.links))); sel.tools && (sel.tools.style.visibility = 'hidden');
    drawLive();
  }
  function moveSel(e) {
    if (!act || act.kind !== 'move') return;
    const [x, y] = toPage(act.pi, e.clientX, e.clientY);
    if (act.gh) Shapes.dragHandle(sel.items[0], act.orig, act.gh, x, y, e.shiftKey);
    else if (act.resize) {
      const b = act.box0, nk = Math.max(0.1, Math.max((x - b.x) / b.w, (y - b.y) / b.h)), rel = nk / act.k;
      sel.items.forEach(it => Items.scale(it, b.x, b.y, rel)); act.k = nk;
    } else {
      const dx = x - act.last[0], dy = y - act.last[1];
      sel.items.forEach(it => Items.translate(it, dx, dy)); act.last = [x, y];
    }
    const pg = note.pages[act.pi].items;
    Shapes.attach(pg, new Set(act.links.concat(sel.items.filter(i => i.t === 'g' && Shapes.isLine(i)))));
    sel.box = selBox(sel.items); drawSel(); reqLive();
  }
  function endMove() {
    if (!sel) return;
    const m = sel.mv, one = sel.items[0];
    if (m && (m.gh === 'p1' || m.gh === 'p2')) {
      const items = note.pages[sel.pi].items, A = Shapes.anchorAt(items, m.gh === 'p1' ? one.x1 : one.x2, m.gh === 'p1' ? one.y1 : one.y2, one);
      if (A) { one[m.gh === 'p1' ? 'a' : 'b'] = A.id; Shapes.attach(items, new Set([one])); }
    }
    sel.box = selBox(sel.items); drawSel();
    clearLive(); paintInk(sel.pi); sel.tools && (sel.tools.style.visibility = ''); posSelTools(); markDirty();
  }
  function copySel() { if (!sel) return; clip = { items: JSON.parse(ser(sel.items)), at: Date.now() }; toast('Copiado'); try { navigator.clipboard && navigator.clipboard.writeText(sel.items.filter(i => i.t === 'x').map(i => i.s).join('\n') || ' '); } catch (e) {} clip.at = Date.now(); }
  function delSel() { if (!sel) return; const pi = sel.pi; snap(pi); note.pages[pi].items = note.pages[pi].items.filter(i => !sel.items.includes(i)); clearSel(); paintInk(pi); markDirty(); updateEmpty(); }
  function dupSel() { if (!sel) return; const pi = sel.pi; snap(pi); const cp = sel.items.map(Items.clone); cp.forEach(i => Items.translate(i, 24, 24)); note.pages[pi].items.push(...cp); paintInk(pi); setSel(pi, cp); markDirty(); }
  function paste(atPage) {
    if (!clip) return false;
    const pi = atPage != null ? atPage : currentPage(); snap(pi);
    const cp = clip.items.map(Items.clone); cp.forEach(i => Items.translate(i, 20, 20));
    note.pages[pi].items.push(...cp); paintInk(pi); setSel(pi, cp); markDirty(); updateEmpty(); return true;
  }
  function colorSel(anchor) {
    const wrap = h('div', { class: 'swrow' }, ...Settings.colors.concat(['#FFFFFF', '#8E8E93']).map(c => h('button', { class: 'sw', style: { '--c': c }, onclick: () => { applySelColor(c); document.querySelectorAll('.pop').forEach(p => p._close()); } })));
    menu(anchor, [{ custom: wrap }]);
  }

  // ---------- texto ----------
  let ta = null;
  function textAt(pi, x, y) {
    const page = note.pages[pi];
    const hitT = [...page.items].reverse().find(it => it.t === 'x' && Items.hit(it, x, y));
    if (hitT) { editText(pi, hitT); return; }
    const w = Math.min(Settings.textBg ? 260 : 460, page.w - x - 24);
    const it = { t: 'x', id: uid(), x, y: y - (Settings.textSize * 0.8), w: Math.max(140, w), s: '', z: Settings.textSize, c: Settings.textColor || '#1C1C1E', f: Settings.textFont, b: Settings.textBold, it: Settings.textItalic ? 1 : 0, u: Settings.textUnder ? 1 : 0, bg: Settings.textBg || '', al: Settings.textAlign || 'left', fresh: true };
    snap(pi); page.items.push(it); editText(pi, it, true);
  }
  function editText(pi, it, noSnap) {
    commitText();
    if (!noSnap) snap(pi);
    editingText = { pi, it };
    paintInk(pi);
    ta = h('textarea', { class: 'tx', spellcheck: 'true', autocapitalize: 'sentences' });
    ta.value = it.s || '';
    pageEls[pi].append(ta);
    styleTextarea();
    ta.addEventListener('input', () => { it.s = ta.value; it.h = 0; autoSize(); });
    ta.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); commitText(); } e.stopPropagation(); });
    ta.addEventListener('pointerdown', e => e.stopPropagation());
    setTimeout(() => ta && ta.focus(), 30);
    if (tool.k !== 'text') { tool = toolbox().find(t => t.k === 'text') || tool; renderToolbar(); }
  }
  function styleTextarea() {
    if (!ta || !editingText) return;
    const it = editingText.it, pad = it.bg ? 14 : 2;
    Object.assign(ta.style, {
      left: it.x * z + 'px', top: it.y * z + 'px', width: it.w * z + 'px', textDecoration: it.u ? 'underline' : 'none', font: `${it.it ? 'italic ' : ''}${it.b ? 700 : 400} ${(it.z || 18) * z}px ${Items.FONTS[it.f] || Items.FONTS.system}`,
      color: it.c, background: it.bg || 'transparent', padding: pad * z + 'px', lineHeight: 1.32, textAlign: it.al || 'left', borderRadius: it.bg ? 6 * z + 'px' : '4px',
    });
    autoSize();
  }
  function autoSize() { if (!ta) return; ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }
  function posTextarea() { if (ta) styleTextarea(); }
  function commitTextIfOutside(e) { if (ta && e.target !== ta) commitText(); }
  function commitText() {
    if (!editingText) return;
    const { pi, it } = editingText; editingText = null;
    if (ta) { it.s = ta.value; ta.remove(); ta = null; }
    delete it.fresh; it.h = 0;
    const page = note.pages[pi];
    if (!it.s.trim()) { page.items = page.items.filter(x => x !== it); if (hist.u.length && hist.u[hist.u.length - 1].pi === pi && JSON.parse(hist.u[hist.u.length - 1].d).length === page.items.length) hist.u.pop(); }
    paintInk(pi); markDirty(); updateEmpty(); updUndo();
  }
  function typeMode() {
    // escribe con teclado: nuevo cuadro de texto bajo el último contenido de la página visible
    const pi = currentPage(), page = note.pages[pi];
    let y = 60; page.items.forEach(it => { const b = Items.bbox(it); y = Math.max(y, b.y + b.h + 24); });
    if (y > page.h - 80) { addPage(pi + 1); setTimeout(() => textAt(pi + 1, 48, 80), 60); return; }
    tool = toolbox().find(t => t.k === 'text'); renderToolbar();
    textAt(pi, 48, y + Settings.textSize);
  }

  // ---------- multimedia ----------
  function mediaMenu(btn) {
    menu(btn, [
      { t: 'Fotos e imágenes', i: 'image', fn: () => insertImages() },
      { t: 'Cámara', i: 'camera', fn: () => insertImages(true) },
      { t: 'Escanear documento', i: 'scan', fn: () => scanInto() },
      { t: 'Importar PDF o imágenes como páginas', i: 'import', fn: () => importInto() },
      '-',
      { t: 'Nota adhesiva', i: 'sticky', fn: () => { const pi = currentPage(); Settings.textBg = Settings.textBg || '#FFF3A3'; textAt(pi, 80, 120); } },
      { t: 'Pegatinas', i: 'sticker', fn: () => Stickers.open(b => placeImage(b, null, 120)) },
      { t: 'Figuras, 3D y diagramas', i: 'shapes', fn: () => { selectTool(toolbox().find(t => t.k === 'shape')); setTimeout(() => { const b = sub.querySelector('.shbtn'); b && shapePicker(b); }, 60); } },
      { t: 'Lluvia de ideas', i: 'brain', fn: () => insertTemplate('mind') },
      { t: 'Diagrama de flujo', i: 'flow', fn: () => insertTemplate('flow') },
      { t: 'Cinta para estudiar', i: 'tape', fn: () => selectTool(toolbox().find(t => t.k === 'tape')) },
      { t: 'Video de YouTube', i: 'youtube', fn: () => Smart.youtube(note, () => { markDirty(); showYT(); }) },
      clip ? { t: 'Pegar', i: 'paste', fn: () => paste() } : null,
      '-',
      { t: 'Página en blanco al final', i: 'page-add', fn: () => { addPage(); goPage(note.pages.length - 1); } },
      { t: 'Página desde plantilla…', i: 'template', fn: () => App.templatePicker(t => { const p = newPage(); [p.w, p.h] = pageSize(t.size, t.orient); p.paper = { tpl: t.id, color: t.color || p.paper.color, p: t.param, sp: t.sp }; addPage(currentPage() + 1, p); goPage(currentPage() + 1); }) },
    ]);
  }
  async function insertImages(camera) {
    const files = await UI.pickFiles('image/*', !camera, camera ? 'environment' : false);
    for (const f of files) await placeImage(f);
  }
  async function placeImage(blob, at, W) {
    const pi = at != null ? at : currentPage(), page = note.pages[pi];
    const img = await UI.loadImage(URL.createObjectURL(blob));
    // reduce imágenes enormes para ahorrar espacio
    let b = blob;
    if (img.naturalWidth > 2400 || blob.size > 3e6) { const c = document.createElement('canvas'), k = Math.min(1, 2400 / img.naturalWidth); c.width = img.naturalWidth * k; c.height = img.naturalHeight * k; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); b = await UI.canvasBlob(c, 'image/jpeg', 0.88); }
    const id = await Blobs.put(b);
    const w = W || Math.min(page.w * 0.6, img.naturalWidth), hh = w * img.naturalHeight / img.naturalWidth;
    snap(pi);
    const it = { t: 'i', id: uid(), b: id, x: (page.w - w) / 2, y: Math.min(page.h - hh - 20, 120), w, h: hh };
    page.items.push(it); paintInk(pi); markDirty(); updateEmpty();
    tool = toolbox().find(t => t.k === 'lasso') || tool; renderToolbar(); setSel(pi, [it]);
  }
  async function importInto() {
    const files = await UI.pickFiles('application/pdf,image/*,.trazo');
    if (!files.length) return;
    snapAll();
    const at = note.pages.length === 1 && !note.pages[0].items.length && !note.pages[0].bg ? 0 : null;
    const pages = await Importer.pagesFrom(files, note);
    if (!pages.length) { hist.u.pop(); return; }
    if (at === 0) note.pages = pages; else note.pages.splice(currentPage() + 1, 0, ...pages);
    layoutPages(); markDirty(); updateEmpty(); toast(pages.length + ' página(s) importada(s)');
  }
  async function scanInto() {
    const pages = await Importer.scan();
    if (!pages || !pages.length) return;
    snapAll();
    const empty = note.pages.length === 1 && !note.pages[0].items.length && !note.pages[0].bg;
    if (empty) note.pages = pages; else note.pages.splice(currentPage() + 1, 0, ...pages);
    layoutPages(); markDirty(); updateEmpty();
  }
  async function onPaste(e) {
    if (!root || (e.target && /INPUT|TEXTAREA/.test(e.target.tagName))) return;
    const files = Array.from((e.clipboardData && e.clipboardData.files) || []).filter(f => f.type.startsWith('image/'));
    if (files.length) { e.preventDefault(); for (const f of files) await placeImage(f); return; }
    if (clip && Date.now() - clip.at < 10 * 60e3) { e.preventDefault(); paste(); return; }
    const txt = e.clipboardData && e.clipboardData.getData('text');
    if (txt) { e.preventDefault(); const pi = currentPage(); const it = { t: 'x', id: uid(), x: 48, y: 120, w: note.pages[pi].w - 96, s: txt, z: Settings.textSize, c: Settings.textColor || '#1C1C1E', f: Settings.textFont }; snap(pi); note.pages[pi].items.push(it); paintInk(pi); markDirty(); updateEmpty(); }
  }

  // ---------- grabación sincronizada con la tinta ----------
  async function startRec() {
    if (!navigator.mediaDevices || !window.MediaRecorder) { UI.alert('Grabación no disponible', 'Este navegador no permite grabar audio.'); return; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (e) { UI.alert('Sin acceso al micrófono', 'Permite el micrófono para Trazo en Ajustes.'); return; }
    const type = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find(t => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
    const mr = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 64000 } : undefined);
    const chunks = [];
    mr.ondataavailable = e => e.data.size && chunks.push(e.data);
    mr.start(1000);
    if (player) player.audio.pause();
    rec = { id: uid(), t0: Date.now(), paused: 0, mr, stream, chunks, type: mr.mimeType || type || 'audio/mp4', tr: [] };
    rec.sr = Smart.liveTranscribe(seg => { seg.t = (Date.now() - rec.t0 - rec.paused) / 1000; rec.tr.push(seg); updRecPill(); }, txt => { rec.interim = txt; updRecPill(); });
    renderToolbar(); updRecPill();
    rec.timer = setInterval(updRecPill, 500);
  }
  function updRecPill() {
    const pill = $('.recpill', root); if (!pill) return;
    if (!rec) { pill.classList.add('hidden'); return; }
    pill.classList.remove('hidden');
    const t = (Date.now() - rec.t0 - rec.paused - (rec.pauseAt ? Date.now() - rec.pauseAt : 0)) / 1000;
    const last = rec.interim || (rec.tr.length ? rec.tr[rec.tr.length - 1].s : '');
    pill.innerHTML = '';
    pill.append(
      h('span', { class: 'rdot' + (rec.pauseAt ? ' paused' : '') }), h('b', {}, UI.dur(t)),
      h('span', { class: 'rtx' }, last ? '“' + last.slice(-80) + '”' : (rec.sr ? 'Escuchando…' : 'Grabando')),
      h('button', { class: 'ib sm', title: rec.pauseAt ? 'Continuar' : 'Pausar', onclick: pauseRec, html: icon(rec.pauseAt ? 'play' : 'pause') }),
      h('button', { class: 'ib sm', title: 'Notas inteligentes', onclick: () => Smart.panel(note, rec), html: icon('sparkle') }),
      h('button', { class: 'chip danger', onclick: stopRec }, h('span', { html: icon('stop') }), 'Detener'));
  }
  function pauseRec() {
    if (!rec) return;
    if (rec.pauseAt) { rec.paused += Date.now() - rec.pauseAt; rec.pauseAt = 0; rec.mr.resume(); rec.sr && rec.sr.resume(); }
    else { rec.pauseAt = Date.now(); rec.mr.pause(); rec.sr && rec.sr.pause(); }
    updRecPill();
  }
  function stopRec() {
    if (!rec) return Promise.resolve();
    const r = rec; rec = null; clearInterval(r.timer);
    if (r.pauseAt) r.paused += Date.now() - r.pauseAt;
    r.sr && r.sr.stop();
    return new Promise(res => {
      r.mr.onstop = async () => {
        r.stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(r.chunks, { type: r.type.split(';')[0] });
        const id = await Blobs.put(blob);
        const entry = { id: r.id, blob: id, at: r.t0, dur: (Date.now() - r.t0 - r.paused) / 1000, name: 'Grabación ' + (note.recs.length + 1), tr: r.tr, mime: blob.type };
        note.recs.push(entry); markDirty(); renderToolbar(); updRecPill();
        showPlayer(entry);
        toast('Grabación guardada · toca tu escritura para escuchar ese momento');
        if (!entry.tr.length && Settings.aiKey) Smart.transcribe(note, entry).then(() => markDirty());
        res();
      };
      try { r.mr.stop(); } catch (e) { res(); }
      renderToolbar();
    });
  }
  async function showPlayer(r) {
    const el = $('.player', root); if (!el) return;
    if (!r) { el.classList.add('hidden'); player = null; return; }
    const audio = player && player.audio || new Audio();
    audio.pause();
    audio.src = await Blobs.url(r.blob);
    audio.preload = 'metadata';
    player = { rec: r, audio };
    const range = h('input', { type: 'range', class: 'rng seek', min: 0, max: Math.max(1, r.dur), step: 0.1, value: 0 });
    const time = h('span', { class: 'ptime' }, '0:00 / ' + UI.dur(r.dur));
    const play = h('button', { class: 'ib play', html: icon('play') });
    const speeds = [1, 1.25, 1.5, 2, 0.75]; let si = 0;
    const spd = h('button', { class: 'chip sm', onclick: () => { si = (si + 1) % speeds.length; audio.playbackRate = speeds[si]; spd.textContent = speeds[si] + '×'; } }, '1×');
    const pick = h('button', { class: 'chip sm', onclick: e => menu(e.currentTarget, [...note.recs.map(x => ({ t: x.name, sub: UI.datetime(x.at) + ' · ' + UI.dur(x.dur), check: x === r, fn: () => showPlayer(x) })), '-',
      { t: 'Renombrar grabación', i: 'edit', fn: async () => { const n = await UI.prompt('Nombre de la grabación', r.name); if (n) { r.name = n; markDirty(); showPlayer(r); } } },
      { t: 'Transcribir', i: 'sparkle', fn: () => Smart.transcribe(note, r).then(() => markDirty()) },
      { t: 'Exportar audio', i: 'share', fn: async () => UI.saveBlob(await Blobs.get(r.blob), note.title + ' - ' + r.name + (r.mime && r.mime.includes('webm') ? '.webm' : '.m4a')) },
      { t: 'Eliminar grabación', i: 'trash', danger: true, fn: async () => { if (await UI.confirm('¿Eliminar esta grabación?', null, 'Eliminar', true)) { note.recs = note.recs.filter(x => x !== r); Blobs.del(r.blob); markDirty(); showPlayer(note.recs[note.recs.length - 1]); } } }], { align: 'right' }) }, h('span', { html: icon('wave') }), r.name);
    el.innerHTML = '';
    el.append(
      h('button', { class: 'ib sm', title: 'Retroceder 15 s', onclick: () => (audio.currentTime = Math.max(0, audio.currentTime - 15)), html: icon('back15') }),
      play,
      h('button', { class: 'ib sm', title: 'Avanzar 15 s', onclick: () => (audio.currentTime = Math.min(audio.duration || r.dur, audio.currentTime + 15)), html: icon('fwd15') }),
      range, time, spd,
      h('button', { class: 'chip sm' + (replay ? ' on' : ''), title: 'La tinta aparece a medida que suena el audio', onclick: e => { replay = !replay; e.currentTarget.classList.toggle('on', replay); repaintAll(); } }, h('span', { html: icon('replay') }), 'Repetir trazos'),
      h('button', { class: 'chip sm', onclick: () => Smart.panel(note, null, r) }, h('span', { html: icon('sparkle') }), 'Notas inteligentes'),
      pick,
      h('button', { class: 'ib sm', title: 'Ocultar', onclick: () => { audio.pause(); el.classList.add('hidden'); player = null; repaintAll(); }, html: icon('close') }));
    el.classList.remove('hidden');
    play.onclick = () => (audio.paused ? audio.play() : audio.pause());
    let lastPaint = 0;
    const tickF = () => {
      if (!player || player.audio !== audio) return;
      range.value = audio.currentTime; time.textContent = UI.dur(audio.currentTime) + ' / ' + UI.dur(audio.duration && isFinite(audio.duration) ? audio.duration : r.dur);
      if (replay && performance.now() - lastPaint > 120) { lastPaint = performance.now(); visible.forEach(i => { if (note.pages[i].items.some(it => it.r && it.r[0] === r.id)) paintInk(i); }); }
      Smart.syncTranscript && Smart.syncTranscript(r, audio.currentTime);
    };
    audio.ontimeupdate = tickF;
    audio.onplay = () => { play.innerHTML = icon('pause'); const loop = () => { if (!audio.paused && player && player.audio === audio) { tickF(); requestAnimationFrame(loop); } }; loop(); };
    audio.onpause = () => { play.innerHTML = icon('play'); tickF(); };
    audio.onended = () => { repaintAll(); };
    range.oninput = () => { audio.currentTime = +range.value; player.scrubbing = true; tickF(); };
    range.onchange = () => { player.scrubbing = false; };
    repaintAll();
  }
  function showYT() {
    let w = $('.ytwin', root);
    if (!note.yt) { w && w.remove(); return; }
    if (!w) {
      w = h('div', { class: 'ytwin' }, h('div', { class: 'ytbar' }, h('span', {}, 'YouTube'), h('button', { class: 'ib sm', onclick: () => { w.remove(); }, html: icon('close') })),
        h('iframe', { src: 'https://www.youtube-nocookie.com/embed/' + note.yt.id + '?playsinline=1', allow: 'autoplay; encrypted-media; picture-in-picture', allowfullscreen: '' }));
      body.append(w);
      let d; const bar = w.querySelector('.ytbar');
      bar.addEventListener('pointerdown', e => { bar.setPointerCapture(e.pointerId); d = { x: e.clientX - w.offsetLeft, y: e.clientY - w.offsetTop }; });
      bar.addEventListener('pointermove', e => { if (d) { w.style.left = e.clientX - d.x + 'px'; w.style.top = e.clientY - d.y + 'px'; w.style.right = 'auto'; } });
      bar.addEventListener('pointerup', () => (d = null));
    }
  }

  // ---------- panel de páginas ----------
  let thumbFilter = 'all', thumbSel = null, thumbQ = '';
  function togglePages() {
    root.classList.toggle('show-thumbs');
    $('#bPages', root).classList.toggle('on', root.classList.contains('show-thumbs'));
    setTimeout(onResize, 230);
    renderThumbs();
  }
  const thumbCache = new Map();
  function thumbsDirty(i) { if (i == null) thumbCache.clear(); const p = note.pages[i]; if (p) thumbCache.delete(p.id); if (root && root.classList.contains('show-thumbs')) { clearTimeout(thumbsDirty.t); thumbsDirty.t = setTimeout(renderThumbs, 600); } }
  function renderThumbs() {
    const box = $('.thumbs', root); if (!box || !root.classList.contains('show-thumbs')) return;
    box.innerHTML = '';
    const q = thumbQ.toLowerCase();
    box.append(
      h('div', { class: 'th-head' },
        h('div', { class: 'search sm' }, h('span', { html: icon('search') }), h('input', { placeholder: 'Buscar en la nota', value: thumbQ, oninput: e => { thumbQ = e.target.value; clearTimeout(renderThumbs.t); renderThumbs.t = setTimeout(() => { renderThumbs(); const i = box.querySelector('input'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); } })),
        h('button', { class: 'th-filter', onclick: e => menu(e.currentTarget, [{ t: 'Todas las páginas', check: thumbFilter === 'all', fn: () => { thumbFilter = 'all'; renderThumbs(); } }, { t: 'Páginas marcadas', check: thumbFilter === 'mark', fn: () => { thumbFilter = 'mark'; renderThumbs(); } }, { t: 'Páginas con audio', check: thumbFilter === 'audio', fn: () => { thumbFilter = 'audio'; renderThumbs(); } }]) },
          { all: 'Todas las páginas', mark: 'Páginas marcadas', audio: 'Páginas con audio' }[thumbFilter], h('span', { html: icon('chev-down') }))));
    const list = h('div', { class: 'th-list' });
    note.pages.forEach((p, i) => {
      if (thumbFilter === 'mark' && !p.mark) return;
      if (thumbFilter === 'audio' && !p.items.some(it => it.r)) return;
      if (q && !(p.items.some(it => it.t === 'x' && it.s.toLowerCase().includes(q)) || (note.pageText && (note.pageText[i] || '').toLowerCase().includes(q)) || (note.hw && (note.hw[p.id] || '').toLowerCase().includes(q)))) return;
      const cv = h('canvas', { class: 'thc' });
      const t = h('div', { class: 'th' + (i === currentPage() ? ' cur' : '') + (thumbSel && thumbSel.has(i) ? ' picked' : '') },
        h('div', { class: 'thf', style: { aspectRatio: p.w + '/' + p.h } }, cv,
          h('button', { class: 'thm' + (p.mark ? ' on' : ''), title: 'Marcar página', onclick: e => { e.stopPropagation(); p.mark = !p.mark; markDirty(); layoutPages(); } , html: icon(p.mark ? 'bookmark-f' : 'bookmark') }),
          h('button', { class: 'tho', onclick: e => { e.stopPropagation(); pageMenu(e.currentTarget, i); }, html: icon('more') }),
          thumbSel ? h('span', { class: 'thck', html: thumbSel.has(i) ? icon('check') : '' }) : null),
        h('span', { class: 'thn' }, String(i + 1)));
      t.onclick = () => { if (thumbSel) { thumbSel.has(i) ? thumbSel.delete(i) : thumbSel.add(i); renderThumbs(); } else goPage(i); };
      list.append(t);
      drawThumb(cv, p);
    });
    box.append(list);
    box.append(h('div', { class: 'th-foot' },
      thumbSel ? h('div', { class: 'row' },
        h('button', { class: 'link', onclick: () => { thumbSel = null; renderThumbs(); } }, 'Listo'),
        h('button', { class: 'ib sm', title: 'Duplicar', onclick: () => { if (!thumbSel.size) return; snapAll(); const idx = [...thumbSel].sort((a, b) => a - b); const cps = idx.map(k => JSON.parse(ser(note.pages[k]))); cps.forEach(c => (c.id = uid())); note.pages.splice(idx[idx.length - 1] + 1, 0, ...cps); thumbSel = null; layoutPages(); markDirty(); }, html: icon('dup') }),
        h('button', { class: 'ib sm', title: 'Exportar selección', onclick: () => { Exporter.pdf(note, [...thumbSel].sort((a, b) => a - b)); }, html: icon('share') }),
        h('button', { class: 'ib sm danger', title: 'Eliminar', onclick: () => { if (!thumbSel.size || thumbSel.size >= note.pages.length) { toast('Debe quedar al menos una página'); return; } snapAll(); note.pages = note.pages.filter((_, k) => !thumbSel.has(k)); thumbSel = null; layoutPages(); markDirty(); }, html: icon('trash') }))
        : h('div', { class: 'row' }, h('button', { class: 'link', onclick: () => { thumbSel = new Set(); renderThumbs(); } }, 'Seleccionar'), h('button', { class: 'ib sm', title: 'Agregar página', onclick: () => { addPage(); goPage(note.pages.length - 1); }, html: icon('page-add') }), h('button', { class: 'ib sm', title: 'Vista general', onclick: overview, html: icon('expand') }))));
  }
  async function drawThumb(cv, p) {
    const k = 150 / p.w;
    const key = p.id;
    if (thumbCache.has(key)) { const src = thumbCache.get(key); cv.width = src.width; cv.height = src.height; cv.getContext('2d').drawImage(src, 0, 0); return; }
    cv.width = Math.round(p.w * k * 2); cv.height = Math.round(p.h * k * 2);
    const c = cv.getContext('2d');
    await renderPageTo(c, p, k * 2);
    const copy = document.createElement('canvas'); copy.width = cv.width; copy.height = cv.height; copy.getContext('2d').drawImage(cv, 0, 0);
    thumbCache.set(key, copy);
  }
  function pageMenu(anchor, i) {
    const p = note.pages[i];
    menu(anchor, [
      { t: 'Insertar página antes', i: 'page-add', fn: () => addPage(i) },
      { t: 'Insertar página después', i: 'page-add', fn: () => addPage(i + 1) },
      { t: 'Duplicar página', i: 'dup', fn: () => { const c = JSON.parse(ser(p)); c.id = uid(); addPage(i + 1, c); } },
      { t: 'Mover arriba', i: 'chev-up', disabled: i === 0, fn: () => { snapAll(); note.pages.splice(i - 1, 0, note.pages.splice(i, 1)[0]); layoutPages(); markDirty(); } },
      { t: 'Mover abajo', i: 'chev-down', disabled: i === note.pages.length - 1, fn: () => { snapAll(); note.pages.splice(i + 1, 0, note.pages.splice(i, 1)[0]); layoutPages(); markDirty(); } },
      { t: p.w > p.h ? 'Girar a vertical' : 'Girar a horizontal', i: 'pages', fn: () => rotatePages([i], p.w > p.h ? 'portrait' : 'landscape') },
      { t: 'Cambiar plantilla de esta página', i: 'template', fn: () => App.templatePicker(t => { snapAll(); p.paper = Object.assign({}, p.paper, { tpl: t.id, p: t.param, color: t.color || p.paper.color, sp: t.sp }); if (!p.bg) [p.w, p.h] = pageSize(t.size, t.orient); layoutPages(); thumbsDirty(i); markDirty(); }) },
      { t: p.mark ? 'Quitar marcador' : 'Marcar página', i: 'bookmark', fn: () => { p.mark = !p.mark; markDirty(); layoutPages(); } },
      { t: 'Exportar como imagen', i: 'image', fn: () => Exporter.png(note, [i]) },
      Settings.aiKey ? { t: 'Convertir escritura a texto (IA)', i: 'sparkle', fn: () => Smart.inkToText(note, i) } : null,
      '-',
      { t: 'Eliminar página', i: 'trash', danger: true, disabled: note.pages.length < 2, fn: () => { snapAll(); note.pages.splice(i, 1); layoutPages(); markDirty(); toast('Página eliminada · puedes deshacer'); } },
    ], { align: 'right' });
  }
  function overview() {
    const grid = h('div', { class: 'ov-grid' });
    const L = UI.layer(h('div', { class: 'ov' }, h('div', { class: 'dlg-head' }, h('span'), h('h3', {}, note.title + ' · ' + note.pages.length + ' páginas'), h('button', { class: 'link b', onclick: () => L.close() }, 'Cerrar')), grid), { cls: 'full' });
    note.pages.forEach((p, i) => {
      const cv = h('canvas'); const c = h('div', { class: 'ov-c', onclick: () => { L.close(); goPage(i, false); } }, h('div', { class: 'thf', style: { aspectRatio: p.w + '/' + p.h } }, cv), h('span', {}, String(i + 1)));
      grid.append(c); drawThumb(cv, p);
    });
  }

  // ---------- menú «más» ----------
  // ---------- ventana de zoom: escribe ampliado en un panel y la tinta cae en la página ----------
  let zw = null;
  function zoomWindow(on = !zw) {
    if (zw) { zw.el.remove(); zw.box.remove(); zw = null; root.classList.remove('zw-on'); }
    if (!on) return;
    const pi = currentPage(), p = note.pages[pi];
    if (!['pen', 'pencil', 'marker', 'eraser'].includes(tool.k)) { tool = toolbox().find(t => t.k === 'pen') || tool; renderToolbar(); }
    const cv = h('canvas', { class: 'zw-cv' }), ib = (ic, t, fn) => h('button', { class: 'ib', title: t, onclick: fn, html: icon(ic) });
    const el = h('div', { class: 'zoomwin' }, h('div', { class: 'zw-bar' }, h('span', { class: 'hint' }, 'Ventana de zoom'), h('div', { class: 'grow' }),
      ib('chev-left', 'Mover a la izquierda', () => moveZW(-zw.w * 0.5, 0)), ib('chev-right', 'Mover a la derecha', () => moveZW(zw.w * 0.5, 0)),
      ib('chev-up', 'Subir', () => moveZW(0, -zw.h * 0.5)), ib('chev-down', 'Bajar', () => moveZW(0, zw.h * 0.5)),
      h('button', { class: 'chip sm', onclick: newlineZW }, '↵ Línea nueva'), ib('close', 'Cerrar', () => zoomWindow(false))), cv);
    const box = h('div', { class: 'zwbox' });
    root.append(el); root.classList.add('zw-on'); pageEls[pi].append(box);
    zw = { pi, x: 40, y: 110, w: p.w * 0.42, h: 80, el, cv, box };
    sizeZW();
    const map = e => { const r = cv.getBoundingClientRect(), px = zw.x + (e.clientX - r.left) / r.width * zw.w, py = zw.y + (e.clientY - r.top) / r.height * zw.h, b = pageEls[zw.pi].getBoundingClientRect();
      return { clientX: b.left + px * z, clientY: b.top + py * z, pointerId: 9000 + e.pointerId, pointerType: e.pointerType, pressure: e.pressure, tiltX: e.tiltX, tiltY: e.tiltY, altitudeAngle: e.altitudeAngle, button: e.button, buttons: e.buttons, shiftKey: e.shiftKey, target: scroller, preventDefault() {}, stopPropagation() {} }; };
    cv.addEventListener('pointerdown', e => { e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (x) {} down(map(e)); drawZW(); });
    cv.addEventListener('pointermove', e => { if (!act) return; const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : []; for (const ev of (evs.length ? evs : [e])) move(map(ev)); drawZW(); });
    const end = e => { const n = note.pages[zw.pi].items.length, wasDraw = act && act.kind === 'draw'; up(map(e)); drawZW(); if (wasDraw && note.pages[zw.pi].items.length > n) autoZW(); };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    cv.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
    box.addEventListener('pointerdown', e => {
      e.stopPropagation(); e.preventDefault(); box.setPointerCapture(e.pointerId);
      const sx = e.clientX, sy = e.clientY, ox = zw.x, oy = zw.y;
      const mv = ev => { zw.x = ox + (ev.clientX - sx) / z; zw.y = oy + (ev.clientY - sy) / z; placeZW(false); };
      const upf = () => { box.removeEventListener('pointermove', mv); box.removeEventListener('pointerup', upf); };
      box.addEventListener('pointermove', mv); box.addEventListener('pointerup', upf);
    });
  }
  function sizeZW() { const r = zw.cv.getBoundingClientRect(); zw.cv.width = r.width * dpr; zw.cv.height = r.height * dpr; zw.h = zw.w * r.height / r.width; placeZW(true); }
  function placeZW(scroll) {
    const p = note.pages[zw.pi];
    zw.x = Math.max(0, Math.min(p.w - zw.w, zw.x)); zw.y = Math.max(0, Math.min(p.h - zw.h, zw.y));
    Object.assign(zw.box.style, { left: zw.x * z + 'px', top: zw.y * z + 'px', width: zw.w * z + 'px', height: zw.h * z + 'px' });
    if (scroll) { const b = zw.box.getBoundingClientRect(), S = scroller.getBoundingClientRect(), panel = zw.el.getBoundingClientRect().top; if (b.top < S.top + 20 || b.bottom > panel - 20) scroller.scrollTop += b.top - (S.top + (panel - S.top) * 0.35); }
    drawZW();
  }
  function moveZW(dx, dy) { zw.x += dx; zw.y += dy; placeZW(true); }
  function newlineZW() { zw.x = 40; zw.y += zw.h * 0.55; if (zw.y + zw.h > note.pages[zw.pi].h) { if (zw.pi < note.pages.length - 1) { zw.pi++; zw.y = 60; pageEls[zw.pi].append(zw.box); } } placeZW(true); }
  function autoZW() {
    // al llegar al borde derecho avanza sola, como en Notability
    const items = note.pages[zw.pi].items, s = items[items.length - 1], b = Items.bbox(s);
    if (b.x + b.w > zw.x + zw.w * 0.82) { if (zw.x + zw.w >= note.pages[zw.pi].w - 4) newlineZW(); else moveZW(zw.w * 0.55, 0); }
  }
  function drawZW() {
    if (!zw) return;
    const c = zw.cv.getContext('2d'), k = zw.cv.width / zw.w, p = note.pages[zw.pi];
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, zw.cv.width, zw.cv.height);
    c.setTransform(k, 0, 0, k, -zw.x * k, -zw.y * k);
    Paper.draw(c, p.w, p.h, p.paper);
    const bg = pageEls[zw.pi] && pageEls[zw.pi].querySelector('.bg'); if (p.bg && bg && bg.width) c.drawImage(bg, 0, 0, p.w, p.h);
    Items.drawAll(c, p.items, { corners: Settings.mediaCorners, editing: editingText && editingText.it });
    if (act && act.kind === 'draw' && act.pi === zw.pi) act.g ? Shapes.draw(c, act.g) : Ink.draw(c, act.s);
    c.setTransform(1, 0, 0, 1, 0, 0); c.strokeStyle = 'rgba(63,102,240,.35)'; c.setLineDash([6, 6]); c.lineWidth = 1;
    const gx = zw.cv.width * 0.82; c.beginPath(); c.moveTo(gx, 0); c.lineTo(gx, zw.cv.height); c.stroke(); c.setLineDash([]);
  }

  function applyTpl(t, all) {
    snapAll();
    note.pages.forEach(p => { if (p.bg) return; p.paper = Object.assign({}, p.paper, { tpl: t.id, p: t.param, color: t.color || p.paper.color, sp: t.sp }); [p.w, p.h] = pageSize(t.size, t.orient); });
    note.paper = Object.assign({}, note.paper, { tpl: t.id, color: t.color || note.paper.color, sp: t.sp });
    layoutPages(); thumbsDirty(); markDirty(); updateEmpty();
  }
  // gira páginas entre vertical y horizontal (sin cambiar lo escrito)
  function rotatePages(idx, orient) {
    snapAll(); let n = 0;
    idx.forEach(i => { const p = note.pages[i]; if (p.bg) return; const land = p.w > p.h; if (orient === 'landscape' ? !land : land) { [p.w, p.h] = [p.h, p.w]; n++; } });
    layoutPages(); thumbsDirty(); markDirty(); toast(n ? (orient === 'landscape' ? 'Páginas en horizontal' : 'Páginas en vertical') : 'Ya estaban en esa orientación');
  }
  function setScrollDir(d) {
    Settings.scrollDir = d; Settings.save(); root.classList.toggle('hscroll', d === 'h'); layoutPages(); setZoom(fitZ);
  }

  function moreMenu(btn) {
    menu(btn, [
      { t: 'Ventana de zoom', sub: 'Escribe en grande, la tinta cae pequeña', i: 'zoom', fn: () => zoomWindow(true) },
      { t: 'Exportación rápida', sub: 'PDF, todas las páginas', i: 'share', fn: () => Exporter.pdf(note) },
      { t: 'Exportar como…', i: 'export', fn: () => exportAs() },
      { t: 'Guardar página como plantilla', i: 'gallery', fn: () => App.savePageAsTemplate(note.pages[currentPage()]) },
      { t: 'Imprimir', i: 'print', fn: () => Exporter.print(note) },
      '-',
      { t: 'Notas inteligentes', sub: 'Resumen, tarjetas, cuestionario, chat', i: 'sparkle', fn: () => Smart.panel(note) },
      { t: 'Iniciar sesión de estudio', i: 'timer', fn: () => Study.open(note, { setTapes, goPage }) },
      { t: 'Buscar en la nota', i: 'search', fn: () => { if (!root.classList.contains('show-thumbs')) togglePages(); setTimeout(() => $('.thumbs input', root).focus(), 250); } },
      '-',
      { t: 'Configuración de plantilla', i: 'template', fn: paperSheet },
      { t: 'Ver configuración', i: 'view', fn: e => viewMenu(btn) },
      { t: 'Historial de versiones', i: 'history', fn: () => Versions.show(note, async restored => { await saveNow(); note = restored; layoutPages(); markDirty(); }) },
      '-',
      { t: note.title, sub: 'Creada: ' + UI.datetime(note.created) + ' · ' + note.pages.length + ' pág.', i: 'info', fn: () => App.noteInfo(meta) },
      { custom: h('div', { class: 'pop-row' },
        h('button', { title: 'Ajustes', onclick: () => { document.querySelectorAll('.pop').forEach(p => p._close()); App.settings(); }, html: icon('gear') }),
        h('button', { class: pencilMode() ? 'on' : '', title: 'Dibujar solo con Apple Pencil', onclick: () => { document.querySelectorAll('.pop').forEach(p => p._close()); Settings.pencilOnly = pencilMode() ? 'off' : 'on'; Settings.save(); setPencilClass(); toast(pencilMode() ? 'Solo Apple Pencil: el dedo desplaza' : 'El dedo también escribe'); }, html: icon('pencil-off') })) },
    ], { align: 'right', cls: 'wide' });
  }
  function viewMenu(btn) {
    menu(btn, [
      { t: 'Desplazamiento vertical', check: Settings.scrollDir !== 'h', fn: () => setScrollDir('v') },
      { t: 'Desplazamiento horizontal', check: Settings.scrollDir === 'h', fn: () => setScrollDir('h') },
      '-',
      { t: 'Todas las páginas en vertical', i: 'pages', fn: () => rotatePages(note.pages.map((_, i) => i), 'portrait') },
      { t: 'Todas las páginas en horizontal', i: 'pages', fn: () => rotatePages(note.pages.map((_, i) => i), 'landscape') },
      '-',
      { t: 'Desplazamiento continuo', check: Settings.view !== 'paged', fn: () => { Settings.view = 'continuous'; Settings.save(); root.classList.remove('paged'); } },
      { t: 'Página por página', check: Settings.view === 'paged', fn: () => { Settings.view = 'paged'; Settings.save(); root.classList.add('paged'); } },
      '-',
      { t: 'Ajustar al ancho', i: 'expand', fn: () => setZoom(fitZ) },
      { t: 'Página nueva automática al final', check: Settings.autoPage, fn: () => { Settings.autoPage = !Settings.autoPage; Settings.save(); } },
      { t: 'Esquinas redondeadas en imágenes', check: Settings.mediaCorners === 'round', fn: () => { Settings.mediaCorners = Settings.mediaCorners === 'round' ? 'square' : 'round'; Settings.save(); repaintAll(); } },
      { t: 'Modo presentación', i: 'present', fn: present },
    ], { align: 'right' });
  }
  function exportAs() {
    UI.dialog({
      title: 'Exportar como', body: h('div', { class: 'exp-grid' },
        ...[['PDF', 'pdf', 'Documento con tus anotaciones'], ['Imágenes PNG', 'png', 'Una imagen por página'], ['Nota Trazo', 'trazo', 'Con audio, para otro dispositivo'], ['Texto', 'txt', 'Textos y transcripciones'], ['PDF sin cintas', 'pdfnt', 'Muestra lo que tapan las cintas']].map(([n, k, d]) => h('button', { class: 'exp', onclick: () => { document.querySelector('.layer.in') && document.querySelector('.layer.in')._close(); ({ pdf: () => Exporter.pdf(note), png: () => Exporter.png(note), trazo: () => Exporter.trazo(note), txt: () => Exporter.text(note), pdfnt: () => Exporter.pdf(note, null, { noTapes: true }) })[k](); } }, h('b', {}, n), h('small', {}, d)))),
      buttons: [{ t: 'Cerrar', v: false }],
    });
  }
  function paperSheet() {
    const pi = currentPage(), p = note.pages[pi];
    let scope = 'all', tpl = p.paper.tpl, color = p.paper.color, size = Object.keys(SIZES).find(k => SIZES[k][0] === p.w && SIZES[k][1] === p.h) || 'letter';
    const body2 = h('div', { class: 'paper-sheet' });
    const draw = () => {
      body2.innerHTML = '';
      const tg = h('div', { class: 'tpl-row' });
      ['blank', 'ruled', 'college', 'narrow', 'grid', 'smallgrid', 'dot', 'iso', 'music', 'cornell'].forEach(id => {
        const c = h('canvas', { width: 90, height: 116 });
        const x = c.getContext('2d'); x.scale(90 / 816, 116 / 1056); Paper.draw(x, 816, 1056, { tpl: id, color });
        tg.append(h('button', { class: 'tpl-mini' + (tpl === id ? ' on' : ''), onclick: () => { tpl = id; draw(); } }, c, h('span', {}, Paper.T[id].name)));
      });
      tg.append(h('button', { class: 'tpl-mini more', onclick: () => App.templatePicker(t => { tpl = t.id; apply(t.param); }) }, h('span', { html: icon('template') }), h('span', {}, 'Más plantillas')));
      body2.append(h('h4', {}, 'Plantilla'), tg,
        h('h4', {}, 'Color del papel'), h('div', { class: 'swrow' }, ...PAPER_COLORS.map(pc => h('button', { class: 'sw lg' + (pc.c === color ? ' on' : ''), title: pc.n, style: { '--c': pc.c }, onclick: () => { color = pc.c; draw(); } }))),
        h('h4', {}, 'Tamaño'), h('div', { class: 'seg' }, ...[['letter', 'Carta'], ['a4', 'A4'], ['wide', 'Panorámico'], ['phone', 'Vertical estrecho']].map(([k, n]) => h('button', { class: size === k ? 'on' : '', onclick: () => { size = k; draw(); } }, n))),
        h('h4', {}, 'Aplicar a'), h('div', { class: 'seg' }, h('button', { class: scope === 'all' ? 'on' : '', onclick: () => { scope = 'all'; draw(); } }, 'Todas las páginas'), h('button', { class: scope === 'one' ? 'on' : '', onclick: () => { scope = 'one'; draw(); } }, 'Esta página')));
    };
    const apply = param => {
      snapAll();
      const [w, hh] = SIZES[size];
      (scope === 'all' ? note.pages : [p]).forEach(pg => { if (!pg.bg) { pg.paper = { tpl, color, p: param || (Paper.T[tpl].param ? Paper.T[tpl].param() : undefined) }; pg.w = w; pg.h = hh; } else pg.paper = Object.assign({}, pg.paper, { color }); });
      if (scope === 'all') note.paper = { tpl, color };
      thumbCache.clear(); layoutPages(); markDirty(); L.close();
    };
    draw();
    const L = UI.layer(h('div', { class: 'dlg wide' }, h('div', { class: 'dlg-head' }, h('button', { class: 'link', onclick: () => L.close() }, 'Cancelar'), h('h3', {}, 'Configuración de plantilla'), h('button', { class: 'link b', onclick: () => apply() }, 'Aplicar')), body2), { cls: 'center' });
  }

  // ---------- teclado ----------
  function onKey(e) {
    if (!root || /INPUT|TEXTAREA|SELECT/.test(document.activeElement && document.activeElement.tagName) || document.activeElement && document.activeElement.isContentEditable) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (mod && e.key.toLowerCase() === 'c' && sel) { e.preventDefault(); copySel(); return; }
    if (mod && e.key.toLowerCase() === 'x' && sel) { e.preventDefault(); copySel(); delSel(); return; }
    if (mod && e.key.toLowerCase() === 'd' && sel) { e.preventDefault(); dupSel(); return; }
    if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); setZoom(z * 1.2); return; }
    if (mod && e.key === '-') { e.preventDefault(); setZoom(z / 1.2); return; }
    if (mod && e.key === '0') { e.preventDefault(); setZoom(fitZ); return; }
    if ((e.key === 'Backspace' || e.key === 'Delete') && sel) { e.preventDefault(); delSel(); return; }
    if (e.key === 'Escape') { if (sel) clearSel(); else if (root.classList.contains('presenting')) root.classList.remove('presenting'); return; }
    if (mod) return;
    const map = { p: 'pen', l: 'pencil', h: 'marker', e: 'eraser', t: 'text', s: 'lasso', ' ': 'hand', k: 'tape', r: 'ruler', x: 'laser', f: 'shape' };
    const k = map[e.key.toLowerCase()];
    if (k) { const t = toolbox().find(t => t.k === k && !t.hidden) || toolbox().find(t => t.k === k); if (t) { e.preventDefault(); selectTool(t); } }
    if (e.key === 'PageDown' || e.key === 'ArrowRight' && root.classList.contains('paged')) goPage(currentPage() + 1);
    if (e.key === 'PageUp' || e.key === 'ArrowLeft' && root.classList.contains('paged')) goPage(currentPage() - 1);
  }

  return {
    open, close, undo, redo, get note() { return note; }, isOpen: () => !!root, newPage, markDirty, repaintAll, goPage, currentPage,
    exportPDF: () => note && Exporter.pdf(note), importInto, insertImages, startRec: () => startRec(), save: saveNow,
    zoomIn: () => setZoom(z * 1.2), zoomOut: () => setZoom(z / 1.2), zoomFit: () => setZoom(fitZ), addText: (pi, it) => { snap(pi); note.pages[pi].items.push(it); paintInk(pi); markDirty(); updateEmpty(); },
    _dbg: () => ({ act, sel: sel && { pi: sel.pi, n: sel.items.length }, tool: tool && tool.k, visible: [...visible], pencil: pencilMode() }),
    layout: () => layoutPages(), toggleRecord: () => (rec ? stopRec() : startRec()), showYT,
  };
})();

// miniatura de la primera página para la biblioteca
async function makeThumb(note) {
  try {
    const p = note.pages[0], k = 240 / p.w, c = document.createElement('canvas');
    c.width = Math.round(p.w * k); c.height = Math.round(Math.min(p.h, p.w * 1.3) * k);
    await renderPageTo(c.getContext('2d'), p, k);
    return c.toDataURL('image/jpeg', 0.72);
  } catch (e) { return ''; }
}
