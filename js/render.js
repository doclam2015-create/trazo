// Trazo — papel, plantillas y dibujo de páginas (tinta, texto, imágenes, cintas)
'use strict';

const SIZES = { letter: [816, 1056], a4: [794, 1123], wide: [1280, 720], phone: [600, 1060] };

const isDark = hex => {
  const c = (hex || '#fff').replace('#', ''); if (c.length < 6) return false;
  const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
};

const PAPER_COLORS = [
  { c: '#FFFFFF', n: 'Blanco' }, { c: '#FBF6E9', n: 'Crema' }, { c: '#FDF3C7', n: 'Amarillo' }, { c: '#EAF3FF', n: 'Celeste' },
  { c: '#EAF7EE', n: 'Menta' }, { c: '#FCEBEF', n: 'Rosa' }, { c: '#EFEFF2', n: 'Gris' }, { c: '#26282E', n: 'Pizarra' }, { c: '#101114', n: 'Negro' },
];

// ---------- Plantillas ----------
const Paper = (() => {
  const yearLabel = () => { const d = new Date(), y = d.getFullYear(); return d.getMonth() >= 6 ? `${y} – ${y + 1}` : `${y - 1} – ${y}`; };
  const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

  function ctxStyle(color) {
    const dark = isDark(color);
    return {
      dark, line: dark ? 'rgba(255,255,255,0.16)' : 'rgba(64,104,190,0.26)', grid: dark ? 'rgba(255,255,255,0.12)' : 'rgba(110,120,140,0.22)',
      strong: dark ? 'rgba(255,255,255,0.32)' : 'rgba(60,70,90,0.45)', text: dark ? 'rgba(255,255,255,0.75)' : 'rgba(40,46,60,0.85)',
      soft: dark ? 'rgba(255,255,255,0.05)' : 'rgba(64,104,190,0.06)', margin: dark ? 'rgba(255,120,120,0.35)' : 'rgba(230,80,80,0.35)',
    };
  }
  const hl = (c, y, x0, x1) => { c.beginPath(); c.moveTo(x0, y + 0.5); c.lineTo(x1, y + 0.5); c.stroke(); };
  const vl = (c, x, y0, y1) => { c.beginPath(); c.moveTo(x + 0.5, y0); c.lineTo(x + 0.5, y1); c.stroke(); };
  const lines = (c, s, x0, x1, y0, y1, step) => { c.strokeStyle = s.line; c.lineWidth = 1; for (let y = y0; y <= y1; y += step) hl(c, y, x0, x1); };
  const title = (c, s, t, x, y, size = 26) => { c.fillStyle = s.text; c.font = `800 ${size}px -apple-system, "SF Pro Display", "Helvetica Neue", Arial, sans-serif`; c.fillText(t, x, y); };
  const label = (c, s, t, x, y, size = 13) => { c.fillStyle = s.text; c.font = `600 ${size}px -apple-system, "Helvetica Neue", Arial, sans-serif`; c.fillText(t, x, y); };
  const box = (c, s, x, y, w, h, r = 10) => { c.strokeStyle = s.strong; c.lineWidth = 1.2; c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); c.stroke(); };
  const field = (c, s, t, x, y, w) => { label(c, s, t, x, y); c.strokeStyle = s.strong; c.lineWidth = 1; const tw = c.measureText(t).width + 8; hl(c, y + 3, x + tw, x + w); };
  function table(c, s, x, y, w, rowH, rows, cols, heads) {
    c.strokeStyle = s.line; c.lineWidth = 1;
    c.fillStyle = s.soft; c.fillRect(x, y, w, rowH);
    let cx = x; const tot = cols.reduce((a, b) => a + b, 0);
    cols.forEach((cw, i) => { label(c, s, heads[i], cx + 8, y + rowH / 2 + 5, 12); cx += cw / tot * w; });
    for (let r = 0; r <= rows + 1; r++) hl(c, y + r * rowH, x, x + w);
    cx = x; cols.forEach(cw => { vl(c, cx, y, y + (rows + 1) * rowH); cx += cw / tot * w; }); vl(c, x + w, y, y + (rows + 1) * rowH);
  }

  function coverPattern(c, w, h, kind, base, fg) {
    c.fillStyle = base; c.fillRect(0, 0, w, h);
    c.strokeStyle = fg; c.lineWidth = 3;
    if (kind === 'arcs') {
      for (let y = 0; y < h + 120; y += 120) for (let x = 0; x < w + 120; x += 120) for (let r = 12; r < 60; r += 12) { c.beginPath(); c.arc(x + 60, y + 120, r, Math.PI, 0); c.stroke(); }
    } else if (kind === 'waves') {
      c.lineWidth = 26; c.strokeStyle = fg;
      const m = 34;
      c.beginPath();
      for (let x = m; x <= w - m; x += 4) { const y = m + Math.sin(x / 26) * 10; x === m ? c.moveTo(x, y) : c.lineTo(x, y); }
      for (let y = m; y <= h - m; y += 4) c.lineTo(w - m + Math.sin(y / 26) * 10, y);
      for (let x = w - m; x >= m; x -= 4) c.lineTo(x, h - m + Math.sin(x / 26) * 10);
      for (let y = h - m; y >= m; y -= 4) c.lineTo(m + Math.sin(y / 26) * 10, y);
      c.closePath(); c.stroke();
    } else if (kind === 'diamonds') {
      c.lineWidth = 2.5;
      for (let y = -100; y < h + 100; y += 140) for (let x = -100; x < w + 100; x += 120) {
        c.beginPath(); c.moveTo(x + 60, y); c.lineTo(x + 120, y + 70); c.lineTo(x + 60, y + 140); c.lineTo(x, y + 70); c.closePath(); c.stroke();
      }
    } else if (kind === 'stripes') {
      c.lineWidth = 2; for (let x = 0; x < w; x += 14) vl(c, x, 0, h);
    } else if (kind === 'dots') {
      c.fillStyle = fg; for (let y = 20; y < h; y += 36) for (let x = (y / 36 % 2) * 18 + 10; x < w; x += 36) { c.beginPath(); c.arc(x, y, 5, 0, 7); c.fill(); }
    } else if (kind === 'grid') {
      c.lineWidth = 1.5; for (let x = 0; x < w; x += 40) vl(c, x, 0, h); for (let y = 0; y < h; y += 40) hl(c, y, 0, w);
    }
    // etiqueta central
    const bw = Math.min(360, w * 0.5), bh = 120, bx = (w - bw) / 2, by = h * 0.32;
    c.fillStyle = '#FBF8F2'; c.fillRect(bx, by, bw, bh);
    c.strokeStyle = base; c.lineWidth = 2; c.strokeRect(bx + 8, by + 8, bw - 16, bh - 16);
    c.fillStyle = base; c.textAlign = 'center';
    c.font = '700 34px Georgia, "Times New Roman", serif'; c.fillText(yearLabel(), w / 2, by + 62);
    c.font = '600 11px -apple-system, Arial, sans-serif'; c.fillText('P L A N I F I C A D O R   A C A D É M I C O', w / 2, by + 90);
    c.textAlign = 'left';
  }

  const T = {};
  const def = (id, name, cat, draw, opts = {}) => (T[id] = Object.assign({ id, name, cat, draw }, opts));

  def('blank', 'En blanco', 'Papel', () => {});
  def('ruled', 'Rayado', 'Papel', (c, w, h, s) => lines(c, s, 0, w, 96, h - 24, 32));
  def('college', 'Universitario', 'Papel', (c, w, h, s) => { lines(c, s, 0, w, 96, h - 24, 30); c.strokeStyle = s.margin; c.lineWidth = 1.2; vl(c, 92, 0, h); });
  def('narrow', 'Rayado estrecho', 'Papel', (c, w, h, s) => lines(c, s, 0, w, 72, h - 16, 24));
  def('grid', 'Cuadrícula', 'Papel', (c, w, h, s) => { c.strokeStyle = s.grid; c.lineWidth = 1; for (let x = 24; x < w; x += 24) vl(c, x, 0, h); for (let y = 24; y < h; y += 24) hl(c, y, 0, w); });
  def('smallgrid', 'Milimetrado', 'Papel', (c, w, h, s) => {
    c.lineWidth = 1; for (let i = 0, x = 0; x < w; x += 12, i++) { c.strokeStyle = i % 5 ? s.soft.replace('0.06', '0.13') : s.grid; vl(c, x, 0, h); }
    for (let i = 0, y = 0; y < h; y += 12, i++) { c.strokeStyle = i % 5 ? s.soft.replace('0.06', '0.13') : s.grid; hl(c, y, 0, w); }
  });
  def('dot', 'Puntos', 'Papel', (c, w, h, s) => { c.fillStyle = s.strong; for (let y = 24; y < h; y += 24) for (let x = 24; x < w; x += 24) { c.beginPath(); c.arc(x, y, 1.3, 0, 7); c.fill(); } });
  def('iso', 'Isométrico', 'Papel', (c, w, h, s) => {
    c.strokeStyle = s.grid; c.lineWidth = 1; const d = 28, k = Math.tan(Math.PI / 6);
    for (let x = -h; x < w + h; x += d / k) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + h / k, h); c.stroke(); c.beginPath(); c.moveTo(x, 0); c.lineTo(x - h / k, h); c.stroke(); }
    for (let x = 0; x < w; x += d / k / 2) vl(c, x, 0, h);
  });
  def('music', 'Pentagrama', 'Papel', (c, w, h, s) => { c.strokeStyle = s.strong; c.lineWidth = 1; for (let y = 90; y + 40 < h; y += 92) for (let i = 0; i < 5; i++) hl(c, y + i * 10, 48, w - 48); });

  def('cornell', 'Cornell', 'Estudio', (c, w, h, s) => {
    field(c, s, 'Tema:', 40, 52, w * 0.62); field(c, s, 'Fecha:', w * 0.66, 52, w - 40);
    lines(c, s, 0, w, 120, h - 210, 30);
    c.strokeStyle = s.margin; c.lineWidth = 1.5; vl(c, 230, 92, h - 200); hl(c, h - 200, 0, w); hl(c, 92, 0, w);
    label(c, s, 'PREGUNTAS / CLAVES', 24, 112, 11); label(c, s, 'NOTAS', 246, 112, 11); label(c, s, 'RESUMEN', 24, h - 176, 11);
  });
  def('lecture', 'Clase', 'Estudio', (c, w, h, s) => {
    title(c, s, 'Apuntes de clase', 40, 62);
    field(c, s, 'Asignatura:', 40, 104, w * 0.55); field(c, s, 'Fecha:', w * 0.6, 104, w - 40); field(c, s, 'Tema:', 40, 140, w - 40);
    lines(c, s, 0, w, 192, h - 24, 32);
  });
  def('flash', 'Tarjetas de estudio', 'Estudio', (c, w, h, s) => {
    const cw = (w - 120) / 2, ch = (h - 140) / 3;
    for (let r = 0; r < 3; r++) for (let k = 0; k < 2; k++) {
      const x = 40 + k * (cw + 40), y = 50 + r * (ch + 20);
      box(c, s, x, y, cw, ch, 14); c.setLineDash([6, 6]); c.strokeStyle = s.line; hl(c, y + ch / 2, x + 12, x + cw - 12); c.setLineDash([]);
      label(c, s, 'PREGUNTA', x + 14, y + 22, 10); label(c, s, 'RESPUESTA', x + 14, y + ch / 2 + 22, 10);
    }
  });
  def('mindmap', 'Mapa mental', 'Estudio', (c, w, h, s) => {
    T.dot.draw(c, w, h, s);
    c.fillStyle = s.dark ? '#33363E' : '#FFFFFF'; c.strokeStyle = s.strong; c.lineWidth = 2;
    c.beginPath(); c.ellipse(w / 2, h / 2, 130, 70, 0, 0, 7); c.fill(); c.stroke();
    label(c, s, 'IDEA CENTRAL', w / 2 - 44, h / 2 + 5, 12);
  });
  def('storyboard', 'Storyboard', 'Estudio', (c, w, h, s) => {
    const fw = (w - 120) / 2, fh = fw * 0.56;
    for (let r = 0; r < 3; r++) for (let k = 0; k < 2; k++) {
      const x = 40 + k * (fw + 40), y = 50 + r * (fh + 110);
      box(c, s, x, y, fw, fh, 6); lines(c, s, x, x + fw, y + fh + 30, y + fh + 90, 28);
    }
  });

  def('todo', 'Lista de tareas', 'Planificación', (c, w, h, s) => {
    title(c, s, 'Lista de tareas', 48, 70); field(c, s, 'Fecha:', w - 260, 70, w - 48);
    c.strokeStyle = s.strong; c.lineWidth = 1.4;
    for (let y = 130; y < h - 40; y += 40) { c.strokeRect(52, y - 18, 18, 18); c.strokeStyle = s.line; hl(c, y + 2, 84, w - 48); c.strokeStyle = s.strong; }
  });
  def('weekly', 'Planificador semanal', 'Planificación', (c, w, h, s) => {
    title(c, s, 'Semana', 40, 62); field(c, s, 'Del', 170, 60, 420); field(c, s, 'al', 440, 60, w - 40);
    const bw = (w - 100) / 2, bh = (h - 140) / 4;
    [...DAYS, 'Notas'].forEach((d, i) => {
      const x = 40 + (i % 2) * (bw + 20), y = 90 + Math.floor(i / 2) * (bh + 10);
      box(c, s, x, y, bw, bh - 4, 12); c.fillStyle = s.soft; c.fillRect(x + 1, y + 1, bw - 2, 30);
      label(c, s, d.toUpperCase(), x + 14, y + 21, 12); lines(c, s, x + 12, x + bw - 12, y + 58, y + bh - 16, 26);
    });
  });
  def('daily', 'Agenda por horas', 'Planificación', (c, w, h, s) => {
    title(c, s, 'Agenda diaria', 40, 62); field(c, s, 'Fecha:', w - 300, 60, w - 40);
    const top = 100, rows = 15, rh = (h - top - 40) / rows, col = w * 0.64;
    c.strokeStyle = s.line;
    for (let i = 0; i <= rows; i++) { hl(c, top + i * rh, 40, col); if (i < rows) label(c, s, (7 + i) + ':00', 46, top + i * rh + 20, 12); }
    vl(c, 100, top, top + rows * rh);
    box(c, s, col + 20, top, w - col - 60, 230, 12); label(c, s, 'PRIORIDADES', col + 34, top + 24, 11);
    for (let i = 0; i < 5; i++) { c.strokeStyle = s.strong; c.strokeRect(col + 34, top + 46 + i * 34, 14, 14); c.strokeStyle = s.line; hl(c, top + 60 + i * 34, col + 56, w - 54); }
    box(c, s, col + 20, top + 250, w - col - 60, h - top - 290, 12); label(c, s, 'NOTAS', col + 34, top + 274, 11);
    lines(c, s, col + 32, w - 52, top + 300, h - 60, 26);
  });
  def('month', 'Calendario mensual', 'Planificación', (c, w, h, s, p) => {
    const d = p ? new Date(p + '-01T12:00') : new Date(), y = d.getFullYear(), m = d.getMonth();
    title(c, s, MONTHS[m] + ' ' + y, 40, 66, 30);
    const top = 110, cw = (w - 80) / 7, chh = (h - top - 40) / 6;
    DAYS.forEach((dn, i) => label(c, s, dn.slice(0, 3).toUpperCase(), 40 + i * cw + 8, top - 10, 11));
    const first = (new Date(y, m, 1).getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
    c.strokeStyle = s.grid; c.lineWidth = 1;
    for (let r = 0; r <= 6; r++) hl(c, top + r * chh, 40, w - 40);
    for (let k = 0; k <= 7; k++) vl(c, 40 + k * cw, top, top + 6 * chh);
    for (let i = 0; i < days; i++) { const cell = first + i; label(c, s, String(i + 1), 40 + (cell % 7) * cw + 8, top + Math.floor(cell / 7) * chh + 20, 13); }
  }, { param: () => new Date().toISOString().slice(0, 7) });
  def('meeting', 'Acta de reunión', 'Planificación', (c, w, h, s) => {
    title(c, s, 'Acta de reunión', 40, 62);
    field(c, s, 'Fecha:', 40, 104, 360); field(c, s, 'Lugar:', 380, 104, w - 40); field(c, s, 'Asistentes:', 40, 140, w - 40);
    label(c, s, 'TEMAS TRATADOS', 40, 186, 11); lines(c, s, 40, w - 40, 210, 520, 30);
    label(c, s, 'ACUERDOS Y PENDIENTES', 40, 560, 11); table(c, s, 40, 576, w - 80, 34, 12, [5, 2, 1.4], ['Tarea', 'Responsable', 'Plazo']);
  });
  def('habit', 'Seguimiento de hábitos', 'Planificación', (c, w, h, s) => {
    title(c, s, 'Hábitos del mes', 40, 62);
    const top = 100, left = 200, cw = (w - left - 40) / 31, rh = 44;
    for (let d = 0; d < 31; d++) label(c, s, String(d + 1), left + d * cw + 2, top + 16, 9);
    c.strokeStyle = s.grid;
    for (let r = 0; r <= 18; r++) hl(c, top + 26 + r * rh, 40, w - 40);
    for (let d = 0; d <= 31; d++) vl(c, left + d * cw, top + 26, top + 26 + 18 * rh);
  });
  def('reading', 'Registro de lectura', 'Planificación', (c, w, h, s) => { title(c, s, 'Registro de lectura', 40, 62); table(c, s, 40, 96, w - 80, 40, 22, [4, 3, 1.4, 1.4, 1], ['Título', 'Autor', 'Inicio', 'Fin', '★']); });

  def('soap', 'Ficha clínica SOAP', 'Clínica', (c, w, h, s) => {
    title(c, s, 'Evolución clínica', 40, 60);
    field(c, s, 'Paciente:', 40, 98, w * 0.6); field(c, s, 'RUT:', w * 0.63, 98, w - 40);
    field(c, s, 'Edad:', 40, 132, 200); field(c, s, 'Box:', 220, 132, 380); field(c, s, 'Fecha / hora:', 400, 132, w - 40);
    const parts = [['S', 'Subjetivo'], ['O', 'Objetivo'], ['A', 'Análisis / diagnóstico'], ['P', 'Plan']];
    const bh = (h - 190) / 4;
    parts.forEach(([k, n], i) => {
      const y = 160 + i * bh;
      box(c, s, 40, y, w - 80, bh - 12, 12);
      c.fillStyle = s.soft; c.fillRect(41, y + 1, 54, bh - 14);
      title(c, s, k, 58, y + 40, 28); label(c, s, n.toUpperCase(), 110, y + 24, 11);
      lines(c, s, 108, w - 52, y + 52, y + bh - 24, 28);
    });
  });
  def('handoff', 'Entrega de turno', 'Clínica', (c, w, h, s) => {
    title(c, s, 'Entrega de turno', 40, 60); field(c, s, 'Fecha:', 40, 98, 300); field(c, s, 'Entrega:', 320, 98, 560); field(c, s, 'Recibe:', 580, 98, w - 40);
    table(c, s, 40, 124, w - 80, 56, 15, [0.8, 2.4, 2.6, 3, 1.3], ['Box', 'Paciente', 'Diagnóstico', 'Pendientes', 'Estado']);
  });
  def('vitals', 'Control de signos vitales', 'Clínica', (c, w, h, s) => {
    title(c, s, 'Signos vitales', 40, 60); field(c, s, 'Paciente:', 40, 98, w - 40);
    table(c, s, 40, 124, w - 80, 40, 22, [1.3, 1.2, 1, 1, 1, 1, 1, 2.4], ['Hora', 'PA', 'FC', 'FR', 'T°', 'SatO₂', 'EVA', 'Observaciones']);
  });

  const covers = [['arcs', '#E07A5F', 'rgba(255,255,255,0.28)', 'Coral'], ['waves', '#4A5F96', 'rgba(255,255,255,0.35)', 'Azul marino'], ['diamonds', '#8B9DC9', 'rgba(255,255,255,0.4)', 'Lavanda'], ['stripes', '#A9AEB8', 'rgba(255,255,255,0.35)', 'Grafito'], ['dots', '#7FB8A4', 'rgba(255,255,255,0.35)', 'Salvia'], ['grid', '#D9A441', 'rgba(255,255,255,0.3)', 'Mostaza']];
  covers.forEach(([k, base, fg, n]) => def('cover-' + k, 'Portada ' + n, 'Portadas', (c, w, h) => coverPattern(c, w, h, k, base, fg), { cover: true, base }));

  const CATS = ['Portadas', 'Planificación', 'Estudio', 'Papel', 'Clínica'];

  // dibuja el fondo del papel en coordenadas de página (ctx ya escalado)
  function draw(c, w, h, paper) {
    paper = paper || { tpl: 'blank', color: '#FFFFFF' };
    const t = T[paper.tpl] || T.blank;
    c.fillStyle = t.cover ? t.base : (paper.color || '#FFFFFF'); c.fillRect(0, 0, w, h);
    c.save(); t.draw(c, w, h, ctxStyle(paper.color), paper.p); c.restore();
  }
  return { T, CATS, draw, MONTHS, yearLabel };
})();

