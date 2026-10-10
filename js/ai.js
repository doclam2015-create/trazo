// Trazo — Notas inteligentes: transcripción, resumen, tarjetas, cuestionario y chat.
// IA con tus cuentas: en el Mac usa Codex (ChatGPT), Claude o Gemini ya iniciados; en iPad/iPhone, una clave API.
// Sin IA, todo funciona igual con métodos locales.
'use strict';

const AI = (() => {
  const PROVIDERS = {
    codex: { n: 'Mi cuenta ChatGPT (Codex)', mac: true },
    claude: { n: 'Mi cuenta Claude (Claude Code)', mac: true },
    'gemini-cli': { n: 'Mi cuenta Google (Gemini CLI)', mac: true },
    openai: { n: 'OpenAI · clave API', key: true, model: 'gpt-5-mini', help: 'platform.openai.com → API keys. GPT‑5 mini: económico y confiable.' },
    gemini: { n: 'Google Gemini · clave API (nivel gratuito)', key: true, model: 'gemini-flash-latest', help: 'aistudio.google.com → Get API key. Tiene uso gratuito diario.' },
    anthropic: { n: 'Claude · clave API', key: true, model: 'claude-haiku-5-5', help: 'console.anthropic.com → API keys.' },
    local: { n: 'Sin IA (solo funciones locales)' },
  };
  const keys = () => (Settings.aiKeys = Settings.aiKeys || {});
  function provider() {
    let p = Settings.aiProvider;
    if (!p) p = UI.native ? 'codex' : (Object.keys(keys()).find(k => keys()[k]) || 'local');
    if (PROVIDERS[p] && PROVIDERS[p].mac && !UI.native) p = Object.keys(keys()).find(k => keys()[k]) || 'local';
    return p;
  }
  const available = () => { const p = provider(); return p !== 'local' && (PROVIDERS[p].mac || !!keys()[p]); };
  // compatibilidad con Settings.aiKey (indica si hay IA)
  Object.defineProperty(Settings, 'aiKey', { get: available, set: v => { if (v) keys().openai = v; }, configurable: true, enumerable: false });

  async function ask(prompt, { system = '', image = null, json = false } = {}) {
    const p = provider();
    const sys = 'Responde en español, claro y conciso. ' + system;
    if (PROVIDERS[p].mac) {
      const r = await UI.bridge({ op: 'ai', provider: p, prompt: sys + '\n\n' + prompt + (json ? '\n\nResponde SOLO con JSON válido, sin texto adicional ni bloques de código.' : ''), image: image ? image.split(',')[1] : null });
      return json ? parseJSON(r) : String(r).trim();
    }
    const key = keys()[p]; if (!key) throw new Error('Falta la clave API en Ajustes › Inteligencia artificial');
    const model = (Settings.aiModels || {})[p] || PROVIDERS[p].model;
    let res, out;
    if (p === 'openai') {
      const content = [{ type: 'text', text: prompt }]; if (image) content.push({ type: 'image_url', image_url: { url: image } });
      res = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
        body: JSON.stringify({ model, messages: [{ role: 'system', content: sys }, { role: 'user', content }], response_format: json ? { type: 'json_object' } : undefined }) });
      const d = await res.json(); if (!res.ok) throw new Error(d.error && d.error.message || res.statusText);
      out = d.choices[0].message.content;
    } else if (p === 'gemini') {
      const parts = [{ text: prompt }]; if (image) parts.push({ inline_data: { mime_type: 'image/png', data: image.split(',')[1] } });
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ system_instruction: { parts: [{ text: sys }] }, contents: [{ role: 'user', parts }], generationConfig: json ? { responseMimeType: 'application/json' } : {} }) });
      const d = await res.json(); if (!res.ok) throw new Error(d.error && d.error.message || res.statusText);
      out = (d.candidates[0].content.parts || []).map(x => x.text || '').join('');
    } else if (p === 'anthropic') {
      const content = [{ type: 'text', text: prompt + (json ? '\n\nResponde SOLO con JSON válido.' : '') }];
      if (image) content.unshift({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: image.split(',')[1] } });
      res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model, max_tokens: 4096, system: sys, messages: [{ role: 'user', content }] }) });
      const d = await res.json(); if (!res.ok) throw new Error(d.error && d.error.message || res.statusText);
      out = d.content.map(c => c.text || '').join('');
    }
    return json ? parseJSON(out) : String(out).trim();
  }
  function parseJSON(s) {
    s = String(s).trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
    const a = s.indexOf('{'), b = s.lastIndexOf('}');
    return JSON.parse(a >= 0 ? s.slice(a, b + 1) : s);
  }
  // transcripción de una grabación ya guardada
  async function transcribe(blob, lang = 'es') {
    const p = provider();
    if (UI.native) {
      // reconocimiento de voz de Apple en el Mac (gratis, en el equipo)
      const r = await UI.bridge({ op: 'transcribe', data: await UI.blobB64(blob), mime: blob.type, lang: Settings.lang });
      return r;
    }
    if (p === 'openai' && keys().openai) {
      const fd = new FormData(); fd.append('model', Settings.aiTranscribe || 'gpt-4o-mini-transcribe'); fd.append('language', lang);
      fd.append('file', new File([blob], 'audio.' + (blob.type.includes('webm') ? 'webm' : 'm4a'), { type: blob.type }));
      const res = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + keys().openai }, body: fd });
      const d = await res.json(); if (!res.ok) throw new Error(d.error && d.error.message || res.statusText);
      return d.text;
    }
    if (p === 'gemini' && keys().gemini) {
      const model = (Settings.aiModels || {}).gemini || PROVIDERS.gemini.model;
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': keys().gemini },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Transcribe textualmente este audio en español. Devuelve solo la transcripción.' }, { inline_data: { mime_type: blob.type.split(';')[0] || 'audio/mp4', data: await UI.blobB64(blob) } }] }] }) });
      const d = await res.json(); if (!res.ok) throw new Error(d.error && d.error.message || res.statusText);
      return d.candidates[0].content.parts.map(x => x.text || '').join('');
    }
    throw new Error('Para transcribir grabaciones ya hechas, configura OpenAI o Gemini en Ajustes › Inteligencia artificial. Durante la grabación, la transcripción en vivo es gratuita.');
  }
  return { PROVIDERS, provider, available, ask, transcribe, keys };
})();

