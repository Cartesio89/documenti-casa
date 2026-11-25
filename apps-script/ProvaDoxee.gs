/* Prova (solo lettura): apre il link "Naviga la tua bolletta" dell'ultima mail Engie e scrive nel log
 * com'è fatta la pagina. Non invia il codice fiscale, non scrive nulla su GitHub. */
function provaDoxee() {
  var t = GmailApp.search('from:engie subject:bolletta', 0, 1)[0];
  if (!t) { Logger.log('Nessuna mail Engie trovata'); return; }
  var links = extractLinks(t.getMessages().pop().getBody());
  var url = (links.filter(function (l) { return /doxee|bollett/i.test(l.url + ' ' + l.text); })[0] || links[0] || {}).url;
  if (!url) { Logger.log('Nessun link nella mail'); return; }
  var cookies = [];
  for (var i = 0; i < 8 && url; i++) {
    var r = UrlFetchApp.fetch(url, { followRedirects: false, muteHttpExceptions: true, headers: cookies.length ? { Cookie: cookies.join('; ') } : {} });
    var hd = r.getAllHeaders();
    var sc = hd['Set-Cookie']; if (sc) [].concat(sc).forEach(function (c) { cookies.push(String(c).split(';')[0]); });
    Logger.log('PASSO ' + (i + 1) + ': ' + r.getResponseCode() + ' ' + url.replace(/[?#].*/, '') + ' | tipo: ' + (hd['Content-Type'] || '') + ' | cookie: ' + cookies.map(function (c) { return c.split('=')[0]; }).join(','));
    var loc = hd['Location'];
    if (loc) { url = loc.indexOf('http') === 0 ? loc : url.replace(/^(https?:\/\/[^\/]+).*$/, '$1') + loc; continue; }
    var html = r.getContentText();
    Logger.log('LUNGHEZZA: ' + html.length);
    Logger.log('SCRIPT: ' + (html.match(/<script[^>]*src="[^"]+"/gi) || []).join(' ').slice(0, 1500));
    Logger.log('FORM: ' + (html.match(/<form[^>]*>/gi) || []).join(' ').slice(0, 800));
    Logger.log('INPUT: ' + (html.match(/<input[^>]*>/gi) || []).join(' ').slice(0, 1500));
    Logger.log('CAPTCHA: ' + /captcha|recaptcha|hcaptcha|turnstile/i.test(html));
    Logger.log('API: ' + (html.match(/["'](\/[a-z0-9\-_\/]*(api|auth|login|verify|check|validate)[a-z0-9\-_\/]*)["']/gi) || []).slice(0, 20).join(' '));
    Logger.log('TESTO: ' + html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1200));
    Logger.log('INIZIO HTML: ' + html.slice(0, 2500));
    break;
  }
}
