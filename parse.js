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
