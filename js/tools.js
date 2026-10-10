// Trazo — importar, escanear, exportar, versiones, sesión de estudio, pausa mental y copias de seguridad
'use strict';

const Importer = (() => {
  // convierte archivos (PDF, imágenes, .trazo) en páginas
  async function pagesFrom(files, note) {
    const out = [], b = UI.busy('Importando…');
    try {
      for (const f of files) {
        if (/pdf$/i.test(f.type) || /\.pdf$/i.test(f.name)) {
          b.set('Leyendo ' + f.name + '…');
          const blob = await Blobs.put(f), doc = await PDFs.openData(await f.arrayBuffer());
          const texts = [];
          for (let n = 0; n < doc.numPages; n++) {
            const pg = await doc.getPage(n + 1), vp = pg.getViewport({ scale: 1 });
            const w = 816, hh = Math.round(816 * vp.height / vp.width);
            out.push({ id: uid(), w, h: hh, paper: { tpl: 'blank', color: '#FFFFFF' }, bg: { kind: 'pdf', blob, n }, items: [] });
            try { const tc = await pg.getTextContent(); texts.push(tc.items.map(i => i.str).join(' ')); } catch (e) { texts.push(''); }
            if (n % 10 === 0) b.set(`Página ${n + 1} de ${doc.numPages}…`);
          }
          if (note) { note.pdfText = ((note.pdfText || '') + '\n' + texts.join('\n')).slice(0, 200000); note.pageText = (note.pageText || []); }
        } else if (/^image\//.test(f.type) || /\.(jpe?g|png|heic|gif|webp)$/i.test(f.name)) {
          out.push(await imagePage(f));
        } else if (/\.trazo$/i.test(f.name)) {
          const id = await Backup.importNote(f); if (id) UI.toast('Nota importada a tu biblioteca');
        }
      }
    } catch (e) { UI.alert('No se pudo importar', e.message); }
    b.done();
    return out;
  }
  async function imagePage(blob) {
    const img = await UI.loadImage(URL.createObjectURL(blob));
    let b = blob;
    if (img.naturalWidth > 2200 || blob.size > 2.5e6 || !/jpeg|png/.test(blob.type)) {
      const c = document.createElement('canvas'), k = Math.min(1, 2200 / img.naturalWidth); c.width = img.naturalWidth * k; c.height = img.naturalHeight * k;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); b = await UI.canvasBlob(c, 'image/jpeg', 0.88);
    }
    const id = await Blobs.put(b), w = 816, hh = Math.round(816 * img.naturalHeight / img.naturalWidth);
    return { id: uid(), w, h: hh, paper: { tpl: 'blank', color: '#FFFFFF' }, bg: { kind: 'image', blob: id }, items: [] };
  }
  // escáner: cámara + recorte automático de márgenes + realce tipo documento
  async function scan() {
    const files = await UI.pickFiles('image/*', true, 'environment');
    if (!files.length) return null;
    const mode = await UI.dialog({ title: 'Escanear documento', body: UI.h('p', {}, 'Elige cómo procesar ' + (files.length > 1 ? 'las ' + files.length + ' fotos' : 'la foto') + '.'),
      buttons: [{ t: 'Original', v: 'color' }, { t: 'Gris', v: 'gray' }, { t: 'Documento (B/N)', v: 'doc', primary: true }] });
    if (!mode) return null;
    const pages = [], b = UI.busy('Procesando escaneo…');
    for (const f of files) {
      const img = await UI.loadImage(URL.createObjectURL(f));
      const k = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas'); c.width = img.naturalWidth * k; c.height = img.naturalHeight * k;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0, c.width, c.height);
      if (mode !== 'color') {
        const d = x.getImageData(0, 0, c.width, c.height), a = d.data;
        // nivelación por brillo local para eliminar sombras
        const W = c.width, H = c.height, g = new Float32Array(W * H);
        for (let i = 0; i < W * H; i++) g[i] = 0.299 * a[i * 4] + 0.587 * a[i * 4 + 1] + 0.114 * a[i * 4 + 2];
        const R = Math.round(Math.max(W, H) / 40), integ = new Float64Array((W + 1) * (H + 1));
        for (let y = 0; y < H; y++) { let row = 0; for (let xx = 0; xx < W; xx++) { row += g[y * W + xx]; integ[(y + 1) * (W + 1) + xx + 1] = integ[y * (W + 1) + xx + 1] + row; } }
        for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
          const x0 = Math.max(0, xx - R), x1 = Math.min(W, xx + R), y0 = Math.max(0, y - R), y1 = Math.min(H, y + R);
          const m = (integ[y1 * (W + 1) + x1] - integ[y0 * (W + 1) + x1] - integ[y1 * (W + 1) + x0] + integ[y0 * (W + 1) + x0]) / ((x1 - x0) * (y1 - y0));
          let v = Math.min(255, g[y * W + xx] / Math.max(1, m) * 245);
          if (mode === 'doc') v = v > 200 ? 255 : v < 120 ? Math.max(0, v - 50) : v;
          const i = (y * W + xx) * 4; a[i] = a[i + 1] = a[i + 2] = v;
        }
        x.putImageData(d, 0, 0);
      }
      pages.push(await imagePage(await UI.canvasBlob(c, 'image/jpeg', 0.9)));
      await UI.tick();
    }
    b.done();
    return pages;
  }
  return { pagesFrom, scan, imagePage };
})();