// ---------- PDF (pdf.js) ----------
const PDFs = (() => {
  const docs = new Map(), cache = new Map();
  let lib;
  function load() {
    if (lib) return lib;
    lib = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = 'lib/pdf.min.js';
      s.onload = () => { pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js'; res(pdfjsLib); };
      s.onerror = rej; document.head.append(s);
    });
    return lib;
  }
  async function doc(blobId) {
    if (docs.has(blobId)) return docs.get(blobId);
    const p = (async () => { await load(); const b = await Blobs.get(blobId); return pdfjsLib.getDocument({ data: new Uint8Array(await b.arrayBuffer()) }).promise; })();
    docs.set(blobId, p); return p;
  }
  async function openData(buf) { await load(); return pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise; }
  // devuelve un canvas ya renderizado para la página n a una escala dada (con caché)
  function get(bg, pw, scale, cb) {
    const bucket = Math.min(4, Math.ceil(scale * 2) / 2), key = bg.blob + ':' + bg.n + ':' + bucket;
    const hit = cache.get(key);
    if (hit && hit.canvas) return hit.canvas;
    if (!hit) {
      const entry = { canvas: null }; cache.set(key, entry);
      doc(bg.blob).then(d => d.getPage(bg.n + 1)).then(pg => {
        const vp0 = pg.getViewport({ scale: 1 }), sc = pw / vp0.width * bucket;
        const vp = pg.getViewport({ scale: sc });
        const cv = document.createElement('canvas'); cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
        return pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise.then(() => { entry.canvas = cv; trim(); cb && cb(); });
      }).catch(e => { console.warn('pdf', e); cache.delete(key); });
    }
    return null;
  }
  function trim() { if (cache.size > 24) { const k = cache.keys().next().value; cache.delete(k); } }
  return { load, doc, openData, get };
})();

