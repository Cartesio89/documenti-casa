/* Documenti casa — lettore mail (Google Apps Script)
 *
 * Gira dentro la casella Gmail che riceve le bollette. Ogni 15 minuti:
 *  1. legge da data.json (repo privato) l'elenco dei mittenti impostati nell'app;
 *  2. cerca le mail nuove di quei mittenti;
 *  3. per ognuna salva oggetto, data, link alla bolletta, importo/scadenza se scritti nella mail
 *     e gli allegati PDF/immagine, scrivendo tutto in inbox.json (l'app lo legge e crea i documenti);
 *  4. se c'è una scadenza e nell'app è attivo "Crea l'evento in automatico", crea l'evento in calendario
 *     alle 9:00 del giorno di scadenza, con una notifica (non sveglia) e invita gli indirizzi dell'app.
 *
 * Installazione: vedi l'app, Altro → Mail automatica. Proprietà script richieste:
 *   GH_TOKEN (token fine-grained, solo repo dati, Contents read/write), GH_OWNER, GH_REPO.
 * Non legge nulla oltre alle mail dei mittenti elencati. Non conosce il codice fiscale.
 */

var LABEL = 'documenti-casa';
var MAX_ENTRIES_DAYS = 180;
var RELEVANT = /bollett|fattur|pagament|importo|scaden|addebit|\brata\b|verbale|sollecito|avviso di pagamento|estratto conto/i;

function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'run') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('run').timeBased().everyMinutes(15).create();
  run();
  Logger.log('Pronto: controllo ogni 15 minuti.');
}

function prop(k) {
  var v = PropertiesService.getScriptProperties().getProperty(k);
  if (!v) throw new Error('Manca la proprietà script ' + k);
  return v.trim();
}
function gh(path, opts) {
  opts = opts || {};
  var url = 'https://api.github.com/repos/' + encodeURIComponent(prop('GH_OWNER')) + '/' + encodeURIComponent(prop('GH_REPO')) + '/' + path;
  var params = {
    method: opts.method || 'get', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + prop('GH_TOKEN'), Accept: opts.accept || 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
  };
  if (opts.body) { params.payload = JSON.stringify(opts.body); params.contentType = 'application/json'; }
  return UrlFetchApp.fetch(url, params);
}
function readRawJson(path) {
  var r = gh('contents/' + path, { accept: 'application/vnd.github.raw' });
  if (r.getResponseCode() === 404) return null;
  if (r.getResponseCode() !== 200) throw new Error('Lettura ' + path + ' fallita: ' + r.getResponseCode());
  return JSON.parse(r.getContentText('UTF-8'));
}
function readJsonWithSha(path) {
  var r = gh('contents/' + path);
  if (r.getResponseCode() === 404) return { data: null, sha: null };
  if (r.getResponseCode() !== 200) throw new Error('Lettura ' + path + ' fallita: ' + r.getResponseCode());
  var j = JSON.parse(r.getContentText());
  var text = j.content ? Utilities.newBlob(Utilities.base64Decode(j.content.replace(/\s/g, ''))).getDataAsString('UTF-8') : readRawText(path);
  return { data: JSON.parse(text), sha: j.sha };
}
function readRawText(path) { return gh('contents/' + path, { accept: 'application/vnd.github.raw' }).getContentText('UTF-8'); }
function putFile(path, base64, sha, message) {
  var body = { message: message, content: base64, branch: 'main' };
  if (sha) body.sha = sha;
  return gh('contents/' + path.split('/').map(encodeURIComponent).join('/'), { method: 'put', body: body });
}
function writeJson(path, data, sha, message) {
  var b64 = Utilities.base64Encode(JSON.stringify(data), Utilities.Charset.UTF_8);
  var r = putFile(path, b64, sha, message);
  return r.getResponseCode() === 200 || r.getResponseCode() === 201;
}

