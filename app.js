/* Documenti casa — app a file singolo, nessuna build (stessa base di Lista personale).
   Dati: localStorage (cache) + data.json in un repo GitHub privato.
   Foto e PDF: file nello stesso repo privato (cartella files/), con coda locale (IndexedDB) finché non sono caricati.
   Mail: uno script Google Apps Script scrive inbox.json nel repo; l'app lo legge e crea i documenti "da pagare". */
'use strict';

/* ================================================================ utilità */
const $ = (s, r = document) => r.querySelector(s);
const now = () => Date.now();
const uid = (p) => p + now().toString(36) + Math.random().toString(36).slice(2, 7);
const LS = { data: 'dc.data', sha: 'dc.sha', dirty: 'dc.dirty', cfg: 'dc.cfg', ui: 'dc.ui', inbox: 'dc.inbox', cf: 'dc.cf' };
function lsGet(k, def) { try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* quota o privato */ } }

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v; // solo stringhe statiche (icone)
      else if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value') el.value = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const ICONS = {
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  chev: '<path d="M9 5l7 7-7 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  left: '<path d="M14 6l-6 6 6 6"/>',
  right: '<path d="M10 6l6 6-6 6"/>',
  euro: '<path d="M17 6.5A6.5 6.5 0 1 0 17 17.5"/><path d="M4 10.5h9M4 13.5h9"/>',
  box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  car: '<path d="M5 16V11l2-5h10l2 5v5"/><path d="M3 16h18v3H3zM5 11h14"/><circle cx="7.5" cy="16" r="1"/><circle cx="16.5" cy="16" r="1"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
  bolt: '<path d="M13 3L5 13h6l-1 8 8-10h-6z"/>',
  building: '<path d="M5 21V4h10v17M15 9h4v12M3 21h18M8 8h4M8 12h4M8 16h4"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/>',
  bank: '<path d="M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18"/>',
  hammer: '<path d="M14 6l4 4M4 20l9-9M12 4l5 5-3 3-5-5z"/>',
  sofa: '<path d="M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3"/><path d="M3 11h4v4h10v-4h4v6H3zM5 17v2M19 17v2"/>',
  file: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h7M9 16h7"/>',
  pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>',
  dots: '<circle cx="6" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18" cy="12" r="1.3"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M4 18l5-5 4 4 3-3 4 4"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M4 7l8 6 8-6"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
  share: '<path d="M12 15V4M8 8l4-4 4 4"/><path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"/>',
  scan: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>',
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  sync: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20v-4h-4"/>',
};
function icon(name, strokeWidth) {
  return h('span', { class: 'ic-wrap', 'aria-hidden': 'true', style: 'display:inline-flex', html:
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth || 2}" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>` });
}
function safeUrl(u) {
  if (!u) return '';
  u = String(u).trim();
  if (/^www\./i.test(u)) u = 'https://' + u;
  return /^(https?:|mailto:)/i.test(u) ? u : '';
}
const fmtDate = (iso, full) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: full || y !== new Date().getFullYear() ? 'numeric' : undefined });
};
const fmtEuro = (n) => (n == null || n === '' || isNaN(n)) ? '' : Number(n).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
const todayISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
function addDaysISO(iso, n) { const [y, m, d] = iso.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1, d + n)); return dt.toISOString().slice(0, 10); }
function parseEuro(s) {
  if (s == null) return null;
  s = String(s).trim().replace(/[€\s]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isFinite(n) ? Math.round(n * 100) / 100 : null;
}
const euroInput = (n) => (n == null ? '' : String(n.toFixed(2)).replace('.', ','));

let toastTimer;
function toast(msg, actionLabel, action) {
  const t = $('#toast');
  t.replaceChildren(...[msg, actionLabel ? h('button', { onclick: () => { action(); t.classList.remove('show'); } }, actionLabel) : null].filter(Boolean));
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), actionLabel ? 5000 : 2400);
}

/* ================================================================ categorie e stati */
const CATS = [
  { id: 'utenze', name: 'Utenze', icon: 'bolt', subs: ['Luce e gas', 'Luce', 'Gas', 'Acqua', 'Internet e telefono', 'Rifiuti', 'Altro'] },
  { id: 'condominio', name: 'Condominio', icon: 'building', subs: ['Rate', 'Spese straordinarie', 'Verbali e comunicazioni', 'Altro'] },
  { id: 'assicurazioni', name: 'Assicurazioni', icon: 'shield', subs: ['Casa', 'Auto e moto', 'Vita e salute', 'Altro'] },
  { id: 'mutuo', name: 'Mutuo', icon: 'bank', subs: ['Contratto', 'Rate', 'Comunicazioni banca', 'Altro'] },
  { id: 'lavori', name: 'Lavori e ristrutturazioni', icon: 'hammer', works: true, subs: ['Preventivi', 'Contratti', 'Fatture', 'Pagamenti', 'Pratiche e permessi', 'Altro'] },
  { id: 'elettro', name: 'Elettrodomestici e mobili', icon: 'sofa', subs: ['Scontrini', 'Pagamenti', 'Garanzie'] },
  { id: 'contratti', name: 'Contratti', icon: 'pen', subs: ['Affitto', 'Fornitura', 'Servizi', 'Altro'] },
  { id: 'altro', name: 'Altro', icon: 'dots', subs: [] },
];
const MULTE = { id: 'multe', name: 'Multe', icon: 'car', subs: [] };
const catById = (id) => CATS.find((c) => c.id === id) || (id === 'multe' ? MULTE : null);
const STATUS = {
  da_pagare: { label: 'Da pagare', short: 'Da pagare', cls: 'st-due' },
  addebitata: { label: 'Addebito', short: 'Addebito', cls: 'st-debit' },
  pagato: { label: 'Pagato', short: 'Pagato', cls: 'st-paid' },
  none: { label: '–', short: '', cls: '' },
};
const OPEN = (d) => d.status === 'da_pagare' || d.status === 'addebitata';
const dueLabel = (d) => (d.category === 'elettro' && d.sub === 'Garanzie') ? 'Fine garanzia' : 'Scadenza';

/* ================================================================ dati */
const DEFAULT_SENDERS = [{ id: 's_engie', match: 'engie', label: 'Engie', category: 'utenze', sub: 'Luce e gas', status: 'addebitata', enabled: true }];
function emptyDB() {
  return {
    version: 1,
    meta: { updatedAt: 0, calendarEmails: ['martino.cicerani@gmail.com', ''], calendarAuto: true, mailbox: 'martinoselly@gmail.com', mailSenders: DEFAULT_SENDERS },
    docs: {}, works: {}, tags: {}, mail: {}, homes: {},
  };
}
const MAIN_HOME = { id: 'h_main', name: 'Casa', address: '', order: 0, createdAt: 0, updatedAt: 0 };
let DB = lsGet(LS.data, null) || emptyDB();
for (const k of ['docs', 'works', 'tags', 'mail', 'homes']) if (!DB[k]) DB[k] = {};
/* la prima casa ha un id fisso: due dispositivi non ne creano due copie */
function ensureHome() { if (!DB.homes.h_main) DB.homes.h_main = Object.assign({}, MAIN_HOME); }
ensureHome();
const homes = () => Object.values(DB.homes).filter((x) => !x.deleted).sort((a, b) => (a.order || 0) - (b.order || 0));
const multiHome = () => homes().length > 1;
const homeById = (id) => (id && DB.homes[id] && !DB.homes[id].deleted ? DB.homes[id] : null);
const docHomeId = (d) => (homeById(d.homeId) ? d.homeId : homes()[0].id);
const docHome = (d) => homeById(docHomeId(d));
function inHomeFilter(d) {
  if (!multiHome() || !UI.home || UI.home === 'all' || !homeById(UI.home)) return true;
  if (d.section === 'multe') return false;
  return docHomeId(d) === UI.home;
}
function defaultHomeId() { return homeById(UI.home) ? UI.home : (homeById(lsGet('dc.lastHome', '')) ? lsGet('dc.lastHome', '') : homes()[0].id); }
function homeChips() {
  if (!multiHome()) return null;
  const cur = homeById(UI.home) ? UI.home : 'all';
  return h('div', { class: 'chips' }, [['all', 'Tutte le case'], ...homes().map((x) => [x.id, x.name])].map(([k, l]) =>
    h('button', { class: 'chip', 'aria-pressed': String(cur === k), onclick: () => setUI({ home: k }) }, k === 'all' ? null : icon('home'), l)));
}
function homeSelect(value, onChange) {
  return h('select', { class: 'input', 'aria-label': 'Abitazione', onchange: (e) => onChange(e.target.value) },
    homes().map((x) => h('option', { value: x.id, selected: x.id === value }, x.name)));
}
const docs = () => Object.values(DB.docs).filter((d) => !d.deleted);
const works = () => Object.values(DB.works).filter((w) => !w.deleted).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
const work = (id) => (id && DB.works[id] && !DB.works[id].deleted ? DB.works[id] : null);
const tags = () => Object.values(DB.tags).filter((t) => !t.deleted).sort((a, b) => a.name.localeCompare(b.name, 'it'));
const tag = (id) => (id && DB.tags[id] && !DB.tags[id].deleted ? DB.tags[id] : null);
const PALETTE = ['#2F4BD8', '#0F7B6C', '#9A3A06', '#7A3FD1', '#B0306A', '#1F6F9E', '#3D7A1F', '#8A6D00', '#A1491F', '#5B3FA0'];
const docYear = (d) => (d.docDate || new Date(d.createdAt || now()).toISOString()).slice(0, 4);

function persist(opts = {}) {
  lsSet(LS.data, DB);
  lsSet(LS.dirty, true);
  Sync.schedule();
  if (opts.render !== false) render();
}
function updateDoc(id, patch, opts) {
  const d = DB.docs[id]; if (!d) return;
  Object.assign(d, patch, { updatedAt: now() });
  persist(opts);
}
function updateMeta(patch, opts) { Object.assign(DB.meta, patch, { updatedAt: now() }); persist(opts); }
function newDoc(fields) {
  const id = fields.id || uid('d');
  const d = Object.assign({
    id, title: '', section: 'casa', category: 'altro', sub: '', workId: null, status: 'none', prevStatus: null,
    amount: null, docDate: todayISO(), dueDate: null, paidAt: null, tags: [], notes: '', pages: [],
    source: 'manual', unseen: false, createdAt: now(), updatedAt: now(),
  }, fields, { id });
  DB.docs[id] = d;
  return d;
}
function deleteDoc(id) {
  const prev = JSON.parse(JSON.stringify(DB.docs[id]));
  updateDoc(id, { deleted: true }, { render: false });
  toast('Documento eliminato', 'Annulla', () => { DB.docs[id] = Object.assign(prev, { updatedAt: now() }); persist(); });
}
function togglePaid(id) {
  const d = DB.docs[id];
  if (OPEN(d)) {
    const prev = d.status;
    updateDoc(id, { status: 'pagato', prevStatus: prev, paidAt: todayISO(), unseen: false });
    toast(d.section === 'multe' ? 'Multa segnata come pagata' : 'Spostato in Pagati', 'Annulla', () => updateDoc(id, { status: prev, paidAt: null }));
  } else if (d.status === 'pagato') {
    const back = d.prevStatus && d.prevStatus !== 'pagato' ? d.prevStatus : 'da_pagare';
    updateDoc(id, { status: back, paidAt: null });
    toast('Rimesso tra i da pagare', 'Annulla', () => updateDoc(id, { status: 'pagato', paidAt: todayISO() }));
  }
}
function createWork(name, homeId) {
  const w = { id: uid('w'), name, notes: '', homeId: homeId || null, createdAt: now(), updatedAt: now() };
  DB.works[w.id] = w; persist({ render: false });
  return w;
}
function createTag(name) {
  const existing = tags().find((t) => t.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing;
  const t = { id: uid('t'), name, color: PALETTE[tags().length % PALETTE.length], createdAt: now(), updatedAt: now() };
  DB.tags[t.id] = t; persist({ render: false });
  return t;
}

/* ---------------- merge: per elemento vince l'ultima modifica */
const MAPS = ['docs', 'works', 'tags', 'mail', 'homes'];
function mergeMaps(a, b) {
  const out = Object.assign({}, a);
  for (const [k, v] of Object.entries(b || {})) {
    const cur = out[k];
    if (!cur || (v.updatedAt || 0) > (cur.updatedAt || 0)) out[k] = v;
  }
  return out;
}
function mergeDB(local, remote) {
  const out = { version: 1, meta: (remote.meta && (remote.meta.updatedAt || 0) > ((local.meta && local.meta.updatedAt) || 0)) ? remote.meta : (local.meta || remote.meta) };
  for (const k of MAPS) out[k] = mergeMaps(local[k] || {}, remote[k] || {});
  return out;
}
function differs(merged, remote) {
  if ((merged.meta.updatedAt || 0) !== ((remote.meta && remote.meta.updatedAt) || 0)) return true;
  for (const key of MAPS) {
    const r = remote[key] || {};
    for (const [id, v] of Object.entries(merged[key] || {})) if (!r[id] || (r[id].updatedAt || 0) !== (v.updatedAt || 0)) return true;
  }
  return false;
}

/* ================================================================ file: coda locale (IndexedDB) + cache */
const IDB = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      const r = indexedDB.open('documenti-casa', 2);
      r.onupgradeneeded = () => { for (const st of ['pending', 'cache', 'shared']) if (!r.result.objectStoreNames.contains(st)) r.result.createObjectStore(st); };
      r.onsuccess = () => { this.db = r.result; res(this.db); };
      r.onerror = () => rej(r.error);
    });
  },
  async tx(mode, fn, store = 'pending') {
    const db = await this.open();
    return new Promise((res, rej) => {
      const t = db.transaction(store, mode); const st = t.objectStore(store);
      const req = fn(st);
      t.oncomplete = () => res(req && req.result); t.onerror = () => rej(t.error);
    });
  },
  put(path, blob) { return this.tx('readwrite', (s) => s.put(blob, path)); },
  get(path) { return this.tx('readonly', (s) => s.get(path)); },
  del(path) { return this.tx('readwrite', (s) => s.delete(path)); },
  keys() { return this.tx('readonly', (s) => s.getAllKeys()); },
  cachePut(path, blob) { return this.tx('readwrite', (s) => s.put(blob, path), 'cache'); },
  cacheGet(path) { return this.tx('readonly', (s) => s.get(path), 'cache'); },
  sharedTake() { return this.tx('readonly', (s) => s.get('last'), 'shared').then((v) => this.tx('readwrite', (s) => s.delete('last'), 'shared').then(() => v)); },
};
const fileCache = new Map(); // path -> objectURL
async function fileBlob(path) {
  const local = await IDB.get(path).catch(() => null);
  if (local) return local;
  const cached = await IDB.cacheGet(path).catch(() => null);
  if (cached) return cached;
  if (!Sync.enabled()) throw new Error('Sincronizzazione non configurata');
  if (!navigator.onLine) throw new Error('Sei offline e questo file non è ancora salvato sul telefono');
  const r = await Sync.api('contents/' + encPath(path) + '?ref=' + encodeURIComponent(Sync.cfg().branch || 'main'), { headers: { Accept: 'application/vnd.github.raw' } });
  if (!r.ok) throw new Error('File non trovato (' + r.status + ')');
  const blob = await r.blob();
  IDB.cachePut(path, blob).catch(() => {}); // da ora visibile anche offline
  return blob;
}
async function fileUrl(path) {
  if (fileCache.has(path)) return fileCache.get(path);
  const url = URL.createObjectURL(await fileBlob(path));
  fileCache.set(path, url);
  return url;
}
const encPath = (p) => p.split('/').map(encodeURIComponent).join('/');
function blobToBase64(blob) {
  return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = () => rej(fr.error); fr.readAsDataURL(blob); });
}
let pendingCount = 0;
async function refreshPending() { try { pendingCount = (await IDB.keys()).length; } catch (e) { pendingCount = 0; } }