// ---------- Tinta ----------
const Ink = (() => {
  function strokePath(c, p, from, to) {
    // curva suave por puntos medios
    c.beginPath();
    c.moveTo(p[from * 3], p[from * 3 + 1]);
    for (let i = from + 1; i < to - 1; i++) {
      const x = p[i * 3], y = p[i * 3 + 1], nx = p[i * 3 + 3], ny = p[i * 3 + 4];
      c.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
    }
    if (to - 1 > from) c.lineTo(p[(to - 1) * 3], p[(to - 1) * 3 + 1]);
  }
  function draw(c, s, alpha = 1) {
    const p = s.p, n = p.length / 3;
    if (!n) return;
    c.save();
    c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = s.c; c.fillStyle = s.c;
    if (s.k === 'marker') {
      c.globalAlpha = 0.36 * alpha; c.lineWidth = s.w; c.lineCap = s.flat ? 'butt' : 'round';
      if (n === 1) { c.beginPath(); c.arc(p[0], p[1], s.w / 2, 0, 7); c.fill(); }
      else { strokePath(c, p, 0, n); c.stroke(); }
      c.restore(); return;
    }
    const pencil = s.k === 'pencil';
    c.globalAlpha = (pencil ? 0.78 : 1) * alpha;
    const W = s.w * (pencil ? 0.85 : 1);
    if (n === 1) { c.beginPath(); c.arc(p[0], p[1], W * (0.4 + 0.6 * p[2]) / 2 + 0.3, 0, 7); c.fill(); c.restore(); return; }
    let uniform = true;
    for (let i = 1; i < n; i++) if (Math.abs(p[i * 3 + 2] - p[2]) > 0.02) { uniform = false; break; }
    const wOf = pr => W * (0.35 + 0.9 * pr);
    if (uniform || s.u) { c.lineWidth = s.u ? W : wOf(p[2]); strokePath(c, p, 0, n); c.stroke(); }
    else {
      // segmentos con grosor según presión
      let px = p[0], py = p[1];
      for (let i = 1; i < n; i++) {
        const x = p[i * 3], y = p[i * 3 + 1];
        const mx = i < n - 1 ? (x + p[i * 3 + 3]) / 2 : x, my = i < n - 1 ? (y + p[i * 3 + 4]) / 2 : y;
        c.beginPath(); c.moveTo(px, py); c.quadraticCurveTo(x, y, mx, my);
        c.lineWidth = wOf((p[i * 3 - 1] + p[i * 3 + 2]) / 2); c.stroke();
        px = mx; py = my;
      }
    }
    if (pencil) { c.globalAlpha = 0.18 * alpha; c.lineWidth = W * 1.6; strokePath(c, p, 0, n); c.stroke(); }
    c.restore();
  }
  function bbox(s) {
    if (s._bb) return s._bb;
    const p = s.p; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < p.length; i += 3) { if (p[i] < x0) x0 = p[i]; if (p[i] > x1) x1 = p[i]; if (p[i + 1] < y0) y0 = p[i + 1]; if (p[i + 1] > y1) y1 = p[i + 1]; }
    const m = s.w / 2 + 1;
    return (s._bb = { x: x0 - m, y: y0 - m, w: x1 - x0 + 2 * m, h: y1 - y0 + 2 * m });
  }
  const segDist = (px, py, ax, ay, bx, by) => {
    const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
    let t = l ? ((px - ax) * dx + (py - ay) * dy) / l : 0; t = Math.max(0, Math.min(1, t));
    const qx = ax + t * dx - px, qy = ay + t * dy - py; return Math.sqrt(qx * qx + qy * qy);
  };
  function hit(s, x, y, r) {
    const b = bbox(s); if (x < b.x - r || x > b.x + b.w + r || y < b.y - r || y > b.y + b.h + r) return false;
    const p = s.p, n = p.length / 3, lim = r + s.w / 2;
    if (n === 1) return Math.hypot(p[0] - x, p[1] - y) < lim;
    for (let i = 0; i < n - 1; i++) if (segDist(x, y, p[i * 3], p[i * 3 + 1], p[i * 3 + 3], p[i * 3 + 4]) < lim) return true;
    return false;
  }
  // borrador parcial: corta el trazo y devuelve los fragmentos que quedan
  function split(s, x, y, r) {
    const p = s.p, n = p.length / 3, out = []; let cur = [];
    for (let i = 0; i < n; i++) {
      const inside = Math.hypot(p[i * 3] - x, p[i * 3 + 1] - y) < r + s.w / 2;
      if (inside) { if (cur.length >= 6) out.push(cur); cur = []; }
      else cur.push(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
    }
    if (cur.length >= 6) out.push(cur);
    return out.map(pp => Object.assign({}, s, { p: pp, _bb: null, id: uid() }));
  }
  // suavizado de los puntos de entrada (media móvil exponencial)
  function smooth(p, k) {
    if (k <= 0 || p.length < 9) return p;
    const a = 1 - Math.min(0.85, k * 0.8), o = p.slice();
    for (let i = 3; i < o.length - 3; i += 3) { o[i] = o[i - 3] + a * (p[i] - o[i - 3]); o[i + 1] = o[i - 2] + a * (p[i + 1] - o[i - 2]); }
    return o;
  }
  // reconocimiento de figuras: línea, triángulo, rectángulo, polígono o elipse
  function rdp(pts, eps) {
    if (pts.length < 3) return pts;
    let dmax = 0, idx = 0; const a = pts[0], b = pts[pts.length - 1];
    for (let i = 1; i < pts.length - 1; i++) { const d = segDist(pts[i][0], pts[i][1], a[0], a[1], b[0], b[1]); if (d > dmax) { dmax = d; idx = i; } }
    if (dmax > eps) { const l = rdp(pts.slice(0, idx + 1), eps), r = rdp(pts.slice(idx), eps); return l.slice(0, -1).concat(r); }
    return [a, b];
  }
  function recognize(s) {
    const p = s.p, n = p.length / 3; if (n < 6) return null;
    const pts = []; let len = 0;
    for (let i = 0; i < n; i++) { pts.push([p[i * 3], p[i * 3 + 1]]); if (i) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); }
    const first = pts[0], last = pts[n - 1], chord = Math.hypot(last[0] - first[0], last[1] - first[1]);
    const pr = 0.5, mk = arr => { const o = []; arr.forEach(q => o.push(q[0], q[1], pr)); return Object.assign({}, s, { p: o, u: 1, _bb: null }); };
    if (chord / len > 0.9) return mk([first, last]);
    const b = bbox(Object.assign({}, s, { _bb: null, w: 0 })), diag = Math.hypot(b.w, b.h);
    if (chord > diag * 0.3) {
      // abierto: polilínea simplificada (flecha/ángulo)
      const simp = rdp(pts, diag * 0.06); return simp.length <= 4 ? mk(simp) : null;
    }
    const simp = rdp(pts, diag * 0.07);
    let v = simp.slice(); if (v.length > 2 && Math.hypot(v[0][0] - v[v.length - 1][0], v[0][1] - v[v.length - 1][1]) < diag * 0.2) v.pop();
    if (v.length === 3 || v.length === 4) {
      if (v.length === 4) {
        // ¿casi rectángulo alineado? se endereza
        const ang = Math.atan2(v[1][1] - v[0][1], v[1][0] - v[0][0]);
        if (Math.abs(Math.sin(ang * 2)) < 0.25) { const x0 = b.x, y0 = b.y, x1 = b.x + b.w, y1 = b.y + b.h; return mk([[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]); }
      }
      return mk(v.concat([v[0]]));
    }
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2, rx = b.w / 2, ry = b.h / 2, out = [];
    if (Math.abs(rx - ry) / Math.max(rx, ry) < 0.12) { const r = (rx + ry) / 2; for (let a = 0; a <= 64; a++) out.push([cx + r * Math.cos(a / 64 * Math.PI * 2), cy + r * Math.sin(a / 64 * Math.PI * 2)]); }
    else for (let a = 0; a <= 64; a++) out.push([cx + rx * Math.cos(a / 64 * Math.PI * 2), cy + ry * Math.sin(a / 64 * Math.PI * 2)]);
    return mk(out);
  }
  return { draw, bbox, hit, split, smooth, recognize, segDist };
})();

