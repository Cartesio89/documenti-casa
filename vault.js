/* Vault cifrato di Documenti casa: CUD, cedolini e altri documenti personali.
 *
 * Tutto viene cifrato NEL TELEFONO prima di partire; su GitHub (repo separato) arrivano solo dati illeggibili.
 *  - frase segreta --PBKDF2-SHA256 (600.000 iterazioni)--> chiave KEK
 *  - KEK avvolge una chiave dati casuale (DEK, AES-256-GCM): cambiare frase = riavvolgere la DEK, non ricifrare i file
 *  - con la DEK si cifrano: indice (titoli, anni, note…), ogni file, e anche il token GitHub del vault salvato sul telefono
 *  - i nomi dei file sul repo sono casuali: non rivelano nulla
 * Repo: vault.json (sale + DEK avvolta, non segreti), index.enc, f/<id>.enc
 * La chiave resta solo in memoria: il vault si chiude dopo 5 minuti di inattività o 60 s in background.
 * Caricato prima di app.js: usa le sue funzioni solo a runtime. */
'use strict';

const V = {
  KDF_ITER: 600000,
  LS: { cfg: 'dv.cfg', meta: 'dv.meta', tok: 'dv.tok', idx: 'dv.idx', sha: 'dv.idxsha' },
  key: null, // DEK (CryptoKey, non estraibile) — solo in memoria
  token: null,
  index: null, // { items: {...} }
  lastActive: 0, hiddenAt: 0, state: 'idle', error: '', busy: false, again: false, timer: null,
};
const vEnc = new TextEncoder(), vDec = new TextDecoder();
const u8ToB64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const b64ToU8 = (b64) => Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0));
const rnd = (n) => crypto.getRandomValues(new Uint8Array(n));

/* ---------------- crittografia */
async function vKek(pass, saltB64, iter) {
  const base = await crypto.subtle.importKey('raw', vEnc.encode(pass.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: b64ToU8(saltB64), iterations: iter },
    base, { name: 'AES-GCM', length: 256 }, false, ['wrapKey', 'unwrapKey']);
}
async function vUnwrap(pass, meta) {
  const kek = await vKek(pass, meta.salt, meta.iter);
  const w = b64ToU8(meta.wrapped);
  try {
    return await crypto.subtle.unwrapKey('raw', w.slice(12), kek, { name: 'AES-GCM', iv: w.slice(0, 12) }, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  } catch (e) { throw new Error('Frase sbagliata'); }
}
async function vWrap(pass, dekExtractable) {
  const salt = u8ToB64(rnd(16));
  const kek = await vKek(pass, salt, V.KDF_ITER);
  const iv = rnd(12);
  const ct = new Uint8Array(await crypto.subtle.wrapKey('raw', dekExtractable, kek, { name: 'AES-GCM', iv }));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
  return { v: 1, kdf: 'PBKDF2-SHA256', iter: V.KDF_ITER, salt, wrapped: u8ToB64(out) };
}
async function vEncrypt(bytes) {
  const iv = rnd(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, V.key, bytes));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
  return out;
}
async function vDecrypt(u8) {
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u8.slice(0, 12) }, V.key, u8.slice(12)));
}
const vEncJson = async (o) => vEncrypt(vEnc.encode(JSON.stringify(o)));
const vDecJson = async (u8) => JSON.parse(vDec.decode(await vDecrypt(u8)));

/* ---------------- archivio locale (solo dati cifrati) */
const VDB = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      const r = indexedDB.open('documenti-vault', 1);
      r.onupgradeneeded = () => { for (const s of ['files', 'pending']) r.result.createObjectStore(s); };
      r.onsuccess = () => { this.db = r.result; res(this.db); }; r.onerror = () => rej(r.error);
    });
  },
  async tx(store, mode, fn) {
    const db = await this.open();
    return new Promise((res, rej) => { const t = db.transaction(store, mode); const q = fn(t.objectStore(store)); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); });
  },
  put(s, k, v) { return this.tx(s, 'readwrite', (st) => st.put(v, k)); },
  get(s, k) { return this.tx(s, 'readonly', (st) => st.get(k)); },
  del(s, k) { return this.tx(s, 'readwrite', (st) => st.delete(k)); },
  keys(s) { return this.tx(s, 'readonly', (st) => st.getAllKeys()); },
  clear(s) { return this.tx(s, 'readwrite', (st) => st.clear()); },
};