/* immagini: ridimensiona e comprime (documenti leggibili, ~250-450 KB a pagina) */
async function compressImage(file, maxSide = 1800, quality = 0.72) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Immagine non leggibile')); i.src = url; });
    const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', quality));
    return { blob, w: c.width, h: c.height };
  } finally { URL.revokeObjectURL(url); }
}
async function filesToPages(fileList) {
  const out = [];
  for (const f of fileList) {
    if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) out.push({ blob: f, type: 'pdf', name: f.name });
    else if (f.type.startsWith('image/') || /\.(jpe?g|png|heic|webp)$/i.test(f.name)) {
      try { const c = await compressImage(f); out.push({ blob: c.blob, type: 'jpg', name: f.name, w: c.w, h: c.h }); }
      catch (e) { alert('Non riesco a leggere ' + f.name + ': ' + e.message); }
    }
  }
  return out;
}
async function storePages(doc, pages, startIndex) {
  const year = docYear(doc), stored = [];
  let i = startIndex;
  for (const p of pages) {
    i++;
    const path = `files/${year}/${doc.category}/${doc.id}-${i}-${now().toString(36)}.${p.type}`;
    await IDB.put(path, p.blob);
    stored.push({ path, type: p.type, name: p.name || '', size: p.blob.size });
  }
  await refreshPending();
  return stored;
}

