// Trazo — figuras vectoriales: biblioteca, 3D, diagramas de flujo, lluvia de ideas, conectores y reconocimiento de trazos
'use strict';

const Shapes = (() => {
  const LINES = new Set(['line', 'arrow', 'darrow', 'curve', 'elbow', 'dashed']);
  const SOLID3D = new Set(['cube', 'cuboid', 'cyl', 'cone', 'sphere', 'pyr', 'prism', 'tetra', 'hemi']);
  const SQUARE = new Set(['square', 'circle', 'cube', 'sphere', 'star', 'star6', 'heart', 'f-conn', 'burst', 'check', 'xmark', 'pent', 'hex', 'oct']);
  const OVAL = new Set(['ellipse', 'circle', 'f-conn', 'sphere']);
  const STROKE_ONLY = new Set(['axes', 'numline', 'wave', 'check', 'xmark', 'brace', 'bracket', 'div-line', 'div-double', 'div-dash', 'div-dots', 'div-wave', 'div-zigzag', 'div-orn', 'div-stars']);
  // relleno del bloque con su patrón, recortado a su contorno
  function pattern(c, it) {
    const { sh, x, y, w, h } = it, st = 22, a = c.globalAlpha;
    c.save(); c.setLineDash([]); c.lineWidth = Math.max(0.8, (it.lw || 2) * 0.4); c.globalAlpha = a * 0.55;
    const P = new Path2D(); P.rect(x, y, w, h); c.clip(P);
    const hl = (yy, x0 = x, x1 = x + w) => { c.beginPath(); c.moveTo(x0, yy); c.lineTo(x1, yy); c.stroke(); }, vl = (xx, y0 = y, y1 = y + h) => { c.beginPath(); c.moveTo(xx, y0); c.lineTo(xx, y1); c.stroke(); };
    if (sh === 'blk-lines') for (let yy = y + st * 1.4; yy < y + h - 4; yy += st * 1.2) hl(yy, x + 10, x + w - 10);
    else if (sh === 'blk-grid') { for (let xx = x + st; xx < x + w; xx += st) vl(xx); for (let yy = y + st; yy < y + h; yy += st) hl(yy); }
    else if (sh === 'blk-dots') { c.globalAlpha = a * 0.8; for (let yy = y + st; yy < y + h - 4; yy += st) for (let xx = x + st; xx < x + w - 4; xx += st) { c.beginPath(); c.arc(xx, yy, 1.4, 0, 7); c.fill(); } }
    else if (sh === 'blk-hex') { const r = 12, hw = Math.sqrt(3) * r; for (let row = 0, yy = y; yy < y + h + r; yy += r * 1.5, row++) for (let xx = x + (row % 2 ? hw / 2 : 0); xx < x + w + hw; xx += hw) { c.beginPath(); for (let k = 0; k < 6; k++) { const an = Math.PI / 6 + k * Math.PI / 3; k ? c.lineTo(xx + r * Math.cos(an), yy + r * Math.sin(an)) : c.moveTo(xx + r * Math.cos(an), yy + r * Math.sin(an)); } c.closePath(); c.stroke(); } }
    else if (sh === 'blk-iso') { const k = Math.tan(Math.PI / 6); for (let xx = x - h / k; xx < x + w + h / k; xx += st / k) { c.beginPath(); c.moveTo(xx, y); c.lineTo(xx + h / k, y + h); c.moveTo(xx, y); c.lineTo(xx - h / k, y + h); c.stroke(); } }
    else if (sh === 'blk-check') { c.globalAlpha = a * 0.8; for (let yy = y + 18; yy < y + h - 14; yy += 32) { c.strokeRect(x + 14, yy, 14, 14); hl(yy + 14, x + 38, x + w - 14); } }
    else if (sh === 'blk-table') { const cols = Math.max(2, Math.round(w / 120)), rows = Math.max(2, Math.round(h / 34)); c.globalAlpha = a * 0.15; c.fillRect(x, y, w, h / rows); c.globalAlpha = a * 0.7; for (let i = 1; i < cols; i++) vl(x + i * w / cols); for (let i = 1; i < rows; i++) hl(y + i * h / rows); }
    else if (sh === 'blk-cornell') { c.globalAlpha = a * 0.8; vl(x + w * 0.3, y, y + h * 0.78); hl(y + h * 0.78); c.globalAlpha = a * 0.4; for (let yy = y + st * 1.4; yy < y + h * 0.76; yy += st * 1.2) hl(yy, x + w * 0.3 + 8, x + w - 10); }
    c.restore();
  }
  const CATS = [
    ['Básicas', ['rect', 'rrect', 'square', 'ellipse', 'circle', 'tri', 'rtri', 'diamond', 'para', 'trap', 'pent', 'hex', 'oct', 'star', 'star6', 'heart', 'cross', 'ring', 'semi', 'moon']],
    ['Líneas y flechas', ['line', 'arrow', 'darrow', 'dashed', 'curve', 'elbow', 'barrow', 'barrow2', 'chevron', 'uarrow']],
    ['Diagrama de flujo', ['f-proc', 'f-dec', 'f-term', 'f-data', 'f-doc', 'f-db', 'f-pre', 'f-manual', 'f-conn', 'f-off', 'f-delay', 'f-prep']],
    ['3D', ['cube', 'cuboid', 'cyl', 'cone', 'sphere', 'hemi', 'pyr', 'prism', 'tetra']],
    ['Ideas y notas', ['cloud', 'bubble', 'thought', 'callout', 'banner', 'tag', 'burst', 'note', 'check', 'xmark', 'brace', 'bracket']],
    ['Ciencias', ['axes', 'numline', 'wave']],
    ['Bloques y divisores', ['blk-lines', 'blk-grid', 'blk-dots', 'blk-hex', 'blk-iso', 'blk-check', 'blk-table', 'blk-cornell', 'div-line', 'div-double', 'div-dash', 'div-dots', 'div-wave', 'div-zigzag', 'div-orn', 'div-stars']],
  ];
  const NAMES = {
    rect: 'Rectángulo', rrect: 'Rectángulo redondeado', square: 'Cuadrado', ellipse: 'Elipse', circle: 'Círculo', tri: 'Triángulo', rtri: 'Triángulo rectángulo', diamond: 'Rombo', para: 'Paralelogramo', trap: 'Trapecio', pent: 'Pentágono', hex: 'Hexágono', oct: 'Octágono', star: 'Estrella', star6: 'Estrella de 6', heart: 'Corazón', cross: 'Cruz', ring: 'Anillo', semi: 'Semicírculo', moon: 'Luna',
    line: 'Línea', arrow: 'Flecha', darrow: 'Flecha doble', dashed: 'Línea discontinua', curve: 'Curva', elbow: 'Conector en ángulo', barrow: 'Flecha gruesa', barrow2: 'Flecha gruesa doble', chevron: 'Chevrón', uarrow: 'Flecha arriba',
    'f-proc': 'Proceso', 'f-dec': 'Decisión', 'f-term': 'Inicio / fin', 'f-data': 'Datos', 'f-doc': 'Documento', 'f-db': 'Base de datos', 'f-pre': 'Subproceso', 'f-manual': 'Entrada manual', 'f-conn': 'Conector', 'f-off': 'Fuera de página', 'f-delay': 'Espera', 'f-prep': 'Preparación',
    cube: 'Cubo', cuboid: 'Prisma rectangular', cyl: 'Cilindro', cone: 'Cono', sphere: 'Esfera', hemi: 'Semiesfera', pyr: 'Pirámide', prism: 'Prisma triangular', tetra: 'Tetraedro',
    cloud: 'Nube', bubble: 'Globo de diálogo', thought: 'Pensamiento', callout: 'Llamada', banner: 'Cinta', tag: 'Etiqueta', burst: 'Explosión', note: 'Nota', check: 'Visto', xmark: 'Equis', brace: 'Llave', bracket: 'Corchete',
    'blk-lines': 'Bloque rayado', 'blk-grid': 'Bloque cuadriculado', 'blk-dots': 'Bloque de puntos', 'blk-hex': 'Bloque hexagonal', 'blk-iso': 'Bloque isométrico', 'blk-check': 'Lista de verificación', 'blk-table': 'Tabla', 'blk-cornell': 'Bloque Cornell',
    'div-line': 'Divisor simple', 'div-double': 'Divisor doble', 'div-dash': 'Divisor discontinuo', 'div-dots': 'Divisor de puntos', 'div-wave': 'Divisor ondulado', 'div-zigzag': 'Divisor zigzag', 'div-orn': 'Divisor ornamental', 'div-stars': 'Divisor de estrellas',
    axes: 'Ejes cartesianos', numline: 'Recta numérica', wave: 'Onda', poly: 'Polígono',
  };
  const isLine = it => LINES.has(it.sh);

  // ---------- geometría ----------
  function regular(P, n, x, y, w, h, rot = -Math.PI / 2, inner = 0) {
    const cx = x + w / 2, cy = y + h / 2;
    for (let i = 0; i < n * (inner ? 2 : 1); i++) {
      const a = rot + i * Math.PI * 2 / (n * (inner ? 2 : 1)), k = inner && i % 2 ? inner : 1;
      const px = cx + Math.cos(a) * w / 2 * k, py = cy + Math.sin(a) * h / 2 * k;
      i ? P.lineTo(px, py) : P.moveTo(px, py);
    }
    P.closePath();
  }
  // figuras planas: { p: contorno rellenable, x: trazos extra, even: relleno par-impar }
  function geo(it) {
    const { sh } = it, x = it.x, y = it.y, w = it.w, h = it.h;
    const P = new Path2D(), X = new Path2D();
    const poly = (pts, path = P) => { pts.forEach(([u, v], i) => i ? path.lineTo(x + u * w, y + v * h) : path.moveTo(x + u * w, y + v * h)); path.closePath(); };
    const rr = (r, path = P) => { r = Math.min(r, w / 2, h / 2); path.moveTo(x + r, y); path.arcTo(x + w, y, x + w, y + h, r); path.arcTo(x + w, y + h, x, y + h, r); path.arcTo(x, y + h, x, y, r); path.arcTo(x, y, x + w, y, r); path.closePath(); };
    let even = false;
    switch (sh) {
      case 'rect': case 'square': case 'f-proc': P.rect(x, y, w, h); break;
      case 'rrect': rr(Math.min(w, h) * 0.18); break;
      case 'ellipse': case 'circle': case 'f-conn': P.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); break;
      case 'tri': poly([[0.5, 0], [1, 1], [0, 1]]); break;
      case 'rtri': poly([[0, 0], [1, 1], [0, 1]]); break;
      case 'diamond': case 'f-dec': poly([[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]]); break;
      case 'para': case 'f-data': poly([[0.2, 0], [1, 0], [0.8, 1], [0, 1]]); break;
      case 'trap': poly([[0.2, 0], [0.8, 0], [1, 1], [0, 1]]); break;
      case 'pent': regular(P, 5, x, y, w, h); break;
      case 'hex': regular(P, 6, x, y, w, h, 0); break;
      case 'oct': regular(P, 8, x, y, w, h, Math.PI / 8); break;
      case 'star': regular(P, 5, x, y, w, h, -Math.PI / 2, 0.42); break;
      case 'star6': regular(P, 6, x, y, w, h, -Math.PI / 2, 0.58); break;
      case 'burst': regular(P, 12, x, y, w, h, -Math.PI / 2, 0.72); break;
      case 'heart':
        P.moveTo(x + w / 2, y + h * 0.28);
        P.bezierCurveTo(x + w / 2, y, x, y, x, y + h * 0.32);
        P.bezierCurveTo(x, y + h * 0.62, x + w * 0.38, y + h * 0.78, x + w / 2, y + h);
        P.bezierCurveTo(x + w * 0.62, y + h * 0.78, x + w, y + h * 0.62, x + w, y + h * 0.32);
        P.bezierCurveTo(x + w, y, x + w / 2, y, x + w / 2, y + h * 0.28); P.closePath(); break;
      case 'cross': { const a = 0.33, b = 0.67; poly([[a, 0], [b, 0], [b, a], [1, a], [1, b], [b, b], [b, 1], [a, 1], [a, b], [0, b], [0, a], [a, a]]); break; }
      case 'ring': P.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); P.moveTo(x + w * 0.8, y + h / 2); P.ellipse(x + w / 2, y + h / 2, w * 0.3, h * 0.3, 0, 0, Math.PI * 2); even = true; break;
      case 'semi': P.moveTo(x, y + h); P.ellipse(x + w / 2, y + h, w / 2, h, 0, Math.PI, 0); P.closePath(); break;
      case 'moon': P.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, -Math.PI / 2, Math.PI / 2, true); P.ellipse(x + w / 2, y + h / 2, w * 0.2, h / 2, 0, Math.PI / 2, -Math.PI / 2, false); P.closePath(); break;
      case 'barrow': poly([[0, 0.3], [0.6, 0.3], [0.6, 0], [1, 0.5], [0.6, 1], [0.6, 0.7], [0, 0.7]]); break;
      case 'barrow2': poly([[0, 0.5], [0.25, 0], [0.25, 0.3], [0.75, 0.3], [0.75, 0], [1, 0.5], [0.75, 1], [0.75, 0.7], [0.25, 0.7], [0.25, 1]]); break;
      case 'chevron': poly([[0, 0], [0.7, 0], [1, 0.5], [0.7, 1], [0, 1], [0.3, 0.5]]); break;
      case 'uarrow': poly([[0.5, 0], [1, 0.4], [0.7, 0.4], [0.7, 1], [0.3, 1], [0.3, 0.4], [0, 0.4]]); break;
      case 'f-term': rr(h / 2); break;
      case 'f-doc': P.moveTo(x, y); P.lineTo(x + w, y); P.lineTo(x + w, y + h * 0.85); P.bezierCurveTo(x + w * 0.75, y + h * 0.7, x + w * 0.5, y + h * 1.08, x, y + h * 0.88); P.closePath(); break;
      case 'f-db': { const ry = Math.min(h * 0.14, w * 0.25); P.moveTo(x, y + ry); P.lineTo(x, y + h - ry); P.ellipse(x + w / 2, y + h - ry, w / 2, ry, 0, Math.PI, 0, true); P.lineTo(x + w, y + ry); P.ellipse(x + w / 2, y + ry, w / 2, ry, 0, 0, Math.PI, true); P.closePath(); X.moveTo(x, y + ry); X.ellipse(x + w / 2, y + ry, w / 2, ry, 0, Math.PI, 0, true); break; }
      case 'f-pre': P.rect(x, y, w, h); X.moveTo(x + w * 0.1, y); X.lineTo(x + w * 0.1, y + h); X.moveTo(x + w * 0.9, y); X.lineTo(x + w * 0.9, y + h); break;
      case 'f-manual': poly([[0, 0.25], [1, 0], [1, 1], [0, 1]]); break;
      case 'f-off': poly([[0, 0], [1, 0], [1, 0.65], [0.5, 1], [0, 0.65]]); break;
      case 'f-delay': P.moveTo(x, y); P.lineTo(x + w - h / 2, y); P.ellipse(x + w - h / 2, y + h / 2, h / 2, h / 2, 0, -Math.PI / 2, Math.PI / 2); P.lineTo(x, y + h); P.closePath(); break;
      case 'f-prep': poly([[0.18, 0], [0.82, 0], [1, 0.5], [0.82, 1], [0.18, 1], [0, 0.5]]); break;
      case 'cloud': {
        const c = [[0.25, 0.62, 0.2], [0.4, 0.38, 0.22], [0.62, 0.32, 0.22], [0.8, 0.52, 0.2], [0.62, 0.72, 0.2], [0.38, 0.75, 0.18]];
        P.moveTo(x + w * 0.12, y + h * 0.7);
        P.bezierCurveTo(x - w * 0.05, y + h * 0.6, x + w * 0.05, y + h * 0.3, x + w * 0.25, y + h * 0.35);
        P.bezierCurveTo(x + w * 0.28, y, x + w * 0.6, y - h * 0.02, x + w * 0.65, y + h * 0.22);
        P.bezierCurveTo(x + w * 0.85, y + h * 0.05, x + w * 1.05, y + h * 0.35, x + w * 0.9, y + h * 0.55);
        P.bezierCurveTo(x + w * 1.05, y + h * 0.8, x + w * 0.85, y + h * 1.0, x + w * 0.68, y + h * 0.9);
        P.bezierCurveTo(x + w * 0.55, y + h * 1.05, x + w * 0.3, y + h * 1.02, x + w * 0.28, y + h * 0.88);
        P.bezierCurveTo(x + w * 0.1, y + h * 0.95, x - w * 0.02, y + h * 0.8, x + w * 0.12, y + h * 0.7); P.closePath(); void c; break;
      }
      case 'bubble': { const r = Math.min(w, h) * 0.18, b = y + h * 0.78; P.moveTo(x + r, y); P.arcTo(x + w, y, x + w, b, r); P.arcTo(x + w, b, x, b, r); P.lineTo(x + w * 0.4, b); P.lineTo(x + w * 0.2, y + h); P.lineTo(x + w * 0.25, b); P.arcTo(x, b, x, y, r); P.arcTo(x, y, x + w, y, r); P.closePath(); break; }
      case 'thought': P.ellipse(x + w / 2, y + h * 0.38, w / 2, h * 0.38, 0, 0, Math.PI * 2); X.ellipse(x + w * 0.24, y + h * 0.84, w * 0.06, h * 0.06, 0, 0, Math.PI * 2); X.moveTo(x + w * 0.16, y + h * 0.97); X.ellipse(x + w * 0.13, y + h * 0.97, w * 0.03, h * 0.03, 0, 0, Math.PI * 2); break;
      case 'callout': poly([[0, 0], [1, 0], [1, 0.75], [0.35, 0.75], [0.1, 1], [0.18, 0.75], [0, 0.75]]); break;
      case 'banner': poly([[0, 0.15], [1, 0.15], [0.9, 0.5], [1, 0.85], [0, 0.85], [0.1, 0.5]]); break;
      case 'tag': poly([[0, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0, 1]]); X.ellipse(x + w * 0.74, y + h / 2, Math.min(w, h) * 0.07, Math.min(w, h) * 0.07, 0, 0, Math.PI * 2); break;
      case 'note': poly([[0, 0], [1, 0], [1, 0.78], [0.78, 1], [0, 1]]); X.moveTo(x + w, y + h * 0.78); X.lineTo(x + w * 0.78, y + h * 0.78); X.lineTo(x + w * 0.78, y + h); break;
      case 'check': X.moveTo(x, y + h * 0.55); X.lineTo(x + w * 0.38, y + h); X.lineTo(x + w, y); break;
      case 'xmark': X.moveTo(x, y); X.lineTo(x + w, y + h); X.moveTo(x + w, y); X.lineTo(x, y + h); break;
      case 'brace': X.moveTo(x + w, y); X.quadraticCurveTo(x + w * 0.5, y, x + w * 0.5, y + h * 0.15); X.lineTo(x + w * 0.5, y + h * 0.4); X.quadraticCurveTo(x + w * 0.5, y + h / 2, x, y + h / 2); X.quadraticCurveTo(x + w * 0.5, y + h / 2, x + w * 0.5, y + h * 0.6); X.lineTo(x + w * 0.5, y + h * 0.85); X.quadraticCurveTo(x + w * 0.5, y + h, x + w, y + h); break;
      case 'bracket': X.moveTo(x + w, y); X.lineTo(x, y); X.lineTo(x, y + h); X.lineTo(x + w, y + h); break;
      case 'axes': {
        const cx = x + w / 2, cy = y + h / 2, a = Math.min(10, w * 0.04);
        X.moveTo(x, cy); X.lineTo(x + w, cy); X.moveTo(x + w - a, cy - a * 0.6); X.lineTo(x + w, cy); X.lineTo(x + w - a, cy + a * 0.6);
        X.moveTo(cx, y + h); X.lineTo(cx, y); X.moveTo(cx - a * 0.6, y + a); X.lineTo(cx, y); X.lineTo(cx + a * 0.6, y + a);
        const st = Math.max(14, Math.min(w, h) / 10);
        for (let t = cx + st; t < x + w - a * 1.5; t += st) { X.moveTo(t, cy - 3); X.lineTo(t, cy + 3); }
        for (let t = cx - st; t > x + 2; t -= st) { X.moveTo(t, cy - 3); X.lineTo(t, cy + 3); }
        for (let t = cy - st; t > y + a * 1.5; t -= st) { X.moveTo(cx - 3, t); X.lineTo(cx + 3, t); }
        for (let t = cy + st; t < y + h - 2; t += st) { X.moveTo(cx - 3, t); X.lineTo(cx + 3, t); }
        break;
      }
      case 'numline': {
        const cy = y + h / 2, a = Math.min(10, w * 0.04), n = 10;
        X.moveTo(x, cy); X.lineTo(x + w, cy); X.moveTo(x + a, cy - a * 0.6); X.lineTo(x, cy); X.lineTo(x + a, cy + a * 0.6); X.moveTo(x + w - a, cy - a * 0.6); X.lineTo(x + w, cy); X.lineTo(x + w - a, cy + a * 0.6);
        for (let i = 1; i < n; i++) { const t = x + w * i / n; X.moveTo(t, cy - (i === n / 2 ? 8 : 5)); X.lineTo(t, cy + (i === n / 2 ? 8 : 5)); }
        break;
      }
      case 'wave': for (let i = 0; i <= 60; i++) { const t = i / 60, px = x + t * w, py = y + h / 2 - Math.sin(t * Math.PI * 4) * h / 2; i ? X.lineTo(px, py) : X.moveTo(px, py); } break;
      case 'poly': if (it.pts) poly(it.pts); break;
      case 'blk-lines': case 'blk-grid': case 'blk-dots': case 'blk-hex': case 'blk-iso': case 'blk-check': case 'blk-table': case 'blk-cornell': rr(10); break;
      case 'div-line': X.moveTo(x, y + h / 2); X.lineTo(x + w, y + h / 2); break;
      case 'div-double': X.moveTo(x, y + h / 2 - 3); X.lineTo(x + w, y + h / 2 - 3); X.moveTo(x, y + h / 2 + 3); X.lineTo(x + w, y + h / 2 + 3); break;
      case 'div-dash': X.moveTo(x, y + h / 2); X.lineTo(x + w, y + h / 2); break;
      case 'div-dots': for (let t = x + 4; t <= x + w; t += 14) { X.moveTo(t + 1.5, y + h / 2); X.arc(t, y + h / 2, 1.5, 0, Math.PI * 2); } break;
      case 'div-wave': for (let t = 0; t <= w; t += 3) { const py = y + h / 2 + Math.sin(t / 10) * Math.min(6, h / 3); t ? X.lineTo(x + t, py) : X.moveTo(x, py); } break;
      case 'div-zigzag': for (let t = 0, k = 0; t <= w; t += 10, k++) { const py = y + h / 2 + (k % 2 ? 1 : -1) * Math.min(5, h / 3); t ? X.lineTo(x + t, py) : X.moveTo(x, py); } break;
      case 'div-orn': { const cx = x + w / 2, cy = y + h / 2, d = Math.min(8, h / 2.5); X.moveTo(x, cy); X.lineTo(cx - 3 * d, cy); X.moveTo(cx + 3 * d, cy); X.lineTo(x + w, cy); X.moveTo(cx, cy - d); X.lineTo(cx + d, cy); X.lineTo(cx, cy + d); X.lineTo(cx - d, cy); X.closePath(); X.moveTo(cx - 2 * d + 2, cy); X.arc(cx - 2 * d, cy, 2, 0, Math.PI * 2); X.moveTo(cx + 2 * d + 2, cy); X.arc(cx + 2 * d, cy, 2, 0, Math.PI * 2); break; }
      case 'div-stars': { const cy = y + h / 2; for (let t = x + 10; t <= x + w - 6; t += 28) { for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 2.2 : 5.5; k ? X.lineTo(t + Math.cos(a) * r, cy + Math.sin(a) * r) : X.moveTo(t + Math.cos(a) * r, cy + Math.sin(a) * r); } X.closePath(); } break; }
      default: P.rect(x, y, w, h);
    }
    return { p: P, x: X, even };
  }

  // sólidos: caras visibles (con sombreado) y aristas ocultas
  function solid(it) {
    const { sh } = it, x = it.x, y = it.y, w = it.w, h = it.h, faces = [], hid = new Path2D(), lines = new Path2D();
    const face = (pts, k) => { const p = new Path2D(); pts.forEach(([a, b], i) => i ? p.lineTo(a, b) : p.moveTo(a, b)); p.closePath(); faces.push({ p, k }); };
    const seg = (P, a, b) => { P.moveTo(a[0], a[1]); P.lineTo(b[0], b[1]); };
    if (sh === 'cube' || sh === 'cuboid') {
      const d = Math.min(w, h) * (sh === 'cube' ? 0.3 : 0.25);
      const A = [x, y + d], B = [x + w - d, y + d], C = [x + w - d, y + h], D = [x, y + h], E = [x + d, y], F = [x + w, y], G = [x + w, y + h - d], H = [x + d, y + h - d];
      face([A, B, C, D], 1); face([A, E, F, B], 1.18); face([B, F, G, C], 0.78);
      seg(hid, H, E); seg(hid, H, G); seg(hid, H, D);
    } else if (sh === 'cyl') {
      const ry = Math.min(h * 0.14, w * 0.25), cx = x + w / 2;
      const body = new Path2D(); body.moveTo(x, y + ry); body.lineTo(x, y + h - ry); body.ellipse(cx, y + h - ry, w / 2, ry, 0, Math.PI, 0, true); body.lineTo(x + w, y + ry); body.ellipse(cx, y + ry, w / 2, ry, 0, 0, Math.PI, false); body.closePath();
      faces.push({ p: body, k: 0.92, grad: 1 });
      const top = new Path2D(); top.ellipse(cx, y + ry, w / 2, ry, 0, 0, Math.PI * 2); faces.push({ p: top, k: 1.15 });
      hid.ellipse(cx, y + h - ry, w / 2, ry, 0, Math.PI, 0);
    } else if (sh === 'cone') {
      const ry = Math.min(h * 0.14, w * 0.25), cx = x + w / 2, by = y + h - ry;
      const body = new Path2D(); body.moveTo(cx, y); body.lineTo(x, by); body.ellipse(cx, by, w / 2, ry, 0, Math.PI, 0, true); body.closePath();
      faces.push({ p: body, k: 0.95, grad: 1 });
      hid.ellipse(cx, by, w / 2, ry, 0, Math.PI, 0);
    } else if (sh === 'sphere') {
      const cx = x + w / 2, cy = y + h / 2, p = new Path2D(); p.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
      faces.push({ p, k: 1, radial: 1 });
      lines.ellipse(cx, cy, w / 2, h * 0.14, 0, 0, Math.PI); hid.ellipse(cx, cy, w / 2, h * 0.14, 0, Math.PI, Math.PI * 2);
    } else if (sh === 'hemi') {
      const ry = Math.min(h * 0.22, w * 0.18), cx = x + w / 2, by = y + h - ry, p = new Path2D();
      p.moveTo(x, by); p.ellipse(cx, by, w / 2, h - ry, 0, Math.PI, 0); p.ellipse(cx, by, w / 2, ry, 0, 0, Math.PI); p.closePath();
      faces.push({ p, k: 1, radial: 1 }); hid.ellipse(cx, by, w / 2, ry, 0, Math.PI, 0, true);
    } else if (sh === 'pyr') {
      const T = [x + w * 0.5, y], FL = [x, y + h], FR = [x + w * 0.72, y + h], BR = [x + w, y + h * 0.8], BL = [x + w * 0.28, y + h * 0.8];
      face([T, FL, FR], 1); face([T, FR, BR], 0.78);
      seg(hid, BL, T); seg(hid, BL, FL); seg(hid, BL, BR);
    } else if (sh === 'prism') {
      const d = Math.min(w, h) * 0.3, A = [x, y + h], B = [x + w - d, y + h], C = [x + (w - d) / 2, y + d], A2 = [x + d, y + h - d], B2 = [x + w, y + h - d], C2 = [x + (w - d) / 2 + d, y];
      face([A, B, C], 1); face([B, B2, C2, C], 0.78);
      seg(hid, A, A2); seg(hid, A2, B2); seg(hid, A2, C2);
    } else if (sh === 'tetra') {
      const A = [x, y + h * 0.82], B = [x + w * 0.58, y + h], C = [x + w, y + h * 0.68], D = [x + w * 0.45, y];
      face([A, B, D], 1); face([B, C, D], 0.78); seg(hid, A, C);
    }
    return { faces, hid, lines };
  }

  // ---------- color ----------
  function shade(hex, k) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return hex;
    const n = parseInt(m[1], 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const f = v => Math.max(0, Math.min(255, Math.round(k >= 1 ? v + (255 - v) * (k - 1) * 1.6 : v * k)));
    return `rgb(${f(r)},${f(g)},${f(b)})`;
  }

  // ---------- líneas ----------
  function ctrl(it) {
    const mx = (it.x1 + it.x2) / 2, my = (it.y1 + it.y2) / 2, dx = it.x2 - it.x1, dy = it.y2 - it.y1, L = Math.hypot(dx, dy) || 1;
    const bd = it.bd == null ? L * 0.25 : it.bd;
    return { mx: mx - dy / L * bd, my: my + dx / L * bd, cx: mx - dy / L * bd * 2, cy: my + dx / L * bd * 2 };
  }
  function linePts(it) {
    if (it.sh === 'curve') { const { cx, cy } = ctrl(it), o = []; for (let i = 0; i <= 24; i++) { const t = i / 24, u = 1 - t; o.push([u * u * it.x1 + 2 * u * t * cx + t * t * it.x2, u * u * it.y1 + 2 * u * t * cy + t * t * it.y2]); } return o; }
    if (it.sh === 'elbow') { const mx = (it.x1 + it.x2) / 2; return Math.abs(it.x2 - it.x1) >= Math.abs(it.y2 - it.y1) ? [[it.x1, it.y1], [mx, it.y1], [mx, it.y2], [it.x2, it.y2]] : [[it.x1, it.y1], [it.x1, (it.y1 + it.y2) / 2], [it.x2, (it.y1 + it.y2) / 2], [it.x2, it.y2]]; }
    return [[it.x1, it.y1], [it.x2, it.y2]];
  }
  const heads = it => [it.hs != null ? it.hs : it.sh === 'darrow', it.he != null ? it.he : it.sh === 'arrow' || it.sh === 'darrow'];
  function head(c, tip, from, L) {
    const a = Math.atan2(tip[1] - from[1], tip[0] - from[0]);
    c.beginPath(); c.moveTo(tip[0], tip[1]);
    c.lineTo(tip[0] - L * Math.cos(a - 0.42), tip[1] - L * Math.sin(a - 0.42));
    c.lineTo(tip[0] - L * Math.cos(a + 0.42), tip[1] - L * Math.sin(a + 0.42));
    c.closePath(); c.fill(); c.stroke();
  }

  // ---------- texto dentro de la figura ----------
  function label(c, it) {
    if (!it.tx || it._edit) return;
    const b = textBox(it), z = it.tz || 16;
    c.save(); c.setLineDash([]);
    c.font = `${it.tb ? 700 : 500} ${z}px ${(Items.FONTS[it.f] || Items.FONTS.system)}`;
    c.fillStyle = it.tc || (it.fl && (it.fo || 0) > 0.6 ? '#FFFFFF' : it.c); c.textAlign = 'center'; c.textBaseline = 'middle';
    const lines = []; String(it.tx).split('\n').forEach(par => { let line = ''; par.split(' ').forEach(wd => { const t = line ? line + ' ' + wd : wd; if (c.measureText(t).width > b.w && line) { lines.push(line); line = wd; } else line = t; }); lines.push(line); });
    const lh = z * 1.25, y0 = b.y + b.h / 2 - (lines.length - 1) * lh / 2;
    lines.forEach((l, i) => c.fillText(l, b.x + b.w / 2, y0 + i * lh));
    c.restore();
  }
  function textBox(it) {
    if (isLine(it)) { const m = ctrl(it), mx = it.sh === 'curve' ? m.mx : (it.x1 + it.x2) / 2, my = it.sh === 'curve' ? m.my : (it.y1 + it.y2) / 2; return { x: mx - 80, y: my - 24, w: 160, h: 28 }; }
    const k = { diamond: 0.25, 'f-dec': 0.25, tri: 0.3, ellipse: 0.15, circle: 0.15, cloud: 0.18, star: 0.32, burst: 0.2 }[it.sh] || 0.08;
    let { x, y, w, h } = it;
    if (it.sh === 'tri') { y += h * 0.4; h *= 0.6; }
    if (it.sh === 'bubble' || it.sh === 'callout') h *= 0.76;
    if (SOLID3D.has(it.sh)) { const d = Math.min(w, h) * 0.28; if (it.sh === 'cube' || it.sh === 'cuboid') { y += d; w -= d; h -= d; } }
    return { x: x + w * k, y: y + h * k, w: w * (1 - 2 * k), h: h * (1 - 2 * k) };
  }

  // ---------- dibujo ----------
  function draw(c, it, alpha = 1) {
    c.save();
    c.globalAlpha = alpha; c.lineJoin = 'round'; c.lineCap = 'round';
    c.lineWidth = it.lw || 2.4; c.strokeStyle = it.c || '#1C1C1E'; c.fillStyle = it.c || '#1C1C1E';
    const dash = it.ds || it.sh === 'dashed' ? [Math.max(4, c.lineWidth * 3), Math.max(4, c.lineWidth * 2.4)] : [];
    c.setLineDash(dash);
    if (isLine(it)) {
      const pts = linePts(it), [hs, he] = heads(it), L = Math.max(10, c.lineWidth * 4.2);
      // acorta la línea para que no asome bajo la punta
      const P = pts.map(p => p.slice()), cut = (a, b) => { const d = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, k = Math.min(L * 0.6, d * 0.5) / d; a[0] += (b[0] - a[0]) * k; a[1] += (b[1] - a[1]) * k; };
      if (he) cut(P[P.length - 1], P[P.length - 2]); if (hs) cut(P[0], P[1]);
      c.beginPath(); P.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.stroke();
      c.setLineDash([]); c.lineJoin = 'miter';
      if (he) head(c, pts[pts.length - 1], pts[pts.length - 2], L);
      if (hs) head(c, pts[0], pts[1], L);
    } else if (SOLID3D.has(it.sh)) {
      const s = solid(it), base = it.fl || '';
      for (const f of s.faces) {
        if (base) {
          c.globalAlpha = alpha * (it.fo == null ? 1 : it.fo);
          if (f.radial) { const g = c.createRadialGradient(it.x + it.w * 0.35, it.y + it.h * 0.3, 2, it.x + it.w / 2, it.y + it.h / 2, Math.max(it.w, it.h) * 0.6); g.addColorStop(0, shade(base, 1.45)); g.addColorStop(1, shade(base, 0.8)); c.fillStyle = g; }
          else if (f.grad) { const g = c.createLinearGradient(it.x, 0, it.x + it.w, 0); g.addColorStop(0, shade(base, 0.85)); g.addColorStop(0.35, shade(base, 1.3)); g.addColorStop(1, shade(base, 0.7)); c.fillStyle = g; }
          else c.fillStyle = shade(base, f.k);
          c.fill(f.p); c.globalAlpha = alpha;
        }
        c.stroke(f.p);
      }
      c.stroke(s.lines);
      c.save(); c.setLineDash([5, 4]); c.lineWidth = Math.max(1, c.lineWidth * 0.6); c.globalAlpha = alpha * 0.7; c.stroke(s.hid); c.restore();
    } else {
      const g = geo(it);
      if (it.fl && !STROKE_ONLY.has(it.sh)) { c.globalAlpha = alpha * (it.fo == null ? 1 : it.fo); c.fillStyle = it.fl; c.fill(g.p, g.even ? 'evenodd' : 'nonzero'); c.globalAlpha = alpha; }
      if (it.sh.startsWith('blk-')) { c.save(); c.fillStyle = it.c; c.strokeStyle = it.c; pattern(c, it); c.restore(); }
      if (!STROKE_ONLY.has(it.sh)) c.stroke(g.p);
      if (it.sh === 'div-dash') c.setLineDash([8, 6]);
      if (it.sh === 'div-dots' || it.sh === 'div-stars') { c.fill(g.x); } else c.stroke(g.x);
    }
    label(c, it);
    c.restore();
  }

  // ---------- medidas y edición ----------
  function bbox(it) {
    if (isLine(it)) {
      const pts = linePts(it).concat(it.sh === 'curve' ? [] : []); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      pts.forEach(([a, b]) => { x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, a); y1 = Math.max(y1, b); });
      const m = (it.lw || 2) * 3 + 4; return { x: x0 - m, y: y0 - m, w: x1 - x0 + 2 * m, h: y1 - y0 + 2 * m };
    }
    const m = (it.lw || 2) / 2 + 1;
    return { x: it.x - m, y: it.y - m, w: it.w + 2 * m, h: it.h + 2 * m };
  }
  const hctx = document.createElement('canvas').getContext('2d');
  function hit(it, x, y, r = 4) {
    if (isLine(it)) { const p = linePts(it); for (let i = 0; i < p.length - 1; i++) if (Ink.segDist(x, y, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]) < (it.lw || 2) / 2 + r + 3) return true; return false; }
    if (it.fl || it.tx || SOLID3D.has(it.sh)) { const b = bbox(it); if (x < b.x - r || x > b.x + b.w + r || y < b.y - r || y > b.y + b.h + r) return false; if (SOLID3D.has(it.sh)) return true; }
    const g = geo(it);
    if ((it.fl || it.tx) && hctx.isPointInPath(g.p, x, y)) return true;
    hctx.lineWidth = (it.lw || 2) + r * 2 + 6;
    return hctx.isPointInStroke(g.p, x, y) || hctx.isPointInStroke(g.x, x, y);
  }
  function translate(it, dx, dy) { if (isLine(it)) { it.x1 += dx; it.x2 += dx; it.y1 += dy; it.y2 += dy; } else { it.x += dx; it.y += dy; } }
  function scale(it, ox, oy, k) {
    if (isLine(it)) { it.x1 = ox + (it.x1 - ox) * k; it.x2 = ox + (it.x2 - ox) * k; it.y1 = oy + (it.y1 - oy) * k; it.y2 = oy + (it.y2 - oy) * k; if (it.bd != null) it.bd *= k; }
    else { it.x = ox + (it.x - ox) * k; it.y = oy + (it.y - oy) * k; it.w *= k; it.h *= k; }
    it.lw = (it.lw || 2) * k; if (it.tz) it.tz *= k;
  }
  // puntos de control para editar la figura
  function handles(it) {
    if (isLine(it)) { const o = [['p1', it.x1, it.y1], ['p2', it.x2, it.y2]]; if (it.sh === 'curve') { const m = ctrl(it); o.push(['bd', m.mx, m.my]); } return o; }
    const { x, y, w, h } = it;
    return [['nw', x, y], ['n', x + w / 2, y], ['ne', x + w, y], ['e', x + w, y + h / 2], ['se', x + w, y + h], ['s', x + w / 2, y + h], ['sw', x, y + h], ['w', x, y + h / 2]];
  }
  const snapAng = (x0, y0, x, y) => {
    const a = Math.atan2(y - y0, x - x0), L = Math.hypot(x - x0, y - y0), s = Math.round(a / (Math.PI / 4)) * Math.PI / 4;
    return Math.abs(a - s) < 0.07 ? [x0 + Math.cos(s) * L, y0 + Math.sin(s) * L] : [x, y];
  };
  function dragHandle(it, o, hd, x, y, lock) {
    if (hd === 'p1') { [it.x1, it.y1] = snapAng(it.x2, it.y2, x, y); return; }
    if (hd === 'p2') { [it.x2, it.y2] = snapAng(it.x1, it.y1, x, y); return; }
    if (hd === 'bd') { const mx = (o.x1 + o.x2) / 2, my = (o.y1 + o.y2) / 2, dx = o.x2 - o.x1, dy = o.y2 - o.y1, L = Math.hypot(dx, dy) || 1; it.bd = ((x - mx) * -dy + (y - my) * dx) / L; return; }
    let L = o.x, R = o.x + o.w, T = o.y, B = o.y + o.h;
    if (hd.includes('w')) L = x; if (hd.includes('e')) R = x; if (hd.includes('n')) T = y; if (hd.includes('s')) B = y;
    if ((lock || SQUARE.has(it.sh)) && hd.length === 2) {
      const k = Math.max(Math.abs(R - L) / o.w, Math.abs(B - T) / o.h);
      if (hd.includes('w')) L = R - o.w * k; else R = L + o.w * k;
      if (hd.includes('n')) T = B - o.h * k; else B = T + o.h * k;
    }
    it.x = Math.min(L, R); it.y = Math.min(T, B); it.w = Math.max(6, Math.abs(R - L)); it.h = Math.max(6, Math.abs(B - T));
  }

  // ---------- creación ----------
  function make(sh, x0, y0, x, y, st = {}) {
    const base = { t: 'g', id: uid(), sh, c: st.c || '#1C1C1E', lw: st.lw || 2.4, fl: st.fl || '', fo: st.fo == null ? 1 : st.fo, ds: st.ds ? 1 : 0 };
    if (LINES.has(sh)) { const [x2, y2] = snapAng(x0, y0, x, y); return Object.assign(base, { x1: x0, y1: y0, x2, y2, fl: '' }); }
    let w = x - x0, h = y - y0;
    if (sh.startsWith('div-')) { h = Math.max(16, Math.abs(h)); y0 = Math.min(y0, y) - (Math.abs(y - y0) < 16 ? 8 : 0); return Object.assign(base, { x: Math.min(x0, x), y: y0, w: Math.max(20, Math.abs(w)), h, fl: '' }); }
    if (SQUARE.has(sh) || st.lock) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
    return Object.assign(base, { x: Math.min(x0, x0 + w), y: Math.min(y0, y0 + h), w: Math.max(6, Math.abs(w)), h: Math.max(6, Math.abs(h)) });
  }
  function makeAt(sh, cx, cy, st) {
    if (LINES.has(sh)) return make(sh, cx - 80, cy, cx + 80, cy, st);
    const wide = ['f-proc', 'f-term', 'f-data', 'f-doc', 'f-pre', 'f-manual', 'f-prep', 'f-delay', 'rect', 'rrect', 'ellipse', 'para', 'trap', 'barrow', 'barrow2', 'banner', 'bubble', 'callout', 'cloud', 'tag', 'cuboid', 'numline', 'wave', 'semi'];
    if (sh.startsWith('div-')) return make(sh, cx - 300, cy - 12, cx + 300, cy + 12, st);
    if (sh.startsWith('blk-')) return make(sh, cx - 220, cy - 120, cx + 220, cy + 120, st);
    const w = wide.includes(sh) ? 170 : 120, h = sh === 'numline' || sh === 'wave' ? 50 : wide.includes(sh) ? 100 : 120;
    return make(sh, cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2, st);
  }

  // ---------- conectores ----------
  const anchorable = it => it && it.t === 'g' && !isLine(it) && !STROKE_ONLY.has(it.sh);
  function edge(b, tx, ty, gap = 4) {
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2, dx = tx - cx, dy = ty - cy;
    if (!dx && !dy) return [cx, cy];
    let k;
    if (OVAL.has(b.sh)) k = 1 / Math.sqrt((dx * dx) / (b.w * b.w / 4) + (dy * dy) / (b.h * b.h / 4));
    else if (b.sh === 'diamond' || b.sh === 'f-dec') k = 1 / (Math.abs(dx) / (b.w / 2) + Math.abs(dy) / (b.h / 2));
    else k = Math.min(Math.abs(b.w / 2 / (dx || 1e-9)), Math.abs(b.h / 2 / (dy || 1e-9)));
    const L = Math.hypot(dx, dy), g = gap / L;
    return [cx + dx * (k + g), cy + dy * (k + g)];
  }
  function sideOf(b, tx, ty) { // punto medio del lado que mira hacia el destino (conector en ángulo)
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2, dx = tx - cx, dy = ty - cy;
    return Math.abs(dx) / b.w > Math.abs(dy) / b.h ? [dx > 0 ? b.x + b.w + 4 : b.x - 4, cy] : [cx, dy > 0 ? b.y + b.h + 4 : b.y - 4];
  }
  function attach(items, only) {
    const byId = new Map(items.map(i => [i.id, i]));
    let n = 0;
    for (const ln of items) {
      if (ln.t !== 'g' || !isLine(ln) || !(ln.a || ln.b)) continue;
      if (only && !only.has(ln)) continue;
      const A = byId.get(ln.a), B = byId.get(ln.b);
      if (ln.a && !A) delete ln.a; if (ln.b && !B) delete ln.b;
      const ca = A ? [A.x + A.w / 2, A.y + A.h / 2] : [ln.x1, ln.y1], cb = B ? [B.x + B.w / 2, B.y + B.h / 2] : [ln.x2, ln.y2];
      const f = ln.sh === 'elbow' ? sideOf : edge;
      if (A) [ln.x1, ln.y1] = f(A, cb[0], cb[1]);
      if (B) [ln.x2, ln.y2] = f(B, ca[0], ca[1]);
      n++;
    }
    return n;
  }
  const linksOf = (items, sel) => { const ids = new Set(sel.map(i => i.id)); return items.filter(i => i.t === 'g' && isLine(i) && !sel.includes(i) && (ids.has(i.a) || ids.has(i.b))); };
  const anchorAt = (items, x, y, not) => [...items].reverse().find(i => i !== not && anchorable(i) && x >= i.x - 6 && x <= i.x + i.w + 6 && y >= i.y - 6 && y <= i.y + i.h + 6);

  // ---------- plantillas: lluvia de ideas y diagrama de flujo ----------
  const PAL = ['#3F66F0', '#E8590C', '#0B7A75', '#E64980', '#7950F2', '#2F9E44', '#F59F00', '#1098AD'];
  function conn(a, b, c, sh = 'line', extra = {}) { return Object.assign({ t: 'g', id: uid(), sh, a: a.id, b: b.id, x1: 0, y1: 0, x2: 0, y2: 0, c, lw: 2.2, fl: '', fo: 1 }, extra); }
  function mindmap(cx, cy, n = 6, title = 'Idea central') {
    const hub = { t: 'g', id: uid(), sh: 'ellipse', x: cx - 115, y: cy - 58, w: 230, h: 116, c: '#2B2D42', lw: 3, fl: '#2B2D42', fo: 1, tx: title, tz: 20, tb: 1, tc: '#FFFFFF' };
    const out = [hub], R = 255;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + i * Math.PI * 2 / n, col = PAL[i % PAL.length];
      const nx = cx + Math.cos(a) * R * 1.25, ny = cy + Math.sin(a) * R * 0.8;
      const node = { t: 'g', id: uid(), sh: 'rrect', x: nx - 80, y: ny - 34, w: 160, h: 68, c: col, lw: 2.4, fl: col, fo: 0.14, tx: 'Idea ' + (i + 1), tz: 16, tc: col };
      out.push(node, conn(hub, node, col, 'curve', { bd: 18 * (i % 2 ? 1 : -1), lw: 3 }));
    }
    attach(out); return out;
  }
  function flowchart(cx, y) {
    const st = (sh, x, yy, w, h, tx, col = '#1C1C1E', extra = {}) => Object.assign({ t: 'g', id: uid(), sh, x: x - w / 2, y: yy, w, h, c: col, lw: 2.4, fl: col, fo: 0.1, tx, tz: 15 }, extra);
    const a = st('f-term', cx, y, 170, 56, 'Inicio', '#2F9E44');
    const b = st('f-data', cx, y + 100, 190, 64, 'Datos de entrada', '#1098AD');
    const c = st('f-proc', cx, y + 210, 190, 70, 'Proceso', '#3F66F0');
    const d = st('f-dec', cx, y + 330, 200, 120, '¿Condición?', '#F59F00');
    const e = st('f-proc', cx + 250, y + 355, 160, 70, 'Corregir', '#E8590C');
    const f = st('f-term', cx, y + 510, 170, 56, 'Fin', '#E64980');
    const k = '#495057', items = [a, b, c, d, e, f,
      conn(a, b, k, 'arrow'), conn(b, c, k, 'arrow'), conn(c, d, k, 'arrow'),
      conn(d, f, k, 'arrow', { tx: 'Sí', tz: 14 }), conn(d, e, k, 'arrow', { tx: 'No', tz: 14 }), conn(e, c, k, 'elbow', { he: true })];
    attach(items); return items;
  }
  // nodo hijo conectado (para seguir la lluvia de ideas o el diagrama)
  function child(items, parent, pageW, pageH) {
    const w = parent.w, h = parent.h, g = 70, cx = parent.x + w / 2, cy = parent.y + h / 2;
    const tries = [[w + g, 0], [0, h + g], [-(w + g), 0], [0, -(h + g)], [w + g, h + g], [-(w + g), h + g], [w + g, -(h + g)], [-(w + g), -(h + g)]];
    const free = (x, y) => x > 8 && y > 8 && x + w < pageW - 8 && y + h < pageH - 8 && !items.some(i => { if (i.t === 'g' && isLine(i)) return false; const b = Items.bbox(i); return x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + h > b.y; });
    let pos = tries.map(([dx, dy]) => [parent.x + dx, parent.y + dy]).find(([x, y]) => free(x, y)) || [parent.x + w + g, parent.y];
    const node = Object.assign(JSON.parse(JSON.stringify(parent, (k, v) => k === '_edit' ? undefined : v)), { id: uid(), x: pos[0], y: pos[1], tx: '' });
    if (node.sh === 'f-term' || node.sh === 'f-dec') node.sh = 'f-proc';
    const ln = conn(parent, node, parent.c, parent.sh.startsWith('f-') ? 'arrow' : 'line', { lw: Math.max(2, (parent.lw || 2) * 0.9) });
    void cx; void cy; attach([parent, node, ln]);
    return [node, ln];
  }

  // ---------- reconocimiento de trazos a mano alzada ----------
  function rdp(pts, eps) {
    if (pts.length < 3) return pts;
    let dmax = 0, idx = 0; const a = pts[0], b = pts[pts.length - 1];
    for (let i = 1; i < pts.length - 1; i++) { const d = Ink.segDist(pts[i][0], pts[i][1], a[0], a[1], b[0], b[1]); if (d > dmax) { dmax = d; idx = i; } }
    if (dmax > eps) { const l = rdp(pts.slice(0, idx + 1), eps), r = rdp(pts.slice(idx), eps); return l.slice(0, -1).concat(r); }
    return [a, b];
  }
  // remuestrea a distancia uniforme (las estadísticas no dependen de la velocidad del trazo)
  function resample(pts, step) {
    const out = [pts[0]]; let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      let [ax, ay] = pts[i - 1]; const [bx, by] = pts[i]; let d = Math.hypot(bx - ax, by - ay);
      while (acc + d >= step && d > 0) { const t = (step - acc) / d; ax += (bx - ax) * t; ay += (by - ay) * t; out.push([ax, ay]); d = Math.hypot(bx - ax, by - ay); acc = 0; }
      acc += d;
    }
    return out;
  }
  // ejes principales (para figuras inclinadas)
  function pca(pts) {
    let mx = 0, my = 0; pts.forEach(([x, y]) => { mx += x; my += y; }); mx /= pts.length; my /= pts.length;
    let a = 0, b = 0, c = 0; pts.forEach(([x, y]) => { const dx = x - mx, dy = y - my; a += dx * dx; b += dx * dy; c += dy * dy; });
    const th = 0.5 * Math.atan2(2 * b, a - c), co = Math.cos(th), si = Math.sin(th);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    pts.forEach(([x, y]) => { const u = (x - mx) * co + (y - my) * si, v = -(x - mx) * si + (y - my) * co; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); });
    const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
    return { th, co, si, cx: mx + cu * co - cv * si, cy: my + cu * si + cv * co, a: (u1 - u0) / 2, b: (v1 - v0) / 2 };
  }
  // cierra el trazo aunque se pase del punto de inicio: busca dónde se cruzan el principio y el final
  function closeLoop(pts, diag) {
    const n = pts.length, k = Math.floor(n * 0.4);
    let best = Infinity, bi = 0, bj = n - 1;
    for (let i = 0; i < k; i++) for (let j = n - 1; j >= n - k; j--) { const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]); if (d < best) { best = d; bi = i; bj = j; } }
    return best < diag * 0.22 && bj - bi > n * 0.5 ? pts.slice(bi, bj + 1) : null;
  }
  const polyFrom = (v, st) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; v.forEach(([a, b]) => { x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, a); y1 = Math.max(y1, b); });
    const bw = x1 - x0 || 1, bh = y1 - y0 || 1;
    return Object.assign(make('rect', x0, y0, x1, y1, st), { sh: 'poly', x: x0, y: y0, w: bw, h: bh, pts: v.map(([a, b]) => [(a - x0) / bw, (b - y0) / bh]) });
  };
  // strict: modo automático; si no, al mantener el lápiz (más permisivo)
  function fromStroke(s, strict) {
    const p = s.p, n0 = p.length / 3; if (n0 < 6 || s.k === 'marker') return null;
    let raw = []; let len = 0;
    for (let i = 0; i < n0; i++) { raw.push([p[i * 3], p[i * 3 + 1]]); if (i) len += Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]); }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    raw.forEach(([a, b]) => { x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, a); y1 = Math.max(y1, b); });
    const diag = Math.hypot(x1 - x0, y1 - y0); if (diag < (strict ? 36 : 14)) return null;
    const first = raw[0], last = raw[n0 - 1], chord = Math.hypot(last[0] - first[0], last[1] - first[1]);
    const st = { c: s.c, lw: s.w };
    if (chord / len > (strict ? 0.95 : 0.92)) return make('line', first[0], first[1], last[0], last[1], st);
    const pts = resample(raw, Math.max(2, diag / 90));
    const loop = closeLoop(pts, diag) || (chord < diag * 0.3 ? pts : null);
    if (!loop) {
      if (strict) return null;
      const simp = rdp(pts, diag * 0.06);
      if (simp.length === 4) {
        const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]), [A, B, C, D] = simp;
        if (d(A, B) > 2.5 * d(B, C) && d(B, C) > 0 && Math.abs(d(B, C) - d(C, D)) < d(A, B) * 0.3) return make('arrow', A[0], A[1], B[0], B[1], st);
      }
      return null;
    }
    const n = loop.length;
    // elipse (también inclinada)
    const E = pca(loop), ea = Math.max(1, E.a), eb = Math.max(1, E.b);
    let ell = 0; loop.forEach(([x, y]) => { const u = (x - E.cx) * E.co + (y - E.cy) * E.si, v = -(x - E.cx) * E.si + (y - E.cy) * E.co; ell += Math.abs(Math.hypot(u / ea, v / eb) - 1); });
    ell = ell / n * (ea + eb) / 2 / diag;
    // polígono
    let v = rdp(loop, diag * 0.075);
    if (v.length > 2 && Math.hypot(v[0][0] - v[v.length - 1][0], v[0][1] - v[v.length - 1][1]) < diag * 0.25) v.pop();
    v = v.filter((q, i) => !i || Math.hypot(q[0] - v[i - 1][0], q[1] - v[i - 1][1]) > diag * 0.09);
    // quita vértices casi alineados (p. ej. donde empezó o terminó el trazo, a mitad de un lado)
    for (let changed = true; changed && v.length > 3;) {
      changed = false;
      for (let i = 0; i < v.length; i++) {
        const a = v[(i - 1 + v.length) % v.length], b = v[i], c = v[(i + 1) % v.length];
        const t = Math.abs(Math.atan2(c[1] - b[1], c[0] - b[0]) - Math.atan2(b[1] - a[1], b[0] - a[0]));
        if (Math.min(t, 2 * Math.PI - t) < 0.38) { v.splice(i, 1); changed = true; break; }
      }
    }
    let pe = Infinity;
    if (v.length >= 3) { pe = 0; loop.forEach(([a, b]) => { let m = Infinity; for (let i = 0; i < v.length; i++) { const q = v[i], r = v[(i + 1) % v.length]; m = Math.min(m, Ink.segDist(a, b, q[0], q[1], r[0], r[1])); } pe += m; }); pe = pe / n / diag; }
    const lim = strict ? 0.06 : 0.09, elim = strict ? 0.09 : 0.14;
    const axisAligned = th => Math.abs(Math.sin(2 * th)) < 0.22;
    if (v.length >= 3 && v.length <= 8 && pe < lim && pe < ell * (v.length <= 4 ? 0.9 : 0.55) && !(v.length >= 7 && ell < elim)) {
      const bw = x1 - x0, bh = y1 - y0, cx = x0 + bw / 2, cy = y0 + bh / 2;
      const box = sh => make(sh, ...(() => { let X0 = Infinity, Y0 = Infinity, X1 = -Infinity, Y1 = -Infinity; v.forEach(([a, b]) => { X0 = Math.min(X0, a); Y0 = Math.min(Y0, b); X1 = Math.max(X1, a); Y1 = Math.max(Y1, b); }); return [X0, Y0, X1, Y1]; })(), st);
      if (v.length === 4) {
        const mids = [[cx, y0], [x1, cy], [cx, y1], [x0, cy]];
        if (v.every(q => mids.some(m => Math.hypot(q[0] - m[0], q[1] - m[1]) < diag * 0.15))) return make('diamond', x0, y0, x1, y1, st);
        const ang = i => { const a = v[(i + 3) % 4], b = v[i], c = v[(i + 1) % 4], u = [a[0] - b[0], a[1] - b[1]], w = [c[0] - b[0], c[1] - b[1]]; return Math.abs((u[0] * w[0] + u[1] * w[1]) / (Math.hypot(...u) * Math.hypot(...w) || 1)); };
        if ([0, 1, 2, 3].every(i => ang(i) < 0.33)) {
          // rectángulo: recto si está casi alineado, si no, rectángulo inclinado perfecto
          const R = pca(v.concat(loop));
          if (axisAligned(R.th)) { const g = box('rect'); return Math.abs(g.w - g.h) / Math.max(g.w, g.h) < 0.1 ? Object.assign(g, { sh: 'square' }) : g; }
          const c4 = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([su, sv]) => [R.cx + su * R.a * R.co - sv * R.b * R.si, R.cy + su * R.a * R.si + sv * R.b * R.co]);
          return polyFrom(c4, st);
        }
      }
      if (v.length === 3) {
        const top = v.reduce((a, b) => b[1] < a[1] ? b : a);
        if (Math.abs(top[0] - cx) < bw * 0.15 && v.filter(q => q !== top).every(q => Math.abs(q[1] - y1) < bh * 0.15)) return box('tri');
      }
      if (v.length >= 5) {
        const rs = v.map(q => Math.hypot((q[0] - cx) / (bw / 2 || 1), (q[1] - cy) / (bh / 2 || 1))), mean = rs.reduce((a, b) => a + b) / rs.length;
        if (rs.every(r => Math.abs(r - mean) < 0.18) && { 5: 1, 6: 1, 8: 1 }[v.length]) return box({ 5: 'pent', 6: 'hex', 8: 'oct' }[v.length]);
      }
      return polyFrom(v, st);
    }
    if (ell < elim) {
      if (Math.abs(ea - eb) / Math.max(ea, eb) < 0.13) { const r = (ea + eb) / 2; return make('circle', E.cx - r, E.cy - r, E.cx + r, E.cy + r, st); }
      if (axisAligned(E.th)) { const A = Math.abs(E.co) > 0.7 ? ea : eb, B = Math.abs(E.co) > 0.7 ? eb : ea; return make('ellipse', E.cx - A, E.cy - B, E.cx + A, E.cy + B, st); }
      // elipse inclinada: contorno suave de 72 puntos
      const o = []; for (let i = 0; i < 72; i++) { const t = i / 72 * Math.PI * 2, u = Math.cos(t) * ea, w = Math.sin(t) * eb; o.push([E.cx + u * E.co - w * E.si, E.cy + u * E.si + w * E.co]); }
      return polyFrom(o, st);
    }
    return null;
  }

  // ---------- vista previa para la biblioteca ----------
  function preview(sh, size = 44, color = '#3A3A3C') {
    const c = document.createElement('canvas'), d = devicePixelRatio || 1; c.width = c.height = size * d; c.style.width = c.style.height = size + 'px';
    const x = c.getContext('2d'); x.scale(d, d);
    const m = 7, it = LINES.has(sh) ? make(sh, m, size - m, size - m, m, { c: color, lw: 1.8 }) : Object.assign(make(sh, m, m + (SQUARE.has(sh) ? 0 : 5), size - m, size - m - (SQUARE.has(sh) ? 0 : 5), { c: color, lw: 1.6 }), { fl: SOLID3D.has(sh) ? '#9DB4FF' : '', fo: 1 });
    if (sh === 'curve') it.bd = 8;
    if (sh.startsWith('div-')) Object.assign(it, { x: 3, y: size / 2 - 8, w: size - 6, h: 16 });
    if (sh === 'poly') it.pts = [[0, 0.3], [0.6, 0], [1, 0.6], [0.4, 1]];
    draw(x, it); return c;
  }

  return { CATS, NAMES, LINES, SOLID3D, isLine, draw, bbox, hit, translate, scale, handles, dragHandle, make, makeAt, attach, linksOf, anchorAt, anchorable, mindmap, flowchart, child, fromStroke, preview, textBox, PAL };
})();
