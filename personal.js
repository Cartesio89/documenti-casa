/* Sezione "Doc": documenti personali non critici (CV, attestati…), uno spazio per persona protetto da PIN.
 * Il PIN separa gli spazi dentro l'app: è salvato solo come impronta (PBKDF2), mai in chiaro.
 * NON è cifratura: i file stanno nel repo dati come gli altri documenti di casa. Per i documenti
 * importanti c'è il Vault. Caricato prima di app.js: usa le sue funzioni solo a runtime. */
'use strict';

const PS = { space: null, hiddenAt: 0, lastActive: 0 };
const spaces = () => Object.values(DB.spaces || {}).filter((x) => !x.deleted).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
const pcats = (sid) => Object.values(DB.pcats || {}).filter((c) => !c.deleted && c.spaceId === sid).sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name, 'it'));
const pdocs = (sid) => Object.values(DB.pdocs || {}).filter((d) => !d.deleted && d.spaceId === sid);
const curSpace = () => (PS.space && DB.spaces[PS.space] && !DB.spaces[PS.space].deleted ? DB.spaces[PS.space] : null);
const MIME = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', doc: 'application/msword', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', txt: 'text/plain', zip: 'application/zip' };
const extOf = (name) => { const m = String(name || '').toLowerCase().match(/\.([a-z0-9]{1,5})$/); return m ? m[1] : 'bin'; };

function pTouch() { PS.lastActive = now(); }
function pLock(msg) { if (!PS.space) return; PS.space = null; if (['doc', 'pcat', 'pdoc', 'pnuovo'].includes(parseRoute().name)) { location.replace('#/doc'); render(true); } if (msg) toast(msg); }
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') PS.hiddenAt = now();
  else if (PS.space && PS.hiddenAt && now() - PS.hiddenAt > 5 * 60 * 1000) pLock('Spazio Doc chiuso: l\'app era in background');
});
setInterval(() => { if (PS.space && now() - PS.lastActive > 10 * 60 * 1000) pLock('Spazio Doc chiuso per inattività'); }, 20000);
['pointerdown', 'keydown'].forEach((ev) => document.addEventListener(ev, () => { if (PS.space) pTouch(); }, { passive: true }));

async function pinHash(pin, saltB64, iter) {
  const salt = saltB64 ? Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0)) : crypto.getRandomValues(new Uint8Array(16));
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, base, 256));
  const b64 = (u8) => btoa(String.fromCharCode(...u8));
  return { salt: b64(salt), hash: b64(bits), iter };
}
const validPin = (p) => /^(\d{4}|\d{6})$/.test(p);
function touchSpace(sp, patch) { Object.assign(sp, patch, { updatedAt: now() }); persist({ render: false }); }

