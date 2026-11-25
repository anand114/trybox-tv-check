/* TryBox on-screen diagnostic v0.5. ES5. Reads only same-origin public CSS files (for the compat shim). No storage, no cookies. */
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


  /* ---- CSS compatibility shim (v0.4). Same-origin public CSS read only. Set SHIM_ENABLED to false to disable. ---- */
  var SHIM_ENABLED = true;
  var shim = { seen: {}, fetched: 0, injected: 0, failed: 0, bytesIn: 0, bytesOut: 0, nodes: [] };
/* CSS compatibility transform for old Chromium (no @layer, oklch, dvh). Pure string in, string out. */

  function skipString(css, i) {
    var q = css.charAt(i), n = css.length;
    i++;
    while (i < n) {
      var c = css.charAt(i);
      if (c === '\\') { i += 2; continue; }
      if (c === q) { return i + 1; }
      i++;
    }
    return n;
  }
  function skipComment(css, i) {
    var e = css.indexOf('*/', i + 2);
    return e < 0 ? css.length : e + 2;
  }
  /* find index of the "}" matching the "{" at position open */
  function matchBrace(css, open) {
    var d = 0, i = open, n = css.length, c;
    while (i < n) {
      c = css.charAt(i);
      if (c === '\\') { i += 2; continue; }
      if (c === '"' || c === "'") { i = skipString(css, i); continue; }
      if (c === '/' && css.charAt(i + 1) === '*') { i = skipComment(css, i); continue; }
      if (c === '{') { d++; }
      else if (c === '}') { d--; if (d === 0) { return i; } }
      i++;
    }
    return -1;
  }
  /* remove "@layer ...;" statements and unwrap "@layer name { ... }" blocks, at any nesting */
  function unlayer(css) {
    var out = '', i = 0, n = css.length, c;
    while (i < n) {
      c = css.charAt(i);
      if (c === '\\') { out += css.substr(i, 2); i += 2; continue; }
      if (c === '"' || c === "'") { var s = skipString(css, i); out += css.slice(i, s); i = s; continue; }
      if (c === '/' && css.charAt(i + 1) === '*') { var e = skipComment(css, i); out += css.slice(i, e); i = e; continue; }
      if (c === '@' && css.substr(i, 6) === '@layer' && /[\s{;]/.test(css.charAt(i + 6))) {
        var j = i + 6, k = j;
        while (k < n && css.charAt(k) !== '{' && css.charAt(k) !== ';') { k++; }
        if (k >= n) { out += css.slice(i); break; }
        if (css.charAt(k) === ';') { i = k + 1; continue; }
        var close = matchBrace(css, k);
        if (close < 0) { out += css.slice(i); break; }
        out += unlayer(css.slice(k + 1, close));
        i = close + 1;
        continue;
      }
      out += c;
      i++;
    }
    return out;
  }
  /* OKLCH -> sRGB */
  function lin2srgb(x) {
    x = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
    return Math.max(0, Math.min(1, x));
  }
  function oklchToRgb(L, C, Hdeg) {
    var h = Hdeg * Math.PI / 180, a = C * Math.cos(h), b = C * Math.sin(h);
    var l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    var m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    var s_ = L - 0.0894841775 * a - 1.2914855480 * b;
    var l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
    var r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    var g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    var bl = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
    return [Math.round(lin2srgb(r) * 255), Math.round(lin2srgb(g) * 255), Math.round(lin2srgb(bl) * 255)];
  }
  var OKLCH = /oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*(?:\/\s*([\d.]+)(%?))?\s*\)/g;
  function convertOklch(css) {
    return css.replace(OKLCH, function (m, L, pct, C, H, A, apct) {
      var l = parseFloat(L); if (pct) { l = l / 100; }
      var rgb = oklchToRgb(l, parseFloat(C), parseFloat(H));
      if (A != null) {
        var al = parseFloat(A); if (apct) { al = al / 100; }
        return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + (Math.round(al * 1000) / 1000) + ')';
      }
      return 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
    });
  }
  function convertUnits(css) {
    return css.replace(/(\d)(dvh|svh|lvh)\b/g, '$1vh').replace(/(\d)(dvw|svw|lvw)\b/g, '$1vw');
  }
  function transform(css) { return convertUnits(convertOklch(unlayer(css))); }

  function shimSheet(href) {
    if (shim.seen[href]) { return; }
    shim.seen[href] = true;
    try {
      var u = document.createElement('a'); u.href = href;
      if (u.origin !== location.origin || !/\.css$/.test(u.pathname)) { return; }
    } catch (e0) { return; }
    fetch(href, { credentials: 'omit' }).then(function (r) {
      if (!r.ok) { throw new Error('http ' + r.status); }
      return r.text();
    }).then(function (css) {
      shim.fetched++;
      var out = transform(css);
      var st = document.createElement('style');
      st.setAttribute('data-tb-shim', '1');
      st.textContent = out;
      (document.head || document.documentElement).appendChild(st);
      shim.nodes.push(st);
      shim.injected++; shim.bytesIn += css.length; shim.bytesOut += out.length;
    }).catch(function () { shim.failed++; });
  }
  function shimScan() {
    if (!SHIM_ENABLED) { return; }
    var l = document.querySelectorAll('link[rel~="stylesheet"]'), i;
    for (i = 0; i < l.length; i++) { if (l[i].href) { shimSheet(l[i].href); } }
  }
  /* rollback at runtime: window.__tbShimOff() removes the injected styles */
  window.__tbShimOff = function () { var i; for (i = 0; i < shim.nodes.length; i++) { if (shim.nodes[i].parentNode) { shim.nodes[i].parentNode.removeChild(shim.nodes[i]); } } shim.nodes = []; SHIM_ENABLED = false; };
  if (SHIM_ENABLED) {
    shimScan();
    try {
      new MutationObserver(shimScan).observe(document.documentElement, { childList: true, subtree: true });
    } catch (eo) { setInterval(shimScan, 500); }
  }
  /* ---- end shim ---- */

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


  function counts() {
    var all = document.getElementsByTagName('*'), nz = 0, i, el, sheets = document.styleSheets, rs = [], n, b = document.body, cs;
    for (i = 0; i < all.length; i++) { el = all[i]; if (el.offsetWidth > 0 && el.offsetHeight > 0) { nz++; } }
    for (i = 0; i < sheets.length; i++) { n = -1; try { n = sheets[i].cssRules.length; } catch (e) { n = -2; } rs.push(n); }
    cs = b && getComputedStyle(b);
    return 'elems=' + all.length + ' sized=' + nz + ' sheets=' + sheets.length + ' rules=[' + rs.join(',') + ']' +
      ' bodyColor=' + (cs ? cs.color : '-') + ' bodyH=' + (b ? b.offsetHeight : '-') +
      '\nSHIM ' + (SHIM_ENABLED ? 'on' : 'off') + ' fetched=' + shim.fetched + ' injected=' + shim.injected + ' failed=' + shim.failed +
      ' bytes=' + shim.bytesIn + '>' + shim.bytesOut;
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
      'TRYBOX DIAG v0.5 (t+' + Math.round((Date.now() - t0) / 1000) + 's)\n' +
      'UA: ' + navigator.userAgent + '\n' +
      'URL: ' + shortUrl(location.href) + '\n' +
      pageState() + '\n' +
      counts() + '\n' +
      features() + '\n' +
      (errs.length ? 'ERRORS (' + errTotal + '):\n' + errs.join('\n') : 'No errors captured so far. This does not prove the page is healthy: early parse, cross-origin and network failures can be missed.');
  }
  setInterval(render, 1500);
  document.addEventListener('DOMContentLoaded', render);
  window.addEventListener('load', render);
  /* ---- D-pad focus navigation (v0.5). Remote arrows move focus between visible focusable elements; OK clicks. ---- */
  var NAV_ENABLED = true;
  var navStyle = null;
  var navHandler = null;
  var FOCUSABLE = 'a[href],button,input,select,textarea,[tabindex],[role="button"],[role="link"],[role="menuitem"],[role="tab"]';
  function navVisible(el) {
    if (el.disabled) { return false; }
    var ti = el.getAttribute('tabindex');
    if (ti !== null && parseInt(ti, 10) < 0 && el.tagName !== 'A' && el.tagName !== 'BUTTON' && el.tagName !== 'INPUT') { return false; }
    var r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) { return false; }
    var vh = window.innerHeight || document.documentElement.clientHeight;
    var vw = window.innerWidth || document.documentElement.clientWidth;
    if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) { return false; }
    var cs = window.getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none') { return false; }
    return true;
  }
  function navList() {
    var all = document.querySelectorAll(FOCUSABLE), out = [], i;
    for (i = 0; i < all.length; i++) {
      if (all[i].id === '__tbdiag') { continue; }
      if (navVisible(all[i])) { out.push(all[i]); }
    }
    return out;
  }
  function navMove(dir) {
    var list = navList();
    if (!list.length) { return false; }
    var cur = document.activeElement;
    if (!cur || cur === document.body || list.indexOf(cur) < 0) {
      list[0].focus();
      return true;
    }
    var cr = cur.getBoundingClientRect();
    var cx = cr.left + cr.width / 2, cy = cr.top + cr.height / 2;
    var best = null, bestScore = 1e9, i, r, dx, dy, prim, orth, score;
    for (i = 0; i < list.length; i++) {
      if (list[i] === cur) { continue; }
      r = list[i].getBoundingClientRect();
      dx = (r.left + r.width / 2) - cx;
      dy = (r.top + r.height / 2) - cy;
      if (dir === 'ArrowRight') { if (dx <= 1) { continue; } prim = dx; orth = Math.abs(dy); }
      else if (dir === 'ArrowLeft') { if (dx >= -1) { continue; } prim = -dx; orth = Math.abs(dy); }
      else if (dir === 'ArrowDown') { if (dy <= 1) { continue; } prim = dy; orth = Math.abs(dx); }
      else { if (dy >= -1) { continue; } prim = -dy; orth = Math.abs(dx); }
      score = prim + 2 * orth;
      if (score < bestScore) { bestScore = score; best = list[i]; }
    }
    if (best) {
      best.focus();
      try { best.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { }
      return true;
    }
    return false;
  }
  function navKeyName(e) {
    var k = e.key, c = e.keyCode;
    if (k === 'ArrowLeft' || c === 37) { return 'ArrowLeft'; }
    if (k === 'ArrowUp' || c === 38) { return 'ArrowUp'; }
    if (k === 'ArrowRight' || c === 39) { return 'ArrowRight'; }
    if (k === 'ArrowDown' || c === 40) { return 'ArrowDown'; }
    if (k === 'Enter' || c === 13) { return 'Enter'; }
    return '';
  }
  function navOn() {
    if (navHandler) { return; }
    navStyle = document.createElement('style');
    navStyle.setAttribute('data-tb-nav', '1');
    navStyle.appendChild(document.createTextNode(':focus{outline:4px solid #ffeb3b !important;outline-offset:2px !important}'));
    (document.head || document.documentElement).appendChild(navStyle);
    navHandler = function (e) {
      if (!NAV_ENABLED) { return; }
      var name = navKeyName(e);
      if (!name) { return; }
      var a = document.activeElement;
      var typing = a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && /^(text|email|search|tel|url|password|number)$/i.test(a.type || 'text')));
      if (name === 'Enter') {
        if (a && a !== document.body && !typing && a.tagName !== 'BUTTON' && a.tagName !== 'A' && a.tagName !== 'INPUT') {
          a.click(); e.preventDefault();
        }
        return;
      }
      if (typing && (name === 'ArrowLeft' || name === 'ArrowRight')) { return; }
      if (navMove(name)) { e.preventDefault(); e.stopPropagation(); }
    };
    document.addEventListener('keydown', navHandler, true);
  }
  window.__tbNavOff = function () {
    NAV_ENABLED = false;
    if (navHandler) { document.removeEventListener('keydown', navHandler, true); navHandler = null; }
    if (navStyle && navStyle.parentNode) { navStyle.parentNode.removeChild(navStyle); }
    navStyle = null;
  };
  if (NAV_ENABLED) { navOn(); }
})();
