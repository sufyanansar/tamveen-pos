/* Tamveen POS — web proof of concept.
   Single-page app, no build step. State lives in localStorage so the demo survives reloads. */
(function () {
  'use strict';

  // ---------------------------------------------------------------- storage
  const KEY = 'tamveen-pos-db-v3';
  const CART_KEY = 'tamveen-pos-cart-v3';
  const clone = (o) => JSON.parse(JSON.stringify(o));
  function load() {
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.version === SEED.version) return s; } catch (e) { /* ignore */ }
    return clone(SEED);
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); localStorage.setItem(CART_KEY, JSON.stringify(ui.cart)); } catch (e) { /* storage unavailable */ } }
  function loadCart() {
    try { const c = JSON.parse(localStorage.getItem(CART_KEY)); if (c && Array.isArray(c.lines)) return c; } catch (e) { /* ignore */ }
    return { lines: [], customerId: null, orderId: null };
  }

  let db = load();
  const ui = {
    cart: loadCart(), cat: 'fav', q: '', modal: null, demoOpen: false, toasts: [],
    pay: null, form: null, lastInvoice: null, sel: null, nextQty: '1', invFilter: 'all', invQ: '', prodQ: '', prodCat: 'all',
    custTab: 'unpaid', payForm: null, ret: null, custQ: '', notifiedOffline: false,
    rcv: { sup: 's1', lines: [], img: null, sample: false, busy: false, status: '' },
    demo: { server: true, internet: true, printer: true, terminal: true },
  };

  // ---------------------------------------------------------------- helpers
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const money = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const qtyFmt = (q, weighted) => weighted ? Number(q).toFixed(3) : String(Number(q));
  const lang = () => db.settings.lang;
  const isAr = () => lang() === 'ar';
  const t = (s, vars) => {
    let out = (isAr() && window.I18N_AR && I18N_AR[s]) || s;
    if (vars) Object.keys(vars).forEach((k) => { out = out.split('{' + k + '}').join(vars[k]); });
    return out;
  };
  window.TamveenT = t;
  const N = (o) => (o ? (isAr() ? (o.ar || o.en) : (o.en || o.ar)) : '');
  const N2 = (o) => (o ? (isAr() ? o.en : o.ar) : '');
  const SAR = () => (isAr() ? 'ر.س' : 'SAR');
  const locale = () => (isAr() ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB');
  const fmtDate = (d) => new Date(d).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' });
  const fmtDay = (d) => new Date(d).toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
  const fmtTime = (d) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const fmtDT = (d) => { const x = new Date(d); return x.toISOString().slice(0, 10) + ' ' + fmtTime(x); };
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const isToday = (d) => new Date(d).toDateString() === new Date().toDateString();
  const daysBetween = (a, b) => Math.floor((new Date(b) - new Date(a)) / 86400000);
  const prod = (id) => db.products.find((p) => p.id === id);
  const cust = (id) => db.customers.find((c) => c.id === id);
  const user = () => db.users.find((u) => u.id === (db.session && db.session.userId));
  const role = () => (user() ? user().role : 'cashier');
  const isMgr = () => role() === 'manager' || role() === 'owner';
  const cat = (id) => db.categories.find((c) => c.id === id);
  const uid = (p) => p + Math.random().toString(36).slice(2, 8).toUpperCase();
  const vatRate = (v) => (v === 'standard' ? 0.15 : 0);
  const audit = (what) => db.audit.unshift({ at: new Date().toISOString(), by: user() ? user().name : '-', what });

  // ---------------------------------------------------------------- icons
  const I = {
    menu: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    user: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
    barcode: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 5v14M6 5v14M10 5v14M13 5v14M17 5v14M21 5v14M8 5v14M19 5v14"/></svg>',
    search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#536B62" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
    sync: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M20 12a8 8 0 0 1-14 5.3M4 12a8 8 0 0 1 14-5.3"/><path d="M18 3v4h-4M6 21v-4h4"/></svg>',
    print: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M6 9V3h12v6M6 18H4v-7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7h-2"/><rect x="6" y="14" width="12" height="7"/></svg>',
    send: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M21 3L3 10.5l7 2.5 2.5 7z"/><path d="M10 13l11-10"/></svg>',
    check: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#105448" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    tick: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    info: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="flex:none;margin-top:1px"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
    warn: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" style="flex:none"><path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/></svg>',
    lock: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    eye: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#536B62" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    camera: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    flask: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M9 3h6M10 3v6L4 20h16l-6-11V3"/></svg>',
  };
  const arrow = () => `<span class="arr" aria-hidden="true">${isAr() ? '←' : '→'}</span>`;
  const logo = (size = 40) => {
    const d = 'M 500 149 C 500 121 522 112 543 131 L 689 261 C 707 277 708 288 691 306 L 561 423 C 546 440 527 440 512 426 C 503 418 500 405 500 390 Z';
    let paths = '';
    for (let i = 0; i < 8; i++) paths += `<path d="${d}" transform="rotate(${i * 45} 500 500)" fill="${i % 2 ? '#AADD54' : '#89C943'}"/>`;
    return `<svg width="${size}" height="${size}" viewBox="100 100 800 800" aria-hidden="true">${paths}</svg>`;
  };

  // ---------------------------------------------------------------- cart math
  function lineTotal(l) { return r2(l.price * l.qty - (l.discount || 0)); }
  function calc(lines) {
    let gross = 0, disc = 0, vat = 0, items = 0;
    lines.forEach((l) => {
      const g = r2(l.price * l.qty); gross += g; disc += l.discount || 0;
      const net = g - (l.discount || 0); const rate = vatRate(l.vat);
      vat += net - net / (1 + rate);
      items += l.weighted ? 1 : l.qty;
    });
    const total = r2(gross - disc);
    vat = r2(vat);
    return { gross: r2(gross), disc: r2(disc), total, vat, net: r2(total - vat), items, count: lines.length };
  }

  function addToCart(pid, qty, opts = {}) {
    const p = prod(pid);
    if (!p) return;
    if (!p.active) return toast(t('{n} is inactive and cannot be sold.', { n: N(p) }));
    const inCart = ui.cart.lines.filter((l) => l.pid === pid).reduce((s, l) => s + l.qty, 0);
    if (p.stock <= 0) return toast(t('{n} is out of stock.', { n: N(p) }), 'bad');
    if (inCart + qty > p.stock) toast(t('Only {s} of {n} in stock.', { s: qtyFmt(p.stock, p.weighted), n: N(p) }), 'warn');
    const existing = !p.weighted && ui.cart.lines.find((l) => l.pid === pid && !l.discount);
    if (existing) { existing.qty = r2(existing.qty + qty); ui.sel = ui.cart.lines.indexOf(existing); }
    else { ui.cart.lines.push({ pid, en: p.en, ar: p.ar, unit: p.unit, price: p.price, qty, vat: p.vat, weighted: p.weighted, discount: 0, reason: '' }); ui.sel = ui.cart.lines.length - 1; }
    if (!opts.silent) toast(t('Added {n}', { n: `<b>${esc(N(p))}</b> × ${qtyFmt(qty, p.weighted)}` }));
    save();
  }

  function findByBarcode(code) {
    code = String(code).trim();
    for (const p of db.products) {
      const pk = p.packs.find((k) => k.barcode === code);
      if (pk) return { p, qty: pk.qty };
    }
    // Scale labels: 21 + item (5) + weight in grams (5) + check digit
    if (/^21\d{11}$/.test(code)) {
      const p = db.products.find((x) => x.weighted && x.packs.some((k) => k.barcode.slice(0, 7) === code.slice(0, 7)));
      if (p) return { p, qty: Number(code.slice(7, 12)) / 1000 };
    }
    const bySku = db.products.find((p) => p.sku.toLowerCase() === code.toLowerCase());
    if (bySku) return { p: bySku, qty: 1 };
    return null;
  }

  // ---------------------------------------------------------------- routing
  function route() { return (location.hash.replace(/^#\/?/, '') || 'checkout').split('/'); }
  function go(path) { if (location.hash === '#/' + path) render(); else location.hash = '#/' + path; }

  // ---------------------------------------------------------------- toast
  function toast(html, kind) {
    const id = uid('t');
    ui.toasts.push({ id, html, kind });
    if (ui.toasts.length > 2) ui.toasts.shift();
    renderToasts();
    setTimeout(() => { ui.toasts = ui.toasts.filter((x) => x.id !== id); renderToasts(); }, 2600);
  }
  function renderToasts() {
    let el = $('#toasts');
    if (!el) { el = document.createElement('div'); el.id = 'toasts'; el.className = 'toasts'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.innerHTML = ui.toasts.map((x) => `<div class="toast">${x.html}</div>`).join('');
  }

  // ---------------------------------------------------------------- shell
  function chips() {
    const d = ui.demo;
    const c = (ok, en, okTxt, badTxt, warn) => `<button class="chip ${ok ? '' : (warn ? 'warn' : 'bad')}" data-a="demo-open" title="${esc(t('Simulate states from the demo panel'))}"><span class="dot"></span>${t(en)} · ${t(ok ? okTxt : badTxt)}</button>`;
    return c(d.server, 'Shop server', 'Connected', 'Lost') + c(d.internet, 'Internet', 'Online', 'Offline') + c(d.printer, 'Printer', 'Ready', 'Out of paper', true);
  }

  function shell(content, opts = {}) {
    const u = user();
    const r = route()[0];
    const ordN = db.orders.filter((o) => o.status !== 'completed').length;
    const cashierNav = [
      ['checkout', 'Checkout'], ['orders', 'Orders', ordN, true], ['invoices', 'Invoices'], ['returns', 'Returns'], ['customers', 'Customers'], ['products', 'Products'],
    ];
    const mgrNav = [
      ['checkout', 'Checkout'], ['orders', 'Orders', ordN, true], ['products', 'Products'], ['inventory', 'Inventory'], ['receive', 'Receive stock'], ['customers', 'Customers & Credit'], ['suppliers', 'Suppliers'], ['invoices', 'Invoices'], ['returns', 'Returns'], ['reports', 'Reports'], ['settings', 'Settings'],
    ];
    ui.navList = isMgr() ? mgrNav : cashierNav;
    const nav = (isMgr() ? mgrNav : cashierNav).map(([k, label, badge, lime]) => {
      const on = r === k || (k === 'checkout' && (r === 'pay' || r === 'done')) || (k === 'customers' && r === 'customer') || (k === 'products' && r === 'product') || (k === 'invoices' && r === 'invoice');
      return `<a class="nav ${on ? 'on' : ''}" href="#/${k}">${t(label)}${badge ? `<span class="badge ${lime ? 'lime' : ''}">${badge}</span>` : ''}</a>`;
    }).join('');
    const shift = db.session && db.session.shiftStart ? t('Shift since {t}', { t: fmtTime(db.session.shiftStart) }) : '';
    const banner = !ui.demo.server
      ? `<div class="banner">${I.warn}<span>${t("Can't reach the shop server")}</span><span class="spacer"></span><button class="btn sm danger" data-a="retry-conn">${t('Retry')}</button></div>`
      : !ui.demo.internet ? `<div class="banner warn">${I.warn}<span>${t('Internet offline')}</span></div>` : '';
    return `
    <div class="app">
      <header class="topbar">
        <a class="brand" href="#/checkout" aria-label="Tamveen">${logo(36)}<span class="word">تَمْوِين</span></a>
        <div class="shopinfo"><b>${esc(isAr() ? db.settings.shopAr : db.settings.shopEn)} · ${esc(isAr() ? db.settings.branchAr : db.settings.branch)}</b>
          <div>${esc(isAr() ? u.nameAr : u.name)} · ${t(cap(u.role))}${shift ? ' · ' + shift : ''}</div></div>
        <span class="spacer"></span>
        <div class="chips">${chips()}<button class="chip keep" data-a="demo-toggle" aria-expanded="${ui.demoOpen}">${I.flask}${t('Demo controls')}</button>
          <button class="btn sm ghost keep" data-a="sync">${I.sync}${t('Sync now')}</button>
          <button class="btn sm ghost keep" data-a="lang">${isAr() ? 'English' : 'العربية'}</button>
        </div>
        <button class="btn sm ghost menu-btn" data-a="menu" aria-label="${t('Menu')}">${I.menu}</button>
      </header>
      ${banner}
      <div class="body">
        <nav class="side" aria-label="${t('Main')}">
          <div class="role">${t(isMgr() ? 'Manager' : 'Cashier')}</div>
          ${nav}
          <div class="bottom">
            <button class="nav" data-a="close-shift">${t('Close shift')}</button>
            <button class="nav" data-a="switch-user">${t('Switch user')}</button>
          </div>
        </nav>
        <main class="main" id="main">${content}</main>
      </div>
      <nav class="tabbar" aria-label="${t('Main')}">
        ${[['checkout', 'Checkout'], ['orders', 'Orders', ordN], ['invoices', 'Invoices']].map(([k, label, b]) => `<a class="${r === k || (k === 'checkout' && (r === 'pay' || r === 'done')) || (k === 'invoices' && r === 'invoice') ? 'on' : ''}" href="#/${k}">${t(label)}${b ? `<span class="badge lime">${b}</span>` : ''}</a>`).join('')}
        <button data-a="menu">${t('More')}</button>
      </nav>
    </div>`;
  }
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  // ---------------------------------------------------------------- views: sign in
  function viewSignIn() {
    return `
    <div class="signin">
      <section class="form-side" aria-label="${t('Sign in')}">
        <div class="row">${logo(40)}<span class="ar" style="font-size:26px;font-weight:700;line-height:1">تَمْوِين</span><span class="spacer"></span>
          <button class="btn sm ghost" data-a="lang" style="height:40px">${isAr() ? 'English' : 'العربية'}</button></div>
        <div style="flex:1;display:flex;align-items:center">
          <form data-form="signin" autocomplete="on">
            <div style="display:flex;flex-direction:column;gap:10px">
              <span class="eyebrow">${t('Store sign-in')}</span>
              <h1>${t('Welcome back.')}</h1>
            </div>
            <label class="field"><span>${t('Store ID')}</span><input class="input" name="store" autocomplete="username" placeholder="[Store ID]" value="B1-RIYADH" required data-k="store"></label>
            <label class="field"><span class="between"><span>${t('Password')}</span><a href="#" data-a="forgot" style="font-size:13px">${t('Forgot password?')}</a></span>
              <span class="inwrap"><input class="input" type="password" name="password" value="demo1234" autocomplete="current-password" required id="pw" data-k="pw" style="padding-inline-end:52px">
              <button type="button" data-a="toggle-pw" aria-label="${t('Show password')}" style="position:absolute;inset-inline-end:6px;width:44px;height:44px;border:0;background:none;display:flex;align-items:center;justify-content:center">${I.eye}</button></span></label>
            <label class="row muted" style="min-height:44px;gap:10px"><input type="checkbox" name="remember" style="width:20px;height:20px;accent-color:#105448">${t('Remember this device')}</label>
            <label class="field"><span>${t('Sign in as')}</span>
              <select class="input" name="user">${db.users.map((u) => `<option value="${u.id}">${esc(isAr() ? u.nameAr : u.name)} · ${t(cap(u.role))}</option>`).join('')}</select></label>
            <button class="btn primary" type="submit" style="height:56px;font-size:16px">${t('Sign in')} ${arrow()}</button>
            <div class="divider">${t('or')}</div>
            <button class="btn" type="button" data-a="pin-unlock" style="height:52px">${t('Unlock with PIN')}</button>
            <div class="demo-hint">${t('PINs')} · ${t('Cashier')} <code>1111</code> · ${t('Manager')} <code>1234</code> · ${t('Owner')} <code>9999</code></div>
          </form>
        </div>
        <div class="row" style="flex-wrap:wrap;gap:8px 16px">
          <span class="chip"><span class="dot"></span>${t('Shop server')} · ${t('Connected')}</span>
          <span class="chip"><span class="dot"></span>${t('Internet')} · ${t('Online')}</span>
          <span class="spacer"></span><span class="small muted">© 2026 TrueGrad</span>
        </div>
      </section>
      <section class="vision" aria-label="Saudi Vision 2030" id="vision">
        <img class="vision-logo" src="assets/vision-2030.png" alt="Saudi Vision 2030 — Kingdom of Saudi Arabia">
        <img class="flag-fg flag-poster" src="assets/flag.png" alt="" aria-hidden="true">
        <canvas class="flag-fg flag-canvas" width="720" height="800" aria-hidden="true"></canvas>
        <video class="flag-video" src="assets/flag.mp4" muted autoplay loop playsinline preload="auto" aria-hidden="true"></video>
      </section>
    </div>`;
  }

  // The flag video packs colour (left half) and alpha (right half) side by side.
  let flagLoop = null;
  function mountFlag() {
    const panel = $('#vision'); if (!panel) return;
    const video = panel.querySelector('video'), canvas = panel.querySelector('canvas');
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { video.remove(); canvas.remove(); return; }
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true });
    if (!gl) return;
    const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, mk(gl.VERTEX_SHADER, 'attribute vec2 position; varying vec2 uv; void main(){ uv=(position+1.0)*0.5; gl_Position=vec4(position,0.0,1.0); }'));
    gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, 'precision mediump float; uniform sampler2D frame; varying vec2 uv; void main(){ vec3 color=texture2D(frame,vec2(uv.x*0.5,uv.y)).rgb; float alpha=texture2D(frame,vec2(0.5+uv.x*0.5,uv.y)).r; gl_FragColor=vec4(color*alpha,alpha); }'));
    gl.linkProgram(prog); gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(prog, 'position'); gl.enableVertexAttribArray(pos); gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach((k) => gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE));
    [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER].forEach((k) => gl.texParameteri(gl.TEXTURE_2D, k, gl.LINEAR));
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.viewport(0, 0, canvas.width, canvas.height);
    const draw = () => {
      if (!document.body.contains(video)) return;
      if (video.readyState >= 2) { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video); gl.drawArrays(gl.TRIANGLES, 0, 6); panel.classList.add('flag-ready'); }
      flagLoop = requestAnimationFrame(draw);
    };
    cancelAnimationFrame(flagLoop);
    const p = video.play(); if (p && p.catch) p.catch(() => {});
    draw();
  }

  // ---------------------------------------------------------------- views: checkout
  function productCard(p) {
    const inCart = ui.cart.lines.filter((l) => l.pid === p.id).reduce((s, l) => s + l.qty, 0);
    const left = r2(p.stock - inCart);
    const stockTxt = p.stock <= 0 ? `<span class="s out">${t('Out of stock')}</span>`
      : p.stock <= p.reorder / 2 || p.stock <= 3 ? `<span class="s low">${t('Low · {n} left', { n: qtyFmt(left, p.weighted) })}</span>`
        : `<span class="s">${p.weighted ? qtyFmt(left, false) + ' kg' : t('{n} in stock', { n: left })}</span>`;
    return `<button class="pcard" data-a="add" data-id="${p.id}" ${p.stock <= 0 ? 'aria-disabled="true"' : ''}>
      <span class="n">${esc(N(p))}</span><span class="na">${esc(N2(p))}</span>
      <span class="f"><span class="p num">${money(p.price)}${p.weighted ? ' /kg' : ''}</span>${stockTxt}</span></button>`;
  }

  function filteredProducts(q, catId) {
    q = (q || '').trim().toLowerCase();
    return db.products.filter((p) => p.active && (q
      ? (p.en.toLowerCase().includes(q) || p.ar.includes(q) || p.sku.toLowerCase().includes(q) || p.packs.some((k) => k.barcode.includes(q)))
      : catId === 'fav' ? p.fav : p.cat === catId));
  }

  // Bill table on the left: every line the cashier and customer need to see as items are added.
  function billTable() {
    const c = calc(ui.cart.lines);
    const cu = cust(ui.cart.customerId);
    const rows = ui.cart.lines.map((l, i) => {
      const net = lineTotal(l), rate = vatRate(l.vat), vat = r2(net - net / (1 + rate));
      const p = prod(l.pid), changed = p && p.price !== l.price;
      return `<tr class="${i === ui.sel ? 'on' : ''}" data-a="sel" data-i="${i}">
        <td class="num c">${i + 1}</td>
        <td class="num c"><b>${qtyFmt(l.qty, l.weighted)}</b></td>
        <td><div class="pn">${esc(N(l))}</div><div class="pa">${esc(N2(l))}</div>
          ${l.discount ? `<span class="tag lime">−${money(l.discount)} · ${esc(t(l.reason))}</span>` : ''}${changed ? `<span class="tag amber">${t('Shelf price now {p}', { p: money(p.price) })}</span>` : ''}</td>
        <td class="r num">${money(l.price)}</td>
        <td class="r num">${money(vat)}</td>
        <td class="r num">${money(r2(net - vat))}</td>
        <td class="r num"><b>${money(net)}</b></td></tr>`;
    }).join('');
    return `<section class="pos-bill" aria-label="${t('Bill')}">
      <div class="pos-head">
        <button class="pos-cust" data-a="cust-pick"><span class="ic">${I.user}</span><span><small>${t('Customer')}<span class="kbd-hint"> · F2</span></small><b>${cu ? esc(N(cu)) : t('Walk-in customer')}</b>${cu && cu.credit ? `<small>${t('Credit available {a} SAR', { a: money(creditAvailable(cu)) })}</small>` : ''}</span></button>
        ${cu ? `<button class="linkbtn" data-a="cust-clear">${t('Clear')}</button>` : ''}
        <span class="spacer"></span>
        <div class="pos-meta"><b>${t('Bill · draft')}</b><span>${t('{l} lines · {i} items', { l: c.count, i: r2(c.items) })}</span>${ui.cart.orderId ? `<span class="tag outline">${t('From order {o}', { o: ui.cart.orderId })}</span>` : ''}</div>
      </div>
      <div class="btable-wrap" id="btable">
        <table class="btable"><thead><tr><th class="c">#</th><th class="c">${t('Qty')}</th><th>${t('Product')}</th><th class="r">${t('Price')}</th><th class="r">${t('Tax')}</th><th class="r">${t('Net amount')}</th><th class="r">${t('Total')}</th></tr></thead>
        <tbody>${rows || `<tr class="empty-row"><td colspan="7">${t('Scan a barcode to start the bill.')}</td></tr>`}</tbody></table>
      </div>
      <div class="pos-foot">
        <div class="pos-total"><span>${t('Total')}</span><b class="num">${money(c.total)} <small>${SAR()}</small></b></div>
        <div class="pos-btns">
          <button class="btn primary" data-a="pay" ${c.count ? '' : 'disabled'}>${t('Settle')} <kbd>F5</kbd></button>
          <button class="btn ghost" data-a="clear" ${c.count ? '' : 'disabled'}>${t('Clear')}</button>
        </div>
      </div>
    </section>`;
  }

  function itemBody(l) {
    const p = prod(l.pid);
    const gross = r2(l.price * l.qty), net = lineTotal(l), rate = vatRate(l.vat), vat = r2(net - net / (1 + rate));
    const inCart = ui.cart.lines.filter((x) => x.pid === l.pid).reduce((a, x) => a + x.qty, 0);
    const kv = (k, v, cls = '') => `<div class="kv ${cls}"><span>${t(k)}</span><b class="num">${v}</b></div>`;
    return `<div class="item-name">${esc(N(l))}</div><div class="item-sub">${esc(N2(l))}</div>
      <div class="item-grid">
        <div>${kv('Sale price', money(l.price) + (l.weighted ? ' /kg' : ''))}${kv('Quantity', qtyFmt(l.qty, l.weighted) + ' ' + esc(t(l.weighted ? 'kg' : cap(l.unit))))}
          ${kv('Tax %', (rate * 100).toFixed(0) + '%', 'opt')}${kv('Category', p ? esc(N(cat(p.cat))) : '—', 'opt')}${kv('Stock', p ? qtyFmt(r2(p.stock - inCart), p.weighted) : '—', 'opt')}</div>
        <div>${kv('Total amount', money(gross), 'opt')}${kv('Discount', l.discount ? '−' + money(l.discount) : '0.00')}${kv('Sub total', money(r2(net - vat)), 'opt')}${kv('Tax amount', money(vat), 'opt')}${kv('Product total', money(net), 'strong')}</div>
      </div>
      <div class="item-acts">
        <div class="qty"><button data-a="qty" data-i="${ui.sel}" data-d="-1" aria-label="${t('Decrease')}">−</button>
          <input data-in="qty" data-i="${ui.sel}" data-k="qty${ui.sel}" value="${qtyFmt(l.qty, l.weighted)}" inputmode="decimal" aria-label="${t('Quantity')}">
          <button data-a="qty" data-i="${ui.sel}" data-d="1" aria-label="${t('Increase')}">+</button></div>
        ${l.discount ? '' : `<button class="btn sm" data-a="discount" data-i="${ui.sel}">${t('Discount')}</button>`}
        <button class="btn sm danger" data-a="remove" data-i="${ui.sel}">${t('Remove')}</button>
      </div>`;
  }

  // Item panel on the right: the line just scanned (or selected), big enough for the customer to read.
  function itemPanel() {
    const c = calc(ui.cart.lines);
    const l = ui.cart.lines[ui.sel];
    let body;
    if (!l) {
      body = '';
    } else {
      body = itemBody(l);
    }
    return `<section class="pos-item">
      <form class="pos-scan" data-form="scan">
        <label class="nq" title="${t('Quantity for the next scan')}"><span>${t('Qty')}</span><input name="nq" data-in="nextqty" data-k="nextqty" value="${esc(ui.nextQty)}" inputmode="decimal" aria-label="${t('Quantity for the next scan')}"></label>
        <div class="scan">${I.barcode}<input id="scan" name="code" placeholder="${t('Ready to scan')}" autocomplete="off" data-k="scan" aria-label="${t('Barcode')}"><button type="button" class="cam-btn" data-a="camera" title="${t('Scan with camera')}" aria-label="${t('Scan with camera')}">${I.camera}<span>${t('Scan with camera')}</span></button></div>
        <button type="submit" hidden></button>
        <button type="button" class="btn ghost find" data-a="browse">${I.search}<span>${t('Find product')}</span> <kbd>F3</kbd></button>
      </form>
      <div class="item-card">${body}</div>
      <div class="inv-amt num">
        <div class="eyebrow">${t('Invoice amount')}</div>
        <div class="between"><span>${t('Invoice amount (excl. VAT)')}</span><span>${money(c.net)}</span></div>
        ${c.disc ? `<div class="between"><span>${t('Discounts')}</span><span>−${money(c.disc)}</span></div>` : ''}
        <div class="between"><span>${t('Tax amount')}</span><span>${money(c.vat)}</span></div>
      </div>
      <div class="grand num" aria-live="polite">${money(c.total)} <small>${SAR()}</small></div>
    </section>`;
  }

  function viewCheckout() {
    if (ui.sel == null || ui.sel >= ui.cart.lines.length) ui.sel = ui.cart.lines.length - 1;
    setTimeout(() => { const w = $('#btable'), r = w && w.querySelector('tr.on'); if (r) r.scrollIntoView({ block: 'nearest' }); });
    return `<div class="pos">${billTable()}${itemPanel()}</div>`;
  }

  function browseBody(m) {
    const cats = db.categories.map((c) => `<button class="pill ${m.cat === c.id && !m.q ? 'on' : ''}" data-a="browse-cat" data-id="${c.id}">${esc(N(c))}</button>`).join('');
    const list = filteredProducts(m.q, m.cat);
    return `<div class="between"><h3>${t('Find product')}</h3><button class="btn sm" data-a="close">${t('Done')}</button></div>
      <div class="search" style="height:48px">${I.search}<input data-in="browse-q" data-k="browseq" value="${esc(m.q || '')}" placeholder="${t('Name (عربي / English), SKU or barcode')}" autofocus></div>
      <div class="cats">${cats}</div>
      <div class="pgrid">${list.map(productCard).join('') || `<div class="empty">${t('No products match.')}</div>`}</div>
`;
  }

  function creditAvailable(c) {
    const out = db.invoices.filter((i) => i.customerId === c.id && i.outstanding > 0).reduce((s, i) => s + i.outstanding, 0);
    return r2(c.limit - out);
  }
  function outstandingOf(c) { return r2(db.invoices.filter((i) => i.customerId === c.id && i.outstanding > 0).reduce((s, i) => s + i.outstanding, 0)); }

  // ---------------------------------------------------------------- views: payment
  function quickAmounts(total) {
    const s = new Set([total]);
    [5, 10, 50, 100, 200, 500].forEach((m) => { const v = Math.ceil(total / m) * m; if (v > total) s.add(v); });
    return [...s].sort((a, b) => a - b).slice(0, 5);
  }
  function viewPay() {
    const c = calc(ui.cart.lines);
    if (!c.count) { setTimeout(() => go('checkout')); return ''; }
    if (!ui.pay) ui.pay = { method: 'cash', received: '', ref: '', cash: '', card: '' };
    const P = ui.pay, cu = cust(ui.cart.customerId);
    const rec = Number(P.received || 0);
    const methods = [
      ['cash', 'Cash', ''], ['card', 'Card', ''], ['transfer', 'Bank transfer', ''],
      ['credit', 'Sell on credit', cu && cu.credit ? t('{n} · {a} available', { n: N(cu), a: money(creditAvailable(cu)) }) : ''],
      ['split', 'Split payment', 'Cash + card'],
    ].map(([k, label, sub]) => `<button class="method ${P.method === k ? 'on' : ''} ${k === 'credit' && !(cu && cu.credit) ? 'dashed' : ''}" data-a="method" data-m="${k}">
        <b>${t(label)}</b>${sub ? `<small>${t(sub)}</small>` : ''}${P.method === k ? `<span class="tag lime">${t('Selected')}</span>` : ''}</button>`).join('');

    let tender = '', summary = '', canComplete = false, received = 0, change = 0;
    if (P.method === 'cash') {
      received = rec; change = r2(rec - c.total); canComplete = rec >= c.total;
      tender = `<div class="cashgrid"><div><div class="field"><span>${t('Amount received from customer')}</span>
        <div class="inwrap"><input class="input big num" data-in="received" data-k="received" value="${esc(P.received)}" inputmode="decimal" placeholder="0.00"><span class="suffix">${SAR()}</span></div></div>
        <div class="quick">${quickAmounts(c.total).map((v) => `<button class="pill ${rec === v ? 'on' : ''}" data-a="quick" data-v="${v}">${money(v)}</button>`).join('')}</div></div>
        <div class="keypad">${['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', '⌫'].map((k) => `<button data-a="key" data-k2="${k}">${k}</button>`).join('')}</div></div>`;
    } else if (P.method === 'card') {
      received = c.total; canComplete = true;
      tender = '';
    } else if (P.method === 'transfer') {
      received = c.total; canComplete = P.ref.trim().length >= 3;
      tender = `<label class="field"><span>${t('Transfer reference')} <small>(${t('required')})</small></span><input class="input" data-in="ref" data-k="ref" value="${esc(P.ref)}" placeholder="${t('e.g. STC Pay / bank ref')}"></label>`;
    } else if (P.method === 'credit') {
      const ok = cu && cu.credit && creditAvailable(cu) >= c.total;
      canComplete = !!ok; received = 0;
      tender = !cu ? `<button class="btn" data-a="cust-pick">${t('Select customer')}</button>`
        : !cu.credit ? `<div class="note">${I.warn}<span>${t('{n} has no credit account.', { n: esc(N(cu)) })}</span></div>`
          : `<div class="infobox"><b>${esc(N(cu))}</b>${t('Limit {l} · outstanding {o} · available {a} SAR', { l: money(cu.limit), o: money(outstandingOf(cu)), a: money(creditAvailable(cu)) })}</div>
            ${ok ? '' : `<div class="note" style="color:var(--red)">${I.warn}<span>${t('This bill is over the available credit.')}</span></div>`}`;
    } else if (P.method === 'split') {
      const cash = Number(P.cash || 0), card = r2(c.total - cash);
      canComplete = cash > 0 && cash < c.total; received = c.total;
      tender = `<div class="grid2"><label class="field"><span>${t('Cash part')}</span><div class="inwrap"><input class="input big num" data-in="split-cash" data-k="splitcash" value="${esc(P.cash)}" inputmode="decimal" placeholder="0.00"><span class="suffix">${SAR()}</span></div></label>
        <label class="field"><span>${t('Card part')}</span><div class="inwrap"><input class="input big num" value="${money(Math.max(card, 0))}" disabled><span class="suffix">${SAR()}</span></div></label></div>`;
    }
    const remaining = P.method === 'cash' ? Math.max(0, r2(c.total - rec)) : 0;
    summary = `<div class="summary">
      <h3>${t('Payment summary')}</h3>
      <div class="between num"><span>${t('Due')}</span><span>${money(c.total)}</span></div>
      ${P.method === 'cash' ? `<div class="between num"><span>${t('Received · cash')}</span><span>${money(rec)}</span></div><div class="between num"><span>${t('Remaining')}</span><span>${money(remaining)}</span></div>
        <div class="change ${remaining > 0 ? 'short' : ''}"><span>${remaining > 0 ? t('Still to collect') : t('Change for customer')}</span><b class="num">${money(remaining > 0 ? remaining : Math.max(0, change))} <small>${SAR()}</small></b></div>` : ''}
      ${P.method === 'split' ? `<div class="between num"><span>${t('Cash')}</span><span>${money(Number(P.cash || 0))}</span></div><div class="between num"><span>${t('Card')}</span><span>${money(Math.max(0, r2(c.total - Number(P.cash || 0))))}</span></div>` : ''}
      ${P.method === 'credit' ? `<div class="between num"><span>${t('Paid now')}</span><span>0.00</span></div><div class="between num"><span>${t('Added to customer balance')}</span><span>${money(c.total)}</span></div>` : ''}
      <button class="btn primary xl" data-a="complete" ${canComplete ? '' : 'disabled'}>${t('Create invoice')} ${arrow()}</button>
      <button class="btn block" data-a="back-cart">${t('Back')}</button>
    </div>`;
    return `<div class="steps">
        <span class="step done">${I.tick} ${t('1 Customer · {n}', { n: cu ? esc(N(cu)) : t('Walk-in') })}</span>
        <span class="step done">${I.tick} ${t('2 Bill · {n} items', { n: r2(c.items) })}</span>
        <span class="step on">${t('3 Payment')}</span><span class="step">${t('4 Invoice')}</span></div>
      <div class="pay">
        <div>
          <div class="amountdue"><div class="small" style="font-weight:600">${t('Amount due')}</div><div class="v num">${money(c.total)}<small>${SAR()}</small></div>
            <div class="small muted">${t('Incl. VAT {v} SAR', { v: money(c.vat) })}</div></div>
          <div class="methods">${methods}</div>
          <div class="tender">${tender}</div>
        </div>
        ${summary}
      </div>`;
  }
  const termsLabel = (k) => ({ monthly: 'Monthly', net15: 'Net 15 days', net30: 'Net 30 days', none: 'No credit' }[k] || k);

  // ---------------------------------------------------------------- completing a sale
  function completeSale(extra = {}) {
    const c = calc(ui.cart.lines), P = ui.pay, cu = cust(ui.cart.customerId);
    const no = db.settings.nextInvoice++;
    let payments = [], change = 0, status = 'paid', outstanding = 0, due = null;
    if (P.method === 'cash') { payments = [{ method: 'cash', amount: Number(P.received) }]; change = r2(Number(P.received) - c.total); }
    if (P.method === 'card') payments = [{ method: 'card', amount: c.total, ref: extra.auth }];
    if (P.method === 'transfer') payments = [{ method: 'transfer', amount: c.total, ref: P.ref }];
    if (P.method === 'split') payments = [{ method: 'cash', amount: Number(P.cash) }, { method: 'card', amount: r2(c.total - Number(P.cash)), ref: extra.auth }];
    if (P.method === 'credit') {
      status = 'unpaid'; outstanding = c.total;
      const d = new Date(); d.setDate(d.getDate() + (cu.termDays || 30)); due = d.toISOString().slice(0, 10);
    }
    const online = ui.demo.server && ui.demo.internet;
    const invoice = {
      id: 'INV-B1-' + String(no).padStart(6, '0'), no, type: 'sale', date: new Date().toISOString(), customerId: ui.cart.customerId,
      lines: clone(ui.cart.lines), total: c.total, payments, change, status, outstanding, due,
      zatca: online ? 'queued' : 'offline', cashier: user().name, delivery: ui.cart.orderId ? 'delivery' : 'store', orderId: ui.cart.orderId,
      standard: !!(cu && cu.vatNo),
    };
    db.invoices.unshift(invoice);
    invoice.lines.forEach((l) => { const p = prod(l.pid); if (p) p.stock = r2(Math.max(0, p.stock - l.qty)); });
    if (ui.cart.orderId) { const o = db.orders.find((x) => x.id === ui.cart.orderId); if (o) { o.status = 'completed'; o.invoiceId = invoice.id; } }
    audit(`Sale ${invoice.id} · ${money(c.total)} SAR · ${P.method}`);
    ui.cart = { lines: [], customerId: null, orderId: null };
    ui.pay = null; ui.modal = null; renderModal();
    save();
    go('done/' + invoice.id);
  }

  function startCompletion() {
    const P = ui.pay;
    if (P.method === 'card' || P.method === 'split') {
      const amount = P.method === 'card' ? calc(ui.cart.lines).total : r2(calc(ui.cart.lines).total - Number(P.cash));
      openModal({ kind: 'terminal', amount });
      setTimeout(() => {
        if (!ui.modal || ui.modal.kind !== 'terminal') return;
        if (ui.demo.terminal) completeSale({ auth: 'AUTH-' + Math.floor(100000 + Math.random() * 899999) });
        else openModal({ kind: 'terminal-unknown', amount });
      }, 1600);
      return;
    }
    completeSale();
  }

  // ---------------------------------------------------------------- receipt
  function zatcaTLV(inv) {
    const enc = new TextEncoder();
    const fields = [db.settings.shopEn, db.settings.vatNo, inv.date.replace(/\.\d+Z$/, 'Z'), money(inv.total).replace(/,/g, ''), money(invVat(inv)).replace(/,/g, '')];
    const bytes = [];
    fields.forEach((v, i) => { const b = enc.encode(v); bytes.push(i + 1, b.length, ...b); });
    let bin = ''; bytes.forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin);
  }
  function invVat(inv) { return calc(inv.lines).vat; }
  function qrSvg(text) {
    try { const q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 3, margin: 0, scalable: true }); } catch (e) { return '<div class="small muted">[ZATCA QR]</div>'; }
  }
  function receipt(inv) {
    const c = calc(inv.lines), cu = cust(inv.customerId), cn = inv.type === 'credit_note';
    const title = cn ? ['إشعار دائن', 'Credit note'] : inv.standard ? ['فاتورة ضريبية', 'Tax invoice'] : ['فاتورة ضريبية مبسطة', 'Simplified tax invoice'];
    const pay = (inv.payments || []).map((p) => `<div class="tl muted"><span>${esc(payLabel(p.method))}</span><span class="num">${money(p.amount)}</span></div>`).join('');
    return `<div class="receipt" dir="ltr">
      <div class="c"><div class="ar" style="font-weight:700;font-size:15px">${title[0]}</div><div style="font-weight:600">${title[1]}</div>
        <div class="ar" style="margin-top:8px;font-weight:600">${esc(db.settings.shopAr)}</div><div>${esc(db.settings.shopEn)} · ${esc(db.settings.address)}</div></div>
      <hr><div class="kv small"><span>VAT no.</span><span class="num">${esc(db.settings.vatNo)}</span><span>الرقم الضريبي</span>
        <span>${cn ? 'Note' : 'Invoice'}</span><span>${inv.id}</span><span>${cn ? 'رقم الإشعار' : 'رقم الفاتورة'}</span>
        <span>Date</span><span class="num">${fmtDT(inv.date)}</span><span>التاريخ</span>
        ${cn ? `<span>Ref.</span><span>${inv.ref}</span><span>الفاتورة الأصلية</span>` : ''}
        ${cu ? `<span>Customer</span><span>${esc(cu.en)}</span><span>العميل</span>` : ''}
        ${cu && cu.vatNo ? `<span>Cust. VAT</span><span>${esc(cu.vatNo)}</span><span>ضريبي العميل</span>` : ''}</div>
      <hr>${inv.lines.map((l) => `<div class="ln"><span class="ar">${esc(l.ar)}${l.discount ? ` (خصم ${money(l.discount)})` : ''}</span><span class="amt num">${money(lineTotal(l))}</span>
        <span class="en">${esc(l.en)} · ${qtyFmt(l.qty, l.weighted)} × ${money(l.price)}${l.discount ? ` · disc. −${money(l.discount)}` : ''}${l.vat !== 'standard' ? ` · ${l.vat === 'zero' ? '0%' : 'exempt'}` : ''}</span></div>`).join('')}
      <hr><div class="tl"><span>Total excl. VAT · <span class="ar">الإجمالي غير شامل الضريبة</span></span><span class="num">${money(c.net)}</span></div>
      <div class="tl"><span>VAT 15% · <span class="ar">ضريبة القيمة المضافة</span></span><span class="num">${money(c.vat)}</span></div>
      <div class="tl big"><span>Total incl. VAT · <span class="ar">الإجمالي</span></span><span class="num">${money(c.total)} SAR</span></div>
      ${pay}${inv.change > 0 ? `<div class="tl muted"><span>Change · <span class="ar">الباقي</span></span><span class="num">${money(inv.change)}</span></div>` : ''}
      ${inv.status === 'unpaid' || inv.status === 'partial' ? `<div class="tl muted"><span>Due date · <span class="ar">تاريخ الاستحقاق</span></span><span>${inv.due}</span></div>` : ''}
      <div class="qr">${qrSvg(zatcaTLV(inv))}</div>
      <div class="c small muted" style="margin-top:8px">${t('Cashier')}: ${esc(inv.cashier || '-')} · شكراً لزيارتكم</div>
    </div>`;
  }
  const payLabel = (m) => ({ cash: 'Cash · نقداً', card: 'Card · بطاقة', transfer: 'Bank transfer · تحويل', credit: 'Credit · آجل', balance: 'Account balance · رصيد' }[m] || m);

  function printDoc(inv) {
    if (!ui.demo.printer) return openModal({ kind: 'printer', invId: inv.id });
    $('#print-area').innerHTML = receipt(inv);
    setTimeout(() => window.print(), 50);
  }

  // ---------------------------------------------------------------- views: sale complete
  function viewDone(id) {
    const inv = db.invoices.find((i) => i.id === id);
    if (!inv) return `<div class="empty">${t('Invoice not found.')}</div>`;
    const cash = inv.payments.find((p) => p.method === 'cash');
    const payDesc = inv.status === 'unpaid' ? t('Credit · due {d}', { d: inv.due }) : inv.payments.map((p) => `${t(cap(p.method === 'transfer' ? 'Transfer' : p.method))} ${money(p.amount)}`).join(' + ') + (inv.change > 0 ? ' · ' + t('change {c}', { c: money(inv.change) }) : '');
    return `<div class="done-grid">
      <div>
        <div class="row" style="gap:16px;align-items:center"><div class="check">${I.check}</div><div><div class="eyebrow">${t('Sale complete')}</div><div class="inv-no">${inv.id}</div></div></div>
        <p style="font-size:18px;line-height:1.5;color:var(--muted);margin:22px 0 0">${inv.change > 0 ? t('Change due to customer:') + ` <b style="color:var(--green)">${money(inv.change)} SAR</b>` : ''}</p>
        <div class="status3">
          <div class="card"><span class="k">${t('PAYMENT')}</span><span class="tag ${inv.status === 'paid' ? 'lime' : 'amber'}">${t(inv.status === 'paid' ? 'Paid' : 'Unpaid')}</span><p>${payDesc}</p></div>
          <div class="card"><span class="k">${t('DELIVERY')}</span><span class="tag">${t(inv.delivery === 'delivery' ? 'Out for delivery' : 'Collected in store')}</span>${inv.delivery === 'delivery' ? `<p>${t('Linked to order {o}', { o: inv.orderId || '' })}</p>` : ''}</div>
          <div class="card"><span class="k">ZATCA</span><span class="tag amber">${t(inv.zatca === 'offline' ? 'Saved offline' : 'Queued for reporting')}</span></div>
        </div>
        <div class="actions3">
          <button class="btn" data-a="print" data-id="${inv.id}" style="height:56px">${I.print}${t('Print receipt')}</button>
          <button class="btn" data-a="send" data-id="${inv.id}" style="height:56px">${I.send}${t('Send copy')}</button>
          <a class="btn ghost" href="#/invoice/${inv.id}" style="height:56px;text-decoration:none">${t('View invoice')}</a>
        </div>
        <button class="btn primary" data-a="new-sale" style="height:56px;min-width:246px">${t('New sale')} ${arrow()}</button>
        ${cash ? '' : ''}
      </div>
      <div class="preview"><div class="eyebrow" style="margin-bottom:12px">${t('Preview · 80 mm · bilingual')}</div>${receipt(inv)}</div>
    </div>`;
  }

  // ---------------------------------------------------------------- views: orders
  const ORDER_ST = { new: ['New', 'lime'], preparing: ['Preparing', 'amber'], ready: ['Ready', 'green'], completed: ['Completed', 'outline'] };
  function viewOrders() {
    const rows = db.orders.slice().sort((a, b) => (a.status === 'completed') - (b.status === 'completed')).map((o) => {
      const st = ORDER_ST[o.status];
      return `<div class="order-row"><b class="num">${o.id}</b><span class="tag ${st[1]}">${t(st[0])}</span><span class="spacer"></span>
        <b class="num">${money(calc(o.lines).total)} SAR</b><button class="btn sm" data-a="order-view" data-id="${o.id}">${t('View details')}</button></div>`;
    }).join('');
    return `<div class="page-h"><div><h1>${t('Orders')}</h1></div></div><div class="order-list">${rows}</div>`;
  }
  function orderBody(m) {
    const o = db.orders.find((x) => x.id === m.id); if (!o) return '';
    const c = calc(o.lines), cu = cust(o.customerId), st = ORDER_ST[o.status];
    const next = { new: ['prep', 'Prepare'], preparing: ['ready', 'Ready'] }[o.status];
    const lines = o.lines.map((l) => `<tr><td>${esc(N(l))}</td><td class="r num">${qtyFmt(l.qty, l.weighted)}</td><td class="r num"><b>${money(lineTotal(l))}</b></td></tr>`).join('');
    return `<div class="between"><h3>${o.id}</h3><span class="tag ${st[1]}">${t(st[0])}</span></div>
      <div class="small muted">${cu ? esc(N(cu)) : t('Walk-in')} · ${t(o.type === 'delivery' ? 'Delivery' : 'Pick-up')}${o.address ? ' · ' + esc(o.address) : ''}</div>
      <table class="tbl"><thead><tr><th>${t('Product')}</th><th class="r">${t('Qty')}</th><th class="r">${t('Total')}</th></tr></thead><tbody>${lines}</tbody></table>
      <div class="between"><b>${t('Total')}</b><b class="num" style="font-size:20px">${money(c.total)} SAR</b></div>
      <div class="btns" style="grid-template-columns:repeat(auto-fit,minmax(90px,1fr))">${o.status === 'completed' ? `<a class="btn ghost" href="#/invoice/${o.invoiceId}" data-a="close" style="text-decoration:none">${t('View invoice')}</a>` : `
        ${next ? `<button class="btn" data-a="order-step" data-id="${o.id}" data-s="${next[0]}">${t(next[1])}</button>` : ''}
        <button class="btn primary" data-a="order-load" data-id="${o.id}">${t('Checkout')}</button>`}
        <button class="btn ghost" data-a="close">${t('Close')}</button></div>`;
  }


  // ---------------------------------------------------------------- views: invoices
  function invStatusTag(i) {
    if (i.type === 'credit_note') return `<span class="tag outline">${t('Credit note')}</span>`;
    const m = { paid: ['Paid', 'lime'], unpaid: ['Unpaid', 'amber'], partial: ['Part paid', 'amber'], returned: ['Returned', 'outline'] }[i.status] || [i.status, ''];
    return `<span class="tag ${m[1]}">${t(m[0])}</span>`;
  }
  function zTag(z) { return `<span class="tag ${z === 'reported' ? '' : 'amber'}">${t({ reported: 'Reported', queued: 'Queued', offline: 'Offline' }[z] || z)}</span>`; }
  function viewInvoices() {
    const q = ui.invQ.trim().toLowerCase();
    const list = db.invoices.filter((i) => {
      if (ui.invFilter === 'today' && !isToday(i.date)) return false;
      if (ui.invFilter === 'unpaid' && !(i.outstanding > 0)) return false;
      if (ui.invFilter === 'cn' && i.type !== 'credit_note') return false;
      if (q) { const cu = cust(i.customerId); return i.id.toLowerCase().includes(q) || (cu && (cu.en.toLowerCase().includes(q) || cu.ar.includes(q))); }
      return true;
    });
    const tabs = [['all', 'All'], ['today', 'Today'], ['unpaid', 'Unpaid'], ['cn', 'Credit notes']].map(([k, l]) => `<button class="pill ${ui.invFilter === k ? 'on' : ''}" data-a="inv-filter" data-f="${k}">${t(l)}</button>`).join('');
    return `<div class="page-h"><div><h1>${t('Invoices')}</h1></div></div>
      <div class="between" style="margin-bottom:14px;flex-wrap:wrap"><div class="tabs" style="margin:0">${tabs}</div>
        <div class="search" style="height:44px;width:320px;max-width:100%">${I.search}<input data-in="invq" data-k="invq" value="${esc(ui.invQ)}" placeholder="${t('Invoice no. or customer')}"></div></div>
      <div class="tblwrap"><table class="tbl"><thead><tr><th>${t('Invoice')}</th><th>${t('Date')}</th><th>${t('Customer')}</th><th>${t('Payment')}</th><th class="r">${t('Total')}</th><th class="r">${t('Outstanding')}</th><th>ZATCA</th></tr></thead>
      <tbody>${list.map((i) => { const cu = cust(i.customerId); return `<tr class="click" data-a="open-inv" data-id="${i.id}"><td><a href="#/invoice/${i.id}">${i.id}</a></td><td class="num">${fmtDate(i.date)} ${fmtTime(i.date)}</td><td>${cu ? esc(N(cu)) : `<span class="muted">${t('Walk-in')}</span>`}</td><td>${invStatusTag(i)}</td><td class="r num">${i.type === 'credit_note' ? '−' : ''}${money(i.total)}</td><td class="r num">${i.outstanding > 0 ? money(i.outstanding) : '—'}</td><td>${zTag(i.zatca)}</td></tr>`; }).join('') || `<tr><td colspan="7" class="empty">${t('No invoices match.')}</td></tr>`}</tbody></table></div>`;
  }
  function viewInvoice(id) {
    const inv = db.invoices.find((i) => i.id === id);
    if (!inv) return `<div class="empty">${t('Invoice not found.')}</div>`;
    const cu = cust(inv.customerId);
    const cns = db.invoices.filter((x) => x.type === 'credit_note' && x.ref === inv.id);
    return `<div class="crumbs"><a href="#/invoices">${t('Invoices')}</a> / ${inv.id}</div>
      <div class="page-h"><div><h1>${inv.id}</h1><div class="sub">${fmtDate(inv.date)} ${fmtTime(inv.date)} · ${cu ? esc(N(cu)) : t('Walk-in customer')} · ${t('Cashier')} ${esc(inv.cashier || '-')}</div></div>
        <div class="row" style="flex-wrap:wrap"><button class="btn sm" data-a="print" data-id="${inv.id}">${I.print}${t('Print')}</button><button class="btn sm" data-a="send" data-id="${inv.id}">${I.send}${t('Send')}</button>
        ${inv.type === 'sale' ? `<button class="btn sm primary" data-a="start-return" data-id="${inv.id}">${t('Return')}</button>` : ''}</div></div>
      <div class="done-grid">
        <div style="display:flex;flex-direction:column;gap:14px">
          <div class="stats" style="grid-template-columns:repeat(3,1fr);margin:0">
            <div class="stat"><div class="k">${t('Total')}</div><div class="v num">${money(inv.total)}</div><div class="d">${t('VAT {v} included', { v: money(invVat(inv)) })}</div></div>
            <div class="stat"><div class="k">${t('Payment')}</div><div class="v" style="font-size:22px">${invStatusTag(inv)}</div><div class="d">${inv.outstanding > 0 ? t('{o} outstanding · due {d}', { o: money(inv.outstanding), d: inv.due }) : (inv.payments || []).map((p) => payLabel(p.method).split(' · ')[isAr() ? 1 : 0]).join(' + ')}</div></div>
            <div class="stat"><div class="k">ZATCA</div><div class="v" style="font-size:22px">${zTag(inv.zatca)}</div><div class="d">${t(inv.standard ? 'Standard (B2B) invoice' : 'Simplified (B2C) invoice')}</div></div>
          </div>
          ${inv.type === 'credit_note' ? `<div class="note">${I.info}<span>${t('Credit note for {r}. Reason: {why}', { r: `<a href="#/invoice/${inv.ref}">${inv.ref}</a>`, why: esc(t(inv.reason || '')) })}</span></div>` : ''}
          ${cns.length ? `<div class="note">${I.info}<span>${t('Linked credit notes:')} ${cns.map((x) => `<a href="#/invoice/${x.id}">${x.id}</a> (−${money(x.total)})`).join(', ')}</span></div>` : ''}
          <div class="tblwrap"><table class="tbl"><thead><tr><th>${t('Item')}</th><th class="r">${t('Qty')}</th><th class="r">${t('Price')}</th><th class="r">${t('Discount')}</th><th class="r">${t('Total')}</th></tr></thead>
            <tbody>${inv.lines.map((l) => `<tr><td>${esc(N(l))}<div class="small muted">${esc(N2(l))}</div></td><td class="r num">${qtyFmt(l.qty, l.weighted)}</td><td class="r num">${money(l.price)}</td><td class="r num">${l.discount ? '−' + money(l.discount) : '—'}</td><td class="r num"><b>${money(lineTotal(l))}</b></td></tr>`).join('')}</tbody></table></div>
        </div>
        <div class="preview"><div class="eyebrow" style="margin-bottom:12px">${t('Preview · 80 mm · bilingual')}</div>${receipt(inv)}</div>
      </div>`;
  }

  // ---------------------------------------------------------------- views: returns
  function viewReturns() {
    const R = ui.ret;
    if (!R) {
      const recent = db.invoices.filter((i) => i.type === 'sale').slice(0, 8);
      return `<div class="page-h"><div><h1>${t('Returns')}</h1></div></div>
        <form class="search" data-form="find-inv" style="max-width:520px;margin-bottom:18px">${I.search}<input name="no" placeholder="${t('Invoice number')}" data-k="retq"><button class="btn sm primary" type="submit">${t('Find')}</button></form>
        <div class="eyebrow" style="margin-bottom:10px">${t('Recent invoices')}</div>
        <div class="list" style="max-height:none;max-width:720px">${recent.map((i) => `<button data-a="start-return" data-id="${i.id}"><span><b>${i.id}</b> <span class="muted small">· ${fmtDate(i.date)} · ${cust(i.customerId) ? esc(N(cust(i.customerId))) : t('Walk-in')}</span></span><b class="num">${money(i.total)}</b></button>`).join('')}</div>`;
    }
    const inv = db.invoices.find((i) => i.id === R.invId);
    const returnedBefore = (idx) => db.invoices.filter((x) => x.type === 'credit_note' && x.ref === inv.id).reduce((s, x) => s + x.lines.filter((l) => l.srcIdx === idx).reduce((a, l) => a + l.qty, 0), 0);
    const sel = inv.lines.map((l, i) => { const max = r2(l.qty - returnedBefore(i)); const q = Math.min(Number(R.qty[i] || 0), max); return { l, i, max, q }; });
    const refund = r2(sel.reduce((s, x) => s + (x.q / x.l.qty) * lineTotal(x.l), 0));
    const isCredit = inv.outstanding > 0;
    return `<div class="crumbs"><a href="#/returns" data-a="ret-cancel">${t('Returns')}</a> / ${inv.id}</div>
      <div class="page-h"><div><h1>${t('Return from {i}', { i: inv.id })}</h1><div class="sub">${fmtDate(inv.date)} · ${cust(inv.customerId) ? esc(N(cust(inv.customerId))) : t('Walk-in customer')} · ${money(inv.total)} SAR</div></div></div>
      <div class="cust-grid">
        <div class="tblwrap"><table class="tbl"><thead><tr><th>${t('Item')}</th><th class="r">${t('Sold')}</th><th class="r">${t('Can return')}</th><th>${t('Return qty')}</th><th class="r">${t('Refund')}</th></tr></thead>
          <tbody>${sel.map((x) => `<tr><td>${esc(N(x.l))}<div class="small muted">${money(x.l.price)} ${x.l.discount ? '· −' + money(x.l.discount) : ''}</div></td><td class="r num">${qtyFmt(x.l.qty, x.l.weighted)}</td><td class="r num">${qtyFmt(x.max, x.l.weighted)}</td>
            <td><div class="qty" style="width:120px"><button data-a="ret-qty" data-i="${x.i}" data-d="-1">−</button><input data-in="ret-qty" data-i="${x.i}" data-k="rq${x.i}" value="${x.q}" ${x.max <= 0 ? 'disabled' : ''}><button data-a="ret-qty" data-i="${x.i}" data-d="1" ${x.q >= x.max ? 'disabled' : ''}>+</button></div></td>
            <td class="r num">${money((x.q / x.l.qty) * lineTotal(x.l))}</td></tr>`).join('')}</tbody></table></div>
        <div class="panel" style="display:flex;flex-direction:column;gap:14px">
          <h3 style="font-size:20px">${t('Credit note')}</h3>
          <label class="field"><span>${t('Reason')}</span><select class="input" data-in="ret-reason" data-k="rreason">${['Damaged or expired', 'Wrong item', 'Customer changed mind', 'Price correction'].map((r) => `<option ${R.reason === r ? 'selected' : ''} value="${r}">${t(r)}</option>`).join('')}</select></label>
          <div class="field"><span>${t('Refund to')}</span><div class="row" style="flex-wrap:wrap">${(isCredit ? [['balance', 'Reduce account balance']] : [['cash', 'Cash'], ['card', 'Back to card']]).map(([k, l]) => `<button class="pill outline ${R.method === k ? 'on' : ''}" data-a="ret-method" data-m="${k}">${t(l)}</button>`).join('')}</div></div>
          <div class="newbal"><span>${t('Refund total')}</span><b class="num">${money(refund)} SAR</b></div>
          <button class="btn primary xl" data-a="issue-cn" ${refund > 0 ? '' : 'disabled'}>${t('Refund')} ${arrow()}</button>
          <button class="btn block" data-a="ret-cancel">${t('Cancel')}</button>
        </div>
      </div>`;
  }
  function issueCreditNote() {
    const R = ui.ret, inv = db.invoices.find((i) => i.id === R.invId);
    const lines = [];
    inv.lines.forEach((l, i) => {
      const q = Number(R.qty[i] || 0); if (!q) return;
      const share = q / l.qty;
      lines.push(Object.assign(clone(l), { qty: q, discount: r2((l.discount || 0) * share), srcIdx: i }));
    });
    const total = calc(lines).total;
    const no = db.settings.nextCN++;
    const cn = { id: 'CN-B1-' + String(no).padStart(6, '0'), no, type: 'credit_note', ref: inv.id, reason: R.reason, date: new Date().toISOString(), customerId: inv.customerId, lines, total,
      payments: [{ method: R.method, amount: total }], change: 0, status: 'paid', outstanding: 0, zatca: ui.demo.server && ui.demo.internet ? 'queued' : 'offline', cashier: user().name };
    db.invoices.unshift(cn);
    lines.forEach((l) => { const p = prod(l.pid); if (p) p.stock = r2(p.stock + l.qty); });
    if (R.method === 'balance') { inv.outstanding = r2(Math.max(0, inv.outstanding - total)); if (inv.outstanding === 0) inv.status = 'paid'; }
    audit(`Credit note ${cn.id} for ${inv.id} · ${money(total)} SAR`);
    ui.ret = null; save();
    toast(t('Credit note {c} issued · {a} SAR', { c: `<b>${cn.id}</b>`, a: money(total) }));
    go('invoice/' + cn.id);
  }

  // ---------------------------------------------------------------- views: customers
  function viewCustomers() {
    const q = ui.custQ.trim().toLowerCase();
    const list = db.customers.filter((c) => !q || c.en.toLowerCase().includes(q) || c.ar.includes(q) || c.phone.replace(/\s/g, '').includes(q.replace(/\s/g, '')));
    return `<div class="page-h"><div><h1>${t(isMgr() ? 'Customers & Credit' : 'Customers')}</h1></div>
      <button class="btn primary" data-a="new-cust">${t('New customer')}</button></div>
      <div class="search" style="height:44px;max-width:420px;margin-bottom:14px">${I.search}<input data-in="custq" data-k="custq" value="${esc(ui.custQ)}" placeholder="${t('Name or phone')}"></div>
      <div class="tblwrap"><table class="tbl"><thead><tr><th>${t('Customer')}</th><th>${t('Phone')}</th><th>${t('Terms')}</th><th class="r">${t('Credit limit')}</th><th class="r">${t('Outstanding')}</th><th>${t('Oldest unpaid')}</th></tr></thead>
      <tbody>${list.map((c) => { const o = outstandingOf(c); const old = oldestUnpaid(c); return `<tr class="click" data-a="open-cust" data-id="${c.id}"><td><b>${esc(N(c))}</b><div class="small muted">${esc(N2(c))}</div></td><td class="num">${esc(c.phone)}</td><td>${t(termsLabel(c.terms))}</td><td class="r num">${c.credit ? money(c.limit) : '—'}</td><td class="r num">${o ? `<b>${money(o)}</b>` : '—'}</td><td>${old ? `<span class="${old.overdue ? 'tag amber' : 'muted'}">${t('{d} days', { d: old.days })}</span>` : '—'}</td></tr>`; }).join('')}</tbody></table></div>`;
  }
  function oldestUnpaid(c) {
    const u = db.invoices.filter((i) => i.customerId === c.id && i.outstanding > 0).sort((a, b) => new Date(a.date) - new Date(b.date))[0];
    if (!u) return null;
    return { inv: u, days: daysBetween(u.date, new Date()), overdue: u.due && u.due < todayISO() };
  }
  function allocate(c, amount, manual) {
    const open = db.invoices.filter((i) => i.customerId === c.id && i.outstanding > 0).sort((a, b) => new Date(a.date) - new Date(b.date));
    let left = amount; const out = [];
    open.forEach((i) => {
      let a = manual ? Math.min(Number(manual[i.id] || 0), i.outstanding) : Math.min(left, i.outstanding);
      a = r2(Math.max(0, a)); left = r2(left - a);
      if (a > 0) out.push({ id: i.id, amount: a, left: r2(i.outstanding - a) });
    });
    return { lines: out, unallocated: manual ? r2(amount - out.reduce((s, x) => s + x.amount, 0)) : left };
  }
  function viewCustomer(id) {
    const c = cust(id); if (!c) return `<div class="empty">${t('Customer not found.')}</div>`;
    if (!ui.payForm || ui.payForm.cid !== id) ui.payForm = { cid: id, amount: '', method: 'cash', ref: '', date: todayISO(), manual: null };
    const F = ui.payForm, o = outstandingOf(c), old = oldestUnpaid(c);
    const unpaid = db.invoices.filter((i) => i.customerId === c.id && i.outstanding > 0).sort((a, b) => new Date(a.date) - new Date(b.date));
    const amt = Math.min(Number(F.amount || 0), o);
    const al = allocate(c, amt, F.manual);
    const allocated = r2(al.lines.reduce((s, x) => s + x.amount, 0));
    const tabs = [['unpaid', 'Unpaid invoices'], ['payments', 'Payments'], ['history', 'All history']].map(([k, l]) => `<button class="pill ${ui.custTab === k ? 'on' : ''}" data-a="cust-tab" data-t="${k}">${t(l)}</button>`).join('');
    let table = '';
    if (ui.custTab === 'unpaid') {
      table = `<div class="tblwrap"><table class="tbl"><thead><tr><th>${t('Invoice')}</th><th>${t('Issued')}</th><th>${t('Due')}</th><th class="r">${t('Outstanding')}</th><th>${t('Payment')}</th><th>ZATCA</th></tr></thead><tbody>
        ${unpaid.map((i) => `<tr><td><a href="#/invoice/${i.id}">${i.id}</a></td><td>${fmtDate(i.date)}</td><td>${i.due < todayISO() ? `<b style="color:var(--amber)">${fmtDay(i.due)} · ${t('overdue')}</b>` : fmtDay(i.due)}</td><td class="r num">${money(i.outstanding)}</td><td>${invStatusTag(i)}</td><td>${zTag(i.zatca)}</td></tr>`).join('') || `<tr><td colspan="6" class="empty">${t('Nothing outstanding.')}</td></tr>`}</tbody></table></div>`;
    } else if (ui.custTab === 'payments') {
      const ps = db.payments.filter((p) => p.customerId === c.id);
      table = `<div class="tblwrap"><table class="tbl"><thead><tr><th>${t('Receipt')}</th><th>${t('Date')}</th><th>${t('Method')}</th><th>${t('Allocated to')}</th><th class="r">${t('Amount')}</th></tr></thead><tbody>
        ${ps.map((p) => `<tr><td>${p.id}</td><td>${fmtDate(p.at)}</td><td>${t(cap(p.method === 'transfer' ? 'Bank transfer' : p.method))}${p.ref ? ' · ' + esc(p.ref) : ''}</td><td class="small">${p.alloc.map((a) => `${a.id} (${money(a.amount)})`).join(', ') || '—'}</td><td class="r num"><b>${money(p.amount)}</b></td></tr>`).join('') || `<tr><td colspan="5" class="empty">${t('No payments yet.')}</td></tr>`}</tbody></table></div>`;
    } else {
      const inv = db.invoices.filter((i) => i.customerId === c.id).map((i) => ({ at: i.date, html: `<td>${i.type === 'credit_note' ? t('Credit note') : t('Invoice')} <a href="#/invoice/${i.id}">${i.id}</a></td><td class="r num">${i.type === 'credit_note' ? '−' : '+'}${money(i.total)}</td>` }));
      const ps = db.payments.filter((p) => p.customerId === c.id).map((p) => ({ at: p.at, html: `<td>${t('Payment')} ${p.id}</td><td class="r num">−${money(p.amount)}</td>` }));
      table = `<div class="tblwrap"><table class="tbl"><thead><tr><th>${t('Date')}</th><th>${t('Entry')}</th><th class="r">${t('Amount')}</th></tr></thead><tbody>${inv.concat(ps).sort((a, b) => new Date(b.at) - new Date(a.at)).map((x) => `<tr><td>${fmtDate(x.at)}</td>${x.html}</tr>`).join('')}</tbody></table></div>`;
    }
    const methodPills = [['cash', 'Cash'], ['card', 'Card'], ['transfer', 'Bank transfer']].map(([k, l]) => `<button class="pill outline ${F.method === k ? 'on' : ''}" data-a="pf-method" data-m="${k}">${t(l)}</button>`).join('');
    const allocHtml = F.manual
      ? unpaid.map((i) => `<div class="between"><span>${i.id} <span class="muted small">(${money(i.outstanding)})</span></span><input class="input num" style="height:36px;width:120px" data-in="alloc" data-id="${i.id}" data-k="al${i.id}" value="${esc(F.manual[i.id] || '')}" placeholder="0.00"></div>`).join('')
        + (Math.abs(al.unallocated) > 0.001 ? `<div class="small" style="color:var(--red)">${t('{a} SAR not allocated yet', { a: money(al.unallocated) })}</div>` : '')
      : al.lines.map((x) => `<div class="between"><span>${x.id}</span><span class="num">${money(x.amount)} · ${x.left > 0 ? t('{l} left', { l: money(x.left) }) : t('settled')}</span></div>`).join('');
    const valid = amt > 0 && (!F.manual || Math.abs(al.unallocated) < 0.001) && (F.method === 'cash' || F.ref.trim() || F.method === 'card');
    return `<div class="crumbs"><a href="#/customers">${t('Customers')}</a> / ${t('Account')}</div>
      <div class="page-h"><div><h1>${esc(N(c))} <span class="ar" style="font-size:26px;font-weight:500;color:var(--muted)">${esc(N2(c))}</span></h1>
        <div class="sub">${esc(c.phone)} · ${t(c.lang === 'ar' ? 'Prefers Arabic' : 'Prefers English')} · ${t('Reminders by {r}', { r: c.reminders })}${c.vatNo ? ' · VAT ' + esc(c.vatNo) : ''}</div></div>
        <div class="row" style="flex-wrap:wrap">${isMgr() ? `<button class="btn ghost" data-a="credit-settings" data-id="${c.id}">${t('Credit settings')}</button>` : ''}<button class="btn" data-a="statement" data-id="${c.id}">${t('Statement · {m}', { m: new Date().toLocaleDateString(locale(), { month: 'long' }) })}</button>
        <button class="btn primary" data-a="sell-to" data-id="${c.id}">${t('New sale')}</button></div></div>
      <div class="stats">
        <div class="stat dark"><div class="k">${t('Outstanding')}</div><div class="v num">${money(o)}</div><div class="d">${t('{n} unpaid invoices', { n: unpaid.length })}</div></div>
        <div class="stat"><div class="k">${t('Credit limit')}</div><div class="v num">${c.credit ? money(c.limit) : '—'}</div><div class="d">${c.credit ? t('{a} available', { a: money(creditAvailable(c)) }) : t('No credit account')}</div></div>
        <div class="stat"><div class="k">${t('Terms')}</div><div class="v" style="font-size:24px">${t(termsLabel(c.terms))}</div><div class="d">${c.reminderDay ? t('Reminder on the {d}th · shop default', { d: c.reminderDay }) : t('No automatic reminder')}</div></div>
        <div class="stat"><div class="k">${t('Oldest unpaid')}</div><div class="v" style="font-size:24px">${old ? t('{d} days', { d: old.days }) : '—'}</div><div class="d" style="${old && old.overdue ? 'color:var(--amber);font-weight:600' : ''}">${old ? (old.overdue ? t('Past due since {d}', { d: fmtDay(old.inv.due) }) : t('Due {d}', { d: fmtDay(old.inv.due) })) : t('All settled')}</div></div>
      </div>
      <div class="cust-grid">
        <div><div class="tabs">${tabs}</div>${table}</div>
        <div class="panel" style="display:flex;flex-direction:column;gap:12px">
          <h3 style="font-size:22px">${t('Record payment')}</h3>
          <label class="field"><span>${t('Amount received')}</span><div class="inwrap"><input class="input big num" data-in="pf-amount" data-k="pfamount" value="${esc(F.amount)}" inputmode="decimal" placeholder="0.00" ${o ? '' : 'disabled'}><span class="suffix">${SAR()}</span></div>
            ${Number(F.amount) > o ? `<small style="color:var(--amber)">${t('Capped at {o}', { o: money(o) })}</small>` : ''}</label>
          <div class="row" style="flex-wrap:wrap">${methodPills}</div>
          <div class="grid2"><label class="field"><span>${t('Reference')}</span><input class="input" data-in="pf-ref" data-k="pfref" value="${esc(F.ref)}" placeholder="${t(F.method === 'transfer' ? 'Required' : 'Optional')}"></label>
            <label class="field"><span>${t('Date')}</span><input class="input" type="date" data-in="pf-date" data-k="pfdate" value="${F.date}"></label></div>
          <div class="alloc"><div class="eyebrow" style="color:var(--muted)">${t(F.manual ? 'Allocation · manual' : 'Allocation · oldest first')}</div>${allocHtml}
            <button class="linkbtn" style="align-self:flex-start;font-size:13px" data-a="alloc-toggle">${t(F.manual ? 'Allocate oldest first' : 'Allocate manually')}</button></div>
          <div class="newbal"><span>${t('New balance')}</span><b class="num">${money(o)} ${isAr() ? '←' : '→'} ${money(r2(o - allocated))}</b></div>
          <button class="btn primary xl" data-a="record-pay" ${valid ? '' : 'disabled'}>${t('Record')} ${arrow()}</button>
        </div>
      </div>`;
  }
  function recordPayment() {
    const F = ui.payForm, c = cust(F.cid), o = outstandingOf(c);
    const amt = Math.min(Number(F.amount || 0), o);
    const al = allocate(c, amt, F.manual);
    al.lines.forEach((x) => { const i = db.invoices.find((v) => v.id === x.id); i.outstanding = x.left; i.status = x.left > 0 ? 'partial' : 'paid'; i.payments.push({ method: F.method, amount: x.amount }); });
    const id = 'PAY-' + String(db.settings.nextPay++).padStart(4, '0');
    db.payments.unshift({ id, at: new Date(F.date + 'T' + new Date().toTimeString().slice(0, 8)).toISOString(), customerId: c.id, amount: amt, method: F.method, ref: F.ref, alloc: al.lines.map((x) => ({ id: x.id, amount: x.amount })) });
    audit(`Payment ${id} from ${c.en} · ${money(amt)} SAR`);
    ui.payForm = null; save();
    toast(t('Payment {p} recorded · {a} SAR', { p: `<b>${id}</b>`, a: money(amt) }));
    render();
  }

  // ---------------------------------------------------------------- views: products
  function viewProducts() {
    const q = ui.prodQ.trim().toLowerCase();
    const list = db.products.filter((p) => (ui.prodCat === 'all' || p.cat === ui.prodCat) && (!q || p.en.toLowerCase().includes(q) || p.ar.includes(q) || p.sku.toLowerCase().includes(q) || p.packs.some((k) => k.barcode.includes(q))));
    return `<div class="page-h"><div><h1>${t('Products')}</h1><div class="sub">${t('{n} products', { n: db.products.length })}</div></div>
      <div class="row"><a class="btn ghost" href="#/barcodes" style="text-decoration:none">${t('Test barcodes')}</a><a class="btn primary" href="#/product/new" style="text-decoration:none">${t('Add product')}</a></div></div>
      <div class="between" style="margin-bottom:14px;flex-wrap:wrap"><div class="tabs" style="margin:0"><button class="pill ${ui.prodCat === 'all' ? 'on' : ''}" data-a="prod-cat" data-id="all">${t('All')}</button>${db.categories.filter((c) => c.id !== 'fav').map((c) => `<button class="pill ${ui.prodCat === c.id ? 'on' : ''}" data-a="prod-cat" data-id="${c.id}">${esc(N(c))}</button>`).join('')}</div>
        <div class="search" style="height:44px;width:300px;max-width:100%">${I.search}<input data-in="prodq" data-k="prodq" value="${esc(ui.prodQ)}" placeholder="${t('Name, SKU or barcode')}"></div></div>
      <div class="tblwrap"><table class="tbl"><thead><tr><th>${t('Product')}</th><th>SKU</th><th>${t('Category')}</th><th>${t('VAT')}</th><th class="r">${t('Price')}</th><th class="r">${t('Stock')}</th><th>${t('Status')}</th></tr></thead>
      <tbody>${list.map((p) => `<tr class="click" data-a="open-prod" data-id="${p.id}"><td><b>${esc(N(p))}</b><div class="small muted">${esc(N2(p))}</div></td><td class="small">${esc(p.sku)}</td><td>${esc(N(cat(p.cat)))}</td><td>${t(vatLabel(p.vat))}</td><td class="r num">${money(p.price)}${p.weighted ? ' /kg' : ''}</td><td class="r num">${qtyFmt(p.stock, p.weighted)}</td><td>${!p.active ? `<span class="tag outline">${t('Draft')}</span>` : p.stock <= 0 ? `<span class="tag red">${t('Out of stock')}</span>` : p.stock <= p.reorder ? `<span class="tag amber">${t('Reorder')}</span>` : `<span class="tag">${t('Active')}</span>`}</td></tr>`).join('')}</tbody></table></div>`;
  }
  const vatLabel = (v) => ({ standard: 'Standard 15%', zero: 'Zero rated 0%', exempt: 'Exempt', out: 'Out of scope' }[v]);

  function formFor(id) {
    if (ui.form && ui.form.id === id) return ui.form;
    const p = id === 'new' ? null : prod(id);
    ui.trErr = '';
    ui.form = p ? Object.assign(clone(p), { id, price: p.price.toFixed(2), cost: (p.packs.length > 1 ? r2(p.cost * Math.max(...p.packs.map((k) => k.qty))) : p.cost).toFixed(2), vatReason: p.vatReason || '' })
      : { id: 'new', en: '', ar: '', sku: '', cat: 'drinks', brand: '', reorder: 10, price: '', vat: 'standard', vatReason: '', cost: '', unit: 'piece', weighted: false, active: true, fav: false, stock: 0, packs: [{ name: 'Piece', qty: 1, barcode: '', base: true }] };
    return ui.form;
  }
  function productIssues(F) {
    const issues = [];
    if (!String(F.ar).trim()) issues.push({ field: 'ar', msg: 'Arabic name is required' });
    if (!(Number(F.price) > 0)) issues.push({ field: 'price', msg: 'Selling price is required' });
    if (F.vat !== 'standard' && !String(F.vatReason).trim()) issues.push({ field: 'vatReason', msg: 'Give a reason for this VAT category' });
    F.packs.forEach((k, i) => {
      const dup = k.barcode && db.products.find((p) => p.id !== F.id && p.packs.some((x) => x.barcode === k.barcode));
      const dupSelf = k.barcode && F.packs.some((x, j) => j !== i && x.barcode === k.barcode);
      if (dup) issues.push({ field: 'pack' + i, msg: 'dup', pid: dup.id, pack: dup.packs.find((x) => x.barcode === k.barcode).name });
      else if (dupSelf) issues.push({ field: 'pack' + i, msg: 'Same barcode used twice on this product' });
      if (!(Number(k.qty) > 0)) issues.push({ field: 'packq' + i, msg: 'Pack size must be more than 0' });
    });
    return issues;
  }
  function viewProduct(id) {
    if (id !== 'new' && !prod(id)) return `<div class="empty">${t('Product not found.')}</div>`;
    const F = formFor(id), issues = productIssues(F);
    const has = (f) => issues.find((x) => x.field === f);
    const price = Number(F.price || 0), rate = vatRate(F.vat), net = r2(price / (1 + rate)), vat = r2(price - net);
    const big = F.packs.reduce((a, k) => (Number(k.qty) > Number(a.qty) ? k : a), F.packs[0]);
    const costPiece = F.cost ? r2(Number(F.cost) / Number(big.qty || 1)) : 0;
    const marginV = r2(net - costPiece), marginP = net ? (marginV / net * 100) : 0;
    const locked = !isMgr();
    const packs = F.packs.map((k, i) => {
      const e = has('pack' + i);
      return `<div class="packrow ${e ? 'err' : ''}">
        <div class="between" style="flex-wrap:wrap"><div class="row" style="flex-wrap:wrap;gap:8px"><input value="${esc(k.name)}" data-in="pk-name" data-i="${i}" data-k="pkn${i}" style="width:110px;font-weight:600" aria-label="${t('Pack name')}">
          <span class="small muted">${k.base ? t('base unit, sold at checkout') : t('used for receiving')}</span></div>
          <div class="row" style="gap:6px"><span class="small">${k.base ? '1 ×' : t('1 {n} =', { n: esc(k.name) })}</span>${k.base ? `<span class="tag outline">${esc(F.unit)}</span>` : `<input value="${esc(k.qty)}" data-in="pk-qty" data-i="${i}" data-k="pkq${i}" style="width:60px" inputmode="numeric" aria-label="${t('Pieces per pack')}"><span class="small">${t('pieces')}</span>`}
          ${k.base ? '' : `<button class="linkbtn red" data-a="pk-del" data-i="${i}">${t('Remove')}</button>`}</div></div>
        <div class="row small" style="margin-top:8px"><span class="muted">${t('Barcode')}</span><input value="${esc(k.barcode)}" data-in="pk-bc" data-i="${i}" data-k="pkb${i}" id="pkb${i}" style="width:180px" inputmode="numeric" placeholder="${t('Scan or type')}"><button type="button" class="cam-btn sm" data-a="pk-cam" data-i="${i}" title="${t('Scan with camera')}" aria-label="${t('Scan with camera')}">${I.camera}</button></div>
        ${e && e.msg === 'dup' ? `<div class="errbox between" style="flex-wrap:wrap"><span class="row" style="gap:8px">${I.warn}<span>${t('This barcode is already assigned to {p}.', { p: `<b>${esc(N(prod(e.pid)))} · ${esc(t(e.pack))}</b>` })}</span></span>
          <span class="row"><button class="btn sm danger" data-a="open-prod" data-id="${e.pid}">${t('Open product')}</button></span>
          <button class="linkbtn red" data-a="focus" data-target="pkb${i}" style="font-size:13.5px">${t('Change barcode')}</button></div>` : e ? `<div class="errbox">${t(e.msg)}</div>` : ''}
      </div>`;
    }).join('');
    const vatOpts = [['standard', 'Standard rated · 15%'], ['zero', 'Zero rated · 0%'], ['exempt', 'Exempt'], ['out', 'Out of scope']].map(([k, l]) => `<label class="radio ${F.vat === k ? 'on' : ''}" data-a="${locked ? 'vat-locked' : 'vat'}" data-v="${k}"><input type="radio" name="vat" ${F.vat === k ? 'checked' : ''} ${locked ? 'disabled' : ''}>${t(l)}${k !== 'standard' ? `<small>${t('reason required')}</small>` : ''}</label>`).join('');
    const recvQty = 5 * Number(big.qty || 1);
    return `<div class="crumbs"><a href="#/products">${t('Products')}</a> / ${id === 'new' ? t('New product') : esc(N(F))}</div>
      <div class="page-h"><h1>${t(id === 'new' ? 'Add product' : 'Edit product')}</h1>
        <label class="row" style="font-weight:600;gap:10px"><input type="checkbox" data-in="active" ${F.active ? 'checked' : ''} style="width:22px;height:22px;accent-color:#105448">${t('Active · can be sold')}</label></div>
      <div class="pf">
        <div style="display:flex;flex-direction:column;gap:16px">
          <div class="card"><h2>${t('Basics')}</h2><div class="grid2">
            <label class="field"><span>${t('Name · English')}</span><input class="input" dir="ltr" data-in="f" data-f="en" data-k="fen" value="${esc(F.en)}"></label>
            <label class="field"><span class="between">${t('Name · Arabic')} <small>(${t('required')})</small><span class="spacer"></span>${F.en ? `<button type="button" class="linkbtn" data-a="translate-name" ${ui.trBusy ? 'disabled' : ''}>${t(ui.trBusy ? 'Translating…' : 'Translate')}</button>` : ''}</span>
              <input class="input ar ${has('ar') ? 'err' : ''}" dir="rtl" data-in="f" data-f="ar" data-k="far" value="${esc(F.ar)}">
              ${F.arAuto && F.ar ? `<small class="muted">${t('Machine translation. Check it and edit if needed.')}</small>` : ''}${ui.trErr ? `<small style="color:var(--red)">${t(ui.trErr)}</small>` : ''}</label>
            <label class="field"><span>SKU</span><input class="input" data-in="f" data-f="sku" data-k="fsku" value="${esc(F.sku)}"></label>
            <label class="field"><span>${t('Category')}</span><select class="input" data-in="f" data-f="cat" data-k="fcat">${db.categories.filter((c) => c.id !== 'fav').map((c) => `<option value="${c.id}" ${F.cat === c.id ? 'selected' : ''}>${esc(N(c))}</option>`).join('')}</select></label>
            <label class="field"><span>${t('Brand')}</span><input class="input" data-in="f" data-f="brand" data-k="fbrand" value="${esc(F.brand)}" placeholder="[Brand]"></label>
            <label class="field"><span>${t('Reorder level')} <small>(${t('pieces')})</small></span><input class="input" data-in="f" data-f="reorder" data-k="freorder" value="${esc(F.reorder)}" inputmode="numeric"></label>
            <label class="row small" style="gap:8px"><input type="checkbox" data-in="weighted" ${F.weighted ? 'checked' : ''} style="accent-color:#105448;width:18px;height:18px">${t('Sold by weight (kg)')}</label>
            <label class="row small" style="gap:8px"><input type="checkbox" data-in="fav" ${F.fav ? 'checked' : ''} style="accent-color:#105448;width:18px;height:18px">${t('Show in Favourites at checkout')}</label>
          </div></div>
          <div class="card"><h2>${t('Units, packs and barcodes')}</h2>${packs}
            <button class="btn sm" data-a="pk-add" style="border-style:dashed;margin-top:4px">+ ${t('Add pack')}</button>
          </div>
        </div>
        <div class="panel" style="display:flex;flex-direction:column;gap:10px">
          <h2 style="margin:0">${t('Tax and price')}</h2>
          <div class="field"><span>${t('VAT category')}</span></div>${vatOpts}
          ${F.vat !== 'standard' ? `<label class="field"><span>${t('Reason')}</span><input class="input ${has('vatReason') ? 'err' : ''}" data-in="f" data-f="vatReason" data-k="fvr" value="${esc(F.vatReason)}" placeholder="${t('e.g. Basic food item listed by ZATCA')}"></label>` : ''}
          <div class="small muted row" style="gap:6px">${I.lock}${t('Owner and Manager only')}</div>
          <label class="field"><span>${t('Selling price per {u} · incl. VAT', { u: esc(F.weighted ? 'kg' : (F.packs[0].name || 'piece').toLowerCase()) })}</span><div class="inwrap"><input class="input big num ${has('price') ? 'err' : ''}" data-in="f" data-f="price" data-k="fprice" value="${esc(F.price)}" inputmode="decimal" placeholder="0.00"><span class="suffix">${SAR()}</span></div></label>
          <div class="totals num"><div class="between"><span>${t('Net price')}</span><span>${money(net)}</span></div><div class="between"><span>${t('VAT {r}%', { r: rate * 100 })}</span><span>${money(vat)}</span></div><hr><div class="between" style="font-weight:600;color:var(--green)"><span>${t('Shelf price')}</span><span>${money(price)} SAR</span></div></div>
          <label class="field"><span>${t('Purchase cost per {p} · excl. VAT', { p: esc((big.name || 'piece').toLowerCase()) })} <small>(${t('optional')})</small></span><input class="input num" data-in="f" data-f="cost" data-k="fcost" value="${esc(F.cost)}" inputmode="decimal"></label>
          ${F.cost ? `<div class="margin"><div><b style="font-size:14px">${t('Margin preview')}</b><div class="small">${t('Cost {c} per piece · latest cost', { c: money(costPiece) })}</div></div><b class="num">${money(marginV)} · ${marginP.toFixed(1)}%</b></div>` : ''}
        </div>
      </div>
      <div class="savebar">${issues.length ? `<span class="err">${t(issues.length === 1 ? 'Fix 1 issue to save' : 'Fix {n} issues to save', { n: issues.length })}</span>` : ''}<span class="spacer"></span>
        <a class="btn ghost" href="#/products" style="text-decoration:none" data-a="cancel-form">${t('Cancel')}</a>
        <button class="btn" data-a="save-prod" data-draft="1" ${issues.length ? 'disabled' : ''}>${t('Save draft')}</button>
        <button class="btn primary" data-a="save-prod" ${issues.length ? 'disabled' : ''}>${t('Save product')} ${arrow()}</button></div>`;
  }
  function saveProduct(draft) {
    const F = ui.form;
    const big = F.packs.reduce((a, k) => (Number(k.qty) > Number(a.qty) ? k : a), F.packs[0]);
    const data = {
      en: F.en.trim() || F.ar.trim(), ar: F.ar.trim(), sku: F.sku.trim() || ('SKU-' + Date.now().toString().slice(-5)), cat: F.cat, brand: F.brand, reorder: Number(F.reorder) || 0,
      price: r2(Number(F.price)), vat: F.vat, vatReason: F.vatReason, cost: F.cost ? r2(Number(F.cost) / Number(big.qty || 1)) : 0, weighted: F.weighted, fav: F.fav,
      unit: F.weighted ? 'kg' : (F.packs[0].name || 'piece').toLowerCase(), active: draft ? false : F.active,
      packs: F.packs.map((k) => ({ name: k.name, qty: Number(k.qty), barcode: k.barcode, base: !!k.base })),
    };
    if (F.id === 'new') {
      const id = 'p' + (Math.max(...db.products.map((p) => Number(p.id.slice(1)))) + 1);
      db.products.push(Object.assign({ id, stock: 0 }, data));
      audit(`Product created ${data.en}`);
    } else {
      const p = prod(F.id);
      if (p.price !== data.price) audit(`Price ${p.en}: ${money(p.price)} → ${money(data.price)}`);
      if (p.vat !== data.vat) audit(`VAT ${p.en}: ${p.vat} → ${data.vat} (${data.vatReason})`);
      Object.assign(p, data);
    }
    ui.form = null; save();
    toast(t(draft ? 'Saved as draft' : 'Product saved'));
    go('products');
  }

  // ---------------------------------------------------------------- views: test barcode sheet
  function ean13Svg(code) {
    const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
    const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
    const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
    const P = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
    const d = code.split('').map(Number);
    let bits = '101';
    for (let i = 0; i < 6; i++) bits += (P[d[0]][i] === 'L' ? L : G)[d[i + 1]];
    bits += '01010';
    for (let i = 7; i < 13; i++) bits += R[d[i]];
    bits += '101';
    const q = 11, w = bits.length + q * 2;
    let rects = '';
    for (let i = 0; i < bits.length; i++) if (bits[i] === '1') rects += `<rect x="${i + q}" y="0" width="1" height="50"/>`;
    return `<svg viewBox="0 0 ${w} 50" preserveAspectRatio="none" style="aspect-ratio:${w}/40" shape-rendering="crispEdges" aria-label="${code}">${rects}</svg>`;
  }
  const eanCheck = (d12) => d12 + ((10 - d12.split('').reduce((s, c, i) => s + Number(c) * (i % 2 ? 3 : 1), 0) % 10) % 10);
  function viewBarcodes() {
    const items = [];
    db.products.filter((p) => p.active).forEach((p) => p.packs.forEach((k) => {
      if (p.weighted) items.push({ p, label: t('Scale label · {w} kg', { w: '1.250' }), code: eanCheck(k.barcode.slice(0, 7) + '01250') });
      else if (/^\d{13}$/.test(k.barcode)) items.push({ p, label: k.qty > 1 ? `${t(k.name)} · ${k.qty}` : t(k.name), code: k.barcode });
    }));
    return `<div class="page-h"><div><h1>${t('Test barcodes')}</h1></div>
      <button class="btn noprint" data-a="print-sheet">${I.print}${t('Print')}</button></div>
      <div class="bc-grid">${items.map((x) => `<div class="bc"><span class="nm">${esc(N(x.p))}</span><span class="small muted">${esc(x.label)} · ${money(x.p.price)}${x.p.weighted ? ' /kg' : ''}</span>${ean13Svg(x.code)}<span class="cd">${x.code}</span></div>`).join('')}</div>`;
  }

  // ---------------------------------------------------------------- views: receive stock from a delivery document
  // Photo → in-browser OCR (Tesseract.js) → lines matched by barcode, saved supplier code, then name → review → add to stock.
  const RC_SAMPLE = 'ALMARAI CO.\nDELIVERY NOTE DN-55821 24/10/2026\nCode Item Qty Price Total\n6281000001028 Fresh Milk 1L Carton 4 CTN 62.40 249.60\nAL-220 Laban 1L 24 4.40 105.60\nWHT CHEESE 500G x1O 14.30 143.00\n6281000007013 Orange Juice 1.4L 12 8.20 98.40\nYoghurt Cup 170g 24 1.50 36.00\nSubtotal 632.60 VAT 15% 94.89\nTotal SAR 727.49';
  const RC_MEMORY = { 's1|AL-220': 'p9' };
  const RC_SKIP = /\b(sub ?total|total|vat|tax|date|invoice|purchase order|delivery note|received|thank|items|tel|phone|code item|barcode description)\b/i;
  const RC_UNIT = /^(bag|btl|box|can|pcs?|ea|ctn|cartons?|pk|pack|kg|unit|x)$/i;
  const RC_ABBR = { pst: 'paste', chkn: 'chicken', inst: 'instant', jce: 'juice', wtr: 'water', wht: 'white', gr: 'green', bg: 'bags', pk: 'pack', ltr: 'l' };
  function rcParse(raw) {
    const line = raw.replace(/[؀-ۿ]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!line || RC_SKIP.test(line)) return null;
    // OCR often reads 0 as O and 1 as l inside numbers.
    const toks = line.split(' ').map((tk) => (/\d/.test(tk) && /^[xX]?[\dOoIl.,]+$/.test(tk) ? tk.replace(/[Oo]/g, '0').replace(/[Il]/g, '1') : tk));
    let barcode = null, code = null, qty = null;
    const nums = [], words = [];
    toks.forEach((tk, i) => {
      if (!barcode && /^\d{8,14}$/.test(tk)) { barcode = tk; return; }
      if (!code && /^[A-Z]{2,4}-\d{2,5}$/.test(tk)) { code = tk; return; }
      const xq = tk.match(/^[xX×](\d+)$/); if (xq && qty == null) { qty = +xq[1]; return; }
      if (/^\d+([.,]\d+)?$/.test(tk)) {
        if (i === 0 && /^\d{1,3}$/.test(tk)) return;
        const nx = toks[i + 1];
        if (/^\d+$/.test(tk) && words.length && nx && /^[a-z]{3,}$/i.test(nx) && !RC_UNIT.test(nx)) { words.push(tk); return; }
        nums.push(tk.replace(',', '.')); return;
      }
      if (RC_UNIT.test(tk)) return;
      if (/[a-z]/i.test(tk)) words.push(tk);
    });
    const ints = nums.filter((n) => /^\d+$/.test(n));
    if (qty == null && ints.length) qty = +ints[0];
    if (qty == null || !words.length) return null;
    return { desc: words.join(' '), barcode, code, qty };
  }
  const rcNorm = (s) => s.toLowerCase().replace(/(\d)\s+(g|kg|ml|l|pcs)\b/g, '$1$2').split(/[^a-z0-9.]+/).filter(Boolean).map((w) => RC_ABBR[w] || w).join(' ');
  const rcSizes = (s) => (s.match(/\b\d+(?:\.\d+)?(?:g|kg|ml|l|pcs)\b/g) || []).sort().join(',');
  const rcBigrams = (s) => { const a = [], x = s.replace(/ /g, ''); for (let i = 0; i < x.length - 1; i++) a.push(x.substr(i, 2)); return a; };
  function rcScore(desc, p) {
    const a = rcNorm(desc), b = rcNorm(p.en);
    const A = rcBigrams(a), B = rcBigrams(b), rest = B.slice(); let hit = 0;
    A.forEach((x) => { const k = rest.indexOf(x); if (k >= 0) { hit++; rest.splice(k, 1); } });
    const dice = A.length + B.length ? 2 * hit / (A.length + B.length) : 0;
    const aw = a.split(' ').filter((w) => w.length >= 3), bw = b.split(' ');
    const cover = aw.length ? aw.filter((w) => bw.some((v) => v.startsWith(w) || (w.startsWith(v) && v.length >= 3))).length / aw.length : 0;
    let s = 0.5 * dice + 0.5 * cover;
    const sa = rcSizes(a), sb = rcSizes(b); if (sa && sb && sa !== sb) s *= 0.6;
    return s;
  }
  function rcMatch(l, sup) {
    if (l.barcode) {
      for (const p of db.products) { const k = p.packs.find((x) => x.barcode === l.barcode); if (k) return { pid: p.id, mult: k.qty, level: 'exact', why: 'Barcode' }; }
    }
    const mem = db.rcMemory || RC_MEMORY, key = sup + '|' + (l.code || rcNorm(l.desc));
    if (mem[key] && prod(mem[key])) return { pid: mem[key], mult: 1, level: 'exact', why: 'Saved' };
    let best = null, bs = 0;
    db.products.forEach((p) => { const s = rcScore(l.desc, p); if (s > bs) { bs = s; best = p; } });
    const pct = Math.round(bs * 100) + '%';
    if (bs >= 0.75) return { pid: best.id, mult: 1, level: 'likely', why: pct };
    if (bs >= 0.5) return { pid: best.id, mult: 1, level: 'check', why: pct };
    return { pid: '', mult: 1, level: 'none', why: '' };
  }
  function rcRead(text) {
    const R = ui.rcv;
    R.lines = text.split(/\r?\n/).map(rcParse).filter(Boolean).map((l) => {
      const m = rcMatch(l, R.sup);
      return Object.assign(l, m, { on: !!m.pid, qty: r2(l.qty * m.mult) });
    });
    R.busy = false; R.status = t('{n} lines', { n: R.lines.length }); render();
  }
  function rcLoadTess() {
    if (window.Tesseract) return Promise.resolve();
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  }
  function rcPhoto(file) {
    const R = ui.rcv; if (R.img) URL.revokeObjectURL(R.img);
    R.img = URL.createObjectURL(file); R.lines = []; R.busy = true; R.status = t('Reading…'); render();
    rcLoadTess().then(() => window.Tesseract.recognize(R.img, 'eng', { logger: (m) => {
      if (m.status === 'recognizing text') { R.status = t('Reading…') + ' ' + Math.round(m.progress * 100) + '%'; const st = $('#rc-status'); if (st) st.textContent = R.status; }
    } })).then((r) => rcRead(r.data.text)).catch(() => { R.busy = false; R.status = t('Could not read the photo.'); render(); });
  }
  function viewReceive() {
    const R = ui.rcv;
    const opts = (sel) => `<option value="">—</option>` + db.products.map((p) => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(N(p))}</option>`).join('');
    const lv = { exact: '', likely: '', check: 'amber', none: 'red' };
    const rows = R.lines.map((l, i) => {
      const p = prod(l.pid);
      return `<tr class="${l.on ? '' : 'off'}"><td><input type="checkbox" data-in="rc-on" data-i="${i}" ${l.on ? 'checked' : ''} aria-label="${t('Include')}"></td>
        <td><b>${esc(l.desc)}</b><div class="small muted num">${[l.barcode, l.code].filter(Boolean).join(' · ')}</div></td>
        <td><select class="input" data-in="rc-pid" data-i="${i}">${opts(l.pid)}</select>${l.pid ? `<span class="tag ${lv[l.level]}">${esc(t(l.why === 'Barcode' || l.why === 'Saved' || l.why === 'Manual' ? l.why : 'Name')) + (/%$/.test(l.why) ? ' ' + l.why : '')}</span>` : ''}</td>
        <td><input class="input num" style="width:80px" data-in="rc-qty" data-i="${i}" data-k="rcq${i}" value="${l.qty}" inputmode="decimal"></td>
        <td class="r num">${p ? `${qtyFmt(p.stock, p.weighted)} → <b>${qtyFmt(r2(p.stock + (l.on ? Number(l.qty) || 0 : 0)), p.weighted)}</b>` : '—'}</td></tr>`;
    }).join('');
    const blocked = R.lines.some((l) => l.on && !l.pid);
    const units = R.lines.filter((l) => l.on && l.pid).length;
    return `<div class="page-h"><div><h1>${t('Receive stock')}</h1></div></div>
      <div class="rc-bar">
        <select class="input" data-in="rc-sup" aria-label="${t('Supplier')}">${db.suppliers.map((s) => `<option value="${s.id}" ${s.id === R.sup ? 'selected' : ''}>${esc(N(s))}</option>`).join('')}</select>
        <label class="btn primary">${I.camera}${t('Photo')}<input type="file" accept="image/*" id="rc-file" hidden></label>
        <button class="btn" data-a="rc-sample">${t('Sample')}</button>
      </div>
      <div class="rc">
        <div class="rc-doc">${R.img ? `<img src="${R.img}" alt="">` : R.sample ? `<pre>${esc(RC_SAMPLE)}</pre>` : ''}<div class="small muted" id="rc-status">${esc(R.status || '')}</div></div>
        <div>${R.lines.length ? `<div class="tblwrap"><table class="tbl rc-tbl"><thead><tr><th></th><th>${t('Scanned')}</th><th>${t('Product')}</th><th>${t('Qty')}</th><th class="r">${t('Stock')}</th></tr></thead><tbody>${rows}</tbody></table></div>
          <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn primary" data-a="rc-add" ${blocked || !units ? 'disabled' : ''}>${t('Add to stock')}</button></div>` : ''}</div>
      </div>`;
  }

  // ---------------------------------------------------------------- views: inventory / suppliers / reports / settings
  function viewInventory() {
    const low = db.products.filter((p) => p.stock <= p.reorder);
    const value = db.products.reduce((s, p) => s + p.stock * p.cost, 0);
    return `<div class="page-h"><div><h1>${t('Inventory')}</h1></div>
      <div class="row"><a class="btn primary" href="#/receive" style="text-decoration:none">${I.camera}${t('Scan delivery')}</a><button class="btn" data-a="receive">${t('Receive')}</button></div></div>
      <div class="stats"><div class="stat"><div class="k">${t('Products')}</div><div class="v">${db.products.length}</div><div class="d">${t('{n} active', { n: db.products.filter((p) => p.active).length })}</div></div>
        <div class="stat"><div class="k">${t('Below reorder level')}</div><div class="v">${low.length}</div><div class="d">${t('{n} out of stock', { n: db.products.filter((p) => p.stock <= 0).length })}</div></div>
        <div class="stat"><div class="k">${t('Stock value at cost')}</div><div class="v num">${money(value)}</div><div class="d">${t('Excl. VAT')}</div></div>
        <div class="stat"><div class="k">${t('Last delivery')}</div><div class="v" style="font-size:22px">${esc(N(db.suppliers[1]))}</div><div class="d">${t('Today')}</div></div></div>
      <div class="tblwrap"><table class="tbl"><thead><tr><th>${t('Product')}</th><th>${t('Packs')}</th><th class="r">${t('On hand')}</th><th class="r">${t('Reorder level')}</th><th>${t('Status')}</th><th></th></tr></thead>
      <tbody>${db.products.slice().sort((a, b) => (a.stock / (a.reorder || 1)) - (b.stock / (b.reorder || 1))).map((p) => `<tr><td><b>${esc(N(p))}</b><div class="small muted">${esc(p.sku)}</div></td><td class="small">${p.packs.map((k) => `${esc(t(k.name))}${k.qty > 1 ? ' = ' + k.qty : ''}`).join(' · ')}</td>
        <td class="r num"><b>${qtyFmt(p.stock, p.weighted)}</b></td><td class="r num">${p.reorder}</td><td>${p.stock <= 0 ? `<span class="tag red">${t('Out of stock')}</span>` : p.stock <= p.reorder ? `<span class="tag amber">${t('Reorder')}</span>` : `<span class="tag">${t('OK')}</span>`}</td>
        <td class="r"><button class="btn sm ghost" data-a="receive" data-id="${p.id}">${t('Receive')}</button></td></tr>`).join('')}</tbody></table></div>`;
  }
  function viewSuppliers() {
    return `<div class="page-h"><div><h1>${t('Suppliers')}</h1></div></div>
      <div class="tblwrap"><table class="tbl"><thead><tr><th>${t('Supplier')}</th><th>${t('Phone')}</th><th>${t('Supplies')}</th><th>${t('Last delivery')}</th><th class="r">${t('Shop owes')}</th></tr></thead>
      <tbody>${db.suppliers.map((s) => `<tr><td><b>${esc(N(s))}</b><div class="small muted">${esc(N2(s))}</div></td><td class="num">${esc(s.phone)}</td><td>${esc(s.cats)}</td><td>${fmtDate(s.lastDelivery)}</td><td class="r num">${s.balance ? money(s.balance) : '—'}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function viewReports() {
    const sales = db.invoices.filter((i) => i.type === 'sale');
    const today = sales.filter((i) => isToday(i.date));
    const tot = (arr) => r2(arr.reduce((s, i) => s + i.total, 0));
    const vat = r2(today.reduce((s, i) => s + invVat(i), 0));
    const cnToday = db.invoices.filter((i) => i.type === 'credit_note' && isToday(i.date));
    const byMethod = { cash: 0, card: 0, transfer: 0, credit: 0 };
    today.forEach((i) => { if (i.status === 'unpaid' && !i.payments.length) byMethod.credit += i.total; else i.payments.forEach((p) => { byMethod[p.method] = (byMethod[p.method] || 0) + p.amount - (p.method === 'cash' ? i.change : 0); }); });
    const maxM = Math.max(1, ...Object.values(byMethod));
    const days = [...Array(7)].map((_, k) => { const d = new Date(); d.setDate(d.getDate() - (6 - k)); return { d, v: tot(sales.filter((i) => new Date(i.date).toDateString() === d.toDateString())) }; });
    const maxD = Math.max(1, ...days.map((x) => x.v));
    const top = {};
    sales.forEach((i) => i.lines.forEach((l) => { top[l.pid] = (top[l.pid] || 0) + lineTotal(l); }));
    const topList = Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const maxT = topList.length ? topList[0][1] : 1;
    const bar = (label, v, max, suffix = '') => `<div class="bar"><span>${label}</span><span class="tr"><i style="width:${(v / max * 100).toFixed(1)}%"></i></span><span class="r num" style="text-align:end">${money(v)}${suffix}</span></div>`;
    return `<div class="page-h"><div><h1>${t('Reports')}</h1><div class="sub">${t('Today at {s} · {b}', { s: esc(N({ en: db.settings.shopEn, ar: db.settings.shopAr })), b: esc(isAr() ? db.settings.branchAr : db.settings.branch) })}</div></div></div>
      <div class="stats"><div class="stat dark"><div class="k">${t('Sales today')}</div><div class="v num">${money(tot(today))}</div><div class="d">${t('{n} invoices', { n: today.length })}</div></div>
        <div class="stat"><div class="k">${t('VAT collected')}</div><div class="v num">${money(vat)}</div><div class="d">${t('Output VAT · 15%')}</div></div>
        <div class="stat"><div class="k">${t('Average basket')}</div><div class="v num">${money(today.length ? tot(today) / today.length : 0)}</div><div class="d">SAR</div></div>
        <div class="stat"><div class="k">${t('Returns today')}</div><div class="v num">${money(tot(cnToday))}</div><div class="d">${t('{n} credit notes', { n: cnToday.length })}</div></div></div>
      <div class="pf" style="grid-template-columns:1fr 1fr">
        <div class="card"><h2 style="font-size:18px;margin-bottom:16px">${t('Today by payment method')}</h2><div class="bars">${Object.entries(byMethod).map(([k, v]) => bar(t({ cash: 'Cash', card: 'Card', transfer: 'Bank transfer', credit: 'Sold on credit' }[k]), v, maxM)).join('')}</div></div>
        <div class="card"><h2 style="font-size:18px;margin-bottom:16px">${t('Last 7 days')}</h2><div class="bars">${days.map((x) => bar(x.d.toLocaleDateString(locale(), { weekday: 'short', day: 'numeric' }), x.v, maxD)).join('')}</div></div>
        <div class="card"><h2 style="font-size:18px;margin-bottom:16px">${t('Top products by sales')}</h2><div class="bars">${topList.map(([pid, v]) => bar(esc(N(prod(pid))), v, maxT)).join('')}</div></div>
        <div class="card"><h2 style="font-size:18px;margin-bottom:16px">${t('ZATCA reporting')}</h2>
          <div class="bars">${['reported', 'queued', 'offline'].map((z) => `<div class="between"><span>${zTag(z)}</span><b>${db.invoices.filter((i) => i.zatca === z).length}</b></div>`).join('')}</div></div>
      </div>
      <div class="card" style="margin-top:16px"><h2 style="font-size:18px;margin-bottom:12px">${t('Audit history')}</h2>
        ${db.audit.length ? `<div class="tblwrap" style="border:0"><table class="tbl"><tbody>${db.audit.slice(0, 15).map((a) => `<tr><td class="small muted num">${fmtDT(a.at)}</td><td>${esc(a.by)}</td><td>${esc(a.what)}</td></tr>`).join('')}</tbody></table></div>` : `<div class="muted">${t('No changes yet.')}</div>`}</div>`;
  }
  function viewSettings() {
    const s = db.settings;
    const f = (k, label, dir) => `<label class="field"><span>${t(label)}</span><input class="input" ${dir ? `dir="${dir}"` : ''} data-in="setting" data-f="${k}" data-k="s${k}" value="${esc(s[k])}"></label>`;
    return `<div class="page-h"><div><h1>${t('Settings')}</h1></div></div>
      <div class="pf">
        <div class="card"><h2>${t('Shop')}</h2><div class="grid2">${f('shopAr', 'Shop name · Arabic', 'rtl')}${f('shopEn', 'Shop name · English')}${f('branch', 'Branch')}${f('branchAr', 'Branch · Arabic', 'rtl')}${f('address', 'Address')}${f('vatNo', 'VAT registration no.')}${f('cr', 'Commercial registration')}</div></div>
        <div style="display:flex;flex-direction:column;gap:16px">
          <div class="card"><h2>${t('Language')}</h2><div class="row"><button class="pill outline ${!isAr() ? 'on' : ''}" data-a="set-lang" data-l="en">English</button><button class="pill outline ${isAr() ? 'on' : ''}" data-a="set-lang" data-l="ar">العربية</button></div></div>
          <div class="card"><h2>${t('Employees')}</h2><div class="list" style="max-height:none">${db.users.map((u) => `<div class="between" style="padding:8px 0;border-bottom:1px solid var(--line)"><span><b>${esc(isAr() ? u.nameAr : u.name)}</b> · ${t(cap(u.role))}</span><span class="small muted">PIN ${u.pin}</span></div>`).join('')}</div></div>
          <div class="card"><h2>${t('Demo data')}</h2><button class="btn danger" data-a="reset">${t('Reset demo data')}</button></div>
        </div>
      </div>`;
  }

  // ---------------------------------------------------------------- modals
  const isPhone = () => window.matchMedia('(max-width:700px)').matches;
  function openModal(m) { ui.modal = m; renderModal(); }
  function closeModal() { ui.modal = null; renderModal(); }
  function renderModal() {
    let el = $('#modal-root');
    if (!el) { el = document.createElement('div'); el.id = 'modal-root'; document.body.appendChild(el); }
    const m = ui.modal;
    if (!m) { el.innerHTML = ''; return; }
    el.innerHTML = `<div class="overlay ${m.sheet ? 'sheet-wrap' : ''}" data-a="overlay"><div class="modal ${m.xwide ? 'xwide' : m.wide ? 'wide' : ''} ${m.kind === 'price-changed' ? 'limebg' : ''} ${m.sheet ? 'sheet' : ''}" role="dialog" aria-modal="true">${modalBody(m)}</div></div>`;
    const f = el.querySelector('[autofocus]'); if (f) f.focus();
  }
  const badge = (txt, cls) => `<span class="tag ${cls}" style="align-self:flex-start">${t(txt)}</span>`;
  function pinPad(m) {
    return `<div class="pindots">${[0, 1, 2, 3].map((i) => `<span class="${(m.pin || '').length > i ? 'f' : ''}"></span>`).join('')}</div>
      ${m.err ? `<div class="small" style="color:var(--red);text-align:center">${t(m.err)}</div>` : ''}
      <div class="pinpad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((k) => `<button data-a="pin-key" data-k2="${k}">${k}</button>`).join('')}</div>`;
  }
  function modalBody(m) {
    switch (m.kind) {
      case 'browse': return browseBody(m);
      case 'pin-unlock': return `${badge('Registered device', 'lime')}<h3>${t('Enter your PIN')}</h3>${pinPad(m)}<div class="btns one"><button class="btn" data-a="close">${t('Cancel')}</button></div>`;
      case 'approve': return `${badge('Manager approval', 'lime')}<h3>${t('Approve this discount')}</h3>
        <div class="box"><div class="between"><b>${esc(N(m.line))}</b><b>−${money(m.amount)}</b></div><div class="small muted">${t('Reason: {r} · Bill total {a} → {b}', { r: esc(t(m.reason)), a: money(m.before), b: money(r2(m.before - m.amount)) })}</div></div>
        <div class="field"><span>${t('Manager PIN')}</span></div>${pinPad(m)}<div class="btns one"><button class="btn" data-a="close">${t('Cancel')}</button></div>`;
      case 'discount': {
        const l = ui.cart.lines[m.i]; const gross = r2(l.price * l.qty);
        const amt = m.mode === 'pct' ? r2(gross * Number(m.value || 0) / 100) : r2(Number(m.value || 0));
        return `<h3>${t('Discount · {n}', { n: esc(N(l)) })}</h3><p>${t('Line total {a} SAR', { a: money(gross) })}</p>
          <div class="row"><button class="pill outline ${m.mode !== 'pct' ? 'on' : ''}" data-a="disc-mode" data-m="amt">SAR</button><button class="pill outline ${m.mode === 'pct' ? 'on' : ''}" data-a="disc-mode" data-m="pct">%</button></div>
          <input class="input big num" data-in="disc-val" data-k="discv" value="${esc(m.value || '')}" inputmode="decimal" placeholder="0" autofocus>
          <div class="field"><span>${t('Reason')}</span><div class="row" style="flex-wrap:wrap">${['Damaged pack', 'Near expiry', 'Price match', 'Loyal customer'].map((r) => `<button class="pill outline ${m.reason === r ? 'on' : ''}" data-a="disc-reason" data-r="${r}">${t(r)}</button>`).join('')}</div></div>
          <div class="box between"><span>${t('Discount')}</span><b class="num">−${money(amt)} SAR</b></div>
          <div class="btns"><button class="btn primary" data-a="disc-apply" ${amt > 0 && amt < gross && m.reason ? '' : 'disabled'}>${t(isMgr() ? 'Apply' : 'Ask manager')}</button><button class="btn" data-a="close">${t('Cancel')}</button></div>`;
      }
      case 'weigh': {
        const p = prod(m.pid);
        return `${badge('Scale', 'lime')}<h3>${esc(N(p))}</h3><p>${t('{p} SAR per kg', { p: money(p.price) })}</p>
          <div class="inwrap"><input class="input big num" data-in="weight" data-k="weight" value="${esc(m.w || '')}" inputmode="decimal" placeholder="0.000" autofocus><span class="suffix">kg</span></div>
          <div class="box between"><span>${t('Line total')}</span><b class="num">${money(r2(p.price * Number(m.w || 0)))} SAR</b></div>
          <div class="btns"><button class="btn" data-a="read-scale">${t('Read scale')}</button><button class="btn primary" data-a="weigh-add" ${Number(m.w) > 0 ? '' : 'disabled'}>${t('Add')}</button></div><button class="linkbtn" data-a="close" style="align-self:center">${t('Cancel')}</button>`;
      }
      case 'cust': {
        const q = (m.q || '').toLowerCase();
        const list = db.customers.filter((c) => !q || c.en.toLowerCase().includes(q) || c.ar.includes(q) || c.phone.replace(/\s/g, '').includes(q.replace(/\s/g, '')));
        return `<h3>${t('Select customer')}</h3><div class="search" style="height:48px">${I.search}<input data-in="cust-q" data-k="custmq" value="${esc(m.q || '')}" placeholder="${t('Name or phone')}" autofocus></div>
          <div class="list"><button data-a="cust-set" data-id=""><span><b>${t('Walk-in customer')}</b></span></button>${list.map((c) => `<button data-a="cust-set" data-id="${c.id}"><span><b>${esc(N(c))}</b><div class="small muted">${esc(c.phone)}</div></span><span class="small ${c.credit ? '' : 'muted'}">${c.credit ? t('Credit · {a} available', { a: money(creditAvailable(c)) }) : t('No credit')}</span></button>`).join('')}</div>
          <div class="btns"><button class="btn" data-a="new-cust">${t('New customer')}</button><button class="btn ghost" data-a="close">${t('Cancel')}</button></div>`;
      }
      case 'new-cust': {
        const d = m.d || {};
        return `<h3>${t('New customer')}</h3><div class="grid2">
          <label class="field"><span>${t('Name · Arabic')}</span><input class="input ar" dir="rtl" data-in="nc" data-f="ar" data-k="ncar" value="${esc(d.ar || '')}" autofocus></label>
          <label class="field"><span>${t('Name · English')}</span><input class="input" data-in="nc" data-f="en" data-k="ncen" value="${esc(d.en || '')}"></label>
          <label class="field"><span>${t('Phone')}</span><input class="input" data-in="nc" data-f="phone" data-k="ncph" value="${esc(d.phone || '')}" placeholder="+966"></label>
          <label class="field"><span>${t('VAT no. (business)')}</span><input class="input" data-in="nc" data-f="vatNo" data-k="ncvat" value="${esc(d.vatNo || '')}" placeholder="${t('Optional')}"></label></div>
          ${isMgr() ? `<label class="row" style="gap:8px"><input type="checkbox" data-in="nc-credit" ${d.credit ? 'checked' : ''} style="width:18px;height:18px;accent-color:#105448">${t('Open a credit account')}</label>` : ''}
          <div class="btns"><button class="btn primary" data-a="nc-save" ${(d.ar || d.en) && d.phone ? '' : 'disabled'}>${t('Save customer')}</button><button class="btn" data-a="close">${t('Cancel')}</button></div>`;
      }
      case 'clear': return `<h3>${t('Clear this draft?')}</h3><div class="btns"><button class="btn danger" data-a="clear-ok">${t('Clear draft')}</button><button class="btn" data-a="close">${t('Keep bill')}</button></div>`;
      case 'conn': return `${badge('Connection lost', 'red')}<h3>${t("Can't reach the shop server")}</h3>
        <div class="box" style="background:none;padding:0"><div class="between"><span class="row" style="gap:8px"><span style="width:8px;height:8px;border-radius:50%;background:var(--red)"></span>${t('Shop server · Wi-Fi')}</span><b style="color:var(--red)">${t('Lost')}</b></div>
        <div class="between"><span class="row" style="gap:8px"><span style="width:8px;height:8px;border-radius:50%;background:${ui.demo.internet ? 'var(--green-mid)' : 'var(--red)'}"></span>${t('Internet')}</span><b>${t(ui.demo.internet ? 'Online' : 'Offline')}</b></div></div>
        <div class="btns"><button class="btn primary" data-a="retry-conn">${t('Retry')}</button><button class="btn" data-a="close">${t('Back')}</button></div>`;
      case 'terminal': return `${badge('Card terminal', 'lime')}<h3>${t('Waiting for the terminal…')}</h3><div class="box num" style="text-align:center;font-size:22px;font-weight:700">${money(m.amount)} SAR</div>`;
      case 'terminal-unknown': return `${badge('Outcome unknown', 'amber')}<h3>${t('Card payment · no reply from terminal')}</h3><p>${t('{a} SAR may have been charged. Check before retrying.', { a: money(m.amount) })}</p>
        <div class="btns"><button class="btn primary" data-a="term-check">${t('Check status')}</button><button class="btn ghost" data-a="term-retry" ${m.checked ? '' : 'disabled'}>${t('Retry')}</button></div>
        ${m.checked ? `<div class="box">${t('Not charged. Safe to retry.')}</div>` : ''}<button class="linkbtn" data-a="close" style="align-self:center">${t('Cancel payment')}</button>`;
      case 'printer': return `${badge('Printer unavailable', 'amber')}<h3>${t('The sale is saved — only printing failed')}</h3><p>${t('{i} · printer out of paper', { i: m.invId })}</p>
        <div class="btns"><button class="btn primary" data-a="print-retry" data-id="${m.invId}">${t('Retry print')}</button><button class="btn" data-a="print-other" data-id="${m.invId}">${t('Other printer')}</button></div>
        <button class="linkbtn" style="align-self:center;font-size:14px" data-a="send" data-id="${m.invId}">${t('Send copy')}</button><button class="linkbtn" data-a="close" style="align-self:center;color:var(--muted)">${t('Close')}</button>`;
      case 'locked': return `${badge('Permission needed', 'lime')}<h3>${t('Tax category is locked')}</h3>
        <div class="btns"><button class="btn primary" data-a="switch-user">${t('Ask manager')}</button><button class="btn" data-a="close">${t('Go back')}</button></div>`;
      case 'price-changed': return `${badge('Information changed', 'outline')}<h3>${t('A price changed while this bill was open')}</h3>
        ${m.items.map((x) => `<div class="box between"><span>${esc(N(x))}</span><b class="num">${money(x.old)} ${isAr() ? '←' : '→'} ${money(x.now)}</b></div>`).join('')}
        <div class="btns"><button class="btn primary" data-a="refresh-bill">${t('Refresh bill')}</button><button class="btn" data-a="close" style="background:transparent">${t('Review lines')}</button></div>`;
      case 'send': {
        const inv = db.invoices.find((i) => i.id === m.invId), cu = inv && cust(inv.customerId);
        return `<h3>${t('Send copy')}</h3>
          <div class="row">${['WhatsApp', 'SMS', 'Email'].map((c) => `<button class="pill outline ${(m.ch || 'WhatsApp') === c ? 'on' : ''}" data-a="send-ch" data-c="${c}">${c}</button>`).join('')}</div>
          <input class="input" data-in="send-to" data-k="sendto" value="${esc(m.to != null ? m.to : (cu ? cu.phone : ''))}" placeholder="${(m.ch || 'WhatsApp') === 'Email' ? 'name@example.com' : '+966 5x xxx xxxx'}" autofocus>
          <div class="btns"><button class="btn primary" data-a="send-ok">${t('Send')}</button><button class="btn" data-a="close">${t('Cancel')}</button></div>`;
      }
      case 'close-shift': {
        const since = db.session.shiftStart;
        const mine = db.invoices.filter((i) => i.type === 'sale' && new Date(i.date) >= new Date(since));
        const cash = r2(mine.reduce((s, i) => s + i.payments.filter((p) => p.method === 'cash').reduce((a, p) => a + p.amount, 0) - (i.change || 0), 0));
        const card = r2(mine.reduce((s, i) => s + i.payments.filter((p) => p.method === 'card').reduce((a, p) => a + p.amount, 0), 0));
        const credit = r2(mine.filter((i) => i.status === 'unpaid').reduce((s, i) => s + i.total, 0));
        return `<h3>${t('Close shift')}</h3><p>${t('Shift since {t} · {n} sales', { t: fmtTime(since), n: mine.length })}</p>
          <div class="box num" style="display:flex;flex-direction:column;gap:6px"><div class="between"><span>${t('Opening float')}</span><span>500.00</span></div><div class="between"><span>${t('Cash sales')}</span><span>${money(cash)}</span></div><div class="between"><b>${t('Expected in drawer')}</b><b>${money(500 + cash)}</b></div>
            <div class="between muted"><span>${t('Card')}</span><span>${money(card)}</span></div><div class="between muted"><span>${t('On credit')}</span><span>${money(credit)}</span></div></div>
          <label class="field"><span>${t('Counted cash')}</span><input class="input num" data-in="counted" data-k="counted" value="${esc(m.counted || '')}" inputmode="decimal" placeholder="${money(500 + cash)}" autofocus></label>
          ${m.counted ? `<div class="box between"><span>${t('Difference')}</span><b class="num" style="color:${Math.abs(Number(m.counted) - 500 - cash) < 0.01 ? 'var(--green)' : 'var(--red)'}">${money(r2(Number(m.counted) - 500 - cash))}</b></div>` : ''}
          <div class="btns"><button class="btn primary" data-a="shift-ok">${t('Close shift')}</button><button class="btn" data-a="close">${t('Cancel')}</button></div>`;
      }
      case 'receive': {
        const p = prod(m.pid || db.products[0].id);
        const pk = p.packs[m.pack || 0] || p.packs[0];
        const add = r2(Number(m.qty || 0) * pk.qty);
        return `<h3>${t('Receive delivery')}</h3><label class="field"><span>${t('Product')}</span><select class="input" data-in="rc-prod" data-k="rcp">${db.products.map((x) => `<option value="${x.id}" ${x.id === p.id ? 'selected' : ''}>${esc(N(x))}</option>`).join('')}</select></label>
          <div class="field"><span>${t('Pack')}</span><div class="row" style="flex-wrap:wrap">${p.packs.map((k, i) => `<button class="pill outline ${(m.pack || 0) === i ? 'on' : ''}" data-a="rc-pack" data-i="${i}">${esc(t(k.name))}${k.qty > 1 ? ' · ' + k.qty : ''}</button>`).join('')}</div></div>
          <label class="field"><span>${t('Received quantity')}</span><input class="input big num" data-in="rc-qty" data-k="rcq" value="${esc(m.qty || '')}" inputmode="decimal" placeholder="0" autofocus></label>
          <div class="box">${t('Adds {n} to stock · {a} → {b}', { n: `<b>${qtyFmt(add, p.weighted)}</b>`, a: qtyFmt(p.stock, p.weighted), b: `<b>${qtyFmt(r2(p.stock + add), p.weighted)}</b>` })}</div>
          <div class="btns"><button class="btn primary" data-a="rc-ok" ${add > 0 ? '' : 'disabled'}>${t('Receive')}</button><button class="btn" data-a="close">${t('Cancel')}</button></div>`;
      }
      case 'credit-settings': {
        const d = m.d;
        return `<h3>${t('Credit settings')}</h3><label class="row" style="gap:8px"><input type="checkbox" data-in="cs-credit" ${d.credit ? 'checked' : ''} style="width:18px;height:18px;accent-color:#105448">${t('Allow sales on credit')}</label>
          <div class="grid2"><label class="field"><span>${t('Credit limit')}</span><input class="input num" data-in="cs" data-f="limit" data-k="cslim" value="${esc(d.limit)}"></label>
          <label class="field"><span>${t('Terms')}</span><select class="input" data-in="cs" data-f="terms" data-k="csterms">${['monthly', 'net15', 'net30'].map((k) => `<option value="${k}" ${d.terms === k ? 'selected' : ''}>${t(termsLabel(k))}</option>`).join('')}</select></label></div>
          <div class="btns"><button class="btn primary" data-a="cs-save">${t('Save')}</button><button class="btn" data-a="close">${t('Cancel')}</button></div>`;
      }
      case 'statement': {
        const c = cust(m.id); const unpaid = db.invoices.filter((i) => i.customerId === c.id && i.outstanding > 0);
        return `<h3>${t('Statement · {n}', { n: esc(N(c)) })}</h3>
          <div class="box num">${unpaid.map((i) => `<div class="between"><span>${i.id} · ${fmtDay(i.date)}</span><span>${money(i.outstanding)}</span></div>`).join('') || t('Nothing outstanding.')}<hr style="border:0;border-top:1px dashed var(--line)"><div class="between"><b>${t('Balance due')}</b><b>${money(outstandingOf(c))} SAR</b></div></div>
          <div class="btns"><button class="btn primary" data-a="statement-send" data-id="${c.id}">${t('Send')}</button><button class="btn" data-a="close">${t('Close')}</button></div>`;
      }
      case 'confirm-reset': return `<h3>${t('Reset demo data?')}</h3><div class="btns"><button class="btn danger" data-a="reset-ok">${t('Reset')}</button><button class="btn" data-a="close">${t('Cancel')}</button></div>`;
      case 'line': {
        const l = ui.cart.lines[ui.sel];
        if (!l) return `<div class="btns one"><button class="btn primary" data-a="close">${t('Done')}</button></div>`;
        return `<div class="item-card">${itemBody(l)}</div><div class="btns one"><button class="btn primary" data-a="close">${t('Done')}</button></div>`;
      }
      case 'menu': {
        const u = user(), r = route()[0];
        const links = (ui.navList || []).filter(([k]) => !['checkout', 'orders', 'invoices'].includes(k))
          .map(([k, label]) => `<a class="menu-link ${r === k ? 'on' : ''}" href="#/${k}" data-a="close">${t(label)}</a>`).join('');
        return `<div class="menu-who"><b>${esc(isAr() ? u.nameAr : u.name)} · ${t(cap(u.role))}</b><span>${esc(isAr() ? db.settings.shopAr : db.settings.shopEn)} · ${esc(isAr() ? db.settings.branchAr : db.settings.branch)}</span></div>
          <div class="menu-links">${links}</div>
          <div class="menu-row"><button class="btn sm ghost" data-a="lang">${isAr() ? 'English' : 'العربية'}</button></div>
          <div class="menu-row"><button class="btn sm ghost" data-a="close-shift">${t('Close shift')}</button><button class="btn sm ghost" data-a="switch-user">${t('Switch user')}</button></div>`;
      }
      case 'order': return orderBody(m);
      case 'info': return `<h3>${t(m.title)}</h3><p>${t(m.body)}</p><div class="btns one"><button class="btn primary" data-a="close">${t('OK')}</button></div>`;
    }
    return '';
  }

  function demoPanel() {
    const d = ui.demo;
    const tg = (k, label) => `<label class="toggle"><span>${t(label)}</span><input type="checkbox" data-in="demo" data-f="${k}" ${d[k] ? 'checked' : ''}></label>`;
    return `${ui.demoOpen ? `<div class="demo-panel"><div class="between"><h4>${t('Simulate shop conditions')}</h4><button class="linkbtn" data-a="demo-toggle">${t('Close')}</button></div>
        ${tg('server', 'Shop server connected')}${tg('internet', 'Internet online')}${tg('printer', 'Printer has paper')}${tg('terminal', 'Card terminal replies')}
        <button class="btn sm ghost" data-a="demo-price">${t('Change a shelf price (Sugar +0.25)')}</button>
        <button class="btn sm ghost" data-a="reset">${t('Reset demo data')}</button>
        <div class="small muted">${t('PINs · Cashier 1111 · Manager 1234 · Owner 9999')}</div></div>` : ''}`;
  }

  // ---------------------------------------------------------------- render
  // Suggests the Arabic product name from the English one with the free MyMemory translation API
  // (no key needed; about 5,000 characters a day per device). Staff can always edit the result.
  async function translateName(manual) {
    const F = ui.form; if (!F || !F.en || !F.en.trim()) return;
    if (!manual && F.ar && !F.arAuto) return;
    const q = F.en.trim(); ui.trBusy = true; ui.trErr = ''; render();
    try {
      const r = await fetch('https://api.mymemory.translated.net/get?langpair=en|ar&q=' + encodeURIComponent(q));
      const j = await r.json();
      const ar = j && j.responseData && j.responseData.translatedText;
      if (!r.ok || !ar || j.responseStatus !== 200 || !/[\u0600-\u06FF]/.test(ar)) throw new Error('bad');
      if (ui.form === F && F.en.trim() === q && (manual || !F.ar || F.arAuto)) { F.ar = ar.trim(); F.arAuto = true; }
    } catch (e) { ui.trErr = 'Could not translate right now. Type the Arabic name.'; }
    ui.trBusy = false; render();
  }

  function render() {
    document.documentElement.lang = lang();
    document.documentElement.dir = isAr() ? 'rtl' : 'ltr';
    const active = document.activeElement;
    const focusKey = active && active.dataset ? active.dataset.k : null;
    const sel = focusKey && active.selectionStart != null ? [active.selectionStart, active.selectionEnd] : null;

    const app = $('#app');
    if (!db.session || !db.session.userId) {
      app.innerHTML = viewSignIn();
      $('#demo-root').innerHTML = '';
      mountFlag();
    } else {
      const [r, a] = route();
      const views = {
        checkout: viewCheckout, pay: viewPay, done: () => viewDone(a), orders: viewOrders, invoices: viewInvoices, invoice: () => viewInvoice(a),
        returns: viewReturns, customers: viewCustomers, customer: () => viewCustomer(a), products: viewProducts, product: () => viewProduct(a),
        inventory: viewInventory, receive: viewReceive, suppliers: viewSuppliers, barcodes: viewBarcodes, reports: viewReports, settings: viewSettings,
      };
      app.innerHTML = shell((views[r] || viewCheckout)());
      if (ui.modal && ui.modal.kind === 'line') { if (ui.cart.lines[ui.sel]) renderModal(); else closeModal(); }
      $('#demo-root').innerHTML = demoPanel();
    }
    if (focusKey) {
      const el = (ui.modal && document.querySelector(`#modal-root [data-k="${focusKey}"]`)) || document.querySelector(`[data-k="${focusKey}"]`);
      if (el) { el.focus(); if (sel && el.setSelectionRange) try { el.setSelectionRange(sel[0], sel[1]); } catch (e) { /* number inputs */ } }
    } else if (route()[0] === 'checkout' && !ui.modal && !isPhone() && db.session && db.session.userId) {
      const s = $('#scan'); if (s) s.focus({ preventScroll: true });
    }
  }
  function rerenderModalKeepFocus() {
    const active = document.activeElement; const k = active && active.dataset ? active.dataset.k : null;
    const sel = k && active.selectionStart != null ? [active.selectionStart, active.selectionEnd] : null;
    renderModal();
    if (k) { const el = document.querySelector(`#modal-root [data-k="${k}"]`); if (el) { el.focus(); if (sel) try { el.setSelectionRange(sel[0], sel[1]); } catch (e) { /* ignore */ } } }
  }

  // ---------------------------------------------------------------- actions
  function signIn(userId) {
    db.session = { userId, shiftStart: new Date().toISOString() };
    save();
    if (!location.hash || location.hash === '#/') location.hash = '#/checkout';
    render();
  }
  function pinEntered(pin) {
    const m = ui.modal;
    const u = db.users.find((x) => x.pin === pin);
    if (m.kind === 'pin-unlock') {
      if (!u) return Object.assign(m, { pin: '', err: 'Wrong PIN. Try again.' }) && renderModal();
      const switching = db.session && db.session.userId;
      ui.modal = null; renderModal();
      if (switching) { db.session.userId = u.id; save(); toast(t('Signed in as {n}', { n: `<b>${esc(isAr() ? u.nameAr : u.name)}</b>` })); render(); } else signIn(u.id);
      return;
    }
    if (m.kind === 'approve') {
      if (!u || u.role === 'cashier') return Object.assign(m, { pin: '', err: 'That PIN is not a manager PIN.' }) && renderModal();
      const l = ui.cart.lines[m.i]; l.discount = m.amount; l.reason = m.reason; l.approvedBy = u.name;
      audit(`Discount ${money(m.amount)} on ${l.en} (${m.reason}) approved by ${u.name}`);
      save(); closeModal(); render(); toast(t('Discount approved by {n}', { n: esc(u.name) }));
    }
  }
  function checkPriceChanges() {
    const items = ui.cart.lines.filter((l) => { const p = prod(l.pid); return p && p.price !== l.price; }).map((l) => ({ en: l.en, ar: l.ar, old: l.price, now: prod(l.pid).price }));
    if (items.length) { openModal({ kind: 'price-changed', items }); return false; }
    return true;
  }

  const actions = {
    lang: () => { db.settings.lang = isAr() ? 'en' : 'ar'; save(); render(); },
    'set-lang': (el) => { db.settings.lang = el.dataset.l; save(); render(); },
    'toggle-pw': () => { const p = $('#pw'); p.type = p.type === 'password' ? 'text' : 'password'; },
    forgot: () => openModal({ kind: 'info', title: 'Forgot password?', body: 'Ask the owner or manager to reset it.' }),
    'pin-unlock': () => openModal({ kind: 'pin-unlock', pin: '' }),
    'switch-user': () => openModal({ kind: 'pin-unlock', pin: '' }),
    'pin-key': (el) => {
      const m = ui.modal, k = el.dataset.k2; m.err = '';
      if (k === 'C') m.pin = ''; else if (k === '⌫') m.pin = (m.pin || '').slice(0, -1); else if ((m.pin || '').length < 4) m.pin = (m.pin || '') + k;
      renderModal();
      if (m.pin.length === 4) setTimeout(() => pinEntered(m.pin), 120);
    },
    close: () => closeModal(),
    overlay: (el, ev) => { if (ev.target === el && ui.modal && ui.modal.kind !== 'terminal') closeModal(); },
    'menu-demo': () => { closeModal(); ui.demoOpen = true; $('#demo-root').innerHTML = demoPanel(); },
    'demo-toggle': () => { ui.demoOpen = !ui.demoOpen; $('#demo-root').innerHTML = demoPanel(); },
    'demo-open': () => { ui.demoOpen = true; $('#demo-root').innerHTML = demoPanel(); },
    'demo-price': () => {
      const p = prod('p8'); const old = p.price; p.price = r2(p.price + 0.25); audit(`Price ${p.en}: ${money(old)} → ${money(p.price)}`); save();
      toast(t('Sugar 2 kg is now {p} SAR. Add it to the bill, then press Pay.', { p: money(p.price) })); render();
    },
    reset: () => openModal({ kind: 'confirm-reset' }),
    'reset-ok': () => { const s = db.session, l = db.settings.lang; db = clone(SEED); db.session = s; db.settings.lang = l; ui.cart = { lines: [], customerId: null, orderId: null }; ui.form = null; ui.pay = null; ui.ret = null; save(); closeModal(); toast(t('Demo data reset')); go('checkout'); },
    sync: () => {
      if (!ui.demo.server) return openModal({ kind: 'conn' });
      if (!ui.demo.internet) return toast(t('Internet is offline. Queued invoices will report when it returns.'), 'warn');
      const q = db.invoices.filter((i) => i.zatca === 'queued' || i.zatca === 'offline');
      q.forEach((i) => { i.zatca = 'reported'; });
      save(); toast(q.length ? t('Synced · {n} invoices reported to ZATCA', { n: q.length }) : t('Everything is up to date')); render();
    },
    'retry-conn': () => { if (ui.demo.server) { closeModal(); toast(t('Connected')); } else toast(t('Still unreachable. Your bill is safe on this device.'), 'bad'); },
    // checkout
    sel: (el) => { ui.sel = Number(el.dataset.i); render(); if (isPhone()) openModal({ kind: 'line', sheet: true }); },
    menu: () => openModal({ kind: 'menu', sheet: true }),
    browse: () => openModal({ kind: 'browse', wide: true, xwide: true, q: '', cat: 'fav' }),
    'browse-cat': (el) => { ui.modal.cat = el.dataset.id; ui.modal.q = ''; renderModal(); },
    add: (el) => {
      const p = prod(el.dataset.id);
      if (p.stock <= 0) return toast(t('{n} is out of stock.', { n: N(p) }), 'bad');
      if (p.weighted) return openModal({ kind: 'weigh', pid: p.id, w: '' });
      addToCart(p.id, 1); render();
      if (ui.modal && ui.modal.kind === 'browse') rerenderModalKeepFocus();
    },
    'demo-scan': (el) => { scan(el.dataset.code); },
    camera: () => cameraCheckout(),
    'print-sheet': () => { document.body.classList.add('print-sheet'); setTimeout(() => { window.print(); document.body.classList.remove('print-sheet'); }, 50); },
    'pk-cam': (el) => {
      const i = Number(el.dataset.i);
      CameraScanner.open({ title: t('Scan the pack barcode'), onCode: (code) => { ui.form.packs[i].barcode = code.replace(/\s/g, ''); setTimeout(render); return { close: true }; } });
    },
    'read-scale': () => { ui.modal.w = (0.4 + Math.random() * 1.6).toFixed(3); renderModal(); },
    'weigh-add': () => { addToCart(ui.modal.pid, r2(Number(ui.modal.w) * 1000) / 1000); closeModal(); render(); },
    qty: (el) => {
      const l = ui.cart.lines[el.dataset.i]; const step = l.weighted ? 0.25 : 1;
      l.qty = r2(l.qty + step * Number(el.dataset.d));
      if (l.qty <= 0) { ui.cart.lines.splice(el.dataset.i, 1); ui.sel = ui.cart.lines.length - 1; }
      else if (l.discount && l.discount >= l.price * l.qty) { l.discount = 0; l.reason = ''; }
      save(); render();
    },
    remove: (el) => { ui.cart.lines.splice(el.dataset.i, 1); ui.sel = ui.cart.lines.length - 1; save(); render(); },
    discount: (el) => openModal({ kind: 'discount', i: Number(el.dataset.i), mode: 'amt', value: '', reason: '' }),
    'disc-mode': (el) => { ui.modal.mode = el.dataset.m; renderModal(); },
    'disc-reason': (el) => { ui.modal.reason = el.dataset.r; renderModal(); },
    'disc-apply': () => {
      const m = ui.modal, l = ui.cart.lines[m.i], gross = r2(l.price * l.qty);
      const amount = m.mode === 'pct' ? r2(gross * Number(m.value) / 100) : r2(Number(m.value));
      if (isMgr()) { l.discount = amount; l.reason = m.reason; l.approvedBy = user().name; audit(`Discount ${money(amount)} on ${l.en} (${m.reason}) by ${user().name}`); save(); closeModal(); render(); return; }
      openModal({ kind: 'approve', i: m.i, line: l, amount, reason: m.reason, before: calc(ui.cart.lines).total, pin: '' });
    },
    'cust-pick': () => openModal({ kind: 'cust', q: '' }),
    'cust-clear': () => { ui.cart.customerId = null; save(); render(); },
    'cust-set': (el) => { ui.cart.customerId = el.dataset.id || null; save(); closeModal(); render(); },
    'new-cust': () => openModal({ kind: 'new-cust', d: {}, fromCart: !!(ui.modal && ui.modal.kind === 'cust') }),
    'nc-save': () => {
      const d = ui.modal.d, id = 'c' + (db.customers.length + 1) + Date.now().toString().slice(-3);
      db.customers.push({ id, en: d.en || d.ar, ar: d.ar || d.en, phone: d.phone, lang: d.ar ? 'ar' : 'en', reminders: 'WhatsApp', credit: !!d.credit, limit: d.credit ? 1000 : 0, terms: d.credit ? 'monthly' : 'none', termDays: d.credit ? 30 : 0, reminderDay: d.credit ? 25 : 0, vatNo: d.vatNo || undefined });
      if (ui.modal.fromCart) ui.cart.customerId = id;
      audit(`Customer created ${d.en || d.ar}`);
      save(); closeModal(); toast(t('Customer saved')); render();
    },

    clear: () => openModal({ kind: 'clear' }),
    'clear-ok': () => { ui.cart = { lines: [], customerId: null, orderId: null }; save(); closeModal(); render(); },
    pay: () => { if (!checkPriceChanges()) return; ui.pay = null; go('pay'); },
    'refresh-bill': () => { ui.cart.lines.forEach((l) => { const p = prod(l.pid); if (p) l.price = p.price; }); save(); closeModal(); toast(t('Bill refreshed with current shelf prices')); render(); },
    // payment
    method: (el) => { ui.pay.method = el.dataset.m; render(); },
    quick: (el) => { ui.pay.received = String(el.dataset.v); render(); },
    key: (el) => {
      const k = el.dataset.k2; let v = ui.pay.received || '';
      if (k === '⌫') v = v.slice(0, -1); else if (k === '.') { if (!v.includes('.')) v = (v || '0') + '.'; } else if (!/\.\d\d$/.test(v)) v += k;
      ui.pay.received = v; render();
    },
    'back-cart': () => go('checkout'),
    complete: () => { if (!checkPriceChanges()) return; startCompletion(); },
    'term-check': () => { ui.modal.checked = true; renderModal(); },
    'term-retry': () => { const amount = ui.modal.amount; openModal({ kind: 'terminal', amount }); setTimeout(() => { if (ui.modal && ui.modal.kind === 'terminal') { if (ui.demo.terminal) completeSale({ auth: 'AUTH-' + Math.floor(100000 + Math.random() * 899999) }); else openModal({ kind: 'terminal-unknown', amount }); } }, 1600); },
    // done
    print: (el) => printDoc(db.invoices.find((i) => i.id === el.dataset.id)),
    'print-retry': (el) => { if (ui.demo.printer) { closeModal(); printDoc(db.invoices.find((i) => i.id === el.dataset.id)); } else toast(t('Printer 1 is still out of paper.'), 'warn'); },
    'print-other': (el) => { closeModal(); toast(t('Sent to Counter printer 2')); $('#print-area').innerHTML = receipt(db.invoices.find((i) => i.id === el.dataset.id)); setTimeout(() => window.print(), 50); },
    send: (el) => openModal({ kind: 'send', invId: el.dataset.id, ch: 'WhatsApp' }),
    'send-ch': (el) => { ui.modal.ch = el.dataset.c; renderModal(); },
    'send-ok': () => { const m = ui.modal; const inv = db.invoices.find((i) => i.id === m.invId); const cu = inv && cust(inv.customerId); const to = m.to != null ? m.to : (cu ? cu.phone : ''); if (!to) return toast(t('Enter a phone number or email.'), 'warn'); closeModal(); toast(t('{i} sent by {c} to {to}', { i: `<b>${m.invId}</b>`, c: m.ch || 'WhatsApp', to: esc(to) })); },
    'new-sale': () => go('checkout'),
    // orders
    'translate-name': () => translateName(true),
    'rc-sample': () => { const R = ui.rcv; if (R.img) URL.revokeObjectURL(R.img); R.img = null; R.sample = true; rcRead(RC_SAMPLE); },
    'rc-add': () => {
      const R = ui.rcv; db.rcMemory = db.rcMemory || Object.assign({}, RC_MEMORY); let n = 0;
      R.lines.forEach((l) => {
        if (!l.on || !l.pid) return;
        const p = prod(l.pid), q = Number(l.qty) || 0; p.stock = r2(p.stock + q); n++;
        if (!l.barcode || !p.packs.some((k) => k.barcode === l.barcode)) db.rcMemory[R.sup + '|' + (l.code || rcNorm(l.desc))] = p.id;
      });
      audit(`Received delivery from ${(db.suppliers.find((x) => x.id === R.sup) || {}).en} · ${n} lines`);
      if (R.img) URL.revokeObjectURL(R.img);
      ui.rcv = { sup: R.sup, lines: [], img: null, sample: false, busy: false, status: '' };
      save(); toast(t('{n} products updated', { n })); go('inventory');
    },
    'order-view': (el) => openModal({ kind: 'order', id: el.dataset.id }),
    'order-step': (el) => { const o = db.orders.find((x) => x.id === el.dataset.id); o.status = el.dataset.s === 'prep' ? 'preparing' : 'ready'; save(); render(); if (ui.modal) renderModal(); },
    'order-load': (el) => {
      const o = db.orders.find((x) => x.id === el.dataset.id);
      ui.cart = { lines: o.lines.map((l) => Object.assign({ weighted: prod(l.pid) && prod(l.pid).weighted }, l)), customerId: o.customerId, orderId: o.id };
      ui.modal = null; renderModal(); save(); go('checkout');
    },
    // invoices
    'inv-filter': (el) => { ui.invFilter = el.dataset.f; render(); },
    'open-inv': (el, ev) => { if (ev.target.closest('a')) return; go('invoice/' + el.dataset.id); },
    'start-return': (el) => { const inv = db.invoices.find((i) => i.id === el.dataset.id); ui.ret = { invId: inv.id, qty: {}, reason: 'Damaged or expired', method: inv.outstanding > 0 ? 'balance' : (inv.payments[0] && inv.payments[0].method === 'card' ? 'card' : 'cash') }; go('returns'); },
    'ret-qty': (el) => { const R = ui.ret; const i = el.dataset.i; const inv = db.invoices.find((x) => x.id === R.invId); const step = inv.lines[i].weighted ? 0.25 : 1; R.qty[i] = Math.max(0, r2(Number(R.qty[i] || 0) + step * Number(el.dataset.d))); render(); },
    'ret-method': (el) => { ui.ret.method = el.dataset.m; render(); },
    'ret-cancel': (el, ev) => { if (ev) ev.preventDefault(); ui.ret = null; go('returns'); },
    'issue-cn': () => issueCreditNote(),
    // customers
    'open-cust': (el) => go('customer/' + el.dataset.id),
    'cust-tab': (el) => { ui.custTab = el.dataset.t; render(); },
    'pf-method': (el) => { ui.payForm.method = el.dataset.m; render(); },
    'alloc-toggle': () => { const F = ui.payForm; if (F.manual) F.manual = null; else { const c = cust(F.cid); const al = allocate(c, Math.min(Number(F.amount || 0), outstandingOf(c))); F.manual = {}; al.lines.forEach((x) => { F.manual[x.id] = String(x.amount); }); } render(); },
    'record-pay': () => recordPayment(),
    'credit-settings': (el) => { const c = cust(el.dataset.id); openModal({ kind: 'credit-settings', id: c.id, d: { credit: c.credit, limit: c.limit, terms: c.terms === 'none' ? 'monthly' : c.terms } }); },
    'cs-save': () => {
      const m = ui.modal, c = cust(m.id);
      c.credit = m.d.credit; c.limit = Number(m.d.limit) || 0; c.terms = c.credit ? m.d.terms : 'none'; c.termDays = { monthly: 30, net15: 15, net30: 30 }[m.d.terms] || 0; c.reminderDay = c.terms === 'monthly' ? 25 : 0;
      audit(`Credit settings ${c.en}: ${c.credit ? money(c.limit) + ' ' + c.terms : 'off'}`); save(); closeModal(); render();
    },
    statement: (el) => openModal({ kind: 'statement', id: el.dataset.id }),
    'statement-send': (el) => { const c = cust(el.dataset.id); closeModal(); toast(t('Statement sent by {r} to {p}', { r: c.reminders, p: esc(c.phone) })); },
    'sell-to': (el) => { ui.cart.customerId = el.dataset.id; save(); go('checkout'); },
    // products
    'prod-cat': (el) => { ui.prodCat = el.dataset.id; render(); },
    'open-prod': (el) => { ui.form = null; go('product/' + el.dataset.id); },
    vat: (el) => { ui.form.vat = el.dataset.v; render(); },
    'vat-locked': (el, ev) => { ev.preventDefault(); openModal({ kind: 'locked' }); },
    'pk-add': () => { ui.form.packs.push({ name: 'Carton', qty: 6, barcode: '' }); render(); },
    'pk-del': (el) => { ui.form.packs.splice(Number(el.dataset.i), 1); render(); },
    focus: (el) => { const x = document.getElementById(el.dataset.target); if (x) { x.select(); x.focus(); } },
    'save-prod': (el) => saveProduct(!!el.dataset.draft),
    'cancel-form': () => { ui.form = null; },
    // inventory
    receive: (el) => openModal({ kind: 'receive', pid: el.dataset.id || db.products[0].id, pack: (prod(el.dataset.id || db.products[0].id).packs.length - 1), qty: '' }),
    'rc-pack': (el) => { ui.modal.pack = Number(el.dataset.i); renderModal(); },
    'rc-ok': () => {
      const m = ui.modal, p = prod(m.pid), pk = p.packs[m.pack] || p.packs[0], add = r2(Number(m.qty) * pk.qty);
      p.stock = r2(p.stock + add); audit(`Received ${m.qty} × ${pk.name} of ${p.en} (+${add})`); save(); closeModal(); toast(t('{n} · +{a} added to stock', { n: esc(N(p)), a: qtyFmt(add, p.weighted) })); render();
    },
    // shift
    'close-shift': () => openModal({ kind: 'close-shift', counted: '' }),
    'shift-ok': () => { audit('Shift closed'); db.session = null; save(); closeModal(); location.hash = '#/checkout'; render(); },
  };

  const inputs = {
    'rc-sup': (el) => { ui.rcv.sup = el.value; render(); },
    'rc-on': (el) => { ui.rcv.lines[el.dataset.i].on = el.checked; render(); },
    'rc-pid': (el) => { const l = ui.rcv.lines[el.dataset.i]; l.pid = el.value; l.level = el.value ? 'exact' : 'none'; l.why = 'Manual'; render(); },
    'rc-qty': (el) => { ui.rcv.lines[el.dataset.i].qty = el.value; render(); },
    nextqty: (el) => { ui.nextQty = el.value.replace(/[^\d.]/g, ''); },
    'browse-q': (el) => { ui.modal.q = el.value; rerenderModalKeepFocus(); },
    qty: (el) => { const l = ui.cart.lines[el.dataset.i]; const v = Number(el.value); if (el.value !== '' && v > 0 && !el.value.endsWith('.')) { l.qty = r2(v); save(); render(); } },
    received: (el) => { ui.pay.received = el.value.replace(/[^\d.]/g, ''); render(); },
    ref: (el) => { ui.pay.ref = el.value; render(); },
    'split-cash': (el) => { ui.pay.cash = el.value.replace(/[^\d.]/g, ''); render(); },
    invq: (el) => { ui.invQ = el.value; render(); },
    prodq: (el) => { ui.prodQ = el.value; render(); },
    custq: (el) => { ui.custQ = el.value; render(); },
    'ret-qty': (el) => { ui.ret.qty[el.dataset.i] = Math.max(0, Number(el.value) || 0); render(); },
    'ret-reason': (el) => { ui.ret.reason = el.value; },
    'pf-amount': (el) => { ui.payForm.amount = el.value.replace(/[^\d.]/g, ''); if (ui.payForm.manual) ui.payForm.manual = null; render(); },
    'pf-ref': (el) => { ui.payForm.ref = el.value; render(); },
    'pf-date': (el) => { ui.payForm.date = el.value; },
    alloc: (el) => { ui.payForm.manual[el.dataset.id] = el.value.replace(/[^\d.]/g, ''); render(); },
    f: (el) => {
      ui.form[el.dataset.f] = el.value;
      if (el.dataset.f === 'ar') ui.form.arAuto = false;
      if (el.dataset.f === 'en' && (!ui.form.ar || ui.form.arAuto)) { clearTimeout(ui.trTimer); ui.trTimer = setTimeout(() => translateName(false), 800); }
      render();
    },
    active: (el) => { ui.form.active = el.checked; },
    weighted: (el) => { ui.form.weighted = el.checked; if (el.checked) { ui.form.unit = 'kg'; ui.form.packs[0].name = 'kg'; } render(); },
    fav: (el) => { ui.form.fav = el.checked; },
    'pk-name': (el) => { ui.form.packs[el.dataset.i].name = el.value; render(); },
    'pk-qty': (el) => { ui.form.packs[el.dataset.i].qty = el.value.replace(/[^\d]/g, ''); render(); },
    'pk-bc': (el) => { ui.form.packs[el.dataset.i].barcode = el.value.replace(/\s/g, ''); render(); },
    setting: (el) => { db.settings[el.dataset.f] = el.value; save(); },
    demo: (el) => {
      ui.demo[el.dataset.f] = el.checked;
      if (el.dataset.f === 'server' && !el.checked) openModal({ kind: 'conn' });
      if (el.dataset.f === 'server' && el.checked && ui.modal && ui.modal.kind === 'conn') closeModal();
      render();
    },
    // modal inputs
    'disc-val': (el) => { ui.modal.value = el.value.replace(/[^\d.]/g, ''); rerenderModalKeepFocus(); },
    weight: (el) => { ui.modal.w = el.value.replace(/[^\d.]/g, ''); rerenderModalKeepFocus(); },
    'cust-q': (el) => { ui.modal.q = el.value; rerenderModalKeepFocus(); },
    nc: (el) => { ui.modal.d[el.dataset.f] = el.value; rerenderModalKeepFocus(); },
    'nc-credit': (el) => { ui.modal.d.credit = el.checked; },
    'send-to': (el) => { ui.modal.to = el.value; },
    counted: (el) => { ui.modal.counted = el.value.replace(/[^\d.]/g, ''); rerenderModalKeepFocus(); },
    'rc-prod': (el) => { ui.modal.pid = el.value; ui.modal.pack = prod(el.value).packs.length - 1; renderModal(); },
    'rc-qty': (el) => { ui.modal.qty = el.value.replace(/[^\d.]/g, ''); rerenderModalKeepFocus(); },
    'cs-credit': (el) => { ui.modal.d.credit = el.checked; },
    cs: (el) => { ui.modal.d[el.dataset.f] = el.value; },
  };

  function scan(code) {
    const hit = findByBarcode(code);
    if (!hit) { toast(t('No product with barcode {c}', { c: esc(code) }), 'bad'); return; }
    if (hit.p.weighted && hit.qty === 1 && !/^21\d{11}$/.test(code)) { openModal({ kind: 'weigh', pid: hit.p.id, w: '' }); return; }
    const mult = Number(ui.nextQty) > 0 ? Number(ui.nextQty) : 1;
    ui.nextQty = '1';
    addToCart(hit.p.id, r2(hit.qty * mult), { silent: true });
    render();
  }

  // Continuous camera scanning at checkout: every read adds to the bill while the camera stays open.
  function cameraCheckout() {
    CameraScanner.open({
      continuous: true, title: t('Scan products'),
      onCode: (code) => {
        const hit = findByBarcode(code);
        if (!hit) return { ok: false, html: t('No product with barcode {c}', { c: esc(code) }) };
        const p = hit.p;
        if (p.stock <= 0) return { ok: false, html: t('{n} is out of stock.', { n: esc(N(p)) }) };
        if (p.weighted && hit.qty === 1 && !/^21\d{11}$/.test(code)) { setTimeout(() => openModal({ kind: 'weigh', pid: p.id, w: '' })); return { close: true }; }
        addToCart(p.id, hit.qty, { silent: true });
        render();
        const c = calc(ui.cart.lines);
        return { ok: true, html: `<b>${esc(N(p))}</b> × ${qtyFmt(hit.qty, p.weighted)} · ${money(r2(p.price * hit.qty))}<span class="cam-total">${t('Bill {a} SAR · {n} items', { a: money(c.total), n: r2(c.items) })}</span>` };
      },
      onClose: () => render(),
    });
  }

  // ---------------------------------------------------------------- events
  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-a]');
    if (!el) return;
    const fn = actions[el.dataset.a];
    if (!fn) return;
    if (el.tagName === 'BUTTON' || el.dataset.a === 'forgot') ev.preventDefault();
    fn(el, ev);
  });
  document.addEventListener('change', (ev) => { if (ev.target.id === 'rc-file' && ev.target.files[0]) { ui.rcv.sample = false; rcPhoto(ev.target.files[0]); } });
  const onInput = (ev) => {
    const el = ev.target.closest('[data-in]');
    if (!el) return;
    const fn = inputs[el.dataset.in];
    if (!fn) return;
    // Checkboxes and selects fire on change; text fields fire on input.
    const isToggle = el.type === 'checkbox' || el.tagName === 'SELECT' || el.type === 'date';
    if ((ev.type === 'change') !== isToggle) return;
    fn(el, ev);
  };
  document.addEventListener('input', onInput);
  document.addEventListener('change', onInput);
  document.addEventListener('submit', (ev) => {
    const f = ev.target.closest('[data-form]'); if (!f) return;
    ev.preventDefault();
    const data = Object.fromEntries(new FormData(f).entries());
    if (f.dataset.form === 'signin') signIn(data.user);
    if (f.dataset.form === 'scan') { if (data.code.trim()) scan(data.code.trim()); const s = $('#scan'); if (s) { s.value = ''; s.focus(); } }
    if (f.dataset.form === 'find-inv') {
      const q = (data.no || '').trim().toUpperCase();
      const inv = db.invoices.find((i) => i.type === 'sale' && (i.id === q || String(i.no) === q.replace(/^0+/, '') || i.id.endsWith(q.padStart(6, '0'))));
      if (!inv) return toast(t('No invoice {q}', { q: esc(q) }), 'bad');
      actions['start-return']({ dataset: { id: inv.id } });
    }
  });
  document.addEventListener('keydown', (ev) => {
    if (window.CameraScanner && CameraScanner.isOpen()) return;
    if (!ui.modal && db.session && route()[0] === 'checkout' && /^F[2-5]$/.test(ev.key)) {
      ev.preventDefault();
      const a = { F2: 'cust-pick', F3: 'browse', F5: 'pay' }[ev.key];
      const b = document.querySelector(`[data-a="${a}"]:not(:disabled)`); if (b) b.click();
      return;
    }
    if (ev.key === 'Escape' && ui.modal && ui.modal.kind !== 'terminal') closeModal();
    if (ui.modal && /^(pin-unlock|approve)$/.test(ui.modal.kind)) {
      if (/^\d$/.test(ev.key)) { const b = document.querySelector(`[data-a="pin-key"][data-k2="${ev.key}"]`); if (b) b.click(); }
      if (ev.key === 'Backspace') { const b = document.querySelector('[data-a="pin-key"][data-k2="⌫"]'); if (b) b.click(); }
      return;
    }
    if (ui.modal && ev.key === 'Enter' && ev.target.tagName === 'INPUT') {
      const primary = document.querySelector('#modal-root .btn.primary:not(:disabled)'); if (primary) { ev.preventDefault(); primary.click(); }
    }
    // A hardware scanner types fast and ends with Enter; keep the barcode field focused on checkout.
    if (!ui.modal && route()[0] === 'checkout' && db.session && /^\d$/.test(ev.key) && !/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)) { const s = $('#scan'); if (s) s.focus(); }
    if (!ui.modal && route()[0] === 'pay' && ui.pay && ui.pay.method === 'cash' && !/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)) {
      const k = ev.key === 'Backspace' ? '⌫' : ev.key;
      const b = document.querySelector(`[data-a="key"][data-k2="${k}"]`); if (b) { ev.preventDefault(); b.click(); }
      if (ev.key === 'Enter') { const c = document.querySelector('[data-a="complete"]:not(:disabled)'); if (c) c.click(); }
    }
  });
  window.addEventListener('hashchange', () => { if (route()[0] !== 'product') ui.form = null; if (route()[0] !== 'returns') ui.ret = null; window.scrollTo(0, 0); render(); });

  render();
})();