/* ---------------- viste */
function pinPanel(title, help, onOk, confirm2) {
  const f = h('form', { class: 'panel vault-lock', onsubmit: async (e) => {
    e.preventDefault();
    const p1 = $('#p-pin').value.trim(), p2 = confirm2 ? $('#p-pin2').value.trim() : p1;
    if (!validPin(p1)) { toast('Il PIN deve avere 4 o 6 cifre'); return; }
    if (p1 !== p2) { toast('I due PIN non coincidono'); return; }
    const b = f.querySelector('button[type=submit]'); b.disabled = true;
    try { await onOk(p1); } catch (err) { b.disabled = false; toast(err.message); $('#p-pin').value = ''; $('#p-pin').focus(); }
  } },
    h('div', { class: 'vault-badge' }, icon('key', 1.8)),
    h('h2', null, title),
    help ? h('p', { class: 'help' }, help) : null,
    h('div', { class: 'field' }, h('label', { for: 'p-pin' }, 'PIN (4 o 6 cifre)'),
      h('input', { class: 'input pin-input', id: 'p-pin', type: 'password', inputmode: 'numeric', pattern: '[0-9]*', maxlength: 6, autocomplete: 'off', autofocus: true })),
    confirm2 ? h('div', { class: 'field' }, h('label', { for: 'p-pin2' }, 'Ripeti il PIN'),
      h('input', { class: 'input pin-input', id: 'p-pin2', type: 'password', inputmode: 'numeric', pattern: '[0-9]*', maxlength: 6, autocomplete: 'off' })) : null,
    h('button', { class: 'btn primary block', type: 'submit', style: 'margin-top:14px' }, icon('check'), 'Conferma'));
  return f;
}
function viewDocHome(route) {
  const sp = curSpace();
  if (sp) return viewDocSpace(sp);
  const sel = route.q.get('s') ? DB.spaces[route.q.get('s')] : null;
  if (sel && !sel.deleted) {
    const first = !sel.pin;
    return {
      top: topBar('Doc · ' + sel.name, { back: 'doc', small: true }),
      body: [h('div', { class: 'detail' }, pinPanel(first ? 'Scegli il tuo PIN' : 'Inserisci il PIN',
        first ? 'Primo accesso: scegli un PIN di 4 o 6 cifre solo tuo. Servirà ogni volta per aprire questo spazio.' : null,
        async (pin) => {
          if (first) touchSpace(sel, { pin: await pinHash(pin, null, 150000) });
          else { const t = await pinHash(pin, sel.pin.salt, sel.pin.iter); if (t.hash !== sel.pin.hash) throw new Error('PIN sbagliato'); }
          PS.space = sel.id; pTouch(); lsSet('dc.lastSpace', sel.id);
          location.replace('#/doc'); render(true);
        }, first))],
    };
  }
  const last = lsGet('dc.lastSpace', '');
  const list = spaces().sort((a, b) => (b.id === last) - (a.id === last));
  return {
    top: topBar('Doc'),
    body: [h('div', { class: 'detail' },
      h('p', { class: 'help', style: 'margin:0' }, 'Documenti personali a portata di mano (CV, attestati…). Ogni persona ha il suo spazio con il suo PIN. Per documenti d\'identità e dati riservati usa il Vault.'),
      list.length ? h('div', { class: 'list' }, list.map((x) => h('button', { class: 'card-link', onclick: () => go('doc?s=' + x.id) },
        h('span', { class: 'ic' }, icon(x.pin ? 'key' : 'plus')),
        h('span', { class: 't' }, h('b', null, x.name), h('span', null, x.pin ? `${pdocs(x.id).length} documenti · PIN` : 'Primo accesso: scegli il PIN')),
        h('span', { class: 'chev' }, icon('chev'))))) : null,
      h('button', { class: 'btn', onclick: () => {
        const n = prompt('Nome del nuovo spazio (es. il tuo nome)');
        if (!n || !n.trim()) return;
        const x = { id: uid('s'), name: n.trim(), pin: null, createdAt: now(), updatedAt: now() };
        DB.spaces[x.id] = x; persist({ render: false }); go('doc?s=' + x.id);
      } }, icon('plus'), 'Crea uno spazio'))],
  };
}
function viewDocSpace(sp) {
  const cats = pcats(sp.id);
  const all = pdocs(sp.id);
  const loose = all.filter((d) => !cats.some((c) => c.id === d.catId));
  return {
    top: [...topBar('Doc · ' + sp.name), null],
    body: [h('div', { class: 'detail' },
      h('div', { class: 'list' }, cats.map((c) => {
        const n = all.filter((d) => d.catId === c.id).length;
        return h('button', { class: 'card-link', onclick: () => go('pcat/' + c.id) },
          h('span', { class: 'ic' }, icon('folder')), h('span', { class: 't' }, h('b', null, c.name), h('span', null, `${n} documenti`)), h('span', { class: 'chev' }, icon('chev')));
      })),
      loose.length ? [h('div', { class: 'group-title' }, 'Senza categoria'), h('div', { class: 'list' }, loose.map(pDocRow))] : null,
      cats.length || all.length ? null : h('div', { class: 'empty' }, 'Crea una categoria (es. "CV", "Attestati") e aggiungi i documenti con il +.'),
      h('div', { class: 'inline', style: 'margin-top:14px' },
        h('button', { class: 'btn', onclick: () => {
          const n = prompt('Nome della categoria (es. "Attestati", "CV con portfolio")');
          if (!n || !n.trim()) return;
          const c = { id: uid('c'), spaceId: sp.id, name: n.trim(), order: now(), createdAt: now(), updatedAt: now() };
          DB.pcats[c.id] = c; persist();
        } }, icon('plus'), 'Nuova categoria'),
        h('button', { class: 'btn', onclick: () => pLock('Spazio chiuso') }, icon('lock'), 'Esci'),
        h('button', { class: 'btn ghost', onclick: async () => {
          const old = prompt('PIN attuale'); if (old == null) return;
          const t = await pinHash(old.trim(), sp.pin.salt, sp.pin.iter); if (t.hash !== sp.pin.hash) { toast('PIN sbagliato'); return; }
          const n1 = prompt('Nuovo PIN (4 o 6 cifre)'); if (!n1 || !validPin(n1.trim())) { toast('PIN non valido'); return; }
          if (prompt('Ripeti il nuovo PIN') !== n1) { toast('I PIN non coincidono'); return; }
          touchSpace(sp, { pin: await pinHash(n1.trim(), null, 150000) }); toast('PIN cambiato');
        } }, 'Cambia PIN')))],
    fab: fab('Nuovo documento', () => go('pnuovo')),
  };
}
function pDocRow(d) {
  const files = d.pages || [];
  return h('button', { class: 'card-link', onclick: () => go('pdoc/' + d.id) },
    h('span', { class: 'ic' }, icon('file')),
    h('span', { class: 't' }, h('b', null, d.title || '(senza titolo)'),
      h('span', null, files.map((p) => (p.type || '').toUpperCase()).filter((v, i, a) => a.indexOf(v) === i).join(' · ') + ` · ${files.length} file`)),
    h('span', { class: 'chev' }, icon('chev')));
}
function needSpace() { const sp = curSpace(); if (!sp) { setTimeout(() => location.replace('#/doc'), 0); } return sp; }
function viewPCat(route) {
  const sp = needSpace(); const c = DB.pcats[route.arg];
  if (!sp || !c || c.deleted || c.spaceId !== sp.id) return { top: topBar('Doc', { back: 'doc', small: true }), body: [] };
  const arr = pdocs(sp.id).filter((d) => d.catId === c.id).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return {
    top: topBar(c.name, { back: 'doc', small: true }),
    body: [h('div', { class: 'detail' },
      arr.length ? h('div', { class: 'list' }, arr.map(pDocRow)) : h('div', { class: 'empty' }, 'Nessun documento in questa categoria.'),
      h('div', { class: 'inline', style: 'margin-top:14px' },
        h('button', { class: 'btn ghost', onclick: () => { const n = prompt('Nuovo nome della categoria', c.name); if (n && n.trim()) { c.name = n.trim(); c.updatedAt = now(); persist(); } } }, icon('pen'), 'Rinomina'),
        h('button', { class: 'btn ghost danger', onclick: () => {
          if (arr.length && !confirm(`La categoria contiene ${arr.length} documenti: restano nello spazio "senza categoria". Elimino la categoria?`)) return;
          c.deleted = true; c.updatedAt = now(); persist({ render: false }); goBack('doc');
        } }, icon('trash'), 'Elimina categoria')))],
    fab: fab('Nuovo documento', () => go('pnuovo?c=' + c.id)),
  };
}
async function pStoreFiles(d, files, start) {
  const out = []; let i = start;
  for (const f of files) {
    i++;
    let blob = f, type = extOf(f.name);
    if (/^image\//.test(f.type) && !/gif|svg/.test(f.type)) { try { const c = await compressImage(f); blob = c.blob; type = 'jpg'; } catch (e) { /* lascio l'originale */ } }
    const path = `files/doc/${d.spaceId}/${d.id}-${i}-${now().toString(36)}.${type}`;
    await IDB.put(path, blob);
    out.push({ path, type, name: f.name, size: blob.size });
  }
  await refreshPending();
  return out;
}
function pickAny(onFiles) {
  const inp = h('input', { type: 'file', multiple: true, style: 'display:none' });
  inp.addEventListener('change', () => { const fl = [...inp.files]; inp.remove(); if (fl.length) onFiles(fl); });
  document.body.append(inp); inp.click();
}
let pDraft = null;
function viewPNew(route) {
  const sp = needSpace(); if (!sp) return { top: topBar('Doc', { back: 'doc', small: true }), body: [] };
  if (!pDraft || pDraft.key !== route.q.toString()) pDraft = { key: route.q.toString(), title: '', notes: '', catId: route.q.get('c') || (pcats(sp.id)[0] || {}).id || '', files: [] };
  const D = pDraft;
  const redraw = () => { const y = window.scrollY; render(true); window.scrollTo(0, y); };
  return {
    top: topBar('Nuovo documento', { back: 'doc', small: true }),
    body: [h('div', { class: 'detail' },
      h('textarea', { class: 'title-input', rows: 1, placeholder: 'Titolo (es. CV inglese 2026)', value: D.title, oninput: (e) => { D.title = e.target.value; } }),
      h('div', { class: 'panel props' },
        h('div', { class: 'field' }, h('label', null, 'Categoria'),
          h('select', { class: 'input', onchange: (e) => { if (e.target.value === '__new') { const n = prompt('Nome della nuova categoria'); if (n && n.trim()) { const c = { id: uid('c'), spaceId: sp.id, name: n.trim(), order: now(), createdAt: now(), updatedAt: now() }; DB.pcats[c.id] = c; persist({ render: false }); D.catId = c.id; } redraw(); } else D.catId = e.target.value; } },
            h('option', { value: '' }, 'Senza categoria'), pcats(sp.id).map((c) => h('option', { value: c.id, selected: c.id === D.catId }, c.name)), h('option', { value: '__new' }, '+ Nuova categoria…'))),
        h('div', { class: 'field' }, h('label', null, 'Note'), h('textarea', { class: 'input', value: D.notes, oninput: (e) => { D.notes = e.target.value; } }))),
      h('div', { class: 'panel' }, h('h2', null, 'File', h('span', { class: 'prog' }, D.files.length || '')),
        D.files.length ? h('div', { class: 'list' }, D.files.map((f, i) => h('div', { class: 'proj-row' }, icon('file'), h('span', { style: 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis' }, f.name),
          h('button', { class: 'icon-btn plain', 'aria-label': 'Togli', onclick: () => { D.files.splice(i, 1); redraw(); } }, icon('close'))))) : h('p', { class: 'help', style: 'margin:0 0 10px' }, 'PDF, Word, immagini o altri file.'),
        h('div', { class: 'inline' },
          h('button', { class: 'btn', onclick: () => pickFiles(true, false, (fl) => { D.files.push(...fl); redraw(); }) }, icon('camera'), 'Scatta foto'),
          h('button', { class: 'btn', onclick: () => pickAny((fl) => { D.files.push(...fl); if (!D.title && fl[0]) D.title = fl[0].name.replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' '); redraw(); }) }, icon('upload'), 'Carica file'))),
      h('button', { class: 'btn primary block', onclick: async (e) => {
        if (!D.title.trim()) { toast('Dai un titolo al documento'); return; }
        const b = e.currentTarget; b.disabled = true; b.textContent = 'Salvo…';
        const d = { id: uid('p'), spaceId: sp.id, catId: D.catId || null, title: D.title.trim(), notes: D.notes.trim(), pages: [], createdAt: now(), updatedAt: now() };
        d.pages = await pStoreFiles(d, D.files, 0);
        DB.pdocs[d.id] = d; pDraft = null; persist({ render: false });
        location.replace('#/pdoc/' + d.id); toast('Salvato');
      } }, icon('check'), 'Salva'))],
  };
}
async function pOpenFile(p) {
  try {
    const blob = await fileBlob(p.path);
    const typed = new Blob([blob], { type: MIME[p.type] || 'application/octet-stream' });
    const url = URL.createObjectURL(typed);
    if (p.type === 'jpg' || p.type === 'pdf') window.open(url, '_blank', 'noopener');
    else { const a = h('a', { href: url, download: p.name || ('documento.' + p.type) }); document.body.append(a); a.click(); a.remove(); }
  } catch (e) { alert('Non riesco ad aprire il file: ' + e.message); }
}
function viewPDoc(route) {
  const sp = needSpace(); const d = DB.pdocs[route.arg];
  if (!sp || !d || d.deleted || d.spaceId !== sp.id) return { top: topBar('Doc', { back: 'doc', small: true }), body: [h('div', { class: 'empty' }, 'Documento non trovato.')] };
  const set = (patch, r) => { Object.assign(d, patch, { updatedAt: now() }); persist({ render: !!r }); };
  return {
    top: topBar((DB.pcats[d.catId] || {}).name || 'Documento', { back: d.catId ? 'pcat/' + d.catId : 'doc', small: true }),
    body: [h('div', { class: 'detail' },
      h('textarea', { class: 'title-input', rows: 1, value: d.title, onchange: (e) => set({ title: e.target.value.trim() || d.title }) }),
      h('div', { class: 'panel' }, h('h2', null, 'File', h('span', { class: 'prog' }, (d.pages || []).length)),
        h('div', { class: 'list' }, (d.pages || []).map((p, i) => h('div', { class: 'proj-row' },
          h('span', { class: 'badge lbl', style: '--c:#2F4BD8' }, (p.type || '').toUpperCase()),
          h('button', { class: 'link-btn', style: 'flex:1;min-width:0;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap', onclick: () => pOpenFile(p) }, p.name || 'file'),
          h('button', { class: 'icon-btn plain', 'aria-label': 'Apri o scarica', onclick: () => pOpenFile(p) }, icon(p.type === 'jpg' || p.type === 'pdf' ? 'ext' : 'download')),
          h('button', { class: 'icon-btn plain', 'aria-label': 'Togli', onclick: () => { if (confirm('Togliere questo file dal documento?')) set({ pages: d.pages.filter((_, k) => k !== i) }, true); } }, icon('trash'))))),
        h('div', { class: 'inline', style: 'margin-top:10px' },
          h('button', { class: 'btn', onclick: () => pickAny(async (fl) => { const st = await pStoreFiles(d, fl, (d.pages || []).length); set({ pages: [...(d.pages || []), ...st] }, true); }) }, icon('upload'), 'Aggiungi file'))),
      h('div', { class: 'panel props' },
        h('div', { class: 'field' }, h('label', null, 'Categoria'),
          h('select', { class: 'input', onchange: (e) => set({ catId: e.target.value || null }, true) },
            h('option', { value: '' }, 'Senza categoria'), pcats(sp.id).map((c) => h('option', { value: c.id, selected: c.id === d.catId }, c.name)))),
        h('div', { class: 'field' }, h('label', null, 'Note'), h('textarea', { class: 'input', value: d.notes || '', onchange: (e) => set({ notes: e.target.value }) }))),
      h('button', { class: 'btn danger', onclick: () => { if (!confirm('Eliminare il documento?')) return; set({ deleted: true }); goBack('doc'); toast('Eliminato'); } }, icon('trash'), 'Elimina'))],
  };
}
