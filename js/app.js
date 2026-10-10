// Trazo — biblioteca: inicio, notas, carpetas, galería de plantillas, búsqueda, ajustes y bloqueo
'use strict';

const App = (() => {
  const { $, $$, h, icon, toast, menu, esc } = UI;
  const FOLDER_COLORS = ['#3B2FC9', '#24318F', '#2F5BEA', '#2E7F8C', '#1E5B4B', '#3A8F3A', '#A61E4D', '#E8590C', '#F2A93B', '#C92A2A', '#8E2B1F', '#6A7B8C', '#E64980', '#7950F2', '#F7E066', '#12B886'];
  let view = 'home', tab = 'all', folders = [], metas = [], query = '', selecting = null, galTab = 'discover', galQ = '', myTpls = [];

  // ---------- datos ----------
  async function load() {
    metas = await DB.all('meta');
    folders = (await KV.get('folders')) || [];
  }
  const live = () => metas.filter(m => !m.deleted);
  const folderOf = id => folders.find(f => f.id === id);
  async function saveFolders() { await KV.set('folders', folders); }
  function titleNow() {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return (Settings.titleFormat || 'Nota {fecha} {hora}').replace('{fecha}', `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`).replace('{hora}', `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`);
  }
  async function createNote({ title, folder, paper, pages, open = true, yt, size, orient } = {}) {
    const id = uid(), now = Date.now();
    paper = paper || JSON.parse(JSON.stringify(Settings.paper));
    if (Paper.T[paper.tpl] && Paper.T[paper.tpl].param && !paper.p) paper.p = Paper.T[paper.tpl].param();
    const [w, hh] = pageSize(size, orient);
    const note = { id, title: title || titleNow(), created: now, updated: now, paper, pages: pages || [{ id: uid(), w, h: hh, paper: JSON.parse(JSON.stringify(paper)), items: [] }], recs: [] };
    if (yt) note.yt = yt;
    const meta = { id, title: note.title, folder: folder || (view.startsWith('folder:') ? view.slice(7) : null), fav: false, created: now, updated: now, opened: now, deleted: null, pages: note.pages.length, thumb: '' };
    await DB.put('notes', note); await DB.put('meta', meta);
    metas.push(meta);
    if (open) openNote(id);
    return note;
  }
  function openNote(id) {
    Editor.open(id, async () => { await load(); render(); });
  }
  async function newNote() { await createNote(); }

  // ---------- estructura ----------
  function shell() {
    document.body.append(
      h('div', { id: 'app' },
        h('aside', { id: 'side' }),
        h('main', { id: 'main' }, h('header', { id: 'top' }), h('div', { id: 'content' }))),
      h('div', { id: 'toast' }));
    window.addEventListener('resize', () => { if (!Editor.isOpen()) renderTop(); });
  }
  function renderSide() {
    const s = $('#side'); s.innerHTML = '';
    const counts = {}; live().forEach(m => { if (m.folder) counts[m.folder] = (counts[m.folder] || 0) + 1; });
    const nav = (v, ic, t) => h('button', { class: 'nav' + (view === v ? ' on' : ''), onclick: () => go(v) }, h('span', { html: icon(ic) }), t);
    const trashN = metas.filter(m => m.deleted).length;
    s.append(
      h('div', { class: 'side-top' }, h('button', { class: 'ib', title: 'Ajustes', onclick: () => settings(), html: icon('gear') }), UI.isPhone() ? h('button', { class: 'ib', onclick: () => document.body.classList.remove('drawer'), html: icon('close') }) : null),
      h('div', { class: 'search' }, h('span', { html: icon('search') }), h('input', { id: 'q', placeholder: 'Buscar', value: query, oninput: e => { query = e.target.value; if (query) { view = 'search'; renderMain(); } else go('notes'); } })),
      nav('home', 'home', 'Inicio'), nav('notes', 'notes', 'Notas'), nav('gallery', 'gallery', 'Galería'),
      h('div', { class: 'side-h' }, h('span', {}, 'Carpetas'), h('button', { class: 'ib sm', title: 'Nueva carpeta', onclick: newFolder, html: icon('plus') })));
    const fl = h('div', { class: 'folders' });
    folders.forEach(f => {
      const b = h('button', { class: 'nav folder' + (view === 'folder:' + f.id ? ' on' : ''), onclick: () => go('folder:' + f.id) }, h('i', { class: 'fdot', style: { background: f.color } }), h('span', { class: 'fn' }, f.name), h('small', {}, counts[f.id] || ''));
      b.addEventListener('contextmenu', e => { e.preventDefault(); folderMenu(b, f); });
      UI.isPhone() || b.addEventListener('dragover', e => { e.preventDefault(); b.classList.add('drop'); });
      b.addEventListener('dragleave', () => b.classList.remove('drop'));
      b.addEventListener('drop', async e => { e.preventDefault(); b.classList.remove('drop'); const id = e.dataTransfer.getData('text/trazo'); const m = metas.find(x => x.id === id); if (m) { m.folder = f.id; await DB.put('meta', m); render(); toast('Movida a ' + f.name); } });
      longPress(b, () => folderMenu(b, f));
      fl.append(b);
    });
    if (!folders.length) fl.append(h('p', { class: 'muted small pad' }, 'Crea carpetas para tus asignaturas, proyectos o turnos.'));
    s.append(fl, h('div', { class: 'side-foot' }, h('button', { class: 'nav sm' + (view === 'trash' ? ' on' : ''), onclick: () => go('trash') }, h('span', { html: icon('trash') }), 'Eliminadas recientemente', trashN ? h('small', {}, String(trashN)) : null)));
  }
  function longPress(el, fn) {
    let t;
    el.addEventListener('touchstart', () => { t = setTimeout(() => { t = null; fn(); }, 550); }, { passive: true });
    ['touchend', 'touchmove', 'touchcancel'].forEach(ev => el.addEventListener(ev, () => clearTimeout(t), { passive: true }));
  }
  function renderTop() {
    const t = $('#top'); t.innerHTML = '';
    t.append(
      h('button', { class: 'ib menu-btn', title: 'Menú', onclick: () => document.body.classList.toggle('drawer'), html: icon('menu') }),
      h('div', { class: 'grow' }),
      h('button', { class: 'ib', title: 'Ayuda', onclick: () => help(), html: icon('help') }),
      h('button', { class: 'ib', title: 'Modo día / noche / automático', onclick: e => cycleTheme(e.currentTarget), html: icon(themeIcon()) }),
      h('button', { class: 'ib', title: 'Novedades', onclick: e => news(e.currentTarget), html: icon('bell') }),
      h('button', { class: 'ib', title: 'Más', onclick: e => topMore(e.currentTarget), html: icon('more') }),
      h('button', { class: 'btn primary new', onclick: e => newMenu(e.currentTarget) }, h('span', { html: icon('plus') }), 'Nueva'));
  }
  function go(v) {
    view = v; selecting = null;
    if (v !== 'search') { query = ''; const q = $('#q'); if (q) q.value = ''; }
    document.body.classList.remove('drawer');
    render();
  }
  function render() { renderSide(); renderTop(); renderMain(); }
  const refresh = async () => { await load(); render(); };

  // ---------- vistas ----------
  function renderMain() {
    const c = $('#content'); c.innerHTML = ''; c.scrollTop = 0;
    c.className = 'v-' + view.split(':')[0];
    if (view === 'home') return home(c);
    if (view === 'gallery') return gallery(c);
    if (view === 'trash') return trash(c);
    let list = live(), title = 'Notas', tabs = true;
    if (view === 'search') {
      const q = query.toLowerCase();
      list = list.filter(m => (m.title || '').toLowerCase().includes(q) || (m.text || '').toLowerCase().includes(q));
      title = `Resultados para “${query}”`; tabs = false;
    } else if (view.startsWith('folder:')) {
      const f = folderOf(view.slice(7)); if (!f) return go('notes');
      list = list.filter(m => m.folder === f.id); title = f.name; tabs = false;
    } else {
      if (tab === 'recent') list = list.filter(m => Date.now() - (m.opened || m.updated) < 14 * 864e5).sort((a, b) => (b.opened || b.updated) - (a.opened || a.updated));
      if (tab === 'favs') list = list.filter(m => m.fav);
      if (tab === 'loose') list = list.filter(m => !m.folder || !folderOf(m.folder));
    }
    if (tab !== 'recent' || view !== 'notes') sortList(list);
    const f = view.startsWith('folder:') ? folderOf(view.slice(7)) : null;
    c.append(h('div', { class: 'head' },
      h('h1', {}, f ? h('i', { class: 'fdot lg', style: { background: f.color } }) : null, title),
      h('div', { class: 'head-tools' },
        f ? h('button', { class: 'ib', title: 'Opciones de carpeta', onclick: e => folderMenu(e.currentTarget, f), html: icon('more') }) : null,
        h('button', { class: 'ib', title: 'Ordenar', onclick: e => sortMenu(e.currentTarget), html: icon('sort') }),
        h('button', { class: 'ib', title: 'Vista', onclick: () => { Settings.notesView = Settings.notesView === 'grid' ? 'list' : 'grid'; Settings.save(); renderMain(); }, html: icon(Settings.notesView === 'grid' ? 'list' : 'grid-view') }),
        h('button', { class: 'link', onclick: () => { selecting = selecting ? null : new Set(); renderMain(); } }, selecting ? 'Listo' : 'Seleccionar'))));
    if (tabs) {
      const tb = h('div', { class: 'tabs' });
      [['all', 'Todas las notas'], ['recent', 'Recientes'], ['favs', 'Favoritos'], ['loose', 'Sin carpeta']].forEach(([k, n]) => tb.append(h('button', { class: tab === k ? 'on' : '', onclick: () => { tab = k; renderMain(); } }, n)));
      c.append(tb);
    }
    if (!list.length) {
      c.append(h('div', { class: 'empty' }, h('span', { html: icon(view === 'search' ? 'search' : 'notes') }), h('h3', {}, view === 'search' ? 'Sin resultados' : 'No hay notas aquí'),
        h('p', {}, view === 'search' ? 'Busca por título, texto escrito con teclado, transcripciones o texto de PDFs.' : 'Toca «Nueva» para empezar a escribir.'),
        view !== 'search' ? h('button', { class: 'btn primary', onclick: () => newNote() }, 'Crear nota') : null));
      return;
    }
    c.append(notesGrid(list));
    if (selecting) c.append(selBar());
  }
  function sortList(list) {
    const k = Settings.sort;
    list.sort((a, b) => k === 'title' ? a.title.localeCompare(b.title, 'es') : k === 'created' ? b.created - a.created : b.updated - a.updated);
    return list;
  }
  function notesGrid(list) {
    const g = h('div', { class: Settings.notesView === 'list' ? 'nlist' : 'ngrid' });
    for (const m of list) {
      const f = folderOf(m.folder);
      const card = h('div', { class: 'ncard' + (selecting && selecting.has(m.id) ? ' picked' : ''), draggable: UI.isPhone() ? false : 'true' },
        h('div', { class: 'nthumb' }, m.thumb ? h('img', { src: m.thumb, alt: '' }) : h('div', { class: 'blank' }),
          m.audio ? h('span', { class: 'badge', html: icon('mic') }) : null,
          selecting ? h('span', { class: 'ck', html: selecting.has(m.id) ? icon('check') : '' }) : null),
        h('div', { class: 'ninfo' },
          h('b', {}, m.title),
          h('small', {}, f ? h('i', { class: 'fdot', style: { background: f.color } }) : null, UI.date(m.updated), m.pages > 1 ? ' · ' + m.pages + ' pág.' : ''),
          h('div', { class: 'nact' },
            h('button', { class: 'ib sm' + (m.fav ? ' fav' : ''), title: 'Favorito', onclick: async e => { e.stopPropagation(); m.fav = !m.fav; await DB.put('meta', m); renderMain(); }, html: icon(m.fav ? 'star-f' : 'star') }),
            h('button', { class: 'ib sm', title: 'Opciones', onclick: e => { e.stopPropagation(); noteMenu(e.currentTarget, m); }, html: icon('more') }))));
      card.onclick = () => { if (selecting) { selecting.has(m.id) ? selecting.delete(m.id) : selecting.add(m.id); renderMain(); } else openNote(m.id); };
      card.addEventListener('dragstart', e => e.dataTransfer.setData('text/trazo', m.id));
      card.addEventListener('contextmenu', e => { e.preventDefault(); noteMenu({ x: e.clientX, y: e.clientY }, m); });
      longPress(card, () => noteMenu(card.querySelector('.nact'), m));
      g.append(card);
    }
    return g;
  }
  function selBar() {
    const ids = () => [...selecting];
    return h('div', { class: 'selbar' },
      h('span', {}, selecting.size + ' seleccionada(s)'),
      h('button', { class: 'chip', onclick: () => { const l = live().filter(m => !view.startsWith('folder:') || m.folder === view.slice(7)); l.forEach(m => selecting.add(m.id)); renderMain(); } }, 'Todas'),
      h('button', { class: 'chip', disabled: !selecting.size ? '' : false, onclick: e => moveTo(e.currentTarget, ids()) }, h('span', { html: icon('folder') }), 'Mover'),
      h('button', { class: 'chip', disabled: !selecting.size ? '' : false, onclick: async () => { for (const id of ids()) await duplicate(id); selecting = null; refresh(); } }, h('span', { html: icon('dup') }), 'Duplicar'),
      h('button', { class: 'chip', disabled: !selecting.size ? '' : false, onclick: async () => { for (const id of ids()) Exporter.pdf(await DB.get('notes', id)); } }, h('span', { html: icon('share') }), 'Exportar'),
      h('button', { class: 'chip danger', disabled: !selecting.size ? '' : false, onclick: async () => { for (const id of ids()) await trashNote(id, true); selecting = null; refresh(); toast('Movidas a Eliminadas recientemente'); } }, h('span', { html: icon('trash') }), 'Eliminar'));
  }

  // ---------- inicio ----------
  async function home(c) {
    const recent = live().sort((a, b) => (b.opened || b.updated) - (a.opened || a.updated)).slice(0, 8);
    const hello = Settings.name ? '¡Hola, ' + Settings.name.split(' ')[0] + '!' : 'Empecemos';
    c.append(h('div', { class: 'hero' },
      h('div', { class: 'logo', html: icon('logo') }),
      h('h1', {}, hello),
      h('p', {}, 'Enseña lo que aprendes: explicar conceptos aumenta tu dominio.'),
      h('div', { class: 'cards3' },
        h('button', { class: 'hcard blue', onclick: importPick }, h('span', { html: icon('import') }), h('b', {}, 'Importar un archivo'), h('small', {}, 'Toma notas sobre PDF, diapositivas, libros e imágenes.')),
        h('button', { class: 'hcard amber', onclick: async () => { await createNote(); setTimeout(() => Editor.startRec(), 400); } }, h('span', { html: icon('mic') }), h('b', {}, 'Empezar a grabar'), h('small', {}, 'Graba clases y reuniones; tu escritura queda sincronizada con el audio.')),
        h('button', { class: 'hcard gray', onclick: () => go('gallery') }, h('span', { html: icon('template') }), h('b', {}, 'Encuentra una plantilla'), h('small', {}, 'Planificadores, Cornell, fichas clínicas y más.')))));
    if (Settings.showHomeRecent && recent.length) { c.append(h('h2', { class: 'sec' }, 'Notas recientes')); const g = notesGrid(recent); g.classList.add('row-scroll'); c.append(g); }
    if (Settings.showHomePuzzle) {
      const d = Puzzle.day(), done = await KV.get('puzzle:' + d);
      c.append(h('h2', { class: 'sec' }, 'Pausa mental diaria'),
        h('button', { class: 'puzzle-card', onclick: () => Puzzle.open() }, h('div', {}, done ? h('span', { class: 'tag ok' }, 'RESUELTO') : h('span', { class: 'tag' }, 'NUEVO'), h('b', {}, 'Día ' + d), h('small', {}, done ? done.moves + ' movimientos' : 'Rompecabezas deslizante')), h('div', { class: 'pz-ic', html: icon('puzzle') })));
    }
    const withCards = (await Promise.all(recent.slice(0, 5).map(m => DB.get('notes', m.id)))).filter(n => n && n.smart && n.smart.cards && n.smart.cards.length);
    if (withCards.length) {
      c.append(h('h2', { class: 'sec' }, 'Sigue estudiando'));
      const row = h('div', { class: 'study-row' });
      withCards.forEach(n => row.append(h('button', { class: 'study-chip', onclick: () => { openNote(n.id); setTimeout(() => Smart.panel(Editor.note), 500); } }, h('span', { html: icon('cards') }), h('b', {}, n.title), h('small', {}, n.smart.cards.length + ' tarjetas'))));
      c.append(row);
    }
  }

  // ---------- galería de plantillas ----------
  const tplCanvas = (t, w = 200, o = {}) => {
    const p = o.size || SIZES.letter, c = h('canvas', { width: w * 2, height: Math.round(w * 2 * p[1] / p[0]) });
    const x = c.getContext('2d'), k = c.width / p[0]; x.scale(k, k);
    Paper.draw(x, p[0], p[1], { tpl: t.id, color: o.color || '#FFFFFF', sp: o.sp, p: t.param ? t.param() : undefined });
    return c;
  };
  async function gallery(c) {
    myTpls = (await KV.get('myTemplates')) || [];
    const favs = (await KV.get('tplFavs')) || {};
    c.append(h('div', { class: 'head' }, h('h1', {}, 'Galería'), h('div', { class: 'search wide' }, h('span', { html: icon('search') }), h('input', { placeholder: 'Buscar en la galería', value: galQ, oninput: e => { galQ = e.target.value; clearTimeout(gallery.t); gallery.t = setTimeout(() => { renderMain(); const i = $('#content .search input'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); } }))));
    const tb = h('div', { class: 'tabs' });
    [['discover', 'Descubrir'], ['favs', 'Favoritas'], ['mine', 'Mis plantillas']].forEach(([k, n]) => tb.append(h('button', { class: galTab === k ? 'on' : '', onclick: () => { galTab = k; renderMain(); } }, n)));
    c.append(tb);
    const q = galQ.toLowerCase();
    const all = Object.values(Paper.T).filter(t => !t.mine && (!q || t.name.toLowerCase().includes(q) || t.cat.toLowerCase().includes(q)));
    const card = t => h('div', { class: 'gcard' },
      h('button', { class: 'gprev', onclick: () => useTemplate(t) }, tplCanvas(t), h('span', { class: 'gtag' }, 'Plantilla')),
      h('div', { class: 'ginfo' }, h('b', {}, t.name), h('small', {}, t.mine ? 'Mía' : 'Trazo · ' + t.cat)),
      h('div', { class: 'gact' },
        h('span', { class: 'gav', html: icon('logo') }),
        h('button', { class: 'ib sm heart' + (favs[t.id] ? ' on' : ''), title: 'Favorita', onclick: async () => { favs[t.id] = !favs[t.id]; await KV.set('tplFavs', favs); renderMain(); }, html: icon(favs[t.id] ? 'heart-f' : 'heart') }),
        t.mine ? h('button', { class: 'ib sm', title: 'Eliminar plantilla', onclick: async () => { if (await UI.confirm('¿Eliminar plantilla?', null, 'Eliminar', true)) { myTpls = myTpls.filter(x => 'my:' + x.id !== t.id); await KV.set('myTemplates', myTpls); delete Paper.T[t.id]; renderMain(); } }, html: icon('trash') }) : null,
        h('button', { class: 'ib sm primary', title: 'Usar', onclick: () => useTemplate(t), html: icon('open') })));
    if (galTab === 'discover') {
      for (const cat of Paper.CATS) {
        const items = all.filter(t => t.cat === cat); if (!items.length) continue;
        const row = h('div', { class: 'grow-row' }); items.forEach(t => row.append(card(t)));
        c.append(h('h2', { class: 'sec' }, cat === 'Portadas' ? 'Planificadores académicos' : cat), row);
      }
    } else {
      const items = galTab === 'favs' ? Object.values(Paper.T).filter(t => favs[t.id]) : Object.values(Paper.T).filter(t => t.mine);
      if (!items.length) c.append(h('div', { class: 'empty' }, h('span', { html: icon(galTab === 'favs' ? 'heart' : 'gallery') }), h('p', {}, galTab === 'favs' ? 'Toca el corazón de una plantilla para guardarla aquí.' : 'En una nota: «…» › Guardar página como plantilla.')));
      else { const g = h('div', { class: 'ggrid' }); items.forEach(t => g.append(card(t))); c.append(g); }
    }
  }
  async function useTemplate(t) {
    const param = t.param ? t.param() : undefined;
    await createNote({ title: t.cover ? 'Planificador ' + Paper.yearLabel() : undefined, paper: { tpl: t.id, color: '#FFFFFF', p: param } });
  }
  // selector de plantillas reutilizable (editor)
  function templatePicker(cb) {
    const grid = h('div', { class: 'ggrid compact' }), jump = h('div', { class: 'tpl-jump' }, h('span', { class: 'muted' }, 'Ir a:'));
    const o = { size: Settings.size || 'letter', orient: Settings.orient || 'portrait', color: (Settings.paper && Settings.paper.color) || '#FFFFFF', sp: 4 };
    const opts = h('div', { class: 'tpl-opts' });
    const L = UI.layer(h('div', { class: 'dlg wide' }, h('div', { class: 'dlg-head' }, h('button', { class: 'link', onclick: () => L.close() }, 'Cancelar'), h('h3', {}, 'Plantillas'), h('span')), opts, jump, grid), { cls: 'center' });
    const spOf = () => 1 + (o.sp - 4) * 0.15;
    const pick = t => { L.close(); cb({ id: t.id, param: t.param ? t.param() : undefined, color: o.color, sp: t.sp ? spOf() : undefined, size: o.size, orient: o.orient }); };
    const drawOpts = () => {
      opts.innerHTML = '';
      opts.append(h('label', { class: 'muted' }, 'Tamaño'), h('select', { class: 'sel', onchange: e => { o.size = e.target.value; fill(); } }, ...Object.keys(SIZES).map(k => h('option', { value: k, selected: o.size === k ? '' : false }, SIZE_NAMES[k]))),
        h('div', { class: 'seg' }, ...[['portrait', 'Vertical'], ['landscape', 'Horizontal']].map(([v, n]) => h('button', { class: o.orient === v ? 'on' : '', title: n, onclick: () => { o.orient = v; drawOpts(); fill(); } }, h('i', { class: 'or ' + v }), n))),
        h('div', { class: 'swrow' }, ...PAPER_COLORS.map(pc => h('button', { class: 'sw' + (o.color === pc.c ? ' on' : ''), title: pc.n, style: { '--c': pc.c }, onclick: () => { o.color = pc.c; drawOpts(); fill(); } }))),
        h('label', { class: 'muted' }, 'Espaciado ', h('b', {}, String(o.sp))), h('input', { type: 'range', class: 'rng', min: 1, max: 9, step: 1, value: o.sp, oninput: e => { o.sp = +e.target.value; opts.querySelector('b').textContent = o.sp; }, onchange: () => fill() }));
    };
    const fill = () => { grid.innerHTML = ''; jump.querySelectorAll('button').forEach(b => b.remove()); build(); };
    const build = () => {
    for (const cat of [...Paper.CATS, 'Mías']) {
      const items = Object.values(Paper.T).filter(t => cat === 'Mías' ? t.mine : t.cat === cat && !t.mine); if (!items.length) continue;
      const hd = h('h4', { class: 'full' }, cat);
      jump.append(h('button', { class: 'chip sm', onclick: () => hd.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, cat));
      grid.append(hd);
      items.forEach(t => grid.append(h('button', { class: 'tpl-mini' + (o.orient === 'landscape' ? ' land' : ''), onclick: () => pick(t) }, tplCanvas(t, 110, { color: o.color, sp: t.sp ? spOf() : 1, size: pageSize(o.size, o.orient) }), h('span', {}, t.name))));
    }
    };
    drawOpts(); build();
  }
  async function savePageAsTemplate(page) {
    const name = await UI.prompt('Nombre de la plantilla', 'Mi plantilla'); if (!name) return;
    const c = document.createElement('canvas'), k = 2; c.width = page.w * k; c.height = page.h * k;
    await renderPageTo(c.getContext('2d'), page, k);
    const blob = await Blobs.put(await UI.canvasBlob(c, 'image/jpeg', 0.9));
    myTpls = (await KV.get('myTemplates')) || [];
    const t = { id: uid(), name, blob }; myTpls.push(t); await KV.set('myTemplates', myTpls);
    registerMine(t); toast('Guardada en Galería › Mis plantillas');
  }
  function registerMine(t) {
    Paper.T['my:' + t.id] = { id: 'my:' + t.id, name: t.name, cat: 'Mías', mine: true, draw: (c, w, hh) => { const img = Blobs.img(t.blob, () => { Editor.isOpen() ? Editor.repaintAll() : (view === 'gallery' && renderMain()); }); if (img) c.drawImage(img, 0, 0, w, hh); } };
  }


  // ---------- cuadro de ayuda ----------
  const HELP = [
    { id: 'pen', i: 'pen', t: 'Escribir a mano', d: ['Elige bolígrafo, lápiz o marcador en la barra superior.', 'Toca de nuevo la herramienta para cambiar color y grosor.', 'En el bolígrafo puedes elegir pluma: estilográfica, caligrafía, pincel o punta fina.', 'Con Apple Pencil el dedo desplaza y hace zoom; el lápiz escribe. La presión y la inclinación cambian el trazo.'] },
    { id: 'perfect', i: 'shapes', t: 'Figuras perfectas', d: ['En bolígrafo o lápiz, abre el menú de figuras (botón con el ícono de figuras).', '«Mantener = figura»: dibuja y deja el lápiz quieto medio segundo.', '«Auto-perfecto»: al soltar convierte círculos, elipses (también inclinadas), rectángulos, rombos, triángulos y polígonos, aunque te pases del borde.', '«Garabato libre»: nunca convierte nada.', 'Selecciona trazos y toca «Perfeccionar» para corregirlos después.'] },
    { id: 'smart', i: 'sparkle', t: 'Dibujos con IA', d: ['Activa «Auto-perfecto + dibujos (IA)» en el menú de figuras.', 'Dibuja un objeto (árbol, auto, persona, corazón, órgano…). Al terminar aparece «¿Árbol?» con opciones: ilustración a tinta, a color, emoji o «Realista» (con clave de OpenAI).', 'Toca «Mantener» para dejar tu dibujo tal cual.', 'También: selecciona un dibujo con el lazo y toca «Interpretar».', 'Requiere configurar tu IA en Ajustes › Inteligencia artificial.'] },
    { id: 'shape', i: 'shapes', t: 'Biblioteca de figuras', d: ['Herramienta Figuras › botón con el nombre de la figura para ver las 80+ figuras: básicas, flechas, flujo, 3D, ideas, ciencias, bloques y divisores.', 'Arrastra para dibujarla del tamaño que quieras, o toca para insertarla.', 'Toca dos veces una figura para escribir dentro.', 'Los puntos azules la estiran; en flechas mueves cada extremo y en curvas su curvatura.', 'Las flechas que empiezan o terminan sobre una figura quedan conectadas y la siguen.'] },
    { id: 'mind', i: 'brain', t: 'Lluvia de ideas y diagramas', d: ['Multimedia (+) › Lluvia de ideas o Diagrama de flujo.', 'Selecciona un nodo y toca «Conectar» para agregar una rama nueva y escribir en ella.', 'Cambia color, relleno, línea y puntas desde la barra de selección.'] },
    { id: 'text', i: 'text', t: 'Texto y tipos de letra', d: ['Herramienta Texto: toca la página para escribir.', 'Elige entre 29 tipos de letra (también manuscritas y caligráficas), tamaño, negrita, cursiva, subrayado y color.', 'Las notas adhesivas son textos con fondo de color.', 'El botón de teclado agrega texto debajo de lo último escrito.'] },
    { id: 'lasso', i: 'lasso', t: 'Seleccionar y mover', d: ['Herramienta Seleccionar: rodea en «Forma libre» o arrastra «En caja».', 'Arrastra la selección para moverla; la esquina la escala.', 'Opciones: copiar, cortar, duplicar, color, al frente, convertir a texto, pegatina.'] },
    { id: 'eraser', i: 'eraser', t: 'Borrar', d: ['Trazo completo, parcial o solo marcador.', 'Toca dos dedos para deshacer.'] },
    { id: 'tape', i: 'tape', t: 'Cinta para estudiar', d: ['Traza la cinta a mano alzada (o recta) sobre una respuesta.', 'Tócala para revelar u ocultar. «Ocultar todas» para repasar.'] },
    { id: 'media', i: 'plus-circle', t: 'Imágenes, pegatinas y más', d: ['Multimedia (+): fotos, cámara, escanear, importar PDF, notas adhesivas, figuras, YouTube, plantillas.', 'Pegatinas: paquetes temáticos, viñetas, etiquetas, recientes y favoritas (mantén presionada una para marcarla).', 'Guarda cualquier selección como pegatina propia con el botón «Pegatina».'] },
    { id: 'zoom', i: 'zoom', t: 'Zoom y ventana de zoom', d: ['Pellizca con dos dedos o usa la herramienta Zoom para acercar un área.', 'Ventana de zoom (menú … o herramienta Zoom): escribe en grande abajo y la tinta cae pequeña en la página; avanza sola al llegar al borde.'] },
    { id: 'rec', i: 'mic', t: 'Grabar audio', d: ['Toca el micrófono para grabar mientras escribes.', 'Al reproducir, la tinta se ilumina sincronizada; toca un trazo para saltar a ese momento.', 'Transcripción en vivo y resúmenes en Notas inteligentes.'] },
    { id: 'tpl', i: 'template', t: 'Plantillas, tamaño y orientación', d: ['Más de 90 plantillas: papel, cuadernos, hojas divididas, académico, planificación, creativo, viajes, autocuidado y clínica.', 'Elige tamaño (Carta, Legal, A3–A7…), vertical u horizontal, color del papel y espaciado.', 'En el menú de cada página: girar a vertical u horizontal o cambiar su plantilla.', 'Menú de vista: desplazamiento vertical u horizontal.'] },
    { id: 'theme', i: 'theme-auto', t: 'Modo día, noche o automático', d: ['Toca el botón de medio círculo arriba para alternar: automático (sigue al sistema), día y noche.'] },
    { id: 'ai', i: 'sparkle', t: 'Inteligencia artificial', d: ['Ajustes › Inteligencia artificial: usa tus cuentas (Codex, Claude o Gemini en el Mac) o tus claves API.', 'Resúmenes, tarjetas, cuestionarios, chat con tus notas, transcripción y escritura a texto.'] },
    { id: 'install', i: 'import', t: 'Instalar y sincronizar', d: ['iPad/iPhone: abre la web en Safari › Compartir › Agregar a pantalla de inicio.', 'Mac: la app Trazo guarda copias automáticas en iCloud Drive › Trazo.', 'Pasa notas entre equipos con Exportar › .trazo o copias de seguridad.'] },
    { id: 'keys', i: 'keyboard', t: 'Atajos de teclado', d: ['P bolígrafo · L lápiz · H marcador · E borrador · T texto · S seleccionar · K cinta · R regla · F figuras · X láser · Espacio navegar.', '⌘Z / ⇧⌘Z deshacer y rehacer · ⌘C ⌘X ⌘V ⌘D · ⌘+ ⌘− ⌘0 zoom · Supr elimina la selección.'] },
  ];
  function help(topic) {
    const list = h('div', { class: 'help-list' }), q = h('input', { class: 'field', placeholder: 'Buscar en la ayuda…', type: 'search' });
    const L = UI.layer(h('div', { class: 'dlg wide help' }, h('div', { class: 'dlg-head' }, h('span'), h('h3', {}, 'Ayuda'), h('button', { class: 'link b', onclick: () => L.close() }, 'Cerrar')), q, list), { cls: 'center' });
    const norm = t => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const draw = () => {
      const w = norm(q.value.trim()); list.innerHTML = '';
      const items = HELP.filter(x => !w || norm(x.t + ' ' + x.d.join(' ')).includes(w));
      if (!items.length) list.append(h('p', { class: 'muted' }, 'Sin resultados.'));
      items.forEach(x => {
        const card = h('details', { class: 'help-card', open: x.id === topic || !!w ? '' : false }, h('summary', {}, h('span', { class: 'hic', html: icon(x.i) }), x.t), h('ul', {}, ...x.d.map(t => h('li', {}, t))));
        list.append(card); if (x.id === topic) setTimeout(() => card.scrollIntoView({ block: 'center' }), 60);
      });
    };
    q.addEventListener('input', draw); draw();
  }

  // ---------- papelera ----------
  function trash(c) {
    const list = metas.filter(m => m.deleted).sort((a, b) => b.deleted - a.deleted);
    c.append(h('div', { class: 'head' }, h('h1', {}, 'Eliminadas recientemente'), list.length ? h('button', { class: 'btn danger', onclick: async () => { if (await UI.confirm('¿Vaciar la papelera?', 'Las notas se eliminarán para siempre.', 'Vaciar', true)) { for (const m of list) await purge(m.id); refresh(); } } }, 'Vaciar') : null),
      h('p', { class: 'muted' }, 'Las notas de esta lista se eliminan para siempre tras 30 días.'));
    if (!list.length) { c.append(h('div', { class: 'empty' }, h('span', { html: icon('trash') }), h('p', {}, 'No hay notas eliminadas recientemente'))); return; }
    const g = h('div', { class: 'nlist' });
    list.forEach(m => g.append(h('div', { class: 'ncard' }, h('div', { class: 'nthumb' }, m.thumb ? h('img', { src: m.thumb }) : h('div', { class: 'blank' })),
      h('div', { class: 'ninfo' }, h('b', {}, m.title), h('small', {}, 'Eliminada ' + UI.rel(m.deleted).toLowerCase() + ' · quedan ' + Math.max(0, 30 - Math.floor((Date.now() - m.deleted) / 864e5)) + ' días'),
        h('div', { class: 'nact' }, h('button', { class: 'chip', onclick: async () => { m.deleted = null; await DB.put('meta', m); refresh(); toast('Nota recuperada'); } }, 'Recuperar'),
          h('button', { class: 'chip danger', onclick: async () => { if (await UI.confirm('¿Eliminar para siempre?', null, 'Eliminar', true)) { await purge(m.id); refresh(); } } }, 'Eliminar'))))));
    c.append(g);
  }
  async function trashNote(id, quiet) {
    const m = metas.find(x => x.id === id); if (!m) return;
    if (!quiet && Settings.confirmDelete !== false && !(await UI.confirm('¿Eliminar «' + m.title + '»?', 'Podrás recuperarla durante 30 días.', 'Eliminar', true))) return false;
    m.deleted = Date.now(); await DB.put('meta', m); return true;
  }
  async function purge(id) {
    const n = await DB.get('notes', id);
    if (n) { const ids = new Set(); n.pages.forEach(p => { if (p.bg && p.bg.blob) ids.add(p.bg.blob); p.items.forEach(it => it.t === 'i' && ids.add(it.b)); }); (n.recs || []).forEach(r => ids.add(r.blob)); for (const b of ids) await Blobs.del(b); }
    await DB.del('notes', id); await DB.del('meta', id);
    try { for (const v of await DB.byIndex('versions', 'note', id)) await DB.del('versions', v.vid); } catch (e) {}
  }
  async function autoPurge() { for (const m of metas.filter(m => m.deleted && Date.now() - m.deleted > 30 * 864e5)) await purge(m.id); }

  // ---------- menús ----------
  function newMenu(btn) {
    menu(btn, [
      { t: 'Nota nueva', i: 'notes', fn: newNote },
      { t: 'Desde una plantilla…', i: 'template', fn: () => templatePicker(t => createNote({ paper: { tpl: t.id, color: t.color, p: t.param, sp: t.sp }, size: t.size, orient: t.orient })) },
      { t: 'Importar PDF, imágenes o nota', i: 'import', fn: importPick },
      { t: 'Escanear documento', i: 'scan', fn: async () => { const pages = await Importer.scan(); if (pages && pages.length) createNote({ title: 'Escaneo ' + UI.date(Date.now()), pages }); } },
      { t: 'Empezar a grabar', i: 'mic', fn: async () => { await createNote(); setTimeout(() => Editor.startRec(), 400); } },
      { t: 'Nota desde YouTube', i: 'youtube', fn: async () => { const n = await createNote({ title: 'Video ' + UI.date(Date.now()) }); setTimeout(() => Smart.youtube(Editor.note, () => { Editor.markDirty(); Editor.showYT(); }), 400); } },
      '-',
      { t: 'Carpeta nueva', i: 'folder', fn: newFolder },
    ], { align: 'right' });
  }
  function topMore(btn) {
    menu(btn, [
      { t: 'Notas recientes en Inicio', check: Settings.showHomeRecent, fn: () => { Settings.showHomeRecent = !Settings.showHomeRecent; Settings.save(); renderMain(); } },
      { t: 'Pausa mental diaria', check: Settings.showHomePuzzle, fn: () => { Settings.showHomePuzzle = !Settings.showHomePuzzle; Settings.save(); renderMain(); } },
      '-',
      { t: 'Copia de seguridad', i: 'cloud', fn: () => settings('sync') },
      { t: 'Ajustes', i: 'gear', fn: () => settings() },
      { t: 'Ayuda y atajos', i: 'help', fn: () => help() },
    ], { align: 'right' });
  }
  function news(btn) {
    const tips = [
      ['Apple Pencil', 'Presión, inclinación para sombrear con el lápiz y rechazo de palma automático.'],
      ['Figuras perfectas', 'Dibuja un círculo o rectángulo y mantén el lápiz quieto medio segundo.'],
      ['Audio + tinta', 'Al reproducir una grabación, tu escritura aparece en el orden en que la hiciste. Toca un trazo para saltar a ese momento.'],
      ['Cinta para estudiar', 'Tapa respuestas con la cinta y tócala para revelarlas.'],
      ['IA con tus cuentas', UI.native ? 'En el Mac, Trazo usa tu sesión de ChatGPT (Codex), Claude o Gemini, sin costo extra.' : 'Agrega una clave de OpenAI o Gemini (nivel gratuito) en Ajustes › Inteligencia artificial.'],
      ['Gestos', 'Toca con dos dedos para deshacer. Pellizca para hacer zoom.'],
    ];
    menu(btn, tips.map(([t, s]) => ({ t, sub: s, i: 'sparkle' })), { align: 'right', cls: 'wide' });
  }
  function sortMenu(btn) {
    menu(btn, [['updated', 'Fecha de modificación'], ['created', 'Fecha de creación'], ['title', 'Título']].map(([k, n]) => ({ t: n, check: Settings.sort === k, fn: () => { Settings.sort = k; Settings.save(); renderMain(); } })));
  }
  function noteMenu(anchor, m) {
    menu(anchor, [
      { t: 'Abrir', i: 'open', fn: () => openNote(m.id) },
      { t: 'Renombrar', i: 'edit', fn: async () => { const t = await UI.prompt('Renombrar nota', m.title); if (t) { m.title = t; await DB.put('meta', m); const n = await DB.get('notes', m.id); n.title = t; await DB.put('notes', n); renderMain(); } } },
      { t: m.fav ? 'Quitar de favoritos' : 'Agregar a favoritos', i: 'star', fn: async () => { m.fav = !m.fav; await DB.put('meta', m); renderMain(); } },
      { t: 'Mover a carpeta…', i: 'folder', fn: () => moveTo(anchor, [m.id]) },
      { t: 'Duplicar', i: 'dup', fn: async () => { await duplicate(m.id); refresh(); } },
      { t: 'Exportar PDF', i: 'share', fn: async () => Exporter.pdf(await DB.get('notes', m.id)) },
      { t: 'Compartir nota Trazo', sub: 'Con audio, para otro dispositivo', i: 'export', fn: async () => Exporter.trazo(await DB.get('notes', m.id)) },
      { t: 'Información', i: 'info', fn: () => noteInfo(m) },
      '-',
      { t: 'Eliminar', i: 'trash', danger: true, fn: async () => { if (await trashNote(m.id)) { render(); toast('Movida a Eliminadas recientemente'); } } },
    ]);
  }
  async function noteInfo(m) {
    const n = await DB.get('notes', m.id) || Editor.note;
    let audio = 0; for (const r of (n.recs || [])) audio += r.dur || 0;
    const f = folderOf(m.folder);
    UI.dialog({ title: m.title, body: h('div', { class: 'info' },
      ...[['Carpeta', f ? f.name : 'Sin carpeta'], ['Creada', UI.datetime(m.created)], ['Modificada', UI.datetime(n.updated || m.updated)], ['Páginas', n.pages.length], ['Grabaciones', (n.recs || []).length + (audio ? ' · ' + UI.dur(audio) : '')], ['Plantilla', (Paper.T[n.paper && n.paper.tpl] || {}).name || '—']].map(([k, v]) => h('div', { class: 'irow' }, h('span', {}, k), h('b', {}, String(v))))) });
  }
  function moveTo(anchor, ids) {
    menu(anchor, [
      ...folders.map(f => ({ t: f.name, custom: null, i: null, fn: async () => { for (const id of ids) { const m = metas.find(x => x.id === id); m.folder = f.id; await DB.put('meta', m); } selecting = null; render(); toast('Movida a ' + f.name); } })),
      { t: 'Sin carpeta', fn: async () => { for (const id of ids) { const m = metas.find(x => x.id === id); m.folder = null; await DB.put('meta', m); } selecting = null; render(); } },
      '-', { t: 'Carpeta nueva…', i: 'plus', fn: async () => { const f = await newFolder(); if (f) { for (const id of ids) { const m = metas.find(x => x.id === id); m.folder = f.id; await DB.put('meta', m); } selecting = null; render(); } } },
    ]);
  }
  async function duplicate(id) {
    const n = await DB.get('notes', id), m = await DB.get('meta', id); if (!n) return;
    const nid = uid(); n.id = nid; n.title += ' (copia)'; n.created = n.updated = Date.now();
    await DB.put('notes', n); await DB.put('meta', Object.assign({}, m, { id: nid, title: n.title, created: n.created, updated: n.updated, fav: false }));
  }
  async function newFolder() {
    const name = await UI.prompt('Carpeta nueva', '', 'Nombre'); if (!name) return null;
    const f = { id: uid(), name, color: FOLDER_COLORS[folders.length % FOLDER_COLORS.length] };
    folders.push(f); await saveFolders(); go('folder:' + f.id); return f;
  }
  function folderMenu(anchor, f) {
    const sw = h('div', { class: 'swrow' }, ...FOLDER_COLORS.map(c => h('button', { class: 'sw' + (c === f.color ? ' on' : ''), style: { '--c': c }, onclick: async () => { f.color = c; await saveFolders(); document.querySelectorAll('.pop').forEach(p => p._close()); render(); } })));
    menu(anchor, [
      { t: 'Renombrar', i: 'edit', fn: async () => { const n = await UI.prompt('Renombrar carpeta', f.name); if (n) { f.name = n; await saveFolders(); render(); } } },
      { custom: sw },
      { t: 'Subir', i: 'chev-up', fn: async () => { const i = folders.indexOf(f); if (i > 0) { folders.splice(i - 1, 0, folders.splice(i, 1)[0]); await saveFolders(); render(); } } },
      { t: 'Bajar', i: 'chev-down', fn: async () => { const i = folders.indexOf(f); if (i < folders.length - 1) { folders.splice(i + 1, 0, folders.splice(i, 1)[0]); await saveFolders(); render(); } } },
      { t: 'Exportar todas como PDF', i: 'share', fn: async () => { for (const m of live().filter(m => m.folder === f.id)) Exporter.pdf(await DB.get('notes', m.id)); } },
      '-',
      { t: 'Eliminar carpeta', i: 'trash', danger: true, fn: async () => {
        const n = live().filter(m => m.folder === f.id).length;
        const r = await UI.dialog({ title: '¿Eliminar «' + f.name + '»?', body: h('p', {}, n ? `Tiene ${n} nota(s).` : 'Está vacía.'), buttons: [{ t: 'Cancelar', v: 0 }, n ? { t: 'Mantener notas', v: 1 } : null, { t: n ? 'Eliminar con notas' : 'Eliminar', v: 2, danger: true }].filter(Boolean) });
        if (!r) return;
        for (const m of live().filter(m => m.folder === f.id)) { if (r === 2) m.deleted = Date.now(); else m.folder = null; await DB.put('meta', m); }
        folders = folders.filter(x => x !== f); await saveFolders(); go('notes');
      } },
    ]);
  }
  async function importPick() {
    const files = await UI.pickFiles('application/pdf,image/*,.trazo,.trazobackup');
    if (!files.length) return;
    const backups = files.filter(f => /\.trazobackup$/i.test(f.name));
    for (const b of backups) await Backup.restore(b);
    const rest = files.filter(f => !/\.trazobackup$/i.test(f.name));
    const trazos = rest.filter(f => /\.trazo$/i.test(f.name));
    for (const t of trazos) await Backup.importNote(t);
    const docs = rest.filter(f => !/\.trazo$/i.test(f.name));
    if (docs.length) {
      const tmp = { pdfText: '' };
      const pages = await Importer.pagesFrom(docs, tmp);
      if (pages.length) { const n = await createNote({ title: docs[0].name.replace(/\.[^.]+$/, ''), pages, open: false }); n.pdfText = tmp.pdfText; await DB.put('notes', n); openNote(n.id); return; }
    }
    refresh();
  }
  // archivos recibidos desde el Mac (Abrir con… / arrastrar al Dock)
  async function nativeOpen(list) {
    const files = [];
    for (const f of list) { const bin = atob(f.data), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); files.push(new File([u], f.name, { type: f.type || '' })); }
    const docs = files.filter(f => !/\.trazo(backup)?$/i.test(f.name));
    for (const f of files.filter(f => /\.trazobackup$/i.test(f.name))) await Backup.restore(f);
    for (const f of files.filter(f => /\.trazo$/i.test(f.name))) await Backup.importNote(f);
    if (docs.length) { const tmp = {}; const pages = await Importer.pagesFrom(docs, tmp); if (pages.length) { const n = await createNote({ title: docs[0].name.replace(/\.[^.]+$/, ''), pages, open: false }); n.pdfText = tmp.pdfText; await DB.put('notes', n); openNote(n.id); return; } }
    refresh();
  }

  // ---------- ajustes ----------
  function settings(section = 'account') {
    const S = Settings;
    const sections = [
      ['account', 'Cuenta'], ['plan', 'Plan'], ['sync', 'Copias y sincronización'], ['ai', 'Inteligencia artificial'], ['look', 'Aspecto'],
      ['editor', 'Editor de notas'], ['pencil', 'Apple Pencil y gestos'], ['security', 'Seguridad'], ['about', 'Acerca de'], ['help', 'Ayuda'], ['trash', 'Eliminada recientemente'],
    ];
    const navEl = h('nav', { class: 'set-nav' }), pane = h('div', { class: 'set-pane' });
    const head = h('h3', {});
    const L = UI.layer(h('div', { class: 'settings' }, navEl, h('div', { class: 'set-main' }, h('div', { class: 'dlg-head' }, h('button', { class: 'link back-only', onclick: () => box.classList.remove('detail') }, '‹ Ajustes'), head, h('button', { class: 'link b', onclick: () => L.close() }, 'Cerrar')), pane),
      h('div', { class: 'set-ver' }, 'Versión 1.0 · Gratis')), { cls: 'center', onclose: () => render() });
    const box = L.el.firstChild;
    const row = (label, ctrl, sub) => h('div', { class: 'srow' }, h('div', {}, h('span', {}, label), sub ? h('small', {}, sub) : null), ctrl);
    const toggle = (key, fn) => h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: S[key] ? '' : false, onchange: e => { S[key] = e.target.checked; S.save(); fn && fn(); } }), h('i'));
    const select = (key, opts, fn) => h('select', { class: 'sel', onchange: e => { S[key] = e.target.value; S.save(); fn && fn(); } }, ...opts.map(([v, n]) => h('option', { value: v, selected: S[key] === v ? '' : false }, n)));
    const group = (title, ...rows) => h('div', { class: 'sgroup' }, title ? h('h5', {}, title) : null, h('div', { class: 'scard' }, ...rows.filter(Boolean)));
    const note = t => h('p', { class: 'snote' }, t);
    function show(k) {
      section = k; pane.innerHTML = ''; head.textContent = sections.find(s => s[0] === k)[1];
      navEl.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.k === k));
      box.classList.add('detail');
      const P = (...els) => pane.append(...els.filter(Boolean));
      if (k === 'account') {
        P(group('Perfil', row('Tu nombre', h('input', { class: 'field', value: S.name, placeholder: 'Opcional', onchange: e => { S.name = e.target.value.trim(); S.save(); } }))),
          note('Trazo no necesita cuenta: tus notas viven en este dispositivo y en tus copias de seguridad. Nadie más las ve.'),
          group('Estadísticas', row('Notas', h('b', {}, String(live().length))), row('Carpetas', h('b', {}, String(folders.length))), row('Espacio usado', h('b', { id: 'usage' }, '…'))));
        if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(e => { const u = $('#usage'); if (u) u.textContent = (e.usage / 1048576).toFixed(1) + ' MB'; });
        if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
      } else if (k === 'plan') {
        P(h('div', { class: 'plan' }, h('div', { class: 'logo', html: icon('logo') }), h('h2', {}, 'Trazo es gratis'), h('p', {}, 'Todas las funciones incluidas, sin suscripción ni anuncios:'),
          h('ul', {}, ...['Notas, páginas y carpetas ilimitadas', 'Grabación de audio sincronizada con la tinta', 'Transcripción en vivo', 'Resúmenes, tarjetas, cuestionarios y chat con tus notas', 'Notas desde videos de YouTube', 'Historial de versiones de 90 días', 'Copias de seguridad automáticas (Mac → iCloud Drive)', 'Exportación a PDF, imágenes y texto'].map(t => h('li', { html: icon('check') + esc(t) }))),
          h('p', { class: 'muted' }, 'La IA usa tus propias cuentas (sin costo extra en el Mac) o una clave API de muy bajo costo.')));
      } else if (k === 'sync') {
        P(group('Copia de seguridad',
          row('Exportar copia completa', h('button', { class: 'chip', onclick: () => Backup.exportAll() }, 'Exportar'), 'Todas las notas, audios y carpetas en un archivo .trazobackup'),
          row('Restaurar o fusionar copia', h('button', { class: 'chip', onclick: async () => { const f = await UI.pickFiles('.trazobackup,application/zip,application/octet-stream', false); if (f[0]) { await Backup.restore(f[0]); await load(); } } }, 'Elegir archivo'), 'Conserva la versión más reciente de cada nota'),
          UI.native ? row('Copia automática en iCloud Drive', toggle('autoBackup'), 'Cada 6 horas en iCloud Drive › Trazo') : null),
          note(UI.native ? 'Para pasar tus notas al iPad: abre el archivo .trazobackup de iCloud Drive › Trazo desde la app Trazo del iPad (Nueva › Importar).' : 'Para llevar tus notas a otro equipo: exporta la copia (Archivos › iCloud Drive) y restáurala en el otro dispositivo. En el Mac, la copia automática queda en iCloud Drive › Trazo.'),
          group('Historial de versiones', row('Conservar versiones', select('versionDays', [[7, '7 días'], [30, '30 días'], [90, '90 días'], [365, '1 año']].map(([v, n]) => [String(v), n]), () => { S.versionDays = +S.versionDays; S.save(); }))));
      } else if (k === 'ai') {
        const keys = AI.keys(), prov = AI.provider();
        const opts = Object.entries(AI.PROVIDERS).filter(([id, p]) => UI.native || !p.mac).map(([id, p]) => [id, p.n]);
        const keyRow = id => { const p = AI.PROVIDERS[id]; return h('div', { class: 'srow col' }, h('div', {}, h('span', {}, p.n), h('small', {}, p.help)),
          h('input', { class: 'field', type: 'password', autocomplete: 'off', placeholder: 'Pega tu clave aquí', value: keys[id] || '', onchange: e => { keys[id] = e.target.value.trim(); S.save(); show('ai'); } })); };
        P(group('Proveedor', row('Usar', h('select', { class: 'sel', onchange: e => { S.aiProvider = e.target.value; S.save(); show('ai'); } }, ...opts.map(([v, n]) => h('option', { value: v, selected: prov === v ? '' : false }, n))))),
          note(UI.native ? 'En el Mac, Trazo usa las sesiones que ya tienes iniciadas en Codex (ChatGPT), Claude Code o Gemini CLI: sin claves y sin costo adicional.' : 'En iPad y iPhone, la IA funciona con tu clave API. Recomendado: OpenAI GPT‑5 mini (centavos al mes) o Gemini (uso gratuito diario). La clave se guarda solo en este dispositivo.'),
          AI.PROVIDERS[prov] && AI.PROVIDERS[prov].key ? group('Clave', keyRow(prov), row('Modelo', h('input', { class: 'field', value: (S.aiModels || {})[prov] || AI.PROVIDERS[prov].model, onchange: e => { S.aiModels = S.aiModels || {}; S.aiModels[prov] = e.target.value.trim(); S.save(); } }))) : null,
          group('Transcripción', row('Idioma', select('lang', [['es-CL', 'Español (Chile)'], ['es-ES', 'Español (España)'], ['es-MX', 'Español (México)'], ['en-US', 'Inglés'], ['pt-BR', 'Portugués']])),
            row('Transcripción en vivo', h('b', {}, (window.SpeechRecognition || window.webkitSpeechRecognition) ? 'Disponible (gratis)' : 'No disponible aquí'))),
          group('Prueba', row('Probar conexión', h('button', { class: 'chip', onclick: async () => { const b = UI.busy('Consultando…'); try { const r = await AI.ask('Responde solo: "Conexión correcta".'); UI.alert('IA conectada', r); } catch (e) { UI.alert('Error', e.message); } finally { b.done(); } } }, 'Probar'))));
      } else if (k === 'look') {
        P(group('Tema', row('Apariencia', select('theme', [['auto', 'Automático (según el sistema)'], ['light', 'Día'], ['dark', 'Noche']], () => { applyTheme(); renderTop(); })),
          row('Color de acento', h('div', { class: 'swrow' }, ...['#3F66F0', '#7950F2', '#0B7A75', '#E8590C', '#E64980', '#2B2D42'].map(c => h('button', { class: 'sw' + (S.accent === c ? ' on' : ''), style: { '--c': c }, onclick: () => { S.accent = c; S.save(); applyTheme(); show('look'); } }))))),
          group('Biblioteca', row('Vista de notas', select('notesView', [['grid', 'Cuadrícula'], ['list', 'Lista']])), row('Confirmar antes de eliminar', h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: S.confirmDelete !== false ? '' : false, onchange: e => { S.confirmDelete = e.target.checked; S.save(); } }), h('i')))));
      } else if (k === 'editor') {
        P(group('Valores predeterminados del documento',
          row('Título de la nota', h('input', { class: 'field', value: S.titleFormat, onchange: e => { S.titleFormat = e.target.value || 'Nota {fecha} {hora}'; S.save(); } }), 'Usa {fecha} y {hora}'),
          row('Plantilla', h('button', { class: 'chip', onclick: () => templatePicker(t => { S.paper = { tpl: t.id, color: S.paper.color }; S.save(); show('editor'); }) }, (Paper.T[S.paper.tpl] || {}).name || 'En blanco')),
          row('Color del papel', h('div', { class: 'swrow' }, ...PAPER_COLORS.slice(0, 7).concat(PAPER_COLORS.slice(7)).map(pc => h('button', { class: 'sw' + (S.paper.color === pc.c ? ' on' : ''), title: pc.n, style: { '--c': pc.c }, onclick: () => { S.paper = Object.assign({}, S.paper, { color: pc.c }); S.save(); show('editor'); } })))),
          row('Tamaño de página', select('size', [['letter', 'Carta'], ['a4', 'A4'], ['wide', 'Panorámico'], ['phone', 'Vertical estrecho']])),
          row('Vista de notas predeterminada', select('view', [['continuous', 'Continuo'], ['paged', 'Página por página']]))),
          group('Texto', row('Fuente', select('textFont', [['system', 'Sistema'], ['serif', 'Serif'], ['round', 'Redondeada'], ['mono', 'Monoespaciada'], ['hand', 'Manuscrita']])),
            row('Tamaño', h('input', { class: 'field xs', type: 'number', min: 10, max: 72, value: S.textSize, onchange: e => { S.textSize = +e.target.value || 18; S.save(); } }))),
          group('Escritura a mano y dibujo', row('Suavizado del trazo', h('input', { type: 'range', class: 'rng', min: 0, max: 1, step: 0.05, value: S.smoothing, onchange: e => { S.smoothing = +e.target.value; S.save(); } })),
            row('Sensibilidad a la presión', toggle('pressure')), row('Figuras perfectas', select('shapeMode', [['off', 'Garabato libre'], ['hold', 'Al mantener el trazo'], ['auto', 'Automático al soltar'], ['smart', 'Automático + dibujos con IA']])), row('Página nueva automática al llegar al final', toggle('autoPage'))),
          group('Multimedia', row('Esquinas de imágenes', select('mediaCorners', [['square', 'Puntiagudas'], ['round', 'Redondeadas']]))));
      } else if (k === 'pencil') {
        P(group('Apple Pencil', row('Escribir con', select('pencilOnly', [['auto', 'Automático (al detectar el Pencil)'], ['on', 'Solo Apple Pencil'], ['off', 'Pencil y dedo']]), 'Con «Solo Apple Pencil», el dedo desplaza, hace zoom y toca cintas'),
          row('Inclinación para sombrear (lápiz)', h('b', {}, 'Activado')), row('Vista previa al acercar el Pencil', h('b', {}, 'iPad compatibles'))),
          group('Gestos', row('Tocar con dos dedos para deshacer', toggle('twoFingerUndo')), row('Pellizcar para hacer zoom', h('b', {}, 'Siempre'))),
          note('Consejo: en el iPad, escribe a mano dentro de un cuadro de texto y iPadOS lo convierte en texto (Garabatear/Scribble).'));
      } else if (k === 'security') {
        P(group('Bloqueo', row('Código de acceso', h('button', { class: 'chip', onclick: async () => {
          if (S.pin) { if (await UI.confirm('¿Quitar el código?', null, 'Quitar', true)) { S.pin = ''; S.save(); show('security'); } return; }
          const p1 = await pinPad('Nuevo código de 4 dígitos'); if (!p1) return; const p2 = await pinPad('Repite el código'); if (p1 !== p2) { toast('Los códigos no coinciden'); return; }
          S.pin = hashPin(p1); S.save(); toast('Código activado'); show('security');
        } }, S.pin ? 'Quitar código' : 'Activar código')),
          S.pin ? row('Bloquear al salir de la app', toggle('lockOnLeave')) : null),
          note('El código protege la app en este dispositivo. Tus notas no salen del equipo salvo cuando tú exportas, haces copias o usas IA.'));
      } else if (k === 'about') {
        P(h('div', { class: 'plan' }, h('div', { class: 'logo', html: icon('logo') }), h('h2', {}, 'Trazo'), h('p', {}, 'Notas a mano, PDF y audio para iPad, iPhone y Mac.'), h('p', { class: 'muted' }, 'Hecho para el Dr. Marcelo Lam · 2026'), h('p', { class: 'muted small' }, 'Versión 1.5 · figuras, dibujos con IA y ayuda'), h('p', { class: 'muted small' }, 'Usa pdf.js (Mozilla), pdf-lib y JSZip, de código abierto.')));
      } else if (k === 'help') {
        L.close(); help(); return;
        const keys = [['P', 'Bolígrafo'], ['L', 'Lápiz'], ['H', 'Marcador'], ['E', 'Borrador'], ['T', 'Texto'], ['S', 'Seleccionar'], ['K', 'Cinta'], ['R', 'Regla'], ['F', 'Figuras'], ['X', 'Láser'], ['Espacio', 'Navegar'], ['⌘Z / ⇧⌘Z', 'Deshacer / rehacer'], ['⌘C ⌘X ⌘V ⌘D', 'Copiar, cortar, pegar, duplicar'], ['⌘+ / ⌘− / ⌘0', 'Zoom'], ['Supr', 'Eliminar selección']];
        P(group('Atajos de teclado', ...keys.map(([k2, v]) => row(v, h('kbd', {}, k2)))),
          group('Cómo hacer…',
            row('Figuras perfectas', h('span'), 'Dibuja y mantén el lápiz quieto medio segundo.'),
            row('Escuchar lo que se dijo al escribir', h('span'), 'Graba, luego toca un trazo con el dedo para saltar a ese momento del audio.'),
            row('Estudiar con cintas', h('span'), 'Herramienta Cinta: arrastra sobre la respuesta. Tócala para revelar.'),
            row('Instalar en iPad o iPhone', h('span'), 'Abre la web en Safari › Compartir › Agregar a pantalla de inicio.')));
      } else if (k === 'trash') { L.close(); go('trash'); }
    }
    sections.forEach(([k, n]) => navEl.append(h('button', { 'data-k': k, onclick: () => show(k) }, n)));
    show(section);
    if (UI.isPhone() && section === 'account') box.classList.remove('detail');
  }

  // ---------- código de acceso ----------
  function hashPin(p) { let x = 2166136261; for (const ch of 'trazo:' + p) { x ^= ch.charCodeAt(0); x = Math.imul(x, 16777619) >>> 0; } return x.toString(36); }
  function pinPad(title, lock) {
    return new Promise(res => {
      let v = '';
      const dots = h('div', { class: 'pin-dots' }), err = h('p', { class: 'pin-err' });
      const draw = () => { dots.innerHTML = ''; for (let i = 0; i < 4; i++) dots.append(h('i', { class: i < v.length ? 'on' : '' })); };
      const pad = h('div', { class: 'pin-pad' });
      const press = d => {
        if (d === '⌫') v = v.slice(0, -1); else if (v.length < 4) v += d;
        draw();
        if (v.length === 4) {
          if (lock) { if (hashPin(v) === Settings.pin) { L.close(); res(true); } else { err.textContent = 'Código incorrecto'; dots.classList.add('shake'); setTimeout(() => { dots.classList.remove('shake'); v = ''; draw(); }, 400); } }
          else { const out = v; setTimeout(() => { L.close(); res(out); }, 120); }
        }
      };
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].forEach(d => pad.append(d ? h('button', { onclick: () => press(d) }, d) : h('span')));
      const L = UI.layer(h('div', { class: 'pin' }, h('div', { class: 'logo', html: icon('logo') }), h('h3', {}, title), dots, err, pad, lock ? null : h('button', { class: 'link', onclick: () => { L.close(); res(null); } }, 'Cancelar')), { cls: 'center ' + (lock ? 'lock' : ''), dismiss: !lock });
      const kd = e => { if (/^\d$/.test(e.key)) press(e.key); if (e.key === 'Backspace') press('⌫'); };
      document.addEventListener('keydown', kd);
      const orig = L.close; L.close = v2 => { document.removeEventListener('keydown', kd); orig(v2); };
      draw();
    });
  }
  let locked = false;
  async function lock() { if (!Settings.pin || locked) return; locked = true; await pinPad('Introduce tu código', true); locked = false; }

  // ---------- inicio de la app ----------
  async function start() {
    shell();
    try { await DB.open(); } catch (e) { UI.alert('Sin almacenamiento', 'Este navegador no permite guardar notas (¿modo privado?).'); }
    await load();
    myTpls = (await KV.get('myTemplates')) || []; myTpls.forEach(registerMine);
    render();
    if (Settings.pin) lock();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { Editor.isOpen() && Editor.save(true); if (Settings.lockOnLeave) setTimeout(() => document.hidden && lock(), 100); }
    });
    autoPurge(); Versions.prune();
    setTimeout(() => Backup.auto(), 8000);
    if (!(await KV.get('welcomed'))) {
      await KV.set('welcomed', 1);
      const n = await createNote({ title: 'Bienvenido a Trazo', open: false, paper: { tpl: 'dot', color: '#FFFFFF' } });
      n.pages[0].items.push(
        { t: 'x', id: uid(), x: 56, y: 40, w: 700, s: 'Bienvenido a Trazo ✍️', z: 34, b: true, c: '#1C1C1E', f: 'system' },
        { t: 'x', id: uid(), x: 56, y: 110, w: 700, s: '• Escribe con el Apple Pencil, el dedo o el mouse.\n• Mantén el trazo quieto para crear figuras perfectas.\n• Graba audio: tu escritura queda sincronizada.\n• Tapa respuestas con la Cinta para estudiar.\n• Toca ✨ Notas inteligentes para resúmenes, tarjetas y chat.\n• Exporta a PDF desde «…».', z: 19, c: '#1C1C1E', f: 'system' },
        { t: 'x', id: uid(), x: 70, y: 345, w: 360, s: '¡Sorpresa! Tocaste la cinta 🎉', z: 18, c: '#2F5BEA', f: 'hand' },
        { t: 'tp', id: uid(), x1: 60, y1: 360, x2: 400, y2: 360, w: 34, c: '#7CC8C3', hid: true });
      await DB.put('notes', n);
      const m = metas.find(x => x.id === n.id); m.thumb = await makeThumb(n); await DB.put('meta', m);
      render();
    }
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      // al instalarse una versión nueva, recarga una sola vez para usarla
      const had = !!navigator.serviceWorker.controller; let done = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && !done && !Editor.isOpen()) { done = true; location.reload(); } });
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(() => {});
    }
  }

  return { help, start, go, render, refresh, newNote, createNote, openNote, importPick, templatePicker, savePageAsTemplate, settings, noteInfo, nativeOpen, get view() { return view; } };
})();

document.addEventListener('DOMContentLoaded', () => App.start());