const Exporter = (() => {
  let plib;
  const loadPL = () => plib || (plib = new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'lib/pdf-lib.min.js'; s.onload = () => res(window.PDFLib); s.onerror = rej; document.head.append(s); }));
  const safe = s => (s || 'Nota').replace(/[\\/:*?"<>|]/g, '-').slice(0, 80);
  async function pdfBlob(note, idx, opts = {}) {
    const PL = await loadPL(), doc = await PL.PDFDocument.create();
    doc.setTitle(note.title); doc.setCreator('Trazo'); doc.setProducer('Trazo');
    const srcDocs = new Map();
    const list = idx || note.pages.map((_, i) => i);
    const b = UI.busy('Creando PDF…');
    try {
      for (let k = 0; k < list.length; k++) {
        const p = note.pages[list[k]], W = p.w * 0.75, H = p.h * 0.75;
        b.set(`Página ${k + 1} de ${list.length}…`);
        let page;
        if (p.bg && p.bg.kind === 'pdf') {
          // conserva la página original del PDF (texto seleccionable) y superpone las anotaciones
          if (!srcDocs.has(p.bg.blob)) srcDocs.set(p.bg.blob, await PL.PDFDocument.load(await (await Blobs.get(p.bg.blob)).arrayBuffer(), { ignoreEncryption: true }));
          const [emb] = await doc.embedPages([srcDocs.get(p.bg.blob).getPage(p.bg.n)]);
          page = doc.addPage([W, H]); page.drawPage(emb, { x: 0, y: 0, width: W, height: H });
          if (p.items.length) {
            const c = document.createElement('canvas'), sc = 2.5; c.width = p.w * sc; c.height = p.h * sc;
            await renderPageTo(c.getContext('2d'), p, sc, { bg: false, noTapes: opts.noTapes });
            const png = await doc.embedPng(await (await UI.canvasBlob(c)).arrayBuffer());
            page.drawImage(png, { x: 0, y: 0, width: W, height: H });
          }
        } else {
          const c = document.createElement('canvas'), sc = 2.5; c.width = p.w * sc; c.height = p.h * sc;
          await renderPageTo(c.getContext('2d'), p, sc, { noTapes: opts.noTapes });
          const jpg = await doc.embedJpg(await (await UI.canvasBlob(c, 'image/jpeg', 0.9)).arrayBuffer());
          page = doc.addPage([W, H]); page.drawImage(jpg, { x: 0, y: 0, width: W, height: H });
        }
        await UI.tick();
      }
      return new Blob([await doc.save()], { type: 'application/pdf' });
    } finally { b.done(); }
  }
  async function pdf(note, idx, opts) { try { UI.saveBlob(await pdfBlob(note, idx, opts), safe(note.title) + '.pdf'); } catch (e) { UI.alert('No se pudo exportar', e.message); } }
  async function png(note, idx) {
    const list = idx || note.pages.map((_, i) => i), blobs = [];
    const b = UI.busy('Creando imágenes…');
    for (const i of list) { const p = note.pages[i], c = document.createElement('canvas'), sc = 2; c.width = p.w * sc; c.height = p.h * sc; await renderPageTo(c.getContext('2d'), p, sc); blobs.push(await UI.canvasBlob(c)); }
    b.done();
    if (blobs.length === 1) return UI.saveBlob(blobs[0], safe(note.title) + '.png');
    if (!UI.native && navigator.canShare) {
      const files = blobs.map((bb, k) => new File([bb], `${safe(note.title)} ${k + 1}.png`, { type: 'image/png' }));
      if (navigator.canShare({ files })) { try { await navigator.share({ files }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    }
    await loadZip(); const z = new JSZip(); blobs.forEach((bb, k) => z.file(`${safe(note.title)} ${k + 1}.png`, bb));
    UI.saveBlob(await z.generateAsync({ type: 'blob' }), safe(note.title) + '.zip');
  }
  function text(note) {
    const out = ['# ' + note.title, ''];
    note.pages.forEach((p, i) => { const t = p.items.filter(x => x.t === 'x').map(x => x.s); const hw = note.hw && note.hw[p.id]; if (t.length || hw) out.push('## Página ' + (i + 1), ...t, hw ? '\n' + hw : '', ''); });
    (note.recs || []).forEach(r => { if (r.tr && r.tr.length) out.push('## ' + r.name, r.tr.map(s => `[${UI.dur(s.t)}] ${s.s}`).join('\n'), ''); });
    if (note.smart && note.smart.summary) out.push('## Resumen', note.smart.summary.text);
    UI.saveBlob(new Blob([out.join('\n')], { type: 'text/markdown' }), safe(note.title) + '.md');
  }
  async function trazo(note) { UI.saveBlob(await Backup.noteZip(note), safe(note.title) + '.trazo'); }
  async function print(note) {
    const blob = await pdfBlob(note);
    if (UI.native) { UI.bridge({ op: 'printPDF', data: await UI.blobB64(blob) }); return; }
    const u = URL.createObjectURL(blob), w = window.open(u);
    if (!w) UI.saveBlob(blob, safe(note.title) + '.pdf');
  }
  return { pdf, pdfBlob, png, text, trazo, print, safe };
})();
let zipP;
const loadZip = () => zipP || (zipP = new Promise((res, rej) => { if (window.JSZip) return res(); const s = document.createElement('script'); s.src = 'lib/jszip.min.js'; s.onload = res; s.onerror = rej; document.head.append(s); }));

// ---------- historial de versiones ----------
const Versions = (() => {
  async function maybe(note) {
    try {
      const last = await KV.get('lastver:' + note.id);
      if (last && Date.now() - last < 10 * 60e3) return;
      await KV.set('lastver:' + note.id, Date.now());
      await DB.put('versions', { vid: uid(), note: note.id, ts: Date.now(), data: JSON.stringify(note, (k, v) => k === '_bb' ? undefined : v), pages: note.pages.length });
    } catch (e) {}
  }
  async function prune() {
    try {
      const lim = Date.now() - (Settings.versionDays || 90) * 864e5;
      const all = await DB.all('versions');
      for (const v of all) if (v.ts < lim) await DB.del('versions', v.vid);
    } catch (e) {}
  }
  async function show(note, onRestore) {
    const list = (await DB.byIndex('versions', 'note', note.id)).sort((a, b) => b.ts - a.ts);
    const { h } = UI;
    const box = h('div', { class: 'ver-list' });
    if (!list.length) box.append(h('p', { class: 'muted' }, 'Aún no hay versiones guardadas. Trazo guarda una versión cada 10 minutos de edición y las conserva ' + (Settings.versionDays || 90) + ' días.'));
    list.forEach(v => box.append(h('div', { class: 'ver' }, h('div', {}, h('b', {}, UI.datetime(v.ts)), h('small', {}, UI.rel(v.ts) + ' · ' + v.pages + ' pág.')),
      h('button', { class: 'chip', onclick: async () => {
        if (!(await UI.confirm('¿Restaurar esta versión?', 'La versión actual se guardará en el historial antes de restaurar.', 'Restaurar'))) return;
        await DB.put('versions', { vid: uid(), note: note.id, ts: Date.now(), data: JSON.stringify(note, (k, x) => k === '_bb' ? undefined : x), pages: note.pages.length });
        L.close(); onRestore(JSON.parse(v.data)); UI.toast('Versión restaurada');
      } }, 'Restaurar'))));
    const L = UI.layer(h('div', { class: 'dlg' }, h('div', { class: 'dlg-head' }, h('span'), h('h3', {}, 'Historial de versiones'), h('button', { class: 'link b', onclick: () => L.close() }, 'Cerrar')),
      h('p', { class: 'muted' }, 'Gratis: ' + (Settings.versionDays || 90) + ' días de historial.'), box), { cls: 'center' });
  }
  return { maybe, prune, show };
})();

// ---------- sesión de estudio: pomodoro + repaso con cintas ----------
const Study = (() => {
  let timer = null;
  function open(note, ed) {
    const { h, icon } = UI;
    const S = Settings; S.pomo = S.pomo || { work: 25, brk: 5 };
    let state = timer || { left: S.pomo.work * 60, mode: 'work', running: false, rounds: 0 };
    const big = h('div', { class: 'pomo-time' }), lab = h('div', { class: 'pomo-lab' }), ring = h('div', { class: 'pomo-ring' }, big, lab);
    const btn = h('button', { class: 'btn primary' });
    const paint = () => {
      big.textContent = UI.dur(state.left); lab.textContent = state.mode === 'work' ? 'Concentración · ronda ' + (state.rounds + 1) : 'Descanso';
      btn.textContent = state.running ? 'Pausar' : 'Iniciar';
      const tot = (state.mode === 'work' ? S.pomo.work : S.pomo.brk) * 60;
      ring.style.setProperty('--p', (1 - state.left / tot) * 360 + 'deg');
      ring.classList.toggle('brk', state.mode !== 'work');
    };
    const tick = () => {
      if (!state.running) return;
      state.left--;
      if (state.left <= 0) {
        if (state.mode === 'work') { state.rounds++; state.mode = 'brk'; state.left = S.pomo.brk * 60; UI.toast('¡Bien hecho! Toma un descanso'); }
        else { state.mode = 'work'; state.left = S.pomo.work * 60; UI.toast('A concentrarse de nuevo'); }
        try { new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=').play(); } catch (e) {}
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      }
      paint();
    };
    btn.onclick = () => {
      state.running = !state.running;
      if (state.running && !state.iv) state.iv = setInterval(tick, 1000);
      if (!state.running) { clearInterval(state.iv); state.iv = null; }
      timer = state; paint();
    };
    const tapes = [];
    note.pages.forEach((p, i) => p.items.forEach(it => { if (it.t === 'tp') tapes.push({ i, it }); }));
    let ti = -1;
    const tapeInfo = h('p', { class: 'muted' }, tapes.length ? tapes.length + ' cintas en esta nota' : 'Usa la herramienta Cinta para tapar respuestas y repasarlas aquí.');
    const L = UI.layer(h('div', { class: 'dlg study' },
      h('div', { class: 'dlg-head' }, h('span'), h('h3', {}, 'Sesión de estudio'), h('button', { class: 'link b', onclick: () => L.close() }, 'Cerrar')),
      ring, h('div', { class: 'row center' }, btn, h('button', { class: 'btn', onclick: () => { clearInterval(state.iv); state = { left: S.pomo.work * 60, mode: 'work', running: false, rounds: 0 }; timer = null; paint(); } }, 'Reiniciar')),
      h('div', { class: 'row center small' }, h('label', {}, 'Concentración ', h('input', { type: 'number', class: 'field xs', min: 5, max: 90, value: S.pomo.work, onchange: e => { S.pomo.work = +e.target.value || 25; S.save(); if (!state.running && state.mode === 'work') { state.left = S.pomo.work * 60; paint(); } } }), ' min'),
        h('label', {}, 'Descanso ', h('input', { type: 'number', class: 'field xs', min: 1, max: 30, value: S.pomo.brk, onchange: e => { S.pomo.brk = +e.target.value || 5; S.save(); } }), ' min')),
      h('hr'),
      h('h4', {}, 'Repaso con cintas'), tapeInfo,
      tapes.length ? h('div', { class: 'row center' },
        h('button', { class: 'btn', onclick: () => { ed.setTapes(true); ti = -1; UI.toast('Todas las cintas ocultas'); } }, 'Ocultar todas'),
        h('button', { class: 'btn primary', onclick: () => { ti = (ti + 1) % tapes.length; ed.goPage(tapes[ti].i); tapeInfo.textContent = 'Cinta ' + (ti + 1) + ' de ' + tapes.length + ' (página ' + (tapes[ti].i + 1) + ') · tócala para revelar'; } }, 'Siguiente cinta')) : null,
      h('hr'),
      h('div', { class: 'row center' }, h('button', { class: 'btn', onclick: () => { L.close(); Smart.panel(note); } }, h('span', { html: icon('sparkle') }), 'Tarjetas y cuestionario'))), { cls: 'center' });
    paint();
  }
  return { open };
})();

// ---------- pausa mental diaria: rompecabezas deslizante ----------
const Puzzle = (() => {
  function day() { const start = new Date(2026, 0, 1); return Math.max(1, Math.floor((Date.now() - start) / 864e5) + 1); }
  function open() {
    const { h } = UI, N = 3 + (day() % 3 === 0 ? 1 : 0);
    let tiles = [...Array(N * N).keys()].map(i => (i + 1) % (N * N));
    // mezcla con movimientos válidos (siempre resoluble), semilla del día
    let seed = day() * 9973, blank = N * N - 1;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < 300; k++) {
      const r = Math.floor(blank / N), c = blank % N, opts = [];
      if (r > 0) opts.push(blank - N); if (r < N - 1) opts.push(blank + N); if (c > 0) opts.push(blank - 1); if (c < N - 1) opts.push(blank + 1);
      const t = opts[Math.floor(rnd() * opts.length)]; [tiles[blank], tiles[t]] = [tiles[t], tiles[blank]]; blank = t;
    }
    let moves = 0; const t0 = Date.now();
    const grid = h('div', { class: 'puz', style: { gridTemplateColumns: `repeat(${N},1fr)` } }), info = h('p', { class: 'muted center' });
    const draw = () => {
      grid.innerHTML = '';
      tiles.forEach((v, i) => grid.append(h('button', { class: 'pt' + (v ? '' : ' empty'), onclick: () => mv(i) }, v ? String(v) : '')));
      info.textContent = moves + ' movimientos';
    };
    const mv = i => {
      const b = tiles.indexOf(0), r1 = Math.floor(i / N), c1 = i % N, r2 = Math.floor(b / N), c2 = b % N;
      if (Math.abs(r1 - r2) + Math.abs(c1 - c2) !== 1) return;
      [tiles[i], tiles[b]] = [tiles[b], tiles[i]]; moves++; draw();
      if (tiles.every((v, k) => v === (k + 1) % (N * N))) { info.textContent = `¡Resuelto en ${moves} movimientos y ${UI.dur((Date.now() - t0) / 1000)}!`; KV.set('puzzle:' + day(), { moves, at: Date.now() }); App.refresh && App.refresh(); }
    };
    draw();
    const L = UI.layer(h('div', { class: 'dlg' }, h('div', { class: 'dlg-head' }, h('span'), h('h3', {}, 'Pausa mental · Día ' + day()), h('button', { class: 'link b', onclick: () => L.close() }, 'Cerrar')),
      h('p', { class: 'muted center' }, 'Ordena los números del 1 al ' + (N * N - 1) + '. Dos minutos para despejar la mente.'), grid, info), { cls: 'center' });
  }
  return { open, day };
})();

// ---------- copias de seguridad y sincronización por archivo ----------
const Backup = (() => {
  async function noteZip(note) {
    await loadZip();
    const z = new JSZip(), ids = new Set();
    note.pages.forEach(p => { if (p.bg && p.bg.blob) ids.add(p.bg.blob); p.items.forEach(it => it.t === 'i' && ids.add(it.b)); });
    (note.recs || []).forEach(r => ids.add(r.blob));
    const meta = await DB.get('meta', note.id);
    z.file('note.json', JSON.stringify(note, (k, v) => k === '_bb' ? undefined : v));
    z.file('meta.json', JSON.stringify(Object.assign({}, meta, { thumb: meta && meta.thumb })));
    for (const id of ids) { const b = await Blobs.get(id); if (b) z.file('blobs/' + id, b); }
    return z.generateAsync({ type: 'blob', mimeType: 'application/zip' });
  }
  async function importNote(file) {
    await loadZip();
    const z = await JSZip.loadAsync(file), note = JSON.parse(await z.file('note.json').async('string'));
    const meta = z.file('meta.json') ? JSON.parse(await z.file('meta.json').async('string')) : {};
    const files = Object.keys(z.files).filter(n => n.startsWith('blobs/') && !z.files[n].dir);
    for (const n of files) await Blobs.put(await z.file(n).async('blob'), n.slice(6));
    if (await DB.get('notes', note.id)) { note.id = uid(); note.title += ' (importada)'; }
    meta.id = note.id; meta.title = note.title; meta.deleted = null; meta.updated = Date.now();
    await DB.put('notes', note); await DB.put('meta', Object.assign({ created: note.created, pages: note.pages.length }, meta));
    return note.id;
  }
  async function all() {
    await loadZip();
    const z = new JSZip(), b = UI.busy('Creando copia de seguridad…');
    try {
      const metas = await DB.all('meta'), notes = await DB.all('notes'), keys = await DB.keys('blobs');
      z.file('trazo-backup.json', JSON.stringify({ v: 1, at: Date.now(), metas, notes, folders: await KV.get('folders'), templates: await KV.get('myTemplates'), settings: Object.assign({}, Settings, { aiKeys: undefined, pin: undefined }) }));
      for (const k of keys) { const bl = await Blobs.get(k); if (bl) z.file('blobs/' + k, bl); }
      return await z.generateAsync({ type: 'blob', mimeType: 'application/zip' });
    } finally { b.done(); }
  }
  async function exportAll() { const blob = await all(); UI.saveBlob(blob, 'Trazo copia ' + new Date().toISOString().slice(0, 10) + '.trazobackup'); await KV.set('lastBackup', Date.now()); }
  async function restore(file) {
    await loadZip();
    const b = UI.busy('Restaurando…');
    try {
      const z = await JSZip.loadAsync(file), d = JSON.parse(await z.file('trazo-backup.json').async('string'));
      for (const n of Object.keys(z.files).filter(n => n.startsWith('blobs/') && !z.files[n].dir)) await Blobs.put(await z.file(n).async('blob'), n.slice(6));
      // fusiona: conserva la versión más reciente de cada nota
      for (const n of d.notes) { const ex = await DB.get('notes', n.id); if (!ex || (ex.updated || 0) < (n.updated || 0)) await DB.put('notes', n); }
      for (const m of d.metas) { const ex = await DB.get('meta', m.id); if (!ex || (ex.updated || 0) < (m.updated || 0)) await DB.put('meta', m); }
      if (d.folders) { const cur = (await KV.get('folders')) || []; d.folders.forEach(f => { if (!cur.some(c => c.id === f.id)) cur.push(f); }); await KV.set('folders', cur); }
      if (d.templates) { const cur = (await KV.get('myTemplates')) || []; d.templates.forEach(f => { if (!cur.some(c => c.id === f.id)) cur.push(f); }); await KV.set('myTemplates', cur); }
      UI.toast(d.notes.length + ' notas restauradas');
    } catch (e) { UI.alert('No se pudo restaurar', e.message); }
    finally { b.done(); }
  }
  // Mac: copia automática diaria a iCloud Drive/Trazo
  async function auto() {
    if (!UI.native || !Settings.autoBackup) return;
    const last = await KV.get('lastAutoBackup');
    if (last && Date.now() - last < 6 * 3600e3) return;
    try { const blob = await all(); await UI.bridge({ op: 'backup', data: await UI.blobB64(blob) }); await KV.set('lastAutoBackup', Date.now()); } catch (e) { console.warn(e); }
  }
  return { noteZip, importNote, exportAll, restore, auto, all };
})();
