/* Tamveen Driver: the delivery agent's app. Sign in with the username the store manager gave you,
   go on duty to share your location with the shop, pick up ready orders, deliver them and hand over
   the cash at the end of the shift. Same API as the POS and the customer app. */
(function () {
  'use strict';
  const KEY = 'tamveen-driver-v1';
  const APP_NAME = 'Tamveen';
  const API = window.TAMVEEN_API || (!window.Capacitor && /vercel\.app$|^localhost$|^127\./.test(location.hostname) ? '/api' : 'https://tamveen-pos.vercel.app/api');
  const SEND_EVERY = 15000; // ms between location updates while on duty
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => Number(n || 0).toFixed(2);
  const orderNo = (o) => String(o.id).replace(/^APP-/, '');
  const amount = (o) => (o.billedTotal != null ? o.billedTotal : o.total);
  const metres = (a, b) => {
    const R = 6371e3, r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLng = (b[1] - a[1]) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };

  // ---------------------------------------------------------------- state
  const saved = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } })();
  const S = {
    lang: saved.lang || ((navigator.language || '').startsWith('ar') ? 'ar' : 'en'),
    token: saved.token || null, driver: saved.driver || null,
    onDuty: !!saved.onDuty, handedAt: saved.handedAt || null, // cash delivered before handedAt is already with the cashier
  };
  const ui = { orders: null, tab: 'ready', pos: null, sheet: null, busy: false, shop: null, err: '' };
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* private mode */ } }

  // ---------------------------------------------------------------- words
  const AR = {
    'Driver': 'السائق', 'Sign in to start your shift': 'سجّل الدخول لبدء ورديتك', 'Username': 'اسم المستخدم', 'Password': 'كلمة المرور', 'Sign in': 'تسجيل الدخول',
    'No account? Ask the store manager to create one in the POS.': 'ليس لديك حساب؟ اطلب من مدير المتجر إنشاء حساب لك من نظام نقاط البيع.',
    'Hi {n}': 'أهلاً {n}', 'End shift': 'إنهاء الوردية', 'On duty': 'في الخدمة', 'Off duty': 'خارج الخدمة',
    'Sharing your location with the store, also with the screen off': 'نشارك موقعك مع المتجر، حتى والشاشة مطفأة',
    'Sharing your location with the store. Keep this app open.': 'نشارك موقعك مع المتجر. أبقِ التطبيق مفتوحاً.',
    'Turn on to share your location and take orders': 'شغّله لمشاركة موقعك واستلام الطلبات',
    'At the store': 'في المتجر', 'Returning': 'في طريق العودة', 'On a delivery': 'في توصيل', 'Waiting for GPS…': 'بانتظار الموقع…', 'Off duty ': 'خارج الخدمة',
    '{n} orders with you': '{n} طلبات معك', '1 order with you': 'طلب واحد معك',
    'Ready for pick-up': 'جاهزة للاستلام', 'My deliveries': 'توصيلاتي', 'Pick up': 'استلام', 'Open': 'فتح',
    'Cash': 'نقداً', 'Card': 'بطاقة', 'CASH': 'نقداً', 'CARD': 'بطاقة', '{n} items': '{n} أصناف', '1 item': 'صنف واحد',
    'Nothing is ready yet. New orders show up here.': 'لا توجد طلبات جاهزة الآن. ستظهر الطلبات الجديدة هنا.',
    'No deliveries with you.': 'لا توجد توصيلات معك.',
    'On a delivery · {i} of {n}': 'في توصيل · {i} من {n}', 'Collect cash': 'حصّل نقداً', 'Card on delivery': 'بطاقة عند الاستلام',
    'Note': 'ملاحظة', 'Navigate': 'الاتجاهات', 'Call customer': 'اتصل بالعميل', 'Delivered': 'تم التوصيل', 'Report a problem': 'الإبلاغ عن مشكلة',
    'Collect {a} SAR in cash': 'حصّل {a} ر.س نقداً', 'Amount collected': 'المبلغ المحصّل', 'Cash collected · delivered': 'تم التحصيل · تم التوصيل',
    'Take {a} SAR on the card terminal': 'خذ {a} ر.س على جهاز البطاقة', 'Paid by card · delivered': 'دُفع بالبطاقة · تم التوصيل', 'Cancel': 'إلغاء',
    'What went wrong?': 'ما المشكلة؟', 'Customer is not answering': 'العميل لا يرد', 'Address is wrong or hard to find': 'العنوان خطأ أو صعب الوصول',
    'Customer refused the order': 'العميل رفض الطلب', 'Something else': 'شيء آخر', 'Tell the store (optional)': 'أخبر المتجر (اختياري)',
    'Send to the store': 'أرسل للمتجر', 'Bring it back to the store': 'أعِد الطلب إلى المتجر', 'The store has been told.': 'تم إبلاغ المتجر.',
    'End of shift': 'نهاية الوردية', 'Changes to At the store when you are back near the shop': 'تتغير إلى "في المتجر" عند عودتك قرب المتجر',
    'You are at the store': 'أنت في المتجر', 'Finish your deliveries first': 'أكمل توصيلاتك أولاً',
    'Cash to hand over': 'النقد المطلوب تسليمه', 'Give this to the cashier before you go off duty.': 'سلّم هذا المبلغ للكاشير قبل إنهاء الخدمة.',
    'Delivered today': 'تم توصيلها اليوم', 'Card, paid on terminal': 'بطاقة، دُفعت على الجهاز', 'handed over': 'تم التسليم',
    'Cash handed over · go off duty': 'تم تسليم النقد · إنهاء الخدمة', 'Go off duty': 'إنهاء الخدمة', 'Nothing delivered yet today.': 'لم توصّل أي طلب اليوم.',
    'Go on duty first so the store and the customer can follow you.': 'شغّل وضع الخدمة أولاً حتى يتابعك المتجر والعميل.',
    'Turn on location for this app to go on duty.': 'شغّل الموقع لهذا التطبيق لبدء الخدمة.', 'Picked up. Drive safe.': 'تم الاستلام. قد بأمان.',
    'Delivered. Thank you.': 'تم التوصيل. شكراً لك.', 'You are off duty.': 'أنت خارج الخدمة الآن.', 'Sign out': 'تسجيل الخروج',
    'No internet connection.': 'لا يوجد اتصال بالإنترنت.', 'Something went wrong. Please try again.': 'حدث خطأ. حاول مرة أخرى.',
    'Wrong username or password': 'اسم المستخدم أو كلمة المرور غير صحيحة', 'This order is not ready yet': 'هذا الطلب غير جاهز بعد',
    'Another driver already took this order': 'سائق آخر استلم هذا الطلب', 'That step is not possible now': 'هذه الخطوة غير ممكنة الآن', 'Order not found': 'الطلب غير موجود',
    'Customer voice note': 'ملاحظة صوتية من العميل', 'Riyadh': 'الرياض', 'Tamveen Driver': 'سائق تموين',
  };
  const isAr = () => S.lang === 'ar';
  const t = (s, v) => { let o = (isAr() && AR[s]) || s; if (v) for (const k in v) o = o.split('{' + k + '}').join(v[k]); return o; };
  const items = (o) => { const n = (o.lines || []).length; return n === 1 ? t('1 item') : t('{n} items', { n }); };
  const name = () => (S.driver ? (isAr() && S.driver.nameAr) || S.driver.name : '');

  // ---------------------------------------------------------------- icons
  const ico = (d, w = 20, sw = 1.9, extra = '') => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
  const I = {
    back: ico('<path d="M15 18l-6-6 6-6"/>', 22, 2, 'class="flip"'), arrow: ico('<path d="M5 12h14M13 6l6 6-6 6"/>', 18, 2, 'class="flip"'),
    nav: ico('<path d="M3 11l18-8-8 18-2-8z"/>', 18), phone: ico('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>', 18),
    store: ico('<path d="M4 10h16l-1-5H5zM5 10v9h14v-9M9 19v-5h6v5"/>', 18),
    play: '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/></svg>',
    pause: '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>',
    bigpin: '<svg width="30" height="40" viewBox="0 0 40 52" aria-hidden="true"><path d="M20 0C9 0 0 9 0 20c0 14 20 32 20 32s20-18 20-32C40 9 31 0 20 0z" fill="#105448"/><circle cx="20" cy="19" r="7" fill="#fff"/></svg>',
  };

  // ---------------------------------------------------------------- api
  async function api(path, opts = {}) {
    let r;
    try {
      r = await fetch(API + path, { method: opts.method || 'GET', headers: Object.assign({ 'Content-Type': 'application/json' }, S.token ? { Authorization: 'Bearer ' + S.token } : {}), body: opts.body ? JSON.stringify(opts.body) : undefined });
    } catch (e) { throw new Error(t('No internet connection.')); }
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && S.token) { signOut(true); }
    if (!r.ok) throw new Error(j.error ? t(j.error) : t('Something went wrong. Please try again.'));
    return j;
  }
  async function loadOrders() {
    if (!S.token) return;
    try { ui.orders = (await api('/orders')).orders; } catch (e) { if (!ui.orders) toast(e.message, 'bad'); }
    if (!ui.sheet) render();
  }
  async function loadShop() { try { ui.shop = (await api('/catalog')).shop; } catch (e) { /* the status line just waits */ } }
  const me = () => (S.driver && S.driver.id) || '';
  const readyList = () => (ui.orders || []).filter((o) => o.status === 'ready' && !o.agentId);
  const myList = () => (ui.orders || []).filter((o) => o.agentId === me() && o.status === 'out');
  const deliveredAt = (o) => { const h = (o.history || []).slice().reverse().find((x) => x.s === 'delivered'); return h ? h.at : o.at; };
  const today = (iso) => new Date(iso).toDateString() === new Date().toDateString();
  const deliveredToday = () => (ui.orders || []).filter((o) => o.agentId === me() && o.status === 'delivered' && today(deliveredAt(o))).sort((a, b) => deliveredAt(b).localeCompare(deliveredAt(a)));
  const cashToHand = () => deliveredToday().filter((o) => o.payment === 'cash' && (!S.handedAt || deliveredAt(o) > S.handedAt))
    .reduce((s, o) => s + (o.collected != null ? o.collected : amount(o)), 0);

  // Where the driver is, in the same words the store sees on its map.
  function status() {
    if (!S.onDuty) return { k: 'off', text: t('Off duty') };
    if (myList().length) return { k: 'delivering', text: t('On a delivery') };
    if (!ui.pos) return { k: 'wait', text: t('Waiting for GPS…') };
    if (ui.shop && metres([ui.pos.lat, ui.pos.lng], [ui.shop.lat, ui.shop.lng]) < 150) return { k: 'store', text: t('At the store') };
    return { k: 'returning', text: t('Returning') };
  }

  // ---------------------------------------------------------------- location while on duty
  // Inside the native driver app a background-location plugin keeps updates going with the screen off;
  // in the browser we watch the position and keep the screen awake.
  const BG = () => window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.BackgroundGeolocation;
  const loc = { watch: null, timer: null, sentAt: 0, wake: null };
  function onFix(lat, lng, acc, heading) {
    ui.pos = { lat, lng, acc, heading, at: Date.now() };
    if (Date.now() - loc.sentAt > SEND_EVERY - 1000) sendFix();
    if (route()[0] === 'job') mountJobMap(route()[1]);
  }
  function sendFix() {
    if (!S.onDuty || !ui.pos || !S.token) return;
    loc.sentAt = Date.now();
    api('/fleet', { method: 'POST', body: { onDuty: true, lat: ui.pos.lat, lng: ui.pos.lng, acc: ui.pos.acc, heading: ui.pos.heading } }).catch(() => { /* next fix retries */ });
  }
  async function startLocation() {
    stopLocation();
    const bg = BG();
    if (bg) {
      loc.watch = await bg.addWatcher({ backgroundMessage: t('Sharing your location with the store, also with the screen off'), backgroundTitle: APP_NAME, requestPermissions: true, stale: false, distanceFilter: 15 },
        (p, err) => { if (err) { if (err.code === 'NOT_AUTHORIZED') failLocation(); return; } onFix(p.latitude, p.longitude, p.accuracy, p.bearing); });
      loc.bg = true;
    } else if (navigator.geolocation) {
      loc.watch = navigator.geolocation.watchPosition((p) => onFix(p.coords.latitude, p.coords.longitude, p.coords.accuracy, p.coords.heading),
        (e) => { if (e.code === 1) failLocation(); }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 });
      keepAwake();
    } else return failLocation();
    loc.timer = setInterval(sendFix, SEND_EVERY);
  }
  function stopLocation() {
    if (loc.watch != null) { if (loc.bg) BG().removeWatcher({ id: loc.watch }); else navigator.geolocation.clearWatch(loc.watch); }
    loc.watch = null; loc.bg = false; clearInterval(loc.timer);
    if (loc.wake) { loc.wake.release().catch(() => {}); loc.wake = null; }
  }
  function keepAwake() { if (navigator.wakeLock && !document.hidden) navigator.wakeLock.request('screen').then((w) => { loc.wake = w; }).catch(() => {}); }
  function failLocation() { S.onDuty = false; persist(); stopLocation(); toast(t('Turn on location for this app to go on duty.'), 'bad'); render(); }
  async function setDuty(on) {
    S.onDuty = on; persist(); render();
    if (on) return startLocation();
    stopLocation(); ui.pos = null;
    try { await api('/fleet', { method: 'POST', body: { onDuty: false } }); } catch (e) { toast(e.message, 'bad'); }
  }

  // ---------------------------------------------------------------- routes
  const route = () => (location.hash.replace(/^#\/?/, '') || 'home').split('/').map(decodeURIComponent);
  const go = (h) => { location.hash = '#/' + h; };

  function viewSignin() {
    return `<div class="screen dsign">
      <div class="top"><button class="lang" data-a="lang" aria-label="Language">${isAr() ? 'EN' : 'ع'}</button></div>
      <div class="hero"><img src="../assets/logo.svg" alt="" width="64" height="64"><div class="kicker">${t('Tamveen Driver')}</div><h1>${t('Sign in to start your shift')}</h1></div>
      <form class="form" data-form="signin">
        <label class="field"><span>${t('Username')}</span><input class="in" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required></label>
        <label class="field"><span>${t('Password')}</span><input class="in" name="password" type="password" autocomplete="current-password" required></label>
        ${ui.err ? `<div class="err">${esc(ui.err)}</div>` : ''}
        <button class="btn" type="submit" ${ui.busy ? 'disabled' : ''}>${t('Sign in')} ${I.arrow}</button>
        <p class="fine">${t('No account? Ask the store manager to create one in the POS.')}</p>
      </form></div>`;
  }

  function card(o, mine) {
    const pay = o.payment === 'card' ? t('CARD') : t('CASH');
    return `<article class="job">
      <div class="r"><div><h3>#${esc(orderNo(o))} · ${esc(o.customer && o.customer.name)}</h3><small>${esc((o.address && o.address.district) || '')} · ${items(o)}</small></div>
        <div class="amt"><small>${pay}</small><b>SAR ${money(amount(o))}</b></div></div>
      ${mine ? `<button class="btn sm wide" data-a="open" data-id="${esc(o.id)}">${t('Open')} ${I.arrow}</button>`
        : `<button class="btn sm wide" data-a="pickup" data-id="${esc(o.id)}" ${ui.busy ? 'disabled' : ''}>${t('Pick up')} ${I.arrow}</button>`}
    </article>`;
  }
  function viewHome() {
    const st = status(), mine = myList(), ready = readyList();
    const withYou = mine.length === 1 ? t('1 order with you') : t('{n} orders with you', { n: mine.length });
    const list = ui.tab === 'mine' ? mine : ready;
    return `<div class="screen dhome">
      <header class="dh"><div><div class="kicker">${t('Tamveen Driver')}</div><h1>${t('Hi {n}', { n: esc(name()) })}</h1></div>
        <button class="pillbtn" data-a="shift">${t('End shift')}</button></header>
      <button class="duty ${S.onDuty ? 'on' : ''}" data-a="duty" role="switch" aria-checked="${S.onDuty}">
        <span><b>${t(S.onDuty ? 'On duty' : 'Off duty')}</b><small>${S.onDuty ? t(BG() ? 'Sharing your location with the store, also with the screen off' : 'Sharing your location with the store. Keep this app open.') : t('Turn on to share your location and take orders')}</small></span>
        <i class="tg" aria-hidden="true"></i></button>
      <p class="stline"><i class="st-${st.k}"></i><b>${st.text}</b> · ${withYou}</p>
      <div class="tabs" role="tablist">
        <button role="tab" class="${ui.tab !== 'mine' ? 'on' : ''}" data-a="tab" data-v="ready">${t('Ready for pick-up')} · ${ready.length}</button>
        <button role="tab" class="${ui.tab === 'mine' ? 'on' : ''}" data-a="tab" data-v="mine">${t('My deliveries')} · ${mine.length}</button></div>
      <div class="jobs">${ui.orders == null ? '<div class="skel"></div><div class="skel"></div>'
        : list.length ? list.map((o) => card(o, ui.tab === 'mine')).join('') : `<p class="empty">${t(ui.tab === 'mine' ? 'No deliveries with you.' : 'Nothing is ready yet. New orders show up here.')}</p>`}</div>
      <button class="linkbtn so" data-a="signout">${t('Sign out')}</button>
    </div>`;
  }

  function viewJob(id) {
    const mine = myList(), o = mine.find((x) => x.id === id);
    if (!o) { setTimeout(() => go('home')); return '<div class="screen"></div>'; }
    const a = o.address || {}, i = mine.indexOf(o) + 1;
    const cash = o.payment !== 'card', note = [a.notes, o.note].filter(Boolean).join(' · ');
    const dest = a.lat != null ? `${a.lat},${a.lng}` : encodeURIComponent([a.house, a.street, a.district, a.city].filter(Boolean).join(', '));
    const tel = ((o.customer && o.customer.phone) || '').replace(/[^\d+]/g, '');
    return `<div class="screen trk">
      <div class="trk-map" id="job-map"><button class="lbtn" data-a="home" aria-label="Back">${I.back}</button><div class="live-pill"><i></i>${t('On a delivery · {i} of {n}', { i, n: mine.length })}</div></div>
      <section class="sheet-card"><span class="grab"></span>
        <div class="jhead"><div><div class="kicker">#${esc(orderNo(o))} · ${items(o)}</div><h1>${esc(o.customer && o.customer.name)}</h1>
          <p class="addr">${esc([a.house, a.street].filter(Boolean).join(', '))}<br>${esc([a.district, a.city && t(a.city)].filter(Boolean).join(', '))}</p></div>
          <div class="collect ${cash ? '' : 'card'}"><small>${t(cash ? 'Collect cash' : 'Card on delivery')}</small><b>SAR ${money(amount(o))}</b></div></div>
        ${note ? `<div class="note"><b>${t('Note')}:</b> ${esc(note)}</div>` : ''}
        ${o.voice ? `<button class="voice" data-a="voice" data-v="${esc(o.voice.id)}"><span class="vbtn play">${voiceOn === o.voice.id ? I.pause : I.play}</span><span class="vt"><b>${t('Customer voice note')}</b> · ${Math.floor(o.voice.secs / 60)}:${String(o.voice.secs % 60).padStart(2, '0')}</span></button>` : ''}
        <div class="two"><a class="btn outline sm" href="https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving" target="_blank" rel="noopener">${I.nav}${t('Navigate')}</a>
          <a class="btn outline sm ${tel ? '' : 'off'}" ${tel ? `href="tel:${esc(tel)}"` : 'aria-disabled="true"'}>${I.phone}${t('Call customer')}</a></div>
        <button class="btn" data-a="deliver" data-id="${esc(o.id)}">${t('Delivered')} ${I.arrow}</button>
        <button class="linkbtn red" data-a="problem" data-id="${esc(o.id)}">${t('Report a problem')}</button>
      </section></div>`;
  }

  function viewShift() {
    const st = status(), done = deliveredToday(), cash = cashToHand(), busy = myList().length > 0;
    const sub = st.k === 'store' ? t('You are at the store') : busy ? t('Finish your deliveries first') : t('Changes to At the store when you are back near the shop');
    const row = (o) => {
      const card = o.payment === 'card', handed = !card && S.handedAt && deliveredAt(o) <= S.handedAt;
      return `<li class="${card || handed ? 'dim' : ''}"><span><b>#${esc(orderNo(o))}</b> · ${card ? t('Card, paid on terminal') : t('Cash') + (handed ? ' · ' + t('handed over') : '')}</span><b>SAR ${money(o.collected != null && !card ? o.collected : amount(o))}</b></li>`;
    };
    return `<div class="screen dshift">
      <header class="sh"><button class="lbtn" data-a="home" aria-label="Back">${I.back}</button><h1>${t('End of shift')}</h1></header>
      <div class="stcard"><i class="st-${st.k}"></i><div><b>${st.text}</b><small>${sub}</small></div></div>
      <div class="cashcard"><small>${t('Cash to hand over')}</small><b>SAR ${money(cash)}</b><span>${t('Give this to the cashier before you go off duty.')}</span></div>
      <h2 class="kicker">${t('Delivered today')} · ${done.length}</h2>
      ${done.length ? `<ul class="dlist">${done.map(row).join('')}</ul>` : `<p class="empty">${t('Nothing delivered yet today.')}</p>`}
      <div class="dock"><button class="btn" data-a="handover" ${busy || ui.busy ? 'disabled' : ''}>${cash > 0 ? t('Cash handed over · go off duty') : t('Go off duty')}</button></div>
    </div>`;
  }

  // The customer's voice note, fetched with the driver's token and played in place.
  let voiceOn = null, voiceAudio = null;
  async function playVoice(id) {
    if (voiceAudio && voiceOn === id) { voiceAudio.pause(); return; }
    if (voiceAudio) voiceAudio.pause();
    try {
      const r = await fetch(API + '/voice?id=' + encodeURIComponent(id), { headers: { Authorization: 'Bearer ' + S.token } });
      if (!r.ok) throw new Error();
      voiceAudio = new Audio(URL.createObjectURL(await r.blob()));
      voiceAudio.onplay = () => { voiceOn = id; render(); };
      voiceAudio.onpause = voiceAudio.onended = () => { voiceOn = null; render(); };
      await voiceAudio.play();
    } catch (e) { toast(t('Something went wrong. Please try again.'), 'bad'); }
  }

  // ---------------------------------------------------------------- sheets
  const PROBLEMS = ['Customer is not answering', 'Address is wrong or hard to find', 'Customer refused the order', 'Something else'];
  function sheetHtml() {
    const s = ui.sheet; if (!s) return '';
    const o = (ui.orders || []).find((x) => x.id === s.id); if (!o) return '';
    let b = '';
    if (s.kind === 'deliver' && o.payment !== 'card') {
      b = `<span class="grab"></span><h2>${t('Collect {a} SAR in cash', { a: money(amount(o)) })}</h2>
        <form data-form="deliver" style="display:flex;flex-direction:column;gap:12px"><label class="field"><span>${t('Amount collected')}</span>
        <input class="in" name="collected" type="number" inputmode="decimal" step="0.01" min="0" value="${money(amount(o))}"></label>
        <button class="btn" type="submit" ${ui.busy ? 'disabled' : ''}>${t('Cash collected · delivered')}</button><button class="btn ghost" type="button" data-a="sheet-close">${t('Cancel')}</button></form>`;
    } else if (s.kind === 'deliver') {
      b = `<span class="grab"></span><h2>${t('Take {a} SAR on the card terminal', { a: money(amount(o)) })}</h2>
        <button class="btn" data-a="deliver-ok" ${ui.busy ? 'disabled' : ''}>${t('Paid by card · delivered')}</button><button class="btn ghost" data-a="sheet-close">${t('Cancel')}</button>`;
    } else if (s.kind === 'problem') {
      b = `<span class="grab"></span><h2>${t('What went wrong?')}</h2>
        <form data-form="problem" style="display:flex;flex-direction:column;gap:10px">
        ${PROBLEMS.map((p, i) => `<label class="radio ${(s.pick || 0) === i ? 'on' : ''}"><input type="radio" name="why" value="${i}" ${(s.pick || 0) === i ? 'checked' : ''} class="sr" data-a="pick" data-v="${i}"><span class="o"></span><span><b>${t(p)}</b></span></label>`).join('')}
        <input class="in" name="note" placeholder="${esc(t('Tell the store (optional)'))}">
        <button class="btn" type="submit" ${ui.busy ? 'disabled' : ''}>${t('Send to the store')}</button>
        <button class="btn ghost" type="button" data-a="unassign" ${ui.busy ? 'disabled' : ''}>${t('Bring it back to the store')}</button></form>`;
    }
    return `<div class="veil" data-a="veil"><div class="sheet" role="dialog" aria-modal="true">${b}</div></div>`;
  }

  // ---------------------------------------------------------------- map (Leaflet, only on the delivery screen)
  const M = { el: null, map: null, layers: [], id: null, loading: null };
  const TILES = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
  function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
  function loadLeaflet() {
    if (window.L) return Promise.resolve();
    if (!M.loading) { const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '../js/leaflet/leaflet.css'; document.head.appendChild(css); M.loading = loadScript('../js/leaflet/leaflet.js'); }
    return M.loading;
  }
  function mountJobMap(id) {
    const slot = $('#job-map'), o = myList().find((x) => x.id === id); if (!slot || !o) return;
    if (!M.el) { M.el = document.createElement('div'); M.el.className = 'map'; }
    if (M.el.parentNode !== slot) slot.prepend(M.el);
    const a = o.address || {}, home = a.lat != null ? [a.lat, a.lng] : null, sh = ui.shop;
    const here = ui.pos ? [ui.pos.lat, ui.pos.lng] : sh ? [sh.lat, sh.lng] : home;
    loadLeaflet().then(() => {
      if (!M.map) { M.map = L.map(M.el, { zoomControl: false }); L.tileLayer(TILES, { maxZoom: 19, subdomains: 'abcd', attribution: '&copy; OpenStreetMap &copy; CARTO' }).addTo(M.map); }
      M.map.invalidateSize();
      M.layers.forEach((l) => l.remove()); M.layers = [];
      const add = (l) => { l.addTo(M.map); M.layers.push(l); };
      const icon = (html, size, anchor) => L.divIcon({ className: '', html, iconSize: size, iconAnchor: anchor });
      if (sh) add(L.marker([sh.lat, sh.lng], { icon: icon(`<span class="mk-shop">${I.store}</span>`, [36, 36], [18, 18]) }));
      if (home) add(L.marker(home, { icon: icon(I.bigpin, [30, 40], [15, 40]) }));
      if (here && ui.pos) add(L.marker(here, { icon: icon('<span class="mk-me"></span>', [30, 30], [15, 15]) }));
      if (home && here) add(L.polyline([here, home], { color: '#105448', weight: 4, opacity: 0.9, lineCap: 'round' }));
      if (M.id !== id) { const pts = [here, home].filter(Boolean); if (pts.length > 1) M.map.fitBounds(pts, { padding: [70, 70], maxZoom: 16 }); else M.map.setView(pts[0] || [24.69, 46.68], 15); M.id = id; }
    });
  }

  // ---------------------------------------------------------------- render
  let toastTimer = null;
  function toast(msg, kind) {
    let el = $('#toast'); if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.className = 'toast ' + (kind || ''); el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2800);
  }
  function render() {
    document.documentElement.lang = S.lang; document.documentElement.dir = isAr() ? 'rtl' : 'ltr';
    if (M.el && M.el.parentNode) M.el.remove();
    if (!S.token) { $('#app').innerHTML = viewSignin(); return; }
    const [r, id] = route();
    const views = { home: viewHome, job: () => viewJob(id), shift: viewShift };
    $('#app').innerHTML = (views[r] || viewHome)() + sheetHtml();
    if (r === 'job') mountJobMap(id);
  }

  // ---------------------------------------------------------------- actions
  async function patch(id, action, extra) {
    ui.busy = true; render();
    try { const { order } = await api('/orders', { method: 'PATCH', body: Object.assign({ id, action }, extra) }); ui.orders = (ui.orders || []).map((x) => (x.id === id ? order : x)); return order; }
    finally { ui.busy = false; }
  }
  function signOut(expired) {
    if (S.onDuty && !expired) api('/fleet', { method: 'POST', body: { onDuty: false } }).catch(() => {});
    stopLocation(); S.token = null; S.driver = null; S.onDuty = false; ui.orders = null; persist(); render();
  }
  const actions = {
    lang: () => { S.lang = isAr() ? 'en' : 'ar'; persist(); render(); },
    duty: () => setDuty(!S.onDuty),
    tab: (el) => { ui.tab = el.dataset.v; render(); },
    home: () => go('home'), shift: () => go('shift'), open: (el) => go('job/' + el.dataset.id),
    signout: () => signOut(),
    voice: (el) => playVoice(el.dataset.v),
    pickup: async (el) => {
      if (!S.onDuty) return toast(t('Go on duty first so the store and the customer can follow you.'), 'bad');
      try { await patch(el.dataset.id, 'pickup'); toast(t('Picked up. Drive safe.')); go('job/' + el.dataset.id); }
      catch (e) { toast(e.message, 'bad'); loadOrders(); }
    },
    deliver: (el) => { ui.sheet = { kind: 'deliver', id: el.dataset.id }; render(); },
    'deliver-ok': () => delivered(null),
    problem: (el) => { ui.sheet = { kind: 'problem', id: el.dataset.id, pick: 0 }; render(); },
    pick: (el) => { ui.sheet.pick = Number(el.dataset.v); document.querySelectorAll('.sheet .radio').forEach((r, i) => r.classList.toggle('on', i === ui.sheet.pick)); },
    unassign: async () => {
      const id = ui.sheet.id, why = t(PROBLEMS[ui.sheet.pick || 0]);
      try { await patch(id, 'problem', { note: why }); await patch(id, 'unassign'); ui.sheet = null; toast(t('The store has been told.')); go('home'); render(); }
      catch (e) { toast(e.message, 'bad'); render(); }
    },
    'sheet-close': () => { ui.sheet = null; render(); },
    veil: (el, ev) => { if (ev.target === el) { ui.sheet = null; render(); } },
    handover: async () => { S.handedAt = new Date().toISOString(); persist(); await setDuty(false); toast(t('You are off duty.')); go('home'); },
  };
  async function delivered(collected) {
    const id = ui.sheet.id;
    try { await patch(id, 'delivered', collected != null ? { collected } : {}); ui.sheet = null; toast(t('Delivered. Thank you.')); go(myList().length ? 'job/' + myList()[0].id : 'home'); render(); }
    catch (e) { toast(e.message, 'bad'); render(); }
  }
  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-a]'); if (!el) return;
    const f = actions[el.dataset.a]; if (!f) return;
    if (el.dataset.a === 'pick' && ev.target !== el) return; // the label click re-fires on the radio
    f(el, ev);
  });
  document.addEventListener('submit', async (ev) => {
    const f = ev.target.dataset.form; if (!f) return;
    ev.preventDefault();
    const d = Object.fromEntries(new FormData(ev.target));
    if (f === 'signin') {
      ui.busy = true; ui.err = ''; render();
      try {
        const r = await api('/auth', { method: 'POST', body: { role: 'driver', username: d.username.trim().toLowerCase(), password: d.password } });
        S.token = r.token; S.driver = r.driver; persist(); ui.busy = false; go('home'); render(); loadOrders();
      } catch (e) { ui.busy = false; ui.err = e.message; render(); }
    } else if (f === 'deliver') delivered(Number(d.collected));
    else if (f === 'problem') {
      const note = [t(PROBLEMS[ui.sheet.pick || 0]), d.note].filter(Boolean).join(': ');
      try { await patch(ui.sheet.id, 'problem', { note }); ui.sheet = null; toast(t('The store has been told.')); render(); } catch (e) { toast(e.message, 'bad'); render(); }
    }
  });
  window.addEventListener('hashchange', () => { ui.sheet = null; window.scrollTo(0, 0); render(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { loadOrders(); if (S.onDuty && !loc.bg) keepAwake(); } });
  setInterval(() => { if (!document.hidden) loadOrders(); }, 10000);

  render(); loadShop().then(render);
  if (S.token) { loadOrders(); if (S.onDuty) startLocation(); }
})();