function senderFor(from, subject, senders) {
  var hay = (from + ' ' + subject).toLowerCase();
  for (var i = 0; i < senders.length; i++) if (hay.indexOf(senders[i].match.toLowerCase()) >= 0) return senders[i];
  return null;
}
function extractLinks(html) {
  var out = [], seen = {}, m;
  var re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  while ((m = re.exec(html))) {
    var href = m[1].replace(/&amp;/g, '&');
    var text = m[2].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    if (!/^https?:/i.test(href) || seen[href]) continue;
    if (/unsubscribe|disiscri|privacy|cookie|facebook|instagram|twitter|linkedin|youtube|whatsapp|app ?store|google ?play/i.test(text + ' ' + href)) continue;
    if (/bollett|fattur|naviga|visualizza|scarica|documento|verbale|pagamento|paga ora|dettagli/i.test(text)) {
      seen[href] = true;
      out.push({ url: href, text: text.slice(0, 60) });
    }
  }
  return out.slice(0, 4);
}

function run() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  var inbox = { data: null, sha: null };
  try {
    var data = readRawJson('data.json');
    var meta = (data && data.meta) || {};
    var senders = (meta.mailSenders || []).filter(function (s) { return s && s.match && s.enabled !== false; });
    inbox = readJsonWithSha('inbox.json');
    var box = inbox.data || { entries: [] };
    var known = {};
    box.entries.forEach(function (e) { known[e.id] = true; });
    var label = GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
    var added = 0;
    if (senders.length) {
      var q = '(' + senders.map(function (s) { var m = s.match.replace(/["()]/g, ''); return 'from:' + m + ' OR subject:' + m; }).join(' OR ') + ') -label:' + LABEL + ' newer_than:60d';
      var threads = GmailApp.search(q, 0, 25);
      threads.forEach(function (thread) {
        thread.getMessages().forEach(function (msg) {
          var id = msg.getId();
          if (known[id]) return;
          var from = msg.getFrom(), subject = msg.getSubject() || '';
          var sender = senderFor(from, subject, senders);
          if (!sender) return;
          var body = msg.getPlainBody() || '';
          if (!RELEVANT.test(subject + ' ' + body.slice(0, 3000))) return; // newsletter, offerte: ignorate
          var parsed = DocParse.parseDocText(subject + '\n' + body);
          var subjectDates = DocParse.findDates(subject);
          var entry = {
            id: id, senderId: sender.id, from: from, subject: subject,
            receivedAt: msg.getDate().toISOString(),
            snippet: body.replace(/\s+/g, ' ').trim().slice(0, 400),
            amount: parsed.amountSure ? parsed.amount : null,
            dueDate: parsed.dueDate || null,
            docDate: subjectDates[0] || parsed.docDate || null,
            links: extractLinks(msg.getBody() || ''),
            attachments: [],
          };
          var year = (entry.docDate || entry.receivedAt).slice(0, 4);
          msg.getAttachments({ includeInlineImages: false }).forEach(function (att, k) {
            var type = att.getContentType() || '';
            if (!/pdf|image\//i.test(type) || att.getSize() > 15 * 1024 * 1024) return;
            var ext = /pdf/i.test(type) ? 'pdf' : 'jpg';
            var path = 'files/' + year + '/' + (sender.category || 'altro') + '/mail-' + id + '-' + (k + 1) + '.' + ext;
            var r = putFile(path, Utilities.base64Encode(att.getBytes()), null, 'Allegato mail ' + subject.slice(0, 50));
            if (r.getResponseCode() === 201 || r.getResponseCode() === 422) entry.attachments.push({ path: path, name: att.getName() });
          });
          if (meta.calendarAuto && entry.dueDate) {
            try { entry.calendarEventId = createEvent(entry, sender, meta); } catch (err) { entry.calendarError = String(err).slice(0, 200); }
          }
          box.entries.push(entry); known[id] = true; added++;
        });
        thread.addLabel(label);
      });
    }
    var cutoff = new Date(Date.now() - MAX_ENTRIES_DAYS * 86400000).toISOString();
    box.entries = box.entries.filter(function (e) { return e.receivedAt >= cutoff; });
    var lastRun = box.lastRun ? new Date(box.lastRun).getTime() : 0;
    var stale = Date.now() - lastRun > 12 * 3600000;
    if (added || stale || box.lastError) {
      box.lastRun = new Date().toISOString();
      box.lastError = null;
      if (!writeJson('inbox.json', box, inbox.sha, added ? 'Mail: ' + added + ' nuove' : 'Mail: controllo')) {
        // conflitto raro (due esecuzioni): ricarica e riprova una volta
        var again = readJsonWithSha('inbox.json');
        var merged = again.data || { entries: [] }, ids = {};
        merged.entries.forEach(function (e) { ids[e.id] = true; });
        box.entries.forEach(function (e) { if (!ids[e.id]) merged.entries.push(e); });
        merged.lastRun = box.lastRun; merged.lastError = null;
        writeJson('inbox.json', merged, again.sha, 'Mail: ' + added + ' nuove');
      }
    }
  } catch (err) {
    Logger.log(err);
    try {
      var cur = readJsonWithSha('inbox.json');
      var b = cur.data || { entries: [] };
      b.lastError = String(err.message || err).slice(0, 300); b.lastRun = new Date().toISOString();
      writeJson('inbox.json', b, cur.sha, 'Mail: errore');
    } catch (e2) { Logger.log(e2); }
  } finally {
    lock.releaseLock();
  }
}

function createEvent(entry, sender, meta) {
  var tz = 'Europe/Rome';
  var start = Utilities.parseDate(entry.dueDate + ' 09:00', tz, 'yyyy-MM-dd HH:mm');
  var end = Utilities.parseDate(entry.dueDate + ' 09:30', tz, 'yyyy-MM-dd HH:mm');
  var guests = (meta.calendarEmails || []).filter(function (e) { return e && e.indexOf('@') > 0; });
  var verb = sender.status === 'addebitata' ? 'Addebito' : 'Pagare';
  var desc = [entry.subject, entry.amount != null ? 'Importo: € ' + entry.amount.toFixed(2).replace('.', ',') : '', (entry.links[0] || {}).url || ''].filter(String).join('\n');
  var ev = CalendarApp.getDefaultCalendar().createEvent(verb + ': ' + (sender.label || 'bolletta'), start, end, { description: desc, guests: guests.join(','), sendInvites: true });
  ev.removeAllReminders();
  ev.addPopupReminder(5); // notifica (non sveglia) alle 8:55 dello stesso giorno
  return ev.getId();
}

/* Prova manuale: esegui testUltimaMail per vedere nel log cosa verrebbe letto, senza scrivere nulla. */
function testUltimaMail() {
  var data = readRawJson('data.json');
  var senders = ((data && data.meta && data.meta.mailSenders) || []).filter(function (s) { return s.match; });
  var q = '(' + senders.map(function (s) { return 'from:' + s.match + ' OR subject:' + s.match; }).join(' OR ') + ')';
  var t = GmailApp.search(q, 0, 1)[0];
  if (!t) { Logger.log('Nessuna mail trovata per: ' + q); return; }
  var msg = t.getMessages().pop();
  Logger.log('Oggetto: ' + msg.getSubject());
  Logger.log('Letto: ' + JSON.stringify(DocParse.parseDocText(msg.getSubject() + '\n' + msg.getPlainBody())));
  Logger.log('Link: ' + JSON.stringify(extractLinks(msg.getBody())));
}


/* ---- copia di parse.js dell'app (non modificare qui: si rigenera) ---- */
/* Lettura di importo e date da un testo (OCR della foto o corpo della mail).
   Restituisce solo PROPOSTE: l'utente le conferma a mano. Usato dall'app e copiato nello script Apps Script. */
(function (root) {
  'use strict';
  var MONTHS = { gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6, luglio: 7, agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12,
    gen: 1, feb: 2, mar: 3, apr: 4, mag: 5, giu: 6, lug: 7, ago: 8, set: 9, sett: 9, ott: 10, nov: 11, dic: 12 };
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(y, m, d) {
    if (y < 100) y += 2000;
    if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
    var dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCMonth() !== m - 1) return null;
    return y + '-' + pad(m) + '-' + pad(d);
  }
  function findDates(line) {
    var out = [], m;
    var num = /(\d{1,2})\s*[\/.\-]\s*(\d{1,2})\s*[\/.\-]\s*(\d{4}|\d{2})(?!\d)/g;
    while ((m = num.exec(line))) { var a = iso(+m[3], +m[2], +m[1]); if (a) out.push({ iso: a, at: m.index }); }
    var txt = /(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre|gen|feb|mar|apr|mag|giu|lug|ago|sett|set|ott|nov|dic)\.?\s+(\d{4})/gi;
    while ((m = txt.exec(line))) { var b = iso(+m[3], MONTHS[m[2].toLowerCase()], +m[1]); if (b) out.push({ iso: b, at: m.index }); }
    out.sort(function (x, y) { return x.at - y.at; });
    return out.map(function (x) { return x.iso; });
  }
  function toNumber(s) {
    s = s.replace(/[\s.]/g, '').replace(',', '.');
    var n = parseFloat(s);
    return isFinite(n) ? Math.round(n * 100) / 100 : null;
  }
  function findAmounts(line) {
    var out = [], m;
    var re = /(€|eur(?:o)?\b)?\s*(\d{1,3}(?:[.\s]\d{3})*,\d{2}|\d+,\d{2})(?!\d)\s*(€|eur(?:o)?\b)?/gi;
    while ((m = re.exec(line))) {
      var v = toNumber(m[2]);
      if (v != null && v > 0 && v < 1000000) out.push({ value: v, euro: !!(m[1] || m[3]) });
    }
    return out;
  }
  var KW_AMOUNT = /totale|da pagare|importo|pagare|addebit|saldo|ammontare|somma/i;
  var KW_AMOUNT_BAD = /iva\b|imponibile|kwh|smc|consumo|aliquota|sconto|bonus|canone rai/i;
  var KW_DUE = /scaden|entro il|entro e non oltre|pagare entro|pagamento entro|data limite|addebito il|verr[aà] addebitat/i;
  var KW_DOCDATE = /emess|emissione|data fattura|data documento|data del verbale|data verbale|fattura n|del giorno|data:/i;

  function parseDocText(text, today) {
    var lines = String(text || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    var best = null;
    lines.forEach(function (line, i) {
      var amounts = findAmounts(line), score0 = 0, carried = false;
      if (KW_AMOUNT.test(line)) score0 += 3;
      if (!amounts.length && KW_AMOUNT.test(line) && lines[i + 1]) { amounts = findAmounts(lines[i + 1]); carried = true; }
      if (KW_AMOUNT_BAD.test(line)) score0 -= 3;
      amounts.forEach(function (a) {
        var s = score0 + (a.euro ? 1 : 0) - (carried ? 1 : 0);
        if (!best || s > best.score || (s === best.score && a.value > best.value)) best = { score: s, value: a.value };
      });
    });
    var due = null, docDate = null, all = [];
    lines.forEach(function (line, i) {
      var ds = findDates(line);
      all = all.concat(ds);
      if (!due && KW_DUE.test(line)) {
        var d = ds.length ? ds : (lines[i + 1] ? findDates(lines[i + 1]) : []);
        if (d.length) due = d[d.length - 1];
      }
      if (!docDate && KW_DOCDATE.test(line)) {
        var e = ds.length ? ds : (lines[i + 1] ? findDates(lines[i + 1]) : []);
        if (e.length) docDate = e[0];
      }
    });
    today = today || new Date().toISOString().slice(0, 10);
    if (!docDate) {
      var past = all.filter(function (d) { return d <= today && d !== due; }).sort();
      if (past.length) docDate = past[past.length - 1];
    }
    return { amount: best && best.score >= 0 ? best.value : (best ? best.value : null), amountSure: !!(best && best.score >= 3), dueDate: due, docDate: docDate };
  }
  var api = { parseDocText: parseDocText, findDates: findDates, findAmounts: findAmounts };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DocParse = api;
})(typeof self !== 'undefined' ? self : this);
