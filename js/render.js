// Trazo — papel, plantillas y dibujo de páginas (tinta, texto, imágenes, cintas)
'use strict';

const SIZES = { letter: [816, 1056], legal: [816, 1344], tabloid: [1056, 1632], a3: [1123, 1587], a4: [794, 1123], a5: [559, 794], a6: [397, 559], a7: [280, 397], wide: [1280, 720], phone: [600, 1060] };
const SIZE_NAMES = { letter: 'Carta', legal: 'Legal', tabloid: 'Tabloide', a3: 'A3', a4: 'A4', a5: 'A5', a6: 'A6', a7: 'A7', wide: 'Pantalla 16:9', phone: 'Teléfono' };
// tamaño de página según orientación (vertical / horizontal)
function pageSize(size = Settings.size, orient = Settings.orient) { let [w, h] = SIZES[size] || SIZES.letter; if (orient && (orient === 'landscape') !== (w > h)) [w, h] = [h, w]; return [w, h]; }

const isDark = hex => {
  const c = (hex || '#fff').replace('#', ''); if (c.length < 6) return false;
  const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
};

const PAPER_COLORS = [
  { c: '#FFFFFF', n: 'Blanco' }, { c: '#FBF6E9', n: 'Crema' }, { c: '#FDF3C7', n: 'Amarillo' }, { c: '#EAF3FF', n: 'Celeste' },
  { c: '#EAF7EE', n: 'Menta' }, { c: '#FCEBEF', n: 'Rosa' }, { c: '#EFEFF2', n: 'Gris' }, { c: '#E8D9A8', n: 'Kraft' }, { c: '#DDE3EA', n: 'Gris azulado' }, { c: '#26282E', n: 'Pizarra' }, { c: '#101114', n: 'Negro' },
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
  def('ruled', 'Rayado', 'Papel', (c, w, h, s) => lines(c, s, 0, w, 96, h - 24, 32 * s.sp), { sp: 1 });
  def('college', 'Universitario', 'Papel', (c, w, h, s) => { lines(c, s, 0, w, 96, h - 24, 30 * s.sp); c.strokeStyle = s.margin; c.lineWidth = 1.2; vl(c, 92, 0, h); }, { sp: 1 });
  def('narrow', 'Rayado estrecho', 'Papel', (c, w, h, s) => lines(c, s, 0, w, 72, h - 16, 24 * s.sp), { sp: 1 });
  def('grid', 'Cuadrícula', 'Papel', (c, w, h, s) => { c.strokeStyle = s.grid; c.lineWidth = 1; const d = 24 * s.sp; for (let x = d; x < w; x += d) vl(c, x, 0, h); for (let y = d; y < h; y += d) hl(c, y, 0, w); }, { sp: 1 });
  def('smallgrid', 'Milimetrado', 'Papel', (c, w, h, s) => {
    c.lineWidth = 1; for (let i = 0, x = 0; x < w; x += 12, i++) { c.strokeStyle = i % 5 ? s.soft.replace('0.06', '0.13') : s.grid; vl(c, x, 0, h); }
    for (let i = 0, y = 0; y < h; y += 12, i++) { c.strokeStyle = i % 5 ? s.soft.replace('0.06', '0.13') : s.grid; hl(c, y, 0, w); }
  });
  def('dot', 'Puntos', 'Papel', (c, w, h, s) => { const d = 24 * s.sp; c.fillStyle = s.strong; for (let y = d; y < h; y += d) for (let x = d; x < w; x += d) { c.beginPath(); c.arc(x, y, 1.3, 0, 7); c.fill(); } }, { sp: 1 });
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


  // ---------- más plantillas ----------
  const gridR = (c, s, x0, y0, x1, y1, st = 24, major = 0) => { c.lineWidth = 1; let i = 0; for (let x = x0; x <= x1 + 0.1; x += st, i++) { c.strokeStyle = major && i % major === 0 ? s.strong : s.grid; vl(c, x, y0, y1); } i = 0; for (let y = y0; y <= y1 + 0.1; y += st, i++) { c.strokeStyle = major && i % major === 0 ? s.strong : s.grid; hl(c, y, x0, x1); } };
  const dotsR = (c, s, x0, y0, x1, y1, st = 24, r = 1.3) => { c.fillStyle = s.strong; for (let y = y0; y <= y1; y += st) for (let x = x0; x <= x1; x += st) { c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); } };
  const hexR = (c, s, x0, y0, x1, y1, r = 14) => { c.strokeStyle = s.grid; c.lineWidth = 1; const hw = Math.sqrt(3) * r; c.save(); c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0); c.clip(); for (let row = 0, y = y0; y < y1 + r; y += r * 1.5, row++) for (let x = x0 + (row % 2 ? hw / 2 : 0); x < x1 + hw; x += hw) { c.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; k ? c.lineTo(x + r * Math.cos(a), y + r * Math.sin(a)) : c.moveTo(x + r * Math.cos(a), y + r * Math.sin(a)); } c.closePath(); c.stroke(); } c.restore(); };
  const head = (c, s, t, w, fields = ['Fecha:']) => { title(c, s, t, 40, 62); fields.forEach((f, i) => field(c, s, f, w - 40 - (fields.length - i) * 210, 60, w - 40 - (fields.length - i - 1) * 210 - 14)); };
  const sec = (c, s, t, x, y, w, hh, fill = 'lines') => {
    box(c, s, x, y, w, hh, 12); if (t) { c.fillStyle = s.soft; c.fillRect(x + 1, y + 1, w - 2, 28); label(c, s, t.toUpperCase(), x + 14, y + 19, 11); }
    const t0 = y + (t ? 34 : 10);
    if (fill === 'lines') lines(c, s, x + 12, x + w - 12, t0 + 22, y + hh - 10, 26);
    else if (fill === 'grid') gridR(c, s, x + 10, t0, x + w - 10, y + hh - 10, 20);
    else if (fill === 'dots') dotsR(c, s, x + 16, t0 + 10, x + w - 12, y + hh - 10, 20);
    else if (fill === 'check') for (let yy = t0 + 18; yy < y + hh - 10; yy += 30) { c.strokeStyle = s.strong; c.lineWidth = 1.2; c.strokeRect(x + 14, yy - 12, 13, 13); c.strokeStyle = s.line; hl(c, yy + 2, x + 34, x + w - 14); }
  };
  const fourLines = (c, s, x0, x1, y0, y1, gap, h) => { for (let y = y0; y + h <= y1; y += h + gap) { c.strokeStyle = s.strong; c.lineWidth = 1; hl(c, y, x0, x1); hl(c, y + h, x0, x1); c.strokeStyle = s.line; c.setLineDash([5, 5]); hl(c, y + h / 2, x0, x1); c.setLineDash([]); c.strokeStyle = s.soft.replace('0.06', '0.2'); hl(c, y - h / 2.2, x0, x1); } };

  // Cuadernos
  def('hexgrid', 'Cuadrícula hexagonal', 'Cuadernos', (c, w, h, s) => hexR(c, s, 0, 0, w, h, 14 * s.sp), { sp: 1 });
  def('handwriting', 'Manuscrito', 'Cuadernos', (c, w, h, s) => { fourLines(c, s, 0, w, 110, h - 30, 34 * s.sp, 30 * s.sp); c.strokeStyle = s.margin; c.lineWidth = 1.2; vl(c, 80, 0, h); }, { sp: 1 });
  def('wide', 'Rayado ancho', 'Cuadernos', (c, w, h, s) => { lines(c, s, 0, w, 100, h - 24, 40 * s.sp); c.strokeStyle = s.margin; vl(c, 92, 0, h); }, { sp: 1 });
  def('col2', 'Dos columnas', 'Cuadernos', (c, w, h, s) => { lines(c, s, 40, w / 2 - 14, 96, h - 30, 30); lines(c, s, w / 2 + 14, w - 40, 96, h - 30, 30); });
  def('col3', 'Tres columnas', 'Cuadernos', (c, w, h, s) => { const cw = (w - 120) / 3; for (let k = 0; k < 3; k++) lines(c, s, 40 + k * (cw + 20), 40 + k * (cw + 20) + cw, 96, h - 30, 30); });
  def('engineer', 'Cuadrícula de ingeniería', 'Cuadernos', (c, w, h, s) => { gridR(c, s, 40, 110, w - 40, h - 40, 16, 5); c.strokeStyle = s.strong; c.lineWidth = 1.4; c.strokeRect(40, 40, w - 80, 60); vl(c, w - 240, 40, 100); label(c, s, 'PROYECTO', 52, 62, 10); label(c, s, 'FECHA', w - 228, 62, 10); });
  def('mizige', 'Mizige', 'Cuadernos', (c, w, h, s) => { const st = 72, x0 = (w % st) / 2, y0 = 60; for (let y = y0; y + st <= h - 30; y += st) for (let x = x0; x + st <= w; x += st) { c.strokeStyle = s.strong; c.lineWidth = 1; c.strokeRect(x, y, st, st); c.strokeStyle = s.line; c.setLineDash([3, 4]); hl(c, y + st / 2, x, x + st); vl(c, x + st / 2, y, y + st); c.beginPath(); c.moveTo(x, y); c.lineTo(x + st, y + st); c.moveTo(x + st, y); c.lineTo(x, y + st); c.stroke(); c.setLineDash([]); } });
  def('tianzige', 'Tianzige', 'Cuadernos', (c, w, h, s) => { const st = 72, x0 = (w % st) / 2, y0 = 60; for (let y = y0; y + st <= h - 30; y += st) for (let x = x0; x + st <= w; x += st) { c.strokeStyle = s.strong; c.lineWidth = 1; c.strokeRect(x, y, st, st); c.strokeStyle = s.line; c.setLineDash([3, 4]); hl(c, y + st / 2, x, x + st); vl(c, x + st / 2, y, y + st); c.setLineDash([]); } });
  def('finedot', 'Puntos finos', 'Cuadernos', (c, w, h, s) => dotsR(c, s, 16, 16, w, h, 16 * s.sp, 0.9), { sp: 1 });
  def('cartesian', 'Plano cartesiano', 'Cuadernos', (c, w, h, s) => { gridR(c, s, 0, 0, w, h, 24); c.strokeStyle = s.strong; c.lineWidth = 2; const cx = Math.round(w / 48) * 24, cy = Math.round(h / 48) * 24; hl(c, cy, 0, w); vl(c, cx, 0, h); });
  def('polar', 'Coordenadas polares', 'Cuadernos', (c, w, h, s) => { const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 30; c.strokeStyle = s.grid; c.lineWidth = 1; for (let r = R / 10; r <= R; r += R / 10) { c.beginPath(); c.arc(cx, cy, r, 0, 7); c.stroke(); } for (let a = 0; a < 360; a += 15) { c.strokeStyle = a % 90 ? s.grid : s.strong; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a * Math.PI / 180) * R, cy + Math.sin(a * Math.PI / 180) * R); c.stroke(); } });
  def('legal', 'Legal', 'Cuadernos', (c, w, h, s) => { lines(c, s, 0, w, 110, h - 24, 30 * s.sp); c.strokeStyle = s.margin; c.lineWidth = 1.2; vl(c, 96, 0, h); vl(c, 102, 0, h); }, { sp: 1 });
  def('callig', 'Guía de caligrafía', 'Cuadernos', (c, w, h, s) => { fourLines(c, s, 30, w - 30, 90, h - 30, 40, 44); c.save(); c.beginPath(); c.rect(0, 0, w, h); c.clip(); c.strokeStyle = s.soft.replace('0.06', '0.16'); for (let x = -h; x < w; x += 34) { c.beginPath(); c.moveTo(x, h); c.lineTo(x + h * 0.7, 0); c.stroke(); } c.restore(); });
  def('ecg', 'Papel de ECG', 'Cuadernos', (c, w, h) => { c.lineWidth = 0.6; for (let x = 0, i = 0; x < w; x += 8, i++) { c.strokeStyle = i % 5 ? 'rgba(230,90,110,0.22)' : 'rgba(220,60,90,0.55)'; vl(c, x, 0, h); } for (let y = 0, i = 0; y < h; y += 8, i++) { c.strokeStyle = i % 5 ? 'rgba(230,90,110,0.22)' : 'rgba(220,60,90,0.55)'; hl(c, y, 0, w); } });

  // Hojas divididas
  const split = (id, n, parts, dir = 'v') => def(id, n, 'Hojas divididas', (c, w, h, s) => {
    const k = parts.length, m = 32;
    parts.forEach((f, i) => {
      const [x0, y0, x1, y1] = dir === 'v' ? [m, 40 + i * (h - 70) / k, w - m, 40 + (i + 1) * (h - 70) / k - 14] : dir === 'h' ? [m + i * (w - 2 * m) / k + (i ? 10 : 0), 40, m + (i + 1) * (w - 2 * m) / k - (i < k - 1 ? 10 : 0), h - 30] : [m + (i % 2) * (w / 2 - m) + (i % 2 ? 10 : 0), 40 + Math.floor(i / 2) * (h - 70) / 2, m + (i % 2 + 1) * (w / 2 - m) - (i % 2 ? 0 : 10), 40 + (Math.floor(i / 2) + 1) * (h - 70) / 2 - 14];
      box(c, s, x0, y0, x1 - x0, y1 - y0, 10);
      if (f === 'lines') lines(c, s, x0 + 10, x1 - 10, y0 + 30, y1 - 8, 28); else if (f === 'grid') gridR(c, s, x0 + 8, y0 + 8, x1 - 8, y1 - 8, 20); else if (f === 'dots') dotsR(c, s, x0 + 16, y0 + 16, x1 - 10, y1 - 10, 20); else if (f === 'hex') hexR(c, s, x0 + 4, y0 + 4, x1 - 4, y1 - 4, 12); else if (f === 'check') sec(c, s, '', x0, y0, x1 - x0, y1 - y0, 'check');
    });
  });
  split('split-lg', 'Líneas y cuadrícula', ['lines', 'grid']);
  split('split-gl', 'Cuadrícula y líneas', ['grid', 'lines']);
  split('split-ld', 'Líneas y puntos', ['lines', 'dots']);
  split('split-bl', 'Dibujo y notas', ['blank', 'lines']);
  split('split-3', 'Tres franjas', ['lines', 'grid', 'dots']);
  split('split-cols', 'Columnas: puntos y líneas', ['dots', 'lines'], 'h');
  split('split-cols2', 'Columnas: cuadrícula y líneas', ['grid', 'lines'], 'h');
  split('split-4', 'Cuatro cuadrantes', ['lines', 'grid', 'dots', 'blank'], 'q');
  split('split-4b', 'Cuadrantes en blanco', ['blank', 'blank', 'blank', 'blank'], 'q');
  split('split-tasks', 'Tareas y notas', ['check', 'lines'], 'h');
  split('split-hex', 'Hexágonos y líneas', ['hex', 'lines']);

  // Académico
  def('study', 'Sesión de estudio', 'Académico', (c, w, h, s) => { head(c, s, 'Sesión de estudio', w); const cw = (w - 100) / 2; sec(c, s, 'Meta de hoy', 40, 90, cw, 150); sec(c, s, 'Antes de empezar', 60 + cw, 90, cw, 150, 'check'); sec(c, s, 'Temas / capítulos', 40, 254, cw, h - 470); sec(c, s, 'Bloques de tiempo', 60 + cw, 254, cw, h - 470, 'grid'); sec(c, s, 'Descansos', 40, h - 200, cw, 160, 'check'); sec(c, s, 'Notas', 60 + cw, h - 200, cw, 160); });
  def('semester', 'Resumen del semestre', 'Académico', (c, w, h, s) => { head(c, s, 'Semestre', w, ['Inicio:', 'Fin:']); table(c, s, 40, 96, w * 0.42, 34, 18, [1, 3], ['Sem', 'Hitos']); table(c, s, w * 0.42 + 60, 96, w * 0.58 - 100, 34, 18, [1, 1, 1, 1, 1, 1], ['L', 'M', 'X', 'J', 'V', 'S']); sec(c, s, 'Metas', 40, 96 + 34 * 19 + 20, w / 2 - 50, h - 96 - 34 * 19 - 60); sec(c, s, 'Notas', w / 2 + 10, 96 + 34 * 19 + 20, w / 2 - 50, h - 96 - 34 * 19 - 60, 'dots'); });
  def('assign', 'Planificador de tareas', 'Académico', (c, w, h, s) => { head(c, s, 'Tarea', w, ['Entrega:']); const cw = w * 0.45; sec(c, s, 'Detalles', 40, 90, cw, 220); sec(c, s, 'Recursos', 40, 324, cw, 200); sec(c, s, 'Pasos', 40, 538, cw, h - 578, 'check'); sec(c, s, 'Espacio libre', cw + 60, 90, w - cw - 100, h - 130, 'dots'); });
  def('exam', 'Preparación de examen', 'Académico', (c, w, h, s) => { head(c, s, 'Examen', w, ['Asignatura:', 'Fecha:']); table(c, s, 40, 96, w - 80, 36, 14, [4, 1, 1, 1, 1], ['Tema', 'Leído', 'Resumen', 'Ejercicios', 'Dominio']); sec(c, s, 'Dudas para el profesor', 40, 96 + 36 * 15 + 20, w - 80, h - 96 - 36 * 15 - 60); });
  def('timetable', 'Horario de clases', 'Académico', (c, w, h, s) => { title(c, s, 'Horario', 40, 62); table(c, s, 40, 90, w - 80, (h - 140) / 13, 12, [0.8, 1, 1, 1, 1, 1, 1], ['Hora', 'Lunes', 'Martes', 'Miérc.', 'Jueves', 'Viernes', 'Sábado']); });
  def('lab', 'Informe de laboratorio', 'Académico', (c, w, h, s) => { head(c, s, 'Laboratorio', w); const parts = ['Objetivo', 'Hipótesis', 'Materiales', 'Procedimiento', 'Resultados', 'Conclusión'], bh = (h - 110) / 6; parts.forEach((p, i) => sec(c, s, p, 40, 90 + i * bh, w - 80, bh - 10, p === 'Resultados' ? 'grid' : 'lines')); });
  def('vocab', 'Vocabulario', 'Académico', (c, w, h, s) => { title(c, s, 'Vocabulario', 40, 62); table(c, s, 40, 90, w - 80, 38, 23, [2, 3, 3], ['Palabra', 'Significado', 'Ejemplo']); });
  def('problems', 'Problemas resueltos', 'Académico', (c, w, h, s) => { head(c, s, 'Ejercicios', w); const bh = (h - 110) / 3; for (let i = 0; i < 3; i++) { const y = 90 + i * bh; box(c, s, 40, y, w - 80, bh - 14, 12); label(c, s, 'PROBLEMA ' + (i + 1), 54, y + 22, 11); lines(c, s, 52, w - 52, y + 48, y + 100, 26); gridR(c, s, 52, y + 112, w - 52, y + bh - 26, 18); } });
  def('booknotes', 'Resumen de libro', 'Académico', (c, w, h, s) => { title(c, s, 'Resumen de lectura', 40, 62); field(c, s, 'Título:', 40, 104, w * 0.6); field(c, s, 'Autor:', w * 0.62, 104, w - 40); const cw = (w - 100) / 2; sec(c, s, 'Ideas principales', 40, 130, w - 80, 300); sec(c, s, 'Citas', 40, 444, cw, h - 640); sec(c, s, 'Personajes / conceptos', 60 + cw, 444, cw, h - 640, 'dots'); sec(c, s, 'Mi opinión', 40, h - 182, w - 80, 142); });

  // Planificación
  def('weekly-v', 'Semana en columnas', 'Planificación', (c, w, h, s) => { head(c, s, 'Semana', w); const cw = (w - 80) / 7; DAYS.forEach((d, i) => { const x = 40 + i * cw; box(c, s, x + 2, 90, cw - 4, h - 130, 8); label(c, s, d.slice(0, 3).toUpperCase(), x + 12, 112, 11); lines(c, s, x + 8, x + cw - 8, 140, h - 50, 26); }); });
  def('year', 'Año en una página', 'Planificación', (c, w, h, s) => { const y = new Date().getFullYear(); title(c, s, String(y), 40, 62, 32); const cw = (w - 80) / 3, ch = (h - 110) / 4; MONTHS.forEach((m, i) => { const x = 40 + (i % 3) * cw, yy = 90 + Math.floor(i / 3) * ch; label(c, s, m.toUpperCase(), x + 8, yy + 16, 11); const first = (new Date(y, i, 1).getDay() + 6) % 7, days = new Date(y, i + 1, 0).getDate(), dw = (cw - 20) / 7; for (let d = 0; d < days; d++) { const cell = first + d; label(c, s, String(d + 1), x + 8 + (cell % 7) * dw, yy + 40 + Math.floor(cell / 7) * 20, 9); } }); });
  def('goals', 'Metas y objetivos', 'Planificación', (c, w, h, s) => { head(c, s, 'Metas', w, ['Periodo:']); const cw = (w - 100) / 2, bh = (h - 120) / 3; ['Personal', 'Trabajo', 'Salud', 'Aprendizaje', 'Finanzas', 'Relaciones'].forEach((t, i) => sec(c, s, t, 40 + (i % 2) * (cw + 20), 90 + Math.floor(i / 2) * bh, cw, bh - 12, 'check')); });
  def('budget', 'Presupuesto mensual', 'Planificación', (c, w, h, s) => { head(c, s, 'Presupuesto', w, ['Mes:']); const cw = (w - 100) / 2; table(c, s, 40, 96, cw, 34, 8, [3, 1.4], ['Ingresos', 'Monto']); table(c, s, 60 + cw, 96, cw, 34, 8, [3, 1.4], ['Ahorro', 'Monto']); table(c, s, 40, 420, w - 80, 34, 14, [3, 1.4, 1.4, 1.4], ['Gasto', 'Previsto', 'Real', 'Diferencia']); });
  def('project', 'Plan de proyecto', 'Planificación', (c, w, h, s) => { head(c, s, 'Proyecto', w, ['Inicio:', 'Fin:']); sec(c, s, 'Objetivo', 40, 90, w - 80, 120); table(c, s, 40, 226, w - 80, 34, 14, [3, 1.4, 1.2, 1], ['Tarea', 'Responsable', 'Plazo', 'Estado']); sec(c, s, 'Riesgos y notas', 40, 226 + 34 * 15 + 20, w - 80, h - 226 - 34 * 15 - 60); });
  def('eisenhower', 'Matriz de prioridades', 'Planificación', (c, w, h, s) => { title(c, s, 'Prioridades', 40, 62); const cw = (w - 100) / 2, ch = (h - 140) / 2; [['Urgente · Importante', 'Hazlo'], ['No urgente · Importante', 'Agéndalo'], ['Urgente · No importante', 'Delégalo'], ['Ni urgente ni importante', 'Elimínalo']].forEach(([a, b], i) => sec(c, s, a + ' — ' + b, 40 + (i % 2) * (cw + 20), 90 + Math.floor(i / 2) * (ch + 14), cw, ch, 'check')); });
  def('kanban', 'Tablero Kanban', 'Planificación', (c, w, h, s) => { title(c, s, 'Tablero', 40, 62); const cw = (w - 110) / 3; ['Por hacer', 'En curso', 'Hecho'].forEach((t, i) => { const x = 40 + i * (cw + 15); box(c, s, x, 90, cw, h - 130, 12); c.fillStyle = s.soft; c.fillRect(x + 1, 91, cw - 2, 30); label(c, s, t.toUpperCase(), x + 14, 111, 11); for (let y = 136; y + 90 < h - 50; y += 104) { c.setLineDash([5, 5]); box(c, s, x + 10, y, cw - 20, 90, 8); c.setLineDash([]); } }); });

  // Creativo
  def('story4', 'Guion gráfico (4)', 'Creativo', (c, w, h, s) => { const bh = (h - 100) / 4; for (let i = 0; i < 4; i++) { const y = 50 + i * bh; box(c, s, 40, y, w * 0.4, bh - 20, 6); lines(c, s, w * 0.4 + 60, w - 40, y + 24, y + bh - 24, 26); } });
  def('story6', 'Guion gráfico (6)', 'Creativo', (c, w, h, s) => { const cw = (w - 120) / 3, bh = (h - 120) / 2; for (let i = 0; i < 6; i++) { const x = 40 + (i % 3) * (cw + 20), y = 50 + Math.floor(i / 3) * (bh + 20); box(c, s, x, y, cw, bh * 0.72, 6); lines(c, s, x, x + cw, y + bh * 0.72 + 26, y + bh, 24); } });
  def('recipe', 'Receta', 'Creativo', (c, w, h, s) => { title(c, s, 'Receta', 40, 62); field(c, s, 'Nombre:', w * 0.5, 104, w - 40); field(c, s, 'Porciones:', w * 0.5, 140, w - 40); field(c, s, 'Tiempo:', w * 0.5, 176, w - 40); c.fillStyle = s.soft; c.fillRect(40, 84, w * 0.44, 180); box(c, s, 40, 84, w * 0.44, 180, 10); sec(c, s, 'Ingredientes', 40, 284, w * 0.38, h - 324, 'check'); sec(c, s, 'Preparación', w * 0.38 + 60, 284, w * 0.62 - 100, h - 324); });
  def('comic', 'Viñetas de cómic', 'Creativo', (c, w, h, s) => { const P = [[40, 40, w - 80, 260], [40, 316, (w - 100) * 0.4, 300], [60 + (w - 100) * 0.4, 316, (w - 100) * 0.6, 300], [40, 632, (w - 120) / 3, h - 672], [60 + (w - 120) / 3, 632, (w - 120) / 3, h - 672], [80 + 2 * (w - 120) / 3, 632, (w - 120) / 3, h - 672]]; c.lineWidth = 3; c.strokeStyle = s.text; P.forEach(([x, y, ww, hh]) => c.strokeRect(x, y, ww, hh)); });
  def('moodboard', 'Moodboard', 'Creativo', (c, w, h, s) => { title(c, s, 'Moodboard', 40, 62); const P = [[40, 90, 0.55, 0.32], [0.6, 90, 0.4, 0.2], [0.6, 0.29, 0.4, 0.24], [40, 0.43, 0.32, 0.3], [0.37, 0.43, 0.63, 0.3], [40, 0.77, 1, 0.19]]; const X = v => v <= 1 ? 40 + v * (w - 80) : v, Y = v => v <= 1 ? 90 + v * (h - 130) : v; P.forEach(([x, y, ww, hh]) => { c.setLineDash([6, 6]); box(c, s, X(x) + (x > 1 ? 0 : 4), Y(y), ww * (w - 80) - 8, hh * (h - 130) - 8, 14); c.setLineDash([]); }); });
  def('lettering', 'Práctica de lettering', 'Creativo', (c, w, h, s) => { title(c, s, 'Lettering', 40, 62); fourLines(c, s, 40, w - 40, 130, h - 40, 46, 60); });

  // Viajes
  def('travel', 'Planificador de viajes', 'Viajes', (c, w, h, s) => { head(c, s, 'Viaje', w, ['Destino:', 'Fechas:']); const cw = (w - 100) / 2; sec(c, s, 'Vuelos / transporte', 40, 90, cw, 220); sec(c, s, 'Alojamiento', 60 + cw, 90, cw, 220); sec(c, s, 'Equipaje', 40, 324, cw, h - 364, 'check'); sec(c, s, 'Por hacer antes de salir', 60 + cw, 324, cw, h - 364, 'check'); });
  def('itinerary', 'Itinerario diario', 'Viajes', (c, w, h, s) => { head(c, s, 'Itinerario', w, ['Destino:']); for (let d = 0; d < 3; d++) { const y = 96 + d * (h - 130) / 3; label(c, s, 'DÍA ' + (d + 1), 40, y, 12); table(c, s, 40, y + 10, w - 80, 30, 6, [1, 2, 3], ['Hora', 'Lugar', 'Detalles']); } });
  def('travel-journal', 'Diario de viaje', 'Viajes', (c, w, h, s) => { head(c, s, 'Diario de viaje', w, ['Lugar:', 'Fecha:']); c.setLineDash([6, 6]); box(c, s, 40, 90, w - 80, 300, 14); c.setLineDash([]); label(c, s, 'FOTO O DIBUJO', w / 2 - 50, 245, 11); lines(c, s, 40, w - 40, 430, h - 30, 30); });
  def('packing', 'Lista de equipaje', 'Viajes', (c, w, h, s) => { title(c, s, 'Equipaje', 40, 62); const cw = (w - 100) / 2, bh = (h - 120) / 3; ['Ropa', 'Aseo', 'Documentos', 'Tecnología', 'Botiquín', 'Otros'].forEach((t, i) => sec(c, s, t, 40 + (i % 2) * (cw + 20), 90 + Math.floor(i / 2) * bh, cw, bh - 12, 'check')); });

  // Autocuidado
  const circles = (c, s, x, y, n = 7) => { c.strokeStyle = s.strong; c.lineWidth = 1; for (let i = 0; i < n; i++) { c.beginPath(); c.arc(x + i * 20, y, 7, 0, 7); c.stroke(); } };
  def('daily-goals', 'Objetivos diarios', 'Autocuidado', (c, w, h, s) => { title(c, s, 'Objetivos del día', 40, 62); circles(c, s, w - 180, 56); const bh = (h - 110) / 3; ['Intenciones de la mañana', 'Logros del día', 'Reflexión de la noche'].forEach((t, i) => sec(c, s, t, 40, 90 + i * bh, w - 80, bh - 14)); });
  def('gratitude', 'Gratitud diaria', 'Autocuidado', (c, w, h, s) => { title(c, s, 'Gratitud', 40, 62); circles(c, s, w - 180, 56); const cw = (w - 100) * 0.58; sec(c, s, 'Hoy agradezco', 40, 90, cw, 300); sec(c, s, 'Algo bueno que pasó', 40, 404, cw, 260); sec(c, s, 'Lo que aprendí', 40, 678, cw, h - 718); sec(c, s, 'Me hizo sonreír', cw + 60, 90, w - cw - 100, h - 130, 'dots'); });
  def('daily-tasks', 'Tareas diarias', 'Autocuidado', (c, w, h, s) => { title(c, s, 'Tareas del día', 40, 62); circles(c, s, w - 180, 56); sec(c, s, 'Lo más importante', 40, 90, w - 80, 200); const cw = (w - 120) / 3; ['Prioridad 1', 'Prioridad 2', 'Prioridad 3'].forEach((t, i) => sec(c, s, t, 40 + i * (cw + 20), 304, cw, 180)); sec(c, s, 'Pendientes', 40, 498, w - 80, h - 538, 'check'); });
  def('journal', 'Diario personal', 'Autocuidado', (c, w, h, s) => { title(c, s, 'Diario', 40, 62); circles(c, s, w - 180, 56); field(c, s, 'Fecha:', 40, 100, 360); lines(c, s, 40, w - 40, 140, h - 30, 30); });
  def('selfcare', 'Lista de autocuidado', 'Autocuidado', (c, w, h, s) => { title(c, s, 'Autocuidado', 40, 62); const q = ['¿Dormí bien?', '¿Tomé suficiente agua?', '¿Me moví o hice ejercicio?', '¿Comí sano?', '¿Tomé un descanso de pantallas?', '¿Hablé con alguien querido?', '¿Hice algo que disfruto?', '¿Cómo me siento ahora?']; q.forEach((t, i) => { const y = 110 + i * ((h - 160) / q.length); label(c, s, t, 40, y, 14); circles(c, s, w - 200, y - 5, 5); c.strokeStyle = s.line; hl(c, y + 30, 40, w - 40); hl(c, y + 58, 40, w - 40); }); });
  def('mood', 'Año en píxeles', 'Autocuidado', (c, w, h, s) => { title(c, s, 'Estado de ánimo', 40, 62); const left = 70, top = 110, cw = (w - left - 40) / 12, ch = (h - top - 120) / 31; MONTHS.forEach((m, i) => label(c, s, m[0], left + i * cw + cw / 2 - 4, top - 10, 11)); for (let d = 0; d < 31; d++) label(c, s, String(d + 1), 40, top + d * ch + ch * 0.7, 9); gridR(c, s, left, top, left + 12 * cw, top + 31 * ch, Math.min(cw, ch)); ['Feliz', 'Tranquilo', 'Normal', 'Cansado', 'Triste', 'Estresado'].forEach((t, i) => { c.strokeStyle = s.strong; c.strokeRect(40 + i * 120, h - 70, 16, 16); label(c, s, t, 62 + i * 120, h - 57, 11); }); });
  def('wellness', 'Agua, sueño y ejercicio', 'Autocuidado', (c, w, h, s) => { title(c, s, 'Bienestar semanal', 40, 62); table(c, s, 40, 96, w - 80, 40, 7, [1.4, 2, 1.4, 2, 2], ['Día', 'Agua (vasos)', 'Sueño (h)', 'Ejercicio', 'Ánimo']); sec(c, s, 'Notas de la semana', 40, 96 + 40 * 8 + 20, w - 80, h - 96 - 40 * 8 - 60); });

  // Clínica
  def('admission', 'Ingreso de urgencia', 'Clínica', (c, w, h, s) => { title(c, s, 'Ingreso', 40, 60); field(c, s, 'Paciente:', 40, 98, w * 0.6); field(c, s, 'RUT:', w * 0.63, 98, w - 40); field(c, s, 'Edad:', 40, 132, 200); field(c, s, 'Box:', 220, 132, 380); field(c, s, 'Hora:', 400, 132, w - 40); const parts = [['Motivo de consulta', 70], ['Anamnesis', 170], ['Antecedentes / alergias / fármacos', 110], ['Examen físico', 170], ['Hipótesis diagnósticas', 110], ['Plan e indicaciones', 0]]; let y = 152; const rest = h - 30 - y - parts.reduce((a, b) => a + b[1], 0) - parts.length * 10; parts.forEach(([t, bh]) => { const H = bh || rest; sec(c, s, t, 40, y, w - 80, H); y += H + 10; }); });
  def('procedure', 'Registro de procedimiento', 'Clínica', (c, w, h, s) => { title(c, s, 'Procedimiento', 40, 60); field(c, s, 'Paciente:', 40, 98, w * 0.6); field(c, s, 'Fecha:', w * 0.63, 98, w - 40); field(c, s, 'Procedimiento:', 40, 132, w - 40); const cw = (w - 100) / 2; sec(c, s, 'Indicación', 40, 156, cw, 150); sec(c, s, 'Consentimiento y checklist', 60 + cw, 156, cw, 150, 'check'); sec(c, s, 'Técnica', 40, 320, w - 80, 300); sec(c, s, 'Complicaciones', 40, 634, cw, h - 674); sec(c, s, 'Plan posterior', 60 + cw, 634, cw, h - 674); });
  def('meds', 'Indicaciones y fármacos', 'Clínica', (c, w, h, s) => { title(c, s, 'Indicaciones', 40, 60); field(c, s, 'Paciente:', 40, 98, w - 40); table(c, s, 40, 124, w - 80, 40, 20, [3, 1.2, 1.2, 1.2, 1.4], ['Fármaco', 'Dosis', 'Vía', 'Frecuencia', 'Hora / firma']); });
  def('patients', 'Censo de pacientes', 'Clínica', (c, w, h, s) => { title(c, s, 'Pacientes del turno', 40, 60); field(c, s, 'Fecha:', w - 300, 58, w - 40); table(c, s, 40, 90, w - 80, 46, 19, [0.7, 2.2, 0.7, 2.4, 2.6, 0.9], ['Box', 'Nombre', 'Edad', 'Dg', 'Pendiente', '✓']); });

  const CATS = ['Portadas', 'Papel', 'Cuadernos', 'Hojas divididas', 'Estudio', 'Académico', 'Planificación', 'Creativo', 'Viajes', 'Autocuidado', 'Clínica'];

  // dibuja el fondo del papel en coordenadas de página (ctx ya escalado)
  function draw(c, w, h, paper) {
    paper = paper || { tpl: 'blank', color: '#FFFFFF' };
    const t = T[paper.tpl] || T.blank;
    c.fillStyle = t.cover ? t.base : (paper.color || '#FFFFFF'); c.fillRect(0, 0, w, h);
    const st = ctxStyle(paper.color); st.sp = paper.sp || 1;
    c.save(); t.draw(c, w, h, st, paper.p); c.restore();
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
    const st = s.st;
    if (st === 'calli') {
      // punta biselada a 45°: cada tramo es un cuadrilátero
      const nx = Math.cos(-0.8) * W * 1.6, ny = Math.sin(-0.8) * W * 1.6;
      c.beginPath();
      for (let i = 0; i < n - 1; i++) {
        const k = 0.6 + 0.5 * p[i * 3 + 2], ax = p[i * 3], ay = p[i * 3 + 1], bx = p[i * 3 + 3], by = p[i * 3 + 4];
        c.moveTo(ax - nx * k, ay - ny * k); c.lineTo(ax + nx * k, ay + ny * k); c.lineTo(bx + nx * k, by + ny * k); c.lineTo(bx - nx * k, by - ny * k); c.closePath();
      }
      c.fill(); c.lineWidth = 0.6; c.stroke(); c.restore(); return;
    }
    let uniform = true;
    for (let i = 1; i < n; i++) if (Math.abs(p[i * 3 + 2] - p[2]) > 0.02) { uniform = false; break; }
    const wOf = st === 'brush' ? pr => W * (0.1 + 1.7 * pr * pr) : pr => W * (0.35 + 0.9 * pr);
    if (st === 'fine') uniform = true;
    else if (st === 'fountain' || st === 'brush') uniform = false;
    if (uniform || s.u) { c.lineWidth = s.u ? W : wOf(p[2]); strokePath(c, p, 0, n); c.stroke(); }
    else {
      // segmentos con grosor según presión
      let px = p[0], py = p[1];
      for (let i = 1; i < n; i++) {
        const x = p[i * 3], y = p[i * 3 + 1];
        const mx = i < n - 1 ? (x + p[i * 3 + 3]) / 2 : x, my = i < n - 1 ? (y + p[i * 3 + 4]) / 2 : y;
        c.beginPath(); c.moveTo(px, py); c.quadraticCurveTo(x, y, mx, my);
        c.lineWidth = wOf((p[i * 3 - 1] + p[i * 3 + 2]) / 2) * (st === 'fountain' ? 0.45 + 0.85 * Math.abs(Math.sin(Math.atan2(y - py, x - px) - 0.8)) : 1); c.stroke();
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
  const FONTS = {
    system: '-apple-system, "SF Pro Text", "Helvetica Neue", Arial, sans-serif', round: '"Avenir Next", "Nunito", -apple-system, sans-serif', helvetica: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    futura: 'Futura, "Century Gothic", sans-serif', gill: '"Gill Sans", "Gill Sans MT", sans-serif', optima: 'Optima, Candara, sans-serif', verdana: 'Verdana, Geneva, sans-serif', trebuchet: '"Trebuchet MS", sans-serif',
    serif: 'Georgia, "Times New Roman", serif', times: '"Times New Roman", Times, serif', baskerville: 'Baskerville, "Baskerville Old Face", serif', palatino: 'Palatino, "Palatino Linotype", serif', didot: 'Didot, "Bodoni 72", serif', charter: 'Charter, "Iowan Old Style", Georgia, serif', copperplate: 'Copperplate, "Copperplate Gothic Light", serif',
    mono: '"SF Mono", Menlo, Consolas, monospace', courier: '"Courier New", Courier, monospace', typewriter: '"American Typewriter", "Courier New", serif',
    hand: '"Marker Felt", "Comic Sans MS", "Chalkboard SE", cursive', chalk: '"Chalkboard SE", "Comic Sans MS", cursive', chalkduster: 'Chalkduster, "Chalkboard SE", cursive', noteworthy: 'Noteworthy, "Segoe Print", cursive', bradley: '"Bradley Hand", "Segoe Script", cursive',
    snell: '"Snell Roundhand", "Brush Script MT", cursive', savoye: '"Savoye LET", "Snell Roundhand", cursive', zapfino: 'Zapfino, "Snell Roundhand", cursive', party: '"Party LET", "Bradley Hand", cursive', papyrus: 'Papyrus, fantasy', impact: 'Impact, "Arial Black", sans-serif',
  };
  const FONT_GROUPS = [['Sin serifa', [['system', 'Sistema'], ['round', 'Avenir'], ['helvetica', 'Helvetica'], ['futura', 'Futura'], ['gill', 'Gill Sans'], ['optima', 'Optima'], ['verdana', 'Verdana'], ['trebuchet', 'Trebuchet'], ['impact', 'Impact']]],
    ['Con serifa', [['serif', 'Georgia'], ['times', 'Times'], ['baskerville', 'Baskerville'], ['palatino', 'Palatino'], ['didot', 'Didot'], ['charter', 'Charter'], ['copperplate', 'Copperplate']]],
    ['Máquina de escribir', [['mono', 'SF Mono'], ['courier', 'Courier'], ['typewriter', 'American Typewriter']]],
    ['Manuscritas', [['hand', 'Marker Felt'], ['chalk', 'Chalkboard'], ['chalkduster', 'Tiza'], ['noteworthy', 'Noteworthy'], ['bradley', 'Bradley Hand'], ['party', 'Party'], ['papyrus', 'Papyrus']]],
    ['Caligrafía', [['snell', 'Snell Roundhand'], ['savoye', 'Savoye'], ['zapfino', 'Zapfino']]]];
  const fontOf = it => `${it.it ? 'italic ' : ''}${it.b ? 700 : 400} ${it.z || 18}px ${FONTS[it.f] || FONTS.system}`;
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
    if (it.t === 'g') return Shapes.bbox(it);
    if (it.t === 'tp' && it.p) return Ink.bbox({ p: it.p, w: it.w });
    if (it.t === 'tp') { const m = it.w / 2; return { x: Math.min(it.x1, it.x2) - m, y: Math.min(it.y1, it.y2) - m, w: Math.abs(it.x2 - it.x1) + 2 * m, h: Math.abs(it.y2 - it.y1) + 2 * m }; }
    return { x: 0, y: 0, w: 0, h: 0 };
  }
  function hit(it, x, y, r = 4) {
    if (it.t === 's') return Ink.hit(it, x, y, r);
    if (it.t === 'tp' && it.p) return Ink.hit({ p: it.p, w: it.w }, x, y, r);
    if (it.t === 'tp') return Ink.segDist(x, y, it.x1, it.y1, it.x2, it.y2) < it.w / 2 + r;
    if (it.t === 'g') return Shapes.hit(it, x, y, r);
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
    if (it.u) lines.forEach((l, i) => { const lw = c.measureText(l).width, x0 = it.al === 'center' ? it.x + (it.w - lw) / 2 : it.x + pad; c.fillRect(x0, it.y + pad + i * lh + (lh + (it.z || 18)) / 2 + 1, lw, Math.max(1.2, (it.z || 18) / 14)); });
    c.restore();
  }
  // cinta a mano alzada: trazo ancho con rayas diagonales
  const stripeCache = {};
  function stripes(c, col) {
    if (stripeCache[col]) return stripeCache[col];
    const t = document.createElement('canvas'); t.width = t.height = 16; const x = t.getContext('2d');
    x.fillStyle = col; x.fillRect(0, 0, 16, 16); x.strokeStyle = 'rgba(255,255,255,0.75)'; x.lineWidth = 3.2;
    x.beginPath(); x.moveTo(-4, 20); x.lineTo(20, -4); x.moveTo(-4, 4); x.lineTo(4, -4); x.moveTo(12, 20); x.lineTo(20, 12); x.stroke();
    return (stripeCache[col] = c.createPattern(t, 'repeat'));
  }
  function drawTape(c, it) {
    if (it.p) {
      const p = it.p, n = p.length / 3; c.save(); c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = it.w;
      c.beginPath(); c.moveTo(p[0], p[1]); for (let i = 1; i < n; i++) { const x = p[i * 3], y = p[i * 3 + 1]; i < n - 1 ? c.quadraticCurveTo(x, y, (x + p[i * 3 + 3]) / 2, (y + p[i * 3 + 4]) / 2) : c.lineTo(x, y); }
      if (it.hid) { c.strokeStyle = stripes(c, it.c || '#8FD3CF'); c.shadowColor = 'rgba(0,0,0,0.12)'; c.shadowBlur = 3; c.stroke(); }
      else { c.globalAlpha = 0.16; c.strokeStyle = it.c || '#8FD3CF'; c.stroke(); }
      c.restore(); return;
    }
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
      else if (it.t === 'g') Shapes.draw(c, it, opts.rec && it.r && it.r[0] === opts.rec.id && it.r[1] > opts.rec.ms ? 0.2 : 1);
    }
  }
  function translate(it, dx, dy) {
    if (it.t === 's') { for (let i = 0; i < it.p.length; i += 3) { it.p[i] += dx; it.p[i + 1] += dy; } it._bb = null; }
    else if (it.t === 'tp' && it.p) { for (let i = 0; i < it.p.length; i += 3) { it.p[i] += dx; it.p[i + 1] += dy; } }
    else if (it.t === 'tp') { it.x1 += dx; it.x2 += dx; it.y1 += dy; it.y2 += dy; }
    else if (it.t === 'g') Shapes.translate(it, dx, dy);
    else { it.x += dx; it.y += dy; }
  }
  function scale(it, ox, oy, k) {
    if (it.t === 's') { for (let i = 0; i < it.p.length; i += 3) { it.p[i] = ox + (it.p[i] - ox) * k; it.p[i + 1] = oy + (it.p[i + 1] - oy) * k; } it.w *= k; it._bb = null; }
    else if (it.t === 'tp' && it.p) { for (let i = 0; i < it.p.length; i += 3) { it.p[i] = ox + (it.p[i] - ox) * k; it.p[i + 1] = oy + (it.p[i + 1] - oy) * k; } it.w *= k; }
    else if (it.t === 'tp') { it.x1 = ox + (it.x1 - ox) * k; it.x2 = ox + (it.x2 - ox) * k; it.y1 = oy + (it.y1 - oy) * k; it.y2 = oy + (it.y2 - oy) * k; it.w *= k; }
    else if (it.t === 'g') Shapes.scale(it, ox, oy, k);
    else { it.x = ox + (it.x - ox) * k; it.y = oy + (it.y - oy) * k; it.w *= k; if (it.t === 'i') it.h *= k; else { it.z = (it.z || 18) * k; it.h = 0; } }
  }
  const clone = it => { const o = JSON.parse(JSON.stringify(it, (k, v) => k === '_bb' ? undefined : v)); o.id = uid(); return o; };
  return { FONTS, FONT_GROUPS, fontOf, bbox, hit, drawAll, drawText, translate, scale, clone, textLayout };
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