/* ================================================================ sync GitHub */
function b64encode(str) {
  const bytes = new TextEncoder().encode(str); let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function b64decode(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
let INBOX = lsGet(LS.inbox, { sha: null, lastRun: null, count: 0 });
const Sync = {
  state: 'local', error: '', last: 0, timer: null, busy: false, again: false,
  cfg() { return lsGet(LS.cfg, null); },
  enabled() { const c = this.cfg(); return !!(c && c.token && c.owner && c.repo); },
  async api(path, opts = {}) {
    const c = this.cfg();
    return fetch(`https://api.github.com/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/${path}`, Object.assign({}, opts, {
      cache: 'no-store',
      headers: Object.assign({ Authorization: 'Bearer ' + c.token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, opts.headers || {}),
    }));
  },
  async readJson(path) {
    const c = this.cfg();
    const r = await this.api(`contents/${encPath(path)}?ref=${encodeURIComponent(c.branch || 'main')}`);
    if (r.status === 404) return { data: null, sha: null };
    if (r.status === 401 || r.status === 403) throw new Error('Token non valido o senza permessi (' + r.status + ')');
    if (!r.ok) throw new Error('Lettura fallita (' + r.status + ')');
    const j = await r.json();
    let b64 = j.content;
    if (!b64 && j.sha) { const rb = await this.api(`git/blobs/${j.sha}`); if (!rb.ok) throw new Error('Lettura blob fallita'); b64 = (await rb.json()).content; }
    return { data: JSON.parse(b64decode(b64)), sha: j.sha };
  },
  async putFile(path, b64, sha, message) {
    const c = this.cfg();
    const body = { message: message || 'Aggiornamento ' + new Date().toISOString().slice(0, 16).replace('T', ' '), content: b64, branch: c.branch || 'main' };
    if (sha) body.sha = sha;
    return this.api(`contents/${encPath(path)}`, { method: 'PUT', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
  },
  async push(data, sha) {
    const r = await this.putFile('data.json', b64encode(JSON.stringify(data)), sha);
    if (r.status === 409 || r.status === 422) return { conflict: true };
    if (r.status === 401 || r.status === 403) throw new Error('Token senza permesso di scrittura (' + r.status + ')');
    if (!r.ok) throw new Error('Salvataggio fallito (' + r.status + ')');
    return { sha: (await r.json()).content.sha };
  },
  async uploadPending() {
    const keys = await IDB.keys();
    for (const path of keys) {
      const blob = await IDB.get(path);
      if (!blob) { await IDB.del(path); continue; }
      const r = await this.putFile(path, await blobToBase64(blob), null, 'File ' + path.split('/').pop());
      // 422 senza sha = il file esiste già (caricato da un altro tentativo): va bene
      if (r.ok || r.status === 422) {
        if (!fileCache.has(path)) fileCache.set(path, URL.createObjectURL(blob));
        await IDB.cachePut(path, blob).catch(() => {});
        await IDB.del(path);
      } else if (r.status === 401 || r.status === 403) throw new Error('Token senza permesso di scrittura (' + r.status + ')');
      else throw new Error('Caricamento file fallito (' + r.status + ')');
    }
    await refreshPending();
  },
  async run() {
    if (!this.enabled()) { this.setState('local'); return; }
    if (!navigator.onLine) { this.setState('offline'); return; }
    if (this.busy) { this.again = true; return; }
    this.busy = true; this.setState('saving');
    try {
      await this.uploadPending();
      let ok = false;
      for (let attempt = 0; attempt < 4 && !ok; attempt++) {
        const remote = await this.readJson('data.json');
        const merged = remote.data ? mergeDB(DB, remote.data) : DB;
        DB = merged; ensureHome(); lsSet(LS.data, DB);
        if (remote.data && !differs(merged, remote.data)) { lsSet(LS.sha, remote.sha); ok = true; break; }
        const res = await this.push(merged, remote.sha);
        if (res.conflict) continue;
        lsSet(LS.sha, res.sha); ok = true;
      }
      if (!ok) throw new Error('Conflitto non risolto, riprovo più tardi');
      lsSet(LS.dirty, false);
      await this.checkInbox();
      this.last = now(); this.error = '';
      this.setState('idle');
    } catch (e) {
      this.error = e.message || String(e);
      this.setState(navigator.onLine ? 'error' : 'offline');
    } finally {
      this.busy = false;
      render();
      if (this.again) { this.again = false; this.schedule(300); }
    }
  },
  async checkInbox() {
    const r = await this.readJson('inbox.json');
    if (!r.data) return;
    INBOX = { sha: r.sha, lastRun: r.data.lastRun || null, count: (r.data.entries || []).length, error: r.data.lastError || null };
    lsSet(LS.inbox, INBOX);
    if (importInbox(r.data.entries || [])) { persist({ render: false }); this.again = true; }
  },
  schedule(ms = 1200) { clearTimeout(this.timer); if (this.enabled()) this.timer = setTimeout(() => this.run(), ms); },
  setState(s) { this.state = s; const pill = $('.sync-pill'); if (pill) pill.replaceWith(syncPill()); },
};

/* mail -> documenti "da pagare" (idempotente: id derivato dal messaggio) */
function senderFor(entry) {
  const ss = DB.meta.mailSenders || [];
  return ss.find((s) => s.id === entry.senderId)
    || ss.find((s) => s.match && ((entry.from || '') + ' ' + (entry.subject || '')).toLowerCase().includes(s.match.toLowerCase()))
    || { label: (entry.from || 'Mail').replace(/<.*>/, '').trim(), category: 'altro', sub: '', status: 'da_pagare' };
}
function importInbox(entries) {
  let changed = 0;
  for (const e of entries) {
    if (!e || !e.id || DB.mail[e.id]) continue;
    const s = senderFor(e);
    const docId = 'mail_' + e.id;
    if (!DB.docs[docId]) {
      const received = (e.receivedAt || new Date().toISOString()).slice(0, 10);
      const docDate = e.docDate || received;
      newDoc({
        id: docId, title: `${s.label || 'Mail'} – ${e.docDate ? 'bolletta del ' + fmtDate(e.docDate, true) : (e.subject || 'nuova mail').slice(0, 60)}`,
        section: s.category === 'multe' ? 'multe' : 'casa', category: s.category || 'altro', sub: s.sub || '', homeId: s.homeId || null,
        status: s.status || 'da_pagare', amount: e.amount != null ? e.amount : null, docDate, dueDate: e.dueDate || null,
        pages: (e.attachments || []).map((a) => ({ path: a.path, type: /\.pdf$/i.test(a.path) ? 'pdf' : 'jpg', name: a.name || '' })),
        source: 'mail', unseen: true,
        mail: { from: e.from || '', subject: e.subject || '', receivedAt: e.receivedAt || '', messageId: e.id, links: (e.links || []).slice(0, 4), snippet: (e.snippet || '').slice(0, 400), calendarEvent: !!e.calendarEventId },
      });
    }
    DB.mail[e.id] = { id: e.id, docId, updatedAt: now() };
    changed++;
  }
  return changed > 0;
}

/* ================================================================ routing (tasto indietro = schermata precedente) */
const ROOTS = ['pagamenti', 'archivio', 'multe', 'altro'];
function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  const parts = path.split('/').map(decodeURIComponent).filter(Boolean);
  return { name: parts[0] || 'pagamenti', arg: parts[1] || '', q: new URLSearchParams(qs || ''), raw };
}
const navStack = [];
function go(path) { location.hash = '#/' + path; }
function goBack(fallback) {
  if (navStack.length > 1) history.back();
  else location.replace('#/' + (fallback || 'pagamenti'));
}
const scrollMem = {};
let currentRaw = null;
window.addEventListener('hashchange', () => {
  const r = parseRoute().raw;
  if (navStack.length > 1 && navStack[navStack.length - 2] === r) navStack.pop();
  else navStack.push(r);
  render(true);
});

/* ================================================================ UI state */
const UI = Object.assign({ paySeg: 'due', multeSeg: 'due', search: '', paidYear: 'all', catFilter: {}, home: 'all' }, lsGet(LS.ui, {}));
function setUI(patch) { Object.assign(UI, patch); lsSet(LS.ui, UI); render(); }

/* ================================================================ render */
let pendingRender = false;
function isEditing() {
  const a = document.activeElement;
  return a && $('#view').contains(a) && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && ['text', 'search', 'url', 'email', 'password', 'number', 'date'].includes(a.type)) || a.tagName === 'SELECT');
}
document.addEventListener('focusout', () => setTimeout(() => { if (pendingRender && !isEditing()) render(); }, 50));

function render(routeChanged) {
  const route = parseRoute();
  if (!routeChanged && (isEditing() || route.name === 'nuovo' || !$('#viewer').hidden)) { pendingRender = true; return; }
  pendingRender = false;
  if (currentRaw !== null && routeChanged) scrollMem[currentRaw] = window.scrollY;
  const sameRoute = currentRaw === route.raw;
  const keepY = window.scrollY;
  currentRaw = route.raw;
  const views = {
    pagamenti: viewPayments, archivio: viewArchive, multe: viewFines, altro: viewMore,
    cat: viewCategory, lavoro: viewWork, doc: viewDoc, nuovo: viewNew,
    impostazioni: viewSettings, calendario: viewCalendar, mail: viewMail, tag: viewTags, case: viewHomes,
  };
  const fn = views[route.name] || viewPayments;
  const out = fn(route);
  const clean = (arr) => arr.flat(Infinity).filter((x) => x != null && x !== false);
  $('#topbar').replaceChildren(...clean(out.top));
  $('#view').replaceChildren(...clean(out.body));
  const fab = document.querySelector('.fab'); if (fab) fab.remove();
  if (out.fab) document.body.append(out.fab);
  renderTabs(route);
  if (out.after) out.after();
  window.scrollTo(0, sameRoute ? keepY : (scrollMem[route.raw] || 0));
}
function renderTabs(route) {
  let tab = ROOTS.includes(route.name) ? route.name : null;
  if (['cat', 'lavoro'].includes(route.name)) tab = 'archivio';
  if (['impostazioni', 'calendario', 'mail', 'tag', 'case'].includes(route.name)) tab = 'altro';
  const unseen = docs().filter((d) => d.unseen).length;
  const defs = [['pagamenti', 'Pagamenti', 'euro'], ['archivio', 'Archivio', 'box'], ['multe', 'Multe', 'car'], ['altro', 'Altro', 'grid']];
  $('#tabbar').replaceChildren(h('div', { class: 'inner' }, defs.map(([k, label, ic]) =>
    h('button', { 'aria-current': tab === k ? 'page' : null, onclick: () => { if (tab !== k || route.name !== k) go(k); else window.scrollTo({ top: 0, behavior: 'smooth' }); } },
      h('span', { class: 'tab-ic' }, icon(ic), k === 'pagamenti' && unseen ? h('span', { class: 'tab-dot' }, unseen) : null), label))));
}
function syncPill() {
  const labels = { local: 'Solo locale', idle: 'Salvato', saving: 'Salvo…', error: 'Errore sync', offline: 'Offline, in attesa' };
  return h('button', { class: 'sync-pill ' + Sync.state, onclick: () => go('impostazioni'), title: Sync.error || '' },
    h('span', { class: 'dot' }), labels[Sync.state] + (pendingCount ? ` · ${pendingCount} file` : ''));
}
function topBar(title, opts = {}) {
  return [
    opts.back ? h('button', { class: 'icon-btn plain', 'aria-label': 'Indietro', onclick: () => goBack(opts.back) }, icon('back')) : null,
    h('h1', { class: opts.small ? 'small' : null }, title),
    opts.right || null,
    opts.noSync ? null : syncPill(),
  ];
}
const fab = (label, onclick) => h('button', { class: 'fab', 'aria-label': label, onclick }, icon('plus', 2.4));
function segmented(options, value, onPick) {
  return h('div', { class: 'segmented', role: 'group' }, options.map(([k, label, count]) =>
    h('button', { 'aria-pressed': String(k === value), onclick: () => onPick(k) }, label, count != null ? h('span', { class: 'count' }, count) : null)));
}
function checkBtn(done, label, onclick) {
  return h('button', { class: 'check', 'aria-pressed': String(!!done), 'aria-label': label, onclick },
    h('span', { class: 'box' }, done ? icon('check', 3) : null));
}
function catLabel(d) {
  if (d.section === 'multe') return 'Multa';
  const c = catById(d.category);
  return [c ? c.name : '', d.sub].filter(Boolean).join(' · ');
}
function docRow(d, opts = {}) {
  const late = OPEN(d) && d.dueDate && d.dueDate < todayISO();
  const soon = OPEN(d) && d.dueDate && !late && d.dueDate <= addDaysISO(todayISO(), 7);
  const w = work(d.workId);
  const meta = h('div', { class: 'meta' },
    d.unseen ? h('span', { class: 'badge new' }, 'Nuovo') : null,
    d.status === 'addebitata' ? h('span', { class: 'badge debit' }, 'Addebito') : null,
    d.status === 'da_pagare' ? h('span', { class: 'badge due' }, 'Da pagare') : null,
    d.amount != null ? h('span', { class: 'm amt' }, fmtEuro(d.amount)) : null,
    d.dueDate && d.status !== 'pagato' ? h('span', { class: late ? 'badge late' : soon ? 'badge soon' : 'm' }, late ? null : icon('clock'), (late ? 'Scaduta ' : dueLabel(d) === 'Fine garanzia' ? 'Garanzia fino al ' : '') + fmtDate(d.dueDate)) : null,
    d.status === 'pagato' && d.paidAt ? h('span', { class: 'm' }, 'Pagato il ' + fmtDate(d.paidAt)) : null,
    multiHome() && d.section !== 'multe' && opts.showHome !== false && !homeById(UI.home) ? h('span', { class: 'm home-tag' }, icon('home'), docHome(d).name) : null,
    opts.showCat === false ? null : h('span', { class: 'm' }, catLabel(d)),
    w && opts.showWork !== false ? h('span', { class: 'm' }, icon('hammer'), w.name) : null,
    (d.tags || []).map(tag).filter(Boolean).map((t) => h('span', { class: 'badge lbl', style: `--c:${t.color}` }, t.name)),
    d.pages && d.pages.length ? h('span', { class: 'm', title: 'Pagine' }, icon('image'), d.pages.length) : null,
    d.source === 'mail' ? h('span', { class: 'm', title: 'Arrivato per mail' }, icon('mail')) : null,
  );
  const payable = d.status !== 'none';
  return h('div', { class: 'row' + (d.status === 'pagato' && opts.strike ? ' is-done' : '') + (d.unseen ? ' unseen' : '') + (late ? ' late' : ''), 'data-id': d.id },
    payable ? checkBtn(d.status === 'pagato', (d.status === 'pagato' ? 'Rimetti da pagare: ' : 'Segna pagato: ') + d.title, (e) => { e.stopPropagation(); togglePaid(d.id); })
      : h('span', { class: 'row-ic' }, icon(catById(d.category) ? catById(d.category).icon : 'file')),
    h('button', { class: 'row-main', onclick: () => go('doc/' + d.id) },
      h('span', { class: 'row-title' }, d.title || '(senza titolo)'),
      meta),
  );
}
const list = (arr, opts) => h('div', { class: 'list' }, arr.map((d) => docRow(d, opts)));
const byDue = (a, b) => (a.dueDate || '9999') < (b.dueDate || '9999') ? -1 : (a.dueDate || '9999') > (b.dueDate || '9999') ? 1 : (b.createdAt - a.createdAt);
const byDateDesc = (a, b) => ((b.docDate || '') + b.createdAt) > ((a.docDate || '') + a.createdAt) ? 1 : -1;
const sum = (arr) => Math.round(arr.reduce((s, d) => s + (Number(d.amount) || 0), 0) * 100) / 100;
function syncBanner() {
  if (Sync.enabled()) return null;
  return h('div', { class: 'banner' }, h('div', null, 'Sincronizzazione non attiva: dati e foto restano solo su questo dispositivo. ', h('a', { href: '#/impostazioni' }, 'Collegala')));
}

/* ---------------- Pagamenti */
function totBox(label, arr) {
  const missing = arr.filter((d) => d.amount == null).length;
  return h('div', null, h('span', null, label), h('b', null, fmtEuro(sum(arr))),
    missing ? h('span', { class: 'small' }, `+ ${missing} senza importo`) : null);
}
function viewPayments() {
  const mine = docs().filter(inHomeFilter);
  const open = mine.filter(OPEN);
  const paid = mine.filter((d) => d.status === 'pagato');
  const body = [syncBanner(), homeChips(), segmented([['due', 'Da pagare', open.length], ['paid', 'Pagati', paid.length]], UI.paySeg, (k) => setUI({ paySeg: k }))];
  if (UI.paySeg === 'due') {
    const t = todayISO(), in30 = addDaysISO(t, 30);
    const fresh = mine.filter((d) => d.unseen).sort(byDue);
    const rest = open.filter((d) => !d.unseen);
    const groups = [
      ['Scaduti', rest.filter((d) => d.dueDate && d.dueDate < t)],
      ['Entro 30 giorni', rest.filter((d) => d.dueDate && d.dueDate >= t && d.dueDate <= in30)],
      ['Più avanti', rest.filter((d) => d.dueDate && d.dueDate > in30)],
      ['Senza scadenza', rest.filter((d) => !d.dueDate)],
    ];
    const toPay = open.filter((d) => d.status === 'da_pagare'), debit = open.filter((d) => d.status === 'addebitata');
    if (open.length) body.push(h('div', { class: 'totals' },
      totBox('Da pagare', toPay), totBox('In addebito', debit)));
    if (fresh.length) body.push(h('div', { class: 'group-title alert' }, icon('mail'), `Nuovi dalla mail (${fresh.length})`), list(fresh));
    for (const [title, arr] of groups) if (arr.length) body.push(h('div', { class: 'group-title' }, `${title} (${arr.length})`), list(arr.sort(byDue)));
    if (!open.length && !fresh.length) body.push(h('div', { class: 'empty' }, 'Niente da pagare. Aggiungi un documento con il pulsante + in basso.'));
  } else {
    const years = [...new Set(paid.map((d) => (d.paidAt || docYear(d)).slice(0, 4)))].sort().reverse();
    if (UI.paidYear !== 'all' && !years.includes(UI.paidYear)) UI.paidYear = 'all';
    if (years.length > 1) body.push(h('div', { class: 'chips' }, [['all', 'Tutti'], ...years.map((y) => [y, y])].map(([k, l]) =>
      h('button', { class: 'chip', 'aria-pressed': String(UI.paidYear === k), onclick: () => setUI({ paidYear: k }) }, l))));
    const sel = paid.filter((d) => UI.paidYear === 'all' || (d.paidAt || docYear(d)).slice(0, 4) === UI.paidYear);
    const sortPaid = (a, b) => ((b.paidAt || '') > (a.paidAt || '') ? 1 : -1);
    for (const c of [...CATS, MULTE]) {
      const arr = sel.filter((d) => (d.section === 'multe' ? 'multe' : d.category) === c.id);
      if (!arr.length) continue;
      body.push(h('div', { class: 'group-title' }, icon(c.icon), `${c.name} (${arr.length})`, h('span', { class: 'gt-amt' }, fmtEuro(sum(arr)))), list(arr.sort(sortPaid), { showCat: true }));
    }
    if (!sel.length) body.push(h('div', { class: 'empty' }, 'Ancora nessun pagamento registrato.'));
  }
  return { top: topBar('Pagamenti'), body, fab: fab('Nuovo documento', () => go('nuovo')) };
}

/* ---------------- Archivio */
function docMatches(d, q) {
  const c = catById(d.category), w = work(d.workId);
  const hay = [d.title, d.notes, d.sub, c && c.name, w && w.name, (d.tags || []).map((t) => tag(t) && tag(t).name).join(' '),
    d.amount != null ? euroInput(d.amount) : '', d.mail && d.mail.subject].join(' ').toLowerCase();
  return q.split(/\s+/).every((p) => hay.includes(p));
}
function viewArchive() {
  const q = UI.search.trim().toLowerCase();
  const search = h('input', { class: 'search', type: 'search', placeholder: 'Cerca in tutti i documenti…', value: UI.search,
    oninput: (e) => { UI.search = e.target.value; lsSet(LS.ui, UI); clearTimeout(viewArchive.t); viewArchive.t = setTimeout(() => { const el = document.activeElement; const pos = el && el.selectionStart; render(true); const s = $('.search'); if (s) { s.focus(); try { s.setSelectionRange(pos, pos); } catch (er) { /* */ } } }, 250); } });
  const body = [syncBanner(), homeChips(), search];
  if (q) {
    const res = docs().filter(inHomeFilter).filter((d) => docMatches(d, q)).sort(byDateDesc);
    body.push(res.length ? list(res) : h('div', { class: 'empty' }, 'Nessun documento trovato.'));
  } else {
    const all = docs().filter((d) => d.section !== 'multe').filter(inHomeFilter);
    body.push(h('div', { class: 'list' }, CATS.map((c) => {
      const arr = all.filter((d) => d.category === c.id);
      const open = arr.filter(OPEN).length;
      const extra = c.works ? `${worksInFilter().length} lavori · ` : '';
      return h('button', { class: 'card-link', onclick: () => go('cat/' + c.id) },
        h('span', { class: 'ic' }, icon(c.icon)),
        h('span', { class: 't' }, h('b', null, c.name), h('span', null, `${extra}${arr.length} documenti${open ? ` · ${open} da pagare` : ''}`)),
        h('span', { class: 'chev' }, icon('chev')));
    })));
    const usedTags = tags().filter((t) => docs().some((d) => (d.tags || []).includes(t.id)));
    if (usedTags.length) {
      body.push(h('div', { class: 'group-title' }, 'Tag'), h('div', { class: 'toggles' }, usedTags.map((t) =>
        h('button', { class: 'toggle t-lbl', style: `--c:${t.color}`, onclick: () => setUI({ search: t.name }) }, h('span', { class: 'sw', style: `background:${t.color}` }), t.name))));
    }
  }
  return { top: topBar('Archivio'), body, fab: fab('Nuovo documento', () => go('nuovo')) };
}
/* lavori: appartengono a una casa (se non indicata, la prima) */
const workHomeId = (w) => (homeById(w.homeId) ? w.homeId : homes()[0].id);
const worksInFilter = () => works().filter((w) => !multiHome() || !homeById(UI.home) || workHomeId(w) === UI.home);
function yearGroups(arr, opts) {
  const out = [];
  const years = [...new Set(arr.map(docYear))].sort().reverse();
  for (const y of years) {
    const ys = arr.filter((d) => docYear(d) === y).sort(byDateDesc);
    out.push(h('div', { class: 'group-title' }, `${y} (${ys.length})`), list(ys, opts));
  }
  return out;
}
function viewCategory(route) {
  const c = catById(route.arg);
  if (!c) return { top: topBar('Non trovato', { back: 'archivio', small: true }), body: [h('div', { class: 'empty' }, 'Categoria sconosciuta.')] };
  const arr = docs().filter((d) => d.category === c.id && d.section !== 'multe').filter(inHomeFilter);
  const f = UI.catFilter[c.id] || 'all';
  const subsUsed = c.subs.filter((s) => arr.some((d) => d.sub === s));
  const body = [homeChips()];
  if (subsUsed.length) body.push(h('div', { class: 'chips' }, [['all', 'Tutti'], ...subsUsed.map((s) => [s, s])].map(([k, l]) =>
    h('button', { class: 'chip', 'aria-pressed': String(f === k), onclick: () => { UI.catFilter[c.id] = k; setUI({}); } }, l))));
  const sel = arr.filter((d) => f === 'all' || d.sub === f);
  if (c.works) {
    const ws = worksInFilter();
    body.push(h('div', { class: 'group-title' }, 'Lavori'));
    body.push(h('div', { class: 'list' },
      ws.map((w) => {
        const wd = arr.filter((d) => d.workId === w.id);
        return h('button', { class: 'card-link', onclick: () => go('lavoro/' + w.id) },
          h('span', { class: 'ic' }, icon('folder')),
          h('span', { class: 't' }, h('b', null, w.name), h('span', null, `${multiHome() && !homeById(UI.home) ? homeById(workHomeId(w)).name + ' · ' : ''}${wd.length} documenti${sum(wd) ? ' · ' + fmtEuro(sum(wd)) : ''}`)),
          h('span', { class: 'chev' }, icon('chev')));
      }),
      h('button', { class: 'btn', onclick: () => { const n = prompt('Nome del lavoro (es. "Bagno 2026", "Infissi")'); if (n && n.trim()) { const w = createWork(n.trim(), defaultHomeId()); go('lavoro/' + w.id); } } }, icon('plus'), 'Nuovo lavoro')));
    const loose = sel.filter((d) => !work(d.workId));
    if (loose.length) body.push(h('div', { class: 'group-title' }, 'Senza lavoro assegnato'), list(loose.sort(byDateDesc), { showCat: false }));
  } else {
    body.push(...yearGroups(sel, { showCat: true }));
    if (!sel.length) body.push(h('div', { class: 'empty' }, 'Nessun documento in questa categoria.'));
  }
  return { top: topBar(c.name, { back: 'archivio', small: true }), body, fab: fab('Nuovo documento', () => go('nuovo?cat=' + c.id + (f !== 'all' ? '&sub=' + encodeURIComponent(f) : ''))) };
}
function viewWork(route) {
  const w = work(route.arg);
  if (!w) return { top: topBar('Non trovato', { back: 'cat/lavori', small: true }), body: [h('div', { class: 'empty' }, 'Questo lavoro non esiste più.')] };
  const arr = docs().filter((d) => d.workId === w.id);
  const body = [h('div', { class: 'detail' },
    h('textarea', { class: 'title-input', rows: 1, value: w.name, onchange: (e) => { w.name = e.target.value.trim() || w.name; w.updatedAt = now(); persist(); } }),
    h('div', { class: 'totals' },
      h('div', null, h('span', null, 'Totale documenti'), h('b', null, fmtEuro(sum(arr)) || '0 €')),
      h('div', null, h('span', null, 'Di cui da pagare'), h('b', null, fmtEuro(sum(arr.filter(OPEN))) || '0 €'))),
    multiHome() ? h('div', { class: 'panel' }, h('div', { class: 'field' }, h('label', null, 'Abitazione'),
      homeSelect(workHomeId(w), (v) => {
        w.homeId = v; w.updatedAt = now();
        for (const d of arr) { d.homeId = v; d.updatedAt = now(); }
        persist();
      }))) : null,
    h('div', { class: 'panel' }, h('h2', null, 'Note sul lavoro'),
      h('textarea', { class: 'input', placeholder: 'Ditta, contatti, detrazioni, cosa è stato fatto…', value: w.notes || '', onchange: (e) => { w.notes = e.target.value; w.updatedAt = now(); persist(); } })))];
  const subs = catById('lavori').subs;
  for (const s of [...subs, '']) {
    const ss = arr.filter((d) => (d.sub || '') === s || (s === '' && d.sub && !subs.includes(d.sub)));
    if (ss.length) body.push(h('div', { class: 'group-title' }, `${s || 'Altro'} (${ss.length})`), list(ss.sort(byDateDesc), { showCat: false, showWork: false }));
  }
  if (!arr.length) body.push(h('div', { class: 'empty' }, 'Ancora nessun documento per questo lavoro.'));
  body.push(h('button', { class: 'btn danger', style: 'margin-top:20px', onclick: () => {
    if (!confirm(`Eliminare il lavoro "${w.name}"? I documenti restano in archivio, senza lavoro assegnato.`)) return;
    w.deleted = true; w.updatedAt = now(); persist({ render: false }); goBack('cat/lavori');
  } }, icon('trash'), 'Elimina lavoro'));
  return { top: topBar('Lavoro', { back: 'cat/lavori', small: true }), body, fab: fab('Nuovo documento', () => go('nuovo?cat=lavori&work=' + w.id)) };
}

/* ---------------- Multe */
function viewFines() {
  const all = docs().filter((d) => d.section === 'multe');
  const due = all.filter(OPEN), paid = all.filter((d) => d.status === 'pagato');
  const body = [syncBanner(), segmented([['due', 'Da pagare', due.length], ['paid', 'Pagate', paid.length], ['all', 'Tutte', all.length]], UI.multeSeg, (k) => setUI({ multeSeg: k }))];
  if (UI.multeSeg === 'due') {
    if (due.length) body.push(h('div', { class: 'totals' }, h('div', null, h('span', null, 'Totale da pagare'), h('b', null, fmtEuro(sum(due))))), list(due.sort(byDue), { showCat: false }));
    else body.push(h('div', { class: 'empty' }, 'Nessuna multa da pagare.'));
  } else if (UI.multeSeg === 'paid') {
    body.push(...yearGroups(paid, { showCat: false, strike: false }));
    if (!paid.length) body.push(h('div', { class: 'empty' }, 'Nessuna multa pagata registrata.'));
  } else {
    body.push(...yearGroups(all, { showCat: false }));
    if (!all.length) body.push(h('div', { class: 'empty' }, 'Nessuna multa. Fotografa il verbale con il pulsante in basso.'));
  }
  return { top: topBar('Multe'), body, fab: fab('Nuova multa', () => go('nuovo?section=multe')) };
}

/* ---------------- Altro */
function viewMore() {
  const card = (path, ic, title, sub) => h('button', { class: 'card-link', onclick: () => go(path) },
    h('span', { class: 'ic' }, icon(ic)), h('span', { class: 't' }, h('b', null, title), h('span', null, sub)), h('span', { class: 'chev' }, icon('chev')));
  const ss = (DB.meta.mailSenders || []).filter((s) => s.enabled !== false);
  const cals = (DB.meta.calendarEmails || []).filter(Boolean);
  return {
    top: topBar('Altro'),
    body: [h('div', { class: 'list' },
      card('mail', 'mail', 'Mail automatica', `${DB.meta.mailbox || 'nessuna casella'} · ${ss.length} mittenti${INBOX.lastRun ? ' · ultimo controllo ' + new Date(INBOX.lastRun).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ' · script non ancora attivo'}`),
      card('calendario', 'cal', 'Calendario', cals.length ? cals.join(' · ') : 'Nessun indirizzo'),
      card('case', 'home', 'Abitazioni', homes().map((x) => x.name).join(' · ') + (multiHome() ? '' : ' · aggiungi abitazione')),
      card('cat/lavori', 'hammer', 'Lavori e ristrutturazioni', `${works().length} lavori`),
      card('tag', 'tag', 'Tag', `${tags().length} tag`),
      card('impostazioni', 'sync', 'Sincronizzazione e backup', Sync.enabled() ? 'Collegata a GitHub' : 'Non configurata'),
    ), h('p', { class: 'footer-meta' }, `${docs().length} documenti · ${docs().reduce((s, d) => s + (d.pages || []).length, 0)} file`)],
    fab: fab('Nuovo documento', () => go('nuovo')),
  };
}

/* ---------------- Sincronizzazione */
function viewSettings() {
  const c = Object.assign({ owner: 'Cartesio89', repo: 'documenti-casa-data', branch: 'main', token: '' }, Sync.cfg() || {});
  const f = {};
  const fld = (key, label, attrs = {}) => h('div', { class: 'field' }, h('label', { for: 'f-' + key }, label),
    f[key] = h('input', Object.assign({ class: 'input', id: 'f-' + key, value: c[key], autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' }, attrs)));
  const statusTxt = Sync.enabled()
    ? (Sync.state === 'idle' ? `Sincronizzato${Sync.last ? ' alle ' + new Date(Sync.last).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : ''}.` : Sync.state === 'saving' ? 'Sincronizzazione in corso…' : `Problema: ${Sync.error || Sync.state}`)
    : 'Non configurata. Dati e foto restano solo in questo browser e si perdono se cancelli i dati del sito.';
  const fileIn = h('input', { type: 'file', accept: 'application/json,.json', class: 'sr-only', id: 'imp', onchange: async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data.docs) throw new Error('Formato non riconosciuto');
      DB = mergeDB(DB, data); ensureHome(); persist(); toast('Importato e unito ai dati esistenti');
    } catch (err) { alert('Importazione fallita: ' + err.message); }
  } });
  return {
    top: topBar('Sincronizzazione', { back: 'altro', small: true }),
    body: [h('div', { class: 'detail' },
      h('div', { class: 'panel' }, h('h2', null, 'Stato'), h('p', { class: 'small', style: 'margin:0' }, statusTxt),
        pendingCount ? h('p', { class: 'small', style: 'margin:8px 0 0' }, `${pendingCount} file in attesa di caricamento (restano salvati su questo dispositivo finché non vanno su GitHub).`) : null),
      h('div', { class: 'panel' },
        h('h2', null, 'GitHub'),
        fld('owner', 'Utente GitHub'),
        fld('repo', 'Repo dati (privato)'),
        fld('branch', 'Branch'),
        fld('token', 'Token di accesso (fine-grained)', { type: 'password', placeholder: 'github_pat_…' }),
        h('div', { class: 'inline', style: 'margin-top:14px' },
          h('button', { class: 'btn primary', onclick: async () => {
            const cfg = { owner: f.owner.value.trim(), repo: f.repo.value.trim(), branch: f.branch.value.trim() || 'main', token: f.token.value.trim() };
            if (!cfg.owner || !cfg.repo || !cfg.token) { alert('Compila utente, repo e token.'); return; }
            lsSet(LS.cfg, cfg); await Sync.run();
            toast(Sync.state === 'idle' ? 'Collegato: dati sincronizzati' : 'Errore: ' + Sync.error);
          } }, 'Salva e sincronizza'),
          Sync.enabled() ? h('button', { class: 'btn', onclick: () => Sync.run() }, 'Sincronizza ora') : null,
          Sync.enabled() ? h('button', { class: 'btn danger', onclick: () => { if (confirm('Scollegare questo dispositivo? I dati restano su GitHub e in cache.')) { localStorage.removeItem(LS.cfg); Sync.setState('local'); render(); } } }, 'Scollega') : null),
        h('div', { class: 'help', style: 'margin-top:14px' },
          h('b', null, 'Come creare il token (una volta, gratis):'),
          h('ol', null,
            h('li', null, 'GitHub → Settings → Developer settings → Personal access tokens → ', h('b', null, 'Fine-grained tokens'), ' → Generate new token.'),
            h('li', null, 'Repository access: ', h('b', null, 'Only select repositories'), ' → solo ', h('code', null, 'documenti-casa-data'), '.'),
            h('li', null, 'Permissions → Repository → ', h('b', null, 'Contents: Read and write'), '. Nient\'altro.'),
            h('li', null, 'Salvalo nel password manager: serve su ogni dispositivo, anche per la seconda persona.')),
          h('p', null, 'Il token resta solo su questo dispositivo. Ogni modifica e ogni foto diventano un commit nel repo privato: lo storico è anche il backup.'))),
      h('div', { class: 'panel' },
        h('h2', null, 'Backup'),
        h('div', { class: 'inline' },
          h('button', { class: 'btn', onclick: () => {
            const blob = new Blob([JSON.stringify(DB, null, 1)], { type: 'application/json' });
            const a = h('a', { href: URL.createObjectURL(blob), download: `documenti-casa-${todayISO()}.json` }); document.body.append(a); a.click(); a.remove();
          } }, icon('download'), 'Esporta elenco (JSON)'),
          h('label', { class: 'btn', for: 'imp' }, icon('upload'), 'Importa JSON'), fileIn),
        h('p', { class: 'help' }, 'Il JSON contiene l\'elenco dei documenti, non le foto.')),
      h('div', { class: 'panel' },
        h('h2', null, 'Scarica tutti i documenti (ZIP)'),
        h('p', { class: 'help', style: 'margin-top:0' }, `Uno ZIP con le cartelle come nell'app (Categoria/Anno/Sottocategoria, Lavori/Nome lavoro, Multe/Anno) e un elenco.csv apribile con Excel. Peso attuale circa ${Math.max(1, Math.round(docs().reduce((s, d) => s + (d.pages || []).reduce((a, p) => a + (p.size || 300000), 0), 0) / 1048576))} MB: lo scarica questo dispositivo, quindi meglio col Wi-Fi.`),
        h('button', { class: 'btn primary', onclick: async (e) => {
          const btn = e.currentTarget, bar = h('div', { class: 'progress' }, h('span'));
          if (!docs().some((d) => (d.pages || []).length)) { alert('Ancora nessun file da scaricare.'); return; }
          btn.disabled = true; btn.after(bar);
          try {
            const r = await exportZip((n, t) => { bar.firstChild.style.width = Math.round(n / t * 100) + '%'; btn.textContent = `Preparo ${n}/${t}…`; });
            toast(r.failed ? `ZIP pronto, ma ${r.failed} file non scaricati` : `ZIP pronto: ${r.total} file`);
          } catch (err) { alert('ZIP non riuscito: ' + err.message); }
          render();
        } }, icon('download'), 'Scarica ZIP')),
    )],
  };
}

/* ---------------- Calendario */
function viewCalendar() {
  const ems = [...(DB.meta.calendarEmails || ['', ''])]; while (ems.length < 2) ems.push('');
  const setEm = (i, v) => { const a = [...ems]; a[i] = v.trim(); updateMeta({ calendarEmails: a }, { render: false }); };
  return {
    top: topBar('Calendario', { back: 'altro', small: true }),
    body: [h('div', { class: 'detail' },
      h('div', { class: 'panel' },
        h('h2', null, 'Indirizzi'),
        h('div', { class: 'field' }, h('label', { for: 'c1' }, 'Calendario 1 (dove salvi l\'evento)'), h('input', { class: 'input', id: 'c1', type: 'email', value: ems[0], onchange: (e) => setEm(0, e.target.value) })),
        h('div', { class: 'field' }, h('label', { for: 'c2' }, 'Calendario 2 (riceve l\'invito)'), h('input', { class: 'input', id: 'c2', type: 'email', value: ems[1], placeholder: 'seconda persona', onchange: (e) => setEm(1, e.target.value) })),
        h('p', { class: 'help' }, 'Nei documenti con una scadenza c\'è il pulsante "Aggiungi a calendario": apre Google Calendar con l\'evento già compilato alle 9:00 del giorno di scadenza, con il calendario 2 come invitato. Premi Salva e arriva su entrambi. Non è una sincronizzazione: se poi cambi la data nell\'app, l\'evento non si aggiorna da solo.'),
        h('p', { class: 'help' }, 'Notifica: per questi eventi Google usa le notifiche predefinite del tuo calendario (di solito una notifica 30 minuti prima, quindi alle 8:30 dello stesso giorno). È una notifica normale, non una sveglia. Puoi cambiarla in Google Calendar → Impostazioni → il tuo calendario → Notifiche evento.')),
      h('div', { class: 'panel' },
        h('h2', null, 'Bollette dalla mail'),
        h('label', { class: 'toggle' + (DB.meta.calendarAuto ? ' on' : ''), style: 'cursor:pointer' },
          h('input', { type: 'checkbox', checked: !!DB.meta.calendarAuto, onchange: (e) => updateMeta({ calendarAuto: e.target.checked }) }),
          'Crea l\'evento in automatico'),
        h('p', { class: 'help' }, `Quando lo script trova una bolletta con la scadenza scritta nella mail, crea l'evento sul calendario di ${DB.meta.mailbox || 'quella casella'} alle 9:00 del giorno di scadenza (notifica 5 minuti prima, nessun promemoria il giorno prima) e invita i due indirizzi qui sopra.`)),
    )],
  };
}
function gcalUrl(d) {
  const day = d.dueDate.replace(/-/g, '');
  const ems = (DB.meta.calendarEmails || []).filter(Boolean);
  const details = [catLabel(d), d.amount != null ? 'Importo: ' + fmtEuro(d.amount) : '', d.status === 'addebitata' ? 'Addebito su conto' : '', d.notes || '', '', 'Documento: ' + location.href.split('#')[0] + '#/doc/' + d.id].filter((x) => x !== null).join('\n');
  const p = new URLSearchParams({ action: 'TEMPLATE', text: (dueLabel(d) === 'Fine garanzia' ? 'Fine garanzia: ' : d.status === 'addebitata' ? 'Addebito: ' : 'Pagare: ') + d.title, dates: `${day}T090000/${day}T093000`, ctz: 'Europe/Rome', details: details.trim() });
  if (ems[1]) p.set('add', ems.slice(1).join(','));
  if (ems[0]) p.set('authuser', ems[0]);
  return 'https://calendar.google.com/calendar/render?' + p.toString();
}

/* ---------------- Mail automatica */
function viewMail() {
  const ss = DB.meta.mailSenders || [];
  const save = (arr) => updateMeta({ mailSenders: arr }, { render: false });
  const upd = (i, patch) => { const a = ss.map((s, k) => k === i ? Object.assign({}, s, patch) : s); save(a); };
  const cf = lsGet(LS.cf, '');
  const repoUrl = 'https://github.com/Cartesio89/documenti-casa/blob/main/apps-script/Code.gs';
  const health = INBOX.lastRun
    ? `Ultimo controllo dello script: ${new Date(INBOX.lastRun).toLocaleString('it-IT')}. Mail lette finora: ${INBOX.count || 0}.` + (INBOX.error ? ` Ultimo errore: ${INBOX.error}` : '')
    : 'Lo script non ha ancora scritto nulla nel repo: va installato una volta (istruzioni sotto).';
  return {
    top: topBar('Mail automatica', { back: 'altro', small: true }),
    body: [h('div', { class: 'detail' },
      h('div', { class: 'panel' }, h('h2', null, 'Stato'), h('p', { class: 'small', style: 'margin:0' }, health)),
      h('div', { class: 'panel' },
        h('h2', null, 'Casella controllata'),
        h('input', { class: 'input', type: 'email', value: DB.meta.mailbox || '', onchange: (e) => updateMeta({ mailbox: e.target.value.trim() }) }),
        h('p', { class: 'help' }, 'Lo script gira dentro questa casella Gmail. Per una seconda casella: imposta in Gmail un inoltro automatico verso questa, oppure installa una seconda copia dello script.')),
      h('div', { class: 'panel' },
        h('h2', null, 'Mittenti da leggere'),
        h('div', { class: 'senders' }, ss.map((s, i) => h('div', { class: 'sender' },
          h('div', { class: 'inline' },
            h('input', { class: 'input', value: s.label || '', placeholder: 'Nome (es. Engie)', onchange: (e) => upd(i, { label: e.target.value.trim() }) }),
            h('label', { class: 'mini-toggle' }, h('input', { type: 'checkbox', checked: s.enabled !== false, onchange: (e) => upd(i, { enabled: e.target.checked }) }), 'attivo')),
          h('div', { class: 'field' }, h('label', null, 'Parola nel mittente o nell\'oggetto'),
            h('input', { class: 'input', value: s.match || '', placeholder: 'es. engie.it', autocapitalize: 'off', onchange: (e) => upd(i, { match: e.target.value.trim().toLowerCase() }) })),
          h('div', { class: 'inline' },
            catSelect(s.category || 'utenze', (v) => upd(i, { category: v, sub: '' }), true),
            subSelect(s.category || 'utenze', s.sub || '', (v) => upd(i, { sub: v }))),
          multiHome() && s.category !== 'multe' ? h('div', { class: 'field' }, h('label', null, 'Abitazione'),
            homeSelect(homeById(s.homeId) ? s.homeId : homes()[0].id, (v) => upd(i, { homeId: v }))) : null,
          h('div', { class: 'field' }, h('label', null, 'Stato quando arriva'),
            segmented([['da_pagare', 'Da pagare'], ['addebitata', 'Addebito'], ['none', '–']], s.status || 'da_pagare', (k) => { upd(i, { status: k }); render(); })),
          h('button', { class: 'btn ghost danger', onclick: () => { if (confirm('Rimuovere questo mittente?')) { save(ss.filter((_, k) => k !== i)); render(); } } }, icon('trash'), 'Rimuovi')))),
        h('button', { class: 'btn', onclick: () => { save([...ss, { id: uid('s'), match: '', label: '', category: 'utenze', sub: '', status: 'da_pagare', enabled: true }]); render(); } }, icon('plus'), 'Aggiungi mittente')),
      h('div', { class: 'panel' },
        h('h2', null, icon('key'), 'Codice fiscale (solo su questo dispositivo)'),
        h('input', { class: 'input', type: 'password', value: cf, autocomplete: 'off', autocapitalize: 'characters', placeholder: 'Per aprire le bollette Engie', onchange: (e) => { lsSet(LS.cf, e.target.value.trim().toUpperCase()); toast('Salvato su questo dispositivo'); } }),
        h('p', { class: 'help' }, 'Non va su GitHub né nello script. Quando premi "Apri bolletta" in un documento arrivato per mail, l\'app lo copia negli appunti: sulla pagina Engie lo incolli. Poi scarichi il PDF e lo aggiungi al documento con "Aggiungi file".')),
      h('div', { class: 'panel help' },
        h('h2', null, 'Installare lo script (una volta, gratis)'),
        h('ol', null,
          h('li', null, 'Crea un secondo token GitHub fine-grained, come quello dell\'app: solo repo ', h('code', null, 'documenti-casa-data'), ', Contents: Read and write.'),
          h('li', null, 'Entra in Google con ', h('b', null, DB.meta.mailbox || 'la casella da controllare'), ' e apri ', h('a', { href: 'https://script.google.com/home/projects/create', target: '_blank', rel: 'noopener' }, 'script.google.com → Nuovo progetto'), '.'),
          h('li', null, 'Cancella il contenuto di Code.gs e incolla quello di ', h('a', { href: repoUrl, target: '_blank', rel: 'noopener' }, 'apps-script/Code.gs'), '. Salva.'),
          h('li', null, 'Impostazioni progetto (ingranaggio) → Fuso orario: Europe/Rome. Poi in fondo, "Proprietà script", aggiungi: ', h('code', null, 'GH_TOKEN'), ' = il token, ', h('code', null, 'GH_OWNER'), ' = Cartesio89, ', h('code', null, 'GH_REPO'), ' = documenti-casa-data.'),
          h('li', null, 'Torna all\'editor, scegli la funzione ', h('code', null, 'setup'), ' e premi Esegui. Google chiede le autorizzazioni (Gmail, Calendar, connessioni esterne): accetta. Se dice "app non verificata": Avanzate → Vai al progetto.'),
          h('li', null, 'Fatto: controlla la casella ogni 15 minuti. Qui sopra vedrai l\'ora dell\'ultimo controllo.')))),
    ],
  };
}

/* ---------------- Abitazioni */
function viewHomes() {
  const hs = homes();
  const count = (id) => docs().filter((d) => d.section !== 'multe' && docHomeId(d) === id).length;
  const save = (x, patch) => { Object.assign(x, patch, { updatedAt: now() }); persist({ render: false }); };
  return {
    top: topBar('Abitazioni', { back: 'altro', small: true }),
    body: [h('div', { class: 'detail' },
      h('p', { class: 'help', style: 'margin:0' }, hs.length > 1
        ? 'Quando archivi un documento scegli a quale abitazione appartiene (le multe no). In Pagamenti e Archivio puoi filtrare per abitazione.'
        : 'Finché c\'è una sola abitazione l\'app non chiede nulla: tutti i documenti vanno qui. Dalla seconda in poi, a ogni documento scegli la casa.'),
      h('div', { class: 'list' }, hs.map((x) => h('div', { class: 'panel home-card' },
        h('div', { class: 'field' }, h('label', null, 'Nome'), h('input', { class: 'input', value: x.name, onchange: (e) => { const v = e.target.value.trim(); if (v) save(x, { name: v }); } })),
        h('div', { class: 'field' }, h('label', null, 'Indirizzo (facoltativo)'), h('input', { class: 'input', value: x.address || '', placeholder: 'Via…', onchange: (e) => save(x, { address: e.target.value.trim() }) })),
        h('div', { class: 'inline', style: 'margin-top:10px' },
          h('span', { class: 'small muted', style: 'flex:1' }, `${count(x.id)} documenti`),
          hs.length > 1 ? h('button', { class: 'btn ghost danger', onclick: () => {
            if (count(x.id)) { alert('Questa abitazione ha ancora documenti: spostali prima su un\'altra (dal documento, campo Abitazione).'); return; }
            if (!confirm(`Eliminare "${x.name}"?`)) return;
            save(x, { deleted: true }); if (UI.home === x.id) UI.home = 'all'; render();
          } }, icon('trash'), 'Elimina') : null)))),
      h('button', { class: 'btn primary', onclick: () => {
        const n = prompt('Nome della nuova abitazione (es. "Casa al mare", "Via Galba")');
        if (!n || !n.trim()) return;
        if (hs.length === 1 && hs[0].name === 'Casa') {
          const first = prompt('Come chiamo la casa che hai già (dove stanno i documenti attuali)?', 'Casa');
          if (first && first.trim()) save(hs[0], { name: first.trim() });
        }
        const x = { id: uid('h'), name: n.trim(), address: '', order: (hs[hs.length - 1].order || 0) + 1000, createdAt: now(), updatedAt: now() };
        DB.homes[x.id] = x; persist(); toast('Abitazione aggiunta');
      } }, icon('plus'), 'Aggiungi abitazione'))],
  };
}

/* ---------------- Tag */
function viewTags() {
  const ts = tags();
  return {
    top: topBar('Tag', { back: 'altro', small: true }),
    body: [h('div', { class: 'detail' },
      h('p', { class: 'help', style: 'margin:0' }, 'I tag li crei dentro un documento (campo Tag) e poi li riusi per gli altri. Qui li rinomini o li elimini.'),
      ts.length ? h('div', { class: 'list' }, ts.map((t) => h('div', { class: 'proj-row' },
        h('span', { class: 'swatch-btn', style: `background:${t.color}` }),
        h('input', { class: 'input', value: t.name, onchange: (e) => { const v = e.target.value.trim(); if (v) { t.name = v; t.updatedAt = now(); persist(); } } }),
        h('span', { class: 'small muted' }, docs().filter((d) => (d.tags || []).includes(t.id)).length),
        h('button', { class: 'icon-btn plain', 'aria-label': 'Elimina tag ' + t.name, onclick: () => {
          if (!confirm(`Eliminare il tag "${t.name}"? Viene tolto dai documenti.`)) return;
          t.deleted = true; t.updatedAt = now();
          for (const d of docs()) if ((d.tags || []).includes(t.id)) { d.tags = d.tags.filter((x) => x !== t.id); d.updatedAt = now(); }
          persist();
        } }, icon('trash'))))) : h('div', { class: 'empty' }, 'Nessun tag ancora.'))],
  };
}

/* ---------------- campi riusabili */
function catSelect(value, onChange, withMulte) {
  const opts = [...CATS, ...(withMulte ? [MULTE] : [])];
  return h('select', { class: 'input', 'aria-label': 'Categoria', onchange: (e) => onChange(e.target.value) },
    opts.map((c) => h('option', { value: c.id, selected: c.id === value }, c.name)));
}
function subSelect(catId, value, onChange) {
  const c = catById(catId);
  const subs = c ? [...c.subs] : [];
  if (value && !subs.includes(value)) subs.push(value);
  return h('select', { class: 'input', 'aria-label': 'Sottocategoria', disabled: !subs.length, onchange: (e) => onChange(e.target.value) },
    h('option', { value: '' }, subs.length ? 'Sottocategoria…' : 'Nessuna sottocategoria'),
    subs.map((s) => h('option', { value: s, selected: s === value }, s)));
}
function workSelect(value, onChange, homeId) {
  const sel = h('select', { class: 'input', 'aria-label': 'Lavoro', onchange: (e) => {
    if (e.target.value === '__new') {
      const n = prompt('Nome del nuovo lavoro');
      if (n && n.trim()) { const w = createWork(n.trim(), homeId); onChange(w.id); sel.replaceWith(workSelect(w.id, onChange, homeId)); } else e.target.value = value || '';
    } else onChange(e.target.value || null);
  } },
    h('option', { value: '' }, 'Nessun lavoro'),
    works().filter((w) => !homeId || !multiHome() || workHomeId(w) === homeId || w.id === value).map((w) => h('option', { value: w.id, selected: w.id === value }, w.name)),
    h('option', { value: '__new' }, '+ Nuovo lavoro…'));
  return sel;
}
function tagPicker(selected, onChange) {
  const wrap = h('div', { class: 'toggles' });
  const draw = () => {
    wrap.replaceChildren(
      ...tags().map((t) => h('button', { type: 'button', class: 'toggle t-lbl', style: `--c:${t.color}`, 'aria-pressed': String(selected.includes(t.id)), onclick: () => {
        selected = selected.includes(t.id) ? selected.filter((x) => x !== t.id) : [...selected, t.id]; onChange(selected); draw();
      } }, h('span', { class: 'sw', style: `background:${t.color}` }), t.name)),
      h('button', { type: 'button', class: 'toggle t-add', onclick: () => {
        const n = prompt('Nuovo tag (es. "detrazione 50%", "cucina", "da portare al commercialista")');
        if (!n || !n.trim()) return;
        const t = createTag(n.trim());
        if (!selected.includes(t.id)) selected = [...selected, t.id];
        onChange(selected); draw();
      } }, icon('plus'), 'Nuovo tag'));
  };
  draw();
  return wrap;
}
function pickFiles(capture, multiple, onFiles) {
  const inp = h('input', { type: 'file', accept: capture ? 'image/*' : 'image/*,application/pdf', capture: capture ? 'environment' : null, multiple: multiple || null, style: 'display:none' });
  inp.addEventListener('change', () => { const fl = [...inp.files]; inp.remove(); if (fl.length) onFiles(fl); });
  document.body.append(inp); inp.click();
}

/* ---------------- OCR (Tesseract, caricato solo quando serve) */
let ocrWorker = null;
async function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Download non riuscito: ' + src)); document.head.append(s); });
}
const absUrl = (p) => new URL(p, location.href).href;
/* OCR (foto): motore e dizionario italiano sono nell'app stessa (vendor/ocr), scaricati solo al primo uso */
async function ocrBlobs(blobs, onProgress) {
  if (!window.Tesseract) await loadScript('vendor/ocr/tesseract.min.js');
  if (!ocrWorker) ocrWorker = await window.Tesseract.createWorker('ita', 1, {
    workerPath: absUrl('vendor/ocr/worker.min.js'), corePath: absUrl('vendor/ocr/'), langPath: absUrl('vendor/ocr'), workerBlobURL: false, gzip: true,
    logger: (m) => { if (onProgress && m.status) onProgress(m.status, m.progress); },
  });
  let text = '';
  for (const b of blobs) text += (await ocrWorker.recognize(b)).data.text + '\n';
  return text;
}
/* PDF: il testo è già dentro il file, lettura rapida e affidabile (pdf.js, nell'app) */
async function pdfText(blob, maxPages = 3) {
  if (!window.pdfjsLib) await loadScript('vendor/pdf/pdf.min.js');
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf/pdf.worker.min.js';
  const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
  const lines = [];
  for (let n = 1; n <= Math.min(pdf.numPages, maxPages); n++) {
    const tc = await (await pdf.getPage(n)).getTextContent();
    const rows = new Map();
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const y = Math.round(it.transform[5] / 3) * 3;
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y).push({ x: it.transform[4], s: it.str });
    }
    [...rows.entries()].sort((a, b) => b[0] - a[0]).forEach(([, its]) => lines.push(its.sort((a, b) => a.x - b.x).map((i) => i.s).join(' ').replace(/\s+/g, ' ').trim()));
  }
  return lines.join('\n');
}
async function textFromPages(pages, withOcr, onProgress) {
  let text = '';
  for (const p of pages.filter((x) => x.type === 'pdf')) { try { text += await pdfText(p.blob) + '\n'; } catch (e) { /* PDF scansionato o protetto */ } }
  if (withOcr) { const imgs = pages.filter((x) => x.type !== 'pdf').slice(0, 3); if (imgs.length) text += await ocrBlobs(imgs.map((x) => x.blob), onProgress); }
  return text.trim();
}
const OCR_LABELS = { 'recognizing text': 'Leggo il testo', 'loading language traineddata': 'Carico il dizionario italiano', 'initializing api': 'Preparo il lettore', 'loading tesseract core': 'Carico il lettore' };

