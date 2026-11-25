/* TryBox on-screen diagnostic. ES5, local only: no network calls, no storage, no cookies read. */
(function () {
  if (window.__tbDiag) { return; }
  window.__tbDiag = true;
  var errs = [];
  var errTotal = 0;
  var MAX = 7;
  var inEval = false;
  var sawSyncCsp = false;
  var evalIgnore = 0;
  function redact(x) {
    x = String(x == null ? '' : x);
    x = x.replace(/https?:\/\/[^\s"'<>)]+/gi, function (u) { return u.split(/[?#]/)[0]; });
    x = x.replace(/[?&#][A-Za-z0-9_.~%-]+=[^\s&"']*/g, '[q]');
    x = x.replace(/[A-Za-z0-9+\/_=-]{24,}/g, '[redacted]');
    x = x.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]');
    x = x.replace(/\b\d{6,}\b/g, '[num]');
    return x;
  }
  function add(kind, msg) {
    errTotal++;
    msg = redact(String(msg == null ? '' : msg).replace(/\s+/g, ' ')).slice(0, 110);
    if (errs.length < MAX) { errs.push(kind + ': ' + msg); }
    else if (errs.length === MAX) { errs.push('... more errors not shown'); }
  }
  function shortUrl(u) { try { if (u == null || u === '') { return '?'; } return redact(String(u).split(/[?#]/)[0]).slice(0, 70); } catch (e) { return '?'; } }
  window.addEventListener('error', function (e) {
    if (e && e.target && e.target !== window && (e.target.src || e.target.href)) {
      add('RES-FAIL', (e.target.tagName || '') + ' ' + shortUrl(e.target.src || e.target.href));
    } else {
      add('JS-ERR', ((e && e.message) || '?') + ' @' + shortUrl(e && e.filename) + ':' + (e && e.lineno != null ? e.lineno : '?') + ':' + (e && e.colno != null ? e.colno : '?'));
    }
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    add('PROMISE', e && e.reason && (e.reason.message || e.reason));
  });
  document.addEventListener('securitypolicyviolation', function (e) {
    if (e && e.blockedURI === 'eval' && (inEval || evalIgnore > 0)) {
      if (inEval) { sawSyncCsp = true; }
      else { evalIgnore--; }
      return;
    }
    add('CSP', (e.violatedDirective || '') + ' ' + shortUrl(e.blockedURI));
  });
  var ce = console.error;
  console.error = function () {
    try { add('CONSOLE', Array.prototype.slice.call(arguments).join(' ')); } catch (x) {}
    return ce && ce.apply(console, arguments);
  };

  function can(expr) {
    inEval = true;
    sawSyncCsp = false;
    try {
      var res = !!eval(expr);
      inEval = false;
      return res ? 'Y' : 'n';
    } catch (e) {
      inEval = false;
      if (sawSyncCsp || (e && (e.name === 'EvalError' || /unsafe-eval|Content Security Policy/i.test(String(e.message || ''))))) {
        if (!sawSyncCsp) { evalIgnore++; }
        return '?';
      }
      return 'n';
    }
  }
  function canIs() { try { document.querySelector(':is(a)'); return 'Y'; } catch (e) { return 'n'; } }
  function css(p, v) { try { return !!(window.CSS && CSS.supports && CSS.supports(p, v)); } catch (e) { return false; } }
  function yn(b) { return b ? 'Y' : 'n'; }

  function features() {
    var a = [
      'fetch ' + yn(window.fetch),
      'Promise ' + yn(window.Promise),
      'IntObs ' + yn(window.IntersectionObserver),
      'ResObs ' + yn(window.ResizeObserver),
      'MSE ' + yn(window.MediaSource),
      'optchain ' + can('({a:1})?.a'),
      'nullish ' + can('null ?? 1'),
      'matchAll ' + yn(String.prototype.matchAll),
      'flatMap ' + yn(Array.prototype.flatMap),
      'fromEntries ' + yn(Object.fromEntries),
      'structClone ' + yn(window.structuredClone),
      'css:grid ' + yn(css('display', 'grid')),
      'css:gap-grid ' + yn(css('gap', '1px')),
      'css:aspect ' + yn(css('aspect-ratio', '1/1')),
      'css:backdrop ' + yn(css('backdrop-filter', 'blur(1px)')),
      'css:inset ' + yn(css('inset', '0')),
      'css:dvh ' + yn(css('height', '1dvh')),
      'css:var ' + yn(css('color', 'var(--x)')),
      'css:oklch ' + yn(css('color', 'oklch(0.5 0.1 20)')),
      'css:colormix ' + yn(css('color', 'color-mix(in srgb, red, blue)')),
      'css::is ' + canIs(),
      'css:@layer ' + yn(window.CSSLayerBlockRule)
    ];
    var out = [], i;
    for (i = 0; i < a.length; i += 5) { out.push(a.slice(i, i + 5).join('  ')); }
    return out.join('\n');
  }

  function textLen() {
    var b = document.body, n = 0, i, c;
    if (!b) { return '-'; }
    for (i = 0; i < b.children.length; i++) {
      c = b.children[i];
      if (c.id === '__tbdiag' || c.tagName === 'SCRIPT' || c.tagName === 'STYLE') { continue; }
      n += (c.innerText || '').length;
    }
    return n;
  }
  function pageState() {
    var b = document.body, h = document.documentElement, s = '';
    try {
      var r = document.getElementById('root') || document.getElementById('app') || (b && b.firstElementChild);
      var cs = b && getComputedStyle(b);
      s = 'ready=' + document.readyState + ' bodyKids=' + (b ? b.children.length - (box && box.parentNode === b ? 1 : 0) : '-') +
        ' textLen=' + textLen() +
        ' scripts=' + document.scripts.length +
        ' win=' + window.innerWidth + 'x' + window.innerHeight + '@' + window.devicePixelRatio +
        ' bodyBg=' + (cs ? cs.backgroundColor : '-') +
        ' first=' + (r ? (r.tagName + '#' + (r.id || '') + ' ' + r.offsetWidth + 'x' + r.offsetHeight) : '-');
    } catch (e) { s = 'state read failed'; }
    return s;
  }

  var box;
  function ensure() {
    if (box && box.parentNode) { return box; }
    if (!document.body) { return null; }
    box = document.createElement('div');
    box.id = '__tbdiag';
    box.style.cssText = 'position:fixed;left:0;top:0;right:0;z-index:2147483647;background:#000;' +
      'color:#0f0;font:20px/24px monospace;padding:8px;white-space:pre-wrap;word-break:break-all;' +
      'border-bottom:3px solid #0f0;max-height:100%;overflow:hidden;pointer-events:none';
    document.body.appendChild(box);
    return box;
  }
  var t0 = Date.now();
  function render() {
    var el = ensure();
    if (!el) { return; }
    el.textContent =
      'TRYBOX DIAG v0.2 (t+' + Math.round((Date.now() - t0) / 1000) + 's)\n' +
      'UA: ' + navigator.userAgent + '\n' +
      'URL: ' + shortUrl(location.href) + '\n' +
      pageState() + '\n' +
      features() + '\n' +
      (errs.length ? 'ERRORS (' + errTotal + '):\n' + errs.join('\n') : 'No errors captured so far. This does not prove the page is healthy: early parse, cross-origin and network failures can be missed.');
  }
  setInterval(render, 1500);
  document.addEventListener('DOMContentLoaded', render);
  window.addEventListener('load', render);
})();