// ---------- Elementos de página ----------
const Items = (() => {
  const FONTS = { system: '-apple-system, "SF Pro Text", "Helvetica Neue", Arial, sans-serif', serif: 'Georgia, "Times New Roman", serif', mono: '"SF Mono", Menlo, Consolas, monospace', hand: '"Marker Felt", "Comic Sans MS", "Chalkboard SE", cursive', round: '"Avenir Next", "Nunito", -apple-system, sans-serif' };
  const fontOf = it => `${it.b ? 700 : 400} ${it.z || 18}px ${FONTS[it.f] || FONTS.system}`;
  function wrap(c, text, maxW) {
    const out = [];
    for (const para of String(text).split('\n')) {
      if (!para) { out.push(''); continue; }
      let line = '';
      for (const word of para.split(/(\s+)/)) {
        const t = line + word;
        if (c.measureText(t).width > maxW && line.trim()) { out.push(line.trimEnd()); line = word.trimStart(); }
        else line = t;
        while (c.measureText(line).width > maxW && line.length > 1) { let k = line.length; while (k > 1 && c.measureText(line.slice(0, k)).width > maxW) k--; out.push(line.slice(0, k)); line = line.slice(k); }
      }
      out.push(line);
    }
    return out;
  }
  const mctx = document.createElement('canvas').getContext('2d');
  function textLayout(it) {
    mctx.font = fontOf(it);
    const pad = it.bg ? 14 : 2, lines = wrap(mctx, it.s || ' ', it.w - pad * 2), lh = (it.z || 18) * 1.32;
    it.h = Math.max(lh + pad * 2, lines.length * lh + pad * 2);
    return { lines, lh, pad };
  }
  function bbox(it) {
    if (it.t === 's') return Ink.bbox(it);
    if (it.t === 'x') { if (!it.h) textLayout(it); return { x: it.x, y: it.y, w: it.w, h: it.h }; }
    if (it.t === 'i') return { x: it.x, y: it.y, w: it.w, h: it.h };
    if (it.t === 'tp') { const m = it.w / 2; return { x: Math.min(it.x1, it.x2) - m, y: Math.min(it.y1, it.y2) - m, w: Math.abs(it.x2 - it.x1) + 2 * m, h: Math.abs(it.y2 - it.y1) + 2 * m }; }
    return { x: 0, y: 0, w: 0, h: 0 };
  }
  function hit(it, x, y, r = 4) {
    if (it.t === 's') return Ink.hit(it, x, y, r);
    if (it.t === 'tp') return Ink.segDist(x, y, it.x1, it.y1, it.x2, it.y2) < it.w / 2 + r;
    const b = bbox(it); return x >= b.x - r && x <= b.x + b.w + r && y >= b.y - r && y <= b.y + b.h + r;
  }
  function drawText(c, it) {
    const { lines, lh, pad } = textLayout(it);
    c.save();
    if (it.bg) {
      c.shadowColor = 'rgba(0,0,0,0.14)'; c.shadowBlur = 10; c.shadowOffsetY = 3;
      c.fillStyle = it.bg; c.beginPath(); c.roundRect ? c.roundRect(it.x, it.y, it.w, it.h, 6) : c.rect(it.x, it.y, it.w, it.h); c.fill();
      c.shadowColor = 'transparent';
    }
    c.font = fontOf(it); c.fillStyle = it.c || '#1C1C1E'; c.textBaseline = 'top';
    if (it.al === 'center') c.textAlign = 'center';
    lines.forEach((l, i) => c.fillText(l, it.al === 'center' ? it.x + it.w / 2 : it.x + pad, it.y + pad + i * lh + (lh - (it.z || 18)) / 2));
    if (it.u) { c.fillRect(it.x + pad, it.y + pad + lines.length * lh - 2, Math.min(it.w - pad * 2, c.measureText(lines[lines.length - 1]).width), 1.5); }
    c.restore();
  }
  function drawTape(c, it) {
    const ang = Math.atan2(it.y2 - it.y1, it.x2 - it.x1), len = Math.hypot(it.x2 - it.x1, it.y2 - it.y1);
    c.save(); c.translate(it.x1, it.y1); c.rotate(ang);
    if (it.hid) {
      c.fillStyle = it.c || '#8FD3CF'; c.fillRect(-it.w / 4, -it.w / 2, len + it.w / 2, it.w);
      c.globalAlpha = 0.18; c.fillStyle = '#fff';
      for (let x = -it.w / 4; x < len + it.w / 4; x += 14) c.fillRect(x, -it.w / 2, 6, it.w);
    } else {
      c.strokeStyle = it.c || '#8FD3CF'; c.setLineDash([5, 4]); c.lineWidth = 1.5; c.globalAlpha = 0.8;
      c.strokeRect(-it.w / 4, -it.w / 2, len + it.w / 2, it.w);
    }
    c.restore();
  }
  function drawImage(c, it, redraw, corners) {
    const img = Blobs.img(it.b, redraw);
    c.save();
    if (corners === 'round') { c.beginPath(); c.roundRect ? c.roundRect(it.x, it.y, it.w, it.h, 14) : c.rect(it.x, it.y, it.w, it.h); c.clip(); }
    if (img) c.drawImage(img, it.x, it.y, it.w, it.h);
    else { c.fillStyle = 'rgba(128,128,128,0.15)'; c.fillRect(it.x, it.y, it.w, it.h); }
    c.restore();
  }
  // dibuja todos los elementos; opts.rec = {id, ms} atenúa la tinta posterior al punto de reproducción
  function drawAll(c, items, opts = {}) {
    for (const it of items) {
      if (opts.skip && opts.skip.has(it)) continue;
      if (it.t === 's') {
        let a = 1;
        if (opts.rec && it.r && it.r[0] === opts.rec.id && it.r[1] > opts.rec.ms) a = 0.2;
        Ink.draw(c, it, a);
      } else if (it.t === 'x') { if (!opts.editing || opts.editing !== it) drawText(c, it); }
      else if (it.t === 'i') drawImage(c, it, opts.redraw, opts.corners);
      else if (it.t === 'tp') { if (!opts.noTapes) drawTape(c, it); }
    }
  }
  function translate(it, dx, dy) {
    if (it.t === 's') { for (let i = 0; i < it.p.length; i += 3) { it.p[i] += dx; it.p[i + 1] += dy; } it._bb = null; }
    else if (it.t === 'tp') { it.x1 += dx; it.x2 += dx; it.y1 += dy; it.y2 += dy; }
    else { it.x += dx; it.y += dy; }
  }
  function scale(it, ox, oy, k) {
    if (it.t === 's') { for (let i = 0; i < it.p.length; i += 3) { it.p[i] = ox + (it.p[i] - ox) * k; it.p[i + 1] = oy + (it.p[i + 1] - oy) * k; } it.w *= k; it._bb = null; }
    else if (it.t === 'tp') { it.x1 = ox + (it.x1 - ox) * k; it.x2 = ox + (it.x2 - ox) * k; it.y1 = oy + (it.y1 - oy) * k; it.y2 = oy + (it.y2 - oy) * k; it.w *= k; }
    else { it.x = ox + (it.x - ox) * k; it.y = oy + (it.y - oy) * k; it.w *= k; if (it.t === 'i') it.h *= k; else { it.z = (it.z || 18) * k; it.h = 0; } }
  }
  const clone = it => { const o = JSON.parse(JSON.stringify(it, (k, v) => k === '_bb' ? undefined : v)); o.id = uid(); return o; };
  return { FONTS, bbox, hit, drawAll, drawText, translate, scale, clone, textLayout };
})();