/* ---------------- Nuovo documento */
let draft = null;
function freshDraft(q) {
  const section = q.get('section') === 'multe' ? 'multe' : 'casa';
  const cat = section === 'multe' ? 'multe' : (q.get('cat') || 'utenze');
  const w = work(q.get('work'));
  return {
    key: q.toString(), pages: [], title: '', section, category: cat, sub: q.get('sub') || '', workId: w ? w.id : null,
    homeId: w ? workHomeId(w) : defaultHomeId(),
    status: section === 'multe' || cat === 'utenze' || cat === 'condominio' ? 'da_pagare' : 'none',
    amount: '', docDate: todayISO(), dueDate: '', tags: [], notes: '', suggested: {}, ocrState: '',
    fromShare: q.get('shared') === '1', shareLoaded: false,
  };
}
function applySuggestions(D, text) {
  const r = window.DocParse.parseDocText(text, todayISO());
  const found = [];
  const free = (k, v) => !v || D.suggested[k];
  if (r.amount != null && free('amount', D.amount)) { D.amount = euroInput(r.amount); D.suggested.amount = true; found.push('importo'); }
  if (r.dueDate && free('dueDate', D.dueDate)) { D.dueDate = r.dueDate; D.suggested.dueDate = true; found.push('scadenza'); }
  if (r.docDate && (D.docDate === todayISO() || D.suggested.docDate)) { D.docDate = r.docDate; D.suggested.docDate = true; found.push('data'); }
  if (text) D.ocrText = text.slice(0, 4000);
  return found;
}
function viewNew(route) {
  if (!draft || draft.key !== route.q.toString()) draft = freshDraft(route.q);
  const D = draft;
  const redraw = () => { if (parseRoute().name !== 'nuovo' || draft !== D) return; const y = window.scrollY; render(true); window.scrollTo(0, y); };
  const addFiles = async (fl) => {
    D.ocrState = 'Preparo le pagine…'; redraw();
    const ps = await filesToPages(fl); ps.forEach((p) => { p.url = URL.createObjectURL(p.blob); }); D.pages.push(...ps);
    D.ocrState = '';
    if (ps.some((p) => p.type === 'pdf')) {
      D.ocrState = 'Leggo il PDF…'; redraw();
      const text = await textFromPages(ps, false);
      const found = text ? applySuggestions(D, text) : [];
      if (!D.title && D.fromShare && fl[0] && fl[0].name) D.title = fl[0].name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').slice(0, 60);
      D.ocrState = found.length ? `Dal PDF ho proposto: ${found.join(', ')}. Controlla i campi in giallo.` : (text ? 'Nel PDF non ho trovato importo o scadenza: compila a mano.' : 'Il PDF non contiene testo leggibile (è una scansione): usa la foto e "Leggi dalla foto".');
    }
    redraw();
  };
  if (D.fromShare && !D.shareLoaded) {
    D.shareLoaded = true;
    IDB.sharedTake().then(async (sh) => {
      if (!sh) return;
      const link = sh.url || (String(sh.text || '').match(/https?:\/\/\S+/) || [])[0];
      if (sh.title && !D.title) D.title = String(sh.title).slice(0, 80);
      if (sh.text || link) D.notes = [sh.text && sh.text !== link ? sh.text : '', link || ''].filter(Boolean).join('\n');
      const files = (sh.files || []).map((f) => new File([f.blob], f.name || 'documento', { type: f.type || f.blob.type }));
      if (files.length) await addFiles(files); else redraw();
    }).catch(() => {});
  }
  const sug = (k) => (D.suggested[k] ? ' suggested' : '');
  const unsug = (k) => { delete D.suggested[k]; };
  const pagesGrid = h('div', { class: 'pages' },
    D.pages.map((p, i) => h('div', { class: 'page' },
      p.type === 'pdf' ? h('div', { class: 'pdf-thumb' }, icon('file'), h('span', null, p.name || 'PDF')) : h('img', { src: p.url, alt: 'Pagina ' + (i + 1) }),
      h('span', { class: 'page-n' }, i + 1),
      h('div', { class: 'page-act' },
        i > 0 ? h('button', { 'aria-label': 'Sposta prima', onclick: () => { [D.pages[i - 1], D.pages[i]] = [D.pages[i], D.pages[i - 1]]; redraw(); } }, icon('left')) : null,
        h('button', { 'aria-label': 'Rimuovi pagina', onclick: () => { D.pages.splice(i, 1); redraw(); } }, icon('close')),
        i < D.pages.length - 1 ? h('button', { 'aria-label': 'Sposta dopo', onclick: () => { [D.pages[i + 1], D.pages[i]] = [D.pages[i], D.pages[i + 1]]; redraw(); } }, icon('right')) : null))),
  );
  const images = D.pages.filter((p) => p.type !== 'pdf');
  const runOcr = async () => {
    D.ocrState = 'Avvio lettura… (la prima volta il telefono scarica circa 6 MB, poi resta salvato)'; redraw();
    try {
      const text = await textFromPages(images, true, (st, pr) => { const el = $('.ocr-state'); if (el) el.textContent = (OCR_LABELS[st] || st) + (pr ? ` ${Math.round(pr * 100)}%` : ''); });
      const found = applySuggestions(D, text);
      D.ocrState = found.length ? `Proposti: ${found.join(', ')}. Controlla i campi in giallo prima di salvare.` : 'Non ho trovato importo o date leggibili. Compila a mano.';
    } catch (e) { D.ocrState = 'Lettura non riuscita: ' + e.message; }
    redraw();
  };
  const c = catById(D.category);
  const isMulte = D.section === 'multe';
  const save = async (btn) => {
    if (!D.title.trim()) { alert('Dai un titolo al documento (es. "Engie ottobre", "Condominio rata 3").'); $('.title-input').focus(); return; }
    if (Object.keys(D.suggested).length && !confirm('Importo e date sono stati proposti dalla lettura automatica. Li hai controllati?')) return;
    btn.disabled = true; btn.textContent = 'Salvo…';
    try {
      const d = newDoc({
        title: D.title.trim(), section: D.section, category: isMulte ? 'multe' : D.category, sub: isMulte ? '' : D.sub,
        homeId: isMulte ? null : D.homeId,
        workId: !isMulte && c && c.works ? D.workId : null, status: D.status, amount: parseEuro(D.amount),
        docDate: D.docDate || todayISO(), dueDate: D.dueDate || null, tags: D.tags, notes: D.notes.trim(),
        ocrText: D.ocrText || '', paidAt: D.status === 'pagato' ? todayISO() : null,
      });
      if (!isMulte && multiHome()) lsSet('dc.lastHome', D.homeId);
      d.pages = await storePages(d, D.pages, 0);
      D.pages.forEach((p, i) => fileCache.set(d.pages[i].path, p.url));
      draft = null;
      persist({ render: false });
      location.replace('#/doc/' + d.id);
      toast(!navigator.onLine ? 'Salvato sul telefono: si sincronizza appena torni online' : Sync.enabled() ? (d.pages.length ? 'Salvato, carico i file…' : 'Salvato') : 'Salvato su questo dispositivo');
    } catch (e) { btn.disabled = false; btn.textContent = 'Salva'; alert('Salvataggio non riuscito: ' + e.message); }
  };
  /* condivisione: allega a una bolletta già creata dalla mail, senza file */
  const attachTargets = D.fromShare && D.pages.length
    ? docs().filter((d) => d.status !== 'pagato' || d.unseen).filter((d) => !(d.pages || []).length).sort((a, b) => (b.unseen - a.unseen) || (b.createdAt - a.createdAt)).slice(0, 5) : [];
  const attachTo = async (d) => {
    const patch = {};
    const amt = parseEuro(D.amount);
    if (amt != null && d.amount == null) patch.amount = amt;
    if (D.dueDate && !d.dueDate) patch.dueDate = D.dueDate;
    const msg = [patch.amount != null ? 'Importo: ' + fmtEuro(patch.amount) : null, patch.dueDate ? 'Scadenza: ' + fmtDate(patch.dueDate, true) : null].filter(Boolean);
    if (msg.length && !confirm(`Allego il file a "${d.title}" e imposto:\n${msg.join('\n')}\n\nVa bene? (Annulla = allego solo il file)`)) { delete patch.amount; delete patch.dueDate; }
    const stored = await storePages(d, D.pages, (d.pages || []).length);
    D.pages.forEach((p, i) => fileCache.set(stored[i].path, p.url));
    if (D.ocrText && !d.ocrText) patch.ocrText = D.ocrText;
    draft = null;
    updateDoc(d.id, Object.assign(patch, { pages: [...(d.pages || []), ...stored] }), { render: false });
    location.replace('#/doc/' + d.id);
    toast('File allegato');
  };
  const filesPanel = h('div', { class: 'panel' },
    h('h2', null, 'Foto e file', h('span', { class: 'prog' }, D.pages.length ? `${D.pages.length}` : 'facoltativi')),
    D.pages.length ? pagesGrid : h('p', { class: 'help', style: 'margin:0 0 10px' }, 'Fotografa il documento una pagina alla volta, oppure carica foto o PDF. Dai PDF l\'app propone da sola importo e scadenza.'),
    h('div', { class: 'inline' },
      h('button', { class: 'btn', onclick: () => pickFiles(true, false, addFiles) }, icon('camera'), D.pages.length ? 'Aggiungi pagina' : 'Scatta foto'),
      h('button', { class: 'btn', onclick: () => pickFiles(false, true, addFiles) }, icon('upload'), 'Carica file')),
    images.length ? h('button', { class: 'btn block', style: 'margin-top:10px', onclick: runOcr }, icon('scan'), 'Leggi importo e date dalla foto') : null,
    D.ocrState ? h('p', { class: 'small ocr-state', style: 'margin:8px 0 0' }, D.ocrState) : null);
  const body = [h('div', { class: 'detail' },
    attachTargets.length ? h('div', { class: 'panel attach' },
      h('h2', null, icon('mail'), 'Allega a un documento esistente?'),
      h('p', { class: 'help', style: 'margin:0 0 10px' }, 'Questi non hanno ancora un file (per esempio le bollette arrivate per mail).'),
      h('div', { class: 'list' }, attachTargets.map((d) => h('button', { class: 'card-link', onclick: () => attachTo(d) },
        h('span', { class: 'ic' }, icon(catById(d.category) ? catById(d.category).icon : 'file')),
        h('span', { class: 't' }, h('b', null, d.title), h('span', null, catLabel(d) + (d.amount != null ? ' · ' + fmtEuro(d.amount) : ''))),
        h('span', { class: 'chev' }, icon('chev'))))),
      h('p', { class: 'help', style: 'margin:10px 0 0' }, 'Oppure compila qui sotto per creare un documento nuovo.')) : null,
    h('textarea', { class: 'title-input', rows: 1, placeholder: isMulte ? 'Titolo (es. Multa ZTL via Nazionale)' : 'Titolo (es. Engie ottobre)', value: D.title, oninput: (e) => { D.title = e.target.value; } }),
    h('div', { class: 'panel props' },
      segmented([['casa', 'Documento'], ['multe', 'Multa']], D.section, (k) => { D.section = k; if (k === 'multe') { D.status = 'da_pagare'; } else if (D.category === 'multe') D.category = 'utenze'; redraw(); }),
      !isMulte && multiHome() ? h('div', { class: 'field' }, h('label', null, 'Abitazione'), homeSelect(D.homeId, (v) => { D.homeId = v; if (D.workId && work(D.workId) && workHomeId(work(D.workId)) !== v) D.workId = null; redraw(); })) : null,
      isMulte ? null : h('div', { class: 'field' }, h('label', null, 'Categoria'), catSelect(D.category, (v) => { D.category = v; D.sub = ''; if (['utenze', 'condominio'].includes(v) && D.status === 'none') D.status = 'da_pagare'; redraw(); })),
      !isMulte && c && c.subs.length ? h('div', { class: 'field' }, h('label', null, 'Sottocategoria'), subSelect(D.category, D.sub, (v) => { D.sub = v; redraw(); })) : null,
      !isMulte && c && c.works ? h('div', { class: 'field' }, h('label', null, 'Lavoro'), workSelect(D.workId, (v) => { D.workId = v; }, D.homeId)) : null,
      h('div', { class: 'field' }, h('label', null, 'Stato'),
        segmented([['da_pagare', 'Da pagare'], ['addebitata', 'Addebito'], ['pagato', 'Pagato'], ['none', '–']], D.status, (k) => { D.status = k; redraw(); })),
      h('div', { class: 'field' }, h('label', { for: 'n-amt' }, 'Importo (€)'),
        h('input', { class: 'input' + sug('amount'), id: 'n-amt', inputmode: 'decimal', placeholder: '0,00', value: D.amount, oninput: (e) => { D.amount = e.target.value; unsug('amount'); e.target.classList.remove('suggested'); } })),
      h('div', { class: 'field' }, h('label', { for: 'n-due' }, dueLabel(D)),
        h('input', { class: 'input' + sug('dueDate'), id: 'n-due', type: 'date', value: D.dueDate, onchange: (e) => { D.dueDate = e.target.value; unsug('dueDate'); e.target.classList.remove('suggested'); } })),
      h('div', { class: 'field' }, h('label', { for: 'n-date' }, 'Data del documento'),
        h('input', { class: 'input' + sug('docDate'), id: 'n-date', type: 'date', value: D.docDate, onchange: (e) => { D.docDate = e.target.value; unsug('docDate'); e.target.classList.remove('suggested'); } })),
      h('div', { class: 'field' }, h('label', null, 'Tag'), tagPicker(D.tags, (v) => { D.tags = v; })),
      h('div', { class: 'field' }, h('label', { for: 'n-notes' }, 'Note'),
        h('textarea', { class: 'input', id: 'n-notes', placeholder: isMulte ? 'Targa, luogo, numero verbale, termine per lo sconto…' : 'Note libere: numero contratto, ditta, cosa comprende…', value: D.notes, oninput: (e) => { D.notes = e.target.value; } }))),
    filesPanel,
    h('button', { class: 'btn primary block', onclick: (e) => save(e.currentTarget) }, icon('check'), 'Salva'),
  )];
  return { top: topBar(isMulte ? 'Nuova multa' : 'Nuovo documento', { back: isMulte ? 'multe' : 'pagamenti', small: true }), body };
}