/* ---------------- GitHub (repo del vault) */
const vCfg = () => lsGet(V.LS.cfg, null);
async function vApi(path, opts = {}, token) {
  const c = vCfg();
  return fetch(`https://api.github.com/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/${path}`, Object.assign({}, opts, {
    cache: 'no-store',
    headers: Object.assign({ Authorization: 'Bearer ' + (token || V.token), Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, opts.headers || {}),
  }));
}
async function vGetRaw(path, token) {
  const r = await vApi('contents/' + path + '?ref=main', { headers: { Accept: 'application/vnd.github.raw' } }, token);
  if (r.status === 404) return null;
  if (r.status === 401 || r.status === 403) throw new Error('Token del vault non valido o senza accesso al repo (' + r.status + ')');
  if (!r.ok) throw new Error('Lettura dal vault fallita (' + r.status + ')');
  return new Uint8Array(await r.arrayBuffer());
}
async function vSha(path) {
  const r = await vApi('contents/' + path + '?ref=main');
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('Lettura dal vault fallita (' + r.status + ')');
  return (await r.json()).sha;
}
async function vPut(path, u8, sha, msg, token) {
  const body = { message: msg || 'vault', content: u8ToB64(u8), branch: 'main' };
  if (sha) body.sha = sha;
  return vApi('contents/' + path, { method: 'PUT', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }, token);
}

/* ---------------- stato */
const vConfigured = () => !!(vCfg() && lsGet(V.LS.meta, null) && lsGet(V.LS.tok, null));
const vUnlocked = () => !!V.key;
const vItems = () => Object.values((V.index && V.index.items) || {}).filter((x) => !x.deleted);
function vTouch() { V.lastActive = now(); }
function vLock(reason) {
  if (!V.key) return;
  V.key = null; V.token = null; V.index = null; vDraft = null;
  for (const u of vUrls.values()) URL.revokeObjectURL(u);
  vUrls.clear();
  const v = $('#viewer'); if (v && !v.hidden && v.dataset.vault) { v.hidden = true; v.replaceChildren(); delete v.dataset.vault; }
  if (parseRoute().name.startsWith('v')) { if (location.hash !== '#/vault') location.replace('#/vault'); else render(true); }
  if (reason) toast(reason);
}
setInterval(() => { if (V.key && now() - V.lastActive > 5 * 60 * 1000) vLock('Vault chiuso per inattività'); }, 15000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') V.hiddenAt = now();
  else if (V.key && V.hiddenAt && now() - V.hiddenAt > 60 * 1000) vLock('Vault chiuso: l\'app era in background');
});
['pointerdown', 'keydown'].forEach((ev) => document.addEventListener(ev, () => { if (V.key) vTouch(); }, { passive: true }));

async function vUnlock(pass) {
  const meta = lsGet(V.LS.meta, null);
  await vOpenWithKey(await vUnwrap(pass, meta));
}
async function vOpenWithKey(key) {
  V.key = key;
  try {
    const t = lsGet(V.LS.tok, null);
    V.token = vDec.decode(await vDecrypt(b64ToU8(t)));
    const cached = lsGet(V.LS.idx, null);
    V.index = cached ? await vDecJson(b64ToU8(cached)) : { items: {} };
  } catch (e) { V.key = null; throw new Error('Dati locali del vault danneggiati: scollega e ricollega il vault'); }
  vTouch();
  vSync();
}
async function vSaveIndexLocal() { lsSet(V.LS.idx, u8ToB64(await vEncJson(V.index))); }

/* crea un vault nuovo (repo vuoto) oppure collega quello esistente (nuovo telefono) */
async function vSetup({ owner, repo, token, pass, create }) {
  lsSet(V.LS.cfg, { owner, repo });
  const existing = await vGetRaw('vault.json', token);
  let meta;
  if (create) {
    if (existing) throw new Error('In questo repo c\'è già un vault: usa "Collega vault esistente"');
    const dek = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    meta = await vWrap(pass, dek);
    const r = await vPut('vault.json', vEnc.encode(JSON.stringify(meta, null, 1)), null, 'Vault creato', token);
    if (!r.ok) throw new Error(r.status === 403 || r.status === 401 ? 'Il token non può scrivere nel repo del vault' : 'Creazione fallita (' + r.status + ')');
  } else {
    if (!existing) throw new Error('Nessun vault trovato in questo repo: usa "Crea vault"');
    meta = JSON.parse(vDec.decode(existing));
  }
  V.key = await vUnwrap(pass, meta); // verifica la frase
  lsSet(V.LS.meta, meta);
  lsSet(V.LS.tok, u8ToB64(await vEncrypt(vEnc.encode(token))));
  V.token = token;
  V.index = { items: {} };
  if (create) await vPushIndex(); else await vPullIndex();
  await vSaveIndexLocal();
  vTouch();
}
/* ---------------- sblocco rapido con impronta (passkey + PRF) ----------------
 * La passkey (salvata nel Gestore password di Google) restituisce un segreto fisso di 32 byte solo dopo l'impronta.
 * Da quel segreto (HKDF) nasce una seconda chiave che avvolge la stessa DEK: la frase resta valida come riserva.
 * In vault.json si salvano id della passkey, sale PRF e DEK avvolta: nessuno di questi apre il vault senza la passkey. */