// ---------- procesamiento local (sin IA) ----------
const NLP = (() => {
  const STOP = new Set('a al algo algunas algunos ante antes como con contra cual cuando de del desde donde durante e el ella ellas ellos en entre era eran es esa esas ese eso esos esta estaba estado estas este esto estos fue fueron ha han hay la las le les lo los mas más me mi mis muy no nos o os para pero poco por porque que qué se sea según ser si sí sin sobre su sus también tan te tiene tienen todo todos tu tus un una uno unos y ya yo the of and to in is it that for on with as are this be was del lo le les se son está están así cada otro otra otros otras puede pueden hace hacer debe deben además mismo misma'.split(' '));
  const sentences = t => (t || '').replace(/\s+/g, ' ').split(/(?<=[.!?¿¡])\s+(?=[A-ZÁÉÍÓÚÑ0-9])/).map(s => s.trim()).filter(s => s.length > 25);
  const words = s => (s.toLowerCase().match(/[a-záéíóúñü0-9]{3,}/g) || []).filter(w => !STOP.has(w));
  function freq(text) { const f = {}; words(text).forEach(w => (f[w] = (f[w] || 0) + 1)); return f; }
  function keywords(text, n = 10) { const f = freq(text); return Object.entries(f).filter(([w, c]) => c > 1 || w.length > 7).sort((a, b) => b[1] * Math.log(b[0].length) - a[1] * Math.log(a[0].length)).slice(0, n).map(x => x[0]); }
  function summary(text, n = 4) {
    const ss = sentences(text); if (ss.length <= n) return ss;
    const f = freq(text);
    const sc = ss.map((s, i) => { const ws = words(s); return { s, i, v: ws.reduce((a, w) => a + (f[w] || 0), 0) / Math.sqrt(ws.length + 1) * (i < 3 ? 1.15 : 1) }; });
    return sc.sort((a, b) => b.v - a.v).slice(0, n).sort((a, b) => a.i - b.i).map(x => x.s);
  }
  function cards(text, n = 10) {
    const kw = keywords(text, 40), out = [];
    for (const s of summary(text, n * 2)) {
      const k = kw.find(w => new RegExp('\\b' + w + '\\b', 'i').test(s));
      if (!k) continue;
      out.push({ q: s.replace(new RegExp('\\b' + k + '\\b', 'i'), '_____'), a: k });
      if (out.length >= n) break;
    }
    return out;
  }
  function quiz(text, n = 6) {
    const kw = keywords(text, 30);
    return cards(text, n).map(c => {
      const opts = [c.a, ...kw.filter(k => k !== c.a).sort(() => Math.random() - 0.5).slice(0, 3)].sort(() => Math.random() - 0.5);
      return { q: c.q, options: opts, answer: opts.indexOf(c.a), why: '' };
    }).filter(q => q.options.length >= 2);
  }
  function answer(text, q) {
    const qw = new Set(words(q)), ss = sentences(text);
    const sc = ss.map(s => ({ s, v: words(s).filter(w => qw.has(w)).length })).filter(x => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 3);
    return sc.length ? 'Según tus notas:\n\n• ' + sc.map(x => x.s).join('\n• ') : 'No encontré nada sobre eso en esta nota.';
  }
  return { sentences, keywords, summary, cards, quiz, answer };
})();