/* ---------------- Visualizzatore pagine */
async function openViewer(d, index) {
  const v = $('#viewer');
  const pages = d.pages || [];
  let i = index;
  const show = async () => {
    const p = pages[i];
    v.replaceChildren(h('div', { class: 'viewer-bar' },
      h('span', null, `${i + 1} / ${pages.length}`),
      h('button', { class: 'icon-btn plain', 'aria-label': 'Chiudi', onclick: close }, icon('close'))),
    h('div', { class: 'viewer-body' }, h('p', { class: 'muted' }, 'Carico…')),
    pages.length > 1 ? h('div', { class: 'viewer-nav' },
      h('button', { class: 'icon-btn', 'aria-label': 'Precedente', disabled: i === 0, onclick: () => { i--; show(); } }, icon('left')),
      h('button', { class: 'icon-btn', 'aria-label': 'Successiva', disabled: i === pages.length - 1, onclick: () => { i++; show(); } }, icon('right'))) : null);
    try {
      const url = await fileUrl(p.path);
      $('.viewer-body', v).replaceChildren(p.type === 'pdf'
        ? h('div', { class: 'viewer-pdf' }, icon('file'), h('p', null, p.name || 'PDF'), h('a', { class: 'btn primary', href: url, target: '_blank', rel: 'noopener' }, icon('ext'), 'Apri PDF'))
        : h('img', { src: url, alt: 'Pagina ' + (i + 1) }));
    } catch (e) { $('.viewer-body', v).replaceChildren(h('p', { class: 'muted' }, 'Non riesco a caricare il file: ' + e.message)); }
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  function close() { v.hidden = true; v.replaceChildren(); document.removeEventListener('keydown', onKey); if (pendingRender) render(); }
  document.addEventListener('keydown', onKey);
  v.hidden = false;
  show();
}
async function exportPdf(d, share) {
  const imgs = (d.pages || []).filter((p) => p.type !== 'pdf');
  if (!imgs.length) { alert('Questo documento non ha foto da unire (i PDF si aprono già così).'); return; }
  toast('Preparo il PDF…');
  if (!window.jspdf) await loadScript('vendor/jspdf.umd.min.js');
  const { jsPDF } = window.jspdf;
  let pdf = null;
  for (const p of imgs) {
    const blob = await fileBlob(p.path);
    const dataUrl = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
    const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = dataUrl; });
    const portrait = img.height >= img.width;
    const W = portrait ? 210 : 297, H = portrait ? 297 : 210;
    if (!pdf) pdf = new jsPDF({ orientation: portrait ? 'p' : 'l', unit: 'mm', format: 'a4' });
    else pdf.addPage('a4', portrait ? 'p' : 'l');
    const k = Math.min(W / img.width, H / img.height);
    const w = img.width * k, hh = img.height * k;
    pdf.addImage(dataUrl, 'JPEG', (W - w) / 2, (H - hh) / 2, w, hh);
  }
  const name = (d.title || 'documento').replace(/[^\w\-àèéìòù ]+/gi, '').trim().replace(/\s+/g, '_') + '.pdf';
  const blob = pdf.output('blob');
  const file = new File([blob], name, { type: 'application/pdf' });
  if (share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: d.title }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = h('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); a.remove();
}