// Dibuja una página completa en un contexto (para miniaturas y exportación)
async function renderPageTo(c, page, scale, opts = {}) {
  c.save(); c.setTransform(scale, 0, 0, scale, 0, 0);
  if (opts.bg !== false) {
    Paper.draw(c, page.w, page.h, page.paper);
    if (page.bg) await drawBgAsync(c, page, scale);
  }
  // espera a que carguen las imágenes
  const imgs = page.items.filter(i => i.t === 'i');
  for (const it of imgs) {
    if (!Blobs.img(it.b)) await new Promise(r => { Blobs.img(it.b, r); setTimeout(r, 1500); });
  }
  Items.drawAll(c, page.items, { corners: Settings.mediaCorners, noTapes: opts.noTapes });
  c.restore();
}
async function drawBgAsync(c, page, scale) {
  const bg = page.bg;
  if (bg.kind === 'pdf') {
    const d = await PDFs.doc(bg.blob), pg = await d.getPage(bg.n + 1);
    const vp0 = pg.getViewport({ scale: 1 }), vp = pg.getViewport({ scale: page.w / vp0.width * scale });
    const cv = document.createElement('canvas'); cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
    await pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
    c.drawImage(cv, 0, 0, page.w, page.h);
  } else if (bg.kind === 'image') {
    let img = Blobs.img(bg.blob);
    if (!img) { await new Promise(r => { Blobs.img(bg.blob, r); setTimeout(r, 2000); }); img = Blobs.img(bg.blob); }
    if (img) c.drawImage(img, 0, 0, page.w, page.h);
  }
}