const vBioSupported = () => !!(window.PublicKeyCredential && navigator.credentials && window.isSecureContext);
const vBioList = () => ((lsGet(V.LS.meta, null) || {}).bio || []);
async function vBioKek(prfOut) {
  const base = await crypto.subtle.importKey('raw', prfOut, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: vEnc.encode('documenti-vault-impronta-v1') },
    base, { name: 'AES-GCM', length: 256 }, false, ['wrapKey', 'unwrapKey']);
}
async function vBioGet(entries) {
  const cred = await navigator.credentials.get({ publicKey: {
    challenge: rnd(32), rpId: location.hostname, userVerification: 'required', timeout: 60000,
    allowCredentials: entries.map((e) => ({ type: 'public-key', id: b64ToU8(e.credId) })),
    extensions: { prf: { evalByCredential: Object.fromEntries(entries.map((e) => [e.credIdUrl, { first: b64ToU8(e.prfSalt) }])) } },
  } });
  const res = cred.getClientExtensionResults().prf;
  const out = res && res.results && res.results.first;
  if (!out) throw new Error('Questo telefono non restituisce il segreto della passkey (PRF). Usa la frase; se la passkey è in Samsung Pass, rifalla nel Gestore password di Google.');
  const entry = entries.find((e) => e.credIdUrl === cred.id) || entries[0];
  return { entry, prf: new Uint8Array(out) };
}
const toUrl64 = (b64) => b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function vBioEnable(pass) {
  if (!vBioSupported()) throw new Error('Questo browser non supporta le passkey');
  const meta = lsGet(V.LS.meta, null);
  const kek = await vKek(pass, meta.salt, meta.iter);
  const w = b64ToU8(meta.wrapped);
  let dek;
  try { dek = await crypto.subtle.unwrapKey('raw', w.slice(12), kek, { name: 'AES-GCM', iv: w.slice(0, 12) }, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']); } catch (e) { throw new Error('Frase sbagliata'); }
  const prfSalt = rnd(32);
  const cred = await navigator.credentials.create({ publicKey: {
    challenge: rnd(32), rp: { name: 'Vault Documenti casa', id: location.hostname },
    user: { id: rnd(16), name: 'Vault Documenti casa', displayName: 'Vault Documenti casa' },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'required' },
    timeout: 60000, extensions: { prf: { eval: { first: prfSalt } } },
  } });
  const credId = u8ToB64(new Uint8Array(cred.rawId));
  const entry = { credId, credIdUrl: cred.id || toUrl64(credId), prfSalt: u8ToB64(prfSalt), label: navigator.userAgent.includes('Android') ? 'Android' : 'Dispositivo', createdAt: now() };
  let r = cred.getClientExtensionResults().prf;
  let prf = r && r.results && r.results.first ? new Uint8Array(r.results.first) : null;
  if (!prf) prf = (await vBioGet([entry])).prf; // alcuni gestori danno il segreto solo al primo uso: chiede l'impronta una seconda volta
  const kek2 = await vBioKek(prf);
  const iv = rnd(12);
  const ct = new Uint8Array(await crypto.subtle.wrapKey('raw', dek, kek2, { name: 'AES-GCM', iv }));
  const wrapped = new Uint8Array(12 + ct.length); wrapped.set(iv); wrapped.set(ct, 12);
  entry.wrapped = u8ToB64(wrapped);
  await vSaveMeta(Object.assign({}, meta, { bio: [...(meta.bio || []), entry] }));
}
async function vBioUnlock() {
  const entries = vBioList();
  if (!entries.length) throw new Error('Impronta non attivata');
  const { entry, prf } = await vBioGet(entries);
  const kek2 = await vBioKek(prf);
  const w = b64ToU8(entry.wrapped);
  let key;
  try { key = await crypto.subtle.unwrapKey('raw', w.slice(12), kek2, { name: 'AES-GCM', iv: w.slice(0, 12) }, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']); }
  catch (e) { throw new Error('Impronta non valida per questo vault: usa la frase'); }
  await vOpenWithKey(key);
}
async function vSaveMeta(meta) {
  const sha = await vSha('vault.json');
  const r = await vPut('vault.json', vEnc.encode(JSON.stringify(meta, null, 1)), sha, 'Vault: impostazioni di accesso');
  if (!r.ok) throw new Error('Salvataggio su GitHub fallito (' + r.status + ')');
  lsSet(V.LS.meta, meta);
}
async function vRefreshMeta() { // impronte aggiunte da un altro telefono
  const raw = await vGetRaw('vault.json'); if (!raw) return;
  const m = JSON.parse(vDec.decode(raw));
  if (m.wrapped && m.salt) lsSet(V.LS.meta, m);
}

function vForget() {
  for (const k of Object.values(V.LS)) localStorage.removeItem(k);
  VDB.clear('files').catch(() => {}); VDB.clear('pending').catch(() => {});
  V.key = null; V.token = null; V.index = null;
}

/* ---------------- sincronizzazione (indice + file cifrati) */
function vMerge(a, b) {
  const out = Object.assign({}, a);
  for (const [k, v] of Object.entries(b || {})) if (!out[k] || (v.updatedAt || 0) > (out[k].updatedAt || 0)) out[k] = v;
  return out;
}
async function vPullIndex() {
  const raw = await vGetRaw('index.enc');
  if (raw) { const remote = await vDecJson(raw); V.index.items = vMerge(V.index.items, remote.items || {}); }
}
const vSig = (items) => Object.entries(items || {}).map(([k, v]) => k + ':' + (v.updatedAt || 0)).sort().join('|');
async function vPushIndex() {
  for (let i = 0; i < 4; i++) {
    const sha = await vSha('index.enc');
    let remoteSig = null;
    if (sha) {
      const raw = await vGetRaw('index.enc');
      if (raw) { const rem = (await vDecJson(raw)).items || {}; remoteSig = vSig(rem); V.index.items = vMerge(V.index.items, rem); }
    }
    if (remoteSig !== null && remoteSig === vSig(V.index.items)) return; // niente di nuovo da scrivere
    const r = await vPut('index.enc', await vEncJson(V.index), sha, 'Indice aggiornato');
    if (r.ok) return;
    if (r.status !== 409 && r.status !== 422) throw new Error('Salvataggio indice fallito (' + r.status + ')');
  }
  throw new Error('Conflitto non risolto');
}
async function vSync() {
  if (!V.key || !navigator.onLine) { V.state = navigator.onLine ? 'idle' : 'offline'; return; }
  if (V.busy) { V.again = true; return; }
  V.busy = true; V.state = 'saving';
  try {
    for (const id of await VDB.keys('pending')) {
      const ct = await VDB.get('pending', id);
      const r = await vPut('f/' + id + '.enc', ct, null, 'File');
      if (r.ok || r.status === 422) { await VDB.put('files', id, ct); await VDB.del('pending', id); }
      else throw new Error('Caricamento file fallito (' + r.status + ')');
    }
    await vPushIndex();
    await vSaveIndexLocal();
    await vRefreshMeta().catch(() => {});
    V.state = 'ok'; V.error = '';
  } catch (e) { V.state = 'error'; V.error = e.message; }
  finally {
    V.busy = false;
    if (parseRoute().name.startsWith('v')) render();
    if (V.again) { V.again = false; setTimeout(vSync, 300); }
  }
}
async function vSaveItem(item) {
  item.updatedAt = now();
  V.index.items[item.id] = item;
  await vSaveIndexLocal();
  clearTimeout(V.timer); V.timer = setTimeout(vSync, 500);
}
async function vStoreFile(blob) {
  const id = Array.from(rnd(12), (b) => b.toString(16).padStart(2, '0')).join('');
  const ct = await vEncrypt(new Uint8Array(await blob.arrayBuffer()));
  await VDB.put('pending', id, ct);
  return { id, size: blob.size };
}
const vUrls = new Map();
async function vFileBlob(p) {
  let ct = await VDB.get('pending', p.id).catch(() => null) || await VDB.get('files', p.id).catch(() => null);
  if (!ct) {
    if (!navigator.onLine) throw new Error('Sei offline e questo file non è ancora sul telefono');
    ct = await vGetRaw('f/' + p.id + '.enc');
    if (!ct) throw new Error('File non trovato nel vault');
    VDB.put('files', p.id, ct).catch(() => {});
  }
  return new Blob([await vDecrypt(ct)], { type: p.type === 'pdf' ? 'application/pdf' : 'image/jpeg' });
}
async function vFileUrl(p) {
  if (vUrls.has(p.id)) return vUrls.get(p.id);
  const u = URL.createObjectURL(await vFileBlob(p)); vUrls.set(p.id, u); return u;
}

/* ---------------- interfaccia */
const VKINDS = [['cedolino', 'Cedolini'], ['cud', 'CUD / CU'], ['altro', 'Altro']];
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const vTitle = (x) => x.title || (x.kind === 'cedolino' ? `Cedolino ${x.month ? MESI[x.month - 1] + ' ' : ''}${x.year || ''}` : x.kind === 'cud' ? `CU ${x.year || ''}` : 'Documento');
let vSeg = 'cedolino';
const vBack = (t) => topBar(t, { back: 'vault', small: true, noSync: true });
function vStatusPill() {
  const t = { ok: 'Cifrato e salvato', saving: 'Salvo…', error: 'Errore', offline: 'Offline, in attesa', idle: 'Aperto' }[V.state] || 'Aperto';
  return h('button', { class: 'sync-pill ' + (V.state === 'ok' ? 'idle' : V.state), title: V.error || '', onclick: () => vLock('Vault chiuso') }, icon('lock'), t);
}

function viewVault() {
  if (!vConfigured()) return viewVaultSetup();
  if (!vUnlocked()) return viewVaultLock();
  const all = vItems();
  const arr = all.filter((x) => x.kind === vSeg).sort((a, b) => ((b.year || 0) - (a.year || 0)) || ((b.month || 0) - (a.month || 0)) || (b.createdAt - a.createdAt));
  const years = [...new Set(arr.map((x) => x.year || '—'))];
  const body = [
    V.state === 'error' ? h('div', { class: 'banner' }, 'Problema di sincronizzazione: ', V.error) : null,
    segmented(VKINDS.map(([k, l]) => [k, l, all.filter((x) => x.kind === k).length]), vSeg, (k) => { vSeg = k; render(true); }),
    ...years.map((y) => [h('div', { class: 'group-title' }, String(y)),
      h('div', { class: 'list' }, arr.filter((x) => (x.year || '—') === y).map((x) => h('button', { class: 'card-link', onclick: () => go('vdoc/' + x.id) },
        h('span', { class: 'ic' }, icon(x.kind === 'cud' ? 'file' : 'euro')),
        h('span', { class: 't' }, h('b', null, vTitle(x)), h('span', null, `${(x.pages || []).length} file${x.notes ? ' · ' + x.notes.slice(0, 40) : ''}`)),
        h('span', { class: 'chev' }, icon('chev')))))]),
    arr.length ? null : h('div', { class: 'empty' }, 'Nessun documento qui. Aggiungilo con il +.'),
    h('div', { class: 'inline', style: 'margin-top:22px' },
      h('button', { class: 'btn', onclick: () => vLock('Vault chiuso') }, icon('lock'), 'Chiudi vault'),
      h('button', { class: 'btn', onclick: () => go('vimpostazioni') }, icon('gear'), 'Impostazioni vault')),
  ];
  return { top: [...topBar('Vault', { back: 'altro', noSync: true }), vStatusPill()], body, fab: fab('Nuovo documento nel vault', () => go('vnuovo')) };
}

function passField(id, label, autocomplete, extra) {
  return h('div', { class: 'field' }, h('label', { for: id }, label),
    h('input', Object.assign({ class: 'input', id, type: 'password', autocomplete, autocapitalize: 'off', spellcheck: 'false', name: id }, extra || {})));
}
function viewVaultLock() {
  const bio = vBioSupported() && vBioList().length > 0;
  const go2 = async (btn) => {
    const pass = $('#v-pass').value;
    if (!pass) return;
    btn.disabled = true; btn.textContent = 'Apro…';
    try { await vUnlock(pass); render(true); } catch (e) { btn.disabled = false; btn.textContent = 'Apri'; toast(e.message); $('#v-pass').select(); }
  };
  return {
    top: topBar('Vault', { back: 'altro', noSync: true }),
    body: [h('form', { class: 'detail', onsubmit: (e) => { e.preventDefault(); go2(e.target.querySelector('button')); } },
      h('div', { class: 'panel vault-lock' },
        h('div', { class: 'vault-badge' }, icon('lock', 1.8)),
        h('h2', null, 'Vault chiuso'),
        h('p', { class: 'help' }, 'CUD, cedolini e documenti personali, cifrati. Inserisci la frase segreta (la trovi nel password manager).'),
        h('input', { type: 'text', name: 'username', autocomplete: 'username', value: 'Vault Documenti casa', readonly: true, class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true' }),
        bio ? h('button', { class: 'btn primary block', type: 'button', style: 'margin:6px 0 16px', onclick: async (e) => {
          const b = e.currentTarget; b.disabled = true;
          try { await vBioUnlock(); render(true); } catch (err) { b.disabled = false; if (err.name !== 'NotAllowedError') toast(err.message); }
        } }, icon('finger'), 'Sblocca con impronta') : null,
        bio ? h('p', { class: 'small muted', style: 'margin:0 0 6px' }, 'oppure con la frase') : null,
        passField('v-pass', 'Frase segreta', 'current-password', bio ? {} : { autofocus: true }),
        h('button', { class: 'btn block' + (bio ? '' : ' primary'), type: 'submit', style: 'margin-top:14px' }, icon('key'), 'Apri con la frase')))],
  };
}

function viewVaultSetup() {
  let mode = viewVaultSetup.mode || 'create';
  const c = vCfg() || { owner: 'Cartesio89', repo: 'documenti-vault' };
  const run = async (btn) => {
    const owner = $('#v-owner').value.trim(), repo = $('#v-repo').value.trim(), token = $('#v-token').value.trim(), pass = $('#v-pass').value;
    if (!owner || !repo || !token || !pass) { toast('Compila tutti i campi'); return; }
    if (mode === 'create') {
      if (pass !== $('#v-pass2').value) { toast('Le due frasi non coincidono'); return; }
      const words = pass.trim().split(/[\s\-_.,]+/).filter((w) => w.length >= 3);
      if (pass.length < 20 || words.length < 4) { toast('Frase troppo debole: almeno 4 parole e 20 caratteri'); return; }
    }
    btn.disabled = true; btn.textContent = mode === 'create' ? 'Creo il vault…' : 'Collego…';
    try {
      await vSetup({ owner, repo, token, pass, create: mode === 'create' });
      toast(mode === 'create' ? 'Vault creato. Salva la frase nel password manager!' : 'Vault collegato');
      render(true);
    } catch (e) { btn.disabled = false; btn.textContent = mode === 'create' ? 'Crea vault' : 'Collega'; alert(e.message); }
  };
  const field = (id, label, value, attrs) => h('div', { class: 'field' }, h('label', { for: id }, label), h('input', Object.assign({ class: 'input', id, value, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' }, attrs || {})));
  return {
    top: topBar('Vault', { back: 'altro', noSync: true }),
    body: [h('form', { class: 'detail', onsubmit: (e) => { e.preventDefault(); run(e.target.querySelector('button[type=submit]')); } },
      segmented([['create', 'Crea vault'], ['link', 'Collega vault esistente']], mode, (k) => { viewVaultSetup.mode = k; render(true); }),
      h('div', { class: 'panel help' },
        mode === 'create'
          ? h('div', null,
            h('p', { style: 'margin-top:0' }, h('b', null, 'Prima di iniziare: '), 'crea su GitHub un repo ', h('b', null, 'privato'), ' chiamato ', h('code', null, 'documenti-vault'), ' (con README) e un token fine-grained ', h('b', null, 'solo per quel repo'), ', Contents: Read and write.'),
            h('p', { style: 'margin:0' }, 'La frase segreta: almeno 4 parole a caso (es. "tavolo nuvola pinza orzo faro"). Salvala subito nel password manager: ', h('b', null, 'se la perdi, i documenti non si possono più aprire'), ', da nessuno.'))
          : h('p', { style: 'margin:0' }, 'Per un telefono nuovo o un altro dispositivo: inserisci il token del vault e la frase segreta, entrambi nel tuo password manager.')),
      h('div', { class: 'panel' },
        field('v-owner', 'Utente GitHub', c.owner),
        field('v-repo', 'Repo del vault (privato)', c.repo),
        field('v-token', 'Token del vault', '', { type: 'password', placeholder: 'github_pat_…' }),
        h('input', { type: 'text', name: 'username', autocomplete: 'username', value: 'Vault Documenti casa', readonly: true, class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true' }),
        passField('v-pass', 'Frase segreta', mode === 'create' ? 'new-password' : 'current-password'),
        mode === 'create' ? passField('v-pass2', 'Ripeti la frase', 'new-password') : null,
        h('button', { class: 'btn primary block', type: 'submit', style: 'margin-top:14px' }, icon('lock'), mode === 'create' ? 'Crea vault' : 'Collega')))],
  };
}

let vDraft = null;
function viewVaultNew() {
  if (!vUnlocked()) return viewVaultLock();
  if (!vDraft) { const d = new Date(); vDraft = { kind: vSeg, year: d.getFullYear(), month: d.getMonth() + 1, title: '', notes: '', pages: [] }; }
  const D = vDraft;
  const redraw = () => { const y = window.scrollY; render(true); window.scrollTo(0, y); };
  const add = async (fl) => { const ps = await filesToPages(fl); ps.forEach((p) => { p.url = URL.createObjectURL(p.blob); }); D.pages.push(...ps); redraw(); };
  const save = async (btn) => {
    if (!D.pages.length && !confirm('Nessun file allegato. Salvo lo stesso?')) return;
    btn.disabled = true; btn.textContent = 'Cifro e salvo…';
    try {
      const pages = [];
      for (const p of D.pages) { const s = await vStoreFile(p.blob); pages.push({ id: s.id, type: p.type, name: p.name || '', size: s.size }); URL.revokeObjectURL(p.url); }
      const item = { id: uid('v'), kind: D.kind, year: Number(D.year) || null, month: D.kind === 'cedolino' ? Number(D.month) || null : null,
        title: D.title.trim(), notes: D.notes.trim(), pages, createdAt: now() };
      await vSaveItem(item);
      vSeg = item.kind; vDraft = null;
      location.replace('#/vault');
      toast(navigator.onLine ? 'Salvato (cifrato)' : 'Salvato cifrato sul telefono: si carica appena torni online');
    } catch (e) { btn.disabled = false; btn.textContent = 'Salva'; alert('Salvataggio non riuscito: ' + e.message); }
  };
  const yNow = new Date().getFullYear();
  return {
    top: vBack('Nuovo nel vault'),
    body: [h('div', { class: 'detail' },
      segmented(VKINDS, D.kind, (k) => { D.kind = k; redraw(); }),
      h('div', { class: 'panel props' },
        h('div', { class: 'inline' },
          h('div', { class: 'field', style: 'flex:1' }, h('label', null, 'Anno'),
            h('select', { class: 'input', onchange: (e) => { D.year = e.target.value; } }, Array.from({ length: 25 }, (_, i) => yNow + 1 - i).map((y) => h('option', { value: y, selected: Number(D.year) === y }, y)))),
          D.kind === 'cedolino' ? h('div', { class: 'field', style: 'flex:1' }, h('label', null, 'Mese'),
            h('select', { class: 'input', onchange: (e) => { D.month = e.target.value; } }, MESI.map((m, i) => h('option', { value: i + 1, selected: Number(D.month) === i + 1 }, m)), h('option', { value: 13, selected: Number(D.month) === 13 }, '13ª / 14ª'))) : null),
        h('div', { class: 'field' }, h('label', null, 'Titolo (facoltativo)'),
          h('input', { class: 'input', value: D.title, placeholder: vTitle(Object.assign({}, D, { title: '' })), oninput: (e) => { D.title = e.target.value; } })),
        h('div', { class: 'field' }, h('label', null, 'Note'),
          h('textarea', { class: 'input', value: D.notes, placeholder: 'Datore di lavoro, note…', oninput: (e) => { D.notes = e.target.value; } }))),
      h('div', { class: 'panel' }, h('h2', null, 'File', h('span', { class: 'prog' }, D.pages.length || '')),
        D.pages.length ? h('div', { class: 'pages' }, D.pages.map((p, i) => h('div', { class: 'page' },
          p.type === 'pdf' ? h('div', { class: 'pdf-thumb' }, icon('file'), h('span', null, p.name || 'PDF')) : h('img', { src: p.url, alt: '' }),
          h('span', { class: 'page-n' }, i + 1),
          h('div', { class: 'page-act' }, h('button', { 'aria-label': 'Rimuovi', onclick: () => { URL.revokeObjectURL(p.url); D.pages.splice(i, 1); redraw(); } }, icon('close')))))) : null,
        h('div', { class: 'inline' },
          h('button', { class: 'btn', onclick: () => pickFiles(true, false, add) }, icon('camera'), D.pages.length ? 'Aggiungi pagina' : 'Scatta foto'),
          h('button', { class: 'btn', onclick: () => pickFiles(false, true, add) }, icon('upload'), 'Carica file'))),
      h('button', { class: 'btn primary block', onclick: (e) => save(e.currentTarget) }, icon('lock'), 'Salva cifrato'))],
  };
}

function vOpenFile(x, i) {
  const v = $('#viewer'); const pages = x.pages || [];
  v.dataset.vault = '1';
  const close = () => { v.hidden = true; v.replaceChildren(); delete v.dataset.vault; };
  const show = async () => {
    const p = pages[i];
    v.replaceChildren(...[h('div', { class: 'viewer-bar' }, h('span', null, `${i + 1} / ${pages.length}`), h('button', { class: 'icon-btn plain', 'aria-label': 'Chiudi', onclick: close }, icon('close'))),
      h('div', { class: 'viewer-body' }, h('p', { class: 'muted' }, 'Decifro…')),
      pages.length > 1 ? h('div', { class: 'viewer-nav' },
        h('button', { class: 'icon-btn', disabled: i === 0, onclick: () => { i--; show(); } }, icon('left')),
        h('button', { class: 'icon-btn', disabled: i === pages.length - 1, onclick: () => { i++; show(); } }, icon('right'))) : null].filter(Boolean));
    try {
      const u = await vFileUrl(p);
      $('.viewer-body', v).replaceChildren(p.type === 'pdf'
        ? h('div', { class: 'viewer-pdf' }, icon('file'), h('p', null, p.name || 'PDF'), h('a', { class: 'btn primary', href: u, target: '_blank', rel: 'noopener' }, icon('ext'), 'Apri PDF'))
        : h('img', { src: u, alt: '' }));
    } catch (e) { $('.viewer-body', v).replaceChildren(h('p', null, e.message)); }
  };
  v.hidden = false; show();
}
function viewVaultDoc(route) {
  if (!vUnlocked()) return viewVaultLock();
  const x = V.index.items[route.arg];
  if (!x || x.deleted) return { top: vBack('Non trovato'), body: [h('div', { class: 'empty' }, 'Documento non trovato.')] };
  const thumbs = h('div', { class: 'pages' }, (x.pages || []).map((p, i) => {
    const cell = h('button', { class: 'page', onclick: () => vOpenFile(x, i) }, p.type === 'pdf' ? h('div', { class: 'pdf-thumb' }, icon('file'), h('span', null, p.name || 'PDF')) : h('div', { class: 'thumb-loading' }), h('span', { class: 'page-n' }, i + 1));
    if (p.type !== 'pdf') vFileUrl(p).then((u) => { const l = $('.thumb-loading', cell); if (l) l.replaceWith(h('img', { src: u, alt: '' })); }).catch(() => { const l = $('.thumb-loading', cell); if (l) l.textContent = '!'; });
    return cell;
  }));
  const addMore = async (fl) => {
    const ps = await filesToPages(fl);
    for (const p of ps) { const s = await vStoreFile(p.blob); x.pages = [...(x.pages || []), { id: s.id, type: p.type, name: p.name || '', size: s.size }]; }
    await vSaveItem(x); render(true);
  };
  return {
    top: vBack(VKINDS.find(([k]) => k === x.kind)[1]),
    body: [h('div', { class: 'detail' },
      h('input', { class: 'title-input', value: vTitle(x), onchange: async (e) => { x.title = e.target.value.trim(); await vSaveItem(x); } }),
      h('div', { class: 'panel' }, h('h2', null, 'File', h('span', { class: 'prog' }, (x.pages || []).length)), thumbs,
        h('div', { class: 'inline', style: 'margin-top:10px' },
          h('button', { class: 'btn', onclick: () => pickFiles(true, false, addMore) }, icon('camera'), 'Aggiungi pagina'),
          h('button', { class: 'btn', onclick: () => pickFiles(false, true, addMore) }, icon('upload'), 'Aggiungi file'))),
      h('div', { class: 'panel' }, h('div', { class: 'field' }, h('label', null, 'Note'),
        h('textarea', { class: 'input', value: x.notes || '', onchange: async (e) => { x.notes = e.target.value; await vSaveItem(x); } }))),
      h('button', { class: 'btn danger', onclick: async () => {
        if (!confirm('Spostare nel cestino del vault?')) return;
        x.deleted = true; await vSaveItem(x); goBack('vault'); toast('Spostato nel cestino del vault');
      } }, icon('trash'), 'Elimina'))],
  };
}

function viewVaultSettings() {
  if (!vUnlocked()) return viewVaultLock();
  const trash = Object.values(V.index.items).filter((x) => x.deleted);
  const exportZip = async (btn) => {
    if (!confirm('Lo ZIP contiene i documenti IN CHIARO. Salvalo solo in un posto sicuro e cancellalo quando non serve più. Continuo?')) return;
    btn.disabled = true;
    try {
      if (!window.JSZip) await loadScript('vendor/jszip.min.js');
      const zip = new window.JSZip(); let n = 0;
      for (const x of vItems()) for (const [i, p] of (x.pages || []).entries()) {
        btn.textContent = `Decifro ${++n}…`;
        const kind = VKINDS.find(([k]) => k === x.kind)[1];
        zip.file(`${safeName(kind)}/${x.year || 'senza anno'}/${safeName(vTitle(x))}${x.pages.length > 1 ? ' - p' + (i + 1) : ''}.${p.type === 'pdf' ? 'pdf' : 'jpg'}`, await vFileBlob(p));
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const a = h('a', { href: URL.createObjectURL(blob), download: `vault-${todayISO()}.zip` }); document.body.append(a); a.click(); a.remove();
    } catch (e) { alert('Export non riuscito: ' + e.message); }
    btn.disabled = false; btn.textContent = 'Scarica tutto in chiaro (ZIP)';
  };
  const changePass = async (btn) => {
    const old = $('#v-old').value, p1 = $('#v-new').value, p2 = $('#v-new2').value;
    if (p1 !== p2) { toast('Le due frasi nuove non coincidono'); return; }
    if (p1.length < 20 || p1.trim().split(/[\s\-_.,]+/).filter((w) => w.length >= 3).length < 4) { toast('Frase troppo debole: almeno 4 parole e 20 caratteri'); return; }
    btn.disabled = true;
    try {
      // serve la chiave estraibile: la si sblocca di nuovo con la frase attuale
      const meta = lsGet(V.LS.meta, null);
      const kek = await vKek(old, meta.salt, meta.iter);
      const w = b64ToU8(meta.wrapped);
      let dek;
      try { dek = await crypto.subtle.unwrapKey('raw', w.slice(12), kek, { name: 'AES-GCM', iv: w.slice(0, 12) }, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']); } catch (e) { throw new Error('Frase attuale sbagliata'); }
      const nm = Object.assign(await vWrap(p1, dek), meta.bio ? { bio: meta.bio } : {});
      const sha = await vSha('vault.json');
      const r = await vPut('vault.json', vEnc.encode(JSON.stringify(nm, null, 1)), sha, 'Frase cambiata');
      if (!r.ok) throw new Error('Salvataggio fallito (' + r.status + ')');
      lsSet(V.LS.meta, nm);
      toast('Frase cambiata. Aggiorna il password manager e gli altri dispositivi.');
      render(true);
    } catch (e) { alert(e.message); btn.disabled = false; }
  };
  return {
    top: vBack('Impostazioni vault'),
    body: [h('div', { class: 'detail' },
      h('div', { class: 'panel' }, h('h2', null, 'Come funziona'),
        h('p', { class: 'help', style: 'margin:0' }, 'Ogni file, i titoli e le note vengono cifrati su questo telefono (AES-256) prima di andare su GitHub, nel repo ', h('code', null, (vCfg() || {}).repo), '. Lì restano solo dati illeggibili. La chiave nasce dalla tua frase e resta solo in memoria: il vault si chiude dopo 5 minuti di inattività o 1 minuto in background.')),
      h('div', { class: 'panel' }, h('h2', null, 'Nuovo telefono'),
        h('p', { class: 'help', style: 'margin:0' }, 'Apri Documenti casa → Altro → Vault → "Collega vault esistente" e inserisci il ', h('b', null, 'token del vault'), ' e la ', h('b', null, 'frase segreta'), '. Tutto il resto si scarica da GitHub. Tieni entrambi nel password manager.')),
      h('form', { class: 'panel', onsubmit: async (e) => {
        e.preventDefault(); const b = e.target.querySelector('button[type=submit]'); b.disabled = true;
        try { await vBioEnable($('#v-bio-pass').value); toast('Impronta attivata'); render(true); }
        catch (err) { b.disabled = false; alert(err.name === 'NotAllowedError' ? 'Operazione annullata.' : err.message); }
      } },
        h('h2', null, icon('finger'), 'Sblocco con impronta'),
        !vBioSupported() ? h('p', { class: 'help', style: 'margin:0' }, 'Questo browser non supporta le passkey.')
          : [h('p', { class: 'help', style: 'margin-top:0' }, vBioList().length ? `Attiva su ${vBioList().length} passkey. La frase resta valida come riserva.` : 'Per l\'uso di tutti i giorni: apri il vault con l\'impronta invece della frase. La frase resta la chiave di riserva: tienila nel password manager.'),
            vBioList().length ? null : h('p', { class: 'help' }, 'Quando il telefono chiede dove salvare la passkey, scegli ', h('b', null, 'Google (Gestore password)'), ', non Samsung Pass.'),
            h('input', { type: 'text', name: 'username', autocomplete: 'username', value: 'Vault Documenti casa', readonly: true, class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true' }),
            passField('v-bio-pass', 'Frase segreta (per confermare)', 'current-password'),
            h('div', { class: 'inline', style: 'margin-top:10px' },
              h('button', { class: 'btn primary', type: 'submit' }, icon('finger'), vBioList().length ? 'Aggiungi un\'altra passkey' : 'Attiva impronta'),
              vBioList().length ? h('button', { class: 'btn danger', type: 'button', onclick: async () => {
                if (!confirm('Disattivare lo sblocco con impronta? Resterà solo la frase.')) return;
                try { const m = lsGet(V.LS.meta, null); delete m.bio; await vSaveMeta(m); toast('Impronta disattivata'); render(true); } catch (err) { alert(err.message); }
              } }, 'Disattiva') : null)]),
      h('div', { class: 'panel' }, h('h2', null, 'Copia di sicurezza'),
        h('button', { class: 'btn', onclick: (e) => exportZip(e.currentTarget) }, icon('download'), 'Scarica tutto in chiaro (ZIP)')),
      h('form', { class: 'panel', onsubmit: (e) => { e.preventDefault(); changePass(e.target.querySelector('button')); } }, h('h2', null, 'Cambia frase segreta'),
        h('input', { type: 'text', name: 'username', autocomplete: 'username', value: 'Vault Documenti casa', readonly: true, class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true' }),
        passField('v-old', 'Frase attuale', 'current-password'), passField('v-new', 'Nuova frase', 'new-password'), passField('v-new2', 'Ripeti nuova frase', 'new-password'),
        h('button', { class: 'btn', type: 'submit', style: 'margin-top:10px' }, 'Cambia frase')),
      trash.length ? h('div', { class: 'panel' }, h('h2', null, `Cestino del vault (${trash.length})`),
        h('div', { class: 'list' }, trash.map((x) => h('div', { class: 'proj-row' }, h('span', { style: 'flex:1' }, vTitle(x)),
          h('button', { class: 'btn', onclick: async () => { x.deleted = false; await vSaveItem(x); render(true); toast('Ripristinato'); } }, 'Ripristina'))))) : null,
      h('div', { class: 'panel' }, h('h2', null, 'Questo dispositivo'),
        h('button', { class: 'btn danger', onclick: () => {
          if (!confirm('Scollegare il vault da questo dispositivo? I documenti restano su GitHub; per riaprirli qui serviranno di nuovo token e frase.')) return;
          vForget(); location.replace('#/altro');
        } }, 'Scollega da questo dispositivo')))],
  };
}
