// Seed data for the Tamveen POS demo. Everything lives in localStorage; "Reset demo data" restores this.
window.SEED = (function () {
  const today = new Date();
  const iso = (d) => d.toISOString();
  const daysAgo = (n, h = 10, m = 0) => { const d = new Date(today); d.setDate(d.getDate() - n); d.setHours(h, m, 0, 0); return d; };
  const dateOnly = (d) => d.toISOString().slice(0, 10);

  const categories = [
    { id: 'fav', en: 'Favourites', ar: 'المفضلة' },
    { id: 'dairy', en: 'Dairy & eggs', ar: 'ألبان وبيض' },
    { id: 'bakery', en: 'Bakery', ar: 'مخبوزات' },
    { id: 'rice', en: 'Rice & grains', ar: 'أرز وحبوب' },
    { id: 'produce', en: 'Produce · by weight', ar: 'خضار وفواكه · بالوزن' },
    { id: 'drinks', en: 'Drinks', ar: 'مشروبات' },
    { id: 'pantry', en: 'Pantry', ar: 'مواد غذائية' },
    { id: 'household', en: 'Household', ar: 'منظفات' },
  ];

  // price = shelf price per base unit, VAT included where it applies.
  const p = (id, sku, en, ar, cat, price, stock, opts = {}) => Object.assign({
    id, sku, en, ar, cat, price, stock, vat: 'standard', reorder: 10, cost: +(price / 1.15 * 0.8).toFixed(2),
    unit: 'piece', weighted: false, fav: false, active: true, brand: '',
    packs: [],
  }, opts);

  const products = [
    p('p1', 'DRY-MLK-1L', 'Fresh milk 1 L', 'حليب طازج ١ لتر', 'dairy', 6.50, 48, { fav: true, brand: 'Almarai', packs: [{ name: 'Piece', qty: 1, barcode: '6281000001011', base: true }, { name: 'Carton', qty: 12, barcode: '6281000001028' }] }),
    p('p2', 'BAK-ARB-5', 'Arabic bread · 5 pcs', 'خبز عربي ٥ حبات', 'bakery', 2.00, 120, { fav: true, unit: 'pack', packs: [{ name: 'Pack', qty: 1, barcode: '6281000002018', base: true }] }),
    p('p3', 'RCE-BAS-5K', 'Basmati rice 5 kg', 'أرز بسمتي ٥ كجم', 'rice', 46.00, 22, { fav: true, unit: 'bag', packs: [{ name: 'Bag', qty: 1, barcode: '6281000003015', base: true }, { name: 'Sack of 4', qty: 4, barcode: '6281000003022' }] }),
    p('p4', 'DRY-EGG-30', 'Eggs · tray of 30', 'بيض ٣٠ حبة', 'dairy', 23.00, 15, { fav: true, unit: 'tray', packs: [{ name: 'Tray', qty: 1, barcode: '6281000004012', base: true }] }),
    p('p5', 'DRK-WTR-12', 'Water 12 × 330 ml', 'مياه ١٢ × ٣٣٠ مل', 'drinks', 11.50, 36, { fav: true, unit: 'pack', packs: [{ name: 'Pack', qty: 1, barcode: '6281000005019', base: true }] }),
    p('p6', 'PRD-TOM-KG', 'Tomatoes · per kg', 'طماطم · بالكيلو', 'produce', 4.80, 64.5, { fav: true, unit: 'kg', weighted: true, vat: 'standard', packs: [{ name: 'kg', qty: 1, barcode: '2100006000000', base: true }] }),
    p('p7', 'DRK-OJ-140', 'Orange juice 1.4 L', 'عصير برتقال ١٫٤ لتر', 'drinks', 11.50, 14, { fav: true, cost: 8.20, reorder: 24, packs: [{ name: 'Piece', qty: 1, barcode: '6281000007013', base: true }, { name: 'Carton', qty: 6, barcode: '6281000007020' }] }),
    p('p8', 'PNT-SUG-2K', 'Sugar 2 kg', 'سكر ٢ كجم', 'pantry', 9.75, 3, { fav: true, unit: 'bag', reorder: 12, packs: [{ name: 'Bag', qty: 1, barcode: '6281000008010', base: true }] }),
    p('p9', 'DRY-LBN-1L', 'Laban 1 L', 'لبن ١ لتر', 'dairy', 5.50, 30, { packs: [{ name: 'Piece', qty: 1, barcode: '6281000009017', base: true }] }),
    p('p10', 'DRY-LBH-400', 'Labneh 400 g', 'لبنة ٤٠٠ جم', 'dairy', 12.25, 18, { packs: [{ name: 'Piece', qty: 1, barcode: '6281000010013', base: true }] }),
    p('p11', 'DRY-CHS-500', 'White cheese 500 g', 'جبنة بيضاء ٥٠٠ جم', 'dairy', 17.95, 0, { packs: [{ name: 'Piece', qty: 1, barcode: '6281000011010', base: true }] }),
    p('p12', 'BAK-SAM-6', 'Samoli bread · 6 pcs', 'خبز صامولي ٦ حبات', 'bakery', 3.00, 40, { unit: 'pack', packs: [{ name: 'Pack', qty: 1, barcode: '6281000012017', base: true }] }),
    p('p13', 'BAK-CRS-4', 'Croissant · 4 pcs', 'كرواسون ٤ حبات', 'bakery', 9.50, 12, { unit: 'pack', packs: [{ name: 'Pack', qty: 1, barcode: '6281000013014', base: true }] }),
    p('p14', 'RCE-SEL-5K', 'Sella rice 5 kg', 'أرز سيلا ٥ كجم', 'rice', 39.00, 16, { unit: 'bag', packs: [{ name: 'Bag', qty: 1, barcode: '6281000014011', base: true }] }),
    p('p15', 'RCE-LEN-1K', 'Red lentils 1 kg', 'عدس أحمر ١ كجم', 'rice', 8.75, 25, { unit: 'bag', packs: [{ name: 'Bag', qty: 1, barcode: '6281000015018', base: true }] }),
    p('p16', 'PRD-CUC-KG', 'Cucumbers · per kg', 'خيار · بالكيلو', 'produce', 5.95, 30, { unit: 'kg', weighted: true, packs: [{ name: 'kg', qty: 1, barcode: '2100016000000', base: true }] }),
    p('p17', 'PRD-BAN-KG', 'Bananas · per kg', 'موز · بالكيلو', 'produce', 6.50, 42.2, { unit: 'kg', weighted: true, packs: [{ name: 'kg', qty: 1, barcode: '2100017000000', base: true }] }),
    p('p18', 'PRD-DAT-1K', 'Sukkari dates 1 kg', 'تمر سكري ١ كجم', 'produce', 28.00, 20, { vat: 'standard', unit: 'box', packs: [{ name: 'Box', qty: 1, barcode: '6281000018019', base: true }] }),
    p('p19', 'DRK-LAB-6', 'Cola · 6 × 320 ml', 'كولا ٦ × ٣٢٠ مل', 'drinks', 13.50, 28, { unit: 'pack', packs: [{ name: 'Pack', qty: 1, barcode: '6281000019016', base: true }] }),
    p('p20', 'DRK-TEA-100', 'Black tea · 100 bags', 'شاي أسود ١٠٠ كيس', 'pantry', 16.50, 22, { packs: [{ name: 'Box', qty: 1, barcode: '6281000020012', base: true }] }),
    p('p21', 'PNT-OIL-1L', 'Sunflower oil 1.5 L', 'زيت دوار الشمس ١٫٥ لتر', 'pantry', 15.25, 19, { packs: [{ name: 'Bottle', qty: 1, barcode: '6281000021019', base: true }] }),
    p('p22', 'PNT-COF-250', 'Saudi coffee 250 g', 'قهوة سعودية ٢٥٠ جم', 'pantry', 24.00, 11, { packs: [{ name: 'Pack', qty: 1, barcode: '6281000022016', base: true }] }),
    p('p23', 'HSH-DSH-1L', 'Dish soap 1 L', 'سائل جلي ١ لتر', 'household', 8.95, 26, { packs: [{ name: 'Bottle', qty: 1, barcode: '6281000023013', base: true }] }),
    p('p24', 'HSH-TIS-10', 'Tissues · 10 boxes', 'مناديل ١٠ علب', 'household', 21.00, 9, { packs: [{ name: 'Pack', qty: 1, barcode: '6281000024010', base: true }] }),
    p('p25', 'DRK-MNG-140', 'Mango juice 1.4 L', 'عصير مانجو ١٫٤ لتر', 'drinks', 11.50, 20, { packs: [{ name: 'Piece', qty: 1, barcode: '6281000025017', base: true }, { name: 'Carton', qty: 6, barcode: '6281000025024' }] }),
  ];

  const customers = [
    { id: 'c1', en: 'Abdullah Al-Harbi', ar: 'عبدالله الحربي', phone: '+966 55 123 4567', lang: 'ar', reminders: 'WhatsApp', credit: true, limit: 2000, terms: 'monthly', termDays: 30, reminderDay: 25 },
    { id: 'c2', en: 'Fatimah Al-Qahtani', ar: 'فاطمة القحطاني', phone: '+966 50 765 4321', lang: 'ar', reminders: 'SMS', credit: true, limit: 1000, terms: 'monthly', termDays: 30, reminderDay: 25 },
    { id: 'c3', en: 'Mohammed Al-Otaibi', ar: 'محمد العتيبي', phone: '+966 54 222 8899', lang: 'en', reminders: 'WhatsApp', credit: false, limit: 0, terms: 'none', termDays: 0, reminderDay: 0 },
    { id: 'c4', en: 'Al-Noor Restaurant', ar: 'مطعم النور', phone: '+966 11 456 7788', lang: 'ar', reminders: 'Email', credit: true, limit: 5000, terms: 'net15', termDays: 15, reminderDay: 0, vatNo: '310122334400003' },
  ];

  const L = (pid, qty, discount = 0, reason = '') => {
    const pr = products.find((x) => x.id === pid);
    return { pid, en: pr.en, ar: pr.ar, unit: pr.unit, price: pr.price, qty, vat: pr.vat, discount, reason };
  };

  const inv = (no, date, customerId, lines, opts = {}) => {
    const total = +lines.reduce((s, l) => s + l.price * l.qty - l.discount, 0).toFixed(2);
    return Object.assign({
      id: 'INV-B1-' + String(no).padStart(6, '0'), no, type: 'sale', date: iso(date), customerId, lines, total,
      payments: [{ method: 'cash', amount: total }], change: 0, status: 'paid', outstanding: 0, due: null,
      zatca: 'reported', cashier: 'Khalid', delivery: 'store',
    }, opts);
  };

  const invoices = [
    inv(311, daysAgo(38, 18, 20), 'c1', [L('p3', 4), L('p21', 6), L('p1', 24), L('p20', 4), L('p8', 2)], { payments: [], status: 'unpaid', due: dateOnly(daysAgo(8)), zatca: 'reported' }),
    inv(389, daysAgo(20, 19, 5), 'c1', [L('p3', 6), L('p4', 6), L('p22', 4), L('p18', 3), L('p21', 1)], { payments: [], status: 'unpaid', due: dateOnly(daysAgo(-11)), zatca: 'reported' }),
    inv(455, daysAgo(4, 20, 40), 'c1', [L('p3', 2), L('p4', 4), L('p1', 12), L('p13', 1)], { payments: [], status: 'unpaid', due: dateOnly(daysAgo(-26)), zatca: 'reported' }),
    inv(470, daysAgo(2, 11, 15), 'c2', [L('p1', 4), L('p2', 6), L('p4', 2), L('p17', 1.4)], { payments: [], status: 'unpaid', due: dateOnly(daysAgo(-28)) }),
    inv(476, daysAgo(1, 9, 30), null, [L('p1', 2), L('p2', 3), L('p6', 1.1)]),
    inv(477, daysAgo(1, 13, 2), null, [L('p19', 2), L('p24', 1)], { payments: [{ method: 'card', amount: 48 }] }),
    inv(478, daysAgo(0, 8, 12), null, [L('p5', 2), L('p8', 1), L('p15', 2)]),
    inv(479, daysAgo(0, 9, 41), 'c3', [L('p3', 1), L('p14', 1), L('p21', 2)], { payments: [{ method: 'card', amount: 115.5 }] }),
    inv(480, daysAgo(0, 11, 5), null, [L('p9', 3), L('p10', 1), L('p12', 2)], { zatca: 'queued' }),
    inv(481, daysAgo(0, 12, 47), null, [L('p22', 1), L('p18', 1), L('p20', 1)], { payments: [{ method: 'transfer', amount: 68.5, ref: 'STC-55120' }], zatca: 'queued' }),
  ];
  invoices.forEach((i) => { if (i.status === 'unpaid') i.outstanding = i.total; });

  const heldBills = [
    { id: 'H1', at: iso(daysAgo(0, 13, 10)), label: 'Customer went to get wallet', customerId: null, lines: [L('p3', 1), L('p1', 2), L('p7', 1)] },
    { id: 'H2', at: iso(daysAgo(0, 13, 55)), label: 'Phone order · pick-up', customerId: 'c2', lines: [L('p4', 1), L('p2', 4), L('p6', 2.25)] },
  ];

  const orders = [
    { id: 'ORD-1042', at: iso(daysAgo(0, 12, 20)), channel: 'WhatsApp', customerId: 'c1', type: 'delivery', address: 'Al-Malqa, Street 12, Villa 8', status: 'new', lines: [L('p1', 4), L('p2', 4), L('p4', 1), L('p17', 1.5)] },
    { id: 'ORD-1041', at: iso(daysAgo(0, 11, 2)), channel: 'Phone', customerId: 'c4', type: 'delivery', address: 'Al-Noor Restaurant, King Fahd Rd', status: 'preparing', lines: [L('p3', 4), L('p21', 4), L('p6', 10), L('p16', 6)] },
    { id: 'ORD-1039', at: iso(daysAgo(0, 9, 45)), channel: 'App', customerId: 'c3', type: 'pickup', address: '', status: 'ready', lines: [L('p19', 2), L('p13', 1), L('p5', 1)] },
  ];

  const suppliers = [
    { id: 's1', en: 'Almarai Co.', ar: 'شركة المراعي', phone: '+966 11 470 0005', cats: 'Dairy, juice', lastDelivery: dateOnly(daysAgo(2)), balance: 1840.00 },
    { id: 's2', en: 'Al Watania Bakeries', ar: 'مخابز الوطنية', phone: '+966 11 498 1122', cats: 'Bakery', lastDelivery: dateOnly(daysAgo(0)), balance: 320.00 },
    { id: 's3', en: 'Riyadh Produce Market', ar: 'سوق الرياض للخضار', phone: '+966 50 900 1212', cats: 'Produce', lastDelivery: dateOnly(daysAgo(1)), balance: 0 },
    { id: 's4', en: 'Gulf Foods Trading', ar: 'الخليج للتجارة الغذائية', phone: '+966 12 655 3300', cats: 'Rice, pantry', lastDelivery: dateOnly(daysAgo(9)), balance: 4120.50 },
  ];

  const payments = [
    { id: 'PAY-0091', at: iso(daysAgo(25, 17, 0)), customerId: 'c1', amount: 500, method: 'cash', ref: '', alloc: [] },
  ];

  return {
    version: 4,
    settings: {
      lang: 'en', shopEn: 'Tamveen Mini Market', shopAr: 'تموين ميني ماركت', branch: 'Branch 1', branchAr: 'الفرع ١',
      address: 'Al-Olaya, Riyadh 12211', vatNo: '300012345600003', cr: '1010123456', nextInvoice: 482, nextCN: 12, nextPay: 92,
    },
    users: [
      { id: 'u1', name: 'Khalid', nameAr: 'خالد', role: 'cashier', pin: '1111' },
      { id: 'u2', name: 'Noura', nameAr: 'نورة', role: 'manager', pin: '1234' },
      { id: 'u3', name: 'Saad', nameAr: 'سعد', role: 'owner', pin: '9999' },
    ],
    categories, products, customers, invoices, heldBills, orders, suppliers, payments,
    audit: [],
  };
})();