const Smart = (() => {
  const { h, icon, toast } = UI;
  // texto de la nota que alimenta resúmenes, tarjetas y chat
  function sourceText(note, rec) {
    const parts = [];
    if (rec) (rec.tr || []).forEach(s => parts.push(s.s));
    else {
      note.pages.forEach(p => p.items.forEach(it => { if (it.t === 'x') parts.push(it.s); }));
      (note.recs || []).forEach(r => (r.tr || []).forEach(s => parts.push(s.s)));
      if (note.hw) parts.push(...Object.values(note.hw));
      if (note.pdfText) parts.push(note.pdfText);
      if (note.yt && note.yt.tr) parts.push(note.yt.tr);
    }
    return parts.join('\n').trim();
  }

  // transcripción en vivo (Safari / iPad: reconocimiento de voz del sistema, gratuito)
  function liveTranscribe(onFinal, onInterim) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    let stopped = false, paused = false, r;
    const startR = () => {
      r = new SR(); r.lang = Settings.lang || 'es-CL'; r.continuous = true; r.interimResults = true;
      r.onresult = e => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          if (res.isFinal) { const s = res[0].transcript.trim(); if (s) onFinal({ s: s.charAt(0).toUpperCase() + s.slice(1) }); }
          else interim += res[0].transcript;
        }
        onInterim(interim.trim());
      };
      r.onerror = e => { if (e.error === 'not-allowed') stopped = true; };
      r.onend = () => { if (!stopped && !paused) setTimeout(() => { try { startR(); } catch (x) {} }, 250); };
      try { r.start(); } catch (x) {}
    };
    startR();
    return { stop() { stopped = true; try { r.stop(); } catch (x) {} }, pause() { paused = true; try { r.stop(); } catch (x) {} }, resume() { paused = false; startR(); } };
  }

  async function transcribe(note, rec) {
    const b = UI.busy('Transcribiendo grabación…');
    try {
      const text = await AI.transcribe(await Blobs.get(rec.blob));
      // reparte el texto en frases con tiempos estimados según su largo
      const ss = (text || '').split(/(?<=[.!?])\s+/).filter(Boolean), total = ss.reduce((a, s) => a + s.length, 0) || 1;
      let acc = 0; rec.tr = ss.map(s => { const seg = { s, t: acc / total * rec.dur }; acc += s.length; return seg; });
      toast('Transcripción lista');
    } catch (e) { UI.alert('No se pudo transcribir', e.message); }
    finally { b.done(); }
  }

  // ---------- panel ----------
  let cur = null;
  function panel(note, liveRec, rec) {
    if (cur) cur.close();
    note.smart = note.smart || {};
    let tab = liveRec || rec ? 'tr' : 'sum';
    const content = h('div', { class: 'sm-body' });
    const tabs = h('div', { class: 'tabs' });
    const T = [['tr', 'Transcripción'], ['sum', 'Resumen'], ['cards', 'Tarjetas'], ['quiz', 'Cuestionario'], ['chat', 'Chat']];
    const drawTabs = () => { tabs.innerHTML = ''; T.forEach(([k, n]) => tabs.append(h('button', { class: k === tab ? 'on' : '', onclick: () => { tab = k; drawTabs(); draw(); } }, n))); };
    const aiBadge = h('span', { class: 'aib' + (AI.available() ? ' on' : ''), title: 'Proveedor de IA' }, AI.available() ? AI.PROVIDERS[AI.provider()].n : 'Modo local');
    const L = UI.layer(h('div', { class: 'smart' },
      h('div', { class: 'dlg-head' }, h('span', { class: 'sm-t', html: icon('sparkle') + ' Notas inteligentes' }), aiBadge, h('button', { class: 'ib sm', onclick: () => L.close(), html: icon('close') })),
      tabs, content), { cls: 'side', onclose: () => { cur = null; } });
    cur = L;
    const save = () => Editor.isOpen() && Editor.markDirty();
    const src = () => sourceText(note, rec);
    const empty = msg => h('div', { class: 'sm-empty' }, h('span', { html: icon('sparkle') }), h('p', {}, msg));
    const run = async (label, fn) => {
      const b = UI.busy(label);
      try { await fn(); } catch (e) { UI.alert('No se pudo completar', e.message); } finally { b.done(); draw(); }
    };
    function draw() {
      content.innerHTML = '';
      if (tab === 'tr') {
        const recs = liveRec ? [liveRec] : rec ? [rec] : (note.recs || []);
        if (!recs.length) { content.append(empty('Graba una clase o reunión con el micrófono de la barra. La transcripción aparece aquí, sincronizada con lo que escribes.')); return; }
        recs.forEach(r => {
          const box = h('div', { class: 'tr-rec' }, h('h4', {}, r.name || 'Grabando ahora'));
          (r.tr || []).forEach(seg => box.append(h('p', { class: 'seg', 'data-t': seg.t, onclick: () => seek(note, r, seg.t) }, h('time', {}, UI.dur(seg.t)), seg.s)));
          if (r === liveRec) box.append(h('p', { class: 'seg live' }, r.interim || (r.sr ? '…' : 'La transcripción en vivo no está disponible en este navegador; podrás transcribir al terminar.')));
          if (!(r.tr || []).length && r !== liveRec) box.append(h('button', { class: 'btn primary', onclick: () => run('Transcribiendo…', () => transcribe(note, r).then(save)) }, 'Transcribir grabación'));
          if ((r.tr || []).length) box.append(h('div', { class: 'row' },
            h('button', { class: 'chip', onclick: () => UI.saveBlob(new Blob([r.tr.map(s => `[${UI.dur(s.t)}] ${s.s}`).join('\n')], { type: 'text/plain' }), (note.title + ' - transcripción.txt')) }, h('span', { html: icon('share') }), 'Exportar'),
            h('button', { class: 'chip', onclick: () => insertText(note, r.name + ' — transcripción', r.tr.map(s => s.s).join(' ')) }, h('span', { html: icon('plus') }), 'Insertar en la nota')));
          content.append(box);
        });
        if (liveRec) { clearInterval(draw.t); draw.t = setInterval(() => { if (!cur || tab !== 'tr') return clearInterval(draw.t); draw(); content.scrollTop = content.scrollHeight; }, 1500); }
        return;
      }
      const text = src();
      if (!text) { content.append(empty('Esta nota aún no tiene texto. Escribe con el teclado, graba audio, importa un PDF o convierte tu escritura a texto con IA.')); return; }
      if (tab === 'sum') {
        const s = note.smart.summary;
        if (s) content.append(h('div', { class: 'md', html: md(s.text) }), h('div', { class: 'row' },
          h('button', { class: 'chip', onclick: () => insertText(note, 'Resumen', s.text.replace(/[#*]/g, '')) }, h('span', { html: icon('plus') }), 'Insertar en la nota'),
          h('button', { class: 'chip', onclick: () => UI.saveBlob(new Blob([s.text], { type: 'text/markdown' }), note.title + ' - resumen.md') }, h('span', { html: icon('share') }), 'Exportar')));
        content.append(h('button', { class: 'btn primary', onclick: () => run('Resumiendo…', async () => {
          let t;
          if (AI.available()) t = await AI.ask('Resume estas notas con: un título "Idea principal" (2–3 frases), "Puntos clave" en viñetas, "Términos importantes" con definiciones breves y "Pendientes o preguntas" si los hay. Usa Markdown.\n\nNOTAS:\n' + text.slice(0, 60000));
          else t = '## Idea principal\n' + NLP.summary(text, 2).join(' ') + '\n\n## Puntos clave\n' + NLP.summary(text, Settings.summaryLen + 2).map(x => '- ' + x).join('\n') + '\n\n## Términos importantes\n' + NLP.keywords(text, 8).map(k => '- ' + k).join('\n');
          note.smart.summary = { text: t, at: Date.now() }; save();
        }) }, s ? 'Volver a generar' : 'Generar resumen'));
      } else if (tab === 'cards') {
        const cs = note.smart.cards;
        if (cs && cs.length) {
          content.append(h('p', { class: 'muted' }, cs.length + ' tarjetas · ' + cs.filter(c => (c.box || 0) >= 2).length + ' dominadas'));
          content.append(h('button', { class: 'btn primary', onclick: () => studyCards(note, cs, save) }, 'Estudiar tarjetas'));
          const list = h('div', { class: 'cards' }); cs.forEach(c => list.append(h('div', { class: 'card' }, h('b', {}, c.q), h('span', {}, c.a)))); content.append(list);
        }
        content.append(h('button', { class: 'btn' + (cs ? '' : ' primary'), onclick: () => run('Creando tarjetas…', async () => {
          let out;
          if (AI.available()) out = (await AI.ask('Crea 12 tarjetas didácticas (pregunta y respuesta breve) para estudiar estas notas. JSON: {"cards":[{"q":"…","a":"…"}]}\n\nNOTAS:\n' + text.slice(0, 60000), { json: true })).cards;
          else out = NLP.cards(text, 12);
          note.smart.cards = (out || []).map(c => ({ q: c.q, a: c.a, box: 0 })); save();
        }) }, cs ? 'Generar nuevas tarjetas' : 'Crear tarjetas'));
      } else if (tab === 'quiz') {
        const qz = note.smart.quiz;
        if (qz && qz.length) runQuiz(content, qz);
        content.append(h('button', { class: 'btn' + (qz ? '' : ' primary'), onclick: () => run('Creando cuestionario…', async () => {
          let out;
          if (AI.available()) out = (await AI.ask('Crea un cuestionario de 8 preguntas de selección múltiple (4 opciones) sobre estas notas. JSON: {"questions":[{"q":"…","options":["…","…","…","…"],"answer":0,"why":"explicación breve"}]}\n\nNOTAS:\n' + text.slice(0, 60000), { json: true })).questions;
          else out = NLP.quiz(text, 8);
          note.smart.quiz = out || []; save();
        }) }, qz ? 'Nuevo cuestionario' : 'Crear cuestionario'));
      } else if (tab === 'chat') {
        note.smart.chat = note.smart.chat || [];
        const log = h('div', { class: 'chat' });
        const paint = () => { log.innerHTML = ''; note.smart.chat.forEach(m => log.append(h('div', { class: 'msg ' + m.r, html: m.r === 'a' ? md(m.t) : UI.esc(m.t) }))); if (!note.smart.chat.length) log.append(empty('Pregunta lo que quieras sobre esta nota: “¿qué dijo el profesor sobre…?”, “explícame el punto 3 más simple”, “dame un ejemplo”.')); log.scrollTop = log.scrollHeight; };
        const inp = h('input', { class: 'field', placeholder: 'Pregunta sobre tus notas…' });
        const send = async () => {
          const q = inp.value.trim(); if (!q) return; inp.value = '';
          note.smart.chat.push({ r: 'u', t: q }); paint();
          const thinking = h('div', { class: 'msg a typing' }, '…'); log.append(thinking);
          try {
            let a;
            if (AI.available()) {
              const hist = note.smart.chat.slice(-8).map(m => (m.r === 'u' ? 'Usuario: ' : 'Asistente: ') + m.t).join('\n');
              a = await AI.ask('Eres un tutor. Usa las NOTAS como fuente principal; si agregas conocimiento general, indícalo. Responde en Markdown breve.\n\nNOTAS:\n' + text.slice(0, 50000) + '\n\nCONVERSACIÓN:\n' + hist);
            } else a = NLP.answer(text, q);
            note.smart.chat.push({ r: 'a', t: a }); save();
          } catch (e) { note.smart.chat.push({ r: 'a', t: '⚠️ ' + e.message }); }
          paint();
        };
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
        content.append(log, h('div', { class: 'chat-in' }, inp, h('button', { class: 'ib primary', onclick: send, html: icon('send') }), note.smart.chat.length ? h('button', { class: 'ib', title: 'Borrar conversación', onclick: () => { note.smart.chat = []; save(); paint(); }, html: icon('trash') }) : null));
        paint(); setTimeout(() => inp.focus(), 100);
      }
    }
    drawTabs(); draw();
  }
  function seek(note, r, t) {
    // la reproducción se maneja desde el reproductor del editor
    const a = document.querySelector('#ed .player:not(.hidden)');
    if (!a) { toast('Abre la grabación en el reproductor'); return; }
    const ev = new CustomEvent('trazo-seek', { detail: { id: r.id, t } }); document.dispatchEvent(ev);
  }
  function syncTranscript(r, t) {
    document.querySelectorAll('.smart .seg[data-t]').forEach(p => p.classList.toggle('now', +p.dataset.t <= t && (!p.nextElementSibling || !p.nextElementSibling.dataset.t || +p.nextElementSibling.dataset.t > t)));
  }
  function insertText(note, title, text) {
    if (!Editor.isOpen()) return;
    const p = Editor.newPage(); p.paper = { tpl: 'blank', color: p.paper.color };
    note.pages.push(p); Editor.layout();
    Editor.addText(note.pages.length - 1, { t: 'x', id: uid(), x: 56, y: 56, w: p.w - 112, s: title, z: 28, b: true, c: '#1C1C1E', f: 'system' });
    Editor.addText(note.pages.length - 1, { t: 'x', id: uid(), x: 56, y: 110, w: p.w - 112, s: text, z: 17, c: '#1C1C1E', f: 'system' });
    Editor.goPage(note.pages.length - 1); toast('Insertado en una página nueva');
  }
  function md(s) {
    return UI.esc(s).replace(/^### (.*)$/gm, '<h5>$1</h5>').replace(/^## (.*)$/gm, '<h4>$1</h4>').replace(/^# (.*)$/gm, '<h3>$1</h3>')
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|\s)\*(.+?)\*/g, '$1<i>$2</i>').replace(/^\s*[-•] (.*)$/gm, '<li>$1</li>').replace(/(<li>.*<\/li>\n?)+/g, m => '<ul>' + m + '</ul>').replace(/\n{2,}/g, '<br><br>').replace(/\n/g, '<br>');
  }
  function studyCards(note, cards, save) {
    const deck = cards.slice().sort((a, b) => (a.box || 0) - (b.box || 0));
    let i = 0, flipped = false;
    const card = h('div', { class: 'flash' }), info = h('p', { class: 'muted center' });
    const L = UI.layer(h('div', { class: 'dlg study-cards' }, h('div', { class: 'dlg-head' }, h('span'), h('h3', {}, 'Tarjetas'), h('button', { class: 'link b', onclick: () => L.close() }, 'Listo')), info, card,
      h('div', { class: 'row center' }, h('button', { class: 'btn', onclick: () => grade(false) }, 'Repasar de nuevo'), h('button', { class: 'btn primary', onclick: () => grade(true) }, 'Lo sabía'))), { cls: 'center' });
    const show = () => {
      if (i >= deck.length) { card.innerHTML = '<div class="face"><b>¡Sesión completa!</b><span>' + deck.filter(c => c.box >= 2).length + ' de ' + deck.length + ' dominadas</span></div>'; info.textContent = ''; return; }
      const c = deck[i]; flipped = false;
      card.className = 'flash'; card.innerHTML = ''; card.append(h('div', { class: 'face front' }, h('small', {}, 'PREGUNTA'), h('b', {}, c.q), h('span', { class: 'muted' }, 'Toca para ver la respuesta')), h('div', { class: 'face back' }, h('small', {}, 'RESPUESTA'), h('b', {}, c.a)));
      info.textContent = (i + 1) + ' / ' + deck.length;
    };
    card.onclick = () => { flipped = !flipped; card.classList.toggle('flip', flipped); };
    const grade = ok => { const c = deck[i]; if (!c) return L.close(); c.box = ok ? (c.box || 0) + 1 : 0; if (!ok) deck.push(c); i++; save(); show(); };
    show();
  }
  function runQuiz(el, qs) {
    let score = 0, answered = 0;
    const res = h('p', { class: 'quiz-score' });
    qs.forEach((q, n) => {
      const box = h('div', { class: 'quiz-q' }, h('b', {}, (n + 1) + '. ' + q.q));
      const why = h('p', { class: 'muted' });
      q.options.forEach((o, k) => box.append(h('button', { class: 'opt', onclick: e => {
        if (box.dataset.done) return; box.dataset.done = 1; answered++;
        if (k === q.answer) { score++; e.currentTarget.classList.add('ok'); } else { e.currentTarget.classList.add('bad'); box.querySelectorAll('.opt')[q.answer].classList.add('ok'); }
        if (q.why) why.textContent = q.why;
        res.textContent = `Puntaje: ${score} / ${answered}` + (answered === qs.length ? ` · ${Math.round(score / qs.length * 100)}%` : '');
      } }, o)));
      box.append(why); el.append(box);
    });
    el.append(res);
  }

  // escritura a mano → texto (IA con imagen)
  async function inkToText(note, pi, box) {
    if (!AI.available()) { UI.alert('Requiere IA', 'Configura tu cuenta o clave en Ajustes › Inteligencia artificial.'); return; }
    const p = note.pages[pi], k = 2;
    const b = box || { x: 0, y: 0, w: p.w, h: p.h };
    const c = document.createElement('canvas'); c.width = Math.round(b.w * k); c.height = Math.round(b.h * k);
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.translate(-b.x * k, -b.y * k);
    await renderPageTo(x, Object.assign({}, p, { paper: { tpl: 'blank', color: '#FFFFFF' }, bg: null }), k);
    const busy = UI.busy('Leyendo tu escritura…');
    let text;
    try { text = await AI.ask('Transcribe fielmente el texto manuscrito de la imagen. Conserva saltos de línea, viñetas y fórmulas (usa notación simple). No agregues comentarios. Si hay dibujos, ignóralos.', { image: c.toDataURL('image/png') }); }
    catch (e) { busy.done(); UI.alert('No se pudo convertir', e.message); return; }
    busy.done();
    note.hw = note.hw || {}; note.hw[p.id] = text; Editor.markDirty();
    const ta = h('textarea', { class: 'field big' }); ta.value = text;
    const r = await UI.dialog({ title: 'Texto reconocido', body: h('div', {}, h('p', { class: 'muted' }, 'Ya puedes buscar este texto. También puedes copiarlo o insertarlo.'), ta),
      buttons: [{ t: 'Cerrar', v: 0 }, { t: 'Copiar', v: 'copy' }, { t: 'Insertar como texto', v: 'ins', primary: true }] });
    if (r === 'copy') { try { await navigator.clipboard.writeText(ta.value); toast('Copiado'); } catch (e) {} }
    if (r === 'ins') Editor.addText(pi, { t: 'x', id: uid(), x: b.x, y: b.y + b.h + 12 > p.h - 60 ? b.y : b.y + b.h + 12, w: Math.max(200, Math.min(b.w, p.w - b.x - 24)), s: ta.value, z: Settings.textSize, c: '#1C1C1E', f: Settings.textFont });
  }

  // YouTube → nota con video, transcripción y resumen
  async function youtube(note, done) {
    const url = await UI.prompt('Enlace de YouTube', '', 'https://youtu.be/…');
    if (!url) return;
    const m = url.match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([\w-]{11})/); if (!m) { toast('Enlace no válido'); return; }
    note.yt = { id: m[1], url };
    let tr = '';
    if (UI.native) { const b = UI.busy('Obteniendo transcripción…'); try { tr = await UI.bridge({ op: 'yt', id: m[1] }); } catch (e) {} b.done(); }
    if (!tr) {
      const ta = h('textarea', { class: 'field big', placeholder: 'Opcional: pega aquí la transcripción (en YouTube: … › Mostrar transcripción)' });
      const r = await UI.dialog({ title: 'Transcripción del video', body: ta, buttons: [{ t: 'Omitir', v: 0 }, { t: 'Usar', v: 1, primary: true }] });
      if (r) tr = ta.value.replace(/^\d+:\d+(:\d+)?\s*$/gm, '').replace(/\n+/g, ' ').trim();
    }
    note.yt.tr = tr;
    done && done();
    if (tr && Editor.isOpen()) {
      insertText(note, 'Transcripción del video', tr.slice(0, 20000));
      if (AI.available() || tr.length > 200) panel(note);
    }
  }
  return { liveTranscribe, transcribe, panel, inkToText, youtube, sourceText, syncTranscript, md };
})();
