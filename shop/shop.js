/* Tamveen customer app: browse the shop's products, sign in with Apple or Google at checkout,
   set a delivery address on a map, place the order and follow the driver live.
   No build step. Talks to the shared order service in /api. */
(function () {
  'use strict';

  const API = window.TAMVEEN_API || (!window.Capacitor && /(^|\.)vercel\.app$|^localhost$|^127\./.test(location.hostname) ? '/api' : 'https://tamveen-pos.vercel.app/api');
  const KEY = 'tamveen-shop-v1';
  const APP_NAME = 'تَمْوِين'; // the app's name everywhere, in both languages
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const money = (n) => Number(n || 0).toFixed(2);

  // ---------------------------------------------------------------- state
  const saved = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } })();
  const S = {
    lang: saved.lang || ((navigator.language || '').startsWith('ar') ? 'ar' : 'en'),
    basket: saved.basket || {}, // pid -> qty in the product's base unit
    token: saved.token || null, profile: saved.profile || null,
    note: saved.note || '', payment: saved.payment || 'cash', addressId: saved.addressId || null,
  };
  const ui = { catalog: null, cat: null, q: '', orders: null, sheet: null, signin: null, form: null, auth: null, pack: {}, pdQty: {}, busy: false };
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify({ lang: S.lang, basket: S.basket, token: S.token, profile: S.profile, note: S.note, payment: S.payment, addressId: S.addressId })); } catch (e) { /* private mode */ }
  }

  // ---------------------------------------------------------------- words
  const AR = {
    'Search milk, حليب, rice…': 'ابحث: حليب، milk، أرز…', 'Deliver to': 'التوصيل إلى', 'Add your address': 'أضف عنوانك', 'All products': 'كل المنتجات', 'Prices include VAT': 'الأسعار شاملة الضريبة',
    'Out of stock': 'غير متوفر', '{n} items': '{n} منتجات', '1 item': 'منتج واحد', 'View basket': 'عرض السلة', 'Product details': 'تفاصيل المنتج', 'Product photo': 'صورة المنتج',
    'per piece': 'للحبة', 'per pack': 'للعبوة', 'per kg · approx.': 'للكيلو · وزن تقريبي', 'per bag': 'للكيس', 'per tray': 'للطبق', 'per box': 'للعلبة', 'per bottle': 'للعبوة', 'per tub': 'للعلبة',
    'VAT included': 'شامل الضريبة', 'Pack size': 'حجم العبوة', 'Add · {p} SAR': 'أضف · {p} ر.س', 'Basket': 'السلة', 'Your basket is empty.': 'سلتك فارغة.', 'Start shopping': 'ابدأ التسوق',
    'each': 'للحبة', '/ kg · approx. weight': '/ كجم · وزن تقريبي', 'Deliver to': 'التوصيل إلى', 'Change': 'تغيير', 'Add a delivery address': 'أضف عنوان التوصيل',
    'Notes for your order': 'ملاحظات على طلبك', 'Anything the shop or driver should know: a brand you prefer, a swap if something is out, the gate code…': 'أي شيء يحتاج المتجر أو المندوب معرفته: ماركة تفضلها، بديل إذا نفد صنف، رمز البوابة…',
    'Record a voice note': 'سجّل ملاحظة صوتية', 'Talk to the shop in Arabic or English': 'تحدث مع المتجر بالعربي أو الإنجليزي', 'Recording…': 'جارٍ التسجيل…', 'Stop': 'إيقاف', 'Play': 'تشغيل',
    'Voice note': 'ملاحظة صوتية', 'Delete voice note': 'حذف الملاحظة الصوتية', 'Voice notes are not supported on this device.': 'الملاحظات الصوتية غير مدعومة على هذا الجهاز.',
    'Allow the microphone to record a voice note.': 'اسمح باستخدام الميكروفون لتسجيل ملاحظة صوتية.', 'The recording is too long': 'التسجيل طويل جداً', 'The recording is empty': 'التسجيل فارغ', 'This recording format is not supported': 'صيغة التسجيل غير مدعومة',
    'Delivery time': 'وقت التوصيل', 'As soon as possible': 'في أقرب وقت',
    'Payment': 'الدفع', 'Cash on delivery': 'الدفع نقداً عند الاستلام', 'Pay the driver in cash': 'ادفع للمندوب نقداً', 'Card on delivery': 'بطاقة عند الاستلام', 'The driver brings a card terminal': 'يحضر المندوب جهاز الدفع',
    'Subtotal': 'المجموع الفرعي', 'Delivery fee': 'رسوم التوصيل', 'Free': 'مجاناً', 'VAT 15% (included)': 'ضريبة ١٥٪ (مشمولة)', 'Total': 'الإجمالي',
    'Weighed items are priced at billing, so the final total can change slightly.': 'تُسعّر الأصناف الموزونة عند الفوترة، لذا قد يتغير الإجمالي قليلاً.', 'Place order': 'تأكيد الطلب',
    'Add {a} SAR more to order (minimum {m} SAR).': 'أضف {a} ر.س للطلب (الحد الأدنى {m} ر.س).', 'Free delivery from {n} SAR': 'توصيل مجاني من {n} ر.س',
    'Sign in to place your order': 'سجّل الدخول لتأكيد طلبك', 'Your basket is saved. We only use your name, phone and address to deliver your orders.': 'سلتك محفوظة. نستخدم اسمك وجوالك وعنوانك فقط لتوصيل طلباتك.',
    'Sign in with Apple': 'تسجيل الدخول عبر Apple', 'Continue with Google': 'المتابعة عبر Google', 'By continuing you agree to the {t} and {p}.': 'بالمتابعة توافق على {t} و{p}.', 'Terms': 'الشروط', 'Privacy policy': 'سياسة الخصوصية',
    'What should we call you?': 'ما اسمك؟', 'The driver uses your name at the door.': 'يستخدم المندوب اسمك عند الباب.', 'Your name': 'اسمك', 'Phone': 'الجوال', '(optional, for the driver to call)': '(اختياري، ليتصل بك المندوب)', 'Continue': 'متابعة',
    'Demo sign-in': 'تسجيل دخول تجريبي', 'Real {p} sign-in turns on once the developer account is set up. For now, enter a name and email.': 'يعمل تسجيل الدخول الحقيقي عبر {p} بعد إعداد حساب المطوّر. أدخل الآن اسماً وبريداً.', 'Email': 'البريد الإلكتروني',
    'Move the map to put the pin on your door': 'حرّك الخريطة لتضع الدبوس على بابك', 'Use my location': 'استخدم موقعي', 'Home': 'المنزل', 'Work': 'العمل', 'Other': 'آخر', 'House or building': 'المنزل أو المبنى', 'Street': 'الشارع', 'District': 'الحي', 'City': 'المدينة',
    'Notes': 'ملاحظات', '(gate code, landmark)': '(رمز البوابة، معلم)', 'e.g. Green gate, next to the mosque': 'مثال: بوابة خضراء، بجانب المسجد', 'Make this my default address': 'اجعله عنواني الافتراضي', 'Save address': 'حفظ العنوان',
    'Enter the house or building, and the district.': 'أدخل المنزل أو المبنى والحي.', 'Location is off. Move the map to your door instead.': 'الموقع غير مفعّل. حرّك الخريطة إلى بابك.',
    'My orders': 'طلباتي', 'Order #{n}': 'الطلب #{n}', 'Track': 'تتبع', 'Order again': 'اطلب مجدداً', 'and {n} more': 'و{n} أخرى', 'No orders yet.': 'لا توجد طلبات بعد.', 'Sign in to see your orders.': 'سجّل الدخول لرؤية طلباتك.', 'Sign in': 'تسجيل الدخول',
    'Placed': 'تم الطلب', 'Preparing': 'قيد التجهيز', 'Ready': 'جاهز', 'On the way': 'في الطريق', 'Delivered': 'تم التوصيل', 'Cancelled': 'ملغي',
    'Order placed': 'تم استلام طلبك', 'Being prepared': 'نجهّز طلبك', 'Ready, waiting for a driver': 'جاهز، بانتظار المندوب', 'On the way to you': 'في الطريق إليك', 'Delivered {t}': 'تم التوصيل {t}', 'Order cancelled': 'تم إلغاء الطلب',
    'Live · updated {n}': 'مباشر · آخر تحديث {n}', '{n} s ago': 'قبل {n} ث', '{n} min ago': 'قبل {n} د', 'Your driver': 'مندوبك', 'Pay on delivery': 'الدفع عند الاستلام', 'Cash': 'نقداً', 'Card': 'بطاقة',
    'Cancel order': 'إلغاء الطلب', 'Cancel this order?': 'إلغاء هذا الطلب؟', 'Yes, cancel': 'نعم، ألغِ', 'Keep order': 'إبقاء الطلب', 'Items': 'المنتجات', 'Cancelled by the shop: {r}': 'ألغاه المتجر: {r}',
    'Profile': 'الملف الشخصي', 'Name': 'الاسم', 'Add (optional)': 'أضف (اختياري)', 'Saved addresses': 'العناوين المحفوظة', 'Language': 'اللغة', 'Help': 'المساعدة', 'Contact the shop': 'اتصل بالمتجر', 'Sign out': 'تسجيل الخروج', 'Delete account': 'حذف الحساب',
    'Signed in with Apple': 'مسجّل عبر Apple', 'Signed in with Google': 'مسجّل عبر Google', 'Welcome': 'أهلاً بك', 'Sign in to order and track deliveries.': 'سجّل الدخول للطلب وتتبع التوصيل.',
    'Delete your account?': 'حذف حسابك؟', 'Your name, phone and saved addresses are deleted now. Past orders are kept without your name, only as the tax invoices the shop must keep.': 'يُحذف اسمك وجوالك وعناوينك الآن. تبقى الطلبات السابقة دون اسمك، كفواتير ضريبية يلزم المتجر حفظها.',
    'Delete': 'حذف', 'Cancel': 'إلغاء', 'Save': 'حفظ', 'Account deleted': 'تم حذف الحساب', 'Signed out': 'تم تسجيل الخروج', 'Add new address': 'إضافة عنوان جديد', 'Choose an address': 'اختر عنواناً', 'Edit': 'تعديل',
    'Order placed. We are on it.': 'تم الطلب. نعمل عليه الآن.', 'Something went wrong. Please try again.': 'حدث خطأ. حاول مرة أخرى.', 'No internet connection.': 'لا يوجد اتصال بالإنترنت.', 'No products match.': 'لا توجد منتجات مطابقة.',
    'Shop': 'المتجر', 'Orders': 'الطلبات', 'Account': 'الحساب', 'Back': 'رجوع', 'Close': 'إغلاق', 'Remove': 'إزالة', 'Added to basket': 'أُضيف إلى السلة',
    'Delivery is free from {n} SAR.': 'التوصيل مجاني من {n} ر.س.', 'English': 'English', 'العربية': 'العربية',
  };
  const isAr = () => S.lang === 'ar';
  const t = (s, v) => { let o = (isAr() && AR[s]) || s; if (v) Object.keys(v).forEach((k) => { o = o.split('{' + k + '}').join(v[k]); }); return o; };
  const N = (o) => (o ? (isAr() ? o.ar || o.en : o.en || o.ar) : '');
  const N2 = (o) => (o ? (isAr() ? o.en : o.ar) : '');
  const SAR = () => (isAr() ? 'ر.س' : 'SAR');
  const sar = (n) => (isAr() ? `${money(n)} ر.س` : `SAR ${money(n)}`);
  const priceHtml = (p, cls = 'price') => { const [w, c] = money(p).split('.'); return `<span class="${cls}">${w}.<sup>${c}</sup> <small>${SAR()}</small></span>`; };
  const fmtTime = (d) => new Date(d).toLocaleTimeString(isAr() ? 'ar-SA-u-nu-latn' : 'en-GB', { hour: 'numeric', minute: '2-digit' });
  const fmtWhen = (d) => { const x = new Date(d), today = new Date().toDateString() === x.toDateString(); return (today ? (isAr() ? 'اليوم' : 'Today') : x.toLocaleDateString(isAr() ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB', { day: 'numeric', month: 'short' })) + ', ' + fmtTime(d); };
  const ago = (iso) => { const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000)); return s < 60 ? t('{n} s ago', { n: s }) : t('{n} min ago', { n: Math.round(s / 60) }); };
  const orderNo = (o) => String(o.id).replace(/^APP-/, '');

  // ---------------------------------------------------------------- icons
  const ico = (d, w = 22, sw = 1.8, extra = '') => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
  const I = {
    search: ico('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>', 20, 1.9),
    bag: ico('<path d="M5 8h14l-1.2 11.1a2 2 0 0 1-2 1.9H8.2a2 2 0 0 1-2-1.9z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>'),
    chev: ico('<path d="M6 9l6 6 6-6"/>', 16, 2.2), back: ico('<path d="M15 18l-6-6 6-6"/>', 22, 2, 'class="flip"'), next: ico('<path d="M9 18l6-6-6-6"/>', 16, 2, 'class="flip"'),
    arrow: ico('<path d="M5 12h14M13 6l6 6-6 6"/>', 18, 2, 'class="flip"'),
    minus: ico('<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>', 20), plus: ico('<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>', 20),
    plusBare: ico('<path d="M12 5v14M5 12h14"/>', 20, 2), minusBare: ico('<path d="M5 12h14"/>', 18, 2), plusSm: ico('<path d="M12 5v14M5 12h14"/>', 18, 2),
    trash: ico('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', 18),
    img: ico('<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-9 8"/>', 24, 1.6),
    pin: ico('<path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>', 20),
    home: ico('<path d="M4 11l8-7 8 7v9H4z"/><path d="M10 20v-5h4v5"/>'), receipt: ico('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>'),
    user: ico('<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'), phone: ico('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>', 20),
    loc: ico('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="7"/>', 18),
    apple: '<svg width="18" height="20" viewBox="0 0 17 20" aria-hidden="true"><path fill="currentColor" d="M14.1 10.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9s-2-.9-3.4-.9C3.6 4.8 2 5.8 1 7.4c-1.9 3.3-.5 8.2 1.4 10.9.9 1.3 2 2.8 3.4 2.7 1.4-.1 1.9-.9 3.5-.9s2.1.9 3.5.9 2.4-1.4 3.2-2.7c1-1.5 1.4-3 1.5-3-.1-.1-2.4-1-2.4-3.7zM11.6 3c.7-.9 1.2-2.1 1.1-3.3-1 0-2.3.7-3 1.6-.7.8-1.3 2-1.1 3.2 1.1.1 2.3-.6 3-1.5z"/></svg>',
    google: '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>',
    close: ico('<path d="M6 6l12 12M18 6L6 18"/>', 20, 2),
    bigpin: '<svg width="40" height="52" viewBox="0 0 40 52" aria-hidden="true"><path d="M20 0C9 0 0 9 0 20c0 14 20 32 20 32s20-18 20-32C40 9 31 0 20 0z" fill="#105448"/><circle cx="20" cy="19" r="7" fill="#fff"/></svg>',
    store: ico('<path d="M4 10h16l-1-5H5zM5 10v9h14v-9M9 19v-5h6v5"/>', 18),
    mic: ico('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>', 20),
    play: '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/></svg>',
    pause: '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>',
    stop: '<svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><rect fill="currentColor" x="4" y="4" width="16" height="16" rx="3"/></svg>',
  };
  const CAT_ICON = {
    dairy: '<path d="M8 3h8v3l2 3v12H6V9l2-3z"/><path d="M6 9h12M10 14h4"/>',
    bakery: '<path d="M4 11a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4c0 1.1-.9 2-2 2v6H6v-6c-1.1 0-2-.9-2-2z"/><path d="M10 10v3M14 10v3"/>',
    produce: '<path d="M12 8c-4-2-8 1-7 6 1 4 4 7 7 5 3 2 6-1 7-5 1-5-3-8-7-6z"/><path d="M12 8c0-2 1-4 3-5"/>',
    rice: '<path d="M3 12h18a9 9 0 0 1-18 0z"/><path d="M7 12c0-3 2-5 5-5s5 2 5 5"/>',
    drinks: '<path d="M8 2h8M9 2v4l-2 3v13h10V9l-2-3V2"/><path d="M7 13h10"/>',
    pantry: '<rect x="5" y="7" width="14" height="14" rx="2"/><path d="M8 3h8v4H8zM9 12h6M9 16h4"/>',
    household: '<path d="M9 3h6v4H9zM8 7h8l1 4v10H7V11z"/><path d="M10 14h4"/>',
  };
  const catIcon = (id) => `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#105448" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${CAT_ICON[id] || CAT_ICON.pantry}</svg>`;

  // ---------------------------------------------------------------- api
  async function api(path, opts = {}) {
    let r;
    try {
      r = await fetch(API + path, { method: opts.method || 'GET', headers: Object.assign({ 'Content-Type': 'application/json' }, S.token ? { Authorization: 'Bearer ' + S.token } : {}), body: opts.body ? JSON.stringify(opts.body) : undefined });
    } catch (e) { throw new Error(t('No internet connection.')); }
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && S.token && !opts.noAuthReset) { S.token = null; S.profile = null; persist(); }
    if (!r.ok) throw new Error(j.error ? t(j.error) : t('Something went wrong. Please try again.'));
    return j;
  }
  async function loadCatalog() {
    try { ui.catalog = await api('/catalog'); try { localStorage.setItem(KEY + '-catalog', JSON.stringify(ui.catalog)); } catch (e) { /* ignore */ } }
    catch (e) { try { ui.catalog = ui.catalog || JSON.parse(localStorage.getItem(KEY + '-catalog')); } catch (x) { /* none */ } if (!ui.catalog) toast(e.message, 'bad'); }
    // Drop basket items the shop no longer sells.
    Object.keys(S.basket).forEach((pid) => { if (ui.catalog && !prod(pid)) delete S.basket[pid]; });
    render();
  }
  async function loadOrders() { if (!S.token) return; try { ui.orders = (await api('/orders')).orders; render(); } catch (e) { /* keep last */ } }
  async function loadProfile() { if (!S.token) return; try { S.profile = await api('/me'); persist(); render(); } catch (e) { /* offline */ } }

  // ---------------------------------------------------------------- basket
  const prod = (id) => ui.catalog && ui.catalog.products.find((p) => p.id === id);
  const shop = () => (ui.catalog && ui.catalog.shop) || { deliveryFee: 10, freeDeliveryFrom: 100, minOrder: 25, lat: 24.6939, lng: 46.6853, phone: '' };
  const stepOf = (p) => (p.weighted ? 0.5 : 1);
  const qtyLabel = (p, q) => (p.weighted ? `${q} ${isAr() ? 'كجم' : 'kg'}` : String(q));
  function setQty(pid, q) {
    const p = prod(pid); if (!p) return;
    q = r2(Math.max(0, q));
    if (q <= 0) delete S.basket[pid]; else S.basket[pid] = Math.min(q, 999);
    persist(); render();
  }
  const add = (pid, n) => { const p = prod(pid); setQty(pid, (S.basket[pid] || 0) + (n || (p.weighted && !S.basket[pid] ? 1 : stepOf(p)))); };
  const sub = (pid) => { const p = prod(pid); const q = S.basket[pid] || 0; setQty(pid, p.weighted && q <= 1 ? 0 : q - stepOf(p)); };
  function totals() {
    const lines = Object.keys(S.basket).map((pid) => ({ p: prod(pid), qty: S.basket[pid] })).filter((l) => l.p);
    const subtotal = r2(lines.reduce((s, l) => s + l.p.price * l.qty, 0));
    const fee = !lines.length || subtotal >= shop().freeDeliveryFrom ? 0 : shop().deliveryFee;
    const vat = r2(lines.reduce((s, l) => { const g = l.p.price * l.qty, rate = l.p.vat === 'standard' ? 0.15 : 0; return s + g - g / (1 + rate); }, 0) + fee - fee / 1.15);
    const count = lines.reduce((s, l) => s + (l.p.weighted ? 1 : l.qty), 0);
    return { lines, subtotal, fee, vat, total: r2(subtotal + fee), count, weighed: lines.some((l) => l.p.weighted) };
  }
  const perText = (p) => (p.weighted ? t('per kg · approx.') : t('per ' + (p.unit === 'piece' ? 'piece' : p.unit)) || t('per piece'));
  const currentAddress = () => { const P = S.profile; if (!P || !P.addresses || !P.addresses.length) return null; return P.addresses.find((a) => a.id === S.addressId) || P.addresses.find((a) => a.id === P.defaultAddress) || P.addresses[0]; };
  const addrTitle = (a) => `${t(a.label || 'Home')} · ${a.district || a.street || a.house}`;

  // ---------------------------------------------------------------- routing
  const route = () => (location.hash.replace(/^#\/?/, '') || 'home').split('/');
  const go = (p) => { if (location.hash === '#/' + p) render(); else location.hash = '#/' + p; };

  // ---------------------------------------------------------------- views
  function nav(on) {
    const live = ui.orders && ui.orders.some((o) => ['new', 'preparing', 'ready', 'out'].includes(o.status));
    return `<nav class="nav" aria-label="Main">
      <a href="#/home" class="${on === 'home' ? 'on' : ''}" aria-label="${t('Shop')}" ${on === 'home' ? 'aria-current="page"' : ''}>${I.home}</a>
      <a href="#/orders" class="${on === 'orders' ? 'on' : ''}" aria-label="${t('Orders')}" ${on === 'orders' ? 'aria-current="page"' : ''}>${I.receipt}${live && on !== 'orders' ? '<span class="dot"></span>' : ''}</a>
      <a href="#/account" class="${on === 'account' ? 'on' : ''}" aria-label="${t('Account')}" ${on === 'account' ? 'aria-current="page"' : ''}>${I.user}</a></nav>`;
  }
  function stepper(p, q) {
    return `<div class="step"><button data-a="sub" data-id="${p.id}" aria-label="${t('Remove')}">${I.minus}</button><b class="${p.weighted ? 'kg' : ''}">${esc(qtyLabel(p, q))}</b><button data-a="add" data-id="${p.id}" aria-label="${t('Add')}">${I.plus}</button></div>`;
  }
  function card(p) {
    const q = S.basket[p.id] || 0, out = p.stock <= 0;
    const ph = `<span class="ph">${p.img ? `<img src="${esc(p.img)}" alt="" loading="lazy">` : I.img}</span>`;
    const info = `${ph}<span class="nm">${esc(N(p))}</span><span class="per">${esc(perText(p))}</span>${priceHtml(p.price)}`;
    return `<div class="pc ${out ? 'out' : ''}">${out ? `<span class="info">${info}</span><button class="add" disabled>${t('Out of stock')}</button>`
      : `<a class="info" href="#/product/${encodeURIComponent(p.id)}">${info}</a>${q ? stepper(p, q) : `<button class="add" data-a="add" data-id="${p.id}" aria-label="${esc(t('Add'))} ${esc(N(p))}">${I.plusBare}</button>`}`}</div>`;
  }
  function viewHome() {
    const C = ui.catalog;
    const a = currentAddress(), T = totals(), basketN = Object.keys(S.basket).length;
    const cats = C ? C.categories : [];
    const pages = []; for (let i = 0; i < cats.length; i += 4) pages.push(cats.slice(i, i + 4));
    const q = ui.q.trim().toLowerCase();
    let list = C ? C.products.slice() : [];
    if (ui.cat) list = list.filter((p) => p.cat === ui.cat);
    if (q) list = list.filter((p) => (p.en + ' ' + p.ar + ' ' + (p.brand || '')).toLowerCase().includes(q));
    list.sort((x, y) => (x.stock <= 0) - (y.stock <= 0));
    const title = q ? `“${esc(ui.q.trim())}”` : ui.cat ? esc(N(cats.find((c) => c.id === ui.cat))) : t('All products');
    return `<div class="screen">
      <header class="hdr home">
        <div class="hdr-row">
          <label class="search">${I.search}<span class="sr">Search products</span><input type="search" data-in="q" value="${esc(ui.q)}" placeholder="${esc(t('Search milk, حليب, rice…'))}" enterkeyhint="search"></label>
          <button class="gbtn" data-a="lang" aria-label="${isAr() ? 'English' : 'العربية'}">${isAr() ? '<span style="font-size:14px">EN</span>' : 'ع'}</button>
          <a class="gbtn" href="#/basket" aria-label="${t('Basket')}">${I.bag}${basketN ? `<span class="n">${basketN}</span>` : ''}</a>
        </div>
        <button class="deliver" data-a="pick-address"><small>${t('Deliver to')}</small><b>${a ? esc(addrTitle(a)) : t('Add your address')} ${I.chev}</b></button>
      </header>
      <nav class="cats" aria-label="Categories" data-scroll="cats">${pages.map((pg) => `<div class="cat-page">${pg.map((c) => `<button class="cat ${ui.cat === c.id ? 'on' : ''}" data-a="cat" data-id="${c.id}" aria-pressed="${ui.cat === c.id}"><span class="bub">${catIcon(c.id)}</span><span>${esc(N(c).replace(/ · .*$/, '').replace(/ &.*$/, ''))}</span></button>`).join('')}</div>`).join('')}</nav>
      ${pages.length > 1 ? `<div class="dots" aria-hidden="true">${pages.map((_, i) => `<i class="${i === (ui.catPage || 0) ? 'on' : ''}"></i>`).join('')}</div>` : '<div style="height:16px"></div>'}
      <section class="sec">
        <div class="sec-h"><h1>${title}</h1><span>${t('Prices include VAT')}</span></div>
        ${!C ? `<div class="empty">…</div>` : list.length ? `<div class="grid">${list.map(card).join('')}</div>` : `<div class="empty">${t('No products match.')}</div>`}
      </section>
      ${basketN ? `<button class="basket-bar" data-a="go" data-to="basket"><span class="c">${T.lines.length}</span><span><small>${T.count === 1 ? t('1 item') : t('{n} items', { n: T.lines.length })}</small><b>${sar(T.subtotal)}</b></span><span class="go">${t('View basket')} ${I.arrow}</span></button>` : ''}
      ${nav('home')}
    </div>`;
  }
  function viewProduct(id) {
    const p = prod(decodeURIComponent(id || ''));
    if (!p) return `<div class="screen"><header class="hdr sub"><a class="gbtn" href="#/home" aria-label="${t('Back')}">${I.back}</a></header><div class="empty">…</div></div>`;
    const packs = (p.packs || []).filter((k) => k.qty > 0);
    const pack = packs.find((k) => k.qty === ui.pack[p.id]) || packs[0] || { qty: 1 };
    const n = ui.pdQty[p.id] || (p.weighted ? 1 : 1);
    const total = r2(p.price * n * (p.weighted ? 1 : pack.qty));
    const cat = ui.catalog.categories.find((c) => c.id === p.cat);
    const basketN = Object.keys(S.basket).length;
    return `<div class="screen" style="padding-bottom:120px">
      <header class="hdr sub pd-hdr"><a class="gbtn" href="#/home" aria-label="${t('Back')}">${I.back}</a><div class="t"><h1>${t('Product details')}</h1></div>
        <a class="gbtn" href="#/basket" aria-label="${t('Basket')}">${I.bag}${basketN ? `<span class="n">${basketN}</span>` : ''}</a></header>
      <div class="pd">
        <div class="pd-photo">${p.img ? `<img src="${esc(p.img)}" alt="${esc(N(p))}">` : `${I.img.replace('width="24" height="24"', 'width="40" height="40"')}<span>${t('Product photo')}</span>`}</div>
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start"><div><h1>${esc(N(p))}</h1><div class="alt">${esc(N2(p))}</div></div>${cat ? `<span class="chip">${esc(N(cat).replace(/ · .*$/, ''))}</span>` : ''}</div>
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px">${priceHtml(p.price, 'bigprice')}<span class="muted" style="font-size:13px">${esc(perText(p))} · ${t('VAT included')}</span></div>
        ${p.stock <= 0 ? `<div class="warnline">${t('Out of stock')}</div>` : ''}
        ${!p.weighted && packs.length > 1 ? `<div class="hr"></div><div class="lbl">${t('Pack size')}</div><div class="packs">${packs.map((k) => `<button class="${k.qty === pack.qty ? 'on' : ''}" data-a="pack" data-id="${p.id}" data-q="${k.qty}">${esc(k.qty > 1 ? `${k.qty} × ${N(p).replace(/ ·.*$/, '')}`.slice(0, 22) : t(k.name || 'Piece'))}</button>`).join('')}</div>` : ''}
      </div>
      ${p.stock > 0 ? `<div class="dock"><div class="qty"><button data-a="pd-sub" data-id="${p.id}" aria-label="${t('Remove')}">${I.minus}</button><b>${esc(qtyLabel(p, n))}</b><button data-a="pd-add" data-id="${p.id}" aria-label="${t('Add')}">${I.plus}</button></div>
        <button class="btn" data-a="pd-put" data-id="${p.id}" data-n="${n * (p.weighted ? 1 : pack.qty)}" style="flex:1">${I.bag} ${t('Add · {p} SAR', { p: money(total) })}</button></div>` : ''}
    </div>`;
  }
  function viewBasket() {
    const T = totals(), a = currentAddress(), sh = shop();
    if (!T.lines.length) return `<div class="screen"><header class="hdr sub"><a class="gbtn" href="#/home" aria-label="${t('Back')}">${I.back}</a><div class="t"><h1>${t('Basket')}</h1></div><span style="width:48px"></span></header>
      <div class="empty" style="padding-top:40px">${t('Your basket is empty.')}<div style="margin-top:16px"><a class="btn" href="#/home" style="width:auto;display:inline-flex">${t('Start shopping')}</a></div></div></div>`;
    const short = r2(sh.minOrder - T.subtotal);
    const lines = T.lines.map(({ p, qty }) => `<li><span class="th">${p.img ? `<img src="${esc(p.img)}" alt="">` : ''}</span><span class="tx"><b>${esc(N(p))}</b>
      <small>${p.weighted ? `${sar(p.price)} ${t('/ kg · approx. weight')}` : `${sar(p.price)} ${t('each')}`}</small><b>${p.weighted ? '≈ ' : ''}${sar(p.price * qty)}</b></span>
      <span class="pill-step"><button data-a="sub" data-id="${p.id}" aria-label="${t('Remove')}">${(p.weighted ? qty <= 1 : qty <= 1) ? I.trash : I.minusBare}</button><span>${esc(qtyLabel(p, qty))}</span><button data-a="add" data-id="${p.id}" aria-label="${t('Add')}">${I.plusSm}</button></span></li>`).join('');
    const radio = (k, v, title, sub2) => `<button class="radio ${S[k] === v ? 'on' : ''}" data-a="set" data-k="${k}" data-v="${v}" role="radio" aria-checked="${S[k] === v}"><span class="o"></span><span><b>${t(title)}</b>${sub2 ? `<small>${t(sub2)}</small>` : ''}</span></button>`;
    return `<div class="screen" style="padding-bottom:150px">
      <header class="hdr sub"><a class="gbtn" href="#/home" aria-label="${t('Back')}">${I.back}</a><div class="t"><h1>${t('Basket')}</h1><span>${t('{n} items', { n: T.lines.length })}</span></div><span style="width:48px"></span></header>
      <div class="bk">
        <ul class="lines">${lines}</ul>
        <div class="blk"><div class="lbl">${t('Deliver to')}</div>
          ${a ? `<div class="box addr"><span class="pin">${I.pin}</span><span style="flex:1"><b>${esc(t(a.label || 'Home'))}</b><span>${esc([a.house, a.street].filter(Boolean).join(', '))}<br>${esc([a.district, a.city].filter(Boolean).join(', '))}</span></span><button class="linkbtn" data-a="pick-address">${t('Change')}</button></div>`
            : `<button class="box addr" data-a="pick-address" style="text-align:start;width:100%"><span class="pin">${I.pin}</span><span style="flex:1"><b>${t('Add a delivery address')}</b></span>${I.next}</button>`}</div>
        <div class="blk"><div class="lbl">${t('Delivery time')}</div><div class="radio on"><span class="o"></span><span><b>${t('As soon as possible')}</b></span></div></div>
        <div class="blk"><div class="lbl">${t('Notes for your order')}</div>
          <div class="notebox"><textarea class="in" data-in="note" rows="4" maxlength="1000" placeholder="${esc(t('Anything the shop or driver should know: a brand you prefer, a swap if something is out, the gate code…'))}">${esc(S.note)}</textarea>
          ${voiceHtml()}</div></div>
        <div class="blk" role="radiogroup"><div class="lbl">${t('Payment')}</div>${radio('payment', 'cash', 'Cash on delivery', 'Pay the driver in cash')}${radio('payment', 'card', 'Card on delivery', 'The driver brings a card terminal')}</div>
        <div class="sum">
          <div><span>${t('Subtotal')}</span><span>${sar(T.subtotal)}</span></div>
          <div><span>${t('Delivery fee')}</span><span>${T.fee ? sar(T.fee) : t('Free')}</span></div>
          <div><span>${t('VAT 15% (included)')}</span><span>${sar(T.vat)}</span></div>
          <div class="tot"><span>${t('Total')}</span><span>${sar(T.total)}</span></div>
          ${T.weighed ? `<p>${t('Weighed items are priced at billing, so the final total can change slightly.')}</p>` : ''}
          ${T.fee ? `<p>${t('Delivery is free from {n} SAR.', { n: sh.freeDeliveryFrom })}</p>` : ''}
        </div>
        ${short > 0 ? `<div class="warnline">${t('Add {a} SAR more to order (minimum {m} SAR).', { a: money(short), m: sh.minOrder })}</div>` : ''}
      </div>
      <div class="dock"><button class="btn" data-a="place" ${short > 0 || ui.busy ? 'disabled' : ''}>${t('Place order')} ${I.arrow}</button></div>
    </div>`;
  }

  // ---------------------------------------------------------------- sign in (POS flag animation behind a glass panel)
  function signinHtml() {
    const s = ui.signin;
    const vis = `<img class="vision-logo" src="../assets/vision-2030.png" alt="Saudi Vision 2030">
      <img class="flag-fg flag-poster" src="../assets/flag.png" alt="" aria-hidden="true">
      <canvas class="flag-fg flag-canvas" width="720" height="800" aria-hidden="true"></canvas>
      <video class="flag-video" src="../assets/flag.mp4" muted autoplay loop playsinline preload="auto" aria-hidden="true"></video><div class="scrim" aria-hidden="true"></div>`;
    return `<div class="signin ${s.quick ? 'quick' : ''}" id="signin" role="dialog" aria-modal="true" aria-label="${t('Sign in')}">${vis}
      <button class="close" data-a="signin-close" aria-label="${t('Close')}">${I.close}</button>
      <main class="panel">${panelHtml()}</main></div>`;
  }
  function panelHtml() {
    const s = ui.signin;
    let body;
    if (s.step === 'name') {
      body = `<div class="brand"><img src="../assets/logo.svg" alt="" width="36" height="36"><span lang="ar">${APP_NAME}</span></div>
        <div style="display:flex;flex-direction:column;gap:6px"><h1>${t('What should we call you?')}</h1><p>${t('The driver uses your name at the door.')}</p></div>
        <form data-form="name" style="display:flex;flex-direction:column;gap:10px"><input class="in" name="name" autocomplete="name" placeholder="${esc(t('Your name'))}" value="${esc(s.name || '')}" required>
        <input class="in" name="phone" type="tel" autocomplete="tel" inputmode="tel" placeholder="${esc(t('Phone') + ' ' + t('(optional, for the driver to call)'))}" value="${esc(s.phone || '')}">
        ${s.err ? `<div class="err">${esc(s.err)}</div>` : ''}<button class="sbtn" type="submit" ${ui.busy ? 'disabled' : ''}>${t('Continue')}</button></form>`;
    } else if (s.step === 'demo') {
      const P = s.provider === 'apple' ? 'Apple' : 'Google';
      body = `<div class="brand"><img src="../assets/logo.svg" alt="" width="36" height="36">${t('Demo sign-in')} · ${P}</div>
        <p>${t('Real {p} sign-in turns on once the developer account is set up. For now, enter a name and email.', { p: P })}</p>
        <form data-form="demo" style="display:flex;flex-direction:column;gap:10px"><input class="in" name="name" autocomplete="name" placeholder="${esc(t('Your name'))}" required>
        <input class="in" name="email" type="email" autocomplete="email" placeholder="${esc(t('Email'))}">
        ${s.err ? `<div class="err">${esc(s.err)}</div>` : ''}<button class="sbtn ${s.provider === 'google' ? '' : ''}" type="submit" ${ui.busy ? 'disabled' : ''}>${t('Continue')}</button>
        <button type="button" class="sbtn g" data-a="signin-back">${t('Back')}</button></form>`;
    } else {
      body = `<div class="brand"><img src="../assets/logo.svg" alt="" width="36" height="36"><span lang="ar">${APP_NAME}</span></div>
        <div style="display:flex;flex-direction:column;gap:6px"><h1>${t('Sign in to place your order')}</h1><p>${t('Your basket is saved. We only use your name, phone and address to deliver your orders.')}</p></div>
        ${s.err ? `<div class="err">${esc(s.err)}</div>` : ''}
        <div style="display:flex;flex-direction:column;gap:10px">${isAndroidApp() ? '' : `<button class="sbtn" data-a="auth" data-p="apple" ${ui.busy ? 'disabled' : ''}>${I.apple}${t('Sign in with Apple')}</button>`}
          <button class="sbtn g" data-a="auth" data-p="google" ${ui.busy ? 'disabled' : ''}>${I.google}${t('Continue with Google')}</button></div>
        <p class="fine">${t('By continuing you agree to the {t} and {p}.', { t: `<a href="terms.html">${t('Terms')}</a>`, p: `<a href="privacy.html">${t('Privacy policy')}</a>` })}</p>`;
    }
    return body;
  }
  // Apple's own rule (4.8) is for iOS; the Android store app offers Google only.
  const isAndroidApp = () => !!(window.Capacitor && window.Capacitor.getPlatform && window.Capacitor.getPlatform() === 'android');
  function openSignin(then) { ui.signin = { step: 'start', then: then || null, quick: !!ui.signinSeen }; ui.signinSeen = true; renderOverlay(); mountFlag(); }
  function closeSignin() { ui.signin = null; cancelAnimationFrame(flagLoop); renderOverlay(); }
  async function authConfig() { if (!ui.auth) { try { ui.auth = await api('/auth'); } catch (e) { ui.auth = { google: {}, apple: {} }; } } return ui.auth; }
  function loadScript(src) { return new Promise((res, rej) => { if (document.querySelector(`script[src="${src}"]`)) return res(); const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
  // Real sign-in: the native plugin inside the store app, else Apple's and Google's web SDKs.
  async function nativeOrWebToken(provider, cfg) {
    const SL = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.SocialLogin;
    if (SL) {
      if (!ui.slReady) {
        const A = ui.auth || {};
        await SL.initialize({ google: { webClientId: A.google && A.google.clientId, iOSClientId: A.google && A.google.iosClientId, iOSServerClientId: A.google && A.google.clientId, mode: 'online' }, apple: {} });
        ui.slReady = true;
      }
      const r = await SL.login({ provider, options: provider === 'apple' ? { scopes: ['name', 'email'] } : { scopes: ['profile', 'email'] } });
      const res = r.result || r;
      const prof = res.profile || {};
      return { idToken: res.idToken || (res.authentication && res.authentication.idToken), name: [prof.givenName, prof.familyName].filter(Boolean).join(' ') || prof.name || '' };
    }
    if (provider === 'apple') {
      await loadScript('https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js');
      AppleID.auth.init({ clientId: cfg.clientId, scope: 'name email', redirectURI: location.origin + location.pathname, usePopup: true });
      const r = await AppleID.auth.signIn();
      const nm = r.user && r.user.name ? [r.user.name.firstName, r.user.name.lastName].filter(Boolean).join(' ') : '';
      return { idToken: r.authorization.id_token, name: nm };
    }
    await loadScript('https://accounts.google.com/gsi/client');
    return new Promise((res, rej) => {
      google.accounts.id.initialize({ client_id: cfg.clientId, callback: (c) => res({ idToken: c.credential, name: '' }), cancel_on_tap_outside: true });
      google.accounts.id.prompt((n) => { if (n.isNotDisplayed() || n.isSkippedMoment()) rej(new Error('cancelled')); });
    });
  }
  async function doAuth(provider) {
    const cfg = (await authConfig())[provider] || {};
    if (!cfg.live) { ui.signin.step = 'demo'; ui.signin.provider = provider; ui.signin.err = ''; return renderOverlay(true); }
    ui.busy = true; renderOverlay(true);
    try {
      const { idToken, name } = await nativeOrWebToken(provider, cfg);
      await finishAuth({ provider, idToken, name });
    } catch (e) { ui.signin.err = /cancel/i.test(e.message || e.error || '') ? '' : (e.message || t('Something went wrong. Please try again.')); }
    ui.busy = false; if (ui.signin) renderOverlay(true);
  }
  async function finishAuth(body) {
    const r = await api('/auth', { method: 'POST', body });
    S.token = r.token; S.profile = r.profile; persist();
    loadOrders();
    if (r.needsName) { Object.assign(ui.signin, { step: 'name', name: body.name || '', err: '' }); return; }
    afterSignin();
  }
  function afterSignin() {
    const then = ui.signin && ui.signin.then; closeSignin();
    if (then === 'place') { if (!currentAddress()) go('address/new/place'); else render(); } else if (then) go(then); else render();
  }

  // The flag video packs colour (left half) and alpha (right half) side by side; same as the POS sign-in.
  let flagLoop = null;
  function mountFlag() {
    const panel = $('#signin'); if (!panel) return;
    const video = panel.querySelector('video'), canvas = panel.querySelector('canvas');
    if (!video || !canvas) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { video.remove(); canvas.remove(); return; }
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true });
    if (!gl) return;
    const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, mk(gl.VERTEX_SHADER, 'attribute vec2 position; varying vec2 uv; void main(){ uv=(position+1.0)*0.5; gl_Position=vec4(position,0.0,1.0); }'));
    gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, `precision highp float; uniform sampler2D frame; varying vec2 uv;
      float a(vec2 o){ vec2 p=clamp(vec2(uv.x+o.x/720.0,uv.y+o.y/800.0),vec2(0.0),vec2(1.0)); return texture2D(frame,vec2(0.5+p.x*0.5,p.y)).r; }
      void main(){ float s=a(vec2(0.0))*2.0;
        for(int i=0;i<12;i++){ float t=float(i)*0.5236; vec2 d=vec2(cos(t),sin(t)); s+=a(d*2.2)+a(d*4.4); }
        float alpha=smoothstep(0.42,0.68,s/26.0);
        vec3 color=texture2D(frame,vec2(uv.x*0.5,uv.y)).rgb;
        gl_FragColor=vec4(color*alpha,alpha); }`));
    gl.linkProgram(prog); gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(prog, 'position'); gl.enableVertexAttribArray(pos); gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach((k) => gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE));
    [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER].forEach((k) => gl.texParameteri(gl.TEXTURE_2D, k, gl.LINEAR));
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.viewport(0, 0, canvas.width, canvas.height);
    // Browsers sometimes leave the video paused or stuck after a reload (autoplay refused, the page
    // restored from cache, the tab hidden, a stalled load), which froze the flag. A watchdog restarts it.
    const play = () => { const p = video.play(); if (p && p.catch) p.catch(() => {}); };
    let lastT = -1, stuckSince = 0, kicks = 0;
    const watch = (now) => {
      if (document.hidden) { stuckSince = 0; return; }
      if (video.currentTime !== lastT) { lastT = video.currentTime; stuckSince = 0; kicks = 0; return; }
      if (!stuckSince) { stuckSince = now; return; }
      if (now - stuckSince < 900) return;
      stuckSince = now; kicks += 1;
      if (kicks > 3) { kicks = 0; video.load(); } // still stuck: fetch the video again
      else if (video.paused || video.ended) play();
      else { video.currentTime = (video.currentTime + 0.05) % (video.duration || 1); play(); }
    };
    const wake = () => { if (!document.body.contains(video)) return off(); stuckSince = 0; play(); };
    const off = () => { ['pointerdown', 'keydown', 'touchstart'].forEach((e) => document.removeEventListener(e, wake)); document.removeEventListener('visibilitychange', wake); window.removeEventListener('pageshow', wake); };
    ['pointerdown', 'keydown', 'touchstart'].forEach((e) => document.addEventListener(e, wake, { passive: true }));
    document.addEventListener('visibilitychange', wake); window.addEventListener('pageshow', wake);
    video.addEventListener('canplay', play);
    const draw = (now) => {
      if (!document.body.contains(video)) return off();
      if (video.readyState >= 2) { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video); gl.drawArrays(gl.TRIANGLES, 0, 6); panel.classList.add('flag-ready'); }
      watch(now || 0);
      flagLoop = requestAnimationFrame(draw);
    };
    cancelAnimationFrame(flagLoop);
    play();
    draw();
  }

  // ---------------------------------------------------------------- maps (Leaflet, loaded only on map screens)
  const M = { el: null, map: null, layers: [], kind: null, loading: null };
  function loadLeaflet() {
    if (window.L) return Promise.resolve();
    if (M.loading) return M.loading;
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '../js/leaflet/leaflet.css'; document.head.appendChild(css);
    return (M.loading = loadScript('../js/leaflet/leaflet.js'));
  }
  // Map tiles come from js/map-tiles.js (OpenStreetMap, or Google once a key is set in Vercel).
  const addTiles = (map) => (window.tamveenTiles ? tamveenTiles(map, API, S.lang) : L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map));
  function mapIn(slot, kind, center, zoom, opts = {}) {
    if (!M.el) { M.el = document.createElement('div'); M.el.className = 'map'; }
    slot.appendChild(M.el);
    return loadLeaflet().then(() => {
      if (!M.map) {
        M.map = L.map(M.el, { zoomControl: false, attributionControl: true });
        addTiles(M.map);
      }
      if (M.kind !== kind || opts.reset) { M.layers.forEach((l) => l.remove()); M.layers = []; M.map.setView(center, zoom); M.kind = kind; M.fitted = false; }
      M.map.invalidateSize();
      return M.map;
    });
  }
  const layer = (l) => { l.addTo(M.map); M.layers.push(l); return l; };
  const divIcon = (html, size, anchor) => L.divIcon({ className: '', html, iconSize: size, iconAnchor: anchor });

  function viewAddress(id, then) {
    const P = S.profile || { addresses: [] };
    const a = id && id !== 'new' ? P.addresses.find((x) => x.id === id) : null;
    if (!ui.form || ui.form.key !== (id || 'new')) ui.form = Object.assign({ key: id || 'new', label: 'Home', house: '', street: '', district: '', city: 'Riyadh', notes: '', lat: null, lng: null, def: !P.addresses.length || (a && a.id === P.defaultAddress) }, a || {});
    const F = ui.form;
    const lbl = (k) => `<button type="button" class="${F.label === k ? 'on' : ''}" data-a="f-label" data-v="${k}">${t(k)}</button>`;
    const fld = (k, title, ph, extra = '') => `<label class="field"><span>${title}</span><input class="in" data-in="f" data-f="${k}" value="${esc(F[k])}" ${ph ? `placeholder="${esc(ph)}"` : ''} ${extra}></label>`;
    return `<div class="screen" style="padding-bottom:0">
      <div class="map-top"><div id="addr-map" class="map"></div><span class="center-pin">${I.bigpin}</span>
        <a class="lbtn back" href="#/${then === 'place' ? 'basket' : then === 'acct' ? 'account' : 'home'}" aria-label="${t('Back')}">${I.back}</a>
        <span class="hint">${t('Move the map to put the pin on your door')}</span>
        <button class="locbtn" data-a="locate">${I.loc} ${t('Use my location')}</button></div>
      <form class="form" data-form="address" data-then="${esc(then || '')}">
        <div class="seg">${lbl('Home')}${lbl('Work')}${lbl('Other')}</div>
        ${fld('house', t('House or building'), '', 'autocomplete="address-line1" required')}
        ${fld('street', t('Street'), '', 'autocomplete="address-line2"')}
        <div class="two">${fld('district', t('District'), '', 'required')}${fld('city', t('City'), '', 'autocomplete="address-level2"')}</div>
        <label class="field"><span>${t('Notes')} <small>${t('(gate code, landmark)')}</small></span><input class="in" data-in="f" data-f="notes" value="${esc(F.notes)}" placeholder="${esc(t('e.g. Green gate, next to the mosque'))}"></label>
        <label class="check"><input type="checkbox" data-in="f-def" ${F.def ? 'checked' : ''}> ${t('Make this my default address')}</label>
        ${F.err ? `<div class="warnline">${esc(F.err)}</div>` : ''}
      </form>
      <div class="dock"><button class="btn" data-a="save-address" ${ui.busy ? 'disabled' : ''}>${t('Save address')} ${I.arrow}</button></div>
    </div>`;
  }
  function mountAddressMap() {
    const slot = $('#addr-map'); if (!slot) return;
    const F = ui.form, sh = shop();
    const c = F.lat != null ? [F.lat, F.lng] : [sh.lat, sh.lng];
    mapIn(slot, 'addr:' + F.key, c, F.lat != null ? 17 : 14).then((map) => {
      map.off('moveend'); map.on('moveend', () => { const m = map.getCenter(); if (ui.form) { ui.form.lat = r2(m.lat * 1e4) / 1e4; ui.form.lng = r2(m.lng * 1e4) / 1e4; } });
    });
  }
  function locate() {
    const done = (lat, lng) => { if (M.map) M.map.setView([lat, lng], 17); if (ui.form) { ui.form.lat = lat; ui.form.lng = lng; } };
    const Geo = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Geolocation;
    if (Geo) return Geo.getCurrentPosition({ enableHighAccuracy: true }).then((p) => done(p.coords.latitude, p.coords.longitude)).catch(() => toast(t('Location is off. Move the map to your door instead.'), 'bad'));
    if (!navigator.geolocation) return toast(t('Location is off. Move the map to your door instead.'), 'bad');
    navigator.geolocation.getCurrentPosition((p) => done(p.coords.latitude, p.coords.longitude), () => toast(t('Location is off. Move the map to your door instead.'), 'bad'), { enableHighAccuracy: true, timeout: 12000 });
  }
  async function saveAddress() {
    const F = ui.form, P = S.profile; if (!F || !P) return;
    if (!F.house.trim() || !F.district.trim()) { F.err = t('Enter the house or building, and the district.'); return render(); }
    if (F.lat == null && M.map) { const m = M.map.getCenter(); F.lat = m.lat; F.lng = m.lng; }
    const id = F.key === 'new' ? 'a' + Date.now().toString(36) : F.key;
    const rec = { id, label: F.label, house: F.house, street: F.street, district: F.district, city: F.city, notes: F.notes, lat: F.lat, lng: F.lng };
    const addresses = P.addresses.filter((x) => x.id !== id).concat([rec]);
    ui.busy = true; render();
    try {
      S.profile = await api('/me', { method: 'PUT', body: { addresses, defaultAddress: F.def ? id : P.defaultAddress } });
      S.addressId = id; persist(); ui.form = null;
      const then = $('[data-form="address"]') && $('[data-form="address"]').dataset.then;
      ui.busy = false; go(then === 'place' ? 'basket' : then === 'acct' ? 'account' : 'home');
    } catch (e) { ui.busy = false; F.err = e.message; render(); }
  }

  // ---------------------------------------------------------------- orders and tracking
  const STEPS = ['new', 'preparing', 'ready', 'out', 'delivered'];
  const STEP_LBL = { new: 'Placed', preparing: 'Preparing', ready: 'Ready', out: 'On the way', delivered: 'Delivered', cancelled: 'Cancelled' };
  const itemsText = (o) => { const names = o.lines.map((l) => N(l).replace(/ · .*$/, '')); return names.length > 3 ? `${names.slice(0, 3).join(isAr() ? '، ' : ', ')} ${t('and {n} more', { n: names.length - 3 })}` : names.join(isAr() ? '، ' : ', '); };
  const orderTotal = (o) => (o.billedTotal != null ? o.billedTotal : o.total);
  function viewOrders() {
    if (!S.token) return `<div class="screen"><header class="hdr sub"><span style="width:48px"></span><div class="t"><h1>${t('My orders')}</h1></div><span style="width:48px"></span></header>
      <div class="olist"><div class="oc" style="align-items:center;text-align:center;gap:14px;padding:28px 16px"><p>${t('Sign in to see your orders.')}</p><button class="btn sm" data-a="signin">${t('Sign in')}</button></div></div>${nav('orders')}</div>`;
    const list = ui.orders;
    const cards = !list ? `<div class="empty">…</div>` : !list.length ? `<div class="oc" style="text-align:center;padding:28px 16px"><p>${t('No orders yet.')}</p></div>` : list.map((o) => {
      const live = ['new', 'preparing', 'ready', 'out'].includes(o.status);
      const stc = o.status === 'out' ? 'dark' : o.status === 'cancelled' ? 'grey' : '';
      return `<div class="oc ${live ? 'live' : ''}"><div class="top"><span><b>${t('Order #{n}', { n: orderNo(o) })}</b><small>${esc(fmtWhen(o.at))}</small></span><span class="st ${stc}">${t(STEP_LBL[o.status])}</span></div>
        <p>${o.status === 'cancelled' ? esc(o.cancelReason && o.cancelReason !== 'Cancelled by customer' ? t('Cancelled by the shop: {r}', { r: t(o.cancelReason) }) : t('Cancelled')) : esc(itemsText(o))}</p>
        ${o.status !== 'cancelled' ? `<div class="bot"><b>${sar(orderTotal(o))}</b>${live ? `<a class="btn sm" href="#/order/${esc(o.id)}">${t('Track')} ${I.arrow}</a>` : `<button class="btn sm outline" data-a="again" data-id="${esc(o.id)}">${t('Order again')}</button>`}</div>` : ''}</div>`;
    }).join('');
    return `<div class="screen"><header class="hdr sub"><span style="width:48px"></span><div class="t"><h1>${t('My orders')}</h1></div><span style="width:48px"></span></header><div class="olist">${cards}</div>${nav('orders')}</div>`;
  }
  function viewTrack(id) {
    const o = ui.orders && ui.orders.find((x) => x.id === id);
    if (!o) return `<div class="screen"><div class="trk-map"><a class="lbtn" href="#/orders" aria-label="${t('Back')}">${I.back}</a></div><div class="sheet-card"><div class="empty">…</div></div></div>`;
    const idx = STEPS.indexOf(o.status), ag = o.agent;
    const head = { new: 'Order placed', preparing: 'Being prepared', ready: 'Ready, waiting for a driver', out: 'On the way to you', cancelled: 'Order cancelled' }[o.status];
    const a = o.address || {};
    return `<div class="screen" style="padding-bottom:0">
      <div class="trk-map"><div id="trk-map" class="map"></div><a class="lbtn" href="#/orders" aria-label="${t('Back')}">${I.back}</a>
        ${o.status === 'out' && ag && ag.at ? `<span class="live-pill"><i></i>${t('Live · updated {n}', { n: ago(ag.at) })}</span>` : ''}</div>
      <div class="sheet-card"><span class="grab" aria-hidden="true"></span>
        <div><span class="kicker">${t('Order #{n}', { n: orderNo(o) })}</span><h1>${head ? t(head) : t('Delivered {t}', { t: fmtTime(o.history.slice(-1)[0].at) })}</h1></div>
        ${o.status !== 'cancelled' ? `<ol class="steps" aria-label="Order status">${STEPS.map((s, i) => `<li class="${i < idx || (i === idx && s === 'delivered') ? 'done' : i === idx ? 'cur' : ''}" ${i === idx ? 'aria-current="step"' : ''}><i></i><span>${t(STEP_LBL[s])}</span></li>`).join('')}</ol>` : `<p class="muted" style="margin:0">${esc(t(o.cancelReason || ''))}</p>`}
        ${o.status === 'out' && ag ? `<div class="driver"><span class="av">${esc((N(ag) || ag.name || '?').slice(0, 1))}</span><span class="who"><b>${esc(isAr() ? ag.nameAr || ag.name : ag.name)}</b><span>${t('Your driver')}</span></span>${ag.phone ? `<a class="callbtn" href="tel:${esc(ag.phone.replace(/\s/g, ''))}" aria-label="${t('Phone')}">${I.phone}</a>` : ''}</div>` : ''}
        <dl class="kv"><div><dt>${t('Deliver to')}</dt><dd>${esc(t(a.label || 'Home'))} · ${esc([a.house, a.district].filter(Boolean).join(', '))}</dd></div>
          <div><dt>${t('Pay on delivery')}</dt><dd style="font-weight:600">${t(o.payment === 'card' ? 'Card' : 'Cash')} · ${sar(orderTotal(o))}</dd></div></dl>
        <details><summary class="lbl" style="cursor:pointer">${t('Items')} · ${o.lines.length}</summary><div class="items-mini" style="margin-top:10px">${o.lines.map((l) => `<div><span>${esc(N(l))} × ${l.weighted ? l.qty + (isAr() ? ' كجم' : ' kg') : l.qty}</span><span>${sar(l.price * l.qty)}</span></div>`).join('')}${o.deliveryFee ? `<div><span>${t('Delivery fee')}</span><span>${sar(o.deliveryFee)}</span></div>` : ''}</div></details>
        ${o.status === 'new' ? `<button class="btn ghost" data-a="cancel-order" data-id="${esc(o.id)}">${t('Cancel order')}</button>` : ''}
      </div></div>`;
  }
  function mountTrackMap(id) {
    const slot = $('#trk-map'); const o = ui.orders && ui.orders.find((x) => x.id === id); if (!slot || !o) return;
    const sh = shop(), a = o.address || {}, home = a.lat != null ? [a.lat, a.lng] : null;
    mapIn(slot, 'trk:' + id, home || [sh.lat, sh.lng], 14).then((map) => {
      M.layers.forEach((l) => l.remove()); M.layers = [];
      layer(L.marker([sh.lat, sh.lng], { icon: divIcon(`<span class="mk-shop">${I.store}</span>`, [36, 36], [18, 18]) }));
      if (home) layer(L.marker(home, { icon: divIcon(I.bigpin.replace('width="40" height="52"', 'width="30" height="40"'), [30, 40], [15, 40]) }));
      const ag = o.agent, pts = [[sh.lat, sh.lng]].concat(home ? [home] : []);
      if (o.status === 'out' && ag && ag.lat != null) {
        layer(L.marker([ag.lat, ag.lng], { icon: divIcon('<span class="mk-me"></span>', [30, 30], [15, 15]) }));
        if (home) layer(L.polyline([[ag.lat, ag.lng], home], { color: '#105448', weight: 3, dashArray: '2 8', lineCap: 'round' }));
        pts.push([ag.lat, ag.lng]);
      }
      if (!M.fitted) { map.fitBounds(pts, { padding: [70, 70], maxZoom: 16 }); M.fitted = true; }
    });
  }

  // ---------------------------------------------------------------- account
  function viewAccount() {
    const P = S.profile;
    const row = (label, val, a, extra = '') => `<button data-a="${a}" ${extra}><span>${label}</span><span class="v">${val}${I.next}</span></button>`;
    const help = `<section><h2>${t('Help')}</h2><div class="list"><a href="privacy.html"><span>${t('Privacy policy')}</span>${I.next}</a><a href="terms.html"><span>${t('Terms')}</span>${I.next}</a>
      <a href="tel:${esc((shop().phone || '').replace(/\s/g, ''))}"><span>${t('Contact the shop')}</span>${I.next}</a></div></section>`;
    if (!P) return `<div class="screen"><header class="hdr acct"><span class="av">${I.user}</span><div style="padding-top:4px"><h1>${t('Welcome')}</h1><span>${t('Sign in to order and track deliveries.')}</span></div></header>
      <div class="acc"><button class="btn" data-a="signin">${t('Sign in')}</button>
      <section><h2>${t('Profile')}</h2><div class="list">${row(t('Language'), isAr() ? 'العربية' : 'English', 'lang')}</div></section>${help}</div>${nav('account')}</div>`;
    return `<div class="screen"><header class="hdr acct"><span class="av">${esc((P.name || '?').slice(0, 1).toUpperCase())}</span><div style="padding-top:4px"><h1>${esc(P.name || '')}</h1><span>${t(P.provider === 'apple' ? 'Signed in with Apple' : 'Signed in with Google')}</span></div></header>
      <div class="acc">
        <section><h2>${t('Profile')}</h2><div class="list">${row(t('Name'), esc(P.name), 'edit-name')}${row(t('Phone'), P.phone ? esc(P.phone) : t('Add (optional)'), 'edit-phone')}
          ${row(t('Saved addresses'), P.addresses.length, 'pick-address', 'data-from="acct"')}${row(t('Language'), isAr() ? 'العربية' : 'English', 'lang')}</div></section>
        ${help}
        <div style="display:flex;flex-direction:column"><button class="btn ghost" data-a="signout">${t('Sign out')}</button><button class="btn" style="background:none;color:var(--red);height:44px;font-size:14px" data-a="delete">${t('Delete account')}</button></div>
      </div>${nav('account')}</div>`;
  }

  // ---------------------------------------------------------------- sheets, toasts
  function sheetHtml() {
    const s = ui.sheet; if (!s) return '';
    let b = '';
    if (s.kind === 'addresses') {
      const P = S.profile, cur = currentAddress();
      b = `<span class="grab"></span><h2>${t('Choose an address')}</h2>
        ${P.addresses.map((a) => `<div class="radio ${cur && cur.id === a.id ? 'on' : ''}" style="padding:12px 14px"><button class="o" style="background:none" data-a="use-address" data-id="${a.id}" aria-label="${esc(addrTitle(a))}"></button>
          <button data-a="use-address" data-id="${a.id}" style="flex:1;border:0;background:none;text-align:start;padding:0"><b>${esc(t(a.label))}</b><small>${esc([a.house, a.street, a.district].filter(Boolean).join(', '))}</small></button>
          <button class="linkbtn" data-a="edit-address" data-id="${a.id}">${t('Edit')}</button></div>`).join('')}
        <button class="btn ghost" data-a="new-address">+ ${t('Add new address')}</button>`;
    } else if (s.kind === 'name' || s.kind === 'phone') {
      b = `<span class="grab"></span><h2>${t(s.kind === 'name' ? 'Name' : 'Phone')}</h2><form data-form="edit-${s.kind}" style="display:flex;flex-direction:column;gap:12px">
        <input class="in" name="v" ${s.kind === 'phone' ? 'type="tel" inputmode="tel" autocomplete="tel"' : 'autocomplete="name" required'} value="${esc(S.profile[s.kind] || '')}" ${s.kind === 'phone' ? `placeholder="+966 5x xxx xxxx"` : ''}>
        <button class="btn" type="submit">${t('Save')}</button><button class="btn ghost" type="button" data-a="sheet-close">${t('Cancel')}</button></form>`;
    } else if (s.kind === 'delete') {
      b = `<span class="grab"></span><h2>${t('Delete your account?')}</h2><p>${t('Your name, phone and saved addresses are deleted now. Past orders are kept without your name, only as the tax invoices the shop must keep.')}</p>
        <button class="btn" style="background:var(--red)" data-a="delete-ok" ${ui.busy ? 'disabled' : ''}>${t('Delete')}</button><button class="btn ghost" data-a="sheet-close">${t('Cancel')}</button>`;
    } else if (s.kind === 'cancel') {
      b = `<span class="grab"></span><h2>${t('Cancel this order?')}</h2><button class="btn" style="background:var(--red)" data-a="cancel-ok" data-id="${esc(s.id)}">${t('Yes, cancel')}</button><button class="btn ghost" data-a="sheet-close">${t('Keep order')}</button>`;
    }
    return `<div class="veil" data-a="veil"><div class="sheet" role="dialog" aria-modal="true">${b}</div></div>`;
  }
  let toastTimer = null;
  function toast(msg, kind) {
    let el = $('#toast'); if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.className = 'toast ' + (kind || ''); el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2800);
  }

  // ---------------------------------------------------------------- render
  function renderOverlay(keepFlag) {
    let o = $('#overlay');
    if (!ui.signin) { if (o) o.innerHTML = ''; return; }
    if (keepFlag && $('#signin')) { $('#signin .panel').innerHTML = panelHtml(); return; }
    o.innerHTML = signinHtml();
  }
  function render() {
    document.documentElement.lang = S.lang; document.documentElement.dir = isAr() ? 'rtl' : 'ltr';
    const [r, a, b] = route();
    const act = document.activeElement, fk = act && act.dataset ? (act.dataset.in || '') + (act.dataset.f || '') : '', sel = fk && act.selectionStart != null ? [act.selectionStart, act.selectionEnd] : null;
    const catScroll = $('[data-scroll="cats"]') ? $('[data-scroll="cats"]').scrollLeft : 0;
    if (M.el && M.el.parentNode) M.el.remove();
    const views = { home: viewHome, product: () => viewProduct(a), basket: viewBasket, address: () => (S.profile ? viewAddress(a, b) : viewHome()), orders: viewOrders, order: () => viewTrack(a), account: viewAccount };
    $('#app').innerHTML = (views[r] || viewHome)() + sheetHtml();
    const cs = $('[data-scroll="cats"]'); if (cs) cs.scrollLeft = catScroll;
    if (r === 'address' && S.profile) mountAddressMap();
    if (r === 'order') mountTrackMap(a);
    if (fk) { const el = document.querySelector(`[data-in="${act.dataset.in}"]${act.dataset.f ? `[data-f="${act.dataset.f}"]` : ''}`); if (el) { el.focus(); if (sel) try { el.setSelectionRange(sel[0], sel[1]); } catch (e) { /* ignore */ } } }
  }

  // ---------------------------------------------------------------- actions
  // ---------------------------------------------------------------- voice note at checkout
  // The audio itself goes to the shop (no speech-to-text), so customers can talk in Arabic or English.
  const MAX_SECS = 120;
  const V = { state: 'idle', blob: null, url: null, secs: 0, rec: null, stream: null, timer: null, started: 0, audio: null };
  const clock = (n) => Math.floor(n / 60) + ':' + String(Math.floor(n % 60)).padStart(2, '0');
  function voiceHtml() {
    if (V.state === 'rec') return `<div class="voice rec"><i class="rdot"></i><span id="vtime">${clock(V.secs)}</span><span class="vt">${t('Recording…')}</span><button class="vbtn stop" data-a="rec-stop">${I.stop}${t('Stop')}</button></div>`;
    if (V.state === 'ready') return `<div class="voice"><button class="vbtn play" data-a="v-play" aria-label="${t('Play')}">${V.audio && !V.audio.paused ? I.pause : I.play}</button><span class="vt"><b>${t('Voice note')}</b> · ${clock(V.secs)}</span><button class="vbtn ghost" data-a="v-del" aria-label="${t('Delete voice note')}">${I.trash}</button></div>`;
    return `<button class="voice idle" data-a="rec-start">${I.mic}<span class="vt"><b>${t('Record a voice note')}</b><small>${t('Talk to the shop in Arabic or English')}</small></span></button>`;
  }
  async function recStart() {
    if (!navigator.mediaDevices || !window.MediaRecorder) return toast(t('Voice notes are not supported on this device.'), 'bad');
    try { V.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (e) { return toast(t('Allow the microphone to record a voice note.'), 'bad'); }
    const type = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find((x) => MediaRecorder.isTypeSupported(x)) || '';
    const chunks = [];
    V.rec = new MediaRecorder(V.stream, type ? { mimeType: type, audioBitsPerSecond: 48000 } : undefined);
    V.rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    V.rec.onstop = () => {
      V.stream.getTracks().forEach((tr) => tr.stop()); clearInterval(V.timer);
      V.blob = new Blob(chunks, { type: (V.rec.mimeType || type || 'audio/webm').split(';')[0] });
      V.secs = Math.max(1, Math.round((Date.now() - V.started) / 1000));
      if (V.url) URL.revokeObjectURL(V.url);
      V.url = URL.createObjectURL(V.blob); V.state = V.blob.size > 200 ? 'ready' : 'idle'; render();
    };
    V.rec.start(1000); V.started = Date.now(); V.secs = 0; V.state = 'rec'; render();
    V.timer = setInterval(() => {
      V.secs = (Date.now() - V.started) / 1000;
      const el = $('#vtime'); if (el) el.textContent = clock(V.secs);
      if (V.secs >= MAX_SECS) recStop();
    }, 250);
  }
  function recStop() { if (V.rec && V.rec.state !== 'inactive') V.rec.stop(); }
  function voiceClear() { if (V.audio) V.audio.pause(); if (V.url) URL.revokeObjectURL(V.url); Object.assign(V, { state: 'idle', blob: null, url: null, secs: 0, audio: null }); }
  function voicePlay() {
    if (!V.audio) { V.audio = new Audio(V.url); V.audio.onended = V.audio.onpause = V.audio.onplay = () => render(); }
    if (V.audio.paused) V.audio.play(); else V.audio.pause();
  }
  async function uploadVoice() {
    if (V.state !== 'ready' || !V.blob) return null;
    const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(V.blob); });
    return api('/voice', { method: 'POST', body: { audio: b64, type: V.blob.type, secs: Math.round(V.secs) } });
  }

  async function placeOrder() {
    if (!S.token) return openSignin('place');
    if (!S.profile || !S.profile.name) return openSignin('place');
    const a = currentAddress(); if (!a) return go('address/new/place');
    const T = totals(); if (!T.lines.length || ui.busy) return;
    if (V.state === 'rec') recStop();
    ui.busy = true; render();
    try {
      const voice = await uploadVoice();
      const { order } = await api('/orders', { method: 'POST', body: { lines: T.lines.map((l) => ({ pid: l.p.id, qty: l.qty })), addressId: a.id, note: S.note, voice, payment: S.payment } });
      S.basket = {}; S.note = ''; persist(); voiceClear();
      ui.orders = [order].concat(ui.orders || []);
      ui.busy = false; toast(t('Order placed. We are on it.')); go('order/' + order.id);
    } catch (e) { ui.busy = false; toast(e.message, 'bad'); render(); loadCatalog(); }
  }
  const actions = {
    add: (el) => add(el.dataset.id), sub: (el) => sub(el.dataset.id),
    'rec-start': () => recStart(), 'rec-stop': () => recStop(), 'v-play': () => voicePlay(), 'v-del': () => { voiceClear(); render(); },
    lang: () => { S.lang = isAr() ? 'en' : 'ar'; persist(); render(); },
    cat: (el) => { ui.cat = ui.cat === el.dataset.id ? null : el.dataset.id; render(); },
    go: (el) => go(el.dataset.to),
    set: (el) => { S[el.dataset.k] = el.dataset.v; persist(); render(); },
    pack: (el) => { ui.pack[el.dataset.id] = Number(el.dataset.q); render(); },
    'pd-add': (el) => { const p = prod(el.dataset.id); ui.pdQty[p.id] = r2((ui.pdQty[p.id] || 1) + stepOf(p)); render(); },
    'pd-sub': (el) => { const p = prod(el.dataset.id); ui.pdQty[p.id] = Math.max(stepOf(p), r2((ui.pdQty[p.id] || 1) - stepOf(p))); render(); },
    'pd-put': (el) => { const p = prod(el.dataset.id); setQty(p.id, (S.basket[p.id] || 0) + Number(el.dataset.n)); ui.pdQty[p.id] = 1; toast(t('Added to basket')); history.length > 1 ? history.back() : go('home'); },
    place: () => placeOrder(),
    signin: () => openSignin(route()[0] === 'orders' ? 'orders' : null),
    'signin-close': () => closeSignin(),
    'signin-back': () => { ui.signin.step = 'start'; ui.signin.err = ''; renderOverlay(true); },
    auth: (el) => doAuth(el.dataset.p),
    'pick-address': (el) => {
      const from = el.dataset.from || (route()[0] === 'basket' ? 'place' : '');
      if (!S.token) return openSignin(from === 'place' ? 'place' : 'address/new');
      if (!S.profile.addresses.length) return go('address/new/' + from);
      ui.sheet = { kind: 'addresses', from }; render();
    },
    'use-address': (el) => { S.addressId = el.dataset.id; persist(); ui.sheet = null; render(); },
    'edit-address': (el) => { const from = ui.sheet.from; ui.sheet = null; ui.form = null; go('address/' + el.dataset.id + '/' + (from || '')); },
    'new-address': () => { const from = ui.sheet.from; ui.sheet = null; ui.form = null; go('address/new/' + (from || '')); },
    'f-label': (el) => { ui.form.label = el.dataset.v; render(); },
    locate: () => locate(),
    'save-address': () => saveAddress(),
    again: (el) => { const o = ui.orders.find((x) => x.id === el.dataset.id); o.lines.forEach((l) => { const p = prod(l.pid); if (p && p.stock > 0) S.basket[p.id] = l.qty; }); persist(); go('basket'); },
    'cancel-order': (el) => { ui.sheet = { kind: 'cancel', id: el.dataset.id }; render(); },
    'cancel-ok': async (el) => { ui.sheet = null; try { const { order } = await api('/orders', { method: 'PATCH', body: { id: el.dataset.id, action: 'cancel' } }); ui.orders = ui.orders.map((o) => (o.id === order.id ? order : o)); } catch (e) { toast(e.message, 'bad'); } render(); },
    'edit-name': () => { ui.sheet = { kind: 'name' }; render(); }, 'edit-phone': () => { ui.sheet = { kind: 'phone' }; render(); },
    delete: () => { ui.sheet = { kind: 'delete' }; render(); },
    'delete-ok': async () => { ui.busy = true; render(); try { await api('/me', { method: 'DELETE' }); signOut(); toast(t('Account deleted')); } catch (e) { toast(e.message, 'bad'); } ui.busy = false; ui.sheet = null; render(); },
    signout: () => { signOut(); toast(t('Signed out')); render(); },
    'sheet-close': () => { ui.sheet = null; render(); },
    veil: (el, ev) => { if (ev.target === el) { ui.sheet = null; render(); } },
  };
  function signOut() { S.token = null; S.profile = null; S.addressId = null; ui.orders = null; persist(); try { if (window.google && google.accounts) google.accounts.id.disableAutoSelect(); } catch (e) { /* ignore */ } }

  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-a]'); if (!el) return;
    const f = actions[el.dataset.a]; if (!f) return;
    if (el.tagName === 'A' && el.dataset.a) ev.preventDefault();
    f(el, ev);
  });
  document.addEventListener('input', (ev) => {
    const el = ev.target;
    if (el.dataset.in === 'q') { ui.q = el.value; render(); }
    if (el.dataset.in === 'note') { S.note = el.value; persist(); }
    if (el.dataset.in === 'f') ui.form[el.dataset.f] = el.value;
    if (el.dataset.in === 'f-def') ui.form.def = el.checked;
  });
  document.addEventListener('scroll', (ev) => {
    const el = ev.target; if (!el.dataset || el.dataset.scroll !== 'cats') return;
    const pg = Math.round(Math.abs(el.scrollLeft) / el.clientWidth); if (pg !== (ui.catPage || 0)) { ui.catPage = pg; document.querySelectorAll('.dots i').forEach((d, i) => d.classList.toggle('on', i === pg)); }
  }, true);
  document.addEventListener('submit', async (ev) => {
    const f = ev.target.closest('[data-form]'); if (!f) return; ev.preventDefault();
    const d = Object.fromEntries(new FormData(f).entries());
    if (f.dataset.form === 'demo') {
      ui.busy = true; renderOverlay(true);
      try { await finishAuth({ provider: ui.signin.provider, demo: true, name: d.name, email: d.email }); } catch (e) { if (ui.signin) ui.signin.err = e.message; }
      ui.busy = false; if (ui.signin) renderOverlay(true);
    }
    if (f.dataset.form === 'name') {
      ui.busy = true; renderOverlay(true);
      try { S.profile = await api('/me', { method: 'PUT', body: { name: d.name, phone: d.phone } }); persist(); ui.busy = false; afterSignin(); }
      catch (e) { ui.busy = false; ui.signin.err = e.message; renderOverlay(true); }
    }
    if (f.dataset.form === 'address') saveAddress();
    if (/^edit-/.test(f.dataset.form)) {
      const k = f.dataset.form.slice(5);
      try { S.profile = await api('/me', { method: 'PUT', body: { [k]: d.v } }); persist(); ui.sheet = null; render(); } catch (e) { toast(e.message, 'bad'); }
    }
  });
  window.addEventListener('hashchange', () => { if (route()[0] !== 'address') ui.form = null; ui.sheet = null; window.scrollTo(0, 0); render(); if (route()[0] === 'orders' || route()[0] === 'order') loadOrders(); });

  // Live tracking: refresh the order while it is open, faster while the driver is on the way.
  setInterval(() => {
    if (document.hidden || !S.token) return;
    const [r] = route();
    if (r === 'order' || r === 'orders') loadOrders();
  }, 8000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { loadOrders(); if (route()[0] === 'home') loadCatalog(); } });

  const ov = document.createElement('div'); ov.id = 'overlay'; document.body.appendChild(ov);
  render(); loadCatalog(); loadProfile(); loadOrders();
})();
