// Trazo — pegatinas: paquetes temáticos, viñetas numeradas, etiquetas, recientes, favoritas y "mis pegatinas"
'use strict';

const Stickers = (() => {
  const PACKS = [
    ['Amigos alegres', '🐱', '🐱 🐶 🦊 🐻 🐼 🐨 🐰 🦁 🐯 🐸 🐧 🦉 🐢 🦄 🐝 🦋 🐙 🐳 🐹 🦔'],
    ['Medicina', '🩺', '🩺 💊 💉 🩹 🫀 🫁 🧠 🦷 🦴 🧬 🦠 🩸 🧫 🔬 🏥 🚑 🌡️ 🧪 🩻 ⚕️'],
    ['Estudio', '📚', '📚 📖 ✏️ 🖊️ 📝 📎 📌 📐 📏 💡 🎓 🗂️ 🧮 🖍️ 🔖 💻 🎒 🏆 🧾 🗒️'],
    ['Planificación', '📅', '📅 🗓️ ⏰ ⏳ ✅ ☑️ ⭐ 🔥 🎯 📍 💼 ☕ 🌙 ☀️ 🔔 🚀 💪 🎉 🧘 🏃'],
    ['Emociones', '😊', '😀 😊 😍 🤩 😎 🤓 🤔 😴 😅 😭 😡 🥳 😇 🙌 👍 👏 ❤️ 💯 ✨ 💥'],
    ['Naturaleza', '🌸', '🌸 🌷 🌻 🌿 🍀 🍁 🌵 🍄 🌈 ⛅ ❄️ 🌊 🌍 🪴 🌳 🐚 🌼 🌙 ⭐ 🔆'],
    ['Comida', '🍎', '🍎 🍓 🍋 🥑 🥐 🍕 🍔 🍣 🍩 🍪 🧁 🍫 ☕ 🧋 🍵 🥗 🍉 🍒 🥕 🍦'],
    ['Viajes', '✈️', '✈️ 🚗 🚲 🚆 🗺️ 🧳 🏖️ 🏔️ 🏕️ 🗽 🗼 🎡 📸 🎫 🌅 ⛵ 🏝️ 🧭 🏛️ 🚁'],
  ];
  const BADGES = [['Importante', '#E03131'], ['Urgente', '#C2255C'], ['Repasar', '#F08C00'], ['Examen', '#7048E8'], ['Hecho', '#2F9E44'], ['Pendiente', '#1971C2'], ['Idea', '#F59F00'], ['Pregunta', '#0C8599'], ['Ojo', '#E8590C'], ['Clave', '#5C7CFA'], ['Turno', '#495057'], ['Paciente', '#D6336C']];
  const NUM_COLORS = ['#868E96', '#F783AC', '#74C0FC', '#8CE99A', '#FFD43B', '#B197FC'];
  const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

  // ---------- dibujo ----------
  function outline(src, r, color = '#FFFFFF') {
    // contorno blanco tipo troquel alrededor de la figura
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const x = c.getContext('2d'), sil = document.createElement('canvas'); sil.width = src.width; sil.height = src.height;
    const s = sil.getContext('2d'); s.drawImage(src, 0, 0); s.globalCompositeOperation = 'source-in'; s.fillStyle = color; s.fillRect(0, 0, sil.width, sil.height);
    x.shadowColor = 'rgba(0,0,0,.22)'; x.shadowBlur = r * 0.9; x.shadowOffsetY = r * 0.3;
    for (let a = 0; a < 16; a++) x.drawImage(sil, Math.cos(a / 8 * Math.PI) * r, Math.sin(a / 8 * Math.PI) * r);
    x.shadowColor = 'transparent'; x.drawImage(src, 0, 0);
    return c;
  }
  function render(d, S = 240) {
    const c = document.createElement('canvas'); c.width = c.height = S;
    const x = c.getContext('2d'); x.textAlign = 'center'; x.textBaseline = 'middle';
    if (d.k === 'e') {
      x.font = `${S * 0.66}px ${EMOJI_FONT}`; x.fillText(d.v, S / 2, S / 2 + S * 0.04);
      return outline(c, S * 0.035);
    }
    if (d.k === 'n') {
      const col = NUM_COLORS[(d.v - 1) % NUM_COLORS.length], m = S * 0.12;
      x.fillStyle = col; x.beginPath();
      // borde irregular tipo cinta washi
      const pts = []; for (let i = 0; i <= 12; i++) pts.push([m + (S - 2 * m) * i / 12, m + (i % 2 ? 3 : -2)]);
      for (let i = 0; i <= 12; i++) pts.push([S - m + (i % 2 ? 3 : -2), m + (S - 2 * m) * i / 12]);
      for (let i = 12; i >= 0; i--) pts.push([m + (S - 2 * m) * i / 12, S - m + (i % 2 ? -3 : 2)]);
      for (let i = 12; i >= 0; i--) pts.push([m + (i % 2 ? -3 : 2), m + (S - 2 * m) * i / 12]);
      pts.forEach(([a, b], i) => i ? x.lineTo(a, b) : x.moveTo(a, b)); x.closePath(); x.globalAlpha = 0.92; x.fill(); x.globalAlpha = 1;
      x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = S * 0.02; x.strokeRect(m + S * 0.05, m + S * 0.05, S - 2 * m - S * 0.1, S - 2 * m - S * 0.1);
      x.fillStyle = '#FFFFFF'; x.font = `700 ${S * 0.34}px "Avenir Next", -apple-system, sans-serif`; x.fillText(String(d.v).padStart(2, '0'), S / 2, S / 2 + S * 0.02);
      return c;
    }
    if (d.k === 'b') {
      c.width = S * 2; c.height = S * 0.7; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = `800 ${S * 0.26}px "Avenir Next", -apple-system, sans-serif`;
      const tw = Math.min(c.width - S * 0.2, x.measureText(d.v.toUpperCase()).width + S * 0.36), h = S * 0.44, x0 = (c.width - tw) / 2, y0 = (c.height - h) / 2;
      x.fillStyle = d.c; x.beginPath(); x.roundRect ? x.roundRect(x0, y0, tw, h, h / 2) : x.rect(x0, y0, tw, h); x.fill();
      x.fillStyle = '#FFFFFF'; x.fillText(d.v.toUpperCase(), c.width / 2, c.height / 2 + S * 0.01);
      return outline(c, S * 0.025);
    }
    return c;
  }
  const blobOf = d => d.k === 'm' ? Blobs.get(d.id) : UI.canvasBlob(render(d), 'image/png');

  // ---------- almacenamiento ----------
  const same = (a, b) => a.k === b.k && a.v === b.v && a.id === b.id;
  async function list(key) { return (await KV.get(key)) || []; }
  async function pushRecent(d) { const r = (await list('stkRecent')).filter(x => !same(x, d)); r.unshift(d); await KV.set('stkRecent', r.slice(0, 24)); }
  async function toggleFav(d) { let f = await list('stkFav'); const on = f.some(x => same(x, d)); f = on ? f.filter(x => !same(x, d)) : [d].concat(f); await KV.set('stkFav', f); UI.toast(on ? 'Quitada de favoritas' : 'Agregada a favoritas'); }
  async function addMine(blob) { const id = await Blobs.put(blob); const m = await list('stkMine'); m.unshift(id); await KV.set('stkMine', m); UI.toast('Guardada en Mis pegatinas'); }

  // ---------- panel ----------
  async function open(onPick) {
    const { h, icon } = UI;
    let tab = 'all';
    const tabs = h('div', { class: 'stk-tabs' }), body = h('div', { class: 'stk-body' });
    const L = UI.layer(h('div', { class: 'stk' },
      h('div', { class: 'dlg-head' }, h('button', { class: 'ib', onclick: () => L.close(), html: icon('close') }), h('h3', {}, 'Pegatinas'), h('span', { class: 'stk-hint' }, 'Mantén para favorita')),
      tabs, body), { cls: 'center' });
    const pick = async d => { L.close(); const b = await blobOf(d); if (!b) return; pushRecent(d); onPick(b, d); };
    const cell = d => {
      let el;
      if (d.k === 'e') el = h('button', { class: 'stk-i emo' }, d.v);
      else if (d.k === 'm') { el = h('button', { class: 'stk-i' }); Blobs.get(d.id).then(b => b && el.append(h('img', { src: URL.createObjectURL(b) }))); }
      else { el = h('button', { class: 'stk-i' + (d.k === 'b' ? ' wide' : '') }); const cv = render(d, 120); cv.className = 'cv'; el.append(cv); }
      let t, long = false;
      el.addEventListener('pointerdown', () => { long = false; t = setTimeout(() => { long = true; menuFor(el, d); }, 520); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => el.addEventListener(ev, () => clearTimeout(t)));
      el.addEventListener('contextmenu', e => { e.preventDefault(); clearTimeout(t); long = true; menuFor(el, d); });
      el.addEventListener('click', () => { if (!long) pick(d); });
      return el;
    };
    const menuFor = async (el, d) => {
      const fav = (await list('stkFav')).some(x => same(x, d));
      UI.menu(el, [{ t: fav ? 'Quitar de favoritas' : 'Agregar a favoritas', i: 'star', fn: () => toggleFav(d).then(draw) },
        d.k === 'm' ? { t: 'Eliminar de Mis pegatinas', i: 'trash', danger: true, fn: async () => { await KV.set('stkMine', (await list('stkMine')).filter(x => x !== d.id)); draw(); } } : null]);
    };
    const section = (title, items, key, empty) => h('section', {},
      h('div', { class: 'stk-sh' }, h('h4', {}, title), key && items.length > 6 && tab === 'all' ? h('button', { class: 'ib sm', onclick: () => { tab = key; draw(); }, html: icon('chev-right') }) : null),
      items.length ? h('div', { class: 'stk-row' + (tab === 'all' ? ' one' : '') }, ...items.map(cell)) : h('p', { class: 'stk-empty' }, empty || 'Nada por aquí todavía'));
    const packItems = p => p[2].split(' ').map(v => ({ k: 'e', v }));
    const nums = () => Array.from({ length: 12 }, (_, i) => ({ k: 'n', v: i + 1 }));
    const badges = () => BADGES.map(([v, c]) => ({ k: 'b', v, c }));
    async function draw() {
      const [rec, fav, mine] = await Promise.all([list('stkRecent'), list('stkFav'), list('stkMine')]);
      const mineD = mine.map(id => ({ k: 'm', id }));
      tabs.innerHTML = '';
      const T = (key, content, title) => h('button', { class: 'stk-t' + (tab === key ? ' on' : ''), title, onclick: () => { tab = key; draw(); } }, content);
      tabs.append(T('all', h('span', { html: icon('grid') }), 'Todo'), T('rec', h('span', { html: icon('clock') }), 'Recientes'), T('mine', h('span', { html: icon('user') }), 'Mis pegatinas'), T('fav', h('span', { html: icon('star') }), 'Favoritas'),
        T('num', h('b', { class: 'stk-num' }, '01'), 'Viñetas'), T('badge', h('b', { class: 'stk-num tag' }, 'Aa'), 'Etiquetas'), ...PACKS.map((p, i) => T('p' + i, h('span', { class: 'emo' }, p[1]), p[0])));
      body.innerHTML = '';
      const all = tab === 'all';
      if (all || tab === 'rec') body.append(section('Recientes', rec, 'rec', 'Las pegatinas que uses aparecerán aquí'));
      if (all || tab === 'mine') body.append(section('Mis pegatinas', mineD, 'mine', 'Selecciona algo con el lazo y toca «Pegatina» para guardarlo aquí'));
      if (all && fav.length || tab === 'fav') body.append(section('Favoritas', fav, 'fav', 'Mantén presionada una pegatina para marcarla'));
      if (all || tab === 'num') body.append(section('Agenda de viñetas', nums(), 'num'));
      if (all || tab === 'badge') body.append(section('Etiquetas', badges(), 'badge'));
      PACKS.forEach((p, i) => { if (all || tab === 'p' + i) body.append(section(p[0], packItems(p), 'p' + i)); });
      body.scrollTop = 0;
    }
    draw();
  }

  return { open, addMine, render };
})();
