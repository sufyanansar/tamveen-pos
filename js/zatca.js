// ZATCA Phase 2 (Fatoora) invoice building, shared by the browser app and the local POS service (server/).
// Builds UBL 2.1 XML, the invoice hash (KSA-13 chain) and the TLV QR. Signing lives in server/ because it needs
// the EGS private key and certificate, which never go to the browser.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ZATCA = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  // ---------------------------------------------------------------- bytes, SHA-256, base64
  const utf8 = (s) => new TextEncoder().encode(String(s));
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
  // Synchronous SHA-256 so issuing an invoice stays synchronous in the app (WebCrypto is async only).
  function sha256(input) {
    const msg = typeof input === 'string' ? utf8(input) : input;
    const len = msg.length, padded = new Uint8Array(((len + 9 + 63) >> 6) << 6);
    padded.set(msg); padded[len] = 0x80;
    const dv = new DataView(padded.buffer);
    dv.setUint32(padded.length - 8, Math.floor(len / 0x20000000)); dv.setUint32(padded.length - 4, (len << 3) >>> 0);
    const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    const W = new Uint32Array(64);
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    for (let off = 0; off < padded.length; off += 64) {
      for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4);
      for (let i = 16; i < 64; i++) {
        const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3), s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
        W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) >>> 0;
        const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
    }
    const out = new Uint8Array(32), odv = new DataView(out.buffer);
    H.forEach((v, i) => odv.setUint32(i * 4, v));
    return out;
  }
  function b64(bytes) {
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
    let bin = ''; bytes.forEach((b) => { bin += String.fromCharCode(b); }); return btoa(bin);
  }
  const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const uuid4 = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    const r = new Uint8Array(16); for (let i = 0; i < 16; i++) r[i] = Math.floor(Math.random() * 256);
    r[6] = (r[6] & 0x0f) | 0x40; r[8] = (r[8] & 0x3f) | 0x80;
    const h = hex(r); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  };

  // PIH of the first invoice in a chain: base64(SHA-256("0") as hex text), as given in the ZATCA spec.
  const PIH0 = 'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==';

  // ---------------------------------------------------------------- canonical XML writer
  // The XML is written directly in C14N 1.1 form with no whitespace between elements, so the invoice hash is
  // simply SHA-256 of the document with UBLExtensions, cac:Signature and the QR reference left out.
  const escText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r/g, '&#xD;');
  const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;').replace(/\t/g, '&#x9;').replace(/\n/g, '&#xA;').replace(/\r/g, '&#xD;');
  // el('cbc:ID', { schemeID: 'CRN' }, '123') — attributes are sorted as C14N requires; children may be strings or arrays.
  function el(name, attrs, ...kids) {
    if (typeof attrs === 'string' || Array.isArray(attrs)) { kids.unshift(attrs); attrs = null; }
    const a = attrs ? Object.keys(attrs).filter((k) => attrs[k] != null).sort().map((k) => ` ${k}="${escAttr(attrs[k])}"`).join('') : '';
    return `<${name}${a}>${kids.flat(Infinity).filter((k) => k != null && k !== false).join('')}</${name}>`;
  }
  const txt = (name, value, attrs) => (value == null || value === '' ? '' : el(name, attrs || null, escText(value)));
  const amt = (name, value) => el(name, { currencyID: 'SAR' }, fix2(value));

  // ---------------------------------------------------------------- amounts
  const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const fix2 = (n) => r2(n).toFixed(2);
  const fixQty = (n) => String(Number(Number(n).toFixed(6)));
  const RATES = { standard: 0.15, zero: 0, exempt: 0, out: 0 };
  const CAT = { standard: 'S', zero: 'Z', exempt: 'E', out: 'O' };
  // Exemption reasons are required for Z/E/O lines. These defaults are placeholders: set the right
  // VATEX code for the goods actually sold (see the ZATCA XML implementation standard, KSA-?? codes).
  const EXEMPTION = {
    zero: { code: 'VATEX-SA-35', text: 'Medicines and medical equipment' },
    exempt: { code: 'VATEX-SA-29', text: 'Financial services mentioned in Article 29 of the VAT Regulations' },
    out: { code: 'VATEX-SA-OOS', text: 'Not subject to VAT' },
  };
  const UNIT = { kg: 'KGM', g: 'GRM', l: 'LTR', piece: 'PCE' };
  const PAYMENT = { cash: '10', card: '48', transfer: '42', credit: '30', balance: '97' };
  const TYPE = { invoice: '388', credit: '381', debit: '383' };

  // Works out every amount the XML needs from VAT-inclusive shelf prices, the way the till shows them.
  function computeLines(lines) {
    return lines.map((l, i) => {
      const cat = l.vat in RATES ? l.vat : 'standard', rate = RATES[cat], qty = Number(l.qty);
      const base = r2(Number(l.priceIncl) / (1 + rate));
      const discUnit = qty ? r2(Number(l.discountIncl || 0) / (1 + rate) / qty) : 0;
      const price = r2(base - discUnit);
      const net = r2(qty * price), vat = r2(net * rate);
      return { i: i + 1, l, cat, rate, qty, base, discUnit, price, net, vat };
    });
  }
  function computeTotals(doc) {
    const rows = computeLines(doc.lines);
    const groups = {};
    rows.forEach((r) => {
      const k = r.cat + ':' + r.rate;
      groups[k] = groups[k] || { cat: r.cat, rate: r.rate, taxable: 0, vat: 0 };
      groups[k].taxable = r2(groups[k].taxable + r.net);
    });
    Object.values(groups).forEach((g) => { g.vat = r2(g.taxable * g.rate); });
    const lineTotal = r2(rows.reduce((s, r) => s + r.net, 0));
    const vat = r2(Object.values(groups).reduce((s, g) => s + g.vat, 0));
    const inclusive = r2(lineTotal + vat);
    // What the customer was actually charged. Any cent difference from per-line rounding goes in PayableRoundingAmount.
    const payable = doc.payable != null ? r2(doc.payable) : inclusive;
    return { rows, groups: Object.values(groups), lineTotal, vat, inclusive, rounding: r2(payable - inclusive), payable };
  }

  // ---------------------------------------------------------------- Riyadh local time
  function riyadh(iso) {
    const d = new Date(new Date(iso).getTime() + 3 * 3600 * 1000).toISOString();
    return { date: d.slice(0, 10), time: d.slice(11, 19) };
  }
  // QR tag 3. Kept in one place so it is easy to change if the SDK validator asks for another format.
  const qrTimestamp = (iso) => { const t = riyadh(iso); return `${t.date}T${t.time}Z`; };

  // ---------------------------------------------------------------- UBL 2.1 invoice
  const NS = {
    xmlns: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
    'xmlns:cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
    'xmlns:cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
    'xmlns:ext': 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
  };
  function address(a) {
    a = a || {};
    return el('cac:PostalAddress', [
      txt('cbc:StreetName', a.street), txt('cbc:AdditionalStreetName', a.street2), txt('cbc:BuildingNumber', a.building), txt('cbc:PlotIdentification', a.plot),
      txt('cbc:CitySubdivisionName', a.district), txt('cbc:CityName', a.city), txt('cbc:PostalZone', a.postal),
      el('cac:Country', txt('cbc:IdentificationCode', a.country || 'SA')),
    ]);
  }
  function party(p, isSeller) {
    const ids = isSeller ? (p.crn ? el('cac:PartyIdentification', txt('cbc:ID', p.crn, { schemeID: 'CRN' })) : '')
      : (p.idValue ? el('cac:PartyIdentification', txt('cbc:ID', p.idValue, { schemeID: p.idScheme || 'NAT' })) : '');
    return el('cac:Party', [
      ids, address(p.address),
      p.vat ? el('cac:PartyTaxScheme', txt('cbc:CompanyID', p.vat), el('cac:TaxScheme', txt('cbc:ID', 'VAT'))) : (isSeller ? '' : el('cac:PartyTaxScheme', el('cac:TaxScheme', txt('cbc:ID', 'VAT')))),
      el('cac:PartyLegalEntity', txt('cbc:RegistrationName', p.name)),
    ]);
  }
  function taxCategory(tag, cat, rate) {
    const ex = EXEMPTION[cat];
    return el(tag, [
      txt('cbc:ID', CAT[cat], tag === 'cac:TaxCategory' ? { schemeAgencyID: '6', schemeID: 'UN/ECE 5305' } : null),
      txt('cbc:Percent', (rate * 100).toFixed(2)),
      tag === 'cac:TaxCategory' && ex ? [txt('cbc:TaxExemptionReasonCode', ex.code), txt('cbc:TaxExemptionReason', ex.text)] : '',
      el('cac:TaxScheme', txt('cbc:ID', 'VAT', tag === 'cac:TaxCategory' ? { schemeAgencyID: '6', schemeID: 'UN/ECE 5153' } : null)),
    ]);
  }

  // doc: { id, uuid, icv, pih, issuedAt, kind: 'invoice'|'credit'|'debit', simplified, ref, reason, payment,
  //        seller: { name, vat, crn, address }, buyer: { name, vat, address } | null,
  //        lines: [{ name, qty, unit, priceIncl, discountIncl, vat }], payable }
  // Returns the pieces of the document so the signer can drop the signature block into place.
  function build(doc) {
    const T = computeTotals(doc), when = riyadh(doc.issuedAt), kind = doc.kind || 'invoice';
    const head = el('Invoice', NS).replace(/<\/Invoice>$/, '');
    const intro = [
      txt('cbc:ProfileID', 'reporting:1.0'),
      txt('cbc:ID', doc.id), txt('cbc:UUID', doc.uuid),
      txt('cbc:IssueDate', when.date), txt('cbc:IssueTime', when.time),
      txt('cbc:InvoiceTypeCode', TYPE[kind], { name: doc.simplified ? '0200000' : '0100000' }),
      txt('cbc:DocumentCurrencyCode', 'SAR'), txt('cbc:TaxCurrencyCode', 'SAR'),
      kind !== 'invoice' ? el('cac:BillingReference', el('cac:InvoiceDocumentReference', txt('cbc:ID', doc.ref || '-'))) : '',
      el('cac:AdditionalDocumentReference', txt('cbc:ID', 'ICV'), txt('cbc:UUID', String(doc.icv))),
      el('cac:AdditionalDocumentReference', txt('cbc:ID', 'PIH'), el('cac:Attachment', txt('cbc:EmbeddedDocumentBinaryObject', doc.pih, { mimeCode: 'text/plain' }))),
    ].join('');
    const qrRef = (qr) => el('cac:AdditionalDocumentReference', txt('cbc:ID', 'QR'), el('cac:Attachment', txt('cbc:EmbeddedDocumentBinaryObject', qr, { mimeCode: 'text/plain' })));
    const sigRef = el('cac:Signature', txt('cbc:ID', 'urn:oasis:names:specification:ubl:signature:Invoice'), txt('cbc:SignatureMethod', 'urn:oasis:names:specification:ubl:dsig:enveloped:xades'));
    const body = [
      el('cac:AccountingSupplierParty', party(doc.seller, true)),
      el('cac:AccountingCustomerParty', doc.buyer ? party(doc.buyer, false) : ''),
      el('cac:Delivery', txt('cbc:ActualDeliveryDate', when.date)),
      el('cac:PaymentMeans', txt('cbc:PaymentMeansCode', PAYMENT[doc.payment] || '10'), kind !== 'invoice' ? txt('cbc:InstructionNote', doc.reason || 'Return') : ''),
      el('cac:TaxTotal', amt('cbc:TaxAmount', T.vat)),
      el('cac:TaxTotal', amt('cbc:TaxAmount', T.vat), T.groups.map((g) => el('cac:TaxSubtotal', amt('cbc:TaxableAmount', g.taxable), amt('cbc:TaxAmount', g.vat), taxCategory('cac:TaxCategory', g.cat, g.rate)))),
      el('cac:LegalMonetaryTotal', [
        amt('cbc:LineExtensionAmount', T.lineTotal), amt('cbc:TaxExclusiveAmount', T.lineTotal), amt('cbc:TaxInclusiveAmount', T.inclusive),
        amt('cbc:AllowanceTotalAmount', 0), amt('cbc:PrepaidAmount', 0), T.rounding ? amt('cbc:PayableRoundingAmount', T.rounding) : '', amt('cbc:PayableAmount', T.payable),
      ]),
      T.rows.map((r) => el('cac:InvoiceLine', [
        txt('cbc:ID', String(r.i)),
        txt('cbc:InvoicedQuantity', fixQty(r.qty), { unitCode: UNIT[r.l.unit] || 'PCE' }),
        amt('cbc:LineExtensionAmount', r.net),
        el('cac:TaxTotal', amt('cbc:TaxAmount', r.vat), amt('cbc:RoundingAmount', r2(r.net + r.vat))),
        el('cac:Item', txt('cbc:Name', r.l.name), taxCategory('cac:ClassifiedTaxCategory', r.cat, r.rate)),
        el('cac:Price', amt('cbc:PriceAmount', r.price), r.discUnit ? el('cac:AllowanceCharge', txt('cbc:ChargeIndicator', 'false'), txt('cbc:AllowanceChargeReason', 'discount'), amt('cbc:Amount', r.discUnit), amt('cbc:BaseAmount', r.base)) : ''),
      ])).join(''),
    ].join('');
    const hashInput = head + intro + body + '</Invoice>';
    const hash = b64(sha256(hashInput));
    return {
      totals: T, hash, hashInput, when,
      // Full document. ext = the <ext:UBLExtensions> element (empty for an unsigned demo document).
      xml: (qr, ext) => '<?xml version="1.0" encoding="UTF-8"?>\n' + head + (ext || '') + intro + qrRef(qr) + sigRef + body + '</Invoice>',
    };
  }

  // ---------------------------------------------------------------- QR (TLV, base64)
  function tlv(values) {
    const parts = [];
    values.forEach((v, i) => {
      if (v == null) return;
      const b = typeof v === 'string' ? utf8(v) : v;
      if (b.length > 255) throw new Error('QR tag ' + (i + 1) + ' is longer than 255 bytes');
      parts.push(Uint8Array.of(i + 1, b.length), b);
    });
    const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
    let o = 0; parts.forEach((p) => { out.set(p, o); o += p.length; });
    return b64(out);
  }
  // Tags 1–6 can be made anywhere; 7–9 (signature, public key, certificate signature) only by the signer.
  function qr(doc, built, sig) {
    sig = sig || {};
    return tlv([doc.seller.name, doc.seller.vat, qrTimestamp(doc.issuedAt), fix2(built.totals.inclusive), fix2(built.totals.vat), built.hash, sig.signature, sig.publicKey, sig.certSignature]);
  }

  // ---------------------------------------------------------------- the POS app's records
  // Seller details ZATCA needs beyond what the demo settings hold. Saved in db.settings.zatca.
  function ensureSettings(settings) {
    const z = settings.zatca = settings.zatca || {};
    const d = { street: 'Olaya Street', building: '1234', district: 'Al-Olaya', city: 'Riyadh', postal: '12211', icv: 0, pih: PIH0 };
    Object.keys(d).forEach((k) => { if (z[k] == null) z[k] = d[k]; });
    return z;
  }
  function seller(settings) {
    const z = ensureSettings(settings);
    return { name: settings.shopAr || settings.shopEn, vat: settings.vatNo, crn: settings.cr,
      address: { street: z.street, building: z.building, district: z.district, city: z.city, postal: z.postal, country: 'SA' } };
  }
  // Turns an app invoice or credit note (db.invoices[i]) into the document shape build() takes.
  function fromApp(inv, db) {
    const cu = inv.customerId ? db.customers.find((c) => c.id === inv.customerId) : null;
    const pay = (inv.payments || [])[0];
    return {
      id: inv.id, uuid: inv.uuid, icv: inv.icv, pih: inv.pih, issuedAt: inv.date,
      kind: inv.type === 'credit_note' ? 'credit' : inv.type === 'debit_note' ? 'debit' : 'invoice',
      simplified: !(cu && cu.vatNo), ref: inv.ref, reason: inv.reason,
      payment: inv.status === 'unpaid' ? 'credit' : pay ? pay.method : 'cash',
      seller: seller(db.settings),
      buyer: cu ? { name: cu.ar || cu.en, vat: cu.vatNo, address: cu.address } : null,
      lines: inv.lines.map((l) => ({ name: l.ar || l.en, qty: l.qty, unit: l.unit, priceIncl: l.price, discountIncl: l.discount || 0, vat: l.vat })),
      payable: inv.total,
    };
  }
  // Gives every invoice without one a UUID, counter (ICV) and previous-invoice hash (PIH), oldest first, and
  // advances the chain. In the browser-only demo this chain is local; with the POS service the service owns it.
  function stampAll(db) {
    const z = ensureSettings(db.settings);
    const todo = db.invoices.filter((i) => !i.uuid).sort((a, b) => new Date(a.date) - new Date(b.date));
    todo.forEach((inv) => {
      inv.uuid = uuid4(); inv.icv = ++z.icv; inv.pih = z.pih;
      const built = build(fromApp(inv, db));
      inv.zhash = built.hash; z.pih = built.hash;
    });
    return todo.length;
  }
  // QR for an app invoice: the signed one from the POS service when there is one, else tags 1–6.
  // live = the POS service signs invoices; until it answers, the receipt shows tags 1–5 only.
  function appQR(inv, db, live) {
    if (inv.zqr) return inv.zqr;
    if (live) {
      const doc = fromApp(Object.assign({}, inv, { uuid: inv.uuid || '-', icv: inv.icv || 0, pih: inv.pih || PIH0 }), db), b = build(doc);
      return tlv([doc.seller.name, doc.seller.vat, qrTimestamp(doc.issuedAt), fix2(b.totals.inclusive), fix2(b.totals.vat)]);
    }
    if (!inv.uuid) stampAll(db);
    const doc = fromApp(inv, db);
    return qr(doc, build(doc));
  }
  function appXML(inv, db) {
    if (inv.zxml) return inv.zxml;
    if (!inv.uuid) stampAll(db);
    const doc = fromApp(inv, db), built = build(doc);
    return built.xml(qr(doc, built));
  }

  return { sha256, b64, hex, uuid4, PIH0, build, qr, tlv, computeTotals, riyadh, qrTimestamp, escText, ensureSettings, seller, fromApp, stampAll, appQR, appXML };
}));