/* ---------------- ZIP con cartelle come nell'app */
const safeName = (s) => String(s || '').replace(/[\\/:*?"<>|#%]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'senza nome';
function zipFolder(d) {
  if (d.section === 'multe') return `Multe/${docYear(d)}`;
  const pre = multiHome() ? safeName(docHome(d).name) + '/' : '';
  const c = catById(d.category) || catById('altro');
  const w = work(d.workId);
  if (c.works && w) return `${pre}${safeName(c.name)}/${safeName(w.name)}/${safeName(d.sub || 'Altro')}`;
  return pre + [safeName(c.name), docYear(d), d.sub ? safeName(d.sub) : null].filter(Boolean).join('/');
}
async function exportZip(onProgress) {
  if (!window.JSZip) await loadScript('vendor/jszip.min.js');
  const zip = new window.JSZip();
  const all = docs().filter((d) => (d.pages || []).length);
  const csv = [['Cartella', 'Abitazione', 'Titolo', 'Categoria', 'Sottocategoria', 'Lavoro', 'Stato', 'Importo', 'Data documento', 'Scadenza', 'Pagato il', 'Tag', 'Note', 'File'].join(';')];
  const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""').replace(/\r?\n/g, ' ') + '"';
  const total = all.reduce((s, d) => s + d.pages.length, 0);
  let done = 0, failed = 0;
  for (const d of all) {
    const folder = zipFolder(d), base = `${d.docDate || ''} ${safeName(d.title)}`.trim();
    const names = [];
    for (let i = 0; i < d.pages.length; i++) {
      const p = d.pages[i];
      const name = `${base}${d.pages.length > 1 ? ` - p${i + 1}` : ''}.${p.type === 'pdf' ? 'pdf' : 'jpg'}`;
      try { zip.file(`${folder}/${name}`, await fileBlob(p.path)); names.push(name); } catch (e) { failed++; }
      done++; if (onProgress) onProgress(done, total);
    }
    csv.push([folder, d.section === 'multe' ? '' : docHome(d).name, d.title, d.section === 'multe' ? 'Multe' : (catById(d.category) || {}).name, d.sub, (work(d.workId) || {}).name, STATUS[d.status] ? STATUS[d.status].label : '',
      d.amount != null ? euroInput(d.amount) : '', d.docDate, d.dueDate, d.paidAt, (d.tags || []).map((t) => tag(t) && tag(t).name).filter(Boolean).join(', '), d.notes, names.join(' | ')].map(q).join(';'));
  }
  zip.file('elenco.csv', '﻿' + csv.join('\r\n'));
  const blob = await zip.generateAsync({ type: 'blob' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `documenti-casa-${todayISO()}.zip` }); document.body.append(a); a.click(); a.remove();
  return { total, failed, size: blob.size };
}

/* ---------------- Dettaglio documento */
function viewDoc(route) {
  const d = DB.docs[route.arg];
  if (!d || d.deleted) return { top: topBar('Non trovato', { back: 'pagamenti', small: true }), body: [h('div', { class: 'empty' }, 'Questo documento non esiste più.')] };
  if (d.unseen) { d.unseen = false; d.updatedAt = now(); persist({ render: false }); }
  const id = d.id;
  const set = (patch, rerender) => updateDoc(id, patch, { render: !!rerender });
  const c = catById(d.category);
  const isMulte = d.section === 'multe';
  const addPages = async (fl) => {
    const ps = await filesToPages(fl);
    if (!ps.length) return;
    ps.forEach((p) => { p.url = URL.createObjectURL(p.blob); });
    const stored = await storePages(d, ps, (d.pages || []).length);
    stored.forEach((s, k) => fileCache.set(s.path, ps[k].url));
    set({ pages: [...(d.pages || []), ...stored] }, true);
    toast(ps.length === 1 ? 'Pagina aggiunta' : `${ps.length} pagine aggiunte`);
    if (ps.some((p) => p.type === 'pdf')) {
      const text = await textFromPages(ps, false).catch(() => '');
      const r = text ? window.DocParse.parseDocText(text, todayISO()) : {};
      const patch = {};
      if (r.amount != null && r.amount !== d.amount) patch.amount = r.amount;
      if (r.dueDate && r.dueDate !== d.dueDate) patch.dueDate = r.dueDate;
      const msg = [patch.amount != null ? `Importo: ${fmtEuro(patch.amount)}${d.amount != null ? ' (ora ' + fmtEuro(d.amount) + ')' : ''}` : null,
        patch.dueDate ? `${dueLabel(d)}: ${fmtDate(patch.dueDate, true)}${d.dueDate ? ' (ora ' + fmtDate(d.dueDate, true) + ')' : ''}` : null].filter(Boolean);
      if (text && !d.ocrText) set({ ocrText: text.slice(0, 4000) });
      if (msg.length && confirm('Dal PDF ho letto:\n' + msg.join('\n') + '\n\nLi applico al documento?')) set(patch, true);
    }
  };
  const thumbs = h('div', { class: 'pages' }, (d.pages || []).map((p, i) => {
    const cell = h('button', { class: 'page', onclick: () => openViewer(d, i), 'aria-label': 'Apri pagina ' + (i + 1) },
      p.type === 'pdf' ? h('div', { class: 'pdf-thumb' }, icon('file'), h('span', null, p.name || 'PDF')) : h('div', { class: 'thumb-loading' }),
      h('span', { class: 'page-n' }, i + 1));
    if (p.type !== 'pdf') fileUrl(p.path).then((u) => { const l = $('.thumb-loading', cell); if (l) l.replaceWith(h('img', { src: u, alt: '' })); })
      .catch(() => { const l = $('.thumb-loading', cell); if (l) l.textContent = '!'; });
    return cell;
  }));
  const removePage = (i) => {
    if (!confirm(`Togliere la pagina ${i + 1} dal documento? (Il file resta nello storico del repo.)`)) return;
    set({ pages: d.pages.filter((_, k) => k !== i) }, true);
  };
  const ocrExisting = async (btn) => {
    const imgs = (d.pages || []).slice(0, 4);
    btn.disabled = true; const label = btn.textContent; btn.textContent = 'Leggo… (la prima volta carica circa 6 MB)';
    try {
      const loaded = []; for (const p of imgs) loaded.push({ type: p.type, blob: await fileBlob(p.path) });
      const r = window.DocParse.parseDocText(await textFromPages(loaded, true), todayISO());
      const msg = [r.amount != null ? 'Importo: ' + fmtEuro(r.amount) : null, r.dueDate ? 'Scadenza: ' + fmtDate(r.dueDate, true) : null, r.docDate ? 'Data: ' + fmtDate(r.docDate, true) : null].filter(Boolean);
      if (!msg.length) alert('Non ho trovato importo o date leggibili.');
      else if (confirm('Ho letto:\n' + msg.join('\n') + '\n\nApplico questi valori al documento?')) {
        const patch = {}; if (r.amount != null) patch.amount = r.amount; if (r.dueDate) patch.dueDate = r.dueDate; if (r.docDate) patch.docDate = r.docDate;
        set(patch, true); return;
      }
    } catch (e) { alert('Lettura non riuscita: ' + e.message); }
    btn.disabled = false; btn.textContent = label;
  };
  const mailPanel = d.mail ? h('div', { class: 'panel' },
    h('h2', null, icon('mail'), 'Arrivato per mail'),
    h('p', { class: 'small', style: 'margin:0 0 4px' }, h('b', null, d.mail.subject || '(senza oggetto)')),
    h('p', { class: 'small muted', style: 'margin:0 0 10px' }, `${d.mail.from || ''}${d.mail.receivedAt ? ' · ' + new Date(d.mail.receivedAt).toLocaleString('it-IT') : ''}`),
    d.mail.snippet ? h('p', { class: 'small notes-view', style: 'margin:0 0 10px' }, d.mail.snippet) : null,
    h('div', { class: 'inline' },
      (d.mail.links || []).map((l) => safeUrl(l.url) ? h('button', { class: 'btn primary', onclick: async () => {
        const cf = lsGet(LS.cf, '');
        if (cf) { try { await navigator.clipboard.writeText(cf); toast('Codice fiscale copiato: incollalo nella pagina'); } catch (e) { /* appunti non disponibili */ } }
        window.open(safeUrl(l.url), '_blank', 'noopener');
      } }, icon('ext'), l.text ? l.text.slice(0, 40) : 'Apri bolletta') : null),
      d.mail.messageId ? h('a', { class: 'btn', href: `https://mail.google.com/mail/?authuser=${encodeURIComponent(DB.meta.mailbox || '')}#all/${encodeURIComponent(d.mail.messageId)}`, target: '_blank', rel: 'noopener' }, icon('mail'), 'Apri mail') : null),
    (d.mail.links || []).length && !lsGet(LS.cf, '') ? h('p', { class: 'help', style: 'margin:10px 0 0' }, 'Se la pagina chiede il codice fiscale: salvalo in Altro → Mail automatica e l\'app lo copierà negli appunti quando apri il link.') : null,
    d.mail.calendarEvent ? h('p', { class: 'help', style: 'margin:10px 0 0' }, 'Evento già creato in calendario dallo script.') : null) : null;

  const body = [h('div', { class: 'detail' },
    h('textarea', { class: 'title-input', rows: 1, value: d.title, placeholder: 'Titolo', onchange: (e) => set({ title: e.target.value.trim() || d.title }) }),
    h('div', { class: 'panel' },
      h('div', { class: 'field' }, h('label', null, 'Stato'),
        segmented([['da_pagare', 'Da pagare'], ['addebitata', 'Addebito'], ['pagato', isMulte ? 'Pagata' : 'Pagato'], ['none', '–']], d.status, (k) => {
          set({ status: k, prevStatus: d.status === 'pagato' ? d.prevStatus : d.status, paidAt: k === 'pagato' ? (d.paidAt || todayISO()) : null }, true);
        })),
      d.status === 'pagato' ? h('div', { class: 'field' }, h('label', { for: 'd-paid' }, 'Pagato il'),
        h('input', { class: 'input', id: 'd-paid', type: 'date', value: d.paidAt || '', onchange: (e) => set({ paidAt: e.target.value || null }) })) : null,
      OPEN(d) ? h('button', { class: 'btn primary block', style: 'margin-top:12px', onclick: () => togglePaid(id) }, icon('check'), isMulte ? 'Segna pagata' : 'Segna pagato') : null),
    h('div', { class: 'panel' },
      h('h2', null, 'Pagine', h('span', { class: 'prog' }, (d.pages || []).length)),
      (d.pages || []).length ? thumbs : h('p', { class: 'help', style: 'margin:0 0 10px' }, 'Nessuna pagina.'),
      h('div', { class: 'inline', style: 'margin-top:10px' },
        h('button', { class: 'btn', onclick: () => pickFiles(true, false, addPages) }, icon('camera'), 'Aggiungi pagina'),
        h('button', { class: 'btn', onclick: () => pickFiles(false, true, addPages) }, icon('upload'), 'Aggiungi file'),
        (d.pages || []).some((p) => p.type !== 'pdf') ? h('button', { class: 'btn', onclick: () => exportPdf(d, true).catch((e) => alert('PDF non riuscito: ' + e.message)) }, icon('share'), 'PDF / condividi') : null),
      (d.pages || []).length ? h('details', { class: 'small', style: 'margin-top:10px' }, h('summary', null, 'Gestisci pagine'),
        h('div', { class: 'list', style: 'margin-top:8px' }, d.pages.map((p, i) => h('div', { class: 'proj-row' },
          h('span', { style: 'flex:1' }, `Pagina ${i + 1}${p.name ? ' · ' + p.name : ''}${p.size ? ' · ' + Math.round(p.size / 1024) + ' KB' : ''}`),
          i > 0 ? h('button', { class: 'icon-btn plain', 'aria-label': 'Sposta prima', onclick: () => { const a = [...d.pages]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; set({ pages: a }, true); } }, icon('left')) : null,
          h('button', { class: 'icon-btn plain', 'aria-label': 'Togli pagina', onclick: () => removePage(i) }, icon('trash')))))) : null,
      (d.pages || []).length ? h('button', { class: 'btn ghost', style: 'margin-top:6px', onclick: (e) => ocrExisting(e.currentTarget) }, icon('scan'), 'Leggi importo e date dai file') : null),
    mailPanel,
    h('div', { class: 'panel props' },
      segmented([['casa', 'Documento'], ['multe', 'Multa']], d.section, (k) => set({ section: k, category: k === 'multe' ? 'multe' : (d.category === 'multe' ? 'altro' : d.category) }, true)),
      !isMulte && multiHome() ? h('div', { class: 'field' }, h('label', null, 'Abitazione'), homeSelect(docHomeId(d), (v) => set({ homeId: v, workId: d.workId && work(d.workId) && workHomeId(work(d.workId)) !== v ? null : d.workId }, true))) : null,
      isMulte ? null : h('div', { class: 'field' }, h('label', null, 'Categoria'), catSelect(d.category, (v) => set({ category: v, sub: '', workId: catById(v).works ? d.workId : null }, true))),
      !isMulte && c && c.subs.length ? h('div', { class: 'field' }, h('label', null, 'Sottocategoria'), subSelect(d.category, d.sub, (v) => set({ sub: v }, true))) : null,
      !isMulte && c && c.works ? h('div', { class: 'field' }, h('label', null, 'Lavoro'), workSelect(d.workId, (v) => set({ workId: v }), docHomeId(d))) : null,
      h('div', { class: 'field' }, h('label', { for: 'd-amt' }, 'Importo (€)'),
        h('input', { class: 'input', id: 'd-amt', inputmode: 'decimal', placeholder: '0,00', value: euroInput(d.amount), onchange: (e) => set({ amount: parseEuro(e.target.value) }) })),
      h('div', { class: 'field' }, h('label', { for: 'd-due' }, dueLabel(d)),
        h('input', { class: 'input', id: 'd-due', type: 'date', value: d.dueDate || '', onchange: (e) => set({ dueDate: e.target.value || null }, true) })),
      d.dueDate ? h('a', { class: 'btn', href: gcalUrl(d), target: '_blank', rel: 'noopener', onclick: () => set({ calAddedAt: now() }) }, icon('cal'),
        d.calAddedAt ? 'Aggiungi di nuovo a calendario' : 'Aggiungi a calendario') : null,
      h('div', { class: 'field' }, h('label', { for: 'd-date' }, 'Data del documento'),
        h('input', { class: 'input', id: 'd-date', type: 'date', value: d.docDate || '', onchange: (e) => set({ docDate: e.target.value || null }) })),
      h('div', { class: 'field' }, h('label', null, 'Tag'), tagPicker(d.tags || [], (v) => set({ tags: v }))),
      h('div', { class: 'field' }, h('label', { for: 'd-notes' }, 'Note'),
        h('textarea', { class: 'input', id: 'd-notes', value: d.notes || '', placeholder: 'Note', onchange: (e) => set({ notes: e.target.value }) }))),
    d.ocrText ? h('details', { class: 'panel small' }, h('summary', null, 'Testo letto dalla foto'), h('p', { class: 'notes-view small muted' }, d.ocrText)) : null,
    h('button', { class: 'btn danger', onclick: () => { deleteDoc(id); goBack(isMulte ? 'multe' : 'pagamenti'); } }, icon('trash'), 'Elimina documento'),
    h('p', { class: 'footer-meta' }, `Creato il ${new Date(d.createdAt).toLocaleDateString('it-IT')}${d.source === 'mail' ? ' dalla mail' : ''}`),
  )];
  return { top: topBar(isMulte ? 'Multa' : (c ? c.name : 'Documento'), { back: isMulte ? 'multe' : 'pagamenti', small: true }), body,
    after: () => { const t = $('.title-input'); if (t) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; } } };
}

/* ================================================================ avvio */
if (!location.hash) history.replaceState(null, '', '#/pagamenti');
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === '127.0.0.1')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
window.addEventListener('offline', () => Sync.setState('offline'));
navStack.push(parseRoute().raw);
refreshPending().then(() => render());
render(true);
if (Sync.enabled()) Sync.run(); else Sync.setState('local');
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Sync.enabled()) Sync.run(); });
setInterval(() => { if (document.visibilityState === 'visible' && Sync.enabled() && !Sync.busy && !isEditing()) Sync.run(); }, 90 * 1000);
window.addEventListener('online', () => { if (Sync.enabled()) Sync.run(); });
window.addEventListener('pagehide', () => { if ((lsGet(LS.dirty, false) || pendingCount) && Sync.enabled()) Sync.run(); });
